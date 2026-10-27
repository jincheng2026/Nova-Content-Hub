import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../index.mjs';
const source = {sourceId:'drafts', documentId:'synthetic', relativePath:'05_内容草稿/a.html'};
const item = {id:'seg-a',kind:'segment',locked:{order:2,baseline:'原句',refs:[{video:'../video.mp4',future:{a:1}}],ai_state:{reply:'旧答'}},fields:{mine:'原句',note:'建议'},extra:{untouched:true}};
const raw = {page_id:'abcdefghij',token:'secret',content_id:'T001',future:{x:[1,'a']},items:[{...item},{id:'seg-b',kind:'segment',locked:{order:1},fields:{mine:'乙',note:''}},{id:'future-a',kind:'unknown_branch',locked:{custom:[1,2]},fields:{future:'原样'}}]};
const bytes = Buffer.from('\ufeff<!doctype html>\r\n<!-- <script id="jc-doc" type="application/json">fake</script> -->\r\n<script>const fake="<script id=jc-doc>";</script><script id="jc-doc" type="application/json">\r\n'+JSON.stringify(raw)+'\r\n</script>\r\n<script>throw new Error("must never run")</script>');
test('complete data and untouched bytes survive reading and no-op replacing',()=>{
 const doc=api.parseCreationHtml(bytes,source);
 assert.deepEqual(doc.raw,raw); assert.equal(doc.writable,true);
 assert.deepEqual(api.orderedSegments(doc).map(x=>x.id),['seg-b','seg-a']);
 assert.deepEqual(api.replaceCreationData(bytes,doc),bytes);
 const next=structuredClone(doc); next.raw.items[0].fields.mine='</script>新稿';
 const out=api.replaceCreationData(bytes,next); const text=out.toString();
 assert.ok(text.includes('\\u003c/script\\u003e'));
 assert.deepEqual(api.parseCreationHtml(out,source).raw.items[0].fields.mine,'</script>新稿');
 const beforeData=bytes.indexOf(Buffer.from('\r\n'+JSON.stringify(raw)));
 assert.deepEqual(out.subarray(0,beforeData),bytes.subarray(0,beforeData));
 assert.ok(out.toString().endsWith('</script>\r\n<script>throw new Error("must never run")</script>'));
});
test('fingerprint uses locked only, excludes reply state and normalizes NFC and line endings',()=>{
 assert.equal(api.itemFingerprint({locked:{a:'e\u0301\r\nb',z:1,ai_state:{reply:'x'}}}),api.itemFingerprint({locked:{z:1.0,a:'é\nb',ai_state:{reply:'y'}},fields:{mine:'different'}}));
 assert.notEqual(api.itemFingerprint(item),api.itemFingerprint({...item,locked:{...item.locked,title:'changed'}}));
});
test('malformed structures are never writable and duplicate JSON keys cannot silently disappear',()=>{
 assert.throws(()=>api.parseCreationHtml(Buffer.from('<script id="jc-doc" type="application/json">{"page_id":"a","items":[],"items":[]}</script>'),source),/DUPLICATE_JSON_KEY/);
 assert.throws(()=>api.parseCreationHtml(Buffer.concat([bytes,bytes]),source),/JC_DOC_COUNT/);
 const invalid=structuredClone(raw);invalid.items.push({...item});
 const d=api.parseCreationHtml(Buffer.from('<script id="jc-doc" type="application/json">'+JSON.stringify(invalid)+'</script>'),source);
 assert.equal(d.writable,false);assert.ok(d.issues.some(x=>x.includes('DUPLICATE_ITEM_ID')));
 assert.throws(()=>api.replaceCreationData(bytes,d),/READ_ONLY|IDENTITY/);
});
test('oversized replacements fail before a transaction can persist an unusable intent',()=>{
 const d=api.parseCreationHtml(bytes,source);d.items[0].fields.mine='字'.repeat(3*1024*1024);
 assert.throws(()=>api.replaceCreationData(bytes,d),/CREATION_SIZE_LIMIT/);
});
