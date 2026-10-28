import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createVault,readVaultSnapshot,readVaultTaskContext,readVaultDocument} from '../index.mjs';import {htmlBody,contentSources} from '../core.mjs';
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'current-source-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const binding=createVault(root),dir='05_内容草稿/T020_杠杆';fs.mkdirSync(path.join(root,dir));return {root,runtime:binding.root,dir};}
const html=(id='p020')=>'<html><script id="jc-doc" type="application/json">'+JSON.stringify({schema:1,page_id:id,items:[{id:'b',kind:'segment',locked:{order:2},fields:{mine:'第二段'}},{id:'a',kind:'segment',locked:{order:1},fields:{mine:'第一段'}},{id:'info',kind:'info',locked:{title:'杠杆'},fields:{recorded:'2026-10-01',approved:'yes'}}]})+'</script></html>';
test('HTML projection is explicitly ordered summary and keeps original identity',t=>{const f=fixture(t);fs.writeFileSync(path.join(f.root,f.dir,'创作页.html'),html());assert.equal(htmlBody(html()),'第一段\n\n第二段');const s=readVaultSnapshot(f.runtime),d=s.documents.find(d=>d.format==='html'),read=readVaultDocument(f.runtime,d.id),context=readVaultTaskContext(f.runtime,d.contentId);assert.equal(read.summaryOnly,true);assert.equal(read.document.editAdapter,'creation-document');assert.equal(context.content.source.documentId,d.id);assert.equal(context.content.sourceResolution,'resolved');assert.equal(context.content.sourceCandidates[0].relativePath,d.relativePath);assert.equal(context.content.recorded,true);assert.equal(context.content.published,false);});
test('T020 overview current draft beats explicitly historical creation page without mtime',t=>{const f=fixture(t);fs.writeFileSync(path.join(f.root,f.dir,'创作页.html'),html());fs.writeFileSync(path.join(f.root,f.dir,'逐字稿工作稿.md'),'10月重新口述');fs.writeFileSync(path.join(f.root,'05_内容草稿/00_草稿总览.md'),'| T020 | 10-08 重新口述，最新工作稿 | [逐字稿工作稿](T020_杠杆/逐字稿工作稿.md) · [创作页](http://127.0.0.1:8977/p/p020)（9-28 那版） |');const s=contentSources(readVaultSnapshot(f.runtime))[0];assert.equal(s.document.format,'markdown');assert.equal(s.sourceCandidates.length,2);assert.equal(s.sourceResolution,'resolved');});
test('conflicting explicit card and overview retain candidates and block writes',t=>{const f=fixture(t);for(const name of ['工作稿','另稿'])fs.writeFileSync(path.join(f.root,f.dir,name+'.md'),name);fs.writeFileSync(path.join(f.root,'04_选题库/T020_杠杆.md'),'# 杠杆\n\n当前稿：[工作稿](../05_内容草稿/T020_杠杆/另稿.md)');fs.writeFileSync(path.join(f.root,'05_内容草稿/00_草稿总览.md'),'| T020 | 当前 | [工作稿](T020_杠杆/工作稿.md) |');const snapshot=readVaultSnapshot(f.runtime),s=contentSources(snapshot)[0];assert.equal(s.sourceResolution,'conflict');assert.equal(s.document.writable,false);assert.ok(s.document.sourceConflict);assert.equal(s.sourceCandidates.length,2);const context=readVaultTaskContext(f.runtime,s.contentId);assert.equal(context.content.sourceCandidates.length,2);assert.equal(context.content.sourceConflict,s.document.sourceConflict);});
test('same T is scoped to selected vault and ambiguous drafts never use latest mtime',t=>{const f=fixture(t),other=fixture(t);for(const x of [f,other])for(const name of ['工作稿甲','工作稿乙'])fs.writeFileSync(path.join(x.root,x.dir,name+'.md'),x.root+name);const a=contentSources(readVaultSnapshot(f.runtime))[0],b=contentSources(readVaultSnapshot(other.runtime))[0];assert.notEqual(a.contentId,b.contentId);assert.equal(a.sourceResolution,'conflict');assert.equal(a.sourceCandidates.length,2);});

test('final recording script and creation HTML are separate roles and resume original editor automatically',t=>{
 for(const tNumber of ['T029','T026','T044']){
  const f=fixture(t),dir='05_内容草稿/'+tNumber+'_原篇';fs.mkdirSync(path.join(f.root,dir));
  fs.writeFileSync(path.join(f.root,dir,'创作页.html'),html(tNumber));fs.writeFileSync(path.join(f.root,dir,'定稿.md'),'实际录制的最终稿');fs.writeFileSync(path.join(f.root,dir,'工作稿.md'),'早期工作稿');
  fs.writeFileSync(path.join(f.root,'05_内容草稿/00_草稿总览.md'),'| '+tNumber+' | 录完，还没发 | [录制定稿]('+tNumber+'_原篇/定稿.md) · [创作页](http://127.0.0.1:8977/p/'+tNumber+') |');
  const source=contentSources(readVaultSnapshot(f.runtime)).find(s=>s.tNumber===tNumber);
  assert.equal(source.sourceResolution,'resolved');assert.equal(source.document.format,'html');assert.equal(source.document.sourceConflict,undefined);
  assert.ok(source.sourceCandidates.some(c=>c.role==='final-script'&&c.relativePath.endsWith('/定稿.md')));
 }
});
test('T020 genuinely conflicting card authority and later overview still requires one explicit choice',t=>{
 const f=fixture(t);fs.writeFileSync(path.join(f.root,f.dir,'创作页.html'),html());fs.writeFileSync(path.join(f.root,f.dir,'逐字稿工作稿.md'),'10月重新口述');fs.writeFileSync(path.join(f.root,'04_选题库/T020_杠杆.md'),'# 杠杆\n写稿以创作页为准');fs.writeFileSync(path.join(f.root,'05_内容草稿/00_草稿总览.md'),'| T020 | 10-08 重新口述，最新工作稿 | [逐字稿工作稿](T020_杠杆/逐字稿工作稿.md) · [创作页](http://127.0.0.1:8977/p/p020)（9-28 那版） |');
 const source=contentSources(readVaultSnapshot(f.runtime))[0];assert.equal(source.sourceResolution,'conflict');assert.ok(source.document.sourceConflict);
});

