// Exercise the shipped React/Semi editors in an isolated Electron process; all probe output stays in tmp.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import electron from 'electron';
import {build} from 'vite';

const workbench = fileURLToPath(new URL('../', import.meta.url));
const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'nova-managed-draft-')));
try {
    await fs.writeFile(path.join(root, 'index.html'), '<div id="root"></div><script type="module" src="/probe.jsx"></script>');
    await fs.writeFile(path.join(root, 'probe.jsx'), `
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ManagementDialog, LibraryPanels, hasManagedDrafts} from ${JSON.stringify(path.join(workbench, 'src/renderer/library-panels.tsx'))};
import {PromptsPage} from ${JSON.stringify(path.join(workbench, 'src/renderer/workspace-pages.tsx'))};
window.hasManagedDrafts = hasManagedDrafts;
window.writes = [];
const library = {prompts: [], settings: {visiblePromptCategories: []}};
window.contentHub = {mutateWorkspace: async input => {
  window.writes.push(input);
  const saved = input.op === 'setGenerationDefaults' ? {...window.libraryFixture, settings: {...window.libraryFixture.settings, defaults: input.defaults, editToken: 'saved-' + window.writes.length, defaultIssues: []}} : library;
  if (input.op === 'setGenerationDefaults') window.probe.setLibrary(saved);
  return {ok: true, value: {library: saved}};
}};
function Probe() {
  const [mode, setMode] = useState('prompts'), [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [data, setLibrary] = useState(library);
  window.probe = {setMode, setOpen, setBusy, setLibrary};
  window.libraryFixture = data;
  return mode === 'library' ? <LibraryPanels library={data} assets={null} busy={busy} run={action => action()} refresh={async () => {}}/> : mode === 'prompts' ? <PromptsPage workspace={null} library={library} busy={busy} run={action => action()} refresh={async () => {}}/> : open ?
    <ManagementDialog title="Fallback editor" busy={busy} dirty={mode === 'controlled' ? false : undefined} close={() => setOpen(false)}><form onSubmit={event => event.preventDefault()}><input/><button type="button">Local action</button></form></ManagementDialog> : <p>Closed</p>;
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
        const click = text => run(`[...document.querySelectorAll('button')].find(button => button.textContent === ${JSON.stringify(text)}).click()`);
        async function addPrompt() {await click('＋ 添加提示词'); await wait('document.querySelector("dialog[open] textarea")');}
        async function input(text) {
          await run('(document.querySelector("dialog textarea") || document.querySelector("dialog input")).focus()');
          window.webContents.insertText(text);
          await wait(`(document.querySelector('dialog textarea') || document.querySelector('dialog input')).value === ${JSON.stringify(text)}`);
        }
        try {
          await window.loadFile(path.join(probeRoot, 'dist/index.html'));
          await wait('window.probe && document.querySelector(".prompt-workspace")');
          await addPrompt();
          assert.equal(await run('hasManagedDrafts()'), false, 'blank prompt starts clean');
          await input('abcdef');
          await wait('hasManagedDrafts()');
          window.webContents.undo();
          await wait('document.querySelector("dialog textarea").value === "" && document.querySelector(".prompt-editor-footer").textContent.includes("0 字")');
          assert.equal(await run('document.querySelector(".prompt-editor-footer").textContent.includes("0 字")'), true);
          await click('关闭');
          await wait('!document.querySelector("dialog")');
          assert.equal(await run('hasManagedDrafts()'), false, 'native undo to blank must clear every draft guard');
          assert.deepEqual(await run('window.writes'), [], 'typing, undo and closing must not save');

          await addPrompt();
          await input('unsaved');
          await click('关闭');
          await wait('document.querySelector("dialog [role=alert]")');
          assert.equal(await run('document.querySelector("dialog textarea").value'), 'unsaved');
          await click('继续填写');
          await click('暂时收起');
          assert.equal(await run('!document.querySelector("dialog").open && hasManagedDrafts()'), true, 'minimized dirty editor must guard navigation');
          await run('document.querySelector("dialog").hidden = true');
          assert.equal(await run('hasManagedDrafts()'), true, 'hidden dirty editor must retain protection');
          await run('document.querySelector("dialog").hidden = false');
          await click('继续编辑');
          await wait('document.querySelector("dialog[open]")');
          await run('probe.setBusy(true)');
          await wait('[...document.querySelectorAll("dialog button")].find(button => button.textContent === "关闭").disabled');
          await run('document.querySelector("dialog").dispatchEvent(new Event("cancel", {cancelable: true}))');
          assert.equal(await run('!!document.querySelector("dialog") && !document.querySelector("dialog [role=alert]")'), true, 'in-flight action must block cancel');
          await run('probe.setBusy(false)');
          await wait('![...document.querySelectorAll("dialog button")].find(button => button.textContent === "关闭").disabled');
          await run('(()=>{const el=document.querySelector("dialog textarea");Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value").set.call(el, "");el.dispatchEvent(new Event("input", {bubbles:true}));})()');
          await wait('document.querySelector(".prompt-editor-footer").textContent.includes("0 字")');
          assert.equal(await run('hasManagedDrafts()'), false, 'manual reversion must clear guard');
          await click('关闭');
          await wait('!document.querySelector("dialog")');
          assert.deepEqual(await run('window.writes'), [], 'reversion and close must not save');

          await addPrompt();
          await input('explicit save');
          await click('保存提示词');
          await wait('!document.querySelector("dialog")');
          assert.equal(await run('window.writes.length'), 1, 'only explicit save writes');
          assert.equal(await run('window.writes[0].body'), 'explicit save');
          assert.equal(await run('hasManagedDrafts()'), false, 'saved/unmounted dialog clears guard');

          await run('probe.setMode("controlled"); probe.setOpen(true)');
          await wait('document.querySelector("dialog[open] input")');
          await click('Local action');
          assert.equal(await run('hasManagedDrafts()'), false, 'known clean dialogs must not become dirty from form buttons');
          await click('暂时收起');
          assert.equal(await run('hasManagedDrafts()'), false, 'minimizing a clean editor must not block navigation');
          await click('继续编辑');
          await click('关闭');
          await wait('!document.querySelector("dialog")');

          await run('probe.setMode("fallback"); probe.setOpen(true)');
          await wait('document.querySelector("dialog[open] input")');
          await click('关闭');
          await wait('!document.querySelector("dialog")');
          await run('probe.setOpen(true)');
          await wait('document.querySelector("dialog[open] input")');
          await input('fallback');
          await click('关闭');
          await wait('document.querySelector("dialog [role=alert]")');
          assert.equal(await run('hasManagedDrafts()'), true, 'callers without dirty keep conservative input protection');
          await click('放弃填写并关闭');
          await wait('!document.querySelector("dialog") && !hasManagedDrafts()');
          await run('probe.setOpen(true)');
          await wait('document.querySelector("dialog[open] input")');
          await click('Local action');
          await click('关闭');
          await wait('document.querySelector("dialog [role=alert]")');
          assert.equal(await run('window.writes.length'), 1);
          await click('放弃填写并关闭');
          await wait('!document.querySelector("dialog") && !hasManagedDrafts()');
          const cases = [
            {name: 'revoked', photo: {isOwnPhoto: false}, issue: '照片不再声明为本人', field: 'photoId'},
            {name: 'trashed-photo', photo: {deletedAt: '2026-10-19'}, issue: '照片已在回收站', field: 'photoId'},
            {name: 'unavailable-photo', photo: {availability: 'unavailable'}, issue: '照片原图不可用', field: 'photoId'},
            {name: 'missing-photo', missing: true, issue: '原照片已找不到', field: 'photoId'},
            {name: 'trashed-template', template: {deletedAt: '2026-10-19'}, issue: '模板已在回收站', field: 'templateId'},
            {name: 'missing-template', missing: true, issue: '原模板已找不到', field: 'templateId'}
          ];
          for (const item of cases) {
            const fixture = {prompts: [], collections: [], contentDetails: [],
              photos: item.missing && item.field === 'photoId' ? [] : [{id: 'photo-fixture', title: '测试照片', editToken: 'photo-token', isOwnPhoto: true, availability: 'available', deletedAt: null, ...item.photo}],
              templates: item.missing && item.field === 'templateId' ? [] : [{id: 'template-fixture', title: '测试模板', currentVersion: 1, deletedAt: null, ...item.template}],
              settings: {editToken: 'settings-' + item.name, defaults: {photoId: item.field === 'photoId' ? 'photo-fixture' : null, templateId: item.field === 'templateId' ? 'template-fixture' : null, coverCount: 2}, channels: [], defaultIssues: [{field: item.field, reason: 'fixture'}]}};
            const before = await run('window.writes.length');
            await run('probe.setMode("library"); probe.setLibrary(' + JSON.stringify(fixture) + ')');
            await wait('document.querySelector(".management-tabs")');
            if (item.photo?.deletedAt) {await click('照片回收站'); await wait('document.body.innerText.includes("默认人物参考已失效")');}
            if (item.field === 'photoId' && !item.missing) assert.equal(await run('document.body.innerText.includes("默认人物参考已失效")'), true, item.name + ' default photo row');
            await click('生成默认值');
            await wait('document.querySelector(".management-form select")');
            const position = item.field === 'photoId' ? 0 : 1;
            const selected = await run('(()=>{const select=document.querySelectorAll(".management-form select")[' + position + '];return {value:select.value, text:select.selectedOptions[0].textContent, disabled:select.selectedOptions[0].disabled}})()');
            assert.equal(selected.value, fixture.settings.defaults[item.field]);
            assert.equal(selected.disabled, true);
            assert.ok(selected.text.includes(item.issue));
            assert.equal(await run('document.body.innerText.includes("photoId") || document.body.innerText.includes("ownership-revoked")'), false, 'show human language');
            assert.equal(await run('window.writes.length'), before, 'opening an invalid default must not write');
            await run('(()=>{const input=document.querySelector(".management-form input[type=number]");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(input,"3");input.dispatchEvent(new Event("input",{bubbles:true}));})()');
            await wait('hasManagedDrafts()');
            assert.equal(await run('[...document.querySelectorAll("button")].find(button=>button.textContent === "保存默认值").disabled'), true, 'dirty invalid references still cannot save');
            await run('document.querySelector(".management-form").dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}))');
            assert.equal(await run('window.writes.length'), before, 'submit cannot write invalid references');
            await run('(()=>{const select=document.querySelectorAll(".management-form select")[' + position + '];select.value="";select.dispatchEvent(new Event("change",{bubbles:true}));})()');
            await wait('![...document.querySelectorAll("button")].find(button=>button.textContent === "保存默认值").disabled');
            assert.equal(await run('window.writes.length'), before, 'explicit selection still waits for Save');
            await run('probe.setBusy(true)');
            await wait('[...document.querySelectorAll("button")].find(button=>button.textContent === "保存默认值").disabled');
            await run('probe.setBusy(false)');
            await wait('![...document.querySelectorAll("button")].find(button=>button.textContent === "保存默认值").disabled');
            await click('保存默认值');
            await wait('!hasManagedDrafts()');
            assert.deepEqual(await run('window.writes.slice(' + before + ')'), [{op: 'setGenerationDefaults', editToken: fixture.settings.editToken, defaults: {photoId: null, templateId: null, coverCount: 3}}]);
            assert.equal(await run('!!document.querySelector(".danger-note")'), false, 'saved explicit null resolves default warning');
            await run('probe.setMode("fallback")');
            await wait('!document.querySelector(".management-tabs")');
          }
          const photoFixture = {prompts: [], collections: [], contentDetails: [], templates: [], photos: [{id: 'photo-fixture', title: '测试照片', editToken: 'photo-token', isOwnPhoto: true, availability: 'available', deletedAt: null}], settings: {defaults: {photoId: null}, channels: []}};
          await run('probe.setMode("library"); probe.setLibrary(' + JSON.stringify(photoFixture) + ')');
          await wait('document.querySelector(".management-tabs")');
          await click('管理');
          await wait('document.querySelector("dialog[open]")');
          await run('document.querySelector("dialog input[type=checkbox]").click()');
          await wait('hasManagedDrafts()');
          await run('document.querySelector("dialog input[type=checkbox]").click()');
          await wait('!hasManagedDrafts()');
          await click('关闭');
          await wait('!document.querySelector("dialog")');
          console.log('PASS invalid defaults: revoked/trashed/unavailable/missing photos and trashed/missing templates display selected disabled Chinese options; no automatic writes; invalid submit blocked; explicit null saves once with original token; photo declaration reversion closes cleanly.');
          console.log('PASS actual Electron/React/Semi: native input→undo and manual reversion close cleanly; dirty confirmation; minimized/hidden guards; busy cancel; explicit-save-only writes; conservative uncontrolled input/button fallback.');
          app.exit(0);
        } catch (error) {console.error(error); app.exit(1);}
    }
    await fs.writeFile(path.join(root, 'main.mjs'), `(${probeMain.toString()})(${JSON.stringify(root)})`);
    const code = await new Promise((resolve, reject) => {
        const child = spawn(electron, [path.join(root, 'main.mjs')], {stdio: 'inherit'});
        const timeout = setTimeout(() => {child.kill('SIGKILL'); reject(new Error('Managed draft probe timed out'));}, 45000);
        child.once('error', reject);
        child.once('close', code => {clearTimeout(timeout); resolve(code);});
    });
    assert.equal(code, 0, 'Managed draft probe failed');
} finally {await fs.rm(root, {recursive: true, force: true});}
