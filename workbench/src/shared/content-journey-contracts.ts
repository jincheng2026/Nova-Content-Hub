import type {ProductionJSON} from '../../../plugin-src/src/lib/file-library/production.d.ts';
export interface ContentJourneyStart {contentId:string;method:'ordinary-writing'|'explicitly-selected-tutorial'|'explicitly-selected-kepu';researchPlan:ProductionJSON[];limits:{maxRequestsTotal:number;commentsAllowed:boolean;mediaCount:number;mediaBytes:67108864};mutationId:string}
export function validContentJourneyStart(value:unknown):value is ContentJourneyStart {
 if(!value||typeof value!=='object'||Array.isArray(value))return false;const v=value as Record<string,unknown>,uuid=(x:unknown)=>typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(x);
 return Object.keys(v).length===5&&['contentId','method','researchPlan','limits','mutationId'].every(k=>Object.hasOwn(v,k))&&uuid(v.contentId)&&uuid(v.mutationId)&&['ordinary-writing','explicitly-selected-tutorial','explicitly-selected-kepu'].includes(v.method as string)&&Array.isArray(v.researchPlan)&&v.researchPlan.length<=10&&!!v.limits&&typeof v.limits==='object'&&!Array.isArray(v.limits)&&Object.keys(v.limits).length===4;
}
