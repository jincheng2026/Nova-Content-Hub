import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {createLibrary, inspectLibraryHealth, __testing} from '../index.mjs';

process.env.NODE_ENV = 'test';

function fixture(t) {
    const parent = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'nova-health-'));
    const root = path.join(parent, 'library'), library = createLibrary(root);
    const options = {expectedLibraryId: library.info.libraryId, expectedRootIdentity: library.info.rootIdentity};
    t.after(() => {__testing.setHook(undefined); fs.rmSync(parent, {recursive: true, force: true});});
    return {parent, root, library, options};
}

function tree(root) {
    return fs.readdirSync(root).sort().flatMap(name => {
        const target = path.join(root, name);
        return fs.lstatSync(target).isDirectory() ? [[target, 'directory'], ...tree(target)] : [[target, fs.readFileSync(target).toString('base64')]];
    });
}

test('health validates the bound library without changing business bytes or retaining a lock', t => {
    const f = fixture(t);
    f.library.createContent({title: 'private title', body: 'private body'});
    const before = tree(f.root), report = inspectLibraryHealth(f.root, f.options);
    assert.equal(report.state, 'healthy');
    assert.equal(report.complete, true);
    assert.equal(report.root, 'matched');
    assert.equal(report.checked.objects, 2);
    assert.deepEqual(tree(f.root), before);
    assert.equal(JSON.stringify(report).includes('private'), false);
    assert.equal(JSON.stringify(report).includes(f.root), false);
});

test('health reports a corrupt object without silently dropping it or fabricating content', t => {
    const f = fixture(t), item = f.library.createContent({title: 'private title', body: 'private body'});
    fs.writeFileSync(path.join(f.root, '内容', item.id, '内容.json'), '{private broken metadata');
    const before = tree(f.root), report = inspectLibraryHealth(f.root, f.options);
    assert.equal(report.state, 'issues');
    assert.equal(report.complete, true);
    assert.ok(report.issues.some(issue => issue.scope === 'object' && issue.id === item.id && issue.code === 'OBJECT_INVALID'));
    assert.equal(JSON.stringify(report).includes('private'), false);
    assert.deepEqual(tree(f.root), before);
});

test('health preserves pending journal and target bytes without recovery', t => {
    const f = fixture(t), item = f.library.createContent({title: 'before', body: 'before'}), mutationId = randomUUID();
    __testing.setHook(event => {if (event.phase === 'afterJournal') throw new Error('leave pending');});
    try {assert.throws(() => f.library.updateContent(item.id, {body: 'after'}, item.editToken, {mutationId}), error => error.pendingRecovery === true);} finally {__testing.setHook(undefined);}
    const before = tree(f.root), report = inspectLibraryHealth(f.root, f.options);
    assert.ok(report.issues.some(issue => issue.code === 'TRANSACTION_PENDING' && issue.availability === 'unverified'));
    assert.equal(report.issues.some(issue => issue.id === item.id && issue.code === 'OBJECT_INVALID'), false);
    assert.equal(fs.readFileSync(path.join(f.root, '内容', item.id, '正文.md'), 'utf8'), 'before');
    assert.deepEqual(tree(f.root), before);
});

test('health distinguishes missing, replaced, unsafe and unbound roots before locking', t => {
    const f = fixture(t);
    assert.equal(inspectLibraryHealth(f.root).root, 'identity-unverified');
    assert.equal(inspectLibraryHealth(path.join(f.parent, 'missing'), f.options).root, 'missing');
    assert.equal(inspectLibraryHealth(f.root, {...f.options, expectedRootIdentity: {...f.options.expectedRootIdentity, ino: '0'}}).root, 'replaced');
    const link = path.join(f.parent, 'linked');
    fs.symlinkSync(f.root, link);
    assert.equal(inspectLibraryHealth(link, f.options).root, 'unsafe');
});

test('health bounds oversized authoritative files and reports incomplete rather than healthy', t => {
    const f = fixture(t), item = f.library.createContent({title: 'large', body: ''});
    const target = path.join(f.root, '内容', item.id, '正文.md');
    fs.truncateSync(target, 8 * 1024 * 1024 + 1);
    const report = inspectLibraryHealth(f.root, f.options);
    assert.equal(report.state, 'incomplete');
    assert.equal(report.complete, false);
    assert.ok(report.issues.some(issue => issue.code === 'LIMIT_REACHED'));
});

test('health refuses a live lock without touching its owner', t => {
    const f = fixture(t), lock = path.join(f.root, '系统（别动）', '库锁'), token = randomUUID();
    fs.mkdirSync(lock);
    fs.writeFileSync(path.join(lock, `${token}.json`), JSON.stringify({token, pid: process.pid, host: os.hostname()}));
    const before = tree(f.root), report = inspectLibraryHealth(f.root, f.options);
    assert.equal(report.state, 'blocked');
    assert.ok(report.issues.some(issue => issue.code === 'LOCK_BUSY'));
    assert.deepEqual(tree(f.root), before);
});

test('health reports an unknown journal child that strict open would reject', t => {
    const f = fixture(t);
    fs.mkdirSync(path.join(f.root, '系统（别动）', '事务', 'unexpected'));
    const before = tree(f.root), report = inspectLibraryHealth(f.root, f.options);
    assert.equal(report.state, 'issues');
    assert.ok(report.issues.some(issue => issue.scope === 'structure' && issue.code === 'STRUCTURE_INVALID'));
    assert.deepEqual(tree(f.root), before);
});

test('an unreadable pending journal does not mislabel objects as corrupt', t => {
    const f = fixture(t), item = f.library.createContent({title: 'before', body: 'before'});
    fs.writeFileSync(path.join(f.root, '内容', item.id, '内容.json'), '{intermediate');
    const pending = path.join(f.root, '系统（别动）', '事务', '待恢复'), original = fs.opendirSync;
    let report;
    try {
        fs.opendirSync = function(target, ...args) { if (target === pending) throw Object.assign(new Error('denied'), {code: 'EACCES'}); return original.call(this, target, ...args); };
        report = inspectLibraryHealth(f.root, f.options);
    } finally { fs.opendirSync = original; }
    assert.ok(report.issues.some(issue => issue.id === item.id && issue.code === 'TRANSACTION_PENDING' && issue.availability === 'unverified'));
    assert.equal(report.issues.some(issue => issue.id === item.id && issue.code === 'OBJECT_INVALID'), false);
});
