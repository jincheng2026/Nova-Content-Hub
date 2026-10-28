import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {createVault,createVaultDocument} from '../../plugin-src/src/lib/vault/index.mjs';
import {openLibrary} from '../../plugin-src/src/lib/file-library/index.mjs';
import {productionToolBroker} from '../src/main/production-services.mts';
import {executeProduction} from '../src/main/production-worker.mts';
import {JinChengResearchServices} from '../src/main/jincheng-research-services.mts';
import {defaultServiceSettings} from '../src/shared/service-validation.ts';
import {deriveSearchSamples} from '../../plugin-src/src/lib/research-runtime/samples.mjs';
import {validateResearchConfig} from '../../plugin-src/src/lib/research-runtime/common.mjs';
import {runResearchHandoff} from '../../plugin-src/src/commands/jincheng-research.mjs';

const scope={cursor:'0',search:{sortType:'general',timeRange:'any',contentType:'video'}};
const policy={version:1,sourceOperation:'douyin-search',limit:3,selection:'response-order'};
const video=(id,extra={})=>({type:1,data:{aweme_info:{aweme_id:id,aweme_type:0,desc:'作品'+id,author:{uid:'author-'+id,nickname:'作者'+id},video:{duration:1200,play_addr:{url_list:['https://example.invalid/search-url-never-used']}},...extra}}});
const response=()=>({z:'provider envelope order is intentional',data:{business_data:[video('123'),video('123'),video('456'),video('789'),video('999')]}});
async function fixture(t,{configPatch={},budget=5,data=response(),journey=false,charge=1,unknown=false,rawMissing=false,permissions=['tikhub','media','asr']}={}){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'nova-search-sample-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const vault=path.join(root,'vault');await fs.mkdir(vault);const binding=createVault(vault),library=openLibrary(binding.root);
 const config={version:1,researchId:'search-contract',outputDirectory:'调研报告库/search-contract',route:'topic',platform:'douyin',targetIds:['AI教程'],operations:['douyin-search','video'],maxRequests:budget,comments:false,sampleDerivation:policy,searchScope:scope,...configPatch};
 for(const key of Object.keys(config))if(config[key]===undefined)delete config[key];
 let parent,rootClaim;
 if(journey){const document=createVaultDocument(binding.root,{section:'drafts',title:'关键词主线',text:'作者冻结资料'},{mutationId:randomUUID()}).document,snapshot=library.mutateProduction('startJourney',{contentId:document.contentId,host:'codex',method:'ordinary-writing',researchPlan:[config],limits:{maxRequestsTotal:budget,commentsAllowed:false,mediaCount:3,mediaBytes:67108864},serviceConfig:{asr:{mode:'local-only',localEngine:'qwen3-asr'}},expectedToken:library.readProduction().editToken});parent=snapshot.tasks.find(task=>task.journeyState);rootClaim={taskId:parent.id,attemptId:parent.activeAttemptId,claimToken:randomUUID(),workerId:'search-contract'};library.mutateProduction('claimTask',rootClaim);}
 const task=journey?library.readProduction().tasks.find(task=>task.id===parent.journeyState.activeTaskId):library.mutateProduction('createTask',{kind:'research',title:'关键词有界样本',prompt:'只执行冻结关键词和搜索首屏',host:'codex',parameters:{workflow:'jincheng-research',researchRuntime:config,media:{version:1,maxDownloads:3,maxBytes:67108864},budgetEnabled:true,comments:false,serviceConfig:{asr:{mode:'local-only',localEngine:'qwen3-asr'}}},tools:permissions,budget:{amount:budget,currency:'REQ'},bodyHash:null,expectedToken:library.readProduction().editToken}).tasks[0];
 const identity={taskId:task.id,attemptId:task.activeAttemptId,claimToken:randomUUID(),workerId:'search-contract'};library.mutateProduction('claimTask',{...identity,...(rootClaim?{rootClaimToken:rootClaim.claimToken}:{})});
 const owner={current:()=>binding,worker:{call:(op,args)=>executeProduction(op,args,'disabled')}},requests=[],tools={settings:{read:()=>({values:{...defaultServiceSettings(),budget:{enabled:true,maxRequestsPerTask:10}}}),secret:()=> 'fixture-only-key'},execute:async(request,hooks)=>{
  await hooks.beforeExecute({service:'tikhub',requests:charge});requests.push(request);await hooks.afterExecute({service:'tikhub',requestsUsed:unknown?null:charge,ok:!unknown});return {data:request.operation==='douyin-search'?(rawMissing?undefined:structuredClone(data)):{data:{aweme_detail:{aweme_id:request.id,desc:'详情'+request.id,video:{play_addr:{url_list:['https://example.invalid/detail-only-media']}}}}},service:'tikhub',requestsUsed:unknown?null:charge,collectedAt:'2026-10-28T00:00:00.000Z',cacheHit:charge===0};
 }};
 const broker=productionToolBroker(owner,tools,'/unused/test-only'),sources=new Map(),file=path.join(root,'fixture.wav'),wav=Buffer.alloc(44);wav.write('RIFF');wav.write('WAVE',8);await fs.writeFile(file,wav);
 const execute=async request=>{if(request.tool==='media'){const source=sources.get(request.sourceReceiptId);assert.ok(source,'media must follow an actual broker detail receipt');const grant=await executeProduction('productionMediaGrant',{binding,source:file,mutationId:randomUUID(),input:{...identity,requestId:request.requestId,sourceReceiptId:source.id,sourceRequestId:source.requestId,requestHash:task.requestHash,videoId:source.videoId,canonicalUrl:source.canonicalUrl,responseHash:source.responseHash}},'disabled');return{data:grant,service:'media',requestsUsed:0,collectedAt:grant.createdAt,cacheHit:false};}const result=await broker.options.execute(request);if(result.data?.sourceReceipt)sources.set(result.data.sourceReceipt.id,{...result.data.sourceReceipt,requestId:request.requestId});return result;};
 const services=new JinChengResearchServices(owner,execute,{checkReadiness:async()=>({})});return {root,vault,binding,library,config,task,identity,requests,broker,services,data,file,parent,rootClaim,execute};
}

