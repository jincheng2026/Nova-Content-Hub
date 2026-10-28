import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import vm from 'node:vm';
import {createVault,readVaultSnapshot} from '../../plugin-src/src/lib/vault/index.mjs';
import {assembleCreationData,renderCreationHtml,parseCreationHtml,itemFingerprint} from '../../plugin-src/src/lib/creation-document/index.mjs';
import {executeCreation} from '../src/main/creation-worker.mts';
import {creationFrameHtml} from '../src/main/creation-frame-html.mts';
import {validateInput} from '../src/shared/validation.ts';
function fixture(t){
 const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'creation-desktop-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const binding=createVault(root),relative='05_内容草稿/T001_演示/T001_创作页.html';fs.mkdirSync(path.dirname(path.join(root,relative)),{recursive:true});
 const {raw}=assembleCreationData({content_id:'T001',title:'演示',type:'口播',stage:'写稿',narrative:{story:'真实故事',audience:'创作者',problem:'协作'},segments:[{id:'seg-a',title:'开头',mine:'原句',note:'意见'}]});
 fs.writeFileSync(path.join(root,relative),Buffer.concat([Buffer.from('<!--old-source--><script>window.OLD_UNTRUSTED_EXECUTION=1</script>'),renderCreationHtml(raw)]));
 const id=readVaultSnapshot(binding.root).documents.find(d=>d.relativePath===relative).id;
 const call=(action,payload)=>executeCreation({binding,documentId:id,pageId:raw.page_id,action,...(payload===undefined?{}:{payload})},'disabled');
 return {root,binding,relative,raw,id,call};
}
test('frame reconstructs trusted original modules and never executes original document scripts',async t=>{
 const f=fixture(t),opened=await f.call('read');
 assert.doesNotMatch(opened.html,/OLD_UNTRUSTED_EXECUTION/);assert.match(opened.html,/jc-app:start/);assert.match(opened.html,/function adopt\(/);assert.match(opened.html,/function buildSegment\(/);
 const html=creationFrameHtml(opened.html,{sessionId:randomUUID(),pageId:opened.pageId,fingerprint:opened.fingerprint,path:opened.path,stash:opened.stash});
 assert.match(html,/JC_DESKTOP\.request/);assert.match(html,/JC_DESKTOP\.openStore/);assert.match(html,/nova-creation-connect/);assert.match(html,/connect-src 'none'/);
 for(const script of html.matchAll(/<script(?![^>]*type="application\/json")[^>]*>([\s\S]*?)<\/script>/g))assert.doesNotThrow(()=>new vm.Script(script[1]));
 assert.throws(()=>creationFrameHtml('<html/>',{}),/模板接点/);
});
test('native stash survives reread, rejects stale writes and does not change original source',async t=>{
 const f=fixture(t),before=fs.readFileSync(path.join(f.root,f.relative)),initial=await f.call('stash-read');
 const record={key:'seg-a|note',change_id:'change-a',item_id:'seg-a',field:'note',before:'意见',after:'未提交的新意见',item_fp:itemFingerprint(f.raw.items.find(i=>i.id==='seg-a'))};
 const input={expectedVersion:initial.version,records:[record],storage:{local:{},session:{'pending-note':'仍在输入'}}};
 await f.call('stash-write',input);const next=await f.call('stash-read');assert.deepEqual(next.records,[record]);assert.equal(next.storage.session['pending-note'],'仍在输入');
 await assert.rejects(f.call('stash-write',input),{code:'CONFLICT'});assert.deepEqual(fs.readFileSync(path.join(f.root,f.relative)),before);
});
test('kit save returns original result/history contract and preserves source outside jc-doc',async t=>{
 const f=fixture(t),raw=f.raw,segment=raw.items.find(i=>i.id==='seg-a');
 const input={page_id:raw.page_id,token:raw.token,mutationId:randomUUID(),changes:[{change_id:'one',item_id:'seg-a',field:'mine',before:'原句',after:'新句',item_fp:itemFingerprint(segment)}]};
 const result=await f.call('save',input);assert.equal(result.results[0].status,'ok');
 const bytes=fs.readFileSync(path.join(f.root,f.relative));assert.ok(bytes.toString('utf8').startsWith('<!--old-source--><script>window.OLD_UNTRUSTED_EXECUTION=1</script>'));
 assert.equal(parseCreationHtml(bytes,{documentId:f.id,sourceId:'drafts'}).items.find(i=>i.id==='seg-a').fields.mine,'新句');
 const history=await f.call('history',{itemId:'seg-a'});assert.ok(Array.isArray(history.changes));assert.equal(history.changes.at(-1).change_id,'one');
 assert.deepEqual(await f.call('save',input),result);
});
test('finite creation IPC rejects caller roots, forged actors and unknown actions',()=>{
 const sessionId=randomUUID();
 for(const input of [{sessionId,action:'delete',payload:{}},{sessionId,action:'request',payload:{},root:'/tmp'},{sessionId,action:'stash-read',payload:{},actor:'author'}])assert.throws(()=>validateInput('creationPageRequest',input),{code:'INVALID_INPUT'});
 assert.throws(()=>validateInput('openCreationPage',{id:'../source.html'}),{code:'INVALID_INPUT'});
});

function bridgeHarness(html,initial={version:'0',records:[],storage:{local:{},session:{}}}){
 const backend={value:structuredClone(initial),writes:[],fail:false};
 function frame(){
  const listeners={},parent={},results=new Map(),context=vm.createContext({console,Map,Set,Promise,JSON,Date,Error,Object,Array,String,Number,queueMicrotask,setTimeout,clearTimeout,parent,navigator:{},document:{addEventListener(){}},window:{addEventListener(name,fn){listeners[name]=fn;},removeEventListener(){}}});
  context.window.window=context.window;context.window.jcKit={ready:true,state:()=>({ready:true,pending:0,conflicts:0}),flush:async()=>{},desktopRefresh:async()=>{}};
  const script=[...html.matchAll(/<script(?![^>]*type="application\/json")[^>]*>([\s\S]*?)<\/script>/g)][0][1];
  vm.runInContext(script,context);
  const port={start(){},postMessage(message){if(message.kind==='control-result'){results.get(message.id)?.(message);results.delete(message.id);return;}if(message.kind)return;queueMicrotask(async()=>{try{let value;if(message.action==='stash-read')value=structuredClone(backend.value);else if(message.action==='stash-write'){if(backend.gate)await backend.gate;if(backend.fail)throw new Error('disk failed');if(message.payload.expectedVersion!==backend.value.version)throw new Error('stale revision');backend.value={...structuredClone(message.payload),version:String(Number(backend.value.version)+1)};delete backend.value.expectedVersion;backend.writes.push(structuredClone(backend.value));if(backend.failAfterWrite){backend.failAfterWrite=false;throw new Error('reply lost after durable write');}value={version:backend.value.version};}else if(message.action==='copy')value={copied:true};else throw new Error(message.action);port.onmessage({data:{sessionId:message.sessionId,id:message.id,ok:true,value}});}catch(error){port.onmessage({data:{sessionId:message.sessionId,id:message.id,ok:false,error:error.message}});}});}};
  const sessionId=/"sessionId":"([^"]+)"/.exec(script)[1];listeners.message({source:parent,data:{kind:'nova-creation-connect',sessionId},ports:[port]});
  return {context,desktop:context.window.JC_DESKTOP,store:context.window.JC_DESKTOP.openStore(),control(action='flush'){return new Promise(resolve=>{const id=randomUUID();results.set(id,resolve);port.onmessage({data:{kind:'control',sessionId,id,action}});});}};
 }
 return {backend,frame};
}
function adapted(t,stash){const f=fixture(t);return f.call('read').then(opened=>creationFrameHtml(opened.html,{sessionId:randomUUID(),pageId:opened.pageId,fingerprint:opened.fingerprint,path:opened.path,stash:stash??opened.stash}));}
const record=(key,after,id='original')=>({key,change_id:id,item_id:key.split('|')[0],field:key.split('|')[1],before:'original',after,item_fp:'abcdef123456',group:null});
test('failed durable batch remains retryable and unrelated edits cannot clear the failure',async t=>{
 const h=bridgeHarness(await adapted(t)),a=h.frame(),store=await a.store;h.backend.fail=true;
 await assert.rejects(store.modify('seg-a|mine',()=>record('seg-a|mine','最后一次正文','mine-1')),/disk failed/);
 const queued=store.modify('seg-a|note',()=>record('seg-a|note','稍后批注','note-1'));
 await new Promise(resolve=>setImmediate(resolve));assert.match((await a.desktop.flush()).error,/disk failed/);assert.equal(h.backend.writes.length,0);
 h.backend.fail=false;
 // This store-only harness cannot acknowledge a source save. Native recovery
 // succeeds, while the full retry must retain the pending source work.
 await assert.rejects(a.desktop.retry(),/输入尚未写回原文件/);await queued;
 assert.equal(h.backend.value.records.find(r=>r.key==='seg-a|mine').after,'最后一次正文');assert.equal(h.backend.value.records.find(r=>r.key==='seg-a|note').after,'稍后批注');
 assert.equal((await a.desktop.flush()).pending,0);
});
test('two frames merge unrelated draft keys and reject same-record or same-draft overwrite',async t=>{
 const h=bridgeHarness(await adapted(t)),a=h.frame(),b=h.frame(),sa=await a.store,sb=await b.store;
 a.context.window.sessionStorage.setItem('unsubmitted-note','作者未提交批注');await a.desktop.flush();
 await sb.modify('seg-a|mine',()=>record('seg-a|mine','B正文','B1'));
 assert.equal(h.backend.value.storage.session['unsubmitted-note'],'作者未提交批注');
 await sa.all(); // A may learn the latest stash without its displayed input having changed.
 await assert.rejects(sa.modify('seg-a|mine',()=>record('seg-a|mine','A正文','A1')),/另一窗口/);
 assert.equal(h.backend.value.records[0].after,'B正文');assert.match((await a.desktop.flush()).error,/另一窗口/);
 const c=h.frame();c.context.window.sessionStorage.setItem('unsubmitted-note','不同窗口草稿');const status=await c.desktop.flush();assert.match(status.error,/另一窗口/);assert.equal(h.backend.value.storage.session['unsubmitted-note'],'作者未提交批注');
});
test('original kit adoption rebinds old groups and new values in one durable transaction',async t=>{
 const original=[{...record('seg-a|mine','旧采纳句','old-mine'),group:'G1'},{...record('sug-old|decision','adopted','old-decision'),group:'G1'}];
 const initial={version:'0',records:original,storage:{local:{},session:{}}},html=await adapted(t,initial),h=bridgeHarness(html,initial),a=h.frame(),store=await a.store;
 Object.assign(a.context,{store,recs:structuredClone(original),fatal:'',kitFailed:'',ready:true,inflight:{},base:{'seg-a':{mine:'original'},'sug-new':{decision:'original'}},fps:{'seg-a':'abcdef123456','sug-new':'abcdef123456'},titles:{},isRegistered:()=>true,recOf:key=>original.find(r=>r.key===key),newId:()=>randomUUID(),setVal(){},cells:()=>[],eq:(a,b)=>a===b,storeError:'',clearTimeout,setTimeout,paint(){},emit(){},debounceTimer:null,flush(){}});
 vm.runInContext(`function stashFn(item,field,after,group){return function(rec){return {key:item+'|'+field,change_id:String(Math.random()),item_id:item,field:field,before:rec?rec.before:'original',after:after,item_fp:'abcdef123456',group:group,conflict:null};};} function queue(p){return p.then(async()=>{recs=await store.all();});}`,a.context);
 const start=html.indexOf('  function edit(a, b, c, d) {'),end=html.indexOf('  // 页面当前的值',start);vm.runInContext(html.slice(start,end),a.context);
 const result=await vm.runInContext(`edit([{item:'seg-a',field:'mine',value:'新采纳句'},{item:'sug-new',field:'decision',value:'adopted'}],{group:'G2',flush:false})`,a.context);
 assert.equal(result.ok,true);assert.equal(h.backend.writes.length,1);assert.equal(h.backend.value.records.length,3);assert.ok(h.backend.value.records.every(r=>r.group==='G2'));
});
test('registered local original references never open scripts, shortcuts or executables',async t=>{
 const f=fixture(t),item=f.raw.items.find(i=>i.id==='seg-a');item.locked.refs=[];
 for(const extension of ['cmd','bat','command','url','lnk','exe','ps1','sh']){const name=`original.${extension}`;item.locked.refs.push({source_type:'说明',text:'原片',video:name});fs.writeFileSync(path.join(f.root,path.dirname(f.relative),name),'echo must never execute');}
 fs.writeFileSync(path.join(f.root,f.relative),renderCreationHtml(f.raw));
 for(const ref of item.locked.refs)await assert.rejects(f.call('reference',{href:ref.video}),{code:'INVALID_INPUT'});
});

