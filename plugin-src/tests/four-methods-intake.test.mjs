import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {businessSkillForTask} from '../src/lib/file-library/production-creator-context.mjs';
import {skillCapabilities,integrityPaths,validateSkills} from '../scripts/build.mjs';
import {validateMethodSources} from '../scripts/method-sources.mjs';
import {assertArtifactSafe} from '../scripts/artifact-safety.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const registry=JSON.parse(fs.readFileSync(path.join(root,'resources/business-skills.json'),'utf8'));
const sources=JSON.parse(fs.readFileSync(path.join(root,'resources/method-sources.json'),'utf8'));
// Independently frozen from the provided ZIP before intake, not derived from installed bytes.
const expected={
 'jc-zhuanxie':{count:6,sha:'6dc8e468cb7401efd5c484dd3042a1c4833ce5554618aa69ba74d6b9daff4414',kind:'transcription'},
 'jc-review-page':{count:3,sha:'f056186e5f6121e4bae37b2f47c0f5a82b3ca593a2466ef5fb184c2e732b89d9',kind:'writing'},
 'jc-cover-design':{count:79,sha:'df6ae7f6c94dee14fd2b625144882b8adf161e7d694db15117b360ac85a12545',kind:'packaging'},
 'jc-kepu-video':{count:532,sha:'1b87ee738c7930ad4eba515057afd765bbfb582df42749fe583d4115ff1f4323',kind:'writing'},
};
for(const [id,want] of Object.entries(expected)) test(`${id} routes only as a non-executable complete original method with immutable ZIP evidence`,()=>{
 const method=registry.methods.find(method=>method.id===id);
 assert.ok(method,`${id} method route missing`);
 assert.equal(method.executor,'nova-content-writing-execution');
 assert.equal(method.runtimeStatus,'contract-unverified');
 assert.equal(method.executable,false);
 assert.equal(registry.unavailable.some(item=>item.id===id),false);
 assert.equal(businessSkillForTask(want.kind,{businessSkill:id}).id,id);
 const version=sources.versions.find(version=>version.versionId===method.sourceVersion);
 assert.equal(version.selected,true);assert.equal(version.executable,false);
 assert.equal(version.files.length,want.count);
 assert.equal(version.archive.sha256,'b050faa629c7f201e7a7fd4a31c7aaa0bf826fbd3198edae8cac7891cbc9dd52');
 const body=fs.readFileSync(path.join(root,method.methodBody));
 assert.equal(createHash('sha256').update(body).digest('hex'),want.sha);
 const tracked=new Set(integrityPaths());
 for(const file of version.files) {
  assert.ok(tracked.has(file.installedPath),file.installedPath);
  assert.equal(path.basename(file.installedPath)==='SKILL.md',false);
  assert.equal(fs.lstatSync(path.join(root,file.installedPath)).isSymbolicLink(),false);
  if(/\.(?:py|sh|mjs|js)$/.test(file.sourcePath)) {assert.equal(file.executable,false);assert.equal(fs.statSync(path.join(root,file.installedPath)).mode&0o111,0);}
 }
 for(const mode of ['required','disabled'])assert.equal(skillCapabilities(mode)[id].executable,false);
});
test('new method registration preserves ordinary writing/transcription defaults and isolates actual cover generation',()=>{
 assert.ok(registry.methods.find(method=>method.id==='jc-kepu-video'),'explicit science method missing');
 assert.ok(registry.routing.explicitOnly.includes('jc-kepu-video'));
 assert.equal(businessSkillForTask('writing',{}).id,'nova-workbench-writing-method');
 assert.equal(businessSkillForTask('transcription',{}).id,'jc-benchmark-intake');
 const cover=registry.methods.find(method=>method.id==='jc-cover-design');
 assert.equal(cover.generationExecutor,'nova-content-cover-execution');
 assert.equal(cover.generationHandoff,'separate-fixed-cover-request');
 assert.equal(cover.executor,'nova-content-writing-execution');
 assert.ok(sources.externalDependencies.some(item=>item.name==='jc-qiepian-chupian/scripts/transcribe_chars.mjs'&&item.status==='referenced-not-obtained'));
});
test('four-method source manifests and installed references pass the existing validators',async()=>{
 assert.ok(registry.methods.find(method=>method.id==='jc-zhuanxie'),'intake not registered');
 const result=validateMethodSources(root);assert.ok(result.files>=620);
 await validateSkills();
 assert.match(fs.readFileSync(path.join(root,'skills/jc-cover-design/upstream/current/LICENSE'),'utf8'),/MIT License/);
 assert.ok(fs.statSync(path.join(root,'resources/business-skills.json')).size<256*1024,'runtime registry byte limit');
});
test('the four bundled method trees pass the existing artifact credential and local-state gate',async t=>{
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'nova-four-method-artifact-'));
 t.after(()=>fs.rmSync(temporary,{recursive:true,force:true}));
 fs.mkdirSync(path.join(temporary,'resources'),{recursive:true});
 fs.copyFileSync(path.join(root,'resources/method-sources.json'),path.join(temporary,'resources/method-sources.json'));
 for(const id of Object.keys(expected))fs.cpSync(path.join(root,'skills',id),path.join(temporary,'skills',id),{recursive:true});
 assert.deepEqual(await assertArtifactSafe(temporary),{safe:true});
});
test('cover source references resolve relative to their source file and unwrap Markdown angle destinations',()=>{
 const method=registry.methods.find(method=>method.id==='jc-cover-design');
 const version=sources.versions.find(version=>version.versionId===method.sourceVersion);
 const bundled=new Set(version.files.map(file=>file.sourcePath));
 assert.equal(version.references.length,26);
 for(const reference of version.references){
  const destination=reference.target.replace(/^<|>$/g,'');
  const resolved=path.posix.normalize(path.posix.join(path.posix.dirname(reference.from),destination));
  assert.ok(bundled.has(resolved),resolved);
  assert.equal(reference.status,'bundled',`${reference.from} -> ${reference.target}`);
 }
});
