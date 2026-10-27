import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
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
 const task=f.library.mutateProduction('createTask',{kind:'writing',title:stage,prompt:'原位阶段',contentId:f.document.contentId,host:'codex',parameters:{workflow:'jincheng-stage',businessSkill:skill,stage,source:{documentId:readVaultTaskContext(f.binding.root,f.document.contentId).content.sourceDocumentId,hash:f.document.hash,relativePath:f.document.relativePath}},tools:[],budget:{amount:0,currency:'REQ'},bodyHash:f.library.readProductionCreation(f.document.contentId).content.bodyHash,expectedToken:f.library.readProduction().editToken}).tasks.at(-1),payload={claimToken:randomUUID(),workerId:'stage-tests',input:{}};f.library.mutateProduction('claimTask',{taskId:task.id,attemptId:task.activeAttemptId,claimToken:payload.claimToken,workerId:payload.workerId});return {envelope:{binding:f.binding,task:{taskId:task.id,attemptId:task.activeAttemptId,requestHash:task.requestHash}},library:f.library,payload};
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
