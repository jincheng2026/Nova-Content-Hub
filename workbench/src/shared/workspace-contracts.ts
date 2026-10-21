import type {LibraryBinding, WorkspacePlan} from './contracts.ts';

export type WorkspaceKind = 'content' | 'collection';
export type WorkspaceObjectKind = WorkspaceKind | 'prompt' | 'photo' | 'template' | 'workspace';
export type WorkspaceSchedule = WorkspacePlan['schedule'];
export type WorkspaceCoverChoice = {candidateId: string} | {variantId: string} | null;
export interface WorkspaceReference { id: string; editToken: string }
export interface WorkspacePromptFields { title: string; body: string; category: string; summary: string; when: string; tags: string[] }
export interface WorkspaceChannelFields { name: string; ink: string; bg: string; requiredRatio: string | null }
export interface WorkspaceCollectionFields { title: string; body: string; channelIds: string[]; dateRange: {start: string | null; end: string | null} }
export interface WorkspaceProfile { name: string; intro: string; avatarAssetHash: string | null; marks: {key: string; value: string}[] }
export interface WorkspaceDefaults { photoId: string | null; templateId: string | null; coverCount: number }
export interface WorkspacePlanInput { id?: string; channelId: string; text: string; schedule: WorkspaceSchedule; coverChoice: WorkspaceCoverChoice }
export interface WorkspaceTemplateFields { description: string; rules: string[]; styleAssetHashes: string[] }
export interface WorkspaceTemplateImage { assetHash: string; originalName: string; width: number; height: number; url: string }
export interface WorkspaceMaterialImport {assetHash: string; originalName: string; detectedType: string; bytes: number; url: string | null; text: string | null}
export interface WorkspaceMaterial {
    id: string; assetHash: string | null; originalName: string; role: string; detectedType: string | null;
    bytes: number | null; availability: 'available' | 'unavailable'; deletedAt: string | null; url: string | null;
}
export interface WorkspaceMaterialReference {contentId: string; materialId: string}
export interface WorkspacePublicationReference {kind: WorkspaceKind; id: string; publicationId: string}
export const TEMPLATE_IMPORT_LIMITS = Object.freeze({files: 50, encodedBytes: 256 * 1024 * 1024});

// Each command has a finite shape; renderer input never names a core method or filesystem path.
export type WorkspaceMutation =
    | ({op: 'createPrompt'} & WorkspacePromptFields)
    | ({op: 'updatePrompt'} & WorkspaceReference & WorkspacePromptFields)
    | ({op: 'setPromptEnabled'; enabled: boolean} & WorkspaceReference)
    | ({op: 'setPromptFavorite'; favorite: boolean} & WorkspaceReference)
    | ({op: 'trashPrompt' | 'restorePrompt' | 'trashPhoto' | 'restorePhoto' | 'trashTemplate' | 'restoreTemplate' | 'trashCollection' | 'restoreCollection'} & WorkspaceReference)
    | ({op: 'updatePhoto'; title: string; isOwnPhoto: boolean} & WorkspaceReference)
    | ({op: 'selectTemplateVersion'; version: number} & WorkspaceReference)
    | {op: 'deriveTemplate'; sourceTemplateId: string; sourceVersion: number; sourcePackageHash: string; name: string}
    | ({op: 'createTemplate'; name: string} & WorkspaceTemplateFields)
    | ({op: 'addTemplateVersion'; version: number} & WorkspaceReference & WorkspaceTemplateFields)
    | ({op: 'attachMaterial'; assetHash: string; originalName: string; role: 'material' | 'reference'} & WorkspaceReference)
    | ({op: 'removeMaterial'; materialId: string} & WorkspaceReference)
    | ({op: 'createCollection'} & WorkspaceCollectionFields)
    | ({op: 'updateCollection'} & WorkspaceReference & WorkspaceCollectionFields)
    | ({op: 'setCollectionMembers'; memberIds: string[]} & WorkspaceReference)
    | ({op: 'updateContentMetadata'; recordedDate: string | null; plannedDate: string | null; preferredTemplateId: string | null; channelIds: string[]; isExample: boolean} & WorkspaceReference)
    | ({op: 'savePublicationPlan'; kind: WorkspaceKind; plan: WorkspacePlanInput} & WorkspaceReference)
    | ({op: 'cancelPublicationPlan'; kind: WorkspaceKind; planId: string} & WorkspaceReference)
    | ({op: 'recordPublication'; kind: WorkspaceKind; planId: string; schedule: WorkspaceSchedule; url: string | null} & WorkspaceReference)
    | ({op: 'correctPublication'; kind: WorkspaceKind; publicationId: string; reason: string; text: string; schedule: WorkspaceSchedule; url: string | null; coverChoice?: WorkspaceCoverChoice} & WorkspaceReference)
    | ({op: 'retractPublication'; kind: WorkspaceKind; publicationId: string; reason: string} & WorkspaceReference)
    | ({op: 'updateCandidate'; kind: WorkspaceKind; candidateId: string; favorite: boolean; displayNumber: string; note: string; variantId: string | null} & WorkspaceReference)
    | ({op: 'createChannel'; editToken: string} & WorkspaceChannelFields)
    | ({op: 'updateChannel'; channelId: string; editToken: string} & WorkspaceChannelFields)
    | {op: 'trashChannel' | 'restoreChannel'; channelId: string; editToken: string}
    | {op: 'updateProfile'; editToken: string; profile: WorkspaceProfile}
    | {op: 'setGenerationDefaults'; editToken: string; defaults: WorkspaceDefaults}
    | {op: 'setPromptCategories'; editToken: string; values: string[]}
    | {op: 'addCustomRatio' | 'removeCustomRatio'; editToken: string; ratio: string};

