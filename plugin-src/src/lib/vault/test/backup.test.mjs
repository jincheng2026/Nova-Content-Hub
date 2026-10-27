import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {createVault, openVault, readVaultSnapshot, createVaultDocument, readVaultDocument, saveVaultDocument} from '../index.mjs';
const api = await import('../backup.mjs').catch(error => { if (error.code === 'ERR_MODULE_NOT_FOUND') return {}; throw error; });
function fixture(t) {
    const parent = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'nova-vault-backup-'));
    t.after(() => fs.rmSync(parent, {recursive: true, force: true}));
    const root = path.join(parent, 'vault'); fs.mkdirSync(root);
    const binding = createVault(root);
    fs.mkdirSync(path.join(root, '我的附件'));
    fs.writeFileSync(path.join(root, '我的附件', '原始资料.txt'), '保留用户附加目录');
    fs.writeFileSync(path.join(root, 'AGENTS.md'), '保留自定义规则');
    return {parent, root, binding, backup: path.join(parent, 'backup'), target: path.join(parent, 'restored')};
}

test('full Vault API is available independently of legacy runtime backup', () => {
    for (const name of ['backupVault', 'verifyVaultBackup', 'restoreVaultBackup', 'inspectVaultCopy', 'migrateVault', 'inspectVaultRestore']) assert.equal(typeof api[name], 'function', name);
});
test('complete package includes user files and runtime; restoration preserves identity of content and allows edits', t => {
    const f = fixture(t), created = createVaultDocument(f.binding.root, {section: 'drafts', title: '', text: '当前稿件'}, {mutationId: randomUUID()});
    const result = api.backupVault(f.root, f.backup);
    assert.equal(result.manifest.format, 'nova-knowledge-vault-backup');
    assert.equal(fs.readFileSync(path.join(f.backup, 'data/我的附件/原始资料.txt'), 'utf8'), '保留用户附加目录');
    assert.ok(fs.existsSync(path.join(f.backup, 'data/.workbench/runtime/内容库.json')));
    assert.equal(api.verifyVaultBackup(f.backup).treeHash, result.treeHash);
    const restored = api.restoreVaultBackup(f.backup, f.target, {operationId: randomUUID()});
    const binding = openVault(f.target);
    assert.equal(binding.libraryId, f.binding.libraryId);
    assert.notDeepEqual(binding.rootIdentity, f.binding.rootIdentity);
    assert.equal(fs.readFileSync(path.join(f.target, 'AGENTS.md'), 'utf8'), '保留自定义规则');
    assert.equal(readVaultDocument(binding.root, created.document.id).document.contentId, created.document.contentId);
    assert.equal(readVaultSnapshot(binding.root).vaultId, result.manifest.source.vaultId);
    const old = readVaultDocument(binding.root, created.document.id);
    assert.equal(saveVaultDocument(binding.root, {id: old.document.id, expectedHash: old.document.hash, text: '新位置编辑'}, {mutationId: randomUUID()}).text, '新位置编辑');
    assert.equal(readVaultDocument(f.binding.root, created.document.id).text, '当前稿件');
    assert.ok(restored.root === f.target);
});
test('verify rejects modified hashes and extra tree members', t => {
    const f = fixture(t); api.backupVault(f.root, f.backup);
    fs.writeFileSync(path.join(f.backup, 'data/AGENTS.md'), '被篡改');
    assert.throws(() => api.verifyVaultBackup(f.backup), {code: 'CORRUPT'});
    const second = path.join(f.parent, 'second'); api.backupVault(f.root, second);
    fs.writeFileSync(path.join(second, 'data/extra'), 'extra');
    assert.throws(() => api.verifyVaultBackup(second), {code: 'CORRUPT'});
});
test('backup refuses target inside entire Vault and symlinks without touching source', t => {
    const f = fixture(t);
    assert.throws(() => api.backupVault(f.root, path.join(f.root, '我的附件/backup')), {code: 'UNSAFE_PATH'});
    fs.symlinkSync(path.join(f.root, 'AGENTS.md'), path.join(f.root, 'link'));
    assert.throws(() => api.backupVault(f.root, f.backup), {code: 'UNSAFE_PATH'});
    assert.equal(fs.readFileSync(path.join(f.root, 'AGENTS.md'), 'utf8'), '保留自定义规则');
});
test('source mutation during copy leaves partial evidence without completion seal', t => {
    const f = fixture(t), original = fs.writeSync;
    let changed = false;
    fs.writeSync = function(fd, bytes, ...args) {
        const result = original.call(this, fd, bytes, ...args);
        if (!changed && Buffer.isBuffer(bytes) && bytes.includes(Buffer.from('保留自定义规则'))) {
            changed = true; fs.writeFileSync(path.join(f.root, 'AGENTS.md'), '外部编辑');
        }
        return result;
    };
    try { assert.throws(() => api.backupVault(f.root, f.backup), {code: 'SOURCE_CHANGED'}); }
    finally { fs.writeSync = original; }
    assert.equal(changed, true);
    assert.equal(fs.existsSync(path.join(f.backup, 'COMPLETE.json')), false);
    assert.ok(fs.existsSync(f.backup));
});
test('explicit migration accepts copied Vault, ordinary open rejects it, and never changes copied source', t => {
    const f = fixture(t), copy = path.join(f.parent, 'copied-vault');
    fs.cpSync(f.root, copy, {recursive: true});
    const descriptor = fs.readFileSync(path.join(copy, '.workbench/vault.json'));
    assert.throws(() => openVault(copy), {code: 'CONFLICT'});
    const markerPath = path.join(copy, '.workbench/runtime/vault-binding.json');
    const marker = JSON.parse(fs.readFileSync(markerPath));
    fs.writeFileSync(markerPath, JSON.stringify({...marker, vaultRoot: String.raw`C:\Users\someone\vault`}));
    const pinned = api.inspectVaultCopy(copy);
    api.migrateVault(copy, f.target, {operationId: randomUUID(), expectedTreeHash: pinned.treeHash});
    assert.ok(openVault(f.target).root.startsWith(f.target));
    assert.deepEqual(fs.readFileSync(path.join(copy, '.workbench/vault.json')), descriptor);
    assert.throws(() => api.migrateVault(copy, f.target), {code: 'DESTINATION_EXISTS'});
});
test('restore receipt is tied to exact operation and destination identity; repeat never overwrites', t => {
    const f = fixture(t), operationId = randomUUID(); api.backupVault(f.root, f.backup);
    const source = api.verifyVaultBackup(f.backup);
    api.restoreVaultBackup(f.backup, f.target, {operationId});
    assert.equal(api.inspectVaultRestore(f.target, {operationId, backupId: source.backupId, treeHash: source.treeHash}).root, f.target);
    assert.throws(() => api.inspectVaultRestore(f.target, {operationId: randomUUID(), backupId: source.backupId, treeHash: source.treeHash}), {code: 'CONFLICT'});
    assert.throws(() => api.restoreVaultBackup(f.backup, f.target, {operationId}), {code: 'DESTINATION_EXISTS'});
    fs.renameSync(f.target, `${f.target}-keep`); fs.cpSync(`${f.target}-keep`, f.target, {recursive: true});
    assert.throws(() => api.inspectVaultRestore(f.target, {operationId, backupId: source.backupId, treeHash: source.treeHash}), {code: 'CONFLICT'});
});

