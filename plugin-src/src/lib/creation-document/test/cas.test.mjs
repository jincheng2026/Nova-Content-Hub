import test from 'node:test';import assert from 'node:assert/strict';
import * as api from '../index.mjs';
const source={sourceId:'drafts',documentId:'a',relativePath:'05_内容草稿/a.html'};
const raw={page_id:'abcdefghij',token:'secret',items:[{id:'seg-a',kind:'segment',locked:{order:1,baseline:'原句',ai_state:{reply:'旧答'}},fields:{mine:'原句',note:'意见',future:'扩展'}},{id:'sug-a',kind:'suggestion',locked:{segment:'seg-a',original:'原句'},fields:{proposed:'新句',decision:''}}],future:{x:1}};
const doc=()=>api.parseCreationHtml(Buffer.from('<script id="jc-doc" type="application/json">'+JSON.stringify(raw)+'</script>'),source);
const edit=(d,id,field,after)=>({itemId:id,field,before:d.items.find(x=>x.id===id).fields[field],after,itemFingerprint:api.itemFingerprint(d.items.find(x=>x.id===id))});
test('strict edit group is atomic, preserves unknown extensions and author ownership',()=>{
 const d=doc();const group={mutationId:'test-edit-0001',source,pageId:d.pageId,baseRevision:d.revision,actor:{kind:'author'},edits:[edit(d,'seg-a','mine','新句'),edit(d,'sug-a','decision','采纳')]};
 const next=api.applyEditGroup(d,group);assert.equal(next.items[0].fields.mine,'新句');assert.equal(next.items[1].fields.decision,'采纳');assert.deepEqual(next.raw.future,{x:1});assert.equal(d.items[0].fields.mine,'原句');
 assert.throws(()=>api.applyEditGroup(d,{...group,edits:[group.edits[0],{...group.edits[1],before:'过期'}]}),/CONFLICT/);assert.equal(d.items[0].fields.mine,'原句');
 assert.throws(()=>api.applyEditGroup(d,{...group,actor:{kind:'assistant',taskId:'task',requestId:'request',approvalId:'untrusted'}}),/AUTHOR_FIELD/);
 assert.throws(()=>api.applyEditGroup(d,{...group,pageId:'other'}),/IDENTITY/);
 const newer=doc();newer.items[0].locked.ai_state={reply:'新版'};assert.equal(api.applyEditGroup(newer,group).items[0].locked.ai_state.reply,'新版');
});
test('kit saves independent groups while refusing every member of a conflicting group',()=>{
 const d=doc();const c=(change_id,item_id,field,before,after,group)=>({change_id,item_id,field,before,after,item_fp:api.itemFingerprint(d.items.find(x=>x.id===item_id)),...(group?{group}:{})});
 const {doc:next,results}=api.applyKitChanges(d,[c('a','seg-a','mine','过期','新句','adopt'),c('b','sug-a','decision','','采纳','adopt'),c('c','seg-a','note','意见','独立意见')],{kind:'author'});
 assert.deepEqual(results.map(x=>[x.change_id,x.status,x.reason]),[['a','conflict','changed'],['b','conflict','group_conflict'],['c','ok','written']]);assert.equal(next.items[0].fields.mine,'原句');assert.equal(next.items[1].fields.decision,'');assert.equal(next.items[0].fields.note,'独立意见');
});
