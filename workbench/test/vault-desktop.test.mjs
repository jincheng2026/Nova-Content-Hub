import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createLibrary} from '../../plugin-src/src/lib/file-library/index.mjs';
import {createVault} from '../../plugin-src/src/lib/vault/index.mjs';
import {DesktopController} from '../src/main/controller.mts';
import {BindingStore,validateBinding} from '../src/main/bindings.mts';
import {execute} from '../src/main/worker.mts';
import {validateInput} from '../src/shared/validation.ts';
import {defaultServiceSettings} from '../src/shared/service-validation.ts';
const settings=()=>({values:defaultServiceSettings(),credentials:{tikhub:{hasKey:false},model:{hasKey:false},asr:{hasKey:false}},encryptionAvailable:true});
async function fixture(t,{vault=true,mode='disabled',dialogRoot=null,worker:customWorker}={}){
 const parent=await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()),'nova-vault-desktop-'));t.after(()=>fs.rm(parent,{recursive:true,force:true}));
 const root=path.join(parent,'知识库');let binding;
 if(vault){await fs.mkdir(root);binding=createVault(root);}else{const l=createLibrary(root);binding={root:l.info.root,libraryId:l.info.libraryId,rootIdentity:l.info.rootIdentity};}
 const store=new BindingStore(path.join(parent,'binding.json')),reveals=[];
 const worker=customWorker??{call:(op,args)=>execute(op,args,mode)};
 const controller=new DesktopController({store,worker,documents:parent,dialogs:{destination:async()=>null,library:async()=>dialogRoot},authMode:mode,revealFolder:location=>reveals.push(location),productionCallbacks:{launch:async()=>{},open:async()=>'',serviceSettings:async()=>settings()}});
 controller.covers.seed=async()=>{}; // Builtin template assets are covered by their existing suite.
 await controller.initialize();await controller.persist({...controller.binding,current:binding});return {controller,binding,parent,root,store,reveals};
}
test('finite Vault IPC rejects renderer paths, extra fields, invalid sections, excess text and workflow privileges',()=>{
 const hash='a'.repeat(64),id='doc-'+'b'.repeat(32);
 for(const [method,input]of [
 ['readVault',{root:'/tmp'}],['readVaultDocument',{id:'../../README.md'}],['readVaultDocument',{id,root:'/tmp'}],['saveVaultDocument',{id,expectedHash:hash,text:'ok',path:'/tmp'}],['createVaultDocument',{section:'unknown',title:'x',text:''}],['createVaultDocument',{section:'materials',title:'x',text:'x'.repeat(1_000_001)}],['trashVaultDocument',{id,expectedHash:hash,mutationId:randomUUID()}],['recoverVaultMutation',{action:'force'}],
 ['startProductionTask',{kind:'writing',title:'定位',prompt:'定位',workflow:'positioning-interview',businessSkill:'xindao-interview',contentId:randomUUID(),accountId:null,mode:'simple',comments:false}],
 ])assert.throws(()=>validateInput(method,input),{code:'INVALID_INPUT'});
 validateInput('createContent',{title:'',body:'先记录想法'});
});
test('new and open dialogs cancelled leave binding and filesystem unchanged',async t=>{
 const {controller:c,parent,store}=await fixture(t);const before=await fs.readFile(store.file,'utf8'),entries=await fs.readdir(parent);
 await c.createLibrary();await c.openLibrary();assert.equal(await fs.readFile(store.file,'utf8'),before);assert.deepEqual(await fs.readdir(parent),entries);
});
test('new Vault binds its runtime and exposes source root name/location; old library remains readable',async t=>{
 const {controller:c,parent,root,reveals}=await fixture(t);c.dialogs.library=async()=>root;await c.openLibrary();assert.equal((await c.status()).currentName,'知识库');assert.notEqual(c.current().root,root);
 assert.equal((await c.readVault()).root,root);await c.revealLibraryFolder();assert.equal(reveals.at(-1),root);
 const legacyRoot=path.join(parent,'原有库'),legacy=createLibrary(legacyRoot);legacy.createContent({title:'历史内容',body:'保留正文'});c.dialogs.library=async()=>legacyRoot;await c.openLibrary();assert.equal(await c.readVault(),null);assert.equal((await c.listContents())[0].title,'历史内容');
 c.dialogs.destination=async()=>path.join(parent,'新知识库');await c.createLibrary();assert.equal((await c.readVault()).name,'新知识库');assert.equal((await c.status()).currentName,'新知识库');
});
test('Vault save preserves durable intent across lost response, recovers idempotently and enforces source conflicts',async t=>{
 const {controller:c,root,store}=await fixture(t);const made=await c.createVaultDocument({section:'materials',title:'资料',text:'原文'});
 const original=c.worker;let drop=true;c.worker={call:async(op,args)=>{const result=await original.call(op,args);if(op==='vaultMutate'&&drop){drop=false;throw Object.assign(new Error('lost response'),{code:'WORKER_EXIT'});}return result;}};
 await assert.rejects(c.saveVaultDocument({id:made.document.id,expectedHash:made.document.hash,text:'只写入一次'}),{code:'WORKER_EXIT'});const pending=(await store.load()).vaultPending;assert.ok(pending);validateBinding(await store.load());
 const recovered=await c.recoverVaultMutation({action:'retry'});assert.equal(recovered.result.text,'只写入一次');assert.equal(c.binding.vaultPending,null);
 const current=await c.readVaultDocument({id:made.document.id});await fs.writeFile(path.join(root,current.document.relativePath),'外部更新');await assert.rejects(c.saveVaultDocument({id:current.document.id,expectedHash:current.document.hash,text:'本地草稿'}),{code:'CONFLICT'});
 assert.ok(c.binding.vaultPending);await c.recoverVaultMutation({action:'discard'});assert.equal(c.binding.vaultPending,null);assert.equal((await c.readVaultDocument({id:made.document.id})).text,'外部更新');
});
test('Vault writes cannot bypass required auth or another pending operation',async t=>{
 const {controller:c,binding}=await fixture(t,{mode:'required'});await assert.rejects(c.createVaultDocument({section:'materials',title:'x',text:'x'}),{code:'AUTH_NOT_CONFIGURED'});
 await assert.rejects(execute('vaultMutate',{binding,pending:{method:'createVaultDocument',input:{section:'materials',title:'x',text:'x'},mutationId:randomUUID(),binding:{libraryId:binding.libraryId,rootIdentity:binding.rootIdentity}}},'required'),{code:'AUTH_NOT_CONFIGURED'});
 c.authMode='disabled';await c.persist({...c.binding,pending:{op:'createContent',input:{title:'待核验',body:''},mutationId:randomUUID()}});await assert.rejects(c.createVaultDocument({section:'materials',title:'x',text:'x'}),{code:'PENDING_MUTATION'});
});
test('positioning starts or resumes the same writing task with fixed business method and zero tools/budget',async t=>{
 const {controller:c}=await fixture(t);let serviceReads=0;c.production.callbacks.serviceSettings=async()=>{serviceReads++;return settings();};
 const input={kind:'writing',title:'梳理定位',prompt:'逐步定位访谈',workflow:'positioning-interview',businessSkill:'xindao-interview',contentId:null,accountId:null,mode:'simple',comments:false};
 const first=await c.startProductionTask(input),task=first.snapshot.tasks.at(-1);assert.deepEqual(task.request.tools,[]);assert.equal(task.request.budget.amount,0);assert.equal(task.request.parameters.workflow,'positioning-interview');assert.equal(task.request.parameters.businessSkill,'xindao-interview');assert.equal(task.contentId,null);assert.equal(task.accountId,null);assert.equal(serviceReads,0);
 const second=await c.startProductionTask(input);assert.equal(second.snapshot.tasks.length,first.snapshot.tasks.length);assert.equal(second.snapshot.tasks.at(-1).id,task.id);
});
test('topic suggestions use saved idea context and never mutate its title or body',async t=>{
 const {controller:c}=await fixture(t);const content=await c.createContent({title:'未定标题内容',body:'我有一个来自客户问题的想法'});
 const input={kind:'research',title:'推荐选题',prompt:'先交回候选供我选择，选题不是最终标题',workflow:'topic-suggestion',businessSkill:'xindao-xuanti',contentId:content.id,accountId:null,mode:'simple',comments:false};
 const result=await c.startProductionTask(input),task=result.snapshot.tasks.at(-1);assert.equal(task.kind,'research');assert.equal(task.contentId,content.id);assert.deepEqual(task.request.tools,[]);assert.equal(task.request.budget.amount,0);assert.equal(task.request.parameters.businessSkill,'xindao-xuanti');assert.equal(task.request.parameters.workflow,'topic-suggestion');
 assert.equal((await c.readContent({id:content.id})).title,content.title);assert.equal((await c.readContent({id:content.id})).body,content.body);
 assert.throws(()=>validateInput('startProductionTask',{...input,comments:true}),{code:'INVALID_INPUT'});assert.throws(()=>validateInput('startProductionTask',{...input,businessSkill:'xindao-interview'}),{code:'INVALID_INPUT'});
});

