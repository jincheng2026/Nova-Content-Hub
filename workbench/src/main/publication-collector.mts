import {randomUUID} from 'node:crypto';
// @ts-expect-error The existing production CLI client is JavaScript; its response is validated below.
import {callServiceTool} from '../../../plugin-src/src/lib/service-tools/client.mjs';
import type {ObservationReservation,ObservationResult} from '../../../plugin-src/src/lib/publication-runtime/index.d.mts';
import type {ProductionContext,ProductionCost,ProductionResult} from '../../../plugin-src/src/lib/file-library/production.d.ts';
import type {LibraryBinding,Worker} from '../shared/contracts.ts';
import type {ServiceSettingsView,ServiceToolResult} from '../shared/service-contracts.ts';
import type {ProductionController} from './production-controller.mts';
import type {ProductionRunQueue} from './production-services.mts';

interface CollectorOptions {
 controller:ProductionController;
 worker:Worker;
 descriptorPath:string;
 settings:{read():ServiceSettingsView};
 runOperation:ProductionRunQueue;
 ensureVideoFreshness?(id:string,targetAt:string):Promise<void>;
}
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const uuid=(value:unknown)=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
function fail(code:string):never {throw Object.assign(new Error(code),{code});}
const errorCode=(error:unknown)=>{const code=object(error).code;return typeof code==='string'&&/^[A-Z_]{1,80}$/.test(code)?code:'OBSERVATION_FAILED';};
const sameBinding=(a:LibraryBinding,b:LibraryBinding)=>a.libraryId===b.libraryId&&a.root===b.root&&a.rootIdentity.dev===b.rootIdentity.dev&&a.rootIdentity.ino===b.rootIdentity.ino;
const validObservation=(o:ObservationReservation)=>o?.platform==='douyin'&&/^\d{1,32}$/.test(o.postId)&&o.url===`https://www.douyin.com/video/${o.postId}`&&['12h','7d'].includes(o.checkpoint)&&Number.isFinite(Date.parse(o.targetAt))&&Date.parse(o.targetAt)<=Date.now()&&uuid(o.reservationId)&&uuid(o.requestId)&&o.freeze?.enabled===true&&o.freeze.provider==='tikhub'&&o.freeze.maxRequestsPerCheckpoint===1&&o.freeze.maxUnits===1&&o.freeze.unit==='REQ'&&uuid(o.freeze.authorizationId)&&o.freeze.authorDecision?.actor==='author'&&typeof o.freeze.authorDecision.text==='string'&&!!o.freeze.authorDecision.text.trim()&&Number.isFinite(Date.parse(o.freeze.authorDecision.at));

