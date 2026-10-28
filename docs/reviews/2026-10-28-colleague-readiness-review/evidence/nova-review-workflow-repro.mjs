import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
const repo='/Users/mac/code/dashboard/Nova-Content-Hub';
const {createVault,createVaultDocument,readVaultTaskContext}=await import(`${repo}/plugin-src/src/lib/vault/index.mjs`);
const {openLibrary}=await import(`${repo}/plugin-src/src/lib/file-library/index.mjs`);
const {runWorkflowHandoff}=await import(`${repo}/plugin-src/src/commands/jincheng-workflow.mjs`);
const {runCreationHandoff}=await import(`${repo}/plugin-src/src/commands/jincheng-creation.mjs`);
const {createResearchRuntime}=await import(`${repo}/plugin-src/src/lib/research-runtime/index.mjs`);
const output={at:new Date().toISOString(),sourceHashes:{},probes:[]};
for(const file of ['plugin-src/src/lib/research-runtime/index.mjs','plugin-src/src/lib/research-runtime/common.mjs','plugin-src/src/lib/file-library/production.mjs','plugin-src/src/commands/jincheng-creation.mjs'])output.sourceHashes[file]=createHash('sha256').update(fs.readFileSync(`${repo}/${file}`)).digest('hex');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'nova-workflow-review-repro-'));
try {
 fs.mkdirSync(path.join(root,'vault'));const binding=createVault(path.join(root,'vault'));
 const document=createVaultDocument(binding.root,{section:'drafts',title:'隔离审查样例',text:'作者已给资料'},{mutationId:randomUUID()}).document;
 const library=openLibrary(binding.root);library.listContents();
 const start=(stage,method)=>{const task=library.mutateProduction('createTask',{kind:'writing',title:stage,prompt:'本阶段要求完整原创作HTML与必要确认',contentId:document.contentId,host:'codex',parameters:{workflow:'jincheng-stage',stage,businessSkill:method},tools:[],budget:{amount:0,currency:'REQ'},expectedToken:library.readProduction().editToken}).tasks.at(-1);const identity={taskId:task.id,attemptId:task.activeAttemptId,claimToken:randomUUID(),workerId:'isolated-audit'};library.mutateProduction('claimTask',identity);return {task,identity,args:{envelope:{binding,task:{taskId:task.id,attemptId:task.activeAttemptId,requestHash:task.requestHash}},library,payload:{claimToken:identity.claimToken,workerId:identity.workerId,input:{}}}};};
 const tutorial=start('tutorial','jc-jiaocheng-video');
 const before=runWorkflowHandoff({...tutorial.args,operation:'read'});
 let snapshot=library.mutateProduction('submitTask',{...tutorial.identity,result:{summary:'宣称完整教程交付',artifacts:[{id:randomUUID(),kind:'draft',title:'其实仅摘要',text:'没有生成HTML。',assetHash:null,data:null}]}});
 const submitted=snapshot.tasks.at(-1).attempts.at(-1);
 snapshot=library.mutateProduction('acceptTask',{taskId:tutorial.task.id,attemptId:tutorial.task.activeAttemptId,receiptHash:submitted.receipt.sha256,expectedToken:library.readProduction().editToken});
 output.probes.push({name:'tutorial receipt without HTML or checkpoints',artifactsBefore:before.artifacts.length,submitted:submitted.status,accepted:snapshot.tasks.at(-1).attempts.at(-1).status,htmlCount:readVaultTaskContext(binding.root,document.contentId).content.creationDocuments.length});
 const card=path.join(root,'reference-card.md');fs.writeFileSync(card,'# 单条参考洞察卡\n\n测试材料。');
 try{library.importAsset(card,{purpose:'production-report'});output.probes.push({name:'markdown report import',accepted:true});}catch(e){output.probes.push({name:'markdown report import',code:e.code,message:e.message});}
 const writing=start('writing','jc-content-writer');
 try{runWorkflowHandoff({...writing.args,operation:'artifact',payload:{...writing.args.payload,input:{kind:'material-pack',text:'本人材料与逐问访谈原话'}}});output.probes.push({name:'material pack stage save',accepted:true});}catch(e){output.probes.push({name:'material pack stage save',code:e.code});}
 const build=await runCreationHandoff({...writing.args,operation:'build',payload:{...writing.args.payload,input:{data:{content_id:document.tNumber,type:'口播',stage:'写稿',title:'完整页测试',narrative:{story:'作者判断',audience:'创作者',problem:'资料问题'},segments:[{id:'seg-one',title:'开头',mine:'完整句子。',refs:[{source_type:'说明',text:'已给材料'}]}]},mutationId:randomUUID()}}});
 output.probes.push({name:'build receipt stage artifact',keys:Object.keys(build.stageArtifact),stageArtifact:build.stageArtifact});
 const intakeRoot=path.join(root,'intake');fs.mkdirSync(intakeRoot);
 const mediaBytes=Buffer.from('synthetic registered video fixture; no decoding performed'),assetHash=createHash('sha256').update(mediaBytes).digest('hex');
 const runtime=createResearchRuntime({vaultRoot:intakeRoot,fetchMedia:async({videoId})=>({data:{assetHash,videoId,canonicalUrl:`https://www.douyin.com/video/${videoId}`},source:{videoId,platform:'douyin',title:'已登记标题'}}),readMedia:async()=>({data:mediaBytes,extension:'.mp4'}),executeService:async()=>({data:{text:'这是校正的句子。下一句继续讲。',durationMs:4000,segments:[{startMs:0,endMs:2000,text:'这是校正的句子。'},{startMs:2000,endMs:4000,text:'下一句继续讲。'}]}})});
 await runtime.prepare({version:1,researchId:'review-v2',outputDirectory:'02_内容素材/review-v2',route:'intake',platform:'douyin',targetIds:['123'],operations:['video'],maxRequests:1,comments:false,videoIds:['123'],intakeContractVersion:2});
 await runtime.download('review-v2','123');await runtime.transcribe('review-v2','123');await runtime.correct('review-v2','123',{correctedText:'这是校正的句子。下一句继续讲。',corrections:[],reviewedBy:'isolated-test'});
 const finalized=await runtime.finalizeIntake('review-v2',{videoId:'123',platform:'douyin',title:'已登记标题'});
 output.probes.push({name:'v2 intake strict validation incomplete',status:finalized.status,stage:runtime.status('review-v2').stage,strictValidation:finalized.strictValidation,formalFileExists:fs.existsSync(path.join(intakeRoot,finalized.originalPath)),intermediateArchived:fs.existsSync(path.join(intakeRoot,finalized.intermediateArchive))});
} finally {fs.rmSync(root,{recursive:true,force:true});}
console.log(JSON.stringify(output,null,2));
