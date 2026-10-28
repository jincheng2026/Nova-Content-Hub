import test from 'node:test';
import assert from 'node:assert/strict';
import {detailFiles, topicReferences, resumeDocument} from '../src/renderer/jincheng-work-detail-data.ts';

const document = (id, relativePath, format = 'markdown') => ({id, relativePath, format, title:id, section:relativePath.startsWith('04_')?'topics':'drafts', hash:id, writable:format==='markdown', contentId:'content', tNumber:'T020', bytes:100});

test('lists every HTML once, separates original topic cards, and retains unmatched file identities', () => {
 const docs=[document('topic','04_选题库/T020.md'), document('page','05_内容草稿/T020/创作页.html','html'), document('draft','05_内容草稿/T020/工作稿.md')];
 const work={relatedDocuments:docs.map(d=>({documentId:d.id,relativePath:d.relativePath,hash:d.hash})).concat({documentId:'lost',relativePath:'05_内容草稿/T020/历史.md',hash:'old'}),creationDocuments:[{documentId:'page',relativePath:docs[1].relativePath,hash:'page'}],sourceCandidates:[]};
 const value=detailFiles(work,docs);
 assert.deepEqual(value.pages.map(d=>d.documentId),['page']);
 assert.equal(value.pages[0].editable,true);
 assert.deepEqual(value.topicCards.map(d=>d.documentId),['topic']);
 assert.deepEqual(value.others.map(d=>d.documentId),['draft','lost']);
 assert.equal(value.others[1].document,undefined);
});

test('resume never guesses a latest page when the author has not resolved the current source', () => {
 const work={sourceResolution:'conflict',sourceDocumentId:'first',creationDocuments:[{documentId:'first'},{documentId:'second'}]};
 assert.equal(resumeDocument(work),null);
 assert.equal(resumeDocument({...work,sourceResolution:'missing'}),null);
 assert.equal(resumeDocument({...work,sourceResolution:'resolved'}),'first');
});

test('reference parsing resolves original relative links, keeps unindexed targets, and deduplicates original URLs', () => {
 const transcript=document('reference','03_素材库/视频/逐字稿.md');
 const cards=[{document:document('card','04_选题库/口播/T020.md'),text:'[逐字稿](../../03_素材库/视频/逐字稿.md)\n[素材目录](../../03_素材库/视频/)\n[原片](https://example.com/video/1)\nhttps://example.com/video/1\n[不要打开](javascript:bad)'}];
 const refs=topicReferences(cards,[transcript]);
 assert.equal(refs.length,3);
 assert.equal(refs[0].document.id,'reference');
 assert.equal(refs[1].target,'03_素材库/视频/');
 assert.equal(refs[1].document,undefined);
 assert.equal(refs[2].url,'https://example.com/video/1');
});