test('new keyword policy derives registered response-order samples and downloads through detail receipt and worker grant',async t=>{
 const f=await fixture(t);await f.services.execute(f.identity,'prepare');await f.services.execute(f.identity,'collect',{operation:'douyin-search',id:'AI教程',...scope});const samples=await f.services.execute(f.identity,'derive-samples');
 assert.deepEqual(samples.videoIds,['123','456','789']);assert.equal(samples.samples[0].title,'作品123');assert.equal(samples.samples[0].authorId,'author-123');assert.equal(samples.samples[0].canonicalUrl,'https://www.douyin.com/video/123');
 const cost=f.library.readProduction().costs[0],evidence=cost.usage.researchSampleEvidence;assert.equal(evidence.taskId,f.task.id);assert.equal(evidence.attemptId,f.identity.attemptId);assert.equal(evidence.requestHash,f.task.requestHash);assert.equal(evidence.sourceRequestId,samples.sourceRequestId);assert.equal(evidence.keyword,'AI教程');assert.equal(evidence.responseHash,createHash('sha256').update(JSON.stringify(f.data)).digest('hex'));
 const media=await f.services.execute(f.identity,'download',{videoId:'123'});assert.equal(media.videoId,'123');assert.equal(media.source.title,'详情123');assert.ok(media.originalPath);assert.equal(f.requests.length,2);assert.deepEqual(f.requests.map(request=>request.operation),['douyin-search','video']);assert.equal(f.library.readProductionContext(f.task.id).attempt.mediaGrants.length,1);
 const before=f.library.readProduction().costs.length;await f.services.execute(f.identity,'derive-samples');assert.equal(f.library.readProduction().costs.length,before);
});

