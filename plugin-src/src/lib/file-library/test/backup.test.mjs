import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import sharp from 'sharp';
import {createLibrary, openLibrary, backupLibrary, verifyBackup, restoreBackup, __testing} from '../index.mjs';

process.env.NODE_ENV = 'test';
const moduleURL = new URL('../index.mjs', import.meta.url).href;
const digest = value => createHash('sha256').update(value).digest('hex');
const json = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const throws = (code, fn) => assert.throws(fn, error => error.code === code);

function fixture(t) {
    const parent = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'nova-backup-')),
        root = path.join(parent, 'library');
    t.after(() => {
        __testing.setHook(undefined);
        fs.rmSync(parent, {recursive: true, force: true});
    });
    return {
        parent,
        root,
        lib: createLibrary(root),
        backup: path.join(parent, 'backup'),
        restored: path.join(parent, 'restored')
    };
}

function bytesTree(root) {
    const files = {};

    function walk(dir, prefix = '') {
        for (const name of fs.readdirSync(dir).sort()) {
            const relative = prefix ? `${prefix}/${name}` : name;
            if (relative === '系统（别动）/库锁') continue;
            const filename = path.join(dir, name);
            if (fs.lstatSync(filename).isDirectory()) {
                files[`${relative}/`] = null;
                walk(filename, relative)
            } else files[relative] = fs.readFileSync(filename).toString('base64');
        }
    }

    walk(root);
    return files;
}

test('schema 4 backup requires full pinned consent and preserves source business bytes without recovery', t => {
    const f = fixture(t), filename = path.join(f.root, '内容库.json'), raw = json({...JSON.parse(fs.readFileSync(filename)), schemaVersion: 4});
    fs.writeFileSync(filename, raw);
    for (const name of ['库配置', '合集']) fs.rmSync(path.join(f.root, name), {recursive: true});
    // A malformed pending entry would fail a recovering open; backup must only copy it.
    fs.writeFileSync(path.join(f.root, '系统（别动）', '事务', '待恢复', 'manual-note'), 'do not recover');
    const rootStat = fs.lstatSync(f.root, {bigint: true}), options = {
        allowSchema4: true,
        expectedLibraryId: f.lib.info.libraryId,
        expectedRootIdentity: {dev: String(rootStat.dev), ino: String(rootStat.ino)},
        expectedDescriptorHash: digest(raw)
    }, before = bytesTree(f.root);
    throws('UPGRADE_REQUIRED', () => backupLibrary(f.root, f.backup));
    throws('INVALID_INPUT', () => backupLibrary(f.root, f.backup, {allowSchema4: true}));
    throws('CONFLICT', () => backupLibrary(f.root, f.backup, {...options, expectedDescriptorHash: '0'.repeat(64)}));
    assert.equal(fs.existsSync(f.backup), false);
    backupLibrary(f.root, f.backup, options);
    assert.equal(verifyBackup(f.backup).manifest.source.schemaVersion, 4);
    assert.deepEqual(bytesTree(f.root), before);
    assert.deepEqual(fs.readFileSync(path.join(f.backup, 'data', '内容库.json')), raw);
});

test('pinned backup refuses a replaced clone before creating lock or destination', t => {
    const f = fixture(t), original = path.join(f.parent, 'original'), rootStat = fs.lstatSync(f.root, {bigint: true}), options = {
        allowSchema4: true,
        expectedLibraryId: f.lib.info.libraryId,
        expectedRootIdentity: {dev: String(rootStat.dev), ino: String(rootStat.ino)},
        expectedDescriptorHash: digest(fs.readFileSync(path.join(f.root, '内容库.json')))
    };
    fs.renameSync(f.root, original);
    fs.cpSync(original, f.root, {recursive: true});
    const before = bytesTree(f.root);
    throws('CONFLICT', () => backupLibrary(f.root, f.backup, options));
    assert.deepEqual(bytesTree(f.root), before);
    assert.equal(fs.existsSync(path.join(f.root, '系统（别动）', '库锁')), false);
    assert.equal(fs.existsSync(f.backup), false);
});

function reseal(backup, change) {
    const entriesPath = path.join(backup, 'entries.ndjson'), manifestPath = path.join(backup, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath));
    change?.(manifest, entriesPath);
    manifest.entriesHash = digest(fs.readFileSync(entriesPath));
    fs.writeFileSync(manifestPath, json(manifest));
    fs.writeFileSync(path.join(backup, 'COMPLETE.json'), json({
        format: 'nova-content-library-backup-complete',
        schemaVersion: 1,
        backupId: manifest.backupId,
        manifestHash: digest(fs.readFileSync(manifestPath)),
        entriesHash: manifest.entriesHash
    }));
}

