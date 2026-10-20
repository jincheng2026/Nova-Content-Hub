import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const out=path.dirname(fileURLToPath(import.meta.url)),read=async name=>JSON.parse(await fs.readFile(path.join(out,name),'utf8'));
const result={at:new Date().toISOString(),scope:'Native red/green contrast under repository Electron app.isPackaged=false. Both report frozen release version 0.3.27; green is a single source-file overlay in a disposable app copy, not an installed release.',scenarios:{}};
for(const mode of ['red','green']){
 const manifest=await read(mode+'-manifest.json'),native=await read(mode+'-native.json');
 assert.equal(manifest.expectedOutcomeVerified,true);assert.equal(manifest.installedAppUnchanged,true);assert.equal(manifest.copiedAppUnchangedAfterRun,true);
 assert.equal(native.version,'0.3.27');assert.equal(native.appIsPackaged,false);assert.deepEqual(native.errors,[]);
 assert.equal(native.recoveredWithinBound,mode==='green');assert.equal(manifest.process.code,mode==='red'?2:0);
 assert.deepEqual(native.before,native.after);assert.equal(native.bindingBytesUnchanged,true);assert.equal(native.businessBytesUnchanged,true);
 assert.deepEqual(native.workerBefore,native.workersAfter);assert.equal(native.originalOwnerAliveAfterRead,true);assert.ok(native.samples.every(x=>x.originalOwnerAlive));
 assert.equal(native.lockBeforeMove.owners[0].pid,native.workerBefore.mainPid);assert.deepEqual(native.activeAfterRead,[]);
 if(mode==='red'){assert.ok(native.samples.at(-1).elapsedMs>=4500);assert.ok(native.samples.every(x=>x.health.issues.some(i=>i.code==='LOCK_BUSY')));assert.equal(native.finalRead.error.code,'BUSY');}
 else{assert.equal(native.finalRead.ok,true);assert.equal(native.samples.at(-1).health.state,'healthy');assert.equal(native.finalLock.error,'ENOENT');}
 result.scenarios[mode]={manifest:mode+'-manifest.json',nativeReceipt:mode+'-native.json',exitCode:manifest.process.code,changedPaths:manifest.changedPaths,overlay:manifest.overlay,samples:native.samples.length,lastHealthElapsedMs:native.samples.at(-1).elapsedMs,mainWorkerPid:native.workerBefore.mainPid,ownerAliveAtEverySample:true,businessFiles:native.before.files,businessBytesUnchanged:true,bindingBytesUnchanged:true,readRecovered:native.finalRead.ok};
}
assert.deepEqual(await read('red-installed-tree.json'),await read('green-installed-tree.json'));
const artifacts={};for(const name of(await fs.readdir(out)).sort()){const file=path.join(out,name);if(name==='manifest.json'||!(await fs.lstat(file)).isFile())continue;artifacts[name]={bytes:(await fs.stat(file)).size,sha256:createHash('sha256').update(await fs.readFile(file)).digest('hex')};}
result.passed=true;result.installedFrozenTreeEqualBetweenModes=true;result.artifacts=artifacts;
await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({passed:true,redExit:2,greenExit:0,scope:'single-file source overlay only; not installed-package acceptance'}));
