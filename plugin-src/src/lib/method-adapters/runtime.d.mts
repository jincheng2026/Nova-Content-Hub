import type {WorkRef} from '../vault/workflow.mjs';
export function readConfirmedCoverDesign(root:string,input:{work:WorkRef;artifactId:string;artifactHash:string}):{prompt:string;title:string;ratio:string;identity:'none'|'own-photo-required';designSource:{workId:string;vaultId:string;artifactId:string;artifactHash:string;methodId:string;taskId:string};design:Record<string,unknown>};
