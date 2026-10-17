import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { createLibrary, openLibrary, backupLibrary, restoreBackup, __testing } from '../index.mjs';

process.env.NODE_ENV = 'test';
const moduleURL = new URL('../index.mjs',import.meta.url).href;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => Buffer.from(`${JSON.stringify(value,null,2)}\n`);
const source = {source:'browser',originalId:'old-photo',note:'Original external URL is evidence only'};
const input = {title:'Missing photo',isOwnPhoto:true,originalName:'portrait.gif',source,reason:'external-url'};
const rejects = (code,fn) => assert.throws(fn,error=>error.code===code);
function fixture(t) {
  const parent = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'nova-photo2-')), root = path.join(parent,'library');
  t.after(()=>{__testing.setHook(undefined);fs.rmSync(parent,{recursive:true,force:true});});
  return {parent,root,lib:createLibrary(root)};
}
async function asset(f, animated = false) {
  const bytes = animated
    ? await sharp(Buffer.from([255,0,0,255,0,255,0,255]),{raw:{width:1,height:2,channels:4,pageHeight:1}}).gif({delay:[100,200]}).toBuffer()
    : await sharp({create:{width:8,height:6,channels:3,background:'red'}}).png().toBuffer();
  const filename = path.join(f.parent,'image'); fs.writeFileSync(filename,bytes);
  return {...f.lib.importAsset(filename,{purpose:'photo'}),data:bytes};
}
const filename = (f,id) => path.join(f.root,'我的照片',id,'照片.json');
const journal = (f,mutationId,pending=false) => path.join(f.root,'系统（别动）','事务',pending?'待恢复':'已提交',mutationId);
function schema4Backup(f,destination) {
  const base = path.join(f.parent,'old'); fs.mkdirSync(base);
  for (const dir of ['file-library','image-validation']) fs.mkdirSync(path.join(base,dir));
  for (const file of ['file-library/index.mjs','file-library/cover-jobs.mjs','file-library/backup.mjs','image-validation/index.mjs']) {
    const result = spawnSync('git',['show',`df55c5f:${file}`],{cwd:new URL('../..',import.meta.url),encoding:'utf8'});
    assert.equal(result.status,0,result.stderr); fs.writeFileSync(path.join(base,file),result.stdout);
  }
  const script = `import {backupLibrary} from ${JSON.stringify(pathToFileURL(path.join(base,'file-library/index.mjs')).href)};backupLibrary(process.env.TASK_ROOT,process.env.TASK_BACKUP);`;
  const result = spawnSync(process.execPath,['--input-type=module','-e',script],{env:{...process.env,TASK_ROOT:f.root,TASK_BACKUP:destination},encoding:'utf8',timeout:15000});
  assert.equal(result.status,0,result.stderr);
}

test('unavailable photo is a real editable/trashable/restorable photo with explicit finite source', t => {
  const f = fixture(t);
  for (const patch of [{isOwnPhoto:undefined},{source:null},{source:{source:'browser',path:'/tmp/arbitrary'}},{reason:''},{assetHash:null}]) rejects('INVALID_INPUT',()=>f.lib.createUnavailablePhoto({...input,...patch}));
  let p = f.lib.createUnavailablePhoto(input);
  assert.equal(p.schemaVersion,2); assert.equal(p.availability,'unavailable'); assert.equal(p.assetHash,null);
  assert.deepEqual(f.lib.readPhoto(p.id).source,source); assert.equal(f.lib.listPhotos()[0].id,p.id);
  p = f.lib.updatePhoto(p.id,{title:'Edited',isOwnPhoto:false},p.editToken);
  p = f.lib.trashPhoto(p.id,p.editToken);
  assert.equal(f.lib.listPhotos().length,0); assert.equal(f.lib.listPhotoTrash()[0].assetHash,null);
  p = f.lib.restorePhoto(p.id,p.editToken);
  assert.equal(p.title,'Edited'); assert.equal(p.isOwnPhoto,false); assert.equal(p.availability,'unavailable');
});

test('resolution fully decodes original animated bytes and retains identity, source and declaration', async t => {
  const f = fixture(t), a = await asset(f,true), p = f.lib.createUnavailablePhoto({...input,isOwnPhoto:false});
  const result = await f.lib.resolvePhoto(p.id,{assetHash:a.assetHash},p.editToken);
  assert.equal(result.id,p.id); assert.equal(result.isOwnPhoto,false); assert.equal(result.assetHash,digest(a.data));
  assert.equal(result.availability,'available'); assert.equal(result.reason,p.reason); assert.deepEqual(result.source,source);
  assert.deepEqual(f.lib.readAsset(a.assetHash).data,a.data); assert.equal(f.lib.readLibrarySettings().defaults.photoId,null);
  rejects('INVALID_INPUT',()=>f.lib.updatePhoto(p.id,{assetHash:a.assetHash},result.editToken));
});

