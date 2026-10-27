// Real Electron renderer/preload/IPC/controller/worker; shell opening and AI host launching are observed callbacks.
import {app, shell} from 'electron';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {startDesktop} from './desktop.mjs';
const root=process.env.NOVA_PRODUCTION_PROBE_ROOT,evidence=process.env.NOVA_PRODUCTION_PROBE_EVIDENCE;
if(!root||!evidence||!process.env.NOVA_SOURCE_LIBRARY_MODULE)throw Error('Use production-archive-ui-probe.mjs');
const {openLibrary}=await import(process.env.NOVA_SOURCE_LIBRARY_MODULE),fixture=JSON.parse(await fs.readFile(path.join(root,'fixture.json'),'utf8')),checks=[],launches=[],opened=[];
const lib=openLibrary(fixture.library),record=(name,detail=true)=>{checks.push({name,detail});console.log('PASS '+name);};
shell.openExternal=async()=>{};
startDesktop({show:false,userData:path.join(root,'machine'),async ready({window,controller,release}){
 const run=script=>window.webContents.executeJavaScript(script);
 const wait=condition=>run(`new Promise((resolve,reject)=>{const end=Date.now()+10000;const next=()=>{if(${condition})return resolve(true);if(Date.now()>end)return reject(Error('Timeout: '+${JSON.stringify(condition)}+' / '+document.body.innerText.slice(-1600)));setTimeout(next,30)};next()})`);
 const settled=async(action)=>{const end=Date.now()+10000;for(;;){try{return await action();}catch(error){if(error.code!=='BUSY'||Date.now()>end)throw error;await new Promise(resolve=>setTimeout(resolve,30));}}};
 const frame=()=>run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
 const click=async selector=>{await wait(`document.querySelector(${JSON.stringify(selector)})&&!document.querySelector(${JSON.stringify(selector)}).disabled`);await run(`document.querySelector(${JSON.stringify(selector)}).click()`);await frame();};
 const text=async(label,scope='document')=>{const exp=`[...${scope}.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)}&&!b.disabled)`;await wait(exp);await run(`${exp}.click()`);await frame();};
 const bridge=async(method,args)=>{const result=await run(`window.contentHub[${JSON.stringify(method)}](${args===undefined?'':JSON.stringify(args)})`);assert.equal(result.ok,true,JSON.stringify(result));return result.value;};
 const input=(selector,value)=>run(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}))})()`);
 const screenshot=async name=>{await run('document.fonts.ready');await frame();await fs.writeFile(path.join(evidence,name+'.png'),(await window.webContents.capturePage()).toPNG());};
 const reload=async()=>{await run('window.dispatchEvent(new Event("nova-workspace-refresh"))');await frame();};
 const mutate=(op,input)=>settled(()=>controller.exclusive(async()=>lib.mutateProduction(op,input,{mutationId:randomUUID()})));
 const scope=title=>`[...document.querySelectorAll('.production-list>.semi-card')].find(card=>card.textContent.includes(${JSON.stringify(title)}))`;
 try{
  window.webContents.setBackgroundThrottling(false);window.show();window.focus();window.webContents.focus();window.setContentSize(1440,1000);
  await wait('document.querySelector(\'main[data-loaded="true"][data-busy="false"]\')');
  controller.production.callbacks.launch=async(_binding,reference)=>{launches.push(reference);};
  let failOpen=false;
  controller.production.callbacks.open=async(_binding,target)=>{opened.push(target);if(failOpen)throw Object.assign(Error('合成归档目录打开失败，提交结果已保留'),{code:'NOT_READY'});return '合成打开归档警告：派生文件可重建';};
  const originalRead=controller.production.read.bind(controller.production);controller.production.read=async()=>({...await originalRead(),archiveWarnings:['合成归档警告：某份派生文件待重建']});
  const originalContent=await bridge('readContent',{id:fixture.contentId});
  const title='有收据的助手产物',started=await bridge('startProductionTask',{kind:'research',title,prompt:'只用本机合成资料验证归档入口，禁止任何服务调用。',contentId:fixture.contentId,mode:'simple',comments:false}),task=started.snapshot.tasks.at(-1),identity={taskId:task.id,attemptId:task.activeAttemptId,claimToken:randomUUID(),workerId:'archive-ui'};
  await bridge('startProductionTask',{kind:'research',title:'尚未回传的任务',prompt:'不运行，验证未回传提示。',mode:'simple',comments:false});
  await click('#nav-tasks');await wait(`${scope('尚未回传的任务')}?.textContent.includes('等待助手接单')`);assert.equal(await run(`[...${scope('尚未回传的任务')}.querySelectorAll('button')].some(b=>b.textContent.trim()==='打开产物目录')`),false);record('unsubmitted task offers no archive open action');
  await mutate('claimTask',identity);await mutate('submitTask',{...identity,result:{summary:'本地合成产物，待人工验收',artifacts:[{id:randomUUID(),kind:'research',title:'调研说明',text:'保留完整人工可读结果。',assetHash:null,data:null},{id:randomUUID(),kind:'knowledge',title:'知识候选',text:'候选需用户决定，不自动采纳。',assetHash:null,data:null}]}});
  const accountId=started.snapshot.accounts[0].id;
  for(const source of [{kind:'analysis',title:'账号拆解归档',accountId},{kind:'writing',title:'内容项目归档',contentId:fixture.contentId},{kind:'review',title:'创作知识归档'}]){const result=await bridge('startProductionTask',{...source,prompt:'合成分类资料，不调用服务。',mode:'simple',comments:false}),row=result.snapshot.tasks.at(-1),who={taskId:row.id,attemptId:row.activeAttemptId,claimToken:randomUUID(),workerId:'archive-category'};await mutate('claimTask',who);await mutate('submitTask',{...who,result:{summary:'合成分类产物',artifacts:[{id:randomUUID(),kind:'research',title:'分类结果',text:'只测试分类展示。',assetHash:null,data:null}]}});}
  await click('#nav-tasks');await reload();await wait(`${scope(title)}?.textContent.includes('结果已提交 · 待验收')`);
  assert.equal(await run(`!!${scope(title)}?.querySelector('[data-task-archive]')`),true,'submitted receipt must expose archive directory action');
  assert.match(await run(`${scope(title)}.textContent`),/当前内容库.*知识库.*助手产物/);await wait('document.body.textContent.includes("合成归档警告：某份派生文件待重建")');record('submitted receipt shows library archive location and transient warning');
  const launchCount=launches.length,before=await bridge('readProduction');
  await text('打开产物目录',scope(title));await wait('document.querySelector(".production-workspace>.production-notice")?.textContent.includes("合成打开归档警告")');assert.equal(opened.at(-1).kind,'task-archive');assert.equal(opened.at(-1).id,task.id);assert.equal(launches.length,launchCount);assert.equal((await bridge('readProduction')).tasks.find(t=>t.id===task.id).attempts.at(-1).status,'submitted');record('archive button uses real IPC and correct task without AI launch or acceptance');await screenshot('task-submitted-archive-1440');
  failOpen=true;await text('打开产物目录',scope(title));await wait('document.querySelector(".production-workspace>.production-notice")?.textContent.includes("合成归档目录打开失败")');assert.equal(launches.length,launchCount);assert.equal((await bridge('readProduction')).tasks.find(t=>t.id===task.id).attempts.at(-1).receipt.sha256,before.tasks.find(t=>t.id===task.id).attempts.at(-1).receipt.sha256);record('open failure retains submitted receipt and reports visible error');failOpen=false;
  await text('已核对结果，确认验收',scope(title));await wait(`${scope(title)}?.textContent.includes('已人工验收')`);assert.equal(launches.length,launchCount);
  await click('#nav-prompts');await click('#prompt-view-knowledge');await wait('document.querySelector("[aria-label=助手产物归档]")');const archive='document.querySelector("[aria-label=助手产物归档]")';await wait(`${archive}.querySelectorAll('[data-task-archive]').length===4`);
  assert.equal(await run(`${archive}.querySelectorAll('[data-task-archive]').length`),4);assert.match(await run(`${archive}.textContent`),/有收据的助手产物/);assert.match(await run(`${archive}.textContent`),/已人工验收/);assert.equal(await run(`${archive}.textContent.includes('尚未回传的任务')`),false);for(const category of ['调研报告','账号拆解','创作知识','内容项目'])assert.equal(await run(`${archive}.textContent.includes(${JSON.stringify(category+'（1）')})`),true);assert.equal((await bridge('readProduction')).knowledge.at(-1).status,'candidate');record('knowledge archive lists only submitted/accepted receipt facts; knowledge candidate remains unaccepted');
  await input('textarea[aria-label="反馈或知识内容"]','尚未保存的人工知识');await text('打开产物目录',`document.querySelector('[data-task-archive="${task.id}"]')`);await wait('document.querySelector(".production-workspace>.production-notice")?.textContent.includes("合成打开归档警告")');assert.equal(await run('document.querySelector(\'textarea[aria-label="反馈或知识内容"]\').value'),'尚未保存的人工知识');assert.equal(launches.length,launchCount);await screenshot('knowledge-archive-1440');record('knowledge archive open preserves unsaved manual input without AI launch');
  window.setContentSize(960,680);await wait('innerWidth===960');assert.equal(await run('document.documentElement.scrollWidth<=innerWidth'),true);await screenshot('knowledge-archive-960');record('knowledge archive narrow page has no horizontal overflow',[960,680]);
  await text('放弃填写');await text('查看关联内容',`document.querySelector('[data-task-archive="${task.id}"]')`);await wait('document.querySelector(".content-production")');assert.equal((await bridge('readContent',{id:fixture.contentId})).body,originalContent.body);assert.equal(launches.length,launchCount);record('archive linked content uses existing content navigation without changing body or launching AI');
  await fs.rm(path.join(evidence,'archive-ui-failure.json'),{force:true});await fs.rm(path.join(evidence,'archive-ui-failure.png'),{force:true});await fs.writeFile(path.join(evidence,'archive-ui-receipt.json'),JSON.stringify({passed:true,recordedAt:new Date().toISOString(),release,platform:process.platform,arch:process.arch,checks,paidRequests:0,assistantLaunchMocked:true,shellOpenMocked:true,scope:'real renderer/preload/IPC/controller/worker; transient warning injected; disk projection is outside this UI probe',designRules:['Surface-01','Controls-01','Reading-02','Acceptance-01','Acceptance-02','Acceptance-03']},null,2));app.quit();
 }catch(error){console.error(error);await screenshot('archive-ui-failure').catch(()=>{});await fs.writeFile(path.join(evidence,'archive-ui-failure.json'),JSON.stringify({error:String(error),stack:error.stack,checks},null,2));app.exit(1);}
}}).catch(error=>{console.error(error);app.exit(1)});
