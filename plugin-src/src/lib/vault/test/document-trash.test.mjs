import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createVault, createVaultDocument, readVaultDocument, openVault} from '../index.mjs';
import {digest, runMutation, vaultState} from '../core.mjs';
import {listVaultDocumentTrash, restoreVaultDocument} from '../document-trash.mjs';

function fixture(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'nova-document-trash-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const runtime=createVault(root).root;
  return {root:fs.realpathSync(root),runtime};
}
function trash(f,section='materials') {
  const {document}=createVaultDocument(f.runtime,{section,title:'需要恢复的资料',text:'# 需要恢复的资料\n\n原始正文'},{mutationId:randomUUID()});
  const trashId=randomUUID(),b=vaultState(f.runtime),documentTrash={schemaVersion:1,vaultId:b.vaultId,rootIdentity:b.rootIdentity};
  runMutation(f.runtime,{action:'trash',input:{id:document.id,expectedHash:document.hash},documentTrash},{mutationId:trashId},()=>({action:'trash',path:document.relativePath,beforeHash:document.hash,after:null,documentTrash,deletedAt:new Date().toISOString()}));
  return {document,trashId,input:{trashId,expectedHash:document.hash},receipt:path.join(f.root,`.workbench/mutations/${trashId}.json`),source:path.join(f.root,`.workbench/trash/${trashId}/source`)};
}
function editReceipt(item,edit) {const r=JSON.parse(fs.readFileSync(item.receipt));edit(r);fs.writeFileSync(item.receipt,JSON.stringify(r));}
for(const section of ['profile','materials','patterns'])test(`${section} roundtrip restores original document and persists an independent receipt`,t=>{
  const f=fixture(t),item=trash(f,section),rows=listVaultDocumentTrash(f.runtime);
  assert.equal(rows.length,1);assert.equal(rows[0].restorable,true);assert.equal(rows[0].documentId,item.document.id);
  const mutationId=randomUUID(),out=restoreVaultDocument(f.runtime,item.input,{mutationId});
  assert.equal(out.document.id,item.document.id);assert.equal(out.document.hash,item.document.hash);assert.equal(out.document.title,item.document.title);
  assert.equal(readVaultDocument(openVault(f.root).root,item.document.id).text,'# 需要恢复的资料\n\n原始正文');
  const receipt=JSON.parse(fs.readFileSync(path.join(f.root,`.workbench/mutations/${mutationId}.json`)));
  assert.equal(receipt.status,'committed');assert.equal(receipt.request.action,'restore-document');
  assert.equal(fs.existsSync(item.receipt),true);assert.equal(listVaultDocumentTrash(f.runtime)[0].issue,'已恢复');
});
test('replaying restore returns original result and never overwrites a later edit',t=>{
  const f=fixture(t),item=trash(f),options={mutationId:randomUUID()},result=restoreVaultDocument(f.runtime,item.input,options);
  fs.writeFileSync(path.join(f.root,item.document.relativePath),'后来编辑');
  assert.deepEqual(restoreVaultDocument(f.runtime,item.input,options),result);
  assert.equal(fs.readFileSync(path.join(f.root,item.document.relativePath),'utf8'),'后来编辑');
  assert.throws(()=>restoreVaultDocument(f.runtime,item.input,{mutationId:randomUUID()}),{code:'CONFLICT'});
});
test('occupied original path refuses restore and leaves both files intact',t=>{
  const f=fixture(t),item=trash(f);fs.writeFileSync(path.join(f.root,item.document.relativePath),'新文件');
  assert.match(listVaultDocumentTrash(f.runtime)[0].issue,/已有文件/);
  assert.throws(()=>restoreVaultDocument(f.runtime,item.input,{mutationId:randomUUID()}),{code:'CONFLICT'});
  assert.equal(fs.readFileSync(path.join(f.root,item.document.relativePath),'utf8'),'新文件');assert.ok(fs.existsSync(item.source));
});
for(const damage of ['changed','missing','symlink','hardlink'])test(`rejects ${damage} trash bytes`,t=>{
  const f=fixture(t),item=trash(f);
  if(damage==='changed')fs.writeFileSync(item.source,'篡改');
  else if(damage==='missing')fs.unlinkSync(item.source);
  else if(damage==='symlink'){fs.unlinkSync(item.source);fs.symlinkSync(path.join(f.root,'README.md'),item.source);}
  else fs.linkSync(item.source,path.join(f.root,'linked-trash'));
  assert.equal(listVaultDocumentTrash(f.runtime)[0].restorable,false);
  assert.throws(()=>restoreVaultDocument(f.runtime,item.input,{mutationId:randomUUID()}));
  assert.equal(fs.existsSync(path.join(f.root,item.document.relativePath)),false);
});
test('legacy receipt is visible with an explicit identity limitation',t=>{
  const f=fixture(t),item=trash(f);editReceipt(item,r=>{delete r.documentTrash;delete r.request.documentTrash;r.requestHash=digest(JSON.stringify(r.request));});
  const [row]=listVaultDocumentTrash(f.runtime);assert.equal(row.restorable,false);assert.match(row.issue,/旧版/);
  assert.throws(()=>restoreVaultDocument(f.runtime,item.input,{mutationId:randomUUID()}));
});
test('receipt metadata outside request checksum cannot authorize restore',t=>{
  const f=fixture(t),item=trash(f);editReceipt(item,r=>{r.documentTrash.vaultId='伪造身份';});
  assert.equal(listVaultDocumentTrash(f.runtime)[0].restorable,false);
  assert.throws(()=>restoreVaultDocument(f.runtime,item.input,{mutationId:randomUUID()}));
});
test('request checksum, document identity and original path are verified',t=>{
  for(const damage of ['checksum','id','path','hash','pending']){
    const f=fixture(t),item=trash(f);editReceipt(item,r=>{
      if(damage==='checksum')r.request.documentTrash.vaultId='未重算';
      if(damage==='id'){r.request.input.id='doc-'+'a'.repeat(32);r.requestHash=digest(JSON.stringify(r.request));}
      if(damage==='path')r.path='../outside.md';
      if(damage==='hash')r.beforeHash='b'.repeat(64);
      if(damage==='pending')r.status='pending';
    });
    assert.equal(listVaultDocumentTrash(f.runtime)[0].restorable,false,damage);
  }
});
test('a valid receipt and bytes copied to another vault cannot restore',t=>{
  const a=fixture(t),b=fixture(t),item=trash(a);
  fs.mkdirSync(path.join(b.root,`.workbench/trash/${item.trashId}`),{recursive:true});
  fs.copyFileSync(item.source,path.join(b.root,`.workbench/trash/${item.trashId}/source`));
  fs.copyFileSync(item.receipt,path.join(b.root,`.workbench/mutations/${item.trashId}.json`));
  assert.equal(listVaultDocumentTrash(b.runtime)[0].restorable,false);
  assert.throws(()=>restoreVaultDocument(b.runtime,item.input,{mutationId:randomUUID()}));
  assert.equal(fs.existsSync(path.join(b.root,item.document.relativePath)),false);
});
test('content trash projection and managed final assets never enter ordinary trash',t=>{
  const f=fixture(t),item=trash(f,'drafts');
  assert.equal(listVaultDocumentTrash(f.runtime).length,0);
  assert.throws(()=>restoreVaultDocument(f.runtime,item.input,{mutationId:randomUUID()}));
  const ordinary=trash(f);const projection=path.join(f.root,'.workbench/projection.json');
  fs.writeFileSync(projection,JSON.stringify({contents:{'content-1':{trashMutationId:ordinary.trashId,relativePath:ordinary.document.relativePath}}}));
  assert.equal(listVaultDocumentTrash(f.runtime).length,0);
});
test('renderer may submit only trashId and expectedHash',t=>{
  const f=fixture(t),item=trash(f);
  for(const extra of [{relativePath:'README.md'},{root:f.root},{bytes:'overwrite'},{receipt:{}}])assert.throws(()=>restoreVaultDocument(f.runtime,{...item.input,...extra},{mutationId:randomUUID()}),{code:'INVALID_INPUT'});
});
test('a copied receipt with a matching vault id still refuses another physical root',t=>{
  const a=fixture(t),b=fixture(t),item=trash(a),state=vaultState(b.runtime);
  fs.mkdirSync(path.join(b.root,`.workbench/trash/${item.trashId}`),{recursive:true});
  fs.copyFileSync(item.source,path.join(b.root,`.workbench/trash/${item.trashId}/source`));
  const r=JSON.parse(fs.readFileSync(item.receipt));r.request.documentTrash.vaultId=state.vaultId;r.documentTrash.vaultId=state.vaultId;r.requestHash=digest(JSON.stringify(r.request));
  fs.writeFileSync(path.join(b.root,`.workbench/mutations/${item.trashId}.json`),JSON.stringify(r));
  assert.match(listVaultDocumentTrash(b.runtime)[0].issue,/目录身份/);
  assert.throws(()=>restoreVaultDocument(b.runtime,item.input,{mutationId:randomUUID()}));
});
test('linked original directories and managed final paths cannot receive a document restore',t=>{
  const f=fixture(t),outside=fixture(t),item=trash(f),parent=path.dirname(path.join(f.root,item.document.relativePath));
  fs.renameSync(parent,parent+'-saved');fs.symlinkSync(outside.root,parent,'dir');
  assert.equal(listVaultDocumentTrash(f.runtime)[0].restorable,false);
  assert.throws(()=>restoreVaultDocument(f.runtime,item.input,{mutationId:randomUUID()}));
  assert.equal(fs.existsSync(path.join(outside.root,path.basename(item.document.relativePath))),false);
  fs.unlinkSync(parent);fs.renameSync(parent+'-saved',parent);
  editReceipt(item,r=>{r.path='05_内容草稿/T001_正文/最终资产/versions/version/逐字稿.md';});
  assert.equal(listVaultDocumentTrash(f.runtime).length,0);
  assert.throws(()=>restoreVaultDocument(f.runtime,item.input,{mutationId:randomUUID()}));
});
test('ordinary old libraries gain no inferred Vault authority',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'nova-old-document-trash-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  assert.throws(()=>listVaultDocumentTrash(root),{code:'NOT_READY'});
  assert.throws(()=>restoreVaultDocument(root,{trashId:randomUUID(),expectedHash:'a'.repeat(64)},{mutationId:randomUUID()}),{code:'NOT_READY'});
});
test('formal publication archive and analysis source subtrees are outside ordinary document trash',t=>{
  const f=fixture(t),item=trash(f);
  for(const directory of ['正式发布档案','已发布视频档案']){
    editReceipt(item,r=>{r.path=`06_发布复盘/${directory}/视频/说明.md`;});
    assert.equal(listVaultDocumentTrash(f.runtime).length,0);
    assert.throws(()=>restoreVaultDocument(f.runtime,item.input,{mutationId:randomUUID()}));
  }
});
