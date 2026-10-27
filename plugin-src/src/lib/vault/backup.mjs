import fs from 'node:fs';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {prepareRestoredLibrary, openLibrary} from '../file-library/index.mjs';
import {fail} from './core.mjs';
import {openVault} from './index.mjs';

export const VAULT_BACKUP_FORMAT = 'nova-knowledge-vault-backup';
export const VAULT_COPY_FORMAT = 'nova-knowledge-vault-copy';
// Everything else, including projection/mutation journals, skills and user directories, is durable.
const LEGACY_EXCLUDED = ['.workbench/runtime/系统（别动）/库锁'];
const EXCLUDED = [...LEGACY_EXCLUDED, '.workbench/mutation-lock'];
const DESCRIPTOR = '.workbench/vault.json', RUNTIME = '.workbench/runtime';
const HASH = /^[a-f0-9]{64}$/, UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const bytes = value => Buffer.from(`${JSON.stringify(value)}\n`);
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const fingerprint = stat => ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].map(k => String(stat[k])).join(':');
const validIdentity = v => exact(v, ['dev', 'ino']) && typeof v.dev === 'string' && /^\d+$/.test(v.dev) && typeof v.ino === 'string' && /^\d+$/.test(v.ino);
const sameIdentity = (a, b) => a?.dev === b?.dev && a?.ino === b?.ino;
const excluded = relative => EXCLUDED.some(p => relative === p || relative.startsWith(`${p}/`));
const exact = (v, keys) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).sort().join(',') === [...keys].sort().join(',');

