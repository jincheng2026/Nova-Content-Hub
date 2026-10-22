import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createLibrary, openLibrary, upgradeLibrary, __testing} from '../index.mjs';

process.env.NODE_ENV = 'test';
const moduleURL = new URL('../index.mjs', import.meta.url).href;
const system = '系统（别动）';
const baseOf = root => path.join(root, system, '事务');
const pendingOf = root => path.join(baseOf(root), '待恢复');
const historyOf = root => path.join(baseOf(root), '已提交');
const bodyOf = (root, contentId) => path.join(root, '内容', contentId, '正文.md');
const descriptorOf = root => path.join(root, '内容库.json');
const reject = (code, fn) => assert.throws(fn, error => error.code === code);

function fixture(t) {
    const parent = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'nova-upgrade-'));
    const root = path.join(parent, 'library');
    t.after(() => {
        __testing.setHook(undefined);
        fs.rmSync(parent, {recursive: true, force: true});
    });
    return {parent, root, library: createLibrary(root)};
}

function killAt(root, phase, item) {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import {openLibrary,upgradeLibrary,__testing} from ${JSON.stringify(moduleURL)};
    const data=JSON.parse(process.env.TASK_DATA);
    ${item ? 'const lib=openLibrary(data.root);' : ''}
    __testing.setHook(event=>{if(event.phase===data.phase)process.kill(process.pid,'SIGKILL');});
    ${item ? "lib.updateContent(data.item.id,{title:'committed title',body:'committed body'},data.item.editToken);" : 'upgradeLibrary(data.root);'}
  `], {
        env: {...process.env, NODE_ENV: 'test', TASK_DATA: JSON.stringify({root, phase, item})},
        encoding: 'utf8',
        timeout: 10000
    });
    assert.equal(result.signal, 'SIGKILL', result.stderr);
}

function flattenToV1(root) {
    for (const dir of [pendingOf(root), historyOf(root)]) {
        for (const name of fs.readdirSync(dir)) fs.renameSync(path.join(dir, name), path.join(baseOf(root), name));
        fs.rmdirSync(dir);
    }
    const info = JSON.parse(fs.readFileSync(descriptorOf(root)));
    fs.writeFileSync(descriptorOf(root), `${JSON.stringify({
        ...info,
        schemaVersion: 1,
        customNote: 'preserve me'
    }, null, 2)}\n`);
    return fs.readFileSync(descriptorOf(root));
}

test('legacy transaction migration preserves regular Finder metadata', t => {
    const f = fixture(t), content = f.library.createContent({title: 'legacy', body: 'original'});
    flattenToV1(f.root);
    const metadata = path.join(baseOf(f.root), '.DS_Store');
    fs.writeFileSync(metadata, 'ordinary Finder metadata');
    const upgraded = upgradeLibrary(f.root);
    assert.equal(upgraded.readContent(content.id).body, 'original');
    assert.equal(fs.readFileSync(metadata, 'utf8'), 'ordinary Finder metadata');
});

function fileSnapshot(root, relative = '') {
    const result = {};
    for (const name of fs.readdirSync(path.join(root, relative)).sort()) {
        const entry = path.join(relative, name);
        if (fs.lstatSync(path.join(root, entry)).isDirectory()) Object.assign(result, fileSnapshot(root, entry));
        else result[entry] = fs.readFileSync(path.join(root, entry)).toString('base64');
    }
    return result;
}

function observeReads(t) {
    const originals = {open: fs.openSync, read: fs.readFileSync, close: fs.closeSync};
    const handles = new Map();
    const reads = [];
    fs.openSync = function (file, ...args) {
        const fd = originals.open.call(this, file, ...args);
        handles.set(fd, String(file));
        return fd;
    };
    fs.readFileSync = function (file, ...args) {
        reads.push(typeof file === 'number' ? handles.get(file) : String(file));
        return originals.read.call(this, file, ...args);
    };
    fs.closeSync = function (fd, ...args) {
        handles.delete(fd);
        return originals.close.call(this, fd, ...args);
    };
    t.after(() => {
        fs.openSync = originals.open;
        fs.readFileSync = originals.read;
        fs.closeSync = originals.close;
    });
    return reads;
}

test('cold open and content reads never read committed history bytes; query reads exactly its target', t => {
    const {root, library} = fixture(t);
    const body = 'history body\n'.repeat(5000);
    let item = library.createContent({title: 'revision 0', body});
    const firstMutation = item.mutationId;
    for (let n = 1; n <= 30; n++) item = library.updateContent(item.id, {
        title: `revision ${n}`,
        body: `${body}${n}`
    }, item.editToken);
    const reads = observeReads(t);
    const reopened = openLibrary(root);
    assert.equal(reopened.readContent(item.id).title, 'revision 30');
    assert.equal(reopened.readContent(item.id).body, `${body}30`);
    assert.deepEqual(reads.filter(file => file?.startsWith(historyOf(root))), []);
    reads.length = 0;
    assert.equal(reopened.queryMutation(firstMutation).content.title, 'revision 0');
    assert.deepEqual(reads.filter(file => file?.startsWith(historyOf(root))).sort(), [path.join(historyOf(root), firstMutation, 'COMMITTED'), path.join(historyOf(root), firstMutation, 'intent.json')].sort());
    const intent = path.join(historyOf(root), firstMutation, 'intent.json');
    fs.writeFileSync(intent, '{broken history');
    assert.equal(reopened.readContent(item.id).title, 'revision 30');
    reject('CORRUPT', () => reopened.queryMutation(firstMutation));
});

for (const phase of ['afterCommit', 'beforeArchive', 'afterArchiveRename', 'afterArchiveSourceSync', 'afterArchiveTargetSync']) {
    test(`SIGKILL ${phase}: committed recovery archives without replaying over a new external body`, t => {
        const {root, library} = fixture(t);
        const item = library.createContent({title: 'before', body: 'before'});
        killAt(root, phase, item);
        fs.writeFileSync(bodyOf(root, item.id), 'external edit after commit');
        const reopened = openLibrary(root);
        const current = reopened.readContent(item.id);
        assert.equal(current.title, 'committed title');
        assert.equal(current.body, 'external edit after commit');
        assert.deepEqual(fs.readdirSync(pendingOf(root)), []);
        assert.equal(fs.readdirSync(historyOf(root)).length, 2);
    });
}

test('archive failure reports committed mutation and blocks opening any new intent until recovery', t => {
    const {root, library} = fixture(t);
    __testing.setHook(event => {
        if (event.phase === 'beforeArchive') throw Object.assign(new Error('archive denied'), {code: 'EACCES'});
    });
    let failure;
    try {
        library.createContent({title: 'once', body: 'once'});
    } catch (error) {
        failure = error;
    }
    assert.equal(failure.outcome, 'committed');
    assert.ok(failure.mutationId && failure.contentId);
    assert.throws(() => library.createContent({
        title: 'must not start',
        body: 'x'
    }), error => error.mutationId === failure.mutationId && error.outcome === 'committed');
    assert.deepEqual(fs.readdirSync(pendingOf(root)), [failure.mutationId]);
    fs.writeFileSync(bodyOf(root, failure.contentId), 'new external body');
    __testing.setHook(undefined);
    assert.equal(library.queryMutation(failure.mutationId).content.body, 'once');
    assert.equal(library.readContent(failure.contentId).body, 'new external body');
    assert.equal(library.listContents().length, 1);
});

test('failed archive target-directory sync is retried before any subsequent content mutation', t => {
    const {root, library} = fixture(t);
    const originalOpen = fs.openSync;
    const originalClose = fs.closeSync;
    const originalSync = fs.fsyncSync;
    const handles = new Map();
    let failSync = false;
    fs.openSync = function (file, ...args) {
        const fd = originalOpen.call(this, file, ...args);
        handles.set(fd, String(file));
        return fd;
    };
    fs.closeSync = function (fd, ...args) {
        handles.delete(fd);
        return originalClose.call(this, fd, ...args);
    };
    fs.fsyncSync = function (fd, ...args) {
        if (failSync && handles.get(fd) === historyOf(root)) throw Object.assign(new Error('history fsync failed'), {code: 'EIO'});
        return originalSync.call(this, fd, ...args);
    };
    t.after(() => {
        fs.openSync = originalOpen;
        fs.closeSync = originalClose;
        fs.fsyncSync = originalSync;
    });
    __testing.setHook(event => {
        if (event.phase === 'afterArchiveSourceSync') failSync = true;
    });
    let failure;
    try {
        library.createContent({title: 'once', body: 'once'});
    } catch (error) {
        failure = error;
    }
    assert.equal(failure.outcome, 'committed');
    assert.ok(failure.mutationId);
    assert.deepEqual(fs.readdirSync(pendingOf(root)), []);
    assert.deepEqual(fs.readdirSync(historyOf(root)), [failure.mutationId]);
    reject('IO_ERROR', () => library.createContent({title: 'must not start', body: 'x'}));
    assert.equal(fs.readdirSync(historyOf(root)).length, 1);
    failSync = false;
    __testing.setHook(undefined);
    assert.equal(library.queryMutation(failure.mutationId).content.title, 'once');
});

test('v1 open requires explicit upgrade without changing a byte; upgrade preserves all history and root fields', t => {
    const {root, library} = fixture(t);
    const firstId = randomUUID();
    let item = library.createContent({title: 'original', body: 'original body'}, {mutationId: firstId});
    item = library.updateContent(item.id, {title: 'updated', body: 'updated body'}, item.editToken);
    const beforeHistory = Object.fromEntries(fs.readdirSync(historyOf(root)).map(name => [name, fileSnapshot(path.join(historyOf(root), name))]));
    const original = flattenToV1(root);
    const beforeOpen = fileSnapshot(root);
    reject('UPGRADE_REQUIRED', () => openLibrary(root));
    assert.deepEqual(fileSnapshot(root), beforeOpen);
    const upgraded = upgradeLibrary(root);
    assert.equal(upgraded.info.schemaVersion, 5);
    assert.equal(upgraded.info.customNote, 'preserve me');
    assert.equal(upgraded.info.libraryId, library.info.libraryId);
    assert.deepEqual(fs.readFileSync(path.join(root, system, '内容库.schema1.bak.json')), original);
    for (const [mutationId, bytes] of Object.entries(beforeHistory)) assert.deepEqual(fileSnapshot(path.join(historyOf(root), mutationId)), bytes);
    assert.equal(upgraded.createContent({title: 'original', body: 'original body'}, {mutationId: firstId}).id, item.id);
    assert.equal(upgraded.listContents().length, 1);
    assert.equal(upgradeLibrary(root).info.libraryId, upgraded.info.libraryId);
});

for (const phase of ['upgradeBeforeBackupPublish', 'upgradeAfterBackup', 'upgradeAfterDirectory', 'upgradeAfterDirectories', 'upgradeAfterMove', 'upgradeAfterRecovery', 'upgradeBeforeDescriptorPublish', 'upgradeAfterDescriptorPublish']) {
    test(`SIGKILL ${phase}: explicit upgrade resumes without losing descriptor or history`, t => {
        const {root, library} = fixture(t);
        const item = library.createContent({title: 'before', body: 'before'});
        const original = flattenToV1(root);
        killAt(root, phase);
        const reopened = upgradeLibrary(root);
        assert.equal(reopened.info.schemaVersion, 5);
        assert.equal(reopened.readContent(item.id).body, 'before');
        assert.deepEqual(fs.readFileSync(path.join(root, system, '内容库.schema1.bak.json')), original);
        assert.equal(reopened.queryMutation(item.mutationId).content.body, 'before');
        assert.deepEqual(fs.readdirSync(pendingOf(root)), []);
    });
}

test('a v1 unfinished transaction recovers during explicit upgrade and remains queryable', t => {
    const {root, library} = fixture(t);
    const item = library.createContent({title: 'before', body: 'before'});
    killAt(root, 'afterFile', item);
    const pendingId = fs.readdirSync(pendingOf(root))[0];
    flattenToV1(root);
    __testing.setHook(event => {
        if (event.phase === 'upgradeAfterMove') throw new Error('interrupt migration move');
    });
    reject('IO_ERROR', () => upgradeLibrary(root));
    __testing.setHook(undefined);
    const upgraded = upgradeLibrary(root);
    assert.equal(upgraded.readContent(item.id).body, 'committed body');
    assert.equal(upgraded.queryMutation(pendingId).content.body, 'committed body');
    assert.equal(fs.readdirSync(historyOf(root)).length, 2);
});

test('legacy staging is retained under pending, and schema-1 reader refuses the upgrade barrier', t => {
    const {root, library} = fixture(t);
    library.createContent({title: 'before', body: 'before'});
    flattenToV1(root);
    const stage = `.staging-${randomUUID()}-${randomUUID()}`;
    fs.mkdirSync(path.join(baseOf(root), stage));
    fs.writeFileSync(path.join(baseOf(root), stage, 'intent.json'), '{partial');
    __testing.setHook(event => {
        if (event.phase === 'upgradeAfterDirectories') throw new Error('stop at barrier');
    });
    reject('IO_ERROR', () => upgradeLibrary(root));
    __testing.setHook(undefined);
    assert.equal(JSON.parse(fs.readFileSync(descriptorOf(root))).schemaVersion, 1);
    // Guard excerpt from schema-1 recover at 4f660f6: unknown directories stop before mutations.
    const oldRecoverGuard = `
    const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    const STAGING=/^\\.staging-[0-9a-f-]{36}-[0-9a-f-]{36}$/;
    for(const name of fs.readdirSync(dir).sort()) {
      if(STAGING.test(name)) continue;
      if(!UUID.test(name)) throw Object.assign(new Error('Unexpected transaction entry'),{code:'CORRUPT'});
    }
  `;
    reject('CORRUPT', () => Function('fs', 'dir', oldRecoverGuard)(fs, baseOf(root)));
    const upgraded = upgradeLibrary(root);
    assert.equal(upgraded.info.schemaVersion, 5);
    assert.equal(fs.readFileSync(path.join(pendingOf(root), stage, 'intent.json'), 'utf8'), '{partial');
});

for (const issue of ['duplicate', 'badMarker', 'thirdState', 'badBackup']) {
    test(`upgrade preflight ${issue} fails closed and preserves transaction bytes`, t => {
        const {root, library} = fixture(t);
        const item = library.createContent({title: 'before', body: 'before'});
        let pendingId;
        if (issue === 'thirdState') {
            killAt(root, 'afterJournal', item);
            pendingId = fs.readdirSync(pendingOf(root))[0];
        }
        flattenToV1(root);
        if (issue === 'duplicate') {
            fs.mkdirSync(historyOf(root));
            fs.cpSync(path.join(baseOf(root), item.mutationId), path.join(historyOf(root), item.mutationId), {recursive: true});
        }
        if (issue === 'badMarker') fs.writeFileSync(path.join(baseOf(root), item.mutationId, 'COMMITTED'), 'bad');
        if (issue === 'thirdState') fs.writeFileSync(bodyOf(root, item.id), 'third-party bytes');
        if (issue === 'badBackup') fs.writeFileSync(path.join(root, system, '内容库.schema1.bak.json'), 'different descriptor');
        const beforeTx = fileSnapshot(baseOf(root));
        reject(issue === 'badMarker' ? 'CORRUPT' : 'RECOVERY_CONFLICT', () => upgradeLibrary(root));
        assert.deepEqual(fileSnapshot(baseOf(root)), beforeTx);
        assert.equal(JSON.parse(fs.readFileSync(descriptorOf(root))).schemaVersion, 1);
        if (pendingId) assert.equal(fs.readFileSync(bodyOf(root, item.id), 'utf8'), 'third-party bytes');
    });
}

test('pending duplicate IDs and forged completion markers fail without replaying bytes', t => {
    const {root, library} = fixture(t);
    const item = library.createContent({title: 'before', body: 'before'});
    fs.cpSync(path.join(historyOf(root), item.mutationId), path.join(pendingOf(root), item.mutationId), {recursive: true});
    reject('RECOVERY_CONFLICT', () => library.readContent(item.id));
    fs.rmSync(path.join(pendingOf(root), item.mutationId), {recursive: true});
    killAt(root, 'afterJournal', item);
    const pendingId = fs.readdirSync(pendingOf(root))[0];
    fs.writeFileSync(path.join(pendingOf(root), pendingId, 'COMMITTED'), `${'0'.repeat(64)}\n`);
    reject('CORRUPT', () => openLibrary(root));
    assert.equal(fs.readFileSync(bodyOf(root, item.id), 'utf8'), 'before');
});

test('queryMutation rejects missing or damaged history markers and never returns an unverified receipt', t => {
    const {root, library} = fixture(t);
    const item = library.createContent({title: 'once', body: 'once'});
    const marker = path.join(historyOf(root), item.mutationId, 'COMMITTED');
    fs.unlinkSync(marker);
    reject('CORRUPT', () => library.queryMutation(item.mutationId));
    reject('CORRUPT', () => library.createContent({title: 'once', body: 'once'}, {mutationId: item.mutationId}));
    fs.writeFileSync(marker, 'bad');
    reject('CORRUPT', () => library.queryMutation(item.mutationId));
    assert.equal(library.listContents().length, 1);
});
