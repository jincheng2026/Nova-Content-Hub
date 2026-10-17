import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { spawnSync, spawn } from 'node:child_process';
import { createLibrary,openLibrary,upgradeLibrary,__testing } from '../index.mjs';
process.env.NODE_ENV='test';
const moduleURL=new URL('../index.mjs',import.meta.url).href;
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY9sAAAAASUVORK5CYII=','base64');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const reject=(code,fn)=>assert.throws(fn,error=>error.code===code);
function fixture(t){const parent=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'nova-business-'));const root=path.join(parent,'library');t.after(()=>{__testing.setHook(undefined);fs.rmSync(parent,{recursive:true,force:true});});return{parent,root,lib:createLibrary(root)};}
function asset(f,bytes=png,name='photo.png',purpose='photo'){const source=path.join(f.parent,name);fs.writeFileSync(source,bytes);return f.lib.importAsset(source,{purpose});}
const assetPath=(root,hash)=>path.join(root,'资产','sha256',hash.slice(0,2),hash);
const pending=root=>path.join(root,'系统（别动）','事务','待恢复');
const history=root=>path.join(root,'系统（别动）','事务','已提交');
function resource(a,role='style'){return{assetHash:a.assetHash,bytes:a.bytes,detectedType:a.detectedType,role};}
function killOperation(root,method,args,phase){const result=spawnSync(process.execPath,['--input-type=module','-e',`import{openLibrary,__testing}from ${JSON.stringify(moduleURL)};const d=JSON.parse(process.env.TASK_DATA);const lib=openLibrary(d.root);__testing.setHook(e=>{if(e.phase===d.phase)process.kill(process.pid,'SIGKILL')});lib[d.method](...d.args);`],{env:{...process.env,NODE_ENV:'test',TASK_DATA:JSON.stringify({root,method,args,phase})},encoding:'utf8',timeout:10000});assert.equal(result.signal,'SIGKILL',result.stderr);}

test('assets keep original bytes, deduplicate, reject corruption, unsupported types and symlink sources',t=>{
 const f=fixture(t);const a=asset(f);const b=asset(f,png,'another.png');assert.equal(a.assetHash,b.assetHash);assert.equal(a.decoded,false);assert.equal(a.originalName,'photo.png');assert.deepEqual(f.lib.readAsset(a.assetHash).data,png);
 assert.deepEqual(fs.readdirSync(path.dirname(assetPath(f.root,a.assetHash))),[a.assetHash]);
 fs.writeFileSync(assetPath(f.root,a.assetHash),'corrupted');reject('CORRUPT',()=>f.lib.readAsset(a.assetHash));reject('CORRUPT',()=>asset(f,png,'third.png'));
 reject('INVALID_INPUT',()=>asset(f,Buffer.from([0,255,0]),'unsupported.bin','material'));
 const linked=path.join(f.parent,'linked.png');fs.symlinkSync(path.join(f.parent,'photo.png'),linked);reject('UNSAFE_PATH',()=>f.lib.importAsset(linked,{purpose:'photo'}));
 const huge=path.join(f.parent,'huge.png');const fd=fs.openSync(huge,'w');fs.ftruncateSync(fd,64*1024*1024+1);fs.closeSync(fd);reject('INVALID_INPUT',()=>f.lib.importAsset(huge,{purpose:'material'}));
});

test('SVG is structure-only raw data and common text documents are imported without execution',t=>{
 const f=fixture(t);const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>not executed</script></svg>');
 reject('INVALID_INPUT',()=>asset(f,svg,'shape.svg','template-reference'));
 const a=asset(f,svg,'shape.svg','template-structure');assert.equal(a.detectedType,'image/svg+xml');assert.equal(a.decoded,false);assert.deepEqual(f.lib.readAsset(a.assetHash).data,svg);
 const doc=asset(f,Buffer.from('资料正文\n'),'notes.txt','material');assert.equal(f.lib.readAsset(doc.assetHash).data.toString(),'资料正文\n');
});

test('a failed reference commit leaves only a reusable immutable asset and no logical photo',t=>{
 const f=fixture(t);const a=asset(f);__testing.setHook(e=>{if(e.phase==='beforeJournal')throw Object.assign(new Error('disk full'),{code:'ENOSPC'});});
 assert.throws(()=>f.lib.createPhoto({title:'me',assetHash:a.assetHash,isOwnPhoto:true}),e=>e.code==='IO_ERROR'&&e.pendingRecovery===false);
 __testing.setHook(undefined);assert.equal(f.lib.listPhotos().length,0);assert.deepEqual(f.lib.readAsset(a.assetHash).data,png);
 assert.equal(f.lib.createPhoto({title:'me',assetHash:a.assetHash,isOwnPhoto:true}).assetHash,a.assetHash);
});

