// Isolated desktop + real utility workers; the fixture pauses at either empty-lock window.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import electron from 'electron';

const workbench = fileURLToPath(new URL('../', import.meta.url));
const evidence = path.resolve(process.argv[2] ?? 'docs/verification/production/2026-10-20-graceful-quit');
fs.mkdirSync(evidence, {recursive: true});
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'nova-graceful-quit-')));
const waitFor = async (predicate, child, label) => {
    const deadline = Date.now() + 20000;
    while (!predicate()) {
        if (child.exitCode !== null || Date.now() > deadline) throw new Error(`Timed out/desktop exited waiting for ${label}`);
        await new Promise(resolve => setTimeout(resolve, 20));
    }
};
try {
    const native = path.join(root, 'native');
    execFileSync(process.execPath, [path.join(workbench, 'node_modules/typescript/bin/tsc'), '-p', path.join(workbench, 'tsconfig.native.json'), '--outDir', native], {stdio: 'inherit'});
    for (const phase of ['release', 'initialize']) {
        const fixture = path.join(root, phase), bundle = path.join(fixture, 'bundle');
        fs.mkdirSync(fixture);
        fs.cpSync(path.join(workbench, 'dist-desktop/auth-disabled'), bundle, {recursive: true});
        const main = path.join(bundle, 'workbench/dist/main');
        fs.cpSync(native, path.dirname(main), {recursive: true});
        fs.renameSync(path.join(main, 'worker.mjs'), path.join(main, 'worker-original.mjs'));
        fs.writeFileSync(path.join(main, 'worker.mjs'), `
import fs from 'node:fs';
import path from 'node:path';
const root = process.env.NOVA_QUIT_FIXTURE;
const lock = path.join(root, 'library', '系统（别动）', '库锁');
const pause = () => {
    if (!fs.existsSync(path.join(root, 'arm')) || fs.existsSync(path.join(root, 'barrier'))) return;
    fs.writeFileSync(path.join(root, 'barrier'), String(process.pid));
    while (!fs.existsSync(path.join(root, 'release'))) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
};
if (process.env.NOVA_QUIT_PHASE === 'release') {
    const unlink = fs.unlinkSync;
    fs.unlinkSync = function(file, ...args) {
        const result = unlink.call(this, file, ...args);
        if (path.dirname(String(file)) === lock) pause();
        return result;
    };
} else {
    const {__testing} = await import('../../../plugin-src/src/lib/file-library/index.mjs');
    __testing.setHook(event => { if (event.phase === 'beforeOwnerWrite') pause(); });
}
await import('./worker-original.mjs');
`);
        fs.writeFileSync(path.join(main, 'graceful-quit-probe.mjs'), `
import {app, net, powerMonitor} from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {startDesktop} from './desktop.mjs';
import {WorkerClient} from './worker-client.mjs';
import {LibraryWatcher} from './library-watch.mjs';
import {Reminders} from './reminders.mjs';
import {emptyBinding, BindingStore} from './bindings.mjs';
import {createLibrary} from '../../../plugin-src/src/lib/file-library/index.mjs';
const root = process.env.NOVA_QUIT_FIXTURE;
const destination = path.join(root, 'library');
fs.mkdirSync(destination);
const library = createLibrary(destination);
const binding = {root: destination, libraryId: library.info.libraryId, rootIdentity: library.info.rootIdentity};
await new BindingStore(path.join(root, 'machine', 'machine-binding.json')).save({...emptyBinding(), current: binding});
const stats = {quitEvents: 0, stops: 0, stoppedPending: 0, workerCalls: [], foreground: 0, foregroundReads: 0, background: 0, saved: false, rebound: 0, refreshed: 0, lateStatus: null};
let quitting = false;
const stop = WorkerClient.prototype.stop;
WorkerClient.prototype.stop = function() { if (this.pending) stats.stoppedPending++; stats.stops++; return stop.call(this); };
const call = WorkerClient.prototype.call;
WorkerClient.prototype.call = function(...args) { if (fs.existsSync(path.join(root, 'arm'))) stats.workerCalls.push(args[0]); return call.apply(this, args); };
const bind = LibraryWatcher.prototype.bind;
LibraryWatcher.prototype.bind = function(...args) { if (quitting) stats.rebound++; return bind.apply(this, args); };
const refresh = Reminders.prototype.refresh;
Reminders.prototype.refresh = function(...args) { if (quitting) stats.refreshed++; return refresh.apply(this, args); };
const tick = () => new Promise(resolve => setTimeout(resolve, 20));
startDesktop({show: false, userData: path.join(root, 'machine'), async ready({window, controller, worker}) {
    console.log('probe desktop ready');
    await window.webContents.executeJavaScript('new Promise(resolve => setTimeout(resolve, 200))');
    while (worker.pending || controller.busy) await tick();
    console.log('probe renderer idle');
    const list = controller.listContents.bind(controller);
    controller.listContents = (...args) => { stats.foregroundReads++; return list(...args); };
    const create = controller.createContent.bind(controller);
    controller.createContent = async (...args) => { stats.foreground++; const value = await create(...args); stats.saved = value.body === 'accepted save completes during quit'; return value; };
    controller.covers.resource = async () => { stats.background++; await controller.covers.reader.call('list', {binding, view: 'active'}); return {data: Buffer.from('probe'), mime: 'image/png'}; };
    const url = controller.covers.grant('a'.repeat(64));
    fs.writeFileSync(path.join(root, 'arm'), '');
    void net.fetch(url).catch(error => { console.error('probe initial image:', error); });
    while (!fs.existsSync(path.join(root, 'barrier'))) await tick();
    console.log('probe worker paused at empty lock');
    void window.webContents.executeJavaScript('window.contentHub.createContent({title: "accepted quit save", body: "accepted save completes during quit"})').catch(() => {});
    void net.fetch(url).catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 100));
    app.on('will-quit', event => {
        stats.quitEvents++;
        if (quitting) return;
        quitting = true;
        assert.equal(powerMonitor.listenerCount('resume'), 0);
        assert.equal(powerMonitor.listenerCount('unlock-screen'), 0);
        fs.writeFileSync(path.join(root, 'quit-started'), JSON.stringify({prevented: event.defaultPrevented}));
        void net.fetch(url).then(response => { stats.lateStatus = response.status; });
        app.quit(); // A repeated quit while draining must not stop either worker.
    });
    app.on('quit', () => {
        fs.writeFileSync(path.join(root, 'receipt.json'), JSON.stringify(stats));
    });
    app.quit();
}}).catch(error => { console.error(error); app.exit(1); });
`);
        const log = fs.openSync(path.join(evidence, `native-${phase}.log`), 'w');
        const child = spawn(electron, [path.join(main, 'graceful-quit-probe.mjs')], {env: {...process.env, NODE_ENV: 'test', NOVA_QUIT_FIXTURE: fixture, NOVA_QUIT_PHASE: phase}, stdio: ['ignore', log, log]});
        fs.closeSync(log);
        const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({code, signal})));
        try {
            await waitFor(() => fs.existsSync(path.join(fixture, 'quit-started')), child, 'will-quit');
            const lock = path.join(fixture, 'library', '系统（别动）', '库锁');
            assert.deepEqual(fs.readdirSync(lock), [], 'the actual worker is paused inside the empty-lock window');
            await new Promise(resolve => setTimeout(resolve, 150));
            fs.writeFileSync(path.join(evidence, `native-${phase}-paused.json`), JSON.stringify({desktopExitCode: child.exitCode, lockExists: fs.existsSync(lock), lockEntries: fs.existsSync(lock) ? fs.readdirSync(lock) : null, fixtureOnly: true}, null, 2));
            assert.equal(child.exitCode, null, 'desktop must stay alive until accepted work settles');
            fs.writeFileSync(path.join(fixture, 'release'), '');
            const result = await Promise.race([exited, new Promise((_, reject) => setTimeout(() => reject(new Error('Desktop did not drain within 20 seconds')), 20000).unref())]);
            assert.equal(result.code, 0);
            const receipt = JSON.parse(fs.readFileSync(path.join(fixture, 'receipt.json'), 'utf8'));
            fs.writeFileSync(path.join(evidence, `native-${phase}.json`), JSON.stringify({...receipt, lockRemoved: !fs.existsSync(lock), fixtureOnly: true}, null, 2));
            assert.equal(fs.existsSync(lock), false, 'worker releases its exact lock before exit');
            assert.equal(receipt.stops, 2);
            assert.equal(receipt.stoppedPending, 0, 'never kill a pending worker');
            assert.equal(receipt.foreground, 1);
            assert.equal(receipt.background, 2);
            const mutation = receipt.workerCalls.indexOf('mutate');
            assert.ok(mutation >= 0);
            assert.deepEqual(receipt.workerCalls.slice(mutation, mutation + 3), ['mutate', 'queryMutation', 'readContent']);
            assert.equal(receipt.workerCalls.filter(op => op === 'list').length, receipt.background + receipt.foregroundReads, 'account for both image reads and any accepted renderer list request');
            assert.equal(receipt.saved, true, 'accepted write and pending reconciliation complete before exit');
            assert.equal(receipt.rebound, 0, 'accepted operation finally cannot restart watching');
            assert.equal(receipt.refreshed, 0, 'accepted operation finally cannot refresh reminders');
            assert.equal(receipt.lateStatus, 404, 'new image work is rejected during shutdown');
            console.log(`PASS actual desktop quit at ${phase} empty-lock window: accepted foreground/background drained, late image rejected, two idle workers stopped, no lock remains`);
        } finally {
            if (child.exitCode === null) child.kill('SIGKILL');
            await exited;
        }
    }
} finally { fs.rmSync(root, {recursive: true, force: true}); }
