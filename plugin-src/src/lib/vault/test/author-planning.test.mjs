import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createVault,openVault} from '../index.mjs';
import {contentSources,digest,readVaultSnapshot,vaultState,withVaultLock,runMutation,saveVaultDocument,trashVaultDocument,validateVaultRestoreSource,restoreVaultSource,isManagedAuthorPlanningPath} from '../core.mjs';
import * as authorPlanning from '../author-planning.mjs';
const {readAuthorPlanningStatus,setAuthorPlanningStatus,validateAuthorPlanningReceipt}=authorPlanning;
import {readBoundSourceCatalog,readBoundSourceFile} from '../source-map.mjs';
import {createLibrary} from '../../file-library/index.mjs';

function fixture(t,{status='待写',draft=false,recorded=false,published=false}={}) {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'nova-author-planning-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const runtime=createVault(root).root,b=vaultState(runtime),card='04_选题库/T050_作者选题.md',directory='05_内容草稿/T050_作者选题';
 fs.writeFileSync(path.join(root,card),`# T050 作者选题\n\n- **状态**：${status}\n\n本人原始想法。\n`);
 if(draft||recorded||published){
  fs.mkdirSync(path.join(root,directory),{recursive:true});
  const html='<script id="jc-doc" type="application/json">'+JSON.stringify({schema:1,page_id:'author-planning-page',items:[{id:'info',kind:'info',fields:{recorded:recorded?'2026-10-28':''}},{id:'body',kind:'segment',locked:{order:1},fields:{mine:'不可被作者安排改写的正文。'}}]})+'</script>';
  fs.writeFileSync(path.join(root,directory,'创作页.html'),html);
  fs.writeFileSync(path.join(root,directory,'阶段账本.json'),JSON.stringify({facts:['confirmed-draft'],hash:'existing-stage-fact'}));
  fs.mkdirSync(path.join(root,directory,'助手任务'),{recursive:true});fs.writeFileSync(path.join(root,directory,'助手任务','receipt.json'),JSON.stringify({status:'submitted',hash:'original-task-receipt'}));
 }
 if(published){
  const archive='06_发布复盘/正式发布档案/video';fs.mkdirSync(path.join(root,archive,'.system'),{recursive:true});
  fs.writeFileSync(path.join(root,directory,'正式发布档案.json'),JSON.stringify({format:'nova-publication-reference',work:{vaultId:b.vaultId,workId:'T050'},videoId:'video',archiveDirectory:archive}));
  fs.writeFileSync(path.join(root,archive,'.system/manifest.json'),JSON.stringify({schema_version:2,video_id:'video',work_id:'T050',nova:{vault_id:b.vaultId,decisions:[{actor:'author'}]},platforms:{douyin:{url:'https://example.test/video',published_at:'2026-10-28T00:00:00.000Z'}}}));
 }
 const source=contentSources(readVaultSnapshot(runtime)).find(x=>x.tNumber==='T050');
 return {root:fs.realpathSync(root),runtime,contentId:source.contentId,card,directory};
}
const input=(f,state,status='paused',reason='作者本次安排')=>({contentId:f.contentId,status,reason,expectedRevision:state.revision,sourcePins:state.sourcePins});
const set=(f,state,status='paused',options={mutationId:randomUUID()})=>setAuthorPlanningStatus(f.runtime,input(f,state,status),options);
function originalHashes(root){const result={};function walk(relative=''){for(const entry of fs.readdirSync(path.join(root,relative),{withFileTypes:true})){if(entry.name==='.workbench'||entry.name==='作者安排.json')continue;const next=relative?relative+'/'+entry.name:entry.name;if(entry.isDirectory())walk(next);else result[next]=digest(fs.readFileSync(path.join(root,next)));}}walk();return result;}

