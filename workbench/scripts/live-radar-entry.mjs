// Explicit user-authorized, one-candidate live smoke. All writes stay in a temporary library.
import {app,safeStorage} from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {ServiceSettingsStore} from '../src/main/service-settings.mjs';
import {ServiceTools} from '../src/main/service-tools.mjs';
import {productionToolBroker} from '../src/main/production-services.mjs';
import {execute} from '../src/main/worker.mjs';
import {DesktopController} from '../src/main/controller.mjs';
import {BindingStore} from '../src/main/bindings.mjs';
import {createLibrary} from '../../plugin-src/src/lib/file-library/index.mjs';
import {collectRadar} from '../../plugin-src/src/lib/file-library/radar-collector.mjs';
import {callServiceTool} from '../../plugin-src/src/lib/service-tools/client.mjs';
const [temp,evidence]=process.argv.slice(2);
if(!temp||!evidence||!path.basename(temp).startsWith('nova-live-service-'))throw Error('Use live-service-probe --run-radar-one');
app.setName('自媒体工作台');app.setPath('userData',path.join(temp,'electron-profile'));
app.whenReady().then(async()=>{
const startedAt=new Date().toISOString(),calls=[],checks=[];
const query={platform:'抖音',direction:'AI 工具教程',sampleLimit:1,maxFollowers:10000,minLikes:1000,minRatio:1,lookbackDays:30};
let broker,library,identity,controller;
const summary={startedAt,platform:process.platform,arch:process.arch,query,maxHttpRequests:2,originalSettingsChanged:null,realAssistantGui:false,checks,calls,outcome:'started'};
async function save(){await fs.writeFile(path.join(evidence,'summary.json'),JSON.stringify({...summary,updatedAt:new Date().toISOString(),costs:library?.readProduction().costs.map(({service,status,amount,usage})=>({service,status,amount,usage}))},null,2)+'\n');}
try{
 await save();
 const settings=new ServiceSettingsStore({filePath:path.join(temp,'settings.json'),encryption:safeStorage});await settings.initialize();const view=settings.read();
 assert(view.credentials.tikhub.hasKey,'TikHub Key is not configured');
 await settings.update({values:{...view.values,budget:{enabled:true,maxRequestsPerTask:2},commentsEnabled:false}});
 const tools=new ServiceTools({settings,cachePath:path.join(temp,'cache.json')});
 library=createLibrary(path.join(temp,'library'));const binding={root:library.info.root,libraryId:library.info.libraryId,rootIdentity:library.info.rootIdentity};
 const worker={call:(op,args)=>execute(op,args,'disabled')},descriptorPath=path.join(temp,'broker.json');
 broker=productionToolBroker({worker,current:()=>binding},tools,descriptorPath);const descriptor=await broker.start();
 controller=new DesktopController({store:new BindingStore(path.join(temp,'binding.json')),worker,documents:temp,dialogs:{destination:async()=>null},authMode:'disabled',productionCallbacks:{serviceSettings:async()=>settings.read(),servicesDescriptor:()=>descriptor,launch:async()=>{checks.push('任务启动适配被省略：当前Codex会话直接执行已领取的测试任务，不验证宿主GUI');},open:async()=>''}});
 await controller.initialize();await controller.persist({...controller.binding,current:binding});
 const created=await controller.createRadarTask(query),task=created.snapshot.tasks.at(-1);
 assert.equal(task.request.budget.amount,2);assert.deepEqual(task.request.tools,['tikhub']);assert.equal(task.request.parameters.comments,false);assert.equal(task.request.parameters.query.sampleLimit,1);
 checks.push('真实createRadarTask冻结一个候选/两次请求上限/无评论');
 identity={taskId:task.id,attemptId:task.activeAttemptId,workerId:'codex-one-candidate-live-validation',claimToken:randomUUID()};
 library.mutateProduction('claimTask',identity,{mutationId:randomUUID()});
 summary.phase='collecting';await save();
 const radar=await collectRadar({query:task.request.parameters.query,identity,descriptorPath,maxRequests:2},async(location,request)=>{
  assert(calls.length<2,'Live request cap exceeded');const call={operation:request.operation,startedAt:new Date().toISOString()};calls.push(call);
  try{const result=await callServiceTool(location,request);Object.assign(call,{ok:true,requestsUsed:result.requestsUsed,cacheHit:result.cacheHit,collectedAt:result.collectedAt});return result;}
  catch(error){Object.assign(call,{ok:false,code:error.code??'SERVICE_FAILED',httpStatus:error.httpStatus??null,providerCode:error.providerCode??null});throw error;}
 });
 assert(radar.candidates.length<=1);summary.outcome=radar.candidates.length?'collected-one':'no-candidate';summary.collection={requests:radar.collection.requests,stoppedReason:radar.collection.stoppedReason,partial:radar.collection.partial};
 await fs.writeFile(path.join(evidence,'one-candidate.json'),JSON.stringify({query:radar.query,collectedAt:radar.collectedAt,candidates:radar.candidates},null,2)+'\n');
 checks.push('真实采样器经broker/worker费用预留和结算，最多一个候选');
 library.mutateProduction('submitTask',{...identity,result:{summary:`最小真实采样：${radar.candidates.length}条；不降低门槛。`,artifacts:[{id:randomUUID(),kind:'research',title:'一个选题真实采样',text:'按已冻结方向和门槛采样，仅用于临时库验收，未写入用户内容库。',assetHash:null,data:{radar}}]}},{mutationId:randomUUID()});
 let snapshot=await controller.readProduction(),attempt=snapshot.tasks.at(-1).attempts.at(-1);
 snapshot=await controller.actProductionTask({taskId:task.id,attemptId:attempt.id,receiptHash:attempt.receipt.sha256,expectedToken:snapshot.editToken,action:'accept'});
 snapshot=await controller.adoptRadarResult({taskId:task.id,attemptId:attempt.id,receiptHash:attempt.receipt.sha256,expectedToken:snapshot.editToken});
 const report=snapshot.reports.find(r=>r.type==='viral-radar');assert(report);checks.push('真实观察经submit/receipt/accept/adopt形成临时库雷达报告');
 if(radar.candidates.length){const candidate=report.meta.radar.candidates[0];snapshot=await controller.decideRadarCandidate({reportId:report.id,candidateId:candidate.id,decision:'add-topic',expectedToken:snapshot.editToken});const added=snapshot.reports.find(r=>r.id===report.id).meta.radar.candidates[0];const content=library.readProductionCreation(added.topicId);assert.equal(content.content.body,'');assert.equal(content.creation.references[0].url,candidate.url);summary.eligibility=candidate.eligibility;checks.push('该真实来源在临时库加入唯一选题，空正文和原文参考保留');}
 await save();console.log(JSON.stringify({outcome:summary.outcome,brokerCalls:calls.length,candidates:radar.candidates.length,eligibility:summary.eligibility??null}));
}catch(error){
 summary.outcome='blocked';summary.error={code:error.code??'PROBE_FAILED',httpStatus:error.httpStatus??null,providerCode:error.providerCode??null};
 if(library&&identity){try{library.mutateProduction('failTask',{...identity,failure:{code:summary.error.code,message:`最小真实测试停止，HTTP ${summary.error.httpStatus??'未知'}；不重试。`}},{mutationId:randomUUID()});}catch{}}
 await save();console.log(JSON.stringify({outcome:summary.outcome,error:summary.error,brokerCalls:calls.length}));
}finally{await broker?.stop();app.exit(0);}

}).catch(error=>{console.error(JSON.stringify({code:error.code??'PROBE_INITIALIZATION_FAILED'}));app.exit(1);});
