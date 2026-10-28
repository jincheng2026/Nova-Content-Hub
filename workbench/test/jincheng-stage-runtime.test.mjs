import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {createVault,createVaultDocument,readVaultTaskContext} from '../../plugin-src/src/lib/vault/index.mjs';
import {openLibrary} from '../../plugin-src/src/lib/file-library/index.mjs';
import {runWorkflowHandoff} from '../../plugin-src/src/commands/jincheng-workflow.mjs';
import {runCreationHandoff} from '../../plugin-src/src/commands/jincheng-creation.mjs';
import {executeStage} from '../src/main/stage-worker.mts';
import {readWorkFlow} from '../../plugin-src/src/lib/vault/workflow.mjs';
import {productionDesktopInput} from '../src/shared/production-validation.ts';
import {stageDesktopInput} from '../src/shared/stage-validation.ts';
import {researchBriefFromText} from '../src/shared/jincheng-research-brief.ts';
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'stage-runtime-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const binding=createVault(root),document=createVaultDocument(binding.root,{section:'drafts',title:'阶段集成',text:'作者资料'},{mutationId:randomUUID()}).document;const library=openLibrary(binding.root);library.listContents();return {root,binding,document,library};}
function task(f,stage,skill='jc-content-writer'){
 const task=f.library.mutateProduction('createTask',{kind:'writing',title:stage,prompt:'原位阶段',contentId:f.document.contentId,host:'codex',parameters:{workflow:'jincheng-stage',businessSkill:skill,stage,...(stage==='cover-design'?{coverDesignRatio:'3:4'}:{}),source:{documentId:readVaultTaskContext(f.binding.root,f.document.contentId).content.sourceDocumentId,hash:f.document.hash,relativePath:f.document.relativePath}},tools:[],budget:{amount:0,currency:'REQ'},bodyHash:f.library.readProductionCreation(f.document.contentId).content.bodyHash,expectedToken:f.library.readProduction().editToken}).tasks.at(-1),payload={claimToken:randomUUID(),workerId:'stage-tests',input:{}};f.library.mutateProduction('claimTask',{taskId:task.id,attemptId:task.activeAttemptId,claimToken:payload.claimToken,workerId:payload.workerId});return {envelope:{binding:f.binding,task:{taskId:task.id,attemptId:task.activeAttemptId,requestHash:task.requestHash}},library:f.library,payload};
}
function confirm(f,args,kind){const flow=runWorkflowHandoff({...args,operation:'read'}),a=flow.artifacts.filter(x=>x.kind===kind).at(-1);return executeStage('stageConfirm',{binding:f.binding,input:{contentId:f.document.contentId,kind,artifactId:a.artifactId,artifactHash:a.hash,expectedRevision:flow.revision,decision:'confirm',decisionText:'我确认此准确版本'}},'disabled');}
test('stage scope rejects fake author input, unrelated source and short URL guessing',()=>{
 assert.equal(stageDesktopInput('confirmJinchengCheckpoint',{contentId:randomUUID(),actor:'author'}),false);
 assert.throws(()=>researchBriefFromText('https://v.douyin.com/short','douyin'),/平台|完整/);
 assert.deepEqual(researchBriefFromText('https://www.douyin.com/video/123','douyin','comments'),{route:'comments',platform:'douyin',targetIds:['123'],videoIds:['123'],commentMode:'report'});
 assert.equal(productionDesktopInput('startProductionTask',{kind:'research',title:'研究',prompt:'资料',mode:'simple',comments:false,researchBrief:{route:'topic',platform:'manual',targetIds:['provided']}}),true);
});
test('author-first hides AI output until trusted author analysis; confirms exact versions and rejects after cancellation',async t=>{
 const f=fixture(t),args=task(f,'analysis-author','nova-workbench-writing-method');args.payload.input={kind:'analysis-comparison',text:'AI差异'};
 assert.throws(()=>runWorkflowHandoff({...args,operation:'artifact'}),{code:'AUTHOR_ANALYSIS_REQUIRED'});
 const ctx=readVaultTaskContext(f.binding.root,f.document.contentId),flow=readWorkFlow(f.root,{vaultId:ctx.vaultId,workId:ctx.content.tNumber});
 const saved=executeStage('stageAuthorAnalysis',{binding:f.binding,input:{contentId:f.document.contentId,text:'我的拆解与原句判断',expectedRevision:flow.revision}},'disabled');assert.equal(saved.workflow.facts.authorAnalysisConfirmed,true);
 const result=runWorkflowHandoff({...args,operation:'artifact'});assert.ok(result.artifactId);const decided=confirm(f,args,'analysis-comparison');assert.equal(decided.workflow.facts.analysisComparisonConfirmed,true);
 const artifact=decided.workflow.artifacts.at(-1);fs.writeFileSync(path.join(f.root,artifact.path),'外部变化');assert.equal(runWorkflowHandoff({...args,operation:'read'}).facts.analysisComparisonConfirmed,false);
 f.library.mutateProduction('cancelTask',{taskId:args.envelope.task.taskId,expectedToken:f.library.readProduction().editToken});assert.throws(()=>runWorkflowHandoff({...args,operation:'read'}),{code:'CLAIM_MISMATCH'});
});
test('ordinary writing builds original HTML from existing materials without tutorial checkpoints, and retains author protections',async t=>{
 const f=fixture(t),writing=task(f,'writing');writing.payload.input={data:{content_id:f.document.tNumber,type:'口播',stage:'写稿',title:'完整创作页',narrative:{story:'作者判断',audience:'创作者',problem:'读回问题'},segments:[{id:'seg-one',title:'开头',mine:'我的完整句子',refs:[{source_type:'说明',text:'已给资料'}]}]},mutationId:randomUUID()};
 const built=await runCreationHandoff({...writing,operation:'build'});assert.ok(built.pageId);
 writing.payload.input={};const read=await runCreationHandoff({...writing,operation:'read'});assert.equal(read.document.items.find(i=>i.id==='seg-one').fields.mine,'我的完整句子');assert.equal(read.buildData.segments[0].refs[0].text,'已给资料');
 const html=fs.readFileSync(path.join(f.root,read.document.source.relativePath),'utf8');assert.match(html,/<!--jc-app:start-->/);assert.match(html,/<!--jc-kit:start-->/);
 writing.payload.input={data:{...read.buildData,segments:read.buildData.segments.map(s=>({...s,mine:'偷偷覆盖'}))},expectedRevision:read.document.revision,mutationId:randomUUID()};await assert.rejects(runCreationHandoff({...writing,operation:'regenerate'}),{code:'AUTHOR_FIELD'});
});