export interface WorkspaceEntity extends WorkspaceReference { title: string; createdAt: string; updatedAt: string; deletedAt: string | null }
export interface WorkspaceLibraryPrompt extends WorkspaceEntity, WorkspacePromptFields { enabled: boolean; favorite: boolean }
export interface WorkspaceLibraryPhoto extends WorkspaceEntity { assetHash: string | null; isOwnPhoto: boolean; availability: 'available' | 'unavailable'; originalName: string }
export interface TemplateCatalogFields {catalogStatus: 'default' | 'legacy' | 'custom'; derivedFrom: {id: string; version: number} | null; designNotes: string; sourceScopeWarning?: string | null}
export interface WorkspaceLibraryTemplate extends WorkspaceEntity, WorkspaceTemplateFields, TemplateCatalogFields { builtin: boolean; currentVersion: number; versions: {version: number; packageHash: string}[] }
export interface WorkspaceLibraryPlan extends WorkspacePlan { text: string | null; textMode: 'explicit' | 'body'; coverChoice: WorkspaceCoverChoice; publicationId: string | null }
export interface WorkspacePublication {
    id: string; planId: string; channelId: string; schedule: WorkspaceSchedule; url: string | null;
    title: string | null; body: string | null; text: string | null; channelName: string | null;
    coverCandidateId: string | null; recordedAt: string | null;
}
export interface WorkspacePublicationEvent { id: string; type: 'corrected' | 'retracted'; targetId: string; replacementId: string | null; reason: string; recordedAt: string }
export interface WorkspaceCandidate { id: string; assetHash: string; accepted: boolean; favorite: boolean; displayNumber: string; note: string; variantId: string | null; url?: string }
export interface WorkspaceDocument extends WorkspaceEntity {
    body: string; channelIds: string[]; materials: WorkspaceMaterial[]; plans: WorkspaceLibraryPlan[]; publications: WorkspacePublication[];
    publicationEvents: WorkspacePublicationEvent[]; candidates: WorkspaceCandidate[];
    coverVariants: {id: string; name: string; ratio: string; preferredTemplateId: string | null; selectedCandidateId: string | null}[];
}
export interface WorkspaceContentDetails extends WorkspaceDocument { recordedDate: string | null; plannedDate: string | null; preferredTemplateId: string | null; isExample: boolean }
export interface WorkspaceLibraryCollection extends WorkspaceDocument { dateRange: {start: string | null; end: string | null}; memberIds: string[] }
export interface WorkspaceLibrarySettings {
    editToken: string; profile: WorkspaceProfile; defaults: WorkspaceDefaults;
    channels: ({id: string; deletedAt: string | null} & WorkspaceChannelFields)[];
    promptCategories: string[]; visiblePromptCategories: string[]; customRatios: string[];
    defaultIssues: {field: string; id: string; reason: string}[];
}
export interface WorkspaceLibrarySnapshot {
    prompts: WorkspaceLibraryPrompt[]; photos: WorkspaceLibraryPhoto[]; templates: WorkspaceLibraryTemplate[];
    collections: WorkspaceLibraryCollection[]; contentDetails: WorkspaceContentDetails[]; settings: WorkspaceLibrarySettings;
}

