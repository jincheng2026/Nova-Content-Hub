import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {createLibrary} from '../../plugin-src/src/lib/file-library/index.mjs';
import {createVault} from '../../plugin-src/src/lib/vault/index.mjs';
import {openLibrary} from '../../plugin-src/src/lib/file-library/index.mjs';
import {executeProduction} from '../src/main/production-worker.mts';
import {productionToolBroker} from '../src/main/production-services.mts';
import {JinChengResearchServices} from '../src/main/jincheng-research-services.mts';
import {defaultServiceSettings} from '../src/shared/service-validation.ts';
const config=()=>({version:1,researchId:'research-contract',outputDirectory:'01_对标账号/研究对象/调研/任务一',route:'account',platform:'douyin',targetIds:['author'],operations:['profile','user-posts','video'],maxRequests:4,comments:false,videoIds:['12345']});
async function fixture(t,{vault=false,samples=false}={}){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'nova-jc-research-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 if(vault)await fs.mkdir(path.join(root,'vault'));
 const binding=vault?createVault(path.join(root,'vault')):null,l=binding?openLibrary(binding.root):createLibrary(path.join(root,'library'));
 const c=config();if(samples){delete c.videoIds;c.sampleLimit=3;}const task=l.mutateProduction('createTask',{kind:'research',title:'独立账号调研',prompt:'研究此账号',host:'codex',parameters:{workflow:'jincheng-research',researchRuntime:c,budgetEnabled:true,media:{version:1,maxDownloads:3,maxBytes:67108864},serviceConfig:{asr:{mode:'local-only',localEngine:'qwen3-asr'}}},tools:['tikhub','media','asr'],budget:{amount:4,currency:'REQ'},bodyHash:null,expectedToken:l.readProduction().editToken}).tasks[0];
 const identity={taskId:task.id,attemptId:task.activeAttemptId,claimToken:randomUUID(),workerId:'research-contract'};l.mutateProduction('claimTask',identity);
 const b=binding??{root:l.info.root,libraryId:l.info.libraryId,rootIdentity:l.info.rootIdentity};
 const file=path.join(root,'fixture.wav'),wav=Buffer.alloc(44);wav.write('RIFF');wav.write('WAVE',8);await fs.writeFile(file,wav);
 const asset=l.importAsset(file,{purpose:'production-reference'}),proof={sourceReceiptId:randomUUID(),sourceRequestId:randomUUID(),requestHash:task.requestHash,videoId:'12345',canonicalUrl:'https://www.douyin.com/video/12345',responseHash:'1'.repeat(64)};
 const settle=()=>{l.mutateProduction('reserveCost',{...identity,requestId:proof.sourceRequestId,service:'tikhub',usage:{requests:1}});l.mutateProduction('recordCost',{...identity,requestId:proof.sourceRequestId,status:'measured',amount:1,usage:{ok:true,operation:'video',id:proof.videoId,...proof}});};
 return{l,root,b,task,identity,c,asset,file,proof,settle,owner:{current:()=>b,worker:{call:(op,args)=>executeProduction(op,args,'disabled')}}};
}
test('standalone account research grants require exact frozen video and settled proof; no creation is fabricated',async t=>{
 const f=await fixture(t),input={...f.identity,requestId:randomUUID(),...f.proof};
 await assert.rejects(executeProduction('productionMediaGrant',{binding:f.b,input,source:f.file,mutationId:randomUUID()},'disabled'),/source receipt/);
 f.settle();const grant=await executeProduction('productionMediaGrant',{binding:f.b,input,source:f.file,mutationId:randomUUID()},'disabled');assert.equal(grant.assetHash,f.asset.assetHash);assert.equal(f.l.readProductionContext(f.task.id).creation,null);
 const audio=await executeProduction('productionAsset',{binding:f.b,...f.identity,audioPath:grant.assetHash},'disabled');assert.equal(audio.extension,'.wav');
 await assert.rejects(executeProduction('productionMediaGrant',{binding:f.b,input:{...input,videoId:'999',canonicalUrl:'https://www.douyin.com/video/999'},source:f.file,mutationId:randomUUID()},'disabled'),{code:'MEDIA_NOT_AUTHORIZED'});
 f.l.mutateProduction('cancelTask',{taskId:f.task.id,attemptId:f.task.activeAttemptId,expectedToken:f.l.readProduction().editToken});await assert.rejects(executeProduction('productionAsset',{binding:f.b,...f.identity,audioPath:grant.assetHash},'disabled'),{code:'CLAIM_MISMATCH'});
});
test('research broker rejects unfrozen objects and cloud fallback before invoking a provider',async t=>{
 const f=await fixture(t),calls=[],tools={settings:{read:()=>({values:{...defaultServiceSettings(),budget:{enabled:true,maxRequestsPerTask:10}}}),secret:()=> 'test-only-key'},execute:async(request,hooks)=>{calls.push(request);await hooks.beforeExecute({service:'tikhub',requests:1});await hooks.afterExecute({service:'tikhub',requestsUsed:1,ok:true});return{service:'tikhub',data:{ok:true},requestsUsed:1,collectedAt:new Date().toISOString(),cacheHit:false};}};
 const broker=productionToolBroker(f.owner,tools,'/unused'),request={...f.identity,requestId:randomUUID(),tool:'tikhub',operation:'profile',id:'other'};
 await assert.rejects(broker.options.execute(request),{code:'RESEARCH_OPERATION_FORBIDDEN'});assert.equal(calls.length,0);
 await assert.rejects(broker.options.execute({...request,tool:'asr',audioPath:f.asset.assetHash,allowCloud:true}),{code:'ASR_LOCAL_ONLY'});assert.equal(calls.length,0);
 await broker.options.execute({...request,id:'author'});assert.equal(calls.length,1);assert.equal(f.l.readProduction().costs[0].status,'measured');
});
test('desktop research adapter resolves selected Vault and refuses reads after claim ends',async t=>{
 const f=await fixture(t,{vault:true}),tools={checkReadiness:async()=>({localAsr:{available:false,reason:'fixture: no Qwen installed'}})},services=new JinChengResearchServices(f.owner,async()=>assert.fail('no provider should run'),tools);
 const result=await services.execute(f.identity,'prepare');assert.equal(result.stage,'prepared');const status=await services.execute(f.identity,'status');assert.equal(status.config.outputDirectory,f.c.outputDirectory);
 f.l.mutateProduction('cancelTask',{taskId:f.task.id,attemptId:f.task.activeAttemptId,expectedToken:f.l.readProduction().editToken});await assert.rejects(services.execute(f.identity,'status'),{code:'CLAIM_MISMATCH'});
});
test('offline report assets over 2 MiB retain complete HTML while the 8 MiB limit stays enforced',async t=>{
 const f=await fixture(t),report=path.join(f.root,'large-report.html'),prefix='<!doctype html><html><body>',suffix='</body></html>';
 await fs.writeFile(report,prefix+'证'.repeat(800000)+suffix);const asset=f.l.importAsset(report,{purpose:'production-report'});assert.ok(f.l.readAsset(asset.assetHash).bytes>2*1024*1024);
 const snapshot=f.l.mutateProduction('saveReport',{title:'完整离线报告',type:'调研',accountIds:[],sourceUrl:null,collectedAt:null,meta:{},pages:[{id:randomUUID(),title:'正文',assetHash:asset.assetHash}],expectedToken:f.l.readProduction().editToken});
 const result=await executeProduction('productionReport',{binding:f.b,reportId:snapshot.reports[0].id},'disabled');assert.equal(result.html.endsWith(suffix),true);
 await fs.writeFile(report,prefix+'x'.repeat(8*1024*1024)+suffix);assert.throws(()=>f.l.importAsset(report,{purpose:'production-report'}),/at most 8 MiB/);
});