function kill(script, data) {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', `import{openLibrary,backupLibrary,restoreBackup,__testing}from ${JSON.stringify(moduleURL)};const d=JSON.parse(process.env.TASK_DATA);${script}`], {
        env: {
            ...process.env,
            NODE_ENV: 'test',
            TASK_DATA: JSON.stringify(data)
        }, encoding: 'utf8', timeout: 20000
    });
    assert.equal(result.signal, 'SIGKILL', result.stderr);
}

async function jobs(f) {
    const source = path.join(f.parent, 'sample.png');
    fs.writeFileSync(source, await sharp({
        create: {
            width: 8,
            height: 6,
            channels: 3,
            background: 'red'
        }
    }).png().toBuffer());
    const style = f.lib.importAsset(source, {purpose: 'template-reference'});
    const template = f.lib.createTemplate({
        name: 'sample',
        definition: {accepted: false},
        resources: {
            sample: {
                assetHash: style.assetHash,
                bytes: style.bytes,
                detectedType: style.detectedType,
                role: 'style'
            }
        }
    });
    const content = f.lib.createContent({title: 'cover', body: '\ufeffbody\r\n'});
    const created = f.lib.createCoverRequest(content.id, {
        template: {id: template.id, version: 1},
        styleAssetHashes: [style.assetHash],
        photo: null,
        materialIds: [],
        prompt: 'cover',
        pixels: {width: 8, height: 6},
        ratio: '4:3',
        count: 1,
        outputFormat: 'png',
        scope: 'cover-only'
    }, content.editToken);
    const attempt = f.lib.createCoverAttempt(content.id, created.request.requestId, {host: 'codex'}).attempt;
    const context = f.lib.readCoverContext(content.id, created.request.requestId, attempt.attemptId);
    return {
        contentId: content.id,
        requestId: created.request.requestId,
        attemptId: attempt.attemptId,
        context,
        request: created.request,
        source,
        style,
        template
    };
}

test('full byte-preserving backup and restore retain unknown files, empty dirs, trash and every transaction', t => {
    const f = fixture(t), original = f.lib.createContent({title: '原文', body: '\ufeff# CRLF\r\nno final newline'});
    f.lib.trashContent(original.id, original.editToken);
    f.lib.createPrompt({title: '提示词', body: '\ufeffprompt\r\n'});
    fs.mkdirSync(path.join(f.root, '用户资料'));
    fs.mkdirSync(path.join(f.root, '用户资料', 'empty'));
    fs.writeFileSync(path.join(f.root, '用户资料', 'script.html'), '<script>throw new Error("never execute")</script>');
    fs.mkdirSync(path.join(f.root, '系统（别动）', '事务', '待恢复', `.staging-${randomUUID()}-${randomUUID()}`));
    fs.writeFileSync(path.join(f.root, '系统（别动）', '旧版本备份'), Buffer.from([0, 255, 0]));
    const before = bytesTree(f.root), result = backupLibrary(f.root, f.backup);
    assert.equal(result.manifest.consistency, 'stable-verified-copy');
    assert.equal(verifyBackup(f.backup).verified, true);
    assert.deepEqual(bytesTree(path.join(f.backup, 'data')), before);
    assert.deepEqual(bytesTree(f.root), before);
    const restored = restoreBackup(f.backup, f.restored);
    assert.equal(restored.outcome, 'committed');
    const after = bytesTree(f.restored);
    for (const [name, bytes] of Object.entries(before)) assert.equal(after[name], bytes, name);
    assert.equal(openLibrary(f.restored).listTrash()[0].id, original.id);
    assert.deepEqual(bytesTree(f.root), before);
    assert.deepEqual(bytesTree(path.join(f.backup, 'data')), before);
});

test('restore interrupts created/claimed attempts including soft-deleted content and preserves committed receipts', async t => {
    const f = fixture(t), j = await jobs(f);
    const claimed = f.lib.claimCoverAttempt(j.contentId, j.requestId, j.attemptId, {
        host: 'codex',
        readAssetHashes: [j.style.assetHash]
    });
    const bytes = fs.readFileSync(j.source), name = 'result.png';
    fs.writeFileSync(path.join(j.context.inbox, name), bytes);
    const receipt = {
        libraryId: f.lib.info.libraryId,
        contentId: j.contentId,
        requestId: j.requestId,
        attemptId: j.attemptId,
        requestHash: j.request.requestHash,
        resultId: randomUUID(),
        files: [{name, sha256: digest(bytes)}]
    };
    const done = await f.lib.commitCoverAttempt(j.contentId, j.requestId, j.attemptId, receipt);
    const live = f.lib.createCoverAttempt(j.contentId, j.requestId, {host: 'workbuddy', reason: 'retry'});
    const deleted = f.lib.trashContent(j.contentId, live.content.editToken);
    const before = bytesTree(f.root);
    backupLibrary(f.root, f.backup);
    const restored = restoreBackup(f.backup, f.restored);
    assert.equal(restored.interruptedAttempts.length, 1);
    const lib = openLibrary(f.restored), meta = lib.listTrash()[0];
    assert.equal(meta.deletedAt, deleted.deletedAt);
    assert.equal(meta.coverJobs[0].activeAttemptId, null);
    assert.equal(meta.coverJobs[0].attempts.find(x => x.attemptId === live.attempt.attemptId).failure.code, 'RESTORED_INTERRUPTED');
    assert.equal(meta.coverJobs[0].attempts.find(x => x.attemptId === j.attemptId).status, 'committed');
    assert.deepEqual(meta.candidates, done.content.candidates);
    assert.deepEqual(bytesTree(f.root), before);
    assert.equal(lib.queryMutation(restored.interruptedAttempts[0].mutationId).status, 'committed');
});

