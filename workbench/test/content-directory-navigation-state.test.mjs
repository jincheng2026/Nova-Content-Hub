import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../package.json',import.meta.url)), React=require('react');
const {rolldown}=await import(require.resolve('rolldown'));
const appPath=new URL('../src/renderer/app.tsx',import.meta.url).pathname;
const original=await fs.readFile(appPath,'utf8');
const initial={workspace:{contents:[],channels:[]},library:{collections:[],contentDetails:[],settings:{channels:[]}},assets:{},status:{currentName:'Fixture',busy:false,maintenance:{}},contents:[]};
let source=original.slice(0,original.indexOf('\nconst root =')).replace('function App()','export function App()').replace("useState<Page>('overview')","useState<Page>('content')");
for(const [name,value] of Object.entries(initial))source=source.replace(new RegExp(`(const \\[${name},[^\\n]+useState[^\\n]+)\\(null\\)`),`$1(namedInitial('${name}'))`);
const bundle=await rolldown({input:appPath,external:id=>id!==appPath,plugins:[{name:'fixture',load:id=>id===appPath?{code:source,moduleType:'tsx'}:null}]});
const result=await bundle.generate({format:'cjs'});await bundle.close();
function fixture({activeContents=[],trashContents=[]}={}){
 let slots=[],cursor=0,components=new Map(),initialSlots={};const calls=[];
 const marker=name=>{if(!components.has(name)){const f=()=>null;f.label=name;components.set(name,f);}return components.get(name);};
 const api=new Proxy({hasManagedDrafts:()=>false,errorInfo:error=>({message:error.message}),createDirectoryUIState:()=>({query:'',type:'all',status:'all',view:'cards',page:1,pageSize:20,deferredPage:1,pastPage:1}),createContentListUIState:()=>({layout:'cards',filter:'all',page:1,pageSize:20,collectionPage:1,collectionPageSize:20,sort:'updated'}),pageNames:{},invoke:async(method,args)=>{calls.push([method,args]);if(method==='readContent')return{id:args.id,title:'真实原内容',body:'保存正文',editToken:'one'};if(method==='status')return initial.status;if(method==='listContents')return args.view==='trash'?trashContents:activeContents;if(method==='openLibrary')return;throw Error(method);}}, {get:(object,key)=>key in object?object[key]:marker(key)});
 const hooks={useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],next=>slots[i]=typeof next==='function'?next(slots[i]):next];},useRef(initial){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];},useEffect(){},useLayoutEffect(){},useMemo:fn=>fn()};
 const module={exports:{}};
 vm.runInNewContext(result.output.find(item=>item.type==='chunk').code,{module,exports:module.exports,namedInitial:name=>{initialSlots[name]=cursor;return initial[name];},require:id=>id==='react'?hooks:id==='react/jsx-runtime'?require(id):id.includes('@douyinfe/')?marker(id):api,document:{hidden:true,getElementById:()=>null},window:{dispatchEvent(){}},Event:class{},requestAnimationFrame(){},setTimeout,clearTimeout,console});
 const flatten=(node,all=[])=>{if(!node)return all;if(Array.isArray(node)){node.forEach(item=>flatten(item,all));return all;}if(typeof node==='object'&&node.props){all.push(node);flatten(node.props.children,all);flatten(node.props.stageTabs,all);}return all;};
 return{calls,hydrate({preserveContents=false}={}){for(const [name,index] of Object.entries(initialSlots))if(!preserveContents||name!=='contents')slots[index]=initial[name];},render(){cursor=0;const tree=flatten(module.exports.App());return{find:name=>tree.find(node=>node.type?.label===name),button:id=>tree.find(node=>node.props.id===id),all:tree};},settle:()=>new Promise(resolve=>setImmediate(resolve))};
}
test('directory query, pages and layout survive a detail round trip and stay independent per stage',async()=>{
 const f=fixture();let view=f.render(),directory=view.find('ProductionContentDirectory');assert.ok(directory);assert.equal(typeof directory.props.onUIStateChange,'function');
 directory.props.onUIStateChange({query:'T019',status:'written',page:3,view:'list'});directory.props.onUIStateChange({pastPage:2});
 view=f.render();directory=view.find('ProductionContentDirectory');assert.equal(directory.props.uiState.query,'T019');assert.equal(directory.props.uiState.page,3);assert.equal(directory.props.uiState.pastPage,2);
 directory.props.openContent('T019');await f.settle();view=f.render();assert.equal(view.find('ProductionContentDirectory'),undefined);assert.equal(view.find('JinchengWorkDetail').props.resumeOnOpen,false);
 view.all.find(node=>node.props.className==='back-to-contents').props.onClick();await f.settle();view=f.render();assert.equal(view.find('ProductionContentDirectory').props.uiState.page,3);assert.equal(view.find('ProductionContentDirectory').props.uiState.status,'written');
 view.button('content-phase-doing').props.onClick();await f.settle();view=f.render();assert.equal(view.find('ProductionContentDirectory').props.uiState.query,'');view.find('ProductionContentDirectory').props.onUIStateChange({query:'在做',page:2});
 view.button('content-phase-topics').props.onClick();await f.settle();assert.equal(f.render().find('ProductionContentDirectory').props.uiState.query,'T019');
});
test('doing resume passes an explicit one-open intent while title opens remain summaries',async()=>{
 const f=fixture();let view=f.render();view.button('content-phase-doing').props.onClick();await f.settle();view=f.render();assert.equal(typeof view.find('ProductionContentDirectory').props.resumeContent,'function');view.find('ProductionContentDirectory').props.resumeContent('T019');await f.settle();assert.equal(f.render().find('JinchengWorkDetail').props.resumeOnOpen,true);
});
test('all-content layout/filter/pages survive leaving the directory without keeping it mounted',async()=>{
 const f=fixture();let view=f.render();view.button('content-phase-all').props.onClick();await f.settle();view=f.render();const list=view.find('ContentList');assert.equal(typeof list.props.onUIStateChange,'function');list.props.onUIStateChange({layout:'list',filter:'published',page:4});list.props.open({id:'T019'});await f.settle();view=f.render();assert.equal(view.find('ContentList'),undefined);view.all.find(node=>node.props.className==='back-to-contents').props.onClick();await f.settle();const state=f.render().find('ContentList').props.uiState;assert.equal(state.layout,'list');assert.equal(state.filter,'published');assert.equal(state.page,4);
});