test('reference-material transcripts are supporting sources and never displace the author draft or topic',t=>{
 for(const tNumber of ['T019','T021']){
  const f=fixture(t),dir='05_内容草稿/'+tNumber+'_原内容',topic='04_选题库/'+tNumber+'_原内容.md';
  fs.mkdirSync(path.join(f.root,dir),{recursive:true});fs.writeFileSync(path.join(f.root,topic),'# 作者自己的选题');
  for(const relative of ['参考素材/逐字稿/对标甲.md','参考素材/教程对标/对标乙_逐字稿.md','参考素材_补充/工作稿.md','参考/工作稿.md','素材/逐字稿.txt']){
   const file=path.join(f.root,dir,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'别人作品的参考转写，不是作者当前稿');
  }
  const author=dir+'/教程/逐字稿_定稿.md';
  if(tNumber==='T019'){fs.mkdirSync(path.dirname(path.join(f.root,author)),{recursive:true});fs.writeFileSync(path.join(f.root,author),'作者录制的正文');}
  const source=contentSources(readVaultSnapshot(f.runtime)).find(item=>item.tNumber===tNumber);
  assert.equal(source.sourceResolution,'resolved');assert.equal(source.document.relativePath,tNumber==='T019'?author:topic);
  assert.equal(source.sourceCandidates.length,1);assert(!source.sourceCandidates.some(candidate=>/参考素材|\/参考\/|\/素材\//.test(candidate.relativePath)));
 }
});

test('script names do not turn Python, JSON or logs into manuscripts while plain text and original HTML remain eligible',t=>{
 const f=fixture(t);fs.writeFileSync(path.join(f.root,f.dir,'工作稿.txt'),'作者自己的文字稿');
 for(const name of ['出图_定稿.py','定稿_结果.json','正文_结果.log','创作页_输出.json'])fs.writeFileSync(path.join(f.root,f.dir,name),name.endsWith('.json')?'{}':'工具输出');
 const source=contentSources(readVaultSnapshot(f.runtime))[0];assert.equal(source.sourceResolution,'resolved');assert.equal(source.document.relativePath,f.dir+'/工作稿.txt');assert.equal(source.sourceCandidates.length,1);
 fs.unlinkSync(path.join(f.root,f.dir,'工作稿.txt'));fs.writeFileSync(path.join(f.root,f.dir,'创作页.html'),'<html><body><article>保留的原HTML正文</article></body></html>');
 const original=contentSources(readVaultSnapshot(f.runtime))[0];assert.equal(original.sourceResolution,'resolved');assert.equal(original.document.format,'html');assert.equal(original.document.relativePath,f.dir+'/创作页.html');
});

test('production prompt text named final draft is not an automatically discovered author manuscript',t=>{
 const f=fixture(t);fs.writeFileSync(path.join(f.root,f.dir,'工作稿.md'),'作者口播稿');
 const prompt=path.join(f.root,f.dir,'短片制作/提示词/定稿_镜头1首帧.txt');fs.mkdirSync(path.dirname(prompt),{recursive:true});fs.writeFileSync(prompt,'图像生成提示词');
 const source=contentSources(readVaultSnapshot(f.runtime))[0];assert.equal(source.sourceResolution,'resolved');assert.equal(source.document.relativePath,f.dir+'/工作稿.md');assert.equal(source.sourceCandidates.length,1);
});

test('T048 multiple explicitly linked author revisions remain a conflict regardless of timestamps',t=>{
 const f=fixture(t),dir='05_内容草稿/T048_原内容';fs.mkdirSync(path.join(f.root,dir));
 for(const [name,date]of [['逐字稿_第二版.md','2001-01-01'],['逐字稿_第三版.md','2026-10-28']]){const file=path.join(f.root,dir,name);fs.writeFileSync(file,name);fs.utimesSync(file,new Date(date),new Date(date));}
 fs.writeFileSync(path.join(f.root,'05_内容草稿/00_草稿总览.md'),'| T048 | 当前稿待作者确认 | [工作稿第二版](T048_原内容/逐字稿_第二版.md) · [工作稿第三版](T048_原内容/逐字稿_第三版.md) |');
 const source=contentSources(readVaultSnapshot(f.runtime)).find(item=>item.tNumber==='T048');assert.equal(source.sourceResolution,'conflict');assert.equal(source.document.writable,false);assert.equal(source.sourceCandidates.length,2);
});
