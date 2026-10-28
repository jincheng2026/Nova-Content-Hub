import test from 'node:test';
import assert from 'node:assert/strict';
import {detailFiles, topicReferences, resumeDocument} from '../src/renderer/jincheng-work-detail-data.ts';

import * as detailData from '../src/renderer/jincheng-work-detail-data.ts';
const topicReferenceGroups = (...args) => {
 assert.equal(typeof detailData.topicReferenceGroups, 'function', 'reference groups must be available');
 return detailData.topicReferenceGroups(...args);
};

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

// A flat link list loses the per-work identity and mislabels cross-topic and archive links.
test('groups one table work with its original URL and transcript while keeping other sources as materials', () => {
 const note=document('note','02_内容素材/未参考/抖音/抖音_示例_7689110172623874378/笔记信息.md');
 const transcript=document('transcript','02_内容素材/未参考/抖音/抖音_示例_7689110172623874378/转写/校正版逐字稿/001-视频.md');
 const other=document('other','04_选题库/口播/待做/T042.md');
 const card={document:document('card','04_选题库/口播/待做/T041.md'),text:`[T042](T042.md) [飞书](https://example.feishu.cn/docx/abc) [档案](../../../../内容数据统计/内容.md)
| 参考 | 链接 | 用途 |
| --- | --- | --- |
| 同一个示例视频 | [原视频](https://www.douyin.com/video/7689110172623874378)，[素材](../../../02_内容素材/未参考/抖音/抖音_示例_7689110172623874378/笔记信息.md)，[逐字稿](../../../02_内容素材/未参考/抖音/抖音_示例_7689110172623874378/转写/校正版逐字稿/001-视频.md) | 主参考 |
[普通路径](../../../07_如何做自媒体/会议.md)`};
 const refs=topicReferenceGroups([card],[note,transcript,other]);
 assert.equal(refs.videos.length,1);
 assert.equal(refs.videos[0].title,'同一个示例视频');
 assert.deepEqual(refs.videos[0].links.map(link=>link.document?.id ?? link.url),['https://www.douyin.com/video/7689110172623874378','note','transcript']);
 assert.deepEqual(refs.materials.map(link=>link.title),['T042','飞书','档案','普通路径']);
 assert.equal(refs.materials[0].document.id,'other');
 assert.equal(refs.materials[2].target,'../../../../内容数据统计/内容.md');
 assert.equal(refs.materials[2].document,undefined);
});

// The parser must consume balanced destinations instead of truncating at the first ')'.
test('retains balanced local paths, excludes them from vault lookup, and strips only bare URL prose punctuation', () => {
 const card={document:document('card','04_选题库/口播/待做/T041.md'),text:`[原视频](/Users/author/Downloads/下载%20(47).mp4)
[有括号](../../../07_如何做自媒体/会议(第二次).md)
[空格](<../../../07_如何做自媒体/会议 (第三次).md>)
[网址](https://example.com/a_(b)?x=1!)
https://example.com/a_(b)。 https://example.com/other， https://example.com/end).
[拒绝](javascript:bad)`};
 const indexed=document('inside','07_如何做自媒体/会议(第二次).md');
 const refs=topicReferences([card],[indexed,document('fake','Users/author/Downloads/下载 (47).mp4')]);
 assert.deepEqual(refs.map(ref=>ref.target),['/Users/author/Downloads/下载 (47).mp4','07_如何做自媒体/会议(第二次).md','07_如何做自媒体/会议 (第三次).md','https://example.com/a_(b)?x=1!','https://example.com/a_(b)','https://example.com/other','https://example.com/end']);
 assert.equal(refs[0].document,undefined);
 assert.equal(refs[1].document.id,'inside');
});

// Table adjacency is not enough to pair different works; only shared item identity may do that.
test('does not merge separate table rows or attach profile URLs and archives to media works', () => {
 const card={document:document('card','04_选题库/口播/待做/T005.md'),text:`| 标题 | 链接 | 本地素材 |
| --- | --- | --- |
| 第一条 | https://www.douyin.com/video/1111111111111111111 | [笔记](../../../02_内容素材/未参考/抖音/第一条_1111111111111111111/笔记信息.md) |
| 第二条 | https://www.douyin.com/video/2222222222222222222 | [笔记](../../../02_内容素材/未参考/抖音/第二条_2222222222222222222/笔记信息.md) |
| 主页 | [主页](https://www.douyin.com/user/person) | [档案](../../../06_已发布/视频档案.md) |`};
 const refs=topicReferenceGroups([card],[]);
 assert.equal(refs.videos.length,2);
 assert.deepEqual(refs.videos.map(ref=>ref.title),['第一条','第二条']);
 assert.deepEqual(refs.videos.map(ref=>ref.links.length),[2,2]);
 assert.deepEqual(refs.materials.map(link=>link.title),['主页','档案']);
});