test('switching libraries clears all directory state and all-content search without retaining a hidden list',async()=>{
 const f=fixture();let view=f.render();view.find('ProductionContentDirectory').props.onUIStateChange({query:'旧库',page:5,view:'list'});
 view.button('content-phase-all').props.onClick();await f.settle();view=f.render();view.find('ContentList').props.onUIStateChange({layout:'list',page:4,filter:'published'});view.find('ContentList').props.setQuery('旧库查询');
 view=f.render();view.button('library-menu').props.onClick();await f.settle();view=f.render();view.all.find(node=>node.props.children==='备份与维护').props.onClick();view=f.render();view.button('open-library').props.onClick();await f.settle();f.hydrate();view=f.render();assert.equal(view.find('ContentList').props.query,'');assert.equal(view.find('ContentList').props.uiState.page,1);assert.equal(view.find('ContentList').props.uiState.layout,'cards');
 view.button('content-phase-topics').props.onClick();await f.settle();view=f.render();assert.equal(view.find('ProductionContentDirectory').props.uiState.query,'');assert.equal(view.find('ProductionContentDirectory').props.uiState.page,1);assert.equal(view.find('ProductionContentDirectory').props.uiState.view,'cards');
});

test('leaving the all-content recycle bin reloads active contents for every stage directory',async()=>{
 for(const phase of ['topics','doing','published']){
  const f=fixture({activeContents:[{id:'active',title:'正常内容',body:'稿件'}],trashContents:[{id:'deleted',title:'已回收',deletedAt:'2026-10-28'}]});let view=f.render();
  view.button('content-phase-all').props.onClick();await f.settle();view=f.render();view.find('ContentList').props.changeView('trash');await f.settle();view=f.render();assert.equal(view.find('ContentList').props.view,'trash');assert.deepEqual(view.find('ContentList').props.contents.map(item=>item.id),['deleted']);
  view.button(`content-phase-${phase}`).props.onClick();await f.settle();view=f.render();assert.deepEqual(view.find('ProductionContentDirectory').props.contents.map(item=>item.id),['active'],`${phase} must receive active rows instead of recycled rows`);
  assert.equal(f.calls.filter(([method])=>method==='listContents').at(-1)[1].view,'active');
 }
});
test('opening a different library from its recycle bin clears the range and explicitly reads active rows',async()=>{
 const f=fixture({activeContents:[{id:'new-active',title:'新库正常内容'}],trashContents:[{id:'old-trash',title:'旧库回收内容',deletedAt:'2026-10-28'}]});let view=f.render();
 view.button('content-phase-all').props.onClick();await f.settle();view=f.render();view.find('ContentList').props.changeView('trash');await f.settle();view=f.render();
 view.button('library-menu').props.onClick();await f.settle();view=f.render();view.all.find(node=>node.props.children==='备份与维护').props.onClick();view=f.render();const boundary=f.calls.length;view.button('open-library').props.onClick();await f.settle();f.hydrate({preserveContents:true});view=f.render();
 assert.equal(view.find('ContentList').props.view,'active');assert.deepEqual(view.find('ContentList').props.contents.map(item=>item.id),['new-active']);const reads=f.calls.slice(boundary).filter(([method])=>method==='listContents');assert.ok(reads.length>0);assert.equal(reads.every(([,args])=>args.view==='active'),true,'a library switch must never issue a stale trash read');
});
