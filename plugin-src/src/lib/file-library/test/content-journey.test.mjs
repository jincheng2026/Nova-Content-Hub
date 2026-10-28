import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createVault,createVaultDocument,readVaultTaskContext} from '../../vault/index.mjs';
import {openLibrary,__testing} from '../index.mjs';
import {runWorkflowHandoff} from '../../../commands/jincheng-workflow.mjs';
import {readWorkFlow,confirmCheckpoint} from '../../vault/workflow.mjs';
import {createResearchRuntime} from '../../research-runtime/index.mjs';
import {runCreationHandoff} from '../../../commands/jincheng-creation.mjs';
import {runResearchHandoff} from '../../../commands/jincheng-research.mjs';
process.env.NODE_ENV='test';

function fixture(t){
 const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'nova-journey-'));
 t.after(()=>{__testing.setHook(undefined);fs.rmSync(root,{recursive:true,force:true});});
 const binding=createVault(root),document=createVaultDocument(binding.root,{section:'drafts',title:'未定标题内容',text:'作者提供的真实材料'},{mutationId:randomUUID()}).document;
 const library=openLibrary(binding.root);library.listContents();
 return {root,binding,document,library};
}
const limits={maxRequestsTotal:2,commentsAllowed:false,mediaCount:3,mediaBytes:67108864};
function start(f,extra={}){
 return f.library.mutateProduction('startJourney',{contentId:f.document.contentId,host:'codex',method:'ordinary-writing',researchPlan:[],limits,serviceConfig:{},expectedToken:f.library.readProduction().editToken,...extra},{mutationId:randomUUID()});
}
function claimed(f,snapshot){
 const parent=snapshot.tasks.find(task=>task.journeyState),child=snapshot.tasks.find(task=>task.id===parent.journeyState.activeTaskId);
 const owner={taskId:parent.id,attemptId:parent.activeAttemptId,claimToken:randomUUID(),workerId:'journey-worker'};
 f.library.mutateProduction('claimTask',owner);
 return {parent,child,owner,worker:{taskId:child.id,attemptId:child.activeAttemptId,claimToken:randomUUID(),workerId:owner.workerId,rootClaimToken:owner.claimToken}};
}

test('ordinary task creation cannot forge a root, membership, or an epoch',t=>{
 const f=fixture(t);
 for(const parameters of [{workflow:'content-journey',journeyVersion:1},{workflow:'jincheng-stage',journeyId:randomUUID()},{workflow:'jincheng-stage',parent:{journeyId:randomUUID(),ownerEpoch:1}},{ownerEpoch:1,stepId:randomUUID()}]){
  assert.throws(()=>f.library.mutateProduction('createTask',{kind:'writing',title:'伪造',prompt:'伪造',parameters,expectedToken:f.library.readProduction().editToken}),{code:'INVALID_INPUT'});
 }
 assert.throws(()=>f.library.mutateProduction('createTask',{kind:'writing',title:'伪造',prompt:'伪造',journeyMember:{journeyId:randomUUID()},expectedToken:f.library.readProduction().editToken}),{code:'INVALID_INPUT'});
 assert.equal(f.library.readProduction().tasks.length,0);
});

test('a member claim requires the active root secret and the same worker and host',t=>{
 const f=fixture(t),{parent,child,owner,worker}=claimed(f,start(f));
 const {rootClaimToken,...withoutRoot}=worker;
 assert.throws(()=>f.library.mutateProduction('claimTask',withoutRoot),{code:'CLAIM_MISMATCH'});
 assert.throws(()=>f.library.mutateProduction('claimTask',{...worker,rootClaimToken:randomUUID()}),{code:'CLAIM_MISMATCH'});
 assert.throws(()=>f.library.mutateProduction('claimTask',{...worker,workerId:'intruder'}),{code:'CLAIM_MISMATCH'});
 const snapshot=f.library.mutateProduction('claimTask',worker);
 assert.equal(snapshot.tasks.find(task=>task.id===child.id).attempts[0].status,'claimed');
 assert.equal(snapshot.tasks.find(task=>task.id===parent.id).attempts[0].claimToken,null);
 assert.throws(()=>f.library.mutateProduction('submitTask',{...owner,result:{summary:'假完成',artifacts:[{id:randomUUID(),kind:'draft',title:'假',text:'假',assetHash:null,data:null}]}}),{code:'JOURNEY_COORDINATED'});
 assert.throws(()=>f.library.mutateProduction('submitTask',{...worker,result:{summary:'泛用draft假完成',artifacts:[{id:randomUUID(),kind:'draft',title:'假',text:'材料摘要不是完整原页',assetHash:null,data:null}]}}),{code:'JOURNEY_COORDINATED'});
 for(const op of ['retryTask','cancelTask','acceptTask','rejectTask'])assert.throws(()=>f.library.mutateProduction(op,{taskId:child.id,expectedToken:f.library.readProduction().editToken}),{code:'JOURNEY_COORDINATED'});
});

