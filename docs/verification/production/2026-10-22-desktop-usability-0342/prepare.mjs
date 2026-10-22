import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

const out=import.meta.dirname,root=path.resolve(out,'../../../..');
const read=async file=>JSON.parse(await fs.readFile(path.join(root,file),'utf8'));
const config=await read('release.config.json');
assert.equal(config.version,'0.3.42');assert.equal(config.AUTH_MODE,'disabled');
const versions=[];
for(const file of ['package.json','workbench/package.json','release.config.json','package-lock.json','workbench/package-lock.json']){
 const value=await read(file);assert.equal(value.version,config.version);
 if(value.packages)assert.equal(value.packages[''].version,config.version);
 versions.push({file,version:value.version,...(value.packages?{lockRootVersion:value.packages[''].version}:{})});
}
const context={window:{}};vm.runInNewContext(await fs.readFile(path.join(root,'workbench/prototype/build-config.js'),'utf8'),context);
const pairId=`${config.appScope}@${config.version}:p${config.protocolVersion}:${config.AUTH_MODE}`;
assert.equal(context.window.NCH_BUILD.version,config.version);assert.equal(context.window.NCH_BUILD.pairId,pairId);assert.equal(context.window.NCH_BUILD.bundleId,pairId);
const receipt={recordedAt:new Date().toISOString(),status:'PREPARED_NOT_FROZEN',version:config.version,sourceCommitAtPreparation:execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceFrozen:false,sourceAndReviewsInFlight:true,target:{platform:'darwin',arch:'arm64',channel:'preview',AUTH_MODE:'disabled',productionReady:false},versions,generatedPrototype:{file:'workbench/prototype/build-config.js',version:config.version,pairId},existingTools:{distribution:'workbench/scripts/dist.mjs',nativePayload:'workbench/scripts/native-payload.mjs',delivery:'workbench/scripts/export-colleague-delivery.mjs',packageSnapshot:'plugin-src/src/lib/package-snapshot.mjs',transactionalInstaller:'workbench/src/main/mac-installation.mts'},pendingPhases:['root tests and source review','root authorization to commit/freeze','clean committed native payload and DMG build','frozen artifact/delivery verification','root normal-quit verification','fresh actual-binding library backup','transaction installation and paired-plugin update','root Finder/native acceptance and bounded final integrity'],buildExecuted:false,applicationAccessed:false,userLibraryAccessed:false,machineBindingAccessed:false,pluginsModified:false};
await fs.writeFile(path.join(out,'preparation.json'),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({status:receipt.status,version:config.version,versionEntriesVerified:6,lockRootsVerified:2,pairId,buildExecuted:false,userLibraryAccessed:false}));
