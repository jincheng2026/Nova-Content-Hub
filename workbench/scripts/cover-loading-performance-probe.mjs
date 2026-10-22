// Synthetic library only. Timings include the real controller / worker implementation.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {createHash, randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {createLibrary, openLibrary, __testing} from '../../plugin-src/src/lib/file-library/index.mjs';
import {snapshotPackage} from '../../plugin-src/src/lib/package-snapshot.mjs';
import {execute} from '../src/main/worker.mts';
import {DesktopController} from '../src/main/controller.mts';
import {emptyBinding} from '../src/main/bindings.mts';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {errorInfo} from '../src/shared/contracts.ts';
import {forgetBoundReader} from '../src/main/bound-reader.mts';

process.env.NODE_ENV = 'test';
const [output, fixtureFile, budgetArg] = process.argv.slice(2);
assert.ok(output && path.isAbsolute(output), 'Provide an absolute output JSON path');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
let fixture;
if (fixtureFile) {const saved = JSON.parse(await fsp.readFile(fixtureFile, 'utf8')); fixture = saved.fixture ?? saved;}
else {
  const root = await fsp.mkdtemp(path.join(await fsp.realpath(os.tmpdir()), 'nch-cover-loading-'));
  const library = createLibrary(path.join(root, 'library')), resources = {};
  // Deterministic, incompressible original rasters, rather than tiny solid-colour stand-ins.
  const raw = Buffer.alloc(1086 * 1448 * 3); let seed = 1729;
  for (let i = 0; i < raw.length; i++) {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; raw[i] = seed & 255;}
  const hashes = [];
  for (let i = 0; i < 4; i++) {
    raw[i] ^= 1;
    const bytes = await sharp(raw, {raw: {width: 1086, height: 1448, channels: 3}}).png().toBuffer();
    const source = path.join(root, `original-${i}.png`); await fsp.writeFile(source, bytes);
    const asset = library.importAsset(source, {purpose: 'template-reference'}); hashes.push(asset.assetHash);
    resources[`sample-${i}`] = {assetHash: asset.assetHash, bytes: asset.bytes, detectedType: asset.detectedType, role: 'style'};
  }
  const template = library.createTemplate({name: 'performance synthetic', definition: {}, resources});
  const content = library.createContent({title: '合成性能内容', body: '固定正文；不访问用户内容库。'});
  for (let i = 0; i < 6; i++) {
    const input = {template: {id: template.id, version: 1}, styleAssetHashes: hashes, photo: null, materialIds: [], prompt: `synthetic ${i}`, pixels: {width: 1086, height: 1448}, ratio: '3:4', count: 4, outputFormat: 'png', scope: 'cover-only'};
    const requested = library.createCoverRequest(content.id, input, library.readContent(content.id).editToken);
    const created = library.createCoverAttempt(content.id, requested.request.requestId, {host: 'codex', reason: 'initial'});
    const context = library.readCoverContext(content.id, requested.request.requestId, created.attempt.attemptId);
    library.claimCoverAttempt(content.id, requested.request.requestId, created.attempt.attemptId, {host: 'codex', readAssetHashes: hashes});
    const files = [];
    for (let n = 0; n < hashes.length; n++) {const name = `result-${n}.png`; await fsp.copyFile(path.join(root, `original-${n}.png`), path.join(context.inbox, name)); files.push({name, sha256: hashes[n]});}
    await library.commitCoverAttempt(content.id, requested.request.requestId, created.attempt.attemptId, {libraryId: library.info.libraryId, contentId: content.id, requestId: requested.request.requestId, attemptId: created.attempt.attemptId, requestHash: requested.request.requestHash, resultId: randomUUID(), files});
  }
  fixture = {binding: {root: library.info.root, libraryId: library.info.libraryId, rootIdentity: library.info.rootIdentity}, contentId: content.id, hashes, jobs: 6, candidates: 24, originals: 4, originalBytes: raw.length, imageDimensions: [1086, 1448]};
}
assert.ok(fixture.binding.root.includes('nch-cover-loading-'), 'Only this probe synthetic fixture is accepted');
const before = await snapshotPackage(fixture.binding.root);
const counters = {opens: 0, assets: 0, assetBytes: 0, snapshots: 0, snapshotBytes: 0, locks: 0, requests: {}};
const fdPaths = new Map(), original = {openSync: fs.openSync, closeSync: fs.closeSync, readFileSync: fs.readFileSync};
fs.openSync = function(file, ...args) {const fd = Reflect.apply(original.openSync, this, [file, ...args]); fdPaths.set(fd, file); return fd;};
fs.closeSync = function(fd) {try {return Reflect.apply(original.closeSync, this, [fd]);} finally {fdPaths.delete(fd);}};
fs.readFileSync = function(file, ...args) {
  const result = Reflect.apply(original.readFileSync, this, [file, ...args]), filename = typeof file === 'number' ? fdPaths.get(file) : file;
  if (typeof filename === 'string' && filename.startsWith(fixture.binding.root + path.sep)) {
    const bytes = Buffer.byteLength(result);
    if (filename.includes(`${path.sep}资产${path.sep}`)) {counters.assets++; counters.assetBytes += bytes;}
    if (filename.includes(`${path.sep}输入${path.sep}`)) {counters.snapshots++; counters.snapshotBytes += bytes;}
  }
  return result;
};
__testing.setHook(event => {if (event.phase === 'afterOpenValidation' && event.root === fixture.binding.root) counters.opens++; if (event.phase === 'afterOwnerWrite') counters.locks++;});
const worker = {call(op, args) {counters.requests[op] = (counters.requests[op] ?? 0) + 1; return execute(op, args, 'disabled');}};
const controller = new DesktopController({worker, store: {}, documents: path.dirname(fixture.binding.root), authMode: 'disabled', dialogs: {}});
controller.binding = {...emptyBinding(), current: fixture.binding};
const covers = controller.covers;
const measurements = [];
async function measure(label, run) {const start = performance.now(), prior = structuredClone(counters); const result = await run(); const durationMs = performance.now() - start; measurements.push({label, durationMs, counts: Object.fromEntries(Object.keys(counters).filter(k => k !== 'requests').map(k => [k, counters[k] - prior[k]])), requests: Object.fromEntries(Object.entries(counters.requests).map(([k, v]) => [k, v - (prior.requests[k] ?? 0)]).filter(([, v]) => v))}); return result;}
try {
  forgetBoundReader();
  for (const visit of ['first', 'repeat']) {
    const view = await measure(`${visit}-readCover`, () => covers.readCover({contentId: fixture.contentId}));
    assert.equal(view.candidates.length, fixture.candidates); assert.equal(view.jobs.length, fixture.jobs);
    await measure(`${visit}-all-visible-originals`, async () => {
      const responses = await Promise.all(view.candidates.map(candidate => covers.resource(candidate.url)));
      for (let i = 0; i < responses.length; i++) assert.equal(hash(responses[i].data), view.candidates[i].assetHash);
    });
  }
  const appSource = await fsp.readFile(new URL('../src/renderer/app.tsx', import.meta.url), 'utf8');
  const actions = appSource.slice(appSource.indexOf('function App() {'), appSource.indexOf('    const currentCollection = library?.collections.find')) + `
    return {readCoverAutomatically, load, primeAssets: value => {workspaceAssets.current = value ? {epoch: epochRef.current, value} : null;}};
  }`;
  const slots = []; let cursor = 0;
  const context = vm.createContext({
    useMemo: calculate => calculate(),
    useState(initial) {const index = cursor++; if (!(index in slots)) slots[index] = initial; return [slots[index], value => {slots[index] = typeof value === 'function' ? value(slots[index]) : value;}];},
    useRef(initial) {const index = cursor++; return slots[index] ??= {current: initial};},
    useEffect() {}, useLayoutEffect() {}, document: {hidden: false}, hasManagedDrafts: () => false, errorInfo,
    invoke(method, args) {counters.requests[`ipc:${method}`] = (counters.requests[`ipc:${method}`] ?? 0) + 1; return controller[method](args);}
  });
  vm.runInContext(stripTypeScriptTypes(actions), context);
  const render = () => {cursor = 0; return context.App();};
  const item = await controller.readContent({id: fixture.contentId}); render().load(item);
  const assets = await controller.listCoverAssets();
  for (const hit of [false, true]) {
    render().primeAssets(hit ? assets : null);
    const result = await measure(`readCoverAutomatically-assets-cache-${hit ? 'hit' : 'miss'}`, () => render().readCoverAutomatically(fixture.contentId));
    assert.ok(result); assert.equal(result.cover.candidates.length, fixture.candidates);
    assert.equal(result.assets.templates.length, 1);
  }
} finally {Object.assign(fs, original); __testing.setHook(undefined);}
assert.deepEqual(await snapshotPackage(fixture.binding.root), before, 'Read-only display changed fixture bytes');
const result = {at: new Date().toISOString(), scope: 'Actual source Covers + execute worker; warm OS page cache; first resets bound reader and process MIME cache starts empty; repeat reuses process; no Electron transport/paint', fixture, fixtureDigest: hash(Buffer.from(JSON.stringify(before))), unchanged: true, measurements};
await fsp.writeFile(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({output, measurements}));
if (budgetArg) assert.ok(measurements.filter(m => m.label.endsWith('readCover')).every(m => m.durationMs < Number(budgetArg)), `Cover metadata latency exceeds ${budgetArg}ms`);
