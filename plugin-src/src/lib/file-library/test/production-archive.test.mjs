import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {createLibrary,openLibrary,backupLibrary,restoreBackup,__testing} from '../index.mjs';
process.env.NODE_ENV='test';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function fixture(t){const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'nova-production-archive-'));t.after(()=>{__testing.setHook(undefined);fs.rmSync(root,{recursive:true,force:true});});const l=createLibrary(path.join(root,'library'));return {root,l};}
const mutate=(l,op,input={})=>l.mutateProduction(op,{expectedToken:l.readProduction().editToken,...input});
function claimed(l,config={}){const t=mutate(l,'createTask',{kind:'research',...config,title:'来源调研',prompt:'固定请求原文',tools:[],budget:{amount:0,currency:'REQ'}}).tasks.at(-1);const identity={taskId:t.id,attemptId:t.activeAttemptId,claimToken:randomUUID(),workerId:'archive-test'};l.mutateProduction('claimTask',identity);return identity;}
const result=()=>({summary:'完整结论\n第二段',artifacts:[{id:randomUUID(),kind:'analysis',title:'分析全文',text:'全文内容\n不截断原始材料',assetHash:null,data:{source:'https://example.com/evidence'}}]});
test('submitted archive writes full Markdown, structured facts, hashes and real CAS report links without changing receipt',t=>{
 const {root,l}=fixture(t),identity=claimed(l),source=path.join(root,'report.html');fs.writeFileSync(source,'<!doctype html><html><body>报告正文</body></html>');const asset=l.importAsset(source,{purpose:'production-report'}),r=result();r.artifacts.push({id:randomUUID(),kind:'knowledge',title:'知识候选',text:'尚需单独审核',assetHash:null,data:null});r.artifacts.push({id:randomUUID(),kind:'report',title:'完整报告',text:'关联HTML',assetHash:asset.assetHash,data:{pages:[{title:'第一页',assetHash:asset.assetHash},{title:'第二页',assetHash:asset.assetHash}]}});
 const submitted=l.mutateProduction('submitTask',{...identity,result:r});
 assert.equal(typeof l.rebuildProductionArchive,'function');
 const archive=l.rebuildProductionArchive(identity.taskId),manifest=JSON.parse(fs.readFileSync(path.join(archive.directory,'manifest.json'))),json=JSON.parse(fs.readFileSync(path.join(archive.directory,'结果.json'))),md=fs.readFileSync(path.join(archive.directory,'结果.md'),'utf8');
 assert.equal(submitted.knowledge[0].status,'candidate');assert.equal(archive.status,'submitted');assert.equal(manifest.libraryId,l.info.libraryId);assert.equal(manifest.receiptHash,submitted.tasks[0].attempts[0].receipt.sha256);assert.equal(json.result.artifacts[0].text,r.artifacts[0].text);assert.match(md,/待人工验收/);assert.match(md,/人工整理请另存/);assert.match(md,/全文内容/);
 assert.equal(manifest.assets.length,1);const linked=path.resolve(archive.directory,manifest.assets[0].relativePath);assert.equal(hash(fs.readFileSync(linked)),asset.assetHash);assert(['text/plain','text/html'].includes(manifest.assets[0].detectedType));
 for(const file of manifest.files)assert.equal(hash(fs.readFileSync(path.join(archive.directory,file.name))),file.sha256);
 assert(!fs.readFileSync(path.join(archive.directory,'结果.json'),'utf8').includes(identity.claimToken));
 assert.deepEqual(l.readProduction().tasks,submitted.tasks);assert.equal(l.rebuildProductionArchive(identity.taskId).directory,archive.directory);const report=l.readProduction().reports[0];mutate(l,'setReportPosition',{id:report.id,pageId:report.pages[1].id});assert.equal(l.rebuildProductionArchive(identity.taskId).directory,archive.directory);fs.rmSync(archive.directory,{recursive:true});assert.equal(l.rebuildProductionArchive(identity.taskId).directory,archive.directory);assert(fs.existsSync(path.join(archive.directory,'manifest.json')));
 const accepted=mutate(l,'acceptTask',{taskId:identity.taskId,attemptId:identity.attemptId,receiptHash:archive.receiptHash}),next=l.rebuildProductionArchive(identity.taskId);assert.equal(accepted.knowledge[0].status,'candidate');assert.equal(next.status,'accepted');assert.notEqual(next.directory,archive.directory);assert.match(fs.readFileSync(path.join(next.directory,'结果.md'),'utf8'),/人工已验收/);assert.deepEqual(l.readProduction().tasks,accepted.tasks);
});
test('archive refuses traversal, live drafts and symlink output without writing outside the library',t=>{
 const {root,l}=fixture(t),identity=claimed(l);assert.equal(typeof l.rebuildProductionArchive,'function');
 assert.throws(()=>l.rebuildProductionArchive('../outside'),{code:'INVALID_INPUT'});assert.throws(()=>l.rebuildProductionArchive(identity.taskId),{code:'ARCHIVE_NOT_READY'});
 const outside=path.join(root,'outside');fs.mkdirSync(outside);fs.symlinkSync(outside,path.join(l.info.root,'知识库'),'dir');
 const submitted=l.mutateProduction('submitTask',{...identity,result:result()});assert.equal(submitted.tasks[0].attempts[0].status,'submitted');assert(submitted.archiveWarnings.length>0);assert.equal(fs.readdirSync(outside).length,0);assert.throws(()=>l.rebuildProductionArchive(identity.taskId),{code:'UNSAFE_PATH'});
 fs.unlinkSync(path.join(l.info.root,'知识库'));assert.equal(l.rebuildProductionArchive(identity.taskId).status,'submitted');
});
test('edited projection is preserved with a warning and cannot silently become a new source fact',t=>{
 const {l}=fixture(t),identity=claimed(l);l.mutateProduction('submitTask',{...identity,result:result()});assert.equal(typeof l.rebuildProductionArchive,'function');const archive=l.rebuildProductionArchive(identity.taskId),file=path.join(archive.directory,'结果.md');fs.writeFileSync(file,'人工编辑须保留');
 const before=l.readProduction(),rebuilt=l.rebuildProductionArchive(identity.taskId);assert(rebuilt.warnings.some(s=>s.includes('人工')));assert.equal(fs.readFileSync(file,'utf8'),'人工编辑须保留');assert.deepEqual(l.readProduction(),before);
});
test('projection publication failure leaves submission committed and rebuilding recovers the same receipt',t=>{
 const {l}=fixture(t),identity=claimed(l);__testing.setHook(e=>{if(e.phase==='productionArchiveBeforePublish')throw Object.assign(Error('simulated disk failure'),{code:'EIO'});});
 const submitted=l.mutateProduction('submitTask',{...identity,result:result()});assert.equal(submitted.tasks[0].attempts[0].status,'submitted');assert(submitted.archiveWarnings.length>0);__testing.setHook(undefined);
 const recovered=openLibrary(l.info.root).rebuildProductionArchive(identity.taskId);assert.equal(recovered.receiptHash,submitted.tasks[0].attempts[0].receipt.sha256);assert(fs.existsSync(path.join(recovered.directory,'manifest.json')));
});


