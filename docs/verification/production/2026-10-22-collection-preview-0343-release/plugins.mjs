import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {snapshotPackage} from '../../../../plugin-src/src/lib/package-snapshot.mjs';

const out=import.meta.dirname,repo=path.resolve(out,'../../../..'),app='/Applications/自媒体工作台.app/Contents/Resources/app',bundled='/Applications/自媒体工作台.app/Contents/Resources/plugin-marketplace/nova-content-hub';
const read=async file=>JSON.parse(await fs.readFile(file,'utf8')),digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const release=await read(path.join(app,'workbench/dist/release.json'));assert.equal(release.version,'0.3.43');
const previous=await read(path.join(repo,'docs/verification/production/2026-10-22-desktop-interactions-0343/package.json'));
const oldRoot=path.join(previous.source,'Contents/Resources/plugin-marketplace/nova-content-hub'),oldTree=await snapshotPackage(oldRoot),bundledTree=await snapshotPackage(bundled),samePayload=digest(oldTree)===digest(bundledTree);
if(!samePayload)execFileSync(process.execPath,[path.join(out,'update-plugins.mjs')],{stdio:'inherit'});
const {installedAssistantSkill}=await import(path.join(app,'workbench/dist/main/assistant-skill.mjs')),checks=[],hosts=[];
for(const host of ['codex','workbuddy']){
 const root=path.join(os.homedir(),host==='codex'?'.codex':'.workbuddy','plugins/cache/nova-content-hub-auth-disabled-darwin-arm64/nova-content-hub/0.3.43'),tree=await snapshotPackage(root),expected=structuredClone(bundledTree),omitted=[];
 // Codex's official installer omits this unused npm command symlink; its target remains byte-verified.
 if(host==='codex'&&!tree['node_modules/.bin/semver']){assert.deepEqual(expected['node_modules/.bin/semver'],{link:'../semver/bin/semver.js'});assert.ok(tree['node_modules/semver/bin/semver.js']?.sha256);delete expected['node_modules/.bin/semver'];omitted.push('node_modules/.bin/semver');}
 assert.deepEqual(tree,expected,`${host} complete cached payload differs from the installed application`);
 hosts.push({host,root,treeSha256:digest(tree),entries:Object.keys(tree).length,officialInstallerOmittedCommandLinks:omitted});
 for(const capability of ['cover','template'])checks.push({host,capability,skill:installedAssistantSkill(host,release,{capability})});
}
let updates=null;try{updates=await read(path.join(out,'plugin-update.json'));}catch(error){if(error.code!=='ENOENT')throw error;}
const receipt={recordedAt:new Date().toISOString(),version:release.version,fullPayloadVerified:true,bundledPayloadMatchesPrevious:samePayload,bundledPayloadTreeSha256:digest(bundledTree),bundledPayloadEntries:Object.keys(bundledTree).length,officialCliUpdates:!samePayload,hostConfigurationModified:!samePayload,updates,hosts,checks,activeConversationReloaded:false,realGenerationRunOnThisVersion:false};
await fs.writeFile(path.join(out,'plugins.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({status:'PASS',...receipt}));
