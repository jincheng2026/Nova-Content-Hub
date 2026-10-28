import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import sharp from 'sharp';
import {createVault,migrateVault,openVault} from '../../vault/index.mjs';
import {scan,json} from '../../vault/core.mjs';
import {readVaultPackaging} from '../../vault/packaging.mjs';
import {openLibrary} from '../index.mjs';

async function fixture(t, manuscript=false) {
 const parent=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'topic-cover-'));t.after(()=>fs.rmSync(parent,{recursive:true,force:true}));
 const root=path.join(parent,'vault');fs.mkdirSync(root);const binding=createVault(root),vaultId=json(root,'.workbench/vault.json').vaultId;
 const put=(relative,text)=>{const file=path.join(root,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);};
 const topic='04_选题库/T044_明确封面标题.md',draft='05_内容草稿/T044_明确封面标题/创作页.html';
 put(topic,'# 明确封面标题\n\n这是作者已保存的选题参考，尚无逐字稿。');
 const html=items=>'<script id="jc-doc" type="application/json">'+JSON.stringify({schema:1,page_id:'legacy-cover',content_id:'T044',items})+'</script>';
 if(manuscript)put(draft,html([{id:'seg-one',kind:'segment',locked:{order:1},fields:{mine:'  作者完整原稿\r\n'}}]));
 const contentId=scan(root,vaultId).documents.find(d=>d.relativePath===topic).contentId,library=openLibrary(binding.root);library.listContents();
 const image=path.join(parent,'sample.png');fs.writeFileSync(image,await sharp({create:{width:8,height:6,channels:3,background:'#336699'}}).png().toBuffer());
 const asset=library.importAsset(image,{purpose:'template-reference'}),template=library.createTemplate({name:'topic fixture',definition:{accepted:false},resources:{sample:{assetHash:asset.assetHash,bytes:asset.bytes,detectedType:asset.detectedType,role:'style'}}});
 const input={template:{id:template.id,version:1},styleAssetHashes:[asset.assetHash],photo:null,materialIds:[],prompt:'仅制作已明确标题的封面',pixels:{width:8,height:6},ratio:'4:3',count:1,outputFormat:'png',scope:'cover-only'};
 return {root,runtime:binding.root,library,contentId,input,topic,draft,put,html,current:()=>library.readContent(contentId)};
}
test('cover-only permits a saved topic context while publication packaging still requires a manuscript',async t=>{
 const f=await fixture(t),strict=readVaultPackaging(f.runtime,{contentId:f.contentId}),cover=f.library.readCoverPackaging({contentId:f.contentId});
 assert.equal(strict.kind,'unavailable');assert.ok(strict.issues.includes('CURRENT_MANUSCRIPT_UNAVAILABLE'));
 assert.equal(cover.kind,'legacy');assert.equal(cover.script,null);assert.equal(cover.context.kind,'topic');assert.equal(cover.context.text,'# 明确封面标题\n\n这是作者已保存的选题参考，尚无逐字稿。');
 const before=f.current(),fixed=f.library.createCoverRequest(before.id,f.input,before.editToken);
 assert.equal(fixed.request.contextSource.kind,'topic');assert.equal(fixed.request.contextSource.documentId,cover.context.source.documentId);assert.equal(fixed.bodyBytes.toString(),cover.context.text);
 assert.doesNotThrow(()=>f.library.assertCoverRequestFresh(before.id,fixed.request.requestId));
 const fingerprint=f.library.inspectCoverInput(before.id,f.input,f.current().editToken);
 assert.deepEqual(fingerprint.contextSource,fixed.request.contextSource);
 assert.equal(f.library.findCoverRequest(before.id,{inputHash:fingerprint.inputHash,title:fingerprint.title,bodyHash:fingerprint.bodyHash,contextSource:fingerprint.contextSource}).request.requestHash,fixed.request.requestHash);
 const started=f.library.createCoverAttempt(before.id,fixed.request.requestId,{host:'codex'}),context=f.library.readCoverContext(before.id,fixed.request.requestId,started.attempt.attemptId);
 f.library.claimCoverAttempt(before.id,fixed.request.requestId,started.attempt.attemptId,{host:'codex',readAssetHashes:context.inputs.map(item=>item.assetHash)});
 assert.equal(context.request.contextSource.kind,'topic');assert.equal(context.bodyBytes.toString(),cover.context.text);
 const image=fs.readFileSync(path.join(path.dirname(f.root),'sample.png'));fs.writeFileSync(path.join(context.inbox,'cover.png'),image);
 await f.library.commitCoverAttempt(before.id,fixed.request.requestId,started.attempt.attemptId,{libraryId:f.library.info.libraryId,contentId:before.id,requestId:fixed.request.requestId,attemptId:started.attempt.attemptId,requestHash:fixed.request.requestHash,resultId:randomUUID(),files:[{name:'cover.png',sha256:createHash('sha256').update(image).digest('hex')}]});
 assert.equal(f.current().candidates.length,1);
 f.put(f.topic,'# 已变更标题\n\n选题已经改变。');
 assert.throws(()=>f.library.assertCoverRequestFresh(before.id,fixed.request.requestId),{code:'STALE_INPUT'});
 assert.throws(()=>f.library.createCoverRequest(before.id,f.input,before.editToken),{code:'CONFLICT'});
 assert.equal(f.library.readCoverContext(before.id,fixed.request.requestId,started.attempt.attemptId).request.requestHash,fixed.request.requestHash);
});
test('old creation pages without any publishing slots freeze their exact manuscript for covers',async t=>{
 const f=await fixture(t,true);f.put('05_内容草稿/T044_明确封面标题/补充说明.html','<html><body>同工作普通参考说明，没有创作数据块。</body></html>');
 const strict=readVaultPackaging(f.runtime,{contentId:f.contentId}),cover=f.library.readCoverPackaging({contentId:f.contentId});
 assert.equal(strict.kind,'jc-doc');assert.equal(strict.fields.title,null);assert.equal(cover.kind,'legacy');assert.equal(cover.context.kind,'manuscript');assert.equal(cover.script.text,'  作者完整原稿\r\n');
 const before=f.current(),fixed=f.library.createCoverRequest(before.id,f.input,before.editToken);assert.equal(fixed.bodyBytes.toString(),'  作者完整原稿\r\n');assert.equal(fixed.request.contextSource.kind,'manuscript');
 f.put(f.draft,f.html([{id:'seg-one',kind:'segment',locked:{order:1},fields:{mine:'改后的完整稿'}}]));
 assert.throws(()=>f.library.assertCoverRequestFresh(before.id,fixed.request.requestId),{code:'STALE_INPUT'});
});
test('one existing publishing slot never downgrades to topic or legacy title packaging',async t=>{
 const f=await fixture(t,true);f.put(f.draft,f.html([{id:'seg-one',kind:'segment',locked:{order:1},fields:{mine:'当前稿'}},{id:'pub-title',kind:'pubslot',locked:{slot:'标题'},fields:{final:''}}]));
 const cover=f.library.readCoverPackaging({contentId:f.contentId});assert.equal(cover.kind,'jc-doc');assert.equal(cover.fields.title.value,'');
 const current=f.current();assert.throws(()=>f.library.inspectCoverInput(current.id,f.input,current.editToken),{code:'STALE_INPUT'});
});
test('damaged same-work originals and failed explicit selections cannot use the topic cover branch',async t=>{
 const f=await fixture(t);f.put(f.draft,'<script id="jc-doc" type="application/json">{broken}</script>');
 assert.equal(f.library.readCoverPackaging({contentId:f.contentId}).kind,'unavailable');
 fs.unlinkSync(path.join(f.root,f.draft));
 assert.equal(f.library.readCoverPackaging({contentId:f.contentId,documentId:'doc-'+'f'.repeat(32)}).kind,'unavailable');
 f.put('05_内容草稿/T044_明确封面标题/创作过程.json',JSON.stringify({format:'nova-work-flow',schemaVersion:1,work:{vaultId:json(f.root,'.workbench/vault.json').vaultId,workId:'T044'},artifacts:[],decisions:[],metaQuestions:{},currentSource:{sourceId:'drafts',documentId:'doc-'+'f'.repeat(32),relativePath:f.draft,hash:'a'.repeat(64),evidence:{actor:'author',text:'明确当前稿',at:'2026-10-28T00:00:00.000Z'}}}));
 assert.equal(f.library.readCoverPackaging({contentId:f.contentId}).kind,'unavailable');
});
test('topic and old-page cover contexts survive explicit migration and reopening on a different root',async t=>{
 for(const manuscript of [false,true]) {
  const f=await fixture(t,manuscript),before=f.library.readCoverPackaging({contentId:f.contentId}),target=path.join(path.dirname(f.root),'migrated-vault'),original=f.library.createCoverRequest(f.contentId,f.input,f.current().editToken);
  migrateVault(f.root,target);const rebound=openVault(target),library=openLibrary(rebound.root);library.listContents();
  const after=library.readCoverPackaging({contentId:f.contentId});assert.deepEqual(after.context,before.context);assert.deepEqual(after.script,before.script);
  const current=library.readContent(f.contentId),fixed=library.createCoverRequest(current.id,f.input,current.editToken);assert.equal(fixed.request.contextSource.kind,manuscript?'manuscript':'topic');assert.equal(fixed.bodyBytes.toString(),before.context.text);assert.equal(fixed.request.requestHash,original.request.requestHash);assert.doesNotThrow(()=>library.assertCoverRequestFresh(current.id,fixed.request.requestId));
 }
});
test('conflicting real manuscript sources block cover compatibility before request creation',async t=>{
 const f=await fixture(t,true);f.put('05_内容草稿/T044_明确封面标题/另一创作页.html',f.html([{id:'seg-other',kind:'segment',locked:{order:1},fields:{mine:'另一份真实作者稿'}}]).replace('legacy-cover','other-cover'));
 const value=f.library.readCoverPackaging({contentId:f.contentId});assert.equal(value.kind,'unavailable');assert.ok(value.issues.includes('CURRENT_SOURCE_CONFLICT'));
 const current=f.current();assert.throws(()=>f.library.inspectCoverInput(current.id,f.input,current.editToken),{code:'STALE_INPUT'});
});
test('an explicitly selected ordinary HTML cannot bypass the invalid packaging selection guard',async t=>{
 const f=await fixture(t,true),relative='05_内容草稿/T044_明确封面标题/补充说明.html';f.put(relative,'<html><body>普通说明，没有创作数据块。</body></html>');
 const document=scan(f.root,json(f.root,'.workbench/vault.json').vaultId).documents.find(item=>item.relativePath===relative);
 const value=f.library.readCoverPackaging({contentId:f.contentId,documentId:document.id});
 assert.equal(value.kind,'unavailable');assert.ok(value.issues.includes('PACKAGING_SOURCE_INVALID'));
});
test('a saved title can generate a cover with an exact empty manuscript reference without inventing a script',async t=>{
 const f=await fixture(t),relative='05_内容草稿/T044_明确封面标题/正文.md';f.put(relative,'');f.library.listContents();
 const strict=readVaultPackaging(f.runtime,{contentId:f.contentId}),cover=f.library.readCoverPackaging({contentId:f.contentId});
 assert.equal(strict.kind,'unavailable');assert.ok(strict.issues.includes('CURRENT_MANUSCRIPT_UNAVAILABLE'));
 assert.equal(cover.kind,'legacy');assert.equal(cover.script,null);assert.equal(cover.context.kind,'title-only');assert.equal(cover.context.text,'');
 const before=f.current(),fixed=f.library.createCoverRequest(before.id,f.input,before.editToken);assert.equal(fixed.request.contextSource.kind,'title-only');assert.equal(fixed.bodyBytes.length,0);assert.doesNotThrow(()=>f.library.assertCoverRequestFresh(before.id,fixed.request.requestId));
 const started=f.library.createCoverAttempt(before.id,fixed.request.requestId,{host:'codex'}),context=f.library.readCoverContext(before.id,fixed.request.requestId,started.attempt.attemptId);
 f.library.claimCoverAttempt(before.id,fixed.request.requestId,started.attempt.attemptId,{host:'codex',readAssetHashes:context.inputs.map(item=>item.assetHash)});
 const image=fs.readFileSync(path.join(path.dirname(f.root),'sample.png'));fs.writeFileSync(path.join(context.inbox,'cover.png'),image);
 await f.library.commitCoverAttempt(before.id,fixed.request.requestId,started.attempt.attemptId,{libraryId:f.library.info.libraryId,contentId:before.id,requestId:fixed.request.requestId,attemptId:started.attempt.attemptId,requestHash:fixed.request.requestHash,resultId:randomUUID(),files:[{name:'cover.png',sha256:createHash('sha256').update(image).digest('hex')}]});assert.equal(f.current().candidates.length,1);
 f.put(relative,' \r\n\t');const whitespace=f.library.readCoverPackaging({contentId:f.contentId});assert.equal(whitespace.context.kind,'title-only');assert.equal(whitespace.context.text,' \r\n\t');assert.throws(()=>f.library.assertCoverRequestFresh(before.id,fixed.request.requestId),{code:'STALE_INPUT'});
 assert.equal(f.library.readCoverPackaging({contentId:f.contentId,documentId:cover.context.source.documentId}).kind,'unavailable');
 f.put(f.draft,'<script id="jc-doc" type="application/json">{broken}</script>');assert.equal(f.library.readCoverPackaging({contentId:f.contentId}).kind,'unavailable');
 f.put(f.draft,f.html([{id:'seg-one',kind:'segment',locked:{order:1},fields:{mine:''}},{id:'pub-title',kind:'pubslot',locked:{slot:'标题'},fields:{final:'已采用标题'}}]));assert.equal(f.library.readCoverPackaging({contentId:f.contentId}).kind,'unavailable');
});
test('resolved topics with supporting text and ordinary HTML can make covers without a manuscript',async t=>{
 const f=await fixture(t);f.put('05_内容草稿/T044_明确封面标题/参考拆解.md','# 参考拆解\n\n这是参考材料，尚非作者逐字稿。');f.put('05_内容草稿/T044_明确封面标题/调研_资料.txt','资料摘录');f.put('05_内容草稿/T044_明确封面标题/配图说明.html','<html><body>配图参考说明，没有jc-doc。</body></html>');
 const value=f.library.readCoverPackaging({contentId:f.contentId});assert.equal(value.kind,'legacy');assert.equal(value.context.kind,'topic');assert.equal(value.script,null);
 f.library.listContents();const current=f.current(),fixed=f.library.createCoverRequest(current.id,f.input,current.editToken);assert.equal(fixed.request.contextSource.kind,'topic');assert.doesNotThrow(()=>f.library.assertCoverRequestFresh(current.id,fixed.request.requestId));
 f.put(f.draft,f.html([{id:'seg-one',kind:'segment',locked:{order:1},fields:{mine:'真实当前稿'}},{id:'pub-title',kind:'pubslot',locked:{slot:'标题'},fields:{final:'已采用标题'}}]));assert.equal(f.library.readCoverPackaging({contentId:f.contentId}).kind,'jc-doc');
 f.put(f.draft,'<script id="jc-doc" type="application/json">{broken}</script>');assert.equal(f.library.readCoverPackaging({contentId:f.contentId}).kind,'unavailable');
});
