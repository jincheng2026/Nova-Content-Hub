import type {ProductionJSON,ProductionHost,ProductionTask} from './production.js';
export interface JourneyMember {journeyId:string;stepId:string;ownerEpoch:number}
export interface JourneyCheckpoint {taskId:string;stepId:string;kind:string;artifactId:string;hash:string;path:string;decisionId:string|null}
export interface JourneyState {evidenceBindings?:import('./journey-evidence.mjs').JourneyEvidenceBinding[];continuation?:{challengeHash?:string;expiresAt:string;host:ProductionHost;attemptId:string;ownerEpoch:number;consumedAt:string|null};sourceRebases?:{taskId:string;documentId:string;fromHash:string;toHash:string;mutationId:string}[];revision:number;ownerEpoch:number;status:'active'|'cancelled'|'complete';activeStepId:string;activeTaskId:string;members:{taskId:string;stepId:string;ownerEpoch:number;planIndex:number}[];checkpoints:JourneyCheckpoint[]}
export interface JourneyLimits {maxRequestsTotal:number;commentsAllowed:boolean;mediaCount:number;mediaBytes:67108864}
export interface JourneyStart {contentId:string;host:ProductionHost;method:'ordinary-writing'|'explicitly-selected-tutorial'|'explicitly-selected-kepu';researchPlan:ProductionJSON[];limits:JourneyLimits;serviceConfig:ProductionJSON;expectedToken:string}
export function validJourneyTask(task:ProductionTask,tasks:ProductionTask[]):boolean;

export function latestJourneyAuthorSave(runtimeRoot:string,actual:{sourceDocumentId:string;relativePath:string;hash:string}|null):string|null;