test('no explicit selection writes nothing and derives existing pause/draft/recording/publication priorities',t=>{
 for(const [options,expected] of [[{},'todo'],[{draft:true},'written'],[{status:'暂缓',draft:true},'paused'],[{recorded:true,status:'暂缓'},'paused'],[{published:true,status:'暂缓'},'written']]){
  const f=fixture(t,options),before=originalHashes(f.root),state=readAuthorPlanningStatus(f.runtime,f.contentId);
  assert.equal(state.status,null);assert.equal(state.derivedStatus,expected);assert.equal(state.effectiveStatus,expected);assert.equal(state.revision,null);assert.deepEqual(originalHashes(f.root),before);
 }
});
test('explicit status persists a same-T managed record and clear appends history without changing source',t=>{
 const f=fixture(t),initial=readAuthorPlanningStatus(f.runtime,f.contentId),before=originalHashes(f.root),paused=set(f,initial);
 assert.equal(paused.status,'paused');assert.equal(paused.effectiveStatus,'paused');assert.equal(paused.history.length,1);assert.notEqual(paused.revision,null);
 assert.deepEqual(readAuthorPlanningStatus(openVault(f.root).root,f.contentId),paused);
 const cleared=set(f,paused,null);assert.equal(cleared.status,null);assert.equal(cleared.effectiveStatus,'todo');assert.equal(cleared.history.length,2);assert.equal(cleared.history[0].status,'paused');assert.deepEqual(originalHashes(f.root),before);
});
test('marking written without an actual draft never creates manuscript or formal facts',t=>{
 const f=fixture(t),state=set(f,readAuthorPlanningStatus(f.runtime,f.contentId),'written');
 assert.equal(state.effectiveStatus,'written');assert.equal(state.facts.hasDraft,false);assert.equal(state.facts.recorded,false);assert.equal(state.facts.published,false);assert.match(state.notice,/尚未找到稿件/);
});
test('all three choices preserve recorded and published facts plus every original asset hash',t=>{
 const f=fixture(t,{draft:true,recorded:true,published:true,status:'已发布'}),before=originalHashes(f.root);let state=readAuthorPlanningStatus(f.runtime,f.contentId);
 for(const status of ['todo','paused','written']){state=set(f,state,status);assert.equal(state.status,status);assert.equal(state.facts.recorded,true);assert.equal(state.facts.published,true);assert.equal(state.facts.hasDraft,true);assert.deepEqual(originalHashes(f.root),before);}
});
test('an external card edit makes the last decision stale and requires current exact pins to reconfirm',t=>{
 const f=fixture(t),old=set(f,readAuthorPlanningStatus(f.runtime,f.contentId));fs.appendFileSync(path.join(f.root,f.card),'\n作者外部修改。');
 const latest=readAuthorPlanningStatus(f.runtime,f.contentId);assert.equal(latest.stale,true);assert.equal(latest.status,'paused');assert.deepEqual(latest.history,old.history);
 assert.throws(()=>set(f,old,'todo'),{code:'CONFLICT'});
 const confirmed=set(f,latest,'paused');assert.equal(confirmed.stale,false);assert.equal(confirmed.history.length,2);assert.notDeepEqual(confirmed.history[0].sourcePins,confirmed.sourcePins);
});
test('overview edits are included in source pins and cannot be silently accepted',t=>{
 const f=fixture(t),state=set(f,readAuthorPlanningStatus(f.runtime,f.contentId));fs.appendFileSync(path.join(f.root,'04_选题库/00_选题总览.md'),'\n| T050 | 作者选题 | 暂缓 |\n');
 const latest=readAuthorPlanningStatus(f.runtime,f.contentId);assert.equal(latest.stale,true);assert.throws(()=>set(f,state),{code:'CONFLICT'});
});
test('CAS and durable mutation replay preserve newer author decisions',t=>{
 const f=fixture(t),initial=readAuthorPlanningStatus(f.runtime,f.contentId),options={mutationId:randomUUID()},first=set(f,initial,'paused',options),later=set(f,first,'written');
 assert.throws(()=>set(f,initial,'todo'),{code:'CONFLICT'});assert.deepEqual(set(f,initial,'paused',options),first);
 assert.equal(readAuthorPlanningStatus(f.runtime,f.contentId).revision,later.revision);assert.throws(()=>set(f,initial,'todo',options),{code:'INVALID_INPUT'});
});
test('pending managed write recovers after restart without replaying later source changes',t=>{
 const f=fixture(t),options={mutationId:randomUUID()},state=set(f,readAuthorPlanningStatus(f.runtime,f.contentId),'paused',options),file=path.join(f.root,state.relativePath),receipt=path.join(f.root,`.workbench/mutations/${options.mutationId}.json`),r=JSON.parse(fs.readFileSync(receipt));
 fs.unlinkSync(file);r.status='pending';fs.writeFileSync(receipt,JSON.stringify(r));fs.rmSync(path.join(f.root,'.workbench/pending-mutations-index.json'));
 assert.equal(readAuthorPlanningStatus(openVault(f.root).root,f.contentId).status,'paused');
});
test('concurrent lock ownership refuses writing without relaxing the global lock',t=>{
 const f=fixture(t),state=readAuthorPlanningStatus(f.runtime,f.contentId);
 withVaultLock(f.root,()=>assert.throws(()=>set(f,state),{code:'VAULT_BUSY'}));assert.equal(readAuthorPlanningStatus(f.runtime,f.contentId).revision,null);
});
test('unknown work, missing source, source conflicts and trashed projection refuse author mutation',t=>{
 const unknown=fixture(t);assert.throws(()=>readAuthorPlanningStatus(unknown.runtime,'unknown-content'),{code:'INVALID_INPUT'});
 const missing=fixture(t),initial=readAuthorPlanningStatus(missing.runtime,missing.contentId);fs.unlinkSync(path.join(missing.root,missing.card));assert.throws(()=>set(missing,initial));
 const conflict=fixture(t,{draft:true}),before=readAuthorPlanningStatus(conflict.runtime,conflict.contentId);fs.writeFileSync(path.join(conflict.root,conflict.directory,'第二创作页.html'),fs.readFileSync(path.join(conflict.root,conflict.directory,'创作页.html')));assert.throws(()=>set(conflict,before),{code:'CONFLICT'});
 const trashed=fixture(t),s=readAuthorPlanningStatus(trashed.runtime,trashed.contentId);fs.writeFileSync(path.join(trashed.root,'.workbench/projection.json'),JSON.stringify({contents:{[trashed.contentId]:{trashMutationId:randomUUID(),tNumber:'T050',relativePath:trashed.card}}}));assert.throws(()=>set(trashed,s));
});
test('same-number records and pins cannot be moved to another vault or physical root',t=>{
 const a=fixture(t),b=fixture(t),state=set(a,readAuthorPlanningStatus(a.runtime,a.contentId));
 assert.throws(()=>setAuthorPlanningStatus(b.runtime,input(a,state),{mutationId:randomUUID()}));
 fs.mkdirSync(path.dirname(path.join(b.root,state.relativePath)),{recursive:true});fs.copyFileSync(path.join(a.root,state.relativePath),path.join(b.root,state.relativePath));
 assert.throws(()=>readAuthorPlanningStatus(b.runtime,b.contentId));
 const file=path.join(a.root,state.relativePath),record=JSON.parse(fs.readFileSync(file));record.rootIdentity.ino='0';fs.writeFileSync(file,JSON.stringify(record));assert.throws(()=>readAuthorPlanningStatus(a.runtime,a.contentId));
});
test('malformed managed records and source read failures never become todo',t=>{
 const f=fixture(t),state=set(f,readAuthorPlanningStatus(f.runtime,f.contentId));fs.writeFileSync(path.join(f.root,state.relativePath),'{}');assert.throws(()=>readAuthorPlanningStatus(f.runtime,f.contentId));
 const linked=fixture(t);fs.unlinkSync(path.join(linked.root,linked.card));fs.symlinkSync(path.join(linked.root,'README.md'),path.join(linked.root,linked.card));assert.throws(()=>readAuthorPlanningStatus(linked.runtime,linked.contentId));
});
test('native pins reject omitted, duplicate, changed and path-injected input before any write',t=>{
 const f=fixture(t),state=readAuthorPlanningStatus(f.runtime,f.contentId),original=originalHashes(f.root);
 for(const pins of [[],[...state.sourcePins,state.sourcePins[0]],state.sourcePins.map((p,i)=>i? p:{...p,hash:'a'.repeat(64)}),[{documentId:'fake',relativePath:'../outside',hash:'a'.repeat(64)}]])assert.throws(()=>setAuthorPlanningStatus(f.runtime,{...input(f,state),sourcePins:pins},{mutationId:randomUUID()}));
 for(const status of ['published','recorded','bad'])assert.throws(()=>set(f,state,status),{code:'INVALID_INPUT'});
 assert.throws(()=>setAuthorPlanningStatus(f.runtime,{...input(f,state),relativePath:'README.md'},{mutationId:randomUUID()}),{code:'INVALID_INPUT'});assert.deepEqual(originalHashes(f.root),original);
});
test('a previously committed author record that disappears is an error, never an implicit reset',t=>{
 const f=fixture(t),state=set(f,readAuthorPlanningStatus(f.runtime,f.contentId));fs.unlinkSync(path.join(f.root,state.relativePath));
 assert.throws(()=>readAuthorPlanningStatus(f.runtime,f.contentId),{code:'CONFLICT'});
});
test('receipt recovery validates the exact managed request and bytes without requiring live source pins',t=>{
 const f=fixture(t),options={mutationId:randomUUID()},state=set(f,readAuthorPlanningStatus(f.runtime,f.contentId),'paused',options),receipt=JSON.parse(fs.readFileSync(path.join(f.root,`.workbench/mutations/${options.mutationId}.json`)));
 fs.appendFileSync(path.join(f.root,f.card),'\n来源后来变化。');assert.doesNotThrow(()=>validateAuthorPlanningReceipt(f.root,receipt));
 const changes=[r=>{r.path='README.md';},r=>{r.request.vaultId='other';r.requestHash=digest(JSON.stringify(r.request));},r=>{r.request.rootIdentity.ino='0';r.requestHash=digest(JSON.stringify(r.request));},r=>{r.request.input.status='published';r.requestHash=digest(JSON.stringify(r.request));},r=>{r.request.input.expectedRevision='b'.repeat(64);r.requestHash=digest(JSON.stringify(r.request));},r=>{r.beforeHash='a'.repeat(64);},r=>{r.request.input.sourcePins[0].hash='c'.repeat(64);r.requestHash=digest(JSON.stringify(r.request));},r=>{r.after=Buffer.from('{}').toString('base64');},r=>{const record=JSON.parse(Buffer.from(r.after,'base64'));record.work.workId='T051';r.after=Buffer.from(JSON.stringify(record)).toString('base64');},r=>{r.mutationId=randomUUID();},r=>{r.requestHash='d'.repeat(64);}];
 for(const change of changes){const damaged=structuredClone(receipt);change(damaged);assert.throws(()=>validateAuthorPlanningReceipt(f.root,damaged));}
 assert.equal(readAuthorPlanningStatus(f.runtime,f.contentId).revision,state.revision);
});