test('synthesis freezes its three-depth brief without a T number or social-media collection contract',async t=>{
 const {controller:c}=await fixture(t);c.production.callbacks.serviceSettings=async()=>{const v=settings();v.values.budget={enabled:true,maxRequestsPerTask:10};v.values.commentsEnabled=true;return v;};
 const brief={depth:'issue',question:'围绕已给一手材料比较争议',purpose:'核对判断依据',timeBoundary:'仅2026年材料',scopeBoundary:'仅明确提供的材料'};
 const input={kind:'research',title:'综合调研',prompt:'不调用外部服务，只校验固定请求',contentId:null,accountId:null,workflow:'jincheng-stage',stage:'synthesis',businessSkill:'jc-synthesis-research',synthesisBrief:brief,mode:'simple',comments:false};
 assert.doesNotThrow(()=>validateInput('startProductionTask',input));
 for(const bad of [{...input,synthesisBrief:undefined},{...input,synthesisBrief:{...brief,depth:'detailed'}},{...input,researchBrief:{route:'topic',platform:'manual',targetIds:['other']}},{...input,businessSkill:'jc-media-research'},{...input,comments:true},{...input,stage:'research'}])assert.throws(()=>validateInput('startProductionTask',bad),{code:'INVALID_INPUT'});
 const result=await c.startProductionTask(input),task=result.snapshot.tasks.at(-1);
 assert.deepEqual(task.request.parameters.synthesisBrief,brief);assert.equal(task.request.parameters.workflow,'jincheng-stage');assert.equal(task.request.parameters.stage,'synthesis');assert.equal(task.request.parameters.businessSkill,'jc-synthesis-research');assert.equal('researchRuntime' in task.request.parameters,false);assert.deepEqual(task.request.tools,[]);assert.equal(task.request.budget.amount,0);assert.equal(task.contentId,null);
});

