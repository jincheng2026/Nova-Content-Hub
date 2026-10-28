import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const workbench=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(new URL('../package.json',import.meta.url));
test('actual React source reader keeps controlled images, explicit links, errors, history and stale results bounded',async t=>{
 const exists=await fs.stat(path.join(workbench,'src/renderer/document-source-reader.tsx')).then(()=>true,()=>false);assert.equal(exists,true,'source reader module must exist');
 const {build}=await import(require.resolve('vite')),electron=require('electron');
 const fixturePng=(await require('sharp')({create:{width:640,height:360,channels:3,background:'#3184dc'}}).png().toBuffer()).toString('base64');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'nova-document-reader-ui-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await fs.writeFile(path.join(root,'index.html'),`<html lang="zh-CN"><meta http-equiv="Content-Security-Policy" content="default-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:"><div id="root"></div><script type="module" src="/fixture.jsx"></script></html>`);
 await fs.writeFile(path.join(root,'fixture.jsx'),`
import {useState} from 'react';import {createRoot} from 'react-dom/client';
import '${workbench}/node_modules/@douyinfe/semi-ui-19/react19-adapter';import '${workbench}/node_modules/@douyinfe/semi-ui-19/lib/es/_base/base.css';import '${workbench}/src/renderer/style.css';
import {DocumentSourceReader} from '${workbench}/src/renderer/document-source-reader.tsx';
const h='a'.repeat(64),id='doc-'+h.slice(0,32),ref=(raw,kind,n,state='ready')=>({raw,destination:n===3?'https://example.com/':raw,label:'引用'+n,kind,refId:String(n).padStart(64,'0'),targetIdentity:String(n+10).padStart(64,'0'),state,issue:state==='ready'?'':'当前绑定来源中没有可读目标。'});
window.reads=[];window.opens=[];window.refs=[];window.revoked=[];const revoke=URL.revokeObjectURL.bind(URL);URL.revokeObjectURL=url=>{window.revoked.push(url);revoke(url);};
const refs=[ref('![[image.png]]','embed',1),ref('[[目标|别名]]','wiki',2),ref('[官网](https://example.com/)','link',3),ref('![[missing.png]]','embed',4,'missing')];
const first={documentId:id,hash:h,text:'# 原文\\n\\n![[image.png]]\\n\\n[[目标|别名]]\\n\\n[官网](https://example.com/)\\n\\n![[missing.png]]\\n\\n<script>bad</script>',references:refs,contentIdentity:'original',truncated:false};
const reader={readView:async input=>{window.reads.push(input);if(window.pauseRead)return new Promise(resolve=>window.finishRead=()=>resolve(first));return first;},readReference:async input=>{window.refs.push(input);if(input.refId===refs[0].refId)return{kind:'image',identity:refs[0].targetIdentity,mime:'image/png',data:Uint8Array.from(atob('${fixturePng}'),c=>c.charCodeAt(0)),width:640,height:360};return{kind:'document',view:{...first,documentId:'reading-'+h,text:'## 目标正文',references:[],contentIdentity:'target'}};},openExternal:async input=>{window.opens.push(input);}};
function Fixture(){const [scope,setScope]=useState('one'),[draft,setDraft]=useState(undefined),[active,setActive]=useState(true);window.setScope=setScope;window.setDraft=setDraft;window.setActive=setActive;return active&&<DocumentSourceReader scopeKey={scope} document={{documentId:id,expectedHash:h}} reader={reader} draftText={draft}/>;}createRoot(document.getElementById('root')).render(<Fixture/>);`);
 await build({configFile:false,root,base:'./',logLevel:'silent',resolve:{alias:{react:path.join(workbench,'node_modules/react'),'react-dom':path.join(workbench,'node_modules/react-dom')}},oxc:{jsx:{runtime:'automatic'}},build:{outDir:path.join(root,'dist'),modulePreload:false,target:'chrome148'}});
 async function main(root,evidence){
  const {app,BrowserWindow}=await import('electron'),{default:assert}=await import('node:assert/strict'),{default:path}=await import('node:path'),{default:fs}=await import('node:fs/promises');
  app.setPath('userData',path.join(root,'machine'));await app.whenReady();const win=new BrowserWindow({show:true,width:480,height:760,webPreferences:{contextIsolation:true,nodeIntegration:false}}),run=code=>win.webContents.executeJavaScript(code).catch(error=>{console.error('RUN FAILED',code);throw error;});win.webContents.on('console-message',event=>console.error('RENDERER',event.message));
  const wait=condition=>run('new Promise((resolve,reject)=>{const end=Date.now()+6000;const check=()=>{if('+condition+')return resolve();if(Date.now()>end)return reject(Error("UI condition timed out: '+condition.replaceAll('"','\\"')+'"));setTimeout(check,15)};check();})');
  try{
   await win.loadFile(path.join(root,'dist/index.html'));win.show();win.focus();win.webContents.focus();await wait('document.querySelector(".document-source-reader .image-preview-trigger img")');
   assert.equal(await run('window.opens.length'),0);assert.equal(await run('document.querySelectorAll("script[src^=http],img[src^=http],iframe").length'),0);
   assert.equal(await run('document.body.textContent.includes("<script>bad</script>")'),true);assert.equal(await run('document.body.textContent.includes("当前绑定来源中没有可读目标")'),true);
   assert.equal(await run('document.documentElement.scrollWidth<=window.innerWidth'),true,'480px reading must fit');if(evidence){await fs.mkdir(evidence,{recursive:true});await fs.writeFile(path.join(evidence,'document-reader-480.png'),(await win.webContents.capturePage()).toPNG());win.setSize(1100,900);await run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');await fs.writeFile(path.join(evidence,'document-reader-1100.png'),(await win.webContents.capturePage()).toPNG());win.setSize(480,760);}
   await run('document.querySelector(".document-reference-open-external").focus()');assert.equal(await run('document.activeElement.classList.contains("document-reference-open-external")'),true);win.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter'});win.webContents.sendInputEvent({type:'char',keyCode:'\r'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter'});await wait('window.opens.length===1');assert.equal(await run('Object.keys(window.opens[0]).some(k=>/path|url|root/i.test(k))'),false);
   await run('document.querySelector(".image-preview-trigger").focus()');win.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter'});win.webContents.sendInputEvent({type:'char',keyCode:'\r'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter'});await wait('document.querySelector("dialog[open]")');if(evidence)await fs.writeFile(path.join(evidence,'document-reader-image-preview.png'),(await win.webContents.capturePage()).toPNG());win.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});await wait('!document.querySelector("dialog[open]")');await wait('document.activeElement.classList.contains("image-preview-trigger")');
   await run('document.querySelector(".document-reference-navigate").focus();document.querySelector(".document-reference-navigate").click()');await wait('document.body.textContent.includes("目标正文")');await run('document.querySelector(".document-reader-back").click()');await wait('document.querySelector(".image-preview-trigger img")');assert.equal(await run('document.activeElement.classList.contains("document-reference-navigate")'),true,'return restores the original reference trigger');
   await run('window.setDraft("![[新增.png]]\\n\\n![[image.png]]")');await wait('document.body.textContent.includes("保存后解析")');assert.equal(await run('document.querySelectorAll(".image-preview-trigger").length'),1,'saved exact reference retains controlled image, new draft reference remains text');
   const before=await run('window.revoked.length');await run('window.pauseRead=true;window.setScope("two")');await wait('!!window.finishRead');assert.equal(await run('document.querySelectorAll("img").length'),0,'switch must immediately revoke displayed resources');await wait('window.revoked.length>'+before);
   await run('window.setActive(false)');await wait('!document.querySelector(".document-source-reader")');await run('window.finishRead()');assert.equal(await run('document.querySelectorAll("img").length'),0,'late read cannot remount old source');
   console.log('PASS actual React/Semi: controlled image, missing reference, HTML escaping, explicit external action, keyboard preview/Escape/focus return, wiki navigation/back, draft boundary, 480px, scope revocation and late-result guard.');app.exit(0);
  }catch(error){console.error(error);app.exit(1);}
 }
 await fs.writeFile(path.join(root,'main.mjs'),`(${main.toString()})(${JSON.stringify(root)},${JSON.stringify(process.env.NOVA_DOCUMENT_READING_EVIDENCE??null)});`);const child=spawn(electron,[path.join(root,'main.mjs')],{stdio:['ignore','pipe','pipe'],env:{...process.env,ELECTRON_RUN_AS_NODE:''}});let output='';for(const stream of [child.stdout,child.stderr])stream.on('data',data=>output+=data);const timer=setTimeout(()=>child.kill('SIGKILL'),45000);
 const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);}).finally(()=>clearTimeout(timer));assert.equal(code,0,output);
});
