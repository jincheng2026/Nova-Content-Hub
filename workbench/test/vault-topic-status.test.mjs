import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createVault} from '../../plugin-src/src/lib/vault/index.mjs';
import {executeVault} from '../src/main/vault-worker.mts';
import {classifyWork} from '../src/renderer/jincheng-directory.ts';
test('the single directory IPC carries the real T050 pause and keeps old overview evidence',async t=>{
 const root=await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()),'nova-directory-status-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const binding=createVault(root),card='04_选题库/口播观点/待做/T050_旅游营销工作台宣传片获客口播.md',dir='05_内容草稿/T050_旅游营销工作台宣传片获客口播';
 const bytes=await fs.readFile(new URL('../../plugin-src/src/lib/vault/test/fixtures/topic-status/T050_旅游营销工作台宣传片获客口播.md',import.meta.url));await fs.mkdir(path.dirname(path.join(root,card)),{recursive:true});await fs.mkdir(path.join(root,dir),{recursive:true});await fs.writeFile(path.join(root,card),bytes);await fs.writeFile(path.join(root,dir,'口播稿.md'),'已定口播稿，仍暂不做。');await fs.writeFile(path.join(root,'05_内容草稿/00_草稿总览.md'),'# 草稿总览\n\n## 正在做（11 条）\n\n| T050 | 旅游营销工作台宣传片获客口播 | 口播稿已定，暂不做 | [口播稿](T050_旅游营销工作台宣传片获客口播/口播稿.md) |\n');
 const rows=executeVault('vaultWorkDirectory',{binding},'required'),row=rows.find(item=>item.tNumber==='T050');assert.ok(row);assert.equal(row.topicStatus.paused,true);assert.equal(row.topicStatus.reason,'暂不做：工作台目前不能对外');assert.ok(row.statusEvidence.some(item=>item.origin==='draft-overview'&&item.section==='正在做（11 条）'));assert.ok(row.statusEvidence.some(item=>item.origin==='topic-card-status'&&item.line===5&&item.relativePath===card));assert.equal(classifyWork({...row,paused:row.topicStatus.paused}),'topics');assert.deepEqual(await fs.readFile(path.join(root,card)),bytes);
});
