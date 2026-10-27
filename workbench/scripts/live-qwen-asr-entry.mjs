// One real, local-only Qwen ASR call through existing application code. No paid service calls.
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
const [temp,evidence]=process.argv.slice(2),python=process.env.NOVA_QWEN_PYTHON,model=process.env.NOVA_QWEN_MODEL;
if(!temp||!evidence||!path.basename(temp).startsWith('nova-live-service-')||!python||!model||!path.isAbsolute(python)||!path.isAbsolute(model))throw Error('Use live-service-probe --run-qwen-asr with absolute runtime and model paths.');
app.setName('自媒体工作台');app.setPath('userData',path.join(temp,'electron-profile'));
app.whenReady().then(async()=>{
 let broker,library,identity;const summary={startedAt:new Date().toISOString(),platform:process.platform,arch:process.arch,python,model,expectedSpokenText:'你好，语音测试。',maxAsrCalls:1,maxExternalServiceRequests:0,actualExternalServiceRequests:0,guiVerified:false,outcome:'started'};
 async function save(){await fs.writeFile(path.join(evidence,'summary.json'),JSON.stringify({...summary,updatedAt:new Date().toISOString(),costs:library?.readProduction().costs.map(({service,status,amount,usage})=>({service,status,amount,usage}))},null,2)+'\n');}
 try{
  const settings=new ServiceSettingsStore({filePath:path.join(temp,'settings.json'),encryption:safeStorage});await settings.initialize();const original=settings.read();assert.equal(original.values.budget.enabled,false,'Original user budget must remain off');
  await settings.update({values:{...original.values,asr:{...original.values.asr,mode:'local-only',localEngine:'qwen3-asr',localExecutable:python,localModelPath:model}}});
  summary.originalBudgetEnabled=original.values.budget.enabled;summary.cloudModelUnchanged=JSON.stringify(settings.read().values.model)===JSON.stringify(original.values.model);
  const tools=new ServiceTools({settings}),readiness=await tools.checkReadiness();summary.readiness=readiness.localAsr;await save();assert(readiness.localAsr.available);
  const aiff=path.join(temp,'sample.aiff'),wav=path.join(temp,'sample.wav');await promisify(execFile)('/usr/bin/say',['-o',aiff,summary.expectedSpokenText],{timeout:30000});await promisify(execFile)('/usr/bin/afconvert',['-f','WAVE','-d','LEI16@16000',aiff,wav],{timeout:30000});
  const audioBytes=await fs.readFile(wav);summary.audio={bytes:audioBytes.length,sha256:createHash('sha256').update(audioBytes).digest('hex'),sampleRate:16000};await fs.copyFile(wav,path.join(evidence,'known-chinese.wav'));
  library=createLibrary(path.join(temp,'library'));const binding={root:library.info.root,libraryId:library.info.libraryId,rootIdentity:library.info.rootIdentity},worker={call:(op,args)=>execute(op,args,'disabled')},descriptorPath=path.join(temp,'broker.json');
  broker=productionToolBroker({worker,current:()=>binding},tools,descriptorPath);const descriptor=await broker.start();
  const controller=new DesktopController({store:new BindingStore(path.join(temp,'binding.json')),worker,documents:temp,dialogs:{destination:async()=>null},authMode:'disabled',productionCallbacks:{serviceSettings:async()=>settings.read(),servicesDescriptor:()=>descriptor,launch:async()=>{},open:async()=>''}});
  await controller.initialize();await controller.persist({...controller.binding,current:binding});
  const asset=library.importAsset(wav,{purpose:'production-reference'}),content=library.createContent({title:'真实Qwen本地转写验证',body:''});library.mutateProduction('ensureCreation',{contentId:content.id,expectedToken:library.readProduction().editToken},{mutationId:randomUUID()});const creation=library.readProductionCreation(content.id);
  library.saveProductionDraft(content.id,{body:'',expectedBodyHash:creation.content.bodyHash,expectedProductionToken:creation.productionToken,creationPatch:{references:[{id:randomUUID(),url:null,title:'Known Chinese synthetic speech',platform:'local',originalText:'',correctedText:'',segments:[],corrections:[],analysis:'',mediaAssetHash:asset.assetHash,subtitleAssetHash:null}]}},creation.content.editToken,{mutationId:randomUUID()});
  const created=await controller.startProductionTask({kind:'transcription',title:'Qwen3-ASR 1.7B 本地中文验证',prompt:'仅转写已登记的中文样本；不允许云端或任何付费服务调用。',mode:'simple',comments:false,contentId:content.id}),task=created.snapshot.tasks.at(-1);
  assert.equal(task.request.budget.amount,0);assert.equal(task.request.parameters.budgetEnabled,false);assert.equal(task.request.parameters.serviceConfig.asr.mode,'local-only');
  identity={taskId:task.id,attemptId:task.activeAttemptId,claimToken:randomUUID(),workerId:'qwen-local-asr-verification'};library.mutateProduction('claimTask',identity,{mutationId:randomUUID()});
  summary.frozen={kind:task.kind,budget:task.request.budget,comments:task.request.parameters.comments,asr:task.request.parameters.serviceConfig.asr};summary.outcome='transcribing';await save();
  const started=Date.now(),result=await callServiceTool(descriptorPath,{...identity,requestId:randomUUID(),tool:'asr',audioPath:asset.assetHash,allowCloud:false}),text=result.data.text;
  summary.elapsedMs=Date.now()-started;assert.equal(result.requestsUsed,0);assert.equal(typeof text,'string');assert(text.trim());
  const normalize=value=>value.replace(/[語測試]/g,char=>({語:'语',測:'测',試:'试'})[char]).replace(/[\p{P}\p{Z}\s]/gu,'');
  summary.response={text,requestsUsed:result.requestsUsed,cacheHit:result.cacheHit,segmentCount:Array.isArray(result.data.segments)?result.data.segments.length:null,durationMs:result.data.durationMs??null,normalizedSpokenWordsMatch:normalize(text)===normalize(summary.expectedSpokenText)};
  assert.equal(summary.response.normalizedSpokenWordsMatch,true,'Known Chinese words did not match the actual local recognition');
  library.mutateProduction('submitTask',{...identity,result:{summary:'本地Qwen3-ASR真实中文转写结果，未调用云服务。',artifacts:[{id:randomUUID(),kind:'transcript',title:'本地Qwen中文样本',text,assetHash:null,data:{engine:'qwen3-asr',collectedAt:result.collectedAt}}]}},{mutationId:randomUUID()});
  let snapshot=await controller.readProduction(),attempt=snapshot.tasks.at(-1).attempts.at(-1);snapshot=await controller.actProductionTask({taskId:task.id,attemptId:attempt.id,receiptHash:attempt.receipt.sha256,expectedToken:snapshot.editToken,action:'accept'});assert.equal(snapshot.tasks.at(-1).attempts.at(-1).status,'accepted');
  const archive=library.rebuildProductionArchive(task.id),file=path.join(archive.directory,'结果.json'),facts=JSON.parse(await fs.readFile(file,'utf8'));assert.equal(facts.status,'accepted');assert.equal(facts.result.artifacts[0].text,text);await fs.copyFile(file,path.join(evidence,'accepted-archive.json'));
  summary.submission={accepted:true,archiveReady:archive.ready,receiptHash:facts.receiptHash};summary.outcome='passed';await save();console.log(JSON.stringify({outcome:summary.outcome,requestsUsed:result.requestsUsed,normalizedSpokenWordsMatch:summary.response.normalizedSpokenWordsMatch}));
 }catch(error){summary.outcome='failed';summary.error={code:error.code??'PROBE_FAILED'};if(library&&identity)try{library.mutateProduction('failTask',{...identity,failure:{code:summary.error.code,message:'本地Qwen验证失败，未使用云端替代。'}},{mutationId:randomUUID()});}catch{}await save();console.log(JSON.stringify({outcome:summary.outcome,error:summary.error}));}
 finally{await broker?.stop();app.exit(0);}
}).catch(()=>app.exit(1));
