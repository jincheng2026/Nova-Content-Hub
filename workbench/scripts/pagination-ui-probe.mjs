// Actual React/Semi components in isolated Electron; synthetic data never reaches the native bridge.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import electron from 'electron';
import {build} from 'vite';
import {fileURLToPath} from 'node:url';
const workbench=fileURLToPath(new URL('../',import.meta.url));
const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'nova-pagination-ui-')));
const baseline=process.argv.includes('--baseline');
await fs.writeFile(path.join(root,'index.html'),'<html lang="zh-CN"><div id="root"></div><script type="module" src="/probe.jsx"></script></html>');
await fs.writeFile(path.join(root,'probe.jsx'),`
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import '${workbench}/node_modules/@douyinfe/semi-ui-19/react19-adapter';
import '${workbench}/node_modules/@douyinfe/semi-ui-19/lib/es/_base/base.css';
import '${workbench}/src/renderer/style.css';
import '${workbench}/src/renderer/workspace-management.css';
import '${workbench}/src/renderer/creator-pages.css';
import {ContentList} from '${workbench}/src/renderer/content-list.tsx';
import {MembersEditor} from '${workbench}/src/renderer/library-panels.tsx';
import {DataTable} from '${workbench}/src/renderer/list-primitives.tsx';
import LocaleProvider from '${workbench}/node_modules/@douyinfe/semi-ui-19/lib/es/locale/localeProvider';
import zhCN from '${workbench}/node_modules/@douyinfe/semi-ui-19/lib/es/locale/source/zh_CN';
const noop=()=>{},make=(id)=>({id,title:'合成验收 '+id,body:'正文',updatedAt:'2026-10-20',editToken:'token',channelIds:[],plans:[],deletedAt:null,isExample:false,candidates:[],coverVariants:[],publications:[],publicationEvents:[],candidateCount:0,selectedCandidateId:null});
window.calls=[];window.contentHub=new Proxy({},{get:(_,method)=>async input=>{window.calls.push({method,input});throw new Error('Unexpected native call');}});
const contents=Array.from({length:154},(_,i)=>make('content-'+i)),collections=Array.from({length:54},(_,i)=>({...make('collection-'+i),memberIds:[]}));
const library={contentDetails:contents,collections,settings:{channels:[]}},workspace={contents,channels:[]};window.original=JSON.stringify({library,workspace});
const root=createRoot(document.getElementById('root'));window.options={total:2000,page:1,pageSize:20,disabled:false,width:380,mode:'controls'};
function App(){const [page,setPage]=useState(window.options.page),[pageSize,setPageSize]=useState(window.options.pageSize);window.currentPage=page;window.currentPageSize=pageSize;return <LocaleProvider locale={zhCN}>{window.options.mode==='members'?<MembersEditor collection={collections[0]} props={{library,busy:window.options.disabled,run:async action=>action(),refresh:async()=>{}}} close={noop}/>:window.options.mode==='content'?<main><aside className="app-navigation">隔离验收</aside><div className="app-stage"><ContentList contents={contents} workspace={workspace} library={library} query="" setQuery={noop} view="active" busy={false} blocked={false} ready changeView={noop} create={noop} createCollection={noop} openCollection={noop} open={noop} recycle={noop}/></div></main>:<div style={{padding:24}}><section className="workspace-management" style={{width:window.options.width,maxWidth:'100%',padding:12,background:'white',border:'1px solid #ddd'}}><h3>共享分页 · 容器 {window.options.width}px</h3><form onSubmit={event=>{event.preventDefault();window.submits=(window.submits??0)+1;}}><DataTable rows={window.options.total ? [{id:'row',title:'合成数据'}] : []} columns={[{title:'内容',dataIndex:'title'}]} hideExpandedColumn expandedRowKeys={['row']} expandedRowRender={()=> <p data-probe-detail>自有详情仍可展开</p>} total={window.options.total} page={page} pageSize={pageSize} onPageSizeChange={setPageSize} onPageChange={value=>{window.events.push(value);setPage(value);}} label="验收分页" disabled={window.options.disabled}/><button type="submit" hidden>保存</button></form></section></div>}</LocaleProvider>};
window.events=[];window.renderProbe=(options={})=>{window.options={...window.options,...options};root.render(<App key={window.renderVersion=(window.renderVersion??0)+1}/>)};window.dataUnchanged=()=>JSON.stringify({library,workspace})===window.original;window.renderProbe();
`);
await build({configFile:false,root,base:'./',resolve:{alias:{react:path.join(workbench,'node_modules/react'),'react-dom':path.join(workbench,'node_modules/react-dom')}},oxc:{jsx:{runtime:'automatic'}},build:{outDir:path.join(root,'dist'),modulePreload:false,target:'chrome148'}});
async function probeMain(probeRoot,baseline){
 const {app,BrowserWindow}=await import('electron'),{default:assert}=await import('node:assert/strict'),{default:path}=await import('node:path'),{default:fs}=await import('node:fs/promises');
 app.setPath('userData',path.join(probeRoot,'machine'));await app.whenReady();const win=new BrowserWindow({show:false,width:1440,height:1050,webPreferences:{contextIsolation:true,nodeIntegration:false}}),run=source=>win.webContents.executeJavaScript(source);
 const settle=()=>run('new Promise(resolve=>setTimeout(resolve,120))');
 const render=async options=>{await run(`window.renderProbe(${JSON.stringify(options)})`);await settle();};
 const shot=async name=>fs.writeFile(path.join(probeRoot,name+'.png'),(await win.webContents.capturePage()).toPNG());
 const geometry=()=>run(`(()=>{const rect=e=>{const b=e.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width,height:b.height}};return [...document.querySelectorAll('.pagination-bar')].map(nav=>{const list=nav.querySelector('.semi-page'),input=nav.querySelector('.semi-page-quickjump input'),quick=nav.querySelector('.semi-page-quickjump'),items=[...nav.querySelectorAll('.semi-page-item')],n=rect(nav),i=input&&rect(input),q=quick&&rect(quick);return {nav:n,list:list&&rect(list),quick:q,input:i,inputStyle:input&&{border:getComputedStyle(input).borderWidth,padding:getComputedStyle(input).padding,background:getComputedStyle(input).backgroundColor},items:items.map(rect),fits:[...items,...(quick?[quick]:[]),...nav.querySelectorAll('.semi-page-switch')].every(e=>{const b=rect(e);return b.left>=n.left-1&&b.right<=n.right+1}),count:nav.querySelector('[role=status]').textContent};});})()`);
 try{await win.loadFile(path.join(probeRoot,'dist/index.html'));await settle();await run(`window.keyboardTrace=[];for(const type of ['keydown','keyup','focusin','focusout'])document.addEventListener(type,e=>window.keyboardTrace.push({type,key:e.key,keyCode:e.keyCode,trusted:e.isTrusted,target:e.target.className,focused:document.hasFocus(),expanded:document.querySelector('.semi-page-switch .semi-select')?.getAttribute('aria-expanded'),option:document.querySelector('.semi-select-option-focused')?.textContent}),true)`);
 assert.equal(await run('document.querySelectorAll(".semi-table-expand-icon").length'),0,'hidden expand column has no default icon');assert.equal(await run('!!document.querySelector("[data-probe-detail]")'),true,'controlled expanded content remains');
 if(baseline){await shot('baseline-controls-380');await render({mode:'content'});await shot('baseline-content-1440');console.log('BASELINE content',JSON.stringify(await geometry()));await render({mode:'controls',width:380});console.log('BASELINE controls',JSON.stringify(await geometry()));await render({total:0});await shot('baseline-empty');console.log('BASELINE empty input count',await run('document.querySelectorAll(".pagination-bar .semi-page-quickjump input").length'));console.log('Evidence:',probeRoot);app.exit(0);return;}
 for(const width of [1440,1100,960,560]){win.setSize(width,1050);await render({mode:'content'});await shot('content-'+width);await run('[...document.querySelectorAll(".pagination-bar")].at(-1).scrollIntoView({block:"end"})');await settle();await shot('content-bottom-'+width);const boxes=await geometry();assert.equal(boxes.length,2,'both content pagers');assert.ok(boxes.every(box=>box.fits),'content pagination bounded '+width);assert.equal(await run('document.documentElement.scrollWidth<=innerWidth'),true,'content document bounded '+width);}
 win.setSize(1440,1050);
 for(const width of [1000,560,380,280]){await render({mode:'controls',width,total:2000,page:48,pageSize:20});await shot('container-'+width);const boxes=await geometry();assert.ok(boxes.every(box=>box.fits&&box.nav.width<=width-24),'container pagination bounded '+width);assert.equal(boxes[0].inputStyle.border,'0px','native border removed');assert.ok(boxes[0].input.height<=32,'jump input remains inside Semi control');}
 for(const total of [0,1,12,20]){await render({total,page:1,pageSize:20});assert.equal(await run('[...document.querySelectorAll(".pagination-bar .semi-page-item,.pagination-bar .semi-page-quickjump")].some(e=>e.getBoundingClientRect().height>0)'),false,'no idle page controls '+total);assert.equal(await run('document.querySelectorAll(".pagination-bar .semi-page-switch .semi-select").length'),1,'single page retains size choice');assert.match((await geometry())[0].count,new RegExp('共 '+total+' 项'));await shot('total-'+total);}await shot('empty-or-single');
 for(const pageSize of [20,50,100]){await render({total:pageSize*3,page:99,pageSize});assert.match((await geometry())[0].count,new RegExp((pageSize*2+1)+'–'+pageSize*3));assert.equal(await run('document.querySelector("[aria-current=page]").textContent'),'3','legal upper clamp');await render({page:-2});assert.equal(await run('document.querySelector("[aria-current=page]").textContent'),'1','legal lower clamp');}
 const waitFor=condition=>run(`new Promise((resolve,reject)=>{const end=Date.now()+3000;const check=()=>{if(${condition})return resolve();if(Date.now()>end)return reject(Error('Keyboard precondition '+${JSON.stringify(condition)}+'; '+JSON.stringify(window.keyboardTrace)));setTimeout(check,15)};check()})`);
 const press=value=>{win.webContents.sendInputEvent({type:'keyDown',keyCode:value});win.webContents.sendInputEvent({type:'keyUp',keyCode:value});};
 const popupContexts=new Set();
 const chooseSize=async(size,label='验收分页',keyboard=false)=>{
   const trigger='nav[aria-label="'+label+'"] .semi-page-switch .semi-select';
   if(keyboard){
     win.show();if(process.platform==='darwin')app.focus({steal:true});win.focus();
     const focusDeadline=Date.now()+5000;
     while(!win.isFocused()&&Date.now()<focusDeadline)await new Promise(resolve=>setTimeout(resolve,25));
     assert.equal(win.isFocused(),true,'native window focused before keyboard');
     win.webContents.focus();await waitFor('document.hasFocus()');
     await run(`(()=>{const el=document.querySelector(${JSON.stringify(trigger)});el.scrollIntoView({block:'center'});el.focus();})()`);
     await waitFor(`document.activeElement===document.querySelector(${JSON.stringify(trigger)})`);
     press('Enter');await waitFor(`document.querySelector(${JSON.stringify(trigger)}).getAttribute('aria-expanded')==='true'`);
     assert.match(await run('document.querySelector(".semi-select-option-focused").textContent'),/20/,'keyboard starts on selected size');
     for(let i=0;i<[20,50,100].indexOf(size);i++){press('Down');await waitFor(`document.querySelector('.semi-select-option-focused')?.textContent.includes('${[20,50,100][i+1]}')`);}
     press('Enter');await waitFor('window.currentPageSize==='+size);
     assert.equal(await run('window.keyboardTrace.some(e=>e.type==="keydown"&&e.key==="ArrowDown"&&e.keyCode===40&&e.trusted)'),true,'real Down event delivered');
   }else{
     await run(`document.querySelector(${JSON.stringify(trigger)}).scrollIntoView({block:'center'})`);await settle();
     const b=await run(`(()=>{const r=document.querySelector(${JSON.stringify(trigger)}).getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);
     win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...b});win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...b});await settle();
     await shot('page-size-popup');
     const popup=await run(`(()=>{const el=document.querySelector('.semi-page-select-dropdown'),style=getComputedStyle(el);return {radius:style.borderRadius,overflow:style.overflow,tag:el.tagName};})()`);
     assert.ok(parseFloat(popup.radius)>0&&['hidden','clip'].includes(popup.overflow),'page-size dropdown clips rectangular option backgrounds at its rounded border: '+JSON.stringify(popup));
     const context=label==='合集成员分页'?'dialog':'page';
     if(!popupContexts.has(context)){
       popupContexts.add(context);
       for(const [index,edge] of [[0,'first'],[2,'last']]){
         const point=await run(`(()=>{const el=document.querySelectorAll('.semi-page-select-dropdown .semi-select-option')[${index}],r=el.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);
         win.webContents.sendInputEvent({type:'mouseMove',...point});await settle();await shot('size-popup-'+context+'-'+edge+'-hover');
         assert.equal(await run(`(()=>{const el=document.querySelector('.semi-page-select-dropdown'),r=el.getBoundingClientRect();return !el.contains(document.elementFromPoint(r.left+.25,r.top+.25))&&!el.contains(document.elementFromPoint(r.right-.25,r.bottom-.25));})()`),true,context+' option hover cannot hit or paint outside rounded corners');
       }
     }
     const pos=await run(`(()=>{const o=[...document.querySelectorAll('.semi-select-option')].find(e=>e.textContent.includes('${size}')&&e.getBoundingClientRect().height);if(!o)throw Error('No size option ${size}');const r=o.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);
     win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...pos});win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...pos});
   }
   await settle();
 };
 for(const total of [0,1]){await render({mode:'controls',total,page:1,pageSize:20,width:280});await chooseSize(100);assert.equal(await run('window.currentPageSize'),100,'empty/single size can change');await chooseSize(20);assert.equal(await run('window.currentPageSize'),20,'empty/single size can return');}
 await render({mode:'controls',total:54,page:3,pageSize:20,width:280});for(const size of [50,100,20]){await chooseSize(size);assert.equal(await run('window.currentPageSize'),size);assert.equal(await run('window.currentPage'),1,'size resets last page');}await chooseSize(50,'验收分页',true);assert.equal(await run('window.currentPageSize'),50,'keyboard chooses size');assert.equal(await run('window.submits??0'),0,'size never submits form');await shot('size-selector-280');
 await render({total:2000,page:1,pageSize:20,width:1000});
 const key=async(selector,value)=>{win.webContents.focus();await run(`document.querySelector(${JSON.stringify(selector)}).focus()`);win.webContents.sendInputEvent({type:'keyDown',keyCode:value});win.webContents.sendInputEvent({type:'char',keyCode:value==='Enter'?'\r':' '});win.webContents.sendInputEvent({type:'keyUp',keyCode:value});await settle();};
 await key('[aria-label="Page 2"]','Enter');assert.equal(await run('window.currentPage'),2,'Enter page');await key('[aria-label="Page 3"]','Space');assert.equal(await run('window.currentPage'),3,'Space page');
 await run('document.querySelector(".pagination-bar .semi-page-quickjump input").focus()');await win.webContents.insertText('52');await settle();await key('.pagination-bar .semi-page-quickjump input','Enter');assert.equal(await run('window.currentPage'),52,'jump Enter');assert.equal(await run('window.submits??0'),0,'jump never submits parent form');
 await render({page:1});await run('document.querySelector(".semi-page-next").click()');await settle();assert.equal(await run('window.currentPage'),2,'next');await run('document.querySelector(".semi-page-prev").click()');await settle();assert.equal(await run('window.currentPage'),1,'previous');
 await render({mode:'controls',disabled:true,page:2});const before=await run('window.events.length');await key('[aria-label="Page 3"]','Enter');await run('document.querySelector(".semi-page-next").click()');await settle();assert.equal(await run('window.events.length'),before,'disabled never changes');assert.equal(await run('document.querySelector(".pagination-bar .semi-page-quickjump input").disabled'),true);assert.equal(await run('[...document.querySelectorAll(".pagination-bar li")].every(e=>e.tabIndex===-1)'),true,'disabled pages outside tab order');await run('document.querySelector(".semi-page-switch .semi-select").click()');await settle();assert.equal(await run('document.querySelectorAll(".semi-select-option").length'),0,'disabled size cannot open');assert.equal(await run('window.currentPageSize'),20);await shot('disabled');
 await render({mode:'members',disabled:false});await chooseSize(100,'合集成员分页');assert.equal(await run('document.querySelectorAll("[data-member-id]").length'),100,'modal size choice can receive real pointer events');await chooseSize(20,'合集成员分页');await run('document.querySelector("dialog").style.width="380px"');await settle();await run('document.querySelector(".members-editor-list").scrollTop=100000');await settle();await shot('members-dialog-380');const memberBox=(await geometry())[0];assert.ok(memberBox.fits&&memberBox.nav.width<=332,'actual member dialog pagination bounded');await key('[aria-label="Page 2"]','Enter');assert.match((await geometry())[0].count,/21–40/,'actual members next page');await run('document.querySelector(".members-editor-list").scrollTop=100000');await settle();await shot('members-dialog-page2');
 assert.equal(await run('window.calls.length'),0,'no bridge calls');assert.equal(await run('window.dataUnchanged()'),true,'no data mutations');await fs.writeFile(path.join(probeRoot,'result.json'),JSON.stringify({status:'PASS',widths:[1440,1100,960,560],containers:[1000,560,380,280],geometry:await geometry(),keyboardTrace:await run('window.keyboardTrace'),checks:['rounded popup clips first/last hovered options in page and dialog','zero/single/multi/large totals','20/50/100 size changes including last page and real pointer/keyboard selection','upper/lower clamp','Enter/Space/quickjump','previous/next','disabled','no form submission','no bridge calls or data mutations']},null,2));console.log('PASS React/Semi/Electron pagination. Evidence:',probeRoot);app.exit(0);
 }catch(error){console.error(error);console.log('Evidence:',probeRoot);app.exit(1);}
}
await fs.writeFile(path.join(root,'probe-main.mjs'),`(${probeMain.toString()})(${JSON.stringify(root)},${baseline});`);
const child=spawn(electron,[path.join(root,'probe-main.mjs')],{stdio:'inherit',env:{...process.env,ELECTRON_RUN_AS_NODE:''}});process.exitCode=await new Promise(resolve=>child.on('exit',code=>resolve(code??1)));console.log('Probe fixture:',root);

if(process.env.NOVA_PROBE_EVIDENCE_DIR){const destination=path.resolve(process.env.NOVA_PROBE_EVIDENCE_DIR,'pagination');await fs.mkdir(destination,{recursive:true});for(const name of await fs.readdir(root))if(name.endsWith('.png')||name==='result.json')await fs.copyFile(path.join(root,name),path.join(destination,name));console.log('Saved evidence:',destination);}
