import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {randomUUID,createHash} from 'node:crypto';
import {createLibrary,openLibrary,__testing} from '../index.mjs';
import {validRadarQuery,normalizeRadarCandidate,normalizeDouyinRadar,radarArtifactCandidates,renderRadarReport,radarPrompt} from '../radar.mjs';
import {collectRadar} from '../radar-collector.mjs';
process.env.NODE_ENV='test';
const query={platform:'抖音',direction:'测试方向',sampleLimit:3,maxFollowers:5000,minLikes:100,minRatio:1,lookbackDays:7};
const at='2026-10-27T00:00:00.000Z';
const evidence=(id='123')=>({platform:query.platform,sourceId:id,url:`https://www.douyin.com/video/${id}`,title:'<script>alert(1)</script>',author:{id:'sec-test',name:'作者',followers:10},metrics:{likes:200},publishedAt:'2026-10-26T00:00:00.000Z',evidence:['真实来源 & 缺口']});
function fixture(t){const parent=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'nova-radar-'));t.after(()=>{__testing.setHook(undefined);fs.rmSync(parent,{recursive:true,force:true});});return {root:path.join(parent,'lib'),l:createLibrary(path.join(parent,'lib'))};}
const mutate=(l,op,input={},options)=>l.mutateProduction(op,{expectedToken:l.readProduction().editToken,...input},options);
function accepted(l,id='123',host='codex',fixed=query,candidates=[evidence(id)],sourceTimeVersion){
 const task=mutate(l,'createTask',{kind:'research',title:'雷达',prompt:'雷达',host,parameters:{workflow:'viral-radar',query:fixed},tools:[],budget:{amount:0,currency:'REQ'}}).tasks.at(-1);
 const identity={taskId:task.id,attemptId:task.activeAttemptId,claimToken:randomUUID(),workerId:'test'};l.mutateProduction('claimTask',identity);
 const p=l.mutateProduction('submitTask',{...identity,result:{summary:'来源证据',artifacts:[{id:randomUUID(),kind:'research',title:'雷达',text:'首屏',assetHash:null,data:{radar:{schemaVersion:1,...(sourceTimeVersion===undefined?{}:{sourceTimeVersion}),query:fixed,collectedAt:at,candidates}}}]}}),a=p.tasks.at(-1).attempts[0];
 mutate(l,'acceptTask',{taskId:task.id,attemptId:a.id,receiptHash:a.receipt.sha256});return {taskId:task.id,attemptId:a.id,receiptHash:a.receipt.sha256};
}
test('radar unknown metrics stay null; ratios require positive followers; date and threshold checks deterministic',()=>{
 assert(validRadarQuery(query));assert(!validRadarQuery({...query,sampleLimit:101}));
 const c=normalizeRadarCandidate({...evidence(),author:{followers:''},metrics:{likes:'200',comments:null},publishedAt:null},query,at);
 assert.equal(c.author.followers,null);assert.equal(c.metrics.comments,null);assert.equal(c.metrics.likeFollowerRatio,null);assert.equal(c.eligibility,'unknown');
 assert.equal(normalizeRadarCandidate({...evidence(),author:{followers:0}},query,at).metrics.likeFollowerRatio,null);
 assert.equal(normalizeRadarCandidate(evidence(),query,at).eligibility,'qualified');
 assert.equal(normalizeRadarCandidate({...evidence(),author:{followers:6000}},query,at).eligibility,'unqualified');
 const normalized=normalizeDouyinRadar({data:{business_data:[{data:{aweme_info:{aweme_id:'123',desc:'来源',author:{nickname:'作者',sec_uid:'sec-test'},statistics:{digg_count:200},create_time:1792972800}}}]}},query,at,{'sec-test':10});
 assert.equal(normalized[0].author.followers,10);assert.equal(normalized[0].sourceKey,'douyin:123');
});
for(const host of ['codex','workbuddy'])test(`${host}: accepted receipt produces durable escaped report, empty topic with references and cross-batch source dedupe`,t=>{
 const {l,root}=fixture(t),receipt=accepted(l,'123',host);const task=l.readProduction().tasks[0];
 assert.throws(()=>radarArtifactCandidates(task,receipt.attemptId,'0'.repeat(64)),{code:'ATTEMPT_INACTIVE'});
 let p=mutate(l,'adoptRadarResult',receipt),r=p.reports[0],c=r.meta.radar.candidates[0];assert.equal(p.reports.length,1);
 const html=l.readAsset(r.pages[0].assetHash).data.toString('utf8');assert.match(html,/&lt;script&gt;/);assert(!html.includes('<script>'));
 p=mutate(l,'adoptRadarResult',receipt);assert.equal(p.reports.length,1);
 p=mutate(l,'decideRadarCandidate',{reportId:r.id,candidateId:c.id,decision:'add-topic'});const topic=p.reports[0].meta.radar.candidates[0].topicId;assert.equal(l.readContent(topic).body,'');assert.equal(p.creations[0].references[0].url,c.url);
 assert.equal(p.creations[0].tNumber,'T001');
 const receipt2=accepted(l,'123',host);p=mutate(l,'adoptRadarResult',receipt2);r=p.reports[1];p=mutate(l,'decideRadarCandidate',{reportId:r.id,candidateId:r.meta.radar.candidates[0].id,decision:'add-topic'});
 assert.equal(p.creations.length,1);assert.equal(p.reports[1].meta.radar.candidates[0].topicId,topic);assert.equal(openLibrary(root).readProduction().creations.length,1);
 assert.throws(()=>mutate(l,'saveReport',{id:r.id,title:'tamper',type:'viral-radar',pages:r.pages,meta:r.meta}),{code:'INVALID_INPUT'});
});
test('accepted query comparisons tolerate key order while retaining exact field values and full receipt integrity',t=>{
 const {l}=fixture(t),receipt=accepted(l),task=structuredClone(l.readProduction().tasks[0]),a=task.attempts[0],radar=a.result.artifacts[0].data.radar;
 radar.query=Object.fromEntries(Object.entries(radar.query).reverse());
 const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');a.receipt.resultHash=hash(a.result);a.receipt.sha256=hash({taskId:task.id,attemptId:a.id,requestHash:task.requestHash,resultHash:a.receipt.resultHash});
 assert.equal(radarArtifactCandidates(task,a.id,a.receipt.sha256).query.direction,query.direction);
 assert.match(renderRadarReport(radarArtifactCandidates(task,a.id,a.receipt.sha256)),/来源由助手回传，经人工验收；字段事实仍须核验/);
 radar.query.direction='changed';a.receipt.resultHash=hash(a.result);a.receipt.sha256=hash({taskId:task.id,attemptId:a.id,requestHash:task.requestHash,resultHash:a.receipt.resultHash});assert.throws(()=>radarArtifactCandidates(task,a.id,a.receipt.sha256),{code:'INVALID_INPUT'});
});
test('forged/mismatched artifacts are refused; a rejected candidate cannot become a topic',t=>{
 const {l}=fixture(t),receipt=accepted(l);const task=l.readProduction().tasks[0],forged=structuredClone(task);forged.attempts[0].result.artifacts[0].data.radar.query.direction='different';assert.throws(()=>radarArtifactCandidates(forged,receipt.attemptId,receipt.receiptHash),{code:'INVALID_INPUT'});
 let p=mutate(l,'adoptRadarResult',receipt),r=p.reports[0];p=mutate(l,'decideRadarCandidate',{reportId:r.id,candidateId:r.meta.radar.candidates[0].id,decision:'reject'});assert.equal(p.reports[0].meta.radar.candidates[0].decision,'rejected');assert.throws(()=>mutate(l,'decideRadarCandidate',{reportId:r.id,candidateId:r.meta.radar.candidates[0].id,decision:'add-topic'}),{code:'INVALID_INPUT'});assert.equal(l.listContents().length,0);
});
test('ordinary manual reports and assistant report artifacts cannot inject radar type or reserved metadata',t=>{
 const {l,root}=fixture(t),file=path.join(path.dirname(root),'report.html');fs.writeFileSync(file,'<!doctype html><html><body>ordinary report</body></html>');const asset=l.importAsset(file,{purpose:'production-report'});
 for(const data of [{type:'viral-radar',meta:{}},{type:'调研',meta:{radar:{candidates:[]}}}])assert.throws(()=>mutate(l,'saveReport',{title:'forged',...data,pages:[{title:'report',assetHash:asset.assetHash}]}),{code:'INVALID_INPUT'});
 const task=mutate(l,'createTask',{kind:'research',title:'普通研究',prompt:'普通研究'}).tasks[0],identity={taskId:task.id,attemptId:task.activeAttemptId,claimToken:randomUUID(),workerId:'test'};l.mutateProduction('claimTask',identity);
 for(const data of [{type:'viral-radar',meta:{}},{type:'调研',meta:{radar:{candidates:[]}}}])assert.throws(()=>l.mutateProduction('submitTask',{...identity,result:{summary:'forged report',artifacts:[{id:randomUUID(),kind:'report',title:'forged report',text:'evidence',assetHash:asset.assetHash,data}]}}),{code:'INVALID_INPUT'});
 assert.equal(l.readProduction().reports.length,0);assert.equal(l.readProduction().tasks[0].attempts[0].status,'claimed');
});
test('interruption after child topic publication recovers the exact source without duplicates',t=>{
 const {l,root}=fixture(t),receipt=accepted(l);const r=mutate(l,'adoptRadarResult',receipt).reports[0],mutationId=randomUUID(),input={reportId:r.id,candidateId:r.meta.radar.candidates[0].id,decision:'add-topic',expectedToken:l.readProduction().editToken};let fired=false;
 __testing.setHook(e=>{if(e.phase==='afterJournal'&&!fired){fired=true;throw new Error('interrupted child');}});
 assert.throws(()=>l.mutateProduction('decideRadarCandidate',input,{mutationId}));__testing.setHook(undefined);
 const reopened=openLibrary(root);mutate(reopened,'recordKnowledge',{text:'无关任务进展',source:'并发工作区更新'});assert.throws(()=>reopened.mutateProduction('decideRadarCandidate',{...input,expectedToken:reopened.readProduction().editToken},{mutationId:randomUUID()}),{code:'INVALID_INPUT'});const oldCreation=reopened.readContent(reopened.listContents()[0].id);reopened.updateContent(oldCreation.id,{body:'中断后用户编辑的正文'},oldCreation.editToken);reopened.mutateProduction('decideRadarCandidate',input,{mutationId});reopened.mutateProduction('decideRadarCandidate',input,{mutationId});assert.equal(reopened.readProduction().knowledge.length,1);assert.equal(reopened.readContent(oldCreation.id).body,'中断后用户编辑的正文');assert.equal(reopened.queryMutation(mutationId).objectKind,'workspace');assert.equal(reopened.listContents().length,1);assert.equal(reopened.readProduction().creations.length,1);
});
test('child recovery keeps a subsequently registered creation and its user narrative while attaching the source',t=>{
 const {l,root}=fixture(t),receipt=accepted(l),r=mutate(l,'adoptRadarResult',receipt).reports[0],mutationId=randomUUID();
 const input={reportId:r.id,candidateId:r.meta.radar.candidates[0].id,decision:'add-topic',expectedToken:l.readProduction().editToken};let fired=false;
 __testing.setHook(e=>{if(e.phase==='afterJournal'&&!fired){fired=true;throw new Error('interrupted child');}});
 assert.throws(()=>l.mutateProduction('decideRadarCandidate',input,{mutationId}));__testing.setHook(undefined);
 const reopened=openLibrary(root),contentId=reopened.listContents()[0].id;mutate(reopened,'ensureCreation',{contentId});
 const state=reopened.readProductionCreation(contentId),userReference={id:randomUUID(),url:'https://example.com/user-reference',title:'用户自己的参考',platform:'人工',originalText:'原始材料',correctedText:'',segments:[],corrections:[],analysis:'用户分析',mediaAssetHash:null,subtitleAssetHash:null};
 mutate(reopened,'saveCreation',{contentId,expectedContentToken:state.content.editToken,patch:{narrative:'用户中断后编辑的叙事',analysis:'用户中断后编辑的分析',references:[userReference]}});
 reopened.mutateProduction('decideRadarCandidate',input,{mutationId});reopened.mutateProduction('decideRadarCandidate',input,{mutationId});
 const after=reopened.readProductionCreation(contentId);assert.equal(after.creation.narrative,'用户中断后编辑的叙事');assert.equal(after.creation.analysis,'用户中断后编辑的分析');assert.deepEqual(after.creation.references.find(x=>x.id===userReference.id),userReference);assert.equal(after.creation.references.filter(x=>x.url==='https://www.douyin.com/video/123').length,1);assert.equal(after.content.body,'');assert.equal(reopened.readProduction().creations.length,1);assert.equal(reopened.queryMutation(mutationId).objectKind,'workspace');
});
test('rejected sources retain their decision in later batches and parent publication interruption replays once',t=>{
 const {l,root}=fixture(t),first=accepted(l,'repeat');let r=mutate(l,'adoptRadarResult',first).reports[0];mutate(l,'decideRadarCandidate',{reportId:r.id,candidateId:r.meta.radar.candidates[0].id,decision:'reject'});
 const second=accepted(l,'repeat');r=mutate(l,'adoptRadarResult',second).reports[1];assert.equal(r.meta.radar.candidates[0].decision,'rejected');
 const third=accepted(l,'parent');r=mutate(l,'adoptRadarResult',third).reports[2];const mutationId=randomUUID(),input={reportId:r.id,candidateId:r.meta.radar.candidates[0].id,decision:'add-topic',expectedToken:l.readProduction().editToken};let count=0;
 __testing.setHook(e=>{if(e.phase==='afterJournal'&&++count===2)throw new Error('interrupted parent');});assert.throws(()=>l.mutateProduction('decideRadarCandidate',input,{mutationId}));__testing.setHook(undefined);
 const reopened=openLibrary(root);reopened.mutateProduction('decideRadarCandidate',input,{mutationId});assert.equal(reopened.listContents().length,1);assert.equal(reopened.readProduction().creations.length,1);assert.equal(reopened.queryMutation(mutationId).objectKind,'workspace');
});
test('collector uses one search and at most three missing-author profiles, no model/comments/retry',async()=>{
 const calls=[],raw={data:{business_data:[1,2,3,4].map(n=>({data:{aweme_info:{aweme_id:String(n),desc:'标题',author:{sec_uid:`sec-${n}`},statistics:{digg_count:100},create_time:1792972800}}}))}};
 const data=await collectRadar({query,identity:{},descriptorPath:'/unused',maxRequests:4},async(_d,r)=>{calls.push(r);return {data:r.operation==='douyin-search'?raw:{data:{user:{follower_count:10}}},requestsUsed:1,collectedAt:at,cacheHit:false};});
 const partial=await collectRadar({query,identity:{},descriptorPath:'/unused',maxRequests:4},async(_d,r)=>{if(r.operation==='profile')throw Object.assign(new Error('unknown'),{code:'COST_UNKNOWN'});return {data:raw,requestsUsed:1,collectedAt:at,cacheHit:false};});assert.equal(partial.candidates.length,3);assert.equal(partial.candidates[0].author.followers,null);assert.equal(partial.collection.stoppedReason,'COST_UNKNOWN');assert.equal(partial.collection.calls.length,2);assert.equal(partial.collection.partial,true);
 assert.equal(calls.length,4);assert.equal(calls[0].search.sortType,'likes');assert.deepEqual(calls.map(c=>c.operation),['douyin-search','profile','profile','profile']);assert.equal(data.candidates.length,3);
 await assert.rejects(collectRadar({query:{...query,platform:'YouTube'},identity:{},descriptorPath:'/unused'},()=>assert.fail('must not invoke')),{code:'RADAR_MANUAL_ONLY'});
 let count=0;await assert.rejects(collectRadar({query,identity:{},descriptorPath:'/unused'},async()=>{count++;throw Object.assign(new Error('timeout'),{code:'COST_UNKNOWN'});}),{code:'COST_UNKNOWN'});assert.equal(count,1);
});


