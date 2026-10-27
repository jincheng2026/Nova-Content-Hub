import fs from 'node:fs/promises';
import {validRadarQuery,radarQueryOperations,radarSearchFilters,radarPlatforms,radarSearchOperation,radarProfileOperation,radarPlatformSampleLimit,radarMissingAuthorIds,radarRequestLimit} from '../../../plugin-src/src/lib/file-library/radar.mjs';
import type {ProductionContext} from '../../../plugin-src/src/lib/file-library/production.d.ts';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import type {LibraryBinding,Worker} from '../shared/contracts.ts';
import type {ServiceSettingsValues,ServiceToolRequest} from '../shared/service-contracts.ts';
import {ServiceTools,ServiceToolError} from './service-tools.mts';
import {ServiceToolBroker} from './service-broker.mts';
export interface ProductionServiceOwner {worker:Worker;current():LibraryBinding}
export type ProductionRunQueue = <T>(action:()=>Promise<T>)=>Promise<T>;
const parameters=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
export function productionToolBroker(owner:ProductionServiceOwner,tools:ServiceTools,descriptorPath:string,runQueue:ProductionRunQueue=action=>action()):ServiceToolBroker {
 function checkServiceConfig(context:ProductionContext,request:ServiceToolRequest,prepared?:{config?:ServiceSettingsValues}){
  if(request.tool!=='model'&&request.tool!=='asr')return;
  const frozen=parameters(context.task?.request.parameters);
  // Legacy tasks did not save a serviceConfig. Do not invent a frozen provider for them.
  if(!Object.hasOwn(frozen,'serviceConfig'))return;
  const expected=parameters(parameters(frozen.serviceConfig)[request.tool]),current=tools.settings.read().values[request.tool];
  // Check what will actually execute as well as current settings: current may return to A after preparing B.
  const actual=[current,...(prepared?[prepared.config?.[request.tool]??{}]:[])];
  if(actual.some(config=>Object.keys(expected).length!==Object.keys(config).length||Object.entries(config).some(([key,value])=>expected[key]!==value)))throw new ServiceToolError('SERVICE_CONFIG_CHANGED');
 }
 function checkAccountPlatform(context:ProductionContext,request:ServiceToolRequest){
  if(request.tool!=='tikhub')return;const collection=parameters(context.task?.request.parameters).platformCollection;
  if(collection===undefined)return;
  const xhs=['xhs-search','xhs-profile'].includes(request.operation);
  if(collection==='douyin'?!xhs:collection==='xiaohongshu'?xhs:false)return;
  throw new ServiceToolError('PLATFORM_OPERATION_FORBIDDEN');
 }
 function frozenRadarLimit(context:ProductionContext){
  const task=context.task,frozen=parameters(task?.request.parameters),limit=frozen.maxRequestsPerTask,amount=task?.request.budget.amount;
  if(typeof limit!=='number'||!Number.isInteger(limit)||limit<1||limit>100||typeof amount!=='number'||!Number.isFinite(amount)||amount<0)throw new ServiceToolError('INVALID_BUDGET');
  return Math.min(limit,amount);
 }
 function checkRadar(context:ProductionContext,request:ServiceToolRequest){
  const task=context.task;if(!task)return;const frozen=parameters(task.request.parameters);if(frozen.workflow!=='viral-radar')return;
  frozenRadarLimit(context);
  const query=frozen.query;if(!validRadarQuery(query)||request.tool!=='tikhub'||!Array.isArray(frozen.operations)||!frozen.operations.includes(request.operation)||!radarQueryOperations(query).includes(request.operation))throw new ServiceToolError('RADAR_OPERATION_FORBIDDEN');
  const prior=context.snapshot.costs.filter(c=>c.taskId===task.id),rows=prior.filter(c=>c.attemptId===request.attemptId).map(c=>parameters(c.usage));
  if(rows.some(x=>x.operation===request.operation&&x.id===request.id))throw new ServiceToolError('RADAR_REQUEST_LIMIT');
  const searchOperation=request.operation==='profile'?'douyin-search':request.operation==='xhs-profile'?'xhs-search':request.operation,platform=radarPlatforms(query).find(value=>radarSearchOperation(value)===searchOperation);
  if(!platform)throw new ServiceToolError('RADAR_OPERATION_FORBIDDEN');
  if(!radarPlatformSampleLimit(query,platform,frozen.operations))throw new ServiceToolError('RADAR_SAMPLE_LIMIT');
  if(request.operation===radarSearchOperation(platform)){if(request.id!==query.direction||(request.cursor!==undefined&&request.cursor!=='0')||!request.search||Object.keys(radarSearchFilters(query)).some(k=>parameters(request.search)[k]!==parameters(radarSearchFilters(query))[k])||rows.some(x=>x.operation===request.operation))throw new ServiceToolError('RADAR_QUERY_MISMATCH');}
  else if(request.operation===radarProfileOperation(platform)){if(request.cursor!==undefined||!rows.some(x=>x.operation===searchOperation&&Array.isArray(x.radarAuthorIds)&&x.radarAuthorIds.includes(request.id))||rows.filter(x=>x.operation===request.operation).length>=radarPlatformSampleLimit(query,platform,frozen.operations))throw new ServiceToolError('RADAR_AUTHOR_FORBIDDEN');}
  else throw new ServiceToolError('RADAR_OPERATION_FORBIDDEN');
 }
 return new ServiceToolBroker({descriptorPath,execute:async(request:ServiceToolRequest)=>{
  // Bind once. Later settlement remains attached to this library even when the user switches libraries.
  const initial=await runQueue(async()=>{
   const binding=owner.current(),context=await owner.worker.call('productionContext',{binding,taskId:request.taskId});
   const task=context.task,attempt=task?.attempts.find(a=>a.id===request.attemptId);
   if(!task||task.activeAttemptId!==request.attemptId||!attempt||attempt.claimToken!==request.claimToken||attempt.workerId!==request.workerId||!['claimed','waiting-user','waiting-permission'].includes(attempt.status)||!task.request.tools.includes(request.tool))throw new ServiceToolError('CLAIM_MISMATCH');
   checkRadar(context,request);checkServiceConfig(context,request);checkAccountPlatform(context,request);
   const frozen=parameters(task.request.parameters),current=tools.settings.read().values;
   if(request.tool==='tikhub'&&request.operation==='comments'&&!(current.commentsEnabled&&frozen.comments===true&&current.budget.enabled&&frozen.budgetEnabled===true))throw new ServiceToolError('COMMENTS_DISABLED');
   return {binding,workerId:attempt.workerId,isRadar:frozen.workflow==='viral-radar'};
  });
  const identity={taskId:request.taskId,attemptId:request.attemptId,claimToken:request.claimToken,workerId:initial.workerId,requestId:request.requestId};
  let temp:string|undefined;
  try{
   let input=request;
   if(request.tool==='asr'){
    const audio=await runQueue(()=>owner.worker.call('productionAsset',{binding:initial.binding,taskId:request.taskId,attemptId:request.attemptId,claimToken:request.claimToken,workerId:initial.workerId,audioPath:request.audioPath}));
    if(!/^\.[a-z0-9]{2,5}$/.test(audio.extension)||audio.data.byteLength>64*1024*1024)throw new ServiceToolError('INVALID_AUDIO');
    temp=await fs.mkdtemp(path.join(os.tmpdir(),'nova-production-asr-'));const audioPath=path.join(temp,`audio${audio.extension}`);await fs.writeFile(audioPath,audio.data,{flag:'wx',mode:0o600});input={...request,audioPath};
   }
   let successOutcome:{service:string;requestsUsed:0|1|null;ok:boolean;usage?:Record<string,number|string|null>}|undefined;
   const settle=(outcome:{service:string;requestsUsed:0|1|null;ok:boolean;usage?:Record<string,number|string|null>},radarAuthorIds?:string[])=>runQueue(async()=>{
    await owner.worker.call('productionTaskMutation',{binding:initial.binding,op:'recordCost',input:{...identity,status:outcome.requestsUsed===null?'unknown':'measured',amount:outcome.requestsUsed,usage:{...outcome.usage,requests:outcome.requestsUsed,ok:outcome.ok,...(initial.isRadar&&request.tool==='tikhub'?{operation:request.operation,id:request.id}:{}),...(radarAuthorIds?{radarAuthorIds}:{})}},mutationId:randomUUID()});
   });
   const result=await tools.execute(input,{
    beforeExecute:async prepared=>runQueue(async()=>{
     const currentBinding=owner.current();if(currentBinding.libraryId!==initial.binding.libraryId||currentBinding.root!==initial.binding.root)throw new ServiceToolError('LIBRARY_CHANGED');
     const context=await owner.worker.call('productionContext',{binding:initial.binding,taskId:request.taskId});const task=context.task,attempt=task?.attempts.find(a=>a.id===request.attemptId);
     if(!task||task.activeAttemptId!==request.attemptId||attempt?.claimToken!==request.claimToken||attempt?.workerId!==identity.workerId||!['claimed','waiting-user','waiting-permission'].includes(attempt.status)||!task.request.tools.includes(request.tool))throw new ServiceToolError('CLAIM_MISMATCH');
     if(context.snapshot.costs.some(c=>c.taskId===task.id&&['reserved','unknown'].includes(c.status)))throw new ServiceToolError('COST_UNKNOWN');
     checkRadar(context,request);checkServiceConfig(context,request,prepared);checkAccountPlatform(context,request);
     const frozen=parameters(task.request.parameters),current=tools.settings.read().values;
     if(request.tool==='tikhub'&&request.operation==='comments'&&!(current.commentsEnabled&&frozen.comments===true&&current.budget.enabled&&frozen.budgetEnabled===true))throw new ServiceToolError('COMMENTS_DISABLED');
     if(prepared.requests===1){
      if(!current.budget.enabled||frozen.budgetEnabled!==true)throw new ServiceToolError('BUDGET_DISABLED');
      const used=context.snapshot.costs.filter(c=>c.taskId===task.id&&c.status!=='cancelled').reduce((sum,c)=>sum+(c.amount??1),0);
      if(used+1>(initial.isRadar?Math.min(current.budget.maxRequestsPerTask,frozenRadarLimit(context),validRadarQuery(frozen.query)?radarRequestLimit(frozen.query):0):current.budget.maxRequestsPerTask))throw new ServiceToolError('BUDGET_EXCEEDED');
     }
     await owner.worker.call('productionReserve',{binding:initial.binding,input:{...identity,service:prepared.service,usage:{requests:prepared.requests,...(initial.isRadar&&request.tool==='tikhub'?{operation:request.operation,id:request.id}:{})}},mutationId:randomUUID()});
    }),
    afterExecute:async outcome=>{if(outcome.ok&&initial.isRadar)successOutcome=outcome;else await settle(outcome);}
   });
   let radarAuthorIds:string[]|undefined;
   if(initial.isRadar&&request.tool==='tikhub'&&['douyin-search','xhs-search'].includes(request.operation)){const context=await runQueue(()=>owner.worker.call('productionContext',{binding:initial.binding,taskId:request.taskId})),frozen=parameters(context.task?.request.parameters);if(frozen.workflow==='viral-radar'&&validRadarQuery(frozen.query)&&Array.isArray(frozen.operations)){const platform=radarPlatforms(frozen.query).find(value=>radarSearchOperation(value)===request.operation);if(platform)radarAuthorIds=radarMissingAuthorIds(result.data,frozen.query,platform,frozen.operations);}}
   if(successOutcome)await settle(successOutcome,radarAuthorIds);
   return result;
  }finally{if(temp)await fs.rm(temp,{recursive:true,force:true});}
 }});
}