test('desktop start freezes an explicitly selected keyword policy while an old brief stays search-only',async t=>{
 const {DesktopController}=await import('../src/main/controller.mts'),{BindingStore}=await import('../src/main/bindings.mts'),{execute}=await import('../src/main/worker.mts');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'nova-search-start-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const vault=path.join(root,'vault');await fs.mkdir(vault);const binding=createVault(vault),settings={values:{...defaultServiceSettings(),budget:{enabled:true,maxRequestsPerTask:5}},credentials:{tikhub:{hasKey:false},model:{hasKey:false},asr:{hasKey:false}},encryptionAvailable:true};
 const controller=new DesktopController({store:new BindingStore(path.join(root,'bindings.json')),worker:{call:(op,args)=>execute(op,args,'disabled')},documents:root,dialogs:{destination:async()=>null,library:async()=>null},authMode:'disabled',productionCallbacks:{launch:async()=>{},open:async()=>'',serviceSettings:async()=>settings}});controller.covers.seed=async()=>{};await controller.initialize();await controller.persist({...controller.binding,current:binding});
 const start={kind:'research',title:'关键词',prompt:'研究准确关键词',mode:'simple',comments:false,researchBrief:{route:'topic',platform:'douyin',targetIds:['AI教程']}};
 const old=await controller.startProductionTask(start),oldTask=old.snapshot.tasks.at(-1);assert.deepEqual(oldTask.request.parameters.researchRuntime.operations,['douyin-search']);assert.equal(oldTask.request.parameters.researchRuntime.sampleDerivation,undefined);
 const current=await controller.startProductionTask({...start,researchBrief:{...start.researchBrief,sampleDerivation:policy,searchScope:scope}}),task=current.snapshot.tasks.at(-1);assert.deepEqual(task.request.parameters.researchRuntime.sampleDerivation,policy);assert.deepEqual(task.request.parameters.researchRuntime.searchScope,scope);assert.deepEqual(task.request.parameters.researchRuntime.operations,['douyin-search','video']);
 assert.equal(current.snapshot.tasks[0].requestHash,oldTask.requestHash);assert.equal(current.snapshot.tasks[0].request.parameters.researchRuntime.sampleDerivation,undefined);
});

test('search sampling excludes advertisements, image posts, empty video records and author IDs',()=>{
 const raw={data:{business_data:[video('111',{is_ads:true}),video('222',{aweme_type:68,images:[{uri:'image'}]}),video('333',{video:{}}),{type:1,data:{aweme_info:{author:{uid:'444'},video:{duration:1}}}},video('123'),video('123'),video('456'),video('789'),video('999')]}};
 assert.deepEqual(deriveSearchSamples(raw,3).map(sample=>sample.videoId),['123','456','789']);
 assert.throws(()=>deriveSearchSamples({data:{items:[video('123')]}},3),{code:'UNSUPPORTED_NORMALIZATION'});
 assert.deepEqual(deriveSearchSamples({data:{business_data:[]}},3),[]);
});

test('keyword queries, pagination, caller IDs and old search-only permissions are rejected before a provider call',async t=>{
 const f=await fixture(t);await f.services.execute(f.identity,'prepare');
 for(const input of [{operation:'douyin-search',id:'其他关键词',...scope},{operation:'douyin-search',id:'AI教程',...scope,cursor:'1'},{operation:'douyin-search',id:'AI教程',...scope,search:{...scope.search,sortType:'likes'}},{operation:'video',id:'123'}])await assert.rejects(f.services.execute(f.identity,'collect',input));
 await assert.rejects(f.services.execute(f.identity,'derive-samples',{videoIds:['123']}),{code:'INVALID_INPUT'});assert.equal(f.requests.length,0);assert.equal(f.library.readProduction().costs.length,0);
 const old=await fixture(t,{configPatch:{sampleDerivation:undefined,searchScope:undefined,operations:['douyin-search']}});await old.services.execute(old.identity,'prepare');await old.services.execute(old.identity,'collect',{operation:'douyin-search',id:'AI教程'});
 await assert.rejects(old.services.execute(old.identity,'derive-samples'),{code:'RESEARCH_TARGET_FORBIDDEN'});await assert.rejects(old.services.execute(old.identity,'download',{videoId:'123'}),{code:'RESEARCH_TARGET_FORBIDDEN'});assert.equal(old.requests.length,1);
});

