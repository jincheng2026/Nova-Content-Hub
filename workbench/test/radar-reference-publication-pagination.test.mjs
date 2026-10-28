import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {adoptTitleRecommendation} from '../src/shared/content-title-recommendations.ts';
const require=createRequire(new URL('../package.json',import.meta.url)),{rolldown}=await import(require.resolve('rolldown')),jsx=require('react/jsx-runtime');
const files=['radar-workspace','content-title-recommendations','reusable-references','jincheng-publication'],compiled={};
for(const file of files){
 const include=[`/renderer/${file}.tsx`,'/use-paged-items.ts','/paged-items.tsx','/shared/content-title-recommendations.ts','/radar-policy.mjs','/production-research.mjs','/production-reference.mjs'];
 const bundle=await rolldown({input:new URL(`../src/renderer/${file}.tsx`,import.meta.url).pathname,external:id=>!include.some(suffix=>id.endsWith(suffix))});
 const output=await bundle.generate({format:'cjs'});await bundle.close();compiled[file]=output.output.find(item=>item.type==='chunk').code;
}
// Real component, paging hook and source-selection helpers. Only host UI and IPC are replaced.
function fixture(file,props,invoke=async()=>undefined){
 const states=new Map(),effects=new Map(),calls=[];let current='',cursor=0,pending=[],tree=[],changed=false;
 const hooks={useState(initial){const key=current+':'+cursor++;if(!states.has(key))states.set(key,typeof initial==='function'?initial():initial);return[states.get(key),next=>{const value=typeof next==='function'?next(states.get(key)):next;if(!Object.is(value,states.get(key))){states.set(key,value);changed=true;}}];},useRef(initial){const key=current+':'+cursor++;if(!states.has(key))states.set(key,{current:initial});return states.get(key);},useEffect(setup,deps){const key=current+':'+cursor++,old=effects.get(key);if(!old||deps.some((value,i)=>!Object.is(value,old.deps[i])))pending.push(()=>{old?.cleanup?.();effects.set(key,{deps,cleanup:setup()});});}};
 const module={exports:{}};
 vm.runInNewContext(compiled[file],{module,exports:module.exports,TextEncoder,URL,structuredClone,crypto:{randomUUID:()=> 'mutation-one'},Event:class{},clearInterval(){},window:{addEventListener(){},removeEventListener(){},dispatchEvent(){},setInterval(){return 1;}},require:id=>{
  if(id==='react')return hooks;if(id==='react/jsx-runtime')return jsx;
  if(id.includes('/lib/es/'))return p=>({type:id.endsWith('/button')?'button':id.endsWith('/input')?'input':'card',props:p});
  if(id.endsWith('/client.ts'))return{invoke:async(method,args)=>{calls.push([method,args]);return invoke(method,args);}};
  if(id.endsWith('/contracts.ts'))return{errorInfo:e=>({message:e.message})};
  if(id.endsWith('/platform-catalog.ts'))return{platformCatalogSnapshot:()=>({platforms:[{name:'抖音'},{name:'小红书'}]})};
  if(id.endsWith('/pagination-bar.tsx'))return{PaginationBar:p=>jsx.jsx('pagination',p)};
  if(id.endsWith('/library-panels.tsx'))return{ManagementDialog:p=>jsx.jsx('dialog',p)};
  if(id.endsWith('/document-markdown.tsx'))return{DocumentMarkdown:p=>jsx.jsx('markdown',{children:p.text})};
  if(id.endsWith('/semi-controls.tsx'))return Object.fromEntries(['PopupCreatableSelect','PopupMultiSelect','PopupSelect','UtcDateTimeInput'].map(name=>[name,p=>jsx.jsx(name,p)]));
  if(id.endsWith('/production-workspace.tsx'))return{ProductionRecovery:()=>null};
  if(id.endsWith('/production-record-details.tsx'))return{ProductionRecordDetails:p=>jsx.jsx('dialog',p)};
  if(id.endsWith('/production-rejection.tsx'))return{ProductionRejection:()=>null};
  if(id.endsWith('/production-dialog.tsx'))return{ProductionDialog:p=>jsx.jsx('dialog',p)};
  return{};
 }});
 const Component=module.exports[{ 'radar-workspace':'RadarWorkspace','content-title-recommendations':'ContentTitleRecommendations','reusable-references':'ReusableReferences','jincheng-publication':'JinchengPublication'}[file]];
 function visit(element,path){if(element==null||typeof element==='boolean')return;if(Array.isArray(element)){element.forEach((child,i)=>visit(child,path+'/'+(child?.key??i)));return;}if(typeof element!=='object'){tree.push({type:'text',text:String(element)});return;}if(typeof element.type==='function'){current=path;cursor=0;visit(element.type(element.props),path+'/'+element.type.name);return;}if(typeof element.type==='string')tree.push(element);visit(element.props?.children,path+'/children');}
 function render(){let attempts=0;do{changed=false;pending=[];tree=[];visit(jsx.jsx(Component,{...props}),'root');pending.forEach(effect=>effect());assert.ok(++attempts<12,'render should settle');}while(changed);return tree;}
 return{calls,props,render,async ready(){render();await new Promise(resolve=>setImmediate(resolve));return render();},nodes:type=>tree.filter(node=>node.type===type),text:()=>tree.filter(node=>node.type==='text').map(node=>node.text).join(''),buttons:text=>tree.filter(node=>node.type==='button'&&node.props.children===text),page(label){const node=tree.find(node=>node.type==='pagination'&&node.props.label===label);assert.ok(node,`missing ${label}`);return node.props;}};
}
const entries=count=>Array.from({length:count},(_,i)=>i+1),tick=()=>new Promise(resolve=>setImmediate(resolve));
const reference=i=>({id:`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`,title:`参考 ${i}`,url:`https://example.com/${i}`,platform:'原平台',originalText:`完整原文 ${i}`,correctedText:'',segments:[],corrections:[],analysis:`完整拆解 ${i}`,mediaAssetHash:null,subtitleAssetHash:null});
function acceptedTask(i,kind,artifacts){return{id:`task-${i}`,kind,contentId:'content-a',title:`任务 ${i}`,activeAttemptId:`attempt-${i}`,requestHash:`request-${i}`,request:{bodyHash:'body-a',parameters:{},budget:{amount:0}},attempts:[{id:`attempt-${i}`,status:'accepted',receipt:{taskId:`task-${i}`,attemptId:`attempt-${i}`,requestHash:`request-${i}`,sha256:`receipt-${i}`},result:{artifacts}}]};}

