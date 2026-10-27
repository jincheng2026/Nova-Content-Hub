import fs from 'node:fs/promises';
import {isDeepStrictEqual} from 'node:util';
import {normalizeAsrSettings,serviceAsrSettings} from '../shared/service-validation.ts';
import {validRadarQuery,radarQueryOperations,radarSearchFilters,radarPlatforms,radarSearchOperation,radarProfileOperation,radarPlatformSampleLimit,radarMissingAuthorIds,radarRequestLimit} from '../../../plugin-src/src/lib/file-library/radar.mjs';
import type {ProductionContext} from '../../../plugin-src/src/lib/file-library/production.d.ts';
import os from 'node:os';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {downloadProductionMedia} from './production-media.mts';
import type {LibraryBinding,Worker} from '../shared/contracts.ts';
import type {ServiceSettingsValues,ServiceToolRequest} from '../shared/service-contracts.ts';
import {ServiceTools,ServiceToolError} from './service-tools.mts';
import {ServiceToolBroker} from './service-broker.mts';
export interface ProductionServiceOwner {worker:Worker;current():LibraryBinding}
export type ProductionRunQueue = <T>(action:()=>Promise<T>)=>Promise<T>;
const parameters=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
export function productionToolBroker(owner:ProductionServiceOwner,tools:ServiceTools,descriptorPath:string,runQueue:ProductionRunQueue=action=>action()):ServiceToolBroker {
 const receipts=new Map<string,{id:string;videoId:string;canonicalUrl:string;responseHash:string;url:string;requestId:string;taskId:string;attemptId:string;workerId:string;requestHash:string;claimToken:string;libraryId:string;root:string;expires:number;busy?:boolean}>();
 function checkMedia(context:ProductionContext){
  const task=context.task,config=parameters(parameters(task?.request.parameters).media);
  if(!task?.contentId||parameters(context.content).deletedAt||!context.creation||context.creation.contentId!==task.contentId||!task.request.tools.includes('media')||!task.request.tools.includes('tikhub')||Object.keys(config).sort().join(',')!=='maxBytes,maxDownloads,version'||config.version!==1||config.maxDownloads!==3||config.maxBytes!==67108864)throw new ServiceToolError('MEDIA_NOT_AUTHORIZED');
  // Cache hits do not bypass the user's current TikHub authorization.
  tools.settings.secret('tikhub');
 }
 function mediaSource(data:unknown,videoId:string){
  const top=parameters(data),inner=parameters(top.data),detail=parameters(inner.aweme_detail??top.aweme_detail??inner.aweme_details??inner),video=parameters(detail.video);
  if(String(detail.aweme_id??detail.id??'')!==videoId)throw new ServiceToolError('INVALID_MEDIA_SOURCE');
  const address=parameters(video.play_addr),urls=address.url_list;
  const url=Array.isArray(urls)?urls.find((value):value is string=>typeof value==='string'&&value.startsWith('https://')):undefined;
  if(!url||url.length>8192)throw new ServiceToolError('MEDIA_SOURCE_UNAVAILABLE');
  return{url,title:typeof detail.desc==='string'?detail.desc.slice(0,10000):'',description:typeof detail.desc==='string'?detail.desc.slice(0,10000):''};
 }
 function checkServiceConfig(context:ProductionContext,request:ServiceToolRequest,prepared?:{config?:ServiceSettingsValues}){
  if(request.tool!=='model'&&request.tool!=='asr')return;
  const frozen=parameters(context.task?.request.parameters);
  // Legacy tasks did not save a serviceConfig. Do not invent a frozen provider for them.
  if(!Object.hasOwn(frozen,'serviceConfig'))return;
  const expected=parameters(parameters(frozen.serviceConfig)[request.tool]),current=tools.settings.read().values[request.tool];
  // Check what will actually execute as well as current settings: current may return to A after preparing B.
  const actual=[current,...(prepared?[prepared.config?.[request.tool]??{}]:[])];
  const equivalent=(config:unknown)=>request.tool==='asr'?serviceAsrSettings(expected)&&serviceAsrSettings(config)&&isDeepStrictEqual(normalizeAsrSettings(expected),normalizeAsrSettings(config)):isDeepStrictEqual(expected,config);
  if(actual.some(config=>!equivalent(config)))throw new ServiceToolError('SERVICE_CONFIG_CHANGED');
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
   if(request.tool==='media')checkMedia(context);
   const frozen=parameters(task.request.parameters),current=tools.settings.read().values;
   if(request.tool==='tikhub'&&request.operation==='comments'&&!(current.commentsEnabled&&frozen.comments===true&&current.budget.enabled&&frozen.budgetEnabled===true))throw new ServiceToolError('COMMENTS_DISABLED');
   return {binding,workerId:attempt.workerId,isRadar:frozen.workflow==='viral-radar',requestHash:task.requestHash};
  });
  const identity={taskId:request.taskId,attemptId:request.attemptId,claimToken:request.claimToken,workerId:initial.workerId,requestId:request.requestId};
  let temp:string|undefined;
  try{
   if(request.tool==='media') {
    let receipt:ReturnType<typeof receipts.get>;
    const existing=await runQueue(async()=>{
     const current=owner.current();if(current.libraryId!==initial.binding.libraryId||current.root!==initial.binding.root)throw new ServiceToolError('LIBRARY_CHANGED');
     const context=await owner.worker.call('productionContext',{binding:initial.binding,taskId:request.taskId}),task=context.task,attempt=task?.attempts.find(a=>a.id===request.attemptId);
     if(!task||task.activeAttemptId!==request.attemptId||attempt?.claimToken!==request.claimToken||attempt?.workerId!==request.workerId||!['claimed','waiting-user','waiting-permission'].includes(attempt.status))throw new ServiceToolError('CLAIM_MISMATCH');checkMedia(context);
     const existing=attempt.mediaGrants?.find(g=>g.sourceReceiptId===request.sourceReceiptId&&g.requestHash===task.requestHash);if(existing)return existing;
     receipt=receipts.get(request.sourceReceiptId);
     if(!receipt||receipt.expires<Date.now()||receipt.libraryId!==initial.binding.libraryId||receipt.root!==initial.binding.root||receipt.taskId!==task.id||receipt.attemptId!==attempt.id||receipt.workerId!==request.workerId||receipt.claimToken!==request.claimToken||receipt.requestHash!==task.requestHash)throw new ServiceToolError('MEDIA_RECEIPT_EXPIRED');
     if(receipt.busy)throw new ServiceToolError('REQUEST_IN_PROGRESS');
     const pending=[...receipts.values()].filter(r=>r.taskId===task.id&&r.attemptId===attempt.id&&r.busy).length;
     if((attempt.mediaGrants?.length??0)+pending>=3)throw new ServiceToolError('MEDIA_DOWNLOAD_LIMIT');receipt.busy=true;
    });
    if(existing)return{data:existing,service:'media',requestsUsed:0,collectedAt:existing.createdAt,cacheHit:true};
    try {
     const downloaded=await downloadProductionMedia(receipt!.url);temp=downloaded.directory;
     const grant=await runQueue(async()=>{
      const current=owner.current();if(current.libraryId!==initial.binding.libraryId||current.root!==initial.binding.root)throw new ServiceToolError('LIBRARY_CHANGED');
      const context=await owner.worker.call('productionContext',{binding:initial.binding,taskId:request.taskId});checkMedia(context);
      return owner.worker.call('productionMediaGrant',{binding:initial.binding,input:{...identity,sourceReceiptId:receipt!.id,sourceRequestId:receipt!.requestId,requestHash:receipt!.requestHash,videoId:receipt!.videoId,canonicalUrl:receipt!.canonicalUrl,responseHash:receipt!.responseHash},source:downloaded.file,mutationId:randomUUID()});
     });
     return{data:grant,service:'media',requestsUsed:0,collectedAt:grant.createdAt,cacheHit:false};
    }finally{if(receipt)receipt.busy=false;}
   }
   let input=request;
   if(request.tool==='asr'){
    const audio=await runQueue(()=>owner.worker.call('productionAsset',{binding:initial.binding,taskId:request.taskId,attemptId:request.attemptId,claimToken:request.claimToken,workerId:initial.workerId,audioPath:request.audioPath}));
    if(!/^\.[a-z0-9]{2,5}$/.test(audio.extension)||audio.data.byteLength>64*1024*1024)throw new ServiceToolError('INVALID_AUDIO');
    temp=await fs.mkdtemp(path.join(os.tmpdir(),'nova-production-asr-'));const audioPath=path.join(temp,`audio${audio.extension}`);await fs.writeFile(audioPath,audio.data,{flag:'wx',mode:0o600});input={...request,audioPath};
   }
   let successOutcome:{service:string;requestsUsed:0|1|null;ok:boolean;usage?:Record<string,number|string|null>}|undefined;
   const settle=(outcome:{service:string;requestsUsed:0|1|null;ok:boolean;usage?:Record<string,number|string|null>},radarAuthorIds?:string[],sourceProof?:{sourceReceiptId:string;videoId:string;canonicalUrl:string;responseHash:string})=>runQueue(async()=>{
    await owner.worker.call('productionTaskMutation',{binding:initial.binding,op:'recordCost',input:{...identity,status:outcome.requestsUsed===null?'unknown':'measured',amount:outcome.requestsUsed,usage:{...outcome.usage,...sourceProof,requests:outcome.requestsUsed,ok:outcome.ok,...(request.tool==='tikhub'&&(initial.isRadar||request.operation==='video')?{operation:request.operation,id:request.id}:{}),...(radarAuthorIds?{radarAuthorIds}:{})}},mutationId:randomUUID()});
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
    afterExecute:async outcome=>{if(outcome.ok&&(initial.isRadar||request.tool==='tikhub'&&request.operation==='video'))successOutcome=outcome;else await settle(outcome);}
   });
   let radarAuthorIds:string[]|undefined;
   if(initial.isRadar&&request.tool==='tikhub'&&['douyin-search','xhs-search'].includes(request.operation)){const context=await runQueue(()=>owner.worker.call('productionContext',{binding:initial.binding,taskId:request.taskId})),frozen=parameters(context.task?.request.parameters);if(frozen.workflow==='viral-radar'&&validRadarQuery(frozen.query)&&Array.isArray(frozen.operations)){const platform=radarPlatforms(frozen.query).find(value=>radarSearchOperation(value)===request.operation);if(platform)radarAuthorIds=radarMissingAuthorIds(result.data,frozen.query,platform,frozen.operations,result.collectedAt);}}
   if(request.tool==='tikhub'&&request.operation==='video'&&successOutcome){
    // Paid response is settled once even if no downloadable media can be granted.
    let source:ReturnType<typeof mediaSource>|undefined,sourceReceipt:{id:string;videoId:string;canonicalUrl:string;responseHash:string}|undefined;
    const canonicalUrl=`https://www.douyin.com/video/${request.id}`;
    try{source=mediaSource(result.data,request.id);sourceReceipt={id:randomUUID(),videoId:request.id,canonicalUrl,responseHash:createHash('sha256').update(JSON.stringify(result.data)).digest('hex')};}catch{source=undefined;}
    // Receipt parsing/hashing must never hide a successful provider charge.
    await settle(successOutcome,undefined,sourceReceipt?{sourceReceiptId:sourceReceipt.id,videoId:sourceReceipt.videoId,canonicalUrl:sourceReceipt.canonicalUrl,responseHash:sourceReceipt.responseHash}:undefined);
    if(source&&sourceReceipt){for(const [key,receipt]of receipts)if(receipt.expires<Date.now()&&!receipt.busy)receipts.delete(key);while(receipts.size>=256){const victim=[...receipts].find(([,entry])=>!entry.busy);if(!victim)throw new ServiceToolError('MEDIA_RECEIPT_LIMIT');receipts.delete(victim[0]);}receipts.set(sourceReceipt.id,{...sourceReceipt,url:source.url,requestId:request.requestId,taskId:request.taskId,attemptId:request.attemptId,workerId:request.workerId,claimToken:request.claimToken,requestHash:initial.requestHash,libraryId:initial.binding.libraryId,root:initial.binding.root,expires:Date.now()+15*60*1000});}
    return{...result,data:{videoId:request.id,canonicalUrl,title:source?.title??'',description:source?.description??'',...(sourceReceipt?{sourceReceipt}:{mediaUnavailable:true})}};
   }
   if(successOutcome)await settle(successOutcome,radarAuthorIds);
   return result;
  }finally{if(temp)await fs.rm(temp,{recursive:true,force:true});}
 }});
}
