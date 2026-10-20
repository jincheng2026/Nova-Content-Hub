import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {snapshotPackage} from '../../../../plugin-src/src/lib/package-snapshot.mjs';
const [mode]=process.argv.slice(2);assert.ok(['red','green'].includes(mode));
const out=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(out,'../../../..');
const installed='/Applications/自媒体工作台.app/Contents/Resources/app',relative='plugin-src/src/lib/file-library/index.mjs';
const root=await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()),'nova-lock-recovery-'+mode+'-')),copy=path.join(root,'app');
const electron=createRequire(path.join(repo,'workbench/package.json'))('electron');
const receipt={mode,root,installed,copiedApp:copy,electron,at:new Date().toISOString(),scope:'Full frozen installed 0.3.27 app resource copy in os.tmpdir. Development Electron app.isPackaged=false. Green overlays only source file-library/index.mjs. No new package/version/install claim; no real app/TCC/config/library access.',overlay:null};
try{
 const before=await snapshotPackage(installed);await fs.writeFile(path.join(out,mode+'-installed-tree.json'),JSON.stringify(before,null,2)+'\n');
 await fs.cp(installed,copy,{recursive:true,verbatimSymlinks:true});assert.deepEqual(await snapshotPackage(copy),before);
 if(mode==='green'){
  const bytes=await fs.readFile(path.join(repo,relative));receipt.overlay={relative,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),frozenSha256:before[relative].sha256};
  assert.equal(receipt.overlay.sha256,'04c38d8bf75a47eb3c659a175084a9dcc754a54f28613a8a5dd73b3b351ab3a1','Green must use the explicitly frozen reviewed source');assert.notEqual(receipt.overlay.sha256,receipt.overlay.frozenSha256,'Green source must differ from frozen red');await fs.writeFile(path.join(out,'green-overlay-index.mjs.txt'),bytes);await fs.writeFile(path.join(copy,relative),bytes);
 }
 const expected=structuredClone(before);if(receipt.overlay)expected[relative]={...before[relative],bytes:receipt.overlay.bytes,sha256:receipt.overlay.sha256};
 const copiedBefore=await snapshotPackage(copy);assert.deepEqual(copiedBefore,expected);
 receipt.changedPaths=Object.keys(before).filter(key=>JSON.stringify(before[key])!==JSON.stringify(copiedBefore[key]));assert.deepEqual(receipt.changedPaths,mode==='green'?[relative]:[]);
 receipt.installedEntries=Object.keys(before).length;receipt.copiedEntries=Object.keys(copiedBefore).length;
 receipt.process=await new Promise((resolve,reject)=>{
  const chunks=[],child=spawn(electron,[path.join(out,'native-entry.mjs'),root,out,mode],{cwd:repo,env:{...process.env,ELECTRON_RUN_AS_NODE:''},stdio:['ignore','pipe','pipe']});
  const timer=setTimeout(()=>child.kill('SIGKILL'),180000);
  for(const stream of [child.stdout,child.stderr])stream.on('data',data=>chunks.push(data));
  child.once('error',reject);child.once('close',async(code,signal)=>{clearTimeout(timer);await fs.writeFile(path.join(out,mode+'.log'),Buffer.concat(chunks));resolve({pid:child.pid,code,signal});});
 });
 assert.equal(receipt.process.code,mode==='red'?2:0,'Native scenario returned unexpected code');
 const native=JSON.parse(await fs.readFile(path.join(out,mode+'-native.json'),'utf8'));assert.deepEqual(native.errors,[]);assert.equal(native.recoveredWithinBound,mode==='green');
 assert.deepEqual(await snapshotPackage(copy),expected,'No runtime modification to copied application tree');
 assert.deepEqual(await snapshotPackage(installed),before,'Frozen installed tree unchanged');
 receipt.copiedAppUnchangedAfterRun=true;receipt.installedAppUnchanged=true;receipt.expectedOutcomeVerified=true;
}catch(error){receipt.error={message:String(error),stack:error.stack};process.exitCode=1;}
finally{receipt.finishedAt=new Date().toISOString();await fs.writeFile(path.join(out,mode+'-manifest.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({mode,expectedOutcomeVerified:receipt.expectedOutcomeVerified,child:receipt.process,error:receipt.error?.message,root}));}
