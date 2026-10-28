import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {createVault,createVaultDocument} from '../../vault/index.mjs';
import {openLibrary} from '../index.mjs';
const tree=root=>{const result=[];function walk(dir){for(const name of fs.readdirSync(dir).sort()){const file=path.join(dir,name),s=fs.lstatSync(file,{bigint:true});result.push([path.relative(root,file),String(s.mtimeNs),String(s.size),s.isFile()?createHash('sha256').update(fs.readFileSync(file)).digest('hex'):null]);if(s.isDirectory())walk(file);}}walk(root);return result;};
function fixture(t){const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'nova-journey-lookup-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const binding=createVault(root),document=createVaultDocument(binding.root,{section:'drafts',title:'定位内容',text:'作者材料'},{mutationId:randomUUID()}).document,library=openLibrary(binding.root);library.listContents();return {root,binding,document,library};}
test('lookup requires an explicit absolute vault and stable T and reads without writes or old secrets',async t=>{
 const f=fixture(t),snapshot=f.library.mutateProduction('startJourney',{contentId:f.document.contentId,host:'codex',method:'ordinary-writing',researchPlan:[],limits:{maxRequestsTotal:0,commentsAllowed:false,mediaCount:3,mediaBytes:67108864},serviceConfig:{},expectedToken:f.library.readProduction().editToken}),root=snapshot.tasks.find(t=>t.journeyState),secret=randomUUID();f.library.mutateProduction('claimTask',{taskId:root.id,attemptId:root.activeAttemptId,claimToken:secret,workerId:'original'});
 const {lookupContentJourney}=await import('../content-journey-lookup.mjs');const before=tree(f.root),found=lookupContentJourney({library:f.root,work:f.document.tNumber});assert.equal(found.status,'found');assert.equal(found.work.workId,f.document.tNumber);assert.equal(found.journeys[0].journeyId,root.id);assert(!JSON.stringify(found).includes(secret));assert.deepEqual(tree(f.root),before);
 assert.throws(()=>lookupContentJourney({library:'.',work:f.document.tNumber}),{code:'INVALID_INPUT'});assert.throws(()=>lookupContentJourney({library:f.root}),{code:'INVALID_INPUT'});
 const other=fixture(t);const unrelated=lookupContentJourney({library:other.root,work:f.document.tNumber});assert.equal(unrelated.journeys.length,0);assert.notEqual(unrelated.libraryId,found.libraryId);
});
test('lookup reports pending runtime recovery without acquiring a lock or repairing files',async t=>{
 const f=fixture(t),{lookupContentJourney}=await import('../content-journey-lookup.mjs'),pending=path.join(f.binding.root,'系统（别动）/事务/待恢复',randomUUID());fs.mkdirSync(pending);const before=tree(f.root),found=lookupContentJourney({library:f.root,work:f.document.tNumber});assert.equal(found.status,'recovery-required');assert.deepEqual(tree(f.root),before);
});

test('the actual lookup CLI process preserves every file hash and timestamp',async t=>{
 const f=fixture(t),{spawnSync}=await import('node:child_process'),before=tree(f.root),cli=new URL('../../../cli.mjs',import.meta.url),result=spawnSync(process.execPath,[cli.pathname,'content-journey','lookup','--library',f.root,'--work',f.document.tNumber],{encoding:'utf8',timeout:15000});assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).result.contentId,f.document.contentId);assert.deepEqual(tree(f.root),before);
});

test('lookup reports same-T source ambiguity and rejects a physically replaced vault without repair',async t=>{
 const f=fixture(t),{lookupContentJourney}=await import('../content-journey-lookup.mjs'),copy=path.join(f.root,'05_内容草稿',f.document.tNumber+'_另一份');fs.mkdirSync(copy,{recursive:true});fs.writeFileSync(path.join(copy,'工作稿.md'),'相同T的不同原件');let before=tree(f.root),found=lookupContentJourney({library:f.root,work:f.document.tNumber});assert.equal(found.status,'ambiguous');assert.deepEqual(tree(f.root),before);
 const old=f.root+'-original';fs.renameSync(f.root,old);t.after(()=>fs.rmSync(old,{recursive:true,force:true}));fs.cpSync(old,f.root,{recursive:true});before=tree(f.root);assert.throws(()=>lookupContentJourney({library:f.root,work:f.document.tNumber}),{code:'CONFLICT'});assert.deepEqual(tree(f.root),before);
});