test('multi-platform radar accepts custom bounded samples/days and preserves candidate platform identity',()=>{
 const multi={...query,platforms:['抖音','小红书'],sampleLimit:12,lookbackDays:730};
 assert.equal(validRadarQuery(multi),true);
 for(const patch of [{platforms:[]},{platforms:['小红书','抖音']},{platforms:['抖音','抖音']},{sampleLimit:1.5},{sampleLimit:101},{lookbackDays:3651}])assert.equal(validRadarQuery({...multi,...patch}),false);
 const red=normalizeRadarCandidate({...evidence('same'),platform:'小红书',url:'https://www.xiaohongshu.com/explore/same'},multi,at);
 const douyin=normalizeRadarCandidate(evidence('same'),multi,at);
 assert.equal(red.platform,'小红书');assert.equal(red.sourceKey,'xiaohongshu:same');assert.notEqual(red.id,douyin.id);
 assert.throws(()=>normalizeRadarCandidate({...evidence(),platform:'YouTube'},multi,at),{code:'INVALID_INPUT'});
});

test('multi-platform collection samples custom counts within four requests and declares manual platform gaps',async()=>{
 const multi={...query,platform:'YouTube',platforms:['YouTube','抖音'],sampleLimit:8,lookbackDays:730},calls=[];
 const raw={data:{business_data:Array.from({length:10},(_,n)=>({data:{aweme_info:{aweme_id:String(n),author:{sec_uid:`sec-${n}`},statistics:{digg_count:200}}}}))}};
 const result=await collectRadar({query:multi,identity:{},descriptorPath:'/unused',maxRequests:4},async(_d,r)=>{calls.push(r);return {data:r.operation==='douyin-search'?raw:{data:{user:{follower_count:10}}},requestsUsed:1,collectedAt:at,cacheHit:false};});
 assert.deepEqual(result.query,multi);assert.equal(result.candidates.length,8);assert.equal(calls.length,4);assert(result.candidates.every(c=>c.platform==='抖音'));
 assert.deepEqual(result.collection.manualPlatforms,['YouTube']);assert.equal(result.collection.partial,true);
});