test('attempt and library archive bindings remain separate across retry and rebuild',t=>{
 const {root,l}=fixture(t),first=claimed(l);l.mutateProduction('failTask',{...first,failure:{code:'RESEARCH_FAILED',message:'模拟第一尝试失败'}});assert.throws(()=>l.rebuildProductionArchive(first.taskId),{code:'ARCHIVE_NOT_READY'});
 const retried=mutate(l,'retryTask',{taskId:first.taskId,host:'workbuddy'}).tasks[0],second={taskId:retried.id,attemptId:retried.activeAttemptId,claimToken:randomUUID(),workerId:'archive-second'};l.mutateProduction('claimTask',second);l.mutateProduction('submitTask',{...second,result:result()});const b=l.rebuildProductionArchive(first.taskId);
 assert.notEqual(first.attemptId,b.attemptId);assert.equal(b.attemptId,second.attemptId);assert(!b.directory.split(path.sep).includes(first.attemptId));assert.equal(l.readProduction().tasks[0].attempts[0].status,'failed');
 const other=createLibrary(path.join(root,'other-library')),third=claimed(other);other.mutateProduction('submitTask',{...third,result:result()});const c=other.rebuildProductionArchive(third.taskId);assert(c.directory.startsWith(other.info.root+path.sep));assert.notEqual(JSON.parse(fs.readFileSync(path.join(c.directory,'manifest.json'))).libraryId,l.info.libraryId);assert.throws(()=>other.rebuildProductionArchive(first.taskId),{code:'NOT_FOUND'});
});


