import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import * as data from '../src/renderer/jincheng-work-detail-data.ts';
const require=createRequire(new URL('../package.json',import.meta.url));
const {rolldown}=await import(require.resolve('rolldown'));
const jsx=require('react/jsx-runtime');
const compiled={};
for(const file of ['jincheng-work-detail','jincheng-topic-menus']){
 const bundle=await rolldown({input:new URL(`../src/renderer/${file}.tsx`,import.meta.url).pathname,external:id=>!id.endsWith(`/${file}.tsx`)&&!id.endsWith('/use-paged-items.ts')&&!id.endsWith('/paged-items.tsx')});
 const output=await bundle.generate({format:'cjs'});await bundle.close();compiled[file]=output.output.find(item=>item.type==='chunk').code;
}
// Run real components and the shared paging hook. Replace only host rendering,
// Semi controls, and IPC; each keyed component keeps its own hook slots.
function fixture(file,props,invoke=async()=>undefined){
 const states=new Map(),effects=new Map(),calls=[];let current='',cursor=0,pending=[],tree=[],changed=false;
 const hooks={
  useState(initial){const key=current+':'+cursor++;if(!states.has(key))states.set(key,typeof initial==='function'?initial():initial);return[states.get(key),next=>{const value=typeof next==='function'?next(states.get(key)):next;if(!Object.is(value,states.get(key))){states.set(key,value);changed=true;}}];},
  useRef(initial){const key=current+':'+cursor++;if(!states.has(key))states.set(key,{current:initial});return states.get(key);},
  useEffect(setup,deps){const key=current+':'+cursor++,old=effects.get(key);if(!old||deps.some((value,i)=>!Object.is(value,old.deps[i])))pending.push(()=>{old?.cleanup?.();effects.set(key,{deps,cleanup:setup()});});},
 };
 const module={exports:{}};
 vm.runInNewContext(compiled[file],{module,exports:module.exports,TextEncoder,crypto:{randomUUID:()=> 'mutation-one'},Event:class{},setTimeout,clearTimeout,window:{addEventListener(){},removeEventListener(){},dispatchEvent(){}},require:id=>{
  if(id==='react')return hooks;if(id==='react/jsx-runtime')return jsx;
  if(id.endsWith('/button'))return p=>({type:'button',props:p});
  if(id.endsWith('/banner'))return p=>jsx.jsx('banner',p);
  if(id.endsWith('/client.ts'))return{invoke:async(method,args)=>{calls.push([method,args]);return invoke(method,args);}};
  if(id.endsWith('/contracts.ts'))return{errorInfo:e=>({message:e.message})};
  if(id.endsWith('/jincheng-work-detail-data.ts'))return data;
  if(id.endsWith('/jincheng-directory.ts'))return{parseTopicOverview:()=>({plans:new Map(),rows:new Map(),deferred:new Map()})};
  if(id.endsWith('/pagination-bar.tsx'))return{PaginationBar:p=>jsx.jsx('pagination',p)};
  if(id.endsWith('/library-panels.tsx'))return{ManagedCloseBoundary:p=>p.children(async()=>{calls.push(['flush']);}),hasManagedDrafts:()=>false,ManagementDialog:p=>jsx.jsx('dialog',p)};
  if(id.endsWith('/creation-frame.tsx'))return{CreationFrame:p=>({type:'creation-frame',props:p})};
  return{};
 }});
 const Component=module.exports[file==='jincheng-work-detail'?(props.references?'JinchengReferences':'JinchengWorkDetail'):'JinchengTopicMenus'];
 function visit(element,path){
  if(element==null||typeof element==='boolean')return;
  if(Array.isArray(element)){element.forEach((child,i)=>visit(child,path+'/'+(child?.key??i)));return;}
  if(typeof element!=='object'){tree.push({type:'text',text:String(element)});return;}
  if(typeof element.type==='function'){current=path;cursor=0;visit(element.type(element.props),path+'/'+element.type.name);return;}
  if(typeof element.type==='string')tree.push(element);
  visit(element.props?.children,path+'/children');
 }
 function render(){let attempts=0;do{changed=false;pending=[];tree=[];visit(jsx.jsx(Component,{...props}),'root');pending.forEach(effect=>effect());assert.ok(++attempts<12,'component render should settle');}while(changed);return tree;}
 return{calls,render,async ready(){render();await new Promise(resolve=>setImmediate(resolve));return render();},nodes:type=>tree.filter(node=>node.type===type),text:()=>tree.filter(node=>node.type==='text').map(node=>node.text).join(''),page(label){const node=tree.find(node=>node.type==='pagination'&&node.props.label===label);assert.ok(node,`missing ${label}`);return node.props;},props};
}
const entries=count=>Array.from({length:count},(_,i)=>i+1);
test('reference pages bound each group and retain exact final-link actions and full text',()=>{
 const calls=[],references={videos:entries(105).map(i=>({key:`video-${i}`,title:`视频 ${i}`,links:[{title:'原片',target:`https://example.com/${i}`,url:`https://example.com/${i}`}]})),materials:entries(105).map(i=>({title:`资料 ${i}`,target:`资料位置/${i}`}))};
 const f=fixture('jincheng-work-detail',{references,busy:false,onRead(){},onLocate(){},onCopy:(...args)=>calls.push(args)});
 f.render();assert.equal(f.nodes('article').length,40);assert.equal(f.page('参考视频分页').total,105);assert.equal(f.page('参考资料分页').total,105);
 f.page('参考视频分页').onPageChange(6);f.page('参考资料分页').onPageChange(6);f.render();assert.equal(f.nodes('article').length,10);assert.match(f.text(),/视频 105/);assert.match(f.text(),/资料 105/);
 f.nodes('button').filter(node=>node.props.children==='复制原视频链接').at(-1).props.onClick();assert.deepEqual(calls,[['https://example.com/105',true]]);
 f.page('参考资料分页').onPageSizeChange(100);f.render();assert.equal(f.page('参考资料分页').page,1);assert.equal(f.nodes('article').length,105);
 f.props.contentId='another-content';f.render();assert.equal(f.page('参考视频分页').page,1);
});
test('detail pages reach final HTML, topic card, other file, and source candidate without changing identities',async()=>{
 const make=(kind,i,path)=>({documentId:`${kind}-${i}`,relativePath:path,hash:`${kind}-hash-${i}`,role:'creation-page'});
 const pages=entries(105).map(i=>make('html',i,`05_内容草稿/T019/原页${i}.html`)),topics=entries(105).map(i=>make('topic',i,`04_选题库/T019-卡${i}.md`)),others=entries(105).map(i=>make('other',i,`05_内容草稿/T019/资料${i}.txt`));
 const work={id:'T019',tNumber:'T019',relativePath:pages[0].relativePath,sourceResolution:'conflict',sourceCandidates:pages,relatedDocuments:[...pages,...topics,...others],creationDocuments:pages,hash:'original-hash'};
 const context={content:work,workflow:{revision:7},sourceIssues:[]};
 const docs=[...pages,...topics,...others].map(item=>({id:item.documentId,relativePath:item.relativePath,format:item.documentId.startsWith('html')?'html':item.documentId.startsWith('topic')?'markdown':'text'}));
 const f=fixture('jincheng-work-detail',{contentId:'T019',title:'保留标题',stage:'writing',busy:false,dirty:false,activeTool:'production',chooseTool(){},makeCover(){},showTasks(){},registerCloseGuard(){},sourceNotice:null,children:null},async(method,args)=>method==='readVaultWorkContext'?context:method==='readVault'?{documents:docs}:method==='readVaultDocument'?{document:docs.find(doc=>doc.id===args.id),text:'完整原文'}:method==='selectVaultCurrentWork'?context:undefined);
 await f.ready();assert.equal(f.nodes('article').length,40);assert.equal(f.nodes('button').filter(node=>String(node.props.children).includes('选题卡原文件')).length,20);
 for(const label of ['网页分页','选题卡原文件分页','其他文件分页','当前入口候选分页']){assert.equal(f.page(label).total,105);f.page(label).onPageChange(6);}f.render();
 const buttons=f.nodes('button');buttons.filter(node=>String(node.props.children).includes('选题卡原文件')).at(-1).props.onClick();await new Promise(resolve=>setImmediate(resolve));f.render();assert.equal(f.calls.findLast(([method])=>method==='readVaultDocument')[1].id,'topic-105');
 f.nodes('button').filter(node=>node.props.children==='在这里打开').at(-1).props.onClick();await new Promise(resolve=>setImmediate(resolve));f.render();assert.equal(f.nodes('creation-frame')[0].props.documentId,'html-105');assert.equal(f.calls.filter(([method])=>method==='flush').length,1);
 f.nodes('button').filter(node=>node.props.children==='选为这次接着写的入口').at(-1).props.onClick();await new Promise(resolve=>setImmediate(resolve));f.render();const action=f.calls.findLast(([method])=>method==='selectVaultCurrentWork')[1];assert.equal(action.documentId,'html-105');assert.equal(action.expectedHash,'html-hash-105');assert.equal(action.expectedRevision,7);
 assert.equal(work.sourceResolution,'conflict','pagination must not adopt a current source automatically');
 f.page('网页分页').onPageChange(1);f.render();assert.equal(f.nodes('creation-frame')[0].props.documentId,'html-105','changing a file page must retain the actual open HTML');assert.equal(f.calls.filter(([method])=>method==='flush').length,2,'list navigation must not close or save the original page');
 work.sourceResolution='resolved';work.sourceDocumentId='html-1';f.render();assert.equal(f.page('更换当前入口分页').total,104);f.page('更换当前入口分页').onPageChange(6);f.render();
 f.nodes('button').filter(node=>node.props.children==='选为当前入口').at(-1).props.onClick();await new Promise(resolve=>setImmediate(resolve));assert.equal(f.calls.findLast(([method])=>method==='selectVaultCurrentWork')[1].documentId,'html-105');assert.equal(f.calls.findLast(([method])=>method==='selectVaultCurrentWork')[1].expectedHash,'html-hash-105');
 assert.equal(work.sourceDocumentId,'html-1','viewing or navigating alternative sources must not rewrite the selected source');
});
test('topic candidate pages preserve final session hash and full candidate details',async()=>{
 const menus=entries(25).map(i=>({sessionId:`session-${i}`,relativePath:`菜单/${i}.md`,hash:`session-hash-${i}`,adoptions:[],candidates:entries(105).map(j=>({id:`candidate-${i}-${j}`,title:`选题 ${i}-${j}`,description:`作者完整描述 ${i}-${j}`,change:'改变',audience:'读者',coverage:'完整证据',titleExample:'标题原文',caution:'注意原文'}))}));
 const opened=[],f=fixture('jincheng-topic-menus',{openContent:id=>opened.push(id)},async method=>method==='readVaultTopicMenus'?menus:method==='adoptVaultTopic'?{contentId:'real-content-25-105'}:undefined);
 await f.ready();assert.equal(f.nodes('article').length,20);assert.equal(f.page('选题候选分页').total,2625);f.page('选题候选分页').onPageChange(132);f.render();assert.equal(f.nodes('article').length,5);assert.match(f.text(),/作者完整描述 25-105/);assert.match(f.text(),/标题原文/);
 f.nodes('button').filter(node=>node.props.children==='选定这一条并建立 T 卡').at(-1).props.onClick();await new Promise(resolve=>setImmediate(resolve));const action=f.calls.findLast(([method])=>method==='adoptVaultTopic')[1];assert.equal(action.sessionId,'session-25');assert.equal(action.candidateId,'candidate-25-105');assert.equal(action.expectedHash,'session-hash-25');assert.deepEqual(opened,['real-content-25-105']);
});

test('one reference video can page its growing transcript links and copy the exact final location',()=>{
 const copied=[],references={videos:[{key:'video',title:'原作者视频',links:entries(105).map(i=>({title:`完整逐字稿 ${i}`,target:`原资料/转写-${i}.md`}))}],materials:[]};
 const f=fixture('jincheng-work-detail',{references,busy:false,onRead(){},onLocate(){},onCopy:(...args)=>copied.push(args)});f.render();
 assert.equal(f.nodes('div').filter(node=>node.props.className==='jincheng-detail-reference-link').length,20);assert.equal(f.page('视频资料分页 · 原作者视频').total,105);
 f.page('视频资料分页 · 原作者视频').onPageChange(6);f.render();assert.match(f.text(),/完整逐字稿 105/);f.nodes('button').at(-1).props.onClick();assert.deepEqual(copied,[['原资料/转写-105.md',false]]);
});