for (const phase of ['afterJournal', 'afterFile', 'afterCommit']) test(`backup never recovers source pending; restore handles ${phase}`, t => {
    const f = fixture(t), item = f.lib.createContent({title: 'before', body: 'before\r\n'}), mutationId = randomUUID();
    kill(`const lib=openLibrary(d.root);__testing.setHook(e=>{if(e.phase===d.phase&&(e.phase!=='afterFile'||e.index===0))process.kill(process.pid,'SIGKILL')});lib.updateContent(d.item.id,{title:'after',body:'after'},d.item.editToken,{mutationId:d.mutationId});`, {
        root: f.root,
        item,
        mutationId,
        phase
    });
    const before = bytesTree(f.root);
    backupLibrary(f.root, f.backup);
    assert.deepEqual(bytesTree(f.root), before);
    const restored = restoreBackup(f.backup, f.restored);
    assert.ok(restored.recoveredMutations.includes(mutationId));
    const lib = openLibrary(f.restored);
    assert.equal(lib.readContent(item.id).body, 'after');
    assert.equal(lib.queryMutation(mutationId).status, 'committed');
    assert.deepEqual(bytesTree(f.root), before);
});

test('pending third-state conflict leaves source and backup unchanged and target unpublished', t => {
    const f = fixture(t), item = f.lib.createContent({title: 'before', body: 'before'});
    kill(`const lib=openLibrary(d.root);__testing.setHook(e=>{if(e.phase==='afterJournal')process.kill(process.pid,'SIGKILL')});lib.updateContent(d.item.id,{body:'after'},d.item.editToken);`, {
        root: f.root,
        item
    });
    fs.writeFileSync(path.join(f.root, '内容', item.id, '正文.md'), 'external third state');
    const before = bytesTree(f.root);
    backupLibrary(f.root, f.backup);
    const packageBefore = bytesTree(f.backup);
    throws('RECOVERY_CONFLICT', () => restoreBackup(f.backup, f.restored));
    assert.equal(fs.existsSync(f.restored), false);
    assert.deepEqual(bytesTree(f.root), before);
    assert.deepEqual(bytesTree(f.backup), packageBefore);
});

for (const kind of ['file', 'member', 'directory']) test(`external ${kind} changes abort stable backup without COMPLETE`, t => {
    const f = fixture(t), item = f.lib.createContent({title: 'one', body: 'one'});
    let fired = false;
    __testing.setHook(event => {
        if (event.phase === 'backupAfterFile' && !fired) {
            fired = true;
            if (kind === 'file') fs.appendFileSync(path.join(f.root, '内容', item.id, '正文.md'), 'changed'); else if (kind === 'member') fs.writeFileSync(path.join(f.root, 'new-user-file'), 'new'); else fs.mkdirSync(path.join(f.root, 'empty-new'));
        }
    });
    throws('SOURCE_CHANGED', () => backupLibrary(f.root, f.backup));
    assert.equal(fs.existsSync(path.join(f.backup, 'COMPLETE.json')), false);
});

test('backup holds shared core lock; concurrent CRUD returns BUSY without failing live attempts', async t => {
    const f = fixture(t), j = await jobs(f);
    const before = f.lib.readContent(j.contentId);
    let checked = false;
    __testing.setHook(event => {
        if (event.phase === 'backupLocked') {
            const child = spawnSync(process.execPath, ['--input-type=module', '-e', `import{openLibrary}from ${JSON.stringify(moduleURL)};try{openLibrary(process.env.TASK_ROOT).createContent({title:'blocked',body:''})}catch(e){console.log(e.code)}`], {
                env: {
                    ...process.env,
                    TASK_ROOT: f.root
                }, encoding: 'utf8'
            });
            assert.equal(child.stdout.trim(), 'BUSY');
            checked = true;
        }
    });
    backupLibrary(f.root, f.backup);
    __testing.setHook(undefined);
    assert.equal(checked, true);
    assert.deepEqual(f.lib.readContent(j.contentId), before);
});

