import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {snapshotPackage} from '../../../../../plugin-src/src/lib/package-snapshot.mjs';
const out=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(out,'../../../../..');
const packageReceipt=JSON.parse(await fs.readFile(path.join(out,'../package.json'),'utf8'));
const candidate=packageReceipt.source,resources=path.join(candidate,'Contents/Resources'),base=path.join(resources,'app');
assert.equal(packageReceipt.version,'0.3.28');assert.equal(packageReceipt.sourceCommit,'6b739b385e01931bd26962f229c853da2317a37c');
const electron=createRequire(path.join(repo,'workbench/package.json'))('electron');
const root=await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()),'nova-native-0328-package-'));
const sha=value=>createHash('sha256').update(value).digest('hex');
const manifest={at:new Date().toISOString(),candidate,resources,root,electron,scope:'Actual packaged candidate 0.3.28 modules loaded directly, no copied/overlaid product resources. Hidden repository Electron app.isPackaged=false with new os.tmpdir userData/synthetic library; true renderer/preload/IPC/utility worker. Not Finder/LaunchServices/TCC/manual GUI or real-user acceptance.',sourceCommit:packageReceipt.sourceCommit,phases:[],limits:['No real /Applications 0.3.27 app or user library, TCC change, host task, cache update, clipboard, generation, notification permission, install or version/source mutation','Host setup is observed read-only; .27 installed plugin cache may not match .28 candidate','Resource-worker continuity, native foreign-owner/clone protection and crash-during-maintenance are not independently covered here']};
try{
 const before=await snapshotPackage(candidate);const treeHash=sha(JSON.stringify(before));assert.equal(Object.keys(before).length,1817);assert.equal(treeHash,packageReceipt.sourceTreeSha256);
 await fs.writeFile(path.join(out,'candidate-tree-before.json'),JSON.stringify(before,null,2)+'\n');
 manifest.appEntries=Object.keys(before).length;manifest.appTreeSha256Before=treeHash;manifest.matchesParentPackageReceiptBefore=true;
 manifest.indexSha256=sha(await fs.readFile(path.join(base,'plugin-src/src/lib/file-library/index.mjs')));assert.equal(manifest.indexSha256,'04c38d8bf75a47eb3c659a175084a9dcc754a54f28613a8a5dd73b3b351ab3a1');
 for(const phase of ['fresh','fault-moved','reopen-recover','restored-reopen','active-move']){
  if(phase==='fault-moved')await fs.rename(path.join(root,'合成内容库'),path.join(root,'合成内容库-暂时移动'));
  const args=phase==='active-move'?[path.join(out,'active-move.mjs'),root,out,resources]:[path.join(out,'entry.mjs'),root,phase,out,resources];
  const result=await new Promise((resolve,reject)=>{
   const chunks=[],child=spawn(electron,args,{cwd:repo,env:{...process.env,ELECTRON_RUN_AS_NODE:''},stdio:['ignore','pipe','pipe']});
   const timer=setTimeout(()=>child.kill('SIGKILL'),210000);
   for(const stream of [child.stdout,child.stderr])stream.on('data',data=>{chunks.push(data);process.stdout.write(data);});
   child.once('error',reject);child.once('close',async(code,signal)=>{clearTimeout(timer);await fs.writeFile(path.join(out,phase+'.log'),Buffer.concat(chunks));resolve({phase,pid:child.pid,code,signal});});
  });
  if(phase==='fault-moved')await fs.rename(path.join(root,'合成内容库-暂时移动'),path.join(root,'合成内容库'));
  manifest.phases.push(result);assert.equal(result.code,0,phase+' must pass');
  const receipt=JSON.parse(await fs.readFile(path.join(out,phase+'.json'),'utf8'));if(phase!=='active-move')assert.equal(receipt.passed,true);else assert.equal(receipt.recoveredWithinBound,true);
 }
 manifest.passed=true;
}catch(error){manifest.passed=false;manifest.error={message:String(error),stack:error.stack};process.exitCode=1;}
finally{
 try{const after=await snapshotPackage(candidate);manifest.appTreeSha256After=sha(JSON.stringify(after));manifest.appTreeUnchanged=manifest.appTreeSha256After===manifest.appTreeSha256Before;assert.equal(manifest.appTreeUnchanged,true);assert.equal(manifest.appTreeSha256After,packageReceipt.sourceTreeSha256);}catch(error){manifest.passed=false;manifest.finalTreeError=String(error);process.exitCode=1;}
 manifest.finishedAt=new Date().toISOString();await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify({passed:manifest.passed,phases:manifest.phases,root,appTreeUnchanged:manifest.appTreeUnchanged,error:manifest.error?.message}));
}
