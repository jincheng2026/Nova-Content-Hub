// Actual template inputs in React/Semi; fixture bridge, isolated userData, no real library writes.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import electron from 'electron';
import {build} from 'vite';
import {fileURLToPath} from 'node:url';
const workbench=fileURLToPath(new URL('../',import.meta.url));
const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'nova-semi-template-inputs-')));
await fs.writeFile(path.join(root,'index.html'),'<html lang="zh-CN"><div id="root"></div><script type="module" src="/probe.jsx"></script></html>');
await fs.writeFile(path.join(root,'probe.jsx'),`
import {useState} from 'react';import {createRoot} from 'react-dom/client';
import '${workbench}/node_modules/@douyinfe/semi-ui-19/react19-adapter';import '${workbench}/node_modules/@douyinfe/semi-ui-19/lib/es/_base/base.css';import '${workbench}/src/renderer/style.css';
import {TemplatesPage} from '${workbench}/src/renderer/workspace-pages.tsx';
window.writes=[];window.studyCalls=[];window.failures=[];window.assistantReady=false;
window.library={templates:[{id:'template-a',title:'原模板',description:'旧描述',rules:['旧规则'],currentVersion:1,versions:[{version:1,packageHash:'hash-a'}],editToken:'token-a',builtin:false,deletedAt:null}],photos:[],settings:{defaults:{},channels:[]}};
window.contentHub={chooseTemplateImages:async()=>({ok:true,value:[{assetHash:'image-a',originalName:'合成参考图',width:1,height:1,url:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='}]}),mutateWorkspace:async input=>{if(window.failNextSave){window.failNextSave=false;return {ok:false,error:{code:'CONFLICT',message:'合成冲突'}};}window.writes.push(input);const id='saved-'+window.writes.length;const template={...window.library.templates[0],id,title:input.name,currentVersion:1,editToken:'saved-token',rules:input.rules,description:input.description};window.library={...window.library,templates:[...window.library.templates,{...template,id:'same-name-decoy'},template]};return {ok:true,value:{objectId:id,library:window.library}};},readTemplateWorkflow:async({templateId})=>({ok:true,value:{...window.library.templates.find(t=>t.id===templateId),templateId,jobs:[]}}),readTemplateAssistantSetup:async()=>({ok:true,value:{host:'codex',ready:window.assistantReady}}),startTemplateStudy:async input=>{window.studyCalls.push(input);return {ok:true,value:{view:{...window.library.templates.find(t=>t.id===input.templateId),templateId:input.templateId,jobs:[]},launchRequested:true}};}};
function Probe(){const [busy,setBusy]=useState(false),[library,setLibrary]=useState(window.library);window.setBusy=setBusy;window.refreshProbe=()=>setLibrary({...window.library});return <TemplatesPage library={library} assets={{templates:[],photos:[]}} busy={busy} run={async action=>{try{return await action();}catch(error){window.failures.push(error.message);}}} refresh={async()=>{setLibrary(window.library);}} useTemplate={()=>{}} managePhotos={()=>{}}/>;}
createRoot(document.getElementById('root')).render(<Probe/>);
`);
await build({configFile:false,root,base:'./',resolve:{alias:{react:path.join(workbench,'node_modules/react'),'react-dom':path.join(workbench,'node_modules/react-dom')}},oxc:{jsx:{runtime:'automatic'}},build:{outDir:path.join(root,'dist'),modulePreload:false,target:'chrome148'}});
async function probeMain(probeRoot){
const {app,BrowserWindow}=await import('electron');const {default:assert}=await import('node:assert/strict');const {default:path}=await import('node:path');const {default:fs}=await import('node:fs/promises');
app.setPath('userData',path.join(probeRoot,'machine'));await app.whenReady();const win=new BrowserWindow({show:false,width:1280,height:1000,webPreferences:{contextIsolation:true,nodeIntegration:false}});
const run=source=>win.webContents.executeJavaScript(source).catch(error=>{console.error('Failed browser script:',source);throw error;});
const wait=condition=>run(`new Promise((resolve,reject)=>{const end=Date.now()+5000;const check=()=>{if(${condition})return resolve(true);if(Date.now()>end)return reject(new Error('State timeout: '+${JSON.stringify(condition)}+' / '+document.body.innerText.slice(0,600)));setTimeout(check,15)};check()})`);
const click=text=>run(`[...(document.querySelector('dialog[open]')??document).querySelectorAll('button')].find(button=>button.textContent===${JSON.stringify(text)}).click()`);
const type=async(selector,text)=>{await run(`document.querySelector(${JSON.stringify(selector)}).focus();document.querySelector(${JSON.stringify(selector)}).select()`);win.webContents.insertText(text);await wait(`document.querySelector(${JSON.stringify(selector)}).value===${JSON.stringify(text)}`);};
try{
await win.loadFile(path.join(probeRoot,'dist/index.html'));await wait('document.querySelector(".creator-templates .semi-input-wrapper")');
await click('＋ 导入我的模板');await wait('document.querySelector("dialog[open] form")');
assert.equal(await run('document.querySelectorAll("dialog .semi-input-wrapper").length'),1);assert.equal(await run('document.querySelectorAll("dialog .semi-input-textarea-wrapper").length'),2);
assert.equal(await run('document.querySelector("dialog input").required && document.querySelector("dialog input").maxLength===200'),true,'native title validation survives');
assert.equal(await run('document.querySelector("dialog textarea").maxLength'),10000,'description maxLength survives');
await type('dialog input','新模板');await type('dialog textarea','  描述第一行\n{{保留占位符}}\n描述最后一行  ');
await run('document.querySelectorAll("dialog textarea")[1].focus()');win.webContents.insertText('首条规则\n第二条规则');await wait('document.querySelectorAll("dialog textarea")[1].value.includes("第二条规则")');
await run('window.setBusy(true)');await wait('[...document.querySelectorAll("dialog input,dialog textarea")].every(input=>input.disabled)');
await run('window.setBusy(false)');await wait('[...document.querySelectorAll("dialog input,dialog textarea")].every(input=>!input.disabled)');
await click('选择模板图片');await wait('document.querySelectorAll(".template-import-grid img").length===1');await run('window.failNextSave=true');await click('导入并拆解风格');await wait('document.querySelector("dialog .management-notice")?.textContent.includes("操作未确认完成")');
assert.equal(await run('document.querySelector("dialog input").value'),'新模板','failed import retains draft');assert.equal(await run('!!document.querySelector("#template-learning-workflow")'),false,'failed import does not open another template');
await click('导入并拆解风格');await wait('window.writes.length===1 && !document.querySelector("dialog")');assert.deepEqual(await run('window.writes[0]'),{op:'createTemplate',name:'新模板',description:'  描述第一行\n{{保留占位符}}\n描述最后一行  ',rules:['首条规则','第二条规则'],styleAssetHashes:['image-a']},'explicit save keeps description bytes and splits rules exactly');
assert.equal(await run('document.querySelector("#template-learning-workflow")?.hidden'),false,'successful import opens AI style breakdown workflow');
await wait('document.querySelector(".template-workflow h3")?.textContent==="新模板 · 学习与还原"');assert.equal(await run('document.activeElement.id'),'template-learning-workflow','import focuses its workflow');assert.deepEqual(await run('window.studyCalls'),[],'import never sends images to external assistant automatically');
assert.equal(await run(`[...document.querySelectorAll('.template-workflow button')].find(button=>button.textContent==='学习整组并还原首张').disabled`),true,'assistant readiness still gates external start');
await run('window.assistantReady=true;window.refreshProbe()');await wait(`[...document.querySelectorAll('.template-workflow button')].some(button=>button.textContent==='学习整组并还原首张'&&!button.disabled)`);
await run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
await fs.writeFile(path.join(probeRoot,'import-study.png'),(await win.webContents.capturePage()).toPNG());
await click('学习整组并还原首张');await wait('window.studyCalls.length===1');assert.equal(await run('window.studyCalls[0].templateId'),'saved-1','start uses saved object ID even with same-name template');
await click('收起');
await click('版本与回收站');await click('添加新版本');await wait('document.querySelector("dialog input")?.readOnly');
assert.equal(await run('document.querySelector("dialog input").value'),'原模板','existing template name remains read-only');
await click('关闭');await click('放弃填写并关闭');await wait('!document.querySelector("dialog")');assert.equal(await run('window.writes.length'),1,'discard does not save');
await fs.writeFile(path.join(probeRoot,'result.json'),JSON.stringify({status:'PASS',writes:await run('window.writes'),studyCalls:await run('window.studyCalls'),checks:['failed import retains draft without opening workflow','receipt object ID with duplicate names','focus workflow after import','assistant readiness guard','no automatic external dispatch','explicit start retains source input','discard does not save']}));
console.log('PASS actual React/Semi/Electron: template required/maxLength, multiline source bytes, literal slots, rule splitting, busy locks, explicit save, read-only version name, discard and import-to-study focus using receipt object ID');app.exit(0);
}catch(error){console.error(error);app.exit(1);}}
await fs.writeFile(path.join(root,'probe-main.mjs'),`(${probeMain.toString()})(${JSON.stringify(root)});`);
const child=spawn(electron,[path.join(root,'probe-main.mjs')],{stdio:'inherit',env:{...process.env,ELECTRON_RUN_AS_NODE:''}});
process.exitCode=await new Promise(resolve=>child.on('exit',code=>resolve(code??1)));console.log('Probe fixture:',root);
