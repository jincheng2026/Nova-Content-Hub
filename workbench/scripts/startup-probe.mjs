// Real React/Semi and native-menu checks in an isolated Electron copy; no installed library is touched.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn, execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import electron from 'electron';
import {build} from 'vite';

const workbench = fileURLToPath(new URL('../', import.meta.url));
const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'nova-startup-probe-')));
const bundle = path.join(root, 'bundle'), dist = path.join(bundle, 'workbench/dist');
let passed = false;
try {
    await fs.cp(path.join(workbench, 'dist-desktop/auth-disabled'), bundle, {recursive: true});
    execFileSync(process.execPath, [path.join(workbench, 'node_modules/typescript/bin/tsc'), '-p', path.join(workbench, 'tsconfig.native.json'), '--outDir', path.join(root, 'native')], {stdio: 'inherit'});
    for (const file of ['desktop.mjs', 'application-menu.mjs']) await fs.copyFile(path.join(root, 'native/main', file), path.join(dist, 'main', file));
    await build({configFile: false, root: path.join(workbench, 'src/renderer'), base: './', oxc: {jsx: {runtime: 'automatic'}}, build: {outDir: path.join(dist, 'renderer'), emptyOutDir: true, modulePreload: false, target: 'chrome148'}});
    const mimes = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png'}, entries = {};
    for (const file of await fs.readdir(path.join(dist, 'renderer'), {recursive: true})) if ((await fs.stat(path.join(dist, 'renderer', file))).isFile()) entries[`/${file}`] = {file, mime: mimes[path.extname(file)]};
    await fs.writeFile(path.join(dist, 'renderer-resources.json'), JSON.stringify({format: 'nova-desktop-renderer-resources', schemaVersion: 1, entries}));
    await fs.writeFile(path.join(dist, 'main/startup-probe.mjs'), `
import {app, Menu} from 'electron';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import {startDesktop} from './desktop.mjs';
const root = process.env.NOVA_STARTUP_PROBE_ROOT;
let selectedLibrary = path.join(root, 'library');
const started = Date.now(), stages = [];
let currentStage = 'boot', probeWindow;
const stage = name => {currentStage = name; const timing = {stage: name, elapsedMs: Date.now() - started}; stages.push(timing); console.log('[startup-probe] ' + JSON.stringify(timing));};
const bounded = async (promise, label, timeoutMs = 15000) => {
    let timer;
    try {return await Promise.race([promise, new Promise((_, reject) => {timer = setTimeout(() => reject(new Error('Stage ' + currentStage + ': ' + label + ' timed out')), timeoutMs);})]);}
    finally {clearTimeout(timer);}
};
stage('boot');
startDesktop({show: false, userData: path.join(root, 'machine'), dialogs: {destination: async () => path.join(root, 'library'), library: async () => selectedLibrary}, async ready({window, controller}) {
    probeWindow = window;
    const run = source => bounded(window.webContents.executeJavaScript(source), source.slice(0, 100), source.includes('contentHub.createLibrary(') ? 90000 : 15000);
    const call = controller.worker.call.bind(controller.worker);
    controller.worker.call = async (op, args) => {
        if (!['createLibrary', 'seed'].includes(op)) return call(op, args);
        const begin = Date.now(); console.log('[startup-probe] native ' + op + ' started');
        try {return await call(op, args);} finally {console.log('[startup-probe] native ' + op + ' elapsedMs=' + (Date.now() - begin));}
    };
    const wait = condition => run(\`new Promise((resolve,reject)=>{const end=Date.now()+12000;const check=()=>{if(\${condition})return resolve(true);if(Date.now()>end)return reject(new Error('State timeout: '+\${JSON.stringify(condition)}+' / '+document.body.innerText.slice(0,600)));setTimeout(check,20)};check()})\`);
    const loaded = 'document.querySelector(".creator-overview")';
    const absent = '![".creator-stats", ".creator-week", ".content-list-empty", ".prompt-library-empty", ".calendar-grid", ".creator-photo-placeholder"].some(selector=>document.querySelector(selector))';
    stage('initial-blank');
    await wait('document.getElementById("welcome-open-library")');
    assert.equal(await run(absent), true, 'unbound library must show setup without false empty pages');
    const menu = Menu.getApplicationMenu();
    assert.ok(menu.items.some(item => item.label === '编辑'));
    assert.ok(menu.items.find(item => item.label === '编辑').submenu.items.some(item => item.role === 'copy' && item.label === '复制'));
    stage('create-library');
    assert.equal((await run('window.contentHub.createLibrary()')).ok, true);
    stage('slow-read-gate');
    const original = controller.readWorkspace.bind(controller);
    let release, enter;
    controller.readWorkspace = async () => {enter?.(); await new Promise(resolve => {release = resolve;}); return original();};
    const entered = new Promise(resolve => {enter = resolve;});
    window.webContents.reload();
    await bounded(entered, 'enter workspace read');
    await wait('document.querySelector("[data-workspace-state=loading]")');
    for (const page of ['overview', 'templates', 'content', 'calendar', 'prompts']) {
        await run('document.getElementById("nav-' + page + '").click()');
        await wait('document.querySelector("[data-workspace-state=loading]") && document.getElementById("nav-' + page + '").getAttribute("aria-current") === "page"');
        assert.equal(await run(absent), true, page + ' displayed false empty state while reading');
    }
    await run('document.getElementById("nav-overview").click()');
    controller.readWorkspace = original;
    release();
    stage('empty-library');
    await wait(loaded);
    assert.equal(await run('document.body.innerText.includes("把第一个想法写下来")'), true, 'a successfully read empty library keeps its first-content action');
    assert.equal((await run('window.contentHub.createContent({title: "Startup fixture", body: "Saved fixture body"})')).ok, true);
    stage('failed-workspace');
    controller.readWorkspace = async () => {throw Object.assign(new Error('Probe read failure'), {code: 'PROBE_READ'});};
    window.webContents.reload();
    await wait('document.querySelector("[data-workspace-state=failed]")');
    assert.equal(await run(absent), true, 'initial read failure must not masquerade as empty data');
    controller.readWorkspace = original;
    await run('document.getElementById("retry-workspace").click()');
    await wait(loaded + ' && document.body.innerText.includes("Startup fixture") && !document.querySelector("main[data-busy=true]")');
    assert.equal(await run('document.body.innerText.includes("把第一个想法写下来")'), false);
    stage('background-refresh');
    let releaseBackground, startBackground;
    const backgroundStarted = new Promise(resolve => {startBackground = resolve;});
    controller.readWorkspace = async () => {startBackground(); await new Promise(resolve => {releaseBackground = resolve;}); return original();};
    await run('window.dispatchEvent(new Event("focus"))');
    await bounded(backgroundStarted, 'enter background read');
    assert.equal(await run('!!document.querySelector(".creator-overview") && !document.querySelector("[data-workspace-state]") && document.body.innerText.includes("Startup fixture")'), true, 'background reads must retain loaded content');
    assert.equal(await run('document.getElementById("nav-content").disabled'), false);
    controller.readWorkspace = original;
    releaseBackground();
    await wait('!document.querySelector("main[data-busy=true]")');
    stage('status-fault');
    const originalStatus = controller.status.bind(controller);
    controller.status = async () => {throw Object.assign(new Error('Probe status failure'), {code: 'PROBE_STATUS'});};
    window.webContents.reload();
    await wait('document.querySelector("[data-workspace-state=failed]")');
    assert.equal(await run(absent), true);
    controller.status = originalStatus;
    await run('document.getElementById("retry-workspace").click()');
    await wait(loaded + ' && document.body.innerText.includes("Startup fixture")');
    stage('ownerless-lock');
    const originalLibrary = path.join(root, 'library'), recoveredLibrary = path.join(root, 'recovered-library');
    const uncertainLock = path.join(originalLibrary, '系统（别动）', '库锁');
    await fs.cp(originalLibrary, recoveredLibrary, {recursive: true, filter: source => source !== uncertainLock});
    await fs.mkdir(uncertainLock);
    window.webContents.reload();
    await wait('document.querySelector("[data-workspace-state=failed]") && document.body.innerText.includes("LOCK_UNCERTAIN")');
    assert.equal(await run('document.body.innerText.includes("保护记录不完整")'), true);
    stage('adopt-recovered-copy');
    selectedLibrary = recoveredLibrary;
    await run('document.getElementById("open-recovered-library").click()');
    await wait(loaded + ' && document.body.innerText.includes("Startup fixture") && !document.querySelector("[data-workspace-state=failed]")');
    assert.deepEqual(await fs.readdir(uncertainLock), [], 'opening a recovered copy leaves the original uncertain lock intact');
    assert.equal(controller.binding.current.root, recoveredLibrary);
    stage('complete');
    console.log('PASS actual Electron/React/Semi: unbound setup; five-page slow loading; true empty library; workspace/status failure and retry; loaded data and navigation during background refresh; Chinese native menu; ownerless-lock failure opens an explicit recovered copy and preserves the original lock.');
    app.exit(0);
}}).catch(async error => {
    let ui;
    try {ui = probeWindow && await bounded(probeWindow.webContents.executeJavaScript('({text:document.body.innerText,html:document.querySelector("main")?.outerHTML})'), 'capture failure UI');} catch {}
    await fs.writeFile(path.join(root, 'failure.json'), JSON.stringify({stage: currentStage, stages, error: error.stack, ui}, null, 2));
    console.error(error); app.exit(1);
});
`);
    await new Promise((resolve, reject) => {
        const child = spawn(electron, [path.join(dist, 'main/startup-probe.mjs')], {cwd: bundle, env: {...process.env, NOVA_STARTUP_PROBE_ROOT: root}, stdio: 'inherit'});
        const timeout = setTimeout(() => {child.kill('SIGKILL'); reject(new Error('Startup probe timed out; artifacts: ' + root));}, 180000);
        child.once('error', reject);
        child.once('close', code => {clearTimeout(timeout); code === 0 ? resolve() : reject(new Error('Startup probe failed: ' + code));});
    });
    passed = true;
} finally {
    if (passed) await fs.rm(root, {recursive: true, force: true});
    else console.error('Startup probe failure artifacts retained: ' + root);
}