function anotherWork(f,tNumber,status='待写'){
 const card=`04_选题库/${tNumber}_批量安排.md`;
 fs.writeFileSync(path.join(f.root,card),`# ${tNumber} 批量安排\n\n- **状态**：${status}\n`);
 const source=contentSources(readVaultSnapshot(f.runtime)).find(item=>item.tNumber===tNumber);
 return {...f,tNumber,card,contentId:source.contentId};
}
test('batch returns the same fresh and stale decisions as single reads under one shared snapshot',t=>{
 assert.equal(typeof authorPlanning.readAuthorPlanningStatuses,'function');
 const f=fixture(t),second=anotherWork(f,'T051'),third=anotherWork(f,'T052','暂缓');
 const first=set(f,readAuthorPlanningStatus(f.runtime,f.contentId),'paused');set(second,readAuthorPlanningStatus(second.runtime,second.contentId),'written');
 fs.appendFileSync(path.join(f.root,f.card),'\n来源外部变更。');
 const expected=new Map([f,second,third].map(work=>[work.contentId,readAuthorPlanningStatus(f.runtime,work.contentId)]));
 const result=authorPlanning.readAuthorPlanningStatuses(f.runtime);assert.equal(result.entries.length,3);
 for(const entry of result.entries){assert.equal(entry.issue,null);assert.deepEqual(entry.value,expected.get(entry.contentId));}
 assert.equal(result.entries.find(entry=>entry.contentId===f.contentId).value.stale,true);assert.notEqual(first.sourcePins.find(pin=>pin.relativePath===f.card).hash,expected.get(f.contentId).sourcePins.find(pin=>pin.relativePath===f.card).hash);
});
test('batch opens one snapshot and one receipt index, while verifying shared overview bytes only linearly',t=>{
 assert.equal(typeof authorPlanning.readAuthorPlanningStatuses,'function');
 const f=fixture(t),works=[f,...Array.from({length:5},(_,n)=>anotherWork(f,'T'+String(51+n).padStart(3,'0')))];
 for(const work of works)set(work,readAuthorPlanningStatus(work.runtime,work.contentId),'paused');
 const readdir=fs.readdirSync,open=fs.openSync,counts=new Map(),directories=new Map();
 t.mock.method(fs,'readdirSync',function(filename,...args){const key=String(filename);directories.set(key,(directories.get(key)??0)+1);return readdir.call(this,filename,...args);});
 t.mock.method(fs,'openSync',function(filename,...args){const key=String(filename);counts.set(key,(counts.get(key)??0)+1);return open.call(this,filename,...args);});
 const result=authorPlanning.readAuthorPlanningStatuses(f.runtime);assert.equal(result.entries.length,works.length);assert.ok(result.entries.every(entry=>entry.value&&entry.issue===null));
 assert.equal(directories.get(f.root),1,'one complete source snapshot');
 assert.equal(directories.get(path.join(f.root,'.workbench/mutations')),1,'one shared historical receipt index');
 const receiptReads=[...counts].filter(([filename])=>filename.includes('/.workbench/mutations/'));assert.equal(receiptReads.length,works.length);assert.ok(receiptReads.every(([,count])=>count===1));
 for(const overview of ['04_选题库/00_选题总览.md','05_内容草稿/00_草稿总览.md'])assert.ok((counts.get(path.join(f.root,overview))??0)<=works.length+2,'overview reads may include core per-work derivation, never another per-row full snapshot');
});
test('one corrupt or missing committed record yields its own issue without resetting or poisoning other works',t=>{
 assert.equal(typeof authorPlanning.readAuthorPlanningStatuses,'function');
 const f=fixture(t),second=anotherWork(f,'T051'),third=anotherWork(f,'T052');
 const a=set(f,readAuthorPlanningStatus(f.runtime,f.contentId),'paused'),b=set(second,readAuthorPlanningStatus(f.runtime,second.contentId),'written');
 fs.writeFileSync(path.join(f.root,a.relativePath),'{}');fs.unlinkSync(path.join(f.root,b.relativePath));
 const entries=new Map(authorPlanning.readAuthorPlanningStatuses(f.runtime).entries.map(entry=>[entry.contentId,entry]));
 assert.equal(entries.get(f.contentId).value,null);assert.match(entries.get(f.contentId).issue,/作者安排/);assert.equal(entries.get(second.contentId).value,null);assert.match(entries.get(second.contentId).issue,/缺失/);
 assert.equal(entries.get(third.contentId).issue,null);assert.equal(entries.get(third.contentId).value.effectiveStatus,'todo');
});
test('managed records alone cannot invent ghost works, and a committed decision with missing source remains an issue',t=>{
 assert.equal(typeof authorPlanning.readAuthorPlanningStatuses,'function');
 const f=fixture(t),state=set(f,readAuthorPlanningStatus(f.runtime,f.contentId),'paused');
 fs.mkdirSync(path.join(f.root,'05_内容草稿/T999_仅受管记录'),{recursive:true});fs.writeFileSync(path.join(f.root,'05_内容草稿/T999_仅受管记录/作者安排.json'),'{}');
 fs.unlinkSync(path.join(f.root,f.card));const result=authorPlanning.readAuthorPlanningStatuses(f.runtime);assert.equal(result.entries.length,1);assert.equal(result.entries[0].contentId,f.contentId);assert.equal(result.entries[0].value,null);assert.ok(result.entries[0].issue);assert.ok(fs.existsSync(path.join(f.root,state.relativePath)));
});
test('batch classic and unbound old Vault inputs explicitly reject NOT_READY',t=>{
 assert.equal(typeof authorPlanning.readAuthorPlanningStatuses,'function');
 const f=fixture(t),classic=path.join(f.root,'classic-library');createLibrary(classic);assert.throws(()=>authorPlanning.readAuthorPlanningStatuses(classic),{code:'NOT_READY'});assert.throws(()=>authorPlanning.readAuthorPlanningStatuses(f.root),{code:'NOT_READY'});
});

