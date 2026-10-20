// Production App/CSS, isolated in-memory IPC and native Electron mouse input.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import electron from 'electron';
import {build} from 'vite';
const workbench=fileURLToPath(new URL('../',import.meta.url));
const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'nova-date-time-')));
await fs.writeFile(path.join(root,'index.html'),'<html lang="zh-CN"><div id="root"></div><script type="module" src="/probe.jsx"></script></html>');
await fs.writeFile(path.join(root,'probe.jsx'),`
import {useState} from 'react';import {createRoot} from 'react-dom/client';
import '${workbench}/node_modules/@douyinfe/semi-ui-19/react19-adapter';
import '${workbench}/node_modules/@douyinfe/semi-ui-19/lib/es/_base/base.css';
import '${workbench}/src/renderer/style.css';
import {ManagementDialog} from '${workbench}/src/renderer/library-panels.tsx';
import {CalendarDateInput,ClockTimeInput} from '${workbench}/src/renderer/semi-controls.tsx';
import.meta.glob('${workbench}/src/renderer/*.css',{eager:true});
function Pair(){const [date,setDate]=useState('2026-10-20'),[time,setTime]=useState('09:00');window.values={date,time};return <ManagementDialog title="日期时间原生交互" busy={false} dirty close={()=>{}}><form className="management-form"><label>日期<CalendarDateInput value={date} onChange={setDate}/></label><label>当地时间<ClockTimeInput value={time} onChange={setTime}/></label><textarea defaultValue="本次填写"/></form></ManagementDialog>};createRoot(document.getElementById('root')).render(<Pair/>);
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
  win.focus();win.webContents.focus();
  await run(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'center',behavior:'instant'})`);await settle();
  const point=await run(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('Missing '+${JSON.stringify(selector)});const r=el.getBoundingClientRect(),x=Math.round(r.x+r.width/2),y=Math.round(r.y+r.height/2);return {x,y,reachable:el.contains(document.elementFromPoint(x,y))}})()`);
  assert.equal(point.reachable,true,'native mouse can reach '+selector); console.log('Mouse',selector);
  win.webContents.sendInputEvent({type:'mouseMove',x:point.x,y:point.y});win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,x:point.x,y:point.y});win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,x:point.x,y:point.y});await settle();
 };
 const button=async text=>{await run(`(()=>{const el=[...document.querySelectorAll('button')].find(el=>el.textContent.trim()===${JSON.stringify(text)});if(!el)throw Error('Missing button '+${JSON.stringify(text)});el.dataset.probeButton='target';})()`);await mouse('[data-probe-button=target]');await run('document.querySelectorAll("[data-probe-button]").forEach(el=>delete el.dataset.probeButton)');};
 const select=async(selector,text)=>{await mouse(selector);await wait('!!document.querySelector(".semi-select-option")');await run(`(()=>{const el=[...document.querySelectorAll('.semi-select-option')].find(el=>el.textContent.trim()===${JSON.stringify(text)});if(!el)throw Error('Missing option '+${JSON.stringify(text)});el.dataset.probeOption='target';})()`);await mouse('[data-probe-option=target]');await wait('!document.querySelector(".semi-select-option")');};
 try {
  await win.loadFile(path.join(root,'dist/index.html'));win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:systemReducedMotion?'reduce':'no-preference'}]});
await run(`window.events=[];['mousedown','mouseup','click','focusin','focusout','scroll'].forEach(type=>document.addEventListener(type,e=>{window.events.push({type,t:Math.round(performance.now()),active:document.activeElement?.outerHTML.slice(0,150),target:e.target.id||e.target.className,text:e.target.textContent?.slice(0,40),trusted:e.isTrusted});},true));`);await wait('document.querySelector(".management-dialog[open]")');
  await mouse('.management-dialog .semi-datepicker-input');await wait('!!document.querySelector(".semi-datepicker-day")');
  const date=await run(`(()=>{const current=document.querySelector('.management-dialog .semi-datepicker input').value;const day=[...document.querySelectorAll('.semi-datepicker-day[title]')].find(el=>el.title!==current&&!el.className.includes('disabled'));day.dataset.probeDay='target';return day.title})()`);
  await mouse('[data-probe-day=target]');await wait('!document.querySelector(".semi-datepicker-day")');assert.equal(await run('document.querySelector(".management-dialog .semi-datepicker input").value'),date);
  win.blur();await mouse('.management-dialog .semi-timepicker input');await wait('!!document.querySelector(".semi-timepicker-panel")');
  await run(`[...document.querySelectorAll('.semi-timepicker-panel [role=listbox]')[1].querySelectorAll('[role=option]')].find(el=>el.textContent.trim()==='25').dataset.probeMinute='target'`);await mouse('[data-probe-minute=target]');assert.equal(await run('document.querySelector(".management-dialog .semi-timepicker input").value'),'09:25');
  const escape=async()=>{win.webContents.sendInputEvent({type:'keyDown',keyCode:'ESC'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'ESC'});await settle();};
  await fs.writeFile(path.join(root,'time-selected.png'),(await win.webContents.capturePage()).toPNG());
  await escape();await wait('!document.querySelector(".semi-timepicker-panel")');assert.equal(await run('!!document.querySelector(".management-dialog[open]")'),true);assert.equal(await run('!!document.querySelector(".management-dialog [role=alert]")'),false);
  console.log('PASS focused native date to time and popup Escape');
  app.exit(0);
 }catch(error){console.error(error);console.error(await run('JSON.stringify({events:window.events.slice(-35),values:window.values,body:document.body.innerText.slice(-1500),dialogs:[...document.querySelectorAll("dialog")].map(d=>({class:d.className,open:d.open,modal:d.matches(":modal")})),portals:[...document.querySelectorAll(".semi-dialog-popup-host")].map(el=>el.outerHTML.slice(0,1000))})'));await fs.writeFile(path.join(root,'failure.png'),(await win.webContents.capturePage()).toPNG());app.exit(1);}
}
await fs.writeFile(path.join(root,'main.mjs'),`(${main.toString()})(${JSON.stringify(root)},${process.argv.includes('--system-reduced-motion')})`);
const child=spawn(electron,[path.join(root,'main.mjs')],{stdio:'inherit',env:{...process.env,ELECTRON_RUN_AS_NODE:''}});
const timer=setTimeout(()=>child.kill('SIGKILL'),60000);
process.exitCode=await new Promise(resolve=>child.once('exit',code=>{clearTimeout(timer);resolve(code??1)}));
console.log('Probe fixture:',root);