test('a registered search source is fixed, cannot refresh on a new request, and never resets on retry',async t=>{
 const f=await fixture(t);await f.services.execute(f.identity,'prepare');const input={operation:'douyin-search',id:'AI教程',...scope};await f.services.execute(f.identity,'collect',input);const first=await f.services.execute(f.identity,'derive-samples');
 await f.services.execute(f.identity,'collect',input);assert.deepEqual(await f.services.execute(f.identity,'derive-samples'),first);assert.equal(f.requests.length,1);
 await assert.rejects(f.broker.options.execute({...f.identity,requestId:randomUUID(),tool:'tikhub',...input}),{code:'RESEARCH_REQUEST_LIMIT'});
 f.library.mutateProduction('retryTask',{taskId:f.task.id,host:'codex',expectedToken:f.library.readProduction().editToken});const task=f.library.readProduction().tasks.find(task=>task.id===f.task.id),identity={...f.identity,attemptId:task.activeAttemptId,claimToken:randomUUID()};f.library.mutateProduction('claimTask',identity);
 await assert.rejects(f.services.execute(identity,'download',{videoId:'123'}),{code:'RESEARCH_RECEIPT_REQUIRED'});
 await assert.rejects(f.broker.options.execute({...identity,requestId:randomUUID(),tool:'tikhub',operation:'video',id:'123'}),{code:'RESEARCH_OPERATION_FORBIDDEN'});
 await assert.rejects(f.broker.options.execute({...identity,requestId:randomUUID(),tool:'tikhub',...input}),{code:'RESEARCH_REQUEST_LIMIT'});assert.equal(f.requests.length,1);assert.equal(f.library.readProduction().costs.length,1);
});

test('altered raw responses and local sample lists cannot replace the registered search evidence',async t=>{
 const f=await fixture(t);await f.services.execute(f.identity,'prepare');await f.services.execute(f.identity,'collect',{operation:'douyin-search',id:'AI教程',...scope});const samples=await f.services.execute(f.identity,'derive-samples'),state=await f.services.execute(f.identity,'status'),rawFile=path.join(f.vault,state.requests[0].path),rawBytes=await fs.readFile(rawFile),raw=JSON.parse(rawBytes);raw.data.data.business_data.unshift(video('888'));
 await fs.writeFile(rawFile,JSON.stringify(raw));await assert.rejects(f.services.execute(f.identity,'derive-samples'),{code:'CONFLICT'});await assert.rejects(f.services.execute(f.identity,'download',{videoId:'123'}),{code:'CONFLICT'});await fs.writeFile(rawFile,rawBytes);
 const stateFile=path.join(f.vault,f.config.outputDirectory,'research-runtime.json'),saved=JSON.parse(await fs.readFile(stateFile,'utf8'));saved.samples={...samples,videoIds:['888'],samples:[{videoId:'888',title:'伪造',authorId:'伪造',authorName:'伪造',canonicalUrl:'https://www.douyin.com/video/888'}]};await fs.writeFile(stateFile,JSON.stringify(saved));
 await assert.rejects(f.services.execute(f.identity,'download',{videoId:'888'}),{code:'CONFLICT'});assert.equal(f.requests.length,1);assert.equal(f.library.readProductionContext(f.task.id).attempt.mediaGrants,undefined);
});

test('wrong task, attempt, query, hashes, extra ID and epoch evidence fail at direct broker authorization',async t=>{
 const f=await fixture(t);await f.services.execute(f.identity,'prepare');await f.services.execute(f.identity,'collect',{operation:'douyin-search',id:'AI教程',...scope});await f.services.execute(f.identity,'derive-samples');const filename=path.join(f.binding.root,'库配置/default/配置.json'),before=await fs.readFile(filename);
 const corruptions=[proof=>{proof.taskId=randomUUID();},proof=>{proof.attemptId=randomUUID();},proof=>{proof.keyword='其他关键词';},proof=>{proof.responseHash='0'.repeat(64);},proof=>{proof.policyHash='0'.repeat(64);},proof=>{proof.searchParamsHash='0'.repeat(64);},proof=>{proof.videoIds.push('999');},proof=>{proof.journey={journeyId:randomUUID(),stepId:randomUUID(),ownerEpoch:2};}];
 for(const corrupt of corruptions){const metadata=JSON.parse(before);corrupt(metadata.production.costs[0].usage.researchSampleEvidence);await fs.writeFile(filename,JSON.stringify(metadata));await assert.rejects(f.broker.options.execute({...f.identity,requestId:randomUUID(),tool:'tikhub',operation:'video',id:'123'}),{code:'RESEARCH_OPERATION_FORBIDDEN'});await fs.writeFile(filename,before);}
 assert.equal(f.requests.length,1);assert.equal(f.library.readProduction().costs.length,1);
});

