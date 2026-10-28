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
window.saves=[];window.checks=0;window.defaultView={values:{...defaultServiceSettings(),asr:{...defaultServiceSettings().asr,mode:'local-only'}},credentials:{tikhub:{hasKey:false},model:{hasKey:false},asr:{hasKey:false},groq:{hasKey:false},custom:{hasKey:false}},encryptionAvailable:false,encryptionStatus:'unchecked'};
const candidates=[{id:'a',executable:'/Users/同事/.venvs/Qwen 语音/bin/python3',modelPath:'/Users/同事/Models/Qwen3-ASR',module:'mlx_audio'},{id:'b',executable:'/Users/同事/miniforge3/envs/asr/bin/python3',modelPath:'/Users/同事/Models/Qwen3-ASR',module:'qwen_asr'}];
function Fixture(){return <ServiceSettings value={null} onLoad={async()=>structuredClone(window.defaultView)} onCheck={async()=>{window.checks++;return {localAsr:window.defaultView.values.asr.localExecutable?{available:true,reason:'真实样本识别通过，时间码未验证',status:'ready',capabilities:{text:true,timestamps:false,mp4Decode:false},candidates,selected:candidates.find(c=>c.executable===window.defaultView.values.asr.localExecutable)}:{available:false,reason:'发现多个环境，请选择后保存并检查',status:'choice-required',candidates},encryptionAvailable:false,encryptionStatus:'unchecked'};}} onReveal={async()=>{throw Error('must not reveal')}} onSave={async patch=>{window.saves.push(structuredClone(patch));window.defaultView={...window.defaultView,values:patch.values??window.defaultView.values};return structuredClone(window.defaultView);}}/>;}createRoot(document.getElementById('root')).render(<Fixture/>);
`);
await build({configFile:false,root,base:'./',logLevel:'warn',resolve:{alias:{react:path.join(workbench,'node_modules/react'),'react-dom':path.join(workbench,'node_modules/react-dom')}},oxc:{jsx:{runtime:'automatic'}},build:{outDir:path.join(root,'dist'),modulePreload:false,target:'chrome148'}});
async function probeMain(root){
 const {app,BrowserWindow}=await import('electron'),{default:assert}=await import('node:assert/strict'),{default:fs}=await import('node:fs/promises'),{default:path}=await import('node:path');
 app.setPath('userData',path.join(root,'machine'));await app.whenReady();const win=new BrowserWindow({show:true,width:1280,height:860,useContentSize:true,webPreferences:{contextIsolation:true,nodeIntegration:false}}),run=code=>win.webContents.executeJavaScript(code);
 const wait=condition=>run(`new Promise((resolve,reject)=>{const end=Date.now()+6000;const check=()=>{if(${condition})return resolve();if(Date.now()>end)return reject(Error('UI condition timed out'));setTimeout(check,15);};check();})`);
 const click=id=>run(`document.getElementById(${JSON.stringify(id)}).click()`);
 try{
  await win.loadFile(path.join(root,'dist/index.html'));await wait('document.getElementById("service-asr-detect")&&!document.getElementById("service-asr-detect").disabled');
  assert.equal(await run('window.checks'),0,'passive settings never loads a model');
  await click('service-asr-detect');await wait('document.getElementById("service-asr-candidate")');
  assert.equal(await run('window.saves.length'),0,'detection without edits does not save a configuration');
  assert.equal(await run('document.body.textContent.includes("发现多个环境")'),true);
  await run(`document.getElementById('service-asr-candidate').click()`);await wait('document.querySelectorAll(".semi-select-option").length>0');
  await run(`Array.from(document.querySelectorAll('.semi-select-option')).find(e=>e.textContent.includes('miniforge3')).click()`);await wait('document.getElementById("service-asr-executable").value.includes("miniforge3")');
  assert.equal(await run('window.saves.length'),0,'candidate selection must remain an unsaved draft');
  assert.equal(await run('document.body.textContent.includes("请保存并检查")'),true);
  await run('document.querySelector(".service-settings-actions button[type=submit]").click()');await wait('window.saves.length===1&&window.checks===2&&!document.getElementById("service-asr-detect").disabled');
  assert.equal(await run('window.saves[0].values.asr.localModule'),'qwen_asr');
  assert.equal(await run('document.body.textContent.includes("语音文本：已实测")'),true);
  assert.equal(await run('document.body.textContent.includes("真实时间码：未验证")'),true);
  await new Promise(resolve=>setTimeout(resolve,200));await fs.writeFile(path.join(root,'external-asr-1280x860.png'),(await win.webContents.capturePage()).toPNG());win.setContentSize(960,680);await new Promise(resolve=>setTimeout(resolve,150));await fs.writeFile(path.join(root,'external-asr-960x680.png'),(await win.webContents.capturePage()).toPNG());
  assert.equal(await run('document.documentElement.scrollWidth<=window.innerWidth'),true,'Unicode paths and candidate labels must not create horizontal overflow');
  console.log('PASS: passive load, detect multiple candidates, actual Semi selection, explicit save, preserved module, separate text/timestamp/decode states, 1280x860 and 960x680 screenshots.');app.exit(0);
 }catch(error){console.error(error);app.exit(1);}
}
await fs.writeFile(path.join(root,'probe-main.mjs'),`(${probeMain.toString()})(${JSON.stringify(root)});`);const child=spawn(electron,[path.join(root,'probe-main.mjs')],{stdio:'inherit',env:{...process.env,ELECTRON_RUN_AS_NODE:''}});const timer=setTimeout(()=>child.kill('SIGKILL'),60000);const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);}).finally(()=>clearTimeout(timer));console.log('Synthetic UI evidence directory:',root);assert.equal(code,0,'service settings UI probe');