function safeStat(filename) {
    if (typeof filename !== 'string' || !path.isAbsolute(filename) || filename.includes('\0')) fail('UNSAFE_PATH', '维护路径必须为绝对路径');
    const root = path.parse(filename).root;
    let current = root;
    for (const name of path.resolve(filename).slice(root.length).split(path.sep).filter(Boolean)) {
        current = path.join(current, name);
        if (fs.lstatSync(current).isSymbolicLink()) fail('UNSAFE_PATH', '完整知识库维护拒绝符号链接');
    }
    return fs.lstatSync(filename, {bigint: true});
}
function identity(directory) {
    const stat = safeStat(directory);
    if (!stat.isDirectory()) fail('UNSAFE_PATH', '维护路径必须为真实文件夹');
    return {dev: String(stat.dev), ino: String(stat.ino)};
}
function portable(relative) {
    if (typeof relative !== 'string' || !relative || relative.length > 8192 || /[\\:<>"|?*\x00-\x1f\x7f]/.test(relative)) fail('UNSAFE_PATH', '知识文件路径不能安全跨平台复制');
    for (const part of relative.split('/')) if (!part || part === '.' || part === '..' || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(part)) fail('UNSAFE_PATH', '知识文件路径不能安全跨平台复制');
    return relative;
}
const member = (root, relative) => path.join(root, ...portable(relative).split('/'));
function scan(root, omit = () => false) {
    const rootIdentity = identity(root), entries = [], collisions = new Set();
    function walk(directory, prefix = '') {
        const before = safeStat(directory);
        for (const name of fs.readdirSync(directory).sort(compare)) {
            const relative = prefix ? `${prefix}/${name}` : name;
            // Check even excluded entries: an excluded lock must never hide a link.
            const target = member(root, relative), stat = safeStat(target);
            if (!stat.isDirectory() && !stat.isFile()) fail('UNSAFE_PATH', '知识库只接受普通目录与文件');
            if (omit(relative)) continue;
            const normalized = relative.normalize('NFC').toLocaleLowerCase('en-US');
            if (collisions.has(normalized)) fail('UNSAFE_PATH', '知识文件存在大小写或Unicode路径冲突');
            collisions.add(normalized);
            const entry = {path: relative, type: stat.isDirectory() ? 'directory' : 'file', fingerprint: fingerprint(stat)};
            if (stat.isFile()) {
                entry.bytes = Number(stat.size);
                if (!Number.isSafeInteger(entry.bytes)) fail('CORRUPT', '知识文件超过可核验大小');
            }
            entries.push(entry);
            if (stat.isDirectory()) walk(target, relative);
        }
        if (fingerprint(before) !== fingerprint(safeStat(directory))) fail('SOURCE_CHANGED', '知识目录在枚举时变化');
    }
    walk(root);
    if (!sameIdentity(rootIdentity, identity(root))) fail('SOURCE_CHANGED', '知识库根在读取时被替换');
    return entries.sort((a, b) => compare(a.path, b.path));
}
function sameInventory(before, after) {
    if (before.length !== after.length || before.some((entry, i) => entry.path !== after[i].path || entry.type !== after[i].type || entry.fingerprint !== after[i].fingerprint)) fail('SOURCE_CHANGED', '知识树在复制或核验时变化');
}
function file(filename, expected, destination) {
    const before = safeStat(filename);
    if (!before.isFile() || fingerprint(before) !== expected.fingerprint) fail('SOURCE_CHANGED', '知识文件在读取前变化');
    const fd = fs.openSync(filename, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0) | fs.constants.O_NONBLOCK);
    let out;
    try {
        if (fingerprint(fs.fstatSync(fd, {bigint: true})) !== fingerprint(before)) fail('SOURCE_CHANGED', '知识文件在打开时被替换');
        if (destination) { identity(path.dirname(destination)); out = fs.openSync(destination, 'wx', 0o600); }
        const digest = createHash('sha256'), chunk = Buffer.alloc(128 * 1024);
        let size = 0;
        for (;;) {
            const count = fs.readSync(fd, chunk, 0, chunk.length, null);
            if (!count) break;
            digest.update(chunk.subarray(0, count)); size += count;
            if (size > expected.bytes) fail('SOURCE_CHANGED', '知识文件在复制时增长');
            if (out !== undefined) {
                let offset = 0;
                while (offset < count) { const n = fs.writeSync(out, chunk, offset, count - offset); if (!n) fail('IO_ERROR', '复制写入未取得进展'); offset += n; }
            }
        }
        if (out !== undefined) fs.fsyncSync(out);
        if (fingerprint(before) !== fingerprint(fs.fstatSync(fd, {bigint: true})) || fingerprint(before) !== fingerprint(safeStat(filename)) || BigInt(size) !== before.size) fail('SOURCE_CHANGED', '知识文件在复制时变化');
        return {bytes: size, sha256: digest.digest('hex')};
    } finally { if (out !== undefined) fs.closeSync(out); fs.closeSync(fd); }
}
function sync(directory) {
    if (process.platform === 'win32') return;
    const fd = fs.openSync(directory, 'r'); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}
function writeNew(filename, data) {
    identity(path.dirname(filename));
    const fd = fs.openSync(filename, 'wx', 0o600);
    try { fs.writeFileSync(fd, data); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    sync(path.dirname(filename));
}
function replaceJSON(filename, value) {
    safeStat(filename);
    const temporary = `${filename}.${randomUUID()}.tmp`;
    writeNew(temporary, bytes(value)); fs.renameSync(temporary, filename); sync(path.dirname(filename));
}
function stableBytes(filename, limit) {
    const before = safeStat(filename);
    if (!before.isFile() || before.size > BigInt(limit)) fail('CORRUPT', '维护元数据无效或过大');
    const fd = fs.openSync(filename, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0) | fs.constants.O_NONBLOCK);
    try {
        if (fingerprint(before) !== fingerprint(fs.fstatSync(fd, {bigint: true}))) fail('SOURCE_CHANGED', '维护元数据在打开时被替换');
        const data = Buffer.alloc(Number(before.size) + 1); let size = 0;
        for (;;) {
            const count = fs.readSync(fd, data, size, data.length - size, null);
            size += count;
            if (size > Number(before.size)) fail('SOURCE_CHANGED', '维护元数据在读取时增长');
            if (!count) break;
        }
        if (BigInt(size) !== before.size || fingerprint(before) !== fingerprint(fs.fstatSync(fd, {bigint: true})) || fingerprint(before) !== fingerprint(safeStat(filename))) fail('SOURCE_CHANGED', '维护元数据在读取时变化');
        return data.subarray(0, size);
    } finally { fs.closeSync(fd); }
}
function small(filename, limit = 65536) {
    const data = stableBytes(filename, limit);
    try { return {value: JSON.parse(data), hash: hash(data)}; } catch { fail('CORRUPT', '维护元数据格式错误'); }
}
function metadata(root, bound = false) {
    const rootIdentity = identity(root), descriptor = small(member(root, DESCRIPTOR)), runtime = small(member(root, `${RUNTIME}/内容库.json`));
    const d = descriptor.value, r = runtime.value, marker = small(member(root, `${RUNTIME}/vault-binding.json`)).value;
    if (d?.format !== 'nova-knowledge-vault' || d.schemaVersion !== 1 || !UUID.test(d.vaultId) || !validIdentity(d.rootIdentity) || r?.format !== 'nova-content-library' || r.schemaVersion !== 5 || !UUID.test(r.libraryId) || marker?.format !== 'nova-vault-runtime' || marker.vaultId !== d.vaultId || typeof marker.vaultRoot !== 'string' || !(path.posix.isAbsolute(marker.vaultRoot) || path.win32.isAbsolute(marker.vaultRoot)) || !validIdentity(marker.rootIdentity) || !sameIdentity(marker.rootIdentity, d.rootIdentity)) fail('CORRUPT', '知识库及运行库身份描述无效');
    if (bound && (!sameIdentity(d.rootIdentity, rootIdentity) || marker.vaultRoot !== root)) fail('CONFLICT', '知识库位置已改变，请使用明确的迁移恢复入口');
    if (!sameIdentity(rootIdentity, identity(root))) fail('SOURCE_CHANGED', '知识库根身份变化');
    return {root, rootIdentity, runtimeIdentity: identity(member(root, RUNTIME)), vaultId: d.vaultId, libraryId: r.libraryId, descriptorHash: runtime.hash, vaultDescriptorHash: descriptor.hash};
}
function parent(destination, source) {
    if (typeof destination !== 'string' || !path.isAbsolute(destination)) fail('INVALID_INPUT', '请明确选择新的目标位置');
    destination = path.resolve(destination); portable(path.basename(destination));
    const relative = path.relative(source, destination);
    if (!relative || relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) fail('UNSAFE_PATH', '目标必须位于整个知识库或备份之外');
    const root = path.dirname(destination), expected = identity(root), sourceIdentity = identity(source);
    function outsideSource() {
        // Directory identity is authoritative on case-insensitive and normalization-insensitive filesystems.
        // Check all existing target ancestors before the first mkdir, and again at write boundaries.
        for (let cursor = root;; cursor = path.dirname(cursor)) {
            if (sameIdentity(identity(cursor), sourceIdentity)) fail('UNSAFE_PATH', '目标真实祖先位于来源知识库或备份内');
            if (path.dirname(cursor) === cursor) break;
        }
    }
    outsideSource();
    try { fs.lstatSync(destination); fail('DESTINATION_EXISTS', '目标已存在，保留原文件并选择新位置'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    return {destination, check() {
        if (!sameIdentity(expected, identity(root))) fail('SOURCE_CHANGED', '目标父目录被替换');
        outsideSource();
    }};
}
function copy(source, target, inventory, check = () => {}) {
    for (const entry of inventory.filter(e => e.type === 'directory').sort((a, b) => a.path.split('/').length - b.path.split('/').length || compare(a.path, b.path))) {
        check(); identity(path.dirname(member(target, entry.path))); fs.mkdirSync(member(target, entry.path), {mode: 0o700}); check();
    }
    const entries = inventory.map(entry => {
        check();
        const copied = entry.type === 'directory' ? {path: entry.path, type: entry.type} : {path: entry.path, type: entry.type, ...file(member(source, entry.path), entry, member(target, entry.path))};
        check(); return copied;
    });
    for (const entry of [...inventory].reverse()) if (entry.type === 'directory') sync(member(target, entry.path));
    sync(target);
    return entries;
}
function digests(root, inventory) { return inventory.map(e => e.type === 'directory' ? {path: e.path, type: e.type} : {path: e.path, type: e.type, ...file(member(root, e.path), e)}); }
const entriesBytes = entries => Buffer.from(entries.map(e => JSON.stringify(e) + '\n').join(''));
function assertTree(root, expected, omit = () => false, mismatchCode = 'SOURCE_CHANGED') {
    const inventory = scan(root, omit), actual = digests(root, inventory);
    if (!entriesBytes(actual).equals(entriesBytes(expected))) fail(mismatchCode, '知识文件完整树或SHA256校验不一致');
    sameInventory(inventory, scan(root, omit));
    return inventory;
}
function counts(entries) {
    const value = {files: 0, directories: 0, bytes: 0};
    for (const entry of entries) if (entry.type === 'file') { value.files++; value.bytes += entry.bytes; } else value.directories++;
    if (!Number.isSafeInteger(value.bytes)) fail('CORRUPT', '知识库总大小超过支持范围');
    return value;
}
function readEntries(filename) {
    const data = stableBytes(filename, 256 * 1024 * 1024), entries = [], seen = new Set(); let previous = '';
    if (data.length && data[data.length - 1] !== 10) fail('CORRUPT', '备份清单未完整结束');
    for (const line of data.toString('utf8').split('\n').slice(0, -1)) {
        let entry; try { entry = JSON.parse(line); } catch { fail('CORRUPT', '备份清单格式错误'); }
        portable(entry?.path);
        const key = entry.path.normalize('NFC').toLocaleLowerCase('en-US');
        if (entry.path <= previous || seen.has(key) || !['file', 'directory'].includes(entry.type) || !exact(entry, entry.type === 'file' ? ['path', 'type', 'bytes', 'sha256'] : ['path', 'type']) || entry.type === 'file' && (!Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || !HASH.test(entry.sha256)) || JSON.stringify(entry) !== line) fail('CORRUPT', '备份清单条目无效');
        previous = entry.path; seen.add(key); entries.push(entry);
    }
    return {entries, hash: hash(data)};
}

export function inspectVaultCopy(root) {
    root = path.resolve(root);
    const before = metadata(root), inventory = scan(root, excluded), entries = digests(root, inventory);
    assertTree(root, entries, excluded); sameInventory(inventory, scan(root, excluded));
    if (JSON.stringify(before) !== JSON.stringify(metadata(root))) fail('SOURCE_CHANGED', '迁移来源在读取时变化');
    return {...before, format: VAULT_COPY_FORMAT, backupId: before.vaultId, treeHash: hash(entriesBytes(entries)), counts: counts(entries), entries};
}
export function backupVault(root, destination, options = {}) {
    root = path.resolve(root);
    if (options.operationId !== undefined && !UUID.test(options.operationId)) fail('INVALID_INPUT', '备份操作标识无效');
    const source = metadata(root, true), binding = parent(destination, root);
    if (options.expectedLibraryId && options.expectedLibraryId !== source.libraryId || options.expectedRootIdentity && !sameIdentity(options.expectedRootIdentity, source.rootIdentity) || options.expectedDescriptorHash && options.expectedDescriptorHash !== source.descriptorHash || options.expectedVaultDescriptorHash && options.expectedVaultDescriptorHash !== source.vaultDescriptorHash || options.expectedRuntimeIdentity && !sameIdentity(options.expectedRuntimeIdentity, source.runtimeIdentity)) fail('CONFLICT', '知识库与固定备份来源身份不一致');
    const inventory = scan(root, excluded);
    binding.check(); fs.mkdirSync(binding.destination, {mode: 0o700});
    const targetIdentity = identity(binding.destination), data = path.join(binding.destination, 'data'); fs.mkdirSync(data, {mode: 0o700});
    const check = () => { binding.check(); if (!sameIdentity(source.rootIdentity, identity(root)) || !sameIdentity(targetIdentity, identity(binding.destination))) fail('SOURCE_CHANGED', '知识库或备份根在复制时被替换'); };
    const startedAt = new Date().toISOString(), entries = copy(root, data, inventory, check);
    assertTree(data, entries); assertTree(root, entries, excluded); sameInventory(inventory, scan(root, excluded));
    const entriesHash = hash(entriesBytes(entries)), manifest = {format: VAULT_BACKUP_FORMAT, schemaVersion: 1, backupId: randomUUID(), operationId: options.operationId ?? randomUUID(), source: {vaultId: source.vaultId, libraryId: source.libraryId, schemaVersion: 1, rootIdentity: source.rootIdentity, runtimeIdentity: source.runtimeIdentity, vaultDescriptorHash: source.vaultDescriptorHash}, startedAt, completedAt: new Date().toISOString(), consistency: 'stable-verified-copy', excludedPaths: EXCLUDED, entriesHash, counts: counts(entries)};
    writeNew(path.join(binding.destination, 'entries.ndjson'), entriesBytes(entries));
    writeNew(path.join(binding.destination, 'manifest.json'), bytes(manifest));
    // Completion is published only after destination, source and pinned roots all match again.
    assertTree(root, entries, excluded); sameInventory(inventory, scan(root, excluded)); assertTree(data, entries);
    if (JSON.stringify(source) !== JSON.stringify(metadata(root, true)) || !sameIdentity(targetIdentity, identity(binding.destination))) fail('SOURCE_CHANGED', '知识库在备份完成边界变化');
    binding.check();
    writeNew(path.join(binding.destination, 'COMPLETE.json'), bytes({format: 'nova-knowledge-vault-backup-complete', schemaVersion: 1, backupId: manifest.backupId, manifestHash: hash(bytes(manifest)), entriesHash}));
    try {
        check(); assertTree(root, entries, excluded); sameInventory(inventory, scan(root, excluded)); verifyVaultBackup(binding.destination); check();
    } catch (error) {
        // Preserve the copied evidence but make this failed completion unambiguously unverifiable.
        if (sameIdentity(targetIdentity, identity(binding.destination))) writeNew(path.join(binding.destination, `INCOMPLETE-${randomUUID()}.json`), bytes({format: 'nova-vault-backup-incomplete', backupId: manifest.backupId, reason: error.code ?? 'IO_ERROR'}));
        throw error;
    }
    sync(path.dirname(binding.destination));
    return {backupDir: binding.destination, backupId: manifest.backupId, libraryId: source.libraryId, treeHash: entriesHash, manifest, counts: manifest.counts, outcome: 'committed'};
}
export function verifyVaultBackup(root) {
    root = path.resolve(root);
    const before = scan(root), descriptor = small(path.join(root, 'manifest.json')), manifest = descriptor.value, seal = small(path.join(root, 'COMPLETE.json')).value;
    if (!exact(manifest, ['format', 'schemaVersion', 'backupId', 'operationId', 'source', 'startedAt', 'completedAt', 'consistency', 'excludedPaths', 'entriesHash', 'counts']) || manifest.format !== VAULT_BACKUP_FORMAT || manifest.schemaVersion !== 1 || !UUID.test(manifest.backupId) || !UUID.test(manifest.operationId) || !exact(manifest.source, ['vaultId', 'libraryId', 'schemaVersion', 'rootIdentity', 'runtimeIdentity', 'vaultDescriptorHash']) || !UUID.test(manifest.source.vaultId) || !UUID.test(manifest.source.libraryId) || manifest.source.schemaVersion !== 1 || !validIdentity(manifest.source.rootIdentity) || !validIdentity(manifest.source.runtimeIdentity) || !HASH.test(manifest.source.vaultDescriptorHash) || manifest.consistency !== 'stable-verified-copy' || ![EXCLUDED, LEGACY_EXCLUDED].some(paths => JSON.stringify(manifest.excludedPaths) === JSON.stringify(paths)) || !HASH.test(manifest.entriesHash)) fail('FORMAT_UNSUPPORTED', '此文件夹不是支持的完整知识库备份');
    for (const field of ['startedAt', 'completedAt']) { const date = new Date(manifest[field]); if (!Number.isFinite(date.getTime()) || date.toISOString() !== manifest[field]) fail('CORRUPT', '备份时间无效'); }
    if (manifest.completedAt < manifest.startedAt || !exact(seal, ['format', 'schemaVersion', 'backupId', 'manifestHash', 'entriesHash']) || seal.format !== 'nova-knowledge-vault-backup-complete' || seal.schemaVersion !== 1 || seal.backupId !== manifest.backupId || seal.manifestHash !== descriptor.hash || seal.entriesHash !== manifest.entriesHash) fail('CORRUPT', '完整知识库备份完成凭据不匹配');
    const top = fs.readdirSync(root).sort().join(',');
    if (top !== ['COMPLETE.json', 'data', 'entries.ndjson', 'manifest.json'].sort().join(',')) fail('CORRUPT', '完整知识库备份存在额外或缺失文件');
    const listed = readEntries(path.join(root, 'entries.ndjson'));
    if (listed.hash !== manifest.entriesHash || listed.entries.some(e => manifest.excludedPaths.some(p => e.path === p || e.path.startsWith(`${p}/`)))) fail('CORRUPT', '备份清单校验不一致');
    const data = path.join(root, 'data'); assertTree(data, listed.entries, () => false, 'CORRUPT');
    const value = metadata(data);
    if (value.vaultId !== manifest.source.vaultId || value.libraryId !== manifest.source.libraryId || value.vaultDescriptorHash !== manifest.source.vaultDescriptorHash || !sameIdentity(manifest.source.rootIdentity, small(member(data, DESCRIPTOR)).value.rootIdentity) || JSON.stringify(counts(listed.entries)) !== JSON.stringify(manifest.counts)) fail('CORRUPT', '备份来源身份或计数不一致');
    sameInventory(before, scan(root));
    return {backupDir: root, backupId: manifest.backupId, libraryId: value.libraryId, vaultId: value.vaultId, descriptorHash: value.descriptorHash, treeHash: manifest.entriesHash, manifest, counts: manifest.counts, entries: listed.entries, verified: true};
}
function restore(sourceRoot, destination, verified, options, checkSource) {
    const binding = parent(destination, sourceRoot), operationId = options.operationId ?? randomUUID();
    if (!UUID.test(operationId)) fail('INVALID_INPUT', '恢复操作标识无效');
    if (options.expectedTreeHash && options.expectedTreeHash !== verified.treeHash) fail('SOURCE_CHANGED', '恢复来源与固定清单不一致');
    const source = verified.format === VAULT_COPY_FORMAT ? sourceRoot : path.join(sourceRoot, 'data');
    // Earlier full packages may contain machine locks. Verify their original tree, but never restore those locks.
    const expectedEntries = verified.entries.filter(entry => !excluded(entry.path));
    const sourceIdentity = identity(sourceRoot), inventory = scan(source, excluded);
    binding.check(); fs.mkdirSync(binding.destination, {mode: 0o700});
    const root = binding.destination, targetIdentity = identity(root);
    const check = () => { binding.check(); if (!sameIdentity(sourceIdentity, identity(sourceRoot)) || !sameIdentity(targetIdentity, identity(root))) fail('SOURCE_CHANGED', '恢复来源或目标根在复制时被替换'); };
    const copied = copy(source, root, inventory, check);
    if (!entriesBytes(copied).equals(entriesBytes(expectedEntries))) fail('SOURCE_CHANGED', '恢复复制与已核验来源不一致');
    assertTree(root, expectedEntries); assertTree(source, expectedEntries, excluded);
    const checked = checkSource();
    if (checked.backupId !== verified.backupId || checked.treeHash !== verified.treeHash || !sameIdentity(sourceIdentity, identity(sourceRoot))) fail('SOURCE_CHANGED', '恢复来源在复制时变化');
    binding.check();
    // Suppress the source-location bridge while the existing runtime recovery retires old claims.
    // This only changes the independent new target, never the backup or copied source.
    safeStat(member(root, `${RUNTIME}/vault-binding.json`));
    fs.unlinkSync(member(root, `${RUNTIME}/vault-binding.json`));
    const processing = prepareRestoredLibrary(member(root, RUNTIME), verified);
    const descriptor = small(member(root, DESCRIPTOR)).value;
    replaceJSON(member(root, DESCRIPTOR), {...descriptor, rootIdentity: targetIdentity});
    writeNew(member(root, `${RUNTIME}/vault-binding.json`), bytes({format: 'nova-vault-runtime', vaultRoot: root, vaultId: descriptor.vaultId, rootIdentity: targetIdentity}));
    const opened = openVault(root);
    // An actual read validates the new runtime and materialized source binding before publication.
    openLibrary(opened.root).readProduction();
    const provenance = member(root, '.workbench/restores');
    if (!fs.existsSync(provenance)) fs.mkdirSync(provenance, {mode: 0o700});
    identity(provenance);
    const base = `.workbench/restores/${operationId}`, omitted = p => p === `${base}.json` || p === `${base}.ndjson`;
    const finalInventory = scan(root, omitted), finalEntries = digests(root, finalInventory);
    assertTree(root, finalEntries, omitted); sameInventory(finalInventory, scan(root, omitted));
    const receipt = {format: 'nova-knowledge-vault-restore', schemaVersion: 1, operationId, backupId: verified.backupId, treeHash: verified.treeHash, libraryId: verified.libraryId, vaultId: descriptor.vaultId, rootIdentity: targetIdentity, runtimeIdentity: opened.rootIdentity, restoredAt: new Date().toISOString(), interruptedAttempts: processing.interruptedAttempts, resultHash: hash(entriesBytes(finalEntries)), counts: verified.counts};
    writeNew(member(root, `${base}.ndjson`), entriesBytes(finalEntries));
    binding.check(); if (!sameIdentity(targetIdentity, identity(root))) fail('SOURCE_CHANGED', '恢复目标在完成前被替换');
    writeNew(member(root, `${base}.json`), bytes(receipt)); sync(path.dirname(root));
    inspectVaultRestore(root, {operationId, backupId: verified.backupId, treeHash: verified.treeHash}); check();
    return {root, backupId: verified.backupId, libraryId: verified.libraryId, interruptedAttempts: processing.interruptedAttempts, upgradeRequired: false, outcome: 'committed', operationId};
}
export function restoreVaultBackup(source, destination, options = {}) {
    source = path.resolve(source);
    return restore(source, destination, verifyVaultBackup(source), options, () => verifyVaultBackup(source));
}
export function migrateVault(source, destination, options = {}) {
    source = path.resolve(source);
    return restore(source, destination, inspectVaultCopy(source), options, () => inspectVaultCopy(source));
}
export function inspectVaultRestore(root, expected) {
    root = path.resolve(root);
    if (!UUID.test(expected?.operationId)) fail('INVALID_INPUT', '恢复操作标识无效');
    const base = `.workbench/restores/${expected.operationId}`;
    if (!fs.existsSync(member(root, `${base}.json`))) fail('CONFLICT', '尚未找到本次恢复完成凭据');
    const record = small(member(root, `${base}.json`), 128 * 1024 * 1024).value;
    if (record?.format !== 'nova-knowledge-vault-restore' || record.schemaVersion !== 1 || record.operationId !== expected.operationId || record.backupId !== expected.backupId || record.treeHash !== expected.treeHash || !sameIdentity(record.rootIdentity, identity(root)) || !sameIdentity(record.runtimeIdentity, identity(member(root, RUNTIME)))) fail('CONFLICT', '恢复凭据与本次操作或目标身份不一致');
    const listed = readEntries(member(root, `${base}.ndjson`));
    if (listed.hash !== record.resultHash) fail('CORRUPT', '恢复完成清单校验不一致');
    assertTree(root, listed.entries, p => p === `${base}.json` || p === `${base}.ndjson`, 'CORRUPT');
    const current = metadata(root, true);
    if (current.libraryId !== record.libraryId || current.vaultId !== record.vaultId) fail('CONFLICT', '恢复内容库身份变化');
    return {root, ...record};
}
