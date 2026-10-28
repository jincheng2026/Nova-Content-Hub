import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {createVault} from '../../plugin-src/src/lib/vault/index.mjs';
import {linkSource} from '../../plugin-src/src/lib/vault/source-map.mjs';
const require=createRequire(new URL('../package.json',import.meta.url));
const sharp=require('sharp');
const hash=value=>createHash('sha256').update(value).digest('hex');
const mod=await import('../src/main/document-reading.mts').catch(()=>({}));
function fixture(t){
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'document-reading-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const opened=createVault(root),runtime=opened.runtimeRoot??path.join(root,'.workbench/runtime');
 const descriptor=JSON.parse(fs.readFileSync(path.join(runtime,'内容库.json'),'utf8')),stat=fs.statSync(runtime,{bigint:true});
 const binding={root:runtime,libraryId:descriptor.libraryId,rootIdentity:{dev:String(stat.dev),ino:String(stat.ino)}};
 const source='02_内容素材';const write=(p,text)=>{fs.mkdirSync(path.dirname(path.join(root,source,p)),{recursive:true});fs.writeFileSync(path.join(root,source,p),text);};
 const id='doc-'+hash('笔记').slice(0,32);let context={vaultRoot:root,sourceId:'materials',relativePath:'笔记/原文.md'};
 const api=mod.createDocumentReadingService?.({resolveDocument(_binding,documentId){assert.equal(documentId,id);return context;}});
 const view=()=>api.readDocumentView(binding,{documentId:id,expectedHash:hash(fs.readFileSync(path.join(root,source,'笔记/原文.md')))});
 return {root,runtime,binding,source,write,id,api,view,setContext(value){context=value;}};
}
test('real bounded reader preserves source bytes and resolves encoded Chinese images and wiki notes',async t=>{
 assert.equal(typeof mod.createDocumentReadingService,'function');const f=fixture(t);
 const png=await sharp({create:{width:2,height:3,channels:3,background:'#0088ff'}}).png().toBuffer();
 f.write('图片/中 文.png',png);f.write('笔记/目标.md','# 目标\n\n## 精确标题\n正文');
 const text='![图](../图片/%E4%B8%AD%20%E6%96%87.png)\n\n![[目标#精确标题]]\n\n[[目标|别名]]\n\n[官网](https://example.com/a?x=1)';f.write('笔记/原文.md',text);
 const view=f.view();assert.equal(view.text,text);assert.equal(view.references.length,4);assert.ok(view.references.every(r=>r.state==='ready'));
 const image=await f.api.readDocumentReference(f.binding,{documentId:f.id,expectedHash:view.hash,refId:view.references[0].refId,targetIdentity:view.references[0].targetIdentity});
 assert.equal(image.kind,'image');assert.deepEqual(Buffer.from(image.data),png);assert.equal(image.width,2);
 const embedded=await f.api.readDocumentReference(f.binding,{documentId:f.id,expectedHash:view.hash,refId:view.references[1].refId,targetIdentity:view.references[1].targetIdentity});
 assert.equal(embedded.kind,'document');assert.equal(embedded.view.text,'## 精确标题\n正文');assert.equal(embedded.view.references.length,0);
 assert.equal(f.api.resolveExternalReference(f.binding,{documentId:f.id,expectedHash:view.hash,refId:view.references[3].refId,targetIdentity:view.references[3].targetIdentity}),'https://example.com/a?x=1');
});
test('reader keeps missing/ambiguous/unsupported references explicit and excludes code syntax',t=>{
 assert.equal(typeof mod.createDocumentReadingService,'function');const f=fixture(t);f.write('一/同名.md','A');f.write('二/同名.md','B');
 f.write('笔记/原文.md','[[同名]]\n![[不存在.png]]\n![[脚本.svg]]\n![远图](https://example.com/tracker.png)\n`[[不存在]]`\n```md\n![[不存在.png]]\n```');f.write('笔记/脚本.svg','<svg onload="alert(1)"/>');
 const view=f.view();assert.deepEqual(view.references.map(r=>r.state),['ambiguous','missing','unsupported','unsupported']);assert.deepEqual(view.references[0].candidates,['一/同名.md','二/同名.md']);
});
test('reader rejects escaped paths, credentials, framework files, symlinks and cross-source fallback',t=>{
 assert.equal(typeof mod.createDocumentReadingService,'function');const f=fixture(t);f.write('secret.md','safe');f.write('笔记/.secret.md','hidden');f.write('笔记/node_modules/secret.md','framework');fs.symlinkSync(path.join(f.root,f.source,'secret.md'),path.join(f.root,f.source,'笔记/alias.md'));
 f.write('笔记/原文.md',['../../../secret.md','C:\\secret.md','//host/secret.md','file:///tmp/secret.md','%252e%252e/secret.md','%2e%2e/%2e%2e/%2e%2e/secret.md','.secret.md','node_modules/secret.md','alias.md'].map(p=>`![[${p}]]`).join('\n')+'\n[危险](https://u:p@example.com/)');
 const view=f.view();assert.ok(view.references.every(r=>r.state!=='ready'));assert.throws(()=>f.api.readDocumentView(f.binding,{documentId:f.id,expectedHash:view.hash,path:'/tmp/arbitrary'}),/无效/);
});
test('reference identity expires for changed source, target, binding and replaced source root',async t=>{
 assert.equal(typeof mod.createDocumentReadingService,'function');const f=fixture(t);f.write('笔记/原文.md','[[目标]]');f.write('笔记/目标.md','目标');const view=f.view(),ref=view.references[0],input={documentId:f.id,expectedHash:view.hash,refId:ref.refId,targetIdentity:ref.targetIdentity};
 f.write('笔记/目标.md','目标已变');await assert.rejects(()=>f.api.readDocumentReference(f.binding,input),/变化|失效/);
 f.write('笔记/原文.md','原件已变');await assert.rejects(()=>f.api.readDocumentReference(f.binding,input),/变化|失效/);
 await assert.rejects(()=>f.api.readDocumentReference({...f.binding,libraryId:'other'},input),/变化|标识/);
});
test('linked source is confined to explicit root and refuses root replacement',async t=>{
 assert.equal(typeof mod.createDocumentReadingService,'function');const f=fixture(t),external=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'linked-reading-')));t.after(()=>fs.rmSync(external,{recursive:true,force:true}));
 fs.writeFileSync(path.join(external,'原文.md'),'[[内部独有]]\n[[目标]]');fs.writeFileSync(path.join(external,'目标.md'),'关联目标');f.write('内部独有.md','内部');
 const s=linkSource(f.root,{role:'materials',selectedRoot:external,authority:'official',writable:false});f.setContext({vaultRoot:f.root,sourceId:s.id,relativePath:'原文.md'});
 const view=f.api.readDocumentView(f.binding,{documentId:f.id,expectedHash:hash(fs.readFileSync(path.join(external,'原文.md')))});assert.equal(view.references[0].state,'missing');assert.equal(view.references[1].state,'ready');
 fs.renameSync(external,external+'-old');t.after(()=>fs.rmSync(external+'-old',{recursive:true,force:true}));fs.mkdirSync(external);fs.writeFileSync(path.join(external,'原文.md'),'[[目标]]');
 await assert.rejects(()=>f.api.readDocumentReference(f.binding,{documentId:f.id,expectedHash:view.hash,refId:view.references[1].refId,targetIdentity:view.references[1].targetIdentity}),/身份|变化/);
});
test('reader refuses invalid raster bytes and pending state without recovering or projecting',async t=>{
 assert.equal(typeof mod.createDocumentReadingService,'function');const f=fixture(t);f.write('笔记/原文.md','![[fake.png]]');f.write('笔记/fake.png','<html><script>bad</script></html>');const view=f.view(),ref=view.references[0];
 await assert.rejects(()=>f.api.readDocumentReference(f.binding,{documentId:f.id,expectedHash:view.hash,refId:ref.refId,targetIdentity:ref.targetIdentity}),/PNG|图片|raster/);
 const pending=path.join(f.root,'.workbench/pending-mutations');fs.mkdirSync(pending,{recursive:true});fs.writeFileSync(path.join(pending,'pending.json'),'{}');
 assert.throws(()=>f.view(),/待核验|待恢复/);assert.equal(fs.readFileSync(path.join(pending,'pending.json'),'utf8'),'{}');
});
test('wiki bare names stay ambiguous even when one candidate shares the current folder',t=>{
 const f=fixture(t);f.write('笔记/目标.md','附近');f.write('其他/目标.md','远处');f.write('笔记/原文.md','[[目标]]\n[[./目标.md]]');const view=f.view();assert.equal(view.references[0].state,'ambiguous');assert.equal(view.references[1].state,'ready');
});
test('fragment selection is exact, duplicate headings are explicit, cycles and depth are bounded with manual navigation',async t=>{
 const f=fixture(t);f.write('笔记/原文.md','![[./目标.md#选中]]\n![[./重复.md#同名]]\n![[./目标.md#^block-id]]');f.write('笔记/目标.md','# 目标\n## 选中\n![[./原文.md]]\n## 别处\n正文 ^block-id');f.write('笔记/重复.md','## 同名\nA\n## 同名\nB');let view=f.view();assert.equal(view.references[1].state,'stale');assert.match(view.references[1].issue,/重复/);
 const read=(v,n,intent='embed')=>{const r=v.references[n];return f.api.readDocumentReference(f.binding,{documentId:v.documentId,expectedHash:v.hash,refId:r.refId,targetIdentity:r.targetIdentity,intent});};
 const target=await read(view,0);assert.equal(target.kind,'document');assert.equal(target.view.text,'## 选中\n![[./原文.md]]');const cycle=await read(target.view,0);assert.equal(cycle.kind,'limited');assert.match(cycle.message,/循环/);assert.equal((await read(target.view,0,'navigate')).kind,'document');
 const block=await read(view,2);assert.equal(block.view.text,'正文 ^block-id');
 for(let n=0;n<5;n++)f.write(`笔记/层${n}.md`,n===4?'尾页':`![[./层${n+1}.md]]`);f.write('笔记/原文.md','![[./层0.md]]');view=f.view();for(let n=0;n<3;n++){const next=await read(view,0);assert.equal(next.kind,'document');view=next.view;}assert.equal((await read(view,0)).kind,'limited');
});
test('reader leaves over-limit references as authored text and refuses huge text/hard links and runtime pending',t=>{
 const f=fixture(t);f.write('笔记/原文.md',Array.from({length:101},(_,n)=>`[[./目标.md|${n}]]`).join('\n'));f.write('笔记/目标.md','目标');const view=f.view();assert.equal(view.references.length,100);assert.equal(view.truncated,true);assert.match(view.text,/\|100\]\]/);
 f.write('笔记/原文.md','a'.repeat(8*1024*1024+1));assert.throws(()=>f.view(),/8 MiB/);
 f.write('笔记/原文.md','原文');fs.linkSync(path.join(f.root,f.source,'笔记/原文.md'),path.join(f.root,f.source,'副本.md'));assert.throws(()=>f.view(),/硬链接/);fs.unlinkSync(path.join(f.root,f.source,'副本.md'));
 fs.mkdirSync(path.join(f.runtime,'系统（别动）/事务/待恢复/11111111-1111-4111-8111-111111111111'));assert.throws(()=>f.view(),/待核验|待恢复/);
});
test('legacy pending receipts are refused without creating a migration index',t=>{
 const f=fixture(t);f.write('笔记/原文.md','原文');const marker=path.join(f.root,'.workbench/pending-mutations-index.json');fs.rmSync(marker,{force:true});const dir=path.join(f.root,'.workbench/mutations');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'legacy-pending.json'),JSON.stringify({status:'pending'}));assert.throws(()=>f.view(),/待核验|待恢复/);assert.equal(fs.existsSync(marker),false);
});
test('actual raster decoder accepts supported content types without relying on filename extension',async t=>{
 const f=fixture(t);const formats=['jpeg','webp','gif'];for(const format of formats){const data=await sharp({create:{width:3,height:2,channels:3,background:'#456789'}})[format]().toBuffer();f.write(`笔记/${format}.png`,data);}
 f.write('笔记/原文.md',formats.map(format=>`![[./${format}.png]]`).join('\n'));const view=f.view();for(const [n,format] of formats.entries()){const ref=view.references[n],value=await f.api.readDocumentReference(f.binding,{documentId:f.id,expectedHash:view.hash,refId:ref.refId,targetIdentity:ref.targetIdentity});assert.equal(value.kind,'image');assert.equal(value.mime,`image/${format}`);assert.equal(value.width,3);}
});
test('bounded reference queue rejects excess work and never grants unknown or path-bearing requests',async t=>{
 const f=fixture(t);f.write('笔记/原文.md','[[./目标.md]]');f.write('笔记/目标.md','目标');const view=f.view(),ref=view.references[0],input={documentId:f.id,expectedHash:view.hash,refId:ref.refId,targetIdentity:ref.targetIdentity};
 const results=await Promise.allSettled(Array.from({length:103},()=>f.api.readDocumentReference(f.binding,input)));assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.code==='BUSY').length,1);assert.equal(results.filter(r=>r.status==='fulfilled').length,102);
 await assert.rejects(()=>f.api.readDocumentReference(f.binding,{...input,url:'file:///tmp/any'}),/无效/);await assert.rejects(()=>f.api.readDocumentReference(f.binding,{...input,refId:'0'.repeat(64)}),/失效/);
});
test('selected heading preserves fenced-code headings as literal body content',async t=>{
 const f=fixture(t);f.write('笔记/原文.md','![[./目标.md#章节]]');f.write('笔记/目标.md','## 章节\n```md\n# 代码中的标题\n```\n真实正文\n## 后续\n之后');const view=f.view(),ref=view.references[0],result=await f.api.readDocumentReference(f.binding,{documentId:f.id,expectedHash:view.hash,refId:ref.refId,targetIdentity:ref.targetIdentity});assert.equal(result.view.text,'## 章节\n```md\n# 代码中的标题\n```\n真实正文');
});
