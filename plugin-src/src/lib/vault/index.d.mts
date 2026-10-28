export {readAuthorPlanningStatus,readAuthorPlanningStatuses,setAuthorPlanningStatus,validateAuthorPlanningReceipt} from './author-planning.mjs';
export {listVaultDocumentTrash,restoreVaultDocument} from './document-trash.mjs';
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
    editAdapter?: 'creation-document';
    sourceConflict?: string;
    contentId: string | null;
    tNumber: string | null;
    bytes: number;
    managedFinalAsset?: 'asset'|'unverified';
};
export type VaultAttachment=Omit<VaultDocument,'hash'|'format'|'writable'>&{format:'other';writable:false};
export type VaultIssue = {code: string; message: string; relativePath?: string};
export type VaultSnapshot = {
    root: string;
    name: string;
    vaultId: string;
    documents: VaultDocument[];
    attachments?:VaultAttachment[];
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
): {document: VaultDocument; text: string; summaryOnly?:boolean; originalDocumentId?:string};
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
export type SourceCandidate = {sourceId:string;documentId:string;relativePath:string;hash:string;format:VaultDocument['format'];evidence:unknown[];role?:'creation-page'|'final-script'|'working-draft'|'legacy-compare'|'topic-card'|'supporting';pageId?:string|null};
export type VaultTaskContext = {
    vault: {root:string;vaultId:string};vaultRoot:string;vaultId:string;revision:string;
    positioning:{documentId:string;relativePath:string;hash:string;text:string}[];
    sources?:import('./source-map.mjs').SourceBinding[];
    sourceIssues?:{sourceId:string;code:string;message:string}[];
    contentDirectory:string|null;
    content:{contentId:string;tNumber:string;sourceDocumentId:string;relativePath:string;hash:string;writable:boolean;sourceConflict:string|null;sourceResolution:'resolved'|'conflict'|'missing';source:{sourceId:string;documentId:string;relativePath:string;hash:string};sourceCandidates:SourceCandidate[];evidence:unknown[];creationDocuments:{documentId:string;relativePath:string;hash:string;pageId?:string|null}[];summaryOnly:boolean;recorded:boolean;published:boolean;readOnlyReason:string|null;sourceMissing:boolean;relatedDocuments:{documentId:string;relativePath:string;hash:string}[]}|null;
    privacy:string;
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

export {backupVault, verifyVaultBackup, restoreVaultBackup, inspectVaultCopy, migrateVault, inspectVaultRestore} from './backup.mjs';

export {createDefaultSourceMap,readSourceMap,resolveSource,linkSource,importSource,readSourceInventory} from './source-map.mjs';
export {readBoundSourceCatalog,readBoundSourceFile} from './source-map.mjs';
export {planJinchengSupplement,importJinchengSupplement} from './import-jincheng.mjs';
export {readWorkFlow,appendStageArtifact,confirmCheckpoint,answerMetaQuestion,metaQuestionsForStage} from './workflow.mjs';
export {saveTopicCandidates,adoptTopic,resolveCurrentWork,selectCurrentWork} from './topics.mjs';
export type {WorkRef,CheckpointKind,AuthorEvidence,DecisionInput,WorkFlow} from './workflow.mjs';
export type {SourceBinding,SourceRole,SourceMap} from './source-map.mjs';
export type {TopicCandidate} from './topics.mjs';

export {readFinalAssets,previewFinalAssets,saveFinalAssets,readFinalAssetExport} from '../final-assets/index.mjs';
