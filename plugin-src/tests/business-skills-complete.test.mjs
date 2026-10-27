import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const source=fileURLToPath(new URL('../',import.meta.url));
const registry=()=>JSON.parse(fs.readFileSync(path.join(source,'resources/business-skills.json'),'utf8'));
const sources=()=>JSON.parse(fs.readFileSync(path.join(source,'resources/method-sources.json'),'utf8'));

test('complete upstream methods are byte-addressed and every bundled resource is verified',()=>{
 const manifest=sources();
 assert.equal(manifest.format,'nova-method-sources');
 assert.equal(manifest.schemaVersion,1);
 assert.ok(manifest.versions.length>=35);
 const files=new Set();
 for(const version of manifest.versions){
  assert.ok(['current','public-snapshot','historical','draft','disabled'].includes(version.sourceStatus));
  assert.equal(version.executable,false);
  assert.ok(version.files.length);
  for(const item of version.files){
   assert.match(item.installedPath,/^skills\/[a-z0-9-]+\/upstream\//);
   assert.equal(files.has(item.installedPath),false,item.installedPath);files.add(item.installedPath);
   const data=fs.readFileSync(path.join(source,item.installedPath));
   assert.equal(data.length,item.bytes,item.installedPath);
   assert.equal(createHash('sha256').update(data).digest('hex'),item.sha256,item.installedPath);
  }
 }
});

test('discovered adapters require their full method and do not claim legacy service installation',()=>{
 const manifest=sources();
 for(const method of registry().methods){
  assert.equal(method.runtimeStatus,'contract-unverified',method.id);
  if(method.id==='xindao-xuanti')continue;
  const entry=fs.readFileSync(path.join(source,'skills',method.id,'SKILL.md'),'utf8');
  assert.match(entry,/完整/);
  assert.match(entry,/upstream\/current\/METHOD\.md/);
  assert.match(entry,/method-adaptation-contract\.md/);
  const version=manifest.versions.find(v=>v.versionId===method.sourceVersion);
  assert.ok(version,method.id);
  assert.ok(version.files.some(f=>f.installedPath===method.methodBody));
 }
});

test('topic selection keeps direct conversation and fixed task modes',()=>{
 const entry=fs.readFileSync(path.join(source,'skills/xindao-xuanti/SKILL.md'),'utf8');
 const contract=fs.readFileSync(path.join(source,'resources/business-skills-contract.md'),'utf8');
 assert.match(entry,/直接对话模式/);assert.match(entry,/工作台任务模式/);
 assert.match(contract,/直接对话/);assert.match(contract,/不.*claim/);
 const method=registry().methods.find(m=>m.id==='xindao-xuanti');
 assert.deepEqual(method.modes,['direct-conversation','workbench-task']);
 assert.equal(method.constraints.budget,0);
});

test('explicit tutorial gates and research/comment methods remain in complete original bodies',()=>{
 const read=id=>fs.readFileSync(path.join(source,'skills',id,'upstream/current/METHOD.md'),'utf8');
 const tutorial=read('jc-jiaocheng-video');
 assert.match(tutorial,/先确认叙事/);assert.match(tutorial,/最需要用户判断的一段/);assert.match(tutorial,/锦成的口气/);
 const adapter=fs.readFileSync(path.join(source,'skills/jc-jiaocheng-video/SKILL.md'),'utf8');
 assert.match(adapter,/显式/);
 assert.match(read('jc-media-research'),/schema_version: 2/);
 assert.ok(fs.existsSync(path.join(source,'skills/jc-media-research/upstream/current/references/data-contract.md')));
 assert.match(read('jc-comment-visualize'),/机检 L4/);
 assert.match(read('jc-comment-visualize'),/机检 L3/);
 assert.match(read('jc-comment-visualize'),/findings/);
 assert.ok(fs.existsSync(path.join(source,'skills/jc-gongzuotai-write/upstream/current/schema/creation-page.md')));
});

test('archive-only sources never become active routes, and sources grant no external execution authority',()=>{
 const current=registry();
 for(const item of current.archived)assert.equal(current.methods.some(m=>m.id===item.id),false,item.id);
 const contract=fs.readFileSync(path.join(source,'resources/method-adaptation-contract.md'),'utf8');
 for(const term of ['旧路径','付费','自动发布','安装','只读','CAS','waiting-user'])assert.ok(contract.includes(term),term);
 const manifest=sources();
 assert.ok(manifest.versions.some(v=>v.sourceRelativePath.includes('shengcai-pattern-extractor')));
 assert.ok(manifest.versions.some(v=>v.sourceRelativePath.includes('候选改动')&&v.sourceStatus==='draft'));
});


test('critical current bodies retain the independently frozen original hashes',()=>{
 const expected={
  'jc-jiaocheng-video':'8326aec447cb',
  'jc-video-analysis':'5761d7924345',
  'jc-media-research':'1a341e7f978ef9fca52ad9ab1d8c822b8e78c0efde44aab7b5dd55852892969e',
  'jc-comment-visualize':'add2cd7a79b31a77605291b5ab60c016c0f225ffd4dfd409e824c58efbbc4fe2',
  'jc-gongzuotai-write':'6f1ea36da090',
  'xindao-interview':'0baf910775f5a6470f15da32236dc0a706d79af93cfaa5a9e6b69b2bcd6b0d8b',
 };
 for(const [id,sha] of Object.entries(expected)){
  const data=fs.readFileSync(path.join(source,'skills',id,'upstream/current/METHOD.md'));
  assert.ok(createHash('sha256').update(data).digest('hex').startsWith(sha),id);
 }
 const zipFiles={
  'SKILL.md':'84189cd06fd9fdb4d5972380e2aecfa07d5e919ca97ec44c5748281486e6601d',
  'manifest.json':'752a933eb20a75e5047f596363e2f6b05d089c2d53bfebcf2334c58f7b0f18b0',
  'references/candidate-menu.md':'fd8c56d6326843e37edc8ec423a2c547e16353886efaa7942edb1c593d675ce3',
  'references/material-intake.md':'d360a94c47b474a39d728652b938a4965f4a5eb094fb25ce912ac14860ae2995',
  'references/topic-expansion.md':'5af70b8cb10527f0ccfbe9978789a16ed1a3adbb83b37cfe93fd1b133ab2f027',
 };
 for(const [file,sha] of Object.entries(zipFiles)){
  const entry=fs.readFileSync(path.join(source,'skills/xindao-xuanti',file));
  const raw=fs.readFileSync(path.join(source,'skills/xindao-xuanti/upstream/current',file==='SKILL.md'?'METHOD.md':file));
  assert.equal(createHash('sha256').update(entry).digest('hex'),sha,file);
  assert.deepEqual(entry,raw,file);
 }
});