for (const phase of ['backupBeforeFileSync', 'backupCompleteBeforePublish', 'backupCompleteAfterPublish']) test(`backup failure at ${phase} reports durable publication accurately`, t => {
    const f = fixture(t);
    __testing.setHook(event => {
        if (event.phase === phase) throw Object.assign(new Error('disk full'), {code: 'ENOSPC'});
    });
    assert.throws(() => backupLibrary(f.root, f.backup), error => error.code === 'IO_ERROR' && (phase.endsWith('AfterPublish') ? error.outcome === 'committed' : error.outcome === undefined));
    __testing.setHook(undefined);
    assert.equal(fs.existsSync(path.join(f.backup, 'COMPLETE.json')), phase.endsWith('AfterPublish'));
    assert.equal(openLibrary(f.root).listContents().length, 0);
});

for (const phase of ['backupAfterFile', 'backupCompleteBeforePublish', 'backupCompleteAfterPublish']) test(`SIGKILL during ${phase} never creates a false completion boundary`, t => {
    const f = fixture(t);
    kill(`__testing.setHook(e=>{if(e.phase===d.phase)process.kill(process.pid,'SIGKILL')});backupLibrary(d.root,d.backup);`, {
        root: f.root,
        backup: f.backup,
        phase
    });
    assert.equal(fs.existsSync(path.join(f.backup, 'COMPLETE.json')), phase === 'backupCompleteAfterPublish');
    if (phase === 'backupCompleteAfterPublish') {
        assert.equal(verifyBackup(f.backup).verified, true);
    } else assert.throws(() => verifyBackup(f.backup));
    assert.equal(openLibrary(f.root).listContents().length, 0);
});

for (const phase of ['restoreDescriptorBeforePublish', 'restoreDescriptorAfterPublish', 'restoreAfterDescriptorSync']) test(`restore publication failure ${phase} cannot replace target or hide committed outcome`, t => {
    const f = fixture(t);
    f.lib.createContent({title: 'a', body: 'a'});
    backupLibrary(f.root, f.backup);
    __testing.setHook(event => {
        if (event.phase === phase) throw new Error('fault');
    });
    assert.throws(() => restoreBackup(f.backup, f.restored), error => error.code === 'IO_ERROR' && (phase === 'restoreDescriptorBeforePublish' ? error.outcome === undefined : error.outcome === 'committed'));
    __testing.setHook(undefined);
    assert.equal(fs.existsSync(path.join(f.restored, '内容库.json')), phase !== 'restoreDescriptorBeforePublish');
    if (phase !== 'restoreDescriptorBeforePublish') assert.equal(openLibrary(f.restored).listContents().length, 1);
    throws('DESTINATION_EXISTS', () => restoreBackup(f.backup, f.restored));
});

for (const kind of ['extra', 'missing', 'hash', 'seal', 'unknown-schema', 'duplicate', 'absolute', 'traversal', 'backslash', 'device', 'long-line', 'case', 'symlink']) test(`verification rejects ${kind} without modifying package`, t => {
    const f = fixture(t);
    f.lib.createContent({title: 'a', body: 'a'});
    backupLibrary(f.root, f.backup);
    const data = path.join(f.backup, 'data');
    if (kind === 'extra') fs.writeFileSync(path.join(data, 'extra'), 'extra');
    if (kind === 'missing') fs.unlinkSync(path.join(data, '内容库.json'));
    if (kind === 'hash') fs.appendFileSync(path.join(data, '内容库.json'), ' ');
    if (kind === 'seal') fs.writeFileSync(path.join(f.backup, 'COMPLETE.json'), '{}');
    if (kind === 'unknown-schema') reseal(f.backup, manifest => manifest.source.schemaVersion = 999);
    if (['duplicate', 'absolute', 'traversal', 'backslash', 'device', 'long-line'].includes(kind)) reseal(f.backup, (_manifest, filename) => {
        let lines = fs.readFileSync(filename, 'utf8').trimEnd().split('\n');
        if (kind === 'duplicate') lines.splice(1, 0, lines[0]); else if (kind === 'long-line') lines[0] = ' '.repeat(65537); else lines[0] = JSON.stringify({
            path: ({
                absolute: '/absolute',
                traversal: '../escape',
                backslash: 'x\\y',
                device: 'CON.txt'
            })[kind], type: 'directory'
        });
        fs.writeFileSync(filename, `${lines.join('\n')}\n`);
    });
    if (kind === 'case') {
        fs.writeFileSync(path.join(data, 'Case'), 'a');
        fs.writeFileSync(path.join(data, 'case'), 'a');
    }
    if (kind === 'symlink') fs.symlinkSync(path.join(f.parent, 'outside'), path.join(data, 'linked'));
    const before = bytesTree(f.root);
    assert.throws(() => verifyBackup(f.backup));
    assert.throws(() => restoreBackup(f.backup, f.restored));
    assert.equal(fs.existsSync(f.restored), false);
    assert.deepEqual(bytesTree(f.root), before);
});

