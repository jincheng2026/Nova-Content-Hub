import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';

// Run the real loading hooks without Electron or a source library. IPC gates
// let background refreshes arrive while the first directory read is pending.
const source = await fs.readFile(new URL('../src/renderer/jincheng-content-directory.tsx', import.meta.url), 'utf8');
const hooks = source.slice(source.indexOf('export function JinchengContentDirectory'), source.indexOf(' const overview='))
 .replace('export function', 'function') + '\nreturn {loaded,notice,vault,workRows,refresh:()=>setVersion(n=>n+1)};\n}';
const compiled = stripTypeScriptTypes(hooks);
function fixture() {
 const states=[], effects=[], refs=[], listeners=new Map(),calls=[],gates=[],failures=new Set();
 let cursor=0,pending=[];
 const context=vm.createContext({
  useState(initial){const i=cursor++;if(!(i in states))states[i]=initial;return [states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value;}];},
  useRef(initial){const i=cursor++;return refs[i]??={current:initial};},
  useEffect(setup,deps){const i=cursor++,previous=effects[i];if(!previous||deps.some((value,at)=>!Object.is(value,previous.deps[at]))){pending.push(()=>{previous?.cleanup?.();effects[i]={deps,cleanup:setup()};});}},
  window:{addEventListener:(name,fn)=>{if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);},removeEventListener:(name,fn)=>listeners.get(name)?.delete(fn)},
  async invoke(method){calls.push(method);if(method==='readVault')await new Promise(resolve=>gates.push(resolve));if(failures.has(method))throw Error('fixture '+method);return method==='readVault'?{documents:[]}:method==='readProduction'?{creations:[]}:[];},
 });
 vm.runInContext(compiled,context);
 const content={id:'same-content',editToken:'same-token',title:'same-title',body:'body',deletedAt:null};
 const render=(items=[{...content}])=>{cursor=0;pending=[];const value=context.JinchengContentDirectory({mode:'topics',contents:items,openContent(){}});pending.forEach(setup=>setup());return value;};
 const settle=()=>new Promise(resolve=>setImmediate(resolve));
 return {render,calls,content,settle,fail:method=>failures.add(method),recover:()=>failures.clear(),unmount:()=>effects.forEach(effect=>effect?.cleanup?.()),state:()=>states,release:()=>gates.splice(0).forEach(resolve=>resolve()),event:name=>listeners.get(name)?.forEach(fn=>fn())};
}

test('equal content snapshots do not discard or restart an in-flight directory load',async()=>{
 const f=fixture();f.render();f.render();f.render();
 assert.equal(f.calls.filter(value=>value==='readVault').length,1,'background list reads can replace the array without changing its contents');
 f.release();await f.settle();assert.equal(f.render().loaded,true,'the original successful read remains visible');
});

test('source events coalesce during a read and publish its result before the follow-up',async()=>{
 const f=fixture();f.render();f.event('nova-vault-source-changed');f.render();f.event('nova-vault-source-changed');f.render();
 assert.equal(f.calls.filter(value=>value==='readVault').length,1,'at most one read batch is in flight');
 f.release();await f.settle();assert.equal(f.render().loaded,true,'coalesced events cannot hold the directory in loading');
 assert.equal(f.calls.filter(value=>value==='readVault').length,2,'one follow-up verifies changes arriving during the first read');
 f.release();await f.settle();assert.equal(f.render().loaded,true);
});

test('changed edit tokens and explicit retry refresh facts without hiding the previous result',async()=>{
 const f=fixture();f.render();f.release();await f.settle();assert.equal(f.render().loaded,true);
 assert.equal(f.render([{...f.content,editToken:'changed'}]).loaded,true);assert.equal(f.calls.filter(value=>value==='readVault').length,2);
 f.release();await f.settle();const view=f.render([{...f.content,editToken:'changed'}]);view.refresh();f.render([{...f.content,editToken:'changed'}]);
 assert.equal(f.calls.filter(value=>value==='readVault').length,3);f.release();await f.settle();assert.equal(f.render([{...f.content,editToken:'changed'}]).loaded,true);
});


test('failed directory sources finish with a retryable warning rather than an endless loading state',async()=>{
 const f=fixture();for(const method of ['readVault','readProduction','readVaultWorkDirectory'])f.fail(method);
 f.render();f.release();await f.settle();const failed=f.render();assert.equal(failed.loaded,true);assert.match(failed.notice,/刷新重试/);
 f.recover();failed.refresh();f.render();f.release();await f.settle();const recovered=f.render();assert.equal(recovered.loaded,true);assert.equal(recovered.notice,'');assert.ok(recovered.vault);
});

test('unmount removes refresh listeners and ignores the retiring read batch',async()=>{
 const f=fixture();f.render();f.unmount();const before=JSON.stringify(f.state());
 f.event('nova-workspace-refresh');f.event('nova-vault-source-changed');f.release();await f.settle();
 assert.equal(JSON.stringify(f.state()),before);assert.equal(f.calls.filter(value=>value==='readVault').length,1);
});