export interface WorkspacePending {
    mutationId: string; input: WorkspaceMutation;
    binding: Pick<LibraryBinding, 'libraryId' | 'rootIdentity'>;
}
export interface WorkspacePendingView { mutationId: string; input: WorkspaceMutation; state: 'uncertain' | 'missing' | 'conflict' | 'committed' }
export interface WorkspaceReceipt { objectKind: WorkspaceObjectKind; objectId: string }
export interface WorkspaceMutationResult extends WorkspaceReceipt { mutationId: string; library: WorkspaceLibrarySnapshot }
export interface WorkspaceRecovery { pending: WorkspacePendingView | null; result: WorkspaceMutationResult | null }
export interface WorkspaceInputs {
    openPublicationLink: WorkspacePublicationReference;
    revealLibraryFolder: undefined;
    revealTemplateFolder: {templateId: string};
    chooseTemplateImages: undefined;
    chooseTemplateFolder: undefined;
    chooseContentMaterial: undefined;
    readContentMaterial: WorkspaceMaterialReference;
    exportContentMaterial: WorkspaceMaterialReference;
    readWorkspaceLibrary: undefined;
    mutateWorkspace: WorkspaceMutation;
    recoverWorkspaceMutation: undefined;
    retryWorkspaceMutation: undefined;
    abandonWorkspaceMutation: undefined;
}
export interface WorkspaceResults {
    openPublicationLink: {opened: true};
    revealLibraryFolder: {revealed: true};
    revealTemplateFolder: {revealed: true; reportWarnings?: string[]};
    chooseTemplateImages: WorkspaceTemplateImage[] | null;
    chooseTemplateFolder: WorkspaceTemplateImage[] | null;
    chooseContentMaterial: WorkspaceMaterialImport | null;
    readContentMaterial: WorkspaceMaterialImport;
    exportContentMaterial: {exported: boolean};
    readWorkspaceLibrary: WorkspaceLibrarySnapshot;
    mutateWorkspace: WorkspaceMutationResult;
    recoverWorkspaceMutation: WorkspaceRecovery;
    retryWorkspaceMutation: WorkspaceMutationResult | null;
    abandonWorkspaceMutation: void;
}
export interface WorkspaceWorkerOperations {
    workspaceTemplateFolder: {args: {binding: LibraryBinding; templateId: string}; result: {folder: string; reportWarnings: string[]}};
    workspaceImportMaterial: {args: {binding: LibraryBinding; source: string}; result: WorkspaceMaterialImport};
    workspaceReadMaterial: {args: {binding: LibraryBinding; reference: WorkspaceMaterialReference}; result: WorkspaceMaterialImport};
    workspaceMaterialBytes: {args: {binding: LibraryBinding; reference: WorkspaceMaterialReference}; result: {data: Uint8Array; detectedType: string; originalName: string}};
    workspaceImportTemplateImages: {args: {binding: LibraryBinding; sources: string[]}; result: WorkspaceTemplateImage[]};
    workspaceLibrary: {args: {binding: LibraryBinding}; result: WorkspaceLibrarySnapshot};
    workspaceMutate: {args: {binding: LibraryBinding; pending: WorkspacePending}; result: WorkspaceReceipt};
    workspaceRecover: {args: {binding: LibraryBinding; pending: WorkspacePending}; result: {receipt: WorkspaceReceipt | null; conflict: boolean}};
}
export interface WorkspaceWorker {
    call<K extends keyof WorkspaceWorkerOperations>(op: K, args: WorkspaceWorkerOperations[K]['args']): Promise<WorkspaceWorkerOperations[K]['result']>;
}
