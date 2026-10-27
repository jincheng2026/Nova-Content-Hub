import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {openVault,vaultRootForRuntime} from '../index.mjs';
test('first open completes source projection before a bounded desktop read can observe the binding',t=>{
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'nova-vault-activation-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 for(const name of ['00_个人背景','01_对标账号','02_内容素材','03_内容规律','04_选题库','05_内容草稿','06_发布复盘'])fs.mkdirSync(path.join(root,name));
 fs.writeFileSync(path.join(root,'AGENTS.md'),'# 第二大脑');fs.mkdirSync(path.join(root,'05_内容草稿/T001_当前稿'));fs.writeFileSync(path.join(root,'05_内容草稿/T001_当前稿/正文.md'),'# 当前稿\n\n已有正文');
 const binding=openVault(root);
 assert.equal(vaultRootForRuntime(binding.root),root);
 const projected=JSON.parse(fs.readFileSync(path.join(root,'.workbench/projection.json'),'utf8'));
 assert.equal(Object.keys(projected.contents).length,1);
 assert.ok(Object.values(projected.contents).some(source=>source.relativePath==='05_内容草稿/T001_当前稿/正文.md'));
});
