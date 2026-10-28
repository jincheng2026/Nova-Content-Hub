import type {VaultPackaging,PackagingSource} from '../../../plugin-src/src/lib/vault/packaging.mjs';
export type {VaultPackaging} from '../../../plugin-src/src/lib/vault/packaging.mjs';
export type FrozenCoverContext = {kind:'topic'|'manuscript'|'title-only'} & import('../../../plugin-src/src/lib/vault/packaging.mjs').PackagingScript['manuscriptSource'];
export interface CoverPackagingSelection {documentId:string;pageId:string;revision:string;selectionToken:string}
export type FrozenCoverPackaging = PackagingSource & {pageId:string;selectionToken:string;slots:{title:{itemId:string;hash:string};coverText:{itemId:string;hash:string};description:{itemId:string;hash:string}|null};manuscriptSource:import('../../../plugin-src/src/lib/vault/packaging.mjs').PackagingScript['manuscriptSource']};
import type {TemplateCatalogFields} from './workspace-contracts.ts';
import type { Content, LibraryBinding, Reply } from './contracts.ts';
export const ASSISTANTS = ['codex', 'workbuddy'] as const;
export type Assistant = typeof ASSISTANTS[number];
export type AssistantSetupReason = 'available' | 'unconfigured' | 'validation-failed' | 'plugin-missing' | 'plugin-disabled' | 'plugin-mismatch' | 'skill-missing' | 'skill-not-supported' | 'integrity-failed' | 'runtime-failed' | 'protocol-missing';
export interface AssistantSetup { host: Assistant; ready: boolean; skill: 'nova-content-cover-execution' | null; reason: AssistantSetupReason; message?: string }
export interface Raster { assetHash: string; url: string }
export interface TemplateGroup extends TemplateCatalogFields { studyComplete: boolean; builtin: boolean; id: string; version: number; name: string; description: string; samples: Raster[]; accepted: boolean; aiTested: boolean }
export interface Photo { id: string; title: string; assetHash: string | null; isOwnPhoto: boolean; availability: 'available' | 'unavailable'; url: string | null }
export interface CoverDesignSelection {artifactId:string;artifactHash:string}
export interface FrozenCoverDesignSource extends CoverDesignSelection {workId:string;vaultId:string;methodId:'jc-cover-design';taskId:string}
export interface ConfirmedCoverDesign {title:string;prompt:string;ratio:string;identity:'none'|'own-photo-required';designSource:FrozenCoverDesignSource}
export interface CoverInput { designSource?:CoverDesignSelection; template: { id: string; version: number }; styleAssetHashes: string[]; photo: { id: string; assetHash: string } | null; materialIds: string[]; prompt: string; coverText?: string; packagingSource?: CoverPackagingSelection; pixels: { width: number; height: number }; sizePolicy?: 'exact' | 'ratio-minimum'; ratio: string; count: number; outputFormat: 'png' | 'jpeg' | 'webp'; scope: 'cover-only' }
export interface CoverStart { contentId: string; editToken: string; input: CoverInput }
export interface Fingerprint { contextSource?:FrozenCoverContext; designSource?:FrozenCoverDesignSource; packagingSource?: FrozenCoverPackaging; contentId: string; title: string; bodyHash: string; editToken: string; inputHash: string; existingRequest: { requestId: string; requestHash: string } | null }
export interface TaskProgress {phase: 'reading' | 'generating' | 'validating' | 'analyzing' | 'restoring'; state: 'running' | 'waiting-user' | 'waiting-permission'; message: string; revision: number; updatedAt: string; sessionId?: string}
export interface TaskProgressView {editToken: string; jobs: {id: string; activeAttemptId: string | null; attempts: {attemptId: string; status: Attempt['status']; progress: TaskProgress | null; progressUnavailable: boolean}[]}[]}
export interface Attempt {progress?: TaskProgress | null; progressUnavailable?: boolean; attemptId: string; host: Assistant; status: 'created' | 'claimed' | 'committed' | 'failed' | 'cancelled' | 'superseded'; reason: string; failure: { code: string; message: string } | null }
export interface CoverRequestSummary { template: { id: string; version: number }; styleSampleCount: number; hasOwnPhoto: boolean; pixels: { width: number; height: number }; sizePolicy: 'exact' | 'ratio-minimum'; count: number; ratio: string; outputFormat: string }
export interface CoverJob { summary?: CoverRequestSummary | null; id: string; requestHash: string; inputHash: string; activeAttemptId: string | null; attempts: Attempt[] }
export interface Candidate { id: string; assetHash: string; originalName: string; requestId: string; attemptId: string; accepted: boolean; url: string }
export interface CoverView { content: Content; jobs: CoverJob[]; candidates: Candidate[]; selectedCandidateId: string | null }
export interface CoverHandoff extends CoverView { launchRequested: boolean }
export interface PhotoPending { source: string; expectedHash: string; mutationId: string; title: string; originalName: string; isOwnPhoto: boolean }
export type CoverActionPending = { mutationId: string } & ({ action: 'select'; contentId: string; candidateId: string; editToken: string } | { action: 'cancel'; reference: CoverReference });
export interface CoverPending { input: CoverInput; fingerprint: Fingerprint; requestMutationId: string; attemptMutationId: string; host: Assistant; requestId: string | null; requestHash: string | null; reason: 'initial' | 'retry' | 'host-change' }
export interface CoverReference { contentId: string; requestId: string; attemptId: string }
export interface CoverContext { content: Content & { coverJobs?: CoverJob[] }; request: { contextSource?:FrozenCoverContext; requestId: string; requestHash: string; inputHash: string; title: string; bodyHash: string; coverText?: string; description?: string; packagingSource?: FrozenCoverPackaging; designSource?:FrozenCoverDesignSource; sizePolicy?: CoverInput['sizePolicy'] }; attempt: Attempt; progress?: TaskProgress | null }
export interface RequestResult { content: Content & { coverJobs?: CoverJob[] }; request: CoverContext['request']; bodyBytes: Uint8Array }
export interface CoverInputs {
  readCoverDesigns: {contentId:string};
  readCoverPackaging: {contentId:string;documentId?:string};
  readAssistantSetup: undefined;
  resumeCoverAction: undefined; abandonCoverAction: undefined; listCoverAssets: undefined; retryBuiltins: undefined; choosePhoto: { title: string; isOwnPhoto: boolean }; resumePhoto: undefined; abandonPhoto: undefined;
  readCoverProgress: {contentId: string}; continueBoundCover: CoverReference; readCover: { contentId: string }; generateCover: CoverStart; resumeCover: undefined; abandonCover: undefined;
  continueCover: CoverReference; retryCover: CoverReference; cancelCover: CoverReference;
  selectCover: { contentId: string; candidateId: string; editToken: string }; exportCover: { contentId: string; candidateId: string };
  revealCoverFolder: { contentId: string };
  setAssistant: { host: Assistant };
}
export interface CoverResults {
  readCoverDesigns: ConfirmedCoverDesign[];
  readCoverPackaging: VaultPackaging;
  readAssistantSetup: AssistantSetup;
  resumeCoverAction: CoverView; abandonCoverAction: void; listCoverAssets: { templates: TemplateGroup[]; photos: Photo[] }; retryBuiltins: void; choosePhoto: Photo | null; resumePhoto: Photo; abandonPhoto: void;
  readCoverProgress: TaskProgressView; continueBoundCover: {launchRequested: true}; readCover: CoverView; generateCover: CoverHandoff; resumeCover: CoverHandoff; abandonCover: void; continueCover: { launchRequested: true }; retryCover: CoverHandoff; cancelCover: CoverView;
  selectCover: CoverView; exportCover: { exported: boolean }; revealCoverFolder: { revealed: boolean }; setAssistant: void;
}
export interface CoverWorkerOperations {
  readCoverDesigns: {args:{binding:LibraryBinding;contentId:string};result:ConfirmedCoverDesign[]};
  readCoverPackaging: {args:{binding:LibraryBinding;input:CoverInputs['readCoverPackaging']};result:VaultPackaging};
  seed: { args: { binding: LibraryBinding }; result: void };
  coverAssets: { args: { binding: LibraryBinding }; result: CoverResults['listCoverAssets'] };
  preflightPhoto: { args: { source: string }; result: { assetHash: string } };
  importPhoto: { args: { binding: LibraryBinding; pending: PhotoPending }; result: Photo };
  raster: { args: { binding: LibraryBinding; assetHash: string }; result: { data: Uint8Array; mime: string } };
  rasterBatch: { args: { binding: LibraryBinding; assetHashes: string[] }; result: Reply<{data: Uint8Array; mime: string}>[] };
  inspectCoverInput: { args: { binding: LibraryBinding; contentId: string; input: CoverInput; editToken: string }; result: Fingerprint };
  findCoverRequest: { args: { binding: LibraryBinding; fingerprint: Fingerprint }; result: RequestResult | null };
  createCoverRequest: { args: { binding: LibraryBinding; pending: CoverPending }; result: RequestResult };
  findCoverAttempt: { args: { binding: LibraryBinding; pending: CoverPending }; result: CoverContext | null };
  createCoverAttempt: { args: { binding: LibraryBinding; pending: CoverPending }; result: CoverContext };
  handoffContext: { args: { binding: LibraryBinding; reference: CoverReference }; result: CoverContext };
  coverContext: { args: { binding: LibraryBinding; reference: CoverReference }; result: CoverContext };
  readCoverProgress: {args: {binding: LibraryBinding; contentId: string}; result: TaskProgressView};
  readCover: { args: { binding: LibraryBinding; contentId: string }; result: CoverView };
  selectCover: { args: { binding: LibraryBinding; contentId: string; candidateId: string; editToken: string; mutationId: string }; result: CoverView };
  cancelCover: { args: { binding: LibraryBinding; reference: CoverReference; mutationId: string }; result: CoverView };
  candidateRaster: { args: { binding: LibraryBinding; contentId: string; candidateId: string }; result: { data: Uint8Array; mime: string } };
}
// Images per rasterBatch request; the worker still overlaps at most four full decodes.
export const RASTER_BATCH_MAX = 12;