test('starting a journey binds the persisted work and freezes a root with one bounded child',t=>{
 const f=fixture(t),snapshot=start(f),root=snapshot.tasks.find(task=>task.journeyState),child=snapshot.tasks.find(task=>task.journeyMember);
 const context=readVaultTaskContext(f.binding.root,f.document.contentId);
 assert.equal(root.request.parameters.workflow,'content-journey');
 assert.deepEqual(root.request.tools,[]);
 assert.equal(root.request.budget.amount,0);
 assert.deepEqual(root.request.parameters.work,{libraryId:f.binding.libraryId,vaultId:context.vaultId,workId:f.document.tNumber,contentId:f.document.contentId});
 assert.deepEqual(root.request.parameters.initialSource,{documentId:context.content.sourceDocumentId,relativePath:context.content.relativePath,hash:context.content.hash});
 assert.equal(root.journeyState.ownerEpoch,1);
 assert.equal(root.journeyState.members.length,1);
 assert.equal(root.journeyState.activeStepId,child.journeyMember.stepId);
 assert.deepEqual(child.request.parameters.journey,{journeyId:root.id,stepId:child.journeyMember.stepId,ownerEpoch:1});
 assert.equal(child.request.parameters.workflow,'jincheng-stage');
 assert.equal(child.request.parameters.stage,'author-materials');
 assert.equal(child.contentId,f.document.contentId);
 assert.deepEqual(child.request.tools,[]);
 assert.deepEqual(openLibrary(f.binding.root).readProduction().tasks.map(task=>task.id),snapshot.tasks.map(task=>task.id));
});

function materialCheckpoint(f,child,worker){
 const envelope={binding:f.binding,task:{taskId:child.id,attemptId:child.activeAttemptId,requestHash:child.requestHash}},payload={claimToken:worker.claimToken,workerId:worker.workerId,input:{kind:'author-materials',text:'作者提供的观点：准确资料应先读回；材料来自当前原稿。'}};
 const artifact=runWorkflowHandoff({envelope,library:f.library,payload,operation:'artifact'});
 return {artifact,work:{vaultId:readVaultTaskContext(f.binding.root,f.document.contentId).vaultId,workId:f.document.tNumber}};
}
test('advance waits for a real exact author checkpoint and retires the old child atomically',t=>{
 const f=fixture(t),{parent,child,owner,worker}=claimed(f,start(f));f.library.mutateProduction('claimTask',worker);
 const input={rootClaim:owner,expectedJourneyRevision:1,expectedStepId:parent.journeyState.activeStepId},mutationId=randomUUID();
 assert.throws(()=>f.library.mutateProduction('advanceJourney',input,{mutationId}),{code:'CHECKPOINT_REQUIRED'});
 const {artifact,work}=materialCheckpoint(f,child,worker);
 assert.throws(()=>f.library.mutateProduction('advanceJourney',input,{mutationId}),{code:'CHECKPOINT_REQUIRED'});
 confirmCheckpoint(f.root,{work,kind:'author-materials',artifactId:artifact.artifactId,artifactHash:artifact.hash,expectedRevision:artifact.revision,decision:'confirm',evidence:{actor:'author',text:'这是我的材料和观点',at:new Date().toISOString()}});
 const advanced=f.library.mutateProduction('advanceJourney',input,{mutationId}),next=advanced.tasks.find(task=>task.journeyState),successor=advanced.tasks.find(task=>task.id===next.journeyState.activeTaskId);
 assert.equal(next.requestHash,parent.requestHash);assert.deepEqual(next.request,parent.request);
 assert.equal(next.journeyState.revision,2);assert.equal(next.journeyState.checkpoints[0].decisionId,readWorkFlow(f.root,work).decisions[0].decisionId);
 assert.equal(successor.request.parameters.stage,'writing');
 assert.equal(advanced.tasks.find(task=>task.id===child.id).attempts[0].status,'accepted');
 assert.throws(()=>f.library.mutateProduction('progressTask',{...worker,status:'claimed',progress:1,message:'迟到'}),{code:'ATTEMPT_INACTIVE'});
 assert.throws(()=>f.library.mutateProduction('advanceJourney',input,{mutationId:randomUUID()}),{code:'CONFLICT'});
 const replay=f.library.mutateProduction('advanceJourney',input,{mutationId});assert.equal(replay.tasks.find(task=>task.journeyState).journeyState.activeTaskId,successor.id);
 assert.equal(openLibrary(f.binding.root).readProduction().tasks.length,3);
});