test('photo identity is separate from asset hash, declaration is explicit, and trash/token history survives',t=>{
 const f=fixture(t);const a=asset(f);reject('INVALID_INPUT',()=>f.lib.createPhoto({title:'missing declaration',assetHash:a.assetHash}));
 let first=f.lib.createPhoto({title:'me',assetHash:a.assetHash,isOwnPhoto:true,originalName:'my photo.png'});const second=f.lib.createPhoto({title:'reference',assetHash:a.assetHash,isOwnPhoto:false});assert.notEqual(first.id,second.id);
 const updated=f.lib.updatePhoto(first.id,{title:'renamed'},first.editToken);reject('CONFLICT',()=>f.lib.updatePhoto(first.id,{title:'stale'},first.editToken));first=f.lib.trashPhoto(first.id,updated.editToken);assert.equal(f.lib.listPhotoTrash().length,1);first=f.lib.restorePhoto(first.id,first.editToken);assert.equal(first.assetHash,a.assetHash);assert.equal(first.isOwnPhoto,true);
 const journal=JSON.parse(fs.readFileSync(path.join(history(f.root),first.mutationId,'intent.json')));assert.equal(journal.schemaVersion,3);assert.equal(journal.objectKind,'photo');assert.equal(journal.after.length,1);assert.deepEqual(f.lib.queryMutation(first.mutationId).content,first);
});

test('prompt Markdown is the sole body source; external edits invalidate token; builtin keys include trash',t=>{
 const f=fixture(t);let p=f.lib.createPrompt({title:'原创',body:'original',category:'writing',when:'draft',summary:'summary',tags:['original'],provenance:{origin:'project-original'},builtinKey:'nova-original'});
 const metaPath=path.join(f.root,'提示词',p.id,'提示词.json');assert.equal(JSON.parse(fs.readFileSync(metaPath)).body,undefined);
 fs.writeFileSync(path.join(f.root,'提示词',p.id,'正文.md'),'external\r\n');reject('CONFLICT',()=>f.lib.updatePrompt(p.id,{body:'stale'},p.editToken));p=f.lib.readPrompt(p.id);assert.equal(p.body,'external\r\n');
 p=f.lib.updatePrompt(p.id,{summary:'new summary'},p.editToken);assert.equal(p.body,'external\r\n');p=f.lib.trashPrompt(p.id,p.editToken);
 reject('CONFLICT',()=>f.lib.createPrompt({title:'duplicate',body:'body',builtinKey:'nova-original'}));assert.equal(f.lib.listPrompts().length,0);assert.equal(f.lib.listPromptTrash().length,1);
 p=f.lib.restorePrompt(p.id,p.editToken);assert.equal(p.builtinKey,'nova-original');
});

test('two independent initializer processes cannot create the same builtin prompt key',async t=>{
 const f=fixture(t);const script=`import{openLibrary}from ${JSON.stringify(moduleURL)};const deadline=Date.now()+30000;let finished=false;while(Date.now()<deadline){try{const p=openLibrary(process.env.TASK_ROOT).createPrompt({title:'builtin',body:'original',builtinKey:'unique-key'});console.log(p.id);finished=true;break}catch(e){if(e.code==='BUSY'||e.code==='LOCK_UNCERTAIN'){Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,15);continue}console.log(e.code);process.exitCode=e.code==='CONFLICT'?2:3;finished=true;break}}if(!finished)throw Error('initializer timed out waiting for library lock after 30000ms');`;
 const run=()=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,['--input-type=module','-e',script],{env:{...process.env,TASK_ROOT:f.root},stdio:['ignore','pipe','pipe'],timeout:45000,killSignal:'SIGKILL'});let stdout='',stderr='',spawnError;child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);child.on('error',error=>{spawnError=error});child.on('close',(status,signal)=>spawnError?reject(spawnError):resolve({status,signal,stdout,stderr}));});
 const settled=await Promise.allSettled([run(),run()]);for(const result of settled)assert.equal(result.status,'fulfilled',String(result.reason));const results=settled.map(result=>result.value);assert.deepEqual(results.map(x=>x.status).sort(),[0,2],JSON.stringify(results));assert.equal(f.lib.listPrompts().length,1);
});

