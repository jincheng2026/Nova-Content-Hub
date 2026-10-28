import {withProductionWriteScope} from '../../../plugin-src/src/lib/production-authority.mjs';
import {registeredIntakeSource} from './intake-media-source.mts';
import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {createResearchRuntime} from '../../../plugin-src/src/lib/research-runtime/index.mjs';
import {validateResearchConfig,readResearchSearchEvidence,researchGrantAuthorized} from '../../../plugin-src/src/lib/research-runtime/common.mjs';
import {executeResearchOperation} from '../../../plugin-src/src/lib/research-runtime/operations.mjs';
import {vaultRootForRuntime} from '../../../plugin-src/src/lib/vault/index.mjs';
import {openLibrary} from '../../../plugin-src/src/lib/file-library/index.mjs';
import type {ServiceToolRequest,ServiceToolResult} from '../shared/service-contracts.ts';
import type {ProductionServiceOwner,ProductionRunQueue} from './production-services.mts';
import {ServiceToolError,ServiceTools} from './service-tools.mts';
export interface ResearchClaim {taskId:string;attemptId:string;claimToken:string;workerId:string}
const parameters=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
/** Host adapter only. The worker and existing broker retain claim, source grant and cost authority. */
export class JinChengResearchServices {
 private readonly owner:ProductionServiceOwner;private readonly executeService:(request:ServiceToolRequest)=>Promise<ServiceToolResult>;private readonly tools:ServiceTools;private readonly runQueue:ProductionRunQueue;
 constructor(owner:ProductionServiceOwner,executeService:(request:ServiceToolRequest)=>Promise<ServiceToolResult>,tools:ServiceTools,runQueue:ProductionRunQueue=action=>action()){this.owner=owner;this.executeService=executeService;this.tools=tools;this.runQueue=runQueue;}
 async execute(identity:ResearchClaim,operation:string,input:Record<string,unknown>={}):Promise<unknown>{
  const binding=this.owner.current();
  const context=async()=>this.runQueue(async()=>{
   const current=this.owner.current();if(current.libraryId!==binding.libraryId||current.root!==binding.root)throw new ServiceToolError('LIBRARY_CHANGED');
   const ctx=await this.owner.worker.call('productionContext',{binding,taskId:identity.taskId}),task=ctx.task,attempt=task?.attempts.find(a=>a.id===identity.attemptId);
   if(!task||task.activeAttemptId!==identity.attemptId||!attempt||attempt.claimToken!==identity.claimToken||attempt.workerId!==identity.workerId||!['claimed','waiting-user','waiting-permission'].includes(attempt.status)||parameters(task.request.parameters).workflow!=='jincheng-research'||!['research','analysis','transcription'].includes(task.kind))throw new ServiceToolError('CLAIM_MISMATCH');
   if(task.journeyMember)await this.owner.worker.call('productionAuthority',{binding,input:identity});
   return ctx;
  });
  const initial=await context(),config=validateResearchConfig(parameters(initial.task!.request.parameters).researchRuntime),vaultRoot=vaultRootForRuntime(binding.root);
  if(!vaultRoot)throw new ServiceToolError('VAULT_REQUIRED');
  const request=(value:Record<string,unknown>)=>this.executeService({...identity,...value,requestId:typeof value.requestId==='string'?value.requestId:randomUUID()} as ServiceToolRequest);
  const runtime=createResearchRuntime({vaultRoot,executeService:request,resolveSampleEvidence:async(sourceRequestId,grant)=>{const ctx=await context();if(grant){if(!ctx.attempt?.mediaGrants?.some(value=>['assetHash','videoId','sourceReceiptId','sourceRequestId','requestHash','referenceId'].every(key=>(value as unknown as Record<string,unknown>)[key]===grant[key]))||!researchGrantAuthorized(ctx.task,ctx.snapshot.costs,identity.attemptId,grant))throw new ServiceToolError('INVALID_MEDIA_GRANT');library.readAsset(String(grant.assetHash));}return readResearchSearchEvidence(ctx.task,ctx.snapshot.costs,identity.attemptId,sourceRequestId);},readiness:()=>this.tools.checkReadiness(),authorize:async({config:actual})=>{const ctx=await context();if(!isDeepStrictEqual(validateResearchConfig(parameters(ctx.task!.request.parameters).researchRuntime),actual))throw new ServiceToolError('SERVICE_CONFIG_CHANGED');},readMedia:async(grant)=>{
   const ctx=await context();if(!researchGrantAuthorized(ctx.task,ctx.snapshot.costs,identity.attemptId,grant))throw new ServiceToolError('INVALID_MEDIA_GRANT');if(!ctx.attempt?.mediaGrants?.some(g=>g.assetHash===grant.assetHash&&g.videoId===grant.videoId&&g.requestHash===ctx.task!.requestHash))throw new ServiceToolError('INVALID_MEDIA_GRANT');
   const library=openLibrary(binding.root,{expectedLibraryId:binding.libraryId,expectedRootIdentity:binding.rootIdentity}),asset=library.readAsset(grant.assetHash),extensions:Record<string,string>={'video/mp4':'.mp4','video/webm':'.webm','audio/mp4':'.m4a','audio/mpeg':'.mp3','audio/wav':'.wav','audio/x-wav':'.wav','audio/ogg':'.ogg','audio/flac':'.flac'};
   if(asset.bytes>67108864||!extensions[asset.detectedType])throw new ServiceToolError('INVALID_MEDIA_GRANT');const extension=extensions[asset.detectedType]!;const verified=config.route==='intake'&&config.intakeContractVersion===2?await this.tools.verifyIntakeMedia(asset.data,extension,grant.assetHash):undefined;return{data:asset.data,extension,...verified};
  },fetchMedia:async({videoId,url})=>{
   const ctx=await context(),existing=ctx.attempt?.mediaGrants?.find(g=>g.videoId===videoId&&g.canonicalUrl===url&&g.requestHash===ctx.task!.requestHash);
   if(existing){const cached=await this.tools.cachedVideoResponse?.(videoId,existing.responseHash),source=cached?registeredIntakeSource(cached,videoId):null;const media=await request({tool:'media',operation:'fetch',sourceReceiptId:existing.sourceReceiptId});return {...media,...(source?{source}:{})};}
   const source=await request({tool:'tikhub',operation:'video',id:videoId}),data=source.data as {videoId?:string;title?:string;description?:string;sourceReceipt?:{id?:string;videoId?:string;canonicalUrl?:string}};
   if(!data?.sourceReceipt?.id||data.sourceReceipt.videoId!==videoId||data.sourceReceipt.canonicalUrl!==url)throw new ServiceToolError('MEDIA_SOURCE_UNAVAILABLE');
   const media=await request({tool:'media',operation:'fetch',sourceReceiptId:data.sourceReceipt.id}),metadata=registeredIntakeSource(data,videoId);return {...media,...(metadata?{source:metadata}:{})};
  }});
  const library=openLibrary(binding.root,{expectedLibraryId:binding.libraryId,expectedRootIdentity:binding.rootIdentity});
  return withProductionWriteScope(library,identity,()=>executeResearchOperation(runtime,config,operation,input));
 }
}