test('multi-platform receipt keeps exact frozen selections and separates same IDs across platforms',t=>{
 const {l}=fixture(t),multi={...query,platforms:['抖音','小红书'],sampleLimit:12,lookbackDays:730};
 const receipt=accepted(l,'same','codex',multi,[evidence('same'),{...evidence('same'),platform:'小红书',url:'https://www.xiaohongshu.com/explore/same'}]);
 const report=mutate(l,'adoptRadarResult',receipt).reports[0].meta.radar;
 assert.deepEqual(report.query,multi);assert.equal(report.candidates.length,2);assert.equal(new Set(report.candidates.map(c=>c.sourceKey)).size,2);
 const task=structuredClone(l.readProduction().tasks[0]),a=task.attempts[0],radar=a.result.artifacts[0].data.radar;
 const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
 const seal=()=>{a.receipt.resultHash=hash(a.result);a.receipt.sha256=hash({taskId:task.id,attemptId:a.id,requestHash:task.requestHash,resultHash:a.receipt.resultHash});};
 radar.query.platforms=['小红书','抖音'];seal();assert.throws(()=>radarArtifactCandidates(task,a.id,a.receipt.sha256),{code:'INVALID_INPUT'});
 radar.query=multi;radar.candidates[1].platform='YouTube';seal();assert.throws(()=>radarArtifactCandidates(task,a.id,a.receipt.sha256),{code:'INVALID_INPUT'});
});


