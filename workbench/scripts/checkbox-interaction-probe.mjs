// Trusted native input against isolated real React/Semi components; no user-library IPC.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import electron from 'electron';
import {build} from 'vite';
const workbench = fileURLToPath(new URL('../', import.meta.url));
const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'nova-checkbox-interaction-')));
try {
  await fs.writeFile(path.join(root, 'index.html'), '<html lang="zh-CN"><div id="root"></div><script type="module" src="/probe.jsx"></script></html>');
  await fs.writeFile(path.join(root, 'probe.jsx'), `
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import '${workbench}/node_modules/@douyinfe/semi-ui-19/react19-adapter';
import '${workbench}/node_modules/@douyinfe/semi-ui-19/lib/es/_base/base.css';
import '${workbench}/src/renderer/style.css';
import Checkbox from '${workbench}/node_modules/@douyinfe/semi-ui-19/lib/es/checkbox';
import {CoverPanel} from '${workbench}/src/renderer/covers.tsx';
import {CollectionEditor,ContentMetadataPanel} from '${workbench}/src/renderer/library-panels.tsx';
import {PreferencesPanel} from '${workbench}/src/renderer/preferences-panel.tsx';
const image='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="navy"/></svg>');
const content={id:'content',title:'原生复选交互',body:'正文',editToken:'v1'};
const candidates=['a','b'].map(id=>({id,requestId:'r',attemptId:'t',url:image,assetHash:id,originalName:id+'.png',accepted:false}));
const details={...content,deletedAt:null,channelIds:['channel'],recordedDate:null,plannedDate:null,preferredTemplateId:null,isExample:false,materials:[{id:'material',originalName:'参考资料.txt',detectedType:'text/plain',bytes:10,availability:'available',assetHash:'material'}],coverVariants:[],candidates:candidates.map((c,i)=>({...c,favorite:i===0,note:'',displayNumber:'',variantId:null}))};
const assets={templates:[{id:'template',version:1,name:'测试模板',description:'测试',samples:[{assetHash:'sample',url:image}]}],photos:[]};
const library={contentDetails:[details],templates:assets.templates,photos:[],settings:{editToken:'s1',channels:[{id:'channel',name:'测试渠道',deletedAt:null}],defaults:{templateId:'template',photoId:'',coverCount:1},customRatios:[]}};
const cover={content,candidates,selectedCandidateId:null,jobs:[{id:'r',activeAttemptId:null,summary:{template:{id:'template',version:1},styleSampleCount:1,hasOwnPhoto:false,count:2,ratio:'3:4',sizePolicy:'ratio-minimum',pixels:{width:768,height:1024},outputFormat:'png'},attempts:[]}]};
const ok=value=>({ok:true,value});window.calls=[];window.errors=[];window.addEventListener('error',e=>window.errors.push(e.message));window.clicks=[];document.addEventListener('click',e=>window.clicks.push({trusted:e.isTrusted,tag:e.target.tagName}),true);
window.contentHub={listCoverAssets:async()=>ok(assets),readCover:async()=>ok(cover),mutateWorkspace:async input=>{window.calls.push(input);return ok({library})},readPreferences:async()=>ok({values:{remindersEnabled:false,reminderTime:'09:00',reducedMotion:false,startAtLogin:false},login:{state:'off',supported:true,enabled:false}}),readReminderStatus:async()=>ok({state:'disabled',supported:true})};
const props={library,busy:false,refresh:async()=>{},run:async action=>{try{return await action()}catch(e){window.errors.push(e.message)}}};
function Legacy(){const [checked,setChecked]=useState(true);return <label id="legacy"><Checkbox checked={checked} onChange={e=>setChecked(!!e.target.checked)}/><span>旧版外层标签</span></label>}
function Fixture({kind}){if(kind==='legacy')return <Legacy/>;if(kind==='collection')return <CollectionEditor props={props} collection={{id:'col',title:'合集',body:'',editToken:'v1',channelIds:['channel'],dateRange:{start:null,end:null}}} close={()=>{}}/>;if(kind==='metadata')return <ContentMetadataPanel {...props} contentId="content"/>;if(kind==='preferences')return <PreferencesPanel {...props}/>;return <CoverPanel {...props} status={{currentName:'fixture',assistant:'codex'}} content={content} dirty={false} blocked={false} refreshToken={0} readAutomatically={async()=>({assets,cover})} onContent={()=>{}}/>}
const root=createRoot(document.getElementById('root'));window.mount=kind=>root.render(<Fixture key={kind} kind={kind}/>);window.mount('legacy');
`);
  await build({configFile:false,root,base:'./',resolve:{alias:{react:path.join(workbench,'node_modules/react'),'react-dom':path.join(workbench,'node_modules/react-dom')}},oxc:{jsx:{runtime:'automatic'}},build:{outDir:path.join(root,'dist'),modulePreload:false,target:'chrome148'}});
  async function probeMain(probeRoot) {
    const {app,BrowserWindow}=await import('electron');const {default:assert}=await import('node:assert/strict');const {default:path}=await import('node:path');
    app.setPath('userData',path.join(probeRoot,'machine'));await app.whenReady();
    const win=new BrowserWindow({show:true,width:1280,height:1000,webPreferences:{contextIsolation:true,nodeIntegration:false}});
    const run=source=>win.webContents.executeJavaScript(source);
    const flush=()=>run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    const wait=condition=>run(`new Promise((resolve,reject)=>{const end=Date.now()+5000;const check=()=>{if(${condition})return resolve(true);if(Date.now()>end)return reject(new Error('Timeout: '+${JSON.stringify(condition)}));setTimeout(check,20)};check()})`);
    const nativeClick=async selector=>{const point=await run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw new Error('Missing '+${JSON.stringify(selector)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);win.focus();win.webContents.focus();win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...point});win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...point});await flush()};
    const roundtrip=async(selector,checked=false)=>{assert.equal(await run(`document.querySelector(${JSON.stringify(selector+' input')}).checked`),checked);for(const target of [selector+' .semi-checkbox-addon',selector+' .semi-checkbox-inner-display',selector+' input']){await nativeClick(target);assert.equal(await run(`document.querySelector(${JSON.stringify(selector+' input')}).checked`),!checked,target+' toggles once');await nativeClick(target);assert.equal(await run(`document.querySelector(${JSON.stringify(selector+' input')}).checked`),checked,target+' toggles back')}};
    try {
      await win.loadFile(path.join(probeRoot,'dist/index.html'));await wait('document.querySelector("#legacy input")');
      await run('document.querySelector("#legacy input").click()');await flush();assert.equal(await run('document.querySelector("#legacy input").checked'),false,'old DOM input.click passes');
      await nativeClick('#legacy .semi-checkbox-inner-display');assert.equal(await run('document.querySelector("#legacy input").checked'),false,'legacy visual-box native click double-activates and cannot toggle');console.log('REPRODUCED: legacy DOM input.click toggles, trusted visual-box click double-activates');
      await run('window.mount("cover")');await wait('document.querySelectorAll(".cover-result-card").length===2');
      await roundtrip('.cover-gallery-toolbar .checkbox');await roundtrip('.cover-card-title .checkbox');
      await nativeClick('.cover-result-actions button:nth-child(3)');await wait('document.querySelector(".management-dialog[open]")');
      await roundtrip('.management-dialog .checkbox',true);
      await run('document.querySelector(".management-dialog textarea").focus()');win.webContents.insertText('保留草稿');await flush();
      await run('[...document.querySelectorAll(".management-dialog button")].find(e=>e.textContent==="暂时收起").click()');await wait('document.querySelector(".management-resume")');
      await roundtrip('.cover-gallery-toolbar .checkbox');assert.equal(await run('window.calls.length'),0,'filter and comparisons never write');await run('[...document.querySelectorAll(".management-resume button")].find(e=>e.textContent==="继续编辑").click()');await wait('document.querySelector(".management-dialog[open] textarea")');assert.equal(await run('document.querySelector(".management-dialog textarea").value'),'保留草稿','filter roundtrips preserve minimized candidate draft');
      await run('window.mount("cover2")');await wait('document.querySelectorAll(".cover-result-card").length===2');
      await run('[...document.querySelectorAll(".cover-toolbar button")].find(e=>e.textContent==="再生成一批").click()');await wait('document.querySelector(".cover-create-dialog[open]")');
      await run('document.querySelector(".cover-style-details").open=true;document.querySelector(".cover-photo-import").open=true;document.querySelector(".cover-advanced").open=true');await flush();
      await roundtrip('.cover-sample-grid .semi-checkbox',true);await nativeClick('.cover-sample-art');assert.equal(await run('document.querySelector(".cover-sample-grid input").checked'),false,'sample image toggles off');await nativeClick('.cover-sample-art');assert.equal(await run('document.querySelector(".cover-sample-grid input").checked'),true,'sample image toggles back');await roundtrip('.cover-photo-import .checkbox');await roundtrip('.cover-materials .checkbox');
      for(const kind of ['collection','metadata']){await run(`window.mount(${JSON.stringify(kind)})`);await wait('document.querySelector(".check-label .semi-checkbox")');await roundtrip('.check-label',true)}
      await run('window.mount("preferences")');await wait('document.querySelector("input[role=switch]")');
      await nativeClick('.creator-preference-row:first-child > span');assert.equal(await run('document.querySelector("input[role=switch]").checked'),true);await nativeClick('.creator-preference-row:first-child > span');assert.equal(await run('document.querySelector("input[role=switch]").checked'),false);
      assert.equal(await run('window.calls.length'),0);assert.deepEqual(await run('window.errors'),[]);assert.equal(await run('window.clicks.some(e=>e.trusted)'),true);
      console.log('PASS trusted Electron box/text true→false→true roundtrips: favorites filter, compare, candidate favorite, template sample, own-photo, material, collection and content channels; minimized drafts keep filter usable; preference switches roundtrip. No real library writes.');app.exit(0);
    }catch(error){console.error(error);console.error(await run('JSON.stringify({text:document.body.textContent,errors:window.errors})'));app.exit(1)}
  }
  await fs.writeFile(path.join(root,'main.mjs'),`(${probeMain.toString()})(${JSON.stringify(root)})`);
  await new Promise((resolve,reject)=>{const child=spawn(electron,[path.join(root,'main.mjs')],{env:process.env,stdio:'inherit'});const timer=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('Checkbox probe timeout'))},45000);child.once('error',reject);child.once('close',code=>{clearTimeout(timer);code===0?resolve():reject(new Error('Checkbox probe failed: '+code))})});
}finally{await fs.rm(root,{recursive:true,force:true})}
