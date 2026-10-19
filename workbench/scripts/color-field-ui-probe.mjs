// Isolated real React/Semi channel editor; the fixture bridge never opens a content library.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import electron from 'electron';
import {build} from 'vite';

const workbench = fileURLToPath(new URL('../', import.meta.url));
const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'nova-color-field-')));
await fs.writeFile(path.join(root, 'index.html'), '<html lang="zh-CN"><div id="root"></div><script type="module" src="/probe.jsx"></script></html>');
await fs.writeFile(path.join(root, 'probe.jsx'), `
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import '${workbench}/node_modules/@douyinfe/semi-ui-19/react19-adapter';
import '${workbench}/node_modules/@douyinfe/semi-ui-19/lib/es/_base/base.css';
import '${workbench}/src/renderer/style.css';
import {LibraryPanels} from '${workbench}/src/renderer/library-panels.tsx';
window.calls=[];window.errors=[];window.refreshes=0;
window.addEventListener('error',event=>window.errors.push(event.message));
window.library={photos:[],templates:[],collections:[],contentDetails:[],settings:{editToken:'settings-v1',defaults:{photoId:null},channels:[{id:'channel-1',name:'颜色测试渠道',requiredRatio:null,ink:'#555555',bg:'#f0f0f0',deletedAt:null}]}};
window.contentHub={mutateWorkspace:input=>new Promise(resolve=>{window.calls.push(structuredClone(input));window.settle=ok=>{window.settle=null;resolve(ok?{ok:true,value:{library:window.library}}:{ok:false,error:{code:'CONFLICT',message:'隔离回执拒绝'}})}})};
function Probe(){const [busy,setBusy]=useState(false);window.setBusy=setBusy;const run=async action=>{setBusy(true);try{return await action()}catch(error){window.errors.push(error.message)}finally{setBusy(false)}};return <LibraryPanels library={window.library} assets={{photos:[],templates:[]}} initialTab="channels" busy={busy} run={run} refresh={async()=>{window.refreshes++}}/>}
createRoot(document.getElementById('root')).render(<Probe/>);
`);
await build({configFile:false, root, base:'./', resolve:{alias:{react:path.join(workbench,'node_modules/react'),'react-dom':path.join(workbench,'node_modules/react-dom')}}, oxc:{jsx:{runtime:'automatic'}}, build:{outDir:path.join(root,'dist'),modulePreload:false,target:'chrome148'}});