test('exact destinations reject existing empty directories, source descendants and symlink ancestors', t => {
    const f = fixture(t);
    fs.mkdirSync(f.backup);
    throws('DESTINATION_EXISTS', () => backupLibrary(f.root, f.backup));
    fs.rmdirSync(f.backup);
    throws('UNSAFE_PATH', () => backupLibrary(f.root, path.join(f.root, 'backup')));
    backupLibrary(f.root, f.backup);
    fs.mkdirSync(f.restored);
    throws('DESTINATION_EXISTS', () => restoreBackup(f.backup, f.restored));
    const linked = path.join(f.parent, 'linked');
    fs.symlinkSync(f.parent, linked);
    throws('UNSAFE_PATH', () => backupLibrary(f.root, path.join(linked, 'other')));
});

test('short writes are completed before hashing and publishing the package', t => {
    const f = fixture(t);
    fs.writeFileSync(path.join(f.root, 'bytes.bin'), Buffer.alloc(400000, 0xab));
    const write = fs.writeSync;
    let shorts = 0;
    fs.writeSync = (fd, bytes, offset, length, position) => {
        if (length > 7) {
            shorts++;
            return write(fd, bytes, offset, 7, position)
        }
        return write(fd, bytes, offset, length, position)
    };
    try {
        backupLibrary(f.root, f.backup);
    } finally {
        fs.writeSync = write;
    }
    assert.ok(shorts > 0);
    assert.equal(verifyBackup(f.backup).verified, true);
    assert.deepEqual(fs.readFileSync(path.join(f.backup, 'data', 'bytes.bin')), Buffer.alloc(400000, 0xab));
});

for (const code of ['ENOSPC', 'EIO', 'EACCES']) test(`real fsync call failure ${code} does not publish backup success`, t => {
    const f = fixture(t), sync = fs.fsyncSync;
    let failNext = false;
    __testing.setHook(event => {
        if (event.phase === 'backupBeforeFileSync') failNext = true;
    });
    fs.fsyncSync = fd => {
        if (failNext) {
            failNext = false;
            throw Object.assign(new Error(code), {code})
        }
        return sync(fd)
    };
    try {
        throws('IO_ERROR', () => backupLibrary(f.root, f.backup));
    } finally {
        fs.fsyncSync = sync;
        __testing.setHook(undefined);
    }
    assert.equal(fs.existsSync(path.join(f.backup, 'COMPLETE.json')), false);
    assert.equal(openLibrary(f.root).listContents().length, 0);
});

test('concurrent destination mkdir never takes over an empty directory', t => {
    const f = fixture(t), mkdir = fs.mkdirSync;
    let raced = false;
    fs.mkdirSync = (target, ...args) => {
        if (target === f.backup && !raced) {
            raced = true;
            mkdir(target);
            return mkdir(target, ...args)
        }
        return mkdir(target, ...args)
    };
    try {
        throws('DESTINATION_EXISTS', () => backupLibrary(f.root, f.backup));
    } finally {
        fs.mkdirSync = mkdir;
    }
    assert.deepEqual(fs.readdirSync(f.backup), []);
});

test('replaced destination directory stops descriptor publication', t => {
    const f = fixture(t);
    backupLibrary(f.root, f.backup);
    let moved;
    __testing.setHook(event => {
        if (event.phase === 'restoreDescriptorBeforePublish') {
            moved = `${f.restored}-moved`;
            fs.renameSync(f.restored, moved);
            fs.mkdirSync(f.restored);
        }
    });
    throws('SOURCE_CHANGED', () => restoreBackup(f.backup, f.restored));
    __testing.setHook(undefined);
    assert.equal(fs.existsSync(path.join(f.restored, '内容库.json')), false);
    assert.equal(fs.existsSync(path.join(moved, '内容库.json')), false);
});

test('backup rejects destination parent replacement before sealing', t => {
    const f = fixture(t), output = path.join(f.parent, 'output');
    fs.mkdirSync(output);
    let changed = false;
    __testing.setHook(event => {
        if (event.phase === 'backupAfterFile' && !changed) {
            changed = true;
            fs.renameSync(output, `${output}-old`);
            fs.mkdirSync(output);
        }
    });
    assert.throws(() => backupLibrary(f.root, path.join(output, 'backup')));
    __testing.setHook(undefined);
    assert.equal(fs.existsSync(path.join(output, 'backup', 'COMPLETE.json')), false);
    assert.equal(fs.existsSync(path.join(`${output}-old`, 'backup', 'COMPLETE.json')), false);
});

