import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {createVault} from '../../vault/index.mjs';
import {createLibrary,openLibrary} from '../index.mjs';
import {productionRecordPermissions,assertProductionRecordMutation} from '../production-record-policy.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
function fixture(t,vault=false){const parent=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'nova-record-life-'));t.after(()=>fs.rmSync(parent,{recursive:true,force:true}));const root=path.join(parent,'lib');fs.mkdirSync(root);const runtime=vault?createVault(root).root:root;return{parent,root,runtime,lib:vault?openLibrary(runtime):createLibrary(root)};}
const mutate=(lib,op,input={})=>lib.mutateProduction(op,{...input,expectedToken:lib.readProduction().editToken},{mutationId:randomUUID()});
const account=(lib,name='手工账号')=>mutate(lib,'saveAccount',{name,platform:'抖音',url:'https://example.test/'+name,note:'原备注',tags:['原标签'],images:[],reportIds:[]}).accounts.at(-1);
const report=(lib,accounts=[])=>mutate(lib,'saveReport',{title:'手工报告',type:'调研',accountIds:accounts,sourceUrl:'https://example.test/source',collectedAt:'2026-10-28T00:00:00.000Z',meta:{unknown:{keep:[1,'原样']}},markdown:'# 正文\n\n本人  原文\n'}).reports.at(-1);
for(const vault of [false,true])test(`${vault?'Vault':'legacy'} manual account/report soft lifecycle preserves identities, body, links and shared assets`,t=>{
 const f=fixture(t,vault),a=account(f.lib),b=account(f.lib,'第二账号'),r=report(f.lib,[a.id,b.id]),body=f.lib.readAsset(r.pages[0].assetHash).data;
 assert.equal(productionRecordPermissions(f.runtime,f.lib.readProduction()).reports[r.id].editable,true);
 mutate(f.lib,'trashAccount',{id:a.id});assert.equal(f.lib.readProduction().reports.find(x=>x.id===r.id).deletedAt,null);
 const edited=mutate(f.lib,'saveReport',{id:r.id,title:'改元信息',type:r.type,accountIds:r.accountIds,sourceUrl:r.sourceUrl,collectedAt:r.collectedAt,meta:r.meta,markdown:r.meta.manualMarkdown}).reports.find(x=>x.id===r.id);assert.deepEqual(edited.accountIds,[a.id,b.id]);assert.equal(edited.pages[0].id,r.pages[0].id);
 mutate(f.lib,'trashReport',{id:r.id});const trashed=f.lib.readProduction().reports.find(x=>x.id===r.id);assert.deepEqual(trashed.pages,edited.pages);assert.equal(f.lib.readProduction().accounts.find(x=>x.id===b.id).deletedAt,null);
 const restored=mutate(f.lib,'restoreReport',{id:r.id}).reports.find(x=>x.id===r.id);assert.equal(restored.id,r.id);assert.equal(restored.pageId,edited.pageId);assert.deepEqual(restored.accountIds,[a.id,b.id]);assert.deepEqual(restored.meta.unknown,{keep:[1,'原样']});mutate(f.lib,'restoreAccount',{id:a.id});
 assert.deepEqual(f.lib.readAsset(r.pages[0].assetHash).data,body);assert.equal(openLibrary(f.runtime).readProduction().reports.find(x=>x.id===r.id).deletedAt,null);
});
test('HTML edits retain unmodified page id/hash/order/current page and unknown metadata',t=>{
 const f=fixture(t),pages=[];for(let i=0;i<2;i++){const file=path.join(f.parent,`page${i}.html`);fs.writeFileSync(file,`<html><body><a href="page1.html">相对引用</a>第${i}页</body></html>`);pages.push({id:randomUUID(),title:'页'+i,assetHash:f.lib.importAsset(file,{purpose:'production-report'}).assetHash});}
 const r=mutate(f.lib,'saveReport',{title:'多页报告',type:'调研',accountIds:[],sourceUrl:null,collectedAt:null,meta:{keep:{nested:['值']}},pages,pageId:pages[1].id}).reports.at(-1),edited=mutate(f.lib,'saveReport',{id:r.id,title:'只改标题',type:r.type,accountIds:r.accountIds,sourceUrl:r.sourceUrl,collectedAt:r.collectedAt,meta:r.meta,pages:r.pages,pageId:r.pageId}).reports.at(-1);
 assert.deepEqual(edited.pages,pages);assert.equal(edited.pageId,pages[1].id);assert.deepEqual(edited.meta,r.meta);assert.ok(f.lib.readAsset(pages[0].assetHash).data.toString().includes('href="page1.html"'));
});
test('native policy blocks internal original and linked source projections even through direct mutations',t=>{
 const f=fixture(t,true);fs.writeFileSync(path.join(f.root,'01_对标账号','原账号.md'),'# 来源账号\n\n- 账号名称：原账号\n- 平台：抖音\n');fs.writeFileSync(path.join(f.root,'10_调研报告','原调研报告.md'),'# 原报告\n\n结论原文');let state=f.lib.readProduction();
 const originalAccount=state.accounts.find(x=>x.name==='原账号'),originalReport=state.reports.find(x=>x.title==='原报告');assert.ok(originalAccount);assert.ok(originalReport);const before=hash(fs.readFileSync(path.join(f.root,'10_调研报告','原调研报告.md'))),policy=productionRecordPermissions(f.runtime,state);assert.equal(policy.accounts[originalAccount.id].editable,false);assert.equal(policy.reports[originalReport.id].editable,false);
 for(const [op,id]of [['trashAccount',originalAccount.id],['restoreAccount',originalAccount.id],['trashReport',originalReport.id],['restoreReport',originalReport.id]])assert.throws(()=>mutate(f.lib,op,{id}),{code:'FORBIDDEN'});
 assert.throws(()=>assertProductionRecordMutation(f.runtime,state,'saveReport',{id:originalReport.id,title:'伪覆盖',meta:{}}),{code:'FORBIDDEN'});assert.equal(hash(fs.readFileSync(path.join(f.root,'10_调研报告','原调研报告.md'))),before);
});
test('ordinary saves cannot mint task/radar/source provenance and CAS failures preserve originals',t=>{
 const f=fixture(t),r=report(f.lib),state=f.lib.readProduction();for(const meta of [{taskId:randomUUID()},{receiptHash:'a'.repeat(64)},{radar:{}},{vault:{sourceId:'forged'}}])assert.throws(()=>mutate(f.lib,'saveReport',{id:r.id,title:'伪造',type:r.type,accountIds:[],sourceUrl:null,collectedAt:null,meta,markdown:'不应保存'}),{code:'FORBIDDEN'});
 mutate(f.lib,'recordFeedback',{text:'独立变动',source:'test'});assert.throws(()=>f.lib.mutateProduction('trashReport',{id:r.id,expectedToken:state.editToken},{mutationId:randomUUID()}),{code:'CONFLICT'});assert.equal(f.lib.readProduction().reports.find(x=>x.id===r.id).deletedAt,null);
});
test('explicitly linked account/report originals reject all lifecycle mutations and remain untouched',async t=>{const f=fixture(t,true),external=path.join(f.parent,'external');fs.mkdirSync(external);fs.writeFileSync(path.join(external,'linked-account.md'),'# 外部账号\n\n- 账号名称：外部账号\n- 平台：抖音\n');fs.mkdirSync(path.join(external,'linked-report'));fs.writeFileSync(path.join(external,'linked-report/report.html'),'<html><body>外部报告原文</body></html>');const {linkSource,importSource,readBoundSourceFile}=await import('../../vault/source-map.mjs');for(const [role,file]of [['benchmark-accounts','linked-account.md'],['reports','linked-report/report.html']]){const linked=linkSource(f.root,{role,selectedRoot:external,authority:'official',writable:false}),source=readBoundSourceFile(f.root,{sourceId:linked.id,relativePath:file});importSource(f.root,{sourceId:linked.id,selectedEntries:[file],expectedHashes:{[file]:source.hash}});}const state=f.lib.readProduction(),a=state.accounts.find(x=>x.name==='外部账号'),r=state.reports.find(x=>x.meta?.vault?.relativePath?.endsWith('/linked-report/report.html'));assert.ok(a);assert.ok(r);for(const [op,id]of [['trashAccount',a.id],['restoreAccount',a.id],['trashReport',r.id],['restoreReport',r.id]])assert.throws(()=>mutate(f.lib,op,{id}),{code:'FORBIDDEN'});assert.equal(fs.readFileSync(path.join(external,'linked-report/report.html'),'utf8'),'<html><body>外部报告原文</body></html>');});
