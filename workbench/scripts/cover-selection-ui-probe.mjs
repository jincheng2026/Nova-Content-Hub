// Real CoverPanel and Semi controls with an isolated bridge; never opens a user library.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import electron from 'electron';
import {build} from 'vite';
const workbench = fileURLToPath(new URL('../', import.meta.url));
const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'nova-cover-selection-')));
await fs.writeFile(path.join(root, 'index.html'), '<html lang="zh-CN"><div id="root"></div><script type="module" src="/probe.jsx"></script></html>');
await fs.writeFile(path.join(root, 'probe.jsx'), `
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import '${workbench}/node_modules/@douyinfe/semi-ui-19/react19-adapter';
import '${workbench}/node_modules/@douyinfe/semi-ui-19/lib/es/_base/base.css';
import '${workbench}/src/renderer/style.css';
import {CoverPanel} from '${workbench}/src/renderer/covers.tsx';
window.errors=[];window.calls=[];window.addEventListener('error',e=>window.errors.push(e.message));
const content={id:'content-one',title:'选择回归',body:'已保存正文',editToken:'v1'};
const photo=(id,title)=>({id,title,isOwnPhoto:true,availability:'available',assetHash:id,deletedAt:null});
const photos=[photo('photo-a','本人照片甲'),photo('photo-b','本人照片乙'),...Array.from({length:10},(_,i)=>photo('extra-'+i,'其他本人照片'+i)),{...photo('not-own','未声明照片'),isOwnPhoto:false}];
const assets={photos,templates:[{id:'template',name:'参考模板',version:1,samples:[{assetHash:'sample',url:''}]}]};
const cover={content,candidates:[],jobs:[],selectedCandidateId:null};
const initialLibrary={settings:{defaults:{photoId:'photo-a',templateId:'template',coverCount:2},customRatios:['2:3']},photos,templates:[{id:'template',deletedAt:null}],contentDetails:[{...content,materials:[],candidates:[],coverVariants:[]}]};
window.contentHub={listCoverAssets:async()=>({ok:true,value:assets}),readCover:async()=>({ok:true,value:cover}),generateCover:async input=>{window.calls.push(input);return {ok:true,value:{...cover,launchRequested:false}}}};
function Fixture(){const [busy,setBusy]=useState(false),[library,setLibrary]=useState(initialLibrary),[refreshToken,setRefreshToken]=useState(0);window.refreshFixture=()=>{setLibrary({...initialLibrary});setRefreshToken(t=>t+1)};return <CoverPanel library={library} status={{currentName:'回归库',assistant:'codex'}} content={content} dirty={false} busy={busy} blocked={false} refreshToken={refreshToken} startOpenKey={1} readAutomatically={async()=>({assets,cover})} run={async action=>{setBusy(true);try{return await action()}catch(e){window.errors.push(e.message)}finally{setBusy(false)}}} onContent={()=>{}}/>}
createRoot(document.getElementById('root')).render(<Fixture/>);
`);
await build({configFile:false,root,base:'./',resolve:{alias:{react:path.join(workbench,'node_modules/react'),'react-dom':path.join(workbench,'node_modules/react-dom')}},oxc:{jsx:{runtime:'automatic'}},build:{outDir:path.join(root,'dist'),modulePreload:false,target:'chrome148'}});
async function main(root) {
  const {app,BrowserWindow}=await import('electron');
  const {default:assert}=await import('node:assert/strict');
  const {default:fs}=await import('node:fs/promises');
  const {default:path}=await import('node:path');
  app.setPath('userData',path.join(root,'machine'));await app.whenReady();
  const win=new BrowserWindow({show:true,width:1280,height:860,webPreferences:{contextIsolation:true,nodeIntegration:false}});
  const run=source=>win.webContents.executeJavaScript(source);
  const flush=()=>run('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  const wait=condition=>run(`new Promise((resolve,reject)=>{const end=Date.now()+4000;const check=()=>{if(${condition})return resolve();if(Date.now()>end)return reject(Error(${JSON.stringify(condition)}));setTimeout(check,20)};check()})`);
  const click=async selector=>{
    await run(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',behavior:'instant'})`);await flush();
    const point=await run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);
    win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...point});
    win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...point});await flush();
  };
  const select=async(id,label,search='')=>{
    await click('#'+id);await wait('!!document.querySelector(".semi-select-option")');
    if(id==='cover-ratio')assert.equal(await run('document.querySelector("#cover-ratio input")===null && [...document.querySelectorAll(".semi-select-option")].every(e=>e.style.position!=="absolute")'),true,'short ratio menu has plain options and no search draft');
    if(search){await run(`document.querySelector('#'+${JSON.stringify(id)}+' input').focus()`);win.webContents.insertText(search);await flush();}
    await run(`(()=>{document.querySelectorAll('[data-probe-option]').forEach(e=>delete e.dataset.probeOption);const e=[...document.querySelectorAll('.semi-select-option')].find(e=>e.textContent===${JSON.stringify(label)});if(!e)throw Error('Missing option');e.dataset.probeOption='chosen'})()`);
    await wait(`(()=>{const e=document.querySelector('[data-probe-option="chosen"]'),r=e?.getBoundingClientRect();return r?.x>=0&&r.y>=0&&r.bottom<innerHeight&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('.semi-select-option')===e})()`);await click('[data-probe-option="chosen"]');
    await wait('!document.querySelector(".semi-select-option")');
  };
  try {
    await win.loadFile(path.join(root,'dist/index.html'));await wait('!!document.querySelector("#cover-ratio") && document.querySelector("#cover-photo")?.textContent.includes("本人照片甲")');
    await select('cover-ratio','16:9');assert.match(await run('document.querySelector(".cover-size-hint").textContent'),/^16:9/,'trusted click changes ratio');
    await click('#cover-ratio');await wait('!!document.querySelector(".semi-select-option")');win.webContents.sendInputEvent({type:'keyDown',keyCode:'Up'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Up'});win.webContents.sendInputEvent({type:'keyDown',keyCode:'Return'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Return'});await flush();assert.match(await run('document.querySelector(".cover-size-hint").textContent'),/^1:1/,'native keyboard changes ratio again');
    await select('cover-photo','本人照片乙','本人照片乙');assert.match(await run('document.querySelector("#cover-photo").textContent'),/本人照片乙/,'trusted click changes person');
    await select('cover-photo','本人照片甲','本人照片甲');assert.match(await run('document.querySelector("#cover-photo").textContent'),/本人照片甲/,'trusted click changes person again');
    await select('cover-ratio','16:9');assert.match(await run('document.querySelector(".cover-size-hint").textContent'),/^16:9/,'ratio can return to an earlier choice');await select('cover-photo','本人照片乙','本人照片乙');assert.match(await run('document.querySelector("#cover-photo").textContent'),/本人照片乙/,'person can return to an earlier choice');
    await click('#cover-photo');await wait('!!document.querySelector("#cover-photo input")');win.webContents.insertText('未声明照片');await flush();await wait('[...document.querySelectorAll(".semi-select-option")].some(e=>e.textContent.includes("未声明照片"))');assert.equal(await run('[...document.querySelectorAll(".semi-select-option")].find(e=>e.textContent.includes("未声明照片"))?.getAttribute("aria-disabled")'),'true','unconfirmed person stays disabled with visible reason');assert.match(await run('[...document.querySelectorAll(".semi-select-option")].find(e=>e.textContent.includes("未声明照片")).textContent'),/未声明为本人/);win.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});await flush();
    await run('window.refreshFixture()');await flush();assert.match(await run('document.querySelector(".cover-size-hint").textContent'),/^16:9/,'refresh preserves explicit ratio');assert.match(await run('document.querySelector("#cover-photo").textContent'),/本人照片乙/,'refresh preserves explicit person');
    await click('#generate-cover');await wait('window.calls.length===1');assert.equal(await run('window.calls[0].input.ratio'),'16:9');assert.equal(await run('window.calls[0].input.photo.id'),'photo-b');assert.deepEqual(await run('window.errors'),[]);
    console.log('PASS: short ratio mouse/keyboard changes, long person search/rechange, disabled reason, refresh retention and generated payload');
    app.exit(0);
  } catch(error) {await fs.writeFile(path.join(root,'failure.png'),(await win.webContents.capturePage()).toPNG());console.error(error);console.error(await run('JSON.stringify({errors:window.errors,ratio:document.querySelector("#cover-ratio")?.outerHTML,photo:document.querySelector("#cover-photo")?.outerHTML,popup:[...document.querySelectorAll(".semi-select-option")].map(e=>e.textContent)})'));app.exit(1)}
}
await fs.writeFile(path.join(root,'main.mjs'),`(${main.toString()})(${JSON.stringify(root)});`);
const child=spawn(electron,[path.join(root,'main.mjs')],{stdio:'inherit',env:{...process.env,ELECTRON_RUN_AS_NODE:''}});
process.exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve)});
console.log('Probe fixture:',root);
