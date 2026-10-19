// Compare a frozen app's core with current seed sources in separate disposable Electron copies.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import electron from 'electron';
import {snapshotPackage} from '../../plugin-src/src/lib/package-snapshot.mjs';

const [resources, library, output, mode] = process.argv.slice(2);
assert.ok([resources, library, output].every(v => v && path.isAbsolute(v)) && ['baseline', 'current'].includes(mode), 'Provide absolute app Resources, source library, output JSON, and baseline|current');
const repo = fileURLToPath(new URL('../../', import.meta.url));
const root = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'nova-seed-electron-'));
const source = path.join(resources, 'app'), before = await snapshotPackage(source), libraryBefore = await snapshotPackage(library);
await fs.cp(source, path.join(root, 'app'), {recursive: true});
await fs.cp(path.join(resources, 'plugin-marketplace'), path.join(root, 'plugin-marketplace'), {recursive: true});
await fs.cp(library, path.join(root, 'library'), {recursive: true});
assert.deepEqual(await snapshotPackage(path.join(root, 'app')), before);
assert.deepEqual(await snapshotPackage(path.join(root, 'library')), libraryBefore);
const overlays = {};
if (mode === 'current') for (const relative of ['plugin-src/src/lib/file-library/index.mjs', 'plugin-src/src/lib/library-seed/index.mjs']) {
    const bytes = await fs.readFile(path.join(repo, relative));
    overlays[relative] = createHash('sha256').update(bytes).digest('hex');
    await fs.writeFile(path.join(root, 'app', relative), bytes);
}
const entry = path.join(root, 'app/workbench/dist/main/installed-capacity-entry.mjs');
await fs.copyFile(path.join(repo, 'workbench/scripts/installed-capacity-entry.mjs'), entry);
const lines = [];
const code = await new Promise((resolve, reject) => {
    const child = spawn(electron, [entry], {cwd: path.join(root, 'app'), env: {...process.env, ELECTRON_RUN_AS_NODE: '', NOVA_INSTALLED_CAPACITY_ROOT: root, NOVA_INSTALLED_CAPACITY_STARTED: String(Date.now())}, stdio: ['ignore', 'pipe', 'pipe']});
    const timer = setTimeout(() => child.kill('SIGKILL'), 240000);
    for (const stream of [child.stdout, child.stderr]) stream.on('data', data => { lines.push(String(data)); process.stdout.write(data); });
    child.once('error', error => {clearTimeout(timer); reject(error);});
    child.once('close', code => {clearTimeout(timer); resolve(code);});
});
const receipt = JSON.parse(await fs.readFile(path.join(root, 'receipt.json'), 'utf8'));
assert.deepEqual(await snapshotPackage(source), before, 'Frozen app source changed');
assert.deepEqual(await snapshotPackage(library), libraryBefore, 'Source fixture changed');
const after = await snapshotPackage(path.join(root, 'app'));
delete after['workbench/dist/main/installed-capacity-entry.mjs'];
for (const [relative, sha256] of Object.entries(overlays)) { assert.equal(after[relative].sha256, sha256); after[relative] = before[relative]; }
assert.deepEqual(after, before, 'Unexpected copied runtime changes');
const result = {mode, at: new Date().toISOString(), scope: 'Frozen 0.3.18 app copy with test entry; current mode overlays only two explicitly hashed core modules. Repository pinned Electron, independent user-data/library, dialogs stubbed, warm cache. Not installed/native manual acceptance.', root, sourceUnchanged: true, sourceLibraryUnchanged: true, sourceFiles: Object.keys(before).length, overlays, processExitCode: code, ...receipt};
await fs.writeFile(output, JSON.stringify(result, null, 2) + '\n');
await fs.writeFile(output.replace(/\.json$/, '.log'), lines.join(''));
assert.equal(code, 0); assert.equal(result.passed, true);
console.log(JSON.stringify({output, mode, passed: true, root}));
