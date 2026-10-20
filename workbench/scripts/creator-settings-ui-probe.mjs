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
window.reminderResult={supported:true,state:'sent',lastDay:null,reason:'none'};
window.preferences={values:{remindersEnabled:false,reminderTime:'08:30',startAtLogin:false},login:{supported:true,enabled:false,state:'off'}};
window.contentHub=new Proxy({}, {get:(_,method)=>async input=>{window.calls.push({method,input});let value;
if(method==='readAssistantSetup')value={host:window.currentAssistant,ready:true};
else if(method==='readTemplateAssistantSetup')value={host:window.currentAssistant,ready:true};
else if(method==='setAssistant'){window.currentAssistant=input.host;window.updateStatus({...window.fixtureStatus,assistant:input.host});value=null;}
else if(method==='readPreferences')value=window.preferences;
else if(method==='readReminderStatus')value={supported:true,state:'disabled',lastDay:null,reason:'none'};
else if(method==='readSetup')value={platform:'darwin',arch:'arm64',version:'0.3.9',mode:'disabled',assistant:{host:'codex',ready:true},market:{state:'available',name:'Nova'}};
else if(method==='mutateWorkspace'){if(window.rejectMutation || input.editToken !== window.lib.settings.editToken)return {ok:false,error:{code:'conflict',message:'合成冲突：设置已更新'}};window.lib.settings.profile=input.profile;window.lib.settings.editToken+='-saved';value={library:window.lib};}
else if(method==='savePreferences'){window.preferences.values=input;value=window.preferences;}
else if(method==='readWorkspaceLibrary'){if(window.rejectRead)return {ok:false,error:{code:'read-failed',message:'合成读取失败'}};value=window.lib;}
else if(method==='exportDiagnostics')value={exported:true,name:'合成诊断.json'};
else if(method==='testReminder')value=window.reminderResult;
else if(method==='choosePhoto' || method==='retryBuiltins' || method==='copyPluginMarketLocation' || method==='openSetupTarget')value=null;
else throw new Error('Unexpected method: '+method);
return {ok:true,value:structuredClone(value)};}});
window.fixtureStatus={assistant:'codex',currentName:'隔离验收库'};
function Probe(){const [status,setStatus]=useState(window.fixtureStatus);window.updateStatus=setStatus;const [library,setLibrary]=useState(window.lib);window.updateLibrary=value=>setLibrary(structuredClone(value));const [assets,setAssets]=useState({photos:[],templates:[]});window.updateAssets=setAssets;const run=async action=>{try{return await action();}catch(error){window.lastError=error.message;}};return <AssistantSettings status={status} busy={false} blocked={false} run={run} close={()=>window.closeCount++} library={library} assets={assets} refresh={async confirmed=>{window.refreshAcknowledged=!!confirmed;setLibrary(structuredClone(confirmed ?? window.lib));}} managePhotos={()=>{}} manageLibrary={()=>{}} manageChannels={()=>window.channelOpens++} setup={<SetupPanel busy={false} run={run}/>} preferences={<PreferencesPanel busy={false} run={run}/>} recovery={<p>连接恢复入口</p>}/>;}
createRoot(document.getElementById('root')).render(<Probe/>);
`);
await build({configFile:false,root,base:'./',resolve:{alias:{react:path.join(workbench,'node_modules/react'),'react-dom':path.join(workbench,'node_modules/react-dom')}},oxc:{jsx:{runtime:'automatic'}},build:{outDir:path.join(root,'dist'),modulePreload:false,target:'chrome148'}});
async function probeMain(probeRoot){
const {app,BrowserWindow}=await import('electron');const {default:assert}=await import('node:assert/strict');const {default:path}=await import('node:path');const {default:fs}=await import('node:fs/promises');
app.setPath('userData',path.join(probeRoot,'machine'));await app.whenReady();const win=new BrowserWindow({show:true,width:1440,height:1100,webPreferences:{contextIsolation:true,nodeIntegration:false}});
win.webContents.on('console-message', event=>console.log('renderer:', event.message)); const run=source=>win.webContents.executeJavaScript(source).catch(error=>{console.log('Failed source:',source);throw error;});const wait=condition=>run(`new Promise((resolve,reject)=>{const end=Date.now()+6000;const check=()=>{if(${condition})return resolve(true);if(Date.now()>end)return reject(new Error('State timeout: '+${JSON.stringify(condition)}+' / '+document.body.innerText.slice(0,900)));setTimeout(check,15)};check()})`);
const tab=text=>run(`[...document.querySelectorAll('[role=tab]')].find(el=>el.textContent===${JSON.stringify(text)}).click()`);
const click=text=>run(`[...document.querySelectorAll('button')].find(button=>button.textContent===${JSON.stringify(text)}).click()`);
try{
await win.loadFile(path.join(probeRoot,'dist/index.html'));await wait('document.querySelector("dialog[open]") && document.body.innerText.includes("配套插件已连接") && document.querySelector(".creator-preferences-form")');
assert.equal(await run('getComputedStyle(document.querySelector(".creator-settings-columns")).gridTemplateColumns.split(" ").length'),2);
assert.equal(await run('document.querySelector(".creator-settings-help").hidden'),true);
assert.equal(await run('document.querySelectorAll(".creator-settings-columns details").length'),0,'all settings help has one shared entry');
for(const width of [1440,1100,900]) {
 await win.setSize(width,1100);await run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
 assert.equal(await run('document.querySelector("dialog").scrollWidth<=document.querySelector("dialog").clientWidth'),true,'settings bounded');
 assert.equal(await run('document.querySelector(".creator-settings-profile").getBoundingClientRect().top<=document.querySelector(".creator-settings-assistant").getBoundingClientRect().top'),true,'personal information comes first');
 assert.equal(await run('document.querySelector(".creator-settings-channels").getBoundingClientRect().top<=document.querySelector(".creator-settings-assistant").getBoundingClientRect().top'),true,'publishing channels come before assistant setup');
 assert.deepEqual(await run('[...document.querySelector(".creator-settings-columns").children].slice(0,2).map(el=>el.classList.contains("creator-settings-profile")?"profile":el.classList.contains("creator-settings-channels")?"channels":"other")'),['profile','channels'],'DOM and visual priority agree');
 await fs.writeFile(path.join(probeRoot,`settings-${width}.png`),(await win.webContents.capturePage()).toPNG());
}
await tab('帮助与排查');await wait('!document.querySelector(".creator-settings-help").hidden');
assert.ok(await run('document.querySelector(".creator-settings-help").textContent.includes("连接恢复入口")'),'recovery retained');
await click('保存诊断文件');await wait('window.calls.some(call=>call.method==="exportDiagnostics")');
await click('复制安装位置并打开助手');await wait('window.calls.some(call=>call.method==="copyPluginMarketLocation")&&window.calls.some(call=>call.method==="openSetupTarget")');
await click('试发一条通知');await wait('window.calls.some(call=>call.method==="testReminder")');
await run('window.reminderResult={supported:true,state:"failed",lastDay:null,reason:"storage-unavailable"}');await click('试发一条通知');
await wait('document.querySelector(".creator-settings-help").textContent.includes("提醒记录无法安全读取或保存，已暂停提醒并保留原文件。")');
assert.equal(await run('(()=>{const card=document.querySelector(".creator-settings-help-notifications");return card.querySelector("[role=status]").textContent;})()'),'提醒记录无法安全读取或保存，已暂停提醒并保留原文件。','storage failure takes priority over notification permission guidance in help');
assert.equal(await run('[...document.querySelectorAll(".preferences-panel .creator-settings-hint[role=status]")].at(-1).textContent'),'提醒记录无法安全读取或保存，已暂停提醒并保留原文件。','both settings tabs show the same reason-first status');
await run('window.reminderResult={supported:true,state:"sent",lastDay:null,reason:"none"}');await click('试发一条通知');

await fs.writeFile(path.join(probeRoot,'settings-help-900.png'),(await win.webContents.capturePage()).toPNG());
await tab('常用设置');await win.setSize(1440,1100);
await run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))'); await fs.writeFile('/tmp/nova-creator-settings-probe.png',(await win.webContents.capturePage()).toPNG());
await run('document.getElementById("update-builtins").click()');await wait('window.calls.some(call=>call.method==="retryBuiltins")');
await run('window.updateStatus({...window.fixtureStatus, pending:{}})');await wait('document.getElementById("update-builtins").disabled');
await run('window.updateStatus({...window.fixtureStatus, started:true, task:{status:"running"}})');await wait('document.getElementById("update-builtins").disabled');
await run('window.updateStatus({...window.fixtureStatus, needsReselect:true})');await wait('document.getElementById("update-builtins").disabled');
await run('window.updateStatus({...window.fixtureStatus, seedPending:true})');await wait('!document.getElementById("update-builtins").disabled && document.getElementById("update-builtins").textContent==="继续更新"');
await run('window.updateStatus(window.fixtureStatus)');await wait('document.getElementById("update-builtins").textContent==="更新内置资源"');

await run('document.getElementById("assistant").click()');await wait('document.querySelectorAll(".semi-select-option").length===2');assert.deepEqual(await run('[...document.querySelectorAll(".semi-select-option")].map(option=>option.textContent)'),['Codex（默认）','WorkBuddy']);await run('[...document.querySelectorAll(".semi-select-option")].find(option=>option.textContent==="WorkBuddy").click()');await wait('window.calls.some(call=>call.method==="setAssistant"&&call.input.host==="workbuddy")');await run('document.getElementById("assistant").click()');await wait('document.querySelectorAll(".semi-select-option").length===2');await run('[...document.querySelectorAll(".semi-select-option")].find(option=>option.textContent==="Codex（默认）").click()');await wait('window.calls.some(call=>call.method==="setAssistant"&&call.input.host==="codex")');assert.match(await run('document.querySelector(".creator-channel-preview").textContent'),/我的专属渠道/);await click('管理渠道');assert.equal(await run('window.channelOpens'),1);await fs.writeFile(path.join(probeRoot,'settings-current.png'),(await win.webContents.capturePage()).toPNG());
await click('编辑');await wait('document.querySelectorAll(".creator-settings-profile input").length >= 3');
assert.equal(await run('document.querySelectorAll(".creator-settings-profile .semi-card").length'),1,'editing uses the original personal information card');
await run('document.querySelectorAll(".creator-settings-profile input")[1].focus()');win.webContents.insertText('知识分享');await wait('document.querySelectorAll(".creator-settings-profile input")[1].value === "知识分享"');
await tab('帮助与排查');await tab('常用设置');assert.equal(await run('document.querySelectorAll(".creator-settings-profile input")[1].value'),'知识分享','help switch retains draft');
const beforeUpdate = await run('window.calls.filter(call=>call.method==="retryBuiltins").length');await run('document.getElementById("update-builtins").click()');assert.equal(await run('window.calls.filter(call=>call.method==="retryBuiltins").length'),beforeUpdate);
await run('document.getElementById("close-settings").click()');await wait('document.querySelector(".creator-settings-notice")');assert.equal(await run('window.closeCount'),0);
await click('保存个人信息');await wait('window.calls.some(call=>call.method === "mutateWorkspace")');
assert.deepEqual(await run('window.lib.settings.profile.marks'),[{key:'品牌色',value:'蓝色'},{key:'自媒体方向',value:'知识分享'}]);assert.equal(await run('window.lib.settings.profile.avatarAssetHash'),null);
await wait('!document.querySelector(".creator-settings-profile form")');assert.equal(await run('window.refreshAcknowledged'),true,'save forwards confirmed snapshot');

await run(`window.richProfile={name:'完整昵称',intro:'这是一段需要完整保留的个人介绍。'.repeat(70)+'介绍末尾',avatarAssetHash:'hash-0',marks:[{key:'自媒体方向',value:'知识分享'},{key:'目标读者',value:'新创作者'},{key:'品牌色',value:'蓝色'},{key:'额外标记',value:'标记内容'.repeat(90)+'标记末尾'}]};window.lib.settings.profile=structuredClone(window.richProfile);window.lib.photos=Array.from({length:8},(_,index)=>({id:'photo-'+index,title:'照片 '+index,assetHash:'hash-'+index,isOwnPhoto:true,availability:'available',deletedAt:null}));window.updateLibrary(window.lib);window.updateAssets({photos:window.lib.photos.map(photo=>({...photo,url:'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="skyblue"/></svg>')})),templates:[]});`);
await wait('document.querySelectorAll(".creator-settings-photos button").length===5 && document.querySelector(".creator-profile-avatar img")');
assert.match(await run('document.querySelector(".creator-profile-facts").textContent'),/品牌色(?:查看全部)?蓝色/);
assert.match(await run('document.querySelector(".creator-profile-facts").textContent'),/额外标记/);
await wait('document.querySelector(".creator-profile-intro .semi-typography-ellipsis-expand")');
await wait('document.querySelector(".creator-profile-intro").getBoundingClientRect().height < 100');
await run('document.querySelector(".creator-profile-intro .semi-typography-ellipsis-expand").click()');
await wait('document.querySelector(".creator-profile-intro").textContent.includes("介绍末尾")');
assert.match(await run('document.querySelector(".creator-profile-intro").textContent'),/收起/);
await run('document.querySelector(".creator-profile-intro .semi-typography-ellipsis-expand").click()');
await wait('document.querySelectorAll(".creator-profile-facts dd")[3].getBoundingClientRect().height < 100');
await run('document.querySelectorAll(".creator-profile-facts dd")[3].querySelector(".semi-typography-ellipsis-expand").click()');await wait('document.querySelectorAll(".creator-profile-facts dd")[3].textContent.includes("标记末尾")');
await run('document.querySelectorAll(".creator-profile-facts dd")[3].querySelector(".semi-typography-ellipsis-expand").click()');
for(const width of [1440,1100,900]) {await win.setSize(width,1100);await run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');assert.equal(await run('document.querySelector("dialog").scrollWidth<=document.querySelector("dialog").clientWidth'),true,'rich profile remains bounded');}
await win.setSize(1440,1100);
await click('查看全部 8 张照片');await wait('document.querySelectorAll(".creator-settings-photos button").length===8');
await click('收起照片');await wait('document.querySelectorAll(".creator-settings-photos button").length===5');
await run('window.profileCard=document.querySelector(".creator-settings-profile > .semi-card");document.querySelector("dialog").scrollTop=0;window.beforeEditScroll=document.querySelector("dialog").scrollTop');
await click('编辑');await wait('document.querySelector(".creator-settings-profile form")');
assert.equal(await run('document.querySelectorAll(".creator-settings-profile .semi-card").length'),1,'editing stays within one card');
assert.equal(await run('document.querySelector(".creator-settings-profile > .semi-card")===window.profileCard'),true,'original card is retained');
assert.equal(await run('document.querySelectorAll(".creator-settings-photos button").length'),5,'photos remain within editing card');
assert.ok(await run('Math.abs(document.querySelector("dialog").scrollTop-window.beforeEditScroll)<2'),'edit does not jump to another card');
await run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');await fs.writeFile(path.join(probeRoot,'settings-profile-editing.png'),(await win.webContents.capturePage()).toPNG());
await run('document.querySelector(".creator-settings-profile input").focus();document.querySelector(".creator-settings-profile input").select()');win.webContents.insertText('正在编辑');await wait('document.querySelector(".creator-settings-profile input").value === "正在编辑"');
await run('window.lib.settings.editToken="background-token";window.lib.settings.profile.name="后台已更新";window.updateLibrary(window.lib)');
await wait('document.querySelector(".creator-settings-profile .danger-note")');
assert.equal(await run('document.querySelector(".creator-settings-profile input").value'),'正在编辑','background refresh preserves typing');
await click('返回预览');assert.equal(await run('!!document.querySelector(".creator-settings-profile form")'),true,'dirty preview return is guarded');
await click('保存个人信息');await wait('document.querySelector(".creator-settings-profile [role=status]").textContent.includes("编辑内容仍保留")');
assert.equal(await run('document.querySelector(".creator-settings-profile input").value'),'正在编辑','conflict preserves draft');
assert.equal(await run('window.calls.filter(call=>call.method==="mutateWorkspace").at(-1).input.editToken'),await run('window.calls.filter(call=>call.method==="mutateWorkspace").at(-2).input.editToken+"-saved"'),'save retains original CAS token');
await run('window.rejectRead=true');await click('取消修改');await wait('window.lastError === "合成读取失败"');
assert.equal(await run('document.querySelector(".creator-settings-profile input").value'),'正在编辑','failed cancel refresh preserves draft');
await run('window.rejectRead=false');await click('取消修改');await wait('!document.querySelector(".creator-settings-profile form")');
assert.equal(await run('document.querySelector(".creator-settings-notice")'),null,'cancel clears close notice');
assert.match(await run('document.querySelector(".creator-profile-preview").textContent'),/后台已更新/);
await click('编辑');await wait('document.querySelector(".creator-settings-profile input")');
await run('document.querySelector(".creator-settings-profile input").focus();document.querySelector(".creator-settings-profile input").select()');win.webContents.insertText('已保存昵称');await wait('document.querySelector(".creator-settings-profile input").value === "已保存昵称"');
await run('document.querySelector(".creator-settings-profile textarea").focus();document.querySelector(".creator-settings-profile textarea").select()');win.webContents.insertText('这是一段需要完整保留的个人介绍。'.repeat(70)+'介绍末尾追加介绍');
await run('document.querySelector(".creator-settings-profile details").open=true;document.querySelectorAll(".creator-settings-profile input")[4].focus();document.querySelectorAll(".creator-settings-profile input")[4].select()');win.webContents.insertText('保存后的品牌色');await wait('document.querySelectorAll(".creator-settings-profile input")[4].value==="保存后的品牌色"');
await click('保存个人信息');await wait('!document.querySelector(".creator-settings-profile form")');
assert.equal(await run('window.lib.settings.profile.name'),'已保存昵称');
assert.equal(await run('window.lib.settings.profile.intro'),'这是一段需要完整保留的个人介绍。'.repeat(70)+'介绍末尾追加介绍');
assert.deepEqual(await run('window.lib.settings.profile.marks'),await run('window.richProfile.marks.map(mark=>mark.key==="品牌色"?{...mark,value:"保存后的品牌色"}:mark)'));
assert.match(await run('document.querySelector(".creator-profile-facts").textContent'),/保存后的品牌色/);
assert.equal(await run('window.lib.settings.profile.avatarAssetHash'),'hash-0');
await fs.writeFile(path.join(probeRoot,'settings-profile-saved.png'),(await win.webContents.capturePage()).toPNG());
await click('编辑');await wait('document.querySelector(".creator-settings-profile form")');await click('返回预览');await wait('!document.querySelector(".creator-settings-profile form")');
await click('＋ 添加照片');await wait('window.calls.some(call=>call.method === "choosePhoto")');assert.equal(await run('window.calls.find(call=>call.method === "choosePhoto").input.isOwnPhoto'),false);
await run('document.querySelector(".creator-preference-row .semi-switch").click()');await wait('!Array.from(document.querySelectorAll("button")).find(button=>button.textContent==="保存偏好").disabled');await click('保存偏好');await wait('window.calls.some(call=>call.method === "savePreferences")');assert.equal(await run('window.preferences.values.remindersEnabled'),true);
console.log('PASS: settings compact priority rows 1440/1100/900, unified help/diagnostic/install/notification actions, draft-preserving help tabs, dirty-close guard, same-card profile edit, all fields/photos with Semi expansion, save/cancel/CAS/read-failure and midtyping draft preservation, unclaimed photo import, preference save, both explicit assistants and one shared channel-manager entry');console.log('Screenshots:',probeRoot);app.exit(0);
}catch(error){await fs.writeFile(path.join(probeRoot,"settings-failed.png"),(await win.webContents.capturePage()).toPNG());console.error(error);app.exit(1);}}
await fs.writeFile(path.join(root,'probe-main.mjs'),`(${probeMain.toString()})(${JSON.stringify(root)});`);
const child=spawn(electron,[path.join(root,'probe-main.mjs')],{stdio:'inherit',env:{...process.env,ELECTRON_RUN_AS_NODE:''}});const code=await new Promise(resolve=>child.on('exit',resolve));console.log('Probe fixture:',root);process.exitCode=code??1;