test('cover design freezes a valid explicit ratio and rejects stray or missing ratios',async t=>{
 const {controller:c}=await fixture(t);const input={kind:'packaging',title:'封面设计',prompt:'仅设计候选',contentId:null,accountId:null,workflow:'jincheng-stage',stage:'cover-design',businessSkill:'jc-cover-design',coverDesignRatio:'16:9',mode:'simple',comments:false};
 assert.doesNotThrow(()=>validateInput('startProductionTask',input));
 for(const bad of [{...input,coverDesignRatio:undefined},{...input,coverDesignRatio:'0:4'},{...input,coverDesignRatio:'1.5:1'},{...input,stage:'cover-copy'}])assert.throws(()=>validateInput('startProductionTask',bad),{code:'INVALID_INPUT'});
 const result=await c.startProductionTask(input);assert.equal(result.snapshot.tasks.at(-1).request.parameters.coverDesignRatio,'16:9');
});
test('unavailable external ASR never blocks a synthesis task with no ASR tools',async t=>{
 const {controller:c}=await fixture(t);c.production.callbacks.serviceSettings=async()=>{const v=settings();v.values.asr={...v.values.asr,mode:'local-only',localEngine:'qwen3-asr',localModule:'mlx_audio',localExecutable:'/unavailable-qwen-python',localModelPath:'/unavailable-qwen-model'};return v;};
 const result=await c.startProductionTask({kind:'research',title:'综合调研',prompt:'仅综合给定材料',contentId:null,accountId:null,workflow:'jincheng-stage',stage:'synthesis',businessSkill:'jc-synthesis-research',synthesisBrief:{depth:'issue',question:'明确问题',purpose:'形成判断',timeBoundary:'截至今天',scopeBoundary:'给定材料'},mode:'simple',comments:false});
 const task=result.snapshot.tasks.at(-1);assert.deepEqual(task.request.tools,[]);assert.equal(task.request.parameters.serviceConfig.externalAsrIdentity,undefined);
});
