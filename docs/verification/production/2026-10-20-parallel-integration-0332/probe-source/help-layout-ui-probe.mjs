// Actual React/Semi settings with a fixture-backed bridge; no real library or OS settings are changed.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';

import {fileURLToPath} from 'node:url';
const repo=fileURLToPath(new URL('../../../../../',import.meta.url));
const workbench=path.join(repo,'workbench');
const {default:electron}=await import(path.join(workbench,'node_modules/electron/index.js'));
const {build}=await import(path.join(workbench,'node_modules/vite/dist/node/index.js'));
const version=JSON.parse(await fs.readFile(path.join(workbench,'package.json'),'utf8')).version;
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
import {BootstrapRecoveryPanel} from '${workbench}/src/renderer/bootstrap-panel.tsx';
window.calls=[]; window.closeCount=0; window.channelOpens=0; window.currentAssistant="codex";
window.lib={settings:{editToken:'settings-1', profile:{name:'创作者',intro:'分享创作经验',avatarAssetHash:null,marks:[{key:'品牌色',value:'蓝色'}]},channels:[{id:'custom',name:'我的专属渠道',ink:'#345678',bg:'#eeeeee',deletedAt:null}]},photos:[],contentDetails:[],collections:[],templates:[],prompts:[]};
window.bootstrapView={state:"ready",reasonCode:"none",canReset:false,confirmationToken:null,backupName:null};
window.reminderResult={supported:true,state:'sent',lastDay:null,reason:'none'};
window.preferences={values:{reducedMotion:false,remindersEnabled:false,reminderTime:'08:30',startAtLogin:false},login:{supported:true,enabled:false,state:'off'}};
window.contentHub=new Proxy({}, {get:(_,method)=>async input=>{window.calls.push({method,input});let value;
if(method==='readAssistantSetup')value={host:window.currentAssistant,ready:true};
else if(method==='readTemplateAssistantSetup')value={host:window.currentAssistant,ready:true};
else if(method==='setAssistant'){window.currentAssistant=input.host;window.updateStatus({...window.fixtureStatus,assistant:input.host});value=null;}
else if(method==='readPreferences')value=window.preferences;
else if(method==='readReminderStatus')value={supported:true,state:'disabled',lastDay:null,reason:'none'};
else if(method==='readSetup')value={platform:'darwin',arch:'arm64',version:'${version}',mode:'disabled',assistant:{host:'codex',ready:true},market:{state:'available',name:'Nova'}};
else if(method==='mutateWorkspace'){window.lib.settings.profile=input.profile;window.lib.settings.editToken='settings-2';value={library:window.lib};}
else if(method==='savePreferences'){window.preferences.values=input;value=window.preferences;}
else if(method==='readBootstrapRecovery')value=window.bootstrapView;
else if(method==='resetMachineBinding')value={reset:true,backupName:'合成备份.json'};
else if(method==='readWorkspaceLibrary')value=window.lib;
else if(method==='exportDiagnostics')value={exported:true,name:'合成诊断.json'};
else if(method==='testReminder')value=window.reminderResult;
else if(method==='choosePhoto' || method==='retryBuiltins' || method==='copyPluginMarketLocation' || method==='openSetupTarget')value=null;
else throw new Error('Unexpected method: '+method);
return {ok:true,value:structuredClone(value)};}});
window.fixtureStatus={assistant:'codex',currentName:'隔离验收库'};
function Probe(){const [status,setStatus]=useState(window.fixtureStatus);window.updateStatus=setStatus;const [library,setLibrary]=useState(window.lib);const run=async action=>action();return <AssistantSettings status={status} busy={false} blocked={false} run={run} close={()=>window.closeCount++} library={library} assets={{photos:[],templates:[]}} refresh={async()=>setLibrary(structuredClone(window.lib))} managePhotos={()=>{}} manageLibrary={()=>{}} manageChannels={()=>window.channelOpens++} setup={<SetupPanel busy={false} run={run}/>} preferences={<PreferencesPanel busy={false} run={run}/>} recovery={<BootstrapRecoveryPanel busy={false} run={run} onRecovered={()=>{}}/>}/>;}
createRoot(document.getElementById('root')).render(<Probe/>);
`);
await build({configFile:false,root,base:'./',resolve:{alias:{react:path.join(workbench,'node_modules/react'),'react-dom':path.join(workbench,'node_modules/react-dom')}},oxc:{jsx:{runtime:'automatic'}},build:{outDir:path.join(root,'dist'),modulePreload:false,target:'chrome148'}});
async function probeMain(probeRoot, evidence){
 const {app,BrowserWindow}=await import('electron');const {default:assert}=await import('node:assert/strict');const {default:path}=await import('node:path');const {default:fs}=await import('node:fs/promises');
 app.setPath('userData',path.join(probeRoot,'machine'));await app.whenReady();const win=new BrowserWindow({show:true,width:1440,height:1100,webPreferences:{contextIsolation:true,nodeIntegration:false}});
 const errors=[];win.webContents.on('console-message', event=>{if(event.level==='error')errors.push(event.message);});
 const run=source=>win.webContents.executeJavaScript(source);
 const wait=condition=>run(`new Promise((resolve,reject)=>{const end=Date.now()+6000;const check=()=>{if(${condition})return resolve(true);if(Date.now()>end)return reject(new Error('Timeout: '+${JSON.stringify(condition)}));setTimeout(check,15)};check()})`);
 const tab=text=>run(`[...document.querySelectorAll('[role=tab]')].find(el=>el.textContent===${JSON.stringify(text)}).click()`);
 const click=text=>run(`[...document.querySelectorAll('button')].find(el=>el.textContent===${JSON.stringify(text)}).click()`);
 const settle=()=>run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
 const report={widths:[],checks:[]};
 try{
  await win.loadFile(path.join(probeRoot,'dist/index.html'));
  await wait('document.querySelector("dialog[open]") && document.body.innerText.includes("配套插件已连接") && document.querySelector(".creator-preferences-form")');
  await tab('帮助与排查');await wait('!document.querySelector(".creator-settings-help").hidden');
  await wait('document.querySelectorAll(".creator-settings-help-guide").length===4');
  assert.equal(await run('document.querySelectorAll(".creator-settings-help-guide[open]").length'),0);
  assert.equal(await run('document.querySelectorAll(".creator-settings-help .semi-card .semi-card").length'),0,'no nested recovery cards');
  for(const width of [1440,1100,900,580,390]){
   win.setSize(width,1100);await settle();await run('document.querySelector("dialog").scrollTop=0');
   const metrics=await run(`(()=>{const dialog=document.querySelector('dialog');const actions=document.querySelector('.creator-settings-help-actions');return {width:${width},clientWidth:dialog.clientWidth,scrollWidth:dialog.scrollWidth,columns:getComputedStyle(actions).gridTemplateColumns,overflow:[...document.querySelectorAll('.creator-settings-help *')].filter(el=>el.clientWidth>0&&el.scrollWidth>el.clientWidth+2).map(el=>el.className)}})()`);
   assert.ok(metrics.scrollWidth<=metrics.clientWidth+1,`dialog overflow at ${width}`);
   report.widths.push(metrics);await fs.writeFile(path.join(evidence,`help-${width}.png`),(await win.webContents.capturePage()).toPNG());
  }
  win.setSize(1440,1100);await settle();
  await click('保存诊断文件');await wait('window.calls.some(call=>call.method==="exportDiagnostics")');
  assert.match(await run('document.querySelector(".creator-settings-help-actions").textContent'),/合成诊断/);
  await click('试发一条通知');await wait('window.calls.some(call=>call.method==="testReminder")');
  await run('window.reminderResult={supported:true,state:"failed",lastDay:null,reason:"storage-unavailable"}');await click('试发一条通知');
  await wait('document.querySelector(".creator-settings-help-actions").textContent.includes("提醒记录无法安全读取或保存，已暂停提醒并保留原文件。")');
  await run('window.reminderResult={supported:true,state:"sent",lastDay:null,reason:"none"}');await click('试发一条通知');
  win.focus();await run('document.querySelector(".creator-settings-help-guide summary").scrollIntoView({block:"center"});document.querySelector(".creator-settings-help-guide summary").focus()');await settle();console.log('Keyboard focus',await run('({active:document.activeElement?.outerHTML,focused:document.hasFocus()})'));
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter'});win.webContents.sendInputEvent({type:'char',keyCode:'\r'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter'});
  await wait('document.querySelector(".creator-settings-help-guide").open');
  for(const title of ['插件怎么安装','安装与升级','macOS 提示无法打开或应用损坏']){
   await run(`[...document.querySelectorAll('.creator-settings-help-guide')].find(el=>el.querySelector('summary').textContent.includes(${JSON.stringify(title)})).open=true`);
  }
  await click('复制安装位置并打开助手');await wait('window.calls.some(call=>call.method==="copyPluginMarketLocation")&&window.calls.some(call=>call.method==="openSetupTarget")');
  await click('重新检查本机连接');
  assert.equal(await run('[...document.querySelectorAll("button")].find(el=>el.textContent==="重新连接内容库").disabled'),true);
  await run('window.bootstrapView={state:"binding-unavailable",reasonCode:"binding-invalid",canReset:true,confirmationToken:"fixture-confirmation",backupName:null}');
  await click('重新检查本机连接');await wait('![...document.querySelectorAll("button")].find(el=>el.textContent==="重新连接内容库").disabled');
  await click('重新连接内容库');await wait('document.querySelector("[aria-label=确认恢复本机连接]")');
  assert.equal(await run('window.calls.some(call=>call.method==="resetMachineBinding")'),false,'no reset before explicit confirmation');
  await click('取消');await wait('!document.querySelector("[aria-label=确认恢复本机连接]")');
  await click('重新连接内容库');await click('确认备份旧记录并重新连接');await wait('window.calls.some(call=>call.method==="resetMachineBinding")');
  assert.deepEqual(await run('window.calls.find(call=>call.method==="resetMachineBinding").input'),{confirmationToken:'fixture-confirmation',confirmed:true});
  await tab('常用设置');await click('编辑');await wait('document.querySelectorAll(".creator-settings-profile input").length>=3');
  await run('document.querySelectorAll(".creator-settings-profile input")[1].focus()');win.webContents.insertText('知识分享');
  await wait('document.querySelectorAll(".creator-settings-profile input")[1].value==="知识分享"');
  await tab('帮助与排查');await tab('常用设置');
  assert.equal(await run('document.querySelectorAll(".creator-settings-profile input")[1].value'),'知识分享','tab keeps drafts');
  await click('关闭设置');await wait('document.querySelector(".creator-settings-notice")');assert.equal(await run('window.closeCount'),0);
  report.checks=['collapsed guides; no nested cards','five widths without dialog overflow','diagnostic fixture export and inline feedback','notification action and storage-unavailable feedback','keyboard Enter expands guide','plugin installation actions','recovery disabled on healthy state; explicit confirmation required; fixture-only reset','tab retains profile draft and dirty close guard'];
  report.rendererErrors=errors;assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(evidence,'checks.json'),JSON.stringify(report,null,2));
  console.log('PASS '+JSON.stringify(report));app.exit(0);
 }catch(error){console.error(error);await fs.writeFile(path.join(evidence,'failure.png'),(await win.webContents.capturePage()).toPNG());app.exit(1);}
}
const evidence=path.resolve(process.env.NOVA_PROBE_EVIDENCE_DIR??path.join(repo,'docs/verification/production/2026-10-20-parallel-integration-0332/ui/help-layout'));
await fs.mkdir(evidence,{recursive:true});
await fs.writeFile(path.join(root,'probe-main.mjs'),`(${probeMain.toString()})(${JSON.stringify(root)},${JSON.stringify(evidence)});`);
const child=spawn(electron,[path.join(root,'probe-main.mjs')],{stdio:'inherit',env:{...process.env,ELECTRON_RUN_AS_NODE:''}});const code=await new Promise(resolve=>child.on('exit',resolve));console.log('Probe fixture:',root);process.exitCode=code??1;
