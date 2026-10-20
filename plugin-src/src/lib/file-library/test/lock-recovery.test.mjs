import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createLibrary, openLibrary, inspectLibraryHealth, __testing} from '../index.mjs';

process.env.NODE_ENV = 'test';

function fixture(t) {
    const parent = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'nova-lock-recovery-'));
    const root = path.join(parent, 'library'), moved = path.join(parent, 'moved'), library = createLibrary(root);
    const lock = path.join(root, '系统（别动）', '库锁');
    t.after(() => {
        __testing.setHook(undefined);
        fs.rmSync(parent, {recursive: true, force: true});
    });
    return {root, moved, library, lock};
}

test('a returned library recovers a finished release failure without reclaiming an operation still in flight', t => {
    const f = fixture(t);
    const item = f.library.createContent({title: 'kept', body: 'unchanged'});
    let owner;
    __testing.setHook(event => {
        if (event.phase !== 'beforeRelease') return;
        fs.renameSync(f.root, f.moved);
        fs.renameSync(f.moved, f.root);
        owner = fs.readFileSync(path.join(f.lock, `${event.token}.json`));
        assert.throws(() => openLibrary(f.root), error => error.code === 'BUSY');
        assert.deepEqual(fs.readFileSync(path.join(f.lock, `${event.token}.json`)), owner);
        fs.renameSync(f.root, f.moved);
    });
    assert.throws(() => f.library.listContents(), error => error.code === 'IO_ERROR');
    __testing.setHook(undefined);
    fs.renameSync(f.moved, f.root);
    assert.deepEqual(fs.readFileSync(path.join(f.lock, fs.readdirSync(f.lock)[0])), owner);
    const report = inspectLibraryHealth(f.root, {expectedLibraryId: f.library.info.libraryId, expectedRootIdentity: f.library.info.rootIdentity});
    assert.equal(report.state, 'healthy');
    assert.equal(openLibrary(f.root).readContent(item.id).body, 'unchanged');
    assert.equal(fs.existsSync(f.lock), false);
});

for (const phase of ['beforeOwnerWrite', 'afterOwnerWrite']) test(`initialization cleanup retries only its original ${phase === 'beforeOwnerWrite' ? 'empty directory' : 'owner'} after the root returns`, t => {
    const f = fixture(t);
    __testing.setHook(event => {
        if (event.phase !== phase) return;
        assert.throws(() => openLibrary(f.root), error => error.code === (phase === 'beforeOwnerWrite' ? 'LOCK_UNCERTAIN' : 'BUSY'));
        assert.equal(fs.existsSync(f.lock), true);
        fs.renameSync(f.root, f.moved);
    });
    assert.throws(() => f.library.listContents(), error => error.code === 'LOCK_UNCERTAIN' && error.initializationError?.code === 'IO_ERROR');
    __testing.setHook(undefined);
    fs.renameSync(f.moved, f.root);
    assert.equal(fs.readdirSync(f.lock).length, phase === 'beforeOwnerWrite' ? 0 : 1);
    assert.deepEqual(openLibrary(f.root).listContents(), []);
    assert.equal(fs.existsSync(f.lock), false);
});

test('deferred cleanup retains a same-ID clone and recovers only when the original root returns', t => {
    const f = fixture(t);
    __testing.setHook(event => {
        if (event.phase === 'beforeRelease') fs.renameSync(f.root, f.moved);
    });
    assert.throws(() => f.library.listContents(), error => error.code === 'IO_ERROR');
    __testing.setHook(undefined);
    fs.cpSync(f.moved, f.root, {recursive: true});
    const ownerName = fs.readdirSync(f.lock)[0], owner = fs.readFileSync(path.join(f.lock, ownerName));
    assert.throws(() => openLibrary(f.root), error => error.code === 'BUSY');
    assert.deepEqual(fs.readFileSync(path.join(f.lock, ownerName)), owner);
    fs.rmSync(f.root, {recursive: true});
    fs.renameSync(f.moved, f.root);
    assert.deepEqual(openLibrary(f.root).listContents(), []);
});

test('deferred cleanup refuses a copied lock directory inside the original root', t => {
    const f = fixture(t);
    __testing.setHook(event => {
        if (event.phase === 'beforeRelease') fs.renameSync(f.root, f.moved);
    });
    assert.throws(() => f.library.listContents(), error => error.code === 'IO_ERROR');
    __testing.setHook(undefined);
    fs.renameSync(f.moved, f.root);
    const originalLock = `${f.lock}-original`;
    fs.renameSync(f.lock, originalLock);
    fs.cpSync(originalLock, f.lock, {recursive: true});
    const ownerName = fs.readdirSync(f.lock)[0], owner = fs.readFileSync(path.join(f.lock, ownerName));
    assert.throws(() => openLibrary(f.root), error => error.code === 'BUSY');
    assert.deepEqual(fs.readFileSync(path.join(f.lock, ownerName)), owner);
    fs.rmSync(f.lock, {recursive: true});
    fs.renameSync(originalLock, f.lock);
    assert.deepEqual(openLibrary(f.root).listContents(), []);
});