for (const host of ['codex', 'workbuddy']) test(`${host}: restore retires created, claimed and both waiting attempts while preserving source claims`, async t => {
    const f = fixture(t), {openLibrary} = await import('../../file-library/index.mjs'), source = openLibrary(f.binding.root);
    const claims = [];
    for (const status of ['created', 'claimed', 'waiting-user', 'waiting-permission']) {
        const task = source.mutateProduction('createTask', {kind: 'writing', host, title: status, prompt: '固定请求', tools: ['tikhub'], budget: {amount: 2, currency: 'REQ'}, expectedToken: source.readProduction().editToken}).tasks.at(-1);
        if (status === 'created') continue;
        const claim = {taskId: task.id, attemptId: task.activeAttemptId, workerId: 'source-worker', claimToken: randomUUID()};
        source.mutateProduction('claimTask', claim);
        if (status.startsWith('waiting-')) source.mutateProduction('progressTask', {...claim, status, progress: 10, message: '等待继续'});
        claims.push(claim);
    }
    const before = source.readProduction();
    api.backupVault(f.root, f.backup);
    const restored = api.restoreVaultBackup(f.backup, f.target), library = openLibrary(openVault(f.target).root), after = library.readProduction();
    assert.equal(restored.interruptedAttempts.length, 4);
    assert.equal(after.tasks.length, 4);
    assert.ok(after.tasks.every(task => task.attempts[0].status === 'cancelled' && task.attempts[0].claimToken === null));
    for (const claim of claims) assert.throws(() => library.mutateProduction('progressTask', {...claim, status: 'claimed', progress: 90, message: '旧位置迟到回写'}), {code: 'ATTEMPT_INACTIVE'});
    assert.deepEqual(source.readProduction().tasks, before.tasks);
});

test('source mutation at completion publication cannot leave a successful backup seal', t => {
    const f = fixture(t), original = fs.writeFileSync; let changed = false;
    fs.writeFileSync = function(filename, data, ...args) {
        const result = original.call(this, filename, data, ...args);
        if (!changed && Buffer.isBuffer(data) && data.includes(Buffer.from('nova-knowledge-vault-backup-complete'))) {
            changed = true; original(path.join(f.root, 'AGENTS.md'), '完成边界外部新稿');
        }
        return result;
    };
    try { assert.throws(() => api.backupVault(f.root, f.backup), {code: 'SOURCE_CHANGED'}); }
    finally { fs.writeFileSync = original; }
    assert.equal(changed, true);
    assert.throws(() => api.verifyVaultBackup(f.backup));
});

