// Real React/Semi in isolated Electron; no assistant launch or user library access.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn, execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import electron from 'electron';
import {build} from 'vite';

const workbench = fileURLToPath(new URL('../', import.meta.url));
const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'nova-cover-notice-')));
try {
    await fs.writeFile(path.join(root, 'index.html'), '<html lang="zh-CN"><div id="root"></div><script type="module" src="/probe.jsx"></script></html>');
    await fs.writeFile(path.join(root, 'probe.jsx'), `
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import ${JSON.stringify(path.join(workbench, 'node_modules/@douyinfe/semi-ui-19/react19-adapter'))};
import ${JSON.stringify(path.join(workbench, 'node_modules/@douyinfe/semi-ui-19/lib/es/_base/base.css'))};
import {CoverPanel} from ${JSON.stringify(path.join(workbench, 'src/renderer/covers.tsx'))};
const content = {id:'content',title:'封面测试',body:'正文',editToken:'token'};
const assets = {templates:[{id:'template',version:1,name:'模板',description:'样张',samples:[{assetHash:'sample',url:''}]}],photos:[]};
let view = {content,jobs:[],candidates:[],selectedCandidateId:null}, serial = 0;window.continues=[];
const ok = value => ({ok:true,value});
function launch() {
  const attempt = {attemptId:'attempt-'+(++serial),host:'workbuddy',status:'created',failure:null};
  view = {...view,jobs:[{id:'request',activeAttemptId:attempt.attemptId,attempts:[...(view.jobs[0]?.attempts??[]),attempt]}]};
  if(window.failLaunch) return {ok:false,error:{code:'LAUNCH_FAILED',message:'真实交接失败'}};
  return ok({...view,launchRequested:true});
}
window.finish = status => {view={...view,jobs:view.jobs.map(job=>({...job,activeAttemptId:null,attempts:job.attempts.map(attempt=>attempt.attemptId===job.activeAttemptId?{...attempt,status,failure:status==='failed'?{code:'FAILED',message:'制作失败详情'}:null}:attempt)}))};};
window.contentHub = {readProductionCreation:async()=>ok({content:view.content,creation:null}),listCoverAssets:async()=>ok(assets),readCover:async()=>ok(view),generateCover:async input=>{window.lastInput=input;return launch();},retryCover:async()=>launch(),continueCover:async()=>ok({launchRequested:true}),continueBoundCover:async reference=>{window.continues.push(reference);return ok({launchRequested:true});},cancelCover:async()=>{window.finish('cancelled');return ok(view);}};
function Probe() {
 const [token,setToken]=useState(0);
 window.refresh=()=>setToken(old=>old+1);
 return <CoverPanel status={{currentName:'fixture',assistant:'workbuddy'}} content={content} dirty={false} busy={false} blocked={false} refreshToken={token} readAutomatically={async()=>({assets,cover:view})} run={async action=>{try{return await action();}catch(error){window.lastError=error.message;}}} onContent={()=>{}}/>;
}
createRoot(document.getElementById('root')).render(<Probe/>);
`);
    const baseline = process.argv.includes('--baseline') ? execFileSync('git', ['show', 'HEAD:workbench/src/renderer/covers.tsx'], {cwd: workbench, encoding: 'utf8'}) : null;
    await build({configFile:false,root,base:'./',plugins:baseline?[{name:'baseline-cover-notice',enforce:'pre',transform(_source,id){if(id===path.join(workbench,'src/renderer/covers.tsx'))return baseline;}}]:[],resolve:{alias:{react:path.join(workbench,'node_modules/react'),'react-dom':path.join(workbench,'node_modules/react-dom')}},oxc:{jsx:{runtime:'automatic'}},build:{outDir:path.join(root,'dist'),modulePreload:false,target:'chrome148'}});
    async function probeMain(probeRoot) {
        const {app,BrowserWindow} = await import('electron');
        const {default:assert} = await import('node:assert/strict');
        const {default:path} = await import('node:path');
        app.setPath('userData',path.join(probeRoot,'machine'));
        await app.whenReady();
        const window = new BrowserWindow({show:false,webPreferences:{contextIsolation:true,nodeIntegration:false}});
        const run = source => window.webContents.executeJavaScript(source);
        const wait = condition => run(`new Promise((resolve,reject)=>{const end=Date.now()+3000;const check=()=>{if(${condition})return resolve(true);if(Date.now()>end)return reject(new Error('State timeout: '+${JSON.stringify(condition)}));setTimeout(check,10)};check()})`);
        const notice = 'document.getElementById("cover-notice").textContent';
        const live = '!!document.getElementById("cover-jobs")';
        const clickText = text => run(`(()=>{const button=[...document.querySelectorAll('button')].find(el=>el.textContent===${JSON.stringify(text)});if(!button||button.disabled)throw new Error('Missing/enabled button: '+${JSON.stringify(text)});button.click()})()`);
        async function retry() {await clickText('按这组设置重做');await wait(`${live} && ${notice}.includes('尚未收到助手接单记录')`);}
        try {
            await window.loadFile(path.join(probeRoot,'dist/index.html'));
            await wait(`document.querySelector('.cover-workspace-heading p')?.textContent.includes('选好风格')`);
            await clickText('制作封面');
            await wait('document.querySelector("#generate-cover:not(:disabled)")');
            await run(`(()=>{const el=document.getElementById('cover-prompt');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,'保留我的要求');el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
            await wait('document.getElementById("cover-prompt").value === "保留我的要求"');
            await run('document.getElementById("generate-cover").click()');
            await wait(`${live} && ${notice}.includes('尚未收到助手接单记录')`);
            assert.equal(await run('window.lastInput.input.prompt'),'保留我的要求');
            assert.match(await run(notice),/如果还没发送.*选择模型并手动发送/);
            await clickText('打开 WorkBuddy 继续');await wait('window.continues.length===1');assert.equal(await run('window.continues[0].attemptId'),'attempt-1');
            assert.equal(await run('document.querySelector(".cover-state").textContent'),'待助手接单');
            await clickText('取消这次生成');
            await wait(`!(${live}) && ${notice} === ''`);
            await retry();
            await clickText('取消这次生成');
            await wait(`!(${live}) && ${notice} === ''`);
            for(const status of ['cancelled','committed','failed','superseded']) {
                await retry();
                await run(`window.finish(${JSON.stringify(status)});window.refresh()`);
                await wait(`!(${live}) && ${notice} === ''`);
                if(status==='failed') assert.equal(await run(`document.querySelector('.cover-history [role=alert]')?.textContent`),'制作失败详情');
            }
            await clickText('制作封面');
            await wait('document.getElementById("cover-prompt")');
            assert.equal(await run('document.getElementById("cover-prompt").value'),'保留我的要求','cancel/refresh retain composer input');
            await clickText('暂时收起');
            await run('window.failLaunch=true');
            await clickText('按这组设置重做');
            await wait(`${live} && ${notice}.includes('尚未确认交接成功')`);
            await run('window.finish("cancelled");window.refresh()');
            await wait(`!(${live})`);
            assert.equal(await run(`${notice}.includes('尚未确认交接成功')`),true,'terminal refresh preserves genuine error notice');
            console.log('PASS real React/Semi/Electron: generate/cancel/retry/cancel; background cancelled/committed/failed/superseded clear launch success; failures and composer input survive.');
            app.exit(0);
        } catch(error) {console.error(error);app.exit(1);}
    }
    await fs.writeFile(path.join(root,'main.mjs'),`(${probeMain.toString()})(${JSON.stringify(root)})`);
    await new Promise((resolve,reject)=>{
        const child=spawn(electron,[path.join(root,'main.mjs')],{env:process.env,stdio:'inherit'});
        const timeout=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('Cover notice probe timed out'));},30000);
        child.once('error',reject);
        child.once('close',code=>{clearTimeout(timeout);code===0?resolve():reject(new Error('Cover notice probe failed: '+code));});
    });
} finally {await fs.rm(root,{recursive:true,force:true});}
