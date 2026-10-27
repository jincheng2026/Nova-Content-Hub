import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createLibrary} from '../../plugin-src/src/lib/file-library/index.mjs';
import {DesktopController} from '../src/main/controller.mts';
import {BindingStore,validateBinding} from '../src/main/bindings.mts';
import {execute} from '../src/main/worker.mts';
import {validateInput} from '../src/shared/validation.ts';
import {defaultServiceSettings} from '../src/shared/service-validation.ts';
const view=()=>({values:defaultServiceSettings(),credentials:{tikhub:{hasKey:false},model:{hasKey:false},asr:{hasKey:false}},encryptionAvailable:true});
async function fixture(t,callbacks={}){
 const parent=await fs.mkdtemp(path.join(os.tmpdir(),'nova-production-desktop-'));t.after(()=>fs.rm(parent,{recursive:true,force:true}));
 const library=createLibrary(path.join(parent,'library')),binding={root:library.info.root,libraryId:library.info.libraryId,rootIdentity:library.info.rootIdentity},store=new BindingStore(path.join(parent,'binding.json'));
 const controller=new DesktopController({store,worker:{call:(op,args)=>execute(op,args,'disabled')},documents:parent,dialogs:{destination:async()=>null},authMode:'disabled',productionCallbacks:{launch:async()=>{},open:async()=>'',serviceSettings:async()=>view(),...callbacks}});
 await controller.initialize();await controller.persist({...controller.binding,current:binding});return {controller,library,binding,parent,store};
}
const start={kind:'research',title:'测试任务',prompt:'仅测试本机契约，不调用服务',mode:'simple',comments:false};
test('renderer forbids internal task tools, paths, partial acceptance and untrusted task parameters',()=>{
 for(const op of ['claimTask','reserveCost'])assert.throws(()=>validateInput('mutateProduction',{op,input:{},mutationId:randomUUID()}),{code:'INVALID_INPUT'});
 assert.throws(()=>validateInput('actProductionTask',{taskId:randomUUID(),action:'accept'}),{code:'INVALID_INPUT'});
 assert.throws(()=>validateInput('chooseProductionFiles',{kind:'report',sources:['/tmp/a']}),{code:'INVALID_INPUT'});
 assert.throws(()=>validateInput('startProductionTask',{...start,parameters:{comments:true}}),{code:'INVALID_INPUT'});
});
test('read does not enable creation; explicit enable and draft save use real CAS versions',async t=>{
 const {controller:c,library:l}=await fixture(t),content=l.createContent({title:'选题',body:'原文'});
 assert.equal((await c.readProductionCreation({contentId:content.id})).creation,null);assert.equal((await c.readProduction()).creations.length,0);
 const snap=await c.readProduction();await c.mutateProduction({op:'ensureCreation',input:{contentId:content.id,expectedToken:snap.editToken},mutationId:randomUUID()});
 const s=await c.readProductionCreation({contentId:content.id});assert.match(s.creation.tNumber,/^T/);
 const input={contentId:content.id,body:'新正文',editToken:s.content.editToken,bodyHash:s.content.bodyHash,productionToken:s.productionToken,creationPatch:{analysis:'真实拆解'}};
 const saved=await c.saveProductionDraft(input);assert.equal(saved.content.body,'新正文');assert.equal(saved.creation.analysis,'真实拆解');
 await assert.rejects(c.saveProductionDraft(input),{code:'CONFLICT'});assert.equal((await c.readProductionPending()).pending,true);assert.equal((await c.readProductionCreation({contentId:content.id})).content.body,'新正文');
});
test('launch failure preserves one task; comments require per-task consent and setting; budget is REQ without broker token',async t=>{
 const settings=view();settings.values.budget={enabled:true,maxRequestsPerTask:3};let launches=0;
 const {controller:c}=await fixture(t,{launch:async()=>{launches++;throw Error('no host');},serviceSettings:async()=>settings,servicesDescriptor:()=>({version:1,host:'127.0.0.1',port:12345,token:'must-not-persist'})});
 const result=await c.startProductionTask({...start,mode:'detailed',comments:true});assert.equal(result.opened,false);assert.equal(result.snapshot.tasks.length,1);
 const request=result.snapshot.tasks[0].request;assert.equal(request.parameters.comments,false);assert.deepEqual(request.budget,{amount:3,currency:'REQ'});assert.equal(request.parameters.mode,'detailed');assert.equal(JSON.stringify(request).includes('must-not-persist'),false);
 await c.openProductionTask({taskId:result.snapshot.tasks[0].id});assert.equal((await c.readProduction()).tasks.length,1);assert.equal(launches,2);
 settings.values.commentsEnabled=true;assert.equal((await c.startProductionTask({...start,comments:true})).snapshot.tasks.at(-1).request.parameters.comments,true);assert.equal((await c.startProductionTask(start)).snapshot.tasks.at(-1).request.parameters.comments,false);
});
test('lost mutation reply persists exact intent; same-id recovery avoids duplicate records and blocks interleaved writes',async t=>{
 const {controller:c,store}=await fixture(t),before=await c.readProduction();let lose=true;
 c.worker={call:async(op,args)=>{const result=await execute(op,args,'disabled');if(op==='productionMutate'&&lose){lose=false;throw Object.assign(Error('lost'),{code:'WORKER_EXIT'});}return result;}};
 const mutationId=randomUUID(),input={text:'必须只写一次',source:'人工',expectedToken:before.editToken};
 await assert.rejects(c.mutateProduction({op:'recordKnowledge',input,mutationId}),{code:'WORKER_EXIT'});const saved=await store.load();assert.equal(saved.productionPending.mutationId,mutationId);assert.deepEqual(saved.productionPending.input,input);
 await assert.rejects(c.createContent({title:'不能交错',body:''}),{code:'PENDING_MUTATION'});assert.equal((await c.status()).productionPending,true);
 const recovered=await c.recoverProductionPending({action:'retry'});assert.equal(recovered.knowledge.length,1);assert.equal((await store.load()).productionPending,null);
});
test('pending metadata is library-bound and required builds reject all production access',async t=>{
 const {controller:c,binding}=await fixture(t),s=await c.readProduction(),pending={kind:'mutate',binding:{libraryId:randomUUID(),rootIdentity:binding.rootIdentity},mutationId:randomUUID(),op:'recordFeedback',input:{text:'x',source:'x',expectedToken:s.editToken}};
 assert.throws(()=>validateBinding({...c.binding,productionPending:pending}),{code:'BINDING_INVALID'});
 for(const [op,args]of [['productionRead',{binding}],['productionCreation',{binding,contentId:randomUUID()}],['productionMutate',{binding,pending}]])await assert.rejects(execute(op,args,'required'),{code:'AUTH_NOT_CONFIGURED'});
});
test('claim tokens are redacted and acceptance requires current attempt and exact receipt',async t=>{
 const {controller:c,library:l}=await fixture(t),result=await c.startProductionTask(start),task=result.snapshot.tasks[0],attempt=task.attempts[0],claimToken=randomUUID(),identity={taskId:task.id,attemptId:attempt.id,claimToken,workerId:'test'};
 l.mutateProduction('claimTask',identity,{mutationId:randomUUID()});assert.equal((await c.readProduction()).tasks[0].attempts[0].claimToken,null);
 l.mutateProduction('submitTask',{...identity,result:{summary:'结果',artifacts:[{id:randomUUID(),kind:'research',title:'测试',text:'可核验结果',assetHash:null,data:null}]}},{mutationId:randomUUID()});const s=await c.readProduction(),a=s.tasks[0].attempts[0];
 await assert.rejects(c.actProductionTask({taskId:task.id,action:'accept',expectedToken:s.editToken,attemptId:a.id,receiptHash:'a'.repeat(64)}),{code:'INVALID_INPUT'});await c.recoverProductionPending({action:'discard'});
 assert.equal((await c.actProductionTask({taskId:task.id,action:'accept',expectedToken:s.editToken,attemptId:a.id,receiptHash:a.receipt.sha256})).tasks[0].attempts[0].status,'accepted');
});
test('unknown cost blocks retry until explicit reconciliation and clears matching service cache intent',async t=>{
 const cleared=[],{controller:c,library:l}=await fixture(t,{costReconciled:async id=>cleared.push(id)}),result=await c.startProductionTask(start),task=result.snapshot.tasks[0],a=task.attempts[0],claimToken=randomUUID(),requestId=randomUUID(),identity={taskId:task.id,attemptId:a.id,claimToken,workerId:'test'};
 l.mutateProduction('claimTask',identity,{mutationId:randomUUID()});l.mutateProduction('reserveCost',{...identity,requestId,service:'tikhub',usage:{requests:0}},{mutationId:randomUUID()});await c.actProductionTask({taskId:task.id,action:'cancel'});
 await assert.rejects(c.actProductionTask({taskId:task.id,action:'retry'}),{code:'COST_UNKNOWN'});await c.recoverProductionPending({action:'discard'});
 const s=await c.readProduction(),cost=s.costs[0];assert.equal(cost.status,'unknown');await c.mutateProduction({op:'reconcileCost',input:{taskId:task.id,attemptId:a.id,id:cost.id,status:'measured',amount:0,usage:{source:'人工核对，未发送请求'},expectedToken:s.editToken},mutationId:randomUUID()});assert.deepEqual(cleared,[requestId]);assert.equal((await c.actProductionTask({taskId:task.id,action:'retry'})).tasks[0].attempts.length,2);
});
test('file recovery verifies the original bytes before importing a changed source',async t=>{
 const {controller:c,parent,library:l}=await fixture(t),source=path.join(parent,'report.html');await fs.writeFile(source,'<!doctype html><html><body>原报告</body></html>');c.dialogs.productionFiles=async()=>[source];
 const real=c.worker;let lose=true;c.worker={call:async(op,args)=>{if(op==='productionMutate'&&lose){lose=false;throw Object.assign(Error('not sent'),{code:'WORKER_EXIT'});}return real.call(op,args);}};
 await assert.rejects(c.chooseProductionFiles({kind:'report'}),{code:'WORKER_EXIT'});assert.equal(c.binding.productionPending.kind,'files');await fs.writeFile(source,'<!doctype html><html><body>文件已经改变</body></html>');
 await assert.rejects(c.recoverProductionPending({action:'retry'}),{code:'STALE_INPUT'});assert.equal((await c.readProductionPending()).pending,true);assert.equal(l.readProduction().reports.length,0);
 await c.recoverProductionPending({action:'discard'});const imported=await c.chooseProductionFiles({kind:'report'});assert.equal(imported.length,1);assert.equal(imported[0].originalName,'report.html');
});

