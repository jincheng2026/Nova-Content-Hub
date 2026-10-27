declare module '*file-library/index.mjs' {
    interface MaintenanceBackup {
        backupId: string;
        backupDir: string;
        libraryId: string;
        counts: import('./maintenance-contracts.ts').MaintenanceCounts;
        manifest: {source: {libraryId: string; schemaVersion: number}; startedAt: string; completedAt: string};
    }
    export function inspectLibraryHealth(root: string, options: {expectedLibraryId: string; expectedRootIdentity: import('./contracts.ts').RootIdentity}): import('./maintenance-contracts.ts').LibraryHealthReport;
    interface UpgradePins {expectedLibraryId: string; expectedRootIdentity: import('./contracts.ts').RootIdentity; expectedDescriptorHash: string}
    export function backupLibrary(root: string, destination: string, options?: UpgradePins & {allowSchema4: true}): MaintenanceBackup & {outcome: 'committed'};
    export function upgradeLibrary(root: string, options: UpgradePins): ReturnType<typeof openLibrary>;
    export function inspectLibraryUpgrade(root: string, options: UpgradePins): {libraryId: string; schemaVersion: number; descriptorHash: string; upgradeComplete: boolean; upgradeRequired: boolean};
    export function verifyBackup(source: string): MaintenanceBackup & {verified: true; treeHash: string};
    export function prepareRestoredLibrary(root: string, backup: {backupId: string; treeHash: string}): {interruptedAttempts: unknown[]; recoveredMutations: string[]; schemaVersion: number; upgradeRequired: boolean};
    export function restoreBackup(source: string, destination: string): {
        backupId: string; root: string; libraryId: string; outcome: 'committed';
        upgradeRequired: boolean; recoveredMutations: string[]; interruptedAttempts: unknown[];
    };
}
