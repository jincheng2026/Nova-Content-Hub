import type {
    WorkspaceEntity, WorkspacePromptFields, WorkspaceLibraryPhoto,
    WorkspaceLibrarySettings, WorkspaceSchedule, WorkspaceCoverChoice, WorkspacePlanInput,
    WorkspaceCollectionFields, WorkspaceProfile, WorkspaceDefaults, WorkspacePublicationEvent,
    WorkspaceObjectKind
} from './workspace-contracts.ts';

export interface WorkspaceCorePlan {
    id: string; channelId: string; status: 'planned' | 'cancelled' | 'published';
    schedule?: WorkspaceSchedule; scheduledAt?: string; timezone?: string;
    text?: string | null; textMode?: 'explicit' | 'body'; coverChoice?: WorkspaceCoverChoice; publicationId?: string;
}
export interface WorkspaceCorePublication {
    id: string; planId: string; channelId: string; schedule?: WorkspaceSchedule;
    publishedAt?: string; timezone?: string; url: string | null;
}
export interface WorkspaceCoreDocument extends WorkspaceEntity {
    body: string; channelIds: string[]; recordedDate?: string | null; plannedDate?: string | null;
    preferredTemplateId?: string | null; isExample?: boolean; dateRange?: {start: string | null; end: string | null}; memberIds?: string[];
    plans: WorkspaceCorePlan[]; publications: WorkspaceCorePublication[]; publicationEvents: WorkspacePublicationEvent[];
    candidates: {id: string; assetHash: string; accepted: boolean; favorite?: boolean; displayNumber?: string; note?: string; variantId?: string | null}[];
    materials?: {id: string; assetHash: string; originalName: string; role: string; deletedAt?: string | null}[];
    unavailableReferences?: {id: string; kind: 'material' | 'candidate' | 'template-image'; originalName: string; availability: 'available' | 'unavailable'; resolvedObjectId?: string | null; deletedAt?: string | null}[];
    coverVariants: {id: string; name: string; ratio: string; preferredTemplateId: string | null; selectedCandidateId: string | null}[];
}
export interface WorkspaceCorePublicationSnapshot {
    snapshot: {
        schemaVersion: number; content: {title: string | null}; channel?: {name: string | null};
        publicationText?: {status: 'known' | 'unknown'; text: string | null};
        cover?: {candidateId: string} | null; recordedAt?: string;
    };
    body: string | null;
}
export interface WorkspaceCoreTemplate extends WorkspaceEntity {builtin: boolean; currentVersion: number; versions: {version: number; packageHash: string}[]}
type Options = {mutationId: string};
type Changed = Pick<WorkspaceEntity, 'id' | 'editToken'>;
type RecordInput = {planId: string; schedule: WorkspaceSchedule; url: string | null};
type Correction = {reason: string; text: string; schedule: WorkspaceSchedule; url: string | null; coverChoice?: WorkspaceCoverChoice};
type CandidateInput = {favorite: boolean; displayNumber: string; note: string; variantId: string | null};
type ChannelInput = import('./workspace-contracts.ts').WorkspaceChannelFields;
interface TemplatePackage {
    definition: {desc: string; rules: string[]};
    resources: Record<string, {assetHash: string; bytes: number; detectedType: string; role: 'style'}>;
}
export interface WorkspaceCoreLibrary {
    importAsset(source: string, input: {purpose: 'template-reference' | 'material'}): {assetHash: string};
    readAsset(assetHash: string): {assetHash: string; bytes: number; detectedType: string; data: Uint8Array};
    listContents(): Changed[];
    listTrash(): Changed[];
    readContent(id: string): WorkspaceCoreDocument;
    updateContent(id: string, input: {recordedDate: string | null; plannedDate: string | null; preferredTemplateId: string | null; channelIds: string[]; isExample: boolean}, editToken: string, options: Options): Changed;
    attachContentMaterial(id: string, input: {assetHash: string; originalName: string; role: 'material' | 'reference'}, editToken: string, options: Options): Changed;
    removeContentMaterial(id: string, materialId: string, editToken: string, options: Options): Changed;
    trashContentMaterial(id: string, materialId: string, editToken: string, options: Options): Changed;
    trashContentUnavailableReference(id: string, referenceId: string, editToken: string, options: Options): Changed;
    listPrompts(): Changed[];
    listPromptTrash(): Changed[];
    readPrompt(id: string): WorkspaceEntity & WorkspacePromptFields & {enabled?: boolean};
    createPrompt(input: WorkspacePromptFields, options: Options): Changed;
    updatePrompt(id: string, input: WorkspacePromptFields, editToken: string, options: Options): Changed;
    setPromptEnabled(id: string, enabled: boolean, editToken: string, options: Options): Changed;
    trashPrompt(id: string, editToken: string, options: Options): Changed;
    restorePrompt(id: string, editToken: string, options: Options): Changed;
    listPhotos(): WorkspaceLibraryPhoto[];
    listPhotoTrash(): WorkspaceLibraryPhoto[];
    readPhoto(id: string): WorkspaceLibraryPhoto;
    updatePhoto(id: string, input: {title: string; isOwnPhoto: boolean}, editToken: string, options: Options): Changed;
    trashPhoto(id: string, editToken: string, options: Options): Changed;
    restorePhoto(id: string, editToken: string, options: Options): Changed;
    listTemplates(): WorkspaceCoreTemplate[];
    listTemplateTrash(): WorkspaceCoreTemplate[];
    readTemplate(id: string, version?: number): WorkspaceCoreTemplate & {definition: Record<string, unknown>; resources: Record<string, {assetHash: string; role: string}>};
    createTemplate(input: TemplatePackage & {name: string}, options: Options): Changed;
    addTemplateVersion(id: string, input: TemplatePackage & {version: number}, editToken: string, options: Options): Changed;
    selectTemplateVersion(id: string, version: number, editToken: string, options: Options): Changed;
    trashTemplate(id: string, editToken: string, options: Options): Changed;
    restoreTemplate(id: string, editToken: string, options: Options): Changed;
    listCollections(): Changed[];
    listCollectionTrash(): Changed[];
    readCollection(id: string): WorkspaceCoreDocument;
    createCollection(input: WorkspaceCollectionFields, options: Options): Changed;
    updateCollection(id: string, input: WorkspaceCollectionFields, editToken: string, options: Options): Changed;
    trashCollection(id: string, editToken: string, options: Options): Changed;
    restoreCollection(id: string, editToken: string, options: Options): Changed;
    setCollectionMembers(id: string, memberIds: string[], editToken: string, options: Options): Changed;
    readLibrarySettings(): WorkspaceLibrarySettings;
    updateProfile(input: WorkspaceProfile, editToken: string, options: Options): Changed;
    setGenerationDefaults(input: WorkspaceDefaults, editToken: string, options: Options): Changed;
    createChannel(input: ChannelInput, editToken: string, options: Options): Changed;
    updateChannel(id: string, input: ChannelInput, editToken: string, options: Options): Changed;
    trashChannel(id: string, editToken: string, options: Options): Changed;
    restoreChannel(id: string, editToken: string, options: Options): Changed;
    setPromptCategories(values: string[], editToken: string, options: Options): Changed;
    addCustomRatio(ratio: string, editToken: string, options: Options): Changed;
    removeCustomRatio(ratio: string, editToken: string, options: Options): Changed;
    savePublicationPlan(id: string, input: WorkspacePlanInput, editToken: string, options: Options): Changed;
    saveCollectionPublicationPlan(id: string, input: WorkspacePlanInput, editToken: string, options: Options): Changed;
    cancelPublicationPlan(id: string, planId: string, editToken: string, options: Options): Changed;
    cancelCollectionPublicationPlan(id: string, planId: string, editToken: string, options: Options): Changed;
    recordPublication(id: string, input: RecordInput, editToken: string, options: Options): Changed;
    recordCollectionPublication(id: string, input: RecordInput, editToken: string, options: Options): Changed;
    correctPublication(id: string, publicationId: string, input: Correction, editToken: string, options: Options): Changed;
    correctCollectionPublication(id: string, publicationId: string, input: Correction, editToken: string, options: Options): Changed;
    retractPublication(id: string, publicationId: string, input: {reason: string}, editToken: string, options: Options): Changed;
    retractCollectionPublication(id: string, publicationId: string, input: {reason: string}, editToken: string, options: Options): Changed;
    readPublication(id: string, publicationId: string): WorkspaceCorePublicationSnapshot;
    readCollectionPublication(id: string, publicationId: string): WorkspaceCorePublicationSnapshot;
    updateCandidate(id: string, candidateId: string, input: CandidateInput, editToken: string, options: Options): Changed;
    updateCollectionCandidate(id: string, candidateId: string, input: CandidateInput, editToken: string, options: Options): Changed;
    queryMutation(mutationId: string): {objectId: string; objectKind: WorkspaceObjectKind} | null;
}
