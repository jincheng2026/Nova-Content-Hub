import {app} from 'electron';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {startDesktop} from './desktop.mjs';
const root=process.env.NOVA_CREATION_PROBE_ROOT,evidence=process.env.NOVA_CREATION_PROBE_EVIDENCE;
if(!root||!evidence)throw Error('Use scripts/navigation-guard-ui-probe.mjs');
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
 window.webContents.setBackgroundThrottling(false);await wait('document.querySelector(\'main[data-loaded="true"][data-busy="false"]\')');
 if(!await run('!!document.querySelector("#nav-accounts")?.getClientRects().length'))await click('#nav-group-research');await click('#nav-accounts');await textClick('新建调研');await wait('document.querySelector("#production-research-prompt")');await input('#production-research-prompt','取消后保留的真实调研需求');await textClick('取消');await wait('!!document.querySelector(".production-retained-draft")');
 await click('#nav-radar');await wait('document.querySelector("#error").textContent.includes("还有未保存")');assert.equal(await run('document.querySelector("#nav-accounts").getAttribute("aria-current")'),'page');await shot('blocked-navigation');record('retained research draft blocks navigation and displays the managed-draft guard');
 await textClick('放弃本次填写');await wait('!document.querySelector(".production-retained-draft")');await click('#nav-radar');await wait('document.querySelector("#nav-radar").getAttribute("aria-current")==="page"');assert.equal(await run('document.querySelector("#error").textContent'),'','successful navigation must clear only its stale managed-draft guard notice');await shot('successful-navigation');record('discard followed by successful navigation clears the stale guard notice');
 const originalList=controller.listContents.bind(controller);controller.listContents=async()=>{throw Object.assign(Error('合成业务读取错误'),{code:'IO_ERROR'});};await click('#refresh-workspace');await wait('document.querySelector("#error").textContent.length>0&&document.querySelector(\'main[data-busy="false"]\')');const businessError=await run('document.querySelector("#error").textContent');controller.listContents=originalList;await click('#nav-reports');await wait('document.querySelector("#nav-reports").getAttribute("aria-current")==="page"');assert.equal(await run('document.querySelector("#error").textContent'),businessError);record('successful navigation preserves an unrelated business error');
 await fs.writeFile(path.join(evidence,'receipt.json'),JSON.stringify({passed:true,platform:process.platform,arch:process.arch,assistantLaunchSimulated:true,checks},null,2));app.exit(0);
 }catch(error){await shot('failure');console.error(error);app.exit(1);}
}});
