import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {createVault} from '../../plugin-src/src/lib/vault/index.mjs';
import {openLibrary} from '../../plugin-src/src/lib/file-library/index.mjs';
import {scan,json} from '../../plugin-src/src/lib/vault/core.mjs';
import {DesktopController} from '../src/main/controller.mts';
import {BindingStore,emptyBinding} from '../src/main/bindings.mts';
import {execute} from '../src/main/worker.mts';
process.env.NODE_ENV='test';
async function fixture(t,kind,host){
 const parent=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'colleague-cover-'));t.after(()=>fs.rmSync(parent,{recursive:true,force:true}));
 const root=path.join(parent,'同事的第二大脑');fs.mkdirSync(root);const bound=createVault(root);
 const relative=kind==='topic'?'04_选题库/T087_同事的选题.md':kind==='title-only'?'05_内容草稿/T087_已保存的封面标题/正文.md':'05_内容草稿/T087_同事的稿件/创作页.html';
 const text=kind==='title-only'?'':kind==='topic'?'# 同事的选题\n选题参考内容':'<script id="jc-doc" type="application/json">'+JSON.stringify({schema:1,page_id:'portablepage',content_id:'T087',items:[{id:'seg-two',locked:{order:2},fields:{mine:'第二段作者稿'}},{id:'seg-one',locked:{order:1},fields:{mine:'真实稿件正文\n  作者缩进'}}]})+'</script>';
 fs.mkdirSync(path.dirname(path.join(root,relative)),{recursive:true});fs.writeFileSync(path.join(root,relative),text);
 const document=scan(root,json(root,'.workbench/vault.json').vaultId).documents.find(d=>d.relativePath===relative);
 const library=openLibrary(bound.root);library.listContents();
 const image=path.join(parent,'style.png');fs.writeFileSync(image,await sharp({create:{width:8,height:6,channels:3,background:'#123456'}}).png().toBuffer());
 const asset=library.importAsset(image,{purpose:'template-reference'}),template=library.createTemplate({name:'通用样张',definition:{accepted:false},resources:{sample:{assetHash:asset.assetHash,bytes:asset.bytes,detectedType:asset.detectedType,role:'style'}}});
 const input={template:{id:template.id,version:1},styleAssetHashes:[asset.assetHash],photo:null,materialIds:[],prompt:'按保存的标题做封面',pixels:{width:8,height:6},ratio:'4:3',count:1,outputFormat:'png',scope:'cover-only'};
 const binding={root:library.info.root,libraryId:library.info.libraryId,rootIdentity:library.info.rootIdentity};
 const store=new BindingStore(path.join(parent,'machine.json'));await store.save({...emptyBinding(),current:binding,assistant:host});
 const launches=[],worker={call:(op,args)=>execute(op,args,'disabled')};
 const make=()=>new DesktopController({store,worker,documents:parent,authMode:'disabled',dialogs:{backup:async()=>null,destination:async()=>null,photo:async()=>null,export:async()=>null,library:async()=>root},launch:async(_,ref)=>launches.push(ref),readAssistantSetup:async host=>({host,ready:true,skill:'nova-content-cover-execution',reason:'available'})});
 const controller=make();await controller.initialize();return{controller,make,library,input,document,launches,root,relative,text};
}
for(const kind of ['topic','manuscript','title-only'])for(const host of ['codex','workbuddy'])test(`${host}: a colleague's ${kind} cover survives reopen, retry and switching assistant`,async t=>{
 const f=await fixture(t,kind,host),contentId=f.document.contentId;
 const first=await f.controller.generateCover({contentId,editToken:f.library.readContent(contentId).editToken,input:f.input});
 assert.equal(first.launchRequested,true);const original=first.jobs[0];
 const ctx=f.library.readCoverContext(contentId,original.id,original.activeAttemptId);
 assert.equal(ctx.request.contextSource.kind,kind);
 const reopened=f.make();await reopened.initialize();
 const reference={contentId,requestId:original.id,attemptId:original.activeAttemptId};
 const sessionId=randomUUID();let revision=0;
 for(const state of ['waiting-user','running','waiting-permission','running']){
  f.library.reportCoverProgress(contentId,original.id,original.activeAttemptId,{host,requestHash:original.requestHash,phase:'reading',state,message:'临时夹具进度',sessionId,expectedRevision:revision++,mutationId:randomUUID()});
  const progress=await reopened.readCoverProgress({contentId});assert.equal(progress.jobs[0].attempts[0].progress.state,state);
  if(state!=='running'){await reopened.continueBoundCover(reference);assert.equal(f.launches.at(-1).sessionId,sessionId);assert.equal(f.launches.at(-1).host,host);}
 }
 const retry=await reopened.retryCover(reference);assert.equal(retry.jobs[0].id,original.id);assert.equal(retry.jobs[0].requestHash,original.requestHash);
 const other=host==='codex'?'workbuddy':'codex';await reopened.setAssistant({host:other});
 await reopened.continueCover({...reference,attemptId:retry.jobs[0].activeAttemptId});
 assert.equal(f.launches.at(-1).host,other);
 assert.equal(fs.readFileSync(path.join(f.root,f.relative),'utf8'),f.text,'the author source must remain untouched');
});
