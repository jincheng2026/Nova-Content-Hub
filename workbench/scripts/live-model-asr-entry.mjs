// Explicit human-authorized model + local ASR verification. No TikHub, retry or cloud ASR.
import {app,safeStorage} from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
import {ServiceSettingsStore} from '../src/main/service-settings.mjs';
import {ServiceTools} from '../src/main/service-tools.mjs';
import {productionToolBroker} from '../src/main/production-services.mjs';
import {execute} from '../src/main/worker.mjs';
import {DesktopController} from '../src/main/controller.mjs';
import {BindingStore} from '../src/main/bindings.mjs';
import {createLibrary} from '../../plugin-src/src/lib/file-library/index.mjs';
import {callServiceTool} from '../../plugin-src/src/lib/service-tools/client.mjs';
const [temp,evidence]=process.argv.slice(2);
if(!temp||!evidence||!path.basename(temp).startsWith('nova-live-service-'))throw Error('Use live-service-probe --run-model-asr');
app.setName('自媒体工作台');app.setPath('userData',path.join(temp,'electron-profile'));
app.whenReady().then(async()=>{
 let broker,library,controller;const results=[],summary={startedAt:new Date().toISOString(),platform:process.platform,arch:process.arch,arkSafeExperienceMode:{confirmedByUser:true,independentlyVerified:false},maxModelRequests:1,maxLocalAsrRequests:1,maxTikHubRequests:0,guiVerified:false,results};
 const hash=value=>createHash('sha256').update(value).digest('hex');
 async function save(){await fs.writeFile(path.join(evidence,'summary.json'),JSON.stringify({...summary,updatedAt:new Date().toISOString(),costs:library?.readProduction().costs.map(({service,status,amount,usage})=>({service,status,amount,usage}))},null,2)+'\n');}
 try{
  const settings=new ServiceSettingsStore({filePath:path.join(temp,'settings.json'),encryption:safeStorage});await settings.initialize();const view=settings.read();
  assert(view.credentials.model.hasKey&&view.values.model.provider==='volc'&&view.values.model.modelId,'Current Ark configuration required');
  assert(settings.secret('model').length>0,'Model key cannot be decrypted');
  summary.config={model:view.values.model,localAsrEngine:view.values.asr.localEngine};
  await settings.update({values:{...view.values,budget:{enabled:true,maxRequestsPerTask:1},commentsEnabled:false,asr:{...view.values.asr,mode:'local-only'}}});
  const tools=new ServiceTools({settings,cachePath:path.join(temp,'cache.json')});
  library=createLibrary(path.join(temp,'library'));const binding={root:library.info.root,libraryId:library.info.libraryId,rootIdentity:library.info.rootIdentity},worker={call:(op,args)=>execute(op,args,'disabled')},descriptorPath=path.join(temp,'broker.json');
  broker=productionToolBroker({worker,current:()=>binding},tools,descriptorPath);const descriptor=await broker.start();
  controller=new DesktopController({store:new BindingStore(path.join(temp,'binding.json')),worker,documents:temp,dialogs:{destination:async()=>null},authMode:'disabled',productionCallbacks:{serviceSettings:async()=>settings.read(),servicesDescriptor:()=>descriptor,launch:async()=>{},open:async()=>''}});
  await controller.initialize();await controller.persist({...controller.binding,current:binding});
  async function callTask(name,input,contentId){
   const created=await controller.startProductionTask({kind:input.tool==='asr'?'transcription':'research',title:`最小真实验证 ${name}`,prompt:'用户已授权的最小真实调用；仅执行一次，无评论、无重试。',mode:'simple',comments:false,...(contentId?{contentId}:{})}),task=created.snapshot.tasks.at(-1);
   const identity={taskId:task.id,attemptId:task.activeAttemptId,claimToken:randomUUID(),workerId:'live-model-asr-verification'};
   library.mutateProduction('claimTask',identity,{mutationId:randomUUID()});
   const record={name,startedAt:new Date().toISOString(),frozen:{kind:task.kind,tools:task.request.tools,budget:task.request.budget,comments:task.request.parameters.comments,model:task.request.parameters.serviceConfig.model,asrMode:task.request.parameters.serviceConfig.asr.mode},actualHttpRequest:input.tool==='model'};results.push(record);await save();
   try{
    const result=await callServiceTool(descriptorPath,{...identity,...input,requestId:randomUUID()}),data=result.data;
    Object.assign(record,{ok:true,cacheHit:result.cacheHit,requestsUsed:result.requestsUsed,collectedAt:result.collectedAt});
    const text=input.tool==='model'?data.choices?.[0]?.message?.content:data.text;assert.equal(typeof text,'string');assert(text.trim().length>0);
    if(input.tool==='model'){record.response={model:data.model,reply:text.trim()==='OK'?'OK':undefined,textHash:hash(text),textLength:text.length,usage:data.usage};}
    else record.response={recognizedText:text,expectedSpokenText:'你好，语音测试。',textLength:text.length,textHash:hash(text),segmentCount:Array.isArray(data.segments)?data.segments.length:null,durationMs:data.durationMs??null};
    library.mutateProduction('submitTask',{...identity,result:{summary:`真实${name}调用成功，提交本次实际响应。`,artifacts:[{id:randomUUID(),kind:input.tool==='model'?'research':'transcript',title:`真实${name}响应`,text,assetHash:null,data:{tool:input.tool,collectedAt:result.collectedAt}}]}},{mutationId:randomUUID()});
    let snapshot=await controller.readProduction(),attempt=snapshot.tasks.at(-1).attempts.at(-1);assert(attempt.receipt?.sha256);
    snapshot=await controller.actProductionTask({taskId:task.id,attemptId:attempt.id,receiptHash:attempt.receipt.sha256,expectedToken:snapshot.editToken,action:'accept'});
    const accepted=snapshot.tasks.at(-1).attempts.at(-1);assert.equal(accepted.status,'accepted');record.submission={receiptVerified:true,accepted:true,artifactCount:accepted.result?.artifacts?.length??null,receiptHash:attempt.receipt.sha256};
    const archive=library.rebuildProductionArchive(task.id),archiveFile=path.join(archive.directory,'结果.json'),facts=JSON.parse(await fs.readFile(archiveFile,'utf8'));
    assert.equal(facts.status,'accepted');assert.equal(facts.receiptHash,attempt.receipt.sha256);assert.equal(facts.result.artifacts[0].text,text);record.submission.archive={ready:archive.ready,status:facts.status,receiptMatches:true};
    await fs.copyFile(archiveFile,path.join(evidence,`${input.tool}-archive.json`));
   }catch(error){Object.assign(record,{ok:false,code:error.code??'PROBE_FAILED',httpStatus:error.httpStatus??null,providerCode:error.providerCode??null});try{library.mutateProduction('failTask',{...identity,failure:{code:record.code,message:'最小真实验证失败，停止且不重试。'}},{mutationId:randomUUID()});}catch{}}
   await save();console.log(JSON.stringify({name,ok:record.ok,code:record.code??null,requestsUsed:record.requestsUsed??null}));
  }
  await callTask('ark-model',{tool:'model',instruction:'Reply with OK only.',text:'Connectivity check.'});
  const readiness=await tools.checkReadiness();summary.localAsrReadiness=readiness.localAsr;await save();
  if(readiness.localAsr.available&&process.platform==='darwin'){
   const aiff=path.join(temp,'sample.aiff'),wav=path.join(temp,'sample.wav');await promisify(execFile)('/usr/bin/say',['-o',aiff,'你好，语音测试。'],{timeout:30000});await promisify(execFile)('/usr/bin/afconvert',['-f','WAVE','-d','LEI16@16000',aiff,wav],{timeout:30000});
   const asset=library.importAsset(wav,{purpose:'production-reference'}),content=library.createContent({title:'真实本地ASR验证',body:''});library.mutateProduction('ensureCreation',{contentId:content.id,expectedToken:library.readProduction().editToken},{mutationId:randomUUID()});const state=library.readProductionCreation(content.id);
   library.saveProductionDraft(content.id,{body:'',expectedBodyHash:state.content.bodyHash,expectedProductionToken:state.productionToken,creationPatch:{references:[{id:randomUUID(),url:null,title:'Local synthesized speech',platform:'local',originalText:'',correctedText:'',segments:[],corrections:[],analysis:'',mediaAssetHash:asset.assetHash,subtitleAssetHash:null}]}},state.content.editToken,{mutationId:randomUUID()});
   await callTask('local-asr',{tool:'asr',audioPath:asset.assetHash,allowCloud:false},content.id);
  }
  await save();
 }catch(error){summary.infrastructureError={code:error.code??'PROBE_FAILED'};await save();process.exitCode=1;}
 finally{await broker?.stop();app.exit(process.exitCode??0);}
}).catch(()=>app.exit(1));