const buildData=f=>({content_id:f.document.tNumber,type:'口播',stage:'写稿',title:'当前完整创作页',narrative:{story:'作者已给的判断',audience:'创作者',problem:'真实资料里的问题'},segments:[{id:'seg-one',title:'开头',mine:'基于作者资料的完整句子',refs:[{source_type:'说明',text:'作者已给资料'}]}]});
test('explicit tutorial requires exact narrative and key-segment confirmations before a complete HTML build',async t=>{
 const f=fixture(t),tutorial=task(f,'tutorial','jc-jiaocheng-video');tutorial.payload.input={data:buildData(f),mutationId:randomUUID()};
 const explicitMethod=task(f,'writing','jc-jiaocheng-video');explicitMethod.payload.input={data:buildData(f),mutationId:randomUUID()};await assert.rejects(runCreationHandoff({...explicitMethod,operation:'build'}),{code:'CHECKPOINT_REQUIRED'});
 await assert.rejects(runCreationHandoff({...tutorial,operation:'build'}),{code:'CHECKPOINT_REQUIRED'});
 const narrative=task(f,'narrative');narrative.payload.input={kind:'narrative',text:'已共创的叙事'};runWorkflowHandoff({...narrative,operation:'artifact'});
 await assert.rejects(runCreationHandoff({...tutorial,operation:'build'}),{code:'CHECKPOINT_REQUIRED'});
 confirm(f,narrative,'narrative');
 await assert.rejects(runCreationHandoff({...tutorial,operation:'build'}),{code:'CHECKPOINT_REQUIRED'});
 const key=task(f,'key-segment');key.payload.input={kind:'key-segments',text:'开头、关键段和结尾方向'};runWorkflowHandoff({...key,operation:'artifact'});
 await assert.rejects(runCreationHandoff({...tutorial,operation:'build'}),{code:'CHECKPOINT_REQUIRED'});
 confirm(f,key,'key-segments');assert.ok((await runCreationHandoff({...tutorial,operation:'build'})).pageId);
});
test('ordinary writing honors an explicitly started narrative and refuses its stale confirmation after the version changes',async t=>{
 const f=fixture(t),writing=task(f,'writing'),narrative=task(f,'narrative');writing.payload.input={data:buildData(f),mutationId:randomUUID()};narrative.payload.input={kind:'narrative',text:'第一版叙事'};
 runWorkflowHandoff({...narrative,operation:'artifact'});await assert.rejects(runCreationHandoff({...writing,operation:'build'}),{code:'CHECKPOINT_REQUIRED'});
 confirm(f,narrative,'narrative');const first=runWorkflowHandoff({...narrative,operation:'read'}).artifacts.find(a=>a.kind==='narrative');
 fs.writeFileSync(path.join(f.root,first.path),'已变化的叙事');await assert.rejects(runCreationHandoff({...writing,operation:'build'}),{code:'CHECKPOINT_REQUIRED'});
 narrative.payload.input={kind:'narrative',text:'第二版叙事'};runWorkflowHandoff({...narrative,operation:'artifact'});await assert.rejects(runCreationHandoff({...writing,operation:'build'}),{code:'CHECKPOINT_REQUIRED'});
 confirm(f,narrative,'narrative');assert.ok((await runCreationHandoff({...writing,operation:'build'})).pageId);
});