for(const kind of ['prompt','photo','template'])test(`${kind} uses the shared crash-recoverable typed executor`,t=>{
 const f=fixture(t);let method,args;
 if(kind==='prompt'){method='createPrompt';args=[{title:'prompt',body:'body'}];}
 if(kind==='photo'){const a=asset(f);method='createPhoto';args=[{title:'photo',assetHash:a.assetHash,isOwnPhoto:true}];}
 if(kind==='template'){const a=asset(f);method='createTemplate';args=[{name:'template',definition:{accepted:false},resources:{sample:resource(a)}}];}
 killOperation(f.root,method,args,'afterFile');const reopened=openLibrary(f.root);const list=reopened[{prompt:'listPrompts',photo:'listPhotos',template:'listTemplates'}[kind]]();assert.equal(list.length,1);assert.equal(list[0].title,kind);assert.equal(fs.readdirSync(pending(f.root)).length,0);
});

test('immutable multi-sample template versions preserve provenance and builtin packages are idempotent',t=>{
 const f=fixture(t);const a=asset(f);const b=asset(f,Buffer.concat([png,Buffer.from('sample two')]),'second.png','template-reference');const definition={version:4,provenance:{aiTested:false,origin:'original'},generatedReferences:[{templateVersion:3,accepted:false},{templateVersion:4,accepted:false}]};const resources={'图库/v3.png':resource(a),'图库/group-v4.png':resource(b)};
 let builtin=f.lib.installBuiltinTemplate({id:'builtin-sample',name:'Builtin',version:4,definition,resources});const repeated=f.lib.installBuiltinTemplate({id:'builtin-sample',name:'Builtin',version:4,definition,resources});assert.equal(repeated.id,builtin.id);assert.equal(repeated.revision,1);const read=f.lib.readTemplate(builtin.id);assert.deepEqual(read.definition,definition);assert.deepEqual(read.resources,resources);assert.equal(read.version,4);
 reject('CONFLICT',()=>f.lib.installBuiltinTemplate({id:'builtin-sample',name:'Builtin',version:4,definition:{...definition,accepted:true},resources}));reject('INVALID_STATE',()=>f.lib.addTemplateVersion(builtin.id,{version:5,definition,resources},builtin.editToken));
 let custom=f.lib.createTemplate({name:'derived',definition,resources,derivedFrom:{id:builtin.id,version:4}});const old=f.lib.readTemplate(custom.id,1);custom=f.lib.addTemplateVersion(custom.id,{version:2,definition:{...definition,note:'new'},resources},custom.editToken);assert.equal(custom.currentVersion,2);custom=f.lib.selectTemplateVersion(custom.id,1,custom.editToken);assert.equal(custom.currentVersion,1);assert.deepEqual(f.lib.readTemplate(custom.id,1).definition,old.definition);
 custom=f.lib.trashTemplate(custom.id,custom.editToken);assert.equal(f.lib.listTemplateTrash().length,1);custom=f.lib.restoreTemplate(custom.id,custom.editToken);assert.equal(custom.id,old.id);assert.equal(f.lib.readTemplate(builtin.id).definition.generatedReferences[0].templateVersion,3);
});

test('unregistered template packages survive crash without fake success and stable builtin retry reuses exact package',t=>{
 const f=fixture(t);const a=asset(f);const input={id:'builtin-crash',name:'crash',version:4,definition:{accepted:false},resources:{sample:resource(a)}};
 killOperation(f.root,'installBuiltinTemplate',[input],'afterTemplatePackage');let reopened=openLibrary(f.root);assert.equal(reopened.listTemplates().length,0);const marker=JSON.parse(fs.readFileSync(path.join(f.root,'模板',input.id,'未登记.json')));assert.equal(marker.id,input.id);assert.equal(marker.version,4);assert.ok(marker.mutationId&&marker.packageHash);const packageBefore=fs.readFileSync(path.join(f.root,'模板',input.id,'版本','4','定义.json'));
 const installed=reopened.installBuiltinTemplate(input);assert.equal(installed.id,input.id);assert.deepEqual(fs.readFileSync(path.join(f.root,'模板',input.id,'版本','4','定义.json')),packageBefore);assert.equal(reopened.listTemplates().length,1);assert.ok(!fs.existsSync(path.join(f.root,'模板',input.id,'未登记.json')));
 killOperation(f.root,'createTemplate',[{name:'user orphan',definition:{},resources:{sample:resource(a)}}],'afterTemplatePackage');reopened=openLibrary(f.root);assert.equal(reopened.listTemplates().length,1);assert.deepEqual(reopened.readAsset(a.assetHash).data,png);
});

