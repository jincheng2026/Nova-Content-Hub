export type JinchengSupplementKey='bookmarks'|'accounts'|'reports'|'prompts'|'visuals'|'archives'|'methods';
export type JinchengSupplementFile={relativePath:string;hash:string;bytes:number};
export type JinchengSupplementPlan={format:'nova-jincheng-supplement-plan';schemaVersion:1;packageRoot:string;packageIdentity:{dev:string;ino:string};sources:{key:JinchengSupplementKey;role:string;relativePath:string;authority:string;entries:JinchengSupplementFile[]}[];totalBytes:number;issues:{key:string;relativePath:string;code:string;message:string}[];planHash:string};
export const JINCHENG_SUPPLEMENT_SOURCES:Readonly<Record<JinchengSupplementKey,{role:string;relativePath:string;authority:string}>>;
export function planJinchengSupplement(input:{packageRoot:string;selection:JinchengSupplementKey[]}):JinchengSupplementPlan;
export function importJinchengSupplement(input:{vaultRoot:string;packageRoot:string;selection:JinchengSupplementKey[];expectedPlanHash:string;expectedManifestHash:string|null;importId?:string}):{record:Record<string,unknown>;manifestHash:string;sourceMapHash:string};
