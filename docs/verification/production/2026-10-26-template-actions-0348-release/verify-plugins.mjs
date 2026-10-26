import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const repo=process.cwd(),out=path.resolve(process.env.RELEASE_EVIDENCE_DIR||import.meta.dirname),resources='/Applications/自媒体工作台.app/Contents/Resources';
const {snapshotPackage}=await import(pathToFileURL(path.join(repo,'plugin-src/src/lib/package-snapshot.mjs'))),digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const release=JSON.parse(await fs.readFile(path.join(resources,'app/workbench/dist/release.json'),'utf8'));assert.equal(release.version,'0.3.48');
const bundledTree=await snapshotPackage(path.join(resources,'plugin-marketplace/nova-content-hub'));
const {installedAssistantSkill}=await import(pathToFileURL(path.join(resources,'app/workbench/dist/main/assistant-skill.mjs'))),hosts=[],checks=[];
for(const host of ['codex','workbuddy']){
 const root=path.join(os.homedir(),host==='codex'?'.codex':'.workbuddy','plugins/cache/nova-content-hub-auth-disabled-darwin-arm64/nova-content-hub/0.3.48'),tree=await snapshotPackage(root),expected=structuredClone(bundledTree),omitted=[];
 // Codex omits the unused npm command link; its target still must match the sealed payload.
 if(host==='codex'&&!tree['node_modules/.bin/semver']){assert.deepEqual(expected['node_modules/.bin/semver'],{link:'../semver/bin/semver.js'});assert.ok(tree['node_modules/semver/bin/semver.js']?.sha256);delete expected['node_modules/.bin/semver'];omitted.push('node_modules/.bin/semver');}
 assert.deepEqual(tree,expected,`${host} cached plugin differs from sealed application`);hosts.push({host,root,entries:Object.keys(tree).length,treeSha256:digest(tree),officialInstallerOmittedCommandLinks:omitted});
 for(const capability of ['cover','template']){const skill=installedAssistantSkill(host,release,{capability});assert.ok(skill);checks.push({host,capability,skill});}
}
const receipt={recordedAt:new Date().toISOString(),version:release.version,fullPayloadVerified:true,bundledPayloadTreeSha256:digest(bundledTree),bundledPayloadEntries:Object.keys(bundledTree).length,officialCliUpdates:true,hosts,checks,activeConversationReloaded:false,realGenerationRunOnThisVersion:false};
await fs.writeFile(path.join(out,'plugins.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({status:'PASS',...receipt}));