test('missing template metadata without marker and damaged orphan marker fail closed',t=>{
 const f=fixture(t);const a=asset(f);const custom=f.lib.createTemplate({name:'custom',definition:{},resources:{sample:resource(a)}});fs.unlinkSync(path.join(f.root,'模板',custom.id,'模板.json'));reject('CORRUPT',()=>f.lib.listTemplates());
 const markerPath=path.join(f.root,'模板',custom.id,'未登记.json');fs.writeFileSync(markerPath,JSON.stringify({id:custom.id}));reject('CORRUPT',()=>f.lib.listTemplates());
});

test('content materials, generated candidates and explicit selection remain separate facts',t=>{
 const f=fixture(t);const a=asset(f);let content=f.lib.createContent({title:'story',body:'body'});assert.equal(content.schemaVersion,4);
 content=f.lib.attachContentMaterial(content.id,{assetHash:a.assetHash,originalName:'research.png'},content.editToken);assert.equal(content.schemaVersion,4);assert.equal(content.materials.length,1);const materialId=content.materials[0].id;
 content=f.lib.registerContentCandidate(content.id,{assetHash:a.assetHash,requestId:'req-1',attemptId:'attempt-1',source:'manual-import'},content.editToken);assert.equal(content.candidates[0].accepted,false);assert.equal(content.selectedCover,null);
 content=f.lib.selectContentCover(content.id,content.candidates[0].id,content.editToken);assert.equal(content.selectedCover.assetHash,a.assetHash);assert.equal(content.candidates[0].accepted,true);content=f.lib.removeContentMaterial(content.id,materialId,content.editToken);assert.equal(content.materials.length,0);assert.deepEqual(f.lib.readAsset(a.assetHash).data,png);
});

test('multiple channel plans and manual publication snapshots survive edits, cover switches and photo trash',t=>{
 const f=fixture(t);const a=asset(f);let photo=f.lib.createPhoto({title:'me',assetHash:a.assetHash,isOwnPhoto:true});const template=f.lib.createTemplate({name:'style',definition:{accepted:false,aiTested:false},resources:{sample:resource(a)}});
 let c=f.lib.createContent({title:'story',body:'# original\r\n'});c=f.lib.registerContentCandidate(c.id,{assetHash:a.assetHash,requestId:'request',attemptId:'attempt',template:{id:template.id,version:1}},c.editToken);c=f.lib.selectContentCover(c.id,c.candidates[0].id,c.editToken);
 c=f.lib.savePublicationPlan(c.id,{channelId:'wechat',scheduledAt:'2026-10-20T01:00:00Z',timezone:'Asia/Shanghai'},c.editToken);c=f.lib.savePublicationPlan(c.id,{channelId:'xiaohongshu',scheduledAt:'2026-10-21T02:00:00Z',timezone:'Asia/Shanghai'},c.editToken);assert.equal(c.plans.length,2);const firstPlan=c.plans[0].id;const secondPlan=c.plans[1].id;
 c=f.lib.recordPublication(c.id,{planId:firstPlan,publishedAt:'2026-10-20T01:05:00Z',timezone:'Asia/Shanghai',url:'https://example.test/post'},c.editToken);const publicationId=c.publications[0].id;const snapshot=f.lib.readPublication(c.id,publicationId);assert.equal(snapshot.body,'# original\r\n');assert.deepEqual(snapshot.bodyBytes,Buffer.from('# original\r\n'));assert.equal(snapshot.template.id,template.id);
 reject('INVALID_STATE',()=>f.lib.savePublicationPlan(c.id,{id:firstPlan,channelId:'wechat',scheduledAt:'2026-11-01T00:00:00Z',timezone:'UTC'},c.editToken));reject('INVALID_STATE',()=>f.lib.cancelPublicationPlan(c.id,firstPlan,c.editToken));
 c=f.lib.updateContent(c.id,{title:'new title',body:'new draft'},c.editToken);const b=asset(f,Buffer.concat([png,Buffer.from('new cover')]),'new.png','generated-cover');c=f.lib.registerContentCandidate(c.id,{assetHash:b.assetHash,requestId:'next',attemptId:'two'},c.editToken);c=f.lib.selectContentCover(c.id,c.candidates[1].id,c.editToken);photo=f.lib.trashPhoto(photo.id,photo.editToken);
 assert.deepEqual(f.lib.readPublication(c.id,publicationId),snapshot);c=f.lib.recordPublication(c.id,{planId:secondPlan,publishedAt:'2026-10-21T02:00:00Z',timezone:'Asia/Shanghai'},c.editToken);assert.equal(c.publications.length,2);assert.equal(f.lib.readPublication(c.id,c.publications[1].id).body,'new draft');
});

