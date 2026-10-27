import {app} from 'electron';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {startDesktop} from './desktop.mjs';
const root=process.env.NOVA_CREATION_PROBE_ROOT,evidence=process.env.NOVA_CREATION_PROBE_EVIDENCE;
if(!root||!evidence)throw Error('Use scripts/manual-creation-ui-probe.mjs');
const fixture=JSON.parse(await fs.readFile(path.join(root,'fixture.json'),'utf8')),checks=[];
startDesktop({show:false,userData:path.join(root,'machine'),async ready({window,controller}){
 const run=s=>window.webContents.executeJavaScript(s),wait=condition=>run(`new Promise((resolve,reject)=>{const end=Date.now()+12000;const check=()=>{if(${condition})return resolve(true);if(Date.now()>end)return reject(Error(${JSON.stringify(condition)}));setTimeout(check,25)};check()})`);
 const click=async selector=>{await wait(`document.querySelector(${JSON.stringify(selector)})&&!document.querySelector(${JSON.stringify(selector)}).disabled`);await run(`document.querySelector(${JSON.stringify(selector)}).click()`);};
 const textClick=async text=>{const expr=`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}&&!b.disabled)`;await wait(expr);await run(`${expr}.click()`);};
 const input=async(selector,value)=>run(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 const bridge=async(method,input)=>{const reply=await run(`window.contentHub[${JSON.stringify(method)}](${input===undefined?'':JSON.stringify(input)})`);assert(reply.ok,JSON.stringify(reply));return reply.value;};
 const shot=async name=>{await run('document.fonts.ready');await run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');if(name.startsWith('manual-'))await run('new Promise(resolve=>setTimeout(resolve,450))');await fs.writeFile(path.join(evidence,name+'.png'),(await window.webContents.capturePage()).toPNG());};
 const record=name=>{checks.push(name);console.log('PASS '+name);};
 try{
 window.webContents.setBackgroundThrottling(false);await wait('document.querySelector(\'main[data-loaded="true"][data-busy="false"]\')');let launches=0;const focuses=[];controller.production.callbacks.focus=async host=>{focuses.push(host);};controller.production.callbacks.launch=async()=>{launches++;throw Error('synthetic missing assistant');};
 if(!await run('!!document.querySelector("#nav-content")?.getClientRects().length'))await click('#nav-group-content');await click('#nav-content');await click(`[data-content-id="${fixture.contentId}"] .content-title-link`);await textClick('创作');
 await wait('document.querySelector("#creation-request")&&!document.querySelector("#start-content-creation").disabled');
 assert.equal(await run('document.querySelector("#creation-advanced").open'),false);assert.equal(await run('[...document.querySelectorAll(".content-detail-page button.semi-button-solid")].filter(b=>b.getClientRects().length).length'),1);record('one requirement and one primary action; advanced tools collapsed before creation is enabled');
 for(const [width,height]of [[1280,860],[960,680]]){window.setContentSize(width,height);await wait(`innerWidth===${width}`);await run('window.scrollTo(0,0)');assert(await run('document.querySelector("#start-content-creation").getBoundingClientRect().bottom<=innerHeight'));assert(await run('document.documentElement.scrollWidth<=innerWidth'));await shot(`simple-creation-${width}x${height}`);record(`Layout-01 Controls-01 Reading-03 primary action reachable ${width}x${height}`);}

 await click('#creation-advanced>summary');await run('document.querySelector(".creation-advanced-body").scrollIntoView({block:"center",behavior:"instant"})');await shot('manual-advanced-before-enable');
 assert(await run('!!document.querySelector("#enable-manual-creation")'),'new content advanced area must offer an explicit manual initialization action');
 await run('document.querySelector("#enable-manual-creation").scrollIntoView({block:"center",behavior:"instant"})');await shot('manual-enable-action');
 assert.equal((await bridge('readProduction')).creations.length,0);await click('#enable-manual-creation');await wait('!!document.querySelector("#creation-analysis")&&!document.querySelector("#start-content-creation").disabled');
 let initialized=await bridge('readProduction');assert.equal(initialized.creations.length,1);assert.equal(initialized.tasks.length,0);assert.equal(launches,0);assert.equal(focuses.length,0);
 await textClick('添加参考 URL / 手工逐字稿');await wait('document.querySelectorAll(".production-reference").length===1');assert(await run('document.querySelector("#start-content-creation").disabled'));await textClick('保存创作资料');await wait('!document.querySelector("#start-content-creation").disabled');
 initialized=await bridge('readProduction');assert.equal(initialized.tasks.length,0);assert.equal(initialized.creations[0].references.length,1);assert.equal((await bridge('readContent',{id:fixture.contentId})).body,fixture.body);assert.equal(launches,0);await run('document.querySelector(".production-reference").scrollIntoView({block:"center",behavior:"instant"})');await shot('manual-reference-saved');await click('#creation-advanced>summary');await run('window.scrollTo(0,0)');record('new-content advanced initialization enables adding and saving references without any assistant launch, focus or task');
 await fs.writeFile(path.join(evidence,'receipt.json'),JSON.stringify({passed:true,platform:process.platform,arch:process.arch,assistantLaunchSimulated:true,checks},null,2));app.exit(0);
 }catch(error){await shot('failure');console.error(error);app.exit(1);}
}});
