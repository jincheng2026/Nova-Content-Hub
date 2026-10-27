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
    return exact(v, ['source', 'rootIdentity', 'backupId', 'libraryId', 'treeHash', 'descriptorHash', ...(isRecord(v) && Object.hasOwn(v, 'format') ? ['format'] : [])]) && (v.format === undefined || v.format === 'nova-knowledge-vault-backup' || v.format === 'nova-knowledge-vault-copy') && filePath(v.source) && identity(v.rootIdentity) && uuid(v.backupId) && uuid(v.libraryId) && token(v.treeHash) && token(v.descriptorHash);
}
export function maintenancePending(v: unknown): v is MaintenancePending {
    const common = ['operationId', 'startedAt', 'destination', 'parentIdentity', 'kind'];
    if (!isRecord(v)) return false;
    if (v.kind === 'upgrade') {
        if (!exact(v, [...common, 'source', 'descriptorHash', 'backupDestination', 'stage', 'backup', 'targetIdentity', 'resultHash']) || !uuid(v.operationId) || !instant(v.startedAt) || !filePath(v.destination) || !identity(v.parentIdentity) || !libraryBinding(v.source) || !filePath(v.source.root) || !token(v.descriptorHash) || !filePath(v.backupDestination)) return false;
        if (v.stage === 'backup') return v.backup === null && v.targetIdentity === null && v.resultHash === null;
        if (!backupIdentity(v.backup) || v.backup.source !== v.backupDestination) return false;
        if (v.stage === 'verify' || v.stage === 'restore') return v.targetIdentity === null && v.resultHash === null;
        if (!identity(v.targetIdentity)) return false;
        return v.stage === 'upgrade' ? v.resultHash === null : v.stage === 'receipt' && token(v.resultHash);
    }
    if (v.kind === 'backup') return (v.vault === undefined || exact(v.vault, ['root', 'vaultId', 'rootIdentity', 'descriptorHash']) && filePath(v.vault.root) && uuid(v.vault.vaultId) && identity(v.vault.rootIdentity) && token(v.vault.descriptorHash)) && exact(v, [...common, 'binding', 'descriptorHash', ...(Object.hasOwn(v, 'vault') ? ['vault'] : [])]) && uuid(v.operationId) && instant(v.startedAt) && filePath(v.destination) && identity(v.parentIdentity) && libraryBinding(v.binding) && filePath(v.binding.root) && token(v.descriptorHash);
    return v.kind === 'restore' && exact(v, [...common, 'backup']) && uuid(v.operationId) && instant(v.startedAt) && filePath(v.destination) && identity(v.parentIdentity) && backupIdentity(v.backup);
}
export function maintenanceDesktopInput(method: string, input: unknown): boolean | undefined {
    return ['inspectLibraryHealth', 'backupLibrary', 'verifyLibraryBackup', 'restoreLibraryBackup', 'readMaintenanceStatus', 'recoverMaintenance', 'abandonMaintenance', 'prepareLibraryUpgrade', 'cancelLibraryUpgrade', 'confirmLibraryUpgrade', 'queryLibraryUpgrade', 'continueLibraryUpgrade', 'openUpgradedLibrary'].includes(method) ? input === undefined : undefined;
}