test('snapshot-before-reference failure leaves no publication fact and retry registers exactly once',t=>{
 const f=fixture(t);let c=f.lib.createContent({title:'x',body:'raw body'});c=f.lib.savePublicationPlan(c.id,{channelId:'wechat',scheduledAt:'2026-10-20T00:00:00Z',timezone:'UTC'},c.editToken);const input={planId:c.plans[0].id,publishedAt:'2026-10-20T00:00:00Z',timezone:'UTC'};const mutationId=randomUUID();
 __testing.setHook(e=>{if(e.phase==='afterPublicationSnapshot')throw new Error('reference failed');});reject('IO_ERROR',()=>f.lib.recordPublication(c.id,input,c.editToken,{mutationId}));__testing.setHook(undefined);assert.equal(f.lib.readContent(c.id).publications.length,0);c=f.lib.recordPublication(c.id,input,c.editToken,{mutationId});assert.equal(c.publications.length,1);assert.equal(f.lib.readPublication(c.id,c.publications[0].id).body,'raw body');
});

test('publication validates UTC/IANA/channel IDs and rejects corrupted snapshot bytes',t=>{
 const f=fixture(t);let c=f.lib.createContent({title:'x',body:'body'});reject('INVALID_INPUT',()=>f.lib.savePublicationPlan(c.id,{channelId:'bad/channel',scheduledAt:'2026-10-20T00:00:00Z',timezone:'UTC'},c.editToken));reject('INVALID_INPUT',()=>f.lib.savePublicationPlan(c.id,{channelId:'wechat',scheduledAt:'2026-10-20T00:00:00+08:00',timezone:'UTC'},c.editToken));reject('INVALID_INPUT',()=>f.lib.savePublicationPlan(c.id,{channelId:'wechat',scheduledAt:'2026-10-20T00:00:00Z',timezone:'+08:00'},c.editToken));
 c=f.lib.savePublicationPlan(c.id,{channelId:'wechat',scheduledAt:'2026-10-20T00:00:00Z',timezone:'UTC'},c.editToken);c=f.lib.recordPublication(c.id,{planId:c.plans[0].id,publishedAt:'2026-10-20T00:00:00Z',timezone:'UTC'},c.editToken);const publicationId=c.publications[0].id;fs.writeFileSync(path.join(f.root,'内容',c.id,'发布快照',publicationId,'正文.md'),'tampered');reject('CORRUPT',()=>f.lib.readPublication(c.id,publicationId));
});

test('template root staging fails before marker publication without creating an unmarked formal ID',t=>{
 const f=fixture(t);const a=asset(f);const input={id:'builtin-stage',name:'stage',version:4,definition:{accepted:false},resources:{sample:resource(a)}};const originalWrite=fs.writeFileSync;t.after(()=>{fs.writeFileSync=originalWrite});
 fs.writeFileSync=function(file,data,...args){if(Buffer.isBuffer(data)&&data.includes(Buffer.from('nova-unregistered-template'))){originalWrite.call(this,file,Buffer.from('{partial'));throw Object.assign(new Error('marker disk full'),{code:'ENOSPC'});}return originalWrite.call(this,file,data,...args);};
 reject('IO_ERROR',()=>f.lib.installBuiltinTemplate(input));fs.writeFileSync=originalWrite;assert.ok(!fs.existsSync(path.join(f.root,'模板',input.id)));assert.equal(f.lib.listTemplates().length,0);assert.equal(f.lib.installBuiltinTemplate(input).id,input.id);
});

test('missing or corrupted template resources reject reads, selection, binding and publication without changing content',t=>{
 const f=fixture(t);const a=asset(f);let template=f.lib.createTemplate({name:'sample',definition:{},resources:{sample:resource(a)}});let c=f.lib.createContent({title:'story',body:'body'});c=f.lib.registerContentCandidate(c.id,{assetHash:a.assetHash,requestId:'r',attemptId:'a',template:{id:template.id,version:1}},c.editToken);c=f.lib.selectContentCover(c.id,c.candidates[0].id,c.editToken);c=f.lib.savePublicationPlan(c.id,{channelId:'wechat',scheduledAt:'2026-10-20T00:00:00Z',timezone:'UTC'},c.editToken);const before=f.lib.readContent(c.id);fs.unlinkSync(assetPath(f.root,a.assetHash));
 reject('CORRUPT',()=>f.lib.readTemplate(template.id));reject('CORRUPT',()=>f.lib.selectTemplateVersion(template.id,1,template.editToken));assert.throws(()=>f.lib.recordPublication(c.id,{planId:c.plans[0].id,publishedAt:'2026-10-20T00:00:00Z',timezone:'UTC'},c.editToken));assert.deepEqual(f.lib.readContent(c.id),before);
 fs.writeFileSync(assetPath(f.root,a.assetHash),'wrong');reject('CORRUPT',()=>f.lib.readTemplate(template.id));assert.throws(()=>f.lib.registerContentCandidate(c.id,{assetHash:a.assetHash,requestId:'r2',attemptId:'a2',template:{id:template.id,version:1}},c.editToken));assert.deepEqual(f.lib.readContent(c.id),before);
});

