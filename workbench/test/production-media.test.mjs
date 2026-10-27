import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {createLibrary} from '../../plugin-src/src/lib/file-library/index.mjs';
import {productionFetchMedia} from '../../plugin-src/src/lib/service-tools/production-media.mjs';
import {productionAsr} from '../../plugin-src/src/lib/service-tools/production-asr.mjs';
import {serviceToolRequest} from '../src/shared/service-validation.ts';
import {productionToolBroker} from '../src/main/production-services.mts';
import {defaultServiceSettings} from '../src/shared/service-validation.ts';
import {executeProduction} from '../src/main/production-worker.mts';
const media={version:1,maxDownloads:3,maxBytes:67108864};
const sha='1'.repeat(64);
async function fixture(t,{authorized=true,kind='writing'}={}){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'nova-media-contract-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const l=createLibrary(path.join(root,'library')),c=l.createContent({title:'media contract',body:'原正文'}),mutate=(op,input)=>l.mutateProduction(op,{...input,expectedToken:l.readProduction().editToken});
 mutate('ensureCreation',{contentId:c.id});
 const task=mutate('createTask',{kind,title:'media contract',prompt:'fixture',contentId:c.id,host:'codex',parameters:{workflow:'content-creation',budgetEnabled:true,...(authorized?{media}:{}),serviceConfig:{asr:{mode:'local-only',localEngine:'qwen3-asr'}}},tools:authorized?['tikhub','media','asr']:['tikhub','asr'],budget:{amount:10,currency:'REQ'},bodyHash:l.readProductionCreation(c.id).content.bodyHash}).tasks[0];
 const identity={taskId:task.id,attemptId:task.activeAttemptId,claimToken:randomUUID(),workerId:'media-contract'},binding={root:l.info.root,libraryId:l.info.libraryId,rootIdentity:l.info.rootIdentity};mutate('claimTask',identity);
 const wav=Buffer.alloc(44);wav.write('RIFF');wav.write('WAVE',8);const file=path.join(root,'fixture.wav');await fs.writeFile(file,wav);const asset=l.importAsset(file,{purpose:'production-reference'});
 const source={sourceReceiptId:randomUUID(),sourceRequestId:randomUUID(),requestHash:task.requestHash,videoId:'12345',canonicalUrl:'https://www.douyin.com/video/12345',responseHash:sha};
 const sourceCost=(value=source)=>{l.mutateProduction('reserveCost',{...identity,requestId:value.sourceRequestId,service:'tikhub',usage:{requests:1}});l.mutateProduction('recordCost',{...identity,requestId:value.sourceRequestId,status:'measured',amount:1,usage:{ok:true,operation:'video',id:value.videoId,...value}});};
 const register=(value=source)=>l.mutateProduction('registerMediaGrant',{...identity,requestId:randomUUID(),...value,assetHash:asset.assetHash});
 return{l,c,task,identity,binding,asset,source,sourceCost,register,context:()=>l.readProductionContext(task.id),envelope:{task:{taskId:task.id,attemptId:task.activeAttemptId},serviceDescriptorPath:'/synthetic/broker.json'}};
}
test('media wire schema accepts only receipt identity, never URLs, hashes, paths or client reference IDs',()=>{
 const request={taskId:randomUUID(),attemptId:randomUUID(),claimToken:randomUUID(),workerId:'worker',requestId:randomUUID(),tool:'media',operation:'fetch',sourceReceiptId:randomUUID()};
 assert.equal(serviceToolRequest(request),true);
 for(const key of ['url','path','assetHash','referenceId'])assert.equal(serviceToolRequest({...request,[key]:'untrusted'}),false);
 assert.equal(serviceToolRequest({...request,sourceReceiptId:sha}),false);
});
test('grant needs frozen authorization and settled source proof; replay preserves server reference and costs',async t=>{
 const f=await fixture(t);assert.throws(()=>f.register(),/source receipt/);f.sourceCost();f.register();const first=f.context().attempt.mediaGrants[0];f.register();
 assert.equal(f.context().attempt.mediaGrants.length,1);assert.equal(f.context().attempt.mediaGrants[0].referenceId,first.referenceId);assert.equal(f.context().snapshot.costs.length,1);assert.equal(f.context().creation.references.length,0);
 const legacy=await fixture(t,{authorized:false});legacy.sourceCost();assert.throws(()=>legacy.register(),/not authorized/);
});
test('grant limit and exact reference ownership block unrelated assets and expire after terminal state',async t=>{
 const f=await fixture(t);f.sourceCost();f.register();const grant=f.context().attempt.mediaGrants[0];
 for(let n=0;n<2;n++){const source={...f.source,sourceReceiptId:randomUUID(),sourceRequestId:randomUUID()};f.sourceCost(source);f.register(source);}
 const extra={...f.source,sourceReceiptId:randomUUID(),sourceRequestId:randomUUID()};f.sourceCost(extra);assert.throws(()=>f.register(extra),/limit/);
 const reference={id:grant.referenceId,url:grant.canonicalUrl,title:'fixture',platform:'抖音',originalText:'真实接口结果',correctedText:'',segments:[],corrections:[],analysis:'',mediaAssetHash:grant.assetHash,subtitleAssetHash:null},artifact={id:randomUUID(),kind:'transcript',title:'fixture',text:'',assetHash:null,data:{references:[reference]}};
 assert.throws(()=>f.l.mutateProduction('submitTask',{...f.identity,result:{summary:'fixture',artifacts:[{...artifact,data:{references:[{...reference,id:randomUUID()}]}}]}}),/exact attempt grant/);
 assert.throws(()=>f.l.mutateProduction('submitTask',{...f.identity,result:{summary:'fixture',artifacts:[{...artifact,data:{references:[{...reference,subtitleAssetHash:grant.assetHash}]}}]}}),/subtitles/);
 await executeProduction('productionAsset',{binding:f.binding,...f.identity,audioPath:grant.assetHash},'disabled');
 f.l.mutateProduction('submitTask',{...f.identity,result:{summary:'fixture',artifacts:[artifact]}});
 await assert.rejects(executeProduction('productionAsset',{binding:f.binding,...f.identity,audioPath:grant.assetHash},'disabled'),{code:'CLAIM_MISMATCH'});
 assert.equal(f.context().creation.references.length,0);assert.equal(f.context().attempt.mediaGrants.length,3);
});
test('fetch-media derives receipt requests, rejects shortlinks, and recovers existing grant without TikHub',async t=>{
 const f=await fixture(t),calls=[],receipt={id:f.source.sourceReceiptId,videoId:f.source.videoId,canonicalUrl:f.source.canonicalUrl,responseHash:sha},mock=async(_descriptor,request)=>{calls.push(request);return{data:request.tool==='tikhub'?{sourceReceipt:receipt}:{referenceId:randomUUID()}};};
 await assert.rejects(productionFetchMedia({envelope:f.envelope,context:f.context(),payload:{claimToken:f.identity.claimToken,workerId:f.identity.workerId,url:'https://v.douyin.com/short'}},mock),{code:'CANONICAL_DOUYIN_URL_REQUIRED'});
 const payload={claimToken:f.identity.claimToken,workerId:f.identity.workerId,url:f.source.canonicalUrl};await productionFetchMedia({envelope:f.envelope,context:f.context(),payload},mock);
 assert.deepEqual(calls.map(c=>c.tool),['tikhub','media']);assert.equal(calls[1].sourceReceiptId,receipt.id);assert.equal('url' in calls[1],false);
 f.sourceCost();f.register();calls.length=0;await productionFetchMedia({envelope:f.envelope,context:f.context(),payload},mock);assert.deepEqual(calls.map(c=>c.tool),['media']);
});
test('ASR derives candidate reference from current grant without changing creation',async t=>{
 const f=await fixture(t);f.sourceCost();f.register();const grant=f.context().attempt.mediaGrants[0],calls=[];
 const result=await productionAsr({envelope:f.envelope,context:f.context(),payload:{claimToken:f.identity.claimToken,workerId:f.identity.workerId,referenceId:grant.referenceId}},async(_descriptor,request)=>{calls.push(request);return{data:{text:'真实响应',segments:[]}};});
 assert.equal(result.reference.mediaAssetHash,grant.assetHash);assert.equal(result.reference.platform,'抖音');assert.equal(result.reference.url,grant.canonicalUrl);assert.equal(calls[0].allowCloud,false);assert.equal(f.context().creation.references.length,0);
});

