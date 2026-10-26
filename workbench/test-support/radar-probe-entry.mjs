// Isolated native UI flow. Candidate data is synthetic; real service receipts are separate.
import {app,shell} from 'electron';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {startDesktop} from './desktop.mjs';
import {openLibrary} from '../../plugin-marketplace/nova-content-hub/plugin-src/src/lib/file-library/index.mjs';
const root=process.env.NOVA_PRODUCTION_PROBE_ROOT,evidence=process.env.NOVA_PRODUCTION_PROBE_EVIDENCE;
if(!root||!evidence)throw Error('Use production-probe with NOVA_RADAR_PROBE=1 and isolated evidence dir');
const fixture=JSON.parse(await fs.readFile(path.join(root,'fixture.json'),'utf8')),checks=[],external=[],launches=[];
shell.openExternal=async url=>{external.push(url);};
const record=(name,detail=true)=>{checks.push({name,detail});console.log(`PASS ${name}`);};
startDesktop({show:false,userData:path.join(root,'machine'),dialogs:{library:async()=>fixture.library,destination:async()=>null,productionFiles:async kind=>kind==='report'?[fixture.reportFile]:null},async ready({window,controller,release}){
 const run=script=>window.webContents.executeJavaScript(script);
 const wait=condition=>run(`new Promise((resolve,reject)=>{let end=Date.now()+15000;let next=()=>{if(${condition})return resolve(true);if(Date.now()>end)return reject(Error(${JSON.stringify(condition)}));setTimeout(next,30)};next()})`);
 const click=async selector=>{await wait(`document.querySelector(${JSON.stringify(selector)})&&!document.querySelector(${JSON.stringify(selector)}).disabled`);await run(`document.querySelector(${JSON.stringify(selector)}).click()`);};
 const textClick=async(text,scope='document')=>{const condition=`[...${scope}.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}&&!b.disabled)`;await wait(condition);await run(`${condition}.click()`);};
 const input=(selector,value)=>run(`(()=>{let e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))})()`);
 const bridge=async(method,value)=>{const reply=await run(`window.contentHub[${JSON.stringify(method)}](${value===undefined?'':JSON.stringify(value)})`);assert.equal(reply.ok,true,JSON.stringify(reply));return reply.value;};
 const shot=async name=>{await run('document.fonts.ready');await run('Promise.all(document.getAnimations().filter(a=>a.effect?.getComputedTiming().endTime<800).map(a=>a.finished.catch(()=>{})))');await fs.writeFile(path.join(evidence,name+'.png'),(await window.webContents.capturePage()).toPNG());};
 try{
  window.webContents.setBackgroundThrottling(false);await wait('document.querySelector(\'main[data-loaded="true"][data-busy="false"]\')');
  controller.production.callbacks.launch=async(binding,reference)=>{launches.push(reference);};
  await click('#nav-radar');await wait('document.querySelector("#radar-new")');
  await shot('radar-empty');await click('#radar-new');await wait('document.querySelector("dialog[open] #radar-direction")');
  const geometry=await run('(()=>{let d=document.querySelector("dialog[open]"),r=d.getBoundingClientRect();return {width:r.width,height:r.height,left:r.left,top:r.top,viewport:[innerWidth,innerHeight],buttons:[...d.querySelectorAll("button")].map(b=>({text:b.textContent.trim(),bottom:b.getBoundingClientRect().bottom}))}})()');
  assert(geometry.width<=724&&geometry.left>40);assert(geometry.buttons.every(b=>b.bottom<=geometry.viewport[1]));
  await shot('radar-query');
  await run('document.querySelector(".radar-query-body details").open=true');
  for(const [key,value]of [['maxFollowers','4321'],['minLikes','1500'],['minRatio','错误数值']]){await click(`#radar-limit-${key}`);await wait(`document.querySelector('#radar-limit-${key} input')`);await input(`#radar-limit-${key} input`,value);await run('document.querySelector("#radar-platform").focus()');}
  assert(await run('[...document.querySelectorAll("dialog[open] button")].find(b=>b.textContent.includes("创建并打开助手")).disabled'));
  await click('#radar-limit-minRatio');await input('#radar-limit-minRatio input','2');await run('document.querySelector("#radar-platform").focus()');
  await textClick('创建并打开助手','document.querySelector("dialog[open]")');
  await wait('!document.querySelector("dialog[open]")');assert.equal(launches.length,1);
  const library=openLibrary(fixture.library),snapshot=await bridge('readProduction'),task=snapshot.tasks.at(-1),attempt=task.attempts.at(-1),query=task.request.parameters.query;
  assert.equal(query.maxFollowers,4321);assert.equal(query.minLikes,1500);assert.equal(query.minRatio,2);assert.equal(task.request.parameters.workflow,'viral-radar');assert.equal(task.request.parameters.comments,false);assert.deepEqual(task.request.tools,[]);assert.equal(task.request.budget.amount,0);
  record('real UI creates fixed radar task through sandbox IPC; disabled budget leaves all paid tools unavailable',{geometry,query});
  const identity={taskId:task.id,attemptId:attempt.id,claimToken:randomUUID(),workerId:'synthetic-radar-contract-probe'};
  const mutate=(op,input)=>library.mutateProduction(op,input,{mutationId:randomUUID()});
  mutate('claimTask',identity);
  for(const [status,progress]of [['waiting-user',10],['claimed',20],['waiting-permission',30],['claimed',40]])mutate('progressTask',{...identity,status,progress,message:'隔离契约测试：'+status});
  const now=new Date().toISOString(),candidates=[['910000000001','符合条件的合成选题',500,5000],['910000000002','缺少粉丝数的合成来源',null,4000],['910000000003','未达门槛的合成来源',90000,5]].map(([sourceId,title,followers,likes])=>({platform:query.platform,sourceId,url:`https://www.douyin.com/video/${sourceId}`,title,author:{id:sourceId,name:'合成作者',url:null,followers},metrics:{likes,comments:null,shares:null,saves:null,views:null},publishedAt:now,collectedAt:now,evidence:['合成测试资料，不是真实TikHub采集结果']}));
  mutate('submitTask',{...identity,result:{summary:'隔离契约样本：1条符合、1条待核验、1条不符合。',artifacts:[{id:randomUUID(),kind:'research',title:'雷达合成结果',text:'用于验证UI、事务与回执，不能作为真实选题来源。',assetHash:null,data:{radar:{schemaVersion:1,query,collectedAt:now,candidates}}}]}});
  await click('#refresh-workspace');await wait('[...document.querySelectorAll(".radar-task button")].some(b=>b.textContent.trim()==="查看结果")');
  await textClick('查看结果');await wait('document.querySelector("#radar-result-review")');await shot('radar-result-review');
  await textClick('验收并收录','document.querySelector("dialog[open]")');await wait('!document.querySelector("dialog[open]")&&document.querySelectorAll(".radar-row").length===1');
  const adopted=(await bridge('readProduction')).reports.find(r=>r.type==='viral-radar');assert(adopted);assert.equal(adopted.meta.radar.candidates.length,3);
  const html=(await controller.worker.call('productionReport',{binding:controller.current(),reportId:adopted.id})).html;assert.match(html,/符合条件的合成选题/);
  record('both waiting states recover and submitted receipt is explicitly accepted then adopted into durable radar HTML report');
  await textClick('加入选题');await wait('!document.querySelector(".radar-row")');
  await run('[...document.querySelectorAll(".radar-toolbar button")].find(b=>b.textContent.startsWith("已加入")).click()');await wait('document.querySelector(".radar-row button")?.textContent.includes("符合条件")');
  const added=(await bridge('readProduction')).reports.find(r=>r.id===adopted.id).meta.radar.candidates[0];assert(added.topicId);const content=await bridge('readProductionCreation',{contentId:added.topicId});assert.equal(content.content.body,'');assert.equal(content.creation.references.length,1);
  await click('#nav-content');await wait('document.querySelector(".content-library-page,.creator-content-library")');assert.match(await run('document.querySelector(".app-stage").textContent'),/符合条件的合成选题/);await click('#nav-radar');await wait('document.querySelector(".radar-toolbar")');await run('[...document.querySelectorAll(".radar-toolbar button")].find(b=>b.textContent.startsWith("已加入")).click()');await wait('document.querySelector(".radar-row")');
  const repeat=await bridge('decideRadarCandidate',{reportId:adopted.id,candidateId:added.id,decision:'add-topic',expectedToken:(await bridge('readProduction')).editToken});assert.equal(repeat.reports.find(r=>r.id===adopted.id).meta.radar.candidates[0].topicId,added.topicId);
  record('add-topic creates an empty-body topic with source reference and repeated calls reuse its durable identity',{topicId:added.topicId});
  await textClick('打开选题');await wait('document.querySelector("#nav-content").getAttribute("aria-current")==="page"');assert.equal((await bridge('readContent',{id:added.topicId})).title,'符合条件的合成选题');
  await textClick('正文','document.querySelector(".content-detail-tabs")');await wait('document.querySelector("#content-body")');await input('#content-body','隔离流程测试正文：从来源出发，加入自己的观点。');await click('#save-content');await wait('document.querySelector("#dirty-state").textContent==="已保存"');assert.match((await bridge('readContent',{id:added.topicId})).body,/隔离流程测试正文/);record('new topic appears in existing directory immediately and edits save through original content action');
  await click('#nav-radar');await wait('document.querySelector(".radar-toolbar")');
  await run('[...document.querySelectorAll(".radar-toolbar button")].find(b=>b.textContent.startsWith("待核验")).click()');await wait('document.querySelector(".radar-row")?.textContent.includes("缺少粉丝数")');assert.match(await run('document.querySelector(".radar-metrics").textContent'),/待核验/);
  await textClick('不合适');await wait('!document.querySelector(".radar-row")');await run('[...document.querySelectorAll(".radar-toolbar button")].find(b=>b.textContent.startsWith("不合适")).click()');await wait('document.querySelector(".radar-row")?.textContent.includes("已标记不合适")');
  record('topic reopens original content; unknown metrics remain unknown; rejection survives navigation');
  for(const [width,height]of [[1280,860],[960,680]]){
   window.setContentSize(width,height);await wait(`innerWidth===${width}&&innerHeight===${height}`);
   await run('[...document.querySelectorAll(".radar-toolbar button")].find(b=>b.textContent.startsWith("全部")).click()');await wait('document.querySelectorAll(".radar-row").length===3');await shot(`radar-all-${width}`);
   assert(await run('document.documentElement.scrollWidth<=innerWidth'));
   await click('#radar-new');await wait('document.querySelector("dialog[open]")');await shot(`radar-query-${width}`);assert(await run('[...document.querySelectorAll("dialog[open] .production-dialog-footer button")].every(b=>b.getBoundingClientRect().bottom<=innerHeight)'));await textClick('取消','document.querySelector("dialog[open]")');
   for(const page of ['accounts','reports','content','overview','calendar','templates','prompts']){await click(`#nav-${page}`);await wait(`document.querySelector('#nav-${page}').getAttribute('aria-current')==='page'`);await shot(`${page}-${width}`);assert(await run('document.documentElement.scrollWidth<=innerWidth'));}
   await click('#nav-radar');
  }
  record('radar plus seven existing pages render without horizontal overflow at 1280x860 and 960x680; modal actions remain reachable');
  await fs.writeFile(path.join(evidence,'radar-ui-receipt.json'),JSON.stringify({passed:true,at:new Date().toISOString(),release,platform:process.platform,arch:process.arch,checks,paidRequests:0,syntheticCandidates:true,realHosts:false,scope:'Native Electron sandbox/preload/IPC/worker/durable isolated library; candidate fixture and external host launches simulated; separate live-service evidence records HTTP402.'},null,2)+'\n');
  app.quit();
 }catch(error){console.error(error);await shot('radar-ui-failure').catch(()=>{});await fs.writeFile(path.join(evidence,'radar-ui-failure.json'),JSON.stringify({error:String(error),stack:error.stack,checks},null,2));app.exit(1);}
}});
