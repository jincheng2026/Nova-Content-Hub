import test from 'node:test';
import assert from 'node:assert/strict';
const api=await import('../src/renderer/final-assets-state.ts').catch(error=>{if(error.code==='ERR_MODULE_NOT_FOUND')return {};throw error;});
const contentId='19458f29-bb58-4835-bfdc-c7b866f22a2c',preview={contentId,previewToken:'a'.repeat(64),currentHash:null,warnings:['COVER_SOURCE_UNKNOWN'],texts:{script:'当前稿',title:'标题',description:'简介',coverText:'封面字'}};
test('preview flushes before read and stale saved edits are checked before dispatching durable save',async()=>{
 assert.equal(typeof api.FinalAssetsDraft,'function','final panel needs a retained selection and preview boundary');
 const state=new api.FinalAssetsDraft(contentId);const events=[];
 state.select({contentId,packagingDocumentId:'doc-page',manuscript:{kind:'recorded',documentId:'doc-recorded'}});
 await state.readPreview(async()=>{events.push('flush');},async selection=>{events.push('preview');assert.equal(selection.manuscript.kind,'recorded');return preview;});
 assert.deepEqual(events,['flush','preview']);state.acknowledge('COVER_SOURCE_UNKNOWN',true);
 await assert.rejects(state.save(async()=>{events.push('flush-save');throw Error('unsaved original');},async()=>{assert.fail('save after failed flush');}));
 assert.equal(state.preview,preview);assert.equal(state.selection.manuscript.documentId,'doc-recorded');assert.deepEqual([...state.acknowledged],['COVER_SOURCE_UNKNOWN']);
 await assert.rejects(state.save(async()=>{},async input=>{assert.equal(input.expectedPreviewToken,preview.previewToken);assert.deepEqual(input.acknowledgedWarnings,['COVER_SOURCE_UNKNOWN']);throw Error('lost response');}));
 assert.equal(state.preview,preview);assert.equal(state.selection.packagingDocumentId,'doc-page');assert.equal(state.pending,true);
 state.recovered({method:'saveFinalAssets',input:{contentId},outcome:'committed'});assert.equal(state.pending,false);assert.equal(state.preview,preview);assert.equal(state.selection.manuscript.documentId,'doc-recorded');
});
test('new source choice invalidates preview and source warnings require explicit acknowledgement',async()=>{
 assert.equal(typeof api.FinalAssetsDraft,'function');const state=new api.FinalAssetsDraft(contentId);
 await state.readPreview(async()=>{},async()=>preview);
 await assert.rejects(state.save(async()=>{},async()=>{assert.fail('unacknowledged warnings');}),/确认/);
 state.acknowledge('COVER_SOURCE_UNKNOWN',true);state.select({contentId,manuscript:{kind:'current'}});assert.equal(state.preview,null);assert.equal(state.acknowledged.size,0);
 await assert.rejects(state.save(async()=>{},async()=>{assert.fail('no preview');}),/预览/);
});
test('pre-dispatch rejection releases local pending only when native state conclusively excludes this save',async()=>{
 assert.equal(typeof api.FinalAssetsDraft,'function');const state=new api.FinalAssetsDraft(contentId);await state.readPreview(async()=>{},async()=>preview);state.acknowledge('COVER_SOURCE_UNKNOWN',true);
 await assert.rejects(state.save(async()=>{},async()=>{throw Object.assign(Error('locked'),{code:'AUTH_NOT_CONFIGURED'});},async()=>({vaultPending:false})),{code:'AUTH_NOT_CONFIGURED'});
 assert.equal(state.pending,false);assert.equal(state.preview,preview);assert.deepEqual([...state.acknowledged],['COVER_SOURCE_UNKNOWN']);
 await assert.rejects(state.save(async()=>{},async()=>{throw Error('response lost');},async()=>{throw Error('status unavailable');}));assert.equal(state.pending,true);
});
