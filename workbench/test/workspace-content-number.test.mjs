import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createLibrary,openLibrary} from '../../plugin-src/src/lib/file-library/index.mjs';
import {createVault} from '../../plugin-src/src/lib/vault/index.mjs';
import {workspaceLibrary} from '../src/main/workspace-worker.mts';
for(const kind of ['ordinary','vault'])test(`${kind} workspace exposes persisted work identity separately from an untitled display name`,t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'nova-work-number-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 if(kind==='vault')fs.mkdirSync(path.join(root,'vault'));
 const lib=kind==='vault'?openLibrary(createVault(path.join(root,'vault')).root):createLibrary(path.join(root,'library')),content=lib.createContent({title:'未定标题',body:''});
 lib.mutateProduction('ensureCreation',{contentId:content.id,expectedToken:lib.readProduction().editToken});
 const expected=lib.readProductionCreation(content.id).creation.tNumber;
 assert.match(expected,/^T\d{3,}$/);assert.equal(workspaceLibrary(lib).contentDetails.find(item=>item.id===content.id).tNumber,expected);
 assert.equal(lib.readContent(content.id).title,'未定标题');
});
