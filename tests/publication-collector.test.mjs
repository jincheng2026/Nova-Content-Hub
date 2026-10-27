import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {createLibrary} from '../plugin-src/src/lib/file-library/index.mjs';
import {executeProduction} from '../workbench/src/main/production-worker.mts';
import {productionToolBroker} from '../workbench/src/main/production-services.mts';
import {ServiceTools} from '../workbench/src/main/service-tools.mts';
import {defaultServiceSettings} from '../workbench/src/shared/service-validation.ts';
const postId='12345';
const freeze=()=>({workflow:'publication-observe',executor:'native-observer',publicationScope:{postId,checkpoint:'12h',consentId:randomUUID(),reservationId:randomUUID(),requestId:randomUUID()},comments:false,budgetEnabled:true,maxRequestsPerTask:1});
async function fixture(t,{parameters=freeze(),raw={data:{aweme_detail:{aweme_id:postId,statistics:{play_count:120,digg_count:9,comment_count:0,collect_count:3,share_count:2}}}},outcome}={}){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'nova-publication-collector-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const l=createLibrary(path.join(root,'library'));const task=l.mutateProduction('createTask',{kind:'research',title:'发布观察',prompt:'只采集固定发布对象',host:'codex',parameters,tools:['tikhub'],budget:{amount:1,currency:'REQ'},bodyHash:null,expectedToken:l.readProduction().editToken}).tasks[0];
 const identity={taskId:task.id,attemptId:task.activeAttemptId,claimToken:randomUUID(),workerId:'native-publication-observer'};l.mutateProduction('claimTask',identity);
 const binding={root:l.info.root,libraryId:l.info.libraryId,rootIdentity:l.info.rootIdentity},calls=[],settings={read:()=>({values:{...defaultServiceSettings(),budget:{enabled:true,maxRequestsPerTask:10}},credentials:{tikhub:{hasKey:true}},encryptionAvailable:true}),secret:()=> 'fixture-key'};
 const tools={settings,execute:async(request,hooks)=>{calls.push(request);await hooks.beforeExecute({service:'tikhub',requests:1});if(outcome){await hooks.afterExecute(outcome);throw Object.assign(new Error('fixture'),{code:'NETWORK_FAILED'});}await hooks.afterExecute({service:'tikhub',requestsUsed:1,ok:true});return{service:'tikhub',data:raw,requestsUsed:1,collectedAt:new Date().toISOString(),cacheHit:false};}};
 const worker={call:(op,args)=>executeProduction(op,args,'disabled')},broker=productionToolBroker({current:()=>binding,worker},tools,path.join(root,'broker.json'));
 const request={...identity,requestId:parameters.publicationScope.requestId,tool:'tikhub',operation:'video',id:postId};return{root,l,task,identity,binding,calls,settings,worker,broker,request,raw};
}
test('publication broker restricts operation, object, worker, request and one total call',async t=>{
 const f=await fixture(t);
 for(const change of [{operation:'profile'},{id:'999'},{workerId:'other'},{requestId:randomUUID()},{cursor:'0'}])await assert.rejects(f.broker.options.execute({...f.request,...change}));
 assert.equal(f.calls.length,0);
 await f.broker.options.execute(f.request);
 await assert.rejects(f.broker.options.execute(f.request),{code:'PUBLICATION_REQUEST_LIMIT'});assert.equal(f.calls.length,1);assert.equal(f.l.readProduction().costs.length,1);
});
test('publication result retains actual metrics and raw hash only in its restricted evidence branch',async t=>{
 const f=await fixture(t),result=await f.broker.options.execute(f.request);
 assert.deepEqual(result.data.observationEvidence.raw,f.raw);
 assert.deepEqual(result.data.observationEvidence.metrics,{play:120,like:9,comments:0,collect:3,share:2});
 assert.equal(result.data.observationEvidence.responseHash,createHash('sha256').update(JSON.stringify(f.raw)).digest('hex'));
 assert.equal(f.l.readProduction().costs[0].amount,1);
});
test('mismatched detail never supplies current publication metrics and missing fields remain unknown',async t=>{
 const f=await fixture(t,{raw:{data:{aweme_detail:{aweme_id:'999',statistics:{play_count:999}}}}});
 const result=await f.broker.options.execute(f.request);assert.equal(result.data.observationEvidence.postIdMatched,false);assert.deepEqual(result.data.observationEvidence.metrics,{play:null,like:null,comments:null,collect:null,share:null});
 const g=await fixture(t,{raw:{data:{aweme_detail:{aweme_id:postId,statistics:{digg_count:'7',play_count:-1}}}}});const next=await g.broker.options.execute(g.request);assert.equal(next.data.observationEvidence.postIdMatched,true);assert.deepEqual(next.data.observationEvidence.metrics,{play:null,like:null,comments:null,collect:null,share:null});
});
test('unknown provider outcome uses existing cost ledger and blocks another collection',async t=>{
 const f=await fixture(t,{outcome:{service:'tikhub',requestsUsed:null,ok:false}});await assert.rejects(f.broker.options.execute(f.request));assert.equal(f.l.readProduction().costs[0].status,'unknown');await assert.rejects(f.broker.options.execute({...f.request,requestId:randomUUID()}));assert.equal(f.calls.length,1);
});