test('legacy frozen single-platform queries keep whitespace-compatible acceptance',t=>{
 const {l}=fixture(t),legacy={...query,platform:' 抖音 '};
 assert.equal(validRadarQuery(legacy),true);assert.equal(validRadarQuery({...legacy,platforms:[' 抖音 ']}),false);
 const receipt=accepted(l,'legacy','codex',legacy,[{...evidence('legacy'),platform:' 抖音 '}]);
 const report=mutate(l,'adoptRadarResult',receipt).reports[0].meta.radar;
 assert.deepEqual(report.query,legacy);assert.equal(report.candidates[0].sourceKey,'douyin:legacy');
});


test('accepted artifacts retain per-source evidence times while legacy candidates use the report timestamp',t=>{
 const {l}=fixture(t),oldAt='2026-10-25T00:00:00.000Z';
 const receipt=accepted(l,'source-time','codex',query,[{...evidence('source-time'),collectedAt:oldAt,publishedAt:'2026-10-24T00:00:00.000Z'}],1);
 let report=mutate(l,'adoptRadarResult',receipt).reports[0];
 assert.equal(report.meta.radar.collectedAt,at);assert.equal(report.meta.radar.candidates[0].collectedAt,oldAt);
 const c=report.meta.radar.candidates[0];mutate(l,'decideRadarCandidate',{reportId:report.id,candidateId:c.id,decision:'reject'});
 const later=accepted(l,'source-time');report=mutate(l,'adoptRadarResult',later).reports[1];
 assert.equal(report.meta.radar.candidates[0].collectedAt,at);assert.equal(report.meta.radar.candidates[0].decision,'rejected');
 const task=structuredClone(l.readProduction().tasks[0]),a=task.attempts[0],radar=a.result.artifacts[0].data.radar;
 const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
 for(const invalid of [null,'not-a-time','2026-10-28T00:00:00.000Z']){
  radar.candidates[0].collectedAt=invalid;a.receipt.resultHash=hash(a.result);a.receipt.sha256=hash({taskId:task.id,attemptId:a.id,requestHash:task.requestHash,resultHash:a.receipt.resultHash});
  assert.throws(()=>radarArtifactCandidates(task,a.id,a.receipt.sha256),{code:'INVALID_INPUT'});
 }
});


