// Test entry only: copied beside the unchanged installed desktop.mjs.
import {app} from 'electron';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {startDesktop} from './desktop.mjs';

const root = process.env.NOVA_INSTALLED_CAPACITY_ROOT;
assert.ok(root && path.isAbsolute(root));
const samples = [], started = Number(process.env.NOVA_INSTALLED_CAPACITY_STARTED);
startDesktop({show: false, userData: path.join(root, 'machine'), marketRoot: path.join(root, 'plugin-marketplace'), dialogs: {library: async () => path.join(root, 'library'), backup: async () => null, destination: async () => null, templateImages: async () => null, material: async () => null}, async ready({window,worker,controller}) {
  const operations=[],wrapped=new Set(),traceStart=performance.now();let stage='outside-timed-stage';
  const round=value=>Math.round(value*100)/100;
  for(const [label,target] of [['main',worker],['resource',controller.covers.reader]]){if(wrapped.has(target))continue;wrapped.add(target);const original=target.call;target.call=async function(...args){const start=performance.now(),current=stage;try{return await Reflect.apply(original,this,args);}finally{operations.push({worker:label,op:args[0],stage:current,startedMs:round(start-traceStart),durationMs:round(performance.now()-start)});}};}
  const aggregate=records=>{const groups=new Map();for(const item of records){const key=`${item.worker}:${item.op}`,value=groups.get(key)??{worker:item.worker,op:item.op,count:0,totalMs:0,maxMs:0};value.count++;value.totalMs+=item.durationMs;value.maxMs=Math.max(value.maxMs,item.durationMs);groups.set(key,value);}return [...groups.values()].map(value=>({...value,totalMs:round(value.totalMs)})).sort((a,b)=>b.totalMs-a.totalMs);};
  const workerTrace=()=>({scope:'WorkerClient.call wrappers installed in the test entry ready callback before open-library UI. Original this binding, arguments, result and rejection preserved. Times include worker round trip; exclude controller queue wait before call. Stage is recorded at invocation; overlapping work may finish in another stage. No inputs or outputs recorded.',operations,summary:aggregate(operations),byStage:[...new Set(operations.map(item=>item.stage))].map(stage=>({stage,summary:aggregate(operations.filter(item=>item.stage===stage))}))});
  const run = code => window.webContents.executeJavaScript(code);
  const idle = `document.querySelector('main[data-app="ready"][data-loaded="true"][data-busy="false"]')`;
  const wait = condition => run(`new Promise((resolve,reject)=>{const end=Date.now()+60000;function poll(){if(${condition})return resolve(true);if(Date.now()>end)return reject(new Error('Timed out: '+${JSON.stringify(condition)}+' / '+document.body.innerText.slice(-2000)));setTimeout(poll,20)}poll()})`);
  const settle = () => run(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
  const memory = async () => ({mainBytes: process.memoryUsage(), rendererPid: window.webContents.getOSProcessId(), processMetrics: app.getAppMetrics().map(({pid,type,memory,cpu})=>({pid,type,memory,cpu}))});
  const timed = async (name, action) => {const previous=stage;stage=name;try{const start=performance.now(); const value=await action(); await settle(); const result={name,durationMs:round(performance.now()-start),value,memory:await memory()};samples.push(result);console.log(JSON.stringify({name,durationMs:result.durationMs,value}));return value;}finally{stage=previous;}};
  const navigate = async (page, condition) => {await run(`document.getElementById('nav-${page}').click()`);await wait(`${idle}&&(${condition})`);};
  const search = value => run(`(()=>{const e=document.querySelector('input[aria-label="搜索内容"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  const decode = (selector,expected) => run(`(async()=>{const imgs=[...document.querySelectorAll(${JSON.stringify(selector)})];if(imgs.length!==${expected})throw new Error('Expected ${expected} images, got '+imgs.length);for(const i of imgs){i.loading='eager';await i.decode();if(!i.naturalWidth)throw new Error('Image failed')}const urls=new Set(imgs.map(i=>i.currentSrc)),resources=performance.getEntriesByType('resource').filter(r=>urls.has(r.name));return {elements:imgs.length,uniqueUrls:urls.size,pixels:imgs.reduce((n,i)=>n+i.naturalWidth*i.naturalHeight,0),resourceTimings:resources.map(r=>({durationMs:r.duration,transferSize:r.transferSize,decodedBodySize:r.decodedBodySize}))}})()`);
  try {
    await wait(idle);await settle();samples.push({name:'launch-to-welcome',durationMs:Date.now()-started,memory:await memory()});
    await timed('open-library-to-ready',async()=>{await run(`document.getElementById('welcome-open-library').click()`);await wait(`${idle}&&document.getElementById('library-summary').textContent==='library'`);return run(`document.querySelector('main').dataset`);});
    const workspace=await run('window.contentHub.readWorkspaceLibrary()');assert.equal(workspace.ok,true);assert.equal(workspace.value.contentDetails.length,100);assert.equal(workspace.value.contentDetails.reduce((n,c)=>n+c.candidates.length,0),600);assert.equal(workspace.value.contentDetails.reduce((n,c)=>n+c.plans.length,0),300);
    await timed('content-list-dom',async()=>{await navigate('content',`document.querySelectorAll('.content-title-link').length===100`);return run(`document.querySelectorAll('.content-title-link').length`);});
    await timed('content-list-100-thumbnails-full-decode',()=>decode('.content-title-link img',100));
    await timed('search-input-to-one-row',async()=>{await search('Capacity 100');await wait(`document.querySelectorAll('.content-title-link').length===1`);return run(`document.querySelector('.content-title-link').textContent`);});
    await timed('content-detail-six-candidates-dom',async()=>{await run(`document.querySelector('.content-title-link').click()`);await wait(`${idle}&&document.querySelectorAll('#cover-candidates .cover-result-image').length===6`);return run(`document.querySelectorAll('#cover-candidates .cover-result-image').length`);});
    await timed('candidate-six-originals-full-decode',()=>decode('#cover-candidates img.cover-artwork-original',6));
    await timed('template-view-dom',async()=>{await navigate('templates',`document.querySelectorAll('.creator-style-card').length>0`);return run(`document.querySelectorAll('.creator-style-card').length`);});
    assert.ok(workspace.value.templates.length>0);
    assert.equal(await run(`document.querySelectorAll('.creator-style-card').length`),workspace.value.templates.length);
    await timed('template-full-page-originals-full-decode',()=>decode('.creator-templates img.creator-template-original',workspace.value.templates.length));
    await timed('calendar-dom',async()=>{await navigate('calendar',`document.querySelector('.semi-schedule-calendar')`);const result=await run(`({days:document.querySelectorAll('.semi-schedule-day').length,renderedEvents:document.querySelectorAll('.semi-schedule-event').length,labelledPlans:[...document.querySelectorAll('.semi-schedule-day')].reduce((n,e)=>n+Number(e.getAttribute('aria-label').match(/，(\\d+) 条发布安排/)[1]),0)})`);assert.ok(result.days>0&&result.renderedEvents>0);assert.equal(result.labelledPlans,300);return result;});
    await timed('prompts-dom',async()=>{await navigate('prompts',`document.querySelectorAll('.prompt-library-card').length>=12`);return run(`document.querySelectorAll('.prompt-library-card').length`);});
    await timed('content-list-100-return-warm',async()=>{await navigate('content',`document.querySelector('.content-title-link')`);await search('');await wait(`document.querySelectorAll('.content-title-link').length===100`);return run(`document.querySelectorAll('.content-title-link').length`);});
    const counts={contents:workspace.value.contentDetails.length,plans:300,candidateReferences:600,templates:workspace.value.templates.length,prompts:workspace.value.prompts.length};
    assert.ok(['seed','workspaceLibrary','coverAssets','raster'].every(op=>operations.some(item=>item.op===op)),'Expected real seed/workspace/template/raster worker calls');
    await fs.writeFile(path.join(root,'receipt.json'),JSON.stringify({passed:true,counts,samples,workerTrace:workerTrace(),electron:process.versions.electron,node:process.versions.node},null,2));window.destroy();app.exit(0);
  } catch(error) {console.error(error);await fs.writeFile(path.join(root,'receipt.json'),JSON.stringify({passed:false,error:String(error),samples,workerTrace:workerTrace()},null,2));await fs.writeFile(path.join(root,'failure.html'),await run('document.documentElement.outerHTML'));await fs.writeFile(path.join(root,'failure.png'),(await window.webContents.capturePage()).toPNG());app.exit(1);}
}}).catch(error=>{console.error(error);app.exit(1)});
