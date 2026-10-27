// Real renderer/Semi interactions with in-memory fixtures and isolated Electron userData.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import electron from 'electron';
import {build} from 'vite';
const workbench = fileURLToPath(new URL('../', import.meta.url));
const evidence = path.resolve(process.env.UI_EVIDENCE_DIR || path.join(workbench, '../docs/verification/production/2026-10-23-prompt-channel-consistency'));
const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'nova-prompt-channel-')));
await fs.mkdir(evidence, {recursive:true});
await fs.writeFile(path.join(root,'index.html'), '<html lang="zh-CN"><meta charset="utf-8"><div id="root"></div><script type="module" src="/probe.jsx"></script></html>');
await fs.writeFile(path.join(root,'probe.jsx'), `
import {useState} from 'react';import {createRoot} from 'react-dom/client';
import '${workbench}/node_modules/@douyinfe/semi-ui-19/react19-adapter';
import '${workbench}/node_modules/@douyinfe/semi-ui-19/lib/es/_base/base.css';
import '${workbench}/src/renderer/style.css';
import {PromptsPage} from '${workbench}/src/renderer/workspace-pages.tsx';
import {ContentMetadataPanel} from '${workbench}/src/renderer/library-panels.tsx';
const medium='请你扮演一位经验丰富的内容策划，围绕我提供的主题，先梳理读者关心的问题，再用清楚自然的语言写出具体建议。保留必要的背景和示例，避免空泛表达，最后给出可以立即执行的步骤。';
const long=Array.from({length:6},(_,i)=>'第'+(i+1)+'段：保留完整原文与换行，长提示词仍可展开阅读，不影响同排卡片的使用按钮位置。').join('\\n')+'\\n正文结束标记';
window.previewTexts=['一句说明。',medium,long,'停用提示词的简短说明。'];
const prompts=window.previewTexts.map((when,i)=>({id:'p'+i,editToken:'t'+i,title:i===1?'需要填写的提示词 · 长标题检查':'提示词 '+i,body:i===1?'第一行\\n{{主题|填写主题}}\\n最后一行':'完整正文 '+i,category:i===1?'很长的分类名称':'写作',when,summary:'摘要',tags:[],enabled:i!==3,deletedAt:null}));
const content={id:'content',editToken:'content-token',title:'隔离测试内容',body:'正文',channelIds:[],recordedDate:null,plannedDate:null,preferredTemplateId:null,isExample:false,deletedAt:null,plans:[],candidates:[],coverVariants:[],publications:[],publicationEvents:[]};
const channels=Array.from({length:12},(_,i)=>({id:'c'+i,name:i===11?'自定义直播渠道':'渠道 '+String(i).padStart(2,'0'),deletedAt:null}));
const library={prompts,contentDetails:[content],templates:[],settings:{channels,visiblePromptCategories:['写作']}};
window.calls=[];window.errors=[];window.contentHub=new Proxy({},{get:(_,method)=>async input=>{window.calls.push({method,input});throw Error('Unexpected native call '+method)}});window.addEventListener('error',e=>window.errors.push(e.message));
function Probe(){const [mode,setMode]=useState('prompts'),[busy,setBusy]=useState(false);window.mode=setMode;window.busy=setBusy;const props={library,workspace:{contents:[content],prompts:[],channels},busy,run:async fn=>fn(),refresh:async()=>{}};return <main><aside className="app-navigation">隔离验证</aside><div className="app-stage"><header className="app-header"><h1>自媒体工作台</h1></header>{mode==='prompts'?<PromptsPage {...props}/>:<ContentMetadataPanel {...props} contentId="content"/>}</div></main>};createRoot(document.getElementById('root')).render(<Probe/>);
`);
await build({configFile:false,root,base:'./',resolve:{alias:{react:path.join(workbench,'node_modules/react'),'react-dom':path.join(workbench,'node_modules/react-dom')}},oxc:{jsx:{runtime:'automatic'}},build:{outDir:path.join(root,'dist'),modulePreload:false,target:'chrome148'}});
async function main(root,evidence,baseline){
 const {app,BrowserWindow}=await import('electron'),{default:assert}=await import('node:assert/strict'),{default:path}=await import('node:path'),{default:fs}=await import('node:fs/promises');
 app.setPath('userData',path.join(root,'machine'));await app.whenReady();const win=new BrowserWindow({show:false,width:1440,height:1000,webPreferences:{contextIsolation:true,nodeIntegration:false}});
 win.webContents.on('console-message',event=>console.log('renderer:',event.message));
 const run=source=>win.webContents.executeJavaScript(source).catch(error=>{console.error('Browser script:',source);throw error;});
 const wait=condition=>run(`new Promise((resolve,reject)=>{const end=Date.now()+5000;const tick=()=>{if(${condition})return resolve();if(Date.now()>end)return reject(Error(${JSON.stringify(condition)}+' / '+document.body.innerText.slice(-500)));setTimeout(tick,20)};tick()})`);
 const paint=()=>run('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
 const shot=async name=>{await paint();await run('Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})))');await fs.writeFile(path.join(evidence,(baseline?'before-':'after-')+name+'.png'),(await win.webContents.capturePage()).toPNG());};
 const click=async selector=>{await run(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'nearest'})`);const rect=await run(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);win.webContents.sendInputEvent({type:'mouseDown',...rect,button:'left',clickCount:1});win.webContents.sendInputEvent({type:'mouseUp',...rect,button:'left',clickCount:1});await paint();};
 const key=async keyCode=>{win.webContents.sendInputEvent({type:'keyDown',keyCode});win.webContents.sendInputEvent({type:'keyUp',keyCode});await paint();};
 const input='.channel-multi-select input';
 const type=async value=>{await run(`(()=>{const input=document.querySelector('${input}');input.focus();input.select();})()`);await win.webContents.insertText(value);await paint();};
 const options=()=>run('[...document.querySelectorAll(".semi-select-option:not(.semi-select-option-empty)")].map(e=>e.textContent)');
 const records=[],failures=[];
 const check=(value,message)=>{if(baseline){if(!value)failures.push(message);}else assert.ok(value,message);};
 const alignment=()=>run(`(()=>{const cards=[...document.querySelectorAll('.prompt-library-card')];return cards.map(card=>{const c=card.getBoundingClientRect(),b=card.querySelector('.prompt-use-footer button').getBoundingClientRect(),body=card.querySelector('.semi-card-body').getBoundingClientRect();return{id:card.dataset.promptId,top:c.top,bottom:c.bottom,buttonBottom:b.bottom,rightInset:c.right-b.right,bodyHeight:body.height,height:c.height}})})()`);
 const aligned=(rects)=>{for(const top of new Set(rects.map(r=>r.top))){const row=rects.filter(r=>r.top===top);check(Math.max(...row.map(r=>r.buttonBottom))-Math.min(...row.map(r=>r.buttonBottom))<=1,'same-row action bottom alignment');}check(rects.every(r=>Math.abs(r.bottom-r.buttonBottom-17)<=1&&Math.abs(r.rightInset-17)<=1),'actions anchored at lower right');};
 try{
  await win.loadFile(path.join(root,'dist/index.html'));await wait('document.querySelectorAll(".prompt-library-card").length===4');
  for(const width of [1440,960]){
   const height=width===960?680:1000;win.setContentSize(width,height);await wait(`innerWidth===${width}&&innerHeight===${height}`);await paint();
   const before=await alignment();aligned(before);check(await run('!document.querySelector("[data-prompt-id=p0] .semi-typography-ellipsis-expand")'),'short preview is complete');
   check(await run('!document.querySelector("[data-prompt-id=p1] .semi-typography-ellipsis-expand")'),'medium preview needs no collapse');
   check(await run('document.querySelector("[data-prompt-id=p1] .prompt-card-preview").textContent===window.previewTexts[1]'),'medium preview contains complete original text');
   await shot('prompts-'+width);if(width===960){await run('document.querySelector("[data-prompt-id=p1]").scrollIntoView({block:"end"})');await shot('prompts-lower-'+width);await run('scrollTo(0,0)');}
   await run('document.querySelector("[data-prompt-id=p2] .semi-typography-ellipsis-expand").click()');await paint();
   check(await run('document.querySelector("[data-prompt-id=p2] .prompt-card-preview").textContent.includes("正文结束标记")'),'expanded long text reaches last line');const expanded=await alignment();aligned(expanded);await run('document.querySelector("[data-prompt-id=p2] .prompt-use-footer").scrollIntoView({block:"end"})');await shot('prompts-expanded-'+width);records.push({width,expanded});
   await run('document.querySelector("[data-prompt-id=p2] .semi-typography-ellipsis-expand").click()');await paint();
   check(await run('document.documentElement.scrollWidth<=innerWidth'),'prompt page fits width');records.push({viewport:[width,height],cards:before});
  }
  await run('window.mode("metadata")');await wait('!!document.querySelector(".channel-multi-select")');
  for(const width of [1440,960]){
   const height=width===960?680:1000;win.setContentSize(width,height);await wait(`innerWidth===${width}&&innerHeight===${height}`);await paint();await click('.channel-multi-select .semi-select');await wait('!!document.querySelector(".semi-select-option-list-wrapper")');
   const geometry=await run(`(()=>{const el=document.querySelector('${input}'),r=el.getBoundingClientRect(),s=getComputedStyle(el);return{width:r.width,paddingLeft:s.paddingLeft,paddingRight:s.paddingRight,focused:el===document.activeElement,placeholder:el.placeholder}})()`);
   console.log('Channel input before typing',width,JSON.stringify(geometry));
   check(geometry.focused,'clicking channel control focuses direct input');
   check(geometry.width>=200,'empty channel search has readable typing width');
   check(await run('document.querySelector(".channel-multi-select").textContent.includes("输入")||!!document.querySelector(".channel-multi-select input").placeholder'),'channel control visibly offers typing');
   await shot('channels-ready-'+width);
   await win.webContents.insertText('直播');await paint();assert.deepEqual(await options(),['自定义直播渠道'],'typing directly filters channel names');await shot('channels-search-'+width);
   await key('Down');await key('Return');await wait('document.querySelector(".channel-selected-name")?.textContent==="自定义直播渠道"');
   await type('渠道 02');assert.deepEqual(await options(),['渠道 02']);await run('[...document.querySelectorAll(".semi-select-option")].find(e=>e.textContent==="渠道 02").click()');await paint();
   assert.equal(await run('document.querySelectorAll(".channel-selected-name").length'),2,'multiple selection retained');
   await type('不存在');assert.deepEqual(await options(),[]);assert.ok(await run('document.body.innerText.includes("没有匹配的选项")'));await shot('channels-no-match-'+width);
   assert.equal(await run('document.querySelectorAll(".channel-selected-name").length'),2,'no-match query preserves selections');await type('');assert.ok((await options()).includes('渠道 00'),'clear query restores list');
   await key('Escape');await wait('!document.querySelector(".semi-select-option-list-wrapper")');await shot('channels-selected-'+width);
   check(await run('document.documentElement.scrollWidth<=innerWidth'),'metadata page fits width');
   await run('window.mode("prompts")');await wait('!!document.querySelector(".prompt-workspace")');await run('window.mode("metadata")');await wait('!!document.querySelector(".channel-multi-select")');records.push({viewport:[width,height],channelInput:geometry});
  }
  await run('window.busy(true)');await paint();assert.equal(await run('document.querySelector(".channel-multi-select input").disabled'),true);await click('.channel-multi-select .semi-select');assert.equal(await run('!!document.querySelector(".semi-select-option-list-wrapper")'),false,'busy field does not open');
  assert.deepEqual(await run('window.calls'),[],'no clipboard, saves or native APIs');assert.deepEqual(await run('window.errors'),[]);
  await fs.writeFile(path.join(evidence,baseline?'before.json':'after.json'),JSON.stringify({platform:process.platform,arch:process.arch,records,failures},null,2));
  if(baseline)assert.deepEqual(failures,[],'baseline exposes original symptoms');
  console.log('PASS real PromptsPage/ContentMetadataPanel: lower-right actions, mixed metadata and short/medium/long text, full long expansion, 1440/960 layouts; direct typing, filtered keyboard selection, multiselect, no match, clear, Escape, busy and zero native writes. Evidence:',evidence);app.exit(0);
 }catch(error){await shot('failure');console.error(error);app.exit(1);}
}
await fs.writeFile(path.join(root,'main.mjs'),`(${main.toString()})(${JSON.stringify(root)},${JSON.stringify(evidence)},${!!process.env.PROMPT_CHANNEL_BASELINE});`);
const child=spawn(electron,[path.join(root,'main.mjs')],{stdio:'inherit',env:{...process.env,ELECTRON_RUN_AS_NODE:''}});
const code=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('Prompt/channel probe timeout'));},60000);child.once('error',reject);child.once('exit',code=>{clearTimeout(timer);resolve(code??1);});});
assert.equal(code,0,'Prompt/channel probe failed');
