// Run with node workbench/test/assistant-settings-ui-probe.mjs; only the IPC fixture is synthetic.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import electron from 'electron';
import {build} from 'vite';
import {assistantNotReady} from '../src/main/assistant-failure.mts';

const workbench = fileURLToPath(new URL('../', import.meta.url));
const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'nova-ai-settings-')));
const mismatchMessage = assistantNotReady('plugin-mismatch', {expectedVersion: '0.5.3', installedVersion: '0.5.1'}).message;
await fs.writeFile(path.join(root, 'index.html'), '<html lang="zh-CN"><div id="root"></div><script type="module" src="/fixture.jsx"></script></html>');
await fs.writeFile(path.join(root, 'fixture.jsx'), `
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import '${workbench}/node_modules/@douyinfe/semi-ui-19/react19-adapter';
import '${workbench}/node_modules/@douyinfe/semi-ui-19/lib/es/_base/base.css';
import '${workbench}/src/renderer/style.css';
import {AssistantSettings} from '${workbench}/src/renderer/assistant-settings.tsx';
import {SetupPanel} from '${workbench}/src/renderer/setup-panel.tsx';
window.calls=[]; window.host='codex'; window.market='available'; window.coverReady=true; window.templateReady=true;
window.mismatchMessage=${JSON.stringify(mismatchMessage)};
window.contentHub=new Proxy({}, {get:(_,method)=>async input=>{
  window.calls.push({method,input,host:window.host});
  const assistant={host:window.host,ready:window.coverReady,reason:window.coverReady?'available':window.setupReason??'skill-missing',...(window.setupMessage?{message:window.setupMessage}:{})};
  let value;
  if(method==='readAssistantSetup')value=assistant;
  else if(method==='readTemplateAssistantSetup')value={...assistant,ready:window.templateReady};
  else if(method==='readSetup'){
    if(window.failSetup)return {ok:false,error:{code:'IO_ERROR',message:'安装信息读取失败'}};
    value={platform:'darwin',arch:'arm64',version:'0.3.45',mode:'disabled',assistant,market:{state:window.market,name:'paired-fixture'}};
    if(window.pauseSetup){window.pauseSetup=false; await new Promise(resolve=>window.releaseSetup=resolve);}
  }
  else if(method==='setAssistant'){window.host=input.host;window.setHost(input.host);}
  else if(method==='copyPluginMarketLocation'){
    if(window.failCopy)return {ok:false,error:{code:'CLIPBOARD_UNAVAILABLE',message:'未能复制配套市场位置，请重试。'}};
    value={copied:true};
  }
  else if(method==='openSetupTarget')value={opened:true};
  else if(method==='exportDiagnostics')value={exported:true,name:'fixture-diagnostics.json'};
  else throw Error('Unexpected IPC: '+method);
  return {ok:true,value:structuredClone(value)};
}});
function Fixture(){
  const [host,setHost]=useState('codex'),[busy,setBusy]=useState(false);window.setHost=setHost;window.setBusy=setBusy;
  const run=async action=>{try{return await action();}catch(error){window.lastError=error.message;}};
  return <AssistantSettings status={{assistant:host}} busy={busy} blocked={false} run={run} close={()=>window.fixtureClosed=true}
    setup={<SetupPanel host={host} busy={busy} run={run}/>}/>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
`);
await build({configFile: false, root, base: './', logLevel: 'warn', resolve: {alias: {react: path.join(workbench, 'node_modules/react'), 'react-dom': path.join(workbench, 'node_modules/react-dom')}}, oxc: {jsx: {runtime: 'automatic'}}, build: {outDir: path.join(root, 'dist'), modulePreload: false, target: 'chrome148'}});

