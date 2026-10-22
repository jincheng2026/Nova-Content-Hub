// Runs the built Electron utility-process transport against the source probe's synthetic library.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import electron from 'electron';
import {snapshotPackage} from '../../plugin-src/src/lib/package-snapshot.mjs';
const [fixtureFile, output] = process.argv.slice(2);
assert.ok(path.isAbsolute(fixtureFile) && path.isAbsolute(output), 'Provide absolute fixture report and output paths');
const {fixture} = JSON.parse(await fs.readFile(fixtureFile, 'utf8'));
assert.ok(fixture.binding.root.includes('nch-cover-loading-'), 'Only the performance probe synthetic fixture is accepted');
const bundle = fileURLToPath(new URL('../dist-desktop/auth-disabled', import.meta.url));
const main = path.join(bundle, 'workbench/dist/main'), releasePath = path.join(bundle, 'workbench/dist/release.json');
assert.match(await fs.readFile(path.join(main, 'cover-worker.mjs'), 'utf8'), /readCoverState/, 'Rebuild the current native worker before this probe');
const before = await snapshotPackage(fixture.binding.root), temporary = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'nch-cover-electron-'));
const entry = path.join(temporary, 'entry.mjs');
await fs.writeFile(entry, `
import {app, utilityProcess} from 'electron';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {WorkerClient} from ${JSON.stringify(pathToFileURL(path.join(main, 'worker-client.mjs')).href)};
import {DesktopController} from ${JSON.stringify(pathToFileURL(path.join(main, 'controller.mjs')).href)};
import {emptyBinding} from ${JSON.stringify(pathToFileURL(path.join(main, 'bindings.mjs')).href)};
const fixture = ${JSON.stringify(fixture)}, output = ${JSON.stringify(output)};
app.setPath('userData', ${JSON.stringify(path.join(temporary, 'user-data'))});
void app.whenReady().then(async () => {
const release = JSON.parse(await fs.readFile(${JSON.stringify(releasePath)}, 'utf8'));
const requests = {}, make = serviceName => {
  const worker = new WorkerClient(() => utilityProcess.fork(${JSON.stringify(path.join(main, 'worker.mjs'))}, [release.pairId], {serviceName, stdio: 'pipe'}));
  const call = worker.call.bind(worker);
  worker.call = (op, args) => {requests[op] = (requests[op] ?? 0) + 1; return call(op, args);};
  return worker;
};
const worker = make('Cover performance metadata'), images = make('Cover performance original images');
const controller = new DesktopController({worker, resourceWorker: images, store: {}, documents: ${JSON.stringify(temporary)}, authMode: 'disabled', dialogs: {}});
controller.binding = {...emptyBinding(), current: fixture.binding};
const measurements = [];
async function measure(label, run) {const start = performance.now(), prior = {...requests}; const result = await run(); measurements.push({label, durationMs: performance.now() - start, requests: Object.fromEntries(Object.entries(requests).map(([key, value]) => [key, value - (prior[key] ?? 0)]).filter(([, value]) => value))}); return result;}
try {
  for (const visit of ['cold-process', 'warm-process']) {
    const view = await measure(visit + '-readCover', () => controller.readCover({contentId: fixture.contentId}));
    assert.equal(view.candidates.length, fixture.candidates); assert.equal(view.jobs.length, fixture.jobs);
    await measure(visit + '-all-originals', async () => {
      const replies = await Promise.all(view.candidates.map(item => controller.covers.resource(item.url)));
      for (let i = 0; i < replies.length; i++) assert.equal(createHash('sha256').update(replies[i].data).digest('hex'), view.candidates[i].assetHash);
    });
  }
  await fs.writeFile(output, JSON.stringify({at: new Date().toISOString(), scope: 'Built Electron main + WorkerClient + two real utility processes; first includes process startup; warm OS page cache; no renderer/protocol/paint or installed package claim', platform: process.platform, arch: process.arch, versions: process.versions, pairId: release.pairId, fixture, measurements, originalHashesVerified: true}, null, 2) + '\\n');
  worker.stop(); images.stop(); app.quit();
} catch (error) {console.error(error); worker.stop(); images.stop(); app.exit(1);}
}).catch(error => {console.error(error); app.exit(1);});
`);
try {
  await new Promise((resolve, reject) => {
    const child = spawn(electron, [entry], {cwd: bundle, env: {...process.env}, stdio: 'inherit'});
    const timer = setTimeout(() => {child.kill('SIGKILL'); reject(new Error('Electron performance probe exceeded 60 seconds'));}, 60000);
    child.once('error', error => {clearTimeout(timer); reject(error);});
    child.once('close', code => {clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`Electron performance probe exited ${code}`));});
  });
  assert.deepEqual(await snapshotPackage(fixture.binding.root), before, 'Electron reads changed synthetic library bytes');
  const result = JSON.parse(await fs.readFile(output, 'utf8'));
  result.fixtureDigest = createHash('sha256').update(JSON.stringify(before)).digest('hex'); result.unchanged = true;
  result.buildFiles = {};
  for (const file of ['controller.mjs', 'covers.mjs', 'cover-worker.mjs', 'worker.mjs', 'worker-client.mjs']) result.buildFiles[file] = createHash('sha256').update(await fs.readFile(path.join(main, file))).digest('hex');
  await fs.writeFile(output, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({output, measurements: result.measurements, unchanged: true}));
} finally {await fs.rm(temporary, {recursive: true, force: true});}
