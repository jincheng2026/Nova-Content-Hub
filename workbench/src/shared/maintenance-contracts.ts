import type {LibraryBinding, RootIdentity} from './contracts.ts';

export const LIBRARY_HEALTH_CODES = ['ROOT_MISSING', 'ROOT_UNREADABLE', 'ROOT_REPLACED', 'ROOT_UNSAFE', 'ROOT_IDENTITY_UNVERIFIED', 'LIBRARY_DESCRIPTOR_INVALID', 'FORMAT_UNSUPPORTED', 'LOCK_BUSY', 'LOCK_UNCERTAIN', 'STRUCTURE_INVALID', 'OBJECT_INVALID', 'OBJECT_UNREADABLE', 'OBJECT_UNSAFE', 'ASSET_INVALID', 'TRANSACTION_INVALID', 'TRANSACTION_PENDING', 'STAGING_UNVERIFIED', 'TEMPLATE_UNREGISTERED', 'REQUEST_INVALID', 'PUBLICATION_INVALID', 'REFERENCE_INVALID', 'LIMIT_REACHED', 'SOURCE_CHANGED'] as const;
export interface LibraryHealthReport {
    checkedAt: string;
    state: 'healthy' | 'issues' | 'blocked' | 'incomplete';
    root: 'matched' | 'missing' | 'unreadable' | 'replaced' | 'unsafe' | 'identity-unverified';
    complete: boolean;
    checked: {objects: number; assets: number; transactions: number; requests: number};
    issues: {scope: 'root' | 'structure' | 'object' | 'asset' | 'transaction' | 'request' | 'publication'; kind?: 'workspace' | 'collection' | 'content' | 'prompt' | 'photo' | 'template'; id?: string; code: string; availability: 'unavailable' | 'unverified'}[];
}
export interface MaintenanceCounts { files: number; directories: number; bytes: number }
export interface BackupIdentity {
    source: string;
    rootIdentity: RootIdentity;
    backupId: string;
    libraryId: string;
    treeHash: string;
    descriptorHash: string;
}
interface MaintenanceIntent {
    operationId: string;
    startedAt: string;
    destination: string;
    parentIdentity: RootIdentity;
}
export type MaintenancePending = MaintenanceIntent & (
    { kind: 'backup'; binding: LibraryBinding; descriptorHash: string } |
    { kind: 'restore'; backup: BackupIdentity }
);
export interface MaintenanceReceipt {
    kind: 'backup' | 'verify' | 'restore';
    destinationName: string;
    counts: MaintenanceCounts;
    recovered: boolean;
    upgradeRequired: boolean;
    interruptedAttempts: number;
}
export interface MaintenanceStatus {
    pending: { kind: 'backup' | 'restore'; destinationName: string } | null;
    receipt: MaintenanceReceipt | null;
    health?: LibraryHealthReport | null;
}
export interface MaintenanceInputs {
    inspectLibraryHealth: undefined;
    backupLibrary: undefined;
    verifyLibraryBackup: undefined;
    restoreLibraryBackup: undefined;
    readMaintenanceStatus: undefined;
    recoverMaintenance: undefined;
    abandonMaintenance: undefined;
}
export interface MaintenanceResults {
    inspectLibraryHealth: LibraryHealthReport;
    backupLibrary: MaintenanceReceipt | null;
    verifyLibraryBackup: MaintenanceReceipt | null;
    restoreLibraryBackup: MaintenanceReceipt | null;
    readMaintenanceStatus: MaintenanceStatus;
    recoverMaintenance: MaintenanceReceipt;
    abandonMaintenance: void;
}
export interface MaintenanceWorkerOperations {
    inspectLibraryHealth: {args: {binding: LibraryBinding}; result: LibraryHealthReport};
    inspectMaintenanceLibrary: { args: {binding: LibraryBinding}; result: {descriptorHash: string} };
    inspectLibraryBackup: { args: {source: string}; result: {backup: BackupIdentity; counts: MaintenanceCounts} };
    runMaintenance: { args: {pending: MaintenancePending}; result: MaintenanceReceipt };
    queryMaintenance: { args: {pending: MaintenancePending}; result: MaintenanceReceipt };
}
