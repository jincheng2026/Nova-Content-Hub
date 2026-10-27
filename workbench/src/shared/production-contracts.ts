import type {RadarQuery,RadarAdopt,RadarDecision} from './radar-contracts.ts';
import type {PlatformCatalog} from './platform-catalog.ts';
import type {LibraryBinding} from './contracts.ts';
import type * as Core from '../../../plugin-src/src/lib/file-library/production.d.ts';
export type {ProductionAccount, ProductionReference, ProductionTask, ProductionReport, ProductionCost, ProductionHistory, ProductionHistoryVersion} from '../../../plugin-src/src/lib/file-library/production.d.ts';
export interface ProductionSuggestion {id: string; bodyHash: string; quote: string; replacement: string; reason: string; status: 'pending'|'accepted'|'rejected'}
export interface ProductionAnnotation {id: string; bodyHash: string; quote: string; text: string; status: 'open'|'resolved'}
export interface ProductionCreation extends Omit<Core.ProductionCreation, 'suggestions'|'annotations'> {suggestions: ProductionSuggestion[]; annotations: ProductionAnnotation[]}
export interface ProductionSnapshot extends Omit<Core.ProductionSnapshot, 'creations'> {creations: ProductionCreation[]; assetUrls?: Record<string,string>}
export interface ProductionCreationState {content: {id: string; title: string; body: string; editToken: string; bodyHash: string; deletedAt: string|null}; creation: ProductionCreation|null; productionToken: string; history: Core.ProductionHistory}
export type ProductionManualOp = 'adoptResearchReferences'|'enable'|'saveAccount'|'trashAccount'|'restoreAccount'|'saveReport'|'trashReport'|'setReportPosition'|'ensureCreation'|'saveCreation'|'recordFeedback'|'recordKnowledge'|'decideKnowledge'|'reconcileCost';
export interface ProductionMutation {op: ProductionManualOp; input: Record<string,unknown>; mutationId: string}
export type ProductionTranscriptIntent = 'extract'|'correct'|'reextract';
export interface ProductionTranscriptStart {intent: ProductionTranscriptIntent; referenceId: string; expectedReferenceHash: string}
export interface ProductionStart {kind: Core.ProductionTask['kind']; title: string; prompt: string; contentId?: string; accountId?: string; mode: 'simple'|'detailed'; comments: boolean; workflow?: 'content-creation'; transcript?: ProductionTranscriptStart}
export type ProductionAction = {taskId: string; action: 'cancel'|'retry'; host?: Core.ProductionHost} | {taskId: string; action: 'accept'; expectedToken: string; attemptId: string; receiptHash: string} | {taskId:string; action:'reject'; expectedToken:string; attemptId:string; receiptHash:string; reason:string};
export interface ProductionDraft {contentId: string; body: string; editToken: string; bodyHash: string; productionToken: string; creationPatch: Partial<ProductionCreation>}
export type ProductionFileKind = 'images'|'report'|'media';
export interface ProductionFile {assetHash: string; originalName: string; detectedType: string; bytes: number; url?: string}
export type ProductionPending = {binding: Pick<LibraryBinding,'libraryId'|'rootIdentity'>; mutationId: string} & ({kind: 'mutate'; op: Core.ProductionMutation; input: Record<string,unknown>}|{kind:'draft'; input: ProductionDraft}|{kind:'files'; fileKind: ProductionFileKind; sources: string[]; hashes: string[]});
export interface ProductionInputs {
 createRadarTask:RadarQuery; adoptRadarResult:RadarAdopt; decideRadarCandidate:RadarDecision; openRadarSource:{reportId:string;candidateId:string};
 readPlatformCatalog: undefined; readProduction: undefined; mutateProduction: ProductionMutation; startProductionTask: ProductionStart; openProductionTask: {taskId:string; host?:Core.ProductionHost}; actProductionTask: ProductionAction; openProductionLink: {kind:'account'|'report'|'creation'|'task-archive'; id:string; pageId?:string}; chooseProductionFiles:{kind:ProductionFileKind}; readProductionCreation:{contentId:string}; saveProductionDraft:ProductionDraft; readProductionPending:undefined; recoverProductionPending:{action:'retry'|'discard'};
}
export interface ProductionResults {
 createRadarTask:{snapshot:ProductionSnapshot;opened:boolean;message?:string}; adoptRadarResult:ProductionSnapshot; decideRadarCandidate:ProductionSnapshot; openRadarSource:{opened:true};
 readPlatformCatalog:PlatformCatalog; readProduction:ProductionSnapshot; mutateProduction:ProductionSnapshot; startProductionTask:{snapshot:ProductionSnapshot; opened:boolean; message?:string}; openProductionTask:{opened:boolean; message?:string}; actProductionTask:ProductionSnapshot; openProductionLink:{opened:true;message?:string}; chooseProductionFiles:ProductionFile[]|null; readProductionCreation:ProductionCreationState; saveProductionDraft:ProductionCreationState; readProductionPending:{pending:boolean; message:string}; recoverProductionPending:ProductionSnapshot;
}
export interface ProductionReceipt {found:boolean; objectId?:string}
export interface ProductionToolIdentity {taskId:string; attemptId:string; claimToken:string; workerId:string; requestId:string}
export interface ProductionWorkerOperations {
 productionArchive:{args:{binding:LibraryBinding;taskId:string};result:Core.ProductionArchive};
 productionContext:{args:{binding:LibraryBinding;taskId:string};result:Core.ProductionContext};
 productionReserve:{args:{binding:LibraryBinding;input:ProductionToolIdentity & {service:string;usage?:Core.ProductionJSON};mutationId:string};result:ProductionSnapshot};
 productionTaskMutation:{args:{binding:LibraryBinding;op:'recordCost';input:ProductionToolIdentity & {status:'actual'|'measured'|'estimated'|'unknown'|'cancelled';amount:number|null;usage?:Core.ProductionJSON};mutationId:string};result:ProductionSnapshot};
 productionMediaGrant:{args:{binding:LibraryBinding;input:ProductionToolIdentity & {sourceReceiptId:string;sourceRequestId:string;requestHash:string;videoId:string;canonicalUrl:string;responseHash:string};source:string;mutationId:string};result:Core.ProductionMediaGrant};
 productionAsset:{args:{binding:LibraryBinding;taskId:string;attemptId:string;claimToken:string;workerId:string;audioPath:string};result:{data:Uint8Array;extension:string}};

 productionMedia:{args:{binding:LibraryBinding;contentId:string;assetHash:string};result:{data:Uint8Array;detectedType:string}};
 productionRead:{args:{binding:LibraryBinding};result:ProductionSnapshot};
 productionCreation:{args:{binding:LibraryBinding;contentId:string};result:ProductionCreationState};
 productionMutate:{args:{binding:LibraryBinding;pending:ProductionPending};result:ProductionSnapshot|ProductionCreationState|ProductionFile[]};
 productionRecover:{args:{binding:LibraryBinding;pending:ProductionPending};result:ProductionReceipt};
 productionReport:{args:{binding:LibraryBinding;reportId:string;pageId?:string};result:{html:string;report:Core.ProductionReport}};
}
