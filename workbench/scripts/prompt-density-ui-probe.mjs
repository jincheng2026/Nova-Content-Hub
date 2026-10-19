// Compact prompt cards in actual React/Semi/Electron; synthetic library and clipboard IPC only.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import electron from 'electron';
import {build} from 'vite';
const workbench = fileURLToPath(new URL('../', import.meta.url));
const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'nova-prompt-density-')));
await fs.writeFile(path.join(root, 'index.html'), '<html lang="zh-CN"><meta charset="utf-8"><div id="root"></div><script type="module" src="/probe.jsx"></script></html>');
await fs.writeFile(path.join(root, 'probe.jsx'), `
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import ${JSON.stringify(path.join(workbench, 'node_modules/@douyinfe/semi-ui-19/react19-adapter'))};
import ${JSON.stringify(path.join(workbench, 'node_modules/@douyinfe/semi-ui-19/lib/es/_base/base.css'))};
import ${JSON.stringify(path.join(workbench, 'src/renderer/style.css'))};
import {PromptsPage} from ${JSON.stringify(path.join(workbench, 'src/renderer/workspace-pages.tsx'))};
window.copies = []; window.writes = [];
window.contentHub = {copyPrompt: async ({text}) => {if (window.failCopy) throw Error('clipboard unavailable'); window.copies.push(text); return {ok:true,value:{copied:true}};}, mutateWorkspace: async input => {window.writes.push(input); throw Error('unexpected write');}};
const prompts = Array.from({length:12}, (_,i) => ({id:'prompt-'+i,editToken:'token-'+i,title:i===2?'一条刻意很长很长的提示词标题，用来确认完整名称依然可以访问':'提示词 '+i,body:i===1?'第一行\\n{{主题|输入主题}}\\n最后一行':'第一行\\n第二行 '+i,category:i===2?'特别长的提示词分类用来核对边界':'写作',when:'为一篇文章起标题时：这是一句刻意很长的使用说明，卡片只展示一行，打开后仍能阅读。',summary:'简短说明',tags:['可搜索标签'],enabled:i!==11,deletedAt:null}));
function Probe() {
 const [library,setLibrary] = useState({prompts,settings:{visiblePromptCategories:['写作']}}),[busy,setBusy]=useState(false);
 window.probe={library,setLibrary,setBusy};
 return <main><aside className="app-navigation">隔离验证</aside><div className="app-stage"><header className="app-header"><h1>自媒体工作台</h1></header><PromptsPage workspace={{contents:[],prompts:[]}} library={library} busy={busy} run={action=>action()} refresh={async()=>{}}/></div></main>;
}
createRoot(document.getElementById('root')).render(<Probe/>);
`);
await build({configFile:false,root,base:'./',resolve:{alias:{react:path.join(workbench,'node_modules/react'),'react-dom':path.join(workbench,'node_modules/react-dom')}},oxc:{jsx:{runtime:'automatic'}},build:{outDir:path.join(root,'dist'),modulePreload:false,target:'chrome148'}});
async function probeMain(probeRoot) {
 const {app,BrowserWindow} = await import('electron');
 const {default:assert} = await import('node:assert/strict');
 const {default:path} = await import('node:path');
 const {default:fs} = await import('node:fs/promises');
 app.setPath('userData',path.join(probeRoot,'machine'));await app.whenReady();
 const win = new BrowserWindow({show:false,width:1280,height:1000,webPreferences:{contextIsolation:true,nodeIntegration:false}});
 const run = source => win.webContents.executeJavaScript(source);
 const wait = condition => run(`new Promise((resolve,reject)=>{const end=Date.now()+5000;const check=()=>{if(${condition})return resolve(true);if(Date.now()>end)return reject(new Error('State timeout: '+${JSON.stringify(condition)}+' / '+document.body.innerText.slice(-1500)+' / copies '+window.copies.length));setTimeout(check,10)};check()})`);
 const paint = () => run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
 const click = text => run(`[...document.querySelectorAll('button')].find(button=>button.textContent.trim()===${JSON.stringify(text)}).click()`);
 try {
  await win.loadFile(path.join(probeRoot,'dist/index.html'));await wait('document.querySelectorAll(".prompt-library-card").length===11');
  for (const [width,columns] of [[1280,4],[1600,4],[1100,3],[880,2],[600,1]]) {
   win.setSize(width,1000);await paint();
   assert.equal(await run('getComputedStyle(document.querySelector(".prompt-library-grid")).gridTemplateColumns.split(" ").length'),columns,width+' columns');
   assert.equal(await run('document.documentElement.scrollWidth<=innerWidth'),true,width+' has no page overflow');
   assert.equal(await run('[...document.querySelectorAll(".prompt-library-card")].every(card=>card.getBoundingClientRect().height<=180)'),true,'cards remain compact');
   assert.equal(await run('[...document.querySelectorAll(".prompt-library-use>p")].every(p=>getComputedStyle(p).whiteSpace==="nowrap"&&p.getBoundingClientRect().height<25)'),true,'usage is one line');
   assert.equal(await run('[...document.querySelectorAll(".prompt-card-metadata")].every(el=>el.scrollWidth<=el.clientWidth)'),true,'metadata fits card');
   if(width===1280)await fs.writeFile(path.join(probeRoot,'prompts-1280.png'),(await win.webContents.capturePage()).toPNG());
  }
  win.setSize(1280,1000);win.show();win.focus();win.webContents.focus();await wait('document.hasFocus()');await paint();
  assert.equal(await run('document.querySelectorAll(".prompt-card-copy").length'),11,'copy controls are explicit');
  assert.equal(await run(`(()=>{const wrapper=document.querySelector('.prompt-library-search'),input=wrapper.querySelector('input'),a=wrapper.getBoundingClientRect(),b=input.getBoundingClientRect();return Math.abs((a.top+a.height/2)-(b.top+b.height/2))<1&&getComputedStyle(input).textAlign==='left';})()`),true,'search text is centered vertically and left aligned');
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'Tab'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Tab'});await paint();
  await run('document.querySelector(".prompt-card-copy").focus()');
  assert.equal(await run('document.activeElement.className'),'prompt-card-copy','copy is keyboard focusable');
  assert.equal(await run('getComputedStyle(document.activeElement).outlineStyle'),'solid','keyboard focus remains visible');
  await run('document.querySelector(".prompt-card-copy").click()');await wait('window.copies.length===1');
  assert.deepEqual(await run('window.copies'),['第一行\n第二行 0'],'direct copy preserves multiline body');
  assert.equal(await run('!!document.querySelector("dialog")'),false,'variable-free card copies without dialog');
  await run('window.failCopy=true;document.querySelector(".prompt-card-copy").click()');
  await wait('document.querySelector(".prompt-library-notice").textContent.includes("复制失败")');
  assert.equal(await run('window.copies.length'),1,'clipboard failure is surfaced');
  await wait('!document.querySelectorAll(".prompt-card-copy")[1].disabled');
  await run('window.failCopy=false;document.querySelectorAll(".prompt-card-copy")[1].click()');await wait('document.querySelector(".prompt-dialog[open]")');
  await click('复制完整提示词');await wait('document.querySelector(".dialog-footer").textContent.includes("请先填写：主题")');
  assert.equal(await run('window.copies.length'),1,'fields are required before copy');
  await run('document.querySelector("#prompt-field-0").focus()');win.webContents.insertText('本次主题');
  await wait('document.querySelector(".prompt-preview textarea").value.includes("本次主题")');
  await click('复制完整提示词');await wait('window.copies.length===2');
  assert.equal(await run('window.copies[1]'),'第一行\n本次主题\n最后一行');
  await click('关闭');await wait('document.querySelector(".prompt-discard")');await click('继续填写');
  assert.equal(await run('document.querySelector("#prompt-field-0").value'),'本次主题','dirty-close cancellation retains draft');
  await click('关闭');await click('放弃本次填写并关闭');await wait('!document.querySelector("dialog")');
  await run('document.querySelector(".prompt-library-use").focus()');assert.equal(await run('document.activeElement.getAttribute("aria-label")'),'打开提示词：提示词 0');
  win.focus();win.webContents.focus();await paint();win.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter'});win.webContents.sendInputEvent({type:'char',keyCode:'\r'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter'});await wait('document.querySelector(".prompt-dialog[open]")');
  await click('关闭');await click('全部提示词');await wait('document.querySelectorAll(".prompt-library-card").length===12');
  assert.equal(await run('document.querySelector(".prompt-library-card.is-disabled .prompt-library-use").disabled'),true);
  assert.equal(await run('!!document.querySelector(".prompt-library-card.is-disabled .prompt-card-copy")'),false,'disabled prompt has no copy shortcut');
  assert.equal(await run('document.querySelector(".prompt-library-card.is-disabled .prompt-use-footer").textContent'),'在菜单中启用后使用');
  await run('probe.setBusy(true)');await wait('[...document.querySelectorAll(".prompt-library-use,.prompt-card-copy")].every(button=>button.disabled)');
  assert.deepEqual(await run('window.writes'),[],'browsing/copying makes no library mutations');
  console.log('PASS actual React/Semi/Electron: desktop 4 columns, responsive 3/2/1, <=180px cards, one-line usage, metadata fit/no overflow, explicit keyboard open/copy, multiline clipboard success/failure, required variables and dirty-close retention, disabled/busy guards. Synthetic library/clipboard IPC only.');
  console.log('Screenshot:',path.join(probeRoot,'prompts-1280.png'));app.exit(0);
 } catch(error) {console.error(error);app.exit(1);}
}
await fs.writeFile(path.join(root,'main.mjs'),`(${probeMain.toString()})(${JSON.stringify(root)});`);
const child = spawn(electron,[path.join(root,'main.mjs')],{stdio:'inherit',env:{...process.env,ELECTRON_RUN_AS_NODE:''}});
const code = await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('Prompt density probe timed out'));},45000);child.once('error',reject);child.once('exit',code=>{clearTimeout(timer);resolve(code??1);});});
assert.equal(code,0,'Prompt density probe failed');
console.log('Probe fixture:',root);