test('asset detectedType is canonical from bytes across filename extensions and reads',t=>{
 const f=fixture(t);const bytes=Buffer.from('{"original":true}');const json=asset(f,bytes,'same.json','material');const txt=asset(f,bytes,'same.txt','material');const md=asset(f,bytes,'same.md','material');assert.equal(json.assetHash,txt.assetHash);assert.equal(txt.assetHash,md.assetHash);assert.equal(json.detectedType,'application/json');assert.equal(json.detectedType,txt.detectedType);assert.equal(txt.detectedType,f.lib.readAsset(txt.assetHash).detectedType);
 const fake=asset(f,Buffer.from('plain document'),'fake.png','material');assert.equal(fake.detectedType,'text/plain');reject('INVALID_INPUT',()=>f.lib.importAsset(path.join(f.parent,'fake.png'),{purpose:'generated-cover'}));
});

for(const corruption of ['nullCandidate','duplicateCandidate','foreignSelection','wrongSelectionAsset','badPlanLink','badVersion'])test(`typed metadata rejects ${corruption} before read or subsequent writes`,t=>{
 const f=fixture(t);const a=asset(f);let c=f.lib.createContent({title:'x',body:'body'});c=f.lib.registerContentCandidate(c.id,{assetHash:a.assetHash,requestId:'r',attemptId:'a'},c.editToken);c=f.lib.selectContentCover(c.id,c.candidates[0].id,c.editToken);let file=path.join(f.root,'内容',c.id,'内容.json');let meta=JSON.parse(fs.readFileSync(file));
 if(corruption==='nullCandidate')meta.candidates=[null];if(corruption==='duplicateCandidate')meta.candidates.push({...meta.candidates[0]});if(corruption==='foreignSelection')meta.selectedCover.candidateId=randomUUID();if(corruption==='wrongSelectionAsset')meta.selectedCover.assetHash='a'.repeat(64);if(corruption==='badPlanLink')meta.plans=[{id:randomUUID(),channelId:'wechat',scheduledAt:'2026-10-20T00:00:00.000Z',timezone:'UTC',status:'published',publicationId:randomUUID(),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}];
 if(corruption==='badVersion'){const template=f.lib.createTemplate({name:'x',definition:{},resources:{sample:resource(a)}});file=path.join(f.root,'模板',template.id,'模板.json');meta=JSON.parse(fs.readFileSync(file));meta.currentVersion=999;fs.writeFileSync(file,JSON.stringify(meta));reject('CORRUPT',()=>f.lib.readTemplate(template.id));return;}
 fs.writeFileSync(file,JSON.stringify(meta));const raw=fs.readFileSync(file);reject('CORRUPT',()=>f.lib.readContent(c.id));reject('CORRUPT',()=>f.lib.updateContent(c.id,{body:'must not write'},c.editToken));assert.deepEqual(fs.readFileSync(file),raw);assert.equal(fs.readFileSync(path.join(f.root,'内容',c.id,'正文.md'),'utf8'),'body');
});

test('publication URLs cannot persist embedded credentials',t=>{
 const f=fixture(t);let c=f.lib.createContent({title:'x',body:'body'});c=f.lib.savePublicationPlan(c.id,{channelId:'wechat',scheduledAt:'2026-10-20T00:00:00Z',timezone:'UTC'},c.editToken);reject('INVALID_INPUT',()=>f.lib.recordPublication(c.id,{planId:c.plans[0].id,publishedAt:'2026-10-20T00:00:00Z',timezone:'UTC',url:'https://user:token@example.test/post'},c.editToken));assert.equal(f.lib.readContent(c.id).publications.length,0);
});

