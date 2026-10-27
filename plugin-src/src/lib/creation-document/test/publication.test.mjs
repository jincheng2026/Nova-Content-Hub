import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createVault} from '../../vault/index.mjs';
import {buildCreationPage,regenerateCreationPage,readCreationDocument,loadTrustedCreationTemplate} from '../index.mjs';
import {packagingBuildData} from './packaging-fixture.mjs';
test('first HTML build and regeneration retain all publication candidates, author finals and extensions',async t=>{
 const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'creation-publish-build-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));createVault(root);const vaultId=JSON.parse(fs.readFileSync(path.join(root,'.workbench/vault.json'),'utf8')).vaultId;
 const source={sourceId:'drafts',documentId:'publication-build',relativePath:'05_内容草稿/T044/创作页.html',vaultId};
 const input={work:{vaultId,workId:'T044'},source,data:packagingBuildData(),templateVersion:loadTrustedCreationTemplate().version,mutationId:'publication-build-0001'};
 await buildCreationPage(root,input);const before=await readCreationDocument(root,source),slots=before.items.filter(i=>i.kind==='pubslot'),candidates=before.items.filter(i=>i.kind==='pubcand');
 assert.equal(slots.length,3);assert.equal(candidates.length,29);assert.deepEqual(slots.map(i=>i.fields.final),['合成候选0-0','合成候选1-0','合成候选2-0']);
 const attempted=packagingBuildData();for(const item of attempted.items)if(item.kind==='pubslot')item.fields.final='生成器不得覆盖作者选择';
 await regenerateCreationPage(root,{...input,data:attempted,expectedRevision:before.revision,mutationId:'publication-rebuild-0001'});const after=await readCreationDocument(root,source);
 assert.equal(after.pageId,before.pageId);assert.equal(after.raw.token,before.raw.token);
 for(const previous of [...slots,...candidates]){const next=after.items.find(i=>i.id===previous.id);assert.deepEqual(next.fields,previous.fields);assert.deepEqual(next.locked,previous.locked);}
 assert.equal(after.items.find(i=>i.id==='seg-one').fields.mine,'合成原句只出现一次。');
});
