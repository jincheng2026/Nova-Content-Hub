// Production App/CSS, isolated in-memory IPC and native Electron mouse input.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import electron from 'electron';
import {build} from 'vite';
const workbench=fileURLToPath(new URL('../',import.meta.url));
const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'nova-dialog-controls-')));
await fs.writeFile(path.join(root,'index.html'),'<html lang="zh-CN"><div id="root"></div><script type="module" src="/probe.jsx"></script></html>');
await fs.writeFile(path.join(root,'probe.jsx'),`
window.calls=[];window.unexpected=[];let host='codex';
const content={id:'fixture',title:'隔离下拉框验收',body:'只在内存中测试。',editToken:'content-token',updatedAt:'2026-10-20T00:00:00Z',channelIds:[],plans:[],deletedAt:null,isExample:false,candidates:[],coverVariants:[],publications:[],publicationEvents:[],candidateCount:0,selectedCandidateId:null,materials:[]};
const photos=[{id:'own',title:'合成本人照',isOwnPhoto:true,availability:'available',assetHash:'photo-hash',deletedAt:null}];
const assets={templates:[{id:'t1',name:'合成模板',version:'1',builtin:false,samples:[]}],photos};
const library={contentDetails:[content],collections:[],photos,prompts:[],templates:[{id:'t1',title:'合成模板',currentVersion:'1',versions:[{version:'1',packageHash:'hash'}]}],settings:{editToken:'settings-token',profile:{name:'隔离测试',intro:'内存夹具',marks:[],avatarAssetHash:null},channels:[],defaults:{photoId:null,templateId:null,coverCount:1},customRatios:[]}};
const status=()=>({currentName:'隔离测试库',busy:false,pending:null,creating:false,assistant:host,maintenance:{pending:null},task:null});
window.contentHub=new Proxy({onWorkspaceChanged:()=>()=>{}},{get:(target,method)=>target[method]??(async input=>{
window.calls.push({method,input});let value;
if(method==='status')value=status();
else if(method==='listContents')value=[content];
else if(method==='readWorkspace')value={contents:[content],channels:[],prompts:[]};
else if(method==='readWorkspaceLibrary')value=library;
else if(method==='listCoverAssets')value=assets;
else if(method==='readContent')value=content;
else if(method==='readCover')value={content,candidates:[],jobs:[],selectedCandidateId:null};
else if(method==='readPreferences')value={values:{reducedMotion:${!process.argv.includes('--system-reduced-motion')},remindersEnabled:false,reminderTime:'08:30',startAtLogin:false},login:{supported:true,enabled:false,state:'off'}};
else if(method==='readAssistantSetup'||method==='readTemplateAssistantSetup')value={host,ready:true};
else if(method==='readReminderStatus')value={supported:true,state:'disabled',reason:'none',lastDay:null};
else if(method==='readBootstrapRecovery')value={state:'ready',canReset:false};
else if(method==='readSetup')value={platform:'darwin',arch:'arm64',version:${JSON.stringify(JSON.parse(await fs.readFile(path.join(workbench,'package.json'),'utf8')).version)},mode:'disabled',assistant:{host,ready:true},market:{state:'available',name:'Nova'}};
else if(method==='setAssistant'){host=input.host;value=null;}
else {window.unexpected.push(method);throw Error('Unexpected synthetic IPC '+method);}
return {ok:true,value:structuredClone(value)};
})});
await import('${workbench}/src/renderer/app.tsx');
`);
await build({configFile:false,root,base:'./',resolve:{alias:{react:path.join(workbench,'node_modules/react'),'react-dom':path.join(workbench,'node_modules/react-dom')}},oxc:{jsx:{runtime:'automatic'}},build:{outDir:path.join(root,'dist'),modulePreload:false,target:'chrome148'},logLevel:'error'});
async function main(root,systemReducedMotion){
 const {app,BrowserWindow}=await import('electron'),{default:fs}=await import('node:fs/promises'),{default:path}=await import('node:path'),{default:assert}=await import('node:assert/strict');
 app.setPath('userData',path.join(root,'machine'));await app.whenReady();
 const win=new BrowserWindow({show:true,width:1440,height:1000,webPreferences:{contextIsolation:true,nodeIntegration:false}});
 const run=source=>win.webContents.executeJavaScript(source);
 const settle=()=>run('new Promise(resolve=>setTimeout(resolve,250))');
 const wait=condition=>run(`new Promise((resolve,reject)=>{let end=Date.now()+4000;function check(){if(${condition})return resolve();if(Date.now()>end)return reject(Error('Timeout '+${JSON.stringify(condition)}));setTimeout(check,20)}check()})`);
 const mouse=async selector=>{
  await run(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'center',behavior:'instant'})`);await settle();
  const point=await run(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('Missing '+${JSON.stringify(selector)});const r=el.getBoundingClientRect(),x=Math.round(r.x+r.width/2),y=Math.round(r.y+r.height/2);return {x,y,reachable:el.contains(document.elementFromPoint(x,y))}})()`);
  assert.equal(point.reachable,true,'native mouse can reach '+selector); console.log('Mouse',selector);
  win.webContents.sendInputEvent({type:'mouseMove',x:point.x,y:point.y});win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,x:point.x,y:point.y});win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,x:point.x,y:point.y});await settle();
 };
 const button=async text=>{await run(`(()=>{const el=[...document.querySelectorAll('button')].find(el=>el.textContent.trim()===${JSON.stringify(text)});if(!el)throw Error('Missing button '+${JSON.stringify(text)});el.dataset.probeButton='target';})()`);await mouse('[data-probe-button=target]');await run('document.querySelectorAll("[data-probe-button]").forEach(el=>delete el.dataset.probeButton)');};
 const select=async(selector,text)=>{await mouse(selector);await wait('!!document.querySelector(".semi-select-option")');await run(`(()=>{const el=[...document.querySelectorAll('.semi-select-option')].find(el=>el.textContent.trim()===${JSON.stringify(text)});if(!el)throw Error('Missing option '+${JSON.stringify(text)});el.dataset.probeOption='target';})()`);await mouse('[data-probe-option=target]');await wait('!document.querySelector(".semi-select-option")');};
 try {
  await win.loadFile(path.join(root,'dist/index.html')); if(systemReducedMotion){win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});}