async function collectorFixture(t,options={}){
 const {createPublicationCollector}=await import('../workbench/src/main/publication-collector.mts');
 const {ProductionController}=await import('../workbench/src/main/production-controller.mts');
 const f=await fixture(t,options);let binding={...f.binding,productionPending:null};let current=f.binding;
 let chain=Promise.resolve();const runOperation=action=>{const result=chain.then(action);chain=result.catch(()=>{});return result;};
 const controller=new ProductionController({binding,authMode:'disabled',worker:f.worker,dialogs:{},covers:{grant:()=>''},current:()=>current,noPending(){assert.equal(this.binding.productionPending,null);},persist:async next=>{binding=next;controller.owner.binding=next;},exclusive:action=>action()},{serviceSettings:async()=>f.settings.read(),launch:async()=>{},open:async()=>''});
 // The broker uses the same operation queue as preparation: holding it across HTTP would deadlock.
 let serviceTools;const cachePath=path.join(f.root,'service-cache.json');
 if(options.cacheEntry){await fs.writeFile(cachePath,JSON.stringify([[createHash('sha256').update(JSON.stringify(['video',postId,'0'])).digest('hex'),options.cacheEntry(f.raw)]]));serviceTools=new ServiceTools({settings:f.settings,cachePath});serviceTools.invoke=async request=>{f.calls.push(request);return f.raw;};}
 const broker=productionToolBroker({current:()=>current,worker:f.worker},serviceTools??{settings:f.settings,execute:async(request,hooks)=>{f.calls.push(request);await hooks.beforeExecute({service:'tikhub',requests:1});if(options.outcome){await hooks.afterExecute(options.outcome);throw Object.assign(new Error('fixture'),{code:'NETWORK_FAILED'});}await hooks.afterExecute({service:'tikhub',requestsUsed:1,ok:true});return{service:'tikhub',data:f.raw,requestsUsed:1,collectedAt:options.collectedAt??new Date().toISOString(),cacheHit:false};}},path.join(f.root,'collector-broker.json'),runOperation);
 await broker.start();t.after(()=>broker.stop());
 const observation={work:{vaultId:randomUUID(),workId:randomUUID()},videoId:'published-video',platform:'douyin',postId,url:`https://www.douyin.com/video/${postId}`,checkpoint:'12h',targetAt:new Date(Date.now()-60000).toISOString(),reservationId:randomUUID(),requestId:randomUUID(),freeze:{enabled:true,mode:'auto',provider:'tikhub',maxRequestsPerCheckpoint:1,maxUnits:1,unit:'REQ',authorizationId:randomUUID(),authorDecision:{actor:'author',text:'同意各时点最多1次查询',at:new Date().toISOString()}}};
 return {...f,controller,observation,serviceTools,cachePath,collector:createPublicationCollector({controller,worker:f.worker,settings:f.settings,descriptorPath:path.join(f.root,'collector-broker.json'),runOperation,...(serviceTools?{ensureVideoFreshness:(id,targetAt)=>serviceTools.ensureTikHubVideoFreshness(id,targetAt)}:{})}),switchBinding:()=>{current={...current,libraryId:randomUUID()};}};
}
test('native collector creates, claims and submits through real production worker and broker without accepting a result',async t=>{
 const f=await collectorFixture(t),result=await f.collector.collectOnce({binding:f.binding,observation:f.observation});
 assert.equal(result.state,'succeeded');assert.equal(result.serviceReceipt.requestId,f.observation.requestId);assert.deepEqual(result.metrics,{play:120,like:9,comments:0,collect:3,share:2});assert.deepEqual(JSON.parse(result.rawEvidence).raw,f.raw);
 const task=f.l.readProduction().tasks.find(task=>task.request.parameters.publicationScope?.requestId===f.observation.requestId);assert.equal(task.attempts[0].status,'submitted');assert.equal(task.attempts[0].workerId,'native-publication-observer');assert.equal(task.request.tools.join(','),'tikhub');assert.equal(f.calls.length,1);
 const replay=await f.collector.collectOnce({binding:f.binding,observation:f.observation});assert.notEqual(replay.state,'succeeded');assert.equal(f.calls.length,1);
});
test('native collector reports unknown charged outcome and refuses invalid authorization without provider calls',async t=>{
 const f=await collectorFixture(t,{outcome:{service:'tikhub',requestsUsed:null,ok:false}});assert.equal((await f.collector.collectOnce({binding:f.binding,observation:f.observation})).state,'unknown');assert.equal(f.calls.length,1);
 const g=await collectorFixture(t);g.observation.freeze.maxUnits=2;assert.equal((await g.collector.collectOnce({binding:g.binding,observation:g.observation})).state,'failed');assert.equal(g.calls.length,0);
});

