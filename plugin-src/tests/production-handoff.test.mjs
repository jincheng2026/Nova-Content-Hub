import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createLibrary} from '../src/lib/file-library/index.mjs';
import {prepareProductionHandoff,readProductionHandoff,productionHandoffContext} from '../src/bridge/production-handoff.mjs';
import {nativeHandoffDirectory} from '../src/bridge/native-handoff.mjs';
const release={format:'nova-content-plugin-release',schemaVersion:1,productId:'nova-content-hub',appScope:'nova-content-hub',protocolVersion:1,prototype:true,version:'0.2.0',AUTH_MODE:'disabled',pairId:'nova-content-hub@0.2.0:p1:disabled',experimental:true,productionReady:false,platform:process.platform,arch:process.arch};
function fixture(t,host='codex',prompt='请根据手工资料完成调研。') {
 const dir=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'nova-production-handoff-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const lib=createLibrary(path.join(dir,'lib'));
 const snapshot=lib.mutateProduction('createTask',{kind:'research',title:'完整调研标题',prompt,host,parameters:{comments:false},tools:[],budget:{amount:0,currency:'REQ'},expectedToken:lib.readProduction().editToken});const task=snapshot.tasks[0];return {dir,lib,binding:{root:lib.info.root,libraryId:lib.info.libraryId,rootIdentity:lib.info.rootIdentity},task,locator:{taskId:task.id,attemptId:task.activeAttemptId,requestHash:task.requestHash,host}};
}
for(const host of ['codex','workbuddy'])test(`${host}: full prompt, frozen request, dynamic broker locator, retirement and release denial`,async t=>{
 const f=fixture(t,host,'第一段\n第二段，完整中文用户需求'),descriptor=path.join(f.dir,'service.json'),prepared=await prepareProductionHandoff(path.join(f.dir,'handoffs'),f.binding,f.locator,release,{serviceDescriptorPath:descriptor});
 assert(prepared.prompt.includes('第一段\n第二段'));assert(prepared.prompt.includes('未勾选'));assert.equal(new URL(prepared.url).protocol,host+':');
 assert.equal(new URL(prepared.url).searchParams.get(host==='codex'?'path':'cwd'),f.binding.root);
 assert(prepared.prompt.includes(JSON.stringify(f.binding.root)));assert(prepared.prompt.includes(f.binding.libraryId));
 assert(prepared.prompt.includes('知识库/助手产物/调研报告/'));assert(prepared.prompt.includes('在当前助手对话'));
 const envelope=readProductionHandoff(path.join(f.dir,'handoffs'),prepared.id,release),context=productionHandoffContext(envelope).context;assert.equal(context.serviceDescriptorPath,descriptor);assert.equal(context.task.requestHash,f.task.requestHash);assert(!JSON.stringify(context.task.request).includes(descriptor));
 f.lib.mutateProduction('cancelTask',{taskId:f.task.id,expectedToken:f.lib.readProduction().editToken});await assert.rejects(prepareProductionHandoff(path.join(f.dir,'handoffs'),f.binding,f.locator,release),{code:'INVALID_HANDOFF'});
 assert.throws(()=>readProductionHandoff(path.join(f.dir,'handoffs'),prepared.id,{...release,AUTH_MODE:'required',pairId:'nova-content-hub@0.2.0:p1:required'}),{code:'AUTH_NOT_CONFIGURED'});
});
test('long complete prompts stay available through manual clipboard fallback',async t=>{const f=fixture(t,'workbuddy','完整需求\n'.repeat(2000));const h=await prepareProductionHandoff(path.join(f.dir,'handoffs'),f.binding,f.locator,release);assert.equal(h.requiresPaste,true);assert(!new URL(h.url).searchParams.has('prompt'));assert(h.prompt.includes(f.task.request.prompt));});
for(const host of ['codex','workbuddy'])test(`${host}: claimed and waiting tasks keep original handoff readable but cannot prepare another conversation`,async t=>{
 const f=fixture(t,host),directory=path.join(f.dir,'handoffs'),original=await prepareProductionHandoff(directory,f.binding,f.locator,release),identity={taskId:f.task.id,attemptId:f.task.activeAttemptId,claimToken:randomUUID(),workerId:'original-chat'};
 f.lib.mutateProduction('claimTask',identity,{mutationId:randomUUID()});
 for(const status of ['claimed','waiting-user','claimed','waiting-permission','claimed']){
  if(status!==f.lib.readProduction().tasks[0].attempts[0].status)f.lib.mutateProduction('progressTask',{...identity,status,progress:10,message:'原聊天继续'},{mutationId:randomUUID()});
  assert.equal(readProductionHandoff(directory,original.id,release).task.attemptId,identity.attemptId);
  await assert.rejects(prepareProductionHandoff(directory,f.binding,f.locator,release),{code:'INVALID_HANDOFF'});
  assert.equal(fs.readdirSync(directory).length,1);
 }
});
test('built CLI preserves worker identity, both waits, submit receipt and manual acceptance',async t=>{
 const f=fixture(t),src=path.join(f.dir,'src');fs.cpSync(new URL('../src/',import.meta.url),src,{recursive:true});fs.writeFileSync(path.join(src,'release.json'),JSON.stringify(release));
 const h=await prepareProductionHandoff(nativeHandoffDirectory(),f.binding,f.locator,release,{serviceDescriptorPath:path.join(f.dir,'service.json')});t.after(()=>fs.rmSync(path.join(nativeHandoffDirectory(),`${h.id}.production.json`),{force:true}));
 const run=(op,payload)=>{const child=spawnSync(process.execPath,[path.join(src,'cli.mjs'),'production',op,'--handoff',h.id,...(payload?['--stdin']:[])],{input:payload?JSON.stringify(payload):undefined,encoding:'utf8',timeout:15000});assert(!child.error,child.error?.message);return JSON.parse(child.stdout);};
 assert.equal(run('context').result.task.request.prompt,f.task.request.prompt);
 const identity={claimToken:randomUUID(),workerId:'cli-worker'};assert.equal(run('claim',{...identity,mutationId:randomUUID()}).ok,true);
 for(const status of ['waiting-user','claimed','waiting-permission','claimed'])assert.equal(run('progress',{...identity,status,progress:25,message:status,mutationId:randomUUID()}).ok,true);
 assert.equal(run('progress',{...identity,workerId:'imposter',status:'claimed',progress:50,message:'bad',mutationId:randomUUID()}).code,'CLAIM_MISMATCH');
 const submitted=run('submit',{...identity,mutationId:randomUUID(),result:{summary:'已交付可核验结果',artifacts:[{id:randomUUID(),kind:'research',title:'调研结果',text:'只使用本地测试资料',assetHash:null,data:null}]}});assert.equal(submitted.ok,true);assert.equal(submitted.result.attempt.status,'submitted');assert.equal(submitted.result.serviceDescriptorPath,path.join(f.dir,'service.json'));
 const snapshot=f.lib.readProduction();f.lib.mutateProduction('acceptTask',{taskId:f.task.id,attemptId:f.task.activeAttemptId,receiptHash:submitted.result.attempt.receipt.sha256,expectedToken:snapshot.editToken});assert.equal(run('status').result.attempt.status,'accepted');
});
