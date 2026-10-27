import type {VaultSnapshot, VaultDocument} from './index.mjs';
export type VaultResourceKind = 'account' | 'report' | 'prompt';
export type VaultResourceInventoryEntry = {
    documentId: string; relativePath: string; hash: string;
    kind: VaultResourceKind | 'excluded' | 'companion' | 'conflict' | 'missing';
    reason: string; resourceId?: string;
};
export type VaultResourceSource = {
    kind: VaultResourceKind; id: string; document: VaultDocument;
    record: Record<string, unknown>; text: string; body: string;
    block: Record<string, unknown> | null; companion?: VaultDocument; companionText?: string;
};
export function classifyVaultResources(snapshot: VaultSnapshot): {
    accounts: VaultResourceSource[]; reports: VaultResourceSource[]; prompts: VaultResourceSource[];
    inventory: VaultResourceInventoryEntry[];
    issues: {code: string; relativePath: string; message: string}[];
};
export function encodeResourceBlock(text: string, value: {kind: VaultResourceKind; record: Record<string, unknown>; [key: string]: unknown}): string;
export function renderMarkdownReport(markdown: string, title?: string): string;
export function projectVaultResources(context: {
    runtimeRoot: string; vaultRoot: string; snapshot: VaultSnapshot;
    rawApi: Record<string, any>; mutate: (...args: any[]) => any;
}): void;
export function validateVaultResourceTransaction(runtimeRoot: string, transaction: {
    kind: string; objectId: string; intent: {mutationId: string}; before: (Buffer | null)[]; after: Buffer[];
}): void;
export function applyVaultResourceTransaction(runtimeRoot: string, transaction: {
    committed: boolean; kind: string; objectId: string; intent: {mutationId: string};
    before: (Buffer | null)[]; after: Buffer[];
}): void;
export function annotateVaultResources<T>(runtimeRoot: string, value: T): T;
