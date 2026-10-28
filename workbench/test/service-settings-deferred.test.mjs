import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {ServiceSettingsStore} from '../src/main/service-settings.mts';
import {ServiceTools} from '../src/main/service-tools.mts';
import {createPublicationCollector} from '../src/main/publication-collector.mts';
import {defaultServiceSettings} from '../src/shared/service-validation.ts';

async function fixture(t,{keys={tikhub:'old-tik',model:'unrelated-model',asr:'old-asr'},available=true,backend='keychain'}={}){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'nova-deferred-settings-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const calls={probe:0,backend:0,encrypt:0,decrypt:0};
 const encryption={isEncryptionAvailable:()=>{calls.probe++;return available;},getSelectedStorageBackend:()=>{calls.backend++;return backend;},encryptString:value=>{calls.encrypt++;return Buffer.from('encrypted:'+value);},decryptString:value=>{calls.decrypt++;return value.toString().replace(/^encrypted:/,'');}};
 const filePath=path.join(dir,'settings.json');await fs.writeFile(filePath,JSON.stringify({version:1,values:defaultServiceSettings(),keys:Object.fromEntries(Object.entries(keys).map(([name,key])=>[name,Buffer.from('encrypted:'+key).toString('base64')]))}));
 const store=new ServiceSettingsStore({filePath,encryption,deferEncryptionCheck:true});return{dir,filePath,store,calls,encryption};
}
const request=(fields={})=>({tool:'tikhub',operation:'video',id:'123456',taskId:randomUUID(),attemptId:randomUUID(),claimToken:randomUUID(),workerId:'deferred-regression',requestId:randomUUID(),...fields});

