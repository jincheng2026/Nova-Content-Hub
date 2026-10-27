// Real React/Semi controls; every credential in this isolated UI test is synthetic.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import electron from 'electron';
import {build} from 'vite';
const workbench=fileURLToPath(new URL('../',import.meta.url)),root=await fs.mkdtemp(path.join(os.tmpdir(),'nova-service-settings-ui-'));
await fs.writeFile(path.join(root,'index.html'),'<html lang="zh-CN"><div id="root"></div><script type="module" src="/fixture.jsx"></script></html>');
await fs.writeFile(path.join(root,'fixture.jsx'),`
import {useState} from 'react';import {createRoot} from 'react-dom/client';
import '${workbench}/node_modules/@douyinfe/semi-ui-19/react19-adapter';import '${workbench}/node_modules/@douyinfe/semi-ui-19/lib/es/_base/base.css';import '${workbench}/src/renderer/style.css';
import {ServiceSettings} from '${workbench}/src/renderer/service-settings.tsx';import {defaultServiceSettings} from '${workbench}/src/shared/service-validation.ts';
window.reveals=[];window.saves=[];window.defaultView={values:{...defaultServiceSettings(),asr:{...defaultServiceSettings().asr,mode:'volc'}},credentials:{tikhub:{hasKey:true},model:{hasKey:true},asr:{hasKey:true}},encryptionAvailable:true};
function Fixture(){const [mounted,setMounted]=useState(true),[active,setActive]=useState(true);window.setMounted=setMounted;window.setActive=setActive;return mounted&&<ServiceSettings active={active} value={window.defaultView} onLoad={async()=>window.defaultView} onCheck={async()=>({localAsr:{available:false,reason:'synthetic readiness'},encryptionAvailable:true})} onReveal={async service=>{window.reveals.push(service);if(window.pauseReveal){await new Promise(resolve=>window.finishReveal=resolve);}if(window.failReveal)throw Error('fake-private-error-must-not-render');return{service,key:'fake-saved-'+service};}} onSave={async patch=>{window.saves.push(patch);const next=structuredClone(window.defaultView);if(patch.values)next.values=patch.values;for(const [name,value]of Object.entries(patch.keys??{}))next.credentials[name].hasKey=value!==null;return next;}}/>;}createRoot(document.getElementById('root')).render(<Fixture/>);
`);
await build({configFile:false,root,base:'./',logLevel:'warn',resolve:{alias:{react:path.join(workbench,'node_modules/react'),'react-dom':path.join(workbench,'node_modules/react-dom')}},oxc:{jsx:{runtime:'automatic'}},build:{outDir:path.join(root,'dist'),modulePreload:false,target:'chrome148'}});
async function probeMain(root){
 const {app,BrowserWindow}=await import('electron'),{default:assert}=await import('node:assert/strict'),{default:fs}=await import('node:fs/promises'),{default:path}=await import('node:path');
 app.setPath('userData',path.join(root,'machine'));await app.whenReady();const win=new BrowserWindow({show:true,width:1100,height:900,webPreferences:{contextIsolation:true,nodeIntegration:false}}),run=code=>win.webContents.executeJavaScript(code);
 const wait=condition=>run(`new Promise((resolve,reject)=>{const end=Date.now()+6000;const check=()=>{if(${condition})return resolve();if(Date.now()>end)return reject(Error('UI condition timed out'));setTimeout(check,15);};check();})`);
 const click=id=>run(`document.getElementById(${JSON.stringify(id)}).click()`);
 try{
  await win.loadFile(path.join(root,'dist/index.html'));await wait('document.getElementById("service-key-tikhub")');
  assert.equal(await run('document.querySelectorAll(".service-settings-key-saved input[readonly]").length'),2,'configured keys need a visible saved-key field');
  assert.equal(await run('!!document.querySelector("[id^=service-model-], #service-key-model, #service-key-reveal-model")'),false,'general model settings must not be exposed');
  assert.equal(await run('window.reveals.length'),0,'mount must not disclose any saved credential');
  for(const name of ['tikhub','asr']){
   assert.equal(await run(`document.getElementById('service-saved-key-${name}').value`),'••••••••');
   await click(`service-key-reveal-${name}`);await wait(`document.getElementById('service-saved-key-${name}').value==='fake-saved-${name}'`);
   assert.equal(await run(`document.getElementById('service-saved-key-${name}').readOnly`),true);
   await click(`service-key-reveal-${name}`);await wait(`document.getElementById('service-saved-key-${name}').value==='••••••••'`);
  }
  await click('service-key-reveal-tikhub');await wait('document.getElementById("service-saved-key-tikhub").value==="fake-saved-tikhub"');await run('window.setActive(false)');await wait('document.getElementById("service-saved-key-tikhub").value==="••••••••"');await run('window.setActive(true)');await wait('!document.getElementById("service-key-reveal-tikhub").disabled');
  await run('window.pauseReveal=true');await click('service-key-reveal-tikhub');await wait('!!window.finishReveal');
  await run('window.oldRevealFinish=window.finishReveal;window.pauseReveal=false');await click('service-key-reveal-asr');await run('window.oldRevealFinish()');
  await wait('document.getElementById("service-saved-key-asr").value==="fake-saved-asr"');
  assert.equal(await run('document.getElementById("service-saved-key-tikhub").value'),'••••••••','changing viewed service hides prior key');
  await click('service-key-reveal-asr');
  await run('window.pauseReveal=true');await click('service-key-reveal-asr');await wait('window.reveals.at(-1)==="asr"');
  await run('window.setMounted(false)');await wait('!document.querySelector(".service-settings")');await run('window.finishReveal();window.pauseReveal=false;window.setMounted(true)');await wait('document.getElementById("service-saved-key-asr")');
  assert.equal(await run('document.getElementById("service-saved-key-asr").value'),'••••••••','late response must not survive settings unmount');
  await run('window.failReveal=true');await click('service-key-reveal-asr');await wait('document.body.textContent.includes("查看失败")');assert.equal(await run('document.body.textContent.includes("fake-private-error")'),false);await run('window.failReveal=false');
  await run('document.querySelector(".service-settings-actions button[type=submit]").click()');await wait('document.body.textContent.includes("服务设置已保存")');assert.equal(await run('window.saves.length'),0,'masked values must not be resubmitted as keys');
  await click('service-key-clear-tikhub');assert.equal(await run('window.saves.length'),0,'clear must wait for explicit save');await wait('document.body.textContent.includes("保存后清除")');
  await run('document.querySelector(".service-settings-actions button[type=submit]").click()');await wait('window.saves.length===1');assert.deepEqual(await run('window.saves[0].keys'),{tikhub:null});
  await run('window.setMounted(false)');await wait('!document.querySelector(".service-settings")');await run('window.setMounted(true)');await wait('document.getElementById("service-saved-key-tikhub")');
  await fs.writeFile(path.join(root,'settings-masked-wide.png'),(await win.webContents.capturePage()).toPNG());win.setSize(700,900);await new Promise(resolve=>setTimeout(resolve,150));await fs.writeFile(path.join(root,'settings-masked-narrow.png'),(await win.webContents.capturePage()).toPNG());
  console.log('PASS: masked configured keys, explicit reveal/hide for all services, read-only disclosure, switching service, late response/unmount, generic failure, no masked save, explicit clear/save, 1100px and 700px screenshots.');app.exit(0);
 }catch(error){console.error(error);app.exit(1);}
}
await fs.writeFile(path.join(root,'probe-main.mjs'),`(${probeMain.toString()})(${JSON.stringify(root)});`);const child=spawn(electron,[path.join(root,'probe-main.mjs')],{stdio:'inherit',env:{...process.env,ELECTRON_RUN_AS_NODE:''}});const timer=setTimeout(()=>child.kill('SIGKILL'),60000);const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);}).finally(()=>clearTimeout(timer));console.log('Synthetic UI evidence directory:',root);assert.equal(code,0,'service settings UI probe');
