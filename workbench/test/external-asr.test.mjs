import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as asr from '../src/main/external-asr.mts';
async function fixture(t){const home=await fs.mkdtemp(path.join(os.tmpdir(),'nova 外部语音 '));t.after(()=>fs.rm(home,{recursive:true,force:true}));const executable=path.join(home,'.venvs/qwen/bin/python3'),modelPath=path.join(home,'Models/Qwen3-ASR');await fs.mkdir(path.dirname(executable),{recursive:true});await fs.mkdir(modelPath,{recursive:true});await fs.writeFile(executable,'python');await fs.chmod(executable,0o755);await fs.writeFile(path.join(modelPath,'config.json'),JSON.stringify({model_type:'qwen3_asr'}));await fs.writeFile(path.join(modelPath,'model.safetensors'),'weights');return {home,executable,modelPath,module:'mlx_audio'};}
const target={platform:'darwin',arch:'arm64'};
const proof={platform:'darwin',arch:'arm64',python:'3.11.9',module:'mlx_audio',text:'你好，语音测试。',mp4Decode:true,dependencies:{mlx_audio:'0.4.0',av:'15.0.0'}};
test('discovers bounded standard candidates with Unicode paths and does not execute files',async t=>{const f=await fixture(t);assert.equal(typeof asr.discoverExternalAsrCandidates,'function');const result=await asr.discoverExternalAsrCandidates({home:f.home,target});assert.equal(result.length,1);assert.equal(result[0].executable,f.executable);assert.equal(result[0].modelPath,await fs.realpath(f.modelPath));});
test('freezes model identity, validates a real transcription proof and rejects moved or changed models',async t=>{const f=await fixture(t);assert.equal(typeof asr.validateExternalAsrCandidate,'function');const result=await asr.validateExternalAsrCandidate(f,{target,runner:async()=>proof});assert.equal(result.status,'ready');assert.deepEqual(result.capabilities,{text:true,timestamps:false,mp4Decode:true});assert.equal(result.frozen.module,'mlx_audio');await asr.assertExternalAsrIdentity(result.frozen);await fs.writeFile(path.join(f.modelPath,'model.safetensors'),'changed weights');await assert.rejects(asr.assertExternalAsrIdentity(result.frozen),{code:'EXTERNAL_ASR_CHANGED'});});
test('rejects wrong architectures, missing modules and empty transcription without advertising readiness',async t=>{const f=await fixture(t);assert.equal(typeof asr.validateExternalAsrCandidate,'function');for(const invalid of [{...proof,arch:'x64'},{...proof,text:''}]){const result=await asr.validateExternalAsrCandidate(f,{target,runner:async()=>invalid});assert.equal(result.status,'unavailable');assert.equal(result.capabilities.text,false);}const missing=await asr.validateExternalAsrCandidate(f,{target,runner:async()=>{throw Object.assign(new Error(),{code:'EXTERNAL_ASR_DEPENDENCY'});}});assert.equal(missing.status,'unavailable');assert.equal(missing.reason.includes('依赖'),true);});
test('model-only cache is not runnable; manual saved selection precedes other candidates without whole-disk recursion',async t=>{const f=await fixture(t);assert.equal(typeof asr.discoverExternalAsrCandidates,'function');const saved=await asr.discoverExternalAsrCandidates({home:f.home,target,saved:{localExecutable:f.executable,localModelPath:f.modelPath,localModule:'qwen_asr'}});assert.equal(saved[0].module,'qwen_asr');await fs.rm(f.executable);assert.equal((await asr.discoverExternalAsrCandidates({home:f.home,target})).length,0);});
test('rejects wrong model identity and cancellation before running a candidate',async t=>{const f=await fixture(t);assert.equal(typeof asr.validateExternalAsrCandidate,'function');await fs.writeFile(path.join(f.modelPath,'config.json'),'{"model_type":"qwen2"}');let called=false;const result=await asr.validateExternalAsrCandidate(f,{target,runner:async()=>{called=true;return proof;}});assert.equal(result.status,'unavailable');assert.equal(called,false);const controller=new AbortController();controller.abort();await assert.rejects(asr.validateExternalAsrCandidate(f,{target,signal:controller.signal}),{code:'EXTERNAL_ASR_CANCELLED'});});
test('fixed process runner enforces timeout and cancellation, including interpreter paths with spaces',async t=>{assert.equal(typeof asr.runExternalAsrProcess,'function');await assert.rejects(asr.runExternalAsrProcess(process.execPath,['-e','setTimeout(()=>{},5000)'],{timeoutMs:30}),{code:'EXTERNAL_ASR_TIMEOUT'});const controller=new AbortController();const pending=asr.runExternalAsrProcess(process.execPath,['-e','setTimeout(()=>{},5000)'],{signal:controller.signal});controller.abort();await assert.rejects(pending,{code:'EXTERNAL_ASR_CANCELLED'});});
test('settings persist explicit Qwen module identity while retaining legacy inputs',async()=>{const {serviceAsrSettings,normalizeAsrSettings,defaultServiceSettings}=await import('../src/shared/service-validation.ts');const values={...defaultServiceSettings().asr,localEngine:'qwen3-asr',localModule:'mlx_audio'};assert.equal(serviceAsrSettings(values),true);assert.equal(normalizeAsrSettings(values).localModule,'mlx_audio');assert.equal(serviceAsrSettings({...values,localModule:'shell'}),false);});
async function dependencyFile(f,relative,bytes='version A'){
    const file=path.join(path.dirname(path.dirname(f.executable)),'lib/python3.11/site-packages',relative);
    await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,bytes);return file;
}
test('freezes nested model implementation bytes even when parent directory and file metadata are unchanged',async t=>{
    const f=await fixture(t),file=await dependencyFile(f,'mlx_audio/stt/models/qwen3_asr/qwen3_asr.py');
    const timestamp=new Date('2026-01-01T00:00:00.000Z');await fs.utimes(file,timestamp,timestamp);
    const frozen={...f,identity:await asr.externalAsrIdentity(f)},before=await fs.stat(file);
    await fs.writeFile(file,'version B');await fs.utimes(file,before.atime,before.mtime);
    const after=await fs.stat(file);assert.equal(after.size,before.size);assert.equal(after.mtimeMs,before.mtimeMs);
    await assert.rejects(asr.assertExternalAsrIdentity(frozen),{code:'EXTERNAL_ASR_CHANGED'});
});
test('freezes selected dependency additions and native metadata without hashing unrelated packages',async t=>{
    const f=await fixture(t),native=await dependencyFile(f,'mlx/core.cpython-311-darwin.so','native A');
    let frozen={...f,identity:await asr.externalAsrIdentity(f)};
    await dependencyFile(f,'unrelated/huge-model.safetensors','irrelevant');
    // Parent site-packages metadata may change, so take the baseline after adding an unrelated package.
    frozen.identity=await asr.externalAsrIdentity(f);
    await dependencyFile(f,'unrelated/source.py','irrelevant source');
    assert.equal(await asr.externalAsrIdentity(f),frozen.identity);
    await fs.writeFile(native,'different native implementation');
    await assert.rejects(asr.assertExternalAsrIdentity(frozen),{code:'EXTERNAL_ASR_CHANGED'});
    frozen.identity=await asr.externalAsrIdentity(f);
    await dependencyFile(f,'mlx_audio/stt/models/qwen3_asr/tokenizer.py','new implementation');
    await assert.rejects(asr.assertExternalAsrIdentity(frozen),{code:'EXTERNAL_ASR_CHANGED'});
});
test('dependency fingerprint limits fail closed and recover after oversized code is removed',async t=>{
    const f=await fixture(t),file=await dependencyFile(f,'mlx_audio/stt/models/qwen3_asr/oversized.py',Buffer.alloc(4*1024*1024+1));
    await assert.rejects(asr.externalAsrIdentity(f),{code:'EXTERNAL_ASR_DEPENDENCY'});
    await fs.rm(file);assert.equal(typeof await asr.externalAsrIdentity(f),'string');
});
test('freezes qwen implementation in Windows Lib/site-packages and excludes the unselected MLX implementation',async t=>{
    const f=await fixture(t);f.module='qwen_asr';
    const site=path.join(path.dirname(path.dirname(f.executable)),'Lib/site-packages'),file=path.join(site,'qwen_asr/core/model.py');
    await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,'version A');
    const frozen={...f,identity:await asr.externalAsrIdentity(f)};
    const other=path.join(site,'mlx_audio/stt/models/qwen3_asr/model.py');await fs.mkdir(path.dirname(other),{recursive:true});await fs.writeFile(other,'unused code');
    assert.equal(await asr.externalAsrIdentity(f),frozen.identity);
    await fs.writeFile(file,'changed implementation');
    await assert.rejects(asr.assertExternalAsrIdentity(frozen),{code:'EXTERNAL_ASR_CHANGED'});
});
