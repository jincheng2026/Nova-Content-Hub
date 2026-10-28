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
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'stage-runtime-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const binding=createVault(root),document=createVaultDocument(binding.root,{section:'drafts',title:'阶段集成',text:'作者资料'},{mutationId:randomUUID()}).document;const library=openLibrary(binding.root);library.listContents();return {root,binding,document,library};}
function task(f,stage,skill='jc-content-writer'){
 const task=f.library.mutateProduction('createTask',{kind:'writing',title:stage,prompt:'原位阶段',contentId:f.document.contentId,host:'codex',parameters:{workflow:'jincheng-stage',businessSkill:skill,stage,...(stage==='cover-design'?{coverDesignRatio:'3:4'}:{}),source:{documentId:readVaultTaskContext(f.binding.root,f.document.contentId).content.sourceDocumentId,hash:f.document.hash,relativePath:f.document.relativePath}},tools:[],budget:{amount:0,currency:'REQ'},bodyHash:f.library.readProductionCreation(f.document.contentId).content.bodyHash,expectedToken:f.library.readProduction().editToken}).tasks.at(-1),payload={claimToken:randomUUID(),workerId:'stage-tests',input:{}};f.library.mutateProduction('claimTask',{taskId:task.id,attemptId:task.activeAttemptId,claimToken:payload.claimToken,workerId:payload.workerId});return {envelope:{binding:f.binding,task:{taskId:task.id,attemptId:task.activeAttemptId,requestHash:task.requestHash}},library:f.library,payload};
}
function confirm(f,args,kind){const flow=runWorkflowHandoff({...args,operation:'read'}),a=flow.artifacts.filter(x=>x.kind===kind).at(-1);return executeStage('stageConfirm',{binding:f.binding,input:{contentId:f.document.contentId,kind,artifactId:a.artifactId,artifactHash:a.hash,expectedRevision:flow.revision,decision:'confirm',decisionText:'我确认此准确版本'}},'disabled');}

const buildData=f=>({content_id:f.document.tNumber,type:'口播',stage:'写稿',title:'当前完整创作页',narrative:{story:'作者已给的判断',audience:'创作者',problem:'真实资料里的问题'},segments:[{id:'seg-one',title:'开头',mine:'基于作者资料的完整句子',refs:[{source_type:'说明',text:'作者已给资料'}]}]});
function prepared(t){
 const f=fixture(t),args=task(f,'kepu','jc-kepu-video');
 args.payload.input={kind:'narrative',text:'观众处境→本人经历→判断→一个行动'};runWorkflowHandoff({...args,operation:'artifact'});confirm(f,args,'narrative');
 const pin=kind=>{const a=runWorkflowHandoff({...args,operation:'read'}).artifacts.findLast(a=>a.kind===kind);return {artifactId:a.artifactId,hash:a.hash};};
 const framework={narrative:pin('narrative'),segments:[{id:'first',title:'开头',purpose:'从真实处境进入'},{id:'second',title:'结尾',purpose:'一个可执行动作'}],opening:'你遇到过这个问题吗？',ending:'今天试一次',duration:'4分钟'};
 const method=(kind,data,mutationId=randomUUID())=>{args.payload.input={kind,data,mutationId};return runWorkflowHandoff({...args,operation:'method'});};
 method('framework',framework);confirm(f,args,'framework');
 const data={framework:pin('framework'),index:0,title:'开头',authorSpeech:'我遇到这个问题',text:'我遇到这个问题。',additions:[],references:[{who:'甲',text:'原话',sourceText:'原话',time:'00:01',patterns:['5 先演后命名']},{who:'乙',text:'例子',sourceText:'例子',time:'00:02',patterns:['9 细节']}],checks:{continuity:'独立开头',repetition:'无重复',facts:'未涉价格',bannedWords:'已查'},suggestion:'缺少动作，由作者定'};

 method('kepu-segment',data);confirm(f,args,'kepu-segment');const first=pin('kepu-segment');
 method('kepu-segment',{...data,index:1,title:'结尾',text:'今天试一次。',previous:first});confirm(f,args,'kepu-segment');const second=pin('kepu-segment');
 method('kepu-readthrough',{framework:pin('framework'),segments:[first,second],checks:'全篇承接、重复、独立开头、结尾动作、禁用词与字数核对',accurateNotes:'后台准确说法',changeLog:'AI归纳：本人逐段决定保留'});
 args.payload.input={data:{...buildData(f),type:'AI科普',segments:[{id:'first',title:'开头',mine:'我遇到这个问题。'},{id:'second',title:'结尾',mine:'今天试一次。'}]},mutationId:randomUUID()};

confirm(f,args,'kepu-readthrough');

return {f,args};
}

