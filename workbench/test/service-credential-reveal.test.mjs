import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {defaultServiceSettings} from '../src/shared/service-validation.ts';
import {ServiceSettingsStore} from '../src/main/service-settings.mts';
import {DesktopController} from '../src/main/controller.mts';
import {BindingStore} from '../src/main/bindings.mts';
import {CHANNELS,assertCaller,PAGE} from '../src/main/boundary.mts';
import {validateInput} from '../src/shared/validation.ts';
const names=['tikhub','model','asr','groq','custom'];
test('saved credential disclosure is finite, explicit, read-only and excluded from settings reads',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'nova-credential-reveal-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 let decryptions=0;const encryption={isEncryptionAvailable:()=>true,encryptString:v=>Buffer.from(`encrypted:${v}`),decryptString:v=>{decryptions++;return v.toString().replace(/^encrypted:/,'');}};
 const store=new ServiceSettingsStore({filePath:path.join(dir,'settings.json'),encryption});await store.initialize();
 await store.update({values:{...defaultServiceSettings(),asr:{...defaultServiceSettings().asr,cloud:{provider:'volc',groqModel:'whisper-large-v3-turbo',customBaseUrl:'https://custom.example/v1',customModelId:'whisper-1'}}},keys:Object.fromEntries(names.map(name=>[name,`fake-${name}-credential`]))});
 const before=await fs.readFile(store.filePath,'utf8');assert.equal(decryptions,0);const view=store.read();assert.equal(decryptions,0);
 for(const name of names){assert.equal(view.credentials[name].hasKey,true);assert(!JSON.stringify(view).includes(`fake-${name}-credential`));assert.deepEqual(store.reveal(name),{service:name,key:`fake-${name}-credential`});}
 assert.equal(decryptions,names.length);assert.equal(await fs.readFile(store.filePath,'utf8'),before,'reveal cannot alter budget, values or stored ciphertext');
 for(const input of ['',undefined,'__proto__','constructor','/tmp/key','model.key',{},['model']])assert.throws(()=>store.reveal(input),{code:'INVALID_INPUT'});
 assert.equal(decryptions,names.length,'invalid services must fail before decrypting');
 const controller=new DesktopController({store:new BindingStore(path.join(dir,'binding.json')),worker:{call:async()=>{throw Error('No library operation permitted');}},documents:dir,dialogs:{destination:async()=>null},authMode:'disabled'});
 controller.services={productionServices:{readServiceSettings:()=>store.read(),saveServiceSettings:input=>store.update(input),checkServiceReadiness:async()=>({localAsr:{available:false,reason:'test'},encryptionAvailable:true}),revealServiceCredential:input=>store.reveal(input.service)}};
 assert(CHANNELS.includes('revealServiceCredential'));
 for(const name of names){validateInput('revealServiceCredential',{service:name});assert.deepEqual(await controller.revealServiceCredential({service:name}),{service:name,key:`fake-${name}-credential`});}
 for(const input of [undefined,'model',{service:'other'},{service:'model',path:'/tmp/key'},{service:'model',confirmed:true},{service:['model']}])assert.throws(()=>validateInput('revealServiceCredential',input),{code:'INVALID_INPUT'});
 await store.update({keys:{asr:null}});assert.throws(()=>store.reveal('asr'),{code:'SERVICE_KEY_MISSING'});
 encryption.isEncryptionAvailable=()=>false;const count=decryptions;assert.throws(()=>store.reveal('model'),{code:'ENCRYPTION_UNAVAILABLE'});assert.equal(decryptions,count);
});
test('credential reveal keeps the existing trusted renderer boundary',()=>{
 const webContents={mainFrame:{url:PAGE},isDestroyed:()=>false};
 assert.doesNotThrow(()=>assertCaller({sender:webContents,senderFrame:webContents.mainFrame},webContents,[{service:'model'}],'revealServiceCredential'));
 assert.throws(()=>assertCaller({sender:{},senderFrame:webContents.mainFrame},webContents,[{service:'model'}],'revealServiceCredential'),{code:'FORBIDDEN'});
 assert.throws(()=>assertCaller({sender:webContents,senderFrame:{url:'https://example.invalid/'}},webContents,[{service:'model'}],'revealServiceCredential'),{code:'FORBIDDEN'});
});
