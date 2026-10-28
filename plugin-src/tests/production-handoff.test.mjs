import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createLibrary} from '../src/lib/file-library/index.mjs';
import {prepareProductionHandoff,readProductionHandoff,productionHandoffContext} from '../src/bridge/production-handoff.mjs';
import {nativeHandoffDirectory,openNativeHandoff} from '../src/bridge/native-handoff.mjs';
const release={format:'nova-content-plugin-release',schemaVersion:1,productId:'nova-content-hub',appScope:'nova-content-hub',protocolVersion:1,prototype:true,version:'0.2.0',AUTH_MODE:'disabled',pairId:'nova-content-hub@0.2.0:p1:disabled',experimental:true,productionReady:false,platform:process.platform,arch:process.arch};
function fixture(t,host='codex',prompt='请根据手工资料完成调研。') {
 const dir=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'nova-production-handoff-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const lib=createLibrary(path.join(dir,'lib'));
 const snapshot=lib.mutateProduction('createTask',{kind:'research',title:'完整调研标题',prompt,host,parameters:{comments:false},tools:[],budget:{amount:0,currency:'REQ'},expectedToken:lib.readProduction().editToken});const task=snapshot.tasks[0];return {dir,lib,binding:{root:lib.info.root,libraryId:lib.info.libraryId,rootIdentity:lib.info.rootIdentity},task,locator:{taskId:task.id,attemptId:task.activeAttemptId,requestHash:task.requestHash,host}};
}
const categories=[
 {name:'research report',kind:'research',capability:'research'},
 {name:'account analysis',kind:'analysis',account:true,capability:'research'},
 {name:'viral radar',kind:'research',workflow:'viral-radar',capability:'research'},
 {name:'content creation',kind:'writing',workflow:'content-creation',capability:'writing'},
 {name:'title and packaging',kind:'packaging',capability:'writing'},
 {name:'transcription',kind:'transcription',capability:'writing'},
 {name:'content analysis',kind:'analysis',capability:'writing'},
 {name:'review',kind:'review',capability:'writing'}
];
for(const host of ['codex','workbuddy'])for(const category of categories)test(`${host}/${category.name}: private 100000-character fixed request uses the matching direct Skill without copy or send`,async t=>{
 const f=fixture(t,host),privateInput='私密正文\n'.repeat(20000);let accountId=null;
 if(category.account){const saved=f.lib.mutateProduction('saveAccount',{name:'私密账号',platform:'Douyin',url:'https://example.com/private-account',note:'私密账号资料',tags:[],images:[],reportIds:[],expectedToken:f.lib.readProduction().editToken});accountId=saved.accounts.at(-1).id;}
 const next=f.lib.mutateProduction('createTask',{kind:category.kind,title:'私密业务标题',prompt:privateInput,host,accountId,parameters:category.workflow?{workflow:category.workflow}:{},tools:[],budget:{amount:0,currency:'REQ'},expectedToken:f.lib.readProduction().editToken}),task=next.tasks.at(-1),locator={taskId:task.id,attemptId:task.activeAttemptId,requestHash:task.requestHash,host},prepared=await prepareProductionHandoff(path.join(f.dir,'handoffs'),f.binding,locator,release),url=new URL(prepared.url),skill=`nova-content-${category.capability}-execution`;
 assert.equal(prepared.requiresPaste,false);assert(prepared.prompt.includes(skill));assert(prepared.prompt.includes(prepared.id));assert.match(prepared.prompt,/production context --handoff/);assert(!decodeURIComponent(prepared.url).includes('私密正文'));assert(!prepared.prompt.includes('私密业务标题'));assert.equal(url.searchParams.get('prompt'),prepared.prompt);assert.equal(url.searchParams.get(host==='codex'?'path':'cwd'),f.binding.root);if(host==='workbuddy')assert.equal(url.searchParams.get('skills'),skill);
 const context=productionHandoffContext(readProductionHandoff(path.join(f.dir,'handoffs'),prepared.id,release)).context;assert.equal(context.task.kind,category.kind);assert.equal(context.task.accountId,accountId);assert.equal(context.task.request.parameters.workflow,category.workflow);assert.deepEqual(Buffer.from(context.task.request.prompt),Buffer.from(privateInput));
 let copies=0,confirms=0,opens=0;await openNativeHandoff(prepared,{copyText(){copies++;},confirmPaste(){confirms++;return true;},openExternal:async()=>{opens++;}});assert.deepEqual({copies,confirms,opens},{copies:0,confirms:0,opens:1});
});
for(const host of ['codex','workbuddy'])test(`${host}: 100000 private characters load from fixed context with direct prefill and zero clipboard actions`,async t=>{
 const original='私有原文\n'.repeat(20000),f=fixture(t,host,original),prepared=await prepareProductionHandoff(path.join(f.dir,'handoffs'),f.binding,f.locator,release),url=new URL(prepared.url);
 assert.equal(original.length,100000);assert.equal(prepared.requiresPaste,false);assert.equal(url.searchParams.get('prompt'),prepared.prompt);assert(prepared.prompt.includes(prepared.id));assert(prepared.prompt.includes('nova-content-research-execution'));assert.match(prepared.prompt,/production context --handoff/);assert.match(prepared.prompt,/REQUEST\/context/);assert(!prepared.prompt.includes('私有原文'));assert(!decodeURIComponent(prepared.url).includes('私有原文'));assert(prepared.url.length<=2048);
 const envelope=readProductionHandoff(path.join(f.dir,'handoffs'),prepared.id,release),context=productionHandoffContext(envelope).context;assert.deepEqual(Buffer.from(context.task.request.prompt),Buffer.from(original));
 let copies=0,confirms=0,opens=0;await openNativeHandoff(prepared,{copyText(){copies++;},confirmPaste(){confirms++;return true;},openExternal:async value=>{assert.equal(value,prepared.url);opens++;}});assert.deepEqual({copies,confirms,opens},{copies:0,confirms:0,opens:1});
});
for(const host of ['codex','workbuddy'])test(`${host}: full prompt, frozen request, dynamic broker locator, retirement and release denial`,async t=>{
 const f=fixture(t,host,'第一段\n第二段，完整中文用户需求'),descriptor=path.join(f.dir,'service.json'),prepared=await prepareProductionHandoff(path.join(f.dir,'handoffs'),f.binding,f.locator,release,{serviceDescriptorPath:descriptor});
 assert(!prepared.prompt.includes('第一段\n第二段'));assert.equal(prepared.requiresPaste,false);assert.equal(new URL(prepared.url).protocol,host+':');
 assert.equal(new URL(prepared.url).searchParams.get(host==='codex'?'path':'cwd'),f.binding.root);
 assert(prepared.prompt.includes('nova-content-research-execution'));assert.match(prepared.prompt,/production context --handoff/);assert.match(prepared.prompt,/REQUEST\/context/);assert(prepared.prompt.includes('当前聊天'));
 const envelope=readProductionHandoff(path.join(f.dir,'handoffs'),prepared.id,release),context=productionHandoffContext(envelope).context;assert.equal(context.task.request.prompt,'第一段\n第二段，完整中文用户需求');assert.equal(context.task.request.parameters.comments,false);assert.equal(context.serviceDescriptorPath,descriptor);assert.equal(context.task.requestHash,f.task.requestHash);assert(!JSON.stringify(context.task.request).includes(descriptor));
 f.lib.mutateProduction('cancelTask',{taskId:f.task.id,expectedToken:f.lib.readProduction().editToken});await assert.rejects(prepareProductionHandoff(path.join(f.dir,'handoffs'),f.binding,f.locator,release),{code:'INVALID_HANDOFF'});
 assert.throws(()=>readProductionHandoff(path.join(f.dir,'handoffs'),prepared.id,{...release,AUTH_MODE:'required',pairId:'nova-content-hub@0.2.0:p1:required'}),{code:'AUTH_NOT_CONFIGURED'});
});
for(const host of ['codex','workbuddy'])test(`${host}: long private requests stay local while the complete fixed-context bootstrap is directly prefilled`,async t=>{
 const f=fixture(t,host,'完整私有需求\n'.repeat(2000)),h=await prepareProductionHandoff(path.join(f.dir,'handoffs'),f.binding,f.locator,release),url=new URL(h.url),prefill=url.searchParams.get('prompt');
 assert.equal(h.requiresPaste,false);assert(prefill?.trim());assert(prefill.includes(h.id));assert.match(prefill,/production context --handoff/);assert(!prefill.includes('完整私有需求'));assert(!h.prompt.includes(f.task.request.prompt));assert.equal(productionHandoffContext(readProductionHandoff(path.join(f.dir,'handoffs'),h.id,release)).context.task.request.prompt,f.task.request.prompt);assert(h.url.length<=2048);
 assert.equal(url.searchParams.get(host==='codex'?'path':'cwd'),f.binding.root);if(host==='workbuddy'){assert.equal(url.searchParams.get('action'),'start');assert.equal(url.searchParams.get('skills'),'nova-content-research-execution');}
});
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

test('current-chat handoffs are stable per attempt and can be rebuilt after a lost preparation response',async t=>{
 const f=fixture(t),directory=path.join(f.dir,'handoffs');
 const first=await prepareProductionHandoff(directory,f.binding,f.locator,release,{currentChat:true});
 const replay=await prepareProductionHandoff(directory,f.binding,f.locator,release,{currentChat:true});
 assert.equal(first.id,replay.id);assert.equal(first.url,null);assert.equal(replay.url,null);assert.equal(fs.readdirSync(directory).length,1);
 assert.equal(readProductionHandoff(directory,first.id,release).task.taskId,f.task.id);
 assert.match(first.prompt,/当前聊天/);
});