const research=(id)=>({version:1,researchId:id,outputDirectory:'调研报告库/'+id,route:'topic',platform:'douyin',targetIds:['AI教程'],operations:['douyin-search'],maxRequests:1,comments:false});
test('the shared budget follows a real completed research step into its next child',async t=>{
 const f=fixture(t),{parent,child,owner,worker}=claimed(f,start(f,{limits:{...limits,maxRequestsTotal:1},researchPlan:[research('one'),research('two')]}));f.library.mutateProduction('claimTask',worker);
 const identity={...worker};delete identity.rootClaimToken;
 const runtime=createResearchRuntime({vaultRoot:f.root,executeService:async request=>{
  f.library.reserveProductionTool({...identity,requestId:request.requestId,service:'tikhub'});
  f.library.mutateProduction('recordCost',{...identity,requestId:request.requestId,status:'measured',amount:1,usage:{ok:true,operation:request.operation,id:request.id}});
  return {data:{data:{business_data:[]}},requestsUsed:1,collectedAt:'2026-10-28T00:00:00.000Z'};
 }});
 await runtime.prepare(research('one'));await runtime.collect('one',{operation:'douyin-search',id:'AI教程'});
 await runtime.saveDataset('one',runtime.normalizeContent('one',{rows:[]}));await runtime.freeze('one');await runtime.render('one');
 const advanced=f.library.mutateProduction('advanceJourney',{rootClaim:owner,expectedJourneyRevision:1,expectedStepId:parent.journeyState.activeStepId},{mutationId:randomUUID()}),current=advanced.tasks.find(task=>task.journeyState),next=advanced.tasks.find(task=>task.id===current.journeyState.activeTaskId);
 const nextWorker={taskId:next.id,attemptId:next.activeAttemptId,claimToken:randomUUID(),workerId:owner.workerId,rootClaimToken:owner.claimToken};f.library.mutateProduction('claimTask',nextWorker);
 assert.throws(()=>f.library.reserveProductionTool({...nextWorker,requestId:randomUUID(),service:'tikhub'}),{code:'BUDGET_EXCEEDED'});
 assert.equal(f.library.readProduction().costs.length,1);
 assert.equal(f.library.readProduction().costs[0].taskId,child.id);
});

test('unknown cost blocks advance and a retired worker can only settle its original reservation',t=>{
 const f=fixture(t),{parent,child,owner,worker}=claimed(f,start(f,{researchPlan:[research('late')]}));f.library.mutateProduction('claimTask',worker);
 const requestId=randomUUID();f.library.reserveProductionTool({...worker,requestId,service:'tikhub'});
 assert.throws(()=>f.library.mutateProduction('advanceJourney',{rootClaim:owner,expectedJourneyRevision:1,expectedStepId:parent.journeyState.activeStepId}),{code:'COST_UNKNOWN'});
 const cancelled=f.library.mutateProduction('cancelJourney',{journeyId:parent.id,expectedJourneyRevision:1,expectedToken:f.library.readProduction().editToken},{mutationId:randomUUID()});
 assert.equal(cancelled.tasks.find(task=>task.id===parent.id).journeyState.status,'cancelled');
 assert.equal(cancelled.costs[0].status,'unknown');
 assert.throws(()=>f.library.reserveProductionTool({...worker,requestId:randomUUID(),service:'tikhub'}),{code:'ATTEMPT_INACTIVE'});
 assert.throws(()=>f.library.mutateProduction('recordCost',{...worker,requestId:randomUUID(),status:'measured',amount:1}),{code:'INVALID_INPUT'});
 assert.throws(()=>f.library.mutateProduction('recordCost',{...worker,id:cancelled.costs[0].id,requestId:randomUUID(),status:'measured',amount:1}),{code:'INVALID_INPUT'});
 assert.throws(()=>f.library.mutateProduction('recordCost',{...worker,claimToken:randomUUID(),requestId,status:'measured',amount:1}),{code:'CLAIM_MISMATCH'});
 const settled=f.library.mutateProduction('recordCost',{...worker,requestId,status:'measured',amount:1,usage:{ok:true}});
 assert.equal(settled.costs.length,1);assert.equal(settled.costs[0].amount,1);assert.equal(settled.costs[0].attemptId,child.activeAttemptId);
 assert.throws(()=>f.library.mutateProduction('progressTask',{...worker,status:'claimed',progress:2,message:'迟到'}),{code:'ATTEMPT_INACTIVE'});
 assert.throws(()=>f.library.mutateProduction('recordCost',{...worker,requestId,status:'measured',amount:1}),{code:'INVALID_INPUT'});
});

