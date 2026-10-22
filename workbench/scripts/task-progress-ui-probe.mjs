// Actual React/Semi in isolated Electron, with synthetic task receipts and no user library or assistant calls.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import electron from 'electron';
import {build} from 'vite';
const workbench = fileURLToPath(new URL('../', import.meta.url));
const output = path.resolve(workbench, '../docs/verification/production/2026-10-22-local-handoff-progress');
const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'nova-task-progress-')));
try {
    await fs.mkdir(output, {recursive: true});
    await fs.writeFile(path.join(root, 'index.html'), '<html lang="zh-CN"><div id="root"></div><script type="module" src="/probe.jsx"></script></html>');
    await fs.writeFile(path.join(root, 'probe.jsx'), `
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import ${JSON.stringify(path.join(workbench, 'node_modules/@douyinfe/semi-ui-19/react19-adapter'))};
import ${JSON.stringify(path.join(workbench, 'node_modules/@douyinfe/semi-ui-19/lib/es/_base/base.css'))};
import ${JSON.stringify(path.join(workbench, 'src/renderer/style.css'))};
import {CoverPanel} from ${JSON.stringify(path.join(workbench, 'src/renderer/covers.tsx'))};
import {TemplateWorkflowPanel} from ${JSON.stringify(path.join(workbench, 'src/renderer/template-workflow-panel.tsx'))};
const content={id:'content',title:'隔离任务 · 封面进度',body:'保存的正文',editToken:'token'};
const template={id:'template',title:'隔离任务 · 模板进度',editToken:'template-token',currentVersion:1,builtin:false,versions:[{version:1,packageHash:'hash'}]};
const assets={templates:[{...template,name:template.title,version:1,samples:[]}],photos:[]};
const library={templates:[template],photos:[],contentDetails:[],collections:[],settings:{defaults:{coverCount:1}}};
const initial={attemptId:'attempt',host:'codex',status:'created',reason:'initial',failure:null,progress:{phase:'reading',state:'waiting-user',message:'请到 Codex 确认补充要求',updatedAt:'2026-10-22T08:00:00.000Z',revision:1,sessionId:'11111111-1111-4111-8111-111111111111'}};
let attempt={...initial}, callbacks=new Set();
const cover=()=>({content,jobs:[{id:'request',requestHash:'hash',inputHash:'hash',activeAttemptId:['created','claimed'].includes(attempt.status)?'attempt':null,attempts:[attempt],summary:{count:1,ratio:'3:4',template:{id:'template',version:1},pixels:{width:900,height:1200},styleSampleCount:1,hasOwnPhoto:false,sizePolicy:'ratio-minimum',outputFormat:'png'}}],candidates:attempt.status==='committed'?[{id:'candidate',assetHash:'image',originalName:'合成候选',requestId:'request',attemptId:'attempt',url:''}]:[],selectedCandidateId:null});
const templateView=()=>({...template,templateId:'template',jobs:[{id:'request',activeAttemptId:['created','claimed'].includes(attempt.status)?'attempt':null,acceptance:null,attempts:[{...attempt,reference:{templateId:'template',requestId:'request',attemptId:'attempt',requestHash:'hash',sourceVersion:1,sourcePackageHash:'hash'},samples:[],result:null,unavailable:false}]}]});
const snapshot=()=>({editToken:'token',jobs:cover().jobs.map(j=>({id:j.id,activeAttemptId:j.activeAttemptId,attempts:j.attempts.map(a=>({attemptId:a.attemptId,status:a.status,progress:a.progress,progressUnavailable:false}))}))});
const ok=value=>({ok:true,value}); window.calls=[]; window.fullReads=0;
window.transition=(state,phase='reading',status='created',notify=true)=>{attempt={...attempt,status,progress:{...attempt.progress,state,phase,message:state==='running'?'助手已收到你的回复':'请在助手确认',revision:attempt.progress.revision+1}};if(notify)for(const callback of callbacks)callback('progress');};
window.reset=()=>{attempt={...initial,progress:{...initial.progress}}};
window.contentHub={onWorkspaceChanged:callback=>{callbacks.add(callback);return()=>callbacks.delete(callback)},readCoverProgress:async()=>ok(snapshot()),readTemplateProgress:async()=>ok(snapshot()),readCover:async()=>{window.fullReads++;return ok(cover())},readTemplateWorkflow:async()=>{window.fullReads++;return ok(templateView())},readTemplateAssistantSetup:async()=>ok({host:'workbuddy',ready:false,skill:null}),continueBoundCover:async()=>{window.calls.push('bound-cover');return ok({launchRequested:true})},continueBoundTemplate:async()=>{window.calls.push('bound-template');return ok({view:templateView(),launchRequested:true})},continueCover:async()=>{throw Error('must not switch host')},continueTemplateStudy:async()=>{throw Error('must not switch host')}};
function Probe(){const [mode,setMode]=useState('cover');window.mode=setMode;return <main style={{padding:24,display:'block'}}><h2>自媒体工作台 · 任务状态（隔离验收）</h2>{mode==='cover'?<CoverPanel status={{currentName:'fixture',assistant:'workbuddy'}} content={content} library={library} dirty={true} busy={false} blocked={false} refreshToken={0} readAutomatically={async()=>({assets,cover:cover()})} run={async action=>action()} onContent={()=>{window.diskWrites=(window.diskWrites??0)+1}}/>:<TemplateWorkflowPanel templateId="template" library={library} assets={assets} busy={false} run={async action=>action()} refresh={async()=>{}}/>}</main>};createRoot(document.getElementById('root')).render(<Probe/>);
`);
    await build({configFile:false,root,base:'./',resolve:{alias:{react:path.join(workbench,'node_modules/react'),'react-dom':path.join(workbench,'node_modules/react-dom')}},oxc:{jsx:{runtime:'automatic'}},build:{outDir:path.join(root,'dist'),modulePreload:false,target:'chrome148'}});
    async function probeMain(probeRoot, outputRoot) {
        const {app,BrowserWindow}=await import('electron');
        const {default:assert}=await import('node:assert/strict');
        const {default:fs}=await import('node:fs/promises');
        const {default:path}=await import('node:path');
        app.setPath('userData',path.join(probeRoot,'machine')); await app.whenReady();
        const window=new BrowserWindow({show:false,width:1280,height:900,webPreferences:{contextIsolation:true,nodeIntegration:false}});
        const run=source=>window.webContents.executeJavaScript(source);
        const wait=condition=>run(`new Promise((resolve,reject)=>{const end=Date.now()+6000;const check=()=>{if(${condition})return resolve(true);if(Date.now()>end)return reject(Error('Timeout '+${JSON.stringify(condition)}));setTimeout(check,20)};check()})`);
        const clickText=text=>run(`(()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent===${JSON.stringify(text)});if(!button||button.disabled)throw Error('Disabled/missing '+${JSON.stringify(text)});button.click()})()`);
        try {
            await window.loadFile(path.join(probeRoot,'dist/index.html'));
            await wait(`document.querySelector('#cover-jobs')?.textContent.includes('待你确认')`);
            const viewport=await run('[innerWidth,innerHeight]');
            const writes=await run('window.diskWrites'), reads=await run('window.fullReads');
            await clickText('去 Codex 确认');
            assert.equal(await run('window.calls.at(-1)'), 'bound-cover');
            assert.equal(await run('window.diskWrites'), writes, 'continue with a dirty editor cannot update content');
            // Cover dirty body is deliberately present. Progress must refresh without updating the editor.
            await fs.writeFile(path.join(outputRoot,'cover-waiting-1280.png'),(await window.webContents.capturePage()).toPNG());
            await run(`window.transition('running','generating','claimed')`);
            await wait(`document.querySelector('#cover-jobs')?.textContent.includes('助手报告：生成图片')`);
            assert.equal(await run('window.diskWrites'),writes);
            assert.equal(await run('window.fullReads'),reads,'phase reports do not rehydrate image/template assets');
            await run(`window.transition('waiting-permission','validating','claimed',false)`);
            await wait(`document.querySelector('#cover-jobs')?.textContent.includes('待你允许')`);
            await run(`window.transition('running','validating','committed')`);
            await wait(`!document.querySelector('#cover-jobs') && document.querySelector('#cover-candidates')?.textContent.includes('候选')`);
            assert.equal(await run('window.diskWrites'),writes,'terminal refresh cannot overwrite dirty editor body');
            await run(`window.reset();window.mode('template')`);
            await wait(`document.querySelector('.template-study-progress')?.textContent.includes('待你确认')`);
            await run(`(()=>{const el=document.querySelector('.template-study-notes textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,'尚未提交的补充要求');el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
            await wait(`document.querySelector('.template-study-notes textarea').value==='尚未提交的补充要求'`);
            await clickText('去 Codex 确认');
            assert.equal(await run('window.calls.at(-1)'),'bound-template','unavailable global WorkBuddy must not block original Codex');
            assert.equal(await run(`document.querySelector('.template-study-progress').textContent.includes('待你确认')`),true,'opening assistant does not grant permission');
            const templateReads=await run('window.fullReads');
            await run(`window.transition('running','analyzing','claimed')`);
            await wait(`document.querySelector('.template-study-progress')?.textContent.includes('助手报告：分析模板')`);
            assert.equal(await run('window.fullReads'),templateReads);
            assert.equal(await run(`document.querySelector('.template-study-notes textarea').value`),'尚未提交的补充要求');
            await run(`window.transition('waiting-user','restoring','claimed')`);
            await wait(`document.querySelector('.template-study-progress')?.textContent.includes('待你确认')`);
            await fs.writeFile(path.join(outputRoot,'template-waiting-1280.png'),(await window.webContents.capturePage()).toPNG());
            window.setSize(820,900);
            await fs.writeFile(path.join(outputRoot,'template-waiting-820.png'),(await window.webContents.capturePage()).toPNG());
            assert.equal(await run('document.documentElement.scrollWidth<=innerWidth'),true);
            await run(`window.transition('waiting-user','validating','committed')`);
            await wait(`document.querySelector('.template-study-progress')?.textContent.includes('结果已回传，待你确认')`);
            assert.equal(await run(`document.querySelector('.template-study-progress').textContent.includes('请到助手中回复或确认')`),false,'terminal state wins over stale waiting progress');
            const result={ok:true,scope:'isolated Electron React/Semi fixture',viewport,narrowViewport:await run('[innerWidth,innerHeight]'),devicePixelRatio:await run('devicePixelRatio'),checks:['waiting → running → committed','watch progress event','poll fallback','phase reads avoid hydration','dirty body/notes preserved','original host after global host unavailable','continue does not grant permission','terminal ignores stale wait','narrow no horizontal overflow']};
            await fs.writeFile(path.join(outputRoot,'ui-probe.json'),JSON.stringify(result,null,2)+'\n'); console.log(JSON.stringify(result));
        } catch (error) {console.error(error);app.exit(1);throw error;} finally {window.destroy();app.quit();}
    }
    await fs.writeFile(path.join(root,'main.mjs'),`(${probeMain.toString()})(${JSON.stringify(root)},${JSON.stringify(output)}).catch(error=>{console.error(error);process.exitCode=1;});`);
    const code=await new Promise((resolve,reject)=>{const child=spawn(electron,[path.join(root,'main.mjs')],{stdio:'inherit',env:{...process.env,ELECTRON_DISABLE_SECURITY_WARNINGS:'true'}});child.once('error',reject);child.once('exit',resolve)});
    if(code!==0)throw Error(`Electron progress probe failed: ${code}`);
} finally {await fs.rm(root,{recursive:true,force:true});}
