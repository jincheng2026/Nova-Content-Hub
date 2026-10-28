import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createVault} from '../index.mjs';
import {scan,json,digest,withVaultReadLock} from '../core.mjs';
const api=await import('../packaging.mjs').catch(error=>{if(error.code==='ERR_MODULE_NOT_FOUND')return {};throw error;});
function read(runtime,input){assert.equal(typeof api.readVaultPackaging,'function','controlled packaging snapshot must exist');return api.readVaultPackaging(runtime,input);}
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'vault-packaging-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const binding=createVault(root),vaultId=json(root,'.workbench/vault.json').vaultId;return {root:json(binding.root,'vault-binding.json').vaultRoot,runtime:binding.root,vaultId,put(relative,text){const file=path.join(root,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);return file;},documents(){return scan(root,vaultId).documents;}};}
const dir='05_内容草稿/T044_包装';
const html=(page='page044',mine='当前HTML作者稿',extras=[])=>'<html><script>throw Error("must not execute")</script><script id="jc-doc" type="application/json">'+JSON.stringify({schema:1,page_id:page,content_id:'T044',items:[{id:'seg-last',kind:'segment',locked:{order:2},fields:{mine:mine+'第二段'}},{id:'seg-first',kind:'segment',locked:{order:1},fields:{mine:mine+'第一段'}},...['标题','封面文字','简介'].map((slot,index)=>({id:'pub-'+index,kind:'pubslot',locked:{slot},fields:{final:index===1?'':slot+'已选'}})),...extras]})+'</script></html>';
function page(f,name='创作页.html',body=html()){f.put(dir+'/'+name,body);return f.documents().find(doc=>doc.relativePath===dir+'/'+name);}
function pin(f,document){f.put(dir+'/创作过程.json',JSON.stringify({format:'nova-work-flow',schemaVersion:1,work:{vaultId:f.vaultId,workId:'T044'},artifacts:[],decisions:[],metaQuestions:{},currentSource:{sourceId:'drafts',documentId:document.id,relativePath:document.relativePath,hash:document.hash,evidence:{actor:'author',text:'明确当前稿',at:'2026-10-28T00:00:00.000Z'}}}));}
function unchangedTree(root){const records=[];function walk(relative=''){for(const entry of fs.readdirSync(path.join(root,relative),{withFileTypes:true})){const next=relative?relative+'/'+entry.name:entry.name;if(entry.isDirectory())walk(next);else if(entry.isFile())records.push([next,digest(fs.readFileSync(path.join(root,next)))]);}}walk();return records;}
test('reads authoritative HTML packaging and ordered current mine without executing HTML or projecting the library',t=>{
 const f=fixture(t),document=page(f),before=unchangedTree(f.root);
 const value=read(f.runtime,{contentId:document.contentId});
 assert.equal(value.kind,'jc-doc');assert.deepEqual(value.source,{vaultId:f.vaultId,workId:'T044',documentId:document.id,pageId:'page044',revision:document.hash});
 assert.equal(value.fields.title.value,'标题已选');assert.equal(value.fields.coverText.value,'');
 assert.equal(value.script.text,'当前HTML作者稿第一段\n\n当前HTML作者稿第二段');assert.equal(value.script.hash,digest(value.script.text));
 assert.equal(value.script.manuscriptSource.documentId,document.id);assert.equal(value.selectionToken.length,64);
 assert.deepEqual(unchangedTree(f.root),before);assert.equal(typeof value.then,'undefined');
});
test('selecting an older packaging HTML never replaces an explicitly current Markdown manuscript',t=>{
 const f=fixture(t),old=page(f,'旧创作页.html',html('old-page','过时稿'));
 f.put(dir+'/工作稿.md','# 作者重新确认\r\n\r\n  保留原始字节文本。');const current=f.documents().find(doc=>doc.relativePath===dir+'/工作稿.md');pin(f,current);
 const before=unchangedTree(f.root),choice=read(f.runtime,{contentId:current.contentId});
 assert.equal(choice.kind,'choose-source');assert.deepEqual(choice.candidates.map(candidate=>candidate.documentId),[old.id]);
 const selected=read(f.runtime,{contentId:current.contentId,documentId:old.id});
 assert.equal(selected.kind,'jc-doc');assert.equal(selected.source.documentId,old.id);
 assert.equal(selected.script.text,'# 作者重新确认\r\n\r\n  保留原始字节文本。');assert.equal(selected.script.manuscriptSource.documentId,current.id);
 assert.deepEqual(unchangedTree(f.root),before);
});
test('an explicit Markdown current source requires packaging selection even with multiple dated HTML versions',t=>{
 const f=fixture(t),first=page(f,'第一版.html',html('first')),second=page(f,'第二版.html',html('second'));
 f.put(dir+'/工作稿.txt','当前纯文本原稿');const current=f.documents().find(doc=>doc.relativePath===dir+'/工作稿.txt');pin(f,current);
 fs.utimesSync(path.join(f.root,first.relativePath),new Date('2026-10-28'),new Date('2026-10-28'));
 assert.equal(read(f.runtime,{contentId:current.contentId}).kind,'choose-source');
 const chosen=read(f.runtime,{contentId:current.contentId,documentId:second.id});assert.equal(chosen.source.documentId,second.id);assert.equal(chosen.script.text,'当前纯文本原稿');
});
test('current-source conflicts and missing author selections block before any packaging fallback',t=>{
 const f=fixture(t),first=page(f,'创作页甲.html',html('first'));page(f,'创作页乙.html',html('second'));
 assert.equal(read(f.runtime,{contentId:first.contentId,documentId:first.id}).kind,'unavailable');
 pin(f,{...first,id:'doc-'+'f'.repeat(32),relativePath:dir+'/被移走.md'});
 const missing=read(f.runtime,{contentId:first.contentId,documentId:first.id});assert.equal(missing.kind,'unavailable');assert.ok(missing.issues.some(issue=>issue.includes('CURRENT_SOURCE')));
});
test('only non-Vault and same-work absence of a jc-doc may use legacy',t=>{
 const nonVault=fs.mkdtempSync(path.join(os.tmpdir(),'non-vault-packaging-'));t.after(()=>fs.rmSync(nonVault,{recursive:true,force:true}));
 assert.equal(read(nonVault,{contentId:'ordinary'}).kind,'legacy');
 const f=fixture(t);f.put(dir+'/工作稿.md','真实当前稿');f.put(dir+'/普通说明.html','<html><body>没有创作数据块</body></html>');const current=f.documents().find(doc=>doc.relativePath===dir+'/工作稿.md');pin(f,current);
 const value=read(f.runtime,{contentId:current.contentId});assert.equal(value.kind,'legacy');assert.equal(value.script.text,'真实当前稿');
 f.put(dir+'/损坏.html','<script id="jc-doc" type="application/json">{broken}</script>');
 assert.equal(read(f.runtime,{contentId:current.contentId}).kind,'unavailable');
});
test('malformed selected HTML, cross-work IDs and duplicate page IDs never borrow legacy title fields',t=>{
 const f=fixture(t),document=page(f);f.put('05_内容草稿/T005_其他/创作页.html',html('other-page').replace('"T044"','"T005"'));
 const other=f.documents().find(doc=>doc.tNumber==='T005');assert.equal(read(f.runtime,{contentId:document.contentId,documentId:other.id}).kind,'unavailable');
 f.put('05_内容草稿/T005_其他/创作页.html',html('page044').replace('"T044"','"T005"'));
 const duplicate=read(f.runtime,{contentId:document.contentId});assert.equal(duplicate.kind,'unavailable');assert.ok(duplicate.issues.some(issue=>issue.includes('DUPLICATE_PAGE_ID')));
});
test('selection tokens bind independent manuscript and packaging identities and revisions',t=>{
 const f=fixture(t),document=page(f);f.put(dir+'/工作稿.md','明确稿A');const current=f.documents().find(doc=>doc.relativePath===dir+'/工作稿.md');pin(f,current);
 const input={contentId:current.contentId,documentId:document.id},first=read(f.runtime,input);assert.equal(read(f.runtime,input).selectionToken,first.selectionToken);
 f.put(dir+'/工作稿.md','明确稿B');const second=read(f.runtime,input);assert.notEqual(second.selectionToken,first.selectionToken);assert.notEqual(second.script.hash,first.script.hash);
 f.put(document.relativePath,html().replace('标题已选','新的包装标题'));const third=read(f.runtime,input);assert.notEqual(third.selectionToken,second.selectionToken);assert.equal(third.script.hash,second.script.hash);
});
test('a same-work rejected HTML location cannot silently make the Vault look legacy',t=>{
 const f=fixture(t);f.put(dir+'/工作稿.md','当前稿');const current=f.documents().find(doc=>doc.relativePath===dir+'/工作稿.md');pin(f,current);
 const outside=path.join(os.tmpdir(),'unread-packaging-'+Date.now()+'.html');fs.writeFileSync(outside,html());t.after(()=>fs.rmSync(outside,{force:true}));fs.symlinkSync(outside,path.join(f.root,dir,'创作页.html'));
 const value=read(f.runtime,{contentId:current.contentId});assert.equal(value.kind,'unavailable');assert.ok(value.issues.some(issue=>issue.includes('SOURCE_UNREADABLE')));
});
test('read snapshot reuses a synchronous Vault read scope and leaves source files unchanged',t=>{
 const f=fixture(t),document=page(f),before=unchangedTree(f.root);
 const value=withVaultReadLock(f.root,()=>read(f.runtime,{contentId:document.contentId}));assert.equal(value.kind,'jc-doc');assert.deepEqual(unchangedTree(f.root),before);
});

