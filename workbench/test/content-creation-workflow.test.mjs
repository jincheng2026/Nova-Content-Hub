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

test('content creation workflow validates scope, ensures creation once and reuses the active task after a launch failure',async t=>{
 for(const input of [{...start,workflow:'content-creation'},{...start,kind:'review',contentId:randomUUID(),workflow:'content-creation'},{...start,workflow:'other'}])assert.throws(()=>validateInput('startProductionTask',input),{code:'INVALID_INPUT'});
 let launches=0;const {controller:c,library:l}=await fixture(t,{launch:async()=>{launches++;throw Error('missing host');}}),content=l.createContent({title:'选题',body:'原文'}),input={...start,kind:'writing',contentId:content.id,workflow:'content-creation'};
 const first=await c.startProductionTask(input);assert.equal(first.opened,false);assert.equal(first.snapshot.creations.length,1);assert.equal(first.snapshot.tasks.length,1);assert.equal(first.snapshot.tasks[0].request.parameters.workflow,'content-creation');
 const second=await c.startProductionTask(input);assert.equal(second.snapshot.tasks.length,1);assert.equal(second.snapshot.tasks[0].activeAttemptId,first.snapshot.tasks[0].activeAttemptId);assert.equal(launches,2);
 const task=second.snapshot.tasks[0];l.mutateProduction('claimTask',{taskId:task.id,attemptId:task.activeAttemptId,claimToken:randomUUID(),workerId:'original-chat'});
 const running=await c.startProductionTask(input);assert.equal(running.snapshot.tasks.length,1);assert.equal(launches,2);assert.match(running.message,/原.*聊天/);
});

test('workflow keeps one attempt across both waiting states and submitted result for each host without granting extra permissions',async t=>{
 for(const host of ['codex','workbuddy']){
  let launches=0;const focuses=[];const settings=view();settings.values.commentsEnabled=true;settings.values.budget={enabled:true,maxRequestsPerTask:2};const {controller:c,library:l}=await fixture(t,{launch:async()=>{launches++;},focus:async host=>focuses.push(host),serviceSettings:async()=>settings});await c.persist({...c.binding,assistant:host});
  const content=l.createContent({title:'教程',body:'固定原文'}),input={...start,kind:'writing',workflow:'content-creation',contentId:content.id},started=await c.startProductionTask(input),task=started.snapshot.tasks[0],identity={taskId:task.id,attemptId:task.activeAttemptId,claimToken:randomUUID(),workerId:'same-chat'};
  assert.equal(task.attempts[0].host,host);assert.match(task.request.prompt,/同一个助手聊天/);assert.match(task.request.prompt,/最后一次 submit/);assert.deepEqual(task.request.budget,{amount:2,currency:'REQ'});assert.equal(task.request.parameters.comments,false);assert.equal(task.request.bodyHash,(await c.readProductionCreation({contentId:content.id})).content.bodyHash);
  l.mutateProduction('claimTask',identity);
  for(const status of ['waiting-user','waiting-permission']){l.mutateProduction('progressTask',{...identity,status,progress:20,message:'原聊天继续'});const repeated=await c.startProductionTask(input);assert.equal(repeated.snapshot.tasks.length,1);assert.equal(repeated.snapshot.tasks[0].activeAttemptId,identity.attemptId);assert.equal(launches,1);assert.equal(repeated.opened,true);assert.match(repeated.message,/无法自动定位原聊天/);assert.equal(l.readProductionContext(task.id).attempt.claimToken,identity.claimToken);assert.equal(l.readProductionContext(task.id).attempt.workerId,identity.workerId);}
  assert.deepEqual(focuses,[host,host]);
  l.mutateProduction('submitTask',{...identity,result:{summary:'整篇',artifacts:[{id:randomUUID(),kind:'draft',title:'完整稿',text:'完整正文',assetHash:null,data:null},{id:randomUUID(),kind:'packaging',title:'包装',text:'候选',assetHash:null,data:{titles:[],coverTexts:[],intros:[]}}]}});
  const repeated=await c.startProductionTask(input);assert.equal(repeated.snapshot.tasks.length,1);assert.match(repeated.message,/预览/);assert.equal(launches,1);
 }
});
