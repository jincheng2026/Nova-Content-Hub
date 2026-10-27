import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createVault,openVault,readVaultSnapshot} from '../index.mjs';
import {linkSource,readBoundSourceCatalog,readBoundSourceFile,resolveSource,readSourceInventory} from '../source-map.mjs';
import {classifyVaultResources} from '../resources.mjs';
import {planJinchengSupplement,importJinchengSupplement} from '../import-jincheng.mjs';
import {openLibrary} from '../../file-library/index.mjs';
const fixture=t=>{const parent=fs.mkdtempSync(path.join(os.tmpdir(),'jincheng-source-'));t.after(()=>fs.rmSync(parent,{recursive:true,force:true}));const root=path.join(parent,'vault');fs.mkdirSync(root);const runtime=createVault(root).root;const put=(r,p,s)=>{fs.mkdirSync(path.dirname(path.join(r,p)),{recursive:true});fs.writeFileSync(path.join(r,p),s);};return {root,parent,runtime,put};};
test('explicit linked roots load original account schema and report groups with independent identities',t=>{
 const f=fixture(t),one=path.join(f.parent,'one'),two=path.join(f.parent,'two');fs.mkdirSync(one);fs.mkdirSync(two);
 for(const root of [one,two])f.put(root,'抖音-甲/档案.json',JSON.stringify({account_name:'甲',platform:'抖音',note:'完整人工原文'}));
 const a=linkSource(f.root,{role:'benchmark-accounts',selectedRoot:one,authority:'official'}),b=linkSource(f.root,{role:'benchmark-accounts',selectedRoot:two,authority:'official'});
 f.put(one,'报告/meta.json',JSON.stringify({title:'多页原报告',date:'2026-09-11',pages:[{file:'B.html',title:'先看评论'},{file:'A.html',title:'后看账号'}]}));f.put(one,'报告/A.html','<html><body><canvas id="chart"></canvas><script>globalThis.chart=1</script></body></html>');f.put(one,'报告/B.html','<html><body><details><summary>评论</summary>楼内回复</details></body></html>');
 linkSource(f.root,{role:'reports',selectedRoot:one,authority:'official'});
 const c=classifyVaultResources(readVaultSnapshot(f.runtime));assert.equal(c.accounts.length,2);assert.notEqual(c.accounts[0].id,c.accounts[1].id);assert.deepEqual(new Set(c.accounts.map(s=>s.document.sourceId)),new Set([a.id,b.id]));
 const group=c.reports.find(r=>r.record.title==='多页原报告');assert.ok(group);assert.deepEqual(group.originalPages.map(p=>p.title),['先看评论','后看账号']);
 const production=openLibrary(f.runtime).readProduction();assert.ok(production.reports.some(r=>r.title==='多页原报告'&&r.pages.length===2));
 fs.renameSync(two,two+'-away');assert.equal(resolveSource(f.root,b.id).available,false);assert.ok(readSourceInventory(f.root).sources.some(s=>s.id===b.id&&!s.available));
});
test('source APIs refuse traversal and symlinks and retain missing vs empty distinction',t=>{
 const f=fixture(t),external=path.join(f.parent,'external');fs.mkdirSync(external);f.put(external,'notes.md','原文');const source=linkSource(f.root,{role:'materials',selectedRoot:external,authority:'official'});
 assert.equal(readBoundSourceFile(f.root,{sourceId:source.id,relativePath:'notes.md'}).data.toString(),'原文');assert.throws(()=>readBoundSourceFile(f.root,{sourceId:source.id,relativePath:'../notes.md'}));
 fs.symlinkSync(path.join(external,'notes.md'),path.join(external,'alias.md'));assert.ok(readBoundSourceCatalog(f.root,{sourceId:source.id}).issues.some(i=>i.code==='SYMLINK_REJECTED'));
 fs.renameSync(external,external+'-away');const missing=readBoundSourceCatalog(f.root,{sourceId:source.id});assert.equal(missing.source.available,false);assert.equal(missing.issues[0].code,'SOURCE_NOT_AVAILABLE');
});
test('supplement import requires exact frozen plan, copies nonexisting files, records hashes and works without old root',t=>{
 const f=fixture(t),bundle=path.join(f.parent,'package');fs.mkdirSync(bundle);
 f.put(bundle,'AIJinCheng/个人IP与内容/选题研究/对标账号/抖音-甲/档案.json',JSON.stringify({account_name:'甲',platform:'抖音'}));
 f.put(bundle,'AIJinCheng/通用资源/工具与效率/提示词库/常用/写作/正文.md','---\ntitle: 原提示词\ntags: 写作、标题\n---\n完整原提示词 {{主题|填一个主题}}');
 const plan=planJinchengSupplement({packageRoot:bundle,selection:['accounts','prompts']});assert.throws(()=>importJinchengSupplement({vaultRoot:f.root,packageRoot:bundle,selection:['accounts','prompts'],expectedPlanHash:'0'.repeat(64),expectedManifestHash:null}),{code:'CONFLICT'});
 const imported=importJinchengSupplement({vaultRoot:f.root,packageRoot:bundle,selection:['accounts','prompts'],expectedPlanHash:plan.planHash,expectedManifestHash:null,importId:'acceptance'});assert.equal(imported.record.sources.length,2);
 fs.renameSync(bundle,bundle+'-not-available');const api=openLibrary(f.runtime);assert.equal(api.readProduction().accounts[0].name,'甲');assert.equal(api.listPrompts()[0].title,'原提示词');assert.deepEqual(api.listPrompts()[0].tags,['写作','标题']);assert.match(api.readPrompt(api.listPrompts()[0].id).body,/完整原提示词/);
 assert.throws(()=>importJinchengSupplement({vaultRoot:f.root,packageRoot:bundle+'-not-available',selection:['accounts','prompts'],expectedPlanHash:plan.planHash,expectedManifestHash:imported.manifestHash,importId:'acceptance'}));
});
