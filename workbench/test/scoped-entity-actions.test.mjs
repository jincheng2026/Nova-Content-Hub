import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {createLibrary} from '../../plugin-src/src/lib/file-library/index.mjs';
import {WorkspaceController} from '../src/main/workspace-controller.mts';
import {execute} from '../src/main/worker.mts';
import {workspaceDesktopInput} from '../src/shared/workspace-validation.ts';

async function fixture(t) {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-scoped-actions-'));
  t.after(() => fs.rm(parent, {recursive:true, force:true}));
  const library = createLibrary(path.join(parent, 'library'));
  const binding = {root:library.info.root, libraryId:library.info.libraryId, rootIdentity:library.info.rootIdentity};
  const calls = [];
  const owner = {binding:{workspacePending:null}, authMode:'disabled', current:()=>binding, noPending:()=>{}, query:async()=>null, persist:async value=>{owner.binding=value;}, exclusive:async action=>action(), covers:{grant:hash=>'nova-content://assets/fixture/'+hash}, worker:{call:async(op,args)=>{calls.push(op);return execute(op,args,'disabled');}}};
  const controller = new WorkspaceController(owner);
  let content = library.createContent({title:'Scoped content',body:'Original body'});
  const image = path.join(parent, 'original.png');
  await sharp({create:{width:16,height:9,channels:3,background:'blue'}}).png().toFile(image);
  const asset = library.importAsset(image,{purpose:'generated-cover'});
  content = library.registerContentCandidate(content.id,{assetHash:asset.assetHash,requestId:'manual',attemptId:'test'},content.editToken);
  const command = {op:'updateCandidate',kind:'content',id:content.id,editToken:content.editToken,candidateId:content.candidates[0].id,favorite:true,displayNumber:'自定义编号',note:'完整\n原始批注',variantId:null};
  return {library,owner,controller,command,calls,content,image};
}

test('candidate changes acknowledge a fresh scoped entity and token without reading the library',async t=>{
  const f=await fixture(t), original=await fs.readFile(f.image);
  const first=await f.controller.updateCoverCandidate(f.command);
  assert.equal(first.candidates[0].favorite,true);assert.equal(first.candidates[0].note,f.command.note);assert.notEqual(first.editToken,f.command.editToken);
  assert.match(first.candidates[0].url,/^nova-content:/);assert.equal(f.owner.binding.workspacePending,null);
  const second=await f.controller.updateCoverCandidate({...f.command,editToken:first.editToken,favorite:false});
  assert.equal(second.candidates[0].favorite,false);assert.equal(f.calls.filter(op=>op==='workspaceContent').length,2);assert.equal(f.calls.includes('workspaceLibrary'),false);
  await assert.rejects(f.controller.updateCoverCandidate(f.command),{code:'CONFLICT'});
  assert.deepEqual(await fs.readFile(f.image),original);
});

test('lost mutation response uses the same scoped receipt recovery and rereads current data',async t=>{
  const f=await fixture(t), call=f.owner.worker.call;
  let lost=true;
  f.owner.worker.call=async(op,args)=>{const result=await call(op,args);if(op==='workspaceMutate'&&lost){lost=false;const current=f.library.readContent(f.content.id);f.library.updateContent(current.id,{title:'Later external title',body:current.body},current.editToken);throw Object.assign(Error('response lost'),{code:'WORKER_EXIT'});}return result;};
  const result=await f.controller.updateCoverCandidate(f.command);
  assert.equal(result.title,'Later external title');assert.equal(result.editToken,f.library.readContent(f.content.id).editToken);
  assert.equal(f.calls.filter(op=>op==='workspaceMutate').length,1);assert.equal(f.calls.includes('workspaceLibrary'),false);assert.equal(f.owner.binding.workspacePending,null);
});

test('projection failure preserves exact durable intent; ordinary recovery after restart stays compatible',async t=>{
  const f=await fixture(t), call=f.owner.worker.call;
  f.owner.worker.call=async(op,args)=>{if(op==='workspaceContent')throw Object.assign(Error('scoped read failed'),{code:'READ_FAILED'});return call(op,args);};
  await assert.rejects(f.controller.updateCoverCandidate(f.command),{code:'READ_FAILED'});
  const pending=structuredClone(f.owner.binding.workspacePending);assert.deepEqual(pending.input,f.command);
  const token=f.library.readContent(f.content.id).editToken;
  f.owner.worker.call=call;
  const restarted=new WorkspaceController(f.owner), recovered=await restarted.recoverWorkspaceMutation();
  assert.equal(recovered.result.mutationId,pending.mutationId);assert.equal(recovered.result.library.contentDetails.find(c=>c.id===f.content.id).editToken,token);
  assert.equal(f.calls.filter(op=>op==='workspaceMutate').length,1);assert.equal(f.owner.binding.workspacePending,null);
});

test('prompt favorite uses the same pending and CAS rules with a scoped projection',async t=>{
  const f=await fixture(t), prompt=f.library.createPrompt({title:'收藏提示词',body:'完整正文'});
  const command={op:'setPromptFavorite',id:prompt.id,editToken:prompt.editToken,favorite:true};
  const first=await f.controller.updatePromptFavorite(command);
  const second=await f.controller.updatePromptFavorite({...command,editToken:first.editToken,favorite:false});
  assert.equal(second.favorite,false);assert.equal(second.body,prompt.body);assert.equal(f.calls.includes('workspaceLibrary'),false);assert.equal(f.calls.filter(op=>op==='workspacePrompt').length,2);
  for(const [method,input]of [['updateCoverCandidate',{...f.command,kind:'collection'}],['updatePromptFavorite',{...command,extra:true}],['updateCoverCandidate',{...f.command,id:'../escape'}]])assert.equal(workspaceDesktopInput(method,input),false);
  await assert.rejects(execute('workspaceContent',{binding:f.owner.current(),id:'../escape'}),{code:'INVALID_INPUT'});
});