test('radar pages task history and filtered evidence while actions retain exact source IDs and global counts',async()=>{
 const tasks=entries(41).map(i=>{const task=acceptedTask(i,'research',[]);task.request.parameters.workflow='viral-radar';task.attempts[0].status='created';return task;});
 const candidates=entries(105).map(i=>({id:`candidate-${i}`,sourceKey:`source-${i}`,title:`作品 ${i}`,author:{name:`作者 ${i}`,followers:300},platform:'抖音',publishedAt:null,collectedAt:new Date(Date.UTC(2026,0,1,0,0,106-i)).toISOString(),eligibility:'qualified',decision:'pending',metrics:{likes:1000,likeFollowerRatio:3},reasons:[],evidence:[],url:`https://example.com/${i}`}));
 const snapshot={editToken:'production-token',tasks,reports:[{id:'report-a',type:'viral-radar',meta:{radar:{schemaVersion:1,taskId:'adopted-task',query:{direction:'明确方向'},candidates}}}]};
 const f=fixture('radar-workspace',{busy:false,openContent(){},showTasks(){},contentChanged:async()=>{}},async method=>method==='readProduction'?snapshot:method==='readPlatformCatalog'?{platforms:[{name:'抖音'}]}:method==='openProductionTask'?{opened:true}:undefined);
 await f.ready();assert.equal(f.nodes('article').length,20);assert.equal(f.nodes('div').filter(n=>n.props.className==='radar-task').length,20);assert.equal(f.page('雷达任务分页').total,41);assert.equal(f.page('雷达结果分页').total,105);assert.match(f.text(),/新发现 105/);
 f.page('雷达任务分页').onPageChange(3);f.page('雷达结果分页').onPageChange(6);f.render();assert.equal(f.nodes('article').length,5);assert.match(f.text(),/作品 105/);f.buttons('继续原任务')[0].props.onClick();await tick();assert.equal(f.calls.findLast(([m])=>m==='openProductionTask')[1].taskId,'task-1');
 f.nodes('button').filter(n=>n.props.className==='radar-title').at(-1).props.onClick();await tick();assert.equal(f.calls.findLast(([m])=>m==='openRadarSource')[1].candidateId,'candidate-105');assert.equal(f.calls.findLast(([m])=>m==='openRadarSource')[1].reportId,'report-a');
 f.nodes('input').find(n=>n.props['aria-label']==='搜索雷达结果').props.onChange('作品 10');f.render();assert.equal(f.page('雷达结果分页').page,1);assert.equal(f.page('雷达结果分页').total,7);assert.match(f.text(),/新发现 105/);assert.equal(snapshot.tasks.length,41);
 f.page('雷达结果分页').onPageSizeChange(50);f.render();assert.equal(f.page('雷达结果分页').pageSize,50);f.nodes('input').find(n=>n.props['aria-label']==='搜索雷达结果').props.onChange('');f.render();assert.equal(f.nodes('article').length,50);f.page('雷达结果分页').onPageSizeChange(100);f.render();assert.equal(f.nodes('article').length,100);f.page('雷达结果分页').onPageChange(2);f.render();assert.equal(f.nodes('article').length,5);
 snapshot.reports[0].meta.radar.candidates=candidates.slice(0,41);f.props.busy=true;f.render();assert.equal(f.page('雷达结果分页').page,1);assert.equal(f.nodes('article').length,41);assert.ok(f.page('雷达结果分页').disabled);
});

