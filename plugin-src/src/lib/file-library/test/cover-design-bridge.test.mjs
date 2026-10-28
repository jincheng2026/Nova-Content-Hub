import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import sharp from 'sharp';
import {createVault} from '../../vault/index.mjs';
import {scan,json} from '../../vault/core.mjs';
import {readWorkFlow,appendStageArtifact,confirmCheckpoint} from '../../vault/workflow.mjs';
import {openLibrary} from '../index.mjs';
import {executeCover} from '../../../../../workbench/src/main/cover-worker.mts';
const hash=value=>createHash('sha256').update(value).digest('hex');
async function fixture(t,ratio='3:4',identity='none'){
 const parent=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'cover-design-'));t.after(()=>fs.rmSync(parent,{recursive:true,force:true}));fs.mkdirSync(path.join(parent,'vault'));
 const binding=createVault(path.join(parent,'vault')),root=json(binding.root,'vault-binding.json').vaultRoot;
 const relative='05_内容草稿/T044_内容/创作页.html';fs.mkdirSync(path.dirname(path.join(root,relative)),{recursive:true});
 fs.writeFileSync(path.join(root,relative),'<script id="jc-doc" type="application/json">'+JSON.stringify({schema:1,page_id:'designcover',content_id:'T044',items:[{id:'seg-one',kind:'segment',locked:{order:1},fields:{mine:'原正文'}},{id:'title',kind:'pubslot',locked:{slot:'标题'},fields:{final:'发布标题'}},{id:'cover',kind:'pubslot',locked:{slot:'封面文字'},fields:{final:'中文实际封面字'}}]})+'</script>');
 const vaultId=json(root,'.workbench/vault.json').vaultId,document=scan(root,vaultId).documents.find(d=>d.relativePath===relative),library=openLibrary(binding.root);library.listContents();
 const image=path.join(parent,'style.png');fs.writeFileSync(image,await sharp({create:{width:6,height:8,channels:3,background:'#278547'}}).png().toBuffer());const asset=library.importAsset(image,{purpose:'template-reference'}),template=library.createTemplate({name:'design fixture',definition:{accepted:false},resources:{sample:{assetHash:asset.assetHash,bytes:asset.bytes,detectedType:asset.detectedType,role:'style'}}});
 const work={vaultId,workId:'T044'},artifactId='design-one',file='05_内容草稿/T044_内容/设计.json',data={title:'设计候选名不作封面字',style:'原创风格',visualProposition:'清楚表达',caseId:'case-01',preserve:['构图','层次','留白'],replace:['人物'],exclude:['原作者照片'],specification:'画面采用对角构图，保留中文标题可读空间。',evidence:['本篇正文'],identity,ratio};
 const bytes=Buffer.from(JSON.stringify({format:'nova-method-candidate',schemaVersion:2,methodId:'jc-cover-design',taskId:'task-design',kind:'cover-design',data,dependencies:[]}));fs.writeFileSync(path.join(root,file),bytes);const artifactHash=hash(bytes);
 appendStageArtifact(root,{work,kind:'cover-design',artifactId,hash:artifactHash,path:file,methodId:'jc-cover-design',taskId:'task-design'});
 const decide=decision=>confirmCheckpoint(root,{work,kind:'cover-design',artifactId,artifactHash,decision,expectedRevision:readWorkFlow(root,work).revision,evidence:{actor:'author',text:'确认准确版本',at:'2026-10-28T00:00:00.000Z'}});decide('confirm');
 const p=library.readCoverPackaging({contentId:document.contentId}),[width,height]=ratio.split(':').map(Number),input={designSource:{artifactId,artifactHash},packagingSource:{documentId:p.source.documentId,pageId:p.source.pageId,revision:p.source.revision,selectionToken:p.selectionToken},template:{id:template.id,version:1},styleAssetHashes:[asset.assetHash],photo:null,materialIds:[],prompt:'恶意客户端覆盖可信设计',pixels:{width:width*4,height:height*4},ratio,count:1,outputFormat:'png',scope:'cover-only'},bound={root:library.info.root,libraryId:library.info.libraryId,rootIdentity:library.info.rootIdentity};
 return{parent,root,library,document,input,bound,artifactId,artifactHash,data,decide,current:()=>library.readContent(document.contentId),file:path.join(root,file),image};
}
test('confirmed same-work design is listed and freezes trusted prompt while keeping original Chinese packaging',async t=>{
 const f=await fixture(t),listed=await executeCover('readCoverDesigns',{binding:f.bound,contentId:f.document.contentId},'disabled');assert.equal(listed.length,1);assert.equal(listed[0].title,'设计候选名不作封面字');
 const fp=f.library.inspectCoverInput(f.document.contentId,f.input,f.current().editToken);assert.equal(fp.designSource.workId,'T044');assert.equal(fp.designSource.artifactHash,f.artifactHash);
 const fixed=f.library.createCoverRequest(f.document.contentId,f.input,f.current().editToken);assert.equal(fixed.request.schemaVersion,4);assert.match(fixed.request.prompt,/对角构图/);assert.doesNotMatch(fixed.request.prompt,/恶意客户端/);assert.equal(fixed.request.title,'发布标题');assert.equal(fixed.request.coverText,'中文实际封面字');assert.equal(fixed.request.designSource.artifactHash,f.artifactHash);
 assert.equal(f.library.inspectCoverInput(f.document.contentId,{...f.input,prompt:'另一个伪造提示词'},f.current().editToken).inputHash,fp.inputHash);
 const recovered=f.library.findCoverRequest(f.document.contentId,{inputHash:fp.inputHash,title:fp.title,bodyHash:fp.bodyHash,packagingSource:fp.packagingSource,designSource:fp.designSource});assert.equal(recovered.request.requestHash,fixed.request.requestHash);
});
test('forged reference, reopened confirmation and changed design cannot prepare or launch a fixed request',async t=>{
 const f=await fixture(t);for(const designSource of [{artifactId:'other-T',artifactHash:f.artifactHash},{artifactId:f.artifactId,artifactHash:'a'.repeat(64)}])assert.throws(()=>f.library.inspectCoverInput(f.document.contentId,{...f.input,designSource},f.current().editToken),{code:'STALE_INPUT'});
 const fixed=f.library.createCoverRequest(f.document.contentId,f.input,f.current().editToken),attempt=f.library.createCoverAttempt(f.document.contentId,fixed.request.requestId,{host:'codex'}).attempt,reference={contentId:f.document.contentId,requestId:fixed.request.requestId,attemptId:attempt.attemptId};
 f.decide('reopen');assert.equal((await executeCover('readCoverDesigns',{binding:f.bound,contentId:f.document.contentId},'disabled')).length,0);await assert.rejects(executeCover('handoffContext',{binding:f.bound,reference},'disabled'),{code:'STALE_INPUT'});assert.throws(()=>f.library.inspectCoverInput(f.document.contentId,f.input,f.current().editToken),{code:'STALE_INPUT'});assert.equal(f.library.readCoverContext(reference.contentId,reference.requestId,reference.attemptId).request.requestHash,fixed.request.requestHash);
 f.decide('confirm');fs.appendFileSync(f.file,' ');assert.throws(()=>f.library.createCoverAttempt(f.document.contentId,fixed.request.requestId,{host:'workbuddy'}),{code:'STALE_INPUT'});
});
test('confirmed design freezes every supported ratio and rejects silent ratio substitution',async t=>{
 for(const ratio of ['3:4','1:1','16:9','21:9']){const f=await fixture(t,ratio),fixed=f.library.createCoverRequest(f.document.contentId,f.input,f.current().editToken);assert.equal(fixed.request.ratio,ratio);assert.throws(()=>f.library.inspectCoverInput(f.document.contentId,{...f.input,ratio:'4:3',pixels:{width:8,height:6}},f.current().editToken),{code:'STALE_INPUT'});}
});
test('own-photo-required designs require a real declared own photo and matching current hash',async t=>{
 const f=await fixture(t,'3:4','own-photo-required');assert.throws(()=>f.library.inspectCoverInput(f.document.contentId,f.input,f.current().editToken),{code:'INVALID_INPUT'});
 const photo=f.library.createPhoto({assetHash:f.input.styleAssetHashes[0],title:'本人',isOwnPhoto:false});assert.throws(()=>f.library.inspectCoverInput(f.document.contentId,{...f.input,photo:{id:photo.id,assetHash:photo.assetHash}},f.current().editToken),{code:'INVALID_INPUT'});
 const own=f.library.createPhoto({assetHash:f.input.styleAssetHashes[0],title:'已声明本人',isOwnPhoto:true}),input={...f.input,photo:{id:own.id,assetHash:own.assetHash}};assert.throws(()=>f.library.inspectCoverInput(f.document.contentId,{...input,photo:{...input.photo,assetHash:'b'.repeat(64)}},f.current().editToken),{code:'INVALID_INPUT'});assert.equal(f.library.createCoverRequest(f.document.contentId,input,f.current().editToken).request.photo.id,own.id);
});