/** Uses only the claimed production broker. No credentials or provider HTTP enter this adapter. */
export function createPublicationCollector(options:CollectorOptions){
 const {controller,worker,descriptorPath,settings,runOperation}=options;
 const isReady=()=>{try{const current=settings.read();return current.encryptionAvailable===true&&current.credentials.tikhub.hasKey===true&&current.values.budget.enabled===true&&current.values.budget.maxRequestsPerTask>=1;}catch{return false;}};
 const current=(binding:LibraryBinding)=>{if(!sameBinding(controller.owner.current(),binding))fail('LIBRARY_CHANGED');};
 const exclusive=<T,>(action:()=>Promise<T>)=>runOperation(()=>controller.owner.exclusive(action));
 async function collectOnce({binding,observation:o}:{binding:LibraryBinding;observation:ObservationReservation}):Promise<ObservationResult>{
  if(!validObservation(o))return{state:'failed',message:'OBSERVATION_NOT_AUTHORIZED'};
  if(!isReady())return{state:'failed',message:'SERVICE_NOT_READY'};
  let identity:{taskId:string;attemptId:string;claimToken:string;workerId:'native-publication-observer'}|undefined;
  try{
   identity=await exclusive(async()=>{
    current(binding);controller.owner.noPending();
    const snapshot=await worker.call('productionRead',{binding});
    // Scope is the deterministic native task identity; an existing task is never retried implicitly.
    const existing=snapshot.tasks.find(task=>{const p=object(task.request.parameters),scope=object(p.publicationScope);return p.workflow==='publication-observe'&&p.executor==='native-observer'&&(scope.reservationId===o.reservationId||scope.requestId===o.requestId||scope.postId===o.postId&&scope.checkpoint===o.checkpoint&&scope.consentId===o.freeze.authorizationId);});
    if(existing)fail('OBSERVATION_ALREADY_ATTEMPTED');
    // consentId is the frozen authorizationId. The production secret-key validator forbids keys named authorization*.
    const publicationScope={postId:o.postId,checkpoint:o.checkpoint,consentId:o.freeze.authorizationId,reservationId:o.reservationId,requestId:o.requestId};
    const written=await controller.write({...controller.pendingBase(),kind:'mutate',op:'createTask',input:{kind:'research',title:`发布观察 · ${o.checkpoint}`,prompt:'本机原生观察：仅查询本次固定抖音发布对象一次并记录真实服务回执，不调用模型、不采集评论、不发布内容。',contentId:null,accountId:null,host:'codex',parameters:{workflow:'publication-observe',executor:'native-observer',publicationScope,comments:false,budgetEnabled:true,maxRequestsPerTask:1},tools:['tikhub'],budget:{amount:1,currency:'REQ'},bodyHash:null,expectedToken:snapshot.editToken}});
    if(!written||!('tasks'in written))fail('OBSERVATION_TASK_UNCONFIRMED');
    const task=written.tasks.find(task=>object(object(task.request.parameters).publicationScope).requestId===o.requestId);if(!task)fail('OBSERVATION_TASK_UNCONFIRMED');
    const claimed={taskId:task.id,attemptId:task.activeAttemptId,claimToken:randomUUID(),workerId:'native-publication-observer' as const};
    await worker.call('productionObserverMutation',{binding,op:'claimTask',input:claimed,mutationId:randomUUID()});return claimed;
   });
   // The HTTP broker re-enters runOperation for claim checks, reservation and settlement.
   // Releasing both queues here is required to avoid deadlocking its own authorization.
   await options.ensureVideoFreshness?.(o.postId,o.targetAt);
   const result=await callServiceTool(descriptorPath,{...identity,requestId:o.requestId,tool:'tikhub',operation:'video',id:o.postId}) as ServiceToolResult;
   return await exclusive(async()=>{
    current(binding);
    const context=await worker.call('productionContext',{binding,taskId:identity!.taskId}),cost=context.snapshot.costs.find(cost=>cost.taskId===identity!.taskId&&cost.attemptId===identity!.attemptId&&cost.requestId===o.requestId),evidence=object(object(result.data).observationEvidence);
    if(!cost||cost.service!=='tikhub'||!['measured','actual','billed'].includes(cost.status)||cost.amount===null)fail('COST_UNKNOWN');
    if(result.service!=='tikhub'||!evidence.postIdMatched||typeof evidence.responseHash!=='string'||!/^[a-f0-9]{64}$/.test(evidence.responseHash)||!Object.hasOwn(evidence,'raw'))fail('INVALID_OBSERVATION_EVIDENCE');
    if(!Number.isFinite(Date.parse(result.collectedAt))||Date.parse(result.collectedAt)<Date.parse(o.targetAt)||Date.parse(result.collectedAt)>Date.now()+60000)fail('OBSERVATION_STALE');
    const metrics=object(evidence.metrics) as Record<string,number|null>;
    if(Object.keys(metrics).sort().join(',')!=='collect,comments,like,play,share'||Object.values(metrics).some(value=>value!==null&&!(typeof value==='number'&&Number.isFinite(value)&&value>=0)))fail('INVALID_OBSERVATION_EVIDENCE');
    const serviceReceipt={requestId:o.requestId,taskId:identity!.taskId,attemptId:identity!.attemptId,requestHash:context.task!.requestHash,costId:cost.id,service:cost.service,status:cost.status,amount:cost.amount,currency:cost.currency,usage:cost.usage,collectedAt:result.collectedAt,cacheHit:result.cacheHit,responseHash:evidence.responseHash};
    const taskResult:ProductionResult={summary:`原生发布观察 ${o.checkpoint} 已采集，服务回执已登记。`,artifacts:[{id:randomUUID(),kind:'analysis',title:`发布观察 ${o.checkpoint}`,text:JSON.stringify({postId:o.postId,checkpoint:o.checkpoint,metrics,collectedAt:result.collectedAt,serviceReceipt}),assetHash:null,data:{postId:o.postId,checkpoint:o.checkpoint,metrics,collectedAt:result.collectedAt,serviceReceipt}}]};
    await worker.call('productionObserverMutation',{binding,op:'submitTask',input:{...identity!,result:taskResult},mutationId:randomUUID()});
    const submitted=await worker.call('productionContext',{binding,taskId:identity!.taskId}),receipt=submitted.attempt?.receipt;
    if(submitted.attempt?.status!=='submitted'||!receipt)fail('OBSERVATION_TASK_UNCONFIRMED');
    const finalReceipt={...serviceReceipt,productionReceipt:{...receipt}};
    const rawEvidence=JSON.stringify({provider:'tikhub',postId:o.postId,checkpoint:o.checkpoint,collectedAt:result.collectedAt,metrics,responseHash:evidence.responseHash,raw:evidence.raw,serviceReceipt:finalReceipt});
    if(rawEvidence.length>2000000)fail('OBSERVATION_EVIDENCE_TOO_LARGE');
    return {state:'succeeded',rawEvidence,metrics,collectedAt:result.collectedAt,serviceReceipt:finalReceipt};
   });
  }catch(error){
   let cost:ProductionCost|undefined,context:ProductionContext|undefined;
   if(identity)try{await exclusive(async()=>{
    // Cost evidence belongs to the original binding even if the foreground library has changed.
    context=await worker.call('productionContext',{binding,taskId:identity!.taskId});cost=context.snapshot.costs.find(cost=>cost.taskId===identity!.taskId&&cost.requestId===o.requestId);
    if(sameBinding(controller.owner.current(),binding)&&context.attempt&&['claimed','waiting-user','waiting-permission'].includes(context.attempt.status))await worker.call('productionObserverMutation',{binding,op:'failTask',input:{...identity!,failure:{code:errorCode(error),message:errorCode(error)}},mutationId:randomUUID()});
   });}catch{/* Preserve the original reservation when bookkeeping cannot be verified. */}
   const uncertain=errorCode(error)==='OBSERVATION_ALREADY_ATTEMPTED'||errorCode(error)==='COST_UNKNOWN'||!!identity&&(!context||!!cost&&['reserved','unknown'].includes(cost.status));
   return {state:uncertain?'unknown':'failed',message:errorCode(error),...(cost?{serviceReceipt:{requestId:o.requestId,taskId:cost.taskId,attemptId:cost.attemptId,costId:cost.id,service:cost.service,status:cost.status,amount:cost.amount,currency:cost.currency}}:{})};
  }
 }
 return {isReady,collectOnce};
}
