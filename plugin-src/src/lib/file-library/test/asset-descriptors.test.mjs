import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {createLibrary, __testing} from '../index.mjs';

process.env.NODE_ENV = 'test';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const assetPath = (root, hash) => path.join(root, '资产', 'sha256', hash.slice(0, 2), hash);

function fixture(t) {
    const parent = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'nova-asset-descriptors-'));
    t.after(() => {
        __testing.setHook(undefined);
        fs.rmSync(parent, {recursive: true, force: true});
    });
    const root = path.join(parent, 'library'), lib = createLibrary(root);
    const source = path.join(parent, 'source.txt');
    fs.writeFileSync(source, 'verified asset');
    const asset = lib.importAsset(source, {purpose: 'template-structure'});
    return {parent, root, lib, source, asset};
}

test('batch descriptors validate and deduplicate every hash, lock once and expose no asset buffers', t => {
    const {root, lib, asset} = fixture(t);
    let locks = 0;
    __testing.setHook(event => { if (event.phase === 'afterOwnerWrite') locks++; });
    for (const invalid of [undefined, null, {}, asset.assetHash, ['x'], [asset.assetHash, undefined], new Array(1)]) {
        assert.throws(() => lib.readAssetDescriptors(invalid), error => error.code === 'INVALID_INPUT');
    }
    assert.equal(locks, 0, 'invalid input is rejected before acquiring the library');
    const open = fs.openSync;
    let reads = 0, descriptors;
    fs.openSync = function (file, ...args) {
        if (file === assetPath(root, asset.assetHash)) reads++;
        return open.call(this, file, ...args);
    };
    try {
        descriptors = lib.readAssetDescriptors([asset.assetHash, asset.assetHash]);
    } finally {
        fs.openSync = open;
    }
    assert.equal(locks, 1);
    assert.equal(reads, 1);
    assert.ok(descriptors instanceof Map);
    assert.deepEqual([...descriptors], [[asset.assetHash, {assetHash: asset.assetHash, bytes: asset.bytes, detectedType: asset.detectedType}]]);
    assert.equal(Object.isFrozen(lib), true);
    assert.deepEqual([...lib.readAssetDescriptors([])], []);
});

test('missing, changed, oversized and invalid-type stored assets are omitted without hiding unsafe paths', t => {
    const {root, lib, asset, source} = fixture(t), target = assetPath(root, asset.assetHash);
    const invalidType = Buffer.from([0, 1, 2, 3]), invalidHash = digest(invalidType), invalidTarget = assetPath(root, invalidHash);
    fs.mkdirSync(path.dirname(invalidTarget), {recursive: true});
    fs.writeFileSync(invalidTarget, invalidType);
    assert.equal(lib.readAssetDescriptors([invalidHash, 'f'.repeat(64)]).size, 0);
    fs.writeFileSync(target, 'tampered asset');
    assert.equal(lib.readAssetDescriptors([asset.assetHash]).size, 0);
    fs.truncateSync(target, 64 * 1024 * 1024 + 1);
    assert.equal(lib.readAssetDescriptors([asset.assetHash]).size, 0);
    fs.unlinkSync(target);
    fs.symlinkSync(source, target);
    assert.throws(() => lib.readAssetDescriptors([asset.assetHash]), error => error.code === 'UNSAFE_PATH');
});

test('batch descriptors propagate lock, recovery and I/O failures', t => {
    const {root, lib, asset} = fixture(t), lock = path.join(root, '系统（别动）', '库锁'), token = randomUUID();
    fs.mkdirSync(lock);
    assert.throws(() => lib.readAssetDescriptors([asset.assetHash]), error => error.code === 'LOCK_UNCERTAIN');
    fs.writeFileSync(path.join(lock, `${token}.json`), JSON.stringify({token, host: os.hostname(), pid: process.pid}));
    assert.throws(() => lib.readAssetDescriptors([asset.assetHash]), error => error.code === 'BUSY');
    fs.rmSync(lock, {recursive: true});
    const original = fs.openSync, target = assetPath(root, asset.assetHash);
    fs.openSync = function (file, ...args) {
        if (file === target) throw Object.assign(new Error('read denied'), {code: 'EACCES'});
        return original.call(this, file, ...args);
    };
    try {
        assert.throws(() => lib.readAssetDescriptors([asset.assetHash]), error => error.code === 'IO_ERROR' && error.cause?.code === 'EACCES');
    } finally {
        fs.openSync = original;
    }
    const pending = path.join(root, '系统（别动）', '事务', '待恢复', randomUUID());
    fs.mkdirSync(pending);
    fs.writeFileSync(path.join(pending, 'intent.json'), '{invalid');
    assert.throws(() => lib.readAssetDescriptors([asset.assetHash]), error => error.code === 'CORRUPT');
});

for (const change of ['root', 'root during descriptor', 'descriptor', 'malformed descriptor']) test(`batch descriptors recheck ${change} after reading assets`, t => {
    const {parent, root, lib, asset} = fixture(t), target = assetPath(root, asset.assetHash);
    const open = fs.openSync, close = fs.closeSync;
    let assetFd, descriptorFd, assetRead = false, changed = false;
    fs.openSync = function (file, ...args) {
        const fd = open.call(this, file, ...args);
        if (file === target) assetFd = fd;
        if (assetRead && file === path.join(root, '内容库.json')) descriptorFd = fd;
        return fd;
    };
    fs.closeSync = function (fd) {
        close.call(this, fd);
        if (changed) return;
        if (change === 'root during descriptor') {
            if (fd === assetFd) assetRead = true;
            if (fd !== descriptorFd) return;
        } else if (fd !== assetFd) return;
        changed = true;
        if (change.startsWith('root')) {
            fs.renameSync(root, path.join(parent, 'original'));
            fs.cpSync(path.join(parent, 'original'), root, {recursive: true});
        } else {
            const descriptor = path.join(root, '内容库.json');
            const info = JSON.parse(fs.readFileSync(descriptor));
            fs.writeFileSync(descriptor, change === 'descriptor' ? JSON.stringify({...info, libraryId: randomUUID()}) : '{broken');
        }
    };
    try {
        assert.throws(() => lib.readAssetDescriptors([asset.assetHash]), error => error.code === (change.startsWith('root') ? 'CONFLICT' : 'CORRUPT'));
        assert.equal(changed, true);
        assert.equal(fs.existsSync(path.join(root, '系统（别动）', '库锁')), change.startsWith('root'));
    } finally {
        fs.openSync = open;
        fs.closeSync = close;
    }
});
