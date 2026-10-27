// Real Electron + complete renderer + native IPC. Only library selection is controlled to cancel.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import electron from 'electron';
import {build} from 'vite';
import {emptyBinding, BindingStore} from '../src/main/bindings.mts';

const workbench = fileURLToPath(new URL('../', import.meta.url));
const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'nova-selection-cancel-ui-')));
const bundle = path.join(root, 'app'), dist = path.join(bundle, 'workbench/dist'), machine = path.join(root, 'machine');
await fs.cp(path.join(workbench, 'dist-desktop/auth-disabled'), bundle, {recursive: true});
await build({configFile: false, root: path.join(workbench, 'src/renderer'), base: './', logLevel: 'warn', oxc: {jsx: {runtime: 'automatic'}}, build: {outDir: path.join(dist, 'renderer'), emptyOutDir: true, modulePreload: false, target: 'chrome148'}});
const mime = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png'}, entries = {};
for (const name of await fs.readdir(path.join(dist, 'renderer'), {recursive: true})) {
    if (!(await fs.stat(path.join(dist, 'renderer', name))).isFile()) continue;
    assert.ok(mime[path.extname(name)]);
    entries[`/${name}`] = {file: name, mime: mime[path.extname(name)]};
}
await fs.writeFile(path.join(dist, 'renderer-resources.json'), JSON.stringify({format: 'nova-desktop-renderer-resources', schemaVersion: 1, entries}));
const store = new BindingStore(path.join(machine, 'machine-binding.json'));
await store.save({...emptyBinding(), current: {root: path.join(root, 'old-library-not-accessed'), libraryId: '321c7abe-530f-4ffa-8c00-1ed42d3d8015', rootIdentity: {dev: '1', ino: '2'}}, needsReselect: true});

async function probeMain(root, startDesktop) {
    const {app, ipcMain} = await import('electron');
    const fs = await import('node:fs/promises'), path = await import('node:path'), assert = (await import('node:assert/strict')).default;
    const {createHash} = await import('node:crypto');
    const calls = [], workerCalls = [];
    const handle = ipcMain.handle.bind(ipcMain);
    ipcMain.handle = (channel, listener) => handle(channel, (...args) => {calls.push(channel); return listener(...args);});
    let selections = 0;
    const file = path.join(root, 'machine/machine-binding.json'), hash = bytes => createHash('sha256').update(bytes).digest('hex'), before = hash(await fs.readFile(file));
    startDesktop({show: false, userData: path.join(root, 'machine'), publicationObserver: false, dialogs: {library: async () => {selections++; return null;}}, async ready({window, worker, controller}) {
        const workerCall = worker.call.bind(worker);
        worker.call = (op, args) => {workerCalls.push(op); return workerCall(op, args);};
        const run = code => window.webContents.executeJavaScript(code);
        const wait = condition => run(`new Promise((resolve,reject)=>{const end=Date.now()+8000;const check=()=>{if(${condition})return resolve();if(Date.now()>end)return reject(Error('UI timeout: '+${JSON.stringify(condition)}));setTimeout(check,20)};check()})`);
        try {
            window.webContents.setBackgroundThrottling(false);
            await wait(`document.querySelector('main[data-loaded="true"][data-busy="false"]') && document.getElementById('confirm-library-access')`);
            assert.equal(controller.binding.needsReselect, true);
            const start = calls.length;
            await run(`document.getElementById('confirm-library-access').click()`);
            await wait(`document.querySelector('main[data-busy="false"]') && !document.getElementById('confirm-library-access').disabled`);
            assert.equal(selections, 1, 'real renderer click must reach controlled native selection');
            // Native cancellation restores app focus; both events must respect the selection-required state.
            await run(`window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange'));`);
            await new Promise(resolve => setTimeout(resolve, 350));
            const errors = await run(`document.getElementById('error').textContent`);
            const sourceMethods = ['readWorkspace', 'readWorkspaceLibrary', 'listContents', 'listCoverAssets'];
            const sourceCalls = calls.slice(start).filter(channel => sourceMethods.some(method => channel === 'nova:' + method));
            const after = hash(await fs.readFile(file));
            const result = {scope: 'isolated full built Electron renderer/native IPC, synthetic machine binding, only dialogs.library controlled to cancel; no installed-app or real OS panel claim', selections, calls: calls.slice(start), sourceCalls, workerCalls, errors, needsReselect: controller.binding.needsReselect, before, after};
            await fs.writeFile(path.join(root, 'result.json'), JSON.stringify(result, null, 2));
            await fs.writeFile(path.join(root, 'cancel-selection.png'), (await window.webContents.capturePage()).toPNG());
            assert.deepEqual(sourceCalls, [], 'cancel/focus must not attempt old-library reads');
            assert.deepEqual(workerCalls, [], 'cancel/focus must not reach any source worker');
            assert.equal(errors.trim(), '', 'cancel must not show LIBRARY_NOT_READY or another read error');
            assert.equal(controller.binding.needsReselect, true);
            assert.equal(before, after, 'binding bytes changed after cancel');
            console.log('PASS cancel selection UI:', JSON.stringify(result));
            app.exit(0);
        } catch (error) {console.error(error); app.exit(1);}
    }}).catch(error => {console.error(error); app.exit(1);});
}
const entry = path.join(root, 'probe-main.mjs');
await fs.writeFile(entry, `import {startDesktop} from './app/workbench/dist/main/desktop.mjs';\n(${probeMain.toString()})(${JSON.stringify(root)}, startDesktop);`);
const child = spawn(electron, [entry], {cwd: bundle, stdio: 'inherit', env: {...process.env, ELECTRON_RUN_AS_NODE: ''}});
const timer = setTimeout(() => child.kill('SIGKILL'), 60000);
const code = await new Promise((resolve, reject) => {child.once('error', reject); child.once('exit', resolve);}).finally(() => clearTimeout(timer));
console.log('Cancel selection UI evidence:', root);
assert.equal(code, 0, 'cancel selection UI regression');
