// Isolated Electron copy: pauses a real IPC read, then sends one mouse click without waiting for idle.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import electron from 'electron';
import {build} from 'vite';
const workbench = fileURLToPath(new URL('../', import.meta.url));
const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'nova-focus-refresh-')));
const bundle = path.join(root, 'bundle'), dist = path.join(bundle, 'workbench/dist');
try {
    await fs.cp(path.join(workbench, 'dist-desktop/auth-disabled'), bundle, {recursive: true});
    if (!process.argv.includes('--baseline')) {
        await build({configFile: false, plugins: process.argv.includes('--cover-baseline') ? [{name: 'prior-cover-refresh', enforce: 'pre', transform(source, id) {if (id.endsWith('/covers.tsx')) return source.replace(/void readAutomatically\(content.id\).*$/m, 'void run(refresh);');}}] : [], root: path.join(workbench, 'src/renderer'), base: './', oxc: {jsx: {runtime: 'automatic'}}, build: {outDir: path.join(dist, 'renderer'), emptyOutDir: true, modulePreload: false, target: 'chrome148'}});
        const mimes = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png'};
        const entries = {};
        for (const file of await fs.readdir(path.join(dist, 'renderer'), {recursive: true})) {
            if ((await fs.stat(path.join(dist, 'renderer', file))).isFile()) entries[`/${file}`] = {file, mime: mimes[path.extname(file)]};
        }
        await fs.writeFile(path.join(dist, 'renderer-resources.json'), JSON.stringify({format: 'nova-desktop-renderer-resources', schemaVersion: 1, entries}));
    }
    await fs.writeFile(path.join(dist, 'main/focus-refresh-probe.mjs'), `
import {app} from 'electron';
import assert from 'node:assert/strict';
import path from 'node:path';
import {startDesktop} from './desktop.mjs';
const root = process.env.NOVA_FOCUS_PROBE_ROOT;
startDesktop({show: false, onConsoleMessage: message => console.log('renderer:', message), userData: path.join(root, 'machine'), dialogs: {destination: async () => path.join(root, 'library')}, async ready({window, controller}) {
    const run = source => window.webContents.executeJavaScript(source);
    const wait = condition => run(\`new Promise((resolve,reject)=>{const end=Date.now()+12000;const check=()=>{if(\${condition})return resolve(true);if(Date.now()>end)return reject(new Error('State timeout: '+\${JSON.stringify(condition)}+' / '+document.body.innerText.slice(0,300)));setTimeout(check,20)};check()})\`);
    const idle = ${JSON.stringify("document.querySelector('main[data-loaded=\"true\"][data-busy=\"false\"]')")};
    await wait(idle);
    await run('document.getElementById("welcome-create-library").click()');
    await wait(idle + ' && !document.getElementById("welcome-create-library")');
    assert.equal((await run('window.contentHub.createContent({title: "Single click fixture", body: "local fixture"})')).ok, true);
    await run('window.dispatchEvent(new Event("focus"))');
    await wait(idle + ' && document.querySelector(".creator-overview-layout")?.textContent.includes("Single click fixture") && (()=>{const el=document.getElementById("nav-content");if(el.disabled)return false;el.click();return true;})()');
    await wait('document.querySelector(".content-title-link")');
    let release, enter;
    const gate = new Promise(resolve => {release = resolve;});
    const started = new Promise(resolve => {enter = resolve;});
    const original = controller.listContents.bind(controller);
    let paused = false;
    controller.listContents = async input => {if (!paused) {paused = true; enter(); await gate;} return original(input);};
    await run('window.dispatchEvent(new Event("focus"))');
    await started;
    const control = await run('(()=>{const el=document.querySelector(".content-title-link"), r=el.getBoundingClientRect();return {disabled:el.disabled,x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()');
    // A trusted input event exercises Chromium button disabled behavior, without a retry.
    window.webContents.sendInputEvent({type: 'mouseDown', x: control.x, y: control.y, button: 'left', clickCount: 1});
    window.webContents.sendInputEvent({type: 'mouseUp', x: control.x, y: control.y, button: 'left', clickCount: 1});
    assert.equal(control.disabled, false, 'focus refresh disabled the first content click');
    await wait(${JSON.stringify("document.querySelector('main[data-busy=\"true\"]')")});
    release();
    await wait('document.querySelector(".content-detail-page")');
    await wait(idle);
    console.log('PASS actual Electron: one trusted content click during paused focus refresh opens details; no click retry.');
    await wait('document.querySelector(".cover-workspace-heading p")?.textContent.includes("选好风格")');
    let releaseCover, enterCover, finishCover;
    const coverGate = new Promise(resolve => {releaseCover = resolve;});
    const coverStarted = new Promise(resolve => {enterCover = resolve;});
    const coverFinished = new Promise(resolve => {finishCover = resolve;});
    const originalCover = controller.readCover.bind(controller);
    let pausedCover = false;
    controller.readCover = async input => {if (!pausedCover) {pausedCover = true; enterCover(); await coverGate;} const result = await originalCover(input); finishCover(); return result;};
    await run('window.dispatchEvent(new Event("focus"))');
    await coverStarted;
    const bodyTab = await run('(()=>{const el=[...document.querySelectorAll(".content-detail-tabs button")].find(el=>el.textContent==="正文"),r=el.getBoundingClientRect();return {disabled:el.disabled,x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()');
    window.webContents.sendInputEvent({type: 'mouseDown', x: bodyTab.x, y: bodyTab.y, button: 'left', clickCount: 1});
    window.webContents.sendInputEvent({type: 'mouseUp', x: bodyTab.x, y: bodyTab.y, button: 'left', clickCount: 1});
    assert.equal(bodyTab.disabled, false, 'automatic cover read disabled the first detail tab click');
    await wait('document.getElementById("content-body")');
    await run('(()=>{const el=document.getElementById("content-body");Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value").set.call(el,"unsaved during cover read");el.dispatchEvent(new Event("input",{bubbles:true}));})()');
    await wait('document.getElementById("editor-dirty-state")?.textContent.includes("有未保存草稿")');
    releaseCover();
    await coverFinished;
    await wait('document.getElementById("content-body")?.value === "unsaved during cover read" && document.querySelector(".content-detail-hero h2")?.textContent === "Single click fixture"');
    await run('document.querySelector(".back-to-contents").click()');
    await wait('document.getElementById("leave-stay")');
    await run('document.getElementById("leave-stay").click()');
    assert.equal(await run('document.getElementById("content-body").value'), 'unsaved during cover read');
    console.log('PASS actual Electron: one trusted detail tab click during paused readCover works; unsaved draft, content identity and leave guard survive the returned cover read.');
    app.exit(0);
}}).catch(error => {console.error(error); app.exit(1);});
`);
    await new Promise((resolve, reject) => {
        const child = spawn(electron, [path.join(dist, 'main/focus-refresh-probe.mjs')], {cwd: bundle, env: {...process.env, NOVA_FOCUS_PROBE_ROOT: root}, stdio: 'inherit'});
        const timeout = setTimeout(() => {child.kill('SIGKILL'); reject(new Error('Focus refresh probe timed out'));}, 45000);
        child.once('error', reject);
        child.once('close', code => {clearTimeout(timeout); code === 0 ? resolve() : reject(new Error('Focus refresh probe failed: ' + code));});
    });
} finally {await fs.rm(root, {recursive: true, force: true});}