test('batch values never bypass fresh write-time source pins or record CAS',t=>{
 const f=fixture(t),entry=authorPlanning.readAuthorPlanningStatuses(f.runtime).entries.find(item=>item.contentId===f.contentId);assert.equal(entry.issue,null);
 fs.appendFileSync(path.join(f.root,f.card),'\n批量读之后的作者外改。');assert.throws(()=>set(f,entry.value,'written'),{code:'CONFLICT'});
 const current=readAuthorPlanningStatus(f.runtime,f.contentId),saved=set(f,current,'paused');assert.throws(()=>set(f,current,'todo'),{code:'CONFLICT'});assert.equal(readAuthorPlanningStatus(f.runtime,f.contentId).revision,saved.revision);
});

test('managed author records are absent from ordinary scan/source catalogs and generic mutation paths',t=>{
 const f=fixture(t),state=set(f,readAuthorPlanningStatus(f.runtime,f.contentId),'paused'),before=fs.readFileSync(path.join(f.root,state.relativePath)),documentId='doc-'+digest(state.relativePath).slice(0,32);
 assert.ok(!readVaultSnapshot(f.runtime).documents.some(document=>document.relativePath===state.relativePath));
 const sourceRelative=state.relativePath.slice('05_内容草稿/'.length);assert.ok(!readBoundSourceCatalog(f.root,{sourceId:'drafts'}).files.some(file=>file.relativePath===sourceRelative));assert.throws(()=>readBoundSourceFile(f.root,{sourceId:'drafts',relativePath:sourceRelative}));
 assert.throws(()=>saveVaultDocument(f.runtime,{id:documentId,expectedHash:state.revision,text:'{}'},{mutationId:randomUUID()}));assert.throws(()=>trashVaultDocument(f.runtime,{id:documentId,expectedHash:state.revision},{mutationId:randomUUID()}));
 const source={relativePath:state.relativePath,trashMutationId:randomUUID(),hash:state.revision};assert.throws(()=>validateVaultRestoreSource(f.runtime,source),{code:'INVALID_INPUT'});assert.throws(()=>restoreVaultSource(f.runtime,source,{mutationId:randomUUID()}),{code:'INVALID_INPUT'});assert.deepEqual(fs.readFileSync(path.join(f.root,state.relativePath)),before);
});
test('generic recovery receipts cannot write or remove a managed author record',t=>{
 for(const action of ['save','trash']){const f=fixture(t),state=set(f,readAuthorPlanningStatus(f.runtime,f.contentId),'paused'),before=fs.readFileSync(path.join(f.root,state.relativePath));
  assert.throws(()=>runMutation(f.runtime,{action:'forged-generic'}, {mutationId:randomUUID()},()=>({action,path:state.relativePath,beforeHash:state.revision,after:action==='trash'?null:Buffer.from('{}').toString('base64')})));assert.deepEqual(fs.readFileSync(path.join(f.root,state.relativePath)),before);
 }
});
test('an ordinary same-named JSON outside the managed T path remains an ordinary source',t=>{
 const f=fixture(t),relative='02_内容素材/作者安排.json';fs.writeFileSync(path.join(f.root,relative),'{}');const document=readVaultSnapshot(f.runtime).documents.find(item=>item.relativePath===relative);assert.ok(document);assert.ok(readBoundSourceCatalog(f.root,{sourceId:'materials'}).files.some(file=>file.relativePath==='作者安排.json'));assert.equal(saveVaultDocument(f.runtime,{id:document.id,expectedHash:document.hash,text:'{"ordinary":true}'},{mutationId:randomUUID()}).text,'{"ordinary":true}');
});