test('desktop start freezes explicit research scope, sample limit and budget; omitted scope is manual with zero tools',async t=>{
 const {DesktopController}=await import('../src/main/controller.mts'),{BindingStore}=await import('../src/main/bindings.mts'),{execute}=await import('../src/main/worker.mts'),{defaultServiceSettings}=await import('../src/shared/service-validation.ts');
 const f=fixture(t),settings={values:{...defaultServiceSettings(),budget:{enabled:true,maxRequestsPerTask:7}},credentials:{tikhub:{hasKey:false},model:{hasKey:false},asr:{hasKey:false}},encryptionAvailable:true};
 const controller=new DesktopController({store:new BindingStore(path.join(f.root,'binding-stage-test.json')),worker:{call:(op,args)=>execute(op,args,'disabled')},documents:f.root,dialogs:{destination:async()=>null,library:async()=>null},authMode:'disabled',productionCallbacks:{launch:async()=>{},open:async()=>'',serviceSettings:async()=>settings}});controller.covers.seed=async()=>{};await controller.initialize();await controller.persist({...controller.binding,current:f.binding});
 const first=await controller.startProductionTask({kind:'research',title:'指定账号调研',prompt:'只研究指定账号',mode:'simple',comments:false,workflow:'jincheng-stage',stage:'research',businessSkill:'jc-media-research',contentId:null,accountId:null,researchBrief:{route:'account',platform:'douyin',targetIds:['actual-author']}}),a=first.snapshot.tasks.at(-1);
 assert.equal(a.request.parameters.workflow,'jincheng-research');assert.deepEqual(a.request.parameters.researchRuntime.targetIds,['actual-author']);assert.equal(a.request.parameters.researchRuntime.sampleLimit,3);assert.equal(a.request.parameters.researchRuntime.maxRequests,7);assert.deepEqual(a.request.tools,['tikhub','asr','media']);assert.equal(a.request.budget.amount,7);
 const second=await controller.startProductionTask({kind:'research',title:'只读资料',prompt:'读我的材料',mode:'simple',comments:false}),b=second.snapshot.tasks.at(-1);assert.equal(b.request.parameters.researchRuntime.platform,'manual');assert.deepEqual(b.request.tools,[]);assert.equal(b.request.budget.amount,0);assert.equal(b.request.parameters.budgetEnabled,false);
 const accounts=f.library.mutateProduction('saveAccount',{name:'真实账号入口',platform:'抖音',url:'https://www.douyin.com/user/fixed-author',note:'',tags:[],images:[],reportIds:[],expectedToken:f.library.readProduction().editToken});const account=accounts.accounts.at(-1);const third=await controller.startProductionTask({kind:'analysis',title:'拆解账号',prompt:'只研究已选账号',businessSkill:'jc-media-research',accountId:account.id,mode:'simple',comments:false}),c=third.snapshot.tasks.at(-1);assert.equal(c.request.parameters.workflow,'jincheng-research');assert.deepEqual(c.request.parameters.researchRuntime.targetIds,['fixed-author']);
});