for (const phase of ['restoreDescriptorBeforePublish', 'restoreDescriptorAfterPublish']) test(`SIGKILL ${phase} leaves the explicit descriptor boundary`, t => {
    const f = fixture(t);
    f.lib.createContent({title: 'retained', body: 'bytes'});
    backupLibrary(f.root, f.backup);
    kill(`__testing.setHook(e=>{if(e.phase===d.phase)process.kill(process.pid,'SIGKILL')});restoreBackup(d.backup,d.destination);`, {
        phase,
        backup: f.backup,
        destination: f.restored
    });
    assert.equal(fs.existsSync(path.join(f.restored, '内容库.json')), phase === 'restoreDescriptorAfterPublish');
    if (phase === 'restoreDescriptorAfterPublish') assert.equal(openLibrary(f.restored).listContents()[0].title, 'retained');
});

test('large unknown file is copied and verified through bounded reads', t => {
    const f = fixture(t), large = path.join(f.root, 'large.bin'), fd = fs.openSync(large, 'wx');
    fs.ftruncateSync(fd, 24 * 1024 * 1024);
    fs.closeSync(fd);
    const read = fs.readSync;
    let maximum = 0;
    fs.readSync = (handle, buffer, offset, length, ...args) => {
        maximum = Math.max(maximum, length || 0);
        return read(handle, buffer, offset, length, ...args)
    };
    try {
        backupLibrary(f.root, f.backup);
        verifyBackup(f.backup);
        restoreBackup(f.backup, f.restored);
    } finally {
        fs.readSync = read;
    }
    assert.ok(maximum <= 128 * 1024, `largest read ${maximum}`);
    assert.equal(fs.statSync(path.join(f.restored, 'large.bin')).size, 24 * 1024 * 1024);
});

test('decoder can run while backup sees only locked persistent captures; attempts remain live', async t => {
    const f = fixture(t), j = await jobs(f);
    f.lib.claimCoverAttempt(j.contentId, j.requestId, j.attemptId, {
        host: 'codex',
        readAssetHashes: [j.style.assetHash]
    });
    const bytes = fs.readFileSync(j.source), name = 'result.png';
    fs.writeFileSync(path.join(j.context.inbox, name), bytes);
    const receipt = {
        libraryId: f.lib.info.libraryId,
        contentId: j.contentId,
        requestId: j.requestId,
        attemptId: j.attemptId,
        requestHash: j.request.requestHash,
        resultId: randomUUID(),
        files: [{name, sha256: digest(bytes)}]
    };
    let captured = false;
    __testing.setHook(event => {
        if (event.phase === 'coverBeforeDecode') {
            backupLibrary(f.root, f.backup);
            captured = true;
        }
    });
    const done = await f.lib.commitCoverAttempt(j.contentId, j.requestId, j.attemptId, receipt);
    __testing.setHook(undefined);
    assert.equal(done.attempt.status, 'committed');
    assert.equal(captured, true);
    verifyBackup(f.backup);
    const restored = restoreBackup(f.backup, f.restored);
    assert.equal(restored.interruptedAttempts.length, 1);
    const restoredMeta = openLibrary(f.restored).readContent(j.contentId);
    assert.equal(restoredMeta.coverJobs[0].attempts[0].failure.code, 'RESTORED_INTERRUPTED');
    assert.equal(restoredMeta.candidates.length, 0);
});

test('publication body/cover/template snapshots and photo/template records survive complete restoration', async t => {
    const f = fixture(t), j = await jobs(f);
    f.lib.createPhoto({
        title: 'own photo',
        assetHash: j.style.assetHash,
        isOwnPhoto: true,
        originalName: 'original.png'
    });
    f.lib.attachContentMaterial(j.contentId, {
        assetHash: j.style.assetHash,
        originalName: 'material.png'
    }, f.lib.readContent(j.contentId).editToken);
    let content = f.lib.registerContentCandidate(j.contentId, {
        assetHash: j.style.assetHash,
        requestId: 'external-request',
        attemptId: 'external-attempt',
        template: {id: j.template.id, version: 1}
    }, f.lib.readContent(j.contentId).editToken);
    content = f.lib.selectContentCover(j.contentId, content.candidates[0].id, content.editToken);
    content = f.lib.savePublicationPlan(j.contentId, {
        channelId: 'wechat',
        scheduledAt: '2026-10-18T00:00:00.000Z',
        timezone: 'Asia/Shanghai'
    }, content.editToken);
    content = f.lib.recordPublication(j.contentId, {
        planId: content.plans[0].id,
        publishedAt: '2026-10-18T00:00:00.000Z',
        timezone: 'Asia/Shanghai',
        url: 'https://example.com/post'
    }, content.editToken);
    const publication = f.lib.readPublication(j.contentId, content.publications[0].id), before = bytesTree(f.root);
    backupLibrary(f.root, f.backup);
    restoreBackup(f.backup, f.restored);
    const lib = openLibrary(f.restored);
    assert.deepEqual(lib.readPublication(j.contentId, content.publications[0].id), publication);
    assert.equal(lib.listPhotos()[0].assetHash, j.style.assetHash);
    assert.equal(lib.listTemplates()[0].id, j.template.id);
    const after = bytesTree(f.restored);
    for (const [filename, bytes] of Object.entries(before)) if (!filename.endsWith('内容.json')) assert.equal(after[filename], bytes, filename);
});

