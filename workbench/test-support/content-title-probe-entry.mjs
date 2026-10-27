// Injected only into the temporary copy made by content-title-ui-probe.mjs.
import {app} from 'electron';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {startDesktop} from './desktop.mjs';
const root=process.env.NOVA_TITLE_PROBE_ROOT,evidence=process.env.NOVA_TITLE_PROBE_EVIDENCE;
if(!root||!evidence)throw Error('Use scripts/content-title-ui-probe.mjs');
const fixture=JSON.parse(await fs.readFile(path.join(root,'fixture.json'),'utf8'));
const checks=[];
startDesktop({show:false,userData:path.join(root,'machine'),async ready({window,controller}){
 const run=s=>window.webContents.executeJavaScript(s);
 const wait=condition=>run(`new Promise((resolve,reject)=>{const end=Date.now()+12000;const check=()=>{if(${condition})return resolve(true);if(Date.now()>end)return reject(Error(${JSON.stringify(condition)}));setTimeout(check,25)};check()})`);
 const click=async selector=>{await wait(`document.querySelector(${JSON.stringify(selector)})&&!document.querySelector(${JSON.stringify(selector)}).disabled`);await run(`document.querySelector(${JSON.stringify(selector)}).click()`);};
 const textClick=async text=>{const expr=`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}&&!b.disabled)`;await wait(expr);await run(`${expr}.click()`);};
 const input=async(selector,value)=>run(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 const bridge=async(method,input)=>{const reply=await run(`window.contentHub[${JSON.stringify(method)}](${input===undefined?'':JSON.stringify(input)})`);assert(reply.ok,JSON.stringify(reply));return reply.value;};
 const shot=async name=>{await run('document.fonts.ready');await run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');await fs.writeFile(path.join(evidence,name+'.png'),(await window.webContents.capturePage()).toPNG());};
 const record=name=>{checks.push(name);console.log('PASS '+name);};
 try{
 window.webContents.setBackgroundThrottling(false);
 await wait('document.querySelector(\'main[data-loaded="true"][data-busy="false"]\')');
 controller.production.callbacks.launch=async()=>{};
 if(!await run('!!document.querySelector("#nav-content")?.getClientRects().length'))await click('#nav-group-content');
 await click('#nav-content');await click(`[data-content-id="${fixture.contentId}"] .content-title-link`);await textClick('正文');
 await click('#toggle-title-recommendations');await wait('document.querySelectorAll(".content-title-candidate").length===1&&!document.querySelector("#refresh-title-recommendations").disabled');
 assert.equal(await run('document.querySelector(".content-title-candidate-text").textContent'),'把 AI 工具讲明白：从真实问题开始');
 assert.equal(await run('document.querySelector("#content-title").value'),fixture.title);
 record('accepted packaging title is available without enabling creation; submitted title cannot be adopted; reading does not change title');
 for(const [width,height]of [[1280,860],[960,680]]){window.setContentSize(width,height);await wait(`innerWidth===${width}`);await run('document.querySelector(".content-title-recommendations").scrollIntoView({block:"center"})');assert(await run('document.documentElement.scrollWidth<=innerWidth'));await shot(`title-candidates-${width}x${height}`);record(`title recommendations wrap with no horizontal overflow ${width}x${height}`);}
 await click('#generate-title-recommendations');await wait('document.querySelector(".content-title-notice")?.textContent.includes("已打开助手")');
 const production=await bridge('readProduction'),task=production.tasks.at(-1);
 assert.equal(task.kind,'packaging');assert.equal(task.contentId,fixture.contentId);assert.equal(task.request.parameters.comments,false);assert.match(task.request.prompt,/data.packaging.titles/);assert.equal(task.request.bodyHash,(await bridge('readProductionCreation',{contentId:fixture.contentId})).content.bodyHash);
 record('generation creates the existing content-bound packaging task with fixed saved body and unchecked comments');
 await input('#content-title','本地未保存标题');await wait('document.querySelector("#generate-title-recommendations").disabled');
 assert(await run('document.querySelector(".content-title-candidate button").disabled'));
 assert.equal((await bridge('readContent',{id:fixture.contentId})).title,fixture.title);
 record('unsaved manual title blocks generation and adoption without writing content');
 await input('#content-title',fixture.title);await wait('!document.querySelector(".content-title-candidate button").disabled');
 await click('.content-title-candidate button');await wait('document.querySelector("#content-title").value==="把 AI 工具讲明白：从真实问题开始"');
 assert.equal(await run('document.querySelector("#content-body").value'),fixture.body);
 assert.equal((await bridge('readContent',{id:fixture.contentId})).title,fixture.title);
 assert(await run('document.querySelector("#dirty-state").textContent.includes("未保存")'));
 record('explicit adoption changes only original title draft and preserves saved title and body until Save');
 await click('#save-content');await wait('document.querySelector("#dirty-state").textContent==="已保存"');
 const saved=await bridge('readContent',{id:fixture.contentId});assert.equal(saved.title,'把 AI 工具讲明白：从真实问题开始');assert.equal(saved.body,fixture.body);
 record('original Save persists adopted title using existing content update with body unchanged');
 await click('#refresh-title-recommendations');await wait('!document.querySelector("#refresh-title-recommendations").disabled');
 window.webContents.focus();await run('document.querySelector("#toggle-title-recommendations").focus()');window.webContents.sendInputEvent({type:'keyDown',keyCode:'Space'});window.webContents.sendInputEvent({type:'keyUp',keyCode:'Space'});await wait('!document.querySelector("#content-title-recommendations-panel")');
 record('keyboard Space collapses inline recommendation panel');
 await fs.writeFile(path.join(evidence,'receipt.json'),JSON.stringify({passed:true,platform:process.platform,arch:process.arch,rendererRebuilt:true,existingTemporaryDesktopBundle:true,assistantLaunchSimulated:true,checks},null,2));await fs.rm(path.join(evidence,'failure.png'),{force:true});app.exit(0);
 }catch(error){await shot('failure');console.error(error);app.exit(1);}
}});
