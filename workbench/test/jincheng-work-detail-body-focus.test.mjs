import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import * as detail from '../src/renderer/jincheng-work-detail-data.ts';
// Exercise the actual component's hooks and guarded event action. Commit and
// animation-frame gates model the parent tool switch separately from clicking.
const source=await fs.readFile(new URL('../src/renderer/jincheng-work-detail.tsx',import.meta.url),'utf8');
const body=source.slice(source.indexOf('function WorkDetail('),source.indexOf('\n  function fileRow('))+'\nreturn {chooseBody:()=>switchTool("body",true),openSupport,notice};\n}';
function fixture(){
 const slots=[],effects=[],references=[],frames=new Map(),calls=[];
 let cursor=0,pending=[],frameId=0,tool='publication',contentId='T019',mounted=false,failed=false,reduced=false;
 const editor={disabled:false,isConnected:true,closest:()=>null,getClientRects:()=>mounted?[{}]:[],focus:options=>calls.push(['focus',options]),scrollIntoView:options=>calls.push(['scroll',options])};
 const region={querySelector:selector=>mounted&&selector.includes('content-body')?editor:null,contains:target=>mounted&&target===editor};
 const wrong={focus:()=>calls.push(['wrong-editor'])};
 const context=vm.createContext({
  ...detail,
  useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],next=>{slots[i]=typeof next==='function'?next(slots[i]):next;}];},
  useRef(initial){const i=cursor++;if(!(i in slots)){slots[i]={current:initial};if(initial===null)references.push(slots[i]);}return slots[i];},
  useEffect(setup,deps){const i=cursor++,old=effects[i];if(!old||deps.some((value,at)=>!Object.is(value,old.deps[at])))pending.push(()=>{old?.cleanup?.();effects[i]={deps,cleanup:setup()};});},
  requestAnimationFrame:fn=>{frames.set(++frameId,fn);return frameId;},cancelAnimationFrame:id=>frames.delete(id),
  matchMedia:()=>({matches:reduced}),
  document:{getElementById:()=>wrong},window:{addEventListener(){},removeEventListener(){}},
  setTimeout,clearTimeout,errorInfo:error=>({message:error.message}),hasManagedDrafts:()=>false,
  invoke:async()=>({content:null}),
 });
 vm.runInContext(stripTypeScriptTypes(body),context);
 const render=()=>{cursor=0;pending=[];const view=context.WorkDetail({contentId,title:'当前稿',stage:'writing',busy:false,dirty:false,activeTool:tool,chooseTool:next=>calls.push(['choose',next]),makeCover(){},showTasks(){},sourceNotice:null,children:null,flush:async()=>{if(failed)throw Error('save failed');}});references.forEach(ref=>ref.current=region);pending.forEach(setup=>setup());return view;};
 return{render,calls,editor,commit(value){tool=value;mounted=value==='body';return render();},content(value){contentId=value;return render();},reduced(){reduced=true;},fail(){failed=true;},paint(){const batch=[...frames.values()];frames.clear();batch.forEach(fn=>fn());},settle:()=>new Promise(resolve=>setImmediate(resolve)),unmount:()=>effects.forEach(effect=>effect?.cleanup?.())};
}
test('resume waits for the body commit, then focuses only its own visible editor and scrolls it into view',async()=>{
 const f=fixture();f.render().openSupport('publication');await f.settle();
 f.render().chooseBody();await f.settle();f.render();f.paint();
 assert.deepEqual(f.calls,[['choose','body']],'clicking must not focus the old publication view or another editor');
 f.commit('body');f.paint();
 assert.deepEqual(f.calls.map(call=>call[0]),['choose','focus','scroll']);
 assert.equal(f.calls[1][1].preventScroll,true);
 assert.equal(f.calls[2][1].block,'center');
});
test('resume works again on the same body tab and respects reduced motion',async()=>{
 const f=fixture();f.reduced();f.commit('body');
 f.render().chooseBody();await f.settle();f.render();f.paint();f.render();
 f.render().chooseBody();await f.settle();f.render();f.paint();
 assert.equal(f.calls.filter(call=>call[0]==='focus').length,2);
 assert.equal(f.calls.filter(call=>call[0]==='scroll').every(call=>['instant','auto'].includes(call[1].behavior)),true);
});
test('changing content or unmounting cancels a queued focus before the next paint',async()=>{
 for(const retire of [f=>f.content('T020'),f=>f.unmount()]){
  const f=fixture();f.render().chooseBody();await f.settle();f.commit('body');retire(f);f.paint();
  assert.equal(f.calls.some(call=>call[0]==='focus'||call[0]==='scroll'||call[0]==='wrong-editor'),false);
 }
});
test('failed close protection does not switch tools or move focus',async()=>{
 const f=fixture();f.fail();f.render().chooseBody();await f.settle();f.render();f.paint();
 assert.deepEqual(f.calls,[]);
 assert.equal(f.render().notice,'save failed');
});
