// node workbench/scripts/installed-capacity-probe.mjs; no compilation or installed/user-library writes.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import electron from 'electron';

const repo=fileURLToPath(new URL('../../',import.meta.url));
const installed='/Applications/自媒体工作台.app/Contents/Resources';
const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'nova-installed-capacity-')));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function snapshot(directory){const result=[];for(const relative of (await fs.readdir(directory,{recursive:true})).sort()){const full=path.join(directory,relative),stat=await fs.lstat(full);if(stat.isFile())result.push({path:relative,bytes:stat.size,sha256:sha(await fs.readFile(full))});else if(stat.isSymbolicLink())result.push({path:relative,symlink:await fs.readlink(full)});}return result;}
const before=await snapshot(path.join(installed,'app'));
console.log(`Installed source snapshot ${before.length} files; isolated fixture ${root}`);
await fs.cp(path.join(installed,'app'),path.join(root,'app'),{recursive:true});
await fs.cp(path.join(installed,'plugin-marketplace'),path.join(root,'plugin-marketplace'),{recursive:true});
assert.deepEqual(await snapshot(path.join(root,'app')),before);
const {createLibrary,openLibrary}=await import(pathToFileURL(path.join(root,'app/plugin-src/src/lib/file-library/index.mjs')));
const library=createLibrary(path.join(root,'library')),assets=[],hashes=new Set();
const sourceRoot=path.join(root,'app/plugin-src/resources/colleague-library/sources');
for(const relative of (await fs.readdir(sourceRoot,{recursive:true})).sort()){
  if(!/\.(png|jpe?g|webp)$/i.test(relative))continue;
  const full=path.join(sourceRoot,relative),bytes=await fs.readFile(full),hash=sha(bytes);if(hashes.has(hash))continue;
  const asset=library.importAsset(full,{purpose:'generated-cover'});assert.equal(asset.assetHash,hash);hashes.add(hash);assets.push({path:path.relative(path.join(root,'app'),full),sha256:hash,bytes:bytes.length,assetHash:asset.assetHash});if(assets.length===100)break;
}
assert.ok(assets.length>=60,`Only ${assets.length} distinct source images`);
for(let i=0;i<100;i++){
  let content=library.createContent({title:`Capacity ${String(i+1).padStart(3,'0')}`,body:'容量实测：100 篇内容的正文与发布说明。\n'.repeat(100)});
  for(let j=0;j<6;j++)content=library.registerContentCandidate(content.id,{assetHash:assets[(i*6+j)%assets.length].assetHash,requestId:'manual',attemptId:'installed-capacity'},content.editToken);
  content=library.selectContentCover(content.id,content.candidates[0].id,content.editToken);
  for(let j=0;j<3;j++)content=library.savePublicationPlan(content.id,{channelId:'douyin',text:'容量实测发布说明\n'.repeat(20),schedule:{precision:'date',date:`2026-10-${20+j}`}},content.editToken);
  if((i+1)%20===0)console.log(`Seeded ${i+1}/100`);
}
for(let i=0;i<12;i++)library.createPrompt({title:`Capacity prompt ${i+1}`,body:'提示词正文\n'.repeat(50)});
assert.equal(openLibrary(path.join(root,'library')).listContents().length,100);
const entry=path.join(root,'app/workbench/dist/main/installed-capacity-entry.mjs');
await fs.copyFile(fileURLToPath(new URL('./installed-capacity-entry.mjs',import.meta.url)),entry);
const started=Date.now(),lines=[];
let timedOut=false;
const code=await new Promise((resolve,reject)=>{const child=spawn(electron,[entry],{cwd:path.join(root,'app'),env:{...process.env,NOVA_INSTALLED_CAPACITY_ROOT:root,NOVA_INSTALLED_CAPACITY_STARTED:String(started)},stdio:['ignore','pipe','pipe']});const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},240000);for(const stream of [child.stdout,child.stderr])stream.on('data',bytes=>{lines.push(bytes.toString());process.stdout.write(bytes)});child.once('error',error=>{clearTimeout(timer);reject(error)});child.once('close',code=>{clearTimeout(timer);resolve(code)})});
let receipt;try{receipt=JSON.parse(await fs.readFile(path.join(root,'receipt.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;receipt={passed:false,error:timedOut?'Electron exceeded 240 seconds':'Electron exited without receipt',samples:[]};}
const after=await snapshot(path.join(installed,'app'));assert.deepEqual(after,before,'Installed app was modified');
const copiedAfter=await snapshot(path.join(root,'app'));assert.deepEqual(copiedAfter.filter(item=>item.path!==path.relative(path.join(root,'app'),entry)),before,'Copied runtime sources were modified');
const release=JSON.parse(await fs.readFile(path.join(root,'app/workbench/dist/release.json'),'utf8'));
const evidence={schemaVersion:1,measuredAt:new Date().toISOString(),root,release,environment:{platform:process.platform,arch:process.arch,osRelease:os.release(),cpu:os.cpus()[0].model,totalMemoryBytes:os.totalmem()},source:{installedApp:path.join(installed,'app'),fileCount:before.length,snapshotSha256:sha(JSON.stringify(before)),installedUnchanged:true,copiedRuntimeUnchanged:true,manifest:before},fixture:{contents:100,plans:300,candidateReferences:600,uniqueRasterAssets:assets.length,totalUniqueRasterBytes:assets.reduce((n,a)=>n+a.bytes,0),assets},scope:'Unmodified installed app copy; pinned repository Electron; native main/utility workers/preload/sandbox/IPC/resource routes/renderer. Native dialogs stubbed to isolated library, window show:false. DOM waits plus two animation frames, explicit image.decode includes protocol reads and raster decode. No recompilation.',limitations:['Synthetic text and shared original source images; no provider/host launch/native Finder dialog or manual visual acceptance.','One Mac, one fresh fixture, one process; OS page cache is warm after snapshot/seeding. No latency SLA or capacity guarantee.','Timings are sequential wall-clock observations; image decode tests eagerly load selected page images, and do not measure a human scrolling gesture.','Memory units: process.memoryUsage bytes; renderer/process metrics report KiB as provided by Electron.'],...receipt,processExitCode:code};
const out=path.join(repo,`docs/verification/production/${new Date().toISOString().slice(0,19).replaceAll(':','-')}-installed-capacity`);await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out+'.json',JSON.stringify(evidence,null,2)+'\n');await fs.writeFile(out+'.log',lines.join(''));console.log(`Evidence ${out}.json; diagnostics ${root}`);assert.equal(code,0);assert.equal(receipt.passed,true);
