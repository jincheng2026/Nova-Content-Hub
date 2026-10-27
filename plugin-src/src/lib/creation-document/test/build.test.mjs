import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import * as api from '../index.mjs';import {createVault} from '../../vault/index.mjs';
const data=()=>({content_id:'T001',type:'口播',stage:'写稿',title:'原HTML格式',narrative:{story:'故事',audience:'创作者',problem:'问题'},info:{locked:{futureInfo:{a:1}},fields:{private_note:'保留'}},segments:[{id:'seg-a',title:'开头',role:'引入',mine:'原句只出现一次。',baseline:'底稿',refs:[{who:'参考',source_type:'口播原话',text:'真实原文',time:'0:00 到 0:10',url:'https://example.com',video:'../原片.mp4',future:1}],fields:{our_visual:'录屏'}}],suggestions:[{id:'sug-a',segment:'seg-a',category:'表达',original:'原句',proposed:'新句',reason:'更好',basis:{type:'AI 自己的判断',text:'理由'}}],items:[{id:'step-a',kind:'step',locked:{segment:1,order:1,line:'原句',where:'工具',expect:'结果',caution:''},fields:{prompt:'指令'}}]});
test('first generation retains original regions and safely roundtrips complete fields',()=>{
 const {raw}=api.assembleCreationData(data());const html=api.renderCreationHtml(raw);const d=api.parseCreationHtml(html,{sourceId:'drafts',documentId:'fixture'});
 assert.equal(d.writable,true);assert.equal(d.items[0].fields.private_note,'保留');assert.equal(d.items.find(x=>x.id==='step-a').locked.segment,'seg-a');assert.equal(d.items[1].locked.refs[0].future,1);
 assert.equal(new Set(d.items.map(x=>x.id)).size,4);
 for(const name of ['style','kit','app'])assert.equal(html.toString().split('<!--jc-'+name+':start-->').length,2);
 const exported=api.exportCreationData(d);const rebuilt=api.assembleCreationData(exported,raw).raw;assert.deepEqual(rebuilt,raw);
});
test('regeneration preserves identity, every author field, unknown extensions and AI reply',()=>{
 const first=api.assembleCreationData(data()).raw;first.future={nested:['preserve']};first.items[1].futureItem={x:1};first.items[1].locked.futureLocked={x:2};first.items[1].locked.ai_state={handled_note:'旧意见',reply:'旧答'};first.items[1].fields.mine='作者已改';first.items[1].fields.note='手改意见';first.items[2].fields.decision='采纳';
 const {raw,warnings}=api.assembleCreationData(data(),first);
 assert.equal(raw.page_id,first.page_id);assert.equal(raw.token,first.token);assert.equal(raw.items[0].id,first.items[0].id);assert.equal(raw.items[1].fields.mine,'作者已改');assert.deepEqual(raw.items[1].locked.ai_state,{handled_note:'旧意见',reply:'旧答'});assert.deepEqual(raw.future,{nested:['preserve']});assert.deepEqual(raw.items[1].futureItem,{x:1});assert.deepEqual(raw.items[1].locked.futureLocked,{x:2});
 const missing=data();missing.items=[];assert.throws(()=>api.assembleCreationData(missing,first),/MISSING_OLD_ITEMS/);
 assert.throws(()=>api.assembleCreationData({...data(),segments:[{...data().segments[0],mine:'aaaa'}],suggestions:[{...data().suggestions[0],original:'aa'}]}),/QUOTE_NOT_UNIQUE/);
 assert.throws(()=>api.assembleCreationData({...data(),type:'错的'}),/SCHEMA/);
});
test('first build and regeneration use vault journal and preserve disk author edits',async(t)=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'creation-build-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const vault=createVault(root);
 const descriptor=JSON.parse(fs.readFileSync(path.join(root,'.workbench/vault.json')));const source={sourceId:'drafts',documentId:'new-page',relativePath:'05_内容草稿/T001/创作页.html',vaultId:descriptor.vaultId};
 const input={work:{vaultId:descriptor.vaultId,workId:'T001'},source,data:data(),templateVersion:'jincheng-source-v1',mutationId:'build-page-0001'};
 const built=await api.buildCreationPage(root,input);assert.ok(built.pageId);let d=await api.readCreationDocument(root,source);const seg=d.items.find(x=>x.id==='seg-a');
 await api.commitCreationEdit(root,{source,pageId:d.pageId,baseRevision:d.revision,actor:{kind:'author'},mutationId:'author-edit-0001',edits:[{itemId:seg.id,field:'mine',before:seg.fields.mine,after:'原句只出现一次。作者补充',itemFingerprint:api.itemFingerprint(seg)}]});
 d=await api.readCreationDocument(root,source);await api.regenerateCreationPage(root,{...input,expectedRevision:d.revision,mutationId:'rebuild-page-0001'});const next=await api.readCreationDocument(root,source);assert.equal(next.pageId,built.pageId);assert.equal(next.items.find(x=>x.id==='seg-a').fields.mine,'原句只出现一次。作者补充');
 await assert.rejects(api.regenerateCreationPage(root,{...input,expectedRevision:'0'.repeat(64),mutationId:'rebuild-page-0002'}),/CONFLICT/);
});
test('generated standalone page cannot probe or save to an old local service',async()=>{
 const {runInNewContext}=await import('node:vm');const raw=api.assembleCreationData(data()).raw;
 const html=api.renderCreationHtml(raw).toString();const kit=html.match(/<!--jc-kit:start--><script>\s*([\s\S]*?)<\/script><!--jc-kit:end-->/)[1];let network=0;
 const context={window:{},document:{getElementById:()=>({textContent:JSON.stringify(raw)}),querySelectorAll:()=>[],readyState:'loading',addEventListener:()=>{}},location:{protocol:'file:',pathname:'/page.html'},fetch:()=>{network++;return Promise.reject(new Error('network unavailable'));},setTimeout,clearTimeout,TextEncoder,URL,AbortController};
 runInNewContext(kit,context);const response=await context.window.jcKit.request('GET','/healthz');assert.equal(response.status,403);assert.equal(network,0);assert.equal(context.window.jcKit.ready,false);
});
test('reference analysis validates source quotes and skeleton family membership',()=>{
 const bad=data();bad.items.push({id:'refnote-a',kind:'refnote',locked:{segment:'seg-a',summary:'分析',points:[{tag:'解释',say:'说法',cover:'独有',who:['参考'],quotes:[{who:'参考',time:'0:03',text:'从未出现'}]}]},fields:{}});
 assert.throws(()=>api.assembleCreationData(bad),/QUOTE_EVIDENCE/);
 const skeleton=data();skeleton.items.push({id:'skeleton-a',kind:'skeleton',locked:{families:[{who:'甲'}],rows:[{step:'开头',segment:'seg-a',cells:{'陌生人':'无证据'}}]},fields:{}});assert.throws(()=>api.assembleCreationData(skeleton),/SKELETON_FAMILY/);
});
test('deleting an omitted old item requires a persisted author decision bound to revision and IDs',async(t)=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'creation-delete-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));createVault(root);const descriptor=JSON.parse(fs.readFileSync(path.join(root,'.workbench/vault.json')));
 const source={sourceId:'drafts',documentId:'new',relativePath:'05_内容草稿/T001/a.html',vaultId:descriptor.vaultId},input={work:{vaultId:descriptor.vaultId,workId:'T001'},source,data:data(),templateVersion:'jincheng-source-v1',mutationId:'build-delete-001'};
 await api.buildCreationPage(root,input);const current=await api.readCreationDocument(root,source),missing=data();missing.items=[];
 await assert.rejects(api.regenerateCreationPage(root,{...input,data:missing,expectedRevision:current.revision,removeItemIds:['step-a'],authorDecisionId:'forged-decision',mutationId:'bad-delete-0001'}),/DECISION|ENOENT/);
 const decision=await api.confirmCreationRemoval(root,{source,expectedRevision:current.revision,itemIds:['step-a'],mutationId:'delete-decision-0001'});
 await api.regenerateCreationPage(root,{...input,data:missing,expectedRevision:current.revision,removeItemIds:['step-a'],authorDecisionId:decision.decisionId,mutationId:'delete-rebuild-0001'});
 const after=await api.readCreationDocument(root,source);assert.equal(after.items.some(it=>it.id==='step-a'),false);assert.equal(after.items.find(it=>it.id==='seg-a').fields.mine,'原句只出现一次。');
});
