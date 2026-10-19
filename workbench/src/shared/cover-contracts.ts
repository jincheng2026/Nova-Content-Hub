import type { Content, LibraryBinding } from './contracts.ts';
export const ASSISTANTS = ['codex', 'workbuddy'] as const;
export type Assistant = typeof ASSISTANTS[number];
export interface AssistantSetup { host: Assistant; ready: boolean; skill: 'nova-content-cover-execution' | null; reason: 'available' | 'protocol-missing' | 'skill-missing' | 'unconfigured' }
export interface Raster { assetHash: string; url: string }
export interface TemplateGroup { builtin: boolean; id: string; version: number; name: string; description: string; samples: Raster[]; accepted: boolean; aiTested: boolean }
export interface Photo { id: string; title: string; assetHash: string | null; isOwnPhoto: boolean; availability: 'available' | 'unavailable'; url: string | null }
export interface CoverInput { template: { id: string; version: number }; styleAssetHashes: string[]; photo: { id: string; assetHash: string } | null; materialIds: string[]; prompt: string; pixels: { width: number; height: number }; sizePolicy?: 'exact' | 'ratio-minimum'; ratio: string; count: number; outputFormat: 'png' | 'jpeg' | 'webp'; scope: 'cover-only' }
export interface CoverStart { contentId: string; editToken: string; input: CoverInput }
export interface Fingerprint { contentId: string; title: string; bodyHash: string; editToken: string; inputHash: string; existingRequest: { requestId: string; requestHash: string } | null }
export interface Attempt { attemptId: string; host: Assistant; status: 'created' | 'claimed' | 'committed' | 'failed' | 'cancelled' | 'superseded'; reason: string; failure: { code: string; message: string } | null }
export interface CoverRequestSummary { template: { id: string; version: number }; styleSampleCount: number; hasOwnPhoto: boolean; pixels: { width: number; height: number }; sizePolicy: 'exact' | 'ratio-minimum'; count: number; ratio: string; outputFormat: string }
export interface CoverJob { summary?: CoverRequestSummary | null; id: string; requestHash: string; inputHash: string; activeAttemptId: string | null; attempts: Attempt[] }
export interface Candidate { id: string; assetHash: string; originalName: string; requestId: string; attemptId: string; accepted: boolean; url: string }
export interface CoverView { content: Content; jobs: CoverJob[]; candidates: Candidate[]; selectedCandidateId: string | null }
export interface CoverHandoff extends CoverView { launchRequested: boolean }
export interface PhotoPending { source: string; expectedHash: string; mutationId: string; title: string; originalName: string; isOwnPhoto: boolean }
export type CoverActionPending = { mutationId: string } & ({ action: 'select'; contentId: string; candidateId: string; editToken: string } | { action: 'cancel'; reference: CoverReference });
export interface CoverPending { input: CoverInput; fingerprint: Fingerprint; requestMutationId: string; attemptMutationId: string; host: Assistant; requestId: string | null; requestHash: string | null; reason: 'initial' | 'retry' | 'host-change' }
export interface CoverReference { contentId: string; requestId: string; attemptId: string }
export interface CoverContext { content: Content & { coverJobs?: CoverJob[] }; request: { requestId: string; requestHash: string; inputHash: string; title: string; bodyHash: string; sizePolicy?: CoverInput['sizePolicy'] }; attempt: Attempt }
export interface RequestResult { content: Content & { coverJobs?: CoverJob[] }; request: CoverContext['request']; bodyBytes: Uint8Array }
export interface CoverInputs {
  readAssistantSetup: undefined;
  resumeCoverAction: undefined; abandonCoverAction: undefined; listCoverAssets: undefined; retryBuiltins: undefined; choosePhoto: { title: string; isOwnPhoto: boolean }; resumePhoto: undefined; abandonPhoto: undefined;
  readCover: { contentId: string }; generateCover: CoverStart; resumeCover: undefined; abandonCover: undefined;
  continueCover: CoverReference; retryCover: CoverReference; cancelCover: CoverReference;
  selectCover: { contentId: string; candidateId: string; editToken: string }; exportCover: { contentId: string; candidateId: string };
  revealCoverFolder: { contentId: string };
  setAssistant: { host: Assistant };
}
export interface CoverResults {
  readAssistantSetup: AssistantSetup;
  resumeCoverAction: CoverView; abandonCoverAction: void; listCoverAssets: { templates: TemplateGroup[]; photos: Photo[] }; retryBuiltins: void; choosePhoto: Photo | null; resumePhoto: Photo; abandonPhoto: void;
  readCover: CoverView; generateCover: CoverHandoff; resumeCover: CoverHandoff; abandonCover: void; continueCover: { launchRequested: true }; retryCover: CoverHandoff; cancelCover: CoverView;
  selectCover: CoverView; exportCover: { exported: boolean }; revealCoverFolder: { revealed: boolean }; setAssistant: void;
}
export interface CoverWorkerOperations {
  seed: { args: { binding: LibraryBinding }; result: void };
  coverAssets: { args: { binding: LibraryBinding }; result: CoverResults['listCoverAssets'] };
  preflightPhoto: { args: { source: string }; result: { assetHash: string } };
  importPhoto: { args: { binding: LibraryBinding; pending: PhotoPending }; result: Photo };
  raster: { args: { binding: LibraryBinding; assetHash: string }; result: { data: Uint8Array; mime: string } };
  inspectCoverInput: { args: { binding: LibraryBinding; contentId: string; input: CoverInput; editToken: string }; result: Fingerprint };
  findCoverRequest: { args: { binding: LibraryBinding; fingerprint: Fingerprint }; result: RequestResult | null };
  createCoverRequest: { args: { binding: LibraryBinding; pending: CoverPending }; result: RequestResult };
  findCoverAttempt: { args: { binding: LibraryBinding; pending: CoverPending }; result: CoverContext | null };
  createCoverAttempt: { args: { binding: LibraryBinding; pending: CoverPending }; result: CoverContext };
  handoffContext: { args: { binding: LibraryBinding; reference: CoverReference }; result: CoverContext };
  coverContext: { args: { binding: LibraryBinding; reference: CoverReference }; result: CoverContext };
  readCover: { args: { binding: LibraryBinding; contentId: string }; result: CoverView };
  selectCover: { args: { binding: LibraryBinding; contentId: string; candidateId: string; editToken: string; mutationId: string }; result: CoverView };
  cancelCover: { args: { binding: LibraryBinding; reference: CoverReference; mutationId: string }; result: CoverView };
  candidateRaster: { args: { binding: LibraryBinding; contentId: string; candidateId: string }; result: { data: Uint8Array; mime: string } };
}