test('deferred cleanup requires the exact library and owner, never just a live matching PID', t => {
    const f = fixture(t);
    __testing.setHook(event => {
        if (event.phase === 'beforeRelease') fs.renameSync(f.root, f.moved);
    });
    assert.throws(() => f.library.listContents(), error => error.code === 'IO_ERROR');
    __testing.setHook(undefined);
    fs.renameSync(f.moved, f.root);
    const ownerName = fs.readdirSync(f.lock)[0], owner = fs.readFileSync(path.join(f.lock, ownerName));
    const descriptorPath = path.join(f.root, '内容库.json'), descriptor = fs.readFileSync(descriptorPath);
    fs.writeFileSync(descriptorPath, JSON.stringify({...JSON.parse(descriptor), libraryId: randomUUID()}));
    assert.throws(() => openLibrary(f.root), error => error.code === 'BUSY');
    assert.deepEqual(fs.readFileSync(path.join(f.lock, ownerName)), owner);
    fs.writeFileSync(descriptorPath, descriptor);
    const changedOwner = Buffer.from(JSON.stringify({...JSON.parse(owner), extra: true}));
    fs.writeFileSync(path.join(f.lock, ownerName), changedOwner);
    assert.throws(() => openLibrary(f.root), error => error.code === 'BUSY');
    assert.deepEqual(fs.readFileSync(path.join(f.lock, ownerName)), changedOwner);
    fs.writeFileSync(path.join(f.lock, ownerName), owner);
    const heldOwner = path.join(f.moved, 'owner.json'), replacementName = `${randomUUID()}.json`;
    fs.mkdirSync(f.moved);
    fs.renameSync(path.join(f.lock, ownerName), heldOwner);
    const replacementOwner = Buffer.from(JSON.stringify({token: replacementName.slice(0, -5), host: os.hostname(), pid: process.pid}));
    fs.writeFileSync(path.join(f.lock, replacementName), replacementOwner);
    assert.throws(() => openLibrary(f.root), error => error.code === 'BUSY');
    assert.deepEqual(fs.readFileSync(path.join(f.lock, replacementName)), replacementOwner);
    fs.unlinkSync(path.join(f.lock, replacementName));
    fs.renameSync(heldOwner, path.join(f.lock, ownerName));
    assert.deepEqual(openLibrary(f.root).listContents(), []);
});

test('a primary error survives a failed release and committed writes keep their receipt after recovery', t => {
    const f = fixture(t);
    __testing.setHook(event => {
        if (event.phase === 'beforeRelease') fs.renameSync(f.root, f.moved);
    });
    assert.throws(() => f.library.readAsset('f'.repeat(64)), error => error.code === 'CORRUPT' && /missing/.test(error.message));
    __testing.setHook(undefined);
    fs.renameSync(f.moved, f.root);
    assert.deepEqual(f.library.listContents(), []);
    __testing.setHook(event => {
        if (event.phase === 'beforeRelease') fs.renameSync(f.root, f.moved);
    });
    let failure;
    try { f.library.createContent({title: 'once', body: 'committed'}); } catch (error) { failure = error; }
    assert.equal(failure.code, 'IO_ERROR');
    assert.equal(failure.outcome, 'committed');
    assert.ok(failure.mutationId);
    assert.ok(failure.contentId);
    __testing.setHook(undefined);
    fs.renameSync(f.moved, f.root);
    const reopened = openLibrary(f.root);
    assert.equal(reopened.queryMutation(failure.mutationId).status, 'committed');
    assert.equal(reopened.readContent(failure.contentId).body, 'committed');
    assert.equal(reopened.listContents().length, 1);
});

test('a temporarily absent original lock keeps its deferred cleanup proof', t => {
    const f = fixture(t);
    __testing.setHook(event => {
        if (event.phase === 'beforeRelease') fs.renameSync(f.root, f.moved);
    });
    assert.throws(() => f.library.listContents(), error => error.code === 'IO_ERROR');
    __testing.setHook(undefined);
    fs.renameSync(f.moved, f.root);
    const originalLock = `${f.lock}-original`;
    fs.renameSync(f.lock, originalLock);
    assert.deepEqual(openLibrary(f.root).listContents(), []);
    fs.renameSync(originalLock, f.lock);
    assert.deepEqual(openLibrary(f.root).listContents(), []);
});


test('deferred release proofs have a fixed capacity without eviction, and recovery runs before the capacity check', t => {
    const f = fixture(t);
    const script = `
        import assert from 'node:assert/strict';
        import fs from 'node:fs';
        import path from 'node:path';
        import {openLibrary, __testing} from ${JSON.stringify(new URL('../index.mjs', import.meta.url).href)};
        const original = process.env.LOCK_TEST_ROOT, moved = original + '-moved', keptLock = original + '-kept-lock';
        const lock = root => path.join(root, '系统（别动）', '库锁');
        let root = original;
        for (let i = 0; i < 256; i++) {
            const library = openLibrary(root);
            __testing.setHook(event => {if (event.phase === 'beforeRelease') fs.renameSync(root, moved);});
            assert.throws(() => library.listContents(), error => error.code === 'IO_ERROR');
            __testing.setHook(undefined);
            root = original + '-' + i;
            fs.renameSync(moved, root);
            if (i === 0) fs.renameSync(lock(root), keptLock);
            else fs.rmSync(lock(root), {recursive: true});
        }
        assert.throws(() => openLibrary(root), error => error.code === 'LOCK_UNCERTAIN' && /Too many/.test(error.message));
        assert.equal(fs.existsSync(lock(root)), false);
        fs.renameSync(root, original);
        fs.renameSync(keptLock, lock(original));
        const originalSync = fs.fsyncSync;
        let failedSync = false;
        fs.fsyncSync = fd => {
            if (!failedSync && fs.fstatSync(fd).isDirectory()) {
                failedSync = true;
                throw Object.assign(new Error('injected cleanup directory sync failure'), {code: 'EIO'});
            }
            return originalSync(fd);
        };
        assert.deepEqual(openLibrary(original).listContents(), []);
        assert.equal(failedSync, true);
        fs.fsyncSync = originalSync;
        assert.equal(fs.existsSync(lock(original)), false);
    `;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
        env: {...process.env, NODE_ENV: 'test', LOCK_TEST_ROOT: f.root}, encoding: 'utf8', timeout: 120000
    });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
});