test('a trashed photo resolves in place and mutation replay preserves the original historical result', async t => {
  const f = fixture(t), a = await asset(f);
  let p = f.lib.createUnavailablePhoto(input); p = f.lib.trashPhoto(p.id,p.editToken);
  const mutationId = randomUUID(), token = p.editToken;
  const resolved = await f.lib.resolvePhoto(p.id,{assetHash:a.assetHash},token,{mutationId});
  assert.equal(resolved.deletedAt,p.deletedAt); assert.equal(f.lib.listPhotos().length,0);
  f.lib.restorePhoto(p.id,resolved.editToken);
  assert.deepEqual(await f.lib.resolvePhoto(p.id,{assetHash:a.assetHash},token,{mutationId}),resolved);
  assert.deepEqual(f.lib.queryMutation(mutationId).content,resolved);
  assert.equal(f.lib.readPhoto(p.id).deletedAt,null);
});

test('header-only assets and stale concurrent edits cannot make a photo available', async t => {
  const f = fixture(t), p = f.lib.createUnavailablePhoto(input), file = path.join(f.parent,'fake.png');
  fs.writeFileSync(file,Buffer.from([137,80,78,71,13,10,26,10]));
  const bad = f.lib.importAsset(file,{purpose:'photo'});
  await assert.rejects(()=>f.lib.resolvePhoto(p.id,{assetHash:bad.assetHash},p.editToken),e=>e.code==='INVALID_IMAGE');
  assert.equal(f.lib.readPhoto(p.id).availability,'unavailable');
  const a = await asset(f), pending = f.lib.resolvePhoto(p.id,{assetHash:a.assetHash},p.editToken);
  const updated = f.lib.updatePhoto(p.id,{title:'Concurrent edit'},p.editToken);
  await assert.rejects(()=>pending,e=>e.code==='CONFLICT');
  assert.equal(f.lib.readPhoto(p.id).title,updated.title); assert.equal(f.lib.readPhoto(p.id).availability,'unavailable');
});

test('unavailable defaults and cover choices fail explicitly; restored references report unavailable', async t => {
  const f = fixture(t), a = await asset(f), p = f.lib.createUnavailablePhoto(input);
  let settings = f.lib.readLibrarySettings();
  assert.throws(()=>f.lib.setGenerationDefaults({photoId:p.id},settings.editToken),e=>e.code==='INVALID_INPUT' && /unavailable/i.test(e.message));
  settings = f.lib.restoreGenerationDefaultReferences({photoId:p.id,templateId:null,source:{source:'backup'}},settings.editToken);
  assert.equal(f.lib.readLibrarySettings().defaultIssues[0].reason,'unavailable');
  const template = f.lib.createTemplate({name:'Style',definition:{},resources:{sample:{assetHash:a.assetHash,bytes:a.bytes,detectedType:a.detectedType,role:'style'}}});
  const c = f.lib.createContent({title:'Content',body:''});
  assert.throws(()=>f.lib.createCoverRequest(c.id,{template:{id:template.id,version:1},styleAssetHashes:[a.assetHash],photo:{id:p.id,assetHash:null},materialIds:[],prompt:'cover',pixels:{width:8,height:6},ratio:'4:3',count:1,outputFormat:'png',scope:'cover-only'},c.editToken),e=>e.code==='INVALID_INPUT' && /unavailable/i.test(e.message));
});

test('schema1 read projection preserves exact metadata and historical transaction bytes', async t => {
  const f = fixture(t), a = await asset(f), p = f.lib.createPhoto({title:'Legacy',assetHash:a.assetHash,isOwnPhoto:true});
  const metadata = fs.readFileSync(filename(f,p.id)), intent = fs.readFileSync(path.join(journal(f,p.mutationId),'intent.json'));
  assert.equal(f.lib.readPhoto(p.id).availability,'available'); assert.equal(f.lib.listPhotos()[0].schemaVersion,1);
  assert.deepEqual(fs.readFileSync(filename(f,p.id)),metadata); assert.deepEqual(fs.readFileSync(path.join(journal(f,p.mutationId),'intent.json')),intent);
  assert.deepEqual(f.lib.queryMutation(p.mutationId).content,p);
  const deleted = f.lib.trashPhoto(p.id,p.editToken);
  assert.equal(JSON.parse(fs.readFileSync(filename(f,p.id))).availability,undefined);
  assert.equal(deleted.schemaVersion,1);
});