test('kepu enforces narrative/framework/each author segment/readthrough before original HTML, with exact replay and reopen gates',async t=>{
 const f=fixture(t),args=task(f,'kepu','jc-kepu-video');
 args.payload.input={kind:'narrative',text:'观众处境→本人经历→判断→一个行动'};runWorkflowHandoff({...args,operation:'artifact'});confirm(f,args,'narrative');
 const pin=kind=>{const a=runWorkflowHandoff({...args,operation:'read'}).artifacts.findLast(a=>a.kind===kind);return {artifactId:a.artifactId,hash:a.hash};};
 const framework={narrative:pin('narrative'),segments:[{id:'first',title:'开头',purpose:'从真实处境进入'},{id:'second',title:'结尾',purpose:'一个可执行动作'}],opening:'你遇到过这个问题吗？',ending:'今天试一次',duration:'4分钟'};
 const method=(kind,data,mutationId=randomUUID())=>{args.payload.input={kind,data,mutationId};return runWorkflowHandoff({...args,operation:'method'});};
 const fr=method('framework',framework);assert.equal(method('framework',framework,fr.artifactId).replayed,true);
 const data={framework:pin('framework'),index:0,title:'开头',authorSpeech:'我遇到这个问题',text:'我遇到这个问题。',additions:[],references:[{who:'甲',text:'原话',sourceText:'原话',time:'00:01',patterns:['5 先演后命名']},{who:'乙',text:'例子',sourceText:'例子',time:'00:02',patterns:['9 细节']}],checks:{continuity:'独立开头',repetition:'无重复',facts:'未涉价格',bannedWords:'已查'},suggestion:'缺少动作，由作者定'};
 assert.throws(()=>method('kepu-segment',data),{code:'CHECKPOINT_REQUIRED'});confirm(f,args,'framework');
 assert.throws(()=>method('kepu-segment',{...data,index:1,title:'结尾'}),{code:'CHECKPOINT_REQUIRED'});
 method('kepu-segment',data);assert.throws(()=>method('kepu-segment',{...data,index:1,title:'结尾'}),{code:'CHECKPOINT_REQUIRED'});confirm(f,args,'kepu-segment');const first=pin('kepu-segment');
 method('kepu-segment',{...data,index:1,title:'结尾',text:'今天试一次。',previous:first});confirm(f,args,'kepu-segment');const second=pin('kepu-segment');
 const flowBeforeReopen=runWorkflowHandoff({...args,operation:'read'});executeStage('stageConfirm',{binding:f.binding,input:{contentId:f.document.contentId,kind:'kepu-segment',artifactId:first.artifactId,artifactHash:first.hash,expectedRevision:flowBeforeReopen.revision,decision:'reopen',decisionText:'重开第一段'}},'disabled');
 assert.throws(()=>method('kepu-readthrough',{framework:pin('framework'),segments:[first,second],checks:'全篇检查',accurateNotes:'准确说法',changeLog:'AI归纳'}),{code:'CHECKPOINT_REQUIRED'});
 const flowBeforeConfirm=runWorkflowHandoff({...args,operation:'read'});executeStage('stageConfirm',{binding:f.binding,input:{contentId:f.document.contentId,kind:'kepu-segment',artifactId:first.artifactId,artifactHash:first.hash,expectedRevision:flowBeforeConfirm.revision,decision:'confirm',decisionText:'重新确认第一段'}},'disabled');
 assert.throws(()=>method('kepu-readthrough',{framework:pin('framework'),segments:[first,second],checks:'全篇检查',accurateNotes:'准确说法',changeLog:'AI归纳'}),{code:'CHECKPOINT_REQUIRED'});
 method('kepu-segment',{...data,index:1,title:'结尾',text:'今天试一次。',previous:first});confirm(f,args,'kepu-segment');const rebuiltSecond=pin('kepu-segment');
 method('kepu-readthrough',{framework:pin('framework'),segments:[first,rebuiltSecond],checks:'全篇承接、重复、独立开头、结尾动作、禁用词与字数核对',accurateNotes:'后台准确说法',changeLog:'AI归纳：本人逐段决定保留'});
 args.payload.input={data:{...buildData(f),type:'AI科普',segments:[{id:'first',title:'开头',mine:'我遇到这个问题。'},{id:'second',title:'结尾',mine:'今天试一次。'}]},mutationId:randomUUID()};
 await assert.rejects(runCreationHandoff({...args,operation:'build'}),{code:'CHECKPOINT_REQUIRED'});confirm(f,args,'kepu-readthrough');assert.ok((await runCreationHandoff({...args,operation:'build'})).pageId);args.payload.input={};const originalPage=await runCreationHandoff({...args,operation:'read'});for(const segment of originalPage.buildData.segments){assert.equal(segment.refs.length,2);assert.deepEqual(segment.refs.map(r=>[r.who,r.time,r.text,r.source_type]),data.references.map(r=>[r.who,r.time,r.text,'口播原话']));assert.deepEqual(segment.refs.map(r=>r.source_sha256),data.references.map(r=>createHash('sha256').update(r.sourceText).digest('hex')));}
 args.payload.input={mutationId:randomUUID(),expectedRevision:originalPage.document.revision,data:{...originalPage.buildData,segments:originalPage.buildData.segments.map(s=>({...s,refs:[{source_type:'说明',text:'偷偷替换确认参考'}]}))}};await runCreationHandoff({...args,operation:'regenerate'});args.payload.input={};const regenerated=await runCreationHandoff({...args,operation:'read'});assert.deepEqual(regenerated.buildData.segments[0].refs,originalPage.buildData.segments[0].refs);
});

