import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {ServiceSettingsStore} from '../src/main/service-settings.mts';
import {ServiceTools} from '../src/main/service-tools.mts';
import {productionToolBroker} from '../src/main/production-services.mts';
import {defaultServiceSettings} from '../src/shared/service-validation.ts';
import {execute} from '../src/main/worker.mts';
import {createLibrary} from '../../plugin-src/src/lib/file-library/index.mjs';
import {callServiceTool} from '../../plugin-src/src/lib/service-tools/client.mjs';

test('broker rejects ASR configuration drift and preparation ABA races before service reservation',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'nova-frozen-services-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const encryption={isEncryptionAvailable:()=>true,encryptString:v=>Buffer.from(v),decryptString:v=>v.toString()};
 const settings=new ServiceSettingsStore({filePath:path.join(dir,'settings.json'),encryption});await settings.initialize();
 const frozen={...defaultServiceSettings(),budget:{enabled:true,maxRequestsPerTask:1}};
 await settings.update({values:frozen});
 const library=createLibrary(path.join(dir,'library')),binding={root:library.info.root,libraryId:library.info.libraryId,rootIdentity:library.info.rootIdentity};
 // Asset authorization has its own worker tests; isolate configuration races from actual speech engines/media.
 const worker={call:(op,args)=>op==='productionAsset'?Promise.resolve({data:Buffer.from('fixture audio'),extension:'.wav'}):execute(op,args,'disabled')};
 const tools=new ServiceTools({settings}),descriptor=path.join(dir,'broker.json'),broker=productionToolBroker({current:()=>binding,worker},tools,descriptor);
 await broker.start();t.after(()=>broker.stop());
 const task=library.mutateProduction('createTask',{kind:'research',title:'Frozen ASR',prompt:'No external request.',host:'codex',tools:['asr'],parameters:{budgetEnabled:true,serviceConfig:{asr:frozen.asr}},budget:{amount:1,currency:'REQ'},expectedToken:library.readProduction().editToken},{mutationId:randomUUID()}).tasks.at(-1);
 const identity={taskId:task.id,attemptId:task.activeAttemptId,claimToken:randomUUID(),workerId:'frozen-service-regression'};
 library.mutateProduction('claimTask',identity,{mutationId:randomUUID()});
 const request={...identity,tool:'asr',audioPath:'a'.repeat(64),allowCloud:true};
 await settings.update({values:{...frozen,asr:{...frozen.asr,mode:'volc'}}});
 await assert.rejects(callServiceTool(descriptor,{...request,requestId:randomUUID()}),{code:'SERVICE_CONFIG_CHANGED'});
 assert.equal(library.readProduction().costs.length,0);
 await settings.update({values:frozen});let invoked=0;
 tools.prepare=async()=>{await settings.update({values:{...frozen,asr:{...frozen.asr,localModelPath:'/changed-during-prepare'}}});return{service:'asr',requests:1};};
 tools.invoke=async()=>{invoked++;throw Error('No provider is allowed in this test');};
 await assert.rejects(callServiceTool(descriptor,{...request,requestId:randomUUID()}),{code:'SERVICE_CONFIG_CHANGED'});
 // A -> B -> A: current matches again, but the prepared configuration still differs.
 await settings.update({values:frozen});
 tools.prepare=async()=>{
  await settings.update({values:{...frozen,asr:{...frozen.asr,localModelPath:'/changed-and-restored'}}});
  const config=settings.read().values;await settings.update({values:frozen});return{service:'asr',requests:1,config};
 };
 await assert.rejects(callServiceTool(descriptor,{...request,requestId:randomUUID()}),{code:'SERVICE_CONFIG_CHANGED'});
 assert.equal(invoked,0);assert.equal(library.readProduction().costs.length,0,'races must fail before reserving budget');
});

