import {app,ipcMain} from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const [root,out,mode]=process.argv.slice(2),base=path.join(root,'app');
assert.ok(root.includes('nova-lock-recovery-'));assert.equal(app.isPackaged,false);
const receipt={scope:'Copied frozen 0.3.27 app modules via hidden development Electron. Green changes only file-library/index.mjs; red is frozen. New isolated library, native renderer/IPC/utility worker, no lock deletion/reset/worker restart during observations.',root,mode,base,startedAt:new Date().toISOString(),appIsPackaged:app.isPackaged,calls:[],events:[],samples:[],errors:[]};
const active=new Map();let serial=0,win,target,moved;
const save=()=>fs.writeFile(path.join(out,mode+'-native.json'),JSON.stringify(receipt,null,2)+'\n');
const track=async(label,fn)=>{const id=++serial;active.set(id,{label,startedAt:new Date().toISOString()});try{return await fn();}finally{active.delete(id);}};
const handle=ipcMain.handle;
const allowed=/^nova:(?:status|listContents|listCoverAssets|read[A-Z][A-Za-z]*|inspectLibraryHealth|createLibrary|createContent|mutateWorkspace)$/;
ipcMain.handle=function(channel,listener){return handle.call(this,channel,(...args)=>{receipt.calls.push(channel);if(!allowed.test(channel))throw Error('Forbidden '+channel);return track('ipc:'+channel,()=>listener(...args));});};
const fingerprint=async dir=>{const files=[];async function visit(d,p=''){for(const name of(await fs.readdir(d)).sort()){if(name==='库锁')continue;const file=path.join(d,name),relative=path.join(p,name),s=await fs.lstat(file);assert.ok(!s.isSymbolicLink());if(s.isDirectory())await visit(file,relative);else files.push([relative,s.size,createHash('sha256').update(await fs.readFile(file)).digest('hex')]);}}await visit(dir);return{files:files.length,sha256:createHash('sha256').update(JSON.stringify(files)).digest('hex')};};
const lockState=async()=>{const directory=path.join(target,'系统（别动）','库锁');try{const names=await fs.readdir(directory);const owners=[];for(const name of names){try{const value=JSON.parse(await fs.readFile(path.join(directory,name),'utf8'));let alive=true;try{process.kill(value.pid,0);}catch(e){alive=e.code!=='ESRCH';}owners.push({...value,alive});}catch(e){owners.push({file:name,error:String(e)});}}return{directory,names,owners};}catch(e){return{directory,error:e.code};}};
const timeout=setTimeout(()=>{receipt.errors.push('180s bounded timeout');void save().finally(()=>app.exit(1));},180000);
const {startDesktop}=await import(path.join(base,'workbench/dist/main/desktop.mjs'));
startDesktop({show:false,userData:path.join(root,'machine'),marketRoot:'/Applications/自媒体工作台.app/Contents/Resources/plugin-marketplace',dialogs:{destination:async()=>path.join(root,'synthetic-library')},async ready({window,controller,worker,release}){
 win=window;receipt.pid=process.pid;receipt.version=release.version;assert.equal(release.version,'0.3.27');
 for(const [label,client]of [['main',worker],['resource',controller.covers.reader]]){const original=client.call.bind(client);client.call=(op,input)=>track('worker:'+label+':'+op,()=>original(op,input));}
 const raw=(method,input)=>win.webContents.executeJavaScript(`window.contentHub[${JSON.stringify(method)}](${input===undefined?'':JSON.stringify(input)})`);
 const call=async(method,input)=>{const result=await raw(method,input);assert.equal(result.ok,true,JSON.stringify(result));return result.value;};
 receipt.bootstrap=await call('readBootstrapRecovery');assert.equal(receipt.bootstrap.state,'ready');assert.equal(controller.binding.current,null);
 await call('createLibrary');
 let library=await call('readWorkspaceLibrary');assert.equal(library.templates.length,20);assert.equal(library.prompts.length,52);
 let item=await call('createContent',{title:'Native lock recovery synthetic content',body:'临时原生对照数据。\nUTF-8 🧪 persists unchanged.'});
 const schedule={precision:'date',date:'2026-11-02'};
 let result=await call('mutateWorkspace',{op:'savePublicationPlan',kind:'content',id:item.id,editToken:item.editToken,plan:{channelId:library.settings.channels.find(x=>x.deletedAt===null).id,text:'Synthetic manual record only',schedule,coverChoice:null}});
 item=result.library.contentDetails.find(x=>x.id===item.id);
 result=await call('mutateWorkspace',{op:'recordPublication',kind:'content',id:item.id,editToken:item.editToken,planId:item.plans[0].id,schedule,url:null});
 receipt.saved=result.library.contentDetails.find(x=>x.id===item.id);assert.equal(receipt.saved.publications.length,1);
 const ownerAlive=()=>{try{process.kill(receipt.lockBeforeMove.owners[0].pid,0);return true;}catch{return false;}};
 target=controller.binding.current.root;moved=target+'-active-move';receipt.target=target;receipt.binding=structuredClone(controller.binding.current);
 receipt.before=await fingerprint(target);receipt.initialHealth=await call('inspectLibraryHealth');assert.equal(receipt.initialHealth.state,'healthy');
 const bindingFile=path.join(root,'machine','machine-binding.json'),bindingBefore=await fs.readFile(bindingFile);
 const inProgress=call('inspectLibraryHealth');let seen=null;
 for(let i=0;i<1000;i++){seen=await lockState();if(seen.owners?.length===1)break;await new Promise(r=>setTimeout(r,1));}
 assert.equal(seen.owners?.length,1,'Failed to observe held native health lock');
 receipt.workerBefore={mainPid:worker.child?.pid,resourcePid:controller.covers.reader.child?.pid};receipt.lockBeforeMove=seen;receipt.events.push({action:'move',at:new Date().toISOString(),active:[...active.values()]});await fs.rename(target,moved);
 try{receipt.inProgressHealth=await inProgress;}finally{receipt.events.push({action:'return',at:new Date().toISOString(),active:[...active.values()]});await fs.rename(moved,target);}
 const started=Date.now();
 do{
   const before=[...active.values()];const health=await call('inspectLibraryHealth');
   receipt.samples.push({at:new Date().toISOString(),elapsedMs:Date.now()-started,activeBefore:before,activeAfter:[...active.values()],health,lock:await lockState(),originalOwnerAlive:ownerAlive(),mainWorkerPid:worker.child?.pid,resourceWorkerPid:controller.covers.reader.child?.pid});
   if(health.state==='healthy')break;
   await new Promise(r=>setTimeout(r,250));
 }while(Date.now()-started<5000);
 receipt.after=await fingerprint(target);assert.deepEqual(receipt.after,receipt.before,'Business files preserved');assert.deepEqual(await fs.readFile(bindingFile),bindingBefore,'Binding bytes preserved');
 receipt.finalRead=await raw('readWorkspaceLibrary');receipt.originalOwnerAliveAfterRead=ownerAlive();receipt.workersAfter={mainPid:worker.child?.pid,resourcePid:controller.covers.reader.child?.pid};receipt.finalLock=await lockState();receipt.activeAfterRead=[...active.values()];
 assert.ok(receipt.samples.every(x=>x.originalOwnerAlive),'Original owner remains alive throughout observation');
 assert.ok(receipt.originalOwnerAliveAfterRead);assert.deepEqual(receipt.workersAfter,receipt.workerBefore,'No worker PID changed');
 if(receipt.finalRead.ok){const saved=receipt.finalRead.value.contentDetails.find(x=>x.id===receipt.saved.id);assert.deepEqual(saved,receipt.saved,'Content, plan and manual publication remain equal');}
 receipt.bindingBytesUnchanged=true;receipt.businessBytesUnchanged=true;
 receipt.recoveredWithinBound=receipt.samples.at(-1).health.state==='healthy'&&receipt.finalRead.ok;
 receipt.conclusion=receipt.recoveredWithinBound?'Recovered within the 5s observation bound':'Unresolved active-move lock: no reset/deletion/restart performed during observation';
 receipt.finishedAt=new Date().toISOString();
 if(mode==='green')assert.equal(receipt.recoveredWithinBound,true,'Patched source must recover under original living owner');
 if(mode==='red')assert.equal(receipt.recoveredWithinBound,false,'Frozen red must reproduce original failure');
 await save();clearTimeout(timeout);app.exit(receipt.recoveredWithinBound?0:2);
}}).catch(async error=>{receipt.errors.push({message:String(error),stack:error.stack});await save();clearTimeout(timeout);app.exit(1);});
