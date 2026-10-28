import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import sharp from 'sharp';
import {createVault} from '../../vault/index.mjs';
import {scan,json} from '../../vault/core.mjs';
import {openLibrary,__testing} from '../index.mjs';
process.env.NODE_ENV='test';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const html=(text='  原页已选标题\n',mine='  当前原稿\r\n\n')=>'<script id="jc-doc" type="application/json">'+JSON.stringify({schema:1,page_id:'sourcecover',content_id:'T044',items:[{id:'seg-one',kind:'segment',locked:{order:1},fields:{mine}},...['标题','封面文字','简介'].map((slot,index)=>({id:'slot-'+index,kind:'pubslot',locked:{slot},fields:{final:index===0?text:index===1?'  原页封面字\n':'精确简介\r\n'}}))]})+'</script>';
async function fixture(t){
 const parent=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'source-cover-'));t.after(()=>{__testing.setHook(undefined);fs.rmSync(parent,{recursive:true,force:true});});fs.mkdirSync(path.join(parent,'vault'));const binding=createVault(path.join(parent,'vault')),root=json(binding.root,'vault-binding.json').vaultRoot,relative='05_内容草稿/T044_内容/创作页.html';fs.mkdirSync(path.dirname(path.join(root,relative)),{recursive:true});fs.writeFileSync(path.join(root,relative),html());
 const descriptor=json(root,'.workbench/vault.json'),document=scan(root,descriptor.vaultId).documents.find(doc=>doc.relativePath===relative),library=openLibrary(binding.root);library.listContents();
 const bytes=await sharp({create:{width:8,height:6,channels:3,background:'#278547'}}).png().toBuffer(),image=path.join(parent,'style.png');fs.writeFileSync(image,bytes);const asset=library.importAsset(image,{purpose:'template-reference'});const template=library.createTemplate({name:'source fixture',definition:{accepted:false},resources:{sample:{assetHash:asset.assetHash,bytes:asset.bytes,detectedType:asset.detectedType,role:'style'}}});
 assert.equal(typeof library.readCoverPackaging,'function','source-aware packaging read must be available');const packaging=library.readCoverPackaging({contentId:document.contentId});assert.equal(packaging.kind,'jc-doc');
 const source={documentId:packaging.source.documentId,pageId:packaging.source.pageId,revision:packaging.source.revision,selectionToken:packaging.selectionToken},input={packagingSource:source,template:{id:template.id,version:1},styleAssetHashes:[asset.assetHash],photo:null,materialIds:[],prompt:'按原页已采用包装制图',pixels:{width:8,height:6},ratio:'4:3',count:1,outputFormat:'png',scope:'cover-only'};
 const current=()=>library.readContent(document.contentId),change=(title='改字后标题')=>fs.writeFileSync(path.join(root,relative),html(title));
 return{library,root,runtime:binding.root,document,input,packaging,bytes,current,change};
}
test('source-aware request preserves exact original packaging and manuscript through claim/commit and historical reads',async t=>{
 const f=await fixture(t),before=f.current(),fingerprint=f.library.inspectCoverInput(before.id,f.input,before.editToken);
 assert.equal(fingerprint.title,'  原页已选标题\n');assert.equal(fingerprint.packagingSource.selectionToken,f.packaging.selectionToken);
 const fixed=f.library.createCoverRequest(before.id,f.input,before.editToken,{mutationId:randomUUID()});assert.equal(fixed.request.schemaVersion,3);assert.equal(fixed.request.title,'  原页已选标题\n');assert.equal(fixed.request.coverText,'  原页封面字\n');assert.equal(fixed.request.description,'精确简介\r\n');assert.deepEqual(fixed.bodyBytes,Buffer.from('  当前原稿\r\n\n'));
 const started=f.library.createCoverAttempt(before.id,fixed.request.requestId,{host:'codex'}),aid=started.attempt.attemptId,ctx=f.library.readCoverContext(before.id,fixed.request.requestId,aid);assert.doesNotThrow(()=>f.library.assertCoverRequestFresh(before.id,fixed.request.requestId));
 f.library.claimCoverAttempt(before.id,fixed.request.requestId,aid,{host:'codex',readAssetHashes:ctx.inputs.map(input=>input.assetHash)});fs.writeFileSync(path.join(ctx.inbox,'result.png'),f.bytes);
 await f.library.commitCoverAttempt(before.id,fixed.request.requestId,aid,{libraryId:f.library.info.libraryId,contentId:before.id,requestId:fixed.request.requestId,attemptId:aid,requestHash:fixed.request.requestHash,resultId:randomUUID(),files:[{name:'result.png',sha256:hash(f.bytes)}]});
 f.change();assert.equal(f.library.readCoverContext(before.id,fixed.request.requestId,aid).request.title,'  原页已选标题\n','history remains readable independently of live input');
 fs.unlinkSync(path.join(f.root,f.document.relativePath));const offline=f.library.readCoverContext(before.id,fixed.request.requestId,aid);assert.equal(offline.request.description,'精确简介\r\n');assert.equal(offline.request.requestHash,fixed.request.requestHash);
});
test('source edits invalidate inspect/create/claim/new-attempt while stable committed request replay stays immutable',async t=>{
 const f=await fixture(t),before=f.current(),mid=randomUUID(),fixed=f.library.createCoverRequest(before.id,f.input,before.editToken,{mutationId:mid});
 const started=f.library.createCoverAttempt(before.id,fixed.request.requestId,{host:'codex'}),ctx=f.library.readCoverContext(before.id,fixed.request.requestId,started.attempt.attemptId);f.change();
 assert.throws(()=>f.library.inspectCoverInput(before.id,f.input,f.current().editToken),{code:'STALE_INPUT'});
 assert.throws(()=>f.library.claimCoverAttempt(before.id,fixed.request.requestId,started.attempt.attemptId,{host:'codex',readAssetHashes:ctx.inputs.map(input=>input.assetHash)}),{code:'STALE_INPUT'});
 assert.throws(()=>f.library.createCoverAttempt(before.id,fixed.request.requestId,{host:'workbuddy'}),{code:'STALE_INPUT'});
 const replay=f.library.createCoverRequest(before.id,f.input,before.editToken,{mutationId:mid});assert.equal(replay.request.requestHash,fixed.request.requestHash);
});
test('source edits after asynchronous image decoding reject final commit, and caller text cannot bypass the original source',async t=>{
 const f=await fixture(t),before=f.current();assert.throws(()=>f.library.inspectCoverInput(before.id,{...f.input,coverText:'偷偷替换'},before.editToken),{code:'INVALID_INPUT'});
 const old={...f.input};delete old.packagingSource;assert.throws(()=>f.library.inspectCoverInput(before.id,old,before.editToken),{code:'STALE_INPUT'});
 const fixed=f.library.createCoverRequest(before.id,f.input,before.editToken),attempt=f.library.createCoverAttempt(before.id,fixed.request.requestId,{host:'codex'}).attempt,ctx=f.library.readCoverContext(before.id,fixed.request.requestId,attempt.attemptId);
 f.library.claimCoverAttempt(before.id,fixed.request.requestId,attempt.attemptId,{host:'codex',readAssetHashes:ctx.inputs.map(input=>input.assetHash)});fs.writeFileSync(path.join(ctx.inbox,'result.png'),f.bytes);let changedAfterDecode=false;__testing.setHook(event=>{if(event.phase==='coverAfterDecode'){changedAfterDecode=true;f.change();}});
 await assert.rejects(f.library.commitCoverAttempt(before.id,fixed.request.requestId,attempt.attemptId,{libraryId:f.library.info.libraryId,contentId:before.id,requestId:fixed.request.requestId,attemptId:attempt.attemptId,requestHash:fixed.request.requestHash,resultId:randomUUID(),files:[{name:'result.png',sha256:hash(f.bytes)}]}),{code:'STALE_INPUT'});assert.equal(changedAfterDecode,true,'the source edit occurs after decoder awaited and before the final lock');assert.equal(f.current().candidates.length,0);
});

