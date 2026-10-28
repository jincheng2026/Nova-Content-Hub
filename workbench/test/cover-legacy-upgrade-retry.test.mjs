import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {DesktopController} from '../src/main/controller.mts';
import {BindingStore,emptyBinding} from '../src/main/bindings.mts';
import {execute} from '../src/main/worker.mts';
import {createLibrary} from '../../plugin-src/src/lib/file-library/index.mjs';
process.env.NODE_ENV='test';

// The break: re-inspecting a pre-contextSource request after the Vault inspector
// upgrade changes inputHash. Retry must continue the real immutable old request,
// while its original title/body guard still rejects author edits.
async function fixture(t,schema,host){
 const parent=await fs.mkdtemp(path.join(os.tmpdir(),'legacy-cover-upgrade-'));
 t.after(()=>fs.rm(parent,{recursive:true,force:true}));
 const library=createLibrary(path.join(parent,'library'));
 const image=path.join(parent,'reference.png');
 await fs.writeFile(image,await sharp({create:{width:8,height:6,channels:3,background:'#123456'}}).png().toBuffer());
 const asset=library.importAsset(image,{purpose:'template-reference'});
 const template=library.createTemplate({name:'Legacy style',definition:{accepted:false},resources:{sample:{assetHash:asset.assetHash,bytes:asset.bytes,detectedType:asset.detectedType,role:'style'}}});
 const content=library.createContent({title:'Saved author title',body:'# Saved Markdown\nAuthor body'});
 const input={template:{id:template.id,version:1},styleAssetHashes:[asset.assetHash],photo:null,materialIds:[],prompt:'Original instruction',pixels:{width:8,height:6},...(schema===2?{sizePolicy:'ratio-minimum'}:{}),ratio:'4:3',count:1,outputFormat:'png',scope:'cover-only'};
 const binding={root:library.info.root,libraryId:library.info.libraryId,rootIdentity:library.info.rootIdentity};
 const store=new BindingStore(path.join(parent,'machine.json'));await store.save({...emptyBinding(),current:binding,assistant:host});
 const worker={call:(op,args)=>execute(op,args,'disabled')},launches=[];
 const make=()=>new DesktopController({store,worker,documents:parent,authMode:'disabled',dialogs:{backup:async()=>null,destination:async()=>null,photo:async()=>null,export:async()=>null,library:async()=>binding.root},launch:async(_,ref)=>launches.push(ref),readAssistantSetup:async host=>({host,ready:true,skill:'nova-content-cover-execution',reason:'available'})});
 const controller=make();await controller.initialize();
 const view=await controller.generateCover({contentId:content.id,editToken:content.editToken,input});
 const job=view.jobs[0],reference={contentId:content.id,requestId:job.id,attemptId:job.activeAttemptId};
 const originalFile=path.join(binding.root,'内容',content.id,'封面任务',job.id,'请求.json');
 const originalBytes=await fs.readFile(originalFile),request=JSON.parse(originalBytes);
 assert.equal(request.schemaVersion,schema);assert.equal(request.coverText,undefined);assert.equal(request.contextSource,undefined);
 const call=worker.call;
 worker.call=async(op,args)=>{
  const result=await call(op,args);
  // Model only the upgraded inspector boundary; persistence, request lookup,
  // attempts, stale checks and controller recovery all use the real worker.
  if(op==='inspectCoverInput')return {...result,inputHash:'e'.repeat(64),existingRequest:null,contextSource:{kind:'topic',vaultId:randomUUID(),workId:'T087',documentId:'doc-'+'a'.repeat(32),pageId:null,revision:'d'.repeat(64),relativePath:'04_选题库/T087_已存选题.md',format:'markdown'}};
  return result;
 };
 return {library,worker,controller,make,job,reference,request,originalFile,originalBytes,launches};
}

for(const schema of [1,2])for(const host of ['codex','workbuddy'])test(`${host}: schema ${schema} without coverText retries and switches host after inspector upgrade`,async t=>{
 const f=await fixture(t,schema,host),reopened=f.make();await reopened.initialize();
 const retried=await reopened.retryCover(f.reference);
 assert.equal(retried.jobs[0].id,f.job.id);assert.equal(retried.jobs[0].requestHash,f.job.requestHash);
 assert.equal(retried.jobs[0].attempts.length,2);assert.equal(reopened.binding.coverPending,null);
 const other=host==='codex'?'workbuddy':'codex';await reopened.setAssistant({host:other});
 await reopened.continueCover({...f.reference,attemptId:retried.jobs[0].activeAttemptId});
 const current=f.library.readContent(f.reference.contentId),job=current.coverJobs[0];
 assert.equal(current.coverJobs.length,1);assert.equal(job.id,f.job.id);assert.equal(job.requestHash,f.job.requestHash);
 assert.equal(job.inputHash,f.request.inputHash);assert.equal(job.attempts.length,3);
 assert.deepEqual(job.attempts.map(a=>[a.host,a.reason]),[[host,'initial'],[host,'retry'],[other,'host-change']]);
 assert.deepEqual(await fs.readFile(f.originalFile),f.originalBytes);
 assert.equal(f.launches.length,3);assert.equal(f.launches.at(-1).host,other);
});

for(const schema of [1,2])for(const field of ['title','body'])test(`schema ${schema} preserves ${field} stale guard after inspector upgrade`,async t=>{
 const f=await fixture(t,schema,'codex'),before=f.library.readContent(f.reference.contentId);
 f.library.updateContent(before.id,{[field]:'Author changed '+field},before.editToken);
 await assert.rejects(f.controller.retryCover(f.reference),{code:'STALE_INPUT'});
 const current=f.library.readContent(before.id);
 assert.equal(current.coverJobs[0].attempts.length,1);assert.equal(f.launches.length,1);
 assert.equal(f.controller.binding.coverPending,null);
 assert.deepEqual(await fs.readFile(f.originalFile),f.originalBytes);
});
