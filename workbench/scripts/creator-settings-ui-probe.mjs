// Actual React/Semi settings with a fixture-backed bridge; no real library or OS settings are changed.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import electron from 'electron';
import {build} from 'vite';
import {fileURLToPath} from 'node:url';
const workbench=fileURLToPath(new URL('../', import.meta.url));
const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'nova-settings-check-')));
await fs.writeFile(path.join(root,'index.html'),'<html lang="zh-CN"><div id="root"></div><script type="module" src="/probe.jsx"></script></html>');
await fs.writeFile(path.join(root,'probe.jsx'),`
import {useState} from 'react'; import {createRoot} from 'react-dom/client';
import '${workbench}/node_modules/@douyinfe/semi-ui-19/react19-adapter';
import '${workbench}/node_modules/@douyinfe/semi-ui-19/lib/es/_base/base.css';
import '${workbench}/src/renderer/style.css';
import {AssistantSettings} from '${workbench}/src/renderer/assistant-settings.tsx';
import {PreferencesPanel} from '${workbench}/src/renderer/preferences-panel.tsx';
import {SetupPanel} from '${workbench}/src/renderer/setup-panel.tsx';
window.calls=[]; window.closeCount=0; window.channelOpens=0; window.currentAssistant="codex";
window.lib={settings:{editToken:'settings-1', profile:{name:'创作者',intro:'分享创作经验',avatarAssetHash:null,marks:[{key:'品牌色',value:'蓝色'}]},channels:[{id:'custom',name:'我的专属渠道',ink:'#345678',bg:'#eeeeee',deletedAt:null}]},photos:[],contentDetails:[],collections:[],templates:[],prompts:[]};
window.preferences={values:{reducedMotion:false,remindersEnabled:false,reminderTime:'08:30',startAtLogin:false},login:{supported:true,enabled:false,state:'off'}};
window.contentHub=new Proxy({}, {get:(_,method)=>async input=>{window.calls.push({method,input});let value;
if(method==='readAssistantSetup')value={host:window.currentAssistant,ready:true};
else if(method==='readTemplateAssistantSetup')value={host:window.currentAssistant,ready:true};
else if(method==='setAssistant'){window.currentAssistant=input.host;window.updateStatus({...window.fixtureStatus,assistant:input.host});value=null;}
else if(method==='readPreferences')value=window.preferences;
else if(method==='readReminderStatus')value={supported:true,state:'disabled',lastDay:null,reason:'none'};
else if(method==='readSetup')value={platform:'darwin',arch:'arm64',version:'0.3.9',mode:'disabled',assistant:{host:'codex',ready:true},market:{state:'available',name:'Nova'}};
else if(method==='mutateWorkspace'){window.lib.settings.profile=input.profile;window.lib.settings.editToken='settings-2';value={library:window.lib};}
else if(method==='savePreferences'){window.preferences.values=input;value=window.preferences;}
else if(method==='readWorkspaceLibrary')value=window.lib;
else if(method==='choosePhoto' || method==='retryBuiltins')value=null;
else throw new Error('Unexpected method: '+method);
return {ok:true,value:structuredClone(value)};}});
window.fixtureStatus={assistant:'codex',currentName:'隔离验收库'};
function Probe(){const [status,setStatus]=useState(window.fixtureStatus);window.updateStatus=setStatus;const [library,setLibrary]=useState(window.lib);const run=async action=>action();return <AssistantSettings status={status} busy={false} blocked={false} run={run} close={()=>window.closeCount++} library={library} assets={{photos:[],templates:[]}} refresh={async()=>setLibrary(structuredClone(window.lib))} managePhotos={()=>{}} manageLibrary={()=>{}} manageChannels={()=>window.channelOpens++} setup={<SetupPanel busy={false} run={run}/>} preferences={<PreferencesPanel busy={false} run={run}/>} recovery={<p>连接恢复入口</p>}/>;}
createRoot(document.getElementById('root')).render(<Probe/>);
`);
await build({configFile:false,root,base:'./',resolve:{alias:{react:path.join(workbench,'node_modules/react'),'react-dom':path.join(workbench,'node_modules/react-dom')}},oxc:{jsx:{runtime:'automatic'}},build:{outDir:path.join(root,'dist'),modulePreload:false,target:'chrome148'}});
async function probeMain(probeRoot){
const {app,BrowserWindow}=await import('electron');const {default:assert}=await import('node:assert/strict');const {default:path}=await import('node:path');const {default:fs}=await import('node:fs/promises');
app.setPath('userData',path.join(probeRoot,'machine'));await app.whenReady();const win=new BrowserWindow({show:true,width:1440,height:1100,webPreferences:{contextIsolation:true,nodeIntegration:false}});
win.webContents.on('console-message', event=>console.log('renderer:', event.message)); const run=source=>win.webContents.executeJavaScript(source).catch(error=>{console.log('Failed source:',source);throw error;});const wait=condition=>run(`new Promise((resolve,reject)=>{const end=Date.now()+6000;const check=()=>{if(${condition})return resolve(true);if(Date.now()>end)return reject(new Error('State timeout: '+${JSON.stringify(condition)}+' / '+document.body.innerText.slice(0,900)));setTimeout(check,15)};check()})`);
const click=text=>run(`[...document.querySelectorAll('button')].find(button=>button.textContent===${JSON.stringify(text)}).click()`);
try{
await win.loadFile(path.join(probeRoot,'dist/index.html'));await wait('document.querySelector("dialog[open]") && document.body.innerText.includes("配套插件已连接") && document.querySelector(".creator-preferences-form")');
assert.equal(await run('getComputedStyle(document.querySelector(".creator-settings-columns")).gridTemplateColumns.split(" ").length'),2);
assert.equal(await run('document.querySelector(".creator-settings-recovery").open'),false);
await run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))'); await fs.writeFile('/tmp/nova-creator-settings-probe.png',(await win.webContents.capturePage()).toPNG());
await run('document.getElementById("update-builtins").click()');await wait('window.calls.some(call=>call.method==="retryBuiltins")');
await run('window.updateStatus({...window.fixtureStatus, pending:{}})');await wait('document.getElementById("update-builtins").disabled');
await run('window.updateStatus({...window.fixtureStatus, started:true, task:{status:"running"}})');await wait('document.getElementById("update-builtins").disabled');
await run('window.updateStatus({...window.fixtureStatus, needsReselect:true})');await wait('document.getElementById("update-builtins").disabled');
await run('window.updateStatus({...window.fixtureStatus, seedPending:true})');await wait('!document.getElementById("update-builtins").disabled && document.getElementById("update-builtins").textContent==="继续更新"');
await run('window.updateStatus(window.fixtureStatus)');await wait('document.getElementById("update-builtins").textContent==="更新内置资源"');

