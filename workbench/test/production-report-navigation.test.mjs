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
test('provided CSV attachments use fixed navigation identities and escaped preview plus byte-exact download',async t=>{
 const f=await reportFixture(t),main='2026-08-14_抖音AI教程赛道调研/内容作战手册.html',href=encodeURIComponent('作品资料表-60条.csv'),csv='\uFEFF标题,内容\r\n例子,"<img src=x onerror=evil()>"\r\n';
 await f.put('2026-08-14_抖音AI教程赛道调研/作品资料表-60条.csv',csv);const mainHtml=await fs.readFile(path.join(f.root,'10_调研报告',main),'utf8');await f.put(main,mainHtml.replace('</body>',`<a href="${href}">下载CSV</a></body>`));
 const result=await execute('productionReport',{binding:f.b,reportId:f.source.id},'disabled'),index=result.navigation.links.findIndex(l=>l.href===href),target=result.navigation.links[index]?.target;
 assert.equal(target?.kind,'attachment');assert.ok(!JSON.stringify(target).includes('relativePath'));assert.ok(!JSON.stringify(target).includes('作品资料表'));
 const args={binding:f.b,reportId:f.source.id,pageId:result.report.pageId,fingerprint:result.navigation.fingerprint,index},attachment=await execute('productionReportAttachment',args,'disabled');assert.deepEqual(Buffer.from(attachment.data),Buffer.from(csv));assert.equal(attachment.filename,'作品资料表-60条.csv');
 await assert.rejects(()=>execute('productionReportAttachment',{...args,path:'../../file.csv'},'disabled'));
 const service=await pageService(t,f),url=await service.openReport(f.b,f.source.id),wrapper=await(await fetch(url)).text(),config=wrapperConfig(wrapper),response=await fetch(url+'navigate',{method:'POST',headers:{Origin:new URL(url).origin,'Content-Type':'application/json'},body:JSON.stringify({pageId:config.pageId,index,fingerprint:config.fingerprint,nonce:config.bridgeNonce})});assert.equal(response.status,200);const destination=(await response.json()).url;
 const preview=await(await fetch(destination)).text();assert.match(preview,/&lt;img src=x onerror=evil\(\)&gt;/);assert.doesNotMatch(preview,/<img\b|<script\b/);assert.match(preview,/下载原文件/);
 const download=await fetch(destination+'download');assert.deepEqual(Buffer.from(await download.arrayBuffer()),Buffer.from(csv));assert.match(download.headers.get('content-disposition'),/attachment; filename="attachment.csv"; filename\*=UTF-8''/);assert.equal(download.headers.get('x-content-type-options'),'nosniff');
 await f.put('2026-08-14_抖音AI教程赛道调研/作品资料表-60条.csv','changed');assert.notEqual((await fetch(destination)).status,200);assert.notEqual((await fetch(destination+'download')).status,200);await assert.rejects(()=>execute('productionReportAttachment',args,'disabled'));
});
test('a standalone original HTML page resolves MD/CSV/JSON only within one already registered internal source',async t=>{
 const f=await reportFixture(t),base=path.join(f.root,'01_对标账号/调研/比较'),put=async(rel,value)=>{const file=path.join(base,rel);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,value);};
 await put('reports/research_report.html','<html><body>调研报告<a href="../研究结论.md">研究结论</a><a href="../normalized/明细.csv">明细</a><a href="../normalized/statistics.json">统计</a></body></html>');await put('研究结论.md','# 正文\n证据');await put('normalized/明细.csv','id,value\n1,2');await put('normalized/statistics.json','{"count":1}');
 const report=f.library.readProduction().reports.find(r=>r.meta.vault.relativePath.endsWith('/reports/research_report.html'));assert.ok(!report.meta.vault.originalPages);assert.ok(!report.meta.vault.sourceId);
 const result=await execute('productionReport',{binding:f.b,reportId:report.id},'disabled');assert.equal(result.navigation.links.length,3);assert.ok(result.navigation.links.every(l=>l.target?.kind==='attachment'));
 for(let index=0;index<3;index++)assert.ok((await execute('productionReportAttachment',{binding:f.b,reportId:report.id,pageId:report.pageId,fingerprint:result.navigation.fingerprint,index},'disabled')).data.length>0);
 const mapFile=path.join(f.root,'.workbench/source-map.json'),map=JSON.parse(await fs.readFile(mapFile,'utf8'));map.sources.push({...map.sources.find(s=>s.id==='accounts'),id:'accounts-duplicate'});await fs.writeFile(mapFile,JSON.stringify(map));
 const ambiguous=await execute('productionReport',{binding:f.b,reportId:report.id},'disabled');assert.ok(ambiguous.navigation.links.every(l=>l.target===null));
});
test('attachment maps reject fake hrefs, non-text bytes, missing/catalog escapes and changed source authority',async t=>{
 const f=await reportFixture(t),group='2026-08-14_抖音AI教程赛道调研',main=group+'/内容作战手册.html',base=path.join(f.root,'10_调研报告');
 await f.put(group+'/valid.csv','name,value\n1,2');await f.put(group+'/nul.csv',Buffer.from('a\0b'));await f.put(group+'/binary.csv',Buffer.from([0xff,0xfe,0xff]));await f.put(group+'/oversize.csv',Buffer.alloc(8*1024*1024+1,65));await fs.writeFile(path.join(f.root,'outside.csv'),'outside');await fs.symlink(path.join(f.root,'outside.csv'),path.join(base,group,'alias.csv'));
 const links=['valid.csv','nul.csv','binary.csv','missing.csv','alias.csv','../../outside.csv','..%2foutside.csv','valid.csv?x=1','oversize.csv'];
 await f.put(main,'<html><body>'+links.map(href=>`<a href="${href}">附件</a>`).join('')+'<a data-href="fake.csv">示例</a><script>const example=\'<a href="script.csv">脚本示例</a>\';</script><!--<a href="comment.csv">注释</a>--></body></html>');
 const result=await execute('productionReport',{binding:f.b,reportId:f.source.id},'disabled');assert.equal(result.navigation.links.length,9);assert.equal(result.navigation.links.filter(l=>l.target).length,1);assert.equal(result.navigation.links[0].target.kind,'attachment');
 for(let index=1;index<9;index++)await assert.rejects(()=>execute('productionReportAttachment',{binding:f.b,reportId:f.source.id,pageId:result.report.pageId,fingerprint:result.navigation.fingerprint,index},'disabled'));
 const reports=f.library.readProduction().reports,html=(await fs.readFile(path.join(base,main))).toString();
 for(const mode of ['managed','deleted','explicit-invalid-source','stale-raw','stale-prepared']){
  const copy=structuredClone(reports),source=copy.find(r=>r.id===f.source.id);if(mode==='managed')source.meta.vault.currentBody='managed-pages';if(mode==='deleted')source.deletedAt=new Date().toISOString();if(mode==='explicit-invalid-source')source.meta.vault.sourceId='missing-source';if(mode==='stale-raw')source.meta.vault.originalPages[0].hash='a'.repeat(64);if(mode==='stale-prepared')source.pages[0].assetHash='b'.repeat(64);
  assert.ok(reportNavigation(f.b,copy,source.id,source.pages[0].id,html).links.every(l=>l.target===null),mode);
 }
});
test('an explicitly remapped hidden or framework source root cannot expose report attachments',async t=>{
 const f=await reportFixture(t),group='2026-08-14_抖音AI教程赛道调研',main=group+'/内容作战手册.html';await f.put(main,'<html><body><a href="data.csv">附件</a></body></html>');await f.put(group+'/data.csv','a,b');
 const reports=f.library.readProduction().reports,source=reports.find(r=>r.id===f.source.id),html=await fs.readFile(path.join(f.root,'10_调研报告',main),'utf8'),mapFile=path.join(f.root,'.workbench/source-map.json'),map=JSON.parse(await fs.readFile(mapFile,'utf8'));
 for(const hiddenRoot of ['.workbench/private-source','node_modules','skills']){
  const destination=path.join(f.root,hiddenRoot,group);await fs.mkdir(path.dirname(destination),{recursive:true});await fs.cp(path.join(f.root,'10_调研报告',group),destination,{recursive:true});map.sources.find(s=>s.id==='reports').root=hiddenRoot;await fs.writeFile(mapFile,JSON.stringify(map));
  const copy=structuredClone(source);copy.meta.vault.originalPages=copy.meta.vault.originalPages.map(p=>({...p,relativePath:p.relativePath.replace('10_调研报告',hiddenRoot)}));
  assert.ok(reportNavigation(f.b,[copy],copy.id,copy.pages[0].id,html).links.every(l=>l.target===null),hiddenRoot);
 }
});
test('registered readonly report tabs remain readable without attempting to persist position',async t=>{
 const f=await reportFixture(t);let writes=0;
 const service=new ProductionPages({worker:{call:async(op,args)=>{const value=await execute(op,args,'disabled');if(op==='productionReport')value.report.meta.vault.sourceWritable=false;return value;}},creationHtml:'',authorize:()=>{},readCreation:async()=>{throw Error('unused');},saveDraft:async()=>{throw Error('unused');},setReportPosition:async()=>{writes++;throw Object.assign(Error('readonly source'),{code:'READ_ONLY'});}});t.after(()=>service.close());
 const url=await service.openReport(f.b,f.source.id),wrapper=await(await fetch(url)).text(),hrefs=[...wrapper.matchAll(/<a href="([^"]+\/view\/[^"]+)"/g)].map(m=>m[1]);assert.equal(hrefs.length,2);
 for(const href of hrefs){const response=await fetch(new URL(href,url));assert.equal(response.status,200);assert.match(await response.text(),/<iframe/);}
 assert.equal(writes,0);
});
test('explicitly linked readonly report groups navigate registered pages and CSV appendices within that bound source',async t=>{
 const f=await reportFixture(t),external=path.join(path.dirname(f.root),'linked-reports');await fs.mkdir(path.join(external,'group'),{recursive:true});
 await fs.writeFile(path.join(external,'group/meta.json'),JSON.stringify({title:'外部只读报告',pages:[{file:'index.html',title:'首页'},{file:'target.html',title:'第二页'}]}));
 await fs.writeFile(path.join(external,'group/index.html'),'<html><body><a href="target.html">下一页</a><a href="data.csv">原始数据</a></body></html>');
 await fs.writeFile(path.join(external,'group/target.html'),'<html><body>已登记的第二页</body></html>');await fs.writeFile(path.join(external,'group/data.csv'),'name,value\n原始数据,1');
 const {linkSource}=await import('../../plugin-src/src/lib/vault/source-map.mjs');linkSource(f.root,{role:'reports',selectedRoot:external,authority:'candidate',writable:false});
 const reports=f.library.readProduction().reports,report=reports.find(r=>r.title==='外部只读报告'),value=await execute('productionReport',{binding:f.b,reportId:report.id},'disabled');
 assert.ok(value.navigation.pageIdentity);assert.equal(value.navigation.links.find(l=>l.href==='target.html').target.pageId,report.pages[1].id);assert.equal(value.navigation.links.find(l=>l.href==='data.csv').target.kind,'attachment');
 const {readRegisteredReportAttachment}=await import('../src/main/report-navigation.mts'),index=value.navigation.links.findIndex(l=>l.href==='data.csv');
 const attachment=readRegisteredReportAttachment(f.b,reports,report.id,report.pages[0].id,value.html,value.navigation.fingerprint,index);assert.equal(attachment.data.toString(),'name,value\n原始数据,1');
 await fs.writeFile(path.join(external,'group/data.csv'),'external edit');assert.equal(readRegisteredReportAttachment(f.b,reports,report.id,report.pages[0].id,value.html,value.navigation.fingerprint,index),null);
});