for(const failureName of ['叙事与框架.md','后台准确说法.md','创作过程.json'])test('kepu build recovers same frozen request after EIO at '+failureName,async t=>{
 const {f,args}=prepared(t),input=structuredClone(args.payload.input);
 const originalRename=fs.renameSync;
 fs.renameSync=function(from,to){if(String(to).endsWith('/'+failureName))throw Object.assign(Error('injected companion EIO'),{code:'EIO'});return originalRename.apply(this,arguments);};
 try{await assert.rejects(runCreationHandoff({...args,operation:'build'}),{code:'EIO'});}finally{fs.renameSync=originalRename;}
 const flow=readWorkFlow(f.root,{vaultId:readVaultTaskContext(f.binding.root,f.document.contentId).vaultId,workId:f.document.tNumber}),first=flow.artifacts.filter(a=>a.kind==='complete-draft');assert.equal(first.length,failureName==='创作过程.json'?0:1);
 const pagePath=path.join(f.root,readVaultTaskContext(f.binding.root,f.document.contentId).contentDirectory,'创作页.html'),pageBytes=fs.readFileSync(pagePath);
 const result=await runCreationHandoff({...args,operation:'build'});
 assert.equal(result.companions.length,4);for(const output of result.companions)assert.equal(createHash('sha256').update(fs.readFileSync(path.join(f.root,output.path))).digest('hex'),output.sha256);
 assert.deepEqual(fs.readFileSync(pagePath),pageBytes);assert.equal(runWorkflowHandoff({...args,operation:'read'}).artifacts.filter(a=>a.kind==='complete-draft').length,1);
 assert.deepEqual(await runCreationHandoff({...args,operation:'build'}),result);
 args.payload.input={...input,data:{...input.data,title:'另一项输入'}};await assert.rejects(runCreationHandoff({...args,operation:'build'}),{code:'CONFLICT'});
 args.payload.input={...input,mutationId:randomUUID()};await assert.rejects(runCreationHandoff({...args,operation:'build'}),{code:'ALREADY_EXISTS'});
 args.payload.input=input;
 fs.appendFileSync(pagePath,'作者手改');await assert.rejects(runCreationHandoff({...args,operation:'build'}),{code:'CONFLICT'});assert.match(fs.readFileSync(pagePath,'utf8'),/作者手改$/);
});
for(const changed of ['source','confirmation','companion','artifact'])test('kepu pending build refuses changed '+changed,async t=>{
 const {f,args}=prepared(t),originalRename=fs.renameSync;
 fs.renameSync=function(from,to){if(String(to).endsWith('/后台准确说法.md'))throw Object.assign(Error('injected companion EIO'),{code:'EIO'});return originalRename.apply(this,arguments);};
 try{await assert.rejects(runCreationHandoff({...args,operation:'build'}),{code:'EIO'});}finally{fs.renameSync=originalRename;}
 const flow=runWorkflowHandoff({...args,operation:'read'}),readthrough=flow.artifacts.findLast(a=>a.kind==='kepu-readthrough'),base=path.join(f.root,readVaultTaskContext(f.binding.root,f.document.contentId).contentDirectory,'助手任务/科普过程-'+readthrough.artifactId);
 if(changed==='source')fs.appendFileSync(path.join(f.root,f.document.relativePath),'作者手改');
 if(changed==='confirmation')confirm(f,args,'kepu-readthrough');
 if(changed==='companion')fs.appendFileSync(path.join(base,'逐字稿.md'),'作者手改');
 if(changed==='artifact')fs.appendFileSync(path.join(f.root,readthrough.path),'变化');
 await assert.rejects(runCreationHandoff({...args,operation:'build'}),{code:'CONFLICT'});assert.equal(fs.existsSync(path.join(base,'后台准确说法.md')),false);assert.equal(runWorkflowHandoff({...args,operation:'read'}).artifacts.filter(a=>a.kind==='complete-draft').length,1);
});
