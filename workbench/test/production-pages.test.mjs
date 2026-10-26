import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {createLibrary} from '../../plugin-src/src/lib/file-library/index.mjs';
import {ProductionPages} from '../src/main/production-pages.mts';
import {execute} from '../src/main/worker.mts';
async function fixture(t){
 const parent=await fs.mkdtemp(path.join(os.tmpdir(),'nova-production-pages-'));t.after(()=>fs.rm(parent,{recursive:true,force:true}));const library=createLibrary(path.join(parent,'library')),b={root:library.info.root,libraryId:library.info.libraryId,rootIdentity:library.info.rootIdentity};
 const content=library.createContent({title:'本机创作',body:'原文'});library.mutateProduction('ensureCreation',{contentId:content.id,expectedToken:library.readProduction().editToken},{mutationId:randomUUID()});let current=true;
 const pages=new ProductionPages({worker:{call:(op,args)=>execute(op,args,'disabled')},creationHtml:'<!doctype html><html><head><title>创作</title></head><body><script>window.ready=true;</script></body></html>',authorize:async binding=>{if(!current||JSON.stringify(binding)!==JSON.stringify(b))throw Object.assign(Error('changed'),{code:'FORBIDDEN'});},setReportPosition:async(binding,id,pageId)=>{library.mutateProduction('setReportPosition',{id,pageId,expectedToken:library.readProduction().editToken},{mutationId:randomUUID()});},readCreation:async(binding,id)=>execute('productionCreation',{binding,contentId:id},'disabled'),saveDraft:async(binding,input)=>execute('productionMutate',{binding,pending:{kind:'draft',binding:{libraryId:b.libraryId,rootIdentity:b.rootIdentity},mutationId:randomUUID(),input}},'disabled')});
 t.after(()=>pages.close());return {pages,library,b,content,parent,switchLibrary:()=>{current=false;}};
}
test('creation capabilities share one loopback startup and inject the fixed page endpoint with nonce CSP',async t=>{
 const {pages,b,content}=await fixture(t),urls=await Promise.all(Array.from({length:12},()=>pages.openCreation(b,content.id)));assert.equal(new Set(urls.map(url=>new URL(url).origin)).size,1);assert.equal(new Set(urls).size,1);
 const response=await fetch(urls[0]);assert.equal(response.status,200);const html=await response.text();assert.match(html,/window\.novaCreation=/);assert.match(html,/basePath/);assert.match(html,/<script nonce="/);assert.match(response.headers.get('content-security-policy'),/script-src 'nonce-/);assert.equal(response.headers.get('cache-control'),'no-store');
 const state=await(await fetch(`${urls[0]}state`)).json();assert.equal(state.content.id,content.id);assert.equal(state.content.body,'原文');assert.equal(state.creation.tNumber,'T001');
});
test('creation writes require matching Origin, JSON and server-fixed content, and stale CAS produces 409',async t=>{
 const {pages,b,content}=await fixture(t),url=await pages.openCreation(b,content.id),origin=new URL(url).origin,state=await(await fetch(`${url}state`)).json(),body={body:'确认新稿',editToken:state.content.editToken,bodyHash:state.content.bodyHash,productionToken:state.productionToken,creationPatch:{narrative:'叙事方案'}};
 assert.equal((await fetch(`${url}save`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).status,403);
 assert.equal((await fetch(`${url}save`,{method:'POST',headers:{Origin:'https://other.invalid','Content-Type':'application/json'},body:JSON.stringify(body)})).status,403);
 assert.equal((await fetch(`${url}save`,{method:'POST',headers:{Origin:origin,'Content-Type':'text/plain'},body:JSON.stringify(body)})).status,403);
 assert.equal((await fetch(`${url}save`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({...body,contentId:randomUUID()})})).status,400);
 const saved=await fetch(`${url}save`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(saved.status,200);assert.equal((await saved.json()).content.body,'确认新稿');
 assert.equal((await fetch(`${url}save`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)})).status,409);
});
test('capabilities deny query alterations and cross-library use; reports keep all HTML in network-free sandbox',async t=>{
 const {pages,b,content,library:l,parent,switchLibrary}=await fixture(t),source=path.join(parent,'report.html');await fs.writeFile(source,'<!doctype html><html><body><h1>完整报告</h1><script>fetch("https://unsafe.invalid")</script><img src="https://unsafe.invalid/x"></body></html>');const asset=l.importAsset(source,{purpose:'production-report'});let s=l.readProduction();s=l.mutateProduction('saveReport',{title:'两页报告',type:'调研',accountIds:[],sourceUrl:null,collectedAt:null,pages:[{title:'第一页',assetHash:asset.assetHash},{title:'第二页',assetHash:asset.assetHash}],meta:{},expectedToken:s.editToken},{mutationId:randomUUID()});
 const report=s.reports[0],url=await pages.openReport(b,report.id),wrapper=await(await fetch(url)).text();assert.match(wrapper,/sandbox src=/);assert.match(wrapper,/第二页/);assert.match(wrapper,/aria-current="page"/);
 await fetch(`${url}view/${report.pages[1].id}`);assert.equal(l.readProduction().reports[0].pageId,report.pages[1].id);
 const raw=await fetch(`${url}page/${report.pages[0].id}`);assert.equal(raw.status,200);assert.match(raw.headers.get('content-security-policy'),/^sandbox; default-src 'none'/);assert.match(await raw.text(),/完整报告/);
 assert.equal((await fetch(`${url}?other=1`)).status,404);assert.equal((await fetch(`${url}page/${randomUUID()}`)).status,400);
 const creation=await pages.openCreation(b,content.id);switchLibrary();assert.notEqual((await fetch(`${creation}state`)).status,200);
});