function schema2Fixture(f) {
 const file=path.join(f.root,'内容库.json');const info=JSON.parse(fs.readFileSync(file));fs.writeFileSync(file,JSON.stringify({...info,schemaVersion:2}));
 for(const name of ['提示词','我的照片','模板','资产'])fs.rmSync(path.join(f.root,name),{recursive:true});
 return fs.readFileSync(file);
}
for(const phase of ['upgrade3AfterBackup','upgrade3AfterBarrier','upgrade3AfterDirectories','upgrade3BeforeDescriptorPublish','upgrade3AfterDescriptorPublish','upgrade3AfterFinalMarker'])test(`schema 2 to 3 resumes after ${phase} and blocks old schema 2 writers`,t=>{
 const f=fixture(t);const c=f.lib.createContent({title:'old',body:'old bytes'});const original=schema2Fixture(f);const before=fs.readFileSync(path.join(history(f.root),c.mutationId,'intent.json'));const result=spawnSync(process.execPath,['--input-type=module','-e',`import{upgradeLibrary,__testing}from ${JSON.stringify(moduleURL)};__testing.setHook(e=>{if(e.phase===process.env.TASK_PHASE)process.kill(process.pid,'SIGKILL')});upgradeLibrary(process.env.TASK_ROOT);`],{env:{...process.env,NODE_ENV:'test',TASK_ROOT:f.root,TASK_PHASE:phase},encoding:'utf8',timeout:10000});assert.equal(result.signal,'SIGKILL',result.stderr);
 const descriptor=JSON.parse(fs.readFileSync(path.join(f.root,'内容库.json')));if(descriptor.schemaVersion===2)reject('UPGRADE_REQUIRED',()=>openLibrary(f.root));if(fs.existsSync(path.join(f.root,'系统（别动）','事务','升级到3')))assert.ok(fs.readdirSync(path.join(f.root,'系统（别动）','事务')).some(name=>!['待恢复','已提交'].includes(name)));
 const lib=upgradeLibrary(f.root);assert.equal(lib.info.schemaVersion,5);assert.equal(lib.readContent(c.id).body,'old bytes');assert.deepEqual(fs.readFileSync(path.join(history(f.root),c.mutationId,'intent.json')),before);assert.deepEqual(fs.readFileSync(path.join(f.root,'系统（别动）','内容库.schema2.bak.json')),original);assert.equal(lib.listPrompts().length,0);
});

test('legacy journal schema 1 maps strictly to content and its raw history bytes are never rewritten',t=>{
 const f=fixture(t);const c=f.lib.createContent({title:'legacy',body:'legacy body'});const dir=path.join(history(f.root),c.mutationId);const current=JSON.parse(fs.readFileSync(path.join(dir,'intent.json')));const legacy={schemaVersion:1,libraryId:current.libraryId,mutationId:current.mutationId,contentId:current.objectId,operation:current.operation,requestDigest:current.requestDigest,before:current.before,after:current.after};const raw=Buffer.from(JSON.stringify(legacy,null,2)+'\n');fs.writeFileSync(path.join(dir,'intent.json'),raw);fs.writeFileSync(path.join(dir,'COMMITTED'),digest(raw)+'\n');schema2Fixture(f);const lib=upgradeLibrary(f.root);assert.equal(lib.queryMutation(c.mutationId).objectKind,'content');assert.equal(lib.queryMutation(c.mutationId).content.body,'legacy body');assert.deepEqual(fs.readFileSync(path.join(dir,'intent.json')),raw);
 const invalid={...legacy,objectKind:'photo'};const invalidBytes=Buffer.from(JSON.stringify(invalid));fs.writeFileSync(path.join(dir,'intent.json'),invalidBytes);fs.writeFileSync(path.join(dir,'COMMITTED'),digest(invalidBytes)+'\n');reject('CORRUPT',()=>lib.queryMutation(c.mutationId));
});

test('template roles are finite and style references cannot disguise documents as samples',t=>{
 const f=fixture(t);const doc=asset(f,Buffer.from('a text document'),'document.txt','material');reject('INVALID_INPUT',()=>f.lib.createTemplate({name:'bad style',definition:{},resources:{sample:resource(doc)}}));reject('INVALID_INPUT',()=>f.lib.createTemplate({name:'unknown role',definition:{},resources:{sample:resource(doc,'whatever')}}));const structural=f.lib.createTemplate({name:'text structure',definition:{},resources:{notes:resource(doc,'structure')}});assert.equal(f.lib.readTemplate(structural.id).resources.notes.detectedType,'text/plain');const pdf=asset(f,Buffer.from('%PDF-1.7\nreference'),'reference.pdf','material');reject('INVALID_INPUT',()=>f.lib.createTemplate({name:'PDF style',definition:{},resources:{sample:resource(pdf)}}));
});

