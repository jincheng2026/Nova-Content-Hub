import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {LibraryWatcher} from '../src/main/library-watch.mts';

const libraryId = '11111111-1111-4111-8111-111111111111';
const descriptor = () => JSON.stringify({format: 'nova-content-library', schemaVersion: 5, libraryId});

function fixture(t, notify = () => {}) {
    const parent = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'nova-library-watch-'));
    const root = path.join(parent, 'library');
    fs.mkdirSync(root);
    fs.writeFileSync(path.join(root, '内容库.json'), descriptor());
    const stat = fs.statSync(root, {bigint: true});
    const binding = {root, libraryId, rootIdentity: {dev: stat.dev.toString(), ino: stat.ino.toString()}};
    const events = [], handles = [];
    let failWatch = false;
    t.mock.timers.enable({apis: ['setTimeout', 'setInterval']});
    t.mock.method(fs, 'watch', (watched, options, callback) => {
        assert.equal(watched, root);
        assert.deepEqual(options, {recursive: true});
        if (failWatch) throw new Error('Native watcher unavailable');
        const handle = Object.assign(new EventEmitter(), {callback, closed: false, close() { this.closed = true; }});
        handles.push(handle);
        return handle;
    });
    const watcher = new LibraryWatcher({notify: kind => { events.push(kind); notify(kind); }});
    t.after(() => { watcher.close(); fs.rmSync(parent, {recursive: true, force: true}); });
    return {parent, root, binding, watcher, events, handles, tick: ms => t.mock.timers.tick(ms), failWatch: value => { failWatch = value; }};
}

test('business changes coalesce into fixed notifications without reading event paths', t => {
    const f = fixture(t), opened = [], open = fs.openSync;
    t.mock.method(fs, 'openSync', (filename, ...args) => { opened.push(filename); return open(filename, ...args); });
    f.watcher.bind(f.binding);
    const native = f.handles[0];
    native.callback('rename', '内容/private title/正文.md');
    native.callback('change', '库配置/配置.json');
    f.tick(299);
    assert.deepEqual(f.events, ['changed']);
    f.tick(1);
    assert.deepEqual(f.events, ['changed', 'changed']);
    assert.ok(opened.every(filename => filename === path.join(f.root, '内容库.json')));
    native.callback('change', null);
    f.tick(300);
    assert.deepEqual(f.events, ['changed', 'changed', 'changed']);
});

test('locks, transactions, scratch and temporary paths do not refresh the UI', t => {
    const f = fixture(t);
    f.watcher.bind(f.binding);
    for (const filename of [
        '系统（别动）', '系统（别动）/库锁/owner.json', '系统（别动）/事务/已提交/id/intent.json',
        '系统（别动）/scratch/request.json', '.DS_Store', '内容/.staging-id/内容.json',
        '内容/id/内容.json.tmp-1-2', '内容/id/内容.json.tmp', '内容/id/内容.json.temp',
        '内容/id/.正文.md.swp', '内容/id/正文.md~', '../outside.json', '/outside.json'
    ]) f.handles[0].callback('rename', filename);
    f.tick(10_000);
    assert.deepEqual(f.events, ['changed']);
    assert.equal(f.handles.length, 1);
});

test('continuous writes have a bounded maximum delay', t => {
    const f = fixture(t);
    f.watcher.bind(f.binding);
    for (let index = 0; index < 8; index += 1) {
        f.handles[0].callback('change', '内容/id/内容.json');
        f.tick(250);
    }
    assert.deepEqual(f.events, ['changed', 'changed']);
    f.tick(300);
    assert.deepEqual(f.events, ['changed', 'changed']);
});

test('identical bindings preserve native handles; unbind and close cancel stale callbacks', t => {
    const f = fixture(t);
    f.watcher.bind(f.binding);
    const first = f.handles[0], staleError = first.listeners('error')[0];
    first.callback('change', '内容/id/正文.md');
    f.watcher.bind({...f.binding, rootIdentity: {...f.binding.rootIdentity}});
    assert.equal(f.handles.length, 1);
    f.tick(300);
    assert.deepEqual(f.events, ['changed', 'changed']);
    first.callback('change', '内容/id/正文.md');
    f.watcher.bind(null);
    assert.equal(first.closed, true);
    assert.equal(first.listenerCount('error'), 1);
    assert.doesNotThrow(() => first.emit('error', new Error('Queued error after close')));
    f.watcher.bind(f.binding);
    first.callback('change', '内容/id/正文.md');
    staleError();
    f.tick(300);
    assert.deepEqual(f.events, ['changed', 'changed', 'changed']);
    const current = f.handles[1];
    current.callback('change', '内容/id/正文.md');
    f.watcher.close();
    f.tick(15_000);
    assert.equal(current.closed, true);
    assert.deepEqual(f.events, ['changed', 'changed', 'changed']);
    assert.equal(f.handles.length, 2);
});

