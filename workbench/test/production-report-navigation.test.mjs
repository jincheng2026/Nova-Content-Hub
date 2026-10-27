import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createVault} from '../../plugin-src/src/lib/vault/index.mjs';
import {openLibrary} from '../../plugin-src/src/lib/file-library/index.mjs';
import {execute} from '../src/main/worker.mts';
export async function reportFixture(t){
 const parent=await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()),'nova-report-navigation-'));t.after(()=>fs.rm(parent,{recursive:true,force:true}));
 const root=path.join(parent,'vault');await fs.mkdir(root);const binding=createVault(root),b={root:binding.root,libraryId:binding.libraryId,rootIdentity:binding.rootIdentity};
 const mapPath=path.join(root,'.workbench/source-map.json'),map=JSON.parse(await fs.readFile(mapPath,'utf8'));map.sources.find(x=>x.id==='reports').provenance={importId:'navigation-fixture'};await fs.writeFile(mapPath,JSON.stringify(map));
 const put=async(rel,text)=>{const p=path.join(root,'10_调研报告',rel);await fs.mkdir(path.dirname(p),{recursive:true});await fs.writeFile(p,text);};
 const href='../2026-08-17_AI需求全景/人群1-门外观望的普通人.html';
 await put('2026-08-14_抖音AI教程赛道调研/meta.json',JSON.stringify({title:'内容作战',pages:[{file:'内容作战手册.html',title:'手册'},{file:'同报告.html',title:'同报告'}]}));
 await put('2026-08-14_抖音AI教程赛道调研/内容作战手册.html',`<!doctype html><html><body><a href="${href}">跨报告</a><a href="同报告.html#detail">同报告</a><a href="#here">锚点</a><a href="missing.html">未提供</a><a href="https://example.com/work">作品</a><details><summary>展开</summary>原折叠</details><script>window.original=1;</script></body></html>`);
 await put('2026-08-14_抖音AI教程赛道调研/同报告.html','<!doctype html><html><body id="detail">同报告目标</body></html>');
 await put('2026-08-17_AI需求全景/meta.json',JSON.stringify({title:'AI需求全景',pages:[{file:'人群1-门外观望的普通人.html',title:'人群1'}]}));
 await put('2026-08-17_AI需求全景/theme.css','body{color:navy}');
 await put('2026-08-17_AI需求全景/人群1-门外观望的普通人.html','<!doctype html><html><head><link rel="stylesheet" href="theme.css"></head><body>门外观望</body></html>');
 const library=openLibrary(b.root),reports=library.readProduction().reports,source=reports.find(r=>r.title==='内容作战'),target=reports.find(r=>r.title==='AI需求全景');
 return {root,b,library,reports,source,target,href,put};
}
test('registered original relative links produce fixed same-source report/page targets; raw and prepared hashes differ safely',async t=>{
 const f=await reportFixture(t),result=await execute('productionReport',{binding:f.b,reportId:f.source.id},'disabled');
 assert.ok(result.navigation,'report reader must expose a registered-only navigation map');
 const cross=result.navigation.links.find(x=>x.href===f.href),same=result.navigation.links.find(x=>x.href==='同报告.html#detail');
 assert.equal(cross.target.reportId,f.target.id);assert.equal(cross.target.pageId,f.target.pages[0].id);assert.equal(same.target.reportId,f.source.id);assert.equal(same.target.fragment,'#detail');
 assert.notEqual(f.target.pages[0].assetHash,f.target.meta.vault.originalPages[0].hash);
 assert.equal(result.navigation.links.find(x=>x.href==='missing.html').target,null);
 assert.ok(!result.navigation.links.some(x=>['#here','https://example.com/work'].includes(x.href)));
});
import {ProductionPages} from '../src/main/production-pages.mts';
async function pageService(t,f){
 const service=new ProductionPages({worker:{call:(op,args)=>execute(op,args,'disabled')},creationHtml:'',authorize:binding=>assert.deepEqual(binding,f.b),readCreation:async()=>{throw Error('unused');},saveDraft:async()=>{throw Error('unused');}});t.after(()=>service.close());return service;
}
function wrapperConfig(html){return JSON.parse(html.match(/const config=(\{[^;]+?\}),frame=/)[1]);}
test('report navigation issues only validated target capabilities and preserves wrapper navigation, anchors, sources and sandbox',async t=>{
 const f=await reportFixture(t),service=await pageService(t,f),url=await service.openReport(f.b,f.source.id),wrapper=await(await fetch(url)).text();
 assert.match(wrapper,/nova-report-navigate/);const config=wrapperConfig(wrapper),framePath=wrapper.match(/<iframe[^>]+src="([^"]+)"/)[1],frameResponse=await fetch(new URL(framePath,url)),frame=await frameResponse.text();
 assert.match(frameResponse.headers.get('content-security-policy'),/^sandbox allow-scripts; default-src 'none'/);assert.match(frame,/href="#here"/);assert.match(frame,/window.original=1/);assert.match(frame,/<details>/);assert.match(wrapper,/data-source="0"/);assert.match(wrapper,/\/view\//);
 const result=await execute('productionReport',{binding:f.b,reportId:f.source.id},'disabled'),index=result.navigation.links.findIndex(x=>x.href===f.href),body={pageId:config.pageId,index,fingerprint:config.fingerprint,nonce:config.bridgeNonce},headers={Origin:new URL(url).origin,'Content-Type':'application/json'};
 const post=body=>fetch(url+'navigate',{method:'POST',headers,body:JSON.stringify(body)});
 assert.equal((await fetch(url+'navigate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).status,403);
 assert.equal((await post({...body,path:'../../etc/passwd'})).status,400);assert.equal((await post({...body,nonce:'a'.repeat(48)})).status,403);assert.equal((await post({...body,index:999})).status,403);
 const sameIndex=result.navigation.links.findIndex(x=>x.href==='同报告.html#detail'),sameResponse=await post({...body,index:sameIndex});assert.equal(sameResponse.status,200);const sameDestination=await sameResponse.json(),sameWrapper=await(await fetch(sameDestination.url)).text();assert.ok(sameDestination.url.endsWith('#detail'));assert.match(sameWrapper,/<iframe[^>]+src="[^"]+#detail"/);
 const response=await post(body);assert.equal(response.status,200);const target=await response.json();assert.match(target.url,/^http:\/\/127\.0\.0\.1:\d+\/p\/[a-f0-9]{64}\/$/);const targetWrapper=await(await fetch(target.url)).text();assert.match(targetWrapper,/AI需求全景/);assert.match(await(await fetch(new URL(targetWrapper.match(/<iframe[^>]+src="([^"]+)"/)[1],target.url))).text(),/门外观望/);
 const missing=result.navigation.links.findIndex(x=>x.href==='missing.html');assert.equal((await post({...body,index:missing})).status,403);
 await f.put('2026-08-17_AI需求全景/人群1-门外观望的普通人.html','<html><body>changed</body></html>');
 assert.notEqual((await post(body)).status,200);assert.notEqual((await fetch(target.url)).status,200);
});
import {reportNavigation,resolveReportReference,reportNavigationFrame} from '../src/main/report-navigation.mts';
import vm from 'node:vm';
test('deleted, modified, stale, unregistered, cross-source and ambiguous pages cannot enter the capability whitelist',async t=>{
 const f=await reportFixture(t),sourceHtml=await fs.readFile(path.join(f.root,'10_调研报告/2026-08-14_抖音AI教程赛道调研/内容作战手册.html'),'utf8');
 for(const [name,change]of [
  ['deleted',(rs,r)=>r.deletedAt=new Date().toISOString()],
  ['different source',(rs,r)=>r.meta.vault.sourceId='other'],
  ['managed body',(rs,r)=>r.meta.vault.currentBody='managed-pages'],
  ['raw stale hash',(rs,r)=>r.meta.vault.originalPages[0].hash='a'.repeat(64)],
  ['prepared stale hash',(rs,r)=>r.pages[0].assetHash='b'.repeat(64)],
  ['not registered',(rs,r)=>r.pages=[]],
  ['ambiguous',(rs,r)=>rs.push({...structuredClone(r),id:'e4f28da4-35b7-4238-9bf2-970958c94a85'})],
 ]){
  const reports=structuredClone(f.reports),target=reports.find(r=>r.id===f.target.id);change(reports,target);
  assert.equal(reportNavigation(f.b,reports,f.source.id,f.source.pageId,sourceHtml).links.find(l=>l.href===f.href).target,null,name);
 }
 const sourceChanged=structuredClone(f.reports);sourceChanged.find(r=>r.id===f.source.id).meta.vault.originalPages[0].hash='c'.repeat(64);
 assert.ok(reportNavigation(f.b,sourceChanged,f.source.id,f.source.pageId,sourceHtml).links.every(l=>l.target===null));
});
test('reference resolution rejects root escapes, encoded separators, repeated encoding, protocols and queries',()=>{
 const from='group/source.html';
 assert.deepEqual(resolveReportReference(from,'../target/target.html#detail'),{relativePath:'target/target.html',fragment:'#detail'});
 assert.deepEqual(resolveReportReference(from,'%E4%BA%BA%E7%BE%A4.html'),{relativePath:'group/人群.html',fragment:''});
 for(const href of ['../../target.html','%2e%2e/%2e%2e/target.html','../target%2ftarget.html','..%5ctarget.html','%252e%252e/target.html','%00target.html','target%0a.html','target%7f.html','//evil.invalid/x.html','https://evil.invalid/x.html','file:///etc/a.html','/target.html','target.html?x=1','target.html?x=1#y','target.html\\x','target%.html'])assert.equal(resolveReportReference(from,href),null,href);
});
test('trusted frame and parent bridges preserve anchors and reject wrong frame, origin, nonce or page before host navigation',async t=>{
 const f=await reportFixture(t),service=await pageService(t,f),url=await service.openReport(f.b,f.source.id),wrapper=await(await fetch(url)).text(),config=wrapperConfig(wrapper),calls=[],messages=[];
 const frame={contentWindow:{}},status={textContent:''},listeners={};
 const script=wrapper.match(/<script nonce="[^"]+">([\s\S]+?)<\/script>/)[1];
 vm.runInNewContext(script,{document:{getElementById:id=>id==='report-frame'?frame:status,querySelectorAll:()=>[]},addEventListener:(kind,fn)=>listeners[kind]=fn,fetch:async(...args)=>{calls.push(args);return {ok:false};},location:{}});
 const valid={kind:'nova-report-navigate',pageId:config.pageId,nonce:config.bridgeNonce,index:0};
 for(const event of [{source:{},origin:'null',data:valid},{source:frame.contentWindow,origin:new URL(url).origin,data:valid},{source:frame.contentWindow,origin:'null',data:{...valid,nonce:'bad'}},{source:frame.contentWindow,origin:'null',data:{...valid,pageId:'bad'}}])await listeners.message(event);
 assert.equal(calls.length,0);await listeners.message({source:frame.contentWindow,origin:'null',data:valid});assert.equal(calls.length,1);
 const nav=(await execute('productionReport',{binding:f.b,reportId:f.source.id},'disabled')).navigation,html=reportNavigationFrame('<html><head></head><body></body></html>',nav,config.pageId,config.bridgeNonce),clicks={};
 vm.runInNewContext(html.match(/<script>([\s\S]+?)<\/script>/)[1],{document:{addEventListener:(kind,fn)=>clicks[kind]=fn},parent:{postMessage:message=>messages.push(message)}});
 let prevented=0;for(const href of ['#here','https://example.com/work',f.href])clicks.click({target:{closest:()=>({getAttribute:()=>href})},preventDefault:()=>prevented++,stopImmediatePropagation:()=>{}});
 assert.equal(prevented,1);assert.equal(messages.length,1);assert.equal(messages[0].index,nav.links.findIndex(l=>l.href===f.href));assert.equal(messages[0].nonce,config.bridgeNonce);
});