test('account response derives bounded sample authority on the same attempt; forged and other-attempt video IDs remain blocked',async t=>{
 const f=await fixture(t,{vault:true,samples:true}),calls=[],tools={settings:{read:()=>({values:{...defaultServiceSettings(),budget:{enabled:true,maxRequestsPerTask:10}}}),secret:()=> 'test-only-key'},execute:async(request,hooks)=>{calls.push(request);await hooks.beforeExecute({service:'tikhub',requests:1});await hooks.afterExecute({service:'tikhub',requestsUsed:1,ok:true});return{service:'tikhub',data:request.operation==='user-posts'?{aweme_list:[{aweme_id:'12345'},{aweme_id:'222'},{aweme_id:'333'},{aweme_id:'444'}]}:{ok:true},requestsUsed:1,collectedAt:new Date().toISOString(),cacheHit:false};}};
 const broker=productionToolBroker(f.owner,tools,'/unused'),services=new JinChengResearchServices(f.owner,req=>broker.options.execute(req),{checkReadiness:async()=>({})});
 await services.execute(f.identity,'prepare');await assert.rejects(services.execute(f.identity,'derive-samples'),{code:'RESEARCH_RECEIPT_REQUIRED'});
 await services.execute(f.identity,'collect',{operation:'user-posts',id:'author'});const sample=await services.execute(f.identity,'derive-samples');assert.deepEqual(sample.videoIds,['12345','222','333']);
 const sourceCost=f.l.readProduction().costs[0];assert.equal(sourceCost.usage.operation,'user-posts');assert.deepEqual(sourceCost.usage.researchVideoIds,sample.videoIds);
 await assert.rejects(broker.options.execute({...f.identity,requestId:randomUUID(),tool:'tikhub',operation:'video',id:'444'}),{code:'RESEARCH_OPERATION_FORBIDDEN'});
 await broker.options.execute({...f.identity,requestId:randomUUID(),tool:'tikhub',operation:'video',id:'12345'});f.settle();
 const grant=await executeProduction('productionMediaGrant',{binding:f.b,input:{...f.identity,requestId:randomUUID(),...f.proof},source:f.file,mutationId:randomUUID()},'disabled');assert.equal(grant.videoId,'12345');
 const before=calls.length;f.l.mutateProduction('retryTask',{taskId:f.task.id,host:'codex',expectedToken:f.l.readProduction().editToken});const next=f.l.readProduction().tasks[0].activeAttemptId,identity={...f.identity,attemptId:next,claimToken:randomUUID()};f.l.mutateProduction('claimTask',identity);
 await assert.rejects(broker.options.execute({...identity,requestId:randomUUID(),tool:'tikhub',operation:'video',id:'12345'}),{code:'RESEARCH_OPERATION_FORBIDDEN'});assert.equal(calls.length,before);
});