test('a budget sufficient only for search cannot pay for the derived video detail request',async t=>{
 const f=await fixture(t,{budget:1});await f.services.execute(f.identity,'prepare');await f.services.execute(f.identity,'collect',{operation:'douyin-search',id:'AI教程',...scope});await f.services.execute(f.identity,'derive-samples');
 await assert.rejects(f.services.execute(f.identity,'download',{videoId:'123'}),{code:'BUDGET_EXCEEDED'});assert.equal(f.requests.length,1);assert.equal(f.library.readProduction().costs.length,1);assert.equal((await f.services.execute(f.identity,'status')).media.length,0);
});

test('unsupported search shapes preserve the original response and settle its successful cost',async t=>{
 const f=await fixture(t,{data:{data:{unknown:[{id:'123'}]}}});await f.services.execute(f.identity,'prepare');await f.services.execute(f.identity,'collect',{operation:'douyin-search',id:'AI教程',...scope});await assert.rejects(f.services.execute(f.identity,'derive-samples'),{code:'UNSUPPORTED_NORMALIZATION'});
 const state=await f.services.execute(f.identity,'status');assert.deepEqual(JSON.parse(await fs.readFile(path.join(f.vault,state.requests[0].path),'utf8')).data,f.data);assert.equal(f.library.readProduction().costs[0].amount,1);assert.equal(f.library.readProduction().costs[0].status,'measured');
});

test('a successful provider charge is settled even when the search response has no JSON data',async t=>{
 const f=await fixture(t,{rawMissing:true});await f.services.execute(f.identity,'prepare');await assert.rejects(f.services.execute(f.identity,'collect',{operation:'douyin-search',id:'AI教程',...scope}),{code:'UNSUPPORTED_NORMALIZATION'});
 const costs=f.library.readProduction().costs;assert.equal(costs.length,1);assert.equal(costs[0].status,'measured');assert.equal(costs[0].amount,1);assert.equal(costs[0].usage.researchSampleEvidence,undefined);assert.equal(f.requests.length,1);
});

test('media registration rejects a detail receipt linked to a different derived search source',async t=>{
 const f=await fixture(t);await f.services.execute(f.identity,'prepare');await f.services.execute(f.identity,'collect',{operation:'douyin-search',id:'AI教程',...scope});await f.services.execute(f.identity,'derive-samples');const requestId=randomUUID(),detail=await f.broker.options.execute({...f.identity,requestId,tool:'tikhub',operation:'video',id:'123'}),receipt=detail.data.sourceReceipt;
 const filename=path.join(f.binding.root,'库配置/default/配置.json'),metadata=JSON.parse(await fs.readFile(filename,'utf8'));metadata.production.costs.find(cost=>cost.requestId===requestId).usage.researchSampleSource={sourceRequestId:randomUUID(),responseHash:'0'.repeat(64),policyHash:'0'.repeat(64)};await fs.writeFile(filename,JSON.stringify(metadata));
 await assert.rejects(executeProduction('productionMediaGrant',{binding:f.binding,source:f.file,mutationId:randomUUID(),input:{...f.identity,requestId:randomUUID(),sourceReceiptId:receipt.id,sourceRequestId:requestId,requestHash:f.task.requestHash,videoId:'123',canonicalUrl:'https://www.douyin.com/video/123',responseHash:receipt.responseHash}},'disabled'),{code:'MEDIA_NOT_AUTHORIZED'});
});

