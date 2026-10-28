import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createRequire} from 'node:module';

// Execute the real directory component and its hooks. IPC alone is replaced:
// these scenarios must not read or modify an author's source library.
const require=createRequire(new URL('../package.json',import.meta.url));
const React=require('react');
const {rolldown}=await import(require.resolve('rolldown'));
const bundle=await rolldown({input:new URL('../src/renderer/jincheng-content-directory.tsx',import.meta.url).pathname,external:id=>!['jincheng-content-directory.tsx','jincheng-directory.ts','pagination-bar.tsx'].some(name=>id.endsWith('/'+name))});
const generated=await bundle.generate({format:'cjs'});await bundle.close();
const code=generated.output.find(item=>item.type==='chunk').code;
const children=node=>[node?.props?.children].flat(Infinity).filter(Boolean);
const all=(node,predicate)=>!node||typeof node!=='object'?[]:[...(predicate(node)?[node]:[]),...children(node).flatMap(child=>all(child,predicate))];
const pager=(tree,label)=>all(tree,node=>node.type?.name==='PaginationBar'&&node.props.label===label)[0];
const ids=tree=>all(tree,node=>node.props?.['data-content-id']).map(node=>node.props['data-content-id']);
const control=(tree,label)=>all(tree,node=>node.props?.['aria-label']===label)[0];
const change=(f,label,value)=>{control(f.render(),label).props.onChange(value);return f.render();};
const statusTexts=tree=>all(tree,node=>node.props?.className?.split(' ').includes('jincheng-content-status')).map(node=>node.props.children);
const nextTurn=()=>new Promise(resolve=>setImmediate(resolve));

function fixture({counts=[31,31,31],mode='topics',uiState,controlled=false,resume=true,overviewText=''}={}){
 const states=[],effects=[],refs=[],listeners=new Map(),calls=[],patches=[],contents=[],facts=[],documents=[];
 let cursor=0,pending=[];
 for(const [group,count] of counts.entries())for(let n=1;n<=count;n++){
  const number=group*1000+n,id=`T${String(number).padStart(3,'0')}`;
  contents.push({id,title:`${group===1?'暂缓':group===2?'历史':'接下来'} ${n}`,body:n===1?'长文\n'.repeat(100):'简短摘要',editToken:'v1',deletedAt:null});
  documents.push({id:'doc-'+id,section:'topics',title:id,relativePath:`选题/${n%2?'科普':'教程'}/${id}.md`,hash:'hash',format:'markdown',writable:true,contentId:id,tNumber:id,bytes:100});
  facts.push({contentId:id,tNumber:id,title:id,recorded:false,published:false,hasDraft:group===2,topicStatus:{paused:group===1,reason:group===1?'以后再做':null},statusEvidence:[],sourceResolution:'resolved',sourceConflict:null,relativePath:`选题/${id}.md`});
 }
 if(overviewText)documents.push({id:'overview',section:'topics',title:'选题总览',relativePath:'选题/00_选题总览.md',hash:'overview-hash',format:'markdown',writable:true,contentId:null,tNumber:null,bytes:overviewText.length});
 const module={exports:{}};
 const hooks={
  useState(initial){const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return[states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value;}];},
  useRef(initial){const i=cursor++;return refs[i]??={current:initial};},
  useMemo(compute){cursor++;return compute();},
  useEffect(setup,deps){const i=cursor++,previous=effects[i];if(!previous||deps.some((value,at)=>!Object.is(value,previous.deps[at])))pending.push(()=>{previous?.cleanup?.();effects[i]={deps,cleanup:setup()};});},
 };
 vm.runInNewContext(code,{module,exports:module.exports,window:{addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)},require:id=>{
  if(id==='react')return{...React,...hooks};
  if(id==='react/jsx-runtime')return require(id);
  if(id.endsWith('client.ts'))return{invoke:async method=>method==='readVault'?{documents}:method==='readProduction'?{creations:[]}:method==='readVaultDocument'?{text:overviewText}:facts};
  // UI libraries remain element boundaries: tests call the directory-owned
  // handlers and inspect the page slices supplied to the real PaginationBar.
  if(id.endsWith('/radio'))return{Group:function RadioGroup(){}};
  if(id.endsWith('semi-controls.tsx'))return{PopupSelect:function PopupSelect(){}};
  if(id.endsWith('jincheng-topic-menus.tsx'))return{JinchengTopicMenus:function JinchengTopicMenus(){}};
  if(id.endsWith('jincheng-stage-actions.tsx'))return{JinchengStageActions:function JinchengStageActions(){}};
  return function UIControl(){};
 }});
 const render=()=>{cursor=0;pending=[];const tree=module.exports.JinchengContentDirectory({mode,contents,uiState,openContent:id=>calls.push(['open',id]),resumeContent:resume?id=>calls.push(['resume',id]):undefined,onUIStateChange:patch=>{patches.push(patch);if(controlled)uiState={...uiState,...patch};}});pending.forEach(setup=>setup());return tree;};
 return{render,calls,patches,facts,event:name=>listeners.get(name)?.(),exports:module.exports,async ready(){render();await nextTurn();return render();},setMode(value){mode=value;},setContents(items){contents.splice(0,contents.length,...items);},contents};
}

