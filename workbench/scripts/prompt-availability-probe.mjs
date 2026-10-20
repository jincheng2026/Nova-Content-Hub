// Exercise shipped React/Semi prompt controls in an isolated Electron window; keep fixtures in tmp.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import electron from 'electron';
import {build} from 'vite';

const workbench = fileURLToPath(new URL('../', import.meta.url));
const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'nova-prompt-availability-')));
try {
    await fs.writeFile(path.join(root, 'index.html'), '<div id="root"></div><script type="module" src="/probe.jsx"></script>');
    await fs.writeFile(path.join(root, 'probe.jsx'), `
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import ${JSON.stringify(path.join(workbench, 'node_modules/@douyinfe/semi-ui-19/react19-adapter'))};
import ${JSON.stringify(path.join(workbench, 'node_modules/@douyinfe/semi-ui-19/lib/es/_base/base.css'))};
import ${JSON.stringify(path.join(workbench, 'src/renderer/style.css'))};
import {PromptsPage} from ${JSON.stringify(path.join(workbench, 'src/renderer/workspace-pages.tsx'))};
import {hasManagedDrafts} from ${JSON.stringify(path.join(workbench, 'src/renderer/library-panels.tsx'))};
window.hasManagedDrafts = hasManagedDrafts;
window.copies = []; window.writes = [];
const prompt = {id: 'prompt-1', editToken: 'original', title: '停用测试', body: '第一行\\n{{主题|输入主题}}\\n最后一行', category: '写作', summary: '', when: '', tags: [], enabled: false, deletedAt: null};
const content = {id: 'content-1', title: '参考标题', body: '正文第一行\\n正文第二行', deletedAt: null};
window.contentHub = {
  copyPrompt: async ({text}) => {window.copies.push(text); return {ok: true, value: {copied: true}};},
  mutateWorkspace: async input => {
    window.writes.push(input);
    const library = {...window.probe.library, prompts: window.probe.library.prompts.map(item => ({...item, editToken: 'saved-' + window.writes.length,
      ...(input.op === 'setPromptEnabled' ? {enabled: input.enabled} : input.op === 'updatePrompt' ? input : {deletedAt: input.op === 'trashPrompt' ? '2026-10-19' : null})}))};
    window.probe.setLibrary(library);
    return {ok: true, value: {library}};
  }
};
function Probe() {
  const [library, setLibrary] = useState({prompts: [prompt], settings: {visiblePromptCategories: []}}), [busy, setBusy] = useState(false);
  window.probe = {library, setLibrary, setBusy, change: patch => setLibrary(old => ({...old, prompts: [{...old.prompts[0], ...patch}]}))};
  return <PromptsPage workspace={{contents: [content], prompts: []}} library={library} busy={busy} initialContentId="content-1" run={action => action()} refresh={async () => {}}/>;
}
createRoot(document.getElementById('root')).render(<Probe/>);
`);
    await build({configFile: false, root, base: './', resolve: {alias: {react: path.join(workbench, 'node_modules/react'), 'react-dom': path.join(workbench, 'node_modules/react-dom')}}, oxc: {jsx: {runtime: 'automatic'}}, build: {outDir: path.join(root, 'dist'), modulePreload: false, target: 'chrome148'}});
    async function probeMain(probeRoot) {
        const {app, BrowserWindow} = await import('electron');
        const {default: assert} = await import('node:assert/strict');
        const {default: path} = await import('node:path');
        app.setPath('userData', path.join(probeRoot, 'machine'));
        await app.whenReady();
        const window = new BrowserWindow({show: false, webPreferences: {contextIsolation: true, nodeIntegration: false}});
        const run = source => window.webContents.executeJavaScript(source);
        const wait = condition => run(`new Promise((resolve,reject)=>{const end=Date.now()+4000;const check=()=>{if(${condition})return resolve(true);if(Date.now()>end)return reject(new Error('State timeout: '+${JSON.stringify(condition)}+' / '+document.body.innerText.slice(0,500)));setTimeout(check,10)};check()})`);
        const click = async text => {if (['编辑提示词','启用提示词','停用提示词','移入回收站'].includes(text) && !await run(`[...document.querySelectorAll('[role=menuitem]')].some(item=>item.textContent===${JSON.stringify(text)})`)) {await run('document.querySelector(".prompt-card-menu").click()');await wait('document.querySelector("[role=menuitem]")');}return run(`[...document.querySelectorAll('button,[role=menuitem]')].find(button => button.textContent === ${JSON.stringify(text)}).click()`);};
        const choose = async (label,text) => {await run(`[...document.querySelectorAll('.list-toolbar .semi-control')].find(el=>el.querySelector('.semi-control-label').textContent===${JSON.stringify(label)}).querySelector('.semi-select').click()`);await wait('[...document.querySelectorAll("[role=option]")].some(el=>el.textContent==='+JSON.stringify(text)+')');await run(`[...document.querySelectorAll('[role=option]')].find(el=>el.textContent===${JSON.stringify(text)}).click()`);};
        const copyDisabled = '[...document.querySelectorAll("dialog button")].find(button => button.textContent === "复制完整提示词").disabled';
        try {
            await window.loadFile(path.join(probeRoot, 'dist/index.html'));
            await wait('window.probe && document.querySelector(".prompt-workspace")');
            assert.equal(await run('document.querySelectorAll(".prompt-library-use").length'), 1, 'all-state filter includes disabled card');
            await wait('document.querySelector(".prompt-library-use")');
            assert.equal(await run('document.querySelector(".prompt-library-use").disabled'), true, 'all tab cannot open disabled prompt');
            assert.ok(await run('document.querySelector(".prompt-use-footer").textContent.includes("启用后使用")'));
            await run('document.querySelector(".prompt-library-use").click()');
            assert.equal(await run('!!document.querySelector("dialog")'), false);
            await run('document.querySelector(".prompt-card-menu").click()');
            await click('编辑提示词');
            await wait('document.querySelector(".prompt-simple-editor")');
            assert.equal(await run('document.querySelector(".prompt-simple-editor textarea").value'), '第一行\n{{主题|输入主题}}\n最后一行', 'disabled prompt remains editable');
            await click('关闭');
            await wait('!document.querySelector("dialog")');
            assert.deepEqual(await run('window.writes'), [], 'opening and closing editor does not enable or save');
            await click('启用提示词');
            await wait('!document.querySelector(".prompt-library-use").disabled');
            assert.deepEqual(await run('window.writes'), [{op: 'setPromptEnabled', id: 'prompt-1', editToken: 'original', enabled: true}]);
            await run('document.querySelector(".prompt-library-use").click()');
            await wait('document.querySelector(".prompt-dialog[open]")');
            assert.equal(await run('document.querySelector(".prompt-dialog input[type=checkbox]").checked'), false);
            assert.equal(await run('document.querySelector(".prompt-preview textarea").value.includes("参考标题")'), false, 'reference content stays opt in');
            await click('复制完整提示词');
            await wait('document.querySelector(".dialog-footer").textContent.includes("请先填写：主题")');
            assert.deepEqual(await run('window.copies'), [], 'required variables still guard copy');
            await run('document.querySelector("#prompt-field-0").focus()');
            window.webContents.insertText('本次主题');
            await wait('document.querySelector(".prompt-preview textarea").value.includes("本次主题") && hasManagedDrafts()');
            await run('document.querySelector(".prompt-dialog input[type=checkbox]").click()');
            await wait('document.querySelector(".prompt-preview textarea").value.includes("正文第二行")');
            const preview = await run('document.querySelector(".prompt-preview textarea").value');
            assert.ok(preview.startsWith('第一行\n本次主题\n最后一行'), 'template line breaks remain intact');
            await click('复制完整提示词');
            await wait('window.copies.length === 1');
            assert.deepEqual(await run('window.copies'), [preview]);

            await run('window.savedDialog = document.querySelector(".prompt-dialog"); probe.change({enabled: false, editToken: "disabled"})');
            await wait(copyDisabled);
            assert.equal(await run('document.querySelector(".prompt-dialog [role=alert]").textContent.includes("已停用")'), true);
            assert.equal(await run('document.querySelector("#prompt-field-0").disabled && document.querySelector(".prompt-dialog input[type=checkbox]").disabled && document.querySelector(".prompt-preview textarea").disabled'), true);
            await click('复制完整提示词');
            assert.equal(await run('window.copies.length'), 1, 'disabled dialog cannot copy');
            assert.equal(await run('document.querySelector("#prompt-field-0").value'), '本次主题');
            assert.equal(await run('document.querySelector(".prompt-preview textarea").value'), preview);
            assert.equal(await run('hasManagedDrafts() && savedDialog === document.querySelector(".prompt-dialog")'), true, 'snapshot refresh retains dialog and draft');
            await click('关闭');
            await wait('document.querySelector(".prompt-discard").textContent.includes("关闭会清除")');
            await click('继续填写');
            await run('probe.change({enabled: true, editToken: "reenabled"})');
            await wait('!(' + copyDisabled + ')');
            assert.equal(await run('document.querySelector(".prompt-preview textarea").value'), preview, 're-enable retains values and reference opt in');

            await run('probe.change({deletedAt: "2026-10-19", editToken: "trashed"})');
            await wait(copyDisabled);
            assert.equal(await run('document.querySelector(".prompt-dialog [role=alert]").textContent.includes("回收站")'), true);
            await click('复制完整提示词');
            assert.equal(await run('window.copies.length'), 1, 'trashed dialog cannot copy');
            await run('window.savedPrompt = probe.library.prompts[0]; probe.setLibrary({...probe.library, prompts: []})');
            await wait('!document.querySelector(".prompt-library-use")');
            assert.equal(await run(copyDisabled), true, 'missing prompt cannot copy');
            assert.equal(await run('document.querySelector(".prompt-preview textarea").value'), preview, 'missing prompt keeps draft');
            await run('probe.setLibrary({...probe.library, prompts: [{...savedPrompt, enabled: true, deletedAt: null, editToken: "restored"}]})');
            await wait('!(' + copyDisabled + ')');
            await click('复制完整提示词');
            await wait('window.copies.length === 2');
            assert.deepEqual(await run('window.copies'), [preview, preview]);
            await click('关闭');
            await click('放弃本次填写并关闭');
            await wait('!document.querySelector("dialog") && !hasManagedDrafts()');

            await run('probe.change({enabled: false})');
            await wait('document.querySelector(".prompt-library-use").disabled');
            await click('移入回收站');
            await choose('提示词范围', '回收站');
            await wait('document.querySelector(".prompt-use-footer")?.textContent.includes("恢复提示词")');
            assert.equal(await run('document.querySelector(".prompt-library-use").disabled'), true);
            await click('恢复提示词');
            await wait('!document.querySelector(".prompt-library-use")');
            await choose('提示词范围', '正常提示词');
            await wait('document.querySelector(".prompt-library-use")');
            assert.equal(await run('document.querySelector(".prompt-library-use").disabled'), true, 'restore preserves disabled state until explicit enable');
            assert.equal(await run('window.writes.length'), 3, 'only explicit enable/trash/restore mutate the library');
            console.log('PASS actual Electron/React/Semi: disabled cards blocked with enable guidance; editing/explicit enable/trash/restore preserved; live disabled/trashed/missing snapshots block filling and copying while retaining draft; re-enable resumes; required variables, multiline copy, reference opt in and dirty-close confirmation preserved.');

            await run('document.querySelector(".prompt-card-menu").click()');
            await click('编辑提示词');
            await wait('document.querySelector(".prompt-simple-editor")');
            await run('document.querySelector(".prompt-simple-editor input").focus(); document.querySelector(".prompt-simple-editor input").select()');
            window.webContents.insertText('本次未保存标题');
            await wait('document.querySelector(".prompt-simple-editor input").value === "本次未保存标题" && hasManagedDrafts()');
            const external = {title: '外部最新标题', body: '外部第一行\nexternal line\n外部最后一行', category: '外部分类', summary: '外部说明', when: '外部场景', tags: ['外部标签'], editToken: 'external-token'};
            await run('probe.change(' + JSON.stringify(external) + ')');
            await wait('document.querySelector(".prompt-simple-editor [role=alert]")');
            assert.equal(await run('document.querySelector(".prompt-simple-editor input").value'), '本次未保存标题', 'background update must retain old draft');
            assert.equal(await run('document.querySelector(".prompt-simple-editor textarea").value'), '第一行\n{{主题|输入主题}}\n最后一行', 'background update must not replace old body');
            const saveDisabled = '[...document.querySelectorAll("dialog button")].find(button => button.textContent === "保存修改").disabled';
            assert.equal(await run(saveDisabled), true, 'stale edit token cannot save');
            await run('document.querySelector(".prompt-simple-editor").dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}))');
            assert.equal(await run('window.writes.length'), 3, 'stale submit cannot mutate');
            await click('重新读取最新提示词');
            await wait('document.body.innerText.includes("重新读取会放弃本次填写")');
            await click('保留本次填写');
            assert.equal(await run('document.querySelector(".prompt-simple-editor input").value'), '本次未保存标题', 'cancel reload keeps draft');
            await run('probe.setBusy(true)');
            await wait('[...document.querySelectorAll("dialog button")].find(button => button.textContent === "重新读取最新提示词").disabled');
            assert.equal(await run(saveDisabled), true);
            assert.equal(await run('document.querySelector("dialog").textContent.includes("暂时收起") && document.querySelector(".prompt-simple-editor").textContent.includes("继续处理")'), true, 'busy recovery points to global pending flow');
            await click('暂时收起');
            await wait('!document.querySelector("dialog").open && hasManagedDrafts()');
            await run('probe.setBusy(false)');
            await click('继续编辑');
            await wait('document.querySelector("dialog[open]")');
            await click('重新读取最新提示词');
            await click('放弃本次填写并重新读取');
            await wait('document.querySelector(".prompt-simple-editor textarea").value.includes("external line") && !hasManagedDrafts()');
            assert.equal(await run('document.querySelector(".prompt-simple-editor textarea").value'), external.body);
            assert.deepEqual(await run('[...document.querySelectorAll(".prompt-simple-editor input")].map(input => input.value)'), [external.title, external.category, external.tags.join('、'), external.when, external.summary], 'reload resets every field baseline');
            assert.equal(await run('window.writes.length'), 3, 'reload is read only');
            assert.equal(await run(saveDisabled), false);
            await click('保存修改');
            await wait('!document.querySelector("dialog")');
            assert.deepEqual(await run('window.writes[3]'), {op: 'updatePrompt', id: 'prompt-1', ...external}, 'save uses explicitly reloaded token and fields');
            for (const missing of [false, true]) {
                await click('编辑提示词');
                await wait('document.querySelector(".prompt-simple-editor")');
                await run(missing ? 'window.savedEditorPrompt = probe.library.prompts[0]; probe.setLibrary({...probe.library, prompts: []})' : 'probe.change({deletedAt: "2026-10-19", editToken: "deleted-token"})');
                await wait(saveDisabled);
                await run('document.querySelector(".prompt-simple-editor").dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}))');
                assert.equal(await run('window.writes.length'), 4, 'deleted/missing prompt submit cannot mutate');
                await click('关闭');
                await wait('!document.querySelector("dialog")');
                await run(missing ? 'probe.setLibrary({...probe.library, prompts: [{...savedEditorPrompt, deletedAt: null}]})' : 'probe.change({deletedAt: null})');
                await wait('document.querySelector(".prompt-library-use")');
            }
            console.log('PASS external editor recovery: stale draft retained; stale/deleted/missing saves blocked; reload confirmation can cancel; busy flow preserves draft while minimized; confirmed reload resets all fields and token; only explicit save sends fresh token.');
            app.exit(0);
        } catch (error) {console.error(error); app.exit(1);}
    }
    await fs.writeFile(path.join(root, 'main.mjs'), `(${probeMain.toString()})(${JSON.stringify(root)})`);
    const code = await new Promise((resolve, reject) => {
        const child = spawn(electron, [path.join(root, 'main.mjs')], {stdio: 'inherit'});
        const timeout = setTimeout(() => {child.kill('SIGKILL'); reject(new Error('Prompt availability probe timed out'));}, 45000);
        child.once('error', reject);
        child.once('close', code => {clearTimeout(timeout); resolve(code);});
    });
    assert.equal(code, 0, 'Prompt availability probe failed');
} finally {await fs.rm(root, {recursive: true, force: true});}
