import type {VaultDocumentTrashEntry,VaultDocumentRestoreInput} from '../../../plugin-src/src/lib/vault/document-trash.mjs';
import type {DocumentViewInput,DocumentReferenceInput,DocumentView,DocumentReferenceResult} from './document-reading-contracts.ts';
import type {FinalAssetsInputs} from './final-assets-contracts.ts';
import type {FinalAssetsView} from '../../../plugin-src/src/lib/final-assets/index.mjs';
import type {LibraryBinding} from './contracts.ts';
export type VaultWorkContext=import('../../../plugin-src/src/lib/vault/index.mjs').VaultTaskContext & {workflow:import('../../../plugin-src/src/lib/vault/workflow.mjs').WorkFlow|null};
export type TopicMenu={sessionId:string;relativePath:string;hash:string;candidates:(import('../../../plugin-src/src/lib/vault/topics.mjs').TopicCandidate&{id:string})[];sourceRefs?:unknown[];adoptions:{candidateId:string;work:{workId:string;vaultId:string};at:string}[];taskId?:string;attemptId?:string;artifactId?:string};
export type VaultWorkDirectoryRow={contentId:string;tNumber:string;title:string;recorded:boolean;published:boolean;hasDraft:boolean;topicStatus:import('../../../plugin-src/src/lib/vault/core.mjs').TopicCardStatus;statusEvidence:{origin:string;documentId:string;relativePath:string;hash:string;text:string;section?:string;line?:number;status?:string;paused?:boolean;reason?:string|null}[];sourceResolution:'resolved'|'conflict'|'missing';sourceConflict:string|null;relativePath:string};
export type VaultSection = 'profile'|'accounts'|'materials'|'patterns'|'topics'|'drafts'|'reviews'|'prompts';
export interface VaultDocument {id:string;section:VaultSection;title:string;relativePath:string;hash:string;format:'markdown'|'html'|'text'|'json'|'other';writable:boolean;contentId:string|null;tNumber:string|null;bytes:number;sourceConflict?:string}
export interface VaultSnapshot {readingScope?:string;root:string;name:string;vaultId:string;documents:VaultDocument[];issues:{code:string;message:string;relativePath?:string}[];positioning:{status:'missing'|'partial'|'available';documentIds:string[]};revision:string}
export interface VaultText {readingScope?:string;document:VaultDocument;text:string;workingDraftAvailable?:boolean}
export interface VaultInputs {
 listVaultDocumentTrash:undefined;
 restoreVaultDocument:VaultDocumentRestoreInput;
 readDocumentView:DocumentViewInput & {scope:string};
 readDocumentReference:DocumentReferenceInput & {scope:string};
 openDocumentExternalReference:DocumentReferenceInput & {scope:string};
 saveFinalAssets:FinalAssetsInputs['saveFinalAssets'];
 readVault:undefined;
 readVaultDocument:{id:string};
 openVaultReference:{id:string;url:string};
 revealVaultReference:{id:string;target:string};
 readVaultContentSource:{contentId:string};
 readVaultWorkContext:{contentId:string};
 selectVaultCurrentWork:{contentId:string;documentId:string;expectedHash:string;expectedRevision:string;decisionText:string};
 revealVaultContentDirectory:{contentId:string};
 readVaultWorkDirectory:undefined;
 readVaultTopicMenus:undefined;
 adoptVaultTopic:{sessionId:string;candidateId:string;expectedHash:string;decisionText:string;mutationId:string};
 readVaultSources:undefined;
 openVaultSourcePage:{sourceId:string;relativePath:string};
 chooseVaultSource:{role:import('../../../plugin-src/src/lib/vault/source-map.mjs').SourceRole};
 saveVaultDocument:{id:string;expectedHash:string;text:string};
 createVaultWorkingDraft:{id:string;expectedHash:string};
 createVaultDocument:{section:VaultSection;title:string;text:string};
 trashVaultDocument:{id:string;expectedHash:string};
 revealVaultDocument:{id:string};
 recoverVaultMutation:{action:'retry'|'discard'};
}
export interface VaultResults {
 listVaultDocumentTrash:VaultDocumentTrashEntry[];
 restoreVaultDocument:VaultText & {trashId:string};
 readDocumentView:DocumentView;
 readDocumentReference:DocumentReferenceResult;
 openDocumentExternalReference:{opened:true};
 readVault:VaultSnapshot|null;
 readVaultDocument:VaultText;
 openVaultReference:{opened:true};
 revealVaultReference:{revealed:true};
 readVaultContentSource:VaultText|null;
 readVaultWorkContext:VaultWorkContext|null;
 selectVaultCurrentWork:VaultWorkContext|null;
 revealVaultContentDirectory:{revealed:true};
 readVaultWorkDirectory:VaultWorkDirectoryRow[];
 readVaultTopicMenus:TopicMenu[];
 adoptVaultTopic:{workId:string;vaultId:string;contentId:string|null};
 readVaultSources:ReturnType<typeof import('../../../plugin-src/src/lib/vault/source-map.mjs').readSourceInventory>;
 openVaultSourcePage:{opened:true};
 chooseVaultSource:import('../../../plugin-src/src/lib/vault/source-map.mjs').SourceBinding|null;
 saveVaultDocument:VaultText;
 createVaultWorkingDraft:VaultText;
 createVaultDocument:VaultText;
 trashVaultDocument:{trashed:true};
 revealVaultDocument:{revealed:true};
 recoverVaultMutation:VaultRecovery|null;
}
export type VaultMutationMethod = 'restoreVaultDocument'|'saveFinalAssets'|'saveVaultDocument'|'createVaultDocument'|'createVaultWorkingDraft'|'trashVaultDocument';
export type VaultPending = {mutationId:string;binding:Pick<LibraryBinding,'libraryId'|'rootIdentity'>} & {[K in VaultMutationMethod]:{method:K;input:VaultInputs[K]}}[VaultMutationMethod];
export type VaultMutationResult=VaultText|{trashed:true}|FinalAssetsView;
export type VaultResolution = {state:'committed';result:VaultMutationResult}|{state:'missing'}|{state:'uncertain'};
export type VaultRecovery = Pick<VaultPending,'mutationId'|'method'|'input'> & {outcome:'committed'|'discarded';result:VaultMutationResult|null;current:VaultText|null};
export interface VaultWorkerOperations {
 vaultDocumentTrash:{args:{binding:LibraryBinding};result:VaultDocumentTrashEntry[]};
 documentView:{args:{binding:LibraryBinding;input:VaultInputs['readDocumentView']};result:DocumentView};
 documentReference:{args:{binding:LibraryBinding;input:VaultInputs['readDocumentReference']};result:DocumentReferenceResult};
 documentExternalReference:{args:{binding:LibraryBinding;input:VaultInputs['openDocumentExternalReference']};result:string};
 vaultResolve:{args:{binding:LibraryBinding;mutationId:string};result:VaultResolution};
 vaultRead:{args:{binding:LibraryBinding};result:VaultSnapshot|null};
 vaultContentSource:{args:{binding:LibraryBinding;contentId:string};result:VaultText|null};
 vaultWorkContext:{args:{binding:LibraryBinding;contentId:string};result:VaultWorkContext|null};
 vaultSelectCurrent:{args:{binding:LibraryBinding;contentId:string;documentId:string;expectedHash:string;expectedRevision:string;decisionText:string};result:VaultWorkContext|null};
 vaultContentDirectory:{args:{binding:LibraryBinding;contentId:string};result:string};
 vaultWorkDirectory:{args:{binding:LibraryBinding};result:VaultWorkDirectoryRow[]};
 vaultTopicMenus:{args:{binding:LibraryBinding};result:TopicMenu[]};
 vaultAdoptTopic:{args:{binding:LibraryBinding;input:VaultInputs['adoptVaultTopic']};result:VaultResults['adoptVaultTopic']};
 vaultSources:{args:{binding:LibraryBinding};result:VaultResults['readVaultSources']};
 vaultLinkSource:{args:{binding:LibraryBinding;selectedRoot:string;role:VaultInputs['chooseVaultSource']['role']};result:VaultResults['chooseVaultSource']};
 vaultDocument:{args:{binding:LibraryBinding;id:string};result:VaultText};
 vaultMutate:{args:{binding:LibraryBinding;pending:VaultPending};result:VaultMutationResult};
 vaultReferenceLocation:{args:{binding:LibraryBinding;id:string;target:string};result:string};
 vaultLocation:{args:{binding:LibraryBinding;id?:string};result:string};
}
