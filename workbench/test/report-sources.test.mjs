import test from 'node:test';
import assert from 'node:assert/strict';
import {reportSources} from '../src/main/report-sources.mts';
test('report source catalog preserves public links, decodes entities and excludes executable or credential-bearing URLs',()=>{
 assert.deepEqual(reportSources('<a href="https://example.com/a?x=1&amp;y=2">source</a><a href="javascript:alert(1)">bad</a><a href="https://key:secret@example.com">bad</a>',null),['https://example.com/a?x=1&y=2']);
 assert.deepEqual(reportSources('<a href="https://example.com/">x</a>','https://example.com/'),['https://example.com/']);
});
