// Explicit temporary Vault only; never points at the user's actual library.
import {app} from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {startDesktop} from '../dist-desktop/auth-disabled/workbench/dist/main/desktop.mjs';
const root=process.env.NOVA_READABILITY_PROBE_ROOT;
if(!root||!path.isAbsolute(root)||!path.basename(root).startsWith('nova-readability-'))throw Error('Explicit isolated probe directory required');
const evidence={at:new Date().toISOString(),scope:'Built Electron integration, isolated copy; not installed package',steps:[],views:{},errors:[]};
const out=path.join(root,'evidence');await fs.mkdir(out,{recursive:true});
const timeout=setTimeout(()=>app.exit(2),360000);
const machine=process.env.NOVA_READABILITY_REOPEN==='1'?await fs.readFile(path.join(root,'last-machine.txt'),'utf8'):path.join(root,'machine-'+Date.now());await fs.writeFile(path.join(root,'last-machine.txt'),machine);evidence.machine=machine;
startDesktop({show:false,publicationObserver:false,userData:machine,marketRoot:path.resolve('workbench/dist-desktop/auth-disabled/workbench/plugin-marketplace'),dialogs:{library:async()=>path.join(root,'第二大脑')},onConsoleMessage:m=>{if(/Error|Uncaught/.test(m))evidence.errors.push(m)},async ready({window}){
const run=s=>window.webContents.executeJavaScript(s),wait=(s,ms=60000)=>run(`new Promise((resolve,reject)=>{const end=Date.now()+${ms};function check(){if(${s})return resolve(true);if(Date.now()>end)return reject(Error('Timeout '+${JSON.stringify(s)}));setTimeout(check,70)}check()})`);
const click=async id=>{await wait(`!!document.getElementById(${JSON.stringify(id)})&&!document.getElementById(${JSON.stringify(id)}).disabled`);return run(`document.getElementById(${JSON.stringify(id)}).click()`)};
const btn=(label,scope='document')=>run(`(()=>{const el=[...${scope}.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(label)});if(!el||el.disabled)throw Error('Button missing '+${JSON.stringify(label)});el.click()})()`);
const shot=async name=>{await run(`(async()=>{await document.fonts.ready;await Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))})()`);evidence.views[name]=await run('({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth})');await fs.writeFile(path.join(out,name+'.png'),(await window.webContents.capturePage()).toPNG())};
try{
window.webContents.setBackgroundThrottling(false);window.setSize(1440,980);await wait(`!!document.querySelector('main[data-app="ready"][data-loaded="true"][data-busy="false"]')`);
if(await run(`!!document.getElementById('welcome-open-library')`))await click('welcome-open-library');await wait(`document.getElementById('library-summary')?.textContent==='第二大脑'&&!!document.querySelector('main[data-loaded="true"][data-busy="false"]')`,120000);
await click('nav-prompts');await wait(`!!document.querySelector('.prompt-library-use')`);assert.equal(await run(`!!document.getElementById('prompt-view-knowledge')`),false);await shot('prompts');evidence.steps.push('Prompt library retained; knowledge tab absent');
await click('nav-accounts');await wait(`!!document.querySelector('.production-account-card')`);
await btn('查看完整账号资料',`document.querySelector('.production-account-card')`);await wait(`!!document.querySelector('.document-markdown table')`);assert.ok(await run(`document.querySelectorAll('.document-markdown h1,.document-markdown h2,.document-markdown blockquote').length`));await shot('account-markdown');evidence.steps.push('Real account Markdown headings, quote and table rendered');
await btn('关闭详情');await click('nav-templates');await wait(`!!document.querySelector('.creator-reference-stack img')`);await shot('cover-stacks');evidence.steps.push('Real template images rendered');
await click('nav-content');await wait(`document.querySelector('.jincheng-content-directory [data-content-id]')&&!document.body.innerText.includes('正在读取原选题、安排与创作文件…')`);
assert.equal(await run(`!!document.getElementById('nav-bookmarks')`),false);assert.ok(await run(`!!document.querySelector('.jincheng-content-grid')`));await shot('content-cards');
const cards=await run(`JSON.stringify([...document.querySelectorAll('.jincheng-content-directory [data-content-id]')].map(e=>e.dataset.contentId))`);
await run(`[...document.querySelectorAll('.jincheng-content-view-switch label')].find(e=>e.textContent.trim()==='列表').click()`);await wait(`!!document.querySelector('.jincheng-content-list')`);assert.equal(await run(`JSON.stringify([...document.querySelectorAll('.jincheng-content-directory [data-content-id]')].map(e=>e.dataset.contentId))`),cards);await shot('content-list');
await run(`[...document.querySelectorAll('.jincheng-content-view-switch label')].find(e=>e.textContent.trim()==='卡片').click()`);await wait(`!!document.querySelector('.jincheng-content-grid')`);evidence.steps.push('Content cards/list preserve exact item order; X navigation absent');
await run(`(()=>{const row=[...document.querySelectorAll('.jincheng-content-directory [data-content-id]')].find(e=>e.querySelector('.jincheng-content-number')?.textContent.trim()==='T041');if(!row)throw Error('T041 absent');row.querySelector('button').click()})()`);
await wait(`!!document.querySelector('.jincheng-work-detail')&&!document.body.innerText.includes('正在读取选题卡与内容文件…')`);
assert.equal(await run(`document.querySelectorAll('.content-detail-tabs').length`),0);await shot('detail-T041');
await btn('接着写');await wait(`document.querySelectorAll('.creation-frame-workspace iframe').length===1&&document.body.innerText.includes('已连接知识库保存通道')`);
assert.equal(await run(`document.querySelectorAll('.creation-frame-workspace iframe').length`),1);await shot('detail-original-page');
let frame=window.webContents.mainFrame.frames.find(f=>f.url.startsWith('nova-content://creation/'));assert.ok(frame);
const originalDoc=await frame.executeJavaScript(`JSON.parse(document.getElementById('jc-doc').textContent)`),segment=originalDoc.items.filter(i=>i.kind==='segment'&&typeof i.fields.mine==='string').at(-1);assert.ok(segment);
const setMine=async value=>{await frame.executeJavaScript(`(()=>{const e=document.querySelector('[data-item="${segment.id}"][data-field="mine"]');if(!e||e.readOnly||!jcKit.ready)throw Error('Author field not ready');e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}))})()`)};
await frame.executeJavaScript(`new Promise((resolve,reject)=>{const end=Date.now()+45000;function check(){const el=document.querySelector('[data-item="${segment.id}"][data-field="mine"]');if(window.jcKit?.ready&&el&&!el.readOnly)return resolve(true);if(Date.now()>end)return reject(Error('Kit editable input not ready'));setTimeout(check,50)}check()})`);evidence.fieldReadyBeforeInput=true;await setMine(segment.fields.mine+'\n副本UI关闭保存验证。');await btn('关闭创作页');await wait(`!document.querySelector('.creation-frame-workspace iframe')`,60000);
await btn('接着写');await wait(`document.querySelector('.creation-frame-workspace iframe')&&document.body.innerText.includes('已连接知识库保存通道')`);frame=window.webContents.mainFrame.frames.find(f=>f.url.startsWith('nova-content://creation/'));assert.ok(frame);
assert.equal(await frame.executeJavaScript(`jcKit.value(${JSON.stringify(segment.id)},'mine')`),segment.fields.mine+'\n副本UI关闭保存验证。');await frame.executeJavaScript(`new Promise((resolve,reject)=>{const end=Date.now()+45000;function check(){if(window.jcKit?.ready)return resolve(true);if(Date.now()>end)return reject(Error('Reopened kit not ready'));setTimeout(check,50)}check()})`);await setMine(segment.fields.mine);await btn('关闭创作页');await wait(`!document.querySelector('.creation-frame-workspace iframe')`,60000);
evidence.steps.push('Simplified T041 detail; exactly one original page; edit close flush/reopen and restore author value');
await btn('← 返回内容列表');await wait(`document.querySelector('.jincheng-content-directory [data-content-id]')&&!document.body.innerText.includes('正在读取原选题、安排与创作文件…')`);
window.setSize(720,900);await click('nav-content');await wait(`document.querySelector('.jincheng-content-directory [data-content-id]')&&!document.body.innerText.includes('正在读取原选题、安排与创作文件…')`);await shot('content-narrow');assert.ok(evidence.views['content-narrow'].scrollWidth<=evidence.views['content-narrow'].width);evidence.steps.push('Content narrow viewport has no document overflow');
evidence.passed=true;
}catch(e){evidence.passed=false;evidence.failure={message:String(e),stack:e.stack};evidence.body=await run('document.body.innerText').catch(()=>null);await shot('failure').catch(()=>{});}finally{await fs.writeFile(path.join(out,'result.json'),JSON.stringify(evidence,null,2));clearTimeout(timeout);console.log(JSON.stringify(evidence));app.exit(evidence.passed?0:1)}
}}).catch(e=>{console.error(e);app.exit(1)});
