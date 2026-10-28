// Actual React/Semi integration against an explicitly supplied isolated Vault copy.
import {app} from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';

const root=process.env.NOVA_DETAIL_PROBE_ROOT;
assert.ok(root&&path.isAbsolute(root)&&path.basename(root).startsWith('nova-detail-continuation-'),'Explicit isolated fixture required');
const phase=process.env.NOVA_DETAIL_PHASE??'detail';
assert.ok(['detail','reopen'].includes(phase));
const desktop=path.resolve(process.env.NOVA_DETAIL_DESKTOP??'workbench/dist-desktop/auth-disabled/workbench/dist/main/desktop.mjs');
const {startDesktop}=await import(pathToFileURL(desktop).href);
const out=path.join(root,'evidence',phase);await fs.mkdir(out,{recursive:true});
const evidence={at:new Date().toISOString(),phase,desktop,scope:'Independent Electron integration host; isolated copy; not Finder/Dock acceptance',steps:[],views:{},external:[]};
const deadline=setTimeout(()=>app.exit(2),300000);
startDesktop({show:false,publicationObserver:false,userData:path.join(root,'machine'),marketRoot:process.env.NOVA_DETAIL_MARKET??path.resolve('workbench/dist-desktop/auth-disabled/workbench/plugin-marketplace'),dialogs:{library:async()=>path.join(root,'第二大脑')},async ready({window,controller,release}){
 const run=s=>window.webContents.executeJavaScript(s);
 const wait=async(fn,label,ms=60000)=>{const end=Date.now()+ms;while(true){const value=await fn();if(value)return value;if(Date.now()>end)throw Error('Timeout '+label);await new Promise(r=>setTimeout(r,75));}};
 const dom=(s,label=s)=>wait(()=>run(s),label);
 const click=id=>dom(`(()=>{const e=document.getElementById(${JSON.stringify(id)});if(!e||e.disabled||!e.getClientRects().length)return false;e.click();return true})()`,'click '+id);
 const button=(label,scope='document')=>dom(`(()=>{const e=[...${scope}.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(label)}&&!e.disabled&&e.getClientRects().length);if(!e)return false;e.click();return true})()`,'button '+label);
 const bridge=async(method,input)=>{const r=await run(`window.contentHub[${JSON.stringify(method)}](${input===undefined?'':JSON.stringify(input)})`);assert.equal(r.ok,true,JSON.stringify(r));return r.value;};
 const shot=async name=>{await run(`(async()=>{await document.fonts.ready;await Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))})()`);evidence.views[name]=await run('({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth})');await fs.writeFile(path.join(out,name+'.png'),(await window.webContents.capturePage()).toPNG());};
 const back=async()=>{await button('← 返回内容列表');await dom(`!!document.querySelector('.jincheng-content-directory [data-content-id]')&&!document.body.innerText.includes('正在读取原选题、安排与创作文件…')`);};
 const open=async number=>{await dom(`(()=>{const row=[...document.querySelectorAll('.jincheng-content-directory [data-content-id]')].find(e=>e.querySelector('.jincheng-content-number')?.textContent.trim()===${JSON.stringify(number)});const b=row?.querySelector('button');if(!b||b.disabled)return false;b.click();return true})()`,'open '+number);await dom(`document.querySelector('.jincheng-detail-number')?.textContent===${JSON.stringify(number)}&&!document.body.innerText.includes('正在读取选题卡与内容文件…')`);};
 try{
  window.webContents.setBackgroundThrottling(false);window.setSize(1440,980);
  await dom(`!!document.querySelector('main[data-app="ready"][data-loaded="true"][data-busy="false"]')`);
  if(await run(`!!document.getElementById('welcome-open-library')`))await click('welcome-open-library');
  await wait(()=>run(`document.getElementById('library-summary')?.textContent==='第二大脑'&&!!document.querySelector('main[data-loaded="true"][data-busy="false"]')`),'initial library initialization',120000);
  if((await bridge('status')).seedPending){
   await button('继续处理');await click('global-retry-builtins');
   await wait(async()=>!(await bridge('status')).seedPending,'resume interrupted builtin initialization',120000);
   await dom(`!!document.querySelector('main[data-busy="false"]')`);
   if(await run(`!!document.querySelector('dialog[open][aria-labelledby="retained-recovery-title"]')`))await button('返回编辑');
   evidence.steps.push('Interrupted fixture initialization resumes through the existing recovery action without clearing pending state');
  }
  evidence.version=release.version;evidence.binding=controller.binding.current;
  assert.equal(evidence.binding.root,path.join(root,'第二大脑/.workbench/runtime'));
  await click('nav-content');await dom(`!!document.querySelector('.jincheng-content-directory [data-content-id]')&&!document.body.innerText.includes('正在读取原选题、安排与创作文件…')`);
  const directory=await bridge('readVaultWorkDirectory');
  evidence.directory=directory.map(x=>({tNumber:x.tNumber,sourceResolution:x.sourceResolution}));
  if(phase==='reopen'){
   const prior=JSON.parse(await fs.readFile(path.join(root,'evidence/detail/result.json'),'utf8'));
   assert.equal(evidence.binding.libraryId,prior.binding.libraryId);assert.deepEqual(evidence.binding.rootIdentity,prior.binding.rootIdentity);
   assert.deepEqual(evidence.directory,prior.directory);await shot('reopened-directory');
   evidence.steps.push('Independent process reopens the same library identity, display name and directory facts');
  }else{
   const tasksBefore=await bridge('readProduction');
   await open('T005');assert.equal(await run(`document.querySelectorAll('.creation-frame-workspace iframe').length`),0);
   await button('和助手新建创作页');await dom(`!!document.getElementById('jincheng-stage-note')`);
   assert.match(await run(`document.querySelector('[role="dialog"]')?.innerText??document.body.innerText`),/jc-content-writer/);
   assert.equal((await bridge('readProduction')).tasks.length,tasksBefore.tasks.length);
   await shot('T005-original-writing-entry');await button('暂时收起');await back();
   evidence.steps.push('T005 without HTML opens original writing method; no task created by rendering or opening dialog');
   await open('T020');assert.ok(await run(`document.querySelectorAll('.jincheng-source-conflict .jincheng-detail-row').length>1`));
   assert.equal(await run(`[...document.querySelectorAll('.jincheng-detail-main-actions button')].find(e=>e.textContent.trim()==='接着写').disabled`),true);
   assert.equal(await run(`document.querySelectorAll('.creation-frame-workspace iframe').length`),0);await shot('T020-author-choice');await back();
   evidence.steps.push('T020 source conflict preserves all candidates and requires explicit author choice');
   await open('T046');const pages=await run(`(()=>{const s=[...document.querySelectorAll('.jincheng-detail-section')].find(e=>e.querySelector('h3')?.textContent.startsWith('网页'));return [...s.querySelectorAll('.jincheng-detail-row')].map(e=>({path:e.querySelector('.jincheng-detail-path')?.textContent,editable:[...e.querySelectorAll('button')].some(b=>b.textContent==='在这里打开')}))})()`);
   assert.ok(pages.length>1);evidence.t046Pages=pages;await shot('T046-multiple-pages');
   for(const page of pages.filter(page=>page.editable).slice(0,2)){
    const row=`[...document.querySelectorAll('.jincheng-detail-section .jincheng-detail-row')].find(e=>e.querySelector('.jincheng-detail-path')?.textContent===${JSON.stringify(page.path)})`;
    await button('在这里打开',row);
    await dom(`document.querySelectorAll('.creation-frame-workspace iframe').length===1&&document.querySelector('.jincheng-detail-frame-heading h3')?.textContent===${JSON.stringify(page.path.split('/').at(-1))}&&document.body.innerText.includes('已连接知识库保存通道')`);
    const frame=await wait(()=>window.webContents.mainFrame.frames.find(frame=>frame.url.startsWith('nova-content://creation/')),'T046 frame');
    await wait(()=>frame.executeJavaScript('!!window.jcKit?.ready'),'T046 Kit ready');
   }
   if(pages.some(page=>page.editable)){await button('关闭创作页');await dom(`!document.querySelector('.creation-frame-workspace iframe')`);}
   await back();evidence.steps.push('T046 retains multiple actual HTML entries and opens editable pages through one frame at a time');
   const markdown=directory.find(x=>x.tNumber==='T019');assert.ok(markdown);
   await open('T019');await button('发布与档案');await dom(`!!document.querySelector('.jincheng-publication')`);
   await button('接着写');await dom(`!!document.getElementById('content-body')&&document.getElementById('content-body').getClientRects().length>0&&!document.querySelector('.jincheng-publication')`);
   await dom(`(()=>{const e=document.getElementById('content-body'),r=e?.getBoundingClientRect();return r&&r.top<innerHeight&&r.bottom>0&&document.activeElement===e})()`,'resumed body editor is in viewport and focused');
   assert.ok(await run(`document.getElementById('content-body').value.length>0`));await shot('T019-publication-to-body');await back();
   evidence.steps.push('Markdown current draft resumes into visible body editor after opening publication panel');
   await open('T041');await shot('T041-reference-groups');
   evidence.referenceSections=await run(`[...document.querySelectorAll('.jincheng-detail-section')].map(e=>({heading:e.querySelector('h3')?.textContent,text:e.innerText}))`);
   const video=evidence.referenceSections.find(x=>x.heading.startsWith('参考视频'));
   assert.ok(video);assert.ok(!/127\.0\.0\.1|视频档案|T042/.test(video.text));
   assert.ok(evidence.referenceSections.some(x=>x.heading.startsWith('参考资料')));
   await run(`[...document.querySelectorAll('.jincheng-detail-section')].find(e=>e.querySelector('h3')?.textContent.startsWith('参考资料')).scrollIntoView({block:'center',behavior:'instant'})`);await shot('T041-reference-materials');
   evidence.steps.push('T041 groups actual video references and separates cross-topic, archive and other reference materials');
   window.setSize(960,868);await shot('T041-narrow');assert.ok(evidence.views['T041-narrow'].scrollWidth<=evidence.views['T041-narrow'].width);
   evidence.steps.push('Actual 960px minimum window has no document overflow');
  }
  evidence.passed=true;
 }catch(error){evidence.passed=false;evidence.failure={message:String(error),stack:error.stack};evidence.body=await run('document.body.innerText').catch(()=>null);await shot('failure').catch(()=>{});
 }finally{await fs.writeFile(path.join(out,'result.json'),JSON.stringify(evidence,null,2));clearTimeout(deadline);console.log(JSON.stringify({phase,passed:evidence.passed,steps:evidence.steps,failure:evidence.failure}));app.exit(evidence.passed?0:1);}
}}).catch(async error=>{await fs.writeFile(path.join(out,'startup-failure.json'),JSON.stringify({message:String(error),stack:error.stack}));console.error(error);app.exit(1);});
