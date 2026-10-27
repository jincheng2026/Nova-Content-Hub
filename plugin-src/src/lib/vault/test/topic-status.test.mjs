import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createVault,readVaultSnapshot,readVaultTaskContext} from '../index.mjs';
import {contentSources,topicCardStatus,digest} from '../core.mjs';
const actualCard=fs.readFileSync(new URL('./fixtures/topic-status/T050_旅游营销工作台宣传片获客口播.md',import.meta.url),'utf8');
function fixture(t,statusText=actualCard){const root=fs.mkdtempSync(path.join(os.tmpdir(),'nova-topic-status-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const binding=createVault(root),card='04_选题库/口播观点/待做/T050_旅游营销工作台宣传片获客口播.md',dir='05_内容草稿/T050_旅游营销工作台宣传片获客口播';fs.mkdirSync(path.dirname(path.join(root,card)),{recursive:true});fs.mkdirSync(path.join(root,dir),{recursive:true});fs.writeFileSync(path.join(root,card),statusText);fs.writeFileSync(path.join(root,dir,'口播稿.md'),'# 已经写好的口播稿\n这是已定的稿件。');fs.writeFileSync(path.join(root,'05_内容草稿/00_草稿总览.md'),'# 草稿总览\n\n## 正在做（11 条）\n\n| T050 | 旅游营销工作台宣传片获客口播 | 10-20 口播稿已定；工作台目前不能对外，暂不做 | [口播稿](T050_旅游营销工作台宣传片获客口播/口播稿.md) |\n');return {root,binding,card,dir};}
test('actual T050 author status pauses a real existing draft and retains conflicting overview classification',t=>{
 const f=fixture(t),snapshot=readVaultSnapshot(f.binding.root),source=contentSources(snapshot).find(item=>item.tNumber==='T050');
 assert.equal(source.topicStatus.paused,true);assert.equal(source.topicStatus.status,'待写（口播稿已定，暂不做：工作台目前不能对外）');assert.equal(source.topicStatus.reason,'暂不做：工作台目前不能对外');
 const status=source.topicStatus.evidence[0];assert.equal(status.origin,'topic-card-status');assert.equal(status.relativePath,f.card);assert.equal(status.line,5);assert.equal(status.hash,digest(actualCard));assert.equal(status.text,'- **状态**：待写（口播稿已定，暂不做：工作台目前不能对外）');
 const overview=source.evidence.find(e=>e.origin==='draft-overview');assert.equal(overview.section,'正在做（11 条）');assert.match(overview.text,/口播稿已定/);assert.equal(source.document.relativePath,f.dir+'/口播稿.md');
 const context=readVaultTaskContext(f.binding.root,source.contentId);assert.ok(context.content.evidence.some(e=>e.origin==='topic-card-status'&&e.paused));assert.ok(context.content.evidence.some(e=>e.origin==='draft-overview'&&e.section==='正在做（11 条）'));
});
test('body quotations and negated status do not pause a work',t=>{
 for(const state of ['待写','草稿（不要暂缓，照常做）','草稿（暂停已解除）']){const f=fixture(t,'# T050 测试\n\n- **状态**：'+state+'\n\n## 内容\n\n锦成说“暂不做”和“不要暂缓”只是这段要分析的引用。\n- **状态**：暂缓\n');const source=contentSources(readVaultSnapshot(f.binding.root)).find(item=>item.tNumber==='T050');assert.equal(source.topicStatus.paused,false,state);assert.equal(source.topicStatus.evidence.length,1);assert.equal(source.topicStatus.status,state);}
});
test('recorded and actual manual publication are retained independently from pause',t=>{
 const f=fixture(t,actualCard.replace('待写（口播稿已定，暂不做：工作台目前不能对外）','已发布（暂缓后续宣传：资料待补）'));const html='<script type="application/json" id="jc-doc">'+JSON.stringify({schema:1,page_id:'p050',items:[{id:'info',kind:'info',locked:{title:'测试'},fields:{recorded:'2026-10-20'}},{id:'s',kind:'segment',locked:{order:1},fields:{mine:'正文'}}]})+'</script>';fs.writeFileSync(path.join(f.root,f.dir,'创作页.html'),html);const source=contentSources(readVaultSnapshot(f.binding.root)).find(item=>item.tNumber==='T050');assert.equal(source.topicStatus.paused,true);assert.equal(source.published,true);assert.equal(source.recorded,true);
});
test('status evidence rejects a changed card hash instead of attributing newer text to an old version',t=>{
 const f=fixture(t),snapshot=readVaultSnapshot(f.binding.root),doc=snapshot.documents.find(d=>d.relativePath===f.card);fs.appendFileSync(path.join(f.root,f.card),'\n外部修改\n');assert.throws(()=>topicCardStatus(snapshot,[doc]),{code:'CONFLICT'});
});