test('cancelling between an async original-page read and the final suggestion commit preserves its bytes',async t=>{
 const f=fixture(t),{parent,child,owner,worker}=claimed(f,start(f));f.library.mutateProduction('claimTask',worker);
 const {artifact,work}=materialCheckpoint(f,child,worker);confirmCheckpoint(f.root,{work,kind:'author-materials',artifactId:artifact.artifactId,artifactHash:artifact.hash,expectedRevision:artifact.revision,decision:'confirm',evidence:{actor:'author',text:'确认准确材料',at:new Date().toISOString()}});
 const snapshot=f.library.mutateProduction('advanceJourney',{rootClaim:owner,expectedJourneyRevision:1,expectedStepId:parent.journeyState.activeStepId}),next=snapshot.tasks.find(task=>task.id===snapshot.tasks.find(task=>task.journeyState).journeyState.activeTaskId);
 const claim={taskId:next.id,attemptId:next.activeAttemptId,claimToken:randomUUID(),workerId:owner.workerId,rootClaimToken:owner.claimToken};f.library.mutateProduction('claimTask',claim);
 const envelope={binding:f.binding,task:{taskId:next.id,attemptId:next.activeAttemptId,requestHash:next.requestHash}},base={envelope,library:f.library};
 await runCreationHandoff({...base,operation:'build',payload:{claimToken:claim.claimToken,workerId:claim.workerId,input:{mutationId:randomUUID(),data:{content_id:f.document.tNumber,type:'口播',stage:'写稿',title:'作者原页',narrative:{story:'作者判断',audience:'作者读者',problem:'资料读回'},segments:[{id:'seg-one',title:'开头',mine:'作者完整原句。'}]}}}});
 const read=await runCreationHandoff({...base,operation:'read',payload:{claimToken:claim.claimToken,workerId:claim.workerId,input:{}}}),filename=path.join(f.root,read.document.source.relativePath),before=fs.readFileSync(filename);
 const pending=runCreationHandoff({...base,operation:'suggest',payload:{claimToken:claim.claimToken,workerId:claim.workerId,input:{mutationId:randomUUID(),expectedRevision:read.document.revision,suggestion:{segment:'seg-one',category:'表达',source:'AI',original:'作者完整原句。',proposed:'旧owner的迟到修改。',reason:'表达调整',basis:{type:'AI 自己的判断',text:'语句判断'},verdict:'待你定'}}}});
 f.library.mutateProduction('cancelJourney',{journeyId:parent.id,expectedJourneyRevision:2,expectedToken:f.library.readProduction().editToken});
 await assert.rejects(pending,{code:'ATTEMPT_INACTIVE'});assert.deepEqual(fs.readFileSync(filename),before);
});

test('cancelling after research authorization but before its archive write prevents the late CLI result',async t=>{
 const f=fixture(t),{parent,child,worker}=claimed(f,start(f,{researchPlan:[research('archive-race')]}));f.library.mutateProduction('claimTask',worker);
 const pending=runResearchHandoff({envelope:{binding:f.binding,task:{taskId:child.id,attemptId:child.activeAttemptId,requestHash:child.requestHash}},library:f.library,operation:'prepare',payload:{claimToken:worker.claimToken,workerId:worker.workerId,input:{}}});
 f.library.mutateProduction('cancelJourney',{journeyId:parent.id,expectedJourneyRevision:1,expectedToken:f.library.readProduction().editToken});
 await assert.rejects(pending,{code:'ATTEMPT_INACTIVE'});assert.equal(fs.existsSync(path.join(f.root,'.workbench/research-runtime/archive-race.json')),false);
});

test('cancelling after a synchronous page build prevents its later async artifact registration',async t=>{
 const f=fixture(t),{parent,child,owner,worker}=claimed(f,start(f));f.library.mutateProduction('claimTask',worker);
 const {artifact,work}=materialCheckpoint(f,child,worker);confirmCheckpoint(f.root,{work,kind:'author-materials',artifactId:artifact.artifactId,artifactHash:artifact.hash,expectedRevision:artifact.revision,decision:'confirm',evidence:{actor:'author',text:'确认材料',at:new Date().toISOString()}});
 const advanced=f.library.mutateProduction('advanceJourney',{rootClaim:owner,expectedJourneyRevision:1,expectedStepId:parent.journeyState.activeStepId}),next=advanced.tasks.find(task=>task.id===advanced.tasks.find(task=>task.journeyState).journeyState.activeTaskId),claim={taskId:next.id,attemptId:next.activeAttemptId,claimToken:randomUUID(),workerId:owner.workerId,rootClaimToken:owner.claimToken};f.library.mutateProduction('claimTask',claim);
 const pending=runCreationHandoff({envelope:{binding:f.binding,task:{taskId:next.id,attemptId:next.activeAttemptId,requestHash:next.requestHash}},library:f.library,operation:'build',payload:{claimToken:claim.claimToken,workerId:claim.workerId,input:{mutationId:randomUUID(),data:{content_id:f.document.tNumber,type:'口播',stage:'写稿',title:'准确原页',narrative:{story:'作者判断',audience:'创作者',problem:'原页读回'},segments:[{id:'seg-one',title:'开头',mine:'保留已经合法提交的正文。'}]}}}});
 f.library.mutateProduction('cancelJourney',{journeyId:parent.id,expectedJourneyRevision:2,expectedToken:f.library.readProduction().editToken});
 await assert.rejects(pending,{code:'ATTEMPT_INACTIVE'});assert.equal(readWorkFlow(f.root,work).artifacts.filter(artifact=>artifact.kind==='complete-draft').length,0);
});