import {DesktopController} from '../../../../../workbench/src/main/controller.mts';
import {BindingStore,emptyBinding,validateBinding} from '../../../../../workbench/src/main/bindings.mts';
import {execute} from '../../../../../workbench/src/main/worker.mts';
async function desktop(f,extra={}){
 const store=new BindingStore(path.join(f.parent,'machine.json'));await store.save({...emptyBinding(),current:f.bound});const launches=[];
 const worker={call:(op,args)=>execute(op,args,'disabled')},controller=new DesktopController({store,worker,documents:f.parent,authMode:'disabled',dialogs:{backup:async()=>null,destination:async()=>null},launch:async(binding,reference)=>launches.push(reference),readAssistantSetup:async host=>({host,ready:true,skill:'nova-content-cover-execution',reason:'available'}),...extra});await controller.initialize();return {controller,store,launches,worker};
}
test('desktop fixed task consumes trusted design through worker and preserves host switch and waiting contracts',async t=>{
 const f=await fixture(t),d=await desktop(f),selected=await d.controller.readCoverDesigns({contentId:f.document.contentId});assert.equal(selected[0].designSource.artifactId,f.artifactId);
 const started=await d.controller.generateCover({contentId:f.document.contentId,editToken:f.current().editToken,input:f.input}),job=started.jobs[0],first=job.activeAttemptId;assert.equal(d.launches.length,1);const context=f.library.readCoverContext(f.document.contentId,job.id,first);assert.match(context.request.prompt,/对角构图/);assert.equal(context.request.coverText,'中文实际封面字');
 f.library.claimCoverAttempt(f.document.contentId,job.id,first,{host:'codex',readAssetHashes:context.inputs.map(i=>i.assetHash)});
 for(const state of ['waiting-user','waiting-permission']){f.library.reportCoverProgress(f.document.contentId,job.id,first,{host:'codex',requestHash:job.requestHash,phase:'generating',state,message:'等待准确输入',expectedRevision:state==='waiting-user'?0:1,mutationId:randomUUID()});assert.equal((await d.controller.readCoverProgress({contentId:f.document.contentId})).jobs[0].attempts[0].progress.state,state);}
 await d.controller.setAssistant({host:'workbuddy'});await d.controller.continueCover({contentId:f.document.contentId,requestId:job.id,attemptId:first});const state=f.library.readCoverState(f.document.contentId),changed=state.content.coverJobs[0];assert.equal(changed.attempts.length,2);assert.equal(changed.attempts[0].status,'superseded');assert.equal(changed.attempts[1].host,'workbuddy');assert.equal(state.requests.get(job.id).designSource.artifactHash,f.artifactHash);
});
test('lost create response followed by reopened design keeps pending intent and original task receipt without new writes',async t=>{
 const f=await fixture(t);let lost=false;
 const d=await desktop(f,{worker:{call:async(op,args)=>{const result=await execute(op,args,'disabled');if(op==='createCoverRequest'&&!lost){lost=true;f.decide('reopen');throw Object.assign(new Error('lost response'),{code:'IO_ERROR'});}return result;}}});
 await assert.rejects(d.controller.generateCover({contentId:f.document.contentId,editToken:f.current().editToken,input:f.input}),/lost response/);
 const pending=(await d.store.load()).coverPending;assert.ok(pending);assert.doesNotThrow(()=>validateBinding(d.controller.binding));const receipt=f.library.queryMutation(pending.requestMutationId),fixed=f.current().coverJobs[0];assert.ok(receipt);assert.equal(fixed.attempts.length,0);
 await assert.rejects(d.controller.resumeCover(),{code:'STALE_INPUT'});assert.deepEqual(f.library.queryMutation(pending.requestMutationId),receipt);assert.equal(f.current().coverJobs.length,1);assert.equal(f.current().coverJobs[0].attempts.length,0);assert.deepEqual((await d.store.load()).coverPending,pending);assert.equal(d.launches.length,0);
});
test('design changes after an attempt is claimed reject submission while old committed receipts remain replayable',async t=>{
 const f=await fixture(t),fixed=f.library.createCoverRequest(f.document.contentId,f.input,f.current().editToken),attempt=f.library.createCoverAttempt(f.document.contentId,fixed.request.requestId,{host:'codex'}).attempt,ctx=f.library.readCoverContext(f.document.contentId,fixed.request.requestId,attempt.attemptId);
 f.library.claimCoverAttempt(f.document.contentId,fixed.request.requestId,attempt.attemptId,{host:'codex',readAssetHashes:ctx.inputs.map(i=>i.assetHash)});const bytes=await sharp({create:{...f.input.pixels,channels:3,background:'#274588'}}).png().toBuffer();fs.writeFileSync(path.join(ctx.inbox,'result.png'),bytes);const receipt={libraryId:f.bound.libraryId,contentId:f.document.contentId,requestId:fixed.request.requestId,attemptId:attempt.attemptId,requestHash:fixed.request.requestHash,resultId:randomUUID(),files:[{name:'result.png',sha256:hash(bytes)}]};
 f.decide('reopen');await assert.rejects(f.library.commitCoverAttempt(f.document.contentId,fixed.request.requestId,attempt.attemptId,receipt),{code:'STALE_INPUT'});assert.equal(f.current().candidates.length,0);
 f.decide('confirm');await f.library.commitCoverAttempt(f.document.contentId,fixed.request.requestId,attempt.attemptId,receipt);f.decide('reopen');const replay=await f.library.commitCoverAttempt(f.document.contentId,fixed.request.requestId,attempt.attemptId,receipt);assert.equal(replay.attempt.status,'committed');assert.equal(f.current().candidates.length,1);f.library.selectContentCover(f.document.contentId,replay.candidateIds[0],f.current().editToken);assert.equal(f.library.readSelectedCoverSnapshot(f.document.contentId).provenance.designSource.artifactHash,f.artifactHash);
});
