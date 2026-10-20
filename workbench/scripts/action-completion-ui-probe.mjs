// Real App/React/Semi with a delayed fixture bridge; no native library or business data is opened.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import electron from 'electron';
import {build} from 'vite';
import {fileURLToPath} from 'node:url';
const workbench = fileURLToPath(new URL('../', import.meta.url));
const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'nova-action-completion-')));
await fs.writeFile(path.join(root, 'index.html'), '<html lang="zh-CN"><div id="root"></div><script type="module" src="/probe.js"></script></html>');
await fs.writeFile(path.join(root, 'probe.js'), `
const ok = value => ({ok:true,value:structuredClone(value)});
window.calls=[]; window.pauseRefresh=false;
window.lib={contentDetails:[],collections:[],photos:[],templates:[],prompts:[],settings:{editToken:'s1',profile:{name:'',intro:'',avatarAssetHash:null,marks:[]},defaults:{},channels:[{id:'channel',name:'隔离渠道',ink:'#335577',bg:'#eef5fa',requiredRatio:null,deletedAt:null}],promptCategories:[],visiblePromptCategories:[],customRatios:[],defaultIssues:[]}};
window.currentStatus={currentName:'隔离库',assistant:'codex',busy:false,pending:null,started:false,maintenance:{pending:null,health:null},task:null};
window.contentHub=new Proxy({}, {get:(_,method)=>method==='onWorkspaceChanged'?()=>()=>{}:async input=>{
 window.calls.push({method,input}); let value;
 if(method==='status')value=window.currentStatus;
 else if(method==='readWorkspace'){if(window.pauseRefresh)await new Promise((resolve,reject)=>{window.finishRefresh=()=>{window.pauseRefresh=false;resolve();};window.failRefresh=()=>{window.pauseRefresh=false;reject(Object.assign(new Error('fixture read timeout'),{code:'READ_TIMEOUT'}));};});value={contents:[],prompts:[],channels:window.lib.settings.channels.map(c=>({id:c.id,name:c.name,enabled:!c.deletedAt}))};}
 else if(method==='listContents')value=[];
 else if(method==='readWorkspaceLibrary')value=window.lib;
 else if(method==='listCoverAssets')value={photos:[],templates:[]};
 else if(method==='mutateWorkspace'){if(input.editToken!==window.lib.settings.editToken)throw Error('CAS mismatch');window.lib.settings.editToken='s'+(Number(input.editToken.slice(1))+1);window.lib.settings.channels[0].deletedAt=input.op==='trashChannel'?'2026-10-20':null;value={library:window.lib};}
 else if(method==='readPreferences')value={values:{reducedMotion:false,remindersEnabled:false,reminderTime:'08:30',startAtLogin:false},login:{supported:false,enabled:false,state:'off'}};
 else if(method==='readAssistantSetup'||method==='readTemplateAssistantSetup')value={host:window.currentStatus.assistant,ready:false,reason:'protocol-missing'};
 else if(method==='setAssistant'){window.currentStatus.assistant=input.host;value=null;}
 else if(method==='readReminderStatus')value={supported:false,state:'unsupported',reason:'none',lastDay:null};
 else if(method==='readSetup')value={platform:'darwin',arch:'arm64',version:'fixture',mode:'disabled',assistant:{ready:false},market:{state:'missing'}};
 else if(method==='readBootstrapRecovery')value={state:'ready',reason:'none'};
 else throw Error('Unexpected fixture IPC '+method);
 return ok(value);
}});
await import('${workbench}/src/renderer/app.tsx');
`);
await build({configFile:false,root,base:'./',resolve:{alias:{react:path.join(workbench,'node_modules/react'),'react-dom':path.join(workbench,'node_modules/react-dom')}},oxc:{jsx:{runtime:'automatic'}},build:{outDir:path.join(root,'dist'),modulePreload:false,target:'chrome148'}});
async function probeMain(probeRoot) {
 const {app,BrowserWindow}=await import('electron');const {default:assert}=await import('node:assert/strict');const {default:path}=await import('node:path');const {default:fs}=await import('node:fs/promises');const evidence=process.env.NOVA_ACTION_PROBE_EVIDENCE;if(evidence)await fs.mkdir(evidence,{recursive:true});
 app.setPath('userData',path.join(probeRoot,'machine'));await app.whenReady();const win=new BrowserWindow({show:true,width:1440,height:1000,webPreferences:{contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
 const run=source=>win.webContents.executeJavaScript(source);const wait=condition=>run(`new Promise((resolve,reject)=>{const end=Date.now()+5000;const check=()=>{if(${condition})return resolve(true);if(Date.now()>end)return reject(Error('State timeout: '+${JSON.stringify(condition)}+' / '+document.body.innerText.slice(0,600)));setTimeout(check,15)};check()})`);
 const click=(selector,text)=>run(`[...document.querySelectorAll(${JSON.stringify(selector)})].find(b=>b.textContent.trim()===${JSON.stringify(text)}).click()`);
 try {
  await win.loadFile(path.join(probeRoot,'dist/index.html'));await wait('document.querySelector(".creator-overview-layout")');
  await run('document.getElementById("library-menu").click()');await wait('document.querySelector(".library-manager-dialog[open]")');await click('.management-tabs button','渠道');
  await wait('[...document.querySelectorAll("button")].some(b=>b.textContent==="停用渠道"&&!b.disabled)');await run('window.pauseRefresh=true');await click('.management-actions button','停用渠道');
  await wait('window.finishRefresh && document.querySelector("main[data-busy=false]") && [...document.querySelectorAll("button")].some(b=>b.textContent==="恢复渠道"&&!b.disabled)');
  if(evidence){await run('new Promise(resolve=>setTimeout(resolve,250))');await fs.writeFile(path.join(evidence,'channel-committed-refresh-paused.png'),(await win.webContents.capturePage()).toPNG());}
  assert.equal(await run('window.calls.filter(c=>c.method==="mutateWorkspace").length'),1);
  assert.equal(await run('document.getElementById("nav-content").disabled'),false,'full-library refresh must not disable navigation');
  await click('.library-manager-dialog > .dialog-heading button','关闭');await run('document.getElementById("nav-prompts").click()');await wait('document.getElementById("nav-prompts").getAttribute("aria-current")==="page"');
  await run('document.getElementById("open-settings").click()');await wait('document.querySelector(".creator-settings-dialog[open]")');await run('document.getElementById("assistant").click()');
  await wait('document.querySelectorAll(".semi-select-option").length===2');
  if(evidence){await run('new Promise(resolve=>setTimeout(resolve,250))');await fs.writeFile(path.join(evidence,'assistant-popup-refresh-paused.png'),(await win.webContents.capturePage()).toPNG());}
  await run('document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));window.failRefresh()');await wait('document.getElementById("error").textContent.includes("READ_TIMEOUT")');
  await run('document.getElementById("close-settings").click()');await run('document.getElementById("library-menu").click()');await wait('document.querySelector(".library-manager-dialog[open]")');await click('.management-tabs button','渠道');await click('.management-actions button','恢复渠道');
  await wait('window.calls.filter(c=>c.method==="mutateWorkspace").length===2 && document.querySelector("main[data-busy=false]")');
  assert.equal(await run('window.calls.filter(c=>c.method==="mutateWorkspace")[1].input.editToken'),'s2','retry uses the acknowledged CAS token');
  console.log('PASS real App/React/Semi/Electron: channel commit stays acknowledged during hung refresh, navigation and assistant popup work, read failure is visible, next mutation uses current CAS token exactly once. Synthetic bridge only.');app.exit(0);
 } catch(error) {console.error(error);app.exit(1);}
}
await fs.writeFile(path.join(root,'main.mjs'),`(${probeMain.toString()})(${JSON.stringify(root)});`);
const child=spawn(electron,[path.join(root,'main.mjs')],{stdio:'inherit',env:{...process.env,ELECTRON_RUN_AS_NODE:''}});
const timeout=setTimeout(()=>child.kill('SIGKILL'),25_000);
process.exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});clearTimeout(timeout);
console.log('Probe fixture:',root);
