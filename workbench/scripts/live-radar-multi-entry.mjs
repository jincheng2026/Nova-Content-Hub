// Explicit user-authorized final two-search live validation; no profile, comments or retries. All writes stay in a temporary library.
import {app,safeStorage} from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import https from 'node:https';
import {randomUUID,createHash} from 'node:crypto';
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
if(!temp||!evidence||!path.basename(temp).startsWith('nova-live-service-'))throw Error('Use live-service-probe --run-radar-multi');
app.setName('自媒体工作台');app.setPath('userData',path.join(temp,'electron-profile'));
app.whenReady().then(async()=>{
const startedAt=new Date().toISOString(),calls=[],checks=[],http=[],originalRequest=https.request;
const query={platform:'抖音',platforms:['抖音','小红书'],direction:'AI 工具教程',sampleLimit:2,maxFollowers:10000,minLikes:1000,minRatio:1,lookbackDays:30};
let broker,library,identity,controller;
const summary={http,startedAt,platform:process.platform,arch:process.arch,query,maxHttpRequests:2,originalSettingsChanged:null,realAssistantGui:false,checks,calls,outcome:'started'};
function responseShape(value,depth=0){if(value===null)return'null';if(depth>8)return typeof value;if(Array.isArray(value))return{type:'array',length:value.length,sample:value.length?responseShape(value[0],depth+1):null};if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).slice(0,120).map(([key,item])=>[key,responseShape(item,depth+1)]));if(typeof value==='string'&&/^[\[{]/.test(value)){try{return{type:'JSON string',decoded:responseShape(JSON.parse(value),depth+1)};}catch{}}return typeof value;}
async function save(){await fs.writeFile(path.join(evidence,'summary.json'),JSON.stringify({...summary,updatedAt:new Date().toISOString(),costs:library?.readProduction().costs.map(({service,status,amount,usage})=>({service,status,amount,usage}))},null,2)+'\n');}
try{
 await save();
 const settings=new ServiceSettingsStore({filePath:path.join(temp,'settings.json'),encryption:safeStorage});await settings.initialize();const view=settings.read();
 assert(view.credentials.tikhub.hasKey,'TikHub Key is not configured');assert.equal(view.values.budget.enabled,false);assert.equal(view.values.commentsEnabled,false);summary.originalBudgetEnabled=false;summary.originalCommentsEnabled=false;
 https.request=function(...args){const url=new URL(String(args[0]));assert.equal(url.hostname,'api.tikhub.io');assert(http.length<2,'Maximum two additional real HTTP requests');const record={index:http.length+1,path:url.pathname,startedAt:new Date().toISOString()};http.push(record);const request=originalRequest.apply(this,args);request.once('response',response=>{record.status=response.statusCode;});return request;};
 if(process.env.NOVA_EXPECTED_TIKHUB_KEY_SHA256){assert(/^[0-9a-f]{64}$/.test(process.env.NOVA_EXPECTED_TIKHUB_KEY_SHA256));summary.credentialHashVerified=createHash('sha256').update(settings.secret('tikhub')).digest('hex')===process.env.NOVA_EXPECTED_TIKHUB_KEY_SHA256;assert(summary.credentialHashVerified,'Configured TikHub key does not match the user-provided key hash');}
 await settings.update({values:{...view.values,budget:{enabled:true,maxRequestsPerTask:2},commentsEnabled:false}});
 const tools=new ServiceTools({settings,cachePath:path.join(temp,'cache.json')});
 library=createLibrary(path.join(temp,'library'));const binding={root:library.info.root,libraryId:library.info.libraryId,rootIdentity:library.info.rootIdentity};
 const worker={call:(op,args)=>execute(op,args,'disabled')},descriptorPath=path.join(temp,'broker.json');
 broker=productionToolBroker({worker,current:()=>binding},tools,descriptorPath);const descriptor=await broker.start();
 controller=new DesktopController({store:new BindingStore(path.join(temp,'binding.json')),worker,documents:temp,dialogs:{destination:async()=>null},authMode:'disabled',productionCallbacks:{serviceSettings:async()=>settings.read(),servicesDescriptor:()=>descriptor,launch:async()=>{checks.push('任务启动适配被省略：当前Codex会话直接执行已领取的测试任务，不验证宿主GUI');},open:async()=>''}});
 await controller.initialize();await controller.persist({...controller.binding,current:binding});
 const created=await controller.createRadarTask(query),task=created.snapshot.tasks.at(-1);
 assert.equal(task.request.budget.amount,2);assert.deepEqual(task.request.tools,['tikhub']);assert.equal(task.request.parameters.comments,false);assert.equal(task.request.parameters.query.sampleLimit,2);
 checks.push('真实createRadarTask冻结双平台各一候选/两次请求上限/无评论');
 identity={taskId:task.id,attemptId:task.activeAttemptId,workerId:'codex-multi-platform-live-validation',claimToken:randomUUID()};
 library.mutateProduction('claimTask',identity,{mutationId:randomUUID()});
 summary.phase='collecting';await save();
 const radar=await collectRadar({query:task.request.parameters.query,identity,descriptorPath,maxRequests:2,allowedOperations:task.request.parameters.operations},async(location,request)=>{
  assert(calls.length<2,'Live request cap exceeded');assert(['douyin-search','xhs-search'].includes(request.operation),'Only the two searches are authorized');const call={operation:request.operation,startedAt:new Date().toISOString()};calls.push(call);
  try{const result=await callServiceTool(location,request);Object.assign(call,{ok:true,requestsUsed:result.requestsUsed,cacheHit:result.cacheHit,collectedAt:result.collectedAt});await fs.writeFile(path.join(evidence,`${calls.length}-${request.operation}.shape.json`),JSON.stringify(responseShape(result.data),null,2)+'\n');return result;}
  catch(error){Object.assign(call,{ok:false,code:error.code??'SERVICE_FAILED',httpStatus:error.httpStatus??null,providerCode:error.providerCode??null});throw error;}
 });
 assert(radar.candidates.length<=2);summary.outcome=calls.length===2&&calls.every(call=>call.ok)?'two-platform-searches-complete':'partial';summary.collection=radar.collection;summary.actualHttpRequests=http.length;summary.frozenRequest=task.request;summary.monetaryCost='unknown; measured requests are not a price';
 await fs.writeFile(path.join(evidence,'radar.json'),JSON.stringify(radar,null,2)+'\n');
 checks.push('真实采样器经broker/worker费用预留和结算，全平台最多两个候选，未补profile；缺粉丝保留null');
 library.mutateProduction('submitTask',{...identity,result:{summary:`最小真实采样：${radar.candidates.length}条；不降低门槛。`,artifacts:[{id:randomUUID(),kind:'research',title:'抖音与小红书真实采样',text:'按已冻结方向和门槛采样，仅用于临时库验收，未写入用户内容库。',assetHash:null,data:{radar}}]}},{mutationId:randomUUID()});
 let snapshot=await controller.readProduction(),attempt=snapshot.tasks.at(-1).attempts.at(-1);
 snapshot=await controller.actProductionTask({taskId:task.id,attemptId:attempt.id,receiptHash:attempt.receipt.sha256,expectedToken:snapshot.editToken,action:'accept'});
 snapshot=await controller.adoptRadarResult({taskId:task.id,attemptId:attempt.id,receiptHash:attempt.receipt.sha256,expectedToken:snapshot.editToken});
 const report=snapshot.reports.find(r=>r.type==='viral-radar');assert(report);checks.push('真实观察经submit/receipt/accept/adopt形成临时库雷达报告');
 await fs.writeFile(path.join(evidence,'accepted-report.json'),JSON.stringify(report,null,2)+'\n');
 const archive=library.rebuildProductionArchive(task.id);await fs.copyFile(path.join(archive.directory,'结果.json'),path.join(evidence,'accepted-archive.json'));summary.receipt={accepted:true,archiveReady:archive.ready,sha256:attempt.receipt.sha256};summary.platforms=report.meta.radar.candidates.map(candidate=>({platform:candidate.platform,url:candidate.url,followers:candidate.author.followers,eligibility:candidate.eligibility,reasons:candidate.reasons}));

 await save();console.log(JSON.stringify({outcome:summary.outcome,brokerCalls:calls.length,candidates:radar.candidates.length,eligibility:summary.eligibility??null}));
}catch(error){
 summary.outcome='blocked';summary.error={code:error.code??'PROBE_FAILED',httpStatus:error.httpStatus??null,providerCode:error.providerCode??null};
 if(library&&identity){try{library.mutateProduction('failTask',{...identity,failure:{code:summary.error.code,message:`最小真实测试停止，HTTP ${summary.error.httpStatus??'未知'}；不重试。`}},{mutationId:randomUUID()});}catch{}}
 await save();console.log(JSON.stringify({outcome:summary.outcome,error:summary.error,brokerCalls:calls.length}));
}finally{https.request=originalRequest;await broker?.stop();app.exit(0);}

}).catch(error=>{console.error(JSON.stringify({code:error.code??'PROBE_INITIALIZATION_FAILED'}));app.exit(1);});