test('inspect fingerprint recovers a lost create response through findCoverRequest with exact original source',async t=>{
 const f=await fixture(t),current=f.current(),fingerprint=f.library.inspectCoverInput(current.id,f.input,current.editToken);
 f.library.createCoverRequest(current.id,f.input,current.editToken,{mutationId:randomUUID()}); // caller loses this response
 const recovered=f.library.findCoverRequest(current.id,{inputHash:fingerprint.inputHash,title:fingerprint.title,bodyHash:fingerprint.bodyHash,packagingSource:fingerprint.packagingSource});
 assert.ok(recovered);assert.equal(recovered.request.title,'  原页已选标题\n');assert.equal(recovered.request.packagingSource.selectionToken,fingerprint.packagingSource.selectionToken);
 assert.equal(f.library.inspectCoverInput(current.id,f.input,f.current().editToken).existingRequest.requestId,recovered.request.requestId);
});

test('an explicitly current Markdown stays the exact frozen manuscript while packaging comes from a separately selected HTML',async t=>{
 const f=await fixture(t),relative='05_内容草稿/T044_内容/作者工作稿.md',text='# 作者当前稿\r\n\r\n  不采用旧 HTML 的 mine。\n';fs.writeFileSync(path.join(f.root,relative),text);
 const vaultId=json(f.root,'.workbench/vault.json').vaultId,document=scan(f.root,vaultId).documents.find(doc=>doc.relativePath===relative);
 fs.writeFileSync(path.join(f.root,'05_内容草稿/T044_内容/创作过程.json'),JSON.stringify({format:'nova-work-flow',schemaVersion:1,work:{vaultId,workId:'T044'},artifacts:[],decisions:[],metaQuestions:{},currentSource:{sourceId:'drafts',documentId:document.id,relativePath:relative,hash:document.hash,evidence:{actor:'author',text:'明确当前稿',at:'2026-10-28T00:00:00.000Z'}}}));
 assert.equal(f.library.readCoverPackaging({contentId:document.contentId}).kind,'choose-source');const selected=f.library.readCoverPackaging({contentId:document.contentId,documentId:f.packaging.source.documentId});assert.equal(selected.kind,'jc-doc');
 const packagingSource={documentId:selected.source.documentId,pageId:selected.source.pageId,revision:selected.source.revision,selectionToken:selected.selectionToken},before=f.current(),fixed=f.library.createCoverRequest(before.id,{...f.input,packagingSource,sizePolicy:'ratio-minimum'},before.editToken);
 assert.deepEqual(fixed.bodyBytes,Buffer.from(text));assert.notEqual(fixed.request.packagingSource.manuscriptSource.documentId,fixed.request.packagingSource.documentId);assert.equal(fixed.request.sizePolicy,'ratio-minimum');assert.equal(fixed.request.schemaVersion,3);assert.equal(fixed.request.bodyHash,hash(Buffer.from(text)));
 const first=f.library.createCoverAttempt(before.id,fixed.request.requestId,{host:'codex'}),second=f.library.createCoverAttempt(before.id,fixed.request.requestId,{host:'workbuddy',reason:'switch-host'});assert.notEqual(first.attempt.attemptId,second.attempt.attemptId);assert.equal(second.attempt.host,'workbuddy');assert.equal(f.library.readCoverContext(before.id,fixed.request.requestId,second.attempt.attemptId).request.requestHash,fixed.request.requestHash);
});

