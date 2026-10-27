import test from 'node:test';
process.env.NODE_ENV='test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createLibrary} from '../../plugin-src/src/lib/file-library/index.mjs';
import {execute} from '../src/main/worker.mts';
import {productionArchiveDirectory} from '../src/main/production-archive.mts';
import {validateInput} from '../src/shared/validation.ts';
async function fixture(t){const parent=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'nova-archive-worker-')));t.after(()=>fs.rm(parent,{recursive:true,force:true}));const l=createLibrary(path.join(parent,'library')),binding={root:l.info.root,libraryId:l.info.libraryId,rootIdentity:l.info.rootIdentity};const task=l.mutateProduction('createTask',{kind:'research',title:'归档任务',prompt:'固定请求',expectedToken:l.readProduction().editToken}).tasks[0],identity={taskId:task.id,attemptId:task.activeAttemptId,claimToken:randomUUID(),workerId:'desktop-archive'};l.mutateProduction('claimTask',identity);l.mutateProduction('submitTask',{...identity,result:{summary:'真实提交契约',artifacts:[{id:randomUUID(),kind:'analysis',title:'分析',text:'完整资料',assetHash:null,data:null}]}});return {parent,l,binding,task};}
test('archive worker accepts a bound task ID only and opens no AI or arbitrary source paths',async t=>{
 const {binding,task}=await fixture(t),archive=await execute('productionArchive',{binding,taskId:task.id},'disabled');assert.equal(archive.ready,true);assert.equal(await productionArchiveDirectory(binding,archive),archive.directory);
 assert.doesNotThrow(()=>validateInput('openProductionLink',{kind:'task-archive',id:task.id}));
 for(const input of [{binding,taskId:task.id,path:'/tmp'},{binding,taskId:'../outside'},{binding,taskId:task.id,attemptId:randomUUID()}])await assert.rejects(execute('productionArchive',input,'disabled'),{code:'INVALID_INPUT'});
 await assert.rejects(execute('productionArchive',{binding,taskId:task.id},'required'),{code:'AUTH_NOT_CONFIGURED'});
 await assert.rejects(productionArchiveDirectory(binding,{...archive,directory:'/tmp'}),{code:'UNSAFE_PATH'});
 await assert.rejects(productionArchiveDirectory(binding,{...archive,category:'创作知识'}),{code:'UNSAFE_PATH'});
 await assert.rejects(productionArchiveDirectory(binding,{...archive,ready:false,warnings:['人工修改待修复']}),{code:'ARCHIVE_NOT_READY'});
});
test('desktop archive path guard rejects an output ancestor changed to a symlink',async t=>{
 const {parent,binding,task}=await fixture(t),archive=await execute('productionArchive',{binding,taskId:task.id},'disabled'),knowledge=path.join(binding.root,'知识库'),moved=path.join(parent,'moved-knowledge');await fs.rename(knowledge,moved);await fs.symlink(moved,knowledge,'dir');
 await assert.rejects(productionArchiveDirectory(binding,archive),{code:'UNSAFE_PATH'});
});

test('desktop acceptance preserves archive warnings while the receipt remains accepted and no mutation stays pending',async t=>{
 const {l:library,binding,parent,task}=await fixture(t),{DesktopController}=await import('../src/main/controller.mts'),{BindingStore}=await import('../src/main/bindings.mts'),{defaultServiceSettings}=await import('../src/shared/service-validation.ts'),{__testing}=await import('../../plugin-src/src/lib/file-library/index.mjs');t.after(()=>__testing.setHook(undefined));
 const controller=new DesktopController({store:new BindingStore(path.join(parent,'machine.json')),worker:{call:(op,args)=>execute(op,args,'disabled')},documents:parent,dialogs:{destination:async()=>null},authMode:'disabled',productionCallbacks:{launch:async()=>assert.fail('view/accept must not launch an AI'),open:async()=>'',serviceSettings:async()=>({values:defaultServiceSettings(),credentials:{tikhub:{hasKey:false},model:{hasKey:false},asr:{hasKey:false}},encryptionAvailable:true})}});await controller.initialize();await controller.persist({...controller.binding,current:binding});
 const before=library.readProduction(),attempt=before.tasks[0].attempts[0];__testing.setHook(event=>{if(event.phase==='productionArchiveBeforePublish')throw Object.assign(Error('simulated archive disk error'),{code:'EIO'});});
 const accepted=await controller.actProductionTask({action:'accept',taskId:task.id,attemptId:attempt.id,receiptHash:attempt.receipt.sha256,expectedToken:before.editToken});assert.equal(accepted.tasks[0].attempts[0].status,'accepted');assert(accepted.archiveWarnings.length>0);assert.equal((await controller.readProductionPending()).pending,false);assert.equal(library.readProduction().tasks[0].attempts[0].receipt.sha256,attempt.receipt.sha256);
});
