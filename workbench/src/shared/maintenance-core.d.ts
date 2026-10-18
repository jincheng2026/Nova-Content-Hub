declare module '*file-library/index.mjs' {
    interface MaintenanceBackup {
        backupId: string;
        backupDir: string;
        libraryId: string;
        counts: import('./maintenance-contracts.ts').MaintenanceCounts;
        manifest: {source: {libraryId: string; schemaVersion: number}; startedAt: string; completedAt: string};
    }
    export function backupLibrary(root: string, destination: string): MaintenanceBackup & {outcome: 'committed'};
    export function verifyBackup(source: string): MaintenanceBackup & {verified: true; treeHash: string};
    export function restoreBackup(source: string, destination: string): {
        backupId: string; root: string; libraryId: string; outcome: 'committed';
        upgradeRequired: boolean; recoveredMutations: string[]; interruptedAttempts: unknown[];
    };
}