await run('document.getElementById("assistant").click()');await wait('document.querySelectorAll(".semi-select-option").length===2');assert.deepEqual(await run('[...document.querySelectorAll(".semi-select-option")].map(option=>option.textContent)'),['Codex（默认）','WorkBuddy']);await run('[...document.querySelectorAll(".semi-select-option")].find(option=>option.textContent==="WorkBuddy").click()');await wait('window.calls.some(call=>call.method==="setAssistant"&&call.input.host==="workbuddy")');await run('document.getElementById("assistant").click()');await wait('document.querySelectorAll(".semi-select-option").length===2');await run('[...document.querySelectorAll(".semi-select-option")].find(option=>option.textContent==="Codex（默认）").click()');await wait('window.calls.some(call=>call.method==="setAssistant"&&call.input.host==="codex")');assert.match(await run('document.querySelector(".creator-channel-preview").textContent'),/我的专属渠道/);await click('管理渠道');assert.equal(await run('window.channelOpens'),1);await fs.writeFile(path.join(probeRoot,'settings-current.png'),(await win.webContents.capturePage()).toPNG());
await click('编辑');await wait('document.querySelectorAll(".creator-settings-profile input").length >= 3');
await run('document.querySelectorAll(".creator-settings-profile input")[1].focus()');win.webContents.insertText('知识分享');await wait('document.querySelectorAll(".creator-settings-profile input")[1].value === "知识分享"');
const beforeUpdate = await run('window.calls.filter(call=>call.method==="retryBuiltins").length');await run('document.getElementById("update-builtins").click()');assert.equal(await run('window.calls.filter(call=>call.method==="retryBuiltins").length'),beforeUpdate);
await run('document.getElementById("close-settings").click()');await wait('document.querySelector(".creator-settings-notice")');assert.equal(await run('window.closeCount'),0);
await click('保存个人信息');await wait('window.calls.some(call=>call.method === "mutateWorkspace")');
assert.deepEqual(await run('window.lib.settings.profile.marks'),[{key:'品牌色',value:'蓝色'},{key:'自媒体方向',value:'知识分享'}]);assert.equal(await run('window.lib.settings.profile.avatarAssetHash'),null);
await click('＋ 添加照片');await wait('window.calls.some(call=>call.method === "choosePhoto")');assert.equal(await run('window.calls.find(call=>call.method === "choosePhoto").input.isOwnPhoto'),false);
await run('document.querySelector(".creator-preference-row .semi-switch").click()');await wait('!Array.from(document.querySelectorAll("button")).find(button=>button.textContent==="保存偏好").disabled');await click('保存偏好');await wait('window.calls.some(call=>call.method === "savePreferences")');assert.equal(await run('window.preferences.values.remindersEnabled'),true);
console.log('PASS: settings two-column layout, collapsed recovery, dirty-close guard, profile mark preservation, unclaimed photo import, preference save, both explicit assistants and one shared channel-manager entry');app.exit(0);
}catch(error){console.error(error);app.exit(1);}}
await fs.writeFile(path.join(root,'probe-main.mjs'),`(${probeMain.toString()})(${JSON.stringify(root)});`);
const child=spawn(electron,[path.join(root,'probe-main.mjs')],{stdio:'inherit',env:{...process.env,ELECTRON_RUN_AS_NODE:''}});const code=await new Promise(resolve=>child.on('exit',resolve));console.log('Probe fixture:',root);process.exitCode=code??1;
