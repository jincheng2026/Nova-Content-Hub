import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createVault} from '../../plugin-src/src/lib/vault/index.mjs';
import {DesktopController} from '../src/main/controller.mts';
import {BindingStore} from '../src/main/bindings.mts';
import {execute} from '../src/main/worker.mts';
import {validateInput} from '../src/shared/validation.ts';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {EventEmitter} from 'node:events';
import {WorkerClient} from '../src/main/worker-client.mts';
import {CHANNELS,assertCaller,PAGE} from '../src/main/boundary.mts';
async function fixture(t){
 const parent=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'nova-vault-trash-ipc-')));t.after(()=>fs.rm(parent,{recursive:true,force:true}));const root=path.join(parent,'知识库');await fs.mkdir(root);const binding=createVault(root),store=new BindingStore(path.join(parent,'binding.json'));
 const make=()=>new DesktopController({store,worker:{call:(op,args)=>execute(op,args,'disabled')},documents:parent,authMode:'disabled',dialogs:{destination:async()=>null,library:async()=>null}});
 const c=make();await c.initialize();await c.persist({...c.binding,current:binding});return{parent,root,c,make};
}
test('ordinary trash and restore travel through exact desktop APIs and durable mutation recovery',async t=>{
 const f=await fixture(t),c=f.c;assert.equal(typeof c.listVaultDocumentTrash,'function');assert.equal(typeof c.restoreVaultDocument,'function');
 const source=await c.createVaultDocument({section:'materials',title:'原位资料',text:'# 原位资料\n完整正文'});await c.trashVaultDocument({id:source.document.id,expectedHash:source.document.hash});
 const rows=await c.listVaultDocumentTrash();assert.equal(rows.length,1);assert.equal(rows[0].restorable,true);
 const worker=c.worker;c.worker={call:async(op,args)=>{const result=await worker.call(op,args);if(op==='vaultMutate'&&args.pending.method==='restoreVaultDocument')throw Object.assign(Error('lost response'),{code:'WORKER_EXIT'});return result;}};
 await assert.rejects(c.restoreVaultDocument({trashId:rows[0].trashId,expectedHash:rows[0].hash}),{code:'WORKER_EXIT'});assert.equal(c.binding.vaultPending.method,'restoreVaultDocument');
 await fs.writeFile(path.join(f.root,source.document.relativePath),'恢复后本人又改了正文');
 const reopened=f.make();await reopened.initialize();const recovery=await reopened.recoverVaultMutation({action:'retry'});assert.equal(recovery.outcome,'committed');assert.equal(recovery.current.text,'恢复后本人又改了正文');assert.equal(reopened.binding.vaultPending,null);
 assert.equal((await reopened.listVaultDocumentTrash())[0].restorable,false);assert.equal((await reopened.readVaultDocument({id:source.document.id})).text,'恢复后本人又改了正文');
});
test('trash desktop requests reject renderer paths, roots, mutation IDs and extra fields',()=>{
 const input={trashId:randomUUID(),expectedHash:'a'.repeat(64)};
 assert.doesNotThrow(()=>validateInput('listVaultDocumentTrash',undefined));assert.doesNotThrow(()=>validateInput('restoreVaultDocument',input));
 assert.doesNotThrow(()=>validateInput('restoreVaultDocument',{...input,trashId:'trash-explicit-stable-id'}));
 for(const extra of [{root:'/tmp'},{path:'elsewhere'},{mutationId:randomUUID()}])assert.throws(()=>validateInput('restoreVaultDocument',{...input,...extra}),{code:'INVALID_INPUT'});
 assert.throws(()=>validateInput('listVaultDocumentTrash',{root:'/tmp'}),{code:'INVALID_INPUT'});
});
test('trash reads queue behind a finite desktop operation instead of failing during background refresh',async t=>{
 const f=await fixture(t);let release;const held=f.c.exclusive(()=>new Promise(resolve=>{release=resolve;}));
 const listing=f.c.listVaultDocumentTrash().then(value=>({value}),error=>({error}));release();await held;
 const result=await listing;assert.equal(result.error,undefined);assert.deepEqual(result.value,[]);
});
test('restore cannot bypass desktop authorization, pending intent, or worker binding identity',async t=>{
 const f=await fixture(t),source=await f.c.createVaultDocument({section:'patterns',title:'权限资料',text:'原始规律'});await f.c.trashVaultDocument({id:source.document.id,expectedHash:source.document.hash});
 const [row]=await f.c.listVaultDocumentTrash(),input={trashId:row.trashId,expectedHash:row.hash};f.c.authMode='required';await assert.rejects(f.c.restoreVaultDocument(input),{code:'AUTH_NOT_CONFIGURED'});assert.equal(f.c.binding.vaultPending,null);f.c.authMode='disabled';
 const binding=f.c.current(),pending={method:'restoreVaultDocument',input,mutationId:randomUUID(),binding:{libraryId:binding.libraryId,rootIdentity:binding.rootIdentity}};
 await assert.rejects(execute('vaultMutate',{binding,pending},'required'),{code:'AUTH_NOT_CONFIGURED'});
 await assert.rejects(execute('vaultMutate',{binding,pending:{...pending,binding:{...pending.binding,libraryId:randomUUID()}}},'disabled'),{code:'CONFLICT'});
 await assert.rejects(execute('vaultDocumentTrash',{binding,root:f.root},'disabled'),{code:'INVALID_INPUT'});
 await f.c.persist({...f.c.binding,vaultPending:pending});await assert.rejects(f.c.restoreVaultDocument(input),{code:'PENDING_MUTATION'});await f.c.recoverVaultMutation({action:'discard'});assert.equal((await f.c.listVaultDocumentTrash())[0].restorable,true);
});
test('a queued trash read remains pinned to the requested library identity',async t=>{
 const f=await fixture(t),other=path.join(f.parent,'另一个知识库');await fs.mkdir(other);const next=createVault(other);let release;const held=f.c.exclusive(()=>new Promise(resolve=>{release=resolve;})),listing=assert.rejects(f.c.listVaultDocumentTrash(),{code:'CONFLICT'});
 await f.c.persist({...f.c.binding,current:next});release();await held;await listing;
});
test('the finite trash read retries the same worker request on Vault contention without replaying writes',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const child=new EventEmitter(),requests=[];child.postMessage=request=>{requests.push(structuredClone(request));child.emit('message',{id:request.id,ok:false,error:{code:'VAULT_BUSY'}});};child.kill=()=>child.emit('exit');const client=new WorkerClient(()=>child);t.after(()=>client.stop());const args={binding:{root:'/native-selected',libraryId:randomUUID(),rootIdentity:{dev:'1',ino:'2'}}};
 const rejected=assert.rejects(client.call('vaultDocumentTrash',args),{code:'VAULT_BUSY'});for(const delay of [100,250,500,1000,1500,2000])t.mock.timers.tick(delay);await rejected;assert.equal(requests.length,7);for(const request of requests)assert.deepEqual(request,requests[0]);
 const before=requests.length;await assert.rejects(client.call('vaultMutate',args),{code:'VAULT_BUSY'});t.mock.timers.tick(60000);assert.equal(requests.length,before+1);
});