test('legacy artifacts with an explicit old source time retain their historical report-time interpretation',t=>{
 const {l}=fixture(t),receipt=accepted(l,'legacy-time','codex',query,[{...evidence('legacy-time'),collectedAt:'2026-10-20T00:00:00.000Z'}]);
 const report=mutate(l,'adoptRadarResult',receipt).reports[0];
 assert.equal(report.meta.radar.candidates[0].collectedAt,at);
 assert.equal(openLibrary(l.info.root).readProduction().reports[0].type,'viral-radar');
 mutate(l,'decideRadarCandidate',{reportId:report.id,candidateId:report.meta.radar.candidates[0].id,decision:'reject'});
 assert.equal(l.readProduction().reports[0].meta.radar.candidates[0].decision,'rejected');
});


test('optional evidence angle is normalized without adding a field to legacy candidates',()=>{
 const legacy=normalizeRadarCandidate(evidence(),query,at);
 assert.equal(Object.hasOwn(legacy,'angle'),false);
 for(const angle of [undefined,null,'','  \n ',12,{text:'无依据'}]){
  const candidate=normalizeRadarCandidate({...evidence(),angle},query,at);
  assert.equal(Object.hasOwn(candidate,'angle'),false);assert.deepEqual(candidate,legacy);
 }
 const angle=normalizeRadarCandidate({...evidence(),angle:'  用真实案例对比两种工具的适用条件  '},query,at);
 assert.equal(angle.angle,'用真实案例对比两种工具的适用条件');
 assert.equal(normalizeRadarCandidate({...evidence(),angle:'甲'.repeat(2100)},query,at).angle.length,2000);
 assert.match(radarPrompt(query),/可选 angle/);assert.match(radarPrompt(query),/没有依据可留空或省略/);
});

