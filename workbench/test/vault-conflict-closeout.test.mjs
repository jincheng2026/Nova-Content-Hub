import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {createVault} from '../../plugin-src/src/lib/vault/index.mjs';
import {DesktopController} from '../src/main/controller.mts';import {BindingStore,emptyBinding} from '../src/main/bindings.mts';import {execute} from '../src/main/worker.mts';
import {reconcileVaultEditor} from '../src/shared/vault-editor-recovery.ts';
async function fixture(t){const root=await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()),'vault-conflict-closeout-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const vault=path.join(root,'第二大脑');await fs.mkdir(vault);const binding=createVault(vault),store=new BindingStore(path.join(root,'machine.json'));await store.save({...emptyBinding(),current:binding});const c=new DesktopController({store,worker:{call:(op,args)=>execute(op,args,'disabled')},documents:root,authMode:'disabled',dialogs:{library:async()=>null,destination:async()=>null}});await c.initialize();return{c,vault};}
test('discard after a real external edit returns a new hash, retains the draft and allows explicit merged saving',async t=>{
 const {c,vault}=await fixture(t),original=await c.createVaultDocument({section:'materials',title:'原文冲突',text:'旧原文'}),input={id:original.document.id,expectedHash:original.document.hash,text:'本人草稿'},file=path.join(vault,original.document.relativePath);
 await fs.writeFile(file,'外部修改');await assert.rejects(c.saveVaultDocument(input),{code:'CONFLICT'});
 const recovery=await c.recoverVaultMutation({action:'discard'});assert.equal(recovery.outcome,'discarded');assert.equal(recovery.current.text,'外部修改');assert.notEqual(recovery.current.document.hash,original.document.hash);
 const editor=reconcileVaultEditor({current:original,text:'本人草稿',title:'原文冲突',category:'materials',submission:{method:'saveVaultDocument',input}},recovery);assert.equal(editor.text,'本人草稿');assert.equal(editor.conflict,true);
 const saved=await c.saveVaultDocument({id:editor.current.document.id,expectedHash:editor.current.document.hash,text:editor.current.text+'\n'+editor.text});assert.equal(saved.text,'外部修改\n本人草稿');assert.equal(await fs.readFile(file,'utf8'),saved.text);
});
test('another external edit after recovery still rejects the acknowledged old version without overwriting it',async t=>{
 const {c,vault}=await fixture(t),original=await c.createVaultDocument({section:'materials',title:'再次变化',text:'旧原文'}),file=path.join(vault,original.document.relativePath);
 await fs.writeFile(file,'外部修改');await assert.rejects(c.saveVaultDocument({id:original.document.id,expectedHash:original.document.hash,text:'本人草稿'}),{code:'CONFLICT'});const recovered=await c.recoverVaultMutation({action:'discard'});
 await fs.writeFile(file,'第二次外部修改');await assert.rejects(c.saveVaultDocument({id:original.document.id,expectedHash:recovered.current.document.hash,text:'本人草稿'}),{code:'CONFLICT'});assert.equal(await fs.readFile(file,'utf8'),'第二次外部修改');
});