test('worker handoff uses original packaging freshness and historical context stays readable after source edits',async t=>{
 const {executeCover}=await import('../../../../../workbench/src/main/cover-worker.mts');const f=await fixture(t),before=f.current(),binding={root:f.library.info.root,libraryId:f.library.info.libraryId,rootIdentity:f.library.info.rootIdentity};
 const original=await executeCover('readCoverPackaging',{binding,input:{contentId:before.id}},'disabled');assert.equal(original.kind,'jc-doc');
 const fixed=f.library.createCoverRequest(before.id,f.input,before.editToken),attempt=f.library.createCoverAttempt(before.id,fixed.request.requestId,{host:'codex'}).attempt,reference={contentId:before.id,requestId:fixed.request.requestId,attemptId:attempt.attemptId};
 const context=await executeCover('handoffContext',{binding,reference},'disabled');assert.equal(context.request.title,'  原页已选标题\n');assert.equal(context.request.description,'精确简介\r\n');
 f.change();await assert.rejects(executeCover('handoffContext',{binding,reference},'disabled'),{code:'STALE_INPUT'});const history=await executeCover('coverContext',{binding,reference},'disabled');assert.equal(history.request.requestHash,fixed.request.requestHash);
});

test('checksum-matched schema 3 packages reject unknown fields and independently mismatched input hashes',async t=>{
 const {coverJobMethods}=await import('../cover-jobs.mjs'),f=await fixture(t),before=f.current(),fixed=f.library.createCoverRequest(before.id,f.input,before.editToken),base={...fixed.request};delete base.requestHash;
 const jsonBytes=value=>Buffer.from(JSON.stringify(value,null,2)+'\n'),fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
 const inputFields=(value,allowed,required=[])=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!allowed.includes(key))||required.some(key=>!Object.hasOwn(value,key)))fail('CORRUPT','Invalid frozen shape');return value;};
 for(const patch of [{root:'/untrusted/path'},{inputHash:'e'.repeat(64)}]){
  const request={...base,...patch},normalized=Object.fromEntries(Object.entries(request).filter(([key])=>!['format','schemaVersion','requestId','createdAt','inputHash'].includes(key)));
  if(patch.root)request.inputHash=hash(jsonBytes(normalized));const raw=jsonBytes(request),job={...f.current().coverJobs[0],inputHash:request.inputHash,requestHash:hash(raw)};
  assert.throws(()=>coverJobMethods({root:f.runtime,libraryId:f.library.info.libraryId,validationContent:{id:before.id,coverJobs:[job]},id:value=>value,hash,jsonBytes,inputFields,fail,checkedHash:()=>{},templatePackage:()=>{},read:file=>file.endsWith('请求.json')?raw:file.endsWith('正文.md')?fixed.bodyBytes:f.bytes}),{code:'CORRUPT'});
 }
});
