import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import dns from 'node:dns/promises';
import {syncBuiltinESMExports} from 'node:module';
import {PassThrough,Readable} from 'node:stream';
import {randomUUID} from 'node:crypto';
import {ServiceSettingsStore} from '../src/main/service-settings.mts';
import {ServiceTools,boundedHttps,publicEndpoint} from '../src/main/service-tools.mts';
import {defaultServiceSettings,serviceSettingsValues} from '../src/shared/service-validation.ts';
const encryption={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(`encrypted:${s}`),decryptString:b=>b.toString().replace(/^encrypted:/,'')};
const cloud=(patch={})=>({provider:'volc',groqModel:'whisper-large-v3-turbo',customBaseUrl:'',customModelId:'',...patch});
const input=(audioPath,extra={})=>({tool:'asr',audioPath,allowCloud:true,taskId:randomUUID(),attemptId:randomUUID(),claimToken:randomUUID(),workerId:'cloud-asr-test',requestId:randomUUID(),...extra});
async function fixture(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'nova-cloud-asr-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const store=new ServiceSettingsStore({filePath:path.join(dir,'settings.json'),encryption});await store.initialize();return{dir,store};}
async function audio(dir,bytes=Buffer.from([0x52,0x49,0x46,0x46,0,255,128,10])){const file=path.join(dir,'registered.wav');await fs.writeFile(file,bytes);return file;}
function transport(t,response={text:'实际识别结果'},status=200,headers={}){
 const calls=[];t.mock.method(dns,'lookup',async()=>[{address:'8.8.8.8',family:4}]);syncBuiltinESMExports();
 t.after(()=>{t.mock.restoreAll();syncBuiltinESMExports();});
 t.mock.method(https,'request',(url,options,receive)=>{
  const sent={url:url.href,options,parts:[]};calls.push(sent);const request=new PassThrough();request.on('data',b=>sent.parts.push(Buffer.from(b)));
  request.on('finish',()=>{sent.body=Buffer.concat(sent.parts);const result=Readable.from([Buffer.from(JSON.stringify(response))]);result.statusCode=status;result.headers=headers;receive(result);});return request;
 });return calls;
}
test('v1 legacy ASR normalizes without rewriting encrypted credentials or changing its provider',async t=>{
 const {store}=await fixture(t),legacy=defaultServiceSettings();delete legacy.asr.cloud;legacy.asr.mode='volc';
 const stored={version:1,values:legacy,keys:Object.fromEntries(['tikhub','model','asr'].map(name=>[name,Buffer.from(`encrypted:legacy-${name}`).toString('base64')]))};await fs.writeFile(store.filePath,JSON.stringify(stored));
 const reopened=new ServiceSettingsStore({filePath:store.filePath,encryption}),view=await reopened.initialize();
 assert.equal(view.values.asr.mode,'cloud');assert.deepEqual(view.values.asr.cloud,cloud());assert.equal(await fs.readFile(store.filePath,'utf8'),JSON.stringify(stored));
 await reopened.update({values:{...view.values,commentsEnabled:true}});const saved=JSON.parse(await fs.readFile(store.filePath,'utf8'));assert.deepEqual(saved.keys,stored.keys);for(const name of ['tikhub','model','asr'])assert.equal(reopened.secret(name),`legacy-${name}`);
});
test('cloud providers keep separate encrypted credentials and never copy a Volc key to Groq or custom',async t=>{
 const {store}=await fixture(t);await store.update({values:{...defaultServiceSettings(),asr:{...defaultServiceSettings().asr,mode:'cloud',cloud:cloud({provider:'groq',customBaseUrl:'https://custom.example/v1',customModelId:'custom-whisper'})}},keys:{asr:'volc-secret',groq:'groq-secret',custom:'custom-secret'}});
 for(const [name,key]of Object.entries({asr:'volc-secret',groq:'groq-secret',custom:'custom-secret'})){assert.equal(store.secret(name),key);assert.equal(store.read().credentials[name].hasKey,true);}
 assert.equal(JSON.stringify(store.read()).includes('groq-secret'),false);await store.update({keys:{groq:null}});assert.equal(store.secret('asr'),'volc-secret');assert.equal(store.secret('custom'),'custom-secret');assert.throws(()=>store.secret('groq'),{code:'SERVICE_KEY_MISSING'});
});
test('changing custom ASR endpoint requires an explicit new key or clear and rejected changes preserve disk bytes',async t=>{
 const {store}=await fixture(t),values={...defaultServiceSettings(),asr:{...defaultServiceSettings().asr,mode:'cloud',cloud:cloud({provider:'custom',customBaseUrl:'https://first.example/v1',customModelId:'whisper-1'})}};
 await store.update({values,keys:{custom:'first-only-key'}});const before=await fs.readFile(store.filePath,'utf8'),changed={...values,asr:{...values.asr,cloud:{...values.asr.cloud,customBaseUrl:'https://second.example/v1'}}};
 await assert.rejects(store.update({values:changed}),{code:'CUSTOM_ASR_KEY_REBIND_REQUIRED'});assert.equal(await fs.readFile(store.filePath,'utf8'),before);assert.equal(store.secret('custom'),'first-only-key');
 await store.update({values:changed,keys:{custom:'second-only-key'}});assert.equal(store.secret('custom'),'second-only-key');await store.update({values,keys:{custom:null}});assert.equal(store.read().credentials.custom.hasKey,false);
});
test('Groq presets upload exact binary multipart bytes to the transcription endpoint with only their own key',async t=>{
 const {store,dir}=await fixture(t),calls=transport(t),file=await audio(dir),bytes=await fs.readFile(file);
 for(const model of ['whisper-large-v3-turbo','whisper-large-v3']){
  await store.update({values:{...defaultServiceSettings(),asr:{...defaultServiceSettings().asr,mode:'cloud',cloud:cloud({provider:'groq',groqModel:model})},budget:{enabled:true,maxRequestsPerTask:2}},keys:{asr:'wrong-volc-key',groq:'groq-only-key'}});
  const result=await new ServiceTools({settings:store}).execute(input(file));assert.equal(result.data.text,'实际识别结果');assert.equal(result.requestsUsed,1);
  const sent=calls.at(-1);assert.equal(sent.url,'https://api.groq.com/openai/v1/audio/transcriptions');assert.equal(sent.options.headers.Authorization,'Bearer groq-only-key');assert.equal(sent.options.headers['Content-Length'],String(sent.body.byteLength));assert.equal(sent.options.agent,false);assert.equal(sent.options.rejectUnauthorized,true);
  const boundary=sent.options.headers['Content-Type'].match(/^multipart\/form-data; boundary=(.+)$/)[1],text=sent.body.toString('latin1');
  assert(text.includes(`name="model"\r\n\r\n${model}\r\n`));assert(text.includes('name="response_format"\r\n\r\njson\r\n'));assert(text.includes('name="file"; filename="audio.wav"'));assert(sent.body.includes(bytes));assert(text.endsWith(`\r\n--${boundary}--\r\n`));assert(!text.includes('wrong-volc-key'));
  const pinned=await new Promise((resolve,reject)=>sent.options.lookup('api.groq.com',{},(error,address,family)=>error?reject(error):resolve({address,family})));assert.deepEqual(pinned,{address:'8.8.8.8',family:4});
 }
 assert.equal(calls.length,2);
});
test('custom compatible ASR appends only audio/transcriptions and uses its bound key',async t=>{
 const {store,dir}=await fixture(t),calls=transport(t),file=await audio(dir);
 await store.update({values:{...defaultServiceSettings(),asr:{...defaultServiceSettings().asr,mode:'cloud',cloud:cloud({provider:'custom',customBaseUrl:'https://custom.example/v1/',customModelId:'whisper-1'})},budget:{enabled:true,maxRequestsPerTask:1}},keys:{asr:'wrong-volc',groq:'wrong-groq',custom:'custom-only'}});
 await new ServiceTools({settings:store}).execute(input(file));assert.equal(calls[0].url,'https://custom.example/v1/audio/transcriptions');assert.equal(calls[0].options.headers.Authorization,'Bearer custom-only');
});
test('Groq oversized audio, missing consent and disabled budget fail without any HTTP request or reservation',async t=>{
 const {store,dir}=await fixture(t),calls=transport(t),file=await audio(dir),values={...defaultServiceSettings(),asr:{...defaultServiceSettings().asr,mode:'cloud',cloud:cloud({provider:'groq'})},budget:{enabled:true,maxRequestsPerTask:1}};await store.update({values,keys:{groq:'groq-key'}});
 const tools=new ServiceTools({settings:store}),hooks={beforeExecute:()=>assert.fail('preflight failures must not reserve budget')};
 await assert.rejects(tools.execute(input(file,{allowCloud:false}),hooks),{code:'CLOUD_PERMISSION_REQUIRED'});
 await store.update({values:{...values,budget:{enabled:false,maxRequestsPerTask:1}}});await assert.rejects(tools.execute(input(file),hooks),{code:'BUDGET_DISABLED'});await store.update({values});
 await fs.truncate(file,25_000_001);await assert.rejects(tools.execute(input(file),hooks),{code:'INVALID_AUDIO'});assert.equal(calls.length,0);
});
test('binary HTTPS transport rejects bodies above its bound before DNS or network and never follows redirects',async t=>{
 const calls=transport(t,{redirect:'ignored'},302);await assert.rejects(boundedHttps('https://8.8.8.8',{body:Buffer.alloc(27*1024*1024)}),{code:'REQUEST_TOO_LARGE'});assert.equal(calls.length,0);
 await assert.rejects(boundedHttps('https://8.8.8.8',{method:'POST',body:Buffer.from([0,255,128])}),{code:'PROVIDER_REJECTED'});assert.equal(calls.length,1);assert.deepEqual(calls[0].body,Buffer.from([0,255,128]));
});
test('Groq supports official TUN aliases while custom ASR DNS remains public-only',async()=>{
 const resolver=async()=>[{address:'198.18.0.120',family:4},{address:'::ffff:0:c612:78',family:6}];assert.equal((await publicEndpoint('https://api.groq.com/openai/v1/audio/transcriptions',resolver)).family,4);
 await assert.rejects(publicEndpoint('https://custom.example/v1/audio/transcriptions',resolver),{code:'UNSAFE_ENDPOINT'});
});

test('selected cloud provider missing its key cannot borrow credentials or switch providers',async t=>{
 const {store,dir}=await fixture(t),calls=transport(t),file=await audio(dir);
 await store.update({values:{...defaultServiceSettings(),asr:{...defaultServiceSettings().asr,mode:'local-first',cloud:cloud({provider:'groq'})},budget:{enabled:true,maxRequestsPerTask:1}},keys:{asr:'volc-only-key'}});
 await assert.rejects(new ServiceTools({settings:store}).execute(input(file)),{code:'SERVICE_KEY_MISSING'});assert.equal(calls.length,0);assert.equal(store.read().values.asr.cloud.provider,'groq');
});
test('custom endpoint changes during reservation cannot receive either the old or replacement key',async t=>{
 const {store,dir}=await fixture(t),calls=transport(t),file=await audio(dir),values={...defaultServiceSettings(),asr:{...defaultServiceSettings().asr,mode:'cloud',cloud:cloud({provider:'custom',customBaseUrl:'https://first.example/v1',customModelId:'whisper-1'})},budget:{enabled:true,maxRequestsPerTask:1}};
 await store.update({values,keys:{custom:'first-only-key'}});let settlement;
 await assert.rejects(new ServiceTools({settings:store}).execute(input(file),{beforeExecute:()=>store.update({values:{...values,asr:{...values.asr,cloud:{...values.asr.cloud,customBaseUrl:'https://second.example/v1'}}},keys:{custom:'second-only-key'}}),afterExecute:async outcome=>{settlement=outcome;}}),{code:'SERVICE_CONFIG_CHANGED',requestsUsed:0});
 assert.equal(calls.length,0);assert.equal(settlement.requestsUsed,0);
});
test('custom ASR validates URL, model and header-safe key; mixed private DNS never uploads audio',async t=>{
 const {store,dir}=await fixture(t),calls=transport(t),file=await audio(dir),values={...defaultServiceSettings(),asr:{...defaultServiceSettings().asr,mode:'cloud',cloud:cloud({provider:'custom',customBaseUrl:'https://custom.example/v1',customModelId:'whisper-1'})},budget:{enabled:true,maxRequestsPerTask:1}};
 for(const url of ['http://custom.example/v1','https://user:password@custom.example/v1','https://custom.example/v1?key=x','https://custom.example/v1#secret','https://custom.example:8443/v1','https://localhost/v1','https://cus\ntom.example/v1'])assert.equal(serviceSettingsValues({...values,asr:{...values.asr,cloud:{...values.asr.cloud,customBaseUrl:url}}}),false,url);
 for(const model of ['', 'model\r\nX-Secret: injected','../audio'])assert.equal(serviceSettingsValues({...values,asr:{...values.asr,cloud:{...values.asr.cloud,customModelId:model}}}),false,model);
 await assert.rejects(store.update({values,keys:{custom:'key\r\nX-Secret: bad'}}),{code:'INVALID_INPUT'});
 await store.update({values,keys:{custom:'custom-key'}});dns.lookup=async()=>[{address:'8.8.8.8',family:4},{address:'127.0.0.1',family:4}];syncBuiltinESMExports();
 await assert.rejects(new ServiceTools({settings:store}).execute(input(file)),{code:'UNSAFE_ENDPOINT',requestsUsed:0});assert.equal(calls.length,0);
});
test('Groq free-tier maximum accepts 25 MB of binary audio without base64 expansion',async t=>{
 const {store,dir}=await fixture(t),calls=transport(t),file=await audio(dir);await fs.truncate(file,25_000_000);
 await store.update({values:{...defaultServiceSettings(),asr:{...defaultServiceSettings().asr,mode:'cloud',cloud:cloud({provider:'groq'})},budget:{enabled:true,maxRequestsPerTask:1}},keys:{groq:'groq-only'}});
 await new ServiceTools({settings:store}).execute(input(file));assert(calls[0].body.byteLength>25_000_000);assert(calls[0].body.byteLength<25_002_000);
});
test('Volc flash keeps its own JSON transport and rejects standard 2.0 resource IDs',async t=>{
 const {store,dir}=await fixture(t),calls=transport(t,{result:{text:'火山识别'}},200,{'x-api-status-code':'20000000'}),file=await audio(dir),values={...defaultServiceSettings(),asr:{...defaultServiceSettings().asr,mode:'cloud',cloud:cloud()},budget:{enabled:true,maxRequestsPerTask:1}};
 await store.update({values,keys:{asr:'volc-only'}});await new ServiceTools({settings:store}).execute(input(file));
 assert.equal(calls[0].url,'https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash');assert.equal(calls[0].options.headers['X-Api-Key'],'volc-only');assert.equal(JSON.parse(calls[0].body.toString()).audio.data,(await fs.readFile(file)).toString('base64'));
 await store.update({values:{...values,asr:{...values.asr,resourceId:'volc.seedasr.auc'}}});await assert.rejects(new ServiceTools({settings:store}).execute(input(file)),{code:'ASR_RESOURCE_UNSUPPORTED',requestsUsed:0});assert.equal(calls.length,1);
});
test('provider rejection does not retry or switch away from the selected Groq preset',async t=>{
 const {store,dir}=await fixture(t),calls=transport(t,{error:{code:'rate_limit_exceeded'}},429),file=await audio(dir);
 await store.update({values:{...defaultServiceSettings(),asr:{...defaultServiceSettings().asr,mode:'cloud',cloud:cloud({provider:'groq'})},budget:{enabled:true,maxRequestsPerTask:1}},keys:{groq:'groq-only',asr:'unused-volc'}});
 await assert.rejects(new ServiceTools({settings:store}).execute(input(file)),{code:'PROVIDER_REJECTED'});assert.equal(calls.length,1);assert.equal(calls[0].options.headers.Authorization,'Bearer groq-only');assert.equal(store.read().values.asr.cloud.provider,'groq');
});

test('switching an incomplete custom draft to local-only saves local paths and retains unrelated edits',async t=>{
 const {localOnlyServiceDraft}=await import('../src/renderer/service-settings-draft.ts');const {store}=await fixture(t),saved=store.read().values;
 const draft={...saved,asr:{...saved.asr,mode:'cloud',localExecutable:'/saved/python',localModelPath:'/saved/model',cloud:cloud({provider:'custom'})}};
 const patch=localOnlyServiceDraft(draft,saved,{groq:'discard-unsaved-cloud-key',custom:'discard-custom-key',tikhub:'keep-collection-key'});
 await store.update(patch);const view=store.read();assert.equal(view.values.asr.mode,'local-only');assert.equal(view.values.asr.localExecutable,'/saved/python');assert.equal(view.values.asr.cloud.provider,'volc');assert.equal(store.secret('tikhub'),'keep-collection-key');assert.equal(view.credentials.custom.hasKey,false);assert.equal(view.credentials.groq.hasKey,false);
});

test('switching a custom endpoint rebind draft to local-only preserves the saved endpoint and its encrypted key',async t=>{
 const {localOnlyServiceDraft}=await import('../src/renderer/service-settings-draft.ts');const {store}=await fixture(t),values={...defaultServiceSettings(),asr:{...defaultServiceSettings().asr,mode:'cloud',cloud:cloud({provider:'custom',customBaseUrl:'https://saved.example/v1',customModelId:'whisper-1'})}};
 await store.update({values,keys:{custom:'saved-custom-key'}});const saved=store.read().values,before=JSON.parse(await fs.readFile(store.filePath,'utf8')).keys.custom;
 const draft={...saved,asr:{...saved.asr,cloud:{...saved.asr.cloud,customBaseUrl:'https://unsaved.example/v1'}}};
 await store.update(localOnlyServiceDraft(draft,saved,{custom:'unsaved-new-key'}));const view=store.read();assert.equal(view.values.asr.mode,'local-only');assert.equal(view.values.asr.cloud.customBaseUrl,'https://saved.example/v1');assert.equal(store.secret('custom'),'saved-custom-key');assert.equal(JSON.parse(await fs.readFile(store.filePath,'utf8')).keys.custom,before);
});