test('missing or empty current manuscripts block before legacy instead of using topic text as a script',t=>{
 const f=fixture(t);f.put('04_选题库/T044_包装.md','# 只有选题，还没写稿');const topic=f.documents().find(doc=>doc.tNumber==='T044');
 assert.equal(read(f.runtime,{contentId:topic.contentId}).kind,'unavailable');
 f.put(dir+'/工作稿.md',' \r\n ');const current=f.documents().find(doc=>doc.relativePath===dir+'/工作稿.md');pin(f,current);
 const empty=read(f.runtime,{contentId:current.contentId});assert.equal(empty.kind,'unavailable');assert.ok(empty.issues.some(issue=>issue.includes('CURRENT_MANUSCRIPT')));
});
test('explicit selection of an invalid or differently identified jc-doc never becomes legacy',t=>{
 const f=fixture(t),document=page(f);f.put(dir+'/工作稿.md','当前明确正文');const current=f.documents().find(doc=>doc.relativePath===dir+'/工作稿.md');pin(f,current);
 f.put(document.relativePath,html().replace('"T044"','"T005"'));
 const mismatch=read(f.runtime,{contentId:current.contentId,documentId:document.id});assert.equal(mismatch.kind,'unavailable');assert.ok(mismatch.issues.some(issue=>issue.includes('WORK_IDENTITY')));
 f.put(document.relativePath,'<script id="jc-doc" type="application/json">{"schema":1,"page_id":"page044","content_id":"T044","items":[],"items":[]}</script>');
 const duplicate=read(f.runtime,{contentId:current.contentId,documentId:document.id});assert.equal(duplicate.kind,'unavailable');assert.ok(duplicate.issues.some(issue=>issue.includes('DUPLICATE_JSON_KEY')));
});