test('a committed journey page with a lost response replays its exact build and registers one artifact',async t=>{
 const f=fixture(t),{parent,child,owner,worker}=claimed(f,start(f));f.library.mutateProduction('claimTask',worker);
 const {artifact,work}=materialCheckpoint(f,child,worker);confirmCheckpoint(f.root,{work,kind:'author-materials',artifactId:artifact.artifactId,artifactHash:artifact.hash,expectedRevision:artifact.revision,decision:'confirm',evidence:{actor:'author',text:'确认材料',at:new Date().toISOString()}});
 const advanced=f.library.mutateProduction('advanceJourney',{rootClaim:owner,expectedJourneyRevision:1,expectedStepId:parent.journeyState.activeStepId}),next=advanced.tasks.find(task=>task.id===advanced.tasks.find(task=>task.journeyState).journeyState.activeTaskId),claim={taskId:next.id,attemptId:next.activeAttemptId,claimToken:randomUUID(),workerId:owner.workerId,rootClaimToken:owner.claimToken};f.library.mutateProduction('claimTask',claim);
 const args={envelope:{binding:f.binding,task:{taskId:next.id,attemptId:next.activeAttemptId,requestHash:next.requestHash}},operation:'build',payload:{claimToken:claim.claimToken,workerId:claim.workerId,input:{mutationId:randomUUID(),data:{content_id:f.document.tNumber,type:'口播',stage:'写稿',title:'响应丢失原页',narrative:{story:'作者判断',audience:'创作者',problem:'完整原页'},segments:[{id:'seg-one',title:'开头',mine:'原位保存后的准确正文。'}]}}}};
 let commits=0;const interrupted={...f.library,withProductionAuthority:(identity,commit)=>{if(++commits===2)throw Object.assign(Error('simulated response loss before artifact registration'),{code:'IO_ERROR'});return f.library.withProductionAuthority(identity,commit);}};
 await assert.rejects(runCreationHandoff({...args,library:interrupted}),{code:'IO_ERROR'});
 assert.equal(readWorkFlow(f.root,work).artifacts.filter(artifact=>artifact.kind==='complete-draft').length,0);
 const first=await runCreationHandoff({...args,library:f.library}),replay=await runCreationHandoff({...args,library:f.library});
 assert.equal(replay.revision,first.revision);assert.equal(replay.stageArtifact.artifactId,first.stageArtifact.artifactId);
 assert.equal(readWorkFlow(f.root,work).artifacts.filter(artifact=>artifact.kind==='complete-draft').length,1);
 const context=readVaultTaskContext(f.binding.root,f.document.contentId);assert.equal(context.content.creationDocuments.length,1);
 assert.match(fs.readFileSync(path.join(f.root,context.content.relativePath),'utf8'),/原位保存后的准确正文。/);
 const current=await runCreationHandoff({...args,library:f.library,operation:'read',payload:{claimToken:claim.claimToken,workerId:claim.workerId,input:{}}});
 await runCreationHandoff({...args,library:f.library,operation:'suggest',payload:{claimToken:claim.claimToken,workerId:claim.workerId,input:{mutationId:randomUUID(),expectedRevision:current.document.revision,suggestion:{segment:'seg-one',category:'表达',source:'AI',original:'原位保存后的准确正文。',proposed:'同一合法原页的候选建议。',reason:'表达调整',basis:{type:'AI 自己的判断',text:'当前原句'},verdict:'待你定'}}}});
 const after=await runCreationHandoff({...args,library:f.library,operation:'read',payload:{claimToken:claim.claimToken,workerId:claim.workerId,input:{}}});assert.equal(after.buildData.segments[0].mine,'原位保存后的准确正文。');assert.equal(after.buildData.suggestions.length,1);
});

