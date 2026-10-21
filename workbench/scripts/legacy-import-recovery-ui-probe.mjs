// Actual App buttons with synthetic persisted import states; no user library or external assistant.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import electron from 'electron';
import {build} from 'vite';

const workbench = fileURLToPath(new URL('../', import.meta.url));
const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'nova-import-recovery-ui-')));
try {
  await fs.writeFile(path.join(root, 'index.html'), '<html lang="zh-CN"><div id="root"></div><script type="module" src="/probe.jsx"></script></html>');
  await fs.writeFile(path.join(root, 'probe.jsx'), `
const ok = value => ({ok: true, value});
const content = {id: 'old-content', title: 'Library A saved editor', body: 'Library A saved body', editToken: 'token', updatedAt: '2026-10-21T00:00:00.000Z', deletedAt: null, plans: [], candidateCount: 0};
const library = {collections: [], contentDetails: [], photos: [], templates: [], settings: {channels: [], defaults: {}}};
let changed;
window.calls = [];
window.fixture = {busy: false, currentName: 'Library A', started: true, task: {status: 'prepared', progress: {steps: 1}, issues: [], targetChanged: false, descriptorChanged: false}, sourceName: 'source.json', destinationName: 'Library B', maintenance: {pending: null}, pending: null};
window.setImportState = patch => {Object.assign(window.fixture, patch); changed?.();};
window.contentHub = {
  onWorkspaceChanged(callback) {changed = callback; return () => {};},
  readPreferences: async () => ok({values: {reducedMotion: true}}),
  status: async () => ok({...window.fixture}),
  listContents: async () => ok(window.fixture.currentName === 'Library A' ? [content] : []),
  readWorkspace: async () => ok({contents: window.fixture.currentName === 'Library A' ? [content] : [], prompts: [], channels: [], collections: []}),
  readWorkspaceLibrary: async () => ok(library), listCoverAssets: async () => ok({templates: [], photos: []}),
  readContent: async () => ok(content), readCover: async () => ok({content, jobs: [], candidates: [], selectedCandidateId: null}),
  importBackup: async () => {window.calls.push('importBackup'); if (window.sourceChanged) return {ok: false, error: {code: 'SOURCE_CHANGED', message: '原备份已改变，请保留原文件。'}}; window.fixture.currentName = 'Library B'; window.fixture.task = {status: 'committed', progress: {steps: 1}, issues: []}; return ok(null);},
  resumeImport: async () => {window.calls.push('resumeImport'); if (!window.fixture.task) return {ok: false, error: {code: 'IMPORT_NOT_STARTED', message: '导入尚未接受，请保留原备份与目标。'}}; window.fixture.currentName = 'Library B'; window.fixture.task = {...window.fixture.task, status: 'committed'}; return ok(null);}
};
await import(${JSON.stringify(path.join(workbench, 'src/renderer/app.tsx'))});
`);
  await build({configFile: false, root, base: './', resolve: {alias: {react: path.join(workbench, 'node_modules/react'), 'react-dom': path.join(workbench, 'node_modules/react-dom')}}, oxc: {jsx: {runtime: 'automatic'}}, build: {outDir: path.join(root, 'dist'), modulePreload: false, target: 'chrome148'}});
  async function probeMain(probeRoot) {
    const {app, BrowserWindow} = await import('electron');
    const {default: assert} = await import('node:assert/strict');
    const {default: path} = await import('node:path');
    app.setPath('userData', path.join(probeRoot, 'machine')); await app.whenReady();
    const win = new BrowserWindow({show: false, width: 1280, height: 1000, webPreferences: {contextIsolation: true, nodeIntegration: false}});
    win.webContents.on('console-message', event => console.log('Renderer:', event.message));
    const run = script => win.webContents.executeJavaScript(script).catch(error => {console.error('Failed script:', script); throw error;});
    const wait = condition => run(`new Promise((resolve,reject)=>{const end=Date.now()+5000;const check=()=>{if(${condition})return resolve();if(Date.now()>end)return reject(Error('State timeout: '+${JSON.stringify(condition)}+' / '+document.body.innerText.slice(0,1200)));setTimeout(check,20)};check()})`);
    const click = selector => run(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el||el.disabled||!el.getClientRects().length)throw Error('Missing enabled visible control: '+${JSON.stringify(selector)});el.click();})()`);
    const idle = 'document.querySelector("main[data-loaded=true][data-busy=false]")';
    try {
      await win.loadFile(path.join(probeRoot, 'dist/index.html'));
      await wait(`${idle} && document.querySelector('.creator-overview')`);
      await click('#nav-content'); await wait('document.querySelector(".content-title-link")');
      await click('.content-title-link'); await wait('document.querySelector(".content-detail-tabs")');
      await run('[...document.querySelectorAll(".content-detail-tabs button")].find(el=>el.textContent==="正文").click()');
      await wait('document.getElementById("content-body")?.value==="Library A saved body"');
      await click('.recovery-notice button'); await wait('document.querySelector(".library-manager-dialog[open]")');
      await click('#resume-import');
      await wait(`${idle} && document.getElementById('library-summary').textContent==='Library B'`);
      assert.equal(await run('!!document.getElementById("content-body")'), false, 'adopting B clears A editor before rendering B');
      assert.deepEqual(await run('window.calls'), ['resumeImport']);
      assert.equal(await run('document.body.textContent.includes("从网页版迁移")'), false);
      await run('window.setImportState({task:{...window.fixture.task,targetChanged:true}})');
      await wait('document.getElementById("resume-import")?.disabled');
      assert.equal(await run('document.querySelector(".legacy-import-recovery").textContent.includes("恢复原目录")'), true);
      await run('window.setImportState({task:{...window.fixture.task,targetChanged:false,descriptorChanged:true}})');
      await wait('document.getElementById("resume-import")?.disabled && document.querySelector(".legacy-import-recovery").textContent.includes("格式已改变")');
      await run('window.setImportState({needsReselect:true,task:{...window.fixture.task,descriptorChanged:false}})');
      await wait('document.getElementById("resume-import")?.disabled && document.querySelector(".legacy-import-recovery").textContent.includes("旧连接缺少目录身份")');
      await run('window.sourceChanged=true;window.setImportState({needsReselect:false,task:null})');
      await wait('document.getElementById("resume-import") && !document.getElementById("resume-import").disabled');
      await click('#resume-import');
      await wait('document.getElementById("error").textContent.includes("SOURCE_CHANGED")');
      assert.equal(await run('window.fixture.sourceName'), 'source.json');
      assert.equal(await run('window.fixture.destinationName'), 'Library B');
      assert.deepEqual(await run('window.calls'), ['resumeImport', 'importBackup'], 'no re-selection or resume of a nonexistent task');
      await run('window.sourceChanged=false'); await click('#resume-import');
      await wait(`${idle} && window.fixture.task?.status==='committed' && !document.getElementById('error').textContent`);
      assert.deepEqual(await run('window.calls'), ['resumeImport', 'importBackup', 'importBackup']);
      await run('window.setImportState({workspacePending:{state:"missing",input:{}}})');
      await wait('document.getElementById("resume-import")?.disabled && document.body.textContent.includes("上次修改需要核验")');
      await run('window.setImportState({workspacePending:null,started:false,task:null})');
      await wait('!document.querySelector(".legacy-import-recovery")');
      await run('window.setImportState({currentName:null,needsReselect:true})');
      await wait('document.getElementById("welcome-open-library") && !document.getElementById("welcome-open-library").disabled');
      assert.equal(await run('!!document.querySelector(".legacy-import-recovery")'), false, 'fresh or unbound libraries do not gain a new migration entry');
      console.log('PASS synthetic actual App: visible legacy recovery, editor cleared on adoption, changed-target guard, no-task revalidates and retries only the original source/destination.');
      app.exit(0);
    } catch (error) {console.error(error); app.exit(1);}
  }
  await fs.writeFile(path.join(root, 'main.mjs'), `(${probeMain.toString()})(${JSON.stringify(root)});`);
  await new Promise((resolve, reject) => {
    const child = spawn(electron, [path.join(root, 'main.mjs')], {stdio: 'inherit', env: process.env});
    const timeout = setTimeout(() => {child.kill('SIGKILL'); reject(Error('Import recovery UI probe timed out'));}, 30000);
    child.once('error', reject); child.once('close', code => {clearTimeout(timeout); code === 0 ? resolve() : reject(Error('Import recovery UI probe failed: ' + code));});
  });
} finally {await fs.rm(root, {recursive: true, force: true});}
