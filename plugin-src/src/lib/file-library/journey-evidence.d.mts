import type {ProductionTask,ProductionCost,ProductionMediaGrant} from './production.d.ts';
export interface JourneyEvidenceBinding {targetTaskId:string;targetAttemptId:string;ownerEpoch:number;sourceTaskId:string;sourceAttemptId:string;sourceRequestHash:string;researchId:string;costIds:string[];grantIds:string[];files:{relativePath:string;hash:string;bytes:number}[]}
export interface JourneyEvidence {inherited:JourneyEvidence|null;binding:JourneyEvidenceBinding;sourceTask:ProductionTask;sourceAttemptId:string;costs:ProductionCost[];mediaGrants:ProductionMediaGrant[]}
