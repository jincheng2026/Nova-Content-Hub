import fs from 'node:fs';
import {prepareProductionHandoff,readProductionHandoff} from '../bridge/production-handoff.mjs';
import {lookupContentJourney} from '../lib/file-library/content-journey-lookup.mjs';
import {nativeHandoffDirectory} from '../bridge/native-handoff.mjs';
import {uuidFor} from '../lib/vault/core.mjs';
import {runFixedCLI,fail} from './jincheng-workflow.mjs';
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
function publicTask(task){const copy=structuredClone(task);for(const attempt of copy.attempts)attempt.claimToken=null;return copy;}
export async function runJourneyHandoff({envelope,library,operation,payload={},directory=nativeHandoffDirectory(),release}){
 if(!release)release=JSON.parse(fs.readFileSync(new URL('../release.json',import.meta.url),'utf8'));
 const context=library.readProductionContext(envelope.task.taskId,envelope.task.attemptId),root=context.task,attempt=context.attempt;
 if(!root?.journeyState||root.requestHash!==envelope.task.requestHash||root.activeAttemptId!==envelope.task.attemptId)fail('ATTEMPT_INACTIVE','读取当前有效主线交接后继续。');
 if(operation==='advance'){
  if(!exact(payload,['claimToken','workerId','input'])||!exact(payload.input,['expectedJourneyRevision','expectedStepId','mutationId']))fail('INVALID_INPUT');
  library.mutateProduction('advanceJourney',{rootClaim:{taskId:root.id,attemptId:attempt.id,claimToken:payload.claimToken,workerId:payload.workerId},expectedJourneyRevision:payload.input.expectedJourneyRevision,expectedStepId:payload.input.expectedStepId},{mutationId:payload.input.mutationId});
 }else if(operation==='claim-continuation'){
  if(!exact(payload,['claimToken','workerId','input'])||!exact(payload.input,['challenge','expectedJourneyRevision','mutationId']))fail('INVALID_INPUT');
  library.mutateProduction('claimJourneyContinuation',{taskId:root.id,attemptId:attempt.id,host:envelope.task.host,claimToken:payload.claimToken,workerId:payload.workerId,challenge:payload.input.challenge,expectedJourneyRevision:payload.input.expectedJourneyRevision},{mutationId:payload.input.mutationId});
 }else if(operation!=='context'||!exact(payload,[]))fail('INVALID_INPUT');
 const snapshot=library.readProduction(),current=snapshot.tasks.find(task=>task.id===root.id),child=snapshot.tasks.find(task=>task.id===current.journeyState.activeTaskId),childAttempt=child.attempts.find(a=>a.id===child.activeAttemptId);
 let handoff=null;
 if(current.journeyState.status==='active'){
  const locator={taskId:child.id,attemptId:childAttempt.id,requestHash:child.requestHash,host:childAttempt.host};
  if(childAttempt.status==='created')handoff=await prepareProductionHandoff(directory,envelope.binding,locator,release,{currentChat:true,...(envelope.serviceDescriptorPath?{serviceDescriptorPath:envelope.serviceDescriptorPath}:{})});
  else {const id=uuidFor('production-handoff:'+release.pairId+':'+envelope.binding.libraryId+':'+child.id+':'+childAttempt.id);readProductionHandoff(directory,id,release);handoff={id,url:null,prompt:`在当前聊天继续 production context --handoff ${id}，读取最新固定请求；保留当前 worker 身份和作者停点。`,requiresPaste:false};}
 }
 return {root:publicTask(current),child:publicTask(child),handoff};
}
export async function main(argv){
 if(argv[0]!=='lookup')return runFixedCLI(argv,['context','advance','claim-continuation'],runJourneyHandoff);
 try{const values={};for(let i=1;i<argv.length;i++){const key=argv[i];if(!['--library','--work'].includes(key)||Object.hasOwn(values,key)||typeof argv[i+1]!=='string')fail('INVALID_ARGUMENTS','lookup --library ABSOLUTE_VAULT --work T123');values[key]=argv[++i];}const result=lookupContentJourney({library:values['--library'],work:values['--work']});process.stdout.write(JSON.stringify({ok:true,result})+'\n');return 0;}catch(error){process.stdout.write(JSON.stringify({ok:false,code:/^[A-Z_]{1,80}$/.test(error?.code)?error.code:'LOOKUP_FAILED',message:'无法只读定位，请核对明确库路径与 T，或在工作台处理恢复事项。'})+'\n');return 1;}
}
