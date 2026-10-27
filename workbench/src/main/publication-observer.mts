import {randomUUID} from 'node:crypto';
import type {LibraryBinding,Worker} from '../shared/contracts.ts';
import type {PublicationRuntimeWorkerOperations} from '../shared/publication-runtime-contracts.ts';
import type {ObservationReservation,ObservationResult} from '../../../plugin-src/src/lib/publication-runtime/index.mjs';
type Due=PublicationRuntimeWorkerOperations['publicationDue']['result'][number];
export interface PublicationObserverOptions {
 worker:Worker;
 listBindings():LibraryBinding[]|Promise<LibraryBinding[]>;
 onDue(due:Due[],binding:LibraryBinding):void|Promise<void>;
 onError?(error:unknown):void;
 isCollectionReady?(binding:LibraryBinding):boolean|Promise<boolean>;
 /** Exactly one fixed-budget production claim/cost request; no implicit retries. */
 collectOnce?(request:{binding:LibraryBinding;observation:ObservationReservation}):Promise<ObservationResult>;
}
async function within(promise:Promise<unknown>,milliseconds:number){
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([promise.then(()=>true,()=>true),new Promise<false>(resolve=>{timer=setTimeout(()=>resolve(false),milliseconds);})]);}
 finally{if(timer)clearTimeout(timer);}
}
export function createPublicationObserver({worker,listBindings,onDue,onError=()=>{},collectOnce,isCollectionReady}:PublicationObserverOptions){
 let timer:ReturnType<typeof setInterval>|null=null,inFlight:Promise<void>|null=null,stopping=false;
 const notified=new Set<string>(),reconciled=new Set<string>();
 let active:{binding:LibraryBinding;observation:ObservationReservation}|null=null;
 const report=(error:unknown)=>{try{onError(error);}catch{/* Error reporting must not skip drain bookkeeping. */}};
 async function finish(binding:LibraryBinding,observation:ObservationReservation,result:ObservationResult){
  await worker.call('publicationFinishObservation',{binding,input:{work:observation.work,mutationId:randomUUID(),platform:observation.platform,checkpoint:observation.checkpoint,reservationId:observation.reservationId,result}});
 }
 async function run(){try{
  for(const binding of await listBindings()){
   if(stopping)return;
   const due=await worker.call('publicationDue',{binding});
   const fresh=due.filter(x=>!x.issue&&!notified.has([binding.libraryId,x.videoId,x.platform,x.checkpoint].join(':')));
   if(fresh.length){await onDue(fresh,binding);for(const x of fresh)notified.add([binding.libraryId,x.videoId,x.platform,x.checkpoint].join(':'));}
   // On reopen reconcile only local task/cost/result/evidence. Never send another provider request.
   for(const item of due){
    if(stopping)return;
    if(!item.vaultId||!item.workId||!item.platform||!['12h','7d'].includes(item.checkpoint??'')||!item.reservation||!['reserved','unknown'].includes(item.reservation.status))continue;
    const key=[binding.libraryId,item.reservation.id].join(':');if(reconciled.has(key))continue;
    try{await worker.call('publicationFinishObservation',{binding,input:{work:{vaultId:item.vaultId,workId:item.workId},mutationId:randomUUID(),platform:item.platform,checkpoint:item.checkpoint as '12h'|'7d',reservationId:item.reservation.id,result:{state:'unknown',message:'核验重启前的原预约，仅检查本地记录',serviceReceipt:{reconcileExisting:true}}}});reconciled.add(key);}catch(error){report(error);}
   }
   if(stopping)return;
   const ready=!!collectOnce&&(isCollectionReady?await isCollectionReady(binding):true);
   for(const item of due){
    if(stopping)return;
    if(!ready||!collectOnce||item.mode!=='automatic'||item.reservation||!item.observation?.enabled||!item.vaultId||!item.workId||!item.platform||!['12h','7d'].includes(item.checkpoint??'')||!item.revision)continue;
    let observation:ObservationReservation;
    try{observation=await worker.call('publicationReserveObservation',{binding,input:{work:{vaultId:item.vaultId,workId:item.workId},mutationId:randomUUID(),expectedRevision:item.revision,platform:item.platform,checkpoint:item.checkpoint as '12h'|'7d',authorizationId:item.observation.authorizationId}});}catch(error){report(error);continue;}
    active={binding,observation};
    if(stopping){try{await finish(binding,observation,{state:'unknown',message:'应用在预约完成后退出，尚未发起本次平台调用；重开仅核验本地记录，不自动重试。'});}catch(error){report(error);}finally{active=null;}return;}
    let result:ObservationResult;
    try{result=await collectOnce({binding,observation});}catch(error){result={state:'unknown',message:error instanceof Error?error.message:'请求结果未知；不自动重试付费请求'};}
    try{await finish(binding,observation,result);}catch(error){report(error);}finally{active=null;}
   }
  }
 }catch(error){report(error);}}
 function tick():Promise<void>{
  if(stopping)return Promise.resolve();if(inFlight)return inFlight;
  inFlight=run().finally(()=>{inFlight=null;});return inFlight;
 }
 return {
  tick,
  start(){if(timer)return;stopping=false;void tick();timer=setInterval(()=>void tick(),60000);timer.unref?.();},
  /** Stop scheduling, preserve queue/broker during drain, and persist uncertainty before shutdown. */
  async stop({timeoutMs=10000,writeTimeoutMs=3000}:{timeoutMs?:number;writeTimeoutMs?:number}={}){
   stopping=true;if(timer)clearInterval(timer);timer=null;
   const pending=inFlight;if(!pending||await within(pending,Math.max(0,timeoutMs)))return {drained:true};
   const interrupted=active;
   if(interrupted){
    const record=finish(interrupted.binding,interrupted.observation,{state:'unknown',message:'应用退出等待已到上限；费用由原服务账继续结清，重开仅核验原task/cost/result，不重新请求平台。'}).catch(report);
    await within(record,Math.max(0,writeTimeoutMs));
   }
   return {drained:false};
  }
 };
}