test('native worker operation rejects assistant tasks, foreign workers and accept operations',async t=>{
 const f=await fixture(t),write=(op,input)=>executeProduction('productionObserverMutation',{binding:f.binding,op,input,mutationId:randomUUID()},'disabled');
 await assert.rejects(write('acceptTask',f.identity),{code:'INVALID_INPUT'});
 await assert.rejects(write('submitTask',{...f.identity,workerId:'another-worker',result:{summary:'forged',artifacts:[]}}),{code:'INVALID_INPUT'});
 const task=f.l.mutateProduction('createTask',{kind:'research',title:'普通助手调研',prompt:'fixture',host:'codex',parameters:{workflow:'jincheng-research'},tools:['tikhub'],budget:{amount:1,currency:'REQ'},bodyHash:null,expectedToken:f.l.readProduction().editToken}).tasks.at(-1);
 await assert.rejects(write('claimTask',{...f.identity,taskId:task.id,attemptId:task.activeAttemptId}),{code:'PUBLICATION_OPERATION_FORBIDDEN'});
});
test('readiness and selected library are checked without paid collection; old cache is not a checkpoint snapshot',async t=>{
 const f=await collectorFixture(t);assert.equal(f.collector.isReady(),true);f.switchBinding();assert.equal((await f.collector.collectOnce({binding:f.binding,observation:f.observation})).state,'failed');assert.equal(f.calls.length,0);
 const g=await collectorFixture(t,{collectedAt:new Date(Date.now()-120000).toISOString()});const result=await g.collector.collectOnce({binding:g.binding,observation:g.observation});assert.equal(result.state,'failed');assert.equal(result.message,'OBSERVATION_STALE');assert.equal(g.calls.length,1);
 const h=await collectorFixture(t);h.settings.read=()=>({values:{budget:{enabled:false,maxRequestsPerTask:0}},credentials:{tikhub:{hasKey:true}},encryptionAvailable:true});assert.equal(h.collector.isReady(),false);assert.equal((await h.collector.collectOnce({binding:h.binding,observation:h.observation})).message,'SERVICE_NOT_READY');assert.equal(h.calls.length,0);
});

test('native freshness reuses cache after target at zero requests and recollects older successful cache once',async t=>{
 const fresh=await collectorFixture(t,{cacheEntry:raw=>({collectedAt:new Date(Date.now()-30000).toISOString(),data:raw})});const a=await fresh.collector.collectOnce({binding:fresh.binding,observation:fresh.observation});assert.equal(a.state,'succeeded');assert.equal(a.serviceReceipt.amount,0);assert.equal(a.serviceReceipt.cacheHit,true);assert.equal(fresh.calls.length,0);
 const old=await collectorFixture(t,{cacheEntry:raw=>({collectedAt:new Date(Date.now()-120000).toISOString(),data:raw})});const b=await old.collector.collectOnce({binding:old.binding,observation:old.observation});assert.equal(b.state,'succeeded');assert.equal(b.serviceReceipt.amount,1);assert.equal(b.serviceReceipt.cacheHit,false);assert.equal(old.calls.length,1);
 assert.equal(old.l.readProduction().costs.filter(cost=>cost.taskId===b.serviceReceipt.taskId).length,1);
});
test('freshness never deletes unknown or in-flight entries and accepts only numeric video IDs',async t=>{
 const f=await collectorFixture(t,{cacheEntry:()=>({collectedAt:new Date(Date.now()-120000).toISOString(),unknown:true,requestId:randomUUID()})}),before=await fs.readFile(f.cachePath,'utf8');
 await assert.rejects(f.serviceTools.ensureTikHubVideoFreshness(postId,f.observation.targetAt),{code:'COST_UNKNOWN'});assert.equal(await fs.readFile(f.cachePath,'utf8'),before);
 const result=await f.collector.collectOnce({binding:f.binding,observation:f.observation});assert.equal(result.state,'unknown');assert.equal(f.calls.length,0);assert.equal(await fs.readFile(f.cachePath,'utf8'),before);
 const g=await collectorFixture(t,{cacheEntry:raw=>({collectedAt:new Date(Date.now()-120000).toISOString(),data:raw})}),key=createHash('sha256').update(JSON.stringify(['video',postId,'0'])).digest('hex'),saved=await fs.readFile(g.cachePath,'utf8');g.serviceTools.inflight.add(key);
 await assert.rejects(g.serviceTools.ensureTikHubVideoFreshness(postId,g.observation.targetAt),{code:'REQUEST_IN_PROGRESS'});assert.equal(await fs.readFile(g.cachePath,'utf8'),saved);
 await assert.rejects(g.serviceTools.ensureTikHubVideoFreshness('https://www.douyin.com/video/12345',g.observation.targetAt),{code:'INVALID_INPUT'});assert.equal(g.calls.length,0);
});
