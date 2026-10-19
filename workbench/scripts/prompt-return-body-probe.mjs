// Actual App/React/Semi in isolated Electron; the desktop bridge uses read-only in-memory fixtures.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import electron from 'electron';
import {build} from 'vite';

const workbench = fileURLToPath(new URL('../', import.meta.url));
const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'nova-prompt-return-')));
try {
    await fs.writeFile(path.join(root, 'index.html'), '<html lang="zh-CN"><div id="root"></div><script type="module" src="/probe.jsx"></script></html>');
    await fs.writeFile(path.join(root, 'probe.jsx'), `
window.reads = []; window.writes = []; window.readFailure = null;
window.documents = ['a', 'b'].map(id => ({id, title: '内容 ' + id, body: '已保存正文 ' + id, editToken: 'token-' + id, deletedAt: null, createdAt: '2026-10-19', updatedAt: '2026-10-19', plans: [], candidateCount: 0, selectedCandidateId: null}));
const prompt = {id: 'prompt-1', title: '往返测试提示词', body: '{{主题|输入主题}}', category: '写作', summary: '', when: '', tags: [], enabled: true, deletedAt: null, editToken: 'prompt-token'};
const settings = {editToken: 'settings-token', defaults: {templateId: null, photoId: null, coverCount: 1}, channels: [], visiblePromptCategories: [], customRatios: [], defaultIssues: []};
window.fixtureStatus = {busy: false, currentName: '隔离测试内容库', maintenance: {pending: null}, task: null, pending: null, assistant: 'codex'};
window.contentHub = new Proxy({onWorkspaceChanged: listener => {window.notifyWorkspace = listener; return () => {}; }}, {get(target, method) {
  if (method in target) return target[method];
  return async input => {
    window.reads.push({method, input});
    let value;
    if (method === 'status') value = window.fixtureStatus;
    else if (method === 'readPreferences') value = {values: {reducedMotion: true}};
    else if (method === 'listContents') value = window.documents.filter(item => input.view === 'trash' ? item.deletedAt : !item.deletedAt);
    else if (method === 'readWorkspace') value = {contents: window.documents, prompts: [prompt], channels: []};
    else if (method === 'listCoverAssets') value = {templates: [], photos: []};
    else if (method === 'readWorkspaceLibrary') value = {prompts: [prompt], photos: [], templates: [], collections: [], contentDetails: window.documents.map(item => ({...item, materials: [], publications: [], publicationEvents: [], candidates: [], coverVariants: [], channelIds: []})), settings};
    else if (method === 'readContent') {
      if (window.readFailure === 'inaccessible') return {ok: false, error: {code: 'UNAVAILABLE', message: '关联内容无法读取，请检查原文件。'}};
      const item = window.documents.find(item => item.id === input.id);
      if (!item) return {ok: false, error: {code: 'NOT_FOUND', message: '关联内容已找不到，请重新选择。'}};
      value = window.readFailure === 'wrong-id' ? window.documents.find(item => item.id !== input.id) : item;
    } else if (method === 'readCover') value = {content: window.documents.find(item => item.id === input.contentId), jobs: [], candidates: [], selectedCandidateId: null};
    else {window.writes.push({method, input}); return {ok: false, error: {code: 'UNEXPECTED', message: 'Unexpected mutation: ' + method}};}
    return {ok: true, value: structuredClone(value)};
  };
}});
await import(${JSON.stringify(path.join(workbench, 'src/renderer/app.tsx'))});
`);
    await build({configFile: false, root, base: './', resolve: {alias: {react: path.join(workbench, 'node_modules/react'), 'react-dom': path.join(workbench, 'node_modules/react-dom')}}, oxc: {jsx: {runtime: 'automatic'}}, build: {outDir: path.join(root, 'dist'), modulePreload: false, target: 'chrome148'}});
    async function probeMain(probeRoot) {
        const {app, BrowserWindow} = await import('electron');
        const {default: assert} = await import('node:assert/strict');
        const {default: path} = await import('node:path');
        app.setPath('userData', path.join(probeRoot, 'machine'));
        await app.whenReady();
        const window = new BrowserWindow({show: false, width: 1440, height: 1000, webPreferences: {contextIsolation: true, nodeIntegration: false}});
        const run = source => window.webContents.executeJavaScript(source).catch(error => {console.error("Failed browser script:", source); throw error;});
        const wait = condition => run(`new Promise((resolve,reject)=>{const end=Date.now()+5000;const check=()=>{if(${condition})return resolve(true);if(Date.now()>end)return reject(new Error('State timeout: '+${JSON.stringify(condition)}+' / '+document.body.innerText.slice(0,800)));setTimeout(check,10)};check()})`);
        const click = selector => run(`document.querySelector(${JSON.stringify(selector)}).click()`);
        const clickText = text => run(`[...document.querySelectorAll('button')].find(button => button.textContent === ${JSON.stringify(text)}).click()`);
        const idle = 'document.querySelector("main[data-busy=false]") && !document.getElementById("nav-content").disabled';
        const returned = id => `document.getElementById('content-body')?.value === window.documents.find(item => item.id === ${JSON.stringify(id)})?.body && document.querySelector('.content-detail-tabs button[aria-current=page]')?.textContent === '正文' && document.querySelector('.content-detail-hero h2')?.textContent === window.documents.find(item => item.id === ${JSON.stringify(id)})?.title`;
        async function input(selector, value) {
            await run(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.focus();el.select();})()`);
            window.webContents.insertText(value);
            await wait(`document.querySelector(${JSON.stringify(selector)})?.value === ${JSON.stringify(value)}`);
        }
        async function openPrompts() {
            await wait(idle);
            await click('#open-content-prompts');
            await wait('document.getElementById("return-prompt-content-body") && !document.getElementById("return-prompt-content-body").disabled');
        }
        async function chooseContent(id) {
            await run('document.querySelector(".prompt-reference-picker").open = true');
            await click('.prompt-reference-fields .semi-select');
            const label = id ? `内容 ${id}` : '暂不关联内容';
            await wait(`[...document.querySelectorAll('[role="option"]')].some(option => option.textContent.trim() === ${JSON.stringify(label)})`);
            await run(`[...document.querySelectorAll('[role="option"]')].find(option => option.textContent.trim() === ${JSON.stringify(label)}).click()`);
            await wait(`document.querySelector('.prompt-reference-fields .semi-select').textContent.includes(${JSON.stringify(label)})`);
        }
        async function returnTo(id) {
            const reads = await run('window.reads.filter(item => item.method === "readContent").length');
            await click('#return-prompt-content-body');
            await wait(returned(id));
            await wait(idle);
            assert.deepEqual(await run(`window.reads.filter(item => item.method === 'readContent').slice(${reads}).map(item => item.input.id)`), [id], 'return reads exactly the selected ID');
        }
        try {
            await window.loadFile(path.join(probeRoot, 'dist/index.html'));
            await wait('document.querySelector(".creator-overview") && ' + idle);
            await click('#nav-content');
            await wait('document.querySelector("[data-content-id=a] .content-title-link")');
            await click('[data-content-id=a] .content-title-link');
            await wait('document.querySelector(".content-detail-page") && ' + idle);
            await clickText('正文');
            await wait(returned('a'));
            const original = await run('structuredClone(window.documents)');

            await input('#content-body', '尚未保存的正文草稿');
            await click('#open-content-prompts');
            await wait('document.getElementById("leave-stay")');
            await click('#leave-stay');
            assert.equal(await run('document.getElementById("content-body").value'), '尚未保存的正文草稿', 'forward navigation guard keeps body draft');
            await click('#open-content-prompts');
            await click('#leave-discard');
            await wait('document.getElementById("return-prompt-content-body") && ' + idle);
            assert.equal(await run('document.querySelector(".prompt-workspace > .actions").textContent.includes("内容 a")'), true);
            await returnTo('a');

            await openPrompts();
            await run('window.documents[0] = {...window.documents[0], body: "外部最新已保存正文 a", editToken: "external-a"}');
            await returnTo('a');
            assert.equal(await run('document.getElementById("content-body").value'), '外部最新已保存正文 a', 'return reloads saved content rather than stale workspace text');
            await openPrompts();
            await chooseContent('b');
            assert.equal(await run('document.querySelector(".prompt-workspace > .actions").textContent.includes("内容 b")'), true, 'visible destination follows latest explicit association');
            await returnTo('b');

            await openPrompts();
            await chooseContent('');
            assert.equal(await run('document.getElementById("return-prompt-content-body").disabled'), true, 'unassociated prompts never choose an implicit default');
            await chooseContent('b');
            await clickText('＋ 添加提示词');
            await wait('document.querySelector(".prompt-simple-editor textarea")');
            await input('.prompt-simple-editor textarea', '保留提示词编辑草稿');
            await clickText('暂时收起');
            await click('#return-prompt-content-body');
            await wait('document.body.innerText.includes("还有未保存的填写内容")');
            assert.equal(await run('!!document.querySelector(".prompt-workspace") && document.querySelector(".prompt-simple-editor textarea").value === "保留提示词编辑草稿"'), true, 'return guard preserves minimized editor draft');
            await clickText('继续编辑');
            await clickText('关闭');
            await clickText('放弃填写并关闭');
            await wait('!document.querySelector(".prompt-simple-editor")');

            await click('.prompt-library-use');
            await wait('document.getElementById("prompt-field-0")');
            await input('#prompt-field-0', '保留本次提示词填写');
            await click('#return-prompt-content-body');
            assert.equal(await run('!!document.querySelector(".prompt-workspace") && document.getElementById("prompt-field-0").value === "保留本次提示词填写"'), true, 'return callback guard also preserves prompt form values');
            await clickText('关闭');
            await clickText('放弃本次填写并关闭');
            await wait('!document.querySelector(".prompt-dialog")');

            for (const failure of ['inaccessible', 'wrong-id', 'trashed', 'missing']) {
                await run(`window.readFailure=${JSON.stringify(failure)};window.savedDocuments=structuredClone(window.documents);${failure === 'trashed' ? 'window.documents[1].deletedAt="2026-10-19"' : failure === 'missing' ? 'window.documents=window.documents.filter(item=>item.id!=="b")' : ''}`);
                await click('#return-prompt-content-body');
                await wait(idle);
                assert.equal(await run('!!document.querySelector(".prompt-workspace") && !document.getElementById("content-body")'), true, failure + ' must stay on prompts and never load a wrong/empty body');
                assert.equal(await run('document.getElementById("error").textContent.includes("关联内容")'), true, failure + ' reports a visible error');
                if (failure === 'trashed' || failure === 'missing') {
                    assert.equal(await run('document.getElementById("return-prompt-content-body").disabled'), true, 'fresh snapshot disables unavailable target');
                    assert.equal(await run('document.querySelector(".prompt-reference-fields .semi-select").textContent.includes("关联内容已移入回收站或不再可用")'), true, 'missing association remains explicit rather than silently choosing another content');
                }
                await run('window.readFailure=null;window.documents=window.savedDocuments');
                await click('#refresh-workspace');
                await wait('!document.getElementById("return-prompt-content-body").disabled && ' + idle);
            }
            await returnTo('b');
            assert.deepEqual(await run('window.writes'), [], 'navigation, guards and failed reads must never mutate saved content, prompts or clipboard');
            assert.deepEqual(await run('window.documents.map(({id,title})=>({id,title}))'), original.map(({id, title}) => ({id, title})));
            assert.equal(await run('document.getElementById("editor-dirty-state").textContent'), '已保存');
            console.log('PASS actual App/React/Semi/Electron: content→prompts→same ID/body; fresh saved read; explicit reassociation; no implicit fallback; body/editor/form draft guards; inaccessible/wrong-ID/trashed/missing stay put with visible errors; unavailable picker retains target; zero mutations. Desktop bridge is fixture-backed.');
            app.exit(0);
        } catch (error) {console.error(error); app.exit(1);}
    }
    await fs.writeFile(path.join(root, 'main.mjs'), `(${probeMain.toString()})(${JSON.stringify(root)})`);
    await new Promise((resolve, reject) => {
        const child = spawn(electron, [path.join(root, 'main.mjs')], {stdio: 'inherit'});
        const timeout = setTimeout(() => {child.kill('SIGKILL'); reject(new Error('Prompt body return probe timed out'));}, 45000);
        child.once('error', reject);
        child.once('close', code => {clearTimeout(timeout); code === 0 ? resolve() : reject(new Error('Prompt body return probe failed: ' + code));});
    });
} finally {await fs.rm(root, {recursive: true, force: true});}