test('native failures notify once and only rearm the pinned library on a periodic check', t => {
    const f = fixture(t);
    f.failWatch(true);
    f.watcher.bind(f.binding);
    assert.deepEqual(f.events, ['unavailable']);
    f.tick(10_000);
    assert.deepEqual(f.events, ['unavailable']);
    f.failWatch(false);
    f.tick(5_000);
    assert.equal(f.handles.length, 1);
    assert.deepEqual(f.events, ['unavailable', 'changed']);
    const oldError = f.handles[0].listeners('error')[0];
    f.handles[0].callback('change', '内容/id/正文.md');
    f.handles[0].emit('error', new Error('Native watcher lost'));
    f.tick(300);
    assert.equal(f.handles[0].closed, true);
    assert.deepEqual(f.events, ['unavailable', 'changed', 'unavailable']);
    f.tick(4_700);
    assert.equal(f.handles.length, 2);
    assert.deepEqual(f.events, ['unavailable', 'changed', 'unavailable', 'changed']);
    f.handles[0].callback('change', '内容/id/正文.md');
    oldError();
    f.tick(300);
    assert.equal(f.handles[1].closed, false);
    assert.deepEqual(f.events, ['unavailable', 'changed', 'unavailable', 'changed']);
});

test('notification failures cannot escape binding, recovery or debounce callbacks', t => {
    const f = fixture(t, () => { throw new Error('Renderer closed'); });
    f.failWatch(true);
    assert.doesNotThrow(() => f.watcher.bind(f.binding));
    f.failWatch(false);
    assert.doesNotThrow(() => f.tick(5_000));
    f.handles[0].callback('change', '内容/id/正文.md');
    assert.doesNotThrow(() => f.tick(300));
    assert.deepEqual(f.events, ['unavailable', 'changed', 'changed']);
});

test('silent root removal is detected and restoration of the same inode can rearm', t => {
    const f = fixture(t);
    f.watcher.bind(f.binding);
    const moved = path.join(f.parent, 'original');
    fs.renameSync(f.root, moved);
    f.tick(5_000);
    assert.deepEqual(f.events, ['changed', 'unavailable']);
    fs.renameSync(moved, f.root);
    f.tick(5_000);
    assert.equal(f.handles.length, 2);
    assert.deepEqual(f.events, ['changed', 'unavailable', 'changed']);
});

test('a same-ID clone never rearms under the old binding; successful rebind clears unavailable immediately', t => {
    const f = fixture(t);
    f.watcher.bind(f.binding);
    fs.renameSync(f.root, path.join(f.parent, 'original'));
    fs.mkdirSync(f.root);
    fs.writeFileSync(path.join(f.root, '内容库.json'), descriptor());
    f.tick(15_000);
    assert.equal(f.handles.length, 1);
    assert.equal(f.handles[0].closed, true);
    assert.deepEqual(f.events, ['changed', 'unavailable']);
    const stat = fs.statSync(f.root, {bigint: true});
    f.watcher.bind({...f.binding, rootIdentity: {dev: stat.dev.toString(), ino: stat.ino.toString()}});
    assert.equal(f.handles.length, 2);
    assert.deepEqual(f.events, ['changed', 'unavailable', 'changed']);
});

test('descriptor identity, format, size and readability are checked before watching and while idle', t => {
    const f = fixture(t), filename = path.join(f.root, '内容库.json');
    for (const value of ['{', '{}', JSON.stringify({format: 'nova-content-library', schemaVersion: 5, libraryId: 'other'}), ' '.repeat(65_537)]) {
        fs.writeFileSync(filename, value);
        f.watcher.bind(f.binding);
        assert.equal(f.events.at(-1), 'unavailable');
        assert.equal(f.handles.length, 0);
        f.watcher.bind(null);
    }
    fs.writeFileSync(filename, descriptor());
    f.watcher.bind(f.binding);
    assert.equal(f.events.at(-1), 'changed');
    const access = fs.accessSync;
    t.mock.method(fs, 'accessSync', (filename, ...args) => {
        if (filename === f.root) throw Object.assign(new Error('Access denied'), {code: 'EACCES'});
        return access(filename, ...args);
    });
    f.tick(5_000);
    assert.equal(f.handles[0].closed, true);
    assert.equal(f.events.at(-1), 'unavailable');
});

test('descriptor changes during the bounded read are rejected', t => {
    const f = fixture(t), filename = path.join(f.root, '内容库.json'), read = fs.readSync;
    let changed = false;
    t.mock.method(fs, 'readSync', (...args) => {
        const count = read(...args);
        if (!changed) { changed = true; fs.appendFileSync(filename, ' '); }
        return count;
    });
    f.watcher.bind(f.binding);
    assert.equal(f.handles.length, 0);
    assert.deepEqual(f.events, ['unavailable']);
});

test('linked descriptors and root ancestors are rejected', {skip: process.platform === 'win32'}, t => {
    const f = fixture(t), filename = path.join(f.root, '内容库.json'), external = path.join(f.parent, 'descriptor.json');
    fs.renameSync(filename, external);
    fs.symlinkSync(external, filename);
    f.watcher.bind(f.binding);
    assert.equal(f.handles.length, 0);
    assert.deepEqual(f.events, ['unavailable']);
    f.watcher.bind(null);
    fs.unlinkSync(filename);
    fs.renameSync(external, filename);
    const alias = path.join(f.parent, 'alias');
    fs.symlinkSync(f.parent, alias, 'dir');
    f.watcher.bind({...f.binding, root: path.join(alias, 'library')});
    assert.equal(f.handles.length, 0);
    assert.deepEqual(f.events, ['unavailable', 'unavailable']);
});