test('source mutation immediately before COMPLETE publication is observed', t => {
    const f = fixture(t), item = f.lib.createContent({title: 'one', body: 'one'});
    __testing.setHook(event => {
        if (event.phase === 'backupCompleteBeforePublish') fs.appendFileSync(path.join(f.root, '内容', item.id, '正文.md'), 'external');
    });
    throws('SOURCE_CHANGED', () => backupLibrary(f.root, f.backup));
    assert.equal(fs.existsSync(path.join(f.backup, 'COMPLETE.json')), false);
});

for (const names of [['Case', 'case'], ['e\u0301', 'é']]) test(`entries refuse portable name collisions ${JSON.stringify(names)}`, t => {
    const f = fixture(t);
    backupLibrary(f.root, f.backup);
    reseal(f.backup, (_manifest, filename) => {
        const entries = fs.readFileSync(filename, 'utf8').trimEnd().split('\n').map(line => JSON.parse(line));
        entries.push(...names.map(name => ({path: name, type: 'directory'})));
        entries.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
        fs.writeFileSync(filename, `${entries.map(entry => JSON.stringify(entry)).join('\n')}\n`);
    });
    throws('UNSAFE_PATH', () => verifyBackup(f.backup));
});

test('COMMITTED pending archives only and retains later external Markdown bytes', t => {
    const f = fixture(t), item = f.lib.createContent({title: 'before', body: 'before'}), mutationId = randomUUID();
    kill(`const lib=openLibrary(d.root);__testing.setHook(e=>{if(e.phase==='afterCommit')process.kill(process.pid,'SIGKILL')});lib.updateContent(d.item.id,{body:'committed'},d.item.editToken,{mutationId:d.mutationId});`, {
        root: f.root,
        item,
        mutationId
    });
    fs.writeFileSync(path.join(f.root, '内容', item.id, '正文.md'), 'external after commit\r\n');
    backupLibrary(f.root, f.backup);
    restoreBackup(f.backup, f.restored);
    const lib = openLibrary(f.restored);
    assert.equal(lib.readContent(item.id).body, 'external after commit\r\n');
    assert.equal(lib.queryMutation(mutationId).content.body, 'committed');
});

for (const character of ['<', '>', '"', '|', '?', '*']) {
    test(`source filenames reject Windows forbidden ${JSON.stringify(character)}`, {skip: process.platform === 'win32'}, t => {
        const f = fixture(t), filename = path.join(f.root, `unsafe${character}name.txt`);
        fs.writeFileSync(filename, 'retained');
        throws('UNSAFE_PATH', () => backupLibrary(f.root, f.backup));
        assert.equal(fs.readFileSync(filename, 'utf8'), 'retained');
        assert.equal(fs.existsSync(f.backup), true);
        assert.equal(fs.existsSync(path.join(f.backup, 'COMPLETE.json')), false);
    });
    test(`entries reject Windows forbidden ${JSON.stringify(character)}`, t => {
        const f = fixture(t);
        backupLibrary(f.root, f.backup);
        reseal(f.backup, (_manifest, filename) => {
            const lines = fs.readFileSync(filename, 'utf8').trimEnd().split('\n');
            lines[0] = JSON.stringify({path: `unsafe${character}name`, type: 'directory'});
            fs.writeFileSync(filename, `${lines.join('\n')}\n`);
        });
        throws('UNSAFE_PATH', () => verifyBackup(f.backup));
        throws('UNSAFE_PATH', () => restoreBackup(f.backup, f.restored));
        assert.equal(fs.existsSync(f.restored), false);
    });
}
for (const name of ['COM¹', 'COM².txt', 'COM³', 'LPT¹.txt', 'LPT²', 'LPT³.txt']) test(`entries reject Windows superscript device ${name}`, t => {
    const f = fixture(t);
    backupLibrary(f.root, f.backup);
    reseal(f.backup, (_manifest, filename) => {
        const lines = fs.readFileSync(filename, 'utf8').trimEnd().split('\n');
        lines[0] = JSON.stringify({path: name, type: 'directory'});
        fs.writeFileSync(filename, `${lines.join('\n')}\n`);
    });
    throws('UNSAFE_PATH', () => verifyBackup(f.backup));
});