async function probeMain(probeRoot) {
  const {app,BrowserWindow} = await import('electron');
  const {default:assert} = await import('node:assert/strict');
  const {default:path} = await import('node:path');
  const fs = await import('node:fs/promises');
  app.setPath('userData',path.join(probeRoot,'machine'));
  await app.whenReady();
  const win = new BrowserWindow({show:true,width:1440,height:1100,webPreferences:{contextIsolation:true,nodeIntegration:false}});
  const run = source => win.webContents.executeJavaScript(source);
  const flush = () => run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  const wait = condition => run(`new Promise((resolve,reject)=>{const end=Date.now()+5000;const check=()=>{if(${condition})return resolve(true);if(Date.now()>end)return reject(new Error('Timeout: '+${JSON.stringify(condition)}));setTimeout(check,20)};check()})`);
  const ink = 'input[aria-label="文字颜色十六进制值"]';
  const bg = 'input[aria-label="标签底色十六进制值"]';
  const value = selector => run(`document.querySelector(${JSON.stringify(selector)}).value`);
  const point = (selector,x=.5,y=.5) => run(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();return {x:Math.round(r.x+r.width*${x}),y:Math.round(r.y+r.height*${y})}})()`);
  const mouse = async (selector,x=.5,y=.5) => {
    const at = await point(selector,x,y);
    assert.equal(await run(`!!document.elementFromPoint(${at.x},${at.y})?.closest('dialog[open]')`),true,'native hit target belongs to the modal');
    win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...at});
    win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...at});
    await flush();
  };
  const type = async (selector,text) => {
    await run(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.focus();el.select()})()`);
    win.webContents.insertText(text); await flush();
  };
  const preview = () => run(`(()=>{const s=getComputedStyle(document.querySelector('.channel-live-preview'));return {ink:s.color,bg:s.backgroundColor}})()`);
  try {
    await win.loadFile(path.join(probeRoot,'dist/index.html'));
    await wait(`!![...document.querySelectorAll('button')].find(el=>el.textContent==='编辑')`);
    await run(`[...document.querySelectorAll('button')].find(el=>el.textContent==='编辑').click()`);
    await wait('!!document.querySelector("dialog[open] .color-field")');
    assert.equal(await run('document.querySelectorAll("input[type=color]").length'),0,'no native system color input exists');
    assert.equal(await run('document.querySelectorAll("dialog .color-field").length'),2);
    await mouse('button[aria-label="文字颜色 #416dac"]');
    assert.equal(await value(ink),'#416dac');
    assert.equal((await preview()).ink,'rgb(65, 109, 172)');
    assert.equal(await run(`document.querySelector(${JSON.stringify('button[aria-label="文字颜色 #416dac"]')}).getAttribute('aria-pressed')`),'true');
    await mouse('button[aria-label="标签底色 #fce9ef"]');
    assert.equal(await value(bg),'#fce9ef');
    assert.equal((await preview()).bg,'rgb(252, 233, 239)');
    console.log('PASS: native clicks on both common palettes update parent hex values, pressed state and live channel preview');

    await mouse('.color-field details summary');
    await wait('!!document.querySelector("dialog .color-field details[open] .semi-colorPicker")');
    const freeHex = '.color-field details[open] .semi-colorPicker-colorPickerInput input';
    await type(freeHex,'#123abc');
    await wait(`document.querySelector(${JSON.stringify(ink)}).value.toLowerCase()==='#123abc'`);
    assert.equal((await preview()).ink,'rgb(18, 58, 188)');
    const area = '.color-field details[open] .semi-colorPicker-colorChooseArea';
    const beforePick = await value(ink);
    await mouse(area,.65,.3);
    assert.notEqual(await value(ink),beforePick,'real Semi saturation/brightness click updates parent');
    assert.match(await value(ink),/^#[0-9a-f]{6}$/i);
    assert.equal(await run('!!document.querySelector("dialog[open]")'),true);
    assert.equal(BrowserWindow.getAllWindows().length,1);
    assert.equal(await run('document.querySelectorAll("input[type=color]").length'),0);
    console.log('PASS: inline real Semi ColorPicker hex editing and pointer selection work inside native dialog without a system color input or extra browser window');

    await type(ink,'#zzzzzz');
    assert.equal(await run('document.querySelector("dialog form").checkValidity()'),false);
    assert.equal(await run(`document.querySelector(${JSON.stringify(ink)}).validity.patternMismatch`),true);
    assert.match(await run('document.querySelector(".color-field [role=alert]").textContent'),/#.*六位/);
    await run('document.querySelector("dialog form").requestSubmit()'); await flush();
    assert.equal(await run('window.calls.length'),0,'invalid hex cannot reach the mutation bridge');
    assert.equal(await value(ink),'#zzzzzz','invalid draft remains available to repair');
    await type(ink,'#123abc');
    assert.equal(await run('document.querySelector("dialog form").checkValidity()'),true);
    console.log('PASS: invalid hex blocks native form submit and bridge mutation, preserves draft, then accepts a valid repair');

    const dragStart = await point(area,.25,.25);
    win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...dragStart}); await flush();
    await run('window.setBusy(true)'); await flush();
    const locked = {ink:await value(ink),bg:await value(bg),preview:await preview()};
    const dragEnd = await point(area,.8,.8);
    win.webContents.sendInputEvent({type:'mouseMove',...dragEnd});
    win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...dragEnd}); await flush();
    await type(ink,'#ffffff'); await type(freeHex,'#ffffff');
    await mouse('button[aria-label="文字颜色 #d6336c"]'); await mouse(area,.9,.9);
    assert.deepEqual({ink:await value(ink),bg:await value(bg),preview:await preview()},locked,'busy ignores an ongoing drag, native typing, common palette clicks and picker clicks');
    assert.equal(await run('[...document.querySelectorAll("dialog form input")].every(el=>el.matches(":disabled"))'),true,'inherited fieldsets disable actual Semi inputs');
    assert.equal(await run('[...document.querySelectorAll(".color-field-presets button")].every(el=>el.matches(":disabled"))'),true);
    await run('window.setBusy(false)'); await flush();
    await type(ink,'#123abc'); await type(bg,'#fce9ef');
    await run('document.querySelector("dialog form").requestSubmit()');
    await wait('typeof window.settle === "function"'); await flush();
    assert.deepEqual(await run('window.calls[0]'),{op:'updateChannel',channelId:'channel-1',name:'颜色测试渠道',requiredRatio:null,ink:'#123abc',bg:'#fce9ef',editToken:'settings-v1'});
    const pending = {ink:await value(ink),bg:await value(bg),preview:await preview()};
    await mouse('button[aria-label="文字颜色 #0f7b3b"]'); await mouse(area,.2,.8); await type(ink,'#ffffff');
    assert.deepEqual({ink:await value(ink),bg:await value(bg),preview:await preview()},pending,'pending bridge receipt locks color editing');
    assert.equal(await run('window.calls.length'),1);
    await run('window.settle(false)');
    await wait('document.querySelector("dialog [role=status]").textContent.includes("编辑内容仍保留")');
    assert.equal(await value(ink),'#123abc'); assert.equal(await value(bg),'#fce9ef');
    await mouse('button[aria-label="文字颜色 #7048c6"]');
    assert.equal(await value(ink),'#7048c6','rejected save unlocks editing and retains the draft');
    assert.equal(await run('window.refreshes'),0);
    assert.deepEqual(await run('window.errors'),['隔离回执拒绝']);
    await fs.writeFile(path.join(probeRoot,'color-fields.png'),(await win.webContents.capturePage()).toPNG());
    console.log('PASS: busy and delayed save block native hex input, palette and picker drag/click; exact updateChannel payload and rejected-save recovery verified');
    console.log('PASS: isolated real ChannelEditor/ColorField, no content library access or host calls');
    app.exit(0);
  } catch(error) {
    await fs.writeFile(path.join(probeRoot,'failure.png'),(await win.webContents.capturePage()).toPNG());
    console.error(error); console.error(await run('JSON.stringify({calls:window.calls,errors:window.errors})'));
    console.error(await run('document.body.innerHTML.slice(-3500)')); app.exit(1);
  }
}
await fs.writeFile(path.join(root,'probe-main.mjs'),`(${probeMain.toString()})(${JSON.stringify(root)});`);
const child = spawn(electron,[path.join(root,'probe-main.mjs')],{stdio:'inherit',env:{...process.env,ELECTRON_RUN_AS_NODE:''}});
const timeout = setTimeout(()=>child.kill('SIGTERM'),45000);
const code = await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve)});
clearTimeout(timeout);
console.log('Probe fixture:',root);
process.exitCode = code ?? 1;