test('platform catalog exposes no caller-controlled endpoint and account platform freezes collection capability',async t=>{
 assert.doesNotThrow(()=>validateInput('readPlatformCatalog',undefined));
 for(const input of [{},{url:'https://example.com/openapi.json'},{key:'not-an-input'}])assert.throws(()=>validateInput('readPlatformCatalog',input),{code:'INVALID_INPUT'});
 const settings=view();settings.values.commentsEnabled=true;settings.values.budget.enabled=true;
 const {controller:c}=await fixture(t,{serviceSettings:async()=>settings});
 for(const [platform,expected]of [['小红书','manual'],['Douyin','douyin'],['旧自定义平台','manual']]){
  const snapshot=await c.readProduction();
  const saved=await c.mutateProduction({op:'saveAccount',input:{name:`${platform}账号`,platform,url:'',note:'手工资料',tags:[],images:[],reportIds:[],expectedToken:snapshot.editToken},mutationId:randomUUID()});
  const account=saved.accounts.at(-1),result=await c.startProductionTask({...start,kind:'analysis',accountId:account.id,comments:true}),request=result.snapshot.tasks.at(-1).request;
  assert.equal(request.parameters.platform,platform);assert.equal(request.parameters.platformCollection,expected);
  assert.equal(request.tools.includes('tikhub'),expected==='douyin');assert.equal(request.parameters.comments,expected==='douyin');
 }
 const before=(await c.readProduction()).tasks.length;
 await assert.rejects(c.startProductionTask({...start,accountId:randomUUID()}),{code:'NOT_FOUND'});
 assert.equal((await c.readProduction()).tasks.length,before,'unknown accounts cannot create misleading collection tasks');
});

