import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {createLibrary} from '../index.mjs';
import {compositionBodyHash,createProductionComposition,validProductionComposition,migrateProductionComposition,replaceProductionSegment,productionFilmingScript,productionCompositionRuntime} from '../production-composition.mjs';
const digest=body=>createHash('sha256').update(body).digest('hex');

test('portable body hash matches the canonical UTF-8 digest including astral and multiline text',()=>{
 for(const body of ['', 'abc', '中文😀\r\n下一段', 'a'.repeat(1000), '\ud800'])assert.equal(compositionBodyHash(body),digest(body));
 const injected=Function(`return (${productionCompositionRuntime.toString()})()` )();assert.equal(injected.bodyHash('同一算法'),digest('同一算法'));
});
test('ranges use UTF16 offsets; replacement preserves IDs, suffix and later associations',()=>{
 const body='开头😀\r\n\r\n第二段。\n下一行',composition=createProductionComposition(body),first=composition.segments[0],second=composition.segments[1];
 assert.equal(body.slice(first.start,first.end),'开头😀');assert.equal(body.slice(second.start,second.end),'第二段。\n下一行');
 const next=replaceProductionSegment({body,composition,segmentId:first.id,replacement:'新的开头😀😀'});
 assert.equal(next.body,'新的开头😀😀\r\n\r\n第二段。\n下一行');assert.equal(next.composition.segments[1].id,second.id);assert.equal(next.body.slice(next.composition.segments[1].start,next.composition.segments[1].end),'第二段。\n下一行');assert.equal(validProductionComposition(next.composition,next.body,digest(next.body)),true);assert.equal(body,'开头😀\r\n\r\n第二段。\n下一行');
});
test('schema rejects overlaps, duplicate IDs, surrogate splits, bounds and stale hashes',()=>{
 const body='😀\n\n第二段',value=createProductionComposition(body),first=value.segments[0];
 for(const bad of [{...value,bodyHash:'0'.repeat(64)},{...value,segments:[{...first,start:1}]},{...value,segments:[first,{...value.segments[1],start:1}]},{...value,segments:[first,{...value.segments[1],id:first.id}]},{...value,segments:[{...first,end:body.length+1}]}])assert.equal(validProductionComposition(bad,body,digest(body)),false);
 assert.throws(()=>replaceProductionSegment({body:body+'改动',composition:value,segmentId:first.id,replacement:'新稿'}),{code:'STALE_INPUT'});
});
test('whole-body migration only matches unique exact text and returns all unmatched associations',()=>{
 const body='第一段\n\n第二段',value=createProductionComposition(body),referenceId=randomUUID();value.segments[0].references=[{referenceId,role:'primary',quote:'原证据',startMs:null,endMs:null,visual:'来源画面'}];
 const moved=migrateProductionComposition(value,body,'前言\n\n'+body);assert.equal(moved.unmatchedSegments.length,0);assert.equal(moved.composition.segments[0].start,4);assert.equal(moved.composition.segments[0].id,value.segments[0].id);
 const changed=migrateProductionComposition(value,body,'第一段改写\n\n第二段\n\n第一段');assert.equal(changed.unmatchedSegments.length,1);assert.equal(changed.unmatchedSegments[0].id,value.segments[0].id);assert.deepEqual(changed.unmatchedSegments[0].references,value.segments[0].references);
});
test('script exports tab-separated segment, voice, visual, owners and steps; teleprompter body stays untouched',()=>{
 const body='教程正文',composition=createProductionComposition(body);composition.segments[0].visual='展示结果';const filming={shots:[{id:randomUUID(),segmentId:composition.segments[0].id,quote:body,visual:'录屏',owner:'screen',done:false,steps:[{id:randomUUID(),where:'新任务',prompt:'发送这条提示词',expect:'看到结果',caution:'隐藏姓名'}]}]};
 const script=productionFilmingScript(body,composition,filming);assert.match(script,/段落\t口播\t画面/);assert.match(script,/教程正文/);assert.match(script,/发送这条提示词/);assert.equal(body.includes('提示词'),false);
});
function fixture(t,body='第一段\n\n第二段') {const root=fs.mkdtempSync(path.join(os.tmpdir(),'nova-segment-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const library=createLibrary(path.join(root,'library')),content=library.createContent({title:'分段',body});library.mutateProduction('ensureCreation',{contentId:content.id,expectedToken:library.readProduction().editToken});const read=()=>library.readProductionCreation(content.id),save=(body,creationPatch)=>{const current=read();return library.saveProductionDraft(content.id,{body,expectedBodyHash:current.content.bodyHash,expectedProductionToken:current.productionToken,creationPatch},current.content.editToken);};return {library,content,read,save};}
test('legacy read creates no composition; explicit save stores ranges and stale migration never drops associations',t=>{
 const f=fixture(t),before=f.read();assert.equal(before.creation.composition,undefined);const composition=createProductionComposition(before.content.body);f.save(before.content.body,{composition});assert.deepEqual(f.read().creation.composition,composition);
 f.save('前言\n\n'+before.content.body,{});assert.equal(f.read().creation.composition.segments[0].id,composition.segments[0].id);
 const current=f.read();assert.throws(()=>f.save('全文完全重写',{}),{code:'STALE_INPUT'});assert.equal(f.read().content.body,current.content.body);assert.deepEqual(f.read().creation.composition,current.creation.composition);
});
test('ordinary patches cannot invent adoption receipts or overwrite append-only history',t=>{
 const f=fixture(t),current=f.read();assert.throws(()=>f.save(current.content.body,{adoptions:[{taskId:randomUUID(),attemptId:randomUUID(),receiptHash:'a'.repeat(64),bodyHash:current.content.bodyHash,at:new Date().toISOString(),artifactIds:[randomUUID()]}]}),{code:'INVALID_INPUT'});assert.equal(f.read().creation.adoptions,undefined);
});