test('managed author namespace recognizes Windows separators without capturing ordinary same-named files',()=>{
 assert.equal(isManagedAuthorPlanningPath('05_内容草稿\\T050_安排\\作者安排.json'),true);assert.equal(isManagedAuthorPlanningPath('05_内容草稿/已做/T050_安排/作者安排.json'),true);assert.equal(isManagedAuthorPlanningPath('02_内容素材/作者安排.json'),false);assert.equal(isManagedAuthorPlanningPath('05_内容草稿/T050_安排/子目录/作者安排.json'),false);
});

test('registered author recovery replays only frozen author bytes and exposes later source changes as stale',t=>{
 const f=fixture(t),options={mutationId:randomUUID()},state=set(f,readAuthorPlanningStatus(f.runtime,f.contentId),'paused',options),file=path.join(f.root,state.relativePath),receiptPath=path.join(f.root,`.workbench/mutations/${options.mutationId}.json`),receipt=JSON.parse(fs.readFileSync(receiptPath));
 fs.appendFileSync(path.join(f.root,f.card),'\n恢复前新增的作者原文。');const original=fs.readFileSync(path.join(f.root,f.card));fs.unlinkSync(file);receipt.status='pending';fs.writeFileSync(receiptPath,JSON.stringify(receipt));fs.rmSync(path.join(f.root,'.workbench/pending-mutations-index.json'));
 const recovered=readAuthorPlanningStatus(openVault(f.root).root,f.contentId);assert.equal(recovered.status,'paused');assert.equal(recovered.stale,true);assert.equal(recovered.history.length,1);assert.deepEqual(fs.readFileSync(path.join(f.root,f.card)),original);
});


