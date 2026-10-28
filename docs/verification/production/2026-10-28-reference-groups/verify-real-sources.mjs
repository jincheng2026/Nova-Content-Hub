import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {scan} from '../../../../plugin-src/src/lib/vault/core.mjs';
import {topicReferenceGroups} from '../../../../workbench/src/renderer/jincheng-work-detail-data.ts';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const roots = {A:'/Users/mac/Downloads/第二大脑交接包_2026-10-16/第二大脑', B:'/Users/mac/Downloads/锦成工作台-同事版/数据和程序/AIJinCheng/个人IP与内容/第二大脑'};
const expected = {T041:[4,7], T046:[3,4], T020:[4,31], T048:[2,7], T005:[2,0]};
const evidence={time:new Date().toISOString(),scope:'Read-only source scan and pure renderer data transform; no vault binding/open/projection/mutation',sources:[]};
for (const [name,root] of Object.entries(roots)) {
 const {documents} = scan(root,'reference-evidence-read-only');
 const source={name,root,indexedDocuments:documents.length,topics:[]};
 for (const [tNumber,counts] of Object.entries(expected)) {
  const cards=documents.filter(d=>d.section==='topics'&&d.tNumber===tNumber&&d.format==='markdown').map(document=>({document,text:fs.readFileSync(path.join(root,document.relativePath),'utf8')}));
  assert.equal(cards.length,1);
  const before=cards.map(card=>digest(Buffer.from(card.text)));
  const refs=topicReferenceGroups(cards,documents);
  assert.deepEqual([refs.videos.length,refs.materials.length],counts,`${name}/${tNumber} source counts`);
  const videoLinks=refs.videos.flatMap(video=>video.links);
  assert.equal(videoLinks.some(link=>/127\.0\.0\.1|feishu\.|\/user\//.test(link.url??'')),false);
  assert.equal(videoLinks.some(link=>link.target.startsWith('04_选题库/')||link.target.includes('内容数据统计')),false);
  for (const link of [...videoLinks,...refs.materials]) if (link.document) assert.equal(documents.some(document=>document.id===link.document.id&&document.relativePath===link.target),true);
  if(tNumber==='T041') {
   assert.equal(refs.videos[0].links[0].target,'/Users/hejincheng/Downloads/下载 (47).mp4');
   assert.equal(refs.videos[0].links[0].document,undefined);
   assert.equal(refs.materials.filter(link=>link.title==='视频档案').length,2);
   assert.equal(refs.materials.find(link=>link.title==='T042').document.tNumber,'T042');
  }
  const after=cards.map(card=>digest(fs.readFileSync(path.join(root,card.document.relativePath))));
  assert.deepEqual(after,before,'source card bytes unchanged');
  source.topics.push({tNumber,cards:cards.map((card,index)=>({relativePath:card.document.relativePath,sha256Before:before[index],sha256After:after[index]})),videoCount:refs.videos.length,materialCount:refs.materials.length,videos:refs.videos.map(video=>({key:video.key,title:video.title,links:video.links.map(link=>({title:link.title,target:link.target,documentId:link.document?.id??null}))})),materials:refs.materials.map(link=>({title:link.title,target:link.target,documentId:link.document?.id??null}))});
 }
 evidence.sources.push(source);
}
fs.writeFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)),'real-sources.json'),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence.sources.map(source=>({name:source.name,indexedDocuments:source.indexedDocuments,topics:source.topics.map(topic=>({tNumber:topic.tNumber,videoCount:topic.videoCount,materialCount:topic.materialCount}))})),null,2));