test('empty and single unified directories retain page-size controls for 20→50→100→20',async()=>{
 for(const count of [0,1,31]){
  const f=fixture({counts:[count,0,0]});let tree=await f.ready();
  for(const size of [20,50,100,20]){
   assert.ok(pager(tree,'选题列表分页'));pager(tree,'选题列表分页').props.onPageSizeChange(size);tree=f.render();
   assert.equal(pager(tree,'选题列表分页').props.pageSize,size);assert.equal(ids(tree).length,Math.min(count,size));
   assert.equal(all(tree,node=>node.type?.name==='PaginationBar').length,1);
  }
 }
});

test('the unified directory includes every source item once in next, paused, written order',async()=>{
 const f=fixture({counts:[3,2,2],overviewText:'## 近三天内容安排\n|日期|安排|对应选题|\n|---|---|---|\n|2026-10-28|拍摄顺序|T003 T001|'});let tree=await f.ready();
 assert.deepEqual(ids(tree),['T003','T001','T002','T1001','T1002','T2002','T2001']);
 assert.equal(new Set(ids(tree)).size,7);assert.equal(pager(tree,'选题列表分页').props.total,7);
 assert.equal(all(tree,node=>node.type?.name==='PaginationBar').length,1);
 assert.equal(all(tree,node=>node.type==='h2'||node.type==='h3').length,1,'the directory has one title instead of repeating the old group heading');
 assert.equal(all(tree,node=>node.type==='details'&&node.props.className==='jincheng-topic-group jincheng-topic-deferred').length,0);
 assert.deepEqual(statusTexts(tree),['待做','待做','待做','暂缓','暂缓','已写','已写']);
});

test('each status enum filters exactly its labelled rows and does not alter source facts',async()=>{
 const f=fixture({counts:[3,2,4]});await f.ready();const original=JSON.stringify(f.facts);
 for(const [value,total,label] of [['todo',3,'待做'],['paused',2,'暂缓'],['written',4,'已写'],['all',9,null]]){
  const tree=change(f,'选题状态',value);assert.equal(pager(tree,'选题列表分页').props.total,total);
  assert.equal(ids(tree).length,total);if(label)assert.equal(statusTexts(tree).every(text=>text===label),true);
 }
 assert.equal(JSON.stringify(f.facts),original);
});

test('query, type and status combine and reset only pagination while keeping list presentation',async()=>{
 const f=fixture({counts:[61,61,61]});let tree=await f.ready();
 tree=change(f,'内容呈现方式',{target:{value:'list'}});pager(tree,'选题列表分页').props.onPageChange(3);tree=f.render();
 tree=change(f,'选题状态','paused');assert.equal(pager(tree,'选题列表分页').props.page,1);
 tree=change(f,'内容类型','科普');assert.equal(pager(tree,'选题列表分页').props.total,31);
 pager(tree,'选题列表分页').props.onPageChange(2);tree=f.render();
 tree=change(f,'搜索内容编号或选题','暂缓 1');assert.deepEqual(ids(tree),['T1001','T1011','T1013','T1015','T1017','T1019']);
 assert.equal(pager(tree,'选题列表分页').props.page,1);assert.equal(control(tree,'选题状态').props.value,'paused');
 assert.equal(control(tree,'内容类型').props.value,'科普');assert.equal(control(tree,'内容呈现方式').props.value,'list');
 pager(tree,'选题列表分页').props.onPageSizeChange(50);tree=f.render();
 assert.equal(control(tree,'搜索内容编号或选题').props.value,'暂缓 1');assert.equal(control(tree,'选题状态').props.value,'paused');
 tree=change(f,'内容类型','不存在');assert.equal(ids(tree).length,0);assert.equal(pager(tree,'选题列表分页').props.total,0);
});

