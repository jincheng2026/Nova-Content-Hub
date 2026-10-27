export interface Work {vaultId:string;workId:string}
export interface AuthorDecision {actor:'author';text:string;at:string}
export interface PublicationFacts {work:Work;revision:string;recorded:boolean;publication:{state:string;platforms:Record<string,any>;evidence?:string};archive:{state:string;directory:string|null;videoId:string|null;manifest:any};observations:any[];snapshots:any[];review:any;externalArchives:any[];unassociatedArchiveCandidates:any[];issues:string[];capabilities:{autoCollection:string;manualImport:string;observer:string};knowledge:{revision:string;candidates:any[];decisions:any[]}}
export interface BaseInput {work:Work;mutationId:string;expectedRevision?:string}
export interface PublicationInput extends BaseInput {publication:{platform:string;title:string;description:string;cover:string;url:string;publishedAt:string;postId?:string|null};finalScript:{text:string;hash:string};contentPackageId:string|null;authorDecision:AuthorDecision}
export interface SnapshotInput extends BaseInput {platform:string;checkpoint:'12h'|'7d';collectedAt:string;rawEvidence:string;metrics:Record<string,number|null>;delayReason?:string|null;authorDecision:AuthorDecision}
export interface ReviewInput extends BaseInput {review:{sections:{heading:string;text:string}[];actions:string[];comparisons:{source:string;quote:string;hash:string}[]};methodId:string;taskId:string}
export interface KnowledgeInput extends BaseInput {kind:'market-pattern'|'personal-judgment'|'case';text:string;evidence:{path:string;hash:string;quote:string}[];methodId:string;taskId:string}
export function readPublicationFacts(runtimeRoot:string,work:Work):PublicationFacts;
export function recordPublication(runtimeRoot:string,input:PublicationInput):{videoId:string;directory:string};
export function importSnapshot(runtimeRoot:string,input:SnapshotInput):{snapshotId:string;duplicate?:boolean};
export function proposeReview(runtimeRoot:string,input:ReviewInput):{candidateId:string;hash:string};
export function confirmReview(runtimeRoot:string,input:BaseInput&{candidateId:string;candidateHash:string;selectedActionIndex:number|null;authorDecision:AuthorDecision}):{confirmedHash:string};
export function proposeKnowledge(runtimeRoot:string,input:KnowledgeInput):{candidateId:string;hash:string};
export function decideKnowledge(runtimeRoot:string,input:BaseInput&{candidateId:string;candidateHash:string;decision:'accept'|'reject';authorDecision:AuthorDecision}):{decisionId:string;path:string|null};
export function readKnowledge(root:string,work?:Work):PublicationFacts['knowledge'];
export function readObservationDue(runtimeRoot:string,at?:Date):Array<{vaultId?:string;workId?:string;videoId?:string;platform?:string;checkpoint?:string;targetAt?:string;delayed?:boolean;mode?:string;message?:string;issue?:string;observation?:ObservationAuthorization;reservation?:{id:string;status:string}|null;postId?:string;url?:string;revision?:string}>;
export interface ObservationAuthorization {enabled:boolean;mode:string;provider:'tikhub';maxRequestsPerCheckpoint:1;maxUnits:number;unit:'REQ';authorizationId:string;authorDecision:AuthorDecision}
export interface ObservationReservation {work:Work;videoId:string;platform:string;postId:string;url:string;checkpoint:'12h'|'7d';targetAt:string;reservationId:string;requestId:string;freeze:ObservationAuthorization}
export type ObservationResult={state:'succeeded';rawEvidence:string;metrics:Record<string,number|null>;collectedAt:string;serviceReceipt:{requestId:string;[key:string]:unknown}}|{state:'failed'|'unknown';message:string;serviceReceipt?:Record<string,unknown>};
export function enableObservation(runtimeRoot:string,input:BaseInput&{enabled:boolean;provider:'tikhub';maxRequestsPerCheckpoint:1;maxUnits:number;authorDecision:AuthorDecision}):{observation:ObservationAuthorization};
export function reserveObservation(runtimeRoot:string,input:BaseInput&{platform:string;checkpoint:'12h'|'7d';authorizationId:string}):ObservationReservation;
export function finishObservation(runtimeRoot:string,input:BaseInput&{platform:string;checkpoint:'12h'|'7d';reservationId:string;result:ObservationResult}):unknown;

export const REVIEW_SECTIONS:readonly string[];

export function associateExternalArchive(runtimeRoot:string,input:BaseInput&{sourceId:string;videoId:string;manifestPath:string;expectedSourceHash:string;authorDecision:AuthorDecision}):unknown;
export function reconcileObservation(runtimeRoot:string,input:BaseInput&{platform:string;checkpoint:'12h'|'7d';reservationId:string},productionContext?:any):unknown;