async function competingMutations(root,operation,inputs){
 const code=`import {openLibrary} from ${JSON.stringify(new URL('../index.mjs',import.meta.url).href)};const [root,op,input]=process.argv.slice(1);let library;try{library=openLibrary(root);}catch(error){process.stdout.write(JSON.stringify({code:error.code})+'\\n');process.exit(0);}process.stdout.write('ready\\n');process.stdin.once('data',()=>{try{const result=library.mutateProduction(op,JSON.parse(input),{mutationId:crypto.randomUUID()});process.stdout.write(JSON.stringify({ok:true,taskIds:result.tasks.map(task=>task.id)})+'\\n');}catch(error){process.stdout.write(JSON.stringify({code:error.code})+'\\n');}process.stdin.destroy();});`;
 const children=inputs.map(input=>{const child=spawn(process.execPath,['--input-type=module','-e',code,root,operation,JSON.stringify(input)],{stdio:['pipe','pipe','pipe']});let output='',ready;
  const started=new Promise(resolve=>{ready=resolve;});const done=new Promise((resolve,reject)=>{child.on('error',reject);child.stdout.on('data',chunk=>{output+=chunk;if(output.includes('\n'))ready();});child.on('exit',exit=>{if(exit!==0)reject(new Error('Concurrent fixture failed: '+exit));else resolve(JSON.parse(output.trim().split('\n').at(-1)));});});return {child,started,done};});
 await Promise.all(children.map(child=>child.started));for(const child of children)child.child.stdin.end('go\n');return Promise.all(children.map(child=>child.done));
}

test('independent processes competing to advance one revision leave exactly one active successor',async t=>{
 const f=fixture(t),{parent,child,owner,worker}=claimed(f,start(f));f.library.mutateProduction('claimTask',worker);
 const {artifact,work}=materialCheckpoint(f,child,worker);confirmCheckpoint(f.root,{work,kind:'author-materials',artifactId:artifact.artifactId,artifactHash:artifact.hash,expectedRevision:artifact.revision,decision:'confirm',evidence:{actor:'author',text:'确认准确材料',at:new Date().toISOString()}});
 const input={rootClaim:owner,expectedJourneyRevision:1,expectedStepId:parent.journeyState.activeStepId},results=await competingMutations(f.binding.root,'advanceJourney',[input,input]);
 assert.equal(results.filter(result=>result.ok).length,1,JSON.stringify(results));assert.ok(results.filter(result=>!result.ok).every(result=>['BUSY','VAULT_BUSY','NOT_READY','CONFLICT','LOCK_UNCERTAIN'].includes(result.code)),JSON.stringify(results));
 const current=f.library.readProduction(),root=current.tasks.find(task=>task.journeyState);assert.equal(root.journeyState.revision,2);assert.equal(root.journeyState.members.length,2);assert.equal(current.tasks.filter(task=>task.journeyMember&&task.attempts.find(attempt=>attempt.id===task.activeAttemptId).status==='created').length,1);
});

test('independent reservation processes cannot spend the same last journey request twice',async t=>{
 const f=fixture(t),{worker}=claimed(f,start(f,{limits:{...limits,maxRequestsTotal:1},researchPlan:[research('reserve-race')]}));f.library.mutateProduction('claimTask',worker);
 const inputs=[{...worker,requestId:randomUUID(),service:'tikhub'},{...worker,requestId:randomUUID(),service:'tikhub'}],results=await competingMutations(f.binding.root,'reserveCost',inputs);
 assert.equal(results.filter(result=>result.ok).length,1,JSON.stringify(results));assert.ok(results.filter(result=>!result.ok).every(result=>['BUSY','VAULT_BUSY','NOT_READY','LOCK_UNCERTAIN','COST_UNKNOWN','BUDGET_EXCEEDED'].includes(result.code)),JSON.stringify(results));
 assert.equal(f.library.readProduction().costs.length,1);assert.equal(f.library.readProduction().costs[0].amount,1);
});

test('WAL recovery replays an interrupted advance without duplicating its checkpoint or child',t=>{
 const f=fixture(t),{parent,child,owner,worker}=claimed(f,start(f));f.library.mutateProduction('claimTask',worker);
 const {artifact,work}=materialCheckpoint(f,child,worker);confirmCheckpoint(f.root,{work,kind:'author-materials',artifactId:artifact.artifactId,artifactHash:artifact.hash,expectedRevision:artifact.revision,decision:'confirm',evidence:{actor:'author',text:'确认准确材料',at:new Date().toISOString()}});
 const input={rootClaim:owner,expectedJourneyRevision:1,expectedStepId:parent.journeyState.activeStepId},mutationId=randomUUID();
 __testing.setHook(event=>{if(event.phase==='afterJournal'&&event.mutationId===mutationId)throw Error('simulated process failure');});
 assert.throws(()=>f.library.mutateProduction('advanceJourney',input,{mutationId}));__testing.setHook(undefined);
 const reopened=openLibrary(f.binding.root),snapshot=reopened.mutateProduction('advanceJourney',input,{mutationId}),current=snapshot.tasks.find(task=>task.journeyState);
 assert.equal(snapshot.tasks.length,3);assert.equal(current.journeyState.revision,2);assert.equal(current.journeyState.checkpoints.length,1);
 assert.throws(()=>reopened.mutateProduction('advanceJourney',{...input,expectedJourneyRevision:2},{mutationId}),{code:'INVALID_INPUT'});
});

