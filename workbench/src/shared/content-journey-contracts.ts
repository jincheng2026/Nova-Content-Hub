import type {ProductionSnapshot} from './production-contracts.ts';
import type {VaultWorkContext} from './vault-contracts.ts';
import type {ProductionJSON} from '../../../plugin-src/src/lib/file-library/production.d.ts';
export interface ContentJourneyStart {scope:string;contentId:string;method:'ordinary-writing'|'explicitly-selected-tutorial'|'explicitly-selected-kepu';researchPlan:ProductionJSON[];limits:{maxRequestsTotal:number;commentsAllowed:boolean;mediaCount:number;mediaBytes:67108864};mutationId:string}
export function validContentJourneyStart(value:unknown):value is ContentJourneyStart {
 if(!value||typeof value!=='object'||Array.isArray(value))return false;const v=value as Record<string,unknown>,uuid=(x:unknown)=>typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(x);
 return Object.keys(v).length===6&&typeof v.scope==='string'&&/^[a-f0-9]{64}$/.test(v.scope)&&['scope','contentId','method','researchPlan','limits','mutationId'].every(k=>Object.hasOwn(v,k))&&uuid(v.contentId)&&uuid(v.mutationId)&&['ordinary-writing','explicitly-selected-tutorial','explicitly-selected-kepu'].includes(v.method as string)&&Array.isArray(v.researchPlan)&&v.researchPlan.length<=10&&!!v.limits&&typeof v.limits==='object'&&!Array.isArray(v.limits)&&Object.keys(v.limits).length===4;
}

export interface JourneyRefresh {scope:string;journeyId:string;expectedJourneyRevision:number;expectedStepId:string;sourceMutationId:string;mutationId:string}
export interface JourneyContinuation {scope:string;journeyId:string;expectedJourneyRevision:number;expectedStepId:string;rootAttemptId:string;childAttemptId:string;host:'codex'|'workbuddy';mutationId:string}
export interface ContentJourneyInputs {readContentJourney:{contentId:string};startContentJourney:ContentJourneyStart;refreshContentJourneySource:JourneyRefresh;prepareContentJourneyContinuation:JourneyContinuation;copyContentJourneyText:{journeyId:string;scope:string};cancelContentJourney:{scope:string;journeyId:string;expectedJourneyRevision:number;mutationId:string}}
export interface ContentJourneyResults {readContentJourney:{snapshot:ProductionSnapshot;work:VaultWorkContext|null;authorSaveMutationId:string|null};startContentJourney:{snapshot:ProductionSnapshot;opened:boolean;message?:string};refreshContentJourneySource:ProductionSnapshot;prepareContentJourneyContinuation:{snapshot:ProductionSnapshot;handoff:{id:string;prompt:string;challenge:string;host:'codex'|'workbuddy';expiresAt:string}};copyContentJourneyText:{text:string};cancelContentJourney:ProductionSnapshot}
const id=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
export function contentJourneyDesktopInput(method:string,value:unknown):boolean|undefined{
 const shapes:Record<string,string[]>={readContentJourney:['contentId'],refreshContentJourneySource:['scope','journeyId','expectedJourneyRevision','expectedStepId','sourceMutationId','mutationId'],prepareContentJourneyContinuation:['scope','journeyId','expectedJourneyRevision','expectedStepId','rootAttemptId','childAttemptId','host','mutationId'],copyContentJourneyText:['scope','journeyId'],cancelContentJourney:['scope','journeyId','expectedJourneyRevision','mutationId']};
 if(method==='startContentJourney')return validContentJourneyStart(value);if(!Object.hasOwn(shapes,method))return undefined;
 if(!value||typeof value!=='object'||Array.isArray(value))return false;const v=value as Record<string,unknown>,keys=shapes[method];if(Object.keys(v).length!==keys.length||!keys.every(k=>Object.hasOwn(v,k)))return false;
 return Object.entries(v).every(([k,x])=>k==='scope'?typeof x==='string'&&/^[a-f0-9]{64}$/.test(x):k==='expectedJourneyRevision'?Number.isSafeInteger(x)&&(x as number)>0:k==='host'?['codex','workbuddy'].includes(x as string):k==='sourceMutationId'?typeof x==='string'&&/^[A-Za-z0-9_-]{8,100}$/.test(x):id(x));
}
