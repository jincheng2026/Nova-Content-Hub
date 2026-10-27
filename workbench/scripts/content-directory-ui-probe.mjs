// Actual React/Semi/Electron layout with synthetic IPC; no user library changes.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import electron from 'electron';
import {build} from 'vite';
const workbench=fileURLToPath(new URL('../',import.meta.url));
const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'nova-directory-ui-')));
const evidence=path.resolve(workbench,'../docs/verification/production/2026-10-27-ui-consistency/directory');
await fs.mkdir(evidence,{recursive:true});
try {
await fs.writeFile(path.join(root,'index.html'),'<html lang="zh-CN"><div id="root"></div><script type="module" src="/probe.jsx"></script></html>');
await fs.writeFile(path.join(root,'probe.jsx'),`
import {createRoot} from 'react-dom/client';
import ${JSON.stringify(path.join(workbench,'node_modules/@douyinfe/semi-ui-19/react19-adapter'))};
import ${JSON.stringify(path.join(workbench,'node_modules/@douyinfe/semi-ui-19/lib/es/_base/base.css'))};
import ${JSON.stringify(path.join(workbench,'src/renderer/style.css'))};
import {ProductionContentDirectory} from ${JSON.stringify(path.join(workbench,'src/renderer/production-workspace.tsx'))};
const contents=Array.from({length:6},(_,i)=>({id:'content-'+i,title:i===2?'长标题用于检查同排卡片高度对齐'.repeat(8):['如何做一个AI博主','测试创建内容','给创作留点空间'][i%3],body:i===1?'短正文':('这是保留完整的测试正文，检查内容项目同排对齐。\\n'.repeat(20)+'末尾完整内容可查'),editToken:'token',deletedAt:null}));
const library={contentDetails:contents.map(item=>({...item,publications:[{id:'p-'+item.id,title:item.title,text:'合成发布记录',channelName:'测试渠道',recordedAt:'2026-10-27T00:00:00Z'}],publicationEvents:[]}))};
window.opened=[];window.contentHub={readProduction:async()=>({ok:true,value:{accounts:[],reports:[],creations:[],tasks:[]}})};
createRoot(document.getElementById('root')).render(<div style={{padding:28}}><ProductionContentDirectory mode="published" contents={contents} library={library} openContent={id=>window.opened.push(id)}/></div>);
`);
await build({configFile:false,root,base:'./',resolve:{alias:{react:path.join(workbench,'node_modules/react'),'react-dom':path.join(workbench,'node_modules/react-dom')}},oxc:{jsx:{runtime:'automatic'}},build:{outDir:path.join(root,'dist'),modulePreload:false,target:'chrome148'}});
async function probeMain(root,evidence){
 const {app,BrowserWindow}=await import('electron');const {default:assert}=await import('node:assert/strict');const {default:path}=await import('node:path');const {default:fs}=await import('node:fs/promises');
 app.setPath('userData',path.join(root,'machine'));await app.whenReady();const win=new BrowserWindow({show:false,width:1440,height:1000,webPreferences:{contextIsolation:true,nodeIntegration:false}});const run=s=>win.webContents.executeJavaScript(s);const checks=[];
 const wait=condition=>run(`new Promise((resolve,reject)=>{const end=Date.now()+7000;function check(){if(${condition})return resolve();if(Date.now()>end)return reject(Error(${JSON.stringify(condition)}));setTimeout(check,20)}check()})`);
 const paint=()=>run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
 try{await win.loadFile(path.join(root,'dist/index.html'));await wait('document.querySelectorAll(".production-directory-grid .semi-card").length===6');
 for(const [width,height] of [[1440,1000],[960,680],[600,800]]){win.setContentSize(width,height);await wait(`innerWidth===${width}`);await paint();
 const cards=await run(`Array.from(document.querySelectorAll('.production-directory-grid .semi-card')).map(card=>{const r=card.getBoundingClientRect(),a=card.querySelector('.production-actions').getBoundingClientRect();return {top:r.top,bottom:r.bottom,actionTop:a.top,actionBottom:a.bottom}})`);
 for(const card of cards){for(const peer of cards.filter(p=>Math.abs(p.top-card.top)<2)){assert(Math.abs(peer.bottom-card.bottom)<2,'same-row card bottoms align');assert(Math.abs(peer.actionTop-card.actionTop)<2,'same-row actions align');}}
 assert.equal(await run('document.documentElement.scrollWidth<=innerWidth'),true,'no horizontal overflow');
 const summary=await run(`(()=>{const el=document.querySelector('.production-directory-summary');return {height:el.getBoundingClientRect().height,lineHeight:parseFloat(getComputedStyle(el).lineHeight),overflow:getComputedStyle(el).overflowY}})()`);assert(summary.height<=summary.lineHeight*3+2,'summary is at most three lines');assert.notEqual(summary.overflow,'auto','summary does not create a nested scroll area');
 await fs.writeFile(path.join(evidence,`directory-${width}x${height}.png`),(await win.webContents.capturePage()).toPNG());checks.push({width,height,cards});}
 await run('document.querySelector(".production-directory-grid details summary").click()');await paint();assert.equal(await run('document.querySelector(".production-directory-grid details[open]").textContent.includes("末尾完整内容可查")'),true,'full body available in details');
 await run('document.querySelector(".production-directory-grid .production-actions button").click()');assert.deepEqual(await run('window.opened'),['content-0']);
 await run('document.querySelector(".production-directory-grid details summary").focus()');win.webContents.sendInputEvent({type:'keyDown',keyCode:'Space'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Space'});await wait('!document.querySelector(".production-directory-grid details[open]")');
 await fs.writeFile(path.join(evidence,'receipt.json'),JSON.stringify({passed:true,platform:process.platform,arch:process.arch,syntheticIPC:true,checks,fullBodyAccessible:true,keyboardDetails:true},null,2));await fs.rm(path.join(evidence,'failure.png'),{force:true});console.log('PASS content directory: row/action alignment, three-line summaries, full text, keyboard, original open callback, 1440/960/600 widths');app.exit(0);
 }catch(error){await fs.writeFile(path.join(evidence,'failure.png'),(await win.webContents.capturePage()).toPNG());console.error(error);app.exit(1);}
}
await fs.writeFile(path.join(root,'probe-main.mjs'),`(${probeMain.toString()})(${JSON.stringify(root)},${JSON.stringify(evidence)});`);
const code=await new Promise((resolve,reject)=>{const child=spawn(electron,[path.join(root,'probe-main.mjs')],{stdio:'inherit',env:{...process.env,ELECTRON_RUN_AS_NODE:''}});const timer=setTimeout(()=>child.kill('SIGKILL'),60000);child.once('error',reject);child.once('exit',code=>{clearTimeout(timer);resolve(code)});});
if(code!==0)throw Error('Directory UI probe failed: '+code);
} finally {await fs.rm(root,{recursive:true,force:true});}
