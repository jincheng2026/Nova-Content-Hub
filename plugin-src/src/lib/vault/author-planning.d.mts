export type AuthorPlanningStatus='todo'|'paused'|'written';
export interface AuthorPlanningSourcePin {documentId:string;relativePath:string;hash:string}
export interface AuthorPlanningDecision {status:AuthorPlanningStatus|null;reason:string;sourcePins:AuthorPlanningSourcePin[];at:string;mutationId:string}
export interface AuthorPlanningView {
 contentId:string;work:{vaultId:string;workId:string};relativePath:string;revision:string|null;
 status:AuthorPlanningStatus|null;reason:string;sourcePins:AuthorPlanningSourcePin[];
 decisionSourcePins:AuthorPlanningSourcePin[]|null;stale:boolean;derivedStatus:AuthorPlanningStatus;effectiveStatus:AuthorPlanningStatus;
 sourceStatus:string|null;facts:{hasDraft:boolean;recorded:boolean;published:boolean;paused:boolean};
 updatedAt:string|null;history:AuthorPlanningDecision[];notice:string;
}
export interface SetAuthorPlanningStatusInput {contentId:string;status:AuthorPlanningStatus|null;reason:string;expectedRevision:string|null;sourcePins:AuthorPlanningSourcePin[]}
export interface AuthorPlanningStatuses {entries:{contentId:string;value:AuthorPlanningView|null;issue:string|null}[]}
export function readAuthorPlanningStatuses(runtimeRoot:string):AuthorPlanningStatuses;
export function readAuthorPlanningStatus(runtimeRoot:string,contentId:string):AuthorPlanningView;
export function setAuthorPlanningStatus(runtimeRoot:string,input:SetAuthorPlanningStatusInput,options:{mutationId:string}):AuthorPlanningView;
export function validateAuthorPlanningReceipt(root:string,receipt:unknown):{
 format:'nova-author-planning';schemaVersion:1;work:{vaultId:string;workId:string};contentId:string;
 rootIdentity:{dev:string;ino:string};status:AuthorPlanningStatus|null;reason:string;
 sourcePins:AuthorPlanningSourcePin[];updatedAt:string;mutationId:string;version:number;history:AuthorPlanningDecision[];
};