test('accepted evidence angles survive receipt adoption and reopening while legacy trust stays unchanged',t=>{
 const {l,root}=fixture(t),angle='只借鉴问题与操作步骤的对应结构，效果需另行验证';
 const receipt=accepted(l,'angle','codex',query,[{...evidence('angle'),angle}]);
 const report=mutate(l,'adoptRadarResult',receipt).reports[0];
 assert.equal(report.meta.radar.candidates[0].angle,angle);
 assert.equal(openLibrary(root).readProduction().reports[0].meta.radar.candidates[0].angle,angle);
 const after=mutate(l,'decideRadarCandidate',{reportId:report.id,candidateId:report.meta.radar.candidates[0].id,decision:'add-topic'});
 const topicId=after.reports[0].meta.radar.candidates[0].topicId,creation=openLibrary(root).readProductionCreation(topicId);
 assert(creation.creation.references.some(reference=>reference.url==='https://www.douyin.com/video/angle'&&reference.analysis.includes(`可借鉴角度：${angle}`)));
 assert.equal(creation.content.body,'');
 const legacyReceipt=accepted(l,'legacy-angle');const legacyReport=mutate(l,'adoptRadarResult',legacyReceipt).reports[1];
 assert.equal(Object.hasOwn(legacyReport.meta.radar.candidates[0],'angle'),false);
 const reopened=openLibrary(root);assert.equal(reopened.readProduction().reports[1].type,'viral-radar');
 mutate(reopened,'decideRadarCandidate',{reportId:legacyReport.id,candidateId:legacyReport.meta.radar.candidates[0].id,decision:'reject'});
 assert.equal(reopened.readProduction().reports[1].meta.radar.candidates[0].decision,'rejected');
});