test('backup restores unavailable and resolved trashed photos with exact history and original assets', async t => {
  const f = fixture(t), a = await asset(f,true), unavailable = f.lib.createUnavailablePhoto(input);
  let resolved = f.lib.createUnavailablePhoto({...input,title:'Resolved'}); resolved = f.lib.trashPhoto(resolved.id,resolved.editToken);
  resolved = await f.lib.resolvePhoto(resolved.id,{assetHash:a.assetHash},resolved.editToken);
  const history = fs.readFileSync(path.join(journal(f,resolved.mutationId),'intent.json'));
  const backup = path.join(f.parent,'backup'), restored = path.join(f.parent,'restored');
  backupLibrary(f.root,backup); restoreBackup(backup,restored);
  const lib = openLibrary(restored);
  assert.equal(lib.readPhoto(unavailable.id).availability,'unavailable'); assert.equal(lib.listPhotoTrash()[0].assetHash,a.assetHash);
  assert.deepEqual(lib.readAsset(a.assetHash).data,a.data); assert.deepEqual(fs.readFileSync(path.join(restored,'系统（别动）','事务','已提交',resolved.mutationId,'intent.json')),history);
});

test('resolve journal recovers after process death without reviving a trashed photo', async t => {
  const f = fixture(t), a = await asset(f); let p = f.lib.createUnavailablePhoto(input); p = f.lib.trashPhoto(p.id,p.editToken);
  const mutationId = randomUUID();
  const script = `import {openLibrary,__testing} from ${JSON.stringify(moduleURL)};const d=JSON.parse(process.env.TASK_DATA);const lib=openLibrary(d.root);__testing.setHook(e=>{if(e.phase==='afterJournal')process.kill(process.pid,'SIGKILL')});await lib.resolvePhoto(d.id,{assetHash:d.assetHash},d.token,{mutationId:d.mutationId});`;
  const result = spawnSync(process.execPath,['--input-type=module','-e',script],{env:{...process.env,TASK_DATA:JSON.stringify({root:f.root,id:p.id,token:p.editToken,assetHash:a.assetHash,mutationId})},encoding:'utf8',timeout:15000});
  assert.equal(result.signal,'SIGKILL',result.stderr);
  const recovered = openLibrary(f.root); assert.equal(recovered.readPhoto(p.id).availability,'available');
  assert.equal(recovered.readPhoto(p.id).deletedAt,p.deletedAt); assert.equal(recovered.queryMutation(mutationId).status,'committed');
});

for (const location of ['metadata','history','pending','history-before','pending-before']) test(`schema4 restore rejects photo2 ${location} before publishing a descriptor`, async t => {
  const f = fixture(t), a = await asset(f), created = f.lib.createUnavailablePhoto(input);
  const p = location.endsWith('-before') ? f.lib.updatePhoto(created.id,{title:'Updated'},created.editToken) : created;
  // A schema4 envelope must not smuggle newer photo metadata through a legacy journal.
  const desc = path.join(f.root,'内容库.json'), info = JSON.parse(fs.readFileSync(desc)); fs.writeFileSync(desc,json({...info,schemaVersion:4}));
  fs.rmSync(path.join(f.root,'库配置'),{recursive:true}); fs.rmSync(path.join(f.root,'合集'),{recursive:true});
  if (location !== 'metadata') {
    const dir = journal(f,p.mutationId), intent = JSON.parse(fs.readFileSync(path.join(dir,'intent.json')));
    intent.schemaVersion = 2; const raw = json(intent); fs.writeFileSync(path.join(dir,'intent.json'),raw); fs.writeFileSync(path.join(dir,'COMMITTED'),`${digest(raw)}\n`);
    const legacy = {...p,schemaVersion:1,assetHash:a.assetHash}; for(const key of ['source','reason','availability','editToken','mutationId'])delete legacy[key];
    if(location.endsWith('-before')){
      const dir=journal(f,created.mutationId),intent=JSON.parse(fs.readFileSync(path.join(dir,'intent.json'))),original=json({...legacy,title:created.title,revision:1,updatedAt:created.updatedAt});
      intent.schemaVersion=2;intent.after[0]={bytes:original.toString('base64'),sha256:digest(original)};
      const raw=json(intent);fs.writeFileSync(path.join(dir,'intent.json'),raw);fs.writeFileSync(path.join(dir,'COMMITTED'),`${digest(raw)}\n`);
    }
    fs.writeFileSync(filename(f,p.id),json(legacy));
    if (location.startsWith('pending')) {fs.unlinkSync(path.join(dir,'COMMITTED'));fs.renameSync(dir,journal(f,p.mutationId,true));}
  }
  const backup = path.join(f.parent,'backup'), restored = path.join(f.parent,'restored');
  schema4Backup(f,backup);
  __testing.setHook(event=>{if(event.phase==='beforeInstall')throw new Error('Schema4 recovery must reject photo2 before writing metadata');});
  rejects('FORMAT_UNSUPPORTED',()=>restoreBackup(backup,restored));
  assert.equal(fs.existsSync(path.join(restored,'内容库.json')),false);
  assert.equal(JSON.parse(fs.readFileSync(filename(f,p.id))).schemaVersion,location==='metadata'?2:1);
});