test('legacy model task and encrypted configuration survive while model calls are disabled',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'nova-legacy-model-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const encryption={isEncryptionAvailable:()=>true,encryptString:v=>Buffer.from('encrypted:'+v),decryptString:v=>v.toString().replace(/^encrypted:/,'')};
 const settings=new ServiceSettingsStore({filePath:path.join(dir,'settings.json'),encryption});await settings.initialize();
 const legacy=defaultServiceSettings();legacy.model={provider:'compatible',baseUrl:'https://127.0.0.1/v1',modelId:'legacy-model'};
 await settings.update({values:legacy,keys:{model:'legacy-secret',tikhub:'collection-secret',asr:'speech-secret'}});
 const library=createLibrary(path.join(dir,'library'));
 const task=library.mutateProduction('createTask',{kind:'research',title:'Legacy',prompt:'Saved historical request',host:'codex',tools:['model'],parameters:{budgetEnabled:true,serviceConfig:{model:legacy.model}},budget:{amount:1,currency:'REQ'},expectedToken:library.readProduction().editToken},{mutationId:randomUUID()}).tasks.at(-1);
 const before=library.readProduction();
 await assert.rejects(new ServiceTools({settings}).execute({taskId:task.id,attemptId:task.activeAttemptId,claimToken:randomUUID(),workerId:'legacy',requestId:randomUUID(),tool:'model',instruction:'分析',text:'历史材料'}),{code:'MODEL_SERVICE_DISABLED',requestsUsed:0});
 assert.deepEqual(library.readProduction(),before,'compatibility denial must not rewrite historical records');
 await settings.update({values:{...legacy,commentsEnabled:true,asr:{...legacy.asr,mode:'local-only'}}});
 const reopened=new ServiceSettingsStore({filePath:settings.filePath,encryption});await reopened.initialize();
 assert.deepEqual(reopened.read().values.model,legacy.model);
 for(const [name,key]of Object.entries({model:'legacy-secret',tikhub:'collection-secret',asr:'speech-secret'}))assert.equal(reopened.secret(name),key);
});

test('local execution uses the configuration prepared before an asynchronous reservation',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'nova-prepared-service-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const settings=new ServiceSettingsStore({filePath:path.join(dir,'settings.json'),encryption:{isEncryptionAvailable:()=>true,encryptString:v=>Buffer.from(v),decryptString:v=>v.toString()}});await settings.initialize();
 const original=defaultServiceSettings();await settings.update({values:original});
 const tools=new ServiceTools({settings});tools.localModule=async()=> 'faster_whisper';
 tools.localTranscribe=async(_audio,_module,config)=>{assert.deepEqual(config,original.asr,'execution must retain the prepared engine, executable, model path and cloud mode');return{text:'test seam only'};};
 const audioPath=path.join(dir,'registered.wav');await fs.writeFile(audioPath,'registered regression bytes');
 const request={taskId:randomUUID(),attemptId:randomUUID(),claimToken:randomUUID(),workerId:'prepared-settings-test',requestId:randomUUID(),tool:'asr',audioPath,allowCloud:false};
 await tools.execute(request,{beforeExecute:async()=>{await settings.update({values:{...original,asr:{...original.asr,localModelPath:'/changed-after-reservation'}}});}});
});

test('equivalent legacy frozen ASR shapes remain executable after settings normalize',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'nova-legacy-frozen-asr-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const settings=new ServiceSettingsStore({filePath:path.join(dir,'settings.json'),encryption:{isEncryptionAvailable:()=>true,encryptString:v=>Buffer.from(v),decryptString:v=>v.toString()}});await settings.initialize();
 const library=createLibrary(path.join(dir,'library')),binding={root:library.info.root,libraryId:library.info.libraryId,rootIdentity:library.info.rootIdentity},tools=new ServiceTools({settings});
 tools.localModule=async()=> 'faster_whisper';tools.invoke=async()=>({text:'兼容转写'});
 const worker={call:(op,args)=>op==='productionAsset'?Promise.resolve({data:Buffer.from('fixture audio'),extension:'.wav'}):execute(op,args,'disabled')};
 const descriptor=path.join(dir,'broker.json'),broker=productionToolBroker({current:()=>binding,worker},tools,descriptor);await broker.start();t.after(()=>broker.stop());
 for(const mode of ['local-first','volc']){
  const legacy=defaultServiceSettings();delete legacy.asr.cloud;legacy.asr.mode=mode;legacy.budget={enabled:true,maxRequestsPerTask:4};await settings.update({values:legacy,keys:{asr:'legacy-speech-key'}});
  const task=library.mutateProduction('createTask',{kind:'research',title:'Legacy '+mode,prompt:'ASR compatibility',host:'codex',tools:['asr'],parameters:{budgetEnabled:true,serviceConfig:{asr:legacy.asr}},budget:{amount:2,currency:'REQ'},expectedToken:library.readProduction().editToken},{mutationId:randomUUID()}).tasks.at(-1);
  const identity={taskId:task.id,attemptId:task.activeAttemptId,claimToken:randomUUID(),workerId:'legacy-frozen'};library.mutateProduction('claimTask',identity,{mutationId:randomUUID()});
  const result=await callServiceTool(descriptor,{...identity,tool:'asr',audioPath:'a'.repeat(64),allowCloud:true,requestId:randomUUID()});assert.equal(result.data.text,'兼容转写');assert.equal(result.requestsUsed,mode==='volc'?1:0);
 }
});
