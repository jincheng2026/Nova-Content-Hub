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
export interface VaultMaintenanceBinding { root: string; vaultId: string; rootIdentity: RootIdentity; descriptorHash: string }
export type MaintenanceScope = 'vault' | 'library' | 'vault-copy';
export interface BackupIdentity {
    format?: 'nova-knowledge-vault-backup' | 'nova-knowledge-vault-copy';
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
    { kind: 'backup'; binding: LibraryBinding; descriptorHash: string; vault?: VaultMaintenanceBinding } |
    { kind: 'restore'; backup: BackupIdentity } | UpgradeIntent
);
export interface UpgradeIntent {
    kind: 'upgrade';
    source: LibraryBinding;
    descriptorHash: string;
    backupDestination: string;
    stage: 'backup' | 'verify' | 'restore' | 'upgrade' | 'receipt';
    backup: BackupIdentity | null;
    targetIdentity: RootIdentity | null;
    resultHash: string | null;
}
export type UpgradePending = MaintenanceIntent & UpgradeIntent;
export interface UpgradePreview { sourceName: string; backupName: string; destinationName: string }
export interface UpgradeProgress { pending: UpgradePending; receipt: MaintenanceReceipt | null }
export interface MaintenanceReceipt {
    scope?: MaintenanceScope;
    kind: 'backup' | 'verify' | 'restore' | 'upgrade';
    destinationName: string;
    counts: MaintenanceCounts;
    recovered: boolean;
    upgradeRequired: boolean;
    interruptedAttempts: number;
    backupName?: string;
}
export interface MaintenanceStatus {
    pending: { kind: 'backup' | 'restore' | 'upgrade'; destinationName: string; backupName?: string; stage?: UpgradeIntent['stage'] } | null;
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
    prepareLibraryUpgrade: undefined;
    cancelLibraryUpgrade: undefined;
    confirmLibraryUpgrade: undefined;
    queryLibraryUpgrade: undefined;
    continueLibraryUpgrade: undefined;
    openUpgradedLibrary: undefined;
}
export interface MaintenanceResults {
    inspectLibraryHealth: LibraryHealthReport;
    backupLibrary: MaintenanceReceipt | null;
    verifyLibraryBackup: MaintenanceReceipt | null;
    restoreLibraryBackup: MaintenanceReceipt | null;
    readMaintenanceStatus: MaintenanceStatus;
    recoverMaintenance: MaintenanceReceipt;
    abandonMaintenance: void;
    prepareLibraryUpgrade: UpgradePreview | null;
    cancelLibraryUpgrade: void;
    confirmLibraryUpgrade: MaintenanceReceipt;
    queryLibraryUpgrade: {complete: boolean; stage: UpgradeIntent['stage']};
    continueLibraryUpgrade: MaintenanceReceipt;
    openUpgradedLibrary: void;
}
export interface MaintenanceWorkerOperations {
    inspectLibraryHealth: {args: {binding: LibraryBinding}; result: LibraryHealthReport};
    inspectMaintenanceLibrary: { args: {binding: LibraryBinding}; result: {descriptorHash: string; vault?: VaultMaintenanceBinding} };
    inspectLibraryBackup: { args: {source: string}; result: {backup: BackupIdentity; counts: MaintenanceCounts} };
    runMaintenance: { args: {pending: MaintenancePending}; result: MaintenanceReceipt };
    queryMaintenance: { args: {pending: MaintenancePending}; result: MaintenanceReceipt };
    inspectLegacyLibrary: {args: {source: string}; result: {binding: LibraryBinding; descriptorHash: string}};
    queryLibraryUpgrade: {args: {pending: UpgradePending}; result: UpgradeProgress};
    runLibraryUpgradeStage: {args: {pending: UpgradePending}; result: UpgradeProgress};
    bindUpgradedLibrary: {args: {pending: UpgradePending}; result: LibraryBinding};
}
