import fs from'node:fs/promises';
import os from'node:os';
import path from'node:path';
import{fileURLToPath}from'node:url';
import{createRequire}from'node:module';
import{createHash}from'node:crypto';
import{spawn}from'node:child_process';
import assert from'node:assert/strict';
import{snapshotPackage}from'../../../../plugin-src/src/lib/package-snapshot.mjs';
const out=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(out,'../../../..'),pkg=JSON.parse(await fs.readFile(path.join(out,'../2026-10-20-library-lock-0328/package.json'),'utf8'));
const candidate=pkg.source,resources=path.join(candidate,'Contents/Resources'),root=await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()),'nova-capacity-0328-')),electron=createRequire(path.join(repo,'workbench/package.json'))('electron');
const sha=value=>createHash('sha256').update(value).digest('hex');
const manifest={root,candidate,resources,electron,at:new Date().toISOString(),preparationBudgetMs:180000,stages:[],scope:'Actual candidate 0.3.28 modules, repository Electron hidden app.isPackaged=false, evolving fresh real-disk synthetic library. Process-cold means first native library read in a new process; OS caches not flushed. No production SLA claim.',limits:['No real user library/app/TCC/cache/host changes, no image generation or imported large image set','100 manual candidate references reuse one existing true seed PNG; no claim of 100 distinct images or all 1000 contents carrying images','Full projection IPC followed by renderer-side substring filtering; no server-side query/index API introduced','One save per stage; only that content and new transaction files may differ; other existing business bytes and binding must match']};
async function childRun(executable,args,label,timeout){return new Promise((resolve,reject)=>{const chunks=[],child=spawn(executable,args,{cwd:repo,env:{...process.env,ELECTRON_RUN_AS_NODE:''},stdio:['ignore','pipe','pipe']});const timer=setTimeout(()=>child.kill('SIGKILL'),timeout);for(const stream of[child.stdout,child.stderr])stream.on('data',data=>chunks.push(data));child.once('error',reject);child.once('close',async(code,signal)=>{clearTimeout(timer);await fs.writeFile(path.join(out,label+'.log'),Buffer.concat(chunks));resolve({code,signal,pid:child.pid});});});}
try{
 const before=await snapshotPackage(candidate);manifest.appEntries=Object.keys(before).length;manifest.appTreeSha256Before=sha(JSON.stringify(before));assert.equal(manifest.appEntries,1817);assert.equal(manifest.appTreeSha256Before,pkg.sourceTreeSha256);await fs.writeFile(path.join(out,'candidate-tree-before.json'),JSON.stringify(before,null,2)+'\n');
 let preparationMs=0;
 for(const target of[100,300,1000]){
  const remaining=180000-preparationMs;if(remaining<=0){manifest.stopReason='Preparation budget exhausted before next stage';break;}
  const prepProcess=await childRun(process.execPath,[path.join(out,'prepare.mjs'),root,resources,String(target),String(remaining),out],'prepare-'+target,remaining+10000);assert.equal(prepProcess.code,0,'Preparation failed');
  const prepared=JSON.parse(await fs.readFile(path.join(out,'prepare-'+target+'.json'),'utf8'));preparationMs+=prepared.preparationMs;
  const nativeProcess=await childRun(electron,[path.join(out,'native.mjs'),root,resources,String(target),out],'native-'+target,190000);
  const stage={target,actualContents:prepared.actualContents,actualCollections:prepared.actualCollections,plans:prepared.plans,preparationMs:prepared.preparationMs,prepProcess,nativeProcess};manifest.stages.push(stage);assert.equal(nativeProcess.code,0,'Native measurement failed at '+target);
  const native=JSON.parse(await fs.readFile(path.join(out,'native-'+target+'.json'),'utf8'));assert.equal(native.passed,true);
  if(prepared.actualContents<target||prepared.budgetReached){manifest.stopReason='Preparation budget reached; measured actual attained disk size';break;}
  if(native.metrics.some(x=>x.ms>15000)){manifest.stopReason='Measurement bounded at >15s individual native wait; this is an execution guard, not a user performance SLA';break;}
 }
 manifest.totalPreparationMs=preparationMs;manifest.measurementsCompleted=true;
}catch(error){manifest.error={message:String(error),stack:error.stack};process.exitCode=1;}
finally{const after=await snapshotPackage(candidate);manifest.appTreeSha256After=sha(JSON.stringify(after));manifest.appTreeUnchanged=manifest.appTreeSha256After===manifest.appTreeSha256Before;if(!manifest.appTreeUnchanged)process.exitCode=1;manifest.finishedAt=new Date().toISOString();await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify(manifest));}
