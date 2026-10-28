export interface ResearchSampleDerivation {version:1;sourceOperation:'douyin-search';limit:number;selection:'response-order'}
export interface ResearchSearchScope {cursor:'0';search:{sortType:'general'|'likes'|'latest';timeRange:'any'|'day'|'week'|'half-year';contentType:'video'}}
export interface ResearchConfig {version:1;intakeContractVersion?:2;researchId:string;outputDirectory:string;route:'account'|'topic'|'comments'|'intake';platform:'douyin'|'xiaohongshu'|'manual';targetIds:string[];operations:('profile'|'user-posts'|'video'|'comments'|'douyin-search'|'user-search'|'xhs-search'|'xhs-profile')[];maxRequests:number;comments:boolean;videoIds?:string[];sampleLimit?:number;sampleDerivation?:ResearchSampleDerivation;searchScope?:ResearchSearchScope;commentMode?:'report'|'audience-depth'|'reference-card'|'diagnostic'}
export type ResearchSearchEvidence = {version:1;taskId:string;attemptId:string;requestHash:string;sourceRequestId:string;operation:'douyin-search';keyword:string;searchParamsHash:string;responseHash:string;policyHash:string;videoIds:string[];samples:import('./samples.mjs').SearchSample[];journey?:{journeyId:string;stepId:string;ownerEpoch:number}}
export function matchesResearchSearch(config:ResearchConfig,request:Record<string,unknown>):boolean;
export function researchSearchReservation(config:ResearchConfig,request:Record<string,unknown>):{operation:'douyin-search';id:string;searchParamsHash:string;policyHash:string};
export function createResearchSearchEvidence(task:unknown,attemptId:string,request:Record<string,unknown>,response:unknown):ResearchSearchEvidence;
export function readResearchSearchEvidence(task:unknown,costs:unknown[],attemptId:string,sourceRequestId?:string):ResearchSearchEvidence;
export function researchGrantAuthorized(task:unknown,costs:unknown[],attemptId:string,grant:unknown):boolean;
export function validateResearchConfig(value:unknown):ResearchConfig;
export function researchMediaAuthorized(task:unknown):boolean;
export function canonical(value:unknown):string;
export function hash(value:unknown):string;

export function deriveResearchVideoIds(response:unknown,limit:number):string[];
export function researchVideoAuthorized(task:unknown,costs:unknown[],attemptId:string,videoId:string):boolean;

export function withResearchEvidence<T>(task:T,evidence:import('../file-library/journey-evidence.mjs').JourneyEvidence|null|undefined):T;
export function researchEvidenceGrants(task:unknown):import('../file-library/production.d.ts').ProductionMediaGrant[];
