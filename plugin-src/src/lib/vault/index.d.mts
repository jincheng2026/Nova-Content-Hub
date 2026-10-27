export type RootIdentity = {dev: string; ino: string};
export type LibraryBinding = {
    root: string;
    libraryId: string;
    rootIdentity: RootIdentity;
};
export type VaultSection =
    | 'profile'
    | 'accounts'
    | 'materials'
    | 'patterns'
    | 'topics'
    | 'drafts'
    | 'reviews'
    | 'prompts';
export type VaultDocument = {
    id: string;
    section: VaultSection;
    title: string;
    relativePath: string;
    hash: string;
    format: 'markdown' | 'html' | 'text' | 'json' | 'other';
    writable: boolean;
    contentId: string | null;
    tNumber: string | null;
    bytes: number;
};
export type VaultIssue = {code: string; message: string; relativePath?: string};
export type VaultSnapshot = {
    root: string;
    name: string;
    vaultId: string;
    documents: VaultDocument[];
    issues: VaultIssue[];
    positioning: {
        status: 'missing' | 'partial' | 'available';
        documentIds: string[];
    };
    revision: string;
};
export function inspectVault(root: string): {
    recognized: boolean;
    issues: VaultIssue[];
};
export function openVault(root: string): LibraryBinding;
export function createVault(root: string): LibraryBinding;
export function vaultRootForRuntime(runtimeRoot: string): string | null;
export function readVaultSnapshot(runtimeRoot: string): VaultSnapshot | null;
export function readVaultDocument(
    runtimeRoot: string,
    id: string,
): {document: VaultDocument; text: string};
export function saveVaultDocument(
    runtimeRoot: string,
    input: {id: string; expectedHash: string; text: string},
    options: {mutationId: string},
): {document: VaultDocument; text: string};
export function createVaultDocument(
    runtimeRoot: string,
    input: {section: VaultSection; title: string; text: string},
    options: {mutationId: string},
): {document: VaultDocument; text: string};
export function trashVaultDocument(
    runtimeRoot: string,
    input: {id: string; expectedHash: string},
    options: {mutationId: string},
): {trashed: true};
export type VaultTaskContext = {
    vault: {root: string; vaultId: string};
    vaultRoot: string;
    vaultId: string;
    revision: string;
    positioning: {
        documentId: string;
        relativePath: string;
        hash: string;
        text: string;
    }[];
    contentDirectory: string | null;
    content: unknown;
    privacy: string;
};
export function readVaultTaskContext(
    runtimeRoot: string,
    contentId?: string | null,
): VaultTaskContext | null;

export function queryVaultMutation(
    runtimeRoot: string,
    mutationId: string,
): {
    result: unknown;
    requestHash: string;
    request: unknown;
    status: 'pending' | 'committed';
} | null;

export function resolveVaultMutation(
    runtimeRoot: string,
    mutationId: string,
):
    | {state: 'committed'; result: unknown}
    | {state: 'missing'}
    | {state: 'uncertain'};
