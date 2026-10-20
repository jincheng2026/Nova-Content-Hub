import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const out=path.dirname(fileURLToPath(import.meta.url)),read=async name=>JSON.parse(await fs.readFile(path.join(out,name),'utf8'));
const core=await read('core-manifest.json'),active=await read('active-move.json');
assert.equal(core.passed,true);assert.equal(core.phases.length,4);assert.ok(core.phases.every(x=>x.code===0));
assert.equal(active.recoveredWithinBound,false);assert.deepEqual(active.errors,[]);assert.deepEqual(active.before,active.after);
assert.ok(active.samples.length>=2);assert.ok(active.samples.at(-1).elapsedMs>=4500);
assert.ok(active.samples.every(x=>x.activeAfter.length===0&&x.health.issues.some(i=>i.code==='LOCK_BUSY')&&x.lock.owners[0].alive&&x.lock.owners[0].token===active.lockBeforeMove.owners[0].token));
assert.ok(active.samples.slice(-3).every(x=>x.activeBefore.length===0&&x.activeAfter.length===0));
assert.equal(active.finalRead.ok,false);assert.equal(active.finalRead.error.code,'BUSY');assert.deepEqual(active.activeAfterRead,[]);
const modulesAfter={};for(const relative of Object.keys(core.installedHashesBefore))modulesAfter[relative]=createHash('sha256').update(await fs.readFile(path.join(core.resources,'app',relative))).digest('hex');
assert.deepEqual(modulesAfter,core.installedHashesBefore);
const artifacts={};for(const name of (await fs.readdir(out)).sort()){const file=path.join(out,name);if(name==='manifest.json'||!(await fs.lstat(file)).isFile())continue;artifacts[name]={bytes:(await fs.stat(file)).size,sha256:createHash('sha256').update(await fs.readFile(file)).digest('hex')};}
const manifest={at:new Date().toISOString(),status:'partial-unresolved-active-move',overallRecoveryAccepted:false,coreEvidenceAccepted:true,coreManifest:'core-manifest.json',activeMoveEvidence:'active-move.json',activeMoveExitCode:2,observationSamples:active.samples.length,idleBeforeAndAfterSamples:active.samples.filter(x=>x.activeBefore.length===0&&x.activeAfter.length===0).length,consecutiveFinalIdleSamples:3,lastHealthElapsedMs:active.samples.at(-1).elapsedMs,liveOwner:active.lockBeforeMove.owners[0],dataPreserved:true,installedResourceModulesUnchanged:true,modulesAfter,processCleanup:'Own probe app exited only after unresolved receipt was saved; owner liveness recorded during every sample, no recovery claim from cleanup.',artifacts};
await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify({evidenceValidated:true,status:manifest.status,overallRecoveryAccepted:false}));
