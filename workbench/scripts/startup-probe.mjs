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
import {startDesktop} from './desktop.mjs';
const root = process.env.NOVA_STARTUP_PROBE_ROOT;
startDesktop({show: false, userData: path.join(root, 'machine'), dialogs: {destination: async () => path.join(root, 'library')}, async ready({window, controller}) {
    const run = source => window.webContents.executeJavaScript(source);
    const wait = condition => run(\`new Promise((resolve,reject)=>{const end=Date.now()+12000;const check=()=>{if(\${condition})return resolve(true);if(Date.now()>end)return reject(new Error('State timeout: '+\${JSON.stringify(condition)}+' / '+document.body.innerText.slice(0,600)));setTimeout(check,20)};check()})\`);
    const loaded = 'document.querySelector(".creator-overview")';
    const absent = '![".creator-stats", ".creator-week", ".content-list-empty", ".prompt-library-empty", ".calendar-grid", ".creator-photo-placeholder"].some(selector=>document.querySelector(selector))';
    await wait('document.getElementById("welcome-open-library")');
    assert.equal(await run(absent), true, 'unbound library must show setup without false empty pages');
    const menu = Menu.getApplicationMenu();
    assert.ok(menu.items.some(item => item.label === '编辑'));
    assert.ok(menu.items.find(item => item.label === '编辑').submenu.items.some(item => item.role === 'copy' && item.label === '复制'));
    assert.equal((await run('window.contentHub.createLibrary()')).ok, true);
    const original = controller.readWorkspace.bind(controller);
    let release, enter;
    controller.readWorkspace = async () => {enter?.(); await new Promise(resolve => {release = resolve;}); return original();};
    const entered = new Promise(resolve => {enter = resolve;});
    window.webContents.reload();
    await entered;
    await wait('document.querySelector("[data-workspace-state=loading]")');
    for (const page of ['overview', 'templates', 'content', 'calendar', 'prompts']) {
        await run('document.getElementById("nav-' + page + '").click()');
        await wait('document.querySelector("[data-workspace-state=loading]") && document.getElementById("nav-' + page + '").getAttribute("aria-current") === "page"');
        assert.equal(await run(absent), true, page + ' displayed false empty state while reading');
    }
    await run('document.getElementById("nav-overview").click()');
    controller.readWorkspace = original;
    release();
    await wait(loaded);
    assert.equal(await run('document.body.innerText.includes("把第一个想法写下来")'), true, 'a successfully read empty library keeps its first-content action');
    assert.equal((await run('window.contentHub.createContent({title: "Startup fixture", body: "Saved fixture body"})')).ok, true);
    controller.readWorkspace = async () => {throw Object.assign(new Error('Probe read failure'), {code: 'PROBE_READ'});};
    window.webContents.reload();
    await wait('document.querySelector("[data-workspace-state=failed]")');
    assert.equal(await run(absent), true, 'initial read failure must not masquerade as empty data');
    controller.readWorkspace = original;
    await run('document.getElementById("retry-workspace").click()');
    await wait(loaded + ' && document.body.innerText.includes("Startup fixture") && !document.querySelector("main[data-busy=true]")');
    assert.equal(await run('document.body.innerText.includes("把第一个想法写下来")'), false);
    let releaseBackground, startBackground;
    const backgroundStarted = new Promise(resolve => {startBackground = resolve;});
    controller.readWorkspace = async () => {startBackground(); await new Promise(resolve => {releaseBackground = resolve;}); return original();};
    await run('window.dispatchEvent(new Event("focus"))');
    await backgroundStarted;
    assert.equal(await run('!!document.querySelector(".creator-overview") && !document.querySelector("[data-workspace-state]") && document.body.innerText.includes("Startup fixture")'), true, 'background reads must retain loaded content');
    assert.equal(await run('document.getElementById("nav-content").disabled'), false);
    controller.readWorkspace = original;
    releaseBackground();
    await wait('!document.querySelector("main[data-busy=true]")');
    const originalStatus = controller.status.bind(controller);
    controller.status = async () => {throw Object.assign(new Error('Probe status failure'), {code: 'PROBE_STATUS'});};
    window.webContents.reload();
    await wait('document.querySelector("[data-workspace-state=failed]")');
    assert.equal(await run(absent), true);
    controller.status = originalStatus;
    await run('document.getElementById("retry-workspace").click()');
    await wait(loaded + ' && document.body.innerText.includes("Startup fixture")');
    console.log('PASS actual Electron/React/Semi: unbound setup; five-page slow loading; true empty library; workspace/status failure and retry; loaded data and navigation during background refresh; Chinese native menu.');
    app.exit(0);
}}).catch(error => {console.error(error); app.exit(1);});
`);
    await new Promise((resolve, reject) => {
        const child = spawn(electron, [path.join(dist, 'main/startup-probe.mjs')], {cwd: bundle, env: {...process.env, NOVA_STARTUP_PROBE_ROOT: root}, stdio: 'inherit'});
        const timeout = setTimeout(() => {child.kill('SIGKILL'); reject(new Error('Startup probe timed out'));}, 55000);
        child.once('error', reject);
        child.once('close', code => {clearTimeout(timeout); code === 0 ? resolve() : reject(new Error('Startup probe failed: ' + code));});
    });
} finally {await fs.rm(root, {recursive: true, force: true});}