// Repeated mentions of the same material must not inflate the reference count.
test('aggregates repeated material mentions and nested list references without inventing file existence', () => {
 const card={document:document('card','04_选题库/AI科普/待做/T005.md'),text:`## 参考视频与图文
- 《第一条作品》
  - 原视频：[抖音](https://v.douyin.com/one/)
  - 本地素材：[笔记](<../../../02_内容素材/未参考/抖音/第一条_1111111111111111111/笔记信息.md>)
- 《第二条作品》
  - 原视频：[抖音](https://v.douyin.com/two/)
  - 本地素材：[笔记](<../../../02_内容素材/未参考/抖音/第二条_2222222222222222222/笔记信息.md>)

重看第一条：[校正版逐字稿](../../../02_内容素材/未参考/抖音/第一条_1111111111111111111/转写/校正版逐字稿/001-视频.md)`};
 const refs=topicReferenceGroups([card],[]);
 assert.equal(refs.videos.length,2);
 assert.deepEqual(refs.videos.map(ref=>ref.title),['第一条作品','第二条作品']);
 assert.deepEqual(refs.videos.map(ref=>ref.links.length),[3,2]);
 assert.equal(refs.videos.flatMap(ref=>ref.links).some(link=>link.document),false);
 assert.equal(refs.materials.length,0);
});

// Source order includes local originals; pre-seeding material identities must not reorder them.
test('preserves reference order and work titles when table originals and list source labels are mixed', () => {
 const card={document:document('card','04_选题库/口播/待做/T041.md'),text:`| 参考 | 链接 |
| --- | --- |
| 第一个本地视频 | [原视频](/Users/author/下载%20(47).mp4)，[逐字稿](../../../07_如何做自媒体/视频逐字稿.md) |
| 第二个视频 | [原视频](https://www.douyin.com/video/1111111111111111111)，[笔记](../../../02_内容素材/未参考/抖音/第二条_1111111111111111111/笔记信息.md) |

- 来源文件：[笔记信息](../../../02_内容素材/未参考/抖音/第三条_2222222222222222222/笔记信息.md)`};
 const refs=topicReferenceGroups([card],[]);
 assert.deepEqual(refs.videos.map(video=>video.title),['第一个本地视频','第二个视频','第三条']);
});

// Indexed transcript discovery restores the old reference entry without filesystem guesses or path IPC.
test('offers every indexed corrected transcript under the exact work root and never another work', () => {
 const first=document('one','02_内容素材/未参考/抖音/第一条_1111111111111111111/转写/校正版逐字稿/001-视频.md');
 const second=document('two','02_内容素材/未参考/抖音/第一条_1111111111111111111/转写/校正版逐字稿/002-视频.md');
 const unrelated=document('other','02_内容素材/未参考/抖音/另一条_2222222222222222222/转写/校正版逐字稿/001-视频.md');
 const card={document:document('card','04_选题库/AI科普/待做/T005.md'),text:'[素材](../../../02_内容素材/未参考/抖音/第一条_1111111111111111111/笔记信息.md)'};
 const refs=topicReferenceGroups([card],[first,second,unrelated]);
 assert.deepEqual(refs.videos[0].links.flatMap(link=>link.document?[link.document.id]:[]),['one','two']);
 assert.equal(refs.videos[0].links[0].document,undefined);
 assert.equal(refs.videos.length,1);
});

test('removes full-width prose closers from bare URLs while preserving authored Markdown destinations', () => {
 const card={document:document('card','04_选题库/T041.md'),text:'（https://example.com/one）；见 https://example.com/two）。 [作者指定](https://example.com/three!)'};
 assert.deepEqual(topicReferences([card],[]).map(link=>link.target),['https://example.com/one','https://example.com/two','https://example.com/three!']);
});
