// Synthetic native-worker comparison; no installed app or user library is opened.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import sharp from 'sharp';
import {createLibrary} from '../../plugin-src/src/lib/file-library/index.mjs';
import {WorkspaceController} from '../src/main/workspace-controller.mts';
import {execute} from '../src/main/worker.mts';
const parent=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'nova-scoped-candidate-performance-'));
try {
 const library=createLibrary(path.join(parent,'library'));
 for(let i=0;i<30;i++)library.createContent({title:'Other content '+i,body:'Synthetic body '.repeat(50)});
 for(let i=0;i<30;i++)library.createPrompt({title:'Other prompt '+i,body:'Synthetic prompt '.repeat(20)});
 let content=library.createContent({title:'Performance target',body:'Original body'});
 const file=path.join(parent,'original.png');await sharp({create:{width:160,height:90,channels:3,background:'blue'}}).png().toFile(file);
 const asset=library.importAsset(file,{purpose:'generated-cover'});
 content=library.registerContentCandidate(content.id,{assetHash:asset.assetHash,requestId:'manual',attemptId:'performance'},content.editToken);
 const binding={root:library.info.root,libraryId:library.info.libraryId,rootIdentity:library.info.rootIdentity},operations=[];
 const owner={binding:{workspacePending:null},authMode:'disabled',current:()=>binding,noPending:()=>{},query:async()=>null,persist:async value=>{owner.binding=value;},exclusive:async action=>action(),covers:{grant:hash=>'nova-content://assets/fixture/'+hash},worker:{call:async(op,args)=>{operations.push(op);return execute(op,args,'disabled');}}};
 const controller=new WorkspaceController(owner),samples=[];
 for(const mode of ['full-library','scoped','full-library','scoped']){
  content=library.readContent(content.id);
  const input={op:'updateCandidate',kind:'content',id:content.id,editToken:content.editToken,candidateId:content.candidates[0].id,favorite:!content.candidates[0].favorite,displayNumber:'',note:'Original note',variantId:null};
  operations.length=0;let reads=0,opens=0;const read=fs.readFileSync,open=fs.openSync;
  fs.readFileSync=function(...args){reads++;return read.apply(this,args);};fs.openSync=function(...args){opens++;return open.apply(this,args);};
  const started=performance.now();
  try{if(mode==='scoped')await controller.updateCoverCandidate(input);else await controller.mutateWorkspace(input);}finally{fs.readFileSync=read;fs.openSync=open;}
  const row={mode,milliseconds:Math.round((performance.now()-started)*100)/100,readFileSync:reads,openSync:opens,operations:[...operations]};samples.push(row);
  assert.equal(operations.includes('workspaceLibrary'),mode==='full-library');assert.equal(owner.binding.workspacePending,null);
 }
 const result={scope:'One synthetic native fixture, 31 contents and 30 prompts, one candidate. Alternating durable full-library/scoped mutations; no renderer, watcher, installed app, provider or user library.',samples};
 const evidence=process.argv[2];if(evidence)fs.writeFileSync(evidence,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}finally{fs.rmSync(parent,{recursive:true,force:true});}