for (const [name, owner] of [['foreign', JSON.stringify({pid: 12345678, host: 'old-machine-not-this-one'})], ['partial', '{"pid":'], ['unknown', null]]) test(`machine mutation lock ${name} stays at source and cannot block restored or migrated editing`, t => {
    const f = fixture(t), lock = path.join(f.root, '.workbench/mutation-lock'); fs.mkdirSync(lock);
    if (owner !== null) fs.writeFileSync(path.join(lock, 'owner.json'), owner);
    const saved = api.backupVault(f.root, f.backup);
    api.restoreVaultBackup(f.backup, f.target);
    const restored = openVault(f.target);
    assert.equal(createVaultDocument(restored.root, {section: 'drafts', title: '恢复后', text: '可继续编辑'}, {mutationId: randomUUID()}).text, '可继续编辑');
    assert.ok(saved.manifest.excludedPaths.includes('.workbench/mutation-lock'));
    assert.equal(fs.existsSync(path.join(f.backup, 'data/.workbench/mutation-lock')), false);
    const migration = path.join(f.parent, 'migrated'); api.migrateVault(f.root, migration);
    assert.equal(createVaultDocument(openVault(migration).root, {section: 'drafts', title: '迁移后', text: '可继续编辑'}, {mutationId: randomUUID()}).text, '可继续编辑');
    assert.ok(fs.statSync(lock).isDirectory());
    if (owner !== null) assert.equal(fs.readFileSync(path.join(lock, 'owner.json'), 'utf8'), owner);
    else assert.equal(fs.readdirSync(lock).length, 0);
});

for (const [name, actual, alias] of [['case', 'vault', 'VAULT'], ['unicode', 'café-vault', 'cafe\u0301-vault']]) test(`${name} filesystem alias cannot create backup inside original Vault`, t => {
    const f = fixture(t); let root = f.root;
    if (actual !== 'vault') { root = path.join(f.parent, actual); fs.mkdirSync(root); createVault(root); }
    const aliasRoot = path.join(f.parent, alias);
    if (!fs.existsSync(aliasRoot) || fs.statSync(aliasRoot).ino !== fs.statSync(root).ino) { t.skip('filesystem does not expose this directory alias'); return; }
    const destination = path.join(aliasRoot, 'forbidden-backup');
    assert.throws(() => api.backupVault(root, destination), {code: 'UNSAFE_PATH'});
    assert.equal(fs.existsSync(path.join(root, 'forbidden-backup')), false, 'boundary rejection must precede any mkdir');
});


test('earlier full Vault package with a machine lock still verifies and restores to an editable independent copy', t => {
    const f = fixture(t); api.backupVault(f.root, f.backup);
    const digest = value => createHash('sha256').update(value).digest('hex');
    const data = path.join(f.backup, 'data'), lock = path.join(data, '.workbench/mutation-lock'); fs.mkdirSync(lock);
    const owner = Buffer.from(JSON.stringify({host: 'earlier-machine', pid: 12345678})); fs.writeFileSync(path.join(lock, 'owner.json'), owner);
    const rows = fs.readFileSync(path.join(f.backup, 'entries.ndjson'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
    rows.push({path: '.workbench/mutation-lock', type: 'directory'}, {path: '.workbench/mutation-lock/owner.json', type: 'file', bytes: owner.length, sha256: digest(owner)});
    rows.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    const entries = Buffer.from(rows.map(row => JSON.stringify(row) + '\n').join(''));
    fs.writeFileSync(path.join(f.backup, 'entries.ndjson'), entries);
    const manifest = JSON.parse(fs.readFileSync(path.join(f.backup, 'manifest.json')));
    manifest.excludedPaths = ['.workbench/runtime/系统（别动）/库锁']; manifest.entriesHash = digest(entries);
    manifest.counts.files++; manifest.counts.directories++; manifest.counts.bytes += owner.length;
    const manifestBytes = Buffer.from(JSON.stringify(manifest) + '\n'); fs.writeFileSync(path.join(f.backup, 'manifest.json'), manifestBytes);
    const seal = JSON.parse(fs.readFileSync(path.join(f.backup, 'COMPLETE.json')));
    fs.writeFileSync(path.join(f.backup, 'COMPLETE.json'), JSON.stringify({...seal, manifestHash: digest(manifestBytes), entriesHash: manifest.entriesHash}) + '\n');
    assert.equal(api.verifyVaultBackup(f.backup).verified, true);
    assert.equal(api.restoreVaultBackup(f.backup, f.target).outcome, 'committed');
    assert.equal(fs.existsSync(path.join(f.target, '.workbench/mutation-lock')), false);
    assert.equal(createVaultDocument(openVault(f.target).root, {section: 'drafts', title: '兼容恢复', text: '仍可编辑'}, {mutationId: randomUUID()}).text, '仍可编辑');
    assert.deepEqual(fs.readFileSync(path.join(lock, 'owner.json')), owner);
});