test('a cached runtime media entry still needs its exact current registered grant',async t=>{
 const f=await fixture(t);await f.services.execute(f.identity,'prepare');await f.services.execute(f.identity,'collect',{operation:'douyin-search',id:'AI教程',...scope});await f.services.execute(f.identity,'derive-samples');await f.services.execute(f.identity,'download',{videoId:'123'});
 const filename=path.join(f.vault,f.config.outputDirectory,'research-runtime.json'),state=JSON.parse(await fs.readFile(filename,'utf8'));state.media[0].sourceRequestId=randomUUID();await fs.writeFile(filename,JSON.stringify(state));
 await assert.rejects(f.services.execute(f.identity,'download',{videoId:'123'}),{code:'INVALID_MEDIA_GRANT'});assert.equal(f.requests.length,2);
 const grant=f.library.readProductionContext(f.task.id).attempt.mediaGrants[0],metadataFile=path.join(f.binding.root,'库配置/default/配置.json'),metadata=JSON.parse(await fs.readFile(metadataFile,'utf8'));metadata.production.costs.find(cost=>cost.requestId===grant.sourceRequestId).usage.researchSampleSource.sourceRequestId=randomUUID();await fs.writeFile(metadataFile,JSON.stringify(metadata));
 await assert.rejects(executeProduction('productionAsset',{binding:f.binding,...f.identity,audioPath:grant.assetHash},'disabled'),{code:'MEDIA_NOT_AUTHORIZED'});
 await assert.rejects(f.broker.options.execute({...f.identity,requestId:randomUUID(),tool:'media',operation:'fetch',sourceReceiptId:grant.sourceReceiptId}),{code:'MEDIA_NOT_AUTHORIZED'});assert.equal(f.requests.length,2);
});

test('concurrent direct broker searches reserve the single fixed page only once',async t=>{
 const f=await fixture(t),input={tool:'tikhub',operation:'douyin-search',id:'AI教程',...scope};
 const results=await Promise.allSettled([f.broker.options.execute({...f.identity,requestId:randomUUID(),...input}),f.broker.options.execute({...f.identity,requestId:randomUUID(),...input})]);
 assert.equal(results.filter(result=>result.status==='fulfilled').length,1);assert.equal(f.requests.length,1);assert.equal(f.library.readProduction().costs.length,1);
});

test('a journey research checkpoint accepts the registered JSON response hash and advances without a new service call',async t=>{
 const f=await fixture(t,{journey:true});await f.services.execute(f.identity,'prepare');await f.services.execute(f.identity,'collect',{operation:'douyin-search',id:'AI教程',...scope});await f.services.execute(f.identity,'derive-samples');
 const dataset=await f.services.execute(f.identity,'normalize-content',{rows:[{content_id:'123',title:'作品123',platform:'douyin',follower_count:1000,like_count:2000,direct_related:true,source_url:'https://www.douyin.com/video/123',collected_at:'2026-10-28T00:00:00.000Z'}],asOf:'2026-10-28T00:00:00.000Z'});await f.services.execute(f.identity,'save-dataset',dataset);await f.services.execute(f.identity,'freeze-findings');await f.services.execute(f.identity,'render-report');
 const advanced=f.library.mutateProduction('advanceJourney',{rootClaim:f.rootClaim,expectedJourneyRevision:1,expectedStepId:f.parent.journeyState.activeStepId},{mutationId:randomUUID()}),parent=advanced.tasks.find(task=>task.id===f.parent.id);assert.equal(parent.journeyState.revision,2);assert.equal(advanced.tasks.find(task=>task.id===parent.journeyState.activeTaskId).request.parameters.stage,'analysis-ai');assert.equal(f.requests.length,1);
});