test('deferred startup, repeated settings/status reads, ordinary save and key clear never probe native storage',async t=>{
 const f=await fixture(t),initial=await f.store.initialize();assert.equal(initial.encryptionAvailable,false);assert.equal(initial.encryptionStatus,'unchecked');
 const before=JSON.parse(await fs.readFile(f.filePath,'utf8'));
 for(let n=0;n<5;n++){assert.equal(f.store.read().encryptionStatus,'unchecked');assert.equal(f.store.encryptionAvailable(),false);}
 await f.store.update({values:{...initial.values,commentsEnabled:true}});assert.deepEqual(JSON.parse(await fs.readFile(f.filePath,'utf8')).keys,before.keys);
 await f.store.update({keys:{asr:null}});const after=JSON.parse(await fs.readFile(f.filePath,'utf8'));assert.equal(after.keys.asr,undefined);assert.equal(after.keys.tikhub,before.keys.tikhub);assert.equal(after.keys.model,before.keys.model);
 assert.throws(()=>f.store.secret('groq'),{code:'SERVICE_KEY_MISSING'});assert.deepEqual(f.calls,{probe:0,backend:0,encrypt:0,decrypt:0});
});
test('explicit reveal and key replacement probe storage and cache status without subsequent passive probes',async t=>{
 const f=await fixture(t);await f.store.initialize();assert.deepEqual(f.store.reveal('tikhub'),{service:'tikhub',key:'old-tik'});assert.deepEqual(f.calls,{probe:1,backend:1,encrypt:0,decrypt:1});assert.equal(f.store.read().encryptionStatus,'available');
 await f.store.update({keys:{tikhub:'new-tik'}});assert.equal(f.calls.probe,2);assert.equal(f.calls.encrypt,1);assert.equal(f.store.read().encryptionAvailable,true);assert.equal(f.calls.probe,2);assert.equal(f.store.secret('tikhub'),'new-tik');
});
test('denied native storage and encryption/decryption errors preserve old ciphertext with no plaintext fallback',async t=>{
 const f=await fixture(t,{available:false});await f.store.initialize();const before=await fs.readFile(f.filePath,'utf8');
 assert.throws(()=>f.store.reveal('tikhub'),{code:'ENCRYPTION_UNAVAILABLE'});assert.equal(f.store.read().encryptionStatus,'unavailable');await assert.rejects(f.store.update({keys:{tikhub:'replacement'}}),{code:'ENCRYPTION_UNAVAILABLE'});assert.equal(await fs.readFile(f.filePath,'utf8'),before);assert.equal(f.calls.decrypt,0);assert.equal(f.calls.encrypt,0);
 f.encryption.isEncryptionAvailable=()=>{f.calls.probe++;return true;};f.encryption.encryptString=()=>{throw Error('denied');};await assert.rejects(f.store.update({keys:{tikhub:'replacement'}}),{code:'ENCRYPTION_UNAVAILABLE'});assert.equal(f.store.read().encryptionStatus,'unavailable');assert.equal(await fs.readFile(f.filePath,'utf8'),before);
 f.encryption.decryptString=()=>{throw Error('denied');};assert.throws(()=>f.store.reveal('tikhub'),{code:'ENCRYPTION_UNAVAILABLE'});assert.equal(f.store.read().encryptionStatus,'unavailable');assert.equal(await fs.readFile(f.filePath,'utf8'),before);
});
test('deferred explicit credentials still reject unsafe plaintext backends',async t=>{
 const f=await fixture(t,{backend:'basic_text'});await f.store.initialize();const before=await fs.readFile(f.filePath,'utf8');assert.throws(()=>f.store.reveal('tikhub'),{code:'ENCRYPTION_UNAVAILABLE'});await assert.rejects(f.store.update({keys:{tikhub:'plaintext-risk'}}),{code:'ENCRYPTION_UNAVAILABLE'});assert.equal(await fs.readFile(f.filePath,'utf8'),before);assert.equal(f.calls.decrypt,0);assert.equal(f.calls.encrypt,0);
});
test('legacy nondeferred store preserves eager encryption availability API',async t=>{
 const f=await fixture(t);const store=new ServiceSettingsStore({filePath:f.filePath,encryption:f.encryption});assert.equal((await store.initialize()).encryptionAvailable,true);assert.equal(f.calls.probe,1);assert.equal(store.encryptionAvailable(),true);assert.equal(f.calls.probe,2);
});
test('local readiness and successful transcription never access credentials even with saved unrelated keys',async t=>{
 const f=await fixture(t);await f.store.initialize();
 const model=path.join(f.dir,'controlled-qwen-model'),executable=path.join(f.dir,'controlled-python');await fs.mkdir(model);await fs.writeFile(path.join(model,'config.json'),JSON.stringify({model_type:'qwen3_asr'}));await fs.writeFile(path.join(model,'model.safetensors'),'controlled test weight identity only');
 const proof=JSON.stringify({platform:process.platform,arch:process.arch,python:'3.12.0',module:'qwen_asr',text:'你好，语音测试。',mp4Decode:false,dependencies:{}});await fs.writeFile(executable,'#!/bin/sh\nprintf \'%s\\n\' \''+proof+'\'\n',{mode:0o755});
 const values=f.store.read().values;await f.store.update({values:{...values,asr:{...values.asr,localEngine:'qwen3-asr',localExecutable:executable,localModelPath:model}}});
 const tools=new ServiceTools({settings:f.store});tools.localTranscribe=async()=>({text:'本地识别',durationMs:1200});let secretCalls=0;f.store.secret=()=>{secretCalls++;throw Error('Local ASR must never obtain a credential');};
 const readiness=await tools.checkReadiness();assert.equal(readiness.localAsr.available,true);assert.equal(readiness.encryptionAvailable,false);assert.equal(readiness.encryptionStatus,'unchecked');
 const audioPath=path.join(f.dir,'sample.wav');await fs.writeFile(audioPath,'fixture audio');const result=await tools.execute({tool:'asr',audioPath,taskId:randomUUID(),attemptId:randomUUID(),claimToken:randomUUID(),workerId:'deferred-local-asr',requestId:randomUUID()});assert.equal(result.data.text,'本地识别');assert.equal(result.requestsUsed,0);assert.equal(secretCalls,0);assert.deepEqual(f.calls,{probe:0,backend:0,encrypt:0,decrypt:0});
});
test('credential redaction reuses only explicitly obtained values and survives key rotation during a request',async t=>{
 const f=await fixture(t);await f.store.initialize();await f.store.update({values:{...f.store.read().values,budget:{enabled:true,maxRequestsPerTask:2}}});
 const tools=new ServiceTools({settings:f.store});let seen=0;
 tools.invoke=async()=>{seen++;await f.store.update({keys:{tikhub:'replacement-tik'}});return{old:'old-tik',current:f.store.secret('tikhub'),unrelated:'unrelated-model'};};
 const result=await tools.execute(request());assert.equal(seen,1);assert.deepEqual(result.data,{old:'[redacted]',current:'[redacted]',unrelated:'unrelated-model'});assert.equal(f.calls.decrypt,2,'only provider keys used by this request may be decrypted');
 const before={...f.calls};f.store.secret=()=>assert.fail('Scrubbing must not decrypt any credential');assert.deepEqual(tools.scrub({old:'old-tik',current:'replacement-tik',unrelated:'unrelated-model'}),result.data);assert.deepEqual(f.calls,before);
});
test('automatic observer remains unready while credentials have not been explicitly checked',async t=>{
 const f=await fixture(t);await f.store.initialize();await f.store.update({values:{...f.store.read().values,budget:{enabled:true,maxRequestsPerTask:1}}});
 const collector=createPublicationCollector({settings:f.store,controller:{owner:{current:()=>assert.fail('Unchecked credentials cannot dispatch observer work')}},worker:{call:()=>assert.fail('No worker task')},descriptorPath:'/unused',runOperation:()=>assert.fail('No operation')});
 for(let n=0;n<3;n++)assert.equal(collector.isReady(),false);assert.deepEqual(f.calls,{probe:0,backend:0,encrypt:0,decrypt:0});
});