test('video source summary never exposes download URLs and settles missing/mismatched media once',async t=>{
 const f=await fixture(t),settings={...defaultServiceSettings(),budget:{enabled:true,maxRequestsPerTask:10}},data=[{data:{aweme_detail:{aweme_id:'12345',desc:'title',video:{play_addr:{url_list:['https://cdn.example.invalid/private-download']}}}}},{data:{aweme_detail:{aweme_id:'999',video:{play_addr:{url_list:['https://cdn.example.invalid/other']}}}}},undefined];
 const tools={settings:{read:()=>({values:settings}),secret:()=> 'test-only-key'},execute:async(_request,hooks)=>{await hooks.beforeExecute({service:'tikhub',requests:1});await hooks.afterExecute({service:'tikhub',requestsUsed:1,ok:true});return{data:data.shift(),service:'tikhub',requestsUsed:1,collectedAt:new Date().toISOString(),cacheHit:false};}};
 const broker=productionToolBroker({current:()=>f.binding,worker:{call:(op,args)=>executeProduction(op,args,'disabled')}},tools,'/unused/test-descriptor');
 const call=()=>broker.options.execute({...f.identity,requestId:randomUUID(),tool:'tikhub',operation:'video',id:'12345'});
 const first=await call();assert.equal(first.data.sourceReceipt.videoId,'12345');assert.equal(JSON.stringify(first).includes('private-download'),false);assert.equal(first.data.title,'title');
 for(let i=0;i<2;i++){const result=await call();assert.equal(result.data.mediaUnavailable,true);assert.equal('sourceReceipt' in result.data,false);}
 assert.equal(f.context().snapshot.costs.length,3);assert(f.context().snapshot.costs.every(c=>c.status==='measured'&&c.amount===1));
});