test('a cancelled journey epoch cannot reuse its search evidence for new detail or cached download',async t=>{
 const f=await fixture(t,{journey:true});await f.services.execute(f.identity,'prepare');await f.services.execute(f.identity,'collect',{operation:'douyin-search',id:'AI教程',...scope});await f.services.execute(f.identity,'derive-samples');
 f.library.mutateProduction('cancelJourney',{journeyId:f.parent.id,expectedJourneyRevision:1,expectedToken:f.library.readProduction().editToken});
 await assert.rejects(f.services.execute(f.identity,'download',{videoId:'123'}),{code:'CLAIM_MISMATCH'});await assert.rejects(f.broker.options.execute({...f.identity,requestId:randomUUID(),tool:'tikhub',operation:'video',id:'123'}),{code:'CLAIM_MISMATCH'});assert.equal(f.requests.length,1);assert.equal(f.library.readProduction().costs.length,1);
});

test('new search policy requires exact bounded video scope and cannot acquire comments or caller-selected IDs',()=>{
 const config={version:1,researchId:'validation',outputDirectory:'调研报告库/validation',route:'topic',platform:'douyin',targetIds:['AI教程'],operations:['douyin-search','video'],maxRequests:3,comments:false,sampleDerivation:policy,searchScope:scope};
 for(const patch of [{sampleDerivation:{...policy,limit:0}},{sampleDerivation:{...policy,limit:4}},{sampleDerivation:{...policy,sourceOperation:'video'}},{sampleDerivation:{...policy,selection:'caller'}},{targetIds:['AI教程','其他词']},{videoIds:['999']},{route:'account'},{platform:'manual'},{searchScope:{...scope,cursor:'1'}},{searchScope:{...scope,search:{...scope.search,contentType:'image'}}},{operations:['douyin-search']},{operations:['douyin-search','video','comments']}])assert.throws(()=>validateResearchConfig({...config,...patch}),{code:'INVALID_INPUT'});
});

test('a policy in parameters never grants a tool missing from the immutable task request',async t=>{
 const f=await fixture(t,{permissions:[]});await f.services.execute(f.identity,'prepare');await assert.rejects(f.services.execute(f.identity,'collect',{operation:'douyin-search',id:'AI教程',...scope}),{code:'CLAIM_MISMATCH'});assert.equal(f.requests.length,0);assert.equal(f.library.readProduction().costs.length,0);
});

test('successful zero-cost cache receipts authorize samples but unknown outcomes never do',async t=>{
 const cached=await fixture(t,{charge:0});await cached.services.execute(cached.identity,'prepare');await cached.services.execute(cached.identity,'collect',{operation:'douyin-search',id:'AI教程',...scope});assert.deepEqual((await cached.services.execute(cached.identity,'derive-samples')).videoIds,['123','456','789']);assert.equal(cached.library.readProduction().costs[0].amount,0);
 const unknown=await fixture(t,{unknown:true});await unknown.services.execute(unknown.identity,'prepare');await unknown.services.execute(unknown.identity,'collect',{operation:'douyin-search',id:'AI教程',...scope});await assert.rejects(unknown.services.execute(unknown.identity,'derive-samples'),{code:'RESEARCH_RECEIPT_REQUIRED'});assert.equal(unknown.library.readProduction().costs[0].status,'unknown');await assert.rejects(unknown.broker.options.execute({...unknown.identity,requestId:randomUUID(),tool:'tikhub',operation:'video',id:'123'}),{code:'RESEARCH_OPERATION_FORBIDDEN'});assert.equal(unknown.requests.length,1);
});

test('the actual fixed CLI handoff uses the same registered evidence resolver through media archive',async t=>{
 const f=await fixture(t),args={envelope:{binding:f.binding,task:{taskId:f.task.id,attemptId:f.identity.attemptId,requestHash:f.task.requestHash},serviceDescriptorPath:'/unused/fixture'},library:f.library},run=(operation,input={})=>runResearchHandoff({...args,operation,payload:{claimToken:f.identity.claimToken,workerId:f.identity.workerId,input}},(_descriptor,request)=>f.execute(request));
 await run('prepare');await run('collect',{operation:'douyin-search',id:'AI教程',...scope});const samples=await run('derive-samples');assert.deepEqual(samples.videoIds,['123','456','789']);assert.equal((await run('download',{videoId:'123'})).videoId,'123');await assert.rejects(run('download',{videoId:'999'}),{code:'RESEARCH_TARGET_FORBIDDEN'});assert.equal(f.requests.length,2);
});

