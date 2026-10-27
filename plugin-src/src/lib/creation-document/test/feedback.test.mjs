import test from 'node:test';import assert from 'node:assert/strict';import * as api from '../index.mjs';
function doc(mine='原句后面'){const raw={page_id:'abcdefghij',items:[{id:'seg-a',kind:'segment',locked:{order:1},fields:{mine,note:'新版意见'}},{id:'sug-a',kind:'suggestion',locked:{segment:'seg-a',original:'原句'},fields:{proposed:'',decision:''}}]};return api.parseCreationHtml(Buffer.from('<script id="jc-doc" type="application/json">'+JSON.stringify(raw)+'</script>'),{sourceId:'drafts',documentId:'x'});}
test('adoption handles sentence deletion, partial decisions and edited proposals atomically',()=>{
 const d=doc();const edits=api.buildSuggestionEdits(d,{suggestionId:'sug-a',decision:'采纳'});assert.equal(edits.find(x=>x.field==='mine').after,'后面');assert.equal(edits.find(x=>x.field==='decision').after,'采纳');
 const changed=api.buildSuggestionEdits(d,{suggestionId:'sug-a',decision:'采纳',proposed:'先改建议'});assert.equal(changed.find(x=>x.field==='proposed').after,'先改建议');assert.equal(changed.find(x=>x.field==='mine').after,'先改建议后面');
 assert.equal(api.buildSuggestionEdits(d,{suggestionId:'sug-a',decision:'不采纳'}).some(x=>x.field==='mine'),false);
 assert.throws(()=>api.buildSuggestionEdits(d,{suggestionId:'sug-a',decision:'部分采纳'}),/PARTIAL_MINE_REQUIRED/);
 assert.throws(()=>api.buildSuggestionEdits(doc('原句原句'),{suggestionId:'sug-a',decision:'采纳'}),/QUOTE_NOT_UNIQUE/);
 const item=d.items[0];item.locked.ai_state={handled_note:'旧意见',reply:'旧回复'};assert.equal(api.noteStatus(item),'pending');assert.equal(item.locked.ai_state.reply,'旧回复');
});
