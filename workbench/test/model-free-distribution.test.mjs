import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import * as dist from '../scripts/dist.mjs';
test('distribution never includes development model caches, even when present',()=>{
 const config=dist.installerConfig({platform:'darwin',arch:'arm64',channel:'preview',auth:'disabled'},'0.5.3');
 assert.equal(config.extraResources.some(resource=>/local-asr|local-probes[\/\\]local-asr/.test(resource.from+' '+resource.to)),false);
});
test('model-free artifact inspection rejects weights and sealed model payloads while permitting binaries',async t=>{
 assert.equal(typeof dist.assertModelFreeArtifact,'function');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'nova-model-free-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await fs.mkdir(path.join(root,'bin'));await fs.writeFile(path.join(root,'bin','node'),'binary fixture');
 await assert.doesNotReject(dist.assertModelFreeArtifact(root));
 for(const name of ['model.safetensors','qwen.gguf','pytorch_model.bin','ggml-large.bin','local-asr/runtime.json']){
  const file=path.join(root,name);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,'forbidden fixture');
  await assert.rejects(dist.assertModelFreeArtifact(root),/model|weight/i);await fs.rm(file);
 }
});
