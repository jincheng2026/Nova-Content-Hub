import test from 'node:test';
import assert from 'node:assert/strict';
import {reportImportMetadata} from '../src/shared/report-import.ts';
const pages=[{title:'B.html',originalName:'B.html',assetHash:'b'.repeat(64)},{title:'A.html',originalName:'A.html',assetHash:'a'.repeat(64)}];
test('legacy report metadata preserves date, purpose and reading order',()=>{
 const mapped=reportImportMetadata(pages,{date:'2026-08-14',type:'综合调研',pages:[{file:'reports/A.html',title:'先看作战手册'},{file:'B.html',title:'证据底仓'}]});
 assert.equal(mapped.collectedAt,'2026-08-14T00:00:00.000Z');assert.equal(mapped.type,'综合调研');assert.deepEqual(mapped.pages.map(p=>p.title),['先看作战手册','证据底仓']);
});
test('unknown collection time stays unknown and malformed or ambiguous metadata is rejected',()=>{
 assert.equal(reportImportMetadata(pages,{}).collectedAt,null);
 assert.throws(()=>reportImportMetadata(pages,{date:'2026-02-31'}));
 assert.throws(()=>reportImportMetadata(pages,{pages:[{file:'missing.html',title:'失效页'}]}));
 assert.throws(()=>reportImportMetadata([...pages,pages[0]],{pages:[{file:'B.html',title:'歧义页'}]}));
});
