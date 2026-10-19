// Actual React/Semi/Electron interaction checks; synthetic DTOs and bridge, isolated userData.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import electron from 'electron';
import {build} from 'vite';
import {fileURLToPath} from 'node:url';
const workbench = fileURLToPath(new URL('../', import.meta.url));
const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'nova-daily-publication-')));
await fs.writeFile(path.join(root, 'index.html'), '<html lang="zh-CN"><div id="root"></div><script type="module" src="/probe.jsx"></script></html>');
await fs.writeFile(path.join(root, 'probe.jsx'), `
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import '${workbench}/node_modules/@douyinfe/semi-ui-19/react19-adapter';
import '${workbench}/node_modules/@douyinfe/semi-ui-19/lib/es/_base/base.css';
import '${workbench}/src/renderer/style.css';
import {CalendarPage, Overview} from '${workbench}/src/renderer/workspace-pages.tsx';
import {PublicationEditor} from '${workbench}/src/renderer/publication-panel.tsx';
import {hasManagedDrafts} from '${workbench}/src/renderer/library-panels.tsx';
const date='2026-10-19', plan=(id,schedule,text=id)=>({id,schedule,channelId:'channel',status:'planned',textMode:'explicit',text,coverChoice:null,publicationId:null});
const makeDocument=(id,title,plans)=>({id,title,body:'当前正文不可替代空文字',editToken:'token-1',channelIds:['channel'],plans,deletedAt:null,isExample:false,candidates:[],coverVariants:[],publications:[],publicationEvents:[],candidateCount:0,selectedCandidateId:null});
window.doc=makeDocument('content-a','正常内容',[plan('instant',{precision:'instant',at:'2026-10-19T08:35:00Z',timezone:'America/New_York'}),plan('local',{precision:'local-minute',date,time:'10:45',timezone:'America/New_York'}),plan('date',{precision:'date',date},'')]);
window.originalSchedules=JSON.stringify(window.doc.plans.map(item=>item.schedule));
window.collection=makeDocument('collection-a','既有合集',[plan('collection-plan',{precision:'date',date})]);window.collection.memberIds=['content-a'];
window.example=makeDocument('example','不应新增的示例',[]);window.example.isExample=true;
window.channels=[{id:'channel',name:'测试渠道',ink:'#ad245e',bg:'#fff0f5'}];
window.library={contentDetails:[window.doc,window.example],collections:[window.collection],settings:{channels:window.channels}};
window.workspace={contents:[window.doc,window.example],channels:window.channels};window.calls=[];window.failSave=false;window.hasDrafts=hasManagedDrafts;
window.contentHub=new Proxy({},{get:(_,method)=>async input=>{
 window.calls.push({method,input:structuredClone(input)});
 if(method==='mutateWorkspace'){
  if(window.failSave)return {ok:false,error:{code:'CAS_CONFLICT',message:'synthetic conflict'}};
  if(input.op==='recordPublication'){
   const doc=(input.kind==='content'?window.library.contentDetails:window.library.collections).find(item=>item.id===input.id), p=doc.plans.find(item=>item.id===input.planId);
   p.status='published';doc.publications.push({id:'actual-'+p.id,planId:p.id,channelName:'测试渠道',schedule:input.schedule,title:doc.title,text:p.text,coverCandidateId:null,recordedAt:new Date().toISOString(),url:input.url});
   const updated={...doc,plans:[...doc.plans],publications:[...doc.publications]};if(input.kind==='content'){window.doc=updated;window.library.contentDetails=window.library.contentDetails.map(item=>item.id===updated.id?updated:item);window.workspace.contents=window.workspace.contents.map(item=>item.id===updated.id?updated:item);}else{window.collection=updated;window.library.collections=[updated];}
  }
  return {ok:true,value:{library:window.library}};
 }
 if(method==='copyPrompt')return {ok:true,value:{copied:true}};
 throw new Error('Unexpected native method '+method);
}});
function Probe(){const [revision,setRevision]=useState(0),[focus,setFocus]=useState({kind:'content',id:'content-a',planId:'instant',day:date}),[mode,setMode]=useState('calendar');window.probe={refresh:()=>setRevision(n=>n+1),focus:setFocus,mode:setMode};const props={workspace:{...window.workspace},library:{...window.library},busy:false,open:()=>{},run:async fn=>{try{return await fn()}catch(error){window.lastError=error.message;}},refresh:async()=>setRevision(n=>n+1)};return <main><aside className="app-navigation">隔离验证</aside><div className="app-stage">{mode==='missing'?<PublicationEditor props={props} selection={{mode:'plan',kind:'content',documentId:'missing'}} initialDay={date} close={()=>setMode('calendar')}/>:mode==='collection-new'?<PublicationEditor props={props} selection={{mode:'plan',kind:'collection',documentId:'collection-a'}} initialDay={date} close={()=>setMode('calendar')}/>:mode==='calendar'?<CalendarPage {...props} initialFocus={focus}/>:<Overview {...props} openCalendar={value=>{window.overviewFocus=value;}}/>}</div></main>}
createRoot(document.getElementById('root')).render(<Probe/>);
`);
await build({configFile:false,root,base:'./',resolve:{alias:{react:path.join(workbench,'node_modules/react'),'react-dom':path.join(workbench,'node_modules/react-dom')}},oxc:{jsx:{runtime:'automatic'}},build:{outDir:path.join(root,'dist'),modulePreload:false,target:'chrome148'}});
async function probeMain(probeRoot) {
 const {app,BrowserWindow}=await import('electron');
 const {default:assert}=await import('node:assert/strict');
 const {default:path}=await import('node:path');
 const {default:fs}=await import('node:fs/promises');
 app.setPath('userData',path.join(probeRoot,'machine'));await app.whenReady();
 const win=new BrowserWindow({show:false,width:1280,height:1000,webPreferences:{contextIsolation:true,nodeIntegration:false}});
 const run=source=>win.webContents.executeJavaScript(source).catch(error=>{console.error('Browser script:',source);throw error;});
 const wait=condition=>run(`new Promise((resolve,reject)=>{const end=Date.now()+10000;const check=()=>{if(${condition})return resolve(true);if(Date.now()>end)return reject(new Error('State timeout: '+${JSON.stringify(condition)}+' / '+document.body.innerText.slice(-1000)));setTimeout(check,20)};check()})`);
 const click=text=>run(`[...document.querySelectorAll('button')].find(button=>button.textContent.trim()===${JSON.stringify(text)}&&!button.disabled).click()`);
 const close=async()=>{await click('关闭');if(await run('!![...document.querySelectorAll("button")].find(button=>button.textContent.trim()==="放弃填写并关闭")'))await click('放弃填写并关闭');await wait('!document.querySelector("dialog[open]")');};
 const setInput=(selector,value)=>run(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 const record=async id=>{await run(`document.querySelector('.schedule-day-plans [data-plan-id="${id}"] .daily-plan-record').click()`);await wait('document.querySelector("dialog[aria-label=记录实际发布][open]")');};
 try {
  await win.loadFile(path.join(probeRoot,'dist/index.html'));await wait('document.querySelectorAll(".schedule-day-plans .schedule-plan").length===4');
  assert.equal(await run('!!document.querySelector(".schedule-day-plans .semi-table")'),true,'real Semi Table day list');
  assert.equal(await run('!!document.querySelector("#calendar-publication-manager")'),false,'no permanent duplicated manager');
  await run('document.querySelector(".schedule-day-plans [data-plan-id=instant] .daily-plan-title").click()');await wait('document.querySelector("#calendar-publication-manager")');
  for(const [id,precision,timezone] of [['instant','instant','America/New_York'],['local','local-minute','America/New_York'],['date','date',null]]) {
   const before=await run('window.calls.length');await record(id);assert.equal(await run('window.calls.length'),before,'opening record is read only');
   if(id==='instant'){await click('暂时收起');await wait('document.querySelector(".management-resume")');assert.equal(await run('[...document.querySelectorAll("#calendar-publication-manager button")].every(button=>button.disabled)'),true,'minimized direct editor blocks sibling panel bypasses');await click('继续编辑');await wait('document.querySelector("dialog[open]")');}
   if(timezone)assert.equal(await run('[...document.querySelectorAll("dialog input")].find(input=>input.value==="America/New_York")?.value'),timezone,'original timezone retained instead of display timezone');
   await click('确认已经发布并保存记录');await wait('!document.querySelector("dialog[open]")');
   const input=await run('window.calls.at(-1).input');assert.equal(input.op,'recordPublication');assert.equal(input.schedule.precision,precision);if(timezone)assert.equal(input.schedule.timezone,timezone);assert.equal(await run('window.calls.length'),before+1,'one confirmation one mutation');
  }
  assert.equal(await run('JSON.stringify(window.doc.plans.map(item=>item.schedule))===window.originalSchedules'),true,'all original precision and planned schedules preserved');
  // Actual dates may differ from the selected old plan day. Re-focus on the recorded date.
  await run('window.probe.focus({kind:"content",id:"content-a",planId:"date",day:window.doc.publications.find(p=>p.planId==="date").schedule.date})');await wait('document.querySelector(".schedule-day-plans [data-plan-id=date] .daily-plan-details")');
  await run('document.querySelector(".schedule-day-plans [data-plan-id=date] .daily-plan-details").click()');await wait('document.querySelector(".publication-history.is-focused")');
  assert.equal(await run('document.querySelector(".publication-history.is-focused").dataset.publicationId'),'actual-date','view record finds effective history');
  await run('document.querySelector(".publication-plan[data-plan-id=date] .publication-plan-expand").click()');await wait('document.querySelector(".publication-plan-details pre")');
  await click('复制本计划文案');assert.equal(await run('window.calls.at(-1).input.text'),'','explicit empty stays empty, never falls back to body');assert.equal(await run('!![...document.querySelectorAll(".publication-plan-details button")].find(b=>b.textContent.includes("下载"))'),false,'no invented cover');
  await click('收起详情');await run('window.probe.focus({kind:"collection",id:"collection-a",planId:"collection-plan",day:"2026-10-19"})');await wait('document.querySelector(".schedule-day-plans [data-plan-id=collection-plan]")');await run('document.querySelector(".schedule-day-plans [data-plan-id=collection-plan] .daily-plan-title").click()');await wait('document.querySelector("#calendar-publication-manager h3")?.textContent==="既有合集"');assert.equal(await run('[...document.querySelectorAll("#calendar-publication-manager button")].some(button=>button.textContent.includes("新增发布计划"))'),false,'legacy collection plans have no create button DOM');
  await run('document.querySelector(".publication-plan-expand").click()');await wait('document.querySelector(".publication-plan-details .management-actions")');await click('编辑计划');await wait('document.querySelector("dialog[aria-label=编辑发布计划][open]")');await close();await click('收起详情');
  await run('window.probe.mode("missing")');await wait('document.querySelector("dialog [role=alert]")');assert.ok(await run('document.querySelector("dialog [role=alert]").textContent.includes("原内容暂不可用")'));await close();await wait('!window.hasDrafts()');
  await run('window.probe.mode("collection-new")');await wait('document.querySelector("dialog [role=alert]")');assert.ok(await run('document.querySelector("dialog [role=alert]").textContent.includes("单篇内容")'));await close();await wait('!window.hasDrafts()');
  await run('window.probe.focus({day:"2026-10-23"})');await wait('document.querySelector(".schedule-day-detail h3").textContent.includes("2026-10-23")');
  await click('为这一天新增计划 →');await wait('document.querySelector("dialog[aria-label=选择要发布的内容][open]")');await run('document.querySelector("dialog .semi-select").click()');await wait('document.querySelectorAll("[role=option]").length>0');
  const choices=await run('[...document.querySelectorAll("[role=option]")].map(el=>el.textContent).join(" ")');assert.ok(!choices.includes('示例')&&!choices.includes('合集'),'only normal single content can create plans');
  await run('[...document.querySelectorAll("[role=option]")].find(option=>option.textContent.includes("正常内容")).click()');await click('继续安排');await wait('document.querySelector("dialog[aria-label=新增发布计划][open]")');
  assert.ok(await run('[...document.querySelectorAll("dialog input")].some(input=>input.value==="2026-10-23")'),'new plan uses selected day');
  await setInput('dialog textarea','需要保留的计划草稿');await click('暂时收起');await wait('document.querySelector(".management-resume")');assert.equal(await run('window.hasDrafts()'),true,'minimized direct editor owns guard');
  await click('＋ 新增计划');assert.equal(await run('!!document.querySelector("dialog[aria-label=选择要发布的内容][open]")'),false,'guard prevents replacing draft');
  await run('window.doc={...window.doc,editToken:"token-2"};window.library.contentDetails[0]=window.doc;window.probe.refresh()');await click('继续编辑');await wait('document.querySelector("dialog[open]")');assert.equal(await run('document.querySelector("dialog textarea").value'),'需要保留的计划草稿','refresh preserves input');
  await run('window.doc.deletedAt="external-trash";window.probe.refresh()');await wait('document.querySelector("dialog button[type=submit]").disabled');assert.equal(await run('document.querySelector("dialog textarea").value'),'需要保留的计划草稿','external recycle preserves input and disables save');
  await run('window.doc.deletedAt=null;window.failSave=true;window.probe.refresh()');await wait('!document.querySelector("dialog button[type=submit]").disabled');await click('保存到本机');await wait('document.querySelector("dialog [role=status]").textContent.includes("编辑内容仍保留")');
  assert.equal(await run('document.querySelector("dialog textarea").value'),'需要保留的计划草稿','CAS failure preserves input');assert.equal(await run('window.calls.at(-1).input.editToken'),'token-1','editor token fixed at opening');await close();
  await run('window.library.contentDetails.push({...window.doc,id:"empty-content",title:"尚无计划的内容",plans:[],publications:[],publicationEvents:[]});window.probe.focus({kind:"content",id:"empty-content"});window.probe.refresh()');await wait('document.querySelector("#calendar-publication-manager h3")?.textContent==="尚无计划的内容"');await click('安排发布');await wait('document.querySelector("dialog[aria-label=新增发布计划][open]")');assert.ok(await run('document.querySelector("dialog").textContent.includes("尚无计划的内容")'),'document-only navigation retains empty content context');await close();await click('收起详情');
  await run('window.doc={...window.doc,publications:Array.from({length:10000},(_,i)=>({id:"history-"+String(i).padStart(5,"0"),planId:"many-"+i,channelName:"测试渠道",title:"当时标题",text:"快照 "+i,schedule:{precision:"date",date:"2026-10-19"},coverCandidateId:null})),publicationEvents:Array.from({length:7500},(_,i)=>({targetId:"history-"+String(9999-i).padStart(5,"0"),type:i%2?"retracted":"corrected",reason:"验收",recordedAt:new Date().toISOString()}))};window.doc.publicationEvents.push({...window.doc.publicationEvents[0],type:"retracted"});window.library.contentDetails[0]=window.doc;window.probe.focus({kind:"content",id:"content-a"});window.probe.refresh()');await wait('document.querySelector(".publication-summary")?.textContent.includes("2500 条有效发布记录")');assert.equal(await run('window.doc.publications.filter(item=>!window.doc.publicationEvents.some(event=>event.targetId===item.id)).length'),2500,'optimized effective count matches original semantics for 10k histories/7501 events');assert.equal(await run('document.querySelectorAll(".publication-history").length'),10,'large corrected history remains paginated');assert.ok(await run('document.querySelector(".publication-history").textContent.includes("已更正")'),'first event semantics retained for duplicate target');await click('收起详情');
  await run('window.failSave=false;window.doc.plans=Array.from({length:10000},(_,i)=>({id:"bulk-"+String(i).padStart(5,"0"),channelId:"channel",status:"planned",schedule:{precision:"date",date:"2026-10-19"},textMode:"explicit",text:i===0?"长标题".repeat(3000):"计划标题 "+i,coverChoice:null}));window.doc.publications=[];window.probe.focus({kind:"content",id:"content-a",planId:"bulk-09999",day:"2026-10-19"});window.probe.refresh()');
  await wait('document.querySelector(".schedule-day-plans .is-focused")?.dataset.planId==="bulk-09999"');assert.equal(await run('document.querySelectorAll(".schedule-day-plans .schedule-plan").length'),20,'10k DTO rows mount only one page');assert.ok(await run('document.querySelectorAll("*").length')<1500,'bounded DOM at growth');
  await run('[...document.querySelectorAll("nav[aria-label=当天安排分页] [aria-label]")].find(button=>button.getAttribute("aria-label")==="Page 1").click()');await wait('document.querySelector(".schedule-day-plans .schedule-plan").dataset.planId==="bulk-00000"');assert.equal(await run('document.documentElement.scrollWidth<=innerWidth && document.querySelector(".schedule-day-plans .daily-plan-row").getBoundingClientRect().right<=document.querySelector("#schedule-day-detail").getBoundingClientRect().right'),true,'very long title cannot expand the compact Semi table');await run('window.probe.focus({kind:"content",id:"content-a",planId:"bulk-09999",day:"2026-10-19"})');await wait('document.querySelector(".schedule-day-plans .is-focused")?.dataset.planId==="bulk-09999"');
  await run('document.querySelector("#schedule-day-detail").scrollIntoView({block:"start"});new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');await fs.writeFile(path.join(probeRoot,'daily-1280.png'),(await win.webContents.capturePage()).toPNG());
  assert.equal(await run('document.documentElement.scrollWidth<=innerWidth'),true,'wide layout fits');assert.equal(await run('(()=>{const search=document.querySelector(".daily-plan-filters .list-toolbar-search").getBoundingClientRect(),filters=[...document.querySelectorAll(".daily-plan-filters .semi-control")].map(el=>el.getBoundingClientRect());return filters.every(rect=>search.width>=rect.width);})()'),true,'desktop search has useful space');await win.setSize(560,900);await run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');assert.equal(await run('document.documentElement.scrollWidth<=innerWidth'),true,'narrow layout fits');assert.equal(await run('(()=>{const filters=[...document.querySelectorAll(".daily-plan-filters .semi-control")].map(el=>el.getBoundingClientRect());return filters.length===2&&Math.abs(filters[0].top-filters[1].top)<1;})()'),true,'narrow filters share one row');assert.equal(await run('(()=>{const row=document.querySelector(".schedule-day-plans .daily-plan-row"),title=row.querySelector(".daily-plan-title").getBoundingClientRect(),action=row.querySelector(".daily-plan-record,.daily-plan-details").getBoundingClientRect();return title.width>100&&title.right<=action.left-4;})()'),true,'narrow title and action do not overlap');await fs.writeFile(path.join(probeRoot,'daily-560.png'),(await win.webContents.capturePage()).toPNG());
  await run('window.probe.mode("overview")');await wait('document.querySelector(".creator-week")');await run('[...document.querySelectorAll(".creator-week button")].find(button=>button.getAttribute("aria-label").includes("，0 条安排")).click()');assert.ok(await run('window.overviewFocus.day && !window.overviewFocus.id'),'empty overview weekday keeps its actual day');
  // Add a current-day plan and verify overview record intent reaches the confirmation path.
  await run('window.doc.plans=[{...window.doc.plans[0],schedule:{precision:"date",date:new Intl.DateTimeFormat("sv-SE",{year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())}}];window.probe.refresh()');await wait('[...document.querySelectorAll(".creator-featured-actions button")].some(b=>b.textContent.trim()==="记录已发布")');await click('记录已发布');assert.equal(await run('window.overviewFocus.action'),'record');await run('window.probe.focus(window.overviewFocus);window.probe.mode("calendar")');await wait('document.querySelector("dialog[aria-label=记录实际发布][open]")');await close();
  console.log('PASS daily actual React/Semi/Electron: 3 precisions/original zone, read-only open/single record write, effective-history focus, empty text/no cover, selected-day normal-content create, minimized guard/refresh/recycle/CAS retention, 10k DTO bounded DOM/deep repeated focus, day-only overview and record intent, 1280/560 layouts. Synthetic bridge only.');console.log('Screenshots:',path.join(probeRoot,'daily-1280.png'),path.join(probeRoot,'daily-560.png'));app.exit(0);
 }catch(error){console.error(error);app.exit(1);}
}
await fs.writeFile(path.join(root,'probe-main.mjs'),`(${probeMain.toString()})(${JSON.stringify(root)});`);
const child=spawn(electron,[path.join(root,'probe-main.mjs')],{stdio:'inherit',env:{...process.env,ELECTRON_RUN_AS_NODE:''}});
process.exitCode=await new Promise(resolve=>child.on('exit',code=>resolve(code??1)));console.log('Probe fixture:',root);