async function reportAsset(f){const file=path.join(path.dirname(f.binding.root),'report.html');await fs.writeFile(file,'<!doctype html><html><body>Legitimate report</body></html>');return f.l.importAsset(file,{purpose:'production-report'}).assetHash;}
const referenceFor=(assetHash,id=randomUUID())=>({id,url:'https://www.douyin.com/video/12345',title:'other source',platform:'抖音',originalText:'source evidence',correctedText:'',segments:[],corrections:[],analysis:'',mediaAssetHash:assetHash,subtitleAssetHash:null});
async function otherCreation(f,reference){const c=f.l.createContent({title:'other content',body:'other body'});f.l.mutateProduction('ensureCreation',{contentId:c.id,expectedToken:f.l.readProduction().editToken});if(reference){const state=f.l.readProductionCreation(c.id);f.l.mutateProduction('saveCreation',{contentId:c.id,expectedToken:f.l.readProduction().editToken,expectedContentToken:state.content.editToken,patch:{references:[reference]}});}return c;}
test('report references cannot borrow media or subtitles registered to another content',async t=>{
 const f=await fixture(t,{kind:'research'}),reference=referenceFor(f.asset.assetHash),other=await otherCreation(f,reference),html=await reportAsset(f);
 const artifact={id:randomUUID(),kind:'report',title:'valid report',text:'valid report',assetHash:html,data:{references:[reference]}};
 assert.throws(()=>f.l.mutateProduction('submitTask',{...f.identity,result:{summary:'report',artifacts:[artifact]}}),/exact attempt grant/);
 assert.throws(()=>f.l.mutateProduction('submitTask',{...f.identity,result:{summary:'report',artifacts:[{...artifact,data:{references:[{...reference,mediaAssetHash:null,subtitleAssetHash:f.asset.assetHash}]}}]}}),/subtitles/);
 assert.equal(f.context().attempt.status,'claimed');assert.equal(f.context().snapshot.reports.length,0);assert.equal(f.l.readProductionCreation(other.id).creation.references[0].mediaAssetHash,f.asset.assetHash);
});
for(const kind of ['report','research'])test(`legacy accepted ${kind} cannot authorize another content's media at adoption`,async t=>{
 const f=await fixture(t,{kind:'research'}),stolen=referenceFor(f.asset.assetHash),target=await otherCreation(f,stolen),artifact={id:randomUUID(),kind,title:'accepted legacy evidence',text:'legacy evidence',assetHash:kind==='report'?await reportAsset(f):null,data:{references:[{...stolen,mediaAssetHash:null}]}};
 f.l.mutateProduction('submitTask',{...f.identity,result:{summary:'legacy fixture',artifacts:[artifact]}});const receipt=f.context().attempt.receipt;
 f.l.mutateProduction('acceptTask',{taskId:f.task.id,attemptId:f.identity.attemptId,receiptHash:receipt.sha256,expectedToken:f.l.readProduction().editToken});
 // Model metadata persisted by an older version that did not enforce source ownership.
 const filename=path.join(f.binding.root,'库配置','default','配置.json'),meta=JSON.parse(await fs.readFile(filename,'utf8')),task=meta.production.tasks.find(t=>t.id===f.task.id),attempt=task.attempts[0];
 attempt.result.artifacts[0].data.references[0].mediaAssetHash=f.asset.assetHash;
 const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');attempt.receipt.resultHash=hash(attempt.result);const {sha256,...identity}=attempt.receipt;attempt.receipt.sha256=hash(identity);await fs.writeFile(filename,JSON.stringify(meta));
 assert.throws(()=>f.l.mutateProduction('adoptResearchReferences',{contentId:target.id,taskId:task.id,attemptId:attempt.id,receiptHash:attempt.receipt.sha256,artifactId:artifact.id,expectedToken:f.l.readProduction().editToken,expectedContentToken:f.l.readProductionCreation(target.id).content.editToken}),/exact attempt grant/);
 assert.equal(f.l.readProductionCreation(target.id).creation.adoptions?.length??0,0);
});
test('accepted report retains exact attempt grant as evidence for manual research adoption',async t=>{
 const f=await fixture(t,{kind:'research'});f.sourceCost();f.register();const grant=f.context().attempt.mediaGrants[0],target=await otherCreation(f),reference=referenceFor(grant.assetHash,grant.referenceId),artifact={id:randomUUID(),kind:'report',title:'grant-backed report',text:'report',assetHash:await reportAsset(f),data:{references:[reference]}};
 f.l.mutateProduction('submitTask',{...f.identity,result:{summary:'report',artifacts:[artifact]}});const receiptHash=f.context().attempt.receipt.sha256;
 f.l.mutateProduction('acceptTask',{taskId:f.task.id,attemptId:f.identity.attemptId,receiptHash,expectedToken:f.l.readProduction().editToken});
 f.l.mutateProduction('adoptResearchReferences',{contentId:target.id,taskId:f.task.id,attemptId:f.identity.attemptId,receiptHash,artifactId:artifact.id,expectedToken:f.l.readProduction().editToken,expectedContentToken:f.l.readProductionCreation(target.id).content.editToken});
 assert.equal(f.l.readProductionCreation(target.id).creation.references[0].mediaAssetHash,grant.assetHash);
 await assert.rejects(executeProduction('productionAsset',{binding:f.binding,...f.identity,audioPath:grant.assetHash},'disabled'),{code:'CLAIM_MISMATCH'});
});
