import type {LibraryBinding, RootIdentity} from './contracts.ts';

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
}
export interface MaintenanceInputs {
    backupLibrary: undefined;
    verifyLibraryBackup: undefined;
    restoreLibraryBackup: undefined;
    readMaintenanceStatus: undefined;
    recoverMaintenance: undefined;
    abandonMaintenance: undefined;
}
export interface MaintenanceResults {
    backupLibrary: MaintenanceReceipt | null;
    verifyLibraryBackup: MaintenanceReceipt | null;
    restoreLibraryBackup: MaintenanceReceipt | null;
    readMaintenanceStatus: MaintenanceStatus;
    recoverMaintenance: MaintenanceReceipt;
    abandonMaintenance: void;
}
export interface MaintenanceWorkerOperations {
    inspectMaintenanceLibrary: { args: {binding: LibraryBinding}; result: {descriptorHash: string} };
    inspectLibraryBackup: { args: {source: string}; result: {backup: BackupIdentity; counts: MaintenanceCounts} };
    runMaintenance: { args: {pending: MaintenancePending}; result: MaintenanceReceipt };
    queryMaintenance: { args: {pending: MaintenancePending}; result: MaintenanceReceipt };
}
