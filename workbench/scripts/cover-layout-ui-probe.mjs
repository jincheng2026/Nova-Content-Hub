// Actual React/Semi UI in isolated Electron; all data and IPC are synthetic, with writes forbidden.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import electron from 'electron';
import {build} from 'vite';
const workbench=fileURLToPath(new URL('../',import.meta.url));
const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'nova-cover-layout-')));
const originals=await Promise.all(['K01.webp','K02.webp','K03.jpg'].map(async file=>'data:image/'+(file.endsWith('.webp')?'webp':'jpeg')+';base64,'+(await fs.readFile(path.join(workbench,'../plugin-src/resources/colleague-library/sources/项目/02_内容素材/对标封面/科技姐聊AI',file))).toString('base64')));
await fs.writeFile(path.join(root,'index.html'),'<html lang="zh-CN"><div id="root"></div><script type="module" src="/probe.jsx"></script></html>');
await fs.writeFile(path.join(root,'probe.jsx'),`
import {useState} from 'react';import {createRoot} from 'react-dom/client';
import '${workbench}/node_modules/@douyinfe/semi-ui-19/react19-adapter';
import '${workbench}/node_modules/@douyinfe/semi-ui-19/lib/es/_base/base.css';
import '${workbench}/src/renderer/style.css';
import {CoverPanel} from '${workbench}/src/renderer/covers.tsx';
import {TemplatesPage} from '${workbench}/src/renderer/workspace-pages.tsx';
const originals=${JSON.stringify(originals)};
const image=(w,h,n)=>'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'"><rect width="100%" height="100%" fill="#437598"/><rect x="4" y="4" width="'+(w-8)+'" height="'+(h-8)+'" fill="none" stroke="white" stroke-width="5"/><text x="50%" y="50%" text-anchor="middle" font-size="26" fill="white">完整原图 '+n+'</text></svg>');
const templates=Array.from({length:6},(_,i)=>({id:'template-'+i,name:i===1?'长标题模板：保留换行与完整文字阅读入口验证':'模板风格 '+i,description:'完整说明。\\n'+('长说明仍须完整可读，保持原文换行。'.repeat(15)),designNotes:'来源拆解\\n'+('规则证据、原图边缘与固定关系。'.repeat(300))+'\\n来源资料末尾',builtin:true,catalogStatus:'active',version:1,currentVersion:1,versions:[{version:1,packageHash:'hash-'+i}],editToken:'template-token-'+i,deletedAt:null,rules:[],accepted:true,aiTested:true,samples:Array.from({length:i===0?50:3},(_,n)=>({assetHash:'sample-'+i+'-'+n,url:n===0?originals[i%originals.length]:n%2?image(640,400,n):originals[(i+1)%originals.length]}))}));
const photos=[{id:'own',title:'我的本人照片',isOwnPhoto:true,availability:'available',assetHash:'photo',url:image(300,400,'本人')}];
const content={id:'content',title:'这是已保存的长标题：明确展示本次封面使用的原始标题，不会因切换模板被替换',body:'完整正文\\n'+('正文保留全部内容。'.repeat(100)),editToken:'v1',deletedAt:null,materials:[],candidates:[],coverVariants:[]};
const copy={...templates[0],id:'copy',builtin:false,derivedFrom:{id:'template-0',version:1},name:'工作副本',version:2,currentVersion:2};
const favorite={id:'favorite',assetHash:'favorite',accepted:true,favorite:true,displayNumber:'1',note:'',variantId:null,url:originals[0]};
window.library={settings:{defaults:{templateId:'template-0',coverCount:1,photoId:null},customRatios:[]},templates:[...templates,copy],photos,contentDetails:[content,{...content,id:'source',title:'收藏来源',candidates:[favorite]}],collections:[]};
window.templates=templates;window.writes=[];window.edits=0;window.calls=[];
const cover=()=>({content,candidates:[],jobs:[],selectedCandidateId:null});
window.contentHub={readProductionCreation:async()=>({ok:true,value:{content,creation:window.packaging?{packaging:window.packaging}:null}}),listCoverAssets:async()=>({ok:true,value:{templates:[...templates,copy],photos}}),readCover:async()=>({ok:true,value:cover()}),mutateWorkspace:async input=>{window.writes.push(input);throw Error('Forbidden fixture write')},generateCover:async input=>{window.writes.push(input);throw Error('Forbidden generation')},readTemplateWorkflow:async input=>{window.calls.push(input);return {ok:true,value:{...templates[0],templateId:input.templateId,jobs:[]}}},readTemplateAssistantSetup:async()=>({ok:true,value:{host:'codex',ready:true}})};
function Fixture(){const [mode,setMode]=useState('cover'),[openKey,setOpenKey]=useState(1),[title,setTitle]=useState(content.title),[refreshToken,setRefreshToken]=useState(0);window.refreshAssets=()=>setRefreshToken(x=>x+1);window.showTemplates=()=>setMode('templates');window.showCover=()=>setMode('cover');window.reopen=()=>setOpenKey(x=>x+1);const props={library:window.library,assets:{templates:[...templates,copy],photos},busy:false,run:async action=>await action(),refresh:async()=>{}};return mode==='cover'?<CoverPanel {...props} content={content} status={{currentName:'隔离验证库',assistant:'codex'}} dirty={false} blocked={false} refreshToken={refreshToken} startOpenKey={openKey} readAutomatically={async()=>({assets:{templates:[...templates,copy],photos},cover:cover()})} onContent={()=>{}} titleEditor={{value:title,change:setTitle,save:()=>{},saveDisabled:true}}/>:<main><aside className="app-navigation">隔离验证</aside><div className="app-stage"><TemplatesPage {...props} useTemplate={()=>{}} managePhotos={()=>{}}/></div></main>}
createRoot(document.getElementById('root')).render(<Fixture/>);
`);
await build({configFile:false,root,base:'./',resolve:{alias:{react:path.join(workbench,'node_modules/react'),'react-dom':path.join(workbench,'node_modules/react-dom')}},oxc:{jsx:{runtime:'automatic'}},build:{outDir:path.join(root,'dist'),modulePreload:false,target:'chrome148'}});
async function main(root){
 const {app,BrowserWindow}=await import('electron'),{default:assert}=await import('node:assert/strict'),{default:fs}=await import('node:fs/promises'),{default:path}=await import('node:path');
 app.setPath('userData',path.join(root,'machine'));await app.whenReady();const win=new BrowserWindow({show:true,width:1280,height:860,webPreferences:{contextIsolation:true,nodeIntegration:false}});
 const run=source=>win.webContents.executeJavaScript(source).catch(error=>{console.error("Browser script:",source);throw error;}),paint=()=>run('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
 const wait=condition=>run(`new Promise((resolve,reject)=>{const end=Date.now()+5000;const check=()=>{if(${condition})return resolve();if(Date.now()>end)return reject(Error(${JSON.stringify(condition)}));setTimeout(check,20)};check()})`);
 const click=selector=>run(`document.querySelector(${JSON.stringify(selector)}).click()`);
 const evidence=process.env.NOVA_PROBE_EVIDENCE_DIR?path.join(process.env.NOVA_PROBE_EVIDENCE_DIR,'layout'):root;await fs.mkdir(evidence,{recursive:true});
 const screenshot=async name=>{await paint();await run('new Promise(r=>setTimeout(r,100))');await fs.writeFile(path.join(evidence,name+'.png'),(await win.webContents.capturePage()).toPNG());};
 const escape=async()=>{win.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});await paint();};
 const openSamples=async name=>{await run(`(()=>{const b=[...document.querySelectorAll('.creator-template-choice-meta button')].find(e=>e.getAttribute('aria-label')===${JSON.stringify('查看整组并选择：')}+${JSON.stringify(name)});b.focus();b.click()})()`);await wait('document.querySelector(".cover-sample-preview[open]")');};
 const applySamples=async()=>{await click('.cover-sample-footer button');await wait('!document.querySelector(".cover-sample-preview")');await paint();};
 const measurements=[];
 try{
  await win.loadFile(path.join(root,'dist/index.html'));await wait('document.querySelector("#generate-cover")&&!document.querySelector("#generate-cover").disabled');await paint();
  await run('window.packaging={coverTexts:[{id:"selected",text:"完整已选封面文字"+"长文案".repeat(80)+"文案末尾"}],selectedCoverTextId:"selected"};window.refreshAssets()');await wait('document.querySelector(".cover-content-summary").textContent.includes("已选封面文案优先")');
  assert.equal(await run('document.querySelector("#cover-title").getAttribute("aria-label")'),'内容标题');
  await run('[...document.querySelectorAll(".cover-content-summary details")].find(e=>e.textContent.includes("已选封面文案优先")).open=true');await paint();
  assert.ok(await run('(()=>{const p=[...document.querySelectorAll(".cover-content-summary details")].find(e=>e.textContent.includes("已选封面文案优先")).querySelector("p");p.scrollTop=p.scrollHeight;return p.textContent.endsWith("文案末尾")&&p.scrollTop+p.clientHeight>=p.scrollHeight-1})()'),'saved selected cover text can scroll through the last character');await screenshot('selected-cover-text-expanded');
  await run('[...document.querySelectorAll(".cover-content-summary details")].find(e=>e.textContent.includes("已选封面文案优先")).open=false');
  for(const [width,height] of [[1280,860],[960,680]]){
   win.setContentSize(width,height);await paint();
   const measure=await run(`(()=>{const body=document.querySelector('.cover-create-body').getBoundingClientRect(),rect=s=>{const r=document.querySelector(s)?.getBoundingClientRect();return r?{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom}:null};return {viewport:[innerWidth,innerHeight],body:rect('.cover-create-body'),title:rect('#cover-title'),photo:rect('#cover-photo'),count:rect('#cover-count'),ratio:rect('#cover-ratio'),generate:rect('#generate-cover'),required:document.querySelectorAll('.cover-create-dialog [required]').length,columns:getComputedStyle(document.querySelector('.cover-template-grid .semi-list-items')).gridTemplateColumns.split(' ').length};})()`);
   measurements.push(measure);await screenshot('composer-'+width);
   for(const key of ['title','photo','count','ratio'])assert.ok(measure[key]&&measure[key].y>=measure.body.y&&measure[key].bottom<=measure.body.bottom+1,key+' is in first screen '+width);
   assert.ok(measure.required<=5,'basic required fields are at most five');
   assert.ok(await run('document.documentElement.scrollWidth<=innerWidth'),'no horizontal page overflow');
   assert.equal(await run('document.querySelectorAll(".cover-create-dialog details[open]").length'),0,'all optional sections start collapsed');
  }
  assert.ok(await run(`[...document.querySelectorAll('.cover-template-choice')].every(e=>e.offsetHeight-e.querySelector('.creator-reference-stack').offsetHeight<110)`),'working version control no longer stretches template cards');
  win.setContentSize(1280,860);await paint();
  await openSamples('模板风格 0');
  assert.equal(await run('document.querySelectorAll(".cover-sample-option").length'),50,'all fifty samples mounted');
  assert.equal(await run('document.querySelectorAll(".cover-sample-option input:checked").length'),50,'current template defaults to all selected');
  await run('document.querySelectorAll(".cover-sample-option input")[49].focus()');win.webContents.sendInputEvent({type:'keyDown',keyCode:'Space'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Space'});await paint();
  assert.equal(await run('document.querySelectorAll(".cover-sample-option input:checked").length'),49,'keyboard toggles fiftieth sample');
  await screenshot('sample-fiftieth');await run('document.querySelector(".cover-sample-footer button").focus()');for(let i=0;i<3;i++){win.webContents.sendInputEvent({type:'keyDown',keyCode:'Tab'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Tab'});await paint();assert.equal(await run('document.activeElement?.closest("dialog")?.classList.contains("cover-sample-preview")'),true,'Tab remains in top preview');}await escape();
  assert.match(await run('document.querySelector(".cover-settings-selection").textContent'),/50 张样张/,'Esc cancels sample draft');
  assert.equal(await run('document.activeElement?.getAttribute("aria-label")'),'查看整组并选择：模板风格 0','Esc restores entry focus');
  await openSamples('模板风格 0');await run('document.querySelectorAll(".cover-sample-option input")[49].click()');await applySamples();
  await openSamples('模板风格 0');assert.equal(await run('document.querySelectorAll(".cover-sample-option input:checked").length'),49,'reopening keeps applied subset');
  await click('.cover-template-versions .semi-select');await wait('document.querySelector(".semi-select-option")');await run('[...document.querySelectorAll(".semi-select-option")].find(e=>e.textContent.includes("工作副本")).click()');await wait('document.querySelector(".image-preview h3").textContent==="工作副本"');await paint();
  assert.match(await run('document.querySelector(".cover-settings-selection").textContent'),/模板风格 0 · v1 · 49 张样张/,'previewing version does not replace active selection');
  await applySamples();assert.match(await run('document.querySelector(".cover-settings-selection").textContent'),/工作副本 · v2/,'explicit apply switches version');
  await openSamples('工作副本');await click('.cover-template-versions .semi-select');await wait('document.querySelector(".semi-select-option")');await run('[...document.querySelectorAll(".semi-select-option")].find(e=>e.textContent.includes("模板风格 0")).click()');await wait('document.querySelector(".image-preview h3").textContent==="模板风格 0"');await paint();await applySamples();
  await click('[aria-label="封面模板分页：下一页"]');await paint();await openSamples('模板风格 5');
  assert.equal(await run('document.querySelectorAll(".cover-sample-option input:checked").length'),3,'unchosen template preview defaults to all');
  await run('document.querySelectorAll(".cover-sample-option input")[0].click()');await escape();
  assert.match(await run('document.querySelector(".cover-settings-selection").textContent'),/模板风格 0/,'closing another group keeps current template');
  await click('[aria-label="封面模板分页：上一页"]');await paint();
  await openSamples('模板风格 0');await run('document.querySelectorAll(".cover-sample-option input").forEach(e=>{if(e.checked)e.click()})');await paint();
  assert.equal(await run('document.querySelector(".cover-sample-footer button").disabled'),true,'zero samples cannot apply');
  assert.match(await run('document.querySelector(".cover-sample-footer [role=alert]").textContent'),/至少选择一张/);await escape();
  await openSamples('模板风格 0');await run('window.templates[0].version=2;window.templates[0].currentVersion=2;window.refreshAssets()');await wait('document.querySelector(".cover-sample-footer button").disabled');
  assert.match(await run('document.querySelector(".cover-sample-footer [role=alert]").textContent'),/版本或样张已变化/,'stale preview version blocks apply');await escape();assert.equal(await run('document.querySelector("#generate-cover").disabled'),true,'stale active version blocks generation');
  await click('[aria-label="选择模板：模板风格 0"]');await wait('!document.querySelector("#generate-cover").disabled');
  await run('window.templates[0].samples=window.templates[0].samples.slice(1);window.refreshAssets()');await wait('document.querySelector("#generate-cover").disabled');assert.match(await run('document.querySelector(".cover-template-pane [role=alert]").textContent'),/样张已变化/,'missing selected sample blocks generation');
  await click('[aria-label="选择模板：模板风格 0"]');await wait('!document.querySelector("#generate-cover").disabled');
  await run('window.templates[0].samples=window.library.templates.find(e=>e.id==="copy").samples;window.refreshAssets()');await paint();
  await click('[aria-label="选择模板：长标题模板：保留换行与完整文字阅读入口验证"]');await paint();
  assert.match(await run('document.querySelector(".cover-template-selection").textContent'),/长标题模板/);
  await run('document.querySelector("#cover-count").focus();document.querySelector("#cover-count").select()');win.webContents.insertText('4');await paint();
  await run('document.querySelector("#cover-ratio").click()');await wait('document.querySelector(".semi-select-option")');await run('[...document.querySelectorAll(".semi-select-option")].find(e=>e.textContent==="16:9").click()');await paint();
  await click('#cover-photo');await wait('document.querySelector(".semi-select-option")');await run('[...document.querySelectorAll(".semi-select-option")].find(e=>e.textContent==="我的本人照片").click()');await paint();
  await run('[...document.querySelectorAll("button")].find(e=>e.textContent==="暂时收起").click();window.reopen()');await wait('document.querySelector("dialog[open] #generate-cover")');
  assert.equal(await run('document.getElementById("cover-count").value'),'4');assert.match(await run('document.querySelector("#cover-ratio").textContent'),/16:9/);assert.match(await run('document.querySelector("#cover-photo").textContent'),/本人照片/);
  await openSamples('长标题模板：保留换行与完整文字阅读入口验证');await run('document.querySelectorAll(".cover-sample-option img").forEach(e=>e.loading="eager")');await wait('[...document.querySelectorAll(".cover-sample-option img")].every(e=>e.naturalWidth>0)');
  const images=await run(`[...document.querySelectorAll('.cover-sample-option img')].slice(0,2).map(e=>{const r=e.getBoundingClientRect();return {width:r.width,height:r.height,ratio:e.naturalWidth/e.naturalHeight,fit:getComputedStyle(e).objectFit}})`);
  for(const item of images){assert.equal(item.fit,'contain');assert.ok(item.height>=150,'readable sample frame');}
  await screenshot('samples');await escape();
  assert.equal(await run('document.querySelector(".cover-style-details")'),null,'no second right-side sample entry');
  const beforeRatioHeight=await run('document.querySelector(".cover-size-settings").offsetHeight');
  await click('#cover-ratio');await wait('document.querySelector(".semi-select-option")');await run('[...document.querySelectorAll(".semi-select-option")].find(e=>e.textContent==="自定义").click()');await wait('document.querySelector("#cover-custom-ratio")');await paint();
  assert.equal(await run('document.activeElement.id'),'cover-custom-ratio','custom mode focuses input');assert.ok(await run('document.querySelector(".cover-size-settings").offsetHeight')<=beforeRatioHeight+1,'custom ratio stays in same field row');
  const enterRatio=async text=>{await run('document.querySelector("#cover-custom-ratio").focus();document.querySelector("#cover-custom-ratio").select()');win.webContents.insertText(text);await paint();};
  await enterRatio('0:3');assert.equal(await run('document.querySelector("[aria-label=应用自定义比例]").disabled'),true,'invalid draft cannot apply');assert.equal(await run('document.querySelector("#generate-cover").disabled'),true,'editing ratio blocks generation');await escape();
  assert.equal(await run('!!document.querySelector(".cover-create-dialog[open]")'),true,'ratio Esc does not close composer');assert.match(await run('document.querySelector("#cover-ratio").textContent'),/16:9/,'cancel retains old ratio');
  await click('#cover-ratio');await wait('document.querySelector(".semi-select-option")');await run('[...document.querySelectorAll(".semi-select-option")].find(e=>e.textContent==="自定义").click()');await enterRatio('2:3');win.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter'});await wait('document.querySelector("#cover-ratio")');await paint();assert.match(await run('document.querySelector("#cover-ratio").textContent'),/2:3/,'Enter applies ratio');assert.equal(await run('document.activeElement.id'),'cover-ratio','apply returns focus');
  await screenshot('ratio-same-row');
  await click('#cover-ratio');await wait('document.querySelector(".semi-select-option")');await run('[...document.querySelectorAll(".semi-select-option")].find(e=>e.textContent==="自定义").click()');await wait('document.querySelector("#cover-custom-ratio")');await enterRatio('21:9');
  win.setContentSize(960,680);await paint();assert.ok(await run('document.querySelector("#cover-custom-ratio").getBoundingClientRect().width>=50'),'custom input readable at minimum width');await screenshot('ratio-editor-960');await click('[aria-label="取消自定义比例"]');win.setContentSize(1280,860);await paint();
  await click('#cover-ratio');await wait('document.querySelector(".semi-select-option")');await run('[...document.querySelectorAll(".semi-select-option")].find(e=>e.textContent==="1:1").click()');await paint();assert.match(await run('document.querySelector("#cover-ratio").textContent'),/1:1/,'can return to presets');
  await run('document.querySelector(".cover-composition-references").closest("details").open=true;document.querySelector(".cover-composition-references").scrollIntoView({block:"start"})');await paint();
  assert.ok(await run('document.querySelector(".cover-composition-references .cover-sample-art").getBoundingClientRect().height>=150'),'favorite reference has a readable frame');await screenshot('favorites');
  assert.equal(await run('document.querySelector(".cover-edit-content")'),null,'redundant editor jump removed');assert.equal(await run('window.edits'),0);await run('[...document.querySelectorAll("button")].find(e=>e.textContent==="暂时收起").click()');
  if(process.env.NOVA_COVER_ONLY==='1'){await fs.writeFile(path.join(evidence,'measurements.json'),JSON.stringify({status:'PASS',scope:'cover-only',measurements,images},null,2));console.log('PASS: cover-only; selected packaging text expansion; first-screen basics 1280x860/960x680; fifty sample keyboard/Tab/Esc/focus; selection/version/hash guards; custom ratio; retained content/photo/count/material/favorites; no writes');app.exit(0);return;}
  await run('window.showTemplates()');await wait('document.querySelectorAll(".creator-style-card").length===6');await paint();
  const cards=await run(`[...document.querySelectorAll('.creator-style-card')].map(e=>{const b=e.querySelector('.creator-style-card-body').getBoundingClientRect(),a=e.querySelector('.creator-style-actions').getBoundingClientRect();return {body:b.height,gap:a.top-e.querySelector('.creator-template-group-count').getBoundingClientRect().bottom}})`);
  await fs.writeFile(path.join(evidence,'template-card-measurements.json'),JSON.stringify({viewport:await run('[innerWidth,innerHeight]'),cards},null,2));await screenshot('templates-before-card-assertion');
  assert.ok(cards.every(item=>item.body<160&&item.gap<30),'no tall empty card body');await screenshot('templates');
  await click('.creator-template-details');await wait('document.querySelector(".creator-template-detail-body")');await paint();
  const openReader=await run('!!document.querySelector(".creator-template-read-more")');
  if(openReader){await click('.creator-template-read-more');await wait('document.querySelector(".management-dialog[open] .template-reading-body")');await paint();assert.ok(await run('document.querySelector(".template-reading-body").closest("dialog").getBoundingClientRect().width>=560'),'long reading dialog width');assert.ok(await run('document.querySelector(".template-reading-body").textContent.includes("来源资料末尾")'),'full source notes are retained');await screenshot('details');await click('.template-reading-body button');await wait('document.querySelector(".image-preview[open]")');assert.equal(await run('document.querySelectorAll(".image-preview .preview-grid img").length'),50,'last group sample is mounted');await run('[...document.querySelectorAll(".image-preview button")].find(e=>e.textContent==="关闭预览").click()');await paint();assert.equal(await run('!!document.querySelector(".management-dialog[open] .template-reading-body")'),true,'group preview returns to reading dialog');}
  else {await screenshot('details');assert.ok(await run('document.querySelector(".creator-template-detail-body").getBoundingClientRect().height>=400'));}
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});await paint();
  assert.equal(await run('document.activeElement?.classList.contains("creator-template-details")'),true,'closing reader returns focus to its original menu trigger');
  assert.equal(await run('window.writes.length'),0,'selection, reading and title entry perform no library writes or generation');
  await fs.writeFile(path.join(evidence,'measurements.json'),JSON.stringify({status:'PASS',measurements,images,cards},null,2));console.log('PASS: first-screen basics 1280x860/960x680; fifty sample keyboard/Tab/Esc/focus; draft apply/cancel and version switches; cross-page group isolation; zero/stale version/missing hash gates; same-row ratio Enter/Esc/cancel/preset and minimum-width input; retained content/photo/count/material/favorites; full details and no writes');app.exit(0);
 }catch(error){await screenshot('failure');await fs.writeFile(path.join(evidence,'measurements.json'),JSON.stringify({measurements,error:error.stack},null,2));console.error(error);console.error('Artifacts:',root);app.exit(1)}
}
await fs.writeFile(path.join(root,'main.mjs'),`(${main.toString()})(${JSON.stringify(root)});`);
const child=spawn(electron,[path.join(root,'main.mjs')],{stdio:'inherit',env:{...process.env,ELECTRON_RUN_AS_NODE:''}});
const timer=setTimeout(()=>child.kill('SIGKILL'),90000);
process.exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>resolve(code??1))});clearTimeout(timer);console.log('Probe fixture:',root);
