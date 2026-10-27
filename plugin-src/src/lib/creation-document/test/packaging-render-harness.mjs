// Isolated, hidden Electron test host. Only generated trusted HTML is executed.
import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {app,BrowserWindow,ipcMain} from 'electron';
import {readCreationDocument,saveKitChanges,readHistory,replaceCreationData} from '../index.mjs';
const config=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
app.setPath('userData',config.userData);app.commandLine.appendSwitch('disable-gpu');
let win;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,label){const end=Date.now()+15000;let last;while(Date.now()<end){try{const value=await fn();if(value)return value;}catch(error){last=error;}await pause(30);}throw new Error(label+(last?': '+last.message:''));}
let stash={version:'0',records:[],storage:{local:{},session:{}}};
ipcMain.handle('creation-render-test',async(_event,{action,payload})=>{
 if(action==='stash-read')return stash;
 if(action==='stash-write'){assert.equal(payload.expectedVersion,stash.version);stash={version:String(Number(stash.version)+1),records:payload.records,storage:payload.storage};return {version:stash.version};}
 if(action==='copy')return {copied:true};if(action==='reload')return {};
 assert.equal(action,'request');const {method,url,body}=payload,path=new URL(url,'http://127.0.0.1'),doc=await readCreationDocument(config.root,config.source);
 if(method==='POST'&&path.pathname==='/save')return {ok:true,status:200,data:await saveKitChanges(config.root,config.source,{...body,mutationId:randomUUID()})};
 if(path.pathname.endsWith('/changes'))return {ok:true,status:200,data:await readHistory(config.root,config.source,path.searchParams.get('item')??undefined)};
 if(path.pathname.endsWith('/meta'))return {ok:true,status:200,data:{fingerprint:doc.revision,path:config.source.relativePath,same_file:true}};
 if(path.pathname.endsWith('/doc'))return {ok:true,status:200,data:{fingerprint:doc.revision,path:config.source.relativePath,doc:doc.raw}};
 throw new Error('Unexpected test RPC '+method+' '+url);
});
async function run(){try{
 await app.whenReady();if(app.dock)app.dock.hide();
 win=new BrowserWindow({width:1400,height:1000,show:false,webPreferences:{nodeIntegration:true,contextIsolation:false,sandbox:false,nodeIntegrationInSubFrames:false}});
 function parentDocument(html){const js=`const {ipcRenderer}=require('electron');const frame=document.createElement('iframe');frame.sandbox='allow-scripts';frame.style='width:1280px;height:900px;border:0';frame.onload=()=>{const channel=new MessageChannel();channel.port1.onmessage=async event=>{const message=event.data;if(message.kind)return;try{channel.port1.postMessage({sessionId:message.sessionId,id:message.id,ok:true,value:await ipcRenderer.invoke('creation-render-test',message)});}catch(error){channel.port1.postMessage({sessionId:message.sessionId,id:message.id,ok:false,error:error.message});}};channel.port1.start();frame.contentWindow.postMessage({kind:'nova-creation-connect',sessionId:${JSON.stringify(config.sessionId)}},'*',[channel.port2]);};frame.srcdoc=${JSON.stringify(html).replaceAll('<','\\u003c')};document.body.appendChild(frame);`;return '<!doctype html><html><body><script>'+js+'</script></body></html>';}
 await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(parentDocument(config.html)));
 const frame=await until(()=>win.webContents.mainFrame.framesInSubtree.find(f=>f.url==='about:srcdoc'),'generated iframe');
 const run=code=>frame.executeJavaScript(code,true);
 await until(()=>run('Boolean(window.jcApp&&window.jcKit&&window.jcKit.ready)'),'original kit ready');
 const views=await run(`Array.from(document.querySelectorAll('.seg-switch button'),b=>b.textContent.trim())`);
 assert.ok(views.includes('标题封面简介'),'generated original HTML must render its publication view');
 assert.ok(views.includes('录制'));assert.ok(views.includes('对照'));assert.ok(views.includes('通读'));
 await run(`document.querySelector('.vb-pub').click()`);
 const rendered=await run(`({view:jcApp.state().view,slots:document.querySelectorAll('.pub-slot').length,candidates:document.querySelectorAll('.pub-cand').length,finals:Array.from(document.querySelectorAll('.pub-final'),e=>e.value),references:document.querySelectorAll('.pub-refs').length,visible:!document.querySelector('.publish').hidden})`);
 assert.equal(rendered.view,'publish');assert.equal(rendered.slots,3);assert.equal(rendered.candidates,29);assert.equal(rendered.references,3);assert.equal(rendered.visible,true);assert.deepEqual(rendered.finals,['合成候选0-0','合成候选1-0','合成候选2-0']);
 await run(`{const text=document.querySelector('[data-item="pubcand-0-1"][data-field="text"]');text.value='作者先改发布候选';text.dispatchEvent(new Event('input',{bubbles:true}));text.closest('.pub-cand').querySelector('button.yes').click();}`);
 await until(async()=>{const d=await readCreationDocument(config.root,config.source);return d.items.find(i=>i.id==='pubslot-0').fields.final==='作者先改发布候选'&&d.items.find(i=>i.id==='pubcand-0-1').fields.decision==='选用'&&d;},'candidate use saves final and decision');
 let after=await readCreationDocument(config.root,config.source);assert.equal(after.items.find(i=>i.id==='pubcand-0-1').fields.text,'作者先改发布候选');assert.equal(after.items.find(i=>i.id==='pubcand-0-0').fields.decision,'');assert.equal(after.items.find(i=>i.id==='seg-one').fields.mine,'合成原句只出现一次。');
 const adoption=(await readHistory(config.root,config.source)).changes.filter(r=>r.after==='作者先改发布候选'||r.item==='pubcand-0-1'&&r.field==='decision');assert.equal(adoption.length,3);assert.ok(adoption[0].group);assert.ok(adoption.every(r=>r.group===adoption[0].group));
 await run(`{const final=document.querySelector('[data-item="pubslot-0"][data-field="final"]');final.value='作者最终手改标题';final.dispatchEvent(new Event('input',{bubbles:true}));}`);
 await until(async()=>{const d=await readCreationDocument(config.root,config.source);return d.items.find(i=>i.id==='pubslot-0').fields.final==='作者最终手改标题';},'author final text saves');
 await run(`{const card=document.querySelector('[data-item="pubcand-1-1"]').closest('.pub-cand');Array.from(card.querySelectorAll('button')).find(b=>b.textContent==='不用').click();}`);
 await until(async()=>{const d=await readCreationDocument(config.root,config.source);return d.items.find(i=>i.id==='pubcand-1-1').fields.decision==='不用';},'reject candidate');
 await run(`{const card=document.querySelector('[data-item="pubcand-1-1"]').closest('.pub-cand');Array.from(card.querySelectorAll('button')).find(b=>b.textContent==='撤销决定').click();}`);
 await until(async()=>{const d=await readCreationDocument(config.root,config.source);return d.items.find(i=>i.id==='pubcand-1-1').fields.decision==='';},'reopen candidate decision');
 await run(`jcApp.setView('record')`);assert.equal(await run(`Boolean(document.querySelector('.todo-me'))&&Boolean(document.querySelector('.todo-ed'))&&Boolean(document.querySelector('[data-item="step-one"][data-field="prompt"]'))`),true);
 await run(`jcApp.setView('compare')`);assert.equal(await run(`Boolean(document.querySelector('.walk-btn'))&&Boolean(document.querySelector('.fold-btn'))`),true);
 await run(`jcApp.setView('reading')`);assert.equal(await run(`jcApp.state().view`),'reading');
 const persisted=await readCreationDocument(config.root,config.source);
 await run('(async()=>{await jcKit.flush();return await JC_DESKTOP.flush();})()');await until(()=>stash.records.length===0,'saved stash receipts drained');
 const initialBootstrap={sessionId:config.sessionId,pageId:persisted.pageId,fingerprint:config.fingerprint,path:config.source.relativePath,stash:{version:'0',records:[],storage:{local:{},session:{}}}};
 const nextBootstrap={...initialBootstrap,fingerprint:persisted.revision,stash};
 const scriptJson=value=>JSON.stringify(value).replaceAll('<','\\u003c').replaceAll('\u2028','\\u2028').replaceAll('\u2029','\\u2029');
 let reopenedHtml=Buffer.from(replaceCreationData(Buffer.from(config.html),persisted)).toString();assert.ok(reopenedHtml.includes(scriptJson(initialBootstrap)));reopenedHtml=reopenedHtml.replace(scriptJson(initialBootstrap),scriptJson(nextBootstrap));
 const previousWindow=win;win=new BrowserWindow({width:1100,height:850,show:false,webPreferences:{nodeIntegration:true,contextIsolation:false,sandbox:false,nodeIntegrationInSubFrames:false}});previousWindow.destroy();
 await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(parentDocument(reopenedHtml)));
 const reopened=await until(()=>win.webContents.mainFrame.framesInSubtree.find(f=>f.url==='about:srcdoc'),'reopened iframe');
 await until(()=>reopened.executeJavaScript('Boolean(window.jcApp&&window.jcKit&&window.jcKit.ready)'), 'reopened kit ready');
 const restored=await reopened.executeJavaScript(`jcApp.setView('publish');({finals:Array.from(document.querySelectorAll('.pub-final'),el=>el.value),selected:jcKit.doc().items.find(i=>i.id==='pubcand-0-1').fields.decision,reopened:jcKit.doc().items.find(i=>i.id==='pubcand-1-1').fields.decision,mine:jcKit.doc().items.find(i=>i.id==='seg-one').fields.mine})`);
 assert.deepEqual(restored.finals,['作者最终手改标题','合成候选1-0','合成候选2-0']);assert.equal(restored.selected,'选用');assert.equal(restored.reopened,'');assert.equal(restored.mine,'合成原句只出现一次。');
 const result={ok:true,rendered,views,restored,selectionSaved:true,authorFinalSaved:true,rejectedAndReopened:true,atomicHistory:true,closedAndReopened:true,otherFinalsPreserved:true,recordingAndSuggestionsPreserved:true};
 fs.writeFileSync(config.result,JSON.stringify(result,null,2));
 win.destroy();app.exit(0);
}catch(error){fs.writeFileSync(config.result,JSON.stringify({ok:false,error:error.stack}));if(win&&!win.isDestroyed())win.destroy();app.exit(1);}
}
run();
