import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import type {LibraryBinding,Worker} from '../shared/contracts.ts';
import type {ServiceToolRequest} from '../shared/service-contracts.ts';
import {ServiceTools,ServiceToolError} from './service-tools.mts';
import {ServiceToolBroker} from './service-broker.mts';
export interface ProductionServiceOwner {worker:Worker;current():LibraryBinding}
export type ProductionRunQueue = <T>(action:()=>Promise<T>)=>Promise<T>;
const parameters=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
export function productionToolBroker(owner:ProductionServiceOwner,tools:ServiceTools,descriptorPath:string,runQueue:ProductionRunQueue=action=>action()):ServiceToolBroker {
 return new ServiceToolBroker({descriptorPath,execute:async(request:ServiceToolRequest)=>{
  // Bind once. Later settlement remains attached to this library even when the user switches libraries.
  const initial=await runQueue(async()=>{
   const binding=owner.current(),context=await owner.worker.call('productionContext',{binding,taskId:request.taskId});
   const task=context.task,attempt=task?.attempts.find(a=>a.id===request.attemptId);
   if(!task||task.activeAttemptId!==request.attemptId||!attempt||attempt.claimToken!==request.claimToken||attempt.workerId!==request.workerId||!['claimed','waiting-user','waiting-permission'].includes(attempt.status)||!task.request.tools.includes(request.tool))throw new ServiceToolError('CLAIM_MISMATCH');
   const frozen=parameters(task.request.parameters),current=tools.settings.read().values;
   if(request.tool==='tikhub'&&request.operation==='comments'&&!(current.commentsEnabled&&frozen.comments===true&&current.budget.enabled&&frozen.budgetEnabled===true))throw new ServiceToolError('COMMENTS_DISABLED');
   return {binding,workerId:attempt.workerId};
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
   return await tools.execute(input,{
    beforeExecute:async prepared=>runQueue(async()=>{
     const currentBinding=owner.current();if(currentBinding.libraryId!==initial.binding.libraryId||currentBinding.root!==initial.binding.root)throw new ServiceToolError('LIBRARY_CHANGED');
     const context=await owner.worker.call('productionContext',{binding:initial.binding,taskId:request.taskId});const task=context.task,attempt=task?.attempts.find(a=>a.id===request.attemptId);
     if(!task||task.activeAttemptId!==request.attemptId||attempt?.claimToken!==request.claimToken||attempt?.workerId!==identity.workerId||!['claimed','waiting-user','waiting-permission'].includes(attempt.status)||!task.request.tools.includes(request.tool))throw new ServiceToolError('CLAIM_MISMATCH');
     if(context.snapshot.costs.some(c=>c.taskId===task.id&&['reserved','unknown'].includes(c.status)))throw new ServiceToolError('COST_UNKNOWN');
     const frozen=parameters(task.request.parameters),current=tools.settings.read().values;
     if(request.tool==='tikhub'&&request.operation==='comments'&&!(current.commentsEnabled&&frozen.comments===true&&current.budget.enabled&&frozen.budgetEnabled===true))throw new ServiceToolError('COMMENTS_DISABLED');
     if(prepared.requests===1){
      if(!current.budget.enabled||frozen.budgetEnabled!==true)throw new ServiceToolError('BUDGET_DISABLED');
      const used=context.snapshot.costs.filter(c=>c.taskId===task.id&&c.status!=='cancelled').reduce((sum,c)=>sum+(c.amount??1),0);
      if(used+1>current.budget.maxRequestsPerTask)throw new ServiceToolError('BUDGET_EXCEEDED');
     }
     await owner.worker.call('productionReserve',{binding:initial.binding,input:{...identity,service:prepared.service,usage:{requests:prepared.requests}},mutationId:randomUUID()});
    }),
    afterExecute:async outcome=>runQueue(async()=>{
     await owner.worker.call('productionTaskMutation',{binding:initial.binding,op:'recordCost',input:{...identity,status:outcome.requestsUsed===null?'unknown':'measured',amount:outcome.requestsUsed,usage:{requests:outcome.requestsUsed,ok:outcome.ok}},mutationId:randomUUID()});
    })
   });
  }finally{if(temp)await fs.rm(temp,{recursive:true,force:true});}
 }});
}