test('a lost ack retries the final record and storage values of a multi-edit batch',async t=>{
 const h=bridgeHarness(await adapted(t)),a=h.frame(),store=await a.store;h.backend.failAfterWrite=true;
 const first=store.modify('seg-a|mine',()=>record('seg-a|mine','第一次输入','one'));
 const second=store.modify('seg-a|mine',()=>record('seg-a|mine','第二次输入','two'));
 a.context.window.sessionStorage.setItem('draft','第一版');a.context.window.sessionStorage.setItem('draft','最终版');
 await Promise.all([first,second]);const status=await a.desktop.flush();assert.equal(status.error,'');assert.equal(status.pending,0);
 assert.equal(h.backend.value.records[0].change_id,'two');assert.equal(h.backend.value.records[0].after,'第二次输入');assert.equal(h.backend.value.storage.session.draft,'最终版');
});

test('store reads used by source flush wait for the same-tick durable stash ack',async t=>{
 const h=bridgeHarness(await adapted(t)),a=h.frame(),store=await a.store;let release;h.backend.gate=new Promise(resolve=>{release=resolve;});
 const mutation=store.modify('seg-a|mine',()=>record('seg-a|mine','必须先暂存','ordered'));let observed=false;const read=store.all().then(records=>{observed=true;return records;});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(observed,false);assert.equal(h.backend.writes.length,0);release();await mutation;assert.equal((await read)[0].after,'必须先暂存');assert.equal(h.backend.writes.length,1);
});