test('restored status and page survive mount and view switching; old snapshots default to all',async()=>{
 for(const status of ['paused',undefined]){
  const restored={query:'',type:'all',view:'cards',page:2,pageSize:20,deferredPage:5,pastPage:7,...(status?{status}:{})};
  const f=fixture({uiState:restored,controlled:true});let tree=await f.ready();
  assert.equal(pager(tree,'选题列表分页').props.page,2);assert.equal(ids(tree)[0],status?'T1021':'T021');
  assert.equal(control(tree,'选题状态').props.value,status??'all');assert.equal(f.patches.length,0);
  tree=change(f,'内容呈现方式',{target:{value:'list'}});assert.equal(pager(tree,'选题列表分页').props.page,2);
  assert.equal(control(tree,'选题状态').props.value,status??'all');
  tree=change(f,'选题状态','written');assert.equal(pager(tree,'选题列表分页').props.page,1);assert.equal(f.patches.at(-1).status,'written');
 }
});

test('a source refresh removing the final page clamps the unified result page',async()=>{
 const f=fixture();let tree=await f.ready();pager(tree,'选题列表分页').props.onPageChange(5);tree=f.render();
 assert.equal(pager(tree,'选题列表分页').props.page,5);
 f.setContents(f.contents.filter(content=>['T001','T1001','T2001'].includes(content.id)));tree=f.render();
 assert.deepEqual(ids(tree),['T001','T1001','T2001']);assert.equal(pager(tree,'选题列表分页').props.page,1);assert.equal(pager(tree,'选题列表分页').props.total,3);
});

test('recording and publication facts remain visible and keep doing/published mode membership',async()=>{
 const f=fixture({counts:[0,0,2]});f.facts[0].recorded=true;f.facts[1].published=true;await f.ready();
 let tree=change(f,'选题状态','written');assert.deepEqual(ids(tree),['T2002','T2001']);assert.deepEqual(statusTexts(tree),['已写','已写']);
 assert.equal(all(tree,node=>node.type==='span'&&node.props.children==='拍完还没发').length,1);
 assert.equal(all(tree,node=>node.type==='span'&&String(node.props.children).includes('原选题人工发布记录')).length,1);
 f.setMode('doing');tree=f.render();assert.deepEqual(ids(tree),['T2001']);assert.deepEqual(statusTexts(tree),['已录制']);
 f.setMode('published');tree=f.render();assert.deepEqual(ids(tree),['T2002']);assert.deepEqual(statusTexts(tree),['已发布']);
});

test('doing primary action resumes editing while its title retains detail and optional fallback',async()=>{
 for(const resume of [true,false]){
  const f=fixture({mode:'doing',counts:[0,0,1],resume}),tree=await f.ready();
  const card=all(tree,node=>node.props?.['data-content-id'])[0];
  all(card,node=>node.props?.className==='jincheng-content-title')[0].props.onClick();
  const actions=all(card,node=>node.props?.className==='jincheng-content-card-actions')[0];children(actions)[0].props.onClick();
  assert.deepEqual(f.calls,[['open','T2001'],[resume?'resume':'open','T2001']]);
 }
});

test('doing and published empty directories both retain the shared page-size control',async()=>{
 for(const mode of ['doing','published']){
  const f=fixture({mode,counts:[0,0,0]}),tree=await f.ready();assert.equal(pager(tree,'选题列表分页').props.total,0);
 }
});
test('doing defaults to latest numbered work while original shooting order remains selectable',async()=>{
 const f=fixture({mode:'doing',counts:[0,0,3],overviewText:'## 近三天内容安排\n|日期|安排|对应选题|\n|---|---|---|\n|2026-10-28|拍摄顺序|T2001 T2002|'});let tree=await f.ready();
 assert.deepEqual(ids(tree),['T2003','T2002','T2001']);
 tree=change(f,'在做排序','plan');assert.deepEqual(ids(tree),['T2001','T2002','T2003']);
 tree=change(f,'在做排序','recent');assert.deepEqual(ids(tree),['T2003','T2002','T2001']);
});

test('long card summaries preserve the complete body behind explicit expansion',async()=>{
 const f=fixture({counts:[1,0,0]}),tree=await f.ready();
 const summary=all(tree,node=>node.type==='details'&&node.props.className==='jincheng-content-summary')[0];
 assert.ok(summary);assert.equal(all(summary,node=>node.type==='p')[0].props.children,('长文\n'.repeat(100)).trim());
});
