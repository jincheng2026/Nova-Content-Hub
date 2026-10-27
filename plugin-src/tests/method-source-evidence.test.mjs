import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {assertArtifactSafe,releaseSourceFilter} from '../scripts/artifact-safety.mjs';
function fixture(t,body='{"source":"synthetic method test"}'){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'method-evidence-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const pkg=path.join(root,'nova-content-hub'),relative='skills/jc-demo/upstream/current/tests/fixture.json',file=path.join(pkg,relative),manifest=path.join(pkg,'plugin-src/resources/method-sources.json');
 fs.mkdirSync(path.dirname(file),{recursive:true});fs.mkdirSync(path.dirname(manifest),{recursive:true});fs.writeFileSync(file,body);
 fs.writeFileSync(manifest,JSON.stringify({format:'nova-method-sources',schemaVersion:1,versions:[{executable:false,files:[{installedPath:relative,sha256:createHash('sha256').update(body).digest('hex')}]}]}));
 return {root,file};
}
test('nested marketplace permits only hash-registered immutable original test evidence',async t=>{
 const {root,file}=fixture(t);assert.equal(releaseSourceFilter(file),true);await assertArtifactSafe(root);
 fs.writeFileSync(file,'changed source bytes');await assert.rejects(assertArtifactSafe(root),error=>error.code==='ARTIFACT_UNSAFE'&&error.findings.some(item=>item.rule==='USER_DATA_OR_FIXTURE'));
});
test('a source evidence manifest cannot waive credential screening',async t=>{
 const {root}=fixture(t,JSON.stringify({example:'sk-proj-'+'A'.repeat(30)}));
 await assert.rejects(assertArtifactSafe(root),error=>error.code==='ARTIFACT_UNSAFE'&&error.findings.some(item=>item.rule==='PROVIDER_KEY'));
});
test('unregistered app fixtures and machine files remain excluded',async t=>{
 const {root}=fixture(t),own=path.join(root,'tests/user.json');fs.mkdirSync(path.dirname(own));fs.writeFileSync(own,'{}');
 assert.equal(releaseSourceFilter(own),false);assert.equal(releaseSourceFilter(path.join(root,'skills/jc-demo/upstream/current/tests/credentials.json')),false);
 await assert.rejects(assertArtifactSafe(root),{code:'ARTIFACT_UNSAFE'});
});
