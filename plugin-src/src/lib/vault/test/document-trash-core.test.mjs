import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createVault,createVaultDocument,trashVaultDocument,readVaultDocument} from '../index.mjs';
import {listVaultDocumentTrash,restoreVaultDocument} from '../document-trash.mjs';
import {runMutation} from '../core.mjs';
for(const section of ['profile','materials','patterns'])test(`real trash API pins ${section} identity and replays without losing restoration`,t=>{
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'nova-document-trash-core-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const runtime=createVault(root).root,source=createVaultDocument(runtime,{section,title:'原始资料',text:'# 原始资料\n\n原件保留。'},{mutationId:randomUUID()}),input={id:source.document.id,expectedHash:source.document.hash},options={mutationId:randomUUID()};
 trashVaultDocument(runtime,input,options);const row=listVaultDocumentTrash(runtime)[0];assert.equal(row.restorable,true,row.issue);
 assert.deepEqual(trashVaultDocument(runtime,input,options),{trashed:true});
 const restored=restoreVaultDocument(runtime,{trashId:row.trashId,expectedHash:row.hash},{mutationId:randomUUID()});assert.equal(restored.text,source.text);
 assert.equal(readVaultDocument(runtime,source.document.id).text,source.text);
});
test('legacy trash mutation can be replayed after upgrade without promoting its restore authority',t=>{
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'nova-document-trash-legacy-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const runtime=createVault(root).root,source=createVaultDocument(runtime,{section:'materials',title:'旧版回收',text:'原件'},{mutationId:randomUUID()}),input={id:source.document.id,expectedHash:source.document.hash},options={mutationId:randomUUID()};
 runMutation(runtime,{action:'trash',input},options,()=>({action:'trash',path:source.document.relativePath,beforeHash:source.document.hash,after:null}));
 assert.deepEqual(trashVaultDocument(runtime,input,options),{trashed:true});assert.equal(listVaultDocumentTrash(runtime)[0].restorable,false);
});
