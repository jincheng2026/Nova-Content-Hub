// Actual React/Semi calendar with a synthetic bridge and isolated Electron userData.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import electron from 'electron';
import {build} from 'vite';
import {fileURLToPath} from 'node:url';
const workbench = fileURLToPath(new URL('../', import.meta.url));
const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'nova-overview-layout-')));
await fs.writeFile(path.join(root, 'index.html'), '<html lang="zh-CN"><div id="root"></div><script type="module" src="/probe.jsx"></script></html>');
await fs.writeFile(path.join(root, 'probe.jsx'), `
import {createRoot} from 'react-dom/client';
import '${workbench}/node_modules/@douyinfe/semi-ui-19/react19-adapter';
import '${workbench}/node_modules/@douyinfe/semi-ui-19/lib/es/_base/base.css';
import '${workbench}/src/renderer/style.css';
import {Overview} from '${workbench}/src/renderer/workspace-pages.tsx';
const plan=(id,schedule,channelId='custom-channel')=>({id,schedule,channelId,status:'planned',textMode:'body',coverChoice:null});
const makeDocument=(id,title,plans)=>({id,title,body:'合成验收正文',editToken:'token-1',channelIds:['custom-channel'],plans,deletedAt:null,isExample:false,candidates:[],coverVariants:[],publications:[],publicationEvents:[],candidateCount:0,selectedCandidateId:null});
window.doc=makeDocument('content-a','分钟日程示例',[plan('local-minute',{precision:'local-minute',date:'2026-10-19',time:'10:45',timezone:'America/New_York'}),plan('date-only',{precision:'date',date:'2026-10-19'}),plan('instant',{precision:'instant',at:'2026-10-19T08:35:00Z',timezone:'America/New_York'})]);
window.collection=makeDocument('collection-a','合集演示',[plan('collection-minute',{precision:'local-minute',date:'2026-10-20',time:'14:25',timezone:null},'second-channel')]);window.collection.memberIds=['content-a'];
window.channels=[{id:'custom-channel',name:'演示自定义渠道',ink:'#ad245e',bg:'#fff0f5'},{id:'second-channel',name:'另一个渠道',ink:'#36784e',bg:'#edf8f0'}];
window.library={contentDetails:[window.doc],collections:[window.collection],settings:{channels:window.channels}};
window.workspace={contents:[window.doc],channels:window.channels};window.original=JSON.stringify({library:window.library,workspace:window.workspace});window.calls=[];
window.contentHub=new Proxy({},{get:(_,method)=>async input=>{window.calls.push({method,input});throw new Error('Unexpected native call');}});
window.doc.title='很长的内容标题'.repeat(30);window.doc.updatedAt='2026-10-19';window.doc.plans=[];window.collection.title='很长的合集标题'.repeat(30);window.collection.plans=[];const root=createRoot(document.getElementById('root'));
window.renderCalendar=()=>root.render(<main><aside className="app-navigation">隔离验收</aside><div className="app-stage"><Overview workspace={{...window.workspace}} library={{...window.library}} busy={false} open={()=>{}} openCollection={()=>{}}/></div></main>);
window.renderCalendar();
`);
await build({configFile:false, root, base:'./', resolve:{alias:{react:path.join(workbench,'node_modules/react'),'react-dom':path.join(workbench,'node_modules/react-dom')}}, oxc:{jsx:{runtime:'automatic'}}, build:{outDir:path.join(root,'dist'),modulePreload:false,target:'chrome148'}});
async function probeMain(probeRoot) {
 const {app,BrowserWindow}=await import('electron');const {default:assert}=await import('node:assert/strict');const {default:path}=await import('node:path');const {default:fs}=await import('node:fs/promises');
 app.setPath('userData',path.join(probeRoot,'machine'));await app.whenReady();const win=new BrowserWindow({show:false,width:1440,height:1050,webPreferences:{contextIsolation:true,nodeIntegration:false}});const run=source=>win.webContents.executeJavaScript(source);
 try {await win.loadFile(path.join(probeRoot,'dist/index.html'));await run('new Promise(resolve=>setTimeout(resolve,250))');
 for(const width of [1440,1100,900]) {await win.setSize(width,1050);await run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');await fs.writeFile(path.join(probeRoot,`overview-${width}.png`),(await win.webContents.capturePage()).toPNG());
 const geometry=await run(`(()=>{const cover=document.querySelector('.creator-featured-cover'),small=cover.querySelector('small').getBoundingClientRect(),label=cover.querySelector('strong').getBoundingClientRect();return {placeholder:label.bottom<=small.top,rows:[...document.querySelectorAll('.creator-recent>button')].map(button=>{const box=button.getBoundingClientRect(),image=button.querySelector('.creator-recent-cover').getBoundingClientRect(),title=button.querySelector('strong').getBoundingClientRect();return {box:{left:box.left,right:box.right,top:box.top,bottom:box.bottom},image:{left:image.left,right:image.right,top:image.top,bottom:image.bottom},title:{left:title.left,right:title.right,top:title.top,bottom:title.bottom},fits:image.right<=title.left+1&&title.right<=box.right+1&&image.bottom<=box.bottom+1};}),overflow:document.documentElement.scrollWidth>innerWidth};})()`);
 console.log(width,JSON.stringify(geometry));assert.equal(geometry.placeholder,true,`placeholder labels at ${width}`);assert.equal(geometry.rows.every(row=>row.fits),true,`content image/title at ${width}`);assert.equal(geometry.overflow,false,`bounded page ${width}`);
 }
 await run(`window.doc.candidates=[{id:'candidate',url:'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="90" height="120"><rect width="90" height="120" fill="#dbe9fb"/><rect x="12" y="15" width="66" height="90" rx="8" fill="#6f94ce"/></svg>')}];window.doc.selectedCandidateId='candidate';window.doc.candidateCount=1;window.renderCalendar()`);
 for(const width of [1440,1100,900]) {await win.setSize(width,1050);await run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');assert.equal(await run('document.querySelectorAll(".creator-featured-cover img,.creator-recent-cover img").length'),3,'actual cover images mounted');await fs.writeFile(path.join(probeRoot,`overview-images-${width}.png`),(await win.webContents.capturePage()).toPNG());assert.equal(await run('(()=>{const row=document.querySelectorAll(".creator-recent>button")[1],image=row.querySelector("img").getBoundingClientRect(),title=row.querySelector("strong").getBoundingClientRect();return image.right<=title.left&&document.documentElement.scrollWidth<=innerWidth;})()'),true,'images remain bounded');}
 console.log('PASS actual React/Semi/Electron overview: long titles, missing images, bounded placeholder/content rows at 1440/1100/900. Screenshots:',probeRoot);app.exit(0);
 }catch(error){console.error(error);console.log('Evidence:',probeRoot);app.exit(1);}}
await fs.writeFile(path.join(root,'probe-main.mjs'),`(${probeMain.toString()})(${JSON.stringify(root)});`);const child=spawn(electron,[path.join(root,'probe-main.mjs')],{stdio:'inherit',env:{...process.env,ELECTRON_RUN_AS_NODE:''}});process.exitCode=await new Promise(resolve=>child.on('exit',code=>resolve(code??1)));console.log('Probe fixture:',root);
