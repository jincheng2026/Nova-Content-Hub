// Creates only a fresh synthetic library below the performance runner's temp directory.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
const repo=fileURLToPath(new URL('../../../../../',import.meta.url));
const require=createRequire(path.join(repo,'package.json')),sharp=require('sharp');
const {createLibrary,openLibrary}=await import(pathToFileURL(path.join(repo,'plugin-src/src/lib/file-library/index.mjs')));
const {installBuiltins}=await import(pathToFileURL(path.join(repo,'plugin-src/src/lib/library-seed/index.mjs')));
export async function makeFixture(root){
  const sources=path.join(root,'images');await fs.mkdir(sources,{recursive:true});const images=[];
  for(let i=0;i<24;i++){
    let state=0xabcdef+i;const raw=Buffer.alloc(1080*1440*3);
    for(let p=0;p<raw.length;p++){state=(Math.imul(state,1664525)+1013904223)>>>0;raw[p]=state>>>24;}
    const file=path.join(sources,`synthetic-${String(i).padStart(2,'0')}.jpg`);
    await sharp(raw,{raw:{width:1080,height:1440,channels:3}}).jpeg({quality:85}).toFile(file);
    images.push({file,bytes:(await fs.stat(file)).size,width:1080,height:1440});
  }
  const firstRoot=path.join(root,'library-100'),lib=createLibrary(firstRoot);installBuiltins(lib);
  const assets=images.map(image=>lib.importAsset(image.file,{purpose:'generated-cover'}));
  const day=new Intl.DateTimeFormat('sv-SE',{year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  // One canonical object goes through all production mutation APIs. Clone only synthetic
  // metadata offline, then validate every object through production listContents().
  let seed=lib.createContent({title:'Perf 000',body:'Synthetic performance content; no user data.\n'.repeat(50)});
  for(let j=0;j<6;j++)seed=lib.registerContentCandidate(seed.id,{assetHash:assets[j].assetHash,requestId:'synthetic',attemptId:'performance-fixture'},seed.editToken);
  seed=lib.selectContentCover(seed.id,seed.candidates[0].id,seed.editToken);
  seed=lib.savePublicationPlan(seed.id,{channelId:'douyin',coverChoice:{candidateId:seed.candidates[0].id},text:'Synthetic publication',schedule:{precision:'local-minute',date:day,time:'09:00',timezone:'Asia/Shanghai'}},seed.editToken);
  const firstId=seed.id,seedDir=path.join(firstRoot,'内容',firstId);
  const canonical=JSON.parse(await fs.readFile(path.join(seedDir,'内容.json'),'utf8'));
  const body=await fs.readFile(path.join(seedDir,'正文.md'));
  for(let i=1;i<100;i++){
    const doc=structuredClone(canonical);doc.id=randomUUID();doc.title=`Perf ${String(i).padStart(3,'0')}`;
    doc.candidates=doc.candidates.map((candidate,j)=>({...candidate,id:randomUUID(),assetHash:assets[(i+j)%assets.length].assetHash}));
    doc.selectedCover={...doc.selectedCover,candidateId:doc.candidates[0].id,assetHash:doc.candidates[0].assetHash};
    doc.plans=doc.plans.map(plan=>({...plan,id:randomUUID(),coverChoice:{candidateId:doc.candidates[0].id}}));
    const folder=path.join(firstRoot,'内容',doc.id);await fs.mkdir(folder);
    await fs.writeFile(path.join(folder,'内容.json'),JSON.stringify(doc,null,2)+'\n');await fs.writeFile(path.join(folder,'正文.md'),body);
  }
  const secondRoot=path.join(root,'library-1000');await fs.cp(firstRoot,secondRoot,{recursive:true});
  for(const id of await fs.readdir(path.join(secondRoot,'内容'))){
    const file=path.join(secondRoot,'内容',id,'内容.json'),doc=JSON.parse(await fs.readFile(file,'utf8'));
    doc.plans=Array.from({length:10},(_,n)=>({...doc.plans[0],id:n?randomUUID():doc.plans[0].id,schedule:{...doc.plans[0].schedule,time:`09:${String(n).padStart(2,'0')}`}}));
    await fs.writeFile(file,JSON.stringify(doc,null,2)+'\n');
  }
  const fixtures=[];
  for(const [plans,library] of [[100,firstRoot],[1000,secondRoot]]){
    const instance=openLibrary(library),contents=instance.listContents();
    const total=contents.reduce((n,d)=>n+d.plans.length,0),candidates=contents.reduce((n,d)=>n+d.candidates.length,0);
    assert.equal(contents.length,100);assert.equal(total,plans);assert.equal(candidates,600);assert.equal(new Set(contents.map(d=>d.selectedCover.assetHash)).size,24);
    fixtures.push({plans,library,firstId,contents:100,candidateReferences:600,uniqueSyntheticImages:images.length,selectedCoverUniqueHashes:24});
  }
  for(const image of images)image.sha256=createHash('sha256').update(await fs.readFile(image.file)).digest('hex');
  const templateGroups=lib.listTemplates().map(item=>{
    const template=lib.readTemplate(item.id);return {id:item.id,sampleCount:template.definition.shots.length,bytes:Object.values(template.resources).reduce((n,r)=>n+r.bytes,0),resources:template.resources};
  });
  const result={root,images,fixtures,templateGroups,selectedCoverDistribution:'Content i selects image i mod24, with six consecutive independent candidate hashes; normal content first screen records actual row and unique-hash counts under the existing sort.',construction:'Fresh library and complete public builtins via production APIs; one content with six candidates/selected cover/plan via mutation APIs; 99 synthetic metadata clones and 900 extra synthetic plans offline; every object then validated through production listContents(). Preparation excluded from all navigation timings.',cache:'Synthetic images were generated before measurement; OS page cache is not purged. Fresh Electron processes have independent userData and Chromium image caches.'};
  await fs.writeFile(path.join(root,'fixture.json'),JSON.stringify(result,null,2));return result;
}

export async function verifyFixture(fixture) {
  assert.ok(path.basename(fixture.root).startsWith('nova-real-performance-'), 'only owned synthetic runtime roots may be used');
  const checks=[];
  for(const spec of fixture.fixtures){
    assert.equal(spec.library,path.join(fixture.root,`library-${spec.plans}`));
    const library=openLibrary(spec.library),documents=library.listContents();
    assert.equal(documents.length,100);assert.equal(documents.reduce((n,d)=>n+d.plans.length,0),spec.plans);
    for(const document of documents){
      assert.equal(document.candidates.length,6);assert.ok(document.selectedCover);
      assert.equal(document.candidates.find(c=>c.id===document.selectedCover.candidateId)?.assetHash,document.selectedCover.assetHash);
      assert.ok(document.plans.every(p=>p.coverChoice?.candidateId===document.selectedCover.candidateId),'overview requires explicit plan covers');
    }
    assert.equal(new Set(documents.map(d=>d.selectedCover.assetHash)).size,24);
    const templates=library.listTemplates();assert.equal(templates.length,20);
    checks.push({plans:spec.plans,contents:documents.length,candidateReferences:600,selectedCoverUniqueHashes:24,templates:templates.length});
  }
  for(const image of fixture.images)assert.equal(createHash('sha256').update(await fs.readFile(image.file)).digest('hex'),image.sha256,'synthetic bank bytes changed');
  return {passed:true,scope:'Production core validates every synthetic document before Electron timing; all explicit plan covers and exact image-bank hashes checked. No provider or user library.',checks};
}
