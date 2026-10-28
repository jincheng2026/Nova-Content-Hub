export type VaultDocumentTrashSection='profile'|'accounts'|'materials'|'patterns'|'topics'|'drafts'|'reviews'|'prompts';
export interface VaultDocumentTrashEntry {
  trashId:string; documentId:string; title:string; relativePath:string;
  section:VaultDocumentTrashSection|null; hash:string|null; deletedAt:string|null; restorable:boolean; issue:string|null;
}
export interface VaultDocumentRestoreInput {trashId:string;expectedHash:string}
export function listVaultDocumentTrash(runtimeRoot:string):VaultDocumentTrashEntry[];
export function restoreVaultDocument(runtimeRoot:string,input:VaultDocumentRestoreInput,options:{mutationId:string}):{
  trashId:string;document:import('./index.mjs').VaultDocument;text:string;
};