// A depth selection must reach the frozen request as an actionable scope without granting extra budget.
test('research depth freezes distinct deliverables while preserving user scope, budget and other task kinds',async t=>{
 const settings=view();settings.values.budget={enabled:true,maxRequestsPerTask:2};
 const {controller:c}=await fixture(t,{serviceSettings:async()=>settings});
 const simple=(await c.startProductionTask({...start,mode:'simple'})).snapshot.tasks.at(-1).request;
 const detailed=(await c.startProductionTask({...start,mode:'detailed'})).snapshot.tasks.at(-1).request;
 assert.equal(simple.parameters.researchDepth.goal,'先判断方向');
 assert.equal(detailed.parameters.researchDepth.goal,'为具体创作做准备');
 assert(simple.parameters.researchDepth.deliverables.length<detailed.parameters.researchDepth.deliverables.length);
 for(const request of [simple,detailed]) {
  assert.equal(request.prompt,start.prompt);
  assert.deepEqual(request.budget,{amount:2,currency:'REQ'});
  assert.equal(request.parameters.comments,false);
  assert.match(request.parameters.researchDepth.constraints,/样本不足/);
 }
 const writing=(await c.startProductionTask({...start,kind:'writing',mode:'detailed'})).snapshot.tasks.at(-1).request;
 assert.equal(writing.parameters.researchDepth,undefined);
});
