import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {parseCreationHtml} from '../parse.mjs';
const api=await import('../packaging.mjs').catch(error=>{if(error.code==='ERR_MODULE_NOT_FOUND')return {};throw error;});
const hash=value=>createHash('sha256').update(value).digest('hex');
const slot=(id,name,value)=>({id,kind:'pubslot',locked:{slot:name},fields:{final:value}});
const parsed=items=>parseCreationHtml(Buffer.from('<script id="jc-doc" type="application/json">'+JSON.stringify({schema:1,page_id:'packaging-page',content_id:'T044',items})+'</script>'),{sourceId:'drafts',documentId:'synthetic'});
function extract(doc){assert.equal(typeof api.extractCreationPackaging,'function','packaging extraction must exist');return api.extractCreationPackaging(doc);}
test('extracts only unique exact pubslot fields.final, retaining whitespace and empty author selections',()=>{
 const doc=parsed([slot('title','标题','  已选标题\n'),slot('cover','封面文字',''),slot('description','简介','简介原文'),{id:'candidate',kind:'pubcand',locked:{slot:'标题'},fields:{final:'不能偷拿的候选',text:'候选'}},{id:'final-title',kind:'final',locked:{slot:'标题'},fields:{final:'别的类型'}}]);
 const before=JSON.stringify(doc);
 const value=extract(doc);
 assert.deepEqual(value.fields,{title:{itemId:'title',value:'  已选标题\n',hash:hash('  已选标题\n')},coverText:{itemId:'cover',value:'',hash:hash('')},description:{itemId:'description',value:'简介原文',hash:hash('简介原文')}});
 assert.deepEqual(value.issues,[]);assert.equal(JSON.stringify(doc),before);
});
test('duplicate slots and damaged final fields remain unresolved instead of selecting a candidate',()=>{
 const value=extract(parsed([slot('a','标题','第一份'),slot('b','标题','第二份'),{id:'cover',kind:'pubslot',locked:{slot:'封面文字'},fields:{}},slot('description','简介','保留的简介')]));
 assert.equal(value.fields.title,null);assert.equal(value.fields.coverText,null);assert.equal(value.fields.description.value,'保留的简介');
 assert.ok(value.issues.some(issue=>issue.includes('DUPLICATE_PACKAGING_SLOT')));
 assert.ok(value.issues.some(issue=>issue.includes('INVALID_PACKAGING_FINAL')));
});
test('missing slots and translated or inferred slot identities never borrow other values',()=>{
 const value=extract(parsed([{id:'pubslot-title',locked:{slot:'标题'},fields:{final:'没有明确kind'}},slot('english','title','English'),{id:'candidate',kind:'pubcand',locked:{slot:'简介'},fields:{text:'候选简介',decision:'选用'}}]));
 assert.deepEqual(value.fields,{title:null,coverText:null,description:null});
 assert.equal(value.issues.filter(issue=>issue.startsWith('MISSING_PACKAGING_SLOT')).length,3);
});
test('duplicate item IDs cannot identify distinct author fields even across different slots',()=>{
 const value=extract(parsed([slot('same','标题','标题'),slot('same','封面文字','封面'),slot('description','简介','简介')]));
 assert.equal(value.fields.title,null);assert.equal(value.fields.coverText,null);
 assert.ok(value.issues.some(issue=>issue.includes('DUPLICATE_ITEM_ID')));
});
