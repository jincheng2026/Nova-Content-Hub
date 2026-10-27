// Only injected into the runner's isolated desktop bundle.
import {app} from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {startDesktop} from './desktop.mjs';
const root=process.env.NOVA_CREATION_PROBE_ROOT,phase=process.env.NOVA_CREATION_PROBE_PHASE;
if(!root||!path.isAbsolute(root)||!path.basename(root).startsWith('nova-creation-frame-'))throw Error('Use the isolated runner');
startDesktop({show:false,userData:path.join(root,'machine'),dialogs:{library:async()=>path.join(root,'第二大脑')},async ready({window,controller,worker,release}){
 // Isolate the creation-page vertical slice from the separately verified built-in cover seed.
 controller.covers.seed=async()=>{};
 let failStash=false;const originalWorkerCall=worker.call.bind(worker);worker.call=async(op,args)=>{if(failStash&&op==='creationPage'&&args.action==='stash-write')throw new Error('专项注入：暂存磁盘写入失败');return originalWorkerCall(op,args);};
 window.webContents.on('console-message',(_event,level,message)=>console.log('RENDERER',level,message));
 const run=script=>window.webContents.executeJavaScript(script);
 const wait=(fn,ms=45000)=>new Promise((resolve,reject)=>{const end=Date.now()+ms;async function check(){try{const value=await fn();if(value)return resolve(value);if(Date.now()>end)return reject(Error('Probe did not settle'));setTimeout(check,60);}catch(error){reject(error);}}check();});
 const bridge=async(method,input)=>{const result=await run(`window.contentHub[${JSON.stringify(method)}](${input===undefined?'':JSON.stringify(input)})`);assert.equal(result.ok,true,JSON.stringify(result));return result.value;};
 const button=async(text,selector='document')=>wait(()=>run(`(()=>{const el=[...${selector}.querySelectorAll('button')].find(el=>el.textContent.trim()===${JSON.stringify(text)}&&!el.disabled);if(el){el.click();return true;}return false;})()`));
 let frame;const fr=script=>frame.executeJavaScript(script);
 const evidence={scope:'real T029 fixture only; built-in cover seeding bypassed in injected probe',phase,at:new Date().toISOString(),platform:process.platform,arch:process.arch,version:release.version,steps:[]};
 const stage=text=>{console.log('CREATION PROBE:',text);evidence.steps.push(text);};
 const capture=async(name)=>fs.writeFile(path.join(root,`${phase}-${name}.png`),(await window.webContents.capturePage()).toPNG());
 try{
  window.setSize(1280,860);window.webContents.setBackgroundThrottling(false);evidence.windowBounds=window.getBounds();evidence.viewport=await run('({width:innerWidth,height:innerHeight,dpr:devicePixelRatio})');
  stage('Wait for real renderer ready');
  await wait(()=>run(`!!document.querySelector('main[data-app="ready"][data-loaded="true"][data-busy="false"]')`));
  stage('Renderer ready; open isolated Vault');
  if(!(await bridge('status')).currentName)await run(`document.getElementById('welcome-open-library').click()`);
  await wait(async()=>!!(await bridge('status')).currentName,120000);
  await wait(()=>run(`!!document.getElementById('library-summary')?.textContent?.includes('第二大脑')`));
  stage('Vault opened; locate T029 original page');
  const vault=await bridge('readVault'),doc=vault.documents.find(d=>/T029.*\/T029_创作页\.html$/.test(d.relativePath));assert.ok(doc);
  const warm=await worker.call('creationPage',{binding:controller.binding.current,documentId:doc.id,action:'meta'});assert.ok(warm.fingerprint);stage('Warm verified bound reader with current source fingerprint before input');
  const source=path.join(root,'第二大脑',doc.relativePath),sourceBefore=await fs.readFile(source,'utf8');
  await wait(()=>run(`!!document.querySelector('main[data-busy="false"]')&&!document.getElementById('nav-vault').disabled`));
  await run(`document.getElementById('nav-vault').click()`);
  stage('Open real Semi Vault page and search T029');
  await wait(()=>run(`!!document.querySelector('[aria-label="搜索知识库资料"]')`));
  await run(`(()=>{const el=document.querySelector('[aria-label="搜索知识库资料"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'T029');el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await wait(()=>run(`(()=>{const el=[...document.querySelectorAll('.vault-document-link')].find(el=>el.textContent.includes('T029_创作页')&&!el.disabled);if(!el)return false;el.click();return true;})()`));
  stage('Open original HTML document in Semi modal');
  frame=await wait(()=>window.webContents.mainFrame.framesInSubtree.find(f=>f.url.startsWith('nova-content://creation/')));
  await wait(()=>fr(`!!window.jcKit?.ready`));stage('T029 original kit ready in opaque sandbox inside real Semi modal');
  assert.equal(await fr(`typeof require`),'undefined');assert.equal(await fr(`typeof window.OLD_UNTRUSTED_EXECUTION`),'undefined');
  evidence.sections=await fr(`({segments:document.querySelectorAll('textarea.mine').length,refs:document.querySelectorAll('.ref').length,cards:document.querySelectorAll('.card[data-sug]').length,reading:!![...document.querySelectorAll('button')].find(e=>e.textContent==='通读'),record:!![...document.querySelectorAll('button')].find(e=>e.textContent==='录制'),packaging:document.body.innerText.includes('包装')})`);
  assert.ok(evidence.sections.segments>0&&evidence.sections.refs>0&&evidence.sections.cards>0&&evidence.sections.reading&&evidence.sections.record);
  await capture('original');
  if(phase==='edit'){
   for(const [label,selector] of [['通读','.reading-view'],['录制','.record-head']]){await fr(`(()=>{[...document.querySelectorAll('.seg-switch button')].find(el=>el.textContent===${JSON.stringify(label)}).click();})()`);assert.equal(await fr(`document.querySelector(${JSON.stringify(selector)}).hidden`),false);await capture(label==='通读'?'reading':'record');}
   await fr(`(()=>{[...document.querySelectorAll('.seg-switch button')].find(el=>el.textContent==='对照').click();})()`);stage('Original compare, reading and recording view buttons expose their real sections');
   const ids=await fr(`(()=>{const doc=jcKit.doc(),segments=doc.items.filter(i=>i.kind==='segment'),s=segments.at(-1);return {segment:s.id,mine:jcKit.value(s.id,'mine')};})()`);
   await fr(`document.querySelectorAll('.nav-btn')[document.querySelectorAll('.nav-btn').length-1].click()`);
   evidence.segment=ids.segment;evidence.mine=ids.mine+'\n原生桥正文验收';evidence.note='原生桥批注验收';
   await fr(`(()=>{for(const [field,value] of [['mine',${JSON.stringify(evidence.mine)}],['note',${JSON.stringify(evidence.note)}]]){const el=document.querySelector('[data-item="${ids.segment}"][data-field="'+field+'"]');el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));}})()`);
   await fr(`jcKit.flush()`);await wait(()=>fr(`jcKit.state().pending===0&&!jcKit.state().storeError`));
   stage('Original mine/note inputs durably save through kit and native writer');
   // Exercise a real original adoption card, restoring its original target if an earlier decision had already changed it.
   const adoption=await fr(`(()=>{const d=jcKit.doc(),s=d.items.find(i=>i.kind==='suggestion'&&i.locked.original&&i.fields.proposed);const seg=d.items.find(i=>i.id===s.locked.segment);return {id:s.id,locked:s.locked,fields:s.fields,segment:seg?.id};})()`);
   evidence.adoption=adoption;
   if(!adoption.segment)throw Error('Cannot locate real suggestion segment');
   await fr(`jcKit.edit([{item:${JSON.stringify(adoption.segment)},field:'mine',value:${JSON.stringify(adoption.locked.original)}},{item:${JSON.stringify(adoption.id)},field:'decision',value:''}],{flush:false})`);
   await fr(`(()=>{const card=document.querySelector('[data-sug="${adoption.id}"]');card.querySelector('button.yes').click();})()`);
   await wait(()=>fr(`jcKit.value(${JSON.stringify(adoption.id)},'decision')==='采纳'&&jcKit.state().pending===0`));
   evidence.adoptedMine=await fr(`jcKit.value(${JSON.stringify(adoption.segment)},'mine')`);assert.equal(evidence.adoptedMine,adoption.fields.proposed);stage('Original adoption button commits mine and decision as one group');
   // Use the actual original selection→composer interaction and leave its text unsubmitted.
   await fr(`(()=>{document.querySelectorAll('.nav-btn')[document.querySelectorAll('.nav-btn').length-1].click();const el=document.querySelector('textarea.mine[data-item="${ids.segment}"]');el.focus();el.setSelectionRange(0,4);el.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,clientX:300,clientY:300}));})()`);
   await wait(()=>fr(`!![...document.querySelectorAll('button')].find(e=>e.textContent==='写给 AI'&&!e.hidden&&!e.parentElement.hidden)`));
   failStash=true;
   await fr(`(()=>{[...document.querySelectorAll('button')].find(e=>e.textContent==='写给 AI'&&!e.hidden&&!e.parentElement.hidden).click();const el=document.querySelector('.cp-text');el.value='尚未提交的原生选区批注';el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
   const failed=await fr(`JC_DESKTOP.flush()`);assert.match(failed.error,/暂存磁盘写入失败/);
   await button('关闭','document.querySelector("dialog[open] .dialog-heading")');
   await wait(()=>run(`!!document.querySelector('dialog[open] [role="alert"]')`));assert.equal(await run(`!!document.querySelector('dialog[open] iframe')`),true);
   await run(`document.querySelector('dialog[open]').dispatchEvent(new Event('cancel',{cancelable:true}))`);assert.equal(await run(`!!document.querySelector('dialog[open] iframe')`),true);
   failStash=false;await button('重试保全输入','document.querySelector(".creation-frame-workspace")');await wait(()=>fr(`JC_DESKTOP.flush().then(s=>!s.pending&&!s.error)`));
   stage('Scoped dialog close and Esc preserve failed input; real retry obtains durable ack');
   assert.equal(await fr(`document.querySelector('.cp-text').value`),'尚未提交的原生选区批注');
   await fs.writeFile(path.join(root,'identity.json'),JSON.stringify({documentId:doc.id,...evidence}));await capture('unsubmitted-note');stage('Original selection composer draft obtains native durable ack before exit');
   await button('关闭','document.querySelector("dialog[open] .dialog-heading")');await wait(()=>run(`!document.querySelector('dialog[open]')`));stage('Dialog closes after durable drain');
   const after=await fs.readFile(source,'utf8'),strip=s=>s.replace(/(<script[^>]*id="jc-doc"[^>]*>)[\s\S]*?(<\/script>)/,'$1$2');assert.equal(strip(after),strip(sourceBefore));
  }else{
   const saved=JSON.parse(await fs.readFile(path.join(root,'identity.json'),'utf8'));
   assert.equal(await fr(`jcKit.value(${JSON.stringify(saved.segment)},'mine')`),saved.mine);assert.equal(await fr(`jcKit.value(${JSON.stringify(saved.segment)},'note')`),saved.note);
   assert.equal(await fr(`jcKit.value(${JSON.stringify(saved.adoption.id)},'decision')`),'采纳');assert.equal(await fr(`jcKit.value(${JSON.stringify(saved.adoption.segment)},'mine')`),saved.adoptedMine);
   assert.equal(await fr(`document.querySelector('.cp-text').value`),'尚未提交的原生选区批注');assert.equal(await fr(`document.querySelector('.composer').hidden`),false);stage('Second Electron process restores exact saved mine/note/adoption and unsubmitted composer draft');await capture('restored');
  }
  evidence.designRules={'Controls-01':'Semi wrapper actions remain operable','Reading-02':'Original long content preserved in scrollable frame','Acceptance-01':'Native test passes','Acceptance-02':'1280x860 window screenshots captured; actual viewport recorded; wider visual review pending','Acceptance-03':'darwin-arm64 Electron only; no installer/cross-platform claim'};
  await fs.writeFile(path.join(root,`${phase}-result.json`),JSON.stringify(evidence,null,2));app.exit(0);
 }catch(error){await capture('failure');await fs.writeFile(path.join(root,`${phase}-failure.json`),JSON.stringify({error:String(error),stack:error.stack,parent:await run('document.body.innerText'),frame:frame?await fr('document.body.innerText').catch(()=>null):null,evidence},null,2));console.error(error);app.exit(1);}
}}).catch(error=>{console.error(error);app.exit(1)});
