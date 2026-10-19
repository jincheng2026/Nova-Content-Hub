// Real React/Semi with synthetic read-only fixtures; no native business writes.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import electron from 'electron';
import {build} from 'vite';
import {fileURLToPath} from 'node:url';
const workbench=fileURLToPath(new URL('../', import.meta.url));
const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'nova-content-channels-check-')));
await fs.writeFile(path.join(root,'index.html'),'<html lang="zh-CN"><div id="root"></div><script type="module" src="/probe.jsx"></script></html>');
await fs.writeFile(path.join(root,'probe.jsx'),`
import {createRoot} from 'react-dom/client';
import '${workbench}/node_modules/@douyinfe/semi-ui-19/react19-adapter';
import '${workbench}/node_modules/@douyinfe/semi-ui-19/lib/es/_base/base.css';
import '${workbench}/src/renderer/style.css';
import {ContentList} from '${workbench}/src/renderer/content-list.tsx';
const plan=(id,channelId,status='planned')=>({id,channelId,status,schedule:{precision:'date',date:'2026-10-19'}});
const makeContent=(id,channelIds,plans)=>({id,title:id,body:'',channelIds,plans,deletedAt:null,isExample:false,candidates:[],coverVariants:[],publications:[],publicationEvents:[],candidateCount:0,selectedCandidateId:null});
window.documents=[makeContent('empty-metadata',[],[plan('dy-1','douyin'),plan('dy-2','douyin'),plan('cancelled','cancelled-channel','cancelled')]),makeContent('explicit-metadata',['xiaohongshu','douyin'],[plan('dy-3','douyin')]),makeContent('historical-channel',['missing-channel'],[]),makeContent('cancelled-only',[],[plan('cancelled-2','cancelled-channel','cancelled')])];
window.channels=[{id:'douyin',name:'抖音'},{id:'xiaohongshu',name:'小红书'},{id:'cancelled-channel',name:'已取消的渠道'}];
window.library={contentDetails:window.documents,collections:[],settings:{channels:window.channels}};
window.workspace={contents:window.documents,channels:window.channels};
window.original=JSON.stringify({library:window.library,workspace:window.workspace});
window.calls=[]; window.contentHub=new Proxy({},{get:(_,method)=>async input=>{window.calls.push({method,input});throw new Error('Unexpected native call');}});
const root=createRoot(document.getElementById('root'));
window.renderList=library=>root.render(<ContentList contents={window.documents} workspace={window.workspace} library={library} query="" setQuery={()=>{}} view="active" busy={false} blocked={false} ready={true} changeView={()=>{}} create={()=>{}} open={()=>{}} recycle={()=>{}}/>);
window.renderList(window.library);
`);
await build({configFile:false,root,base:'./',resolve:{alias:{react:path.join(workbench,'node_modules/react'),'react-dom':path.join(workbench,'node_modules/react-dom')}},oxc:{jsx:{runtime:'automatic'}},build:{outDir:path.join(root,'dist'),modulePreload:false,target:'chrome148'}});
async function probeMain(probeRoot){
const {app,BrowserWindow}=await import('electron');const {default:assert}=await import('node:assert/strict');const {default:path}=await import('node:path');
app.setPath('userData',path.join(probeRoot,'machine'));await app.whenReady();const win=new BrowserWindow({show:false,width:1440,height:1000,webPreferences:{contextIsolation:true,nodeIntegration:false}});
win.webContents.on('console-message',event=>console.log('renderer:',event.message)); const run=source=>win.webContents.executeJavaScript(source);const wait=condition=>run(`new Promise((resolve,reject)=>{const end=Date.now()+5000;const check=()=>{if(${condition})return resolve(true);if(Date.now()>end)return reject(new Error('State timeout: '+${JSON.stringify(condition)}+' / '+document.body.innerText.slice(0,600)));setTimeout(check,15)};check()})`);
const channelLabels=id=>run(`[...document.querySelector('[data-content-id="'+${JSON.stringify(id)}+'"] .content-channel-list').children].map(item=>item.textContent)`);
try{
await win.loadFile(path.join(probeRoot,'dist/index.html'));await wait('document.querySelectorAll("tbody tr").length === 4');
assert.deepEqual(await channelLabels('empty-metadata'),['抖音'],'empty metadata still shows its valid plan channel, deduplicated');
assert.deepEqual(await channelLabels('explicit-metadata'),['小红书','抖音'],'explicit metadata and plan channels are merged without duplicates');
assert.deepEqual(await channelLabels('historical-channel'),['原渠道已不可用'],'unavailable historical channel keeps its existing label');
assert.deepEqual(await channelLabels('cancelled-only'),['未选择渠道'],'cancelled plans do not contribute a display channel');
assert.equal(await run('document.querySelector(".content-channel-list").textContent.includes("已取消的渠道")'),false);
assert.equal(await run('JSON.stringify({library:window.library,workspace:window.workspace}) === window.original'),true,'render does not mutate library or workspace');
assert.deepEqual(await run('window.calls'),[],'render never invokes native mutations');
await run('window.renderList(null)');await run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
assert.deepEqual(await channelLabels('empty-metadata'),['抖音'],'summary-only fallback still uses non-cancelled plan channels');
assert.deepEqual(await channelLabels('cancelled-only'),['未选择渠道']);
console.log('PASS: React/Semi content channel union, empty metadata fallback, cancelled exclusion, metadata preservation, deduplication, unavailable label, summary-only fallback, and no writes');app.exit(0);
}catch(error){console.error(error);app.exit(1);}}
await fs.writeFile(path.join(root,'probe-main.mjs'),`(${probeMain.toString()})(${JSON.stringify(root)});`);
const child=spawn(electron,[path.join(root,'probe-main.mjs')],{stdio:'inherit',env:{...process.env,ELECTRON_RUN_AS_NODE:''}});const code=await new Promise(resolve=>child.on('exit',resolve));console.log('Probe fixture:',root);process.exitCode=code??1;