function replaceAfterMetadata(root,mutationId,change){const dir=path.join(history(root),mutationId);const file=path.join(dir,'intent.json');const journal=JSON.parse(fs.readFileSync(file));const meta=JSON.parse(Buffer.from(journal.after[0].bytes,'base64'));change(meta);const bytes=Buffer.from(JSON.stringify(meta));journal.after[0]={bytes:bytes.toString('base64'),sha256:digest(bytes)};const raw=Buffer.from(JSON.stringify(journal));fs.writeFileSync(file,raw);fs.writeFileSync(path.join(dir,'COMMITTED'),digest(raw)+'\n');}

for(const kind of ['content','prompt','photo','template'])test(`typed ${kind} trash journal cannot mutate business fields`,t=>{
 const f=fixture(t);const a=asset(f);let record;
 if(kind==='content'){record=f.lib.createContent({title:'x',body:'body'});record=f.lib.attachContentMaterial(record.id,{assetHash:a.assetHash,originalName:'original.png'},record.editToken);record=f.lib.trashContent(record.id,record.editToken);}
 if(kind==='prompt'){record=f.lib.createPrompt({title:'x',body:'body',category:'original'});record=f.lib.trashPrompt(record.id,record.editToken);}
 if(kind==='photo'){record=f.lib.createPhoto({title:'x',assetHash:a.assetHash,isOwnPhoto:true});record=f.lib.trashPhoto(record.id,record.editToken);}
 if(kind==='template'){record=f.lib.createTemplate({name:'x',definition:{},resources:{sample:resource(a)}});record=f.lib.addTemplateVersion(record.id,{version:2,definition:{other:true},resources:{sample:resource(a)}},record.editToken);record=f.lib.trashTemplate(record.id,record.editToken);}
 replaceAfterMetadata(f.root,record.mutationId,meta=>{if(kind==='content')meta.materials[0].originalName='changed';if(kind==='prompt')meta.category='changed';if(kind==='photo')meta.isOwnPhoto=false;if(kind==='template')meta.currentVersion=1;});reject('CORRUPT',()=>f.lib.queryMutation(record.mutationId));
});

test('a typed content update journal cannot regress extended metadata to schema 1',t=>{
 const f=fixture(t);const a=asset(f);let c=f.lib.createContent({title:'x',body:'body'});c=f.lib.attachContentMaterial(c.id,{assetHash:a.assetHash,originalName:'original.png'},c.editToken);c=f.lib.updateContent(c.id,{title:'new'},c.editToken);replaceAfterMetadata(f.root,c.mutationId,meta=>{meta.schemaVersion=1;for(const key of ['materials','candidates','selectedCover','plans','publications'])delete meta[key];});reject('CORRUPT',()=>f.lib.queryMutation(c.mutationId));
});

test('reordering template reference keys in external JSON preserves semantic cover ownership',t=>{
 const f=fixture(t);const a=asset(f);const template=f.lib.createTemplate({name:'style',definition:{},resources:{sample:resource(a)}});let c=f.lib.createContent({title:'x',body:'body'});c=f.lib.registerContentCandidate(c.id,{assetHash:a.assetHash,requestId:'r',attemptId:'a',template:{id:template.id,version:1}},c.editToken);c=f.lib.selectContentCover(c.id,c.candidates[0].id,c.editToken);const file=path.join(f.root,'内容',c.id,'内容.json');const meta=JSON.parse(fs.readFileSync(file));const ref=meta.selectedCover.template;meta.selectedCover.template={packageHash:ref.packageHash,version:ref.version,id:ref.id};fs.writeFileSync(file,JSON.stringify(meta));const current=f.lib.readContent(c.id);assert.deepEqual(current.selectedCover.template,c.selectedCover.template);assert.notEqual(current.editToken,c.editToken);assert.equal(f.lib.updateContent(c.id,{body:'next'},current.editToken).body,'next');
});

test('a holder releasing during EEXIST inspection reports BUSY without deleting or stealing a lock',t=>{
 const f=fixture(t);const lock=path.join(f.root,'系统（别动）','库锁');const token=randomUUID();fs.mkdirSync(lock);fs.writeFileSync(path.join(lock,token+'.json'),JSON.stringify({token,host:os.hostname(),pid:process.pid}));const original=fs.readdirSync;let injected=false;t.after(()=>{fs.readdirSync=original});fs.readdirSync=function(dir,...args){if(String(dir)===lock&&!injected){injected=true;fs.unlinkSync(path.join(lock,token+'.json'));fs.rmdirSync(lock);}return original.call(this,dir,...args);};reject('BUSY',()=>f.lib.listPrompts());fs.readdirSync=original;assert.equal(injected,true);assert.equal(f.lib.listPrompts().length,0);
});
