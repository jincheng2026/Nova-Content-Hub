// Prompt admin table in actual React/Semi/Electron; synthetic library and clipboard IPC only.
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
window.contentHub = {copyPrompt: async ({text}) => {if (window.failCopy) throw Error('clipboard unavailable'); window.copies.push(text); return {ok:true,value:{copied:true}};}, mutateWorkspace: async input => {window.writes.push(input);if(window.failFavorite)return {ok:false,error:{code:'CAS_CONFLICT',message:'synthetic conflict'}};return {ok:true,value:{library:window.applyFavorite(input)}};}};
const prompts = Array.from({length:12}, (_,i) => ({id:'prompt-'+i,editToken:'token-'+i,title:i===2?'一条刻意很长很长的提示词标题，用来确认完整名称依然可以访问':'提示词 '+i,body:i===1?'第一行\\n{{主题|输入主题}}\\n最后一行':'第一行\\n第二行 '+i,category:i===2?'特别长的提示词分类用来核对边界':'写作',when:'为一篇文章起标题时：这是一句刻意很长的使用说明，卡片只展示一行，打开后仍能阅读。',summary:'简短说明',tags:['可搜索标签'],enabled:i!==11,deletedAt:null}));
function Probe() {
 const [library,setLibrary] = useState({prompts,settings:{visiblePromptCategories:['写作']}}),[busy,setBusy]=useState(false);
 window.probe={library,setLibrary,setBusy};window.applyFavorite=input=>{const next={...library,prompts:library.prompts.map(prompt=>prompt.id===input.id?{...prompt,favorite:input.favorite}:prompt)};setLibrary(next);return next;};
 return <main><aside className="app-navigation">隔离验证</aside><div className="app-stage"><header className="app-header"><h1>自媒体工作台</h1></header><PromptsPage workspace={{contents:[],prompts:[]}} library={library} busy={busy} run={async action=>{try{return await action()}catch(error){window.lastError=error.message;}}} refresh={async()=>{}}/></div></main>;
}
createRoot(document.getElementById('root')).render(<Probe/>);
`);
await build({configFile:false,root,base:'./',resolve:{alias:{react:path.join(workbench,'node_modules/react'),'react-dom':path.join(workbench,'node_modules/react-dom')}},oxc:{jsx:{runtime:'automatic'}},build:{outDir:path.join(root,'dist'),modulePreload:false,target:'chrome148'}});
async function probeMain(probeRoot) {
 const {app,BrowserWindow}=await import('electron'),{default:assert}=await import('node:assert/strict'),{default:path}=await import('node:path'),{default:fs}=await import('node:fs/promises');
 app.setPath('userData',path.join(probeRoot,'machine'));await app.whenReady();
 const win=new BrowserWindow({show:false,width:1280,height:1000,webPreferences:{contextIsolation:true,nodeIntegration:false}});
 const run=source=>win.webContents.executeJavaScript(source).catch(error=>{console.error('Browser script:',source);throw error;});
 const wait=condition=>run(`new Promise((resolve,reject)=>{const end=Date.now()+6000;const check=()=>{if(${condition})return resolve(true);if(Date.now()>end)return reject(new Error('State timeout: '+${JSON.stringify(condition)}+' / '+document.body.innerText.slice(-1000)));setTimeout(check,15)};check()})`);
 const paint=()=>run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
 const click=text=>run(`[...document.querySelectorAll('button')].find(button=>button.textContent.trim()===${JSON.stringify(text)}).click()`);
 const choose=async(label,text)=>{await run(`[...document.querySelectorAll('.list-toolbar .semi-control')].find(el=>el.querySelector('.semi-control-label').textContent===${JSON.stringify(label)}).querySelector('.semi-select').click()`);await wait('[...document.querySelectorAll("[role=option]")].some(el=>el.textContent==='+JSON.stringify(text)+')');await run(`[...document.querySelectorAll('[role=option]')].find(el=>el.textContent===${JSON.stringify(text)}).click()`);await paint();};
 const copyButton='[data-prompt-id=prompt-0] button[aria-label^="复制提示词："]';
 try {
  await win.loadFile(path.join(probeRoot,'dist/index.html'));await wait('document.querySelectorAll("tr[data-prompt-id]").length===12');assert.equal(await run('!!document.querySelector(".prompt-library-table .semi-table")'),true,'real Semi Table');assert.equal(await run('document.querySelectorAll(".prompt-category-filter,.prompt-library-views").length'),0,'no custom management pills');
  for(const width of [1280,560]){win.setSize(width,1000);await wait(`innerWidth===${width}`);await paint();assert.equal(await run('document.documentElement.scrollWidth<=innerWidth'),true,'page fits '+width);assert.equal(await run('document.querySelectorAll(".prompt-library-table .semi-table-row-cell").length'),60,'five explicit columns');await fs.writeFile(path.join(probeRoot,'prompts-'+width+'.png'),(await win.webContents.capturePage()).toPNG());if(width===560){assert.equal(await run('(()=>{const scroll=document.querySelector(".data-table-scroll");return scroll.scrollWidth>scroll.clientWidth;})()'),true,'narrow table keeps readable columns and scrolls');await run('document.querySelector(".data-table-scroll").scrollLeft=10000');await paint();console.log('Prompt narrow action geometry',await run('(()=>{const a=document.querySelector(".data-table-scroll"),b=document.querySelector("tr[data-prompt-id] td:last-child");return {scroll:a.scrollLeft,client:a.clientWidth,width:a.scrollWidth,outer:a.getBoundingClientRect().toJSON(),cell:b.getBoundingClientRect().toJSON()};})()'));await fs.writeFile(path.join(probeRoot,'prompts-560-actions.png'),(await win.webContents.capturePage()).toPNG());assert.equal(await run('(()=>{const scroll=document.querySelector(".data-table-scroll").getBoundingClientRect(),cell=document.querySelector("tr[data-prompt-id] td:last-child").getBoundingClientRect();return cell.right<=scroll.right+1&&cell.left>=scroll.left-1;})()'),true,'operation column can be reached');}}
  win.setSize(1280,1000);await paint();await choose('提示词状态','可用');await wait('document.querySelectorAll("tr[data-prompt-id]").length===11');await choose('提示词状态','全部状态');
  await run('document.querySelector("[data-prompt-id=prompt-0] button[aria-label^=收藏提示词]").click()');await wait('document.querySelector("[data-prompt-id=prompt-0] button[aria-pressed=true]")');assert.equal(await run('window.writes.length'),1,'one favorite mutation');assert.equal(await run('!!document.querySelector("dialog")'),false,'favorite never opens prompt');assert.equal(await run('window.writes[0].editToken'),'token-0','CAS token accompanies favorite');
  await choose('提示词收藏','只看收藏');await wait('document.querySelectorAll("tr[data-prompt-id]").length===1');await run('window.failFavorite=true;document.querySelector("button[aria-label^=取消收藏提示词]").click()');await wait('document.querySelector(".prompt-library-notice")?.textContent.includes("编辑内容仍保留")');assert.equal(await run('document.querySelectorAll("tr[data-prompt-id]").length'),1,'failed favorite keeps saved row');await run('window.failFavorite=false;document.querySelector("button[aria-label^=取消收藏提示词]").click()');await wait('document.querySelectorAll("tr[data-prompt-id]").length===0');assert.ok(await run('document.querySelector("nav[aria-label=提示词分页]").textContent.includes("0 项")'),'favorite filter removes row and clamps page');await choose('提示词收藏','全部收藏状态');
  await run('document.querySelector('+JSON.stringify(copyButton)+').click()');await wait('window.copies.length===1');assert.equal(await run('window.copies[0]'),'第一行\n第二行 0','copy preserves multiline');assert.equal(await run('!!document.querySelector("dialog")'),false);await run('window.failCopy=true;document.querySelector('+JSON.stringify(copyButton)+').click()');await wait('document.querySelector(".prompt-library-notice").textContent.includes("复制失败")');await run('window.failCopy=false;document.querySelector("[data-prompt-id=prompt-1] button[aria-label^=填写并复制]").click()');await wait('document.querySelector(".prompt-dialog[open]")');await click('复制完整提示词');await wait('document.querySelector(".dialog-footer").textContent.includes("请先填写：主题")');assert.equal(await run('window.copies.length'),1);
  await run('(()=>{const input=document.querySelector("#prompt-field-0");Object.getOwnPropertyDescriptor(input.tagName==="TEXTAREA"?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,"value").set.call(input,"本次主题");input.dispatchEvent(new Event("input",{bubbles:true}));})()');await click('复制完整提示词');await wait('window.copies.length===2');assert.equal(await run('window.copies[1]'),'第一行\n本次主题\n最后一行');await click('关闭');await wait('document.querySelector(".prompt-discard")');await click('继续填写');assert.equal(await run('document.querySelector("#prompt-field-0").value'),'本次主题');await click('关闭');await click('放弃本次填写并关闭');await wait('!document.querySelector("dialog")');
  assert.equal(await run('document.querySelector("[data-prompt-id=prompt-11] .prompt-table-title").disabled'),true,'disabled prompt cannot open');await run('window.probe.setBusy(true)');await wait('[...document.querySelectorAll("tr[data-prompt-id] button")].every(button=>button.disabled)');assert.equal(await run('window.writes.length'),3,'browse/copy add no writes');
  console.log('PASS actual React/Semi/Electron prompt admin Table: four Semi filters, persistent CAS favorite/single write/error retention/filter removal, actual Semi buttons, 1280/560 scroll geometry/reachable actions, multiline copy/errors, variable validation, dirty draft retention and busy/disabled guards. Synthetic bridge only.');console.log('Screenshots:',path.join(probeRoot,'prompts-1280.png'),path.join(probeRoot,'prompts-560.png'));app.exit(0);
 }catch(error){console.error(error);app.exit(1);}
}
await fs.writeFile(path.join(root,'main.mjs'),`(${probeMain.toString()})(${JSON.stringify(root)});`);
const child = spawn(electron,[path.join(root,'main.mjs')],{stdio:'inherit',env:{...process.env,ELECTRON_RUN_AS_NODE:''}});
const code = await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('Prompt density probe timed out'));},45000);child.once('error',reject);child.once('exit',code=>{clearTimeout(timer);resolve(code??1);});});
assert.equal(code,0,'Prompt density probe failed');
console.log('Probe fixture:',root);
