import type {RootIdentity} from './index.mjs';
export const VAULT_BACKUP_FORMAT: 'nova-knowledge-vault-backup';
export const VAULT_COPY_FORMAT: 'nova-knowledge-vault-copy';
export type VaultBackupCounts = {files: number; directories: number; bytes: number};
export type VaultBackupEntry = {path: string; type: 'directory'} | {path: string; type: 'file'; bytes: number; sha256: string};
export type VaultBackupManifest = {
    format: typeof VAULT_BACKUP_FORMAT; schemaVersion: 1; backupId: string; operationId: string;
    source: {vaultId: string; libraryId: string; schemaVersion: 1; rootIdentity: RootIdentity; runtimeIdentity: RootIdentity; vaultDescriptorHash: string};
    startedAt: string; completedAt: string; consistency: 'stable-verified-copy';
    excludedPaths: string[]; entriesHash: string; counts: VaultBackupCounts;
};
export type VaultBackupResult = {backupDir: string; backupId: string; libraryId: string; treeHash: string; manifest: VaultBackupManifest; counts: VaultBackupCounts};
export type VaultRestoreOptions = {operationId?: string; expectedTreeHash?: string};
export function backupVault(root: string, destination: string, options?: {operationId?: string; expectedLibraryId?: string; expectedRootIdentity?: RootIdentity; expectedDescriptorHash?: string; expectedRuntimeIdentity?: RootIdentity; expectedVaultDescriptorHash?: string}): VaultBackupResult & {outcome: 'committed'};
export function verifyVaultBackup(root: string): VaultBackupResult & {vaultId: string; descriptorHash: string; entries: VaultBackupEntry[]; verified: true};
export function inspectVaultCopy(root: string): {root: string; rootIdentity: RootIdentity; vaultId: string; libraryId: string; descriptorHash: string; vaultDescriptorHash: string; format: typeof VAULT_COPY_FORMAT; backupId: string; treeHash: string; counts: VaultBackupCounts; entries: VaultBackupEntry[]};
export function restoreVaultBackup(source: string, destination: string, options?: VaultRestoreOptions): {root: string; backupId: string; libraryId: string; interruptedAttempts: unknown[]; upgradeRequired: false; outcome: 'committed'; operationId: string};
export function migrateVault(source: string, destination: string, options?: VaultRestoreOptions): ReturnType<typeof restoreVaultBackup>;
export function inspectVaultRestore(root: string, expected: {operationId: string; backupId: string; treeHash: string}): {root: string; interruptedAttempts: unknown[]; libraryId: string; vaultId: string; restoredAt: string};