test('title recommendations page all accepted tasks and candidates, stage only exact final title and preserve dirty/CAS guards',async()=>{
 const content={id:'content-a',editToken:'content-token',title:'原标题',body:'已保存正文',bodyHash:'body-a',deletedAt:null};let draft={title:content.title,body:content.body};
 const tasks=entries(105).map(i=>acceptedTask(i,'packaging',[{id:`artifact-${i}`,kind:'packaging',data:{packaging:{titles:[{id:`title-${i}`,text:`候选标题 ${i}`}]}}}]));
 const snapshot={editToken:'production-token',tasks},state={content,creation:null,productionToken:snapshot.editToken};
 const f=fixture('content-title-recommendations',{content,dirty:false,busy:false,conflict:false,run:action=>action(),adopt:candidate=>{draft=adoptTitleRecommendation(content,draft,candidate);return true;},showTasks(){}},async method=>method==='readProductionCreation'?state:snapshot);
 f.render();f.buttons('AI 推荐标题')[0].props.onClick();await tick();f.render();assert.equal(f.nodes('article').length,20);assert.equal(f.page('标题包装任务分页').total,105);assert.equal(f.page('标题候选分页').total,105);
 f.page('标题包装任务分页').onPageChange(6);f.page('标题候选分页').onPageChange(6);f.render();assert.equal(f.nodes('article').length,5);assert.match(f.text(),/候选标题 105/);f.buttons('采用到标题草稿').at(-1).props.onClick();f.render();assert.deepEqual(draft,{title:'候选标题 105',body:'已保存正文'});assert.equal(content.title,'原标题');assert.equal(f.calls.filter(([m])=>m!=='readProductionCreation'&&m!=='readProduction').length,0);
 f.props.dirty=true;f.render();assert.ok(f.buttons('采用到标题草稿').every(n=>n.props.disabled));f.props.dirty=false;f.props.content={...content,editToken:'another-token'};f.render();assert.ok(f.buttons('采用到标题草稿').every(n=>n.props.disabled));
 f.page('标题包装任务分页').onPageSizeChange(50);f.render();assert.equal(f.page('标题包装任务分页').pageSize,50);f.page('标题包装任务分页').onPageSizeChange(20);f.render();assert.equal(f.page('标题包装任务分页').pageSize,20);
 f.props.content={...content,id:'another-content'};f.render();assert.equal(f.page('标题候选分页').page,1);
});

