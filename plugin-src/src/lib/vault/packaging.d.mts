import type {PackagingFields} from '../creation-document/packaging.mjs';
export type PackagingSource = {vaultId:string;workId:string;documentId:string;pageId:string|null;revision:string};
export type PackagingScript = {text:string;hash:string;manuscriptSource:PackagingSource & {relativePath:string;format:'html'|'markdown'|'text'}};
export type PackagingCandidate = {documentId:string;relativePath:string;pageId:string;revision:string;issues:string[]};
type EmptyPackaging = {source:null;selectionToken:null;fields:null;issues:string[]};
export type VaultPackaging = {contentId:string|null} & (
 | {kind:'jc-doc';source:PackagingSource & {pageId:string};selectionToken:string;fields:PackagingFields;script:PackagingScript;issues:string[]}
 | (EmptyPackaging & {kind:'legacy';script:PackagingScript|null})
 | (EmptyPackaging & {kind:'choose-source';script:PackagingScript;candidates:PackagingCandidate[]})
 | (EmptyPackaging & {kind:'unavailable';script:null}));
/** Uses only the bound Vault and same-work document IDs; never changes currentSource. */
export function readVaultPackaging(runtimeRoot:string,input:{contentId:string;documentId?:string}):VaultPackaging;
