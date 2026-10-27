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

test('broker rejects model or ASR changes after a task freezes service settings before any service request',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'nova-frozen-services-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const encryption={isEncryptionAvailable:()=>true,encryptString:v=>Buffer.from(v),decryptString:v=>v.toString()};
 const settings=new ServiceSettingsStore({filePath:path.join(dir,'settings.json'),encryption});await settings.initialize();
 const frozen={...defaultServiceSettings(),budget:{enabled:true,maxRequestsPerTask:1}};frozen.model.modelId='frozen-model';
 await settings.update({values:frozen,keys:{model:'test-only-placeholder'}});
 const library=createLibrary(path.join(dir,'library')),binding={root:library.info.root,libraryId:library.info.libraryId,rootIdentity:library.info.rootIdentity};
 const tools=new ServiceTools({settings}),descriptor=path.join(dir,'broker.json'),broker=productionToolBroker({current:()=>binding,worker:{call:(op,args)=>execute(op,args,'disabled')}},tools,descriptor);
 await broker.start();t.after(()=>broker.stop());
 for(const tool of ['model','asr']){
  const snapshot=library.mutateProduction('createTask',{kind:'research',title:`Frozen ${tool}`,prompt:'No external request is allowed in this regression test.',host:'codex',tools:[tool],parameters:{budgetEnabled:true,serviceConfig:{model:frozen.model,asr:frozen.asr}},budget:{amount:1,currency:'REQ'},expectedToken:library.readProduction().editToken},{mutationId:randomUUID()});
  const task=snapshot.tasks.at(-1),identity={taskId:task.id,attemptId:task.activeAttemptId,claimToken:randomUUID(),workerId:'frozen-service-regression'};
  library.mutateProduction('claimTask',identity,{mutationId:randomUUID()});
  await settings.update({values:tool==='model'?{...frozen,model:{provider:'compatible',baseUrl:'https://127.0.0.1/v1',modelId:'another-model'}}:{...frozen,asr:{...frozen.asr,mode:'volc'}}});
  const input=tool==='model'?{tool,instruction:'Do not call.',text:'Configuration drift test.'}:{tool,audioPath:'a'.repeat(64),allowCloud:true};
  await assert.rejects(callServiceTool(descriptor,{...identity,...input,requestId:randomUUID()}),{code:'SERVICE_CONFIG_CHANGED'});
  assert.equal(library.readProduction().costs.length,0,'configuration drift must fail before reserving or calling a service');
 }
 // A configuration change during asynchronous service preparation must also be caught before reservation.
 await settings.update({values:frozen});
 let invoked=0;tools.prepare=async()=>{await settings.update({values:{...frozen,model:{...frozen.model,modelId:'changed-during-prepare'}}});return{service:'model',requests:1};};tools.invoke=async()=>{invoked++;throw Error('No provider is allowed in this test');};
 const race=library.mutateProduction('createTask',{kind:'research',title:'Config preparation race',prompt:'No provider call.',host:'codex',tools:['model'],parameters:{budgetEnabled:true,serviceConfig:{model:frozen.model,asr:frozen.asr}},budget:{amount:1,currency:'REQ'},expectedToken:library.readProduction().editToken},{mutationId:randomUUID()}).tasks.at(-1);
 const identity={taskId:race.id,attemptId:race.activeAttemptId,claimToken:randomUUID(),workerId:'frozen-service-regression'};library.mutateProduction('claimTask',identity,{mutationId:randomUUID()});
 await assert.rejects(callServiceTool(descriptor,{...identity,tool:'model',instruction:'Do not call.',text:'Preparation race.',requestId:randomUUID()}),{code:'SERVICE_CONFIG_CHANGED'});
 // ABA: preparing B must not pass merely because the visible configuration has returned to A.
 await settings.update({values:frozen});
 tools.prepare=async()=>{
  await settings.update({values:{...frozen,model:{...frozen.model,modelId:'changed-and-restored'}}});
  const config=settings.read().values;
  await settings.update({values:frozen});
  return{service:'model',requests:1,config};
 };
 await assert.rejects(callServiceTool(descriptor,{...identity,tool:'model',instruction:'Do not call.',text:'ABA preparation race.',requestId:randomUUID()}),{code:'SERVICE_CONFIG_CHANGED'});
 assert.equal(invoked,0,'a prepared configuration different from the task must never reach invoke');
 assert.equal(library.readProduction().costs.length,0,'ABA must be detected before reservation');
 delete tools.prepare;
 await settings.update({values:{...frozen,model:{provider:'compatible',baseUrl:'https://127.0.0.1/v1',modelId:'another-model'}}});
 const legacy=library.mutateProduction('createTask',{kind:'research',title:'Legacy config',prompt:'Local preflight only.',host:'codex',tools:['model'],parameters:{budgetEnabled:true},budget:{amount:1,currency:'REQ'},expectedToken:library.readProduction().editToken},{mutationId:randomUUID()}).tasks.at(-1);
 const legacyIdentity={taskId:legacy.id,attemptId:legacy.activeAttemptId,claimToken:randomUUID(),workerId:'frozen-service-regression'};library.mutateProduction('claimTask',legacyIdentity,{mutationId:randomUUID()});
 await assert.rejects(callServiceTool(descriptor,{...legacyIdentity,tool:'model',instruction:'Do not call.',text:'Legacy preflight.',requestId:randomUUID()}),{code:'UNSAFE_ENDPOINT'});
 assert.equal(invoked,0);assert.equal(library.readProduction().costs.length,0);
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
