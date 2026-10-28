import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createVault,readVaultSnapshot} from '../../plugin-src/src/lib/vault/index.mjs';
import {executeVault} from '../src/main/vault-worker.mts';

test('reference folder reveal resolves only existing card-linked material locations within the bound vault',async t=>{
 const parent=await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()),'nova-ref-location-'));t.after(()=>fs.rm(parent,{recursive:true,force:true}));
 const root=path.join(parent,'第二大脑');await fs.mkdir(root);const binding=createVault(root);
 const folder='02_内容素材/抖音/示例_1234567890123456789';
 await fs.mkdir(path.join(root,folder),{recursive:true});await fs.writeFile(path.join(root,folder,'笔记信息.md'),'参考事实');
 await fs.writeFile(path.join(root,'04_选题库','T001.md'),`# 选题\n[参考](../${folder}/笔记信息.md)\n[库外](/tmp/private)`);
 const card=readVaultSnapshot(binding.root).documents.find(d=>d.relativePath==='04_选题库/T001.md');
 await fs.writeFile(path.join(root,'05_内容草稿','普通稿.md'),`[参考](../${folder}/笔记信息.md)`);
 const draft=readVaultSnapshot(binding.root).documents.find(d=>d.relativePath==='05_内容草稿/普通稿.md');
 assert.throws(()=>executeVault('vaultReferenceLocation',{binding,id:draft.id,target:folder},'disabled'),{code:'INVALID_REFERENCE_LINK'});
 const request={binding,id:card.id,target:folder};
 assert.equal(executeVault('vaultReferenceLocation',request,'disabled'),path.join(root,folder));
 for(const target of ['02_内容素材/无关/其他','../private','/tmp/private',folder+'/不存在'])assert.throws(()=>executeVault('vaultReferenceLocation',{...request,target},'disabled'));
 await fs.rename(path.join(root,folder),path.join(parent,'external'));await fs.symlink(path.join(parent,'external'),path.join(root,folder));
 assert.throws(()=>executeVault('vaultReferenceLocation',request,'disabled'));
 assert.throws(()=>executeVault('vaultReferenceLocation',request,'required'),{code:'AUTH_NOT_CONFIGURED'});
});