test('trusted original publication UI renders and saves all three slots through the real kit',async t=>{
 const {spawn}=await import('node:child_process');
 const {packagingBuildData}=await import('../../plugin-src/src/lib/creation-document/test/packaging-fixture.mjs');
 const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'creation-publish-render-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 createVault(root);const source={sourceId:'drafts',documentId:'publication-render',relativePath:'05_内容草稿/T044/创作页.html'};
 fs.mkdirSync(path.join(root,'05_内容草稿/T044'),{recursive:true});const {raw}=assembleCreationData(packagingBuildData());
 fs.writeFileSync(path.join(root,source.relativePath),renderCreationHtml(raw));
 const fingerprint=parseCreationHtml(fs.readFileSync(path.join(root,source.relativePath)),source).revision;
 const sessionId=randomUUID(),html=creationFrameHtml(Buffer.from(renderCreationHtml(raw,{mode:'trusted-frame'})).toString(),{sessionId,pageId:raw.page_id,fingerprint,path:source.relativePath,stash:{version:'0',records:[],storage:{local:{},session:{}}}});
 const result=path.join(root,'render-result.json'),config=path.join(root,'render-config.json');fs.writeFileSync(config,JSON.stringify({root,source,html,sessionId,fingerprint,result,userData:path.join(root,'.electron-user-data')}));
 const {createRequire}=await import('node:module');const electron=createRequire(import.meta.url)('electron');
 const runner=path.resolve(import.meta.dirname,'../../plugin-src/src/lib/creation-document/test/packaging-render-harness.mjs');
 const status=await new Promise((resolve,reject)=>{const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const child=spawn(electron,[runner,config],{env,stdio:['ignore','pipe','pipe']});let output='';const timer=setTimeout(()=>{child.kill('SIGTERM');reject(new Error('Electron publication render timed out: '+output));},45000);child.stdout.on('data',chunk=>{output+=chunk;});child.stderr.on('data',chunk=>{output+=chunk;});child.once('error',reject);child.once('exit',code=>{clearTimeout(timer);resolve({code,output});});});
 const report=fs.existsSync(result)?JSON.parse(fs.readFileSync(result,'utf8')):null;assert.equal(status.code,0,JSON.stringify(report??status));assert.equal(report.ok,true,JSON.stringify(report));assert.equal(report.rendered.candidates,29);assert.equal(report.atomicHistory,true);assert.equal(report.closedAndReopened,true);assert.equal(report.otherFinalsPreserved,true);
 if(process.env.NOVA_CREATION_RENDER_REPORT)fs.copyFileSync(result,process.env.NOVA_CREATION_RENDER_REPORT);
});


