import {app,ipcMain}from'electron';
import fs from'node:fs/promises';
import path from'node:path';
import assert from'node:assert/strict';
import {createHash}from'node:crypto';
import{performance}from'node:perf_hooks';
const entryStarted=performance.now();
const[root,resources,stageRaw,out]=process.argv.slice(2),stage=Number(stageRaw),base=path.join(resources,'app'),machine=path.join(root,'machine-'+stage);
assert.ok(root.includes('nova-capacity-0328-'));assert.equal(app.isPackaged,false);
const prepared=JSON.parse(await fs.readFile(path.join(out,'prepare-'+stage+'.json'),'utf8'));
const{BindingStore,emptyBinding}=await import(path.join(base,'workbench/dist/main/bindings.mjs'));
await new BindingStore(path.join(machine,'machine-binding.json')).save({...emptyBinding(),current:prepared.binding});
const receipt={stage,root,prepared,scope:'Fresh development Electron process, OS filesystem cache not flushed. Actual packaged candidate renderer/preload/IPC/worker. Initial automatic library reads held until explicit process-cold/warm measurements finish.',appIsPackaged:app.isPackaged,calls:[],metrics:[],consoleErrors:[],failures:[],ui:[]};
let backgroundReleased=false,activeMethod=null,releaseBackground;const backgroundGate=new Promise(r=>releaseBackground=r);
const libraryMethods=new Set(['listContents','listCoverAssets','readWorkspace','readWorkspaceLibrary','readContent','updateContent','openLibrary']);
const allowed=new Set(['status','readPreferences','readBootstrapRecovery','readReminderStatus','readSetup',...libraryMethods]);
const originalHandle=ipcMain.handle;
ipcMain.handle=function(channel,listener){return originalHandle.call(this,channel,async(...args)=>{const method=channel.replace(/^nova:/,'');if(!allowed.has(method)){receipt.failures.push({blocked:channel});return{ok:false,error:{code:'CAPACITY_BLOCKED',message:'Unrelated action blocked'}};}if(libraryMethods.has(method)&&!backgroundReleased&&activeMethod!==method)await backgroundGate;const begin=performance.now();try{return await listener(...args);}finally{receipt.calls.push({method,ms:performance.now()-begin,measured:!backgroundReleased});}});};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function fingerprint(root){const result={};async function walk(dir,prefix=''){for(const name of(await fs.readdir(dir)).sort()){if(name==='库锁')continue;const file=path.join(dir,name),rel=path.join(prefix,name),s=await fs.lstat(file);assert.ok(!s.isSymbolicLink());if(s.isDirectory())await walk(file,rel);else result[rel]={bytes:s.size,sha256:sha(await fs.readFile(file))};}}await walk(root);return result;}
const save=()=>fs.writeFile(path.join(out,'native-'+stage+'.json'),JSON.stringify(receipt,null,2)+'\n');
const timeout=setTimeout(()=>{receipt.failures.push({error:'180s native timeout'});void save().finally(()=>app.exit(1));},180000);
const{startDesktop}=await import(path.join(base,'workbench/dist/main/desktop.mjs'));
startDesktop({show:false,userData:machine,marketRoot:path.join(resources,'plugin-marketplace'),dialogs:{library:async()=>prepared.binding.root},onConsoleMessage(message){if(/uncaught|error:/i.test(message))receipt.consoleErrors.push(message);},async ready({window,release,worker,controller}){
 assert.equal(release.version,'0.3.28');assert.equal(window.isVisible(),false);window.webContents.setBackgroundThrottling(false);window.setContentSize(1440,1000);receipt.version=release.version;receipt.pid=process.pid;receipt.desktopReadyMsFromEntry=performance.now()-entryStarted;
 controller.copyText=()=>{throw Error('Clipboard forbidden');};controller.openPublicationURL=async()=>{throw Error('External URL forbidden');};controller.revealFolder=()=>{throw Error('Reveal forbidden');};
 const run=code=>window.webContents.executeJavaScript(code);
 const measure=async(label,method,input,project='return {value};')=>{activeMethod=method;const report=await run(`(async()=>{const t=performance.now();const reply=await window.contentHub[${JSON.stringify(method)}](${input===undefined?'':JSON.stringify(input)});const ms=performance.now()-t;if(!reply.ok)throw Error(JSON.stringify(reply));const value=reply.value;const dtoBytes=new TextEncoder().encode(JSON.stringify(value)??'').byteLength;return {ms,dtoBytes,...(()=>{${project}})()};})()`);activeMethod=null;receipt.metrics.push({label,method,...report});await save();return report;};
 const projection=`return{contents:value.contentDetails.length,collections:value.collections.length,plans:value.contentDetails.reduce((n,x)=>n+x.plans.length,0),templates:value.templates.length,prompts:value.prompts.length};`;
 for(let i=0;i<3;i++){const report=await measure(i===0?'process-cold-first-native-read':'warm-read-'+i,'readWorkspaceLibrary',undefined,projection);assert.equal(report.contents,prepared.actualContents);assert.equal(report.plans,prepared.plans);}
 await measure('native-open-existing-library-warm','openLibrary',undefined,'return{opened:true};');
 await measure('native-list-plus-renderer-filter','listContents',{view:'active'},`const t=performance.now();const found=value.filter(x=>(x.title+' '+x.body).toLocaleLowerCase().includes(${JSON.stringify(prepared.lastTitle.toLowerCase())}));return{matches:found.length,matchedId:found[0]?.id,filterMs:performance.now()-t};`);
 const last=(await measure('read-last-long-content','readContent',{id:prepared.lastId})).value;assert.equal(last.title,prepared.lastTitle);
 const current=(await measure('read-save-target','readContent',{id:prepared.saveId})).value;
 const before=await fingerprint(prepared.binding.root),bindingBefore=await fs.readFile(path.join(machine,'machine-binding.json'));
 const body=current.body+'\nNative capacity save '+stage;
 const updated=(await measure('save-one-content','updateContent',{id:current.id,title:current.title,body,editToken:current.editToken})).value;assert.equal(updated.body,body);
 const reread=(await measure('read-after-save','readContent',{id:current.id})).value;assert.deepEqual(reread,updated);
 const after=await fingerprint(prepared.binding.root),changed=Object.keys(before).filter(k=>JSON.stringify(before[k])!==JSON.stringify(after[k])),added=Object.keys(after).filter(k=>!Object.hasOwn(before,k)),deleted=Object.keys(before).filter(k=>!Object.hasOwn(after,k));
 const ownPrefix='内容/'+current.id+'/';assert.ok(changed.every(k=>k.startsWith(ownPrefix)));assert.ok(added.every(k=>k.startsWith('系统（别动）/事务/')));assert.deepEqual(deleted,[]);assert.ok(changed.some(k=>k.endsWith('正文.md')));assert.ok(changed.some(k=>k.endsWith('内容.json')));assert.deepEqual(await fs.readFile(path.join(machine,'machine-binding.json')),bindingBefore);
 receipt.saveDifference={changed,added,deleted,unchangedExistingFiles:Object.keys(before).length-changed.length,allOtherBusinessBytesUnchanged:true,bindingBytesUnchanged:true,bodyChangedAndReadBack:true};
 activeMethod=null;backgroundReleased=true;releaseBackground();
 const wait=condition=>run(`new Promise((resolve,reject)=>{const end=Date.now()+30000;function t(){if(${condition})return resolve(true);if(Date.now()>end)return reject(Error('UI timeout: '+${JSON.stringify(condition)}));setTimeout(t,20);}t();})`);
 const idle=`document.querySelector('main[data-loaded="true"][data-busy="false"]')`;
 try{
  await wait(idle);const started=performance.now();await run(`document.querySelector('#nav-content').click()`);await wait(`document.querySelectorAll('#contents [data-content-id]').length>0&&${idle}`);receipt.ui.push({action:'open-content-page',ms:performance.now()-started,dom:await run(`({rows:document.querySelectorAll('#contents [data-content-id]').length,nodes:document.querySelectorAll('*').length})`)});
  for(const size of[20,50,100]){
   const t=performance.now();if(size!==20){await run(`document.querySelector('#contents .semi-page-switch .semi-select').click()`);await wait(`[...document.querySelectorAll('[role=option]')].some(x=>x.textContent.trim().startsWith(${JSON.stringify(String(size))}))`);await run(`[...document.querySelectorAll('[role=option]')].find(x=>x.textContent.trim().startsWith(${JSON.stringify(String(size))})).click()`);}
   await wait(`document.querySelectorAll('#contents [data-content-id]').length===${Math.min(size,prepared.actualContents)}`);
   receipt.ui.push({action:'page-size',size,ms:performance.now()-t,dom:await run(`({rows:document.querySelectorAll('#contents [data-content-id]').length,nodes:document.querySelectorAll('*').length})`)});
   if(prepared.actualContents>size){const t=performance.now();await run(`document.querySelector('#contents .semi-page-next').click()`);await wait(`document.querySelector('#contents .pagination-bar [role=status]').textContent.includes('${size+1}–')`);receipt.ui.push({action:'next-page',size,ms:performance.now()-t,dom:await run(`({rows:document.querySelectorAll('#contents [data-content-id]').length,nodes:document.querySelectorAll('*').length})`)});}
  }
  const t=performance.now();await run(`(()=>{const input=document.querySelector('input[aria-label="搜索内容"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(prepared.lastTitle)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);await wait(`document.querySelectorAll('#contents [data-content-id]').length===1&&document.querySelector('#contents [data-content-id]').getAttribute('data-content-id')===${JSON.stringify(prepared.lastId)}`);receipt.ui.push({action:'search-last-record',query:prepared.lastTitle,ms:performance.now()-t,dom:await run(`({rows:document.querySelectorAll('#contents [data-content-id]').length,nodes:document.querySelectorAll('*').length})`)});
 }catch(error){receipt.uiFailure={message:String(error),stack:error.stack};}
 receipt.zeroConsoleErrors=receipt.consoleErrors.length===0;assert.deepEqual(receipt.failures,[]);receipt.passed=true;receipt.finishedAt=new Date().toISOString();await save();clearTimeout(timeout);app.quit();
}}).catch(async error=>{receipt.failures.push({message:String(error),stack:error.stack});await save();clearTimeout(timeout);app.exit(1);});