// A case-only rename must not turn native author bytes into an ordinary writable source.
function renamedAuthorRecord(t,{lowerT=false}={}){
 const f=fixture(t),state=set(f,readAuthorPlanningStatus(f.runtime,f.contentId),'paused');
 let relative=state.relativePath;
 if(lowerT){const directory=path.posix.dirname(relative),renamed=directory.replace('/T050_','/t050_');fs.renameSync(path.join(f.root,directory),path.join(f.root,renamed));relative=renamed+'/作者安排.json';}
 const alias=relative.replace(/\.json$/,'.JSON');fs.renameSync(path.join(f.root,relative),path.join(f.root,alias));
 return {...f,state,alias,before:fs.readFileSync(path.join(f.root,alias))};
}

test('case-renamed author records remain absent from ordinary snapshots and bound catalogs',t=>{
 const f=renamedAuthorRecord(t);
 assert.ok(!readVaultSnapshot(f.runtime).documents.some(document=>document.relativePath===f.alias));
 assert.ok(!readBoundSourceCatalog(f.root,{sourceId:'drafts'}).files.some(file=>file.relativePath==='T050_作者选题/作者安排.JSON'));
 assert.throws(()=>readBoundSourceFile(f.root,{sourceId:'drafts',relativePath:'T050_作者选题/作者安排.JSON'}),{code:'INVALID_INPUT'});
 // Case-sensitive hosts may report the committed canonical record missing; neither host may reset it.
 if(fs.existsSync(path.join(f.root,f.state.relativePath)))assert.equal(readAuthorPlanningStatus(f.runtime,f.contentId).status,'paused');
 else assert.throws(()=>readAuthorPlanningStatus(f.runtime,f.contentId),{code:'CONFLICT'});
 assert.deepEqual(fs.readFileSync(path.join(f.root,f.alias)),f.before);
});