for (const operation of ['backup', 'restore']) for (const change of ['body', 'extra-file', 'extra-directory', 'missing-file', 'replaced-directory']) test(`${operation} final publication refuses target ${change}`, t => {
    const f = fixture(t), item = f.lib.createContent({title: 'original', body: 'original'}),
        sourceBefore = bytesTree(f.root);
    if (operation === 'restore') backupLibrary(f.root, f.backup);
    const backupBefore = operation === 'restore' ? bytesTree(f.backup) : null;
    const destination = operation === 'backup' ? path.join(f.backup, 'data') : f.restored;
    __testing.setHook(event => {
        if (event.phase !== (operation === 'backup' ? 'backupCompleteBeforePublish' : 'restoreDescriptorBeforePublish')) return;
        if (change === 'body') fs.writeFileSync(path.join(destination, '内容', item.id, '正文.md'), 'tampered');
        if (change === 'extra-file') fs.writeFileSync(path.join(destination, 'late-user-file'), 'added');
        if (change === 'extra-directory') fs.mkdirSync(path.join(destination, 'late-empty-directory'));
        if (change === 'missing-file') fs.unlinkSync(path.join(destination, '内容', item.id, '正文.md'));
        if (change === 'replaced-directory') {
            const replaced = path.join(destination, '资产');
            fs.renameSync(replaced, path.join(destination, 'moved-assets'));
            fs.mkdirSync(replaced);
            fs.mkdirSync(path.join(replaced, 'sha256'));
        }
    });
    assert.throws(() => operation === 'backup' ? backupLibrary(f.root, f.backup) : restoreBackup(f.backup, f.restored), error => error.code === 'SOURCE_CHANGED' && error.outcome === undefined);
    __testing.setHook(undefined);
    assert.equal(fs.existsSync(operation === 'backup' ? path.join(f.backup, 'COMPLETE.json') : path.join(f.restored, '内容库.json')), false);
    assert.deepEqual(bytesTree(f.root), sourceBefore);
    if (backupBefore) assert.deepEqual(bytesTree(f.backup), backupBefore);
});

for (const name of ['manifest.json', 'entries.ndjson']) test(`backup final publication refuses altered ${name}`, t => {
    const f = fixture(t);
    __testing.setHook(event => {
        if (event.phase === 'backupCompleteBeforePublish') fs.appendFileSync(path.join(f.backup, name), ' ');
    });
    assert.throws(() => backupLibrary(f.root, f.backup), error => error.code === 'SOURCE_CHANGED' && error.outcome === undefined);
    assert.equal(fs.existsSync(path.join(f.backup, 'COMPLETE.json')), false);
});

for (const operation of ['backup', 'restore']) test(`${operation} rechecks directory members after final target hashing`, t => {
    const f = fixture(t), item = f.lib.createContent({title: 'original', body: 'original'});
    if (operation === 'restore') backupLibrary(f.root, f.backup);
    const destination = operation === 'backup' ? path.join(f.backup, 'data') : f.restored, originalRead = fs.readSync;
    let armed = false, changed = false, targetIdentity;
    __testing.setHook(event => {
        if (event.phase === (operation === 'backup' ? 'backupCompleteBeforePublish' : 'restoreDescriptorBeforePublish')) {
            armed = true;
            const info = fs.statSync(path.join(destination, '内容', item.id, '正文.md'), {bigint: true});
            targetIdentity = `${info.dev}:${info.ino}`;
        }
    });
    fs.readSync = (fd, ...args) => {
        const count = originalRead(fd, ...args);
        if (armed && !changed && count) {
            const info = fs.fstatSync(fd, {bigint: true});
            if (`${info.dev}:${info.ino}` === targetIdentity) {
                changed = true;
                fs.mkdirSync(path.join(destination, 'added-during-final-hash'));
            }
        }
        return count;
    };
    try {
        assert.throws(() => operation === 'backup' ? backupLibrary(f.root, f.backup) : restoreBackup(f.backup, f.restored), error => error.code === 'SOURCE_CHANGED' && error.outcome === undefined);
    } finally {
        fs.readSync = originalRead;
        __testing.setHook(undefined);
    }
    assert.equal(changed, true);
    assert.equal(fs.existsSync(operation === 'backup' ? path.join(f.backup, 'COMPLETE.json') : path.join(f.restored, '内容库.json')), false);
});
