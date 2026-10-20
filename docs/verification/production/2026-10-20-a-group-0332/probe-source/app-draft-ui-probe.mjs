// Import the unchanged production App renderer; only IPC storage is synthetic/in-memory.
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
const repo=fileURLToPath(new URL('../../../../../',import.meta.url)),workbench=path.join(repo,'workbench');
const {default:electron}=await import(path.join(workbench,'node_modules/electron/index.js'));const {build}=await import(path.join(workbench,'node_modules/vite/dist/node/index.js'));
const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'nova-app-draft-')));
await fs.writeFile(path.join(root,'index.html'),'<html lang="zh-CN"><div id="root"></div><script type="module" src="/probe.jsx"></script></html>');
await fs.writeFile(path.join(root,'probe.jsx'),`
window.calls=[];window.documents=[];window.failList=false;window.holdRefresh=false;window.closeResult=null;window.unexpected=[];
const assets={templates:[{id:'t1',name:'合成模板',version:'1',builtin:false,samples:[]}],photos:[]};
const library=()=>({contentDetails:structuredClone(window.documents),collections:[],photos:[],prompts:[],templates:[{id:'t1',title:'合成模板',currentVersion:'1',versions:[{version:'1',packageHash:'hash'}]}],settings:{channels:[],defaults:{},customRatios:[]}});
const status=()=>({currentName:'合成隔离库',busy:false,pending:null,creating:false,assistant:'codex',maintenance:{pending:null},task:null});
const doc=(id,input)=>({id,...input,editToken:'token-'+window.calls.length,updatedAt:new Date().toISOString(),channelIds:[],plans:[],deletedAt:null,isExample:false,candidates:[],coverVariants:[],publications:[],publicationEvents:[],candidateCount:0,selectedCandidateId:null,materials:[]});
window.contentHub=new Proxy({onWorkspaceChanged:listener=>{window.changed=listener;return ()=>{};}},{get:(target,method)=>target[method]??(async input=>{
window.calls.push({method,input});let value;
if(method==='status')value=status();
else if(method==='listContents'){if(window.failList){window.failList=false;return {ok:false,error:{code:'INJECTED',message:'合成列表读取失败'}};}value=structuredClone(window.documents);}
else if(method==='readWorkspace'){if(window.holdRefresh){window.holdRefresh=false;await new Promise(resolve=>window.releaseRefresh=resolve);}value={contents:structuredClone(window.documents),channels:[],prompts:[]};}
else if(method==='readWorkspaceLibrary')value=library();
else if(method==='listCoverAssets')value=assets;
else if(method==='readPreferences')value={values:{reducedMotion:true}};
else if(method==='readTemplateWorkflow')value={title:'合成模板',editToken:'workflow',currentVersion:'1',jobs:[],builtin:false,deletedAt:null};
else if(method==='readTemplateAssistantSetup')value={host:'codex',ready:true};
else if(method==='createContent'){value=doc('created-'+(window.documents.length+1),input);window.documents.push(value);}
else if(method==='updateContent'){const i=window.documents.findIndex(d=>d.id===input.id);if(window.documents[i]?.editToken!==input.editToken)return {ok:false,error:{code:'CONFLICT',message:'合成CAS冲突'}};value=doc(input.id,{title:input.title,body:input.body});window.documents[i]=value;}
else if(method==='readContent')value=structuredClone(window.documents.find(d=>d.id===input.id));
else if(method==='readCover')value={content:structuredClone(window.documents.find(d=>d.id===input.contentId)),candidates:[],jobs:[],selectedCandidateId:null};
else {window.unexpected.push(method);throw Error('Unexpected synthetic IPC '+method);}
return {ok:true,value:structuredClone(value)};
})});
await import('${workbench}/src/renderer/app.tsx');
`);
await build({configFile:false,root,base:'./',resolve:{alias:{react:path.join(workbench,'node_modules/react'),'react-dom':path.join(workbench,'node_modules/react-dom')}},oxc:{jsx:{runtime:'automatic'}},build:{outDir:path.join(root,'dist'),modulePreload:false,target:'chrome148'},logLevel:'error'});
async function probeMain(root){
 const {app,BrowserWindow}=await import('electron'),{default:fs}=await import('node:fs/promises'),{default:path}=await import('node:path'),{default:assert}=await import('node:assert/strict');
 app.setPath('userData',path.join(root,'machine'));await app.whenReady();const win=new BrowserWindow({show:false,width:1440,height:1000,webPreferences:{contextIsolation:true,nodeIntegration:false}});
 const run=source=>win.webContents.executeJavaScript(source).catch(error=>{console.error('Browser script:',source);throw error;});
 const settle=()=>run('new Promise(resolve=>setTimeout(resolve,250))');
 const wait=condition=>run(`new Promise((resolve,reject)=>{const end=Date.now()+6000;const check=()=>{if(${condition})return resolve();if(Date.now()>end)return reject(Error('Timeout '+${JSON.stringify(condition)}));setTimeout(check,20)};check()})`);
 const click=async selector=>{await run(`document.querySelector(${JSON.stringify(selector)}).click()`);await settle();};
 const button=async text=>{await run(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}).click()`);await settle();};
 const input=async(selector,value,tag='HTMLInputElement')=>{await run(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(${tag}.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);await settle();};
 const close=()=>run('window.closeResult=null;window.dispatchEvent(new CustomEvent("nova-save-close",{detail:saved=>window.closeResult=saved}))');
 const shot=async name=>{await settle();await fs.writeFile(path.join(root,name+'.png'),(await win.webContents.capturePage()).toPNG());};const checks=[];
 try{
 await win.loadFile(path.join(root,'dist/index.html'));await wait('document.querySelector("#nav-templates:not(:disabled)")');await click('#nav-templates');await wait('document.querySelector("#template-workflow-trigger-t1")');await click('#template-workflow-trigger-t1');await wait('document.querySelector(".template-study-notes textarea:not(:disabled)")');await input('.template-study-notes textarea','完整App中的学习备注','HTMLTextAreaElement');await button('收起');await click('#nav-calendar');assert.equal(await run('document.querySelector("#nav-templates").getAttribute("aria-current")'),'page','App navigate blocks collapsed managed draft');assert.equal(await run('document.querySelector(".template-study-notes textarea").value'),'完整App中的学习备注');
 const prevented=await run('(()=>{const e=new Event("beforeunload",{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented;})()');assert.equal(prevented,true,'real App beforeunload handler guards notes');await close();await wait('window.closeResult!==null');assert.equal(await run('window.closeResult'),false,'real App native save-close refuses managed notes');await shot('app-collapsed-notes-guard');
 await click('#template-workflow-trigger-t1');await button('放弃未提交的补充要求');await click('#nav-calendar');assert.equal(await run('document.querySelector("#nav-calendar").getAttribute("aria-current")'),'page');assert.equal(await run('(()=>{const e=new Event("beforeunload",{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented;})()'),false,'guard releases after explicit discard');
 checks.push('A7 actual App.navigate, real registered beforeunload and nova-save-close listeners block collapsed learning notes; explicit discard allows navigation');
 await click('#nav-content');await click('#new-content');await input('#content-title','保存成功但列表读取失败');await input('#content-body','第一次正文','HTMLTextAreaElement');await run('window.failList=true');await close();await wait('window.closeResult!==null');assert.equal(await run('window.closeResult'),true,'confirmed create native close success despite failed list refresh');assert.equal(await run('window.calls.filter(c=>c.method==="createContent").length'),1);assert.equal(await run('document.querySelector("#dirty-state").textContent'),'已保存');assert.match(await run('document.querySelector(".app-stage").textContent'),/内容已保存，列表刷新未完成/);await click('#refresh-workspace');assert.equal(await run('window.calls.filter(c=>c.method==="createContent").length'),1,'refresh retry never creates twice');
 await input('#content-body','提交的第二版','HTMLTextAreaElement');await run('window.holdRefresh=true');await close();await wait('typeof window.releaseRefresh==="function"');await input('#content-body','全局刷新等待时继续输入','HTMLTextAreaElement');await run('window.releaseRefresh()');await wait('window.closeResult!==null');assert.equal(await run('window.closeResult'),false,'native close awaits finally and retains later edit');assert.equal(await run('document.querySelector("#content-body").value'),'全局刷新等待时继续输入');assert.equal(await run('document.querySelector("#dirty-state").textContent'),'有未保存草稿');await shot('app-save-close-retained-edit');
 await close();await wait('window.closeResult!==null');assert.equal(await run('window.closeResult'),true);assert.equal(await run('window.calls.filter(c=>c.method==="createContent").length'),1);assert.equal(await run('window.documents[0].body'),'全局刷新等待时继续输入');
 checks.push('A5 actual App native save-close event: confirmed commit + list failure returns true, refresh retry no duplicate create, editing during finally read returns false with draft, retry updates original token');
 await input('#content-body','冲突时保留的本地正文','HTMLTextAreaElement');await run('window.documents[0]={...window.documents[0],body:"外部磁盘最新正文",editToken:"external-token"}');await click('#refresh-workspace');await wait('document.querySelector("#conflict")');assert.match(await run('document.querySelector("#keep-draft").textContent'),/需保存/);await click('#keep-draft');assert.equal(await run('!!document.querySelector("#conflict")'),false);assert.equal(await run('document.querySelector("#content-body").value'),'冲突时保留的本地正文');await click('#save-content');await wait('document.querySelector("#dirty-state").textContent==="已保存"');assert.equal(await run('window.documents.length'),2);assert.equal(await run('window.documents[0].body'),'外部磁盘最新正文');assert.equal(await run('window.documents[1].body'),'冲突时保留的本地正文');await shot('app-conflict-save-as');checks.push('A6 actual conflict UI prepares a new document, user saves explicitly, original external token/body untouched');
 assert.deepEqual(await run('window.unexpected'),[]);await fs.writeFile(path.join(root,'result.json'),JSON.stringify({status:'PASS',checks,ipc:'synthetic only; actual App renderer unchanged'},null,2));console.log('PASS',JSON.stringify(checks));console.log('Evidence:',root);app.exit(0);
 }catch(error){await shot('failure');console.error(error);console.log('Evidence:',root);app.exit(1);}
}
await fs.writeFile(path.join(root,'probe-main.mjs'),`(${probeMain.toString()})(${JSON.stringify(root)});`);const child=spawn(electron,[path.join(root,'probe-main.mjs')],{stdio:'inherit',env:{...process.env,ELECTRON_RUN_AS_NODE:''}});process.exitCode=await new Promise(resolve=>child.on('exit',code=>resolve(code??1)));
if(process.env.NOVA_PROBE_EVIDENCE_DIR){const dest=path.resolve(process.env.NOVA_PROBE_EVIDENCE_DIR,'app-draft');await fs.mkdir(dest,{recursive:true});for(const name of await fs.readdir(root))if(name.endsWith('.png')||name==='result.json')await fs.copyFile(path.join(root,name),path.join(dest,name));}
