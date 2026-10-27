import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createVault,readVaultSnapshot} from '../../plugin-src/src/lib/vault/index.mjs';
import {linkSource} from '../../plugin-src/src/lib/vault/source-map.mjs';
import {digest} from '../../plugin-src/src/lib/vault/core.mjs';
import {executeJinchengSource} from '../src/main/jincheng-source-worker.mts';
import {ProductionPages} from '../src/main/production-pages.mts';
const provided='/Users/mac/Downloads/锦成工作台-同事版/数据和程序';
const visual=path.join(provided,'Documents/ChatGPT/锦成VI/视觉评审网站');
const bookmarks=path.join(provided,'AIJinCheng/个人IP与内容/选题研究/X书签工作台');
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'source-pages-'));t.after(()=>fs.rmSync(root,{force:true,recursive:true}));const b=createVault(root);return {root,b,run:(op,args)=>executeJinchengSource(op,{binding:b,...args},'disabled')};}
const haveSources=fs.existsSync(visual)&&fs.existsSync(bookmarks);
test('unknown source HTML is opaque read-only and traversal/active asset endpoints are refused',t=>{
 const f=fixture(t),external=path.join(f.root,'external');fs.mkdirSync(path.join(external,'public'),{recursive:true});fs.writeFileSync(path.join(external,'public/index.html'),'<html><head><title>自定义页</title></head><body><script>window.custom=1</script></body></html>');const s=linkSource(f.root,{role:'visual-assets',selectedRoot:external,authority:'official'});
 const page=f.run('jinchengSourcePage',{sourceId:s.id,relativePath:'public/index.html'});assert.equal(page.allowWrites,false);assert.match(page.html,/window.custom=1/);assert.throws(()=>f.run('jinchengSourceAsset',{sourceId:s.id,relativePath:'public/index.html'}),{code:'FORBIDDEN'});assert.throws(()=>f.run('jinchengSourcePage',{sourceId:s.id,relativePath:'../index.html'}));assert.throws(()=>f.run('jinchengSourceRequest',{sourceId:s.id,expectedHash:null,request:{method:'POST',path:'/storage',body:{key:'abc',value:'def'}}}),{code:'FORBIDDEN'});
});
test('frozen real VI templates inline source dependencies, preserve source evidence and persist CAS selections in the bound vault',{skip:!haveSources},t=>{
 const f=fixture(t),source=linkSource(f.root,{role:'visual-assets',selectedRoot:visual,authority:'official'}),before=digest(fs.readFileSync(path.join(visual,'data/reviews.json')));
 const page=f.run('jinchengSourcePage',{sourceId:source.id,relativePath:'public/index.html'});assert.equal(page.allowWrites,true);assert.match(page.html,/function keepPending/);assert.doesNotMatch(page.html,/<script[^>]+src=/);assert.ok(page.api['/api/catalogue'].items.length>0);
 const saved=f.run('jinchengSourceRequest',{sourceId:source.id,expectedHash:null,request:{method:'POST',path:'/api/reviews/V01',body:{_revision:1,status:'like',note:'明确当前选择',selectedImages:['V01-1']}}});assert.match(saved.stateHash,/^[a-f0-9]{64}$/);assert.equal(f.run('jinchengSourcePage',{sourceId:source.id,relativePath:'public/index.html'}).api['/api/reviews'].reviews.V01.note,'明确当前选择');assert.equal(digest(fs.readFileSync(path.join(visual,'data/reviews.json'))),before);const exported=f.run('jinchengSourceRequest',{sourceId:source.id,expectedHash:saved.stateHash,request:{method:'POST',path:'/api/export',body:{}}});assert.match(exported.data.exportText,/明确当前选择/);
 assert.throws(()=>f.run('jinchengSourceRequest',{sourceId:source.id,expectedHash:null,request:{method:'POST',path:'/storage',body:{key:'x',value:'y'}}}),{code:'CONFLICT'});
});
test('real X bookmark snapshot keeps all records, notes survive reopen and selecting material is idempotent',{skip:!haveSources},t=>{
 const f=fixture(t),source=linkSource(f.root,{role:'bookmarks',selectedRoot:bookmarks,authority:'official'}),page=f.run('jinchengSourcePage',{sourceId:source.id,relativePath:'X书签工作台.html'}),items=page.api['/api/snapshot'].data.items;assert.equal(items.length,586);assert.equal(page.allowWrites,true);assert.match(page.html,/选入素材/);assert.doesNotMatch(page.html,/machineStage: "生产中",/);
 const saved=f.run('jinchengSourceRequest',{sourceId:source.id,expectedHash:null,request:{method:'POST',path:'/api/progress',body:{id:items[0].id,decision:'优先做',note:'我的判断',updatedAt:'2026-10-28T00:00:00.000Z'}}});
 assert.equal(f.run('jinchengSourcePage',{sourceId:source.id,relativePath:'X书签工作台.html'}).api['/api/snapshot'].notes[items[0].id],'我的判断');
 const args={sourceId:source.id,expectedHash:saved.stateHash,request:{method:'POST',path:'/api/start-production',body:{id:items[0].id,preferredCarrier:'视频'}}};const one=f.run('jinchengSourceRequest',args),two=f.run('jinchengSourceRequest',args);assert.equal(one.data.materialPath,two.data.materialPath);const docs=readVaultSnapshot(f.b.root).documents.filter(d=>d.relativePath===one.data.materialPath);assert.equal(docs.length,1);assert.match(fs.readFileSync(path.join(f.root,one.data.materialPath),'utf8'),/尚未确认选题或创建生产内容/);
});
test('original source gateway confines script execution to connect-none opaque frame and does not serve raw active assets',{skip:!haveSources},async t=>{
 const f=fixture(t),source=linkSource(f.root,{role:'visual-assets',selectedRoot:visual,authority:'official'}),pages=new ProductionPages({worker:{call:(op,args)=>Promise.resolve(executeJinchengSource(op,args,'disabled'))},authorize:async()=>{},creationHtml:'',readCreation:async()=>{},saveDraft:async()=>{}});t.after(()=>pages.close());
 const url=await pages.openBoundSource(f.b,source.id,'public/index.html'),wrapper=await fetch(url),html=await wrapper.text();assert.match(html,/sandbox="allow-scripts"/);assert.doesNotMatch(html,/allow-same-origin/);for(const script of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g))assert.doesNotThrow(()=>new vm.Script(script[1]));
 const frame=await fetch(`${url}frame/${encodeURIComponent('public/index.html')}`),csp=frame.headers.get('content-security-policy');assert.match(csp,/sandbox allow-scripts/);assert.match(csp,/connect-src 'none'/);assert.match(csp,/frame-src 'none'/);assert.match(csp,/form-action 'none'/);assert.doesNotMatch(csp,/unsafe-eval/);assert.match(await frame.text(),/nova-source-request/);
 assert.notEqual((await fetch(`${url}file/public/app.js`)).status,200);assert.notEqual((await fetch(`${url}file/../data/catalogue.json`)).status,200);
 assert.equal((await fetch(`${url}request`,{method:'POST',headers:{Origin:'null','Content-Type':'application/json'},body:'{}'})).status,403);
});
