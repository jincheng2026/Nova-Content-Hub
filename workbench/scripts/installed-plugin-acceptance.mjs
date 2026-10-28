// Read-only installed-package and host-cache verification; no model invocation.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {snapshotPackage} from '../../plugin-src/src/lib/package-snapshot.mjs';
import {validateRuntimeDistribution} from '../../plugin-src/scripts/method-runtime-distribution.mjs';

const output=process.env.NOVA_PLUGIN_ACCEPTANCE_OUT;
assert.ok(output&&path.isAbsolute(output),'Explicit evidence file required');
const resources='/Applications/自媒体工作台.app/Contents/Resources';
const market=path.join(resources,'plugin-marketplace'),pkg=path.join(market,'nova-content-hub');
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const release=await read(path.join(resources,'app/workbench/dist/release.json'));
const expectedConfig=await read(new URL('../../release.config.json',import.meta.url));
assert.equal(release.version,expectedConfig.version);assert.equal(release.AUTH_MODE,'disabled');
assert.equal(release.platform,process.platform);assert.equal(release.arch,process.arch);
const marketName=`nova-content-hub-auth-disabled-${process.platform}-${process.arch}`,selector=`nova-content-hub@${marketName}`;
const manifest=await read(path.join(market,'package-files.json')),snapshot=await snapshotPackage(pkg);
assert.deepEqual(snapshot,manifest.entries);assert.deepEqual(manifest.release,{...release,format:'nova-content-plugin-release'});
const integrity=await read(path.join(pkg,'integrity.json'));
for(const [file,hash] of Object.entries(integrity.hashes))assert.equal(snapshot[file]?.sha256,hash,file);
const sources=await read(path.join(pkg,'plugin-src/resources/method-sources.json'));
for(const source of sources.versions)for(const file of source.files){assert.equal(snapshot[file.installedPath]?.sha256,file.sha256,file.installedPath);}
const distribution=await validateRuntimeDistribution(pkg,{snapshot});
const report={at:new Date().toISOString(),release,marketplaceSha256:createHash('sha256').update(await fs.readFile(path.join(market,'package-files.json'))).digest('hex'),payloadEntries:Object.keys(snapshot).length,integrityFiles:Object.keys(integrity.hashes).length,sourceVersions:sources.versions.length,sourceFiles:sources.versions.reduce((sum,item)=>sum+item.files.length,0),distribution,hosts:[],runtime:[],limits:['No model, image generation, paid service or business task submission','Current assistant chat not hot-reloaded','Apple Silicon macOS only']};
const {installedAssistantSkill}=await import(pathToFileURL(path.join(resources,'app/workbench/dist/main/assistant-skill.mjs')).href);
const {launchWithAssistantRuntime}=await import(pathToFileURL(path.join(resources,'app/workbench/dist/main/assistant-runtime.mjs')).href);
function selectedRecords(value){
 if(Array.isArray(value))return value.flatMap(selectedRecords);
 if(!value||typeof value!=='object')return [];
 if(value.id===selector||value.pluginId===selector||value.name==='nova-content-hub'&&value.marketplaceName===marketName)return [value];
 return Object.values(value).flatMap(selectedRecords);
}
for(const host of ['codex','workbuddy']){
 const config=host==='codex'?process.env.CODEX_HOME||path.join(os.homedir(),'.codex'):path.join(os.homedir(),'.workbuddy');
 const env=host==='workbuddy'?{...process.env,WORKBUDDY_CONFIG_DIR:config,CODEBUDDY_CONFIG_DIR:config}:process.env;
 const binary=host==='codex'?'codex':'codebuddy';
 const records=selectedRecords(JSON.parse(execFileSync(binary,['plugin','list','--json'],{encoding:'utf8',env,timeout:60000,maxBuffer:8*1024*1024})));
 assert.equal(records.length,1);const record=records[0];assert.equal(record.version,release.version);assert.equal(record.enabled,true);
 const cache=path.join(config,'plugins/cache',marketName,'nova-content-hub',release.version);
 assert.deepEqual(await read(path.join(cache,'plugin-src/src/release.json')),{...release,format:'nova-content-plugin-release'});
 const actual=Object.fromEntries(Object.entries(await snapshotPackage(cache)).filter(([key])=>key!=='.in_use'&&!key.startsWith('.in_use/'))),expected={...snapshot};
 if(host==='codex'&&expected['node_modules/.bin/semver']?.link==='../semver/bin/semver.js'&&!actual['node_modules/.bin/semver'])delete expected['node_modules/.bin/semver'];
 assert.deepEqual(actual,expected,host+' full cache snapshot');
 report.hosts.push({host,cache,version:record.version,enabled:record.enabled,entries:Object.keys(actual).length,exactPayloadMatch:true});
 for(const capability of ['cover','template','research','writing']){
  const skill=installedAssistantSkill(host,release,{home:os.homedir(),env,capability});let reached=false;
  await launchWithAssistantRuntime(host,release,market,async()=>{reached=true;},{home:os.homedir(),env,capability});
  assert.equal(reached,true);report.runtime.push({host,capability,skill,doctorAndEmptyCallback:true});
 }
}
report.passed=true;await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
