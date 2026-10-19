// Real React/Semi layout and keyboard focus, isolated from the user's app and library.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn, execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import electron from 'electron';
import {build} from 'vite';

const workbench = fileURLToPath(new URL('../', import.meta.url));
const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'nova-template-entry-')));
try {
    await fs.writeFile(path.join(root, 'index.html'), '<html lang="zh-CN"><div id="root"></div><script type="module" src="/probe.jsx"></script></html>');
    await fs.writeFile(path.join(root, 'probe.jsx'), `
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import ${JSON.stringify(path.join(workbench, 'node_modules/@douyinfe/semi-ui-19/react19-adapter'))};
import ${JSON.stringify(path.join(workbench, 'node_modules/@douyinfe/semi-ui-19/lib/es/_base/base.css'))};
import ${JSON.stringify(path.join(workbench, 'src/renderer/style.css'))};
import {TemplatesPage} from ${JSON.stringify(path.join(workbench, 'src/renderer/workspace-pages.tsx'))};
const templates = Array.from({length: 16}, (_, i) => ({id: 'template-' + i, title: '参考模板 ' + i, name: '参考模板 ' + i, description: '整组参考样张', builtin: i > 1, version: 1, currentVersion: 1, versions: [{version: 1, packageHash: 'hash-' + i}], editToken: 'token-' + i, deletedAt: null, rules: [], accepted: false, aiTested: false, samples: [{assetHash: 'sample-' + i, url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5V4AAAAASUVORK5CYII='}]}));
let pendingCopy = null;
window.reads = 0; window.writes = [];
window.contentHub = {
  readTemplateWorkflow: async ({templateId}) => {
    window.reads++;
    const template = window.probe.library.templates.find(t => t.id === templateId);
    const requestId = 'request-' + templateId;
    const attempts = [0, 1].map(i => ({attemptId: 'attempt-' + i, host: 'codex', status: 'cancelled', reference: {templateId, requestId, sourceVersion: 1, sourcePackageHash: template.versions[0].packageHash}}));
    return {ok: true, value: {...template, templateId, jobs: template.builtin ? [] : [{id: requestId, attempts, activeAttemptId: null, acceptance: null}]}};
  },
  readTemplateAssistantSetup: async () => ({ok: true, value: {host: 'codex', ready: true}}),
  mutateWorkspace: async input => {
    window.writes.push(input);
    pendingCopy = {...window.probe.library.templates.find(t => t.id === input.sourceTemplateId), id: 'derived-template', title: input.name, name: input.name, builtin: false};
    return {ok: true, value: {objectId: pendingCopy.id}};
  }
};
function Probe() {
  const [library, setLibrary] = useState({templates, photos: [], settings: {defaults: {coverCount: 1}}});
  const [assets, setAssets] = useState({templates, photos: []}), [busy, setBusy] = useState(false);
  async function refresh() {
    const copy = pendingCopy;
    setLibrary(old => ({...old, templates: copy ? [...old.templates, copy] : [...old.templates]}));
    setAssets(old => ({...old, templates: copy ? [...old.templates, copy] : [...old.templates]}));
    pendingCopy = null;
  }
  window.probe = {library, refresh};
  return <main><aside className="app-navigation">隔离验证</aside><div className="app-stage"><header className="app-header"><h1>自媒体工作台</h1></header><TemplatesPage library={library} assets={assets} busy={busy} run={async action => {setBusy(true); try {await action();} finally {setBusy(false);}}} refresh={refresh} useTemplate={() => {}} managePhotos={() => {}}/></div></main>;
}
createRoot(document.getElementById('root')).render(<Probe/>);
`);
    const baseline = process.argv.includes('--baseline') ? execFileSync('git', ['show', 'HEAD:workbench/src/renderer/workspace-pages.tsx'], {cwd: workbench, encoding: 'utf8'}) : null;
    await build({configFile: false, root, base: './', plugins: baseline ? [{name: 'baseline-template-entry', enforce: 'pre', transform(_source, id) {if (id === path.join(workbench, 'src/renderer/workspace-pages.tsx')) return baseline;}}] : [], resolve: {alias: {react: path.join(workbench, 'node_modules/react'), 'react-dom': path.join(workbench, 'node_modules/react-dom')}}, oxc: {jsx: {runtime: 'automatic'}}, build: {outDir: path.join(root, 'dist'), modulePreload: false, target: 'chrome148'}});
    async function probeMain(probeRoot, reducedMotion) {
        const {app, BrowserWindow} = await import('electron');
        const {default: assert} = await import('node:assert/strict');
        const {default: path} = await import('node:path');
        app.setPath('userData', path.join(probeRoot, 'machine'));
        if (reducedMotion) app.commandLine.appendSwitch('force-prefers-reduced-motion', 'reduce');
        await app.whenReady();
        const window = new BrowserWindow({show: false, width: 1280, height: 800, webPreferences: {contextIsolation: true, nodeIntegration: false}});
        const run = source => window.webContents.executeJavaScript(source);
        const wait = condition => run(`new Promise((resolve,reject)=>{const end=Date.now()+5000;const check=()=>{if(${condition})return resolve(true);if(Date.now()>end)return reject(new Error('State timeout: '+${JSON.stringify(condition)}));setTimeout(check,10)};check()})`);
        async function click(selector) {
            const point = await run(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.scrollIntoView({block:'center',behavior:'instant'});const r=el.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),disabled:el.disabled}})()`);
            assert.equal(point.disabled, false);
            window.webContents.sendInputEvent({type: 'mouseDown', x: point.x, y: point.y, button: 'left', clickCount: 1});
            window.webContents.sendInputEvent({type: 'mouseUp', x: point.x, y: point.y, button: 'left', clickCount: 1});
        }
        const trigger = index => `.creator-style-card:nth-child(${index + 1}) .creator-style-actions button:last-child`;
        async function landed(title) {
            await wait(`document.querySelector('.template-workflow h3')?.textContent === ${JSON.stringify(title + ' · 学习与还原')} && !document.querySelector('.template-workflow [role=status]')?.textContent.includes('正在读取')`);
            assert.equal(await run(`document.activeElement?.id`), 'template-learning-workflow', 'opening must focus the named workflow region');
            assert.equal(await run(`document.getElementById('template-learning-workflow').hidden`), false);
            assert.equal(await run(`(()=>{const r=document.querySelector('.template-workflow h3').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})()`), true, 'workflow heading must be visible immediately');
        }
        async function collapse() {
            await click('#template-learning-workflow .semi-card-header button');
            await wait(`document.getElementById('template-learning-workflow')?.hidden`);
            assert.equal(await run(`document.getElementById('template-learning-workflow').getClientRects().length`), 0, 'collapsed panel has no layout');
            assert.equal(await run(`(()=>{const panel=document.getElementById('template-learning-workflow');for(const el of panel.querySelectorAll('button,input,textarea,select,[tabindex]')){el.focus();if(panel.contains(document.activeElement))return false;}return true;})()`), true, 'hidden workflow controls cannot receive focus');
            assert.equal(await run(`document.querySelectorAll('.creator-style-actions button[aria-expanded=true]').length`), 0, 'collapsed triggers expose aria-expanded=false');
        }
        try {
            await window.loadFile(path.join(probeRoot, 'dist/index.html'));
            await wait('document.querySelectorAll(".creator-style-card").length === 16');
            if (reducedMotion) assert.equal(await run('matchMedia("(prefers-reduced-motion: reduce)").matches'), true);
            await click(trigger(0));
            await landed('参考模板 0');
            await run(`(()=>{const el=document.querySelector('.template-study-notes textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,'保留我的补充要求');el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
            await wait(`document.querySelector('.template-study-notes textarea')?.value === '保留我的补充要求'`);
            await run(`(()=>{const el=document.querySelector('.template-workflow select');el.value='attempt-0';el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
            await wait(`document.querySelector('.template-workflow select')?.value === 'attempt-0'`);
            await click(trigger(0));
            await landed('参考模板 0');
            assert.equal(await run(`document.querySelector('.template-study-notes textarea').value`), '保留我的补充要求', 'repeat opening preserves the mounted notes');
            await collapse();
            assert.equal(await run('document.activeElement.id'), 'template-workflow-trigger-template-0');
            const collapsed = await run('({reads: window.reads, scroll: scrollY})');
            await run('window.probe.refresh()');
            await wait(`window.reads > ${collapsed.reads} && !document.querySelector('.template-workflow [role=status]')?.textContent.includes('正在读取')`);
            assert.equal(await run('document.activeElement.id'), 'template-workflow-trigger-template-0', 'refresh while collapsed retains card focus');
            assert.equal(await run('scrollY'), collapsed.scroll, 'refresh while collapsed retains scroll');
            assert.equal(await run(`document.getElementById('template-learning-workflow').hidden`), true, 'refresh cannot expand the collapsed workflow');
            await click(trigger(0));
            await landed('参考模板 0');
            assert.equal(await run(`document.querySelector('.template-study-notes textarea').value`), '保留我的补充要求', 'collapse and reopen preserves notes');
            assert.equal(await run(`document.querySelector('.template-workflow select').value`), 'attempt-0', 'collapse and reopen preserves history selection');
            const reads = await run('window.reads');
            await run(`document.querySelector('.creator-template-search').focus();scrollTo({top:0,behavior:'instant'});window.probe.refresh()`);
            await wait(`window.reads > ${reads} && !document.querySelector('.template-workflow [role=status]')?.textContent.includes('正在读取')`);
            assert.equal(await run(`document.activeElement?.className`), 'creator-template-search', 'background refresh must retain focus');
            assert.equal(await run('scrollY'), 0, 'background refresh must retain scroll');
            assert.equal(await run(`document.querySelector('.template-study-notes textarea').value`), '保留我的补充要求');
            await click(trigger(1));
            await landed('参考模板 1');
            assert.equal(await run(`document.querySelector('.template-study-notes textarea').value`), '', 'another template gets its own panel state');
            await collapse();
            assert.equal(await run('document.activeElement.id'), 'template-workflow-trigger-template-1', 'closing returns keyboard focus to the original card');
            await click(trigger(2));
            await landed('参考模板 2');
            await click('.template-workflow-message button');
            await landed('参考模板 2 · 我的副本');
            assert.equal(await run('window.writes[0].sourceTemplateId'), 'template-2');
            assert.equal(await run('document.querySelectorAll(".creator-style-card").length'), 17);
            assert.equal(await run('!!document.querySelector(".template-study-notes textarea")'), true, 'derived template opens the personal learning controls');
            await collapse();
            assert.equal(await run('document.activeElement.id'), 'template-workflow-trigger-template-2');
            await click(trigger(0));
            await landed('参考模板 0');
            await run(`(()=>{const el=document.querySelector('.creator-template-search');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'不存在的模板');el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
            await wait('document.querySelectorAll(".creator-style-card").length === 0');
            await collapse();
            assert.equal(await run('document.activeElement.className'), 'creator-template-search', 'a filtered original card falls back to search');
            console.log('PASS actual React/Semi/Electron: first open visible and focused; repeat/collapse/reopen keep notes and history; hidden controls cannot receive focus; another template and builtin copy target correctly; refresh preserves focus/scroll/notes; collapse restores card or search focus; reduced motion=' + reducedMotion);
            app.exit(0);
        } catch (error) {console.error(error); app.exit(1);}
    }
    await fs.writeFile(path.join(root, 'main.mjs'), `(${probeMain.toString()})(${JSON.stringify(root)},${process.argv.includes('--reduced-motion')})`);
    await new Promise((resolve, reject) => {
        const child = spawn(electron, [path.join(root, 'main.mjs')], {env: process.env, stdio: 'inherit'});
        const timeout = setTimeout(() => {child.kill('SIGKILL'); reject(new Error('Template entry probe timed out'));}, 30000);
        child.once('error', reject);
        child.once('close', code => {clearTimeout(timeout); code === 0 ? resolve() : reject(new Error('Template entry probe failed: ' + code));});
    });
} finally {await fs.rm(root, {recursive: true, force: true});}