test('all snapshot variants carry their requested content identity and reject extra path or root input',t=>{
 const f=fixture(t),document=page(f);
 assert.equal(read(f.runtime,{contentId:document.contentId}).contentId,document.contentId);
 f.put(dir+'/工作稿.md','当前稿');const current=f.documents().find(doc=>doc.relativePath===dir+'/工作稿.md');pin(f,current);
 assert.equal(read(f.runtime,{contentId:current.contentId}).contentId,current.contentId);
 for(const extra of [{root:f.root},{relativePath:document.relativePath},{path:'/tmp/anything'},{source:{documentId:document.id}}]){
  const invalid=read(f.runtime,{contentId:current.contentId,...extra});assert.equal(invalid.kind,'unavailable');assert.equal(invalid.contentId,current.contentId);assert.ok(invalid.issues.includes('INVALID_PACKAGING_INPUT'));
 }
 const nonVault=fs.mkdtempSync(path.join(os.tmpdir(),'non-vault-snapshot-'));t.after(()=>fs.rmSync(nonVault,{recursive:true,force:true}));
 assert.equal(read(nonVault,{contentId:'ordinary'}).contentId,'ordinary');
});

test('interrupted creation journals block snapshots without replaying or clearing any pending plan',t=>{
 const f=fixture(t),document=page(f),mid='interrupted-creation';
 f.put('.workbench/pending-mutations/'+mid+'.json',JSON.stringify({format:'nova-vault-pending-mutation',schemaVersion:1,vaultId:f.vaultId,receipt:{action:'creation-document',status:'pending',mutationId:mid,after:'not-applied'}}));
 const before=unchangedTree(f.root),value=read(f.runtime,{contentId:document.contentId});
 assert.equal(value.kind,'unavailable');assert.ok(value.issues.includes('PACKAGING_RECOVERY_REQUIRED'));
 assert.deepEqual(unchangedTree(f.root),before);
});
test('unmigrated historical pending receipts block without scanning or migrating history',t=>{
 const f=fixture(t),document=page(f);
 fs.unlinkSync(path.join(f.root,'.workbench/pending-mutations-index.json'));
 f.put('.workbench/mutations/legacy-pending.json',JSON.stringify({format:'nova-vault-mutation',status:'pending',action:'creation-document',mutationId:'legacy-pending'}));
 const before=unchangedTree(f.root),value=read(f.runtime,{contentId:document.contentId});
 assert.equal(value.kind,'unavailable');assert.ok(value.issues.includes('PACKAGING_RECOVERY_UNVERIFIED'));
 assert.deepEqual(unchangedTree(f.root),before);assert.equal(fs.existsSync(path.join(f.root,'.workbench/pending-mutations-index.json')),false);
});

test('a resolved ordinary HTML with no jc-doc remains on the legacy cover branch',t=>{
 const f=fixture(t);f.put(dir+'/创作页.html','<html><body><p>旧式普通HTML，没有jc-doc</p></body></html>');const current=f.documents().find(doc=>doc.relativePath===dir+'/创作页.html');
 const value=read(f.runtime,{contentId:current.contentId});assert.equal(value.kind,'legacy');assert.equal(value.script,null);
});