await run(`window.events=[];['mousedown','mouseup','click','focusin','focusout','scroll'].forEach(type=>document.addEventListener(type,e=>{window.events.push({type,target:e.target.id||e.target.className,text:e.target.textContent?.slice(0,40),trusted:e.isTrusted});},true));`);await wait('document.querySelector("#nav-content:not(:disabled)")');
  if(systemReducedMotion){assert.equal(await run('matchMedia("(prefers-reduced-motion: reduce)").matches'),true);assert.equal(await run('document.documentElement.dataset.reducedMotion'),'false');}
  await mouse('#nav-content');await button('制作封面');await wait('document.querySelector(".cover-create-dialog[open]")');
  await select('#cover-photo','合成本人照');assert.match(await run('document.querySelector("#cover-photo").textContent'),/合成本人照/);
  await select('#cover-ratio','1:1');assert.match(await run('document.querySelector(".cover-size-hint").textContent'),/1:1/);
  await select('.cover-create-dialog .cover-composition-references .semi-page-switch .semi-select','每页条数：50');assert.match(await run('document.querySelector(".cover-create-dialog .cover-composition-references .semi-page-switch").textContent'),/50/);
  await button('暂时收起');await button('设置');await wait('document.querySelector(".creator-settings-dialog[open]")');
  await select('#assistant','WorkBuddy');await wait('window.calls.some(c=>c.method==="setAssistant"&&c.input.host==="workbuddy")');
  await fs.writeFile(path.join(root,'settings-selected.png'),(await win.webContents.capturePage()).toPNG());
  await button('关闭设置');await button('发布计划');await button('＋ 新增发布计划');await wait('document.querySelector(".management-dialog[open]")');
  await mouse('.management-dialog .semi-datepicker-input');await wait('!!document.querySelector(".semi-datepicker-day")');
  const date=await run(`(()=>{const current=document.querySelector('.management-dialog .semi-datepicker input').value;const day=[...document.querySelectorAll('.semi-datepicker-day[title]')].find(el=>el.title!==current&&!el.className.includes('disabled'));day.dataset.probeDay='target';return day.title})()`);
  await mouse('[data-probe-day=target]');await wait('!document.querySelector(".semi-datepicker-day")');assert.equal(await run('document.querySelector(".management-dialog .semi-datepicker input").value'),date);
  await mouse('.management-dialog .semi-timepicker input');await wait('!!document.querySelector(".semi-timepicker-panel")');
  await run(`[...document.querySelectorAll('.semi-timepicker-panel [role=listbox]')[1].querySelectorAll('[role=option]')].find(el=>el.textContent.trim()==='25').dataset.probeMinute='target'`);await mouse('[data-probe-minute=target]');assert.equal(await run('document.querySelector(".management-dialog .semi-timepicker input").value'),'09:25');
  const escape=async()=>{win.webContents.sendInputEvent({type:'keyDown',keyCode:'ESC'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'ESC'});await settle();};
  await fs.writeFile(path.join(root,'time-selected.png'),(await win.webContents.capturePage()).toPNG());
  await escape();await wait('!document.querySelector(".semi-timepicker-panel")');assert.equal(await run('!!document.querySelector(".management-dialog[open]")'),true);assert.equal(await run('!!document.querySelector(".management-dialog [role=alert]")'),false);
  await escape();assert.equal(await run('!!document.querySelector(".management-dialog [role=alert]")'),true);await button('放弃填写并关闭');
  assert.deepEqual(await run('window.unexpected'),[]);
  console.log('PASS full production App/CSS, native mouse: cover photo/ratio/page-size and global assistant, date/time selections, popup Escape and dirty-dialog Escape');
  await fs.writeFile(path.join(root,'result.json'),JSON.stringify({passed:true,reducedMotion:systemReducedMotion?'system-media':'application-preference',scope:'Production App and complete CSS; synthetic IPC; native mouse events; no installed app or user library access'},null,2));
  app.exit(0);
 }catch(error){console.error(error);console.error(await run('JSON.stringify({events:window.events.slice(-35),photo:document.querySelector("#cover-photo")?.textContent,unexpected:window.unexpected,body:document.body.innerText.slice(-1500),dialogs:[...document.querySelectorAll("dialog")].map(d=>({class:d.className,open:d.open,modal:d.matches(":modal")})),portals:[...document.querySelectorAll(".semi-dialog-popup-host")].map(el=>el.outerHTML.slice(0,1000))})'));await fs.writeFile(path.join(root,'failure.png'),(await win.webContents.capturePage()).toPNG());app.exit(1);}
}
await fs.writeFile(path.join(root,'main.mjs'),`(${main.toString()})(${JSON.stringify(root)},${process.argv.includes('--system-reduced-motion')})`);
const child=spawn(electron,[path.join(root,'main.mjs')],{stdio:'inherit',env:{...process.env,ELECTRON_RUN_AS_NODE:''}});
const timer=setTimeout(()=>child.kill('SIGKILL'),60000);
process.exitCode=await new Promise(resolve=>child.once('exit',code=>{clearTimeout(timer);resolve(code??1)}));
console.log('Probe fixture:',root);