const require=createRequire(new URL('../package.json',import.meta.url));
let workspaceCode;
async function uiFixture(){
 if(!workspaceCode){const {rolldown}=await import(require.resolve('rolldown')),bundle=await rolldown({input:new URL('../src/renderer/vault-workspace.tsx',import.meta.url).pathname,external:id=>!id.endsWith('/vault-workspace.tsx')});const output=await bundle.generate({format:'cjs'});await bundle.close();workspaceCode=output.output.find(i=>i.type==='chunk').code;}
 const states=[],refs=[],effects=[],listeners=new Map(),calls=[];let cursor=0,pending=[],changed=false;
 const f={snapshot:{root:'/native-bound-vault',name:'资料库',vaultId:'vault-a',readingScope:'a'.repeat(64),documents:[],issues:[],positioning:{status:'missing',documentIds:[]},revision:'original'},entries:[{trashId:'trusted-trash-id',documentId:'doc-'+'a'.repeat(32),title:'资料',relativePath:'02_内容素材/资料.md',section:'materials',hash:'b'.repeat(64),deletedAt:null,restorable:true,issue:null}],list:null,calls};
 const module={exports:{}};
 vm.runInNewContext(workspaceCode,{module,exports:module.exports,window:{addEventListener(name,handler){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(handler);},removeEventListener(name,handler){listeners.get(name)?.delete(handler);},contentHub:{onWorkspaceChanged:()=>()=>{}}},require:id=>{
  if(id==='react')return {...require('react'),useState(initial){const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return [states[i],value=>{const next=typeof value==='function'?value(states[i]):value;if(!Object.is(states[i],next)){states[i]=next;changed=true;}}];},useRef(initial){const i=cursor++;return refs[i]??={current:initial};},useMemo(fn){cursor++;return fn();},useEffect(setup,deps){const i=cursor++;if(!effects[i]||deps?.some((value,j)=>value!==effects[i].deps[j]))pending.push(()=>{effects[i]?.cleanup?.();effects[i]={deps,cleanup:setup()};});}};
  if(id==='react/jsx-runtime')return require(id);
  if(id.endsWith('client.ts'))return{invoke:async(method,input)=>{calls.push({method,input});if(method==='readVault')return structuredClone(f.snapshot);if(method==='readProduction')return{tasks:[]};if(method==='listVaultDocumentTrash')return f.list?f.list():structuredClone(f.entries);if(method==='restoreVaultDocument')return{trashId:input.trashId};if(method==='revealVaultDocument')return{revealed:true};throw Error('Unexpected IPC '+method);}};
  if(id.endsWith('contracts.ts'))return{errorInfo:error=>({message:error.message??String(error)})};
  if(id.endsWith('vault-validation.ts'))return{vaultSections:['profile','materials','patterns']};
  if(id.endsWith('vault-trash-panel.tsx'))return{VaultTrashPanel:function VaultTrashPanel(){}};
  if(id.endsWith('semi-controls.tsx'))return{PopupSelect:function PopupSelect(){}};
  if(id.endsWith('list-primitives.tsx'))return{DataTable:function DataTable(){},ListToolbar:function ListToolbar(){}};
  return function UIControl(){};
 }});
 f.render=()=>{let tree;for(let pass=0;pass<10;pass++){cursor=0;pending=[];changed=false;tree=module.exports.VaultWorkspace({busy:false,openContent(){},showTasks(){},openResources(){},openAccounts(){},openReports(){},statusChanged:async()=>{}});pending.forEach(setup=>setup());if(!changed)return tree;}throw Error('workspace render did not settle');};
 f.ready=async()=>{f.render();await new Promise(resolve=>setImmediate(resolve));return f.render();};f.emit=name=>{for(const listener of listeners.get(name)??[])listener();};return f;
}
const nodes=(node,predicate)=>!node||typeof node!=='object'?[]:[...(predicate(node)?[node]:[]),...[node.props?.children].flat(Infinity).flatMap(child=>nodes(child,predicate))];
const panel=tree=>nodes(tree,node=>node.type?.name==='VaultTrashPanel')[0];
const range=tree=>nodes(tree,node=>node.props?.['aria-label']==='资料范围')[0];
test('sandbox preload and sender boundary expose exactly the narrow trash channels',async()=>{
 const {rolldown}=await import(require.resolve('rolldown')),bundle=await rolldown({input:new URL('../src/preload/index.cts',import.meta.url).pathname,external:['electron']}),output=await bundle.generate({format:'cjs'});await bundle.close();let api;const calls=[];
 vm.runInNewContext(output.output.find(item=>item.type==='chunk').code,{require:id=>{assert.equal(id,'electron');return{contextBridge:{exposeInMainWorld(name,value){assert.equal(name,'contentHub');api=value;}},ipcRenderer:{invoke:async(...args)=>calls.push(args),on(){},removeListener(){}},webUtils:{}};}});
 assert.ok(Object.isFrozen(api));await api.listVaultDocumentTrash();const input={trashId:randomUUID(),expectedHash:'a'.repeat(64)};await api.restoreVaultDocument(input);assert.deepEqual(calls,[['nova:listVaultDocumentTrash'],['nova:restoreVaultDocument',input]]);
 const frame={url:PAGE},sender={mainFrame:frame,isDestroyed:()=>false},event={sender,senderFrame:frame};for(const method of ['listVaultDocumentTrash','restoreVaultDocument']){assert.ok(CHANNELS.includes(method));assert.equal(typeof DesktopController.prototype[method],'function');}
 assert.doesNotThrow(()=>assertCaller(event,sender,[],'listVaultDocumentTrash'));assert.doesNotThrow(()=>assertCaller(event,sender,[input],'restoreVaultDocument'));assert.throws(()=>assertCaller({...event,senderFrame:{url:PAGE}},sender,[input],'restoreVaultDocument'),{code:'FORBIDDEN'});
});
test('actual vault workspace exposes receipt restore, refreshes committed results and follows external source changes',async()=>{
 const f=await uiFixture();let tree=await f.ready();assert.ok(range(tree));range(tree).props.onChange('trash');tree=await f.ready();assert.equal(panel(tree).props.entries[0].trashId,'trusted-trash-id');
 const input={trashId:'trusted-trash-id',expectedHash:'b'.repeat(64)};await panel(tree).props.onRestore(input);f.entries[0]={...f.entries[0],restorable:false,issue:'已恢复'};await panel(tree).props.onRestored();tree=await f.ready();assert.equal(panel(tree).props.entries[0].issue,'已恢复');assert.deepEqual(f.calls.find(call=>call.method==='restoreVaultDocument').input,input);
 f.entries[0]={...f.entries[0],issue:'外部占用原路径'};f.emit('nova-vault-source-changed');tree=await f.ready();assert.equal(panel(tree).props.entries[0].issue,'外部占用原路径');
});
test('actual vault workspace drops late trash reads after the bound library scope changes',async()=>{
 const f=await uiFixture();let tree=await f.ready();const pending=[];f.list=()=>new Promise(resolve=>pending.push(resolve));range(tree).props.onChange('trash');await f.ready();assert.equal(pending.length,1);
 f.snapshot={...f.snapshot,vaultId:'vault-b',readingScope:'c'.repeat(64)};f.emit('nova-workspace-refresh');await f.ready();assert.ok(pending.length>=2);const fresh=panel(f.render());assert.equal(fresh.props.identityKey,'c'.repeat(64));assert.equal(fresh.props.entries.length,0);
 for(const resolve of pending.slice(0,-1))resolve([{...f.entries[0],trashId:'old-vault-trash'}]);await f.ready();assert.equal(panel(f.render()).props.entries.length,0);
 pending.at(-1)([{...f.entries[0],trashId:'new-vault-trash'}]);tree=await f.ready();assert.equal(panel(tree).props.entries[0].trashId,'new-vault-trash');
});