test('explicit continuation rebinds exact search and media evidence without copying grants, charges or permitting an extra sample',async t=>{
 const f=await fixture(t,{journey:true,budget:5});await f.services.execute(f.identity,'prepare');await f.services.execute(f.identity,'collect',{operation:'douyin-search',id:'AI教程',...scope});const samples=await f.services.execute(f.identity,'derive-samples'),media=await f.services.execute(f.identity,'download',{videoId:'123'}),costs=f.library.readProduction().costs.map(c=>c.id),challenge='r'.repeat(43);
 let snapshot=f.library.mutateProduction('prepareJourneyContinuation',{journeyId:f.parent.id,expectedJourneyRevision:1,expectedStepId:f.parent.journeyState.activeStepId,rootAttemptId:f.parent.activeAttemptId,childAttemptId:f.task.activeAttemptId,host:'workbuddy',challengeHash:createHash('sha256').update(challenge).digest('hex'),expectedToken:f.library.readProduction().editToken}),root=snapshot.tasks.find(t=>t.id===f.parent.id),child=snapshot.tasks.find(t=>t.id===root.journeyState.activeTaskId),owner={taskId:root.id,attemptId:root.activeAttemptId,host:'workbuddy',claimToken:randomUUID(),workerId:'continued-chat',expectedJourneyRevision:root.journeyState.revision,challenge};f.library.mutateProduction('claimJourneyContinuation',owner);
 const identity={taskId:child.id,attemptId:child.activeAttemptId,claimToken:randomUUID(),workerId:owner.workerId};f.library.mutateProduction('claimTask',{...identity,rootClaimToken:owner.claimToken});
 await assert.rejects(f.services.execute(identity,'derive-samples'),{code:'RESEARCH_RECEIPT_REQUIRED'});
 assert.throws(()=>f.library.mutateProduction('rebindJourneyEvidence',{taskId:identity.taskId,attemptId:identity.attemptId,claimToken:identity.claimToken,workerId:identity.workerId,sourceTaskId:f.parent.id,sourceAttemptId:f.rootClaim.attemptId}),{code:'EVIDENCE_UNAVAILABLE'});
 f.library.mutateProduction('rebindJourneyEvidence',{taskId:identity.taskId,attemptId:identity.attemptId,claimToken:identity.claimToken,workerId:identity.workerId,sourceTaskId:f.task.id,sourceAttemptId:f.identity.attemptId});
 assert.deepEqual((await f.services.execute(identity,'derive-samples')).videoIds,samples.videoIds);assert.equal((await f.services.execute(identity,'download',{videoId:'123'})).assetHash,media.assetHash);
 const asset=await executeProduction('productionAsset',{binding:f.binding,taskId:identity.taskId,attemptId:identity.attemptId,claimToken:identity.claimToken,workerId:identity.workerId,audioPath:media.assetHash},'disabled');assert.equal(createHash('sha256').update(asset.data).digest('hex'),media.assetHash);
 assert.deepEqual(f.library.readProduction().costs.map(c=>c.id),costs);assert.equal(f.library.readProductionContext(child.id).attempt.mediaGrants,undefined);assert.equal(f.requests.length,2);
 await assert.rejects(f.broker.options.execute({...identity,requestId:randomUUID(),tool:'tikhub',operation:'video',id:'999'}),{code:'RESEARCH_OPERATION_FORBIDDEN'});assert.equal(f.requests.length,2);
 const beforeCharge=f.requests.length;const another=await f.broker.options.execute({...identity,requestId:randomUUID(),tool:'tikhub',operation:'video',id:'456'});assert.equal(another.data.sourceReceipt.videoId,'456');assert.equal(f.requests.length,beforeCharge+1);assert.equal(f.library.readProduction().costs.filter(c=>c.taskId===child.id).length,1);
 const current=f.library.readProductionContext(child.id),raw=current.journeyEvidence.binding.files[0].relativePath;await fs.appendFile(path.join(f.vault,raw),' ');await assert.rejects(f.services.execute(identity,'derive-samples'),{code:'EVIDENCE_UNAVAILABLE'});assert.equal(f.requests.length,3);
});
