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
const templates=Array.from({length:5},(_,i)=>({id:'template-'+i,name:i===1?'长标题模板：保留换行与完整文字阅读入口验证':'模板风格 '+i,description:'完整说明。\\n'+('长说明仍须完整可读，保持原文换行。'.repeat(15)),designNotes:'来源拆解\\n'+('规则证据、原图边缘与固定关系。'.repeat(300))+'\\n来源资料末尾',builtin:true,catalogStatus:'active',version:1,currentVersion:1,versions:[{version:1,packageHash:'hash-'+i}],editToken:'template-token-'+i,deletedAt:null,rules:[],accepted:true,aiTested:true,samples:Array.from({length:i===0?50:3},(_,n)=>({assetHash:'sample-'+i+'-'+n,url:n===0?originals[i%originals.length]:n%2?image(640,400,n):originals[(i+1)%originals.length]}))}));
const photos=[{id:'own',title:'我的本人照片',isOwnPhoto:true,availability:'available',assetHash:'photo',url:image(300,400,'本人')}];
const content={id:'content',title:'这是已保存的长标题：明确展示本次封面使用的原始标题，不会因切换模板被替换',body:'完整正文\\n'+('正文保留全部内容。'.repeat(100)),editToken:'v1',deletedAt:null,materials:[],candidates:[],coverVariants:[]};
const copy={...templates[0],id:'copy',builtin:false,derivedFrom:{id:'template-0',version:1},name:'工作副本',version:2};
const favorite={id:'favorite',assetHash:'favorite',accepted:true,favorite:true,displayNumber:'1',note:'',variantId:null,url:originals[0]};
window.library={settings:{defaults:{templateId:'template-0',coverCount:1,photoId:null},customRatios:[]},templates:[...templates,copy],photos,contentDetails:[content,{...content,id:'source',title:'收藏来源',candidates:[favorite]}],collections:[]};
window.writes=[];window.edits=0;window.calls=[];
const cover=()=>({content,candidates:[],jobs:[],selectedCandidateId:null});
window.contentHub={listCoverAssets:async()=>({ok:true,value:{templates:[...templates,copy],photos}}),readCover:async()=>({ok:true,value:cover()}),mutateWorkspace:async input=>{window.writes.push(input);throw Error('Forbidden fixture write')},generateCover:async input=>{window.writes.push(input);throw Error('Forbidden generation')},readTemplateWorkflow:async input=>{window.calls.push(input);return {ok:true,value:{...templates[0],templateId:input.templateId,jobs:[]}}},readTemplateAssistantSetup:async()=>({ok:true,value:{host:'codex',ready:true}})};
function Fixture(){const [mode,setMode]=useState('cover'),[openKey,setOpenKey]=useState(1),[title,setTitle]=useState(content.title);window.showTemplates=()=>setMode('templates');window.showCover=()=>setMode('cover');window.reopen=()=>setOpenKey(x=>x+1);const props={library:window.library,assets:{templates:[...templates,copy],photos},busy:false,run:async action=>await action(),refresh:async()=>{}};return mode==='cover'?<CoverPanel {...props} content={content} status={{currentName:'隔离验证库',assistant:'codex'}} dirty={false} blocked={false} refreshToken={0} startOpenKey={openKey} readAutomatically={async()=>({assets:{templates:[...templates,copy],photos},cover:cover()})} onContent={()=>{}} titleEditor={{value:title,change:setTitle,save:()=>{},saveDisabled:true,openBody:()=>{window.edits++;}}}/>:<main><aside className="app-navigation">隔离验证</aside><div className="app-stage"><TemplatesPage {...props} useTemplate={()=>{}} managePhotos={()=>{}}/></div></main>}
createRoot(document.getElementById('root')).render(<Fixture/>);
`);
await build({configFile:false,root,base:'./',resolve:{alias:{react:path.join(workbench,'node_modules/react'),'react-dom':path.join(workbench,'node_modules/react-dom')}},oxc:{jsx:{runtime:'automatic'}},build:{outDir:path.join(root,'dist'),modulePreload:false,target:'chrome148'}});
async function main(root){
 const {app,BrowserWindow}=await import('electron'),{default:assert}=await import('node:assert/strict'),{default:fs}=await import('node:fs/promises'),{default:path}=await import('node:path');
 app.setPath('userData',path.join(root,'machine'));await app.whenReady();const win=new BrowserWindow({show:true,width:1280,height:860,webPreferences:{contextIsolation:true,nodeIntegration:false}});
 const run=source=>win.webContents.executeJavaScript(source),paint=()=>run('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
 const wait=condition=>run(`new Promise((resolve,reject)=>{const end=Date.now()+5000;const check=()=>{if(${condition})return resolve();if(Date.now()>end)return reject(Error(${JSON.stringify(condition)}));setTimeout(check,20)};check()})`);
 const click=selector=>run(`document.querySelector(${JSON.stringify(selector)}).click()`);
 const screenshot=async name=>fs.writeFile(path.join(root,name+'.png'),(await win.webContents.capturePage()).toPNG());
 const measurements=[];
 try{
  await win.loadFile(path.join(root,'dist/index.html'));await wait('document.querySelector("#generate-cover")&&!document.querySelector("#generate-cover").disabled');await paint();
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
  await run('document.querySelector(".cover-style-details").open=true');await click('.cover-template-versions .semi-select');await wait('document.querySelector(".semi-select-option")');await run('[...document.querySelectorAll(".semi-select-option")].find(e=>e.textContent.includes("工作副本")).click()');await paint();assert.match(await run('document.querySelector(".cover-settings-selection").textContent'),/工作副本 · v2/,'selected working version remains visible in settings');await run('document.querySelector(".cover-style-details").open=false');
  await click('[aria-label="选择模板：长标题模板：保留换行与完整文字阅读入口验证"]');await paint();
  assert.match(await run('document.querySelector(".cover-template-selection").textContent'),/长标题模板/);
  await run('document.querySelector("#cover-count").focus();document.querySelector("#cover-count").select()');win.webContents.insertText('4');await paint();
  await run('document.querySelector("#cover-ratio").click()');await wait('document.querySelector(".semi-select-option")');await run('[...document.querySelectorAll(".semi-select-option")].find(e=>e.textContent==="16:9").click()');await paint();
  await click('#cover-photo');await wait('document.querySelector(".semi-select-option")');await run('[...document.querySelectorAll(".semi-select-option")].find(e=>e.textContent==="我的本人照片").click()');await paint();
  await run('[...document.querySelectorAll("button")].find(e=>e.textContent==="暂时收起").click();window.reopen()');await wait('document.querySelector("dialog[open] #generate-cover")');
  assert.equal(await run('document.getElementById("cover-count").value'),'4');assert.match(await run('document.querySelector("#cover-ratio").textContent'),/16:9/);assert.match(await run('document.querySelector("#cover-photo").textContent'),/本人照片/);
  await run('document.querySelector(".cover-style-details").open=true;document.querySelector(".cover-style-details").scrollIntoView({block:"start"})');await paint();await run('document.querySelectorAll(".cover-style-details img").forEach(e=>e.loading="eager")');await wait('[...document.querySelectorAll(".cover-style-details .cover-artwork-original")].every(e=>e.naturalWidth>0)');
  const images=await run(`[...document.querySelectorAll('.cover-style-details .cover-artwork-original')].slice(0,2).map(e=>{const r=e.getBoundingClientRect(),frame=e.closest('.cover-sample-art').getBoundingClientRect();return {width:r.width,height:r.height,ratio:e.naturalWidth/e.naturalHeight,fit:getComputedStyle(e).objectFit,frame:{width:frame.width,height:frame.height}}})`);
  for(const item of images){assert.equal(item.fit,'contain');assert.ok(item.ratio<1?item.height>=150:item.width>=120,'portrait height and landscape width are readable');assert.ok(Math.abs(item.width/item.height-item.ratio)<.02,'original proportions');assert.ok(item.frame.width/item.frame.height<1.8,'sample is not a wide short strip');}
  await screenshot('samples');
  await run('document.querySelector(".cover-style-details").open=false;document.querySelector(".cover-composition-references").closest("details").open=true;document.querySelector(".cover-composition-references").scrollIntoView({block:"start"})');await paint();
  assert.ok(await run('document.querySelector(".cover-composition-references .cover-sample-art").getBoundingClientRect().height>=150'),'favorite reference has a readable frame');await screenshot('favorites');
  await click('.cover-edit-content');await paint();assert.equal(await run('window.edits'),1,'title edits route to original editor');assert.equal(await run('!!document.querySelector(".cover-create-dialog[open]")'),false);
  await run('window.showTemplates()');await wait('document.querySelectorAll(".creator-style-card").length===5');await paint();
  const cards=await run(`[...document.querySelectorAll('.creator-style-card')].map(e=>{const b=e.querySelector('.creator-style-card-body').getBoundingClientRect(),a=e.querySelector('.creator-style-actions').getBoundingClientRect();return {body:b.height,gap:a.top-e.querySelector('.creator-template-group-count').getBoundingClientRect().bottom}})`);
  assert.ok(cards.every(item=>item.body<160&&item.gap<30),'no tall empty card body');await screenshot('templates');
  await click('.creator-template-details');await wait('document.querySelector(".creator-template-detail-body")');await paint();
  const openReader=await run('!!document.querySelector(".creator-template-read-more")');
  if(openReader){await click('.creator-template-read-more');await wait('document.querySelector(".management-dialog[open] .template-reading-body")');await paint();assert.ok(await run('document.querySelector(".template-reading-body").closest("dialog").getBoundingClientRect().width>=560'),'long reading dialog width');assert.ok(await run('document.querySelector(".template-reading-body").textContent.includes("来源资料末尾")'),'full source notes are retained');await screenshot('details');await click('.template-reading-body button');await wait('document.querySelector(".image-preview[open]")');assert.equal(await run('document.querySelectorAll(".image-preview .preview-grid img").length'),50,'last group sample is mounted');await run('[...document.querySelectorAll(".image-preview button")].find(e=>e.textContent==="关闭预览").click()');await paint();assert.equal(await run('!!document.querySelector(".management-dialog[open] .template-reading-body")'),true,'group preview returns to reading dialog');}
  else {await screenshot('details');assert.ok(await run('document.querySelector(".creator-template-detail-body").getBoundingClientRect().height>=400'));}
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});await paint();
  assert.equal(await run('document.activeElement?.classList.contains("creator-template-details")'),true,'closing reader returns focus to its original menu trigger');
  assert.equal(await run('window.writes.length'),0,'selection, reading and title entry perform no library writes or generation');
  await fs.writeFile(path.join(root,'measurements.json'),JSON.stringify({measurements,images,cards},null,2));console.log('PASS: first-screen basics 1280x860/960x680, collapsed optional sections, retained selections, portrait/landscape contain, readable samples/favorites, compact cards, wide details and no writes');app.exit(0);
 }catch(error){await screenshot('failure');await fs.writeFile(path.join(root,'measurements.json'),JSON.stringify({measurements,error:error.stack},null,2));console.error(error);console.error('Artifacts:',root);app.exit(1)}
}
await fs.writeFile(path.join(root,'main.mjs'),`(${main.toString()})(${JSON.stringify(root)});`);
const child=spawn(electron,[path.join(root,'main.mjs')],{stdio:'inherit',env:{...process.env,ELECTRON_RUN_AS_NODE:''}});
const timer=setTimeout(()=>child.kill('SIGKILL'),90000);
process.exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>resolve(code??1))});clearTimeout(timer);console.log('Probe fixture:',root);
