import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {backupLibrary, verifyBackup, restoreBackup} from '../../../plugin-src/src/lib/file-library/index.mjs';
import {isRecord} from '../shared/contracts.ts';
import {exact, fail, libraryBinding} from '../shared/validation.ts';
import {maintenancePending} from '../shared/maintenance-validation.ts';
import type {LibraryBinding, RootIdentity} from '../shared/contracts.ts';
import type {BackupIdentity, MaintenancePending, MaintenanceReceipt, MaintenanceWorkerOperations} from '../shared/maintenance-contracts.ts';

const operations = ['inspectMaintenanceLibrary', 'inspectLibraryBackup', 'runMaintenance', 'queryMaintenance'] as const;
export function isMaintenanceOperation(op: unknown): op is keyof MaintenanceWorkerOperations { return typeof op === 'string' && operations.some(item => item === op); }
const absolute = (v: unknown): v is string => typeof v === 'string' && v.length <= 32_768 && path.isAbsolute(v) && !v.includes('\0');
const sameIdentity = (a: RootIdentity, b: RootIdentity) => a.dev === b.dev && a.ino === b.ino;

function safeStat(filename: string) {
    const resolved = path.resolve(filename);
    let cursor = path.parse(resolved).root;
    for (const part of resolved.slice(cursor.length).split(path.sep).filter(Boolean)) {
        cursor = path.join(cursor, part);
        if (fs.lstatSync(cursor).isSymbolicLink()) fail('UNSAFE_PATH', '所选位置包含链接，请选择真实文件夹。');
    }
    return fs.lstatSync(resolved, {bigint: true});
}
function directoryIdentity(directory: string): RootIdentity {
    const stat = safeStat(directory);
    if (!stat.isDirectory()) fail('UNSAFE_PATH', '请选择真实文件夹。');
    return {dev: stat.dev.toString(), ino: stat.ino.toString()};
}
function boundedJSON(filename: string) {
    const before = safeStat(filename);
    if (!before.isFile() || before.size > 65_536n) fail('CORRUPT', '维护元数据无效或超过大小限制。');
    const fd = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    try {
        const data = Buffer.alloc(65_537);
        let size = 0;
        for (;;) {
            const count = fs.readSync(fd, data, size, data.length - size, null);
            size += count;
            if (size > 65_536) fail('CORRUPT', '维护元数据超过大小限制。');
            if (!count) break;
        }
        const opened = fs.fstatSync(fd, {bigint: true}), after = safeStat(filename);
        if (['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].some(key => before[key as keyof typeof before] !== opened[key as keyof typeof opened] || opened[key as keyof typeof opened] !== after[key as keyof typeof after]) || BigInt(size) !== after.size) fail('SOURCE_CHANGED', '维护元数据在读取时改变。');
        const bytes = data.subarray(0, size);
        let value: unknown;
        try { value = JSON.parse(bytes.toString('utf8')); } catch { fail('CORRUPT', '维护元数据无法读取。'); }
        return {value, hash: createHash('sha256').update(bytes).digest('hex')};
    } finally { fs.closeSync(fd); }
}
function boundDescriptor(binding: LibraryBinding) {
    if (!sameIdentity(directoryIdentity(binding.root), binding.rootIdentity)) fail('CONFLICT', '内容库文件夹已被替换，请重新打开后操作。');
    const descriptor = boundedJSON(path.join(binding.root, '内容库.json'));
    if (!isRecord(descriptor.value) || descriptor.value.libraryId !== binding.libraryId || ![4, 5].includes(descriptor.value.schemaVersion as number)) fail('CONFLICT', '内容库身份已改变。');
    if (!sameIdentity(directoryIdentity(binding.root), binding.rootIdentity)) fail('SOURCE_CHANGED', '内容库文件夹在核验时改变。');
    return descriptor;
}
function inspectBackup(source: string) {
    const rootIdentity = directoryIdentity(source), result = verifyBackup(source);
    const descriptorHash = boundedJSON(path.join(source, 'data', '内容库.json')).hash;
    if (!sameIdentity(rootIdentity, directoryIdentity(source))) fail('SOURCE_CHANGED', '备份文件夹在核验时改变。');
    return {backup: {source, rootIdentity, backupId: result.backupId, libraryId: result.libraryId, treeHash: result.treeHash, descriptorHash}, counts: result.counts, manifest: result.manifest};
}
function checkedBackup(expected: BackupIdentity) {
    const result = inspectBackup(expected.source);
    if (!sameIdentity(result.backup.rootIdentity, expected.rootIdentity) || ['backupId', 'libraryId', 'treeHash', 'descriptorHash'].some(key => result.backup[key as keyof BackupIdentity] !== expected[key as keyof BackupIdentity])) fail('SOURCE_CHANGED', '已选择的备份被更改或替换，请保留现场并重新选择。');
    return result;
}
function checkedParent(pending: MaintenancePending) {
    if (!sameIdentity(directoryIdentity(path.dirname(pending.destination)), pending.parentIdentity)) fail('SOURCE_CHANGED', '目标父文件夹已被替换，维护操作已停止。');
    const source = pending.kind === 'backup' ? pending.binding.root : pending.backup.source;
    const relative = path.relative(path.resolve(source), path.resolve(pending.destination));
    if (!relative || !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)) fail('UNSAFE_PATH', '新文件夹必须位于来源文件夹之外。');
}
function receipt(pending: MaintenancePending, counts: MaintenanceReceipt['counts'], recovered: boolean, upgradeRequired = false, interruptedAttempts = 0): MaintenanceReceipt {
    return {kind: pending.kind, destinationName: path.basename(pending.destination), counts, recovered, upgradeRequired, interruptedAttempts};
}
function query(pending: MaintenancePending): MaintenanceReceipt {
    checkedParent(pending);
    if (pending.kind === 'backup') {
        const found = inspectBackup(pending.destination);
        if (found.backup.libraryId !== pending.binding.libraryId || found.backup.descriptorHash !== pending.descriptorHash || found.manifest.startedAt < pending.startedAt) fail('CONFLICT', '完整备份与本次固定的内容库身份不一致。');
        checkedParent(pending);
        return receipt(pending, found.counts, true);
    }
    const source = checkedBackup(pending.backup), identity = directoryIdentity(pending.destination);
    const descriptor = boundedJSON(path.join(pending.destination, '内容库.json'));
    if (descriptor.hash !== pending.backup.descriptorHash || !isRecord(descriptor.value) || descriptor.value.libraryId !== pending.backup.libraryId) fail('BACKUP_INCOMPLETE', '恢复结果缺少完整的内容库身份；请保留文件并另选新目标。');
    const provenance = path.join(pending.destination, '系统（别动）', '恢复来源');
    directoryIdentity(provenance);
    let interruptedAttempts: number | null = null;
    for (const entry of fs.readdirSync(provenance)) {
        if (!/^[0-9a-f-]{36}\.json$/.test(entry)) fail('CORRUPT', '恢复来源记录无效。');
        const {value} = boundedJSON(path.join(provenance, entry));
        if (!isRecord(value) || value.format !== 'nova-content-library-restore' || value.schemaVersion !== 1) fail('CORRUPT', '恢复来源记录无效。');
        if (value.backupId === pending.backup.backupId && value.treeHash === pending.backup.treeHash && value.libraryId === pending.backup.libraryId && typeof value.restoredAt === 'string' && value.restoredAt >= pending.startedAt && Array.isArray(value.interruptedAttempts)) interruptedAttempts = value.interruptedAttempts.length;
    }
    if (interruptedAttempts === null) fail('BACKUP_INCOMPLETE', '尚未找到本次完整恢复的记录；请保留文件并另选新目标。');
    if (!sameIdentity(identity, directoryIdentity(pending.destination))) fail('SOURCE_CHANGED', '恢复结果文件夹已被替换。');
    checkedParent(pending);
    return receipt(pending, source.counts, true, descriptor.value.schemaVersion !== 5, interruptedAttempts);
}

export function executeMaintenance(op: keyof MaintenanceWorkerOperations, raw: unknown): MaintenanceWorkerOperations[keyof MaintenanceWorkerOperations]['result'] {
    if (op === 'inspectMaintenanceLibrary') {
        if (!exact(raw, ['binding']) || !libraryBinding(raw.binding) || !absolute(raw.binding.root)) fail('INVALID_INPUT', '内容库维护参数无效。');
        return {descriptorHash: boundDescriptor(raw.binding).hash};
    }
    if (op === 'inspectLibraryBackup') {
        if (!exact(raw, ['source']) || !absolute(raw.source)) fail('INVALID_INPUT', '备份核验参数无效。');
        const found = inspectBackup(raw.source);
        return {backup: found.backup, counts: found.counts};
    }
    if (!exact(raw, ['pending']) || !maintenancePending(raw.pending) || !absolute(raw.pending.destination) || !(raw.pending.kind === 'backup' ? absolute(raw.pending.binding.root) : absolute(raw.pending.backup.source))) fail('INVALID_INPUT', '维护任务参数无效。');
    const pending = raw.pending;
    if (op === 'queryMaintenance') return query(pending);
    checkedParent(pending);
    if (pending.kind === 'backup') {
        if (boundDescriptor(pending.binding).hash !== pending.descriptorHash) fail('SOURCE_CHANGED', '内容库身份在准备备份后改变。');
        const result = backupLibrary(pending.binding.root, pending.destination);
        boundDescriptor(pending.binding);
        if (result.libraryId !== pending.binding.libraryId) fail('CONFLICT', '备份结果属于其他内容库。');
        return {...query(pending), recovered: false};
    }
    checkedBackup(pending.backup);
    restoreBackup(pending.backup.source, pending.destination);
    return {...query(pending), recovered: false};
}