test('review creates one editable supporting page while preserving exact manuscript and current source; existing page gets CAS suggestions',async t=>{
 const f=fixture(t),args=task(f,'review-page','jc-review-page'),ctx=readVaultTaskContext(f.binding.root,f.document.contentId),original=fs.readFileSync(path.join(f.root,ctx.content.relativePath),'utf8');
 const spec={title:'原稿审定',original,changes:[{old:'作者资料',new:'作者自己的资料',verdict:'optional',reasons:[{type:'ai',text:'由本人判断'}]}]};
 args.payload.input={mutationId:randomUUID(),expectedRevision:ctx.content.hash,spec};const built=await runCreationHandoff({...args,operation:'review'});assert.ok(built.pageId);assert.deepEqual(await runCreationHandoff({...args,operation:'review'}),built);assert.equal(fs.readFileSync(path.join(f.root,ctx.content.relativePath),'utf8'),original);
 const next=readVaultTaskContext(f.binding.root,f.document.contentId);assert.equal(next.content.sourceDocumentId,ctx.content.sourceDocumentId);assert.equal(next.content.creationDocuments.length,1);
 args.payload.input={};const read=await runCreationHandoff({...args,operation:'read'});assert.equal(read.buildData.segments[0].mine,original);
 args.payload.input={mutationId:randomUUID(),expectedRevision:read.document.revision,spec:{...spec,changes:[{...spec.changes[0],new:'新的候选'}]}};await runCreationHandoff({...args,operation:'review'});
 await assert.rejects(runCreationHandoff({...args,operation:'review',payload:{...args.payload,input:{...args.payload.input,mutationId:randomUUID()}}}),{code:'CONFLICT'});
 assert.equal(readVaultTaskContext(f.binding.root,f.document.contentId).content.creationDocuments.length,1);
});

