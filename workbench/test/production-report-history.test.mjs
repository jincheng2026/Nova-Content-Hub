import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createVault} from '../../plugin-src/src/lib/vault/index.mjs';
import {openLibrary} from '../../plugin-src/src/lib/file-library/index.mjs';
import {ProductionPages} from '../src/main/production-pages.mts';
import {execute} from '../src/main/worker.mts';
async function createReportHistoryFixture(){
 const root=await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()),'nova-report-history-test-')),binding=createVault(root),b={root:binding.root,libraryId:binding.libraryId,rootIdentity:binding.rootIdentity},source=path.join(root,'01_对标账号/调研/历史恢复');
 await fs.mkdir(path.join(source,'reports'),{recursive:true});
 await fs.writeFile(path.join(source,'reports/research_report.html'),'<!doctype html><html><head><meta charset="utf-8"><title>历史恢复原报告</title></head><body><h2>原报告正文已加载</h2><a href="../研究结论.md">打开文字版结论</a><details><summary>原报告详情</summary>折叠正文</details></body></html>');
 await fs.writeFile(path.join(source,'研究结论.md'),'# 历史恢复附件\n\n这份 Markdown 应逐字节下载。\n');
 const report=openLibrary(b.root).readProduction().reports.find(r=>r.title==='research_report');
 const pages=new ProductionPages({worker:{call:(op,args)=>execute(op,args,'disabled')},creationHtml:'',authorize:current=>assert.deepEqual(current,b),readCreation:async()=>{throw Error('unused');},saveDraft:async()=>{throw Error('unused');}});
 const url=await pages.openReport(b,report.id);return {url,close:async()=>{await pages.close();await fs.rm(root,{recursive:true,force:true});}};
}
const configOf=html=>JSON.parse(html.match(/const config=(\{[^;]+?\}),frame=/)[1]);
function wrapperRuntime(html,type='navigate'){
 const config=configOf(html),listeners={},timers=new Map(),assignments=[],sourceAssignments=[],fetches=[],frame={isConnected:true,contentWindow:{location:{replace:value=>assignments.push(value)}}},status={textContent:''};let serial=0;
 Object.defineProperty(frame,'src',{set:value=>{sourceAssignments.push(value);throw Error('iframe.src must not rewrite the forward stack');}});
 vm.runInNewContext(html.match(/<script nonce="[^"]+">([\s\S]+?)<\/script>/)[1],{document:{getElementById:id=>id==='report-frame'?frame:status,querySelectorAll:()=>[]},addEventListener:(kind,fn)=>listeners[kind]=fn,performance:{getEntriesByType:()=>[{type}]},setTimeout:fn=>{const id=++serial;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),fetch:async(...args)=>{fetches.push(args);return {ok:true,json:async()=>({url:'http://fixture.invalid/attachment/'})};},location:{}});
 return {config,listeners,timers,assignments,sourceAssignments,fetches,frame,status,flush(){for(const [id,fn]of timers){timers.delete(id);fn();}}};
}
test('report history recovery handles persisted and fresh back_forward pages after restoration using only its server-fixed iframe source',async t=>{
 const fixture=await createReportHistoryFixture();t.after(()=>fixture.close());const first=await(await fetch(fixture.url)).text(),second=await(await fetch(fixture.url)).text(),firstConfig=configOf(first),secondConfig=configOf(second);
 assert.notEqual(firstConfig.bridgeNonce,secondConfig.bridgeNonce);assert.ok(secondConfig.frameSrc,'the restored wrapper needs its own fixed current bridge URL');
 assert.match(secondConfig.frameSrc,/^http:\/\/127\.0\.0\.1:\d+\/p\//);
 assert.equal(secondConfig.frameSrc,second.match(/<iframe[^>]+src="([^"]+)"/)[1]);
 for(const [persisted,type]of [[true,'navigate'],[false,'back_forward']]){
  const run=wrapperRuntime(second,type);assert.equal(typeof run.listeners.pageshow,'function');
  run.listeners.pageshow({persisted});assert.equal(run.assignments.length,0,'defer beyond current history restoration');assert.equal(run.timers.size,1);run.flush();assert.deepEqual(run.assignments,[run.config.frameSrc]);assert.equal(run.sourceAssignments.length,0,'iframe.src would discard the forward history stack');
  const response=await fetch(new URL(run.assignments[0],fixture.url));assert.equal(response.status,200);assert.match(await response.text(),/原报告正文已加载/);assert.match(response.headers.get('content-security-policy'),/^sandbox allow-scripts/);
 }
 const normal=wrapperRuntime(second);normal.listeners.pageshow({persisted:false});assert.equal(normal.timers.size,0);assert.equal(normal.assignments.length,0);
 const denied=wrapperRuntime(second,'back_forward');denied.frame.contentWindow.location.replace=()=>{throw Error('Navigation denied');};denied.listeners.pageshow({persisted:false});denied.flush();assert.match(denied.status.textContent,/历史恢复未完成/);assert.equal(denied.sourceAssignments.length,0);
 const detached=wrapperRuntime(second,'back_forward');detached.listeners.pageshow({persisted:false});detached.frame.isConnected=false;detached.flush();assert.equal(detached.assignments.length,0);
});
test('restoring a report clears saved navigation busy state once and leaves attachment preview/download history available',async t=>{
 const fixture=await createReportHistoryFixture();t.after(()=>fixture.close());const html=await(await fetch(fixture.url)).text(),run=wrapperRuntime(html,'back_forward'),message={source:run.frame.contentWindow,origin:'null',data:{kind:'nova-report-navigate',pageId:run.config.pageId,nonce:run.config.bridgeNonce,index:0}};
 await run.listeners.message(message);assert.equal(run.fetches.length,1);await run.listeners.message(message);assert.equal(run.fetches.length,1);
 assert.equal(typeof run.listeners.pageshow,'function');run.listeners.pageshow({persisted:false});run.listeners.pageshow({persisted:false});assert.equal(run.timers.size,1);run.flush();await run.listeners.message(message);assert.equal(run.fetches.length,2);
 const response=await fetch(fixture.url+'navigate',{method:'POST',headers:{Origin:new URL(fixture.url).origin,'Content-Type':'application/json'},body:JSON.stringify({pageId:run.config.pageId,index:0,fingerprint:run.config.fingerprint,nonce:run.config.bridgeNonce})});assert.equal(response.status,200);const attachment=(await response.json()).url;assert.match(await(await fetch(attachment)).text(),/历史恢复附件/);assert.equal((await fetch(attachment+'download')).status,200);
});
