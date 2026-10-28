import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import {DesktopController} from '../src/main/controller.mts';
import {BindingStore,emptyBinding,validateBinding} from '../src/main/bindings.mts';
import {execute} from '../src/main/worker.mts';
import {createVault} from '../../plugin-src/src/lib/vault/index.mjs';
import {scan,json} from '../../plugin-src/src/lib/vault/core.mjs';
const api = await import('../../plugin-src/src/lib/final-assets/index.mjs').catch(error => {if(error.code==='ERR_MODULE_NOT_FOUND')return {};throw error;});
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64');
async function fixture(t){
 const parent=await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()),'final-desktop-'));t.after(()=>fs.rm(parent,{recursive:true,force:true}));
 const root=path.join(parent,'知识库');await fs.mkdir(root);const binding=createVault(root),vaultId=json(root,'.workbench/vault.json').vaultId;
 const relative='05_内容草稿/T044_桌面/创作页.html',filename=path.join(root,relative);
 const raw={schema:1,page_id:'desktop-final-page',content_id:'T044',items:[{id:'info',kind:'info',locked:{},fields:{recorded:'已录完的稿'}},{id:'seg',kind:'segment',locked:{order:1},fields:{mine:'当前确认稿'}},...['标题','封面文字','简介'].map((slot,i)=>({id:'pub-'+i,kind:'pubslot',locked:{slot},fields:{final:['采用标题','封面字','完整简介'][i]}}))]};
 await fs.mkdir(path.dirname(filename),{recursive:true});await fs.writeFile(filename,'<script id="jc-doc" type="application/json">'+JSON.stringify(raw)+'</script>');
 const doc=scan(root,vaultId).documents.find(d=>d.relativePath===relative),contentId=doc.contentId;
 const h={readSelectedCoverSnapshot:()=>({contentId,candidateId:randomUUID(),selectedAt:'2026-10-28T00:00:00.000Z',assetHash:digest(png),mime:'image/png',width:1,height:1,bytes:png,decoded:true,provenance:{kind:'legacy',unknown:true}})};
 // Fixed trusted fixture identity; preview/save must see the same selected cover.
 const cover=h.readSelectedCoverSnapshot();h.readSelectedCoverSnapshot=()=>({...cover,bytes:Buffer.from(cover.bytes)});
 const store=new BindingStore(path.join(parent,'binding.json'));await store.save({...emptyBinding(),current:binding});
 let lose=false,finalReads=0;
 const worker={call:async(op,args)=>{
  if(op==='finalPreview')return api.previewFinalAssets(args.binding.root,args.input,h);
  if(op==='vaultMutate'&&args.pending.method==='saveFinalAssets'){
   const result=api.saveFinalAssets(args.binding.root,args.pending.input,{mutationId:args.pending.mutationId},h);
   if(lose){lose=false;throw Object.assign(Error('lost response'),{code:'WORKER_EXIT'});}return result;
  }
  if(op==='finalRead')finalReads++;
  return execute(op,args,'disabled');
 }};
 const reveals=[],make=()=>new DesktopController({store,worker,documents:parent,authMode:'disabled',dialogs:{destination:async()=>null,maintenanceParent:async()=>parent},revealFolder:where=>reveals.push(where)});
 const c=make();c.covers.seed=async()=>{};await c.initialize();
 assert.equal(typeof c.previewFinalAssets,'function','desktop must expose finite final-asset operations');
 const selection={contentId,manuscript:{kind:'recorded',documentId:doc.id}};
 const preview=await c.previewFinalAssets(selection);
 const input={...selection,expectedPreviewToken:preview.previewToken,expectedCurrentHash:preview.currentHash,acknowledgedWarnings:preview.warnings};
 return {c,make,selection,preview,input,root,parent,binding,store,png,filename,reveals,lose(){lose=true;},get finalReads(){return finalReads;}};
}
test('final save retains durable exact selection through response loss, restart and committed recovery',async t=>{
 const f=await fixture(t);assert.equal(f.preview.texts.script,'已录完的稿');assert.match(f.preview.cover.url,/^nova-content:\/\/assets\//);
 f.lose();await assert.rejects(f.c.saveFinalAssets(f.input),{code:'WORKER_EXIT'});
 const pending=(await f.store.load()).vaultPending;validateBinding(await f.store.load());assert.equal(pending.method,'saveFinalAssets');assert.deepEqual(pending.input,f.input);
 await assert.rejects(f.c.createLibrary(),{code:'PENDING_MUTATION'});
 const next=f.make();await next.initialize();const recovered=await next.recoverVaultMutation({action:'retry'});
 assert.equal(recovered.method,'saveFinalAssets');assert.equal(recovered.current,null);assert.equal(recovered.result.selected.texts.script,'已录完的稿');assert.equal((await f.store.load()).vaultPending??null,null);
 const view=await next.readFinalAssets({contentId:f.selection.contentId});assert.equal(view.selected.manifest.adoption.mutationId,pending.mutationId);assert.equal(view.bundles.length,1);assert.match(view.selected.cover.url,/^nova-content:\/\/assets\//);
});
test('saved cover and exported version read verified bundle bytes after live source disappears',async t=>{
 const f=await fixture(t),saved=await f.c.saveFinalAssets(f.input),ref={contentId:f.selection.contentId,bundleId:saved.selected.bundleId,manifestHash:saved.selected.manifestHash};
 await fs.unlink(f.filename);const view=await f.c.readFinalAssets({contentId:ref.contentId,bundleId:ref.bundleId});
 const image=await f.c.finalAssets.resource(view.selected.cover.url);assert.deepEqual(Buffer.from(image.data),f.png);
 const output=await f.c.exportFinalAssets(ref);assert.ok(output);assert.equal(output.cancelled,false);
 const files=await fs.readdir(output.directory);assert.equal(files.length,8);for(const entry of saved.selected.manifest.files)assert.equal(digest(await fs.readFile(path.join(output.directory,entry.name))),entry.sha256);
 assert.equal(digest(await fs.readFile(path.join(output.directory,'manifest.json'))),ref.manifestHash);
 const again=await f.c.exportFinalAssets(ref);assert.notEqual(again.directory,output.directory);assert.deepEqual(await fs.readdir(output.directory),files);
});
test('export cancel is inert and the whole Vault including realpath aliases is excluded',async t=>{
 const f=await fixture(t),saved=await f.c.saveFinalAssets(f.input),ref={contentId:f.selection.contentId,bundleId:saved.selected.bundleId,manifestHash:saved.selected.manifestHash};
 const before=await fs.readdir(f.parent);f.c.dialogs.maintenanceParent=async()=>null;assert.deepEqual(await f.c.exportFinalAssets(ref),{cancelled:true});assert.deepEqual(await fs.readdir(f.parent),before);
 for(const parent of [f.root,path.dirname(f.filename)]){f.c.dialogs.maintenanceParent=async()=>parent;await assert.rejects(f.c.exportFinalAssets(ref),{code:'INVALID_DESTINATION'});}
 if(process.platform!=='win32'){const alias=path.join(f.parent,'alias');await fs.symlink(path.dirname(f.filename),alias);f.c.dialogs.maintenanceParent=async()=>alias;await assert.rejects(f.c.exportFinalAssets(ref),{code:'INVALID_DESTINATION'});}
});
test('saved-image grant captures binding and rejects asynchronous cross-library completion',async t=>{
 const f=await fixture(t),saved=await f.c.saveFinalAssets(f.input),url=saved.selected.cover.url;
 assert.equal(f.c.finalAssets.allows(url),true);
 const original=f.c.worker;let release;f.c.worker={call:(op,args)=>op==='finalAssetRaster'?new Promise(resolve=>{release=()=>original.call(op,args).then(resolve);}):original.call(op,args)};
 const resource=f.c.finalAssets.resource(url);const other=path.join(f.parent,'other');await fs.mkdir(other);const next=createVault(other);
 await f.c.persist({...f.c.binding,current:next});await release();assert.equal(await resource,null);assert.equal(f.c.finalAssets.allows(url),false);
});
test('worker final assets reject renderer paths and mutation spoofing before any read',async()=>{
 const binding={root:'/not-a-real-library',libraryId:randomUUID(),rootIdentity:{dev:'1',ino:'2'}},contentId=randomUUID();
 for(const op of ['finalRead','finalPreview','finalExport','finalAssetRaster'])await assert.rejects(execute(op,{binding,input:{contentId,path:'/tmp/evil'}},'disabled'),{code:'INVALID_INPUT'});
});
for(const failure of ['preexisting-stage','replaced-stage'])test('failed export preserves '+failure+' and its external contents',async t=>{
 const f=await fixture(t),saved=await f.c.saveFinalAssets(f.input),ref={contentId:f.selection.contentId,bundleId:saved.selected.bundleId,manifestHash:saved.selected.manifestHash};
 const mkdir=fs.mkdir,open=fs.open;let foreign;
 if(failure==='preexisting-stage')t.mock.method(fs,'mkdir',async function(directory,options){if(path.basename(String(directory)).startsWith('.最终资产准备-')){await mkdir(directory,options);foreign=path.join(directory,'external.txt');await fs.writeFile(foreign,'keep');throw Object.assign(Error('already exists'),{code:'EEXIST'});}return mkdir(directory,options);});
 else t.mock.method(fs,'open',async function(filename,...args){if(String(filename).includes('.最终资产准备-')){const stage=path.dirname(filename);await fs.rename(stage,stage+'-original');await mkdir(stage);foreign=path.join(stage,'external.txt');await fs.writeFile(foreign,'keep');throw Object.assign(Error('replacement'),{code:'EIO'});}return open(filename,...args);});
 await assert.rejects(f.c.exportFinalAssets(ref));t.mock.restoreAll();assert.equal(await fs.readFile(foreign,'utf8'),'keep');
});
test('native pre-persist save rejection preserves review and permits retry without a phantom recovery',async t=>{
 const {FinalAssetsDraft}=await import('../src/renderer/final-assets-state.ts');const f=await fixture(t),state=new FinalAssetsDraft(f.selection.contentId);
 state.select(f.selection);await state.readPreview(async()=>{},async()=>f.preview);for(const code of f.preview.warnings)state.acknowledge(code,true);
 f.c.authMode='required';await assert.rejects(state.save(async()=>{},input=>f.c.saveFinalAssets(input),()=>f.c.status()),{code:'AUTH_NOT_CONFIGURED'});
 assert.equal(state.pending,false);assert.equal(state.preview,f.preview);assert.deepEqual(state.selection,f.selection);assert.equal((await f.store.load()).vaultPending??null,null);
 f.c.authMode='disabled';const saved=await state.save(async()=>{},input=>f.c.saveFinalAssets(input),()=>f.c.status());assert.ok(saved.selected);assert.equal(state.pending,false);
});
test('default cover helper flows through real finalPreview worker and durable vaultMutate with no injected dependency',async t=>{
 const f=await fixture(t);const {openLibrary}=await import('../../plugin-src/src/lib/file-library/index.mjs');
 await execute('vaultRead',{binding:f.binding},'disabled');const library=openLibrary(f.binding.root);
 const image=path.join(f.parent,'fixture.png');await fs.writeFile(image,f.png);const asset=library.importAsset(image,{purpose:'template-reference'});
 const created=library.registerContentCandidate(f.selection.contentId,{assetHash:asset.assetHash,requestId:'explicit-fixture-import',attemptId:'explicit-local-import',source:'fixture-not-model',originalName:'fixture.png'},library.readContent(f.selection.contentId).editToken,{mutationId:randomUUID()});
 library.selectContentCover(f.selection.contentId,created.candidates.at(-1).id,created.editToken,{mutationId:randomUUID()});
 f.c.worker={call:(op,args)=>execute(op,args,'disabled')};
 const p=await f.c.previewFinalAssets(f.selection);assert.equal(p.cover.assetHash,digest(f.png));assert.equal(p.texts.script,'已录完的稿');
 const saved=await f.c.saveFinalAssets({...f.selection,expectedPreviewToken:p.previewToken,expectedCurrentHash:p.currentHash,acknowledgedWarnings:p.warnings});assert.ok(saved.selected);assert.equal(saved.selected.cover.assetHash,digest(f.png));
 const raster=await f.c.finalAssets.resource(saved.selected.cover.url);assert.deepEqual(Buffer.from(raster.data),f.png);
});
test('saved thumbnail uses the readonly resource worker while the primary worker is occupied',async t=>{
 const f=await fixture(t),saved=await f.c.saveFinalAssets(f.input);let reads=0;
 f.c.finalAssets.reader={call:async(op,args)=>{assert.equal(op,'finalAssetRaster');reads++;return execute(op,args,'disabled');}};
 f.c.worker={call:async()=>{throw Object.assign(Error('primary occupied'),{code:'BUSY'});}};
 const image=await f.c.finalAssets.resource(saved.selected.cover.url);assert.equal(reads,1);assert.deepEqual(Buffer.from(image.data),f.png);
});
test('a real second-process Vault lock is retried for an already granted saved thumbnail and succeeds after release',async t=>{
 const {spawn}=await import('node:child_process'),{EventEmitter}=await import('node:events'),{WorkerClient}=await import('../src/main/worker-client.mts');
 const f=await fixture(t),saved=await f.c.saveFinalAssets(f.input);
 const child=spawn(process.execPath,['--input-type=module','-e',`import {withVaultReadLock} from ${JSON.stringify(new URL('../../plugin-src/src/lib/vault/core.mjs',import.meta.url).href)};withVaultReadLock(process.argv[1],()=>{process.send('locked');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,260);});`,f.root],{stdio:['ignore','ignore','pipe','ipc']});
 t.after(()=>child.kill());await new Promise((resolve,reject)=>{child.once('message',resolve);child.once('error',reject);child.once('exit',code=>{if(code)reject(Error('lock holder failed '+code));});});
 let calls=0;const client=new WorkerClient(()=>{const transport=new EventEmitter();transport.postMessage=request=>{calls++;void execute(request.op,request.args,'disabled').then(value=>transport.emit('message',{id:request.id,ok:true,value}),error=>transport.emit('message',{id:request.id,ok:false,error:{code:error.code}}));};transport.kill=()=>transport.emit('exit');return transport;});t.after(()=>client.stop());f.c.finalAssets.reader=client;
 const image=await f.c.finalAssets.resource(saved.selected.cover.url);assert.deepEqual(Buffer.from(image.data),f.png);assert.ok(calls>=2,'real Vault lock contention must retry the saved image instead of returning a permanent 404');
});
