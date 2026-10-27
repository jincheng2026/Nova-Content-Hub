import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createVault,readVaultSnapshot} from '../index.mjs';
import {classifyVaultResources} from '../resources.mjs';
import {openLibrary} from '../../file-library/index.mjs';
import {randomUUID,createHash} from 'node:crypto';
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'nova-appendices-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const runtime=createVault(root).root;
 const mapFile=path.join(root,'.workbench/source-map.json'),map=JSON.parse(fs.readFileSync(mapFile,'utf8'));map.sources.find(s=>s.id==='reports').provenance={importId:'appendix-fixture'};fs.writeFileSync(mapFile,JSON.stringify(map));
 const put=(relative,text)=>{const p=path.join(root,'10_调研报告',relative);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,text);};
 const href='%E6%9D%A5%E6%BA%90%E6%9D%90%E6%96%99.html',html='<!doctype html><html><head><title>珍妮丁丁说 AI · 来源材料</title><link rel="stylesheet" href="theme.css"></head><body><section id="raw-cache">原始缓存来源</section></body></html>';
 put('珍妮/meta.json',JSON.stringify({title:'珍妮',pages:[{file:'账号.html',title:'账号'},{file:'评论.html',title:'评论'}]}));
 put('珍妮/账号.html',`<html><body>${Array.from({length:17},(_,i)=>`<a href="${href}#${i<3?'local-'+i:'raw-cache'}">来源</a>`).join('')}</body></html>`);
 put('珍妮/评论.html','<html><body>原评论</body></html>');put('珍妮/来源材料.html',html);put('珍妮/theme.css','body{color:navy}');put('珍妮/未引用.html','<html><body>未引用旁页</body></html>');
 return {root,runtime,put,href,html};
}
test('declared HTML references register only same-directory snapshotted appendix once with a stable original identity',t=>{
 const f=fixture(t),classified=classifyVaultResources(readVaultSnapshot(f.runtime)),group=classified.reports.find(r=>r.record.title==='珍妮');
 assert.equal(group.originalPages.length,3);assert.equal(group.originalPages[2].title,'珍妮丁丁说 AI · 来源材料');
 assert.equal(group.originalPages[2].document.relativePath,'10_调研报告/珍妮/来源材料.html');
 const api=openLibrary(f.runtime),report=api.readProduction().reports[0],appendix=report.pages[2];
 assert.equal(report.pages.length,3);assert.equal(report.meta.vault.originalPages[2].hash,createHash('sha256').update(f.html).digest('hex'));assert.notEqual(appendix.assetHash,report.meta.vault.originalPages[2].hash);
 assert.equal(openLibrary(f.runtime).readProduction().reports[0].pages[2].id,appendix.id);assert.equal(fs.readFileSync(path.join(f.root,'10_调研报告/珍妮/来源材料.html'),'utf8'),f.html);
});