async function probeMain(root) {
  const {app, BrowserWindow} = await import('electron');
  const {default: assert} = await import('node:assert/strict');
  const {default: fs} = await import('node:fs/promises');
  const {default: path} = await import('node:path');
  app.setPath('userData', path.join(root, 'machine'));
  await app.whenReady();
  const win = new BrowserWindow({show: true, width: 1280, height: 860, webPreferences: {contextIsolation: true, nodeIntegration: false}});
  const run = code => win.webContents.executeJavaScript(code);
  const wait = condition => run(`new Promise((resolve,reject)=>{const end=Date.now()+6000;const check=()=>{if(${condition})return resolve();if(Date.now()>end)return reject(Error('Timed out: '+${JSON.stringify(condition)}));setTimeout(check,15);};check();})`);
  const click = text => run(`[...document.querySelectorAll('button')].find(b=>b.textContent===${JSON.stringify(text)}).click()`);
  const card = () => run('document.querySelector(".creator-settings-assistant").textContent');
  const recheck = async () => {await click('重新检查'); await wait('!document.getElementById("recheck-assistant").disabled');};
  try {
    await win.loadFile(path.join(root, 'dist/index.html'));
    await wait('document.getElementById("copy-assistant-plugin") && !document.getElementById("copy-assistant-plugin").disabled');
    assert.doesNotMatch(await card(), /封面助手|全局助手/);
    assert.match(await card(), /自媒体工作台 0.3.45.*随包插件同版/);
    await run('window.coverReady=false;window.templateReady=false;window.setupReason="plugin-mismatch";window.setupMessage=window.mismatchMessage'); await recheck();
    assert.match(await card(), /封面制作：当前工作台为 0.5.3，检测到配套插件 0.5.1/);
    assert.match(await card(), /模板学习与还原：当前工作台为 0.5.3，检测到配套插件 0.5.1/);
    await run('document.querySelector(".creator-settings-assistant").scrollIntoView({behavior:"instant",block:"start"});new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    await fs.writeFile(path.join(root, 'ai-settings-version-mismatch.png'), (await win.webContents.capturePage()).toPNG());
    await run('window.coverReady=true;window.templateReady=true;window.setupMessage=null;window.setupReason=null'); await recheck();
    assert.equal(await run('document.querySelectorAll(".creator-settings-columns > .creator-settings-column").length'), 2);
    assert.equal(await run('document.querySelector(".creator-settings-columns").textContent.includes("配套插件与版本")'), false);
    for (const host of ['codex', 'workbuddy']) {
      await run(`document.getElementById('assistant').click()`);
      const label = host === 'codex' ? 'Codex（默认）' : 'WorkBuddy';
      await wait(`!![...document.querySelectorAll('.semi-select-option')].find(el=>el.textContent===${JSON.stringify(label)})`);
      await run(`[...document.querySelectorAll('.semi-select-option')].find(el=>el.textContent===${JSON.stringify(label)}).click()`);
      await wait(`window.host===${JSON.stringify(host)} && !document.getElementById('copy-assistant-plugin').disabled`);
      const before = await run('window.calls.length');
      await click('复制安装位置');
      await wait('document.querySelector(".creator-settings-assistant").textContent.includes("安装位置已复制。")');
      assert.deepEqual(await run(`window.calls.slice(${before}).map(c=>({method:c.method,input:c.input,host:c.host}))`), [{method: 'copyPluginMarketLocation', input: undefined, host}]);
      await run('window.failCopy=true'); await click('复制安装位置');
      await wait('document.querySelector(".creator-settings-assistant").textContent.includes("复制安装位置失败：未能复制")');
      await recheck();
      assert.match(await card(), /复制安装位置失败：未能复制/);
      await run('window.failCopy=false'); await click('复制安装位置');
      await wait('document.querySelector(".creator-settings-assistant").textContent.includes("安装位置已复制。")');
    }
    await click('怎么装'); await wait('!document.getElementById("assistant-install-guide").hidden');
    await click('打开 WorkBuddy');
    assert.deepEqual(await run('window.calls.at(-1).input'), {target: 'assistant'});
    await run('window.setBusy(true)'); await wait('document.getElementById("copy-assistant-plugin").disabled');
    await run('window.setBusy(false)'); await wait('!document.getElementById("copy-assistant-plugin").disabled');
    for (const [state, reason] of [['notavailable', '没有可用的配套插件市场'], ['mismatch', '不匹配']]) {
      await run(`window.market=${JSON.stringify(state)}`); await recheck();
      assert.equal(await run('document.getElementById("copy-assistant-plugin").disabled'), true);
      assert.match(await card(), new RegExp(reason));
      assert.match(await card(), /自媒体工作台 0.3.45/);
      const before = await run('window.calls.length'); await click('复制安装位置');
      assert.equal(await run(`window.calls.slice(${before}).some(c=>c.method==='copyPluginMarketLocation')`), false);
    }
    await run('window.failSetup=true'); await recheck();
    assert.match(await card(), /安装信息未能读取/);
    assert.equal(await run('document.getElementById("copy-assistant-plugin").disabled'), true);
    await run('window.failSetup=false;window.market="available";window.templateReady=false'); await recheck();
    assert.match(await card(), /封面制作：执行插件已准备好/);
    assert.match(await card(), /模板学习与还原：配套模板执行能力尚未准备好/);
    await run('window.templateReady=true;window.pauseSetup=true'); await click('重新检查');
    await wait('!!window.releaseSetup');
    assert.equal(await run('document.getElementById("copy-assistant-plugin").disabled'), true);
    await run('window.host="codex";window.setHost("codex")');
    await wait('!document.getElementById("copy-assistant-plugin").disabled');
    await run('window.releaseSetup()');
    await run('new Promise(resolve=>setTimeout(resolve,50))');
    assert.doesNotMatch(await card(), /尚未读取到当前 AI 助手/);
    await click('复制安装位置');
    await wait('document.querySelector(".creator-settings-assistant").textContent.includes("请到 Codex")');
    await click('怎么装');
    for (const [width, height] of [[1280, 860], [960, 680], [390, 844]]) {
      win.setContentSize(width, height);
      await run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      await run('document.querySelector(".creator-settings-assistant").scrollIntoView({behavior:"instant",block:"start"})');
      await run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      assert.equal(await run('document.querySelector("dialog").scrollWidth<=document.querySelector("dialog").clientWidth'), true, `no overflow at ${width}`);
      assert.equal(await run('(()=>{const r=document.getElementById("copy-assistant-plugin").getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;})()'), true);
      await fs.writeFile(path.join(root, `ai-settings-${width}.png`), (await win.webContents.capturePage()).toPNG());
    }
    win.focus(); win.webContents.focus();
    await run('document.getElementById("copy-assistant-plugin").focus()');
    win.webContents.sendInputEvent({type: 'keyDown', keyCode: 'Tab'}); win.webContents.sendInputEvent({type: 'keyUp', keyCode: 'Tab'});
    await wait('document.activeElement.textContent==="打开 Codex"');
    win.webContents.sendInputEvent({type: 'keyDown', keyCode: 'Tab'}); win.webContents.sendInputEvent({type: 'keyUp', keyCode: 'Tab'});
    await wait('document.activeElement.textContent==="怎么装"');
    win.webContents.sendInputEvent({type: 'keyDown', keyCode: 'Enter'}); win.webContents.sendInputEvent({type: 'char', keyCode: '\r'}); win.webContents.sendInputEvent({type: 'keyUp', keyCode: 'Enter'});
    await wait('!document.getElementById("assistant-install-guide").hidden');
    await click('更多安装说明与诊断'); await wait('!document.querySelector(".creator-settings-help").hidden');
    assert.match(await run('document.querySelector(".creator-settings-help").textContent'), /选择模型并手动发送/);
    await run('[...document.querySelectorAll("summary")].find(el=>el.textContent==="插件怎么安装").click()');
    await click('保存诊断文件'); await wait('document.body.textContent.includes("诊断已保存：fixture-diagnostics.json")');
    await fs.writeFile(path.join(root, 'ai-settings-help.png'), (await win.webContents.capturePage()).toPNG());
    win.webContents.sendInputEvent({type: 'keyDown', keyCode: 'Escape'}); win.webContents.sendInputEvent({type: 'keyUp', keyCode: 'Escape'});
    await wait('window.fixtureClosed===true');
    console.log('PASS: real React/Semi settings, Codex/WorkBuddy copy IPC, persistent failure/retry, missing/mismatched market, check failure/recovery, separate capability status, stale host response, busy/loading, install/help/diagnostics, keyboard focus, Esc close and three viewport screenshots.');
    app.exit(0);
  } catch (error) {
    await fs.writeFile(path.join(root, 'failed.png'), (await win.webContents.capturePage()).toPNG());
    console.error(error); app.exit(1);
  }
}
await fs.writeFile(path.join(root, 'probe-main.mjs'), `(${probeMain.toString()})(${JSON.stringify(root)});`);
const child = spawn(electron, [path.join(root, 'probe-main.mjs')], {stdio: 'inherit', env: {...process.env, ELECTRON_RUN_AS_NODE: ''}});
const timer = setTimeout(() => child.kill('SIGKILL'), 60000);
const code = await new Promise((resolve, reject) => {child.once('error', reject); child.once('exit', resolve);}).finally(() => clearTimeout(timer));
console.log('Settings screenshots and isolated fixture:', root);
assert.equal(code, 0, 'AI assistant settings UI probe');
