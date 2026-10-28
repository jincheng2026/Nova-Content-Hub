import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {integrityPaths} from '../scripts/build.mjs';
import {validateMethodSources} from '../scripts/method-sources.mjs';
import {assertArtifactSafe} from '../scripts/artifact-safety.mjs';
const source = fileURLToPath(new URL('../', import.meta.url));
const prefix = 'skills/jc-cover-design/upstream/current/';
// Independently frozen from the source inventory; do not derive expected omissions from policy.
const omitted = [
 ['assets/my-face-alt.JPG', '91315cb5c301c86a8accc03cb6b08305435b4e28e95e5a91c48f168f9017afa3'],
 ['assets/my-face-neutral.JPG', '30f4f230a1ce49266785a9945c12d81db48629189df2a87785bd8b8ce880db37'],
 ['assets/my-face-studio-default.JPG', '0a3a716f69d5200c4cc6f7a127fc9c7a4720c3977e567e8d1760c7a17a9ac121'],
 ['assets/my-face.png', '045aa9b0351e64ec7f40a7f853206a6416f40b2772e0ef7db1cedc7a5565d54d'],
 ['config.md', 'd99fc8cb9dc8a85c0b87d54a69ead338b01b69ed35b5583a9e7dd7b679752ccb']
].map(([name, sha256]) => ({installedPath: prefix + name, sha256}));
const digest = value => createHash('sha256').update(value).digest('hex');
const load = async () => {
 const api = await import('../scripts/method-runtime-distribution.mjs').catch(() => ({}));
 assert.equal(typeof api.copyRuntimeMethodSkills, 'function', 'runtime source selection must have a shared copy API');
 assert.equal(typeof api.deriveRuntimeMethodSources, 'function', 'runtime source selection must derive an audited subset');
 assert.equal(typeof api.validateRuntimeDistribution, 'function', 'runtime source selection must have a package gate');
 return api;
};
async function fixture(t) {
 const api = await load(), root = fs.mkdtempSync(path.join(os.tmpdir(), 'method-runtime-'));
 t.after(() => fs.rmSync(root, {recursive: true, force: true}));
 await api.copyRuntimeMethodSkills(source, root);
 fs.mkdirSync(path.join(root, 'plugin-src/resources'), {recursive: true});
 for (const name of ['method-runtime-distribution.json', 'method-runtime-context.json', 'method-runtime-context.mjs']) fs.copyFileSync(path.join(source, 'resources', name), path.join(root, 'plugin-src/resources', name));
 fs.writeFileSync(path.join(root, 'plugin-src/resources/method-sources.json'), JSON.stringify(api.deriveRuntimeMethodSources(source), null, 2) + '\n');
 return {api, root};
}
test('integrity selects the same runtime subset while the full original evidence remains valid', () => {
 const paths = new Set(integrityPaths());
 for (const file of omitted) assert.equal(paths.has(file.installedPath), false, file.installedPath);
 for (const relative of ['METHOD.md', 'references/face-reference-policy.md', 'assets/examples/README.md']) {
  if (fs.existsSync(path.join(source, prefix, relative))) assert.ok(paths.has(prefix + relative));
 }
 assert.deepEqual(validateMethodSources(source), {versions: 58, files: 1039});
 const full = JSON.parse(fs.readFileSync(path.join(source, 'resources/method-sources.json')));
 assert.equal(full.versions.filter(version => version.sourceId === 'F').reduce((count,version) => count + version.files.length, 0), 621);
});
test('runtime copy carries 1034 unchanged source files and source provenance, preserving original methods and templates', async t => {
 const {api, root} = await fixture(t);
 const result = await api.validateRuntimeDistribution(root);
 assert.equal(result.files, 1034);
 const manifest = JSON.parse(fs.readFileSync(path.join(root, 'plugin-src/resources/method-sources.json')));
 assert.equal(manifest.format, 'nova-method-sources');
 assert.equal(manifest.distribution.sourceManifest.sha256, digest(fs.readFileSync(path.join(source, 'resources/method-sources.json'))));
 assert.equal(manifest.distribution.treeSha256Scope, 'original-source-tree');
 assert.deepEqual(manifest.distribution.omitted.map(({installedPath, sha256}) => ({installedPath, sha256})), omitted);
 assert.equal(manifest.versions.reduce((n, v) => n + v.files.length, 0), 1034);
 assert.equal(manifest.versions.filter(v => v.sourceId === 'F').reduce((n,v) => n+v.files.length,0), 616);
 for (const version of manifest.versions) for (const file of version.files) {
  assert.deepEqual(fs.readFileSync(path.join(root, file.installedPath)), fs.readFileSync(path.join(source, file.installedPath)), file.installedPath);
 }
 assert.ok(fs.statSync(path.join(root, 'skills/jc-review-page/upstream/current/assets/template.html')).size > 1000);
 await assertArtifactSafe(root);
});
test('runtime gate rejects old full-source manifests, malformed distribution, missing and altered included payloads', async t => {
 const {api, root} = await fixture(t), file = path.join(root, 'plugin-src/resources/method-sources.json');
 const original = fs.readFileSync(file);
 for (const change of [m => {delete m.distribution;}, m => {m.distribution.sourceManifest.sha256 = '0'.repeat(64);}, m => {m.distribution.omitted = [];}, m => {m.versions[0].files.pop();}]) {
  const manifest = JSON.parse(original); change(manifest); fs.writeFileSync(file, JSON.stringify(manifest));
  await assert.rejects(api.validateRuntimeDistribution(root), /distribution/i);
 }
 fs.writeFileSync(file, fs.readFileSync(path.join(source, 'resources/method-sources.json')));
 await assert.rejects(api.validateRuntimeDistribution(root), /distribution/i);
 fs.writeFileSync(file, original);
 const included = path.join(root, prefix, 'METHOD.md'), bytes = fs.readFileSync(included);
 fs.writeFileSync(included, 'tampered'); await assert.rejects(api.validateRuntimeDistribution(root), /distribution/i);
 fs.unlinkSync(included); await assert.rejects(api.validateRuntimeDistribution(root), /distribution/i);
 fs.writeFileSync(included, bytes);
 assert.equal((await api.validateRuntimeDistribution(root)).files, 1034);
});
test('all five denied paths and all five exact byte hashes fail even after rename or manifest resurrection', async t => {
 const {api, root} = await fixture(t);
 for (const [index, file] of omitted.entries()) {
  const denied = path.join(root, file.installedPath);
  fs.mkdirSync(path.dirname(denied), {recursive: true}); fs.writeFileSync(denied, 'replacement config or photo');
  await assert.rejects(api.validateRuntimeDistribution(root), /distribution/i); fs.unlinkSync(denied);
  const renamed = path.join(root, 'renamed-' + index + '.bin'); fs.copyFileSync(path.join(source, file.installedPath), renamed);
  await assert.rejects(api.validateRuntimeDistribution(root), /distribution/i); fs.unlinkSync(renamed);
 }
 const file = path.join(root, 'plugin-src/resources/method-sources.json'), manifest = JSON.parse(fs.readFileSync(file));
 const full = JSON.parse(fs.readFileSync(path.join(source, 'resources/method-sources.json')));
 manifest.versions.find(v => v.methodId === 'jc-cover-design').files = full.versions.find(v => v.methodId === 'jc-cover-design').files;
 fs.writeFileSync(file, JSON.stringify(manifest));
 await assert.rejects(api.validateRuntimeDistribution(root), /distribution/i);
});
test('unregistered upstream files cannot be copied around source validation or added to a runtime package', async t => {
 const {api, root} = await fixture(t);
 fs.writeFileSync(path.join(root, prefix, 'extra.md'), 'unregistered');
 await assert.rejects(api.validateRuntimeDistribution(root), /distribution/i);
 const sourceCopy = fs.mkdtempSync(path.join(os.tmpdir(), 'method-source-'));
 t.after(() => fs.rmSync(sourceCopy, {recursive: true, force: true}));
 fs.mkdirSync(path.join(sourceCopy, 'resources')); fs.copyFileSync(path.join(source, 'resources/method-sources.json'), path.join(sourceCopy, 'resources/method-sources.json'));
 fs.cpSync(path.join(source, 'skills'), path.join(sourceCopy, 'skills'), {recursive:true});
 fs.writeFileSync(path.join(sourceCopy, prefix, 'unexpected.md'), 'unregistered original evidence');
 await assert.rejects(api.copyRuntimeMethodSkills(sourceCopy, path.join(root, 'new-output')), /Unregistered method source payload/);
 assert.equal(fs.existsSync(path.join(root, 'new-output')), false);
});
test('cover runtime context requires this frozen request own-photo and never falls back to historical defaults or examples', async () => {
 const api = await import('../resources/method-runtime-context.mjs').catch(() => ({}));
 assert.equal(typeof api.resolveCoverMethodRuntimeContext, 'function', 'a runnable request mapping is required');
 const request = {format:'nova-cover-request',schemaVersion:1,requestId:'cover-request',requestHash:'a'.repeat(64),photo:null,inputs:[{role:'style',assetHash:'b'.repeat(64)}],ratio:'16:9',count:2,pixels:{width:1600,height:900},prompt:'本人确认约束',outputFormat:'png'};
 const waiting = api.resolveCoverMethodRuntimeContext(request);
 assert.equal(waiting.status, 'waiting-user'); assert.equal(waiting.identity, null);
 assert.equal(waiting.model, null); assert.equal(waiting.ratio, '16:9'); assert.equal(waiting.count, 2);
 assert.equal(api.resolveCoverMethodRuntimeContext(request, {requiresIdentity:false}).status, 'ready');
 for(const schemaVersion of [2,3]) assert.equal(api.resolveCoverMethodRuntimeContext({...request,schemaVersion}).status, 'waiting-user');
 const own = {id:'photo-own',assetHash:'c'.repeat(64)};
 request.photo = own; request.inputs.push({role:'material',photoId:own.id,assetHash:own.assetHash});
 assert.equal(api.resolveCoverMethodRuntimeContext(request).status, 'waiting-user');
 request.inputs.push({role:'own-photo',photoId:own.id,assetHash:own.assetHash});
 const ready = api.resolveCoverMethodRuntimeContext(request);
 assert.equal(ready.status, 'ready'); assert.deepEqual(ready.identity, own); assert.equal(ready.prompt, request.prompt);
 request.inputs.push({...request.inputs.at(-1)});
 assert.throws(() => api.resolveCoverMethodRuntimeContext(request), /identity/i);
 assert.throws(() => api.resolveCoverMethodRuntimeContext({}), /frozen/i);
});
test('runtime distribution manifest must be a regular snapshot-bound file, not a link to another valid copy', {skip:process.platform==='win32'}, async t => {
 const {api,root} = await fixture(t);
 const file = path.join(root, 'plugin-src/resources/method-sources.json');
 fs.copyFileSync(file, path.join(root, 'manifest-copy.json')); fs.unlinkSync(file); fs.symlinkSync('../../manifest-copy.json', file);
 await assert.rejects(api.validateRuntimeDistribution(root), /distribution/i);
});