import {reportNavigation} from '../../../../../workbench/src/main/report-navigation.mts';
for(const mode of ['metadata','managed-pages','managed-markdown','deleted'])test(`appendix refresh preserves existing ${mode} authority and author sources`,t=>{
 const f=fixture(t),api=openLibrary(f.runtime);let snapshot=api.readProduction(),report=snapshot.reports[0];
 snapshot=api.mutateProduction('saveAccount',{name:'作者账号',platform:'抖音',expectedToken:snapshot.editToken},{mutationId:randomUUID()});const accountId=snapshot.accounts[0].id;
 snapshot=api.mutateProduction('saveReport',{id:report.id,title:report.title,pages:report.pages,accountIds:[accountId],expectedToken:snapshot.editToken},{mutationId:randomUUID()});report=snapshot.reports[0];
 if(mode==='deleted')api.mutateProduction('trashReport',{id:report.id,expectedToken:snapshot.editToken},{mutationId:randomUUID()});
 else api.mutateProduction('saveReport',{id:report.id,title:'作者当前标题',accountIds:[accountId],...(mode==='managed-markdown'?{markdown:'作者当前正文'}:{pages:mode==='metadata'?report.pages:[report.pages[0]]}),expectedToken:snapshot.editToken},{mutationId:randomUUID()});
 snapshot=api.readProduction();const current=snapshot.reports[0];assert.deepEqual(current.accountIds,[accountId]);
 f.put('珍妮/新增来源.html','<html><head><title>新增来源</title></head><body>新增附页</body></html>');const originalMain=fs.readFileSync(path.join(f.root,'10_调研报告/珍妮/账号.html'),'utf8');f.put('珍妮/账号.html',originalMain.replace('</body>','<a href="新增来源.html">新增引用</a></body>'));
 const reopened=openLibrary(f.runtime).readProduction().reports[0];assert.equal(reopened.title,current.title);if(['metadata','deleted'].includes(mode)){assert.equal(reopened.pages.length,4);assert.deepEqual(reopened.pages.map(p=>p.id).slice(0,3),current.pages.map(p=>p.id));}else assert.deepEqual(reopened.pages,current.pages);assert.deepEqual(reopened.accountIds,[accountId]);assert.equal(reopened.deletedAt,current.deletedAt);assert.equal(reopened.meta.vault.currentBody,current.meta.vault.currentBody);assert.equal(reopened.meta.manualMarkdown,current.meta.manualMarkdown);assert.equal(fs.readFileSync(path.join(f.root,'10_调研报告/珍妮/来源材料.html'),'utf8'),f.html);
});
test('17 real-shaped encoded appendix anchors map through the existing registered-page helper',t=>{
 const f=fixture(t),api=openLibrary(f.runtime),reports=api.readProduction().reports,report=reports[0],info=api.info,binding={root:f.runtime,libraryId:info.libraryId,rootIdentity:info.rootIdentity};
 const html=api.readAsset(report.pages[0].assetHash).data.toString(),navigation=reportNavigation(binding,reports,report.id,report.pages[0].id,html);
 assert.equal(navigation.links.length,4);assert.ok(navigation.links.every(link=>link.target?.reportId===report.id&&link.target.pageId===report.pages[2].id));assert.deepEqual(new Set(navigation.links.map(link=>link.target.fragment)),new Set(['#local-0','#local-1','#local-2','#raw-cache']));
});
test('appendix discovery rejects traversal, encoded separators, absent snapshots, hidden groups and transitive references',t=>{
 const f=fixture(t);f.put('珍妮/来源材料.html',f.html.replace('</body>','<a href="未引用.html">下一跳</a></body>'));
 const declared=fs.readFileSync(path.join(f.root,'10_调研报告/珍妮/账号.html'),'utf8');f.put('珍妮/账号.html',declared.replace('</body>',`<script>const example='<a href="未引用.html">example</a>';</script><!-- <a href="未引用.html">comment</a> --><textarea><a href="未引用.html">literal</a></textarea></body>`));
 let group=classifyVaultResources(readVaultSnapshot(f.runtime)).reports.find(r=>r.record.title==='珍妮');assert.equal(group.originalPages.length,3);assert.ok(!group.originalPages.some(p=>p.document.relativePath.endsWith('/未引用.html')));
 const bad=['../珍妮/来源材料.html','../别组/其他.html','%2e%2e/别组/其他.html','来源%2f材料.html','来源%5c材料.html','%252e%252e.html','%00来源材料.html','来源材料.html?cache=1','/来源材料.html','https://other.invalid/来源材料.html','missing.html','库外.html','.hidden.html'];
 f.put('珍妮/账号.html','<html><body>'+bad.map(h=>`<a href="${h}">引用</a>`).join('')+'</body></html>');f.put('别组/其他.html','<html><body>其他组正文</body></html>');
 const outside=path.join(f.root,'outside.html');fs.writeFileSync(outside,'<html><body>未在来源快照</body></html>');fs.symlinkSync(outside,path.join(f.root,'10_调研报告/珍妮/库外.html'));
 group=classifyVaultResources(readVaultSnapshot(f.runtime)).reports.find(r=>r.record.title==='珍妮');assert.equal(group.originalPages.length,2);
 f.put('珍妮/meta.json',JSON.stringify({title:'珍妮',workbenchVisible:false,pages:[{file:'账号.html',title:'账号'}]}));assert.ok(!classifyVaultResources(readVaultSnapshot(f.runtime)).reports.some(r=>r.record.title==='珍妮'));
});
test('an invalid optional HTML appendix cannot remove the declared report in new or refreshed libraries',t=>{
 const f=fixture(t);f.put('珍妮/账号.html','<html><body><a href="broken.html">可选附页</a></body></html>');f.put('珍妮/broken.html','not html');
 let classified=classifyVaultResources(readVaultSnapshot(f.runtime)),group=classified.reports.find(r=>r.record.title==='珍妮');assert.ok(group);assert.equal(group.originalPages.length,2);assert.ok(classified.issues.some(i=>i.relativePath==='10_调研报告/珍妮/broken.html'));
 const api=openLibrary(f.runtime),report=api.readProduction().reports[0];assert.equal(report.pages.length,2);
 f.put('珍妮/broken.html','<html><body>有效附页</body></html>');assert.equal(api.readProduction().reports[0].pages.length,3);
 f.put('珍妮/broken.html','invalid again');const refreshed=api.readProduction().reports.find(r=>r.id===report.id);assert.ok(refreshed);assert.equal(refreshed.pages.length,3);assert.equal(refreshed.meta.vault.status,'source-missing');
});
