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
window.writes=[];window.photoChoices=[];
window.library={templates:[{id:'template-a',title:'原模板',description:'旧描述',rules:['旧规则'],currentVersion:1,versions:[{version:1}],editToken:'token-a',builtin:false,deletedAt:null}],photos:[],settings:{defaults:{},channels:[]}};
window.contentHub={chooseTemplateImages:async()=>({ok:true,value:[{assetHash:'image-a',originalName:'合成参考图',width:1,height:1,url:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='}]}),choosePhoto:async input=>{window.photoChoices.push(input);return {ok:true,value:null};},mutateWorkspace:async input=>{window.writes.push(input);return {ok:true,value:{library:window.library}};}};
function Probe(){const [busy,setBusy]=useState(false);window.setBusy=setBusy;return <TemplatesPage library={window.library} assets={{templates:[],photos:[]}} busy={busy} run={action=>action()} refresh={async()=>{}} useTemplate={()=>{}} managePhotos={()=>{}}/>;}
createRoot(document.getElementById('root')).render(<Probe/>);
`);
await build({configFile:false,root,base:'./',resolve:{alias:{react:path.join(workbench,'node_modules/react'),'react-dom':path.join(workbench,'node_modules/react-dom')}},oxc:{jsx:{runtime:'automatic'}},build:{outDir:path.join(root,'dist'),modulePreload:false,target:'chrome148'}});
async function probeMain(probeRoot){
const {app,BrowserWindow}=await import('electron');const {default:assert}=await import('node:assert/strict');const {default:path}=await import('node:path');
app.setPath('userData',path.join(probeRoot,'machine'));await app.whenReady();const win=new BrowserWindow({show:false,width:1280,height:1000,webPreferences:{contextIsolation:true,nodeIntegration:false}});
const run=source=>win.webContents.executeJavaScript(source).catch(error=>{console.error('Failed browser script:',source);throw error;});
const wait=condition=>run(`new Promise((resolve,reject)=>{const end=Date.now()+5000;const check=()=>{if(${condition})return resolve(true);if(Date.now()>end)return reject(new Error('State timeout: '+${JSON.stringify(condition)}+' / '+document.body.innerText.slice(0,600)));setTimeout(check,15)};check()})`);
const click=text=>run(`[...document.querySelectorAll('button')].find(button=>button.textContent===${JSON.stringify(text)}).click()`);
const type=async(selector,text)=>{await run(`document.querySelector(${JSON.stringify(selector)}).focus();document.querySelector(${JSON.stringify(selector)}).select()`);win.webContents.insertText(text);await wait(`document.querySelector(${JSON.stringify(selector)}).value===${JSON.stringify(text)}`);};
try{
await win.loadFile(path.join(probeRoot,'dist/index.html'));await wait('document.querySelector(".creator-templates .semi-input-wrapper")');
await run('document.querySelector(".creator-templates .semi-checkbox input").click()');await click('从本机导入照片');await wait('window.photoChoices.length===1');assert.equal(await run('window.photoChoices[0].isOwnPhoto'),true,'Semi checkbox preserves explicit own-photo declaration');
await click('＋ 导入我的模板');await wait('document.querySelector("dialog[open] form")');
assert.equal(await run('document.querySelectorAll("dialog .semi-input-wrapper").length'),1);assert.equal(await run('document.querySelectorAll("dialog .semi-input-textarea-wrapper").length'),2);
assert.equal(await run('document.querySelector("dialog input").required && document.querySelector("dialog input").maxLength===200'),true,'native title validation survives');
assert.equal(await run('document.querySelector("dialog textarea").maxLength'),10000,'description maxLength survives');
await type('dialog input','新模板');await type('dialog textarea','  描述第一行\n{{保留占位符}}\n描述最后一行  ');
await run('document.querySelectorAll("dialog textarea")[1].focus()');win.webContents.insertText('首条规则\n第二条规则');await wait('document.querySelectorAll("dialog textarea")[1].value.includes("第二条规则")');
await run('window.setBusy(true)');await wait('[...document.querySelectorAll("dialog input,dialog textarea")].every(input=>input.disabled)');
await run('window.setBusy(false)');await wait('[...document.querySelectorAll("dialog input,dialog textarea")].every(input=>!input.disabled)');
await click('确认新增模板');await wait('window.writes.length===1 && !document.querySelector("dialog")');assert.deepEqual(await run('window.writes[0]'),{op:'createTemplate',name:'新模板',description:'  描述第一行\n{{保留占位符}}\n描述最后一行  ',rules:['首条规则','第二条规则'],styleAssetHashes:['image-a']},'explicit save keeps description bytes and splits rules exactly');
await click('版本与回收站');await click('添加新版本');await wait('document.querySelector("dialog input")?.readOnly');
assert.equal(await run('document.querySelector("dialog input").value'),'原模板','existing template name remains read-only');
await click('关闭');await click('放弃填写并关闭');await wait('!document.querySelector("dialog")');assert.equal(await run('window.writes.length'),1,'discard does not save');
console.log('PASS actual React/Semi/Electron: template required/maxLength, multiline source bytes, literal slots, rule splitting, busy locks, explicit save, read-only version name, discard and own-photo checkbox');app.exit(0);
}catch(error){console.error(error);app.exit(1);}}
await fs.writeFile(path.join(root,'probe-main.mjs'),`(${probeMain.toString()})(${JSON.stringify(root)});`);
const child=spawn(electron,[path.join(root,'probe-main.mjs')],{stdio:'inherit',env:{...process.env,ELECTRON_RUN_AS_NODE:''}});
process.exitCode=await new Promise(resolve=>child.on('exit',code=>resolve(code??1)));console.log('Probe fixture:',root);