test('a revoked upstream author decision blocks direct later writes while preserving the original page',t=>{
 const f=fixture(t),{parent,child,owner,worker}=claimed(f,start(f));f.library.mutateProduction('claimTask',worker);
 const {artifact,work}=materialCheckpoint(f,child,worker);confirmCheckpoint(f.root,{work,kind:'author-materials',artifactId:artifact.artifactId,artifactHash:artifact.hash,expectedRevision:artifact.revision,decision:'confirm',evidence:{actor:'author',text:'确认准确材料',at:new Date().toISOString()}});
 const snapshot=f.library.mutateProduction('advanceJourney',{rootClaim:owner,expectedJourneyRevision:1,expectedStepId:parent.journeyState.activeStepId}),root=snapshot.tasks.find(task=>task.journeyState),next=snapshot.tasks.find(task=>task.id===root.journeyState.activeTaskId),claim={taskId:next.id,attemptId:next.activeAttemptId,claimToken:randomUUID(),workerId:owner.workerId,rootClaimToken:owner.claimToken};f.library.mutateProduction('claimTask',claim);
 confirmCheckpoint(f.root,{work,kind:'author-materials',artifactId:artifact.artifactId,artifactHash:artifact.hash,expectedRevision:readWorkFlow(f.root,work).revision,decision:'reopen',evidence:{actor:'author',text:'材料需补充',at:new Date().toISOString()}});
 assert.throws(()=>f.library.mutateProduction('progressTask',{...claim,status:'claimed',progress:3,message:'继续'}),{code:'STALE_INPUT'});
 assert.equal(fs.readFileSync(path.join(f.root,f.document.relativePath),'utf8'),'作者提供的真实材料');
});

test('writing rejects an externally changed frozen manuscript before its first business commit',async t=>{
 const f=fixture(t),{parent,child,owner,worker}=claimed(f,start(f));f.library.mutateProduction('claimTask',worker);
 const {artifact,work}=materialCheckpoint(f,child,worker);confirmCheckpoint(f.root,{work,kind:'author-materials',artifactId:artifact.artifactId,artifactHash:artifact.hash,expectedRevision:artifact.revision,decision:'confirm',evidence:{actor:'author',text:'确认准确材料',at:new Date().toISOString()}});
 const snapshot=f.library.mutateProduction('advanceJourney',{rootClaim:owner,expectedJourneyRevision:1,expectedStepId:parent.journeyState.activeStepId}),next=snapshot.tasks.find(task=>task.id===snapshot.tasks.find(task=>task.journeyState).journeyState.activeTaskId),claim={taskId:next.id,attemptId:next.activeAttemptId,claimToken:randomUUID(),workerId:owner.workerId,rootClaimToken:owner.claimToken};f.library.mutateProduction('claimTask',claim);
 fs.writeFileSync(path.join(f.root,f.document.relativePath),'作者外部改过的准确材料');
 const before=f.library.readProduction();assert.throws(()=>f.library.assertProductionAuthority(claim),{code:'SOURCE_CHANGED'});
 await assert.rejects(runCreationHandoff({envelope:{binding:f.binding,task:{taskId:next.id,attemptId:next.activeAttemptId,requestHash:next.requestHash}},library:f.library,operation:'build',payload:{claimToken:claim.claimToken,workerId:claim.workerId,input:{mutationId:randomUUID(),data:{content_id:f.document.tNumber,type:'口播',stage:'写稿',title:'过时资料生成稿',narrative:{story:'旧判断',audience:'创作者',problem:'旧资料'},segments:[{id:'seg-one',title:'开头',mine:'不能基于旧材料生成这一页。'}]}}}}),{code:'SOURCE_CHANGED'});
 const context=readVaultTaskContext(f.binding.root,f.document.contentId);assert.equal(context.content.creationDocuments.length,0);
 assert.equal(fs.readFileSync(path.join(f.root,f.document.relativePath),'utf8'),'作者外部改过的准确材料');assert.deepEqual(f.library.readProduction().tasks,before.tasks);
});

