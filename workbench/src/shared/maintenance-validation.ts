import {isRecord} from './contracts.ts';
import {exact, identity, libraryBinding, token, uuid} from './validation.ts';
import type {BackupIdentity, MaintenancePending} from './maintenance-contracts.ts';

const filePath = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 32_768 && !v.includes('\0');
const instant = (v: unknown): v is string => {
    if (typeof v !== 'string' || v.length > 30) return false;
    const date = new Date(v);
    return Number.isFinite(date.getTime()) && date.toISOString() === v;
};
export function backupIdentity(v: unknown): v is BackupIdentity {
    return exact(v, ['source', 'rootIdentity', 'backupId', 'libraryId', 'treeHash', 'descriptorHash']) && filePath(v.source) && identity(v.rootIdentity) && uuid(v.backupId) && uuid(v.libraryId) && token(v.treeHash) && token(v.descriptorHash);
}
export function maintenancePending(v: unknown): v is MaintenancePending {
    const common = ['operationId', 'startedAt', 'destination', 'parentIdentity', 'kind'];
    if (!isRecord(v)) return false;
    if (v.kind === 'backup') return exact(v, [...common, 'binding', 'descriptorHash']) && uuid(v.operationId) && instant(v.startedAt) && filePath(v.destination) && identity(v.parentIdentity) && libraryBinding(v.binding) && filePath(v.binding.root) && token(v.descriptorHash);
    return v.kind === 'restore' && exact(v, [...common, 'backup']) && uuid(v.operationId) && instant(v.startedAt) && filePath(v.destination) && identity(v.parentIdentity) && backupIdentity(v.backup);
}
export function maintenanceDesktopInput(method: string, input: unknown): boolean | undefined {
    return ['backupLibrary', 'verifyLibraryBackup', 'restoreLibraryBackup', 'readMaintenanceStatus', 'recoverMaintenance', 'abandonMaintenance'].includes(method) ? input === undefined : undefined;
}
