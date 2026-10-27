export interface ResearchConfig {version:1;researchId:string;outputDirectory:string;route:'account'|'topic'|'comments'|'intake';platform:'douyin'|'xiaohongshu'|'manual';targetIds:string[];operations:('profile'|'user-posts'|'video'|'comments'|'douyin-search'|'user-search'|'xhs-search'|'xhs-profile')[];maxRequests:number;comments:boolean;videoIds?:string[];sampleLimit?:number;commentMode?:'report'|'audience-depth'|'reference-card'|'diagnostic'}
export function validateResearchConfig(value:unknown):ResearchConfig;
export function researchMediaAuthorized(task:unknown):boolean;
export function canonical(value:unknown):string;
export function hash(value:unknown):string;

export function deriveResearchVideoIds(response:unknown,limit:number):string[];
export function researchVideoAuthorized(task:unknown,costs:unknown[],attemptId:string,videoId:string):boolean;