test('synthesis works without T and freezes readable report/source ledger under the claimed attempt; cancellation invalidates old claim',t=>{
 const f=fixture(t),brief={depth:'orientation',question:'如何辨别来源',purpose:'会前发言',timeBoundary:'当前',scopeBoundary:'本次提供材料'};
 const task=f.library.mutateProduction('createTask',{kind:'research',title:'综合调研',prompt:'综合材料',contentId:null,host:'codex',parameters:{workflow:'jincheng-stage',stage:'synthesis',businessSkill:'jc-synthesis-research',synthesisBrief:brief},tools:[],budget:{amount:0,currency:'REQ'},expectedToken:f.library.readProduction().editToken}).tasks.at(-1),payload={claimToken:randomUUID(),workerId:'synthesis-test',input:{}};
 f.library.mutateProduction('claimTask',{taskId:task.id,attemptId:task.activeAttemptId,claimToken:payload.claimToken,workerId:payload.workerId});const args={envelope:{binding:f.binding,task:{taskId:task.id,attemptId:task.activeAttemptId,requestHash:task.requestHash}},library:f.library,payload};
 const text='一手材料原文',report={title:'来源判断',sections:Object.fromEntries(['conclusions','elevator','understanding','debates','judgment','next','consensus','misconceptions','oneMinute'].map(k=>[k,'有依据的综合判断 '+k])),claims:[{kind:'fact',text:'这是一手材料',sourceIds:['s1']}],sources:[{id:'s1',title:'原材料',text,accessedAt:'2026-10-28',sha256:createHash('sha256').update(text).digest('hex')}],externalVerification:'provided-materials-only'};
 assert.equal(f.library.readProductionContext(task.id,task.activeAttemptId).attempt.claimToken,payload.claimToken);assert.equal(f.library.readProductionContext(task.id,task.activeAttemptId).task.request.parameters.workflow,'jincheng-stage');
 payload.input={kind:'synthesis-report',data:report,mutationId:randomUUID()};const out=runWorkflowHandoff({...args,operation:'method'});assert.equal(out.files.length,3);for(const file of out.files)assert.equal(createHash('sha256').update(fs.readFileSync(path.join(f.root,file.path))).digest('hex'),file.sha256);assert.match(out.text,/## References/);const again=f.library.readProductionContext(task.id,task.activeAttemptId);assert.equal(again.task.requestHash,args.envelope.task.requestHash,'requestHash');assert.equal(again.task.activeAttemptId,args.envelope.task.attemptId,'attemptId');assert.equal(again.attempt.status,'claimed','status');assert.equal(again.attempt.claimToken,payload.claimToken,'claim');assert.equal(again.attempt.workerId,payload.workerId,'worker');assert.deepEqual(runWorkflowHandoff({...args,operation:'method'}),out);
 f.library.mutateProduction('cancelTask',{taskId:task.id,expectedToken:f.library.readProduction().editToken});assert.throws(()=>runWorkflowHandoff({...args,operation:'method'}),{code:'CLAIM_MISMATCH'});
});

test('cover design remains a writing candidate until exact author confirmation; waits resume and cancelled/retried identities stay invalid',async t=>{
 const {readConfirmedCoverDesign}=await import('../../plugin-src/src/lib/method-adapters/runtime.mjs');
 const f=fixture(t),args=task(f,'cover-design','jc-cover-design'),design={title:'原文标题',style:'纸媒教程',visualProposition:'人物托着流程图',caseId:'example-9',preserve:['标题在上','人物托举','纸面图谱'],replace:['替换产品'],exclude:['他人身份'],specification:'3:4，标题在上，左下人物托着完整纸面流程图。',evidence:['用户提供的产品证据'],identity:'none',ratio:'3:4'};
 args.payload.input={mutationId:randomUUID(),kind:'cover-design',data:{...design,ratio:'16:9'}};assert.throws(()=>runWorkflowHandoff({...args,operation:'method'}),{code:'FROZEN_RATIO_MISMATCH'});
 args.payload.input={mutationId:randomUUID(),kind:'cover-design',data:design};const saved=runWorkflowHandoff({...args,operation:'method'}),work={vaultId:readVaultTaskContext(f.binding.root,f.document.contentId).vaultId,workId:f.document.tNumber};const selected={work,artifactId:saved.artifactId,artifactHash:saved.hash};
 assert.throws(()=>readConfirmedCoverDesign(f.root,selected),{code:'CHECKPOINT_REQUIRED'});confirm(f,args,'cover-design');const resolvedDesign=readConfirmedCoverDesign(f.root,selected);assert.equal(resolvedDesign.title,'原文标题');assert.doesNotMatch(resolvedDesign.prompt,/原文标题/);assert.match(resolvedDesign.prompt,/固定.*coverText\/title/);
 for(const status of ['waiting-user','waiting-permission','claimed']){f.library.mutateProduction('progressTask',{taskId:args.envelope.task.taskId,attemptId:args.envelope.task.attemptId,claimToken:args.payload.claimToken,workerId:args.payload.workerId,status,progress:10,message:'真实等待状态及恢复'});assert.equal(runWorkflowHandoff({...args,operation:'method'}).replayed,true);}
 const flow=runWorkflowHandoff({...args,operation:'read'});executeStage('stageConfirm',{binding:f.binding,input:{contentId:f.document.contentId,kind:'cover-design',artifactId:saved.artifactId,artifactHash:saved.hash,expectedRevision:flow.revision,decision:'reopen',decisionText:'这版重新讨论'}},'disabled');assert.throws(()=>readConfirmedCoverDesign(f.root,selected),{code:'CHECKPOINT_REQUIRED'});
 f.library.mutateProduction('retryTask',{taskId:args.envelope.task.taskId,host:'workbuddy',expectedToken:f.library.readProduction().editToken});assert.throws(()=>runWorkflowHandoff({...args,operation:'method'}),{code:'CLAIM_MISMATCH'});
});

test('review-page generic suggest cannot bypass author confirmation or nine reason types',async t=>{
 const f=fixture(t),review=task(f,'review-page','jc-review-page'),ctx=readVaultTaskContext(f.binding.root,f.document.contentId),manuscript=fs.readFileSync(path.join(f.root,ctx.content.relativePath),'utf8');review.payload.input={mutationId:randomUUID(),expectedRevision:ctx.content.hash,spec:{title:'审稿',original:manuscript,changes:[{old:'作者资料',new:'已有建议',verdict:'optional',reasons:[{type:'ai',text:'初始候选'}]}]}};await runCreationHandoff({...review,operation:'review'});review.payload.input={};const current=await runCreationHandoff({...review,operation:'read'}),original=current.buildData.segments[0].mine;
 const suggestion={segment:'review-original',category:'表达',source:'AI',original,proposed:'AI自定改法',reason:'助手自己说作者确认',basis:{type:'AI 自己的判断',text:'AI判断'},verdict:'已定要改'};
 review.payload.input={expectedRevision:current.document.revision,mutationId:randomUUID(),suggestion};
 await assert.rejects(runCreationHandoff({...review,operation:'suggest'}),{code:'AUTHOR_CONFIRMATION_REQUIRED'});
 review.payload.input={...review.payload.input,mutationId:randomUUID(),suggestion:{...suggestion,verdict:'待你定'}};
 await assert.rejects(runCreationHandoff({...review,operation:'suggest'}),{code:'REASON_REQUIRED'});
 review.payload.input={...review.payload.input,mutationId:randomUUID(),suggestion:{...suggestion,verdict:'待你定',locked:{reviewReasons:[{type:'ai',text:'AI自己的候选，由作者决定'}]}}};
 await runCreationHandoff({...review,operation:'suggest'});review.payload.input={};const after=await runCreationHandoff({...review,operation:'read'});assert.equal(after.buildData.segments[0].mine,original);assert.equal(after.buildData.suggestions.length,2);assert.equal(after.buildData.suggestions[0].verdict,'待你定');assert.equal(after.buildData.suggestions[0].locked.reviewReasons[0].type,'ai');

});

test('registered current jc-doc uses its own writable protocol for ordinary revision suggestions',async t=>{
 const f=fixture(t),writing=task(f,'writing');writing.payload.input={data:buildData(f),mutationId:randomUUID()};await runCreationHandoff({...writing,operation:'build'});
 const revision=task(f,'revision','nova-workbench-writing-method');revision.payload.input={};const current=await runCreationHandoff({...revision,operation:'read'});assert.equal(current.document.writable,true);
 revision.payload.input={expectedRevision:current.document.revision,mutationId:randomUUID(),suggestion:{segment:'seg-one',category:'表达',source:'AI',original:current.buildData.segments[0].mine,proposed:'普通改稿建议',reason:'原普通能力',basis:{type:'AI 自己的判断',text:'候选'},verdict:'待你定'}};assert.ok(await runCreationHandoff({...revision,operation:'suggest'}));
});

test('existing review page can replay the same acknowledged mutation after response loss without duplicating suggestions',async t=>{
 const f=fixture(t),args=task(f,'review-page','jc-review-page'),ctx=readVaultTaskContext(f.binding.root,f.document.contentId),original=fs.readFileSync(path.join(f.root,ctx.content.relativePath),'utf8');
 const spec={title:'审稿',original,changes:[{old:'作者资料',new:'初版',verdict:'optional',reasons:[{type:'ai',text:'候选'}]}]};args.payload.input={mutationId:randomUUID(),expectedRevision:ctx.content.hash,spec};await runCreationHandoff({...args,operation:'review'});args.payload.input={};const current=await runCreationHandoff({...args,operation:'read'});
 args.payload.input={mutationId:randomUUID(),expectedRevision:current.document.revision,spec:{...spec,changes:[{...spec.changes[0],new:'下一版候选'}]}};const saved=await runCreationHandoff({...args,operation:'review'});assert.deepEqual(await runCreationHandoff({...args,operation:'review'}),saved);
});

test('review-page never guesses a historical HTML when no current jc-doc or fixed review entry is selected',async t=>{
 const {assembleCreationData,renderCreationHtml}=await import('../../plugin-src/src/lib/creation-document/index.mjs'),f=fixture(t),ctx=readVaultTaskContext(f.binding.root,f.document.contentId);fs.mkdirSync(path.join(f.root,ctx.contentDirectory,'助手任务'),{recursive:true});
 for(const name of ['旧稿A','旧稿B']){const {raw}=assembleCreationData({...buildData(f),title:name});fs.writeFileSync(path.join(f.root,ctx.contentDirectory,'助手任务',name+'.html'),renderCreationHtml(raw));}
 const args=task(f,'review-page','jc-review-page');args.payload.input={};await assert.rejects(runCreationHandoff({...args,operation:'read'}),{code:'SOURCE_SELECTION_REQUIRED'});
});
