// Copied beside freshly compiled production desktop.mjs; no renderer/IPC implementation is mocked.
import {app} from 'electron';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import {performance} from 'node:perf_hooks';import {startDesktop} from './desktop.mjs';
const config=JSON.parse(process.env.NCH_PERF_CONFIG),trace=[],samples=[];let stage='startup';
const round=n=>Math.round(n*100)/100;
startDesktop({show:true,userData:config.userData,marketRoot:path.join(config.root,'empty-market'),dialogs:{library:async()=>config.library,backup:async()=>null,destination:async()=>null},async ready({window,controller,worker}){
 window.setSize(1440,1000);window.webContents.setBackgroundThrottling(false);
 const run=code=>window.webContents.executeJavaScript(code).catch(e=>{console.error('Renderer script',code);throw e;});
 const wait=condition=>run(`new Promise((resolve,reject)=>{const end=Date.now()+90000;function poll(){if(${condition})return resolve(true);if(Date.now()>end)return reject(Error('Timeout '+${JSON.stringify(condition)}+' / '+document.body.innerText.slice(-800)));setTimeout(poll,10)}poll()})`);
 const idle=`document.querySelector('main[data-app="ready"][data-loaded="true"][data-busy="false"]')`;
 let active=0;
 for(const [scope,target] of [['main',worker],['raster',controller.covers.reader]]){const original=target.call.bind(target);target.call=async(op,args)=>{const start=performance.now(),at=stage;active++;try{const value=await original(op,args);trace.push({scope,op,stage:at,durationMs:round(performance.now()-start),bytes:op==='raster'?value?.data?.byteLength:undefined});return value;}finally{active--;}};}
 const resource=controller.covers.resource.bind(controller.covers);controller.covers.resource=async url=>{const start=performance.now(),at=stage;const value=await resource(url);trace.push({scope:'protocol',op:'resource',stage:at,durationMs:round(performance.now()-start),bytes:value?.data?.byteLength});return value;};
 const settle=async()=>{const end=Date.now()+90000;while(Date.now()<end){const before=trace.length;await new Promise(r=>setTimeout(r,150));if(!active&&before===trace.length){await run('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');return;}}throw Error('Native reads did not settle');};
 const decode=()=>run(`(async()=>{
   const root=()=>document.querySelector('dialog[open]')||document;
   const visible=()=>[...root().querySelectorAll('img')].filter(img=>{
     const r=img.getBoundingClientRect();if(!(r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth))return false;
     for(let e=img;e;e=e.parentElement){const s=getComputedStyle(e);if(s.display==='none'||s.visibility==='hidden'||s.visibility==='collapse'||Number(s.opacity)===0||e.hidden)return false;}return true;
   });
   for(let attempt=0;attempt<5;attempt++){
     const images=visible(),urls=images.map(i=>i.currentSrc||i.src);if(!images.length)throw Error('Fixture has no visible images');
     await Promise.all(images.map(img=>img.decode()));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
     const after=visible();if(after.length!==images.length||after.some((img,n)=>img!==images[n]||(img.currentSrc||img.src)!==urls[n]))continue;
     const unique=[...new Map(images.map(i=>[i.currentSrc||i.src,i])).values()];
     const rows=images.map(i=>({url:i.currentSrc||i.src,assetHash:(i.currentSrc||i.src).match(/\\/([a-f0-9]{64})(?:$|[?#])/)?.[1]??null,width:i.naturalWidth,height:i.naturalHeight,renderedWidth:Math.round(i.getBoundingClientRect().width),renderedHeight:Math.round(i.getBoundingClientRect().height)}));
     return {scope:root()===document?'page':'active-modal',elements:images.length,uniqueUrls:unique.length,uniqueAssetHashes:new Set(rows.map(r=>r.assetHash).filter(Boolean)).size,naturalPixels:images.reduce((n,i)=>n+i.naturalWidth*i.naturalHeight,0),uniqueUrlPixels:unique.reduce((n,i)=>n+i.naturalWidth*i.naturalHeight,0),images:rows,resources:performance.getEntriesByType('resource').filter(r=>urls.includes(r.name)).map(r=>({durationMs:r.duration,transferSize:r.transferSize,encodedBodySize:r.encodedBodySize})),viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio}};
   }throw Error('Visible image set did not stabilize after decode');
 })()`);
 const measure=async(name,action,condition)=>{stage=name;const before=trace.length,start=performance.now();await action();await wait(`${idle}&&(${condition})`);const domReadyMs=round(performance.now()-start),images=await decode(),firstVisibleDecodedMs=round(performance.now()-start);const value={name,domReadyMs,firstVisibleDecodedMs,decodeAfterReadyMs:round(firstVisibleDecodedMs-domReadyMs),images,operationCount:trace.length-before};samples.push(value);console.log(JSON.stringify({plans:config.plans,trial:config.trial,...value}));await settle();value.nativeSettledMs=round(performance.now()-start);value.operationCount=trace.length-before;if(config.trial===0&&!name.startsWith('warm'))await fs.writeFile(config.output+'.'+name+'.png',(await window.webContents.capturePage()).toPNG());return value;};
 try{
  await wait(idle);await settle();
  await measure('fresh-process-open-overview',()=>run('document.getElementById("welcome-open-library").click()'),'document.querySelector(".creator-overview") && document.querySelector(".creator-featured img")');
  const pages=[['content','document.querySelectorAll(".content-title-link").length===20'],['templates','document.querySelectorAll(".creator-style-card").length===20'],['overview','document.querySelector(".creator-featured img")']];
  for(let pass=0;pass<(config.quick?2:3);pass++){
   for(const [page,condition] of pages.filter(([page])=>!config.quick||page==='templates'))await measure(`${pass?'warm-'+pass:(page==='overview'?'return-after-open':'first-visit')}-${page}`,()=>run(`document.getElementById('nav-${page}').click()`),condition);
   await measure(`${pass?'warm-'+pass:'first-visit'}-gallery`,async()=>{await run('document.getElementById("nav-content").click()');await wait('document.querySelector(".content-title-link")');await run('document.querySelector(".content-title-link").click()');},'document.querySelectorAll("#cover-candidates .cover-result-image").length===6');
  }
  // Preserve every builtin group; open the largest group's real original-image preview
  // separately from normal first-screen navigation (which uses one image per template).
  if(!config.quick){
  await run('document.getElementById("nav-templates").click()');await wait('document.querySelectorAll(".creator-style-card").length===20');await settle();
  const maxSamples=await run(`Math.max(...[...document.querySelectorAll('.creator-reference-stack')].map(b=>Number(b.getAttribute('aria-label').match(/的 (\\d+) 张/)[1])))`);
  await measure('complete-builtin-group-preview',()=>run(`[...document.querySelectorAll('.creator-reference-stack')].find(b=>Number(b.getAttribute('aria-label').match(/的 (\\d+) 张/)[1])===${maxSamples}).click()`),`document.querySelectorAll('dialog.image-preview[open] .preview-grid img').length===${maxSamples}`);
  }
  const all=await run('window.contentHub.readWorkspaceLibrary()');assert.equal(all.ok,true);assert.equal(all.value.contentDetails.length,100);assert.equal(all.value.contentDetails.reduce((n,d)=>n+d.plans.length,0),config.plans);
  await fs.writeFile(config.output,JSON.stringify({passed:true,config:{plans:config.plans,trial:config.trial},samples,trace,electron:process.versions.electron,platform:process.platform,arch:process.arch},null,2));app.exit(0);
 }catch(error){console.error(error);await fs.writeFile(config.output,JSON.stringify({passed:false,error:String(error),samples,trace},null,2));await fs.writeFile(config.output+'.png',(await window.webContents.capturePage()).toPNG());app.exit(1);}
}}).catch(error=>{console.error(error);app.exit(1)});
