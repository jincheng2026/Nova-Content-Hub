import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createVault} from '../../plugin-src/src/lib/vault/index.mjs';
import {registerVaultResourceProjector} from '../../plugin-src/src/lib/vault/bridge.mjs';
import {projectVaultResources} from '../../plugin-src/src/lib/vault/resources.mjs';
import {execute} from '../src/main/worker.mts';
import {forgetBoundReader} from '../src/main/bound-reader.mts';

async function fixture(t) {
 const parent=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'nova-vault-location-'))),root=path.join(parent,'第二大脑');
 t.after(async()=>{registerVaultResourceProjector(projectVaultResources);forgetBoundReader();await fs.rm(parent,{recursive:true,force:true});});
 await fs.mkdir(root);const binding=createVault(root);forgetBoundReader();
 return {parent,root,binding,read:()=>execute('vaultLocation',{binding},'disabled')};
}

test('cold source-root lookup validates the binding without opening or projecting library data',async t=>{
 const f=await fixture(t);let projections=0;
 registerVaultResourceProjector(()=>{projections++;throw Error('A location lookup must not project unrelated resources');});
 assert.equal(await f.read(),f.root);
 assert.equal(projections,0);
});

test('source-root lookup refuses a replaced runtime directory, descriptor identity and symlink',async t=>{
 const f=await fixture(t),file=path.join(f.binding.root,'内容库.json'),bytes=await fs.readFile(file),descriptor=JSON.parse(bytes);
 await fs.writeFile(file,JSON.stringify({...descriptor,libraryId:randomUUID()}));await assert.rejects(f.read(),{code:'CONFLICT'});
 await fs.writeFile(file,bytes);assert.equal(await f.read(),f.root);
 const old=path.join(f.parent,'runtime-old');await fs.rename(f.binding.root,old);await fs.cp(old,f.binding.root,{recursive:true});
 await assert.rejects(f.read(),{code:'CONFLICT'});
 await fs.rm(f.binding.root,{recursive:true});await fs.symlink(old,f.binding.root,'dir');await assert.rejects(f.read(),error=>['UNSAFE_PATH','INVALID_INPUT'].includes(error.code));
});

test('source-root lookup refuses moved source identity and linked descriptor without business reads',async t=>{
 const f=await fixture(t),sourceOld=path.join(f.parent,'old-source');
 const file=path.join(f.binding.root,'内容库.json'),saved=path.join(f.parent,'descriptor.json');await fs.copyFile(file,saved);await fs.unlink(file);await fs.symlink(saved,file);
 await assert.rejects(f.read(),error=>['UNSAFE_PATH','INVALID_INPUT'].includes(error.code));await fs.unlink(file);await fs.copyFile(saved,file);
 await fs.rename(f.root,sourceOld);await fs.cp(sourceOld,f.root,{recursive:true});
 // The copied runtime has a different inode; either pin prevents looking through it.
 await assert.rejects(f.read(),{code:'CONFLICT'});
});

test('source-root lookup still validates the original Vault identity behind the selected runtime',async t=>{
 const f=await fixture(t),marker=path.join(f.binding.root,'vault-binding.json'),value=JSON.parse(await fs.readFile(marker,'utf8'));
 await fs.writeFile(marker,JSON.stringify({...value,rootIdentity:{...value.rootIdentity,ino:'1'}}));
 await assert.rejects(f.read(),{code:'CONFLICT'});
});

test('source-root lookup rejects descriptor changes during the fixed-size guarded read',async t=>{
 const {default:fsSync}=await import('node:fs');const f=await fixture(t),file=path.join(f.binding.root,'内容库.json'),bytes=await fs.readFile(file);
 const original=fsSync.readSync;let changed=false;
 t.mock.method(fsSync,'readSync',function(...args){const count=Reflect.apply(original,this,args);if(!changed&&count){changed=true;fsSync.writeFileSync(file,Buffer.concat([bytes,Buffer.from(' ')]));}return count;});
 await assert.rejects(f.read(),{code:'CONFLICT'});assert.equal(changed,true);
});
