import type {LibraryBinding} from './contracts.ts';
export type VaultSection = 'profile'|'accounts'|'materials'|'patterns'|'topics'|'drafts'|'reviews'|'prompts';
export interface VaultDocument {id:string;section:VaultSection;title:string;relativePath:string;hash:string;format:'markdown'|'html'|'text'|'json'|'other';writable:boolean;contentId:string|null;tNumber:string|null;bytes:number;sourceConflict?:string}
export interface VaultSnapshot {root:string;name:string;vaultId:string;documents:VaultDocument[];issues:{code:string;message:string;relativePath?:string}[];positioning:{status:'missing'|'partial'|'available';documentIds:string[]};revision:string}
export interface VaultText {document:VaultDocument;text:string;workingDraftAvailable?:boolean}
export interface VaultInputs {
 readVault:undefined;
 readVaultDocument:{id:string};
 readVaultContentSource:{contentId:string};
 saveVaultDocument:{id:string;expectedHash:string;text:string};
 createVaultWorkingDraft:{id:string;expectedHash:string};
 createVaultDocument:{section:VaultSection;title:string;text:string};
 trashVaultDocument:{id:string;expectedHash:string};
 revealVaultDocument:{id:string};
 recoverVaultMutation:{action:'retry'|'discard'};
}
export interface VaultResults {
 readVault:VaultSnapshot|null;
 readVaultDocument:VaultText;
 readVaultContentSource:VaultText|null;
 saveVaultDocument:VaultText;
 createVaultWorkingDraft:VaultText;
 createVaultDocument:VaultText;
 trashVaultDocument:{trashed:true};
 revealVaultDocument:{revealed:true};
 recoverVaultMutation:VaultRecovery|null;
}
export type VaultMutationMethod = 'saveVaultDocument'|'createVaultDocument'|'createVaultWorkingDraft'|'trashVaultDocument';
export type VaultPending = {mutationId:string;binding:Pick<LibraryBinding,'libraryId'|'rootIdentity'>} & {[K in VaultMutationMethod]:{method:K;input:VaultInputs[K]}}[VaultMutationMethod];
export type VaultResolution = {state:'committed';result:VaultText|{trashed:true}}|{state:'missing'}|{state:'uncertain'};
export type VaultRecovery = Pick<VaultPending,'mutationId'|'method'|'input'> & {outcome:'committed'|'discarded';result:VaultText|{trashed:true}|null;current:VaultText|null};
export interface VaultWorkerOperations {
 vaultResolve:{args:{binding:LibraryBinding;mutationId:string};result:VaultResolution};
 vaultRead:{args:{binding:LibraryBinding};result:VaultSnapshot|null};
 vaultContentSource:{args:{binding:LibraryBinding;contentId:string};result:VaultText|null};
 vaultDocument:{args:{binding:LibraryBinding;id:string};result:VaultText};
 vaultMutate:{args:{binding:LibraryBinding;pending:VaultPending};result:VaultText|{trashed:true}};
 vaultLocation:{args:{binding:LibraryBinding;id?:string};result:string};
}