test('the four fixed archive categories are derived from task facts',t=>{
 const {l}=fixture(t),content=l.createContent({title:'内容项目',body:'原稿'}),account=mutate(l,'saveAccount',{name:'账号',platform:'抖音',url:'https://example.com/user',note:'',tags:[],images:[],reportIds:[]}).accounts[0];
 for(const [config,category]of [[{kind:'research',contentId:content.id},'调研报告'],[{kind:'analysis',accountId:account.id,contentId:content.id},'账号拆解'],[{kind:'writing',contentId:content.id},'内容项目'],[{kind:'analysis'},'创作知识']]){
  const identity=claimed(l,config);l.mutateProduction('submitTask',{...identity,result:result()});const archive=l.rebuildProductionArchive(identity.taskId);assert.equal(archive.category,category);assert.equal(path.relative(l.info.root,archive.directory).split(path.sep)[2],category);assert.equal(JSON.parse(fs.readFileSync(path.join(archive.directory,'manifest.json'))).category,category);
 }
 assert.equal(l.readContent(content.id).body,'原稿');
});
test('missing CAS references make archive not ready and are recoverable without changing the submitted evidence',t=>{
 const {root,l}=fixture(t),identity=claimed(l),file=path.join(root,'later.html'),bytes='<!doctype html><html><body>later evidence</body></html>',assetHash=hash(bytes),r=result();r.artifacts[0].data={references:[{mediaAssetHash:assetHash,sourcePath:'/arbitrary/path-is-never-read'}]};fs.writeFileSync(file,bytes);
 const submitted=l.mutateProduction('submitTask',{...identity,result:r}),missing=l.rebuildProductionArchive(identity.taskId);assert.equal(missing.ready,false);assert(missing.warnings.length>0);assert(submitted.archiveWarnings.length>0);l.importAsset(file,{purpose:'production-report'});
 const complete=l.rebuildProductionArchive(identity.taskId);assert.equal(complete.ready,true);assert.notEqual(complete.directory,missing.directory);assert.deepEqual(l.readProduction().tasks,submitted.tasks);
});
test('whole-library backup and restore preserve archive files and their relative CAS links',t=>{
 const {root,l}=fixture(t),identity=claimed(l);l.mutateProduction('submitTask',{...identity,result:result()});const archive=l.rebuildProductionArchive(identity.taskId),relative=path.relative(l.info.root,archive.directory),before=fs.readFileSync(path.join(archive.directory,'结果.json'));
 backupLibrary(l.info.root,path.join(root,'backup'));restoreBackup(path.join(root,'backup'),path.join(root,'restored'));const restored=openLibrary(path.join(root,'restored')),rebuilt=restored.rebuildProductionArchive(identity.taskId);assert.equal(path.relative(restored.info.root,rebuilt.directory),relative);assert(fs.readFileSync(path.join(rebuilt.directory,'结果.json')).equals(before));
});