test('close waits for the original source save ack, not only the durable stash',async t=>{
 const h=bridgeHarness(await adapted(t)),a=h.frame();await a.store;let release,started=false,done=false;
 const ack=new Promise(resolve=>{release=resolve;});
 a.context.window.jcKit={ready:true,state:()=>({ready:true,pending:done?0:1,conflicts:0}),flush:async()=>{started=true;await ack;done=true;}};
 let closed=false;const close=a.control().then(result=>{closed=true;return result;});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(started,true,'close must invoke the original kit save');assert.equal(closed,false,'must not close before source ack');
 release();assert.equal((await close).ok,true);
});
for(const [label,state] of [
 ['pending',{pending:1}],['conflict',{conflicts:1}],['save refusal',{saveRefused:'原文件只读'}],['store failure',{storeError:'disk failed'}],['composition',{composing:true}]
])test('close refuses '+label+' and preserves the frame for retry',async t=>{
 const h=bridgeHarness(await adapted(t)),a=h.frame();await a.store;
 a.context.window.jcKit={ready:true,state:()=>({ready:true,pending:0,conflicts:0,...state}),flush:async()=>{}};
 const result=await a.control();assert.equal(result.ok,false);assert.ok(result.error);
});

test('concurrent original kit flush calls share the source ack promise',async t=>{
 const html=await adapted(t),start=html.indexOf('  function flush() {'),end=html.indexOf('  function doFlush()',start);assert.ok(start>0&&end>start);
 let release,calls=0;const ack=new Promise(resolve=>{release=resolve;});
 const context=vm.createContext({window:{JC_DESKTOP:{}},navigator:{},store:{},flushing:false,flushAgain:false,desktopFlushing:null,paint(){},Promise,setTimeout,storeError:'',errText:e=>e.message,afterFlush(){},doFlush:()=>{calls++;return calls===1?ack:Promise.resolve();}});
 vm.runInContext(html.slice(start,end),context);
 const first=context.flush();let completed=false;const close=context.flush().then(()=>{completed=true;});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(completed,false,'in-flight flush cannot acknowledge early');
 release();await Promise.all([first,close]);assert.equal(calls,2);
});

test('close refuses a late durable edit before the kit pending mirror refreshes',async t=>{
 const h=bridgeHarness(await adapted(t)),a=h.frame(),store=await a.store;
 a.context.window.jcKit={ready:true,state:()=>({ready:true,pending:0,conflicts:0}),flush:()=>store.modify('seg-a|mine',()=>record('seg-a|mine','保存回执之后的新输入','late'))};
 const result=await a.control();assert.equal(result.ok,false);assert.equal(h.backend.value.records[0].after,'保存回执之后的新输入');
});
test('close refuses composition started while the source save was in flight',async t=>{
 const h=bridgeHarness(await adapted(t)),a=h.frame();await a.store;let composing=false;
 a.context.window.jcKit={ready:true,state:()=>({ready:true,pending:0,conflicts:0,composing}),flush:async()=>{composing=true;}};
 assert.equal((await a.control()).ok,false);
});