for(const action of ['save','trash'])test(`case-renamed author records reject ordinary ${action} even with a forged scan ID`,t=>{
 for(const lowerT of [false,true]){
  const f=renamedAuthorRecord(t,{lowerT}),id='doc-'+digest(f.alias).slice(0,32),request={id,expectedHash:f.state.revision};
  assert.throws(()=>action==='save'?saveVaultDocument(f.runtime,{...request,text:'{}'},{mutationId:randomUUID()}):trashVaultDocument(f.runtime,request,{mutationId:randomUUID()}));
  assert.deepEqual(fs.readFileSync(path.join(f.root,f.alias)),f.before);
 }
});

test('generic recovery rejects ASCII case aliases of the managed author namespace',t=>{
 for(const action of ['save','trash'])for(const lowerT of [false,true]){
  const f=renamedAuthorRecord(t,{lowerT});
  assert.throws(()=>runMutation(f.runtime,{action:'forged-generic'},{mutationId:randomUUID()},()=>({action,path:f.alias,beforeHash:f.state.revision,after:action==='trash'?null:Buffer.from('{}').toString('base64')})));
  assert.deepEqual(fs.readFileSync(path.join(f.root,f.alias)),f.before);
 }
});

test('ASCII case protection keeps exact directory boundaries and ordinary JSON aliases editable',t=>{
 for(const relative of ['05_内容草稿/t050_安排/作者安排.JSON','05_内容草稿/已做/t050_安排/作者安排.JsOn','05_内容草稿\\t050_安排\\作者安排.jSoN'])assert.equal(isManagedAuthorPlanningPath(relative),true,relative);
 const f=fixture(t);
 for(const relative of ['02_内容素材/作者安排.JSON','05_内容草稿/T050_安排/子目录/作者安排.JSON','05_内容草稿/非T目录/作者安排.JSON']){
  assert.equal(isManagedAuthorPlanningPath(relative),false,relative);fs.mkdirSync(path.dirname(path.join(f.root,relative)),{recursive:true});fs.writeFileSync(path.join(f.root,relative),'{}');
  const document=readVaultSnapshot(f.runtime).documents.find(item=>item.relativePath===relative);assert.ok(document,relative);assert.equal(saveVaultDocument(f.runtime,{id:document.id,expectedHash:document.hash,text:'{"ordinary":true}'},{mutationId:randomUUID()}).text,'{"ordinary":true}');
 }
});