test('reusable catalogs and nested evidence page independently with exact receipt and duplicate guards',async()=>{
 const tasks=entries(41).map(i=>acceptedTask(i,'research',[{id:`artifact-${i}`,kind:'research',text:`研究正文 ${i}`,data:{references:entries(105).map(reference)}}]));
 const snapshot={tasks,creations:[{tNumber:'T001',references:entries(105).map(reference)}]},added=[],adopted=[];
 const f=fixture('reusable-references',{references:[reference(105)],busy:false,add:r=>added.push(r),adoptResearch:async source=>{adopted.push(source);}},async()=>snapshot);
 f.render();f.nodes('details')[0].props.onToggle({currentTarget:{open:true}});await f.ready();assert.equal(f.nodes('article').length,40);assert.equal(f.page('已验收研究分页').total,41);assert.equal(f.page('跨内容参考分页').total,105);
 f.page('已验收研究分页').onPageChange(3);f.page('跨内容参考分页').onPageChange(6);f.render();assert.equal(f.nodes('article').length,6);assert.match(f.text(),/参考 105/);assert.match(f.text(),/完整拆解 105/);assert.ok(f.buttons('本篇已有此参考，请核对版本')[0].props.disabled);
 const nested=f.page('研究引用明细分页 · 任务 41');assert.equal(nested.total,105);nested.onPageChange(6);f.render();assert.match(f.text(),/完整原文 105/);f.buttons('用于本篇创作')[0].props.onClick();await tick();assert.equal(adopted[0].taskId,'task-41');assert.equal(adopted[0].receiptHash,'receipt-41');assert.equal(adopted[0].references.length,105);
 f.buttons('加入本篇参考').at(-1).props.onClick();assert.equal(added[0].id,reference(104).id);assert.equal(added[0].url,reference(104).url);assert.notEqual(added[0],snapshot.creations[0].references[103]);
 f.nodes('input')[0].props.onChange('105');f.render();assert.equal(f.page('跨内容参考分页').page,1);assert.equal(f.page('跨内容参考分页').total,1);
});

test('publication archive and knowledge pages require explicit author decisions and retain exact hashes',async()=>{
 const archives=entries(105).map(i=>({sourceId:`source-${i}`,videoId:`video-${i}`,relativePath:`原库/${i}/登记单.json`,hash:`hash-${i}`,manifest:{title:`正式档案 ${i}`,work_id:'T001',nova:{vault_id:`vault-${i}`}},content:`完整原内容 ${i}`,snapshots:[]}));
 const facts={revision:7,work:{vaultId:'current-vault',workId:'current-work'},archive:{state:'missing'},publication:{state:'unknown'},review:{status:'pending'},unassociatedArchiveCandidates:archives,externalArchives:archives,knowledge:{candidates:entries(105).map(i=>({id:`knowledge-${i}`,hash:`knowledge-hash-${i}`,kind:'case',status:'pending',text:`知识正文 ${i}`,evidence:{source:`证据 ${i}`}}))},issues:[]};
 const f=fixture('jincheng-publication',{contentId:'content-a',busy:false},async method=>method==='readJinchengPublication'||method==='mutateJinchengPublication'?facts:undefined);
 await f.ready();assert.equal(f.nodes('article').length,20);assert.equal(f.page('待关联正式档案分页').total,105);assert.equal(f.page('已关联外部档案分页').total,105);assert.equal(f.page('知识候选分页').total,105);assert.match(f.text(),/105 份/);assert.match(f.text(),/105 条/);
 for(const label of ['待关联正式档案分页','已关联外部档案分页','知识候选分页'])f.page(label).onPageChange(6);f.render();assert.equal(f.nodes('article').length,5);assert.match(f.text(),/完整原内容 105/);assert.match(f.text(),/知识正文 105/);assert.equal(f.calls.filter(([m])=>m==='mutateJinchengPublication').length,0);
 f.buttons('核对这份档案与当前内容的关联').at(-1).props.onClick();f.render();assert.equal(f.calls.filter(([m])=>m==='mutateJinchengPublication').length,0);f.buttons('我已核对，关联本内容')[0].props.onClick();await tick();f.render();let action=f.calls.findLast(([m])=>m==='mutateJinchengPublication')[1];assert.equal(action.sourceId,'source-105');assert.equal(action.videoId,'video-105');assert.equal(action.expectedSourceHash,'hash-105');assert.equal(action.expectedRevision,7);assert.equal(action.manifestPath,'原库/105/登记单.json');
 f.buttons('不采纳').at(-1).props.onClick();await tick();action=f.calls.findLast(([m])=>m==='mutateJinchengPublication')[1];assert.equal(action.candidateId,'knowledge-105');assert.equal(action.candidateHash,'knowledge-hash-105');assert.equal(action.decision,'reject');
 f.props.contentId='another-content';await f.ready();assert.equal(f.page('知识候选分页').page,1);assert.equal(facts.unassociatedArchiveCandidates.length,105);
});
