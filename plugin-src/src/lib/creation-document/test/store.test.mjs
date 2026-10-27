import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createVault} from '../../vault/index.mjs';import * as api from '../index.mjs';
test('save uses existing vault journal, survives retry and reads original and new history',async(t)=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'creation-store-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));createVault(root);
 const source={sourceId:'drafts',documentId:'fixture',relativePath:'05_内容草稿/a.html'};
 const raw={page_id:'abcdefghij',token:'secret',items:[{id:'seg-a',kind:'segment',locked:{order:1,ai_state:{reply:'旧回复'}},fields:{mine:'原句',note:'意见'}}],future:{deep:['untouched']}};
 fs.writeFileSync(path.join(root,source.relativePath),'prefix<script id="jc-doc" type="application/json">'+JSON.stringify(raw)+'</script>suffix');
 fs.mkdirSync(path.join(root,'.jc-changes'));fs.writeFileSync(path.join(root,'.jc-changes/abcdefghij.jsonl'),JSON.stringify({time:'2026-01-01T00:00:00Z',change_id:'old',item:'seg-a',field:'mine',before:'最初',after:'原句',origin:'human'})+'\n{"truncated":');
 const d=await api.readCreationDocument(root,source);const input={mutationId:'kit-save-0001',page_id:d.pageId,token:'secret',changes:[{change_id:'new',item_id:'seg-a',field:'mine',before:'原句',after:'新句',item_fp:api.itemFingerprint(d.items[0])}]};
 const saved=await api.saveKitChanges(root,source,input);assert.equal(saved.results[0].reason,'written');assert.equal(saved.path,source.relativePath);assert.notEqual(saved.fingerprint,saved.base_fingerprint);
 assert.deepEqual(await api.saveKitChanges(root,source,input),saved);
 const after=await api.readCreationDocument(root,source);assert.equal(after.items[0].fields.mine,'新句');assert.deepEqual(after.raw.future,{deep:['untouched']});assert.ok(fs.readFileSync(path.join(root,source.relativePath),'utf8').endsWith('</script>suffix'));
 const history=await api.readHistory(root,source,'seg-a');assert.deepEqual(history.changes.map(x=>x.change_id),['old','new']);
 await assert.rejects(api.saveKitChanges(root,source,{...input,token:'wrong',mutationId:'kit-save-0002'}),/TOKEN/);
 await assert.rejects(api.readCreationDocument(root,{...source,relativePath:'../escape.html'}),/路径|INVALID/);
});
test('a second file with the same page identity blocks ambiguous writes',async(t)=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'creation-duplicate-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));createVault(root);
 const source={sourceId:'drafts',documentId:'fixture',relativePath:'05_内容草稿/a.html'},raw={page_id:'abcdefghij',token:'secret',content_id:'T001',items:[{id:'seg-a',kind:'segment',locked:{order:1},fields:{mine:'原句',note:''}}]},html='<script id="jc-doc" type="application/json">'+JSON.stringify(raw)+'</script>';
 fs.writeFileSync(path.join(root,source.relativePath),html);fs.writeFileSync(path.join(root,'05_内容草稿/b.html'),html);
 await assert.rejects(api.saveKitChanges(root,source,{mutationId:'duplicate-page-001',page_id:'abcdefghij',token:'secret',changes:[{change_id:'a',item_id:'seg-a',field:'mine',before:'原句',after:'不该写入',item_fp:api.itemFingerprint(raw.items[0])}]}),/DUPLICATE_PAGE_ID/);
 assert.equal(fs.readFileSync(path.join(root,source.relativePath),'utf8'),html);
});
