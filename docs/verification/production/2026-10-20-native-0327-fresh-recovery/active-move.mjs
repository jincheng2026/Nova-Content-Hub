import {app,ipcMain} from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const [root,out]=process.argv.slice(2),base='/Applications/自媒体工作台.app/Contents/Resources/app';
assert.ok(root.includes('nova-native-0327-fresh-'));assert.equal(app.isPackaged,false);
const receipt={scope:'Additional active-directory-move observation, installed modules via hidden development Electron; no lock deletion, worker restart, reset or product edit during observations.',root,startedAt:new Date().toISOString(),appIsPackaged:app.isPackaged,calls:[],events:[],samples:[],errors:[]};
const active=new Map();let serial=0,win,target,moved;
const save=()=>fs.writeFile(path.join(out,'active-move.json'),JSON.stringify(receipt,null,2)+'\n');
const track=async(label,fn)=>{const id=++serial;active.set(id,{label,startedAt:new Date().toISOString()});try{return await fn();}finally{active.delete(id);}};
const handle=ipcMain.handle;
const allowed=/^nova:(?:status|listContents|listCoverAssets|read[A-Z][A-Za-z]*|inspectLibraryHealth)$/;
ipcMain.handle=function(channel,listener){return handle.call(this,channel,(...args)=>{receipt.calls.push(channel);if(!allowed.test(channel))throw Error('Forbidden '+channel);return track('ipc:'+channel,()=>listener(...args));});};
const fingerprint=async dir=>{const files=[];async function visit(d,p=''){for(const name of(await fs.readdir(d)).sort()){if(name==='库锁')continue;const file=path.join(d,name),relative=path.join(p,name),s=await fs.lstat(file);assert.ok(!s.isSymbolicLink());if(s.isDirectory())await visit(file,relative);else files.push([relative,s.size,createHash('sha256').update(await fs.readFile(file)).digest('hex')]);}}await visit(dir);return{files:files.length,sha256:createHash('sha256').update(JSON.stringify(files)).digest('hex')};};
const lockState=async()=>{const directory=path.join(target,'系统（别动）','库锁');try{const names=await fs.readdir(directory);const owners=[];for(const name of names){try{const value=JSON.parse(await fs.readFile(path.join(directory,name),'utf8'));let alive=true;try{process.kill(value.pid,0);}catch(e){alive=e.code!=='ESRCH';}owners.push({...value,alive});}catch(e){owners.push({file:name,error:String(e)});}}return{directory,names,owners};}catch(e){return{directory,error:e.code};}};
const timeout=setTimeout(()=>{receipt.errors.push('180s bounded timeout');void save().finally(()=>app.exit(1));},180000);
const {startDesktop}=await import(path.join(base,'workbench/dist/main/desktop.mjs'));
startDesktop({show:false,userData:path.join(root,'machine'),marketRoot:'/Applications/自媒体工作台.app/Contents/Resources/plugin-marketplace',dialogs:{},async ready({window,controller,worker,release}){
 win=window;receipt.pid=process.pid;receipt.version=release.version;assert.equal(release.version,'0.3.27');
 for(const [label,client]of [['main',worker],['resource',controller.covers.reader]]){const original=client.call.bind(client);client.call=(op,input)=>track('worker:'+label+':'+op,()=>original(op,input));}
 const raw=(method)=>win.webContents.executeJavaScript(`window.contentHub[${JSON.stringify(method)}]()`);
 const call=async method=>{const result=await raw(method);assert.equal(result.ok,true,JSON.stringify(result));return result.value;};
 target=controller.binding.current.root;moved=target+'-active-move';receipt.target=target;receipt.binding=structuredClone(controller.binding.current);
 receipt.before=await fingerprint(target);receipt.initialHealth=await call('inspectLibraryHealth');assert.equal(receipt.initialHealth.state,'healthy');
 const bindingFile=path.join(root,'machine','machine-binding.json'),bindingBefore=await fs.readFile(bindingFile);
 const inProgress=call('inspectLibraryHealth');let seen=null;
 for(let i=0;i<1000;i++){seen=await lockState();if(seen.owners?.length===1)break;await new Promise(r=>setTimeout(r,1));}
 assert.equal(seen.owners?.length,1,'Failed to observe held native health lock');
 receipt.lockBeforeMove=seen;receipt.events.push({action:'move',at:new Date().toISOString(),active:[...active.values()]});await fs.rename(target,moved);
 try{receipt.inProgressHealth=await inProgress;}finally{receipt.events.push({action:'return',at:new Date().toISOString(),active:[...active.values()]});await fs.rename(moved,target);}
 const started=Date.now();
 do{
   const before=[...active.values()];const health=await call('inspectLibraryHealth');
   receipt.samples.push({at:new Date().toISOString(),elapsedMs:Date.now()-started,activeBefore:before,activeAfter:[...active.values()],health,lock:await lockState()});
   if(health.state==='healthy')break;
   await new Promise(r=>setTimeout(r,250));
 }while(Date.now()-started<5000);
 receipt.after=await fingerprint(target);assert.deepEqual(receipt.after,receipt.before,'Business files preserved');assert.deepEqual(await fs.readFile(bindingFile),bindingBefore,'Binding bytes preserved');
 receipt.finalRead=await raw('readWorkspaceLibrary');receipt.finalLock=await lockState();receipt.activeAfterRead=[...active.values()];
 receipt.recoveredWithinBound=receipt.samples.at(-1).health.state==='healthy'&&receipt.finalRead.ok;
 receipt.conclusion=receipt.recoveredWithinBound?'Recovered within the 5s observation bound':'Unresolved active-move lock: no reset/deletion/restart performed during observation';
 receipt.finishedAt=new Date().toISOString();await save();clearTimeout(timeout);app.exit(receipt.recoveredWithinBound?0:2);
}}).catch(async error=>{receipt.errors.push({message:String(error),stack:error.stack});await save();clearTimeout(timeout);app.exit(1);});