test('advance rejects the current child changed source without freezing that change into a successor',t=>{
 const f=fixture(t),{parent,child,owner,worker}=claimed(f,start(f));f.library.mutateProduction('claimTask',worker);
 const {artifact,work}=materialCheckpoint(f,child,worker);confirmCheckpoint(f.root,{work,kind:'author-materials',artifactId:artifact.artifactId,artifactHash:artifact.hash,expectedRevision:artifact.revision,decision:'confirm',evidence:{actor:'author',text:'确认准确材料',at:new Date().toISOString()}});
 fs.writeFileSync(path.join(f.root,f.document.relativePath),'确认材料之后的外部新版本');
 assert.throws(()=>f.library.assertProductionAuthority(worker),{code:'SOURCE_CHANGED'});
 const before=f.library.readProduction();assert.throws(()=>f.library.mutateProduction('advanceJourney',{rootClaim:owner,expectedJourneyRevision:1,expectedStepId:parent.journeyState.activeStepId},{mutationId:randomUUID()}),{code:'SOURCE_CHANGED'});
 const after=f.library.readProduction();assert.deepEqual(after.tasks,before.tasks);assert.deepEqual(after.costs,before.costs);assert.equal(after.tasks.find(task=>task.id===parent.id).journeyState.revision,1);assert.equal(after.tasks.find(task=>task.id===child.id).attempts[0].status,'claimed');
});

test('a confirmed original page advances through exact same-step suggestion receipts but rejects external bytes',async t=>{
 const f=fixture(t),{parent,child,owner,worker}=claimed(f,start(f));f.library.mutateProduction('claimTask',worker);
 const material=materialCheckpoint(f,child,worker);confirmCheckpoint(f.root,{work:material.work,kind:'author-materials',artifactId:material.artifact.artifactId,artifactHash:material.artifact.hash,expectedRevision:material.artifact.revision,decision:'confirm',evidence:{actor:'author',text:'作者确认',at:new Date().toISOString()}});
 let snap=f.library.mutateProduction('advanceJourney',{rootClaim:owner,expectedJourneyRevision:1,expectedStepId:parent.journeyState.activeStepId}),root=snap.tasks.find(t=>t.journeyState),writing=snap.tasks.find(t=>t.id===root.journeyState.activeTaskId);
 const writer={taskId:writing.id,attemptId:writing.activeAttemptId,claimToken:randomUUID(),workerId:owner.workerId,rootClaimToken:owner.claimToken};f.library.mutateProduction('claimTask',writer);
 const args={envelope:{binding:f.binding,task:{taskId:writing.id,attemptId:writing.activeAttemptId,requestHash:writing.requestHash}},library:f.library};
 const built=await runCreationHandoff({...args,operation:'build',payload:{...{claimToken:writer.claimToken,workerId:writer.workerId},input:{mutationId:randomUUID(),data:{content_id:f.document.tNumber,type:'口播',stage:'写稿',title:'准确原页',narrative:{story:'作者判断',audience:'作者读者',problem:'资料读回'},segments:[{id:'seg-one',title:'开头',mine:'作者完整原句。'}]}}}});
 confirmCheckpoint(f.root,{work:material.work,kind:'complete-draft',artifactId:built.stageArtifact.artifactId,artifactHash:built.stageArtifact.hash,expectedRevision:built.stageArtifact.revision,decision:'confirm',evidence:{actor:'author',text:'确认正文',at:new Date().toISOString()}});
 const suggested=await runCreationHandoff({...args,operation:'suggest',payload:{claimToken:writer.claimToken,workerId:writer.workerId,input:{mutationId:randomUUID(),expectedRevision:built.revision,suggestion:{segment:'seg-one',category:'表达',source:'AI',original:'作者完整原句。',proposed:'作者完整原句的新建议。',reason:'表达调整',basis:{type:'AI 自己的判断',text:'当前原句'},verdict:'待你定'}}}});
 assert.equal(f.library.assertProductionAuthority(writer),true);
 snap=f.library.mutateProduction('advanceJourney',{rootClaim:owner,expectedJourneyRevision:2,expectedStepId:root.journeyState.activeStepId});root=snap.tasks.find(t=>t.journeyState);const review=snap.tasks.find(t=>t.id===root.journeyState.activeTaskId);
 assert.equal(review.request.parameters.stage,'review-page');assert.equal(review.request.parameters.source.hash,suggested.revision);
 const reviewer={taskId:review.id,attemptId:review.activeAttemptId,claimToken:randomUUID(),workerId:owner.workerId,rootClaimToken:owner.claimToken};f.library.mutateProduction('claimTask',reviewer);assert.equal(f.library.assertProductionAuthority(reviewer),true);
 const actual=readVaultTaskContext(f.binding.root,f.document.contentId).content;fs.appendFileSync(path.join(f.root,actual.relativePath),'<!-- 外部修改 -->');
 assert.throws(()=>f.library.assertProductionAuthority(reviewer),{code:'STALE_INPUT'});
});
