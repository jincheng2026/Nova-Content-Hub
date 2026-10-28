import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createRequire} from 'node:module';

// Render the real workspace, paging hook and business derivations. IPC is a
// memory-only boundary; these cases never read/write an author's content library.
const require=createRequire(new URL('../package.json',import.meta.url));
const React=require('react');
const {rolldown}=await import(require.resolve('rolldown'));
const real=['production-workspace.tsx','pagination-bar.tsx','use-paged-items.ts','paged-items.tsx','production-review.mjs','production-report-status.ts','platform-catalog.ts','radar-policy.mjs','production-research.mjs','production-reference.mjs'];
const bundle=await rolldown({input:new URL('../src/renderer/production-workspace.tsx',import.meta.url).pathname,external:id=>!real.some(name=>id.endsWith('/'+name))});
const generated=await bundle.generate({format:'cjs'});await bundle.close();
const code=generated.output.find(item=>item.type==='chunk').code;
const children=node=>[node?.props?.children].flat(Infinity).filter(Boolean);
const all=(node,predicate)=>!node||typeof node!=='object'?[]:[...(predicate(node)?[node]:[]),...children(node).flatMap(child=>all(child,predicate))];
const pager=tree=>all(tree,node=>node.type?.name==='PaginationBar')[0];
const cards=tree=>all(tree,node=>node.props?.className?.includes('production-record-card'));
const ids=tree=>cards(tree).map(node=>node.key);
const control=(tree,label)=>all(tree,node=>node.props?.['aria-label']===label)[0];
const button=(tree,label)=>all(tree,node=>node.props?.onClick&&children(node).filter(child=>typeof child==='string').join('')===label)[0];
const change=(f,label,value)=>{control(f.render(),label).props.onChange(value);return f.render();};
const nextTurn=()=>new Promise(resolve=>setImmediate(resolve));
const sections=['accounts','reports','tasks'];
const pad=n=>String(n).padStart(3,'0');

function fixture(section,count=121){
 const stores=new Map(),listeners=new Map(),calls=[];let searchOverride=null;
 const makeStore=()=>({states:[],effects:[],refs:[],cursor:0});
 let scope=makeStore(),pending=[],changed=false,hookCount;const root=scope;let usedScopes=new Set();
 const at='2026-10-01T00:00:00.000Z';
 const snapshot={schemaVersion:1,nextTNumber:1,editToken:'v1',creations:[],feedback:[],knowledge:[],costs:[],accounts:[],reports:[],tasks:[]};
 for(let n=1;n<=count;n++){
  const id=pad(n);
  snapshot.accounts.push({id:'a'+id,name:'账号 '+id,platform:n%2?'抖音':'小红书',url:'https://example.test/'+id,note:'作者完整备注 '+id,tags:['标签 '+id],images:[],avatarAssetHash:null,reportIds:[],createdAt:at,updatedAt:at,deletedAt:null});
  snapshot.reports.push({id:'r'+id,title:'报告 '+id,type:n%2?'调研':'复盘',accountIds:[],sourceUrl:null,collectedAt:n%2?'2026-10-20T00:00:00.000Z':null,pages:[{id:'page'+id,title:'正文 '+id,assetHash:'hash'+id}],pageId:'page'+id,meta:{},createdAt:at,updatedAt:at,deletedAt:null});
  snapshot.tasks.push({id:'t'+id,title:'任务 '+id,kind:'research',contentId:null,accountId:null,request:{prompt:'固定请求 '+id,parameters:{},tools:[],budget:{amount:1,currency:'REQ'},bodyHash:null},requestHash:'request'+id,activeAttemptId:'attempt'+id,attempts:[{id:'attempt'+id,host:'codex',status:'claimed',claimToken:'claim'+id,workerId:'worker',progress:25,message:'真实进度 '+id,failure:null,result:null,receipt:null,createdAt:at,updatedAt:at}],createdAt:at,updatedAt:at});
 }
 snapshot.recordPermissions={accounts:Object.fromEntries(snapshot.accounts.map(a=>[a.id,{editable:true,reason:null}])),reports:Object.fromEntries(snapshot.reports.map(r=>[r.id,{editable:true,reason:null}]))};snapshot.libraryScope='fixture-library';
 const creation={contentId:'content',tNumber:'T001',stage:'references',kind:'tutorial',references:Array.from({length:41},(_,i)=>({id:'ref'+pad(i+1),url:null,title:'参考 '+pad(i+1),platform:'手工',originalText:'原文 '+pad(i+1),correctedText:'',segments:[],corrections:[],analysis:'',mediaAssetHash:null,subtitleAssetHash:null})),analysis:'完整拆解',narrative:'完整叙事',suggestions:[],annotations:[],packaging:{titles:Array.from({length:41},(_,i)=>({id:'title'+pad(i+1),text:'标题候选 '+pad(i+1)})),coverTexts:[],intros:[],selectedTitleId:null,selectedCoverTextId:null,selectedIntroId:null},confirmedBodyHash:null,createdAt:at,updatedAt:at};
 const contentState={content:{id:'content',title:'作者标题',body:'完整作者正文。',bodyHash:'body-hash',editToken:'cv1',deletedAt:null},creation,productionToken:'v1',history:{truncated:true,limit:200,scanLimit:500,entryLimit:100000,responseBytesLimit:1000000,versions:Array.from({length:41},(_,i)=>({transactionId:'version'+pad(i+1),revision:i+1,at,operation:'save',source:'unique '+pad(i+1),author:'作者',reason:null,beforeBody:'前版',afterBody:'正文 '+pad(i+1),bodyTruncated:false,summary:{removed:'旧',added:'新',beforeCharacters:2,afterCharacters:6}}))}};
 const hooks={
  useState(initial){const owner=scope,i=owner.cursor++;if(!(i in owner.states))owner.states[i]=typeof initial==='function'?initial():initial;return[owner.states[i],value=>{const next=typeof value==='function'?value(owner.states[i]):value;if(!Object.is(owner.states[i],next)){owner.states[i]=next;changed=true;}}];},
  useRef(initial){const i=scope.cursor++;return scope.refs[i]??={current:initial};},
  useMemo(compute){scope.cursor++;return compute();},
  useCallback(fn){scope.cursor++;return fn;},
  useEffect(setup,deps){const owner=scope,i=owner.cursor++,previous=owner.effects[i];if(!previous||!deps||deps.some((value,at)=>!Object.is(value,previous.deps?.[at])))pending.push(()=>{previous?.cleanup?.();owner.effects[i]={deps,cleanup:setup()};});},
 };
 const module={exports:{}};
 vm.runInNewContext(code,{module,exports:module.exports,structuredClone,TextEncoder,crypto:{randomUUID:()=> 'test-mutation'},clearInterval(){},window:{setInterval:()=>1,addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)},require:id=>{
  if(id==='react')return{...React,...hooks};
  if(id==='react/jsx-runtime')return require(id);
  if(id.endsWith('client.ts'))return{invoke:async(method,input)=>{calls.push([method,structuredClone(input)]);if(method==='readProduction')return snapshot;if(method==='readProductionCreation')return contentState;if(method==='saveProductionDraft')return contentState;if(method==='readPlatformCatalog')throw Error('memory fixture');if(method==='openProductionLink'||method==='openProductionTask')return{opened:true};if(method==='actProductionTask'||method==='mutateProduction')return snapshot;throw Error('Unexpected IPC: '+method);}};
  if(id.endsWith('production-contracts.ts'))return{scopedProductionRecordOps:new Set(['saveAccount','trashAccount','restoreAccount','saveReport','trashReport','restoreReport'])};
  if(id.endsWith('use-report-search.ts'))return{useReportSearch:(_enabled,_scope,input)=>searchOverride??({result:{hits:snapshot.reports.filter(r=>(input.scope==='trash'?!!r.deletedAt:!r.deletedAt)&&(input.type===null||r.type===input.type)&&(!input.from||(r.collectedAt??r.createdAt).slice(0,10)>=input.from)&&r.title.toLowerCase().includes(input.query.trim().toLowerCase())).map(r=>({reportId:r.id,fields:['title'],snippets:[]})),status:'complete',snapshotKey:snapshot.editToken},working:false,error:'',continueSearch(){},restart(){}})};
  if(id.endsWith('production-record-management.tsx'))return{ProductionRecordManagement:function ProductionRecordManagement(){}};
  if(id.endsWith('library-panels.tsx'))return{useManagedDraftGuard(){},hasManagedDrafts:()=>false};
  if(id.endsWith('document-markdown.tsx'))return{DocumentMarkdown:function DocumentMarkdown(){},markdownSummary:text=>text};
  if(id.endsWith('semi-controls.tsx'))return{PopupSelect:function PopupSelect(){},PopupCreatableSelect:function PopupCreatableSelect(){},CalendarDateInput:function CalendarDateInput(){}};
  if(id.endsWith('production-record-details.tsx'))return{ProductionRecordDetails:function ProductionRecordDetails(){}};
  if(id.endsWith('production-dialog.tsx'))return{ProductionDialog:function ProductionDialog(){}};
  if(id.endsWith('research-depth.ts'))return{researchDepths:{simple:{label:'简要',goal:'简要研究'},detailed:{label:'深入',goal:'深入研究'}},researchTaskTitle:(title,prompt)=>title||prompt};
  if(id.endsWith('jincheng-source-status.tsx'))return{JinchengSourceStatus:function JinchengSourceStatus(){}};
  return function UIControl(){};
 }});
 const expand=node=>{
  if(!node||typeof node!=='object')return node;if(Array.isArray(node))return node.map(expand);
  if(['PagedItems','CostReview','AnchoredReview'].includes(node.type?.name)){
   const key=node.type.name+':'+(node.props.label?node.props.label+':'+node.props.resetKey:node.key??'review'),parent=scope;
   usedScopes.add(key);if(!stores.has(key))stores.set(key,makeStore());scope=stores.get(key);scope.cursor=0;
   const result=node.type(node.props);scope=parent;return expand(result);
  }
  const value=node.props?.children;
  return value===undefined?node:{...node,props:{...node.props,children:Array.isArray(value)?value.map(expand):expand(value)}};
 };
 const render=()=>{let tree;for(let pass=0;pass<10;pass++){scope=root;root.cursor=0;pending=[];changed=false;tree=section==='creation'?module.exports.ContentProduction({content:contentState.content}):module.exports.ProductionWorkspace({section});if(hookCount!==undefined)assert.equal(root.cursor,hookCount,'hooks stay unconditional across loading, filters, dialogs and pages');hookCount=root.cursor;usedScopes=new Set();tree=expand(tree);for(const key of stores.keys())if(!usedScopes.has(key))stores.delete(key);pending.forEach(setup=>setup());if(!changed)return tree;}throw Error('Render did not settle');};
 return{render,calls,snapshot,creation,contentState,setSearch(value){searchOverride=value;},async ready(){render();await nextTurn();return render();},refresh:async()=>{listeners.get('nova-workspace-refresh')?.();render();await nextTurn();return render();}};
}

for(const section of sections){
 test(`${section}: every item is reachable once, including the final page`,async()=>{
  const f=fixture(section),tree=await f.ready();
  assert.equal(cards(tree).length,20,'the first page must be bounded');assert.equal(pager(tree).props.total,121);assert.equal(pager(tree).props.pageSize,20);
  const seen=[];for(let page=1;page<=7;page++){pager(f.render()).props.onPageChange(page);seen.push(...ids(f.render()));}
  const prefix={accounts:'a',reports:'r',tasks:'t'}[section];
  assert.equal(seen.length,121);assert.equal(new Set(seen).size,121);
  assert.equal(seen[0],prefix+(section==='tasks'?'121':'001'));assert.equal(seen.at(-1),prefix+(section==='tasks'?'001':'121'));
  assert.equal(all(tree,node=>node.type?.name==='JinchengSourceStatus').length,0);
 });
 test(`${section}: empty and single results retain size controls and 20→50→100→20 resets the page`,async()=>{
  for(const count of [0,1,121]){
   const f=fixture(section,count);let tree=await f.ready();assert.ok(pager(tree));
   for(const size of [50,100,20]){if(count===121){pager(tree).props.onPageChange(2);tree=f.render();}pager(tree).props.onPageSizeChange(size);tree=f.render();assert.equal(pager(tree).props.page,1);assert.equal(pager(tree).props.pageSize,size);assert.equal(cards(tree).length,Math.min(size,count));}
  }
 });
 test(`${section}: query filters all source rows before paging and resets page one`,async()=>{
  const f=fixture(section);let tree=await f.ready();pager(tree).props.onPageChange(4);tree=change(f,'搜索标题、账号或正文','0');
  assert.equal(pager(tree).props.page,1);assert.equal(pager(tree).props.total,111);assert.equal(cards(tree).length,20);
  tree=change(f,'搜索标题、账号或正文','121');assert.deepEqual(ids(tree),[{accounts:'a121',reports:'r121',tasks:'t121'}[section]]);
  tree=change(f,'搜索标题、账号或正文','无匹配结果');assert.equal(pager(tree).props.total,0);assert.equal(cards(tree).length,0);
 });
 test(`${section}: refresh removing the final page clamps results without mutating remaining data`,async()=>{
  const f=fixture(section);let tree=await f.ready();pager(tree).props.onPageChange(7);tree=f.render();assert.equal(cards(tree).length,1);
  f.snapshot[section].splice(3);const before=JSON.stringify(f.snapshot[section]);tree=await f.refresh();
  assert.equal(pager(tree).props.page,1);assert.equal(pager(tree).props.total,3);assert.equal(cards(tree).length,3);assert.equal(JSON.stringify(f.snapshot[section]),before);
 });
}

test('account platform and report type/date combine before paging and each change returns to page one',async()=>{
 const a=fixture('accounts');let tree=await a.ready();pager(tree).props.onPageChange(3);tree=change(a,'筛选平台','小红书');assert.equal(pager(tree).props.total,60);assert.equal(pager(tree).props.page,1);assert.equal(ids(tree)[0],'a002');
 pager(tree).props.onPageChange(2);tree=change(a,'搜索标题、账号或正文','标签 120');assert.deepEqual(ids(tree),['a120']);
 const r=fixture('reports');tree=await r.ready();pager(tree).props.onPageChange(3);tree=change(r,'筛选报告类型','调研');assert.equal(pager(tree).props.total,61);assert.equal(pager(tree).props.page,1);
 pager(tree).props.onPageChange(2);tree=change(r,'报告起始日期','2026-10-15');assert.equal(pager(tree).props.total,61);assert.equal(pager(tree).props.page,1);
 tree=change(r,'筛选报告类型','复盘');assert.equal(pager(tree).props.total,0);assert.equal(cards(tree).length,0);
});

test('paged account and report actions retain their record IDs and complete author details',async()=>{
 for(const section of ['accounts','reports']){
  const f=fixture(section);let tree=await f.ready();pager(tree).props.onPageChange(2);tree=f.render();const card=cards(tree)[0],id=section==='accounts'?'a021':'r021';
  button(card,section==='accounts'?'主页':'继续阅读').props.onClick();await nextTurn();assert.deepEqual(f.calls.find(([method])=>method==='openProductionLink')?.[1],{kind:section==='accounts'?'account':'report',id});
  button(cards(f.render())[0],section==='accounts'?'查看完整账号资料':'查看详情').props.onClick();tree=f.render();const detail=all(tree,node=>node.type?.name==='ProductionRecordDetails')[0];assert.equal(detail.props.title,section==='accounts'?'账号 021':'报告 021');
  if(section==='accounts')assert.equal(all(detail,node=>node.type?.name==='DocumentMarkdown')[0].props.text,'作者完整备注 021');
 }
});

test('paged tasks open and cancel their own fixed request, and research cancel retains entered text',async()=>{
 const f=fixture('tasks');let tree=await f.ready();pager(tree).props.onPageChange(2);tree=f.render();assert.equal(ids(tree)[0],'t101');const fixed=JSON.stringify(f.snapshot.tasks[100].request);
 button(cards(tree)[0],'打开助手').props.onClick();await nextTurn();assert.deepEqual(f.calls.find(([method])=>method==='openProductionTask')?.[1],{taskId:'t101'});
 button(cards(f.render())[0],'查看详情').props.onClick();tree=f.render();button(all(tree,node=>node.type?.name==='ProductionRecordDetails')[0],'取消任务').props.onClick();await nextTurn();assert.deepEqual(f.calls.find(([method])=>method==='actProductionTask')?.[1],{taskId:'t101',action:'cancel'});assert.equal(JSON.stringify(f.snapshot.tasks[100].request),fixed);
 button(f.render(),'新建调研').props.onClick();tree=f.render();all(tree,node=>node.props?.id==='production-research-prompt')[0].props.onChange('保留作者研究要求');tree=f.render();button(tree,'取消').props.onClick();tree=f.render();assert.ok(all(tree,node=>node.props?.className==='production-retained-draft')[0]);button(tree,'新建调研').props.onClick();tree=f.render();assert.equal(all(tree,node=>node.props?.id==='production-research-prompt')[0].props.value,'保留作者研究要求');
});

const labelledPager=(tree,label)=>all(tree,node=>node.type?.name==='PaginationBar'&&node.props.label===label)[0];
test('account edit screenshots page without renumbering, deleting or saving unrelated author images',async()=>{
 const f=fixture('accounts',1);f.snapshot.accounts[0].images=Array.from({length:41},(_,i)=>'image'+(i+1));let tree=await f.ready();button(cards(tree)[0],'编辑').props.onClick();tree=f.render();
 assert.equal(all(tree,node=>node.type==='figure').length,20,'edit screenshots must have bounded pages');
 const page=labelledPager(tree,'账号编辑截图分页');assert.equal(page.props.total,41);page.props.onPageChange(3);tree=f.render();
 const figure=all(tree,node=>node.type==='figure')[0];assert.equal(all(figure,node=>node.type==='figcaption')[0].props.children.join(''),'截图 41');button(figure,'移除').props.onClick();tree=f.render();
 assert.equal(labelledPager(tree,'账号编辑截图分页').props.total,40);assert.equal(labelledPager(tree,'账号编辑截图分页').props.page,2);
 all(tree,node=>node.type==='form')[0].props.onSubmit({preventDefault(){}});await nextTurn();const input=f.calls.find(([method])=>method==='mutateProduction')?.[1].input;assert.equal(input.images.length,40);assert.equal(input.images[0],'image1');assert.equal(input.images.at(-1),'image40');assert.equal(input.note,'作者完整备注 001');
});

test('account detail screenshots and linked reports page independently and preserve the final report ID',async()=>{
 const f=fixture('accounts',41);f.snapshot.accounts[0].images=Array.from({length:41},(_,i)=>'image'+(i+1));for(const report of f.snapshot.reports)report.accountIds=['a001'];let tree=await f.ready();all(cards(tree)[0],node=>node.props?.className==='production-details-button')[0].props.onClick();tree=f.render();
 assert.equal(all(tree,node=>node.type==='figure').length,20,'detail screenshots must have bounded pages');
 labelledPager(tree,'账号截图分页').props.onPageChange(3);labelledPager(tree,'关联报告分页').props.onPageChange(3);tree=f.render();
 assert.equal(all(tree,node=>node.type==='figure').length,1);assert.equal(labelledPager(tree,'关联报告分页').props.total,41);button(tree,'正文 041 ↗').props.onClick();await nextTurn();assert.deepEqual(f.calls.find(([method])=>method==='openProductionLink')?.[1],{kind:'report',id:'r041',pageId:'page041'});
});

test('report detail pages reach the final original page ID',async()=>{
 const f=fixture('reports',1);f.snapshot.reports[0].pages=Array.from({length:41},(_,i)=>({id:'page'+(i+1),title:'正文 '+(i+1),assetHash:'hash'+i}));let tree=await f.ready();button(cards(tree)[0],'查看详情').props.onClick();tree=f.render();
 assert.equal(all(tree,node=>node.props?.onClick&&children(node).some(child=>typeof child==='string'&&child.startsWith('正文 '))).length,20,'report page entries must have bounded pages');labelledPager(tree,'报告页面分页').props.onPageChange(3);tree=f.render();button(tree,'正文 41 ↗').props.onClick();await nextTurn();assert.deepEqual(f.calls.find(([method])=>method==='openProductionLink')?.[1],{kind:'report',id:'r001',pageId:'page41'});
});

test('creation reference edits retain the full draft while paging, deleting the final reference and saving',async()=>{
 const f=fixture('creation',0);let tree=await f.ready();assert.equal(all(tree,node=>node.props?.className==='production-reference').length,20,'reference editors must have bounded pages');
 all(tree,node=>node.props?.id==='reference-original-ref001')[0].props.onChange('作者手改第一页');tree=f.render();labelledPager(tree,'参考资料分页').props.onPageChange(3);tree=f.render();
 const last=all(tree,node=>node.props?.className==='production-reference')[0];assert.equal(children(all(last,node=>node.type==='summary')[0]).join(''),'41. 参考 041');
 all(tree,node=>node.props?.id==='reference-corrected-ref041')[0].props.onChange('作者手改末页');tree=f.render();button(all(tree,node=>node.props?.className==='production-reference')[0],'移除本条参考').props.onClick();tree=f.render();assert.equal(labelledPager(tree,'参考资料分页').props.page,2);assert.equal(labelledPager(tree,'参考资料分页').props.total,40);
 button(tree,'保存创作资料').props.onClick();await nextTurn();const refs=f.calls.find(([method])=>method==='saveProductionDraft')?.[1].creationPatch.references;assert.equal(refs.length,40);assert.equal(refs[0].originalText,'作者手改第一页');assert.equal(refs[20].id,'ref021');assert.equal(refs.at(-1).id,'ref040');
});

test('packaging full reading pages preserve all searchable selection options',async()=>{
 const f=fixture('creation',0);let tree=await f.ready();const section=all(tree,node=>node.props?.className==='production-packaging')[0];assert.equal(all(section,node=>node.type==='p'&&node.props.className==='production-prewrap').length,20,'full candidate reading must have bounded pages');assert.equal(all(control(tree,'标题候选'),node=>node.type==='option').length,42);
 labelledPager(tree,'标题候选分页').props.onPageChange(3);tree=f.render();assert.equal(all(tree,node=>node.type==='p'&&node.props.children==='标题候选 041').length,1);control(tree,'标题候选').props.onChange('title041');tree=f.render();assert.equal(control(tree,'标题候选').props.value,'title041');assert.equal(all(tree,node=>node.props?.id==='packaging-titles-title041')[0].props.value,'标题候选 041');
});

test('creation history filters before paging and keeps the server truncation notice',async()=>{
 const f=fixture('creation',0);let tree=await f.ready();const history=all(tree,node=>node.props?.title==='创作版本与改稿日志')[0];assert.equal(all(history,node=>node.props?.className==='production-artifact').length,20,'history entries must have bounded pages');labelledPager(tree,'创作版本分页').props.onPageChange(3);tree=f.render();assert.equal(all(tree,node=>node.props?.className==='production-artifact'&&node.key==='version041').length,1);
 tree=change(f,'搜索创作版本','unique 041');assert.equal(labelledPager(tree,'创作版本分页').props.total,1);assert.equal(labelledPager(tree,'创作版本分页').props.page,1);assert.equal(all(tree,node=>node.type==='p'&&children(node).some(child=>typeof child==='string'&&child.includes('历史已按读取上限截断'))).length,1);
});

test('task result and cost pagination retains the evidence draft when a cost editor is unmounted',async()=>{
 const f=fixture('tasks',1),task=f.snapshot.tasks[0],attempt=task.attempts[0];attempt.status='submitted';attempt.result={summary:'真实产物',artifacts:Array.from({length:41},(_,i)=>({id:'artifact'+pad(i+1),title:'产物 '+pad(i+1),kind:'knowledge',text:'完整产物 '+pad(i+1),assetHash:null,data:null}))};attempt.receipt={taskId:task.id,attemptId:attempt.id,requestHash:task.requestHash,sha256:'receipt',resultHash:'result'};
 f.snapshot.costs=Array.from({length:41},(_,i)=>({id:'cost'+pad(i+1),taskId:task.id,attemptId:attempt.id,requestId:'request'+i,service:'采集',status:'unknown',amount:null,currency:'REQ',usage:null,createdAt:'2026-10-01',updatedAt:'2026-10-01'}));let tree=await f.ready();button(cards(tree)[0],'查看详情').props.onClick();tree=f.render();
 assert.equal(all(tree,node=>node.type==='article'&&node.props.className==='production-artifact').length,40,'task artifacts and cost rows must both have bounded pages');button(tree,'人工核验此笔请求').props.onClick();tree=f.render();all(tree,node=>node.props?.id==='cost-evidence-cost001')[0].props.onChange('作者正在核验的账单依据');tree=f.render();labelledPager(tree,'任务费用分页').props.onPageChange(3);labelledPager(tree,'任务产物分页').props.onPageChange(3);tree=f.render();assert.equal(all(tree,node=>node.type==='h3'&&node.props.children==='产物 041').length,1);all(tree,node=>node.type?.name==='ProductionRecordDetails')[0].props.close();tree=f.render();assert.equal(all(tree,node=>node.type?.name==='ProductionRecordDetails').length,1,'a hidden-page evidence draft still blocks detail dismissal');labelledPager(tree,'任务费用分页').props.onPageChange(1);tree=f.render();assert.equal(all(tree,node=>node.props?.id==='cost-evidence-cost001')[0].props.value,'作者正在核验的账单依据');all(tree,node=>node.type==='form')[0].props.onSubmit({preventDefault(){}});await nextTurn();const input=f.calls.find(([method])=>method==='mutateProduction')?.[1].input;assert.equal(input.id,'cost001');assert.equal(input.usage.evidence,'作者正在核验的账单依据');
});

test('creation returned tasks and accepted artifacts each keep the final candidate reachable',async()=>{
 for(const workflow of [true,false]){
  const f=fixture('creation',41);for(const task of f.snapshot.tasks){task.contentId='content';task.request.parameters=workflow?{workflow:'content-creation'}:{};const attempt=task.attempts[0];attempt.status=workflow?'rejected':'accepted';attempt.result={summary:'结果',artifacts:[{id:'artifact'+task.id,title:'候选 '+task.id,kind:'analysis',text:'完整候选',data:null,assetHash:null}]};attempt.receipt={taskId:task.id,attemptId:attempt.id,requestHash:task.requestHash,sha256:'receipt',resultHash:'result'};}
  let tree=await f.ready();const nodes=workflow?all(tree,node=>node.props?.title==='本次结果已拒绝'):all(all(tree,node=>node.props?.title==='已验收的助手候选')[0],node=>node.props?.className==='production-artifact');assert.equal(nodes.length,20,'candidate reading must have bounded pages');const label=workflow?'整篇结果分页':'已验收助手候选分页';labelledPager(tree,label).props.onPageChange(3);tree=f.render();assert.equal(labelledPager(tree,label).props.total,41);assert.equal(workflow?all(tree,node=>node.props?.title==='本次结果已拒绝').length:all(all(tree,node=>node.props?.title==='已验收的助手候选')[0],node=>node.props?.className==='production-artifact').length,1);
 }
});

test('processed review history pages independently while active annotations stay beside the complete author body',async()=>{
 const f=fixture('creation',0);f.creation.suggestions=Array.from({length:41},(_,i)=>({id:'suggestion'+i,bodyHash:'body-hash',quote:'旧句 '+i,replacement:'建议 '+i,reason:'原因',status:'rejected'}));f.creation.annotations=Array.from({length:41},(_,i)=>({id:'annotation'+i,bodyHash:'body-hash',quote:'批注原句 '+i,text:'批注 '+i,status:'resolved'}));f.creation.annotations.push({id:'active',bodyHash:'body-hash',quote:'完整作者正文。',text:'仍待作者确认',status:'open'});let tree=await f.ready();const review=all(tree,node=>node.props?.title==='贴着原文审稿')[0];assert.equal(all(review,node=>node.type==='details').length,40,'processed suggestions and annotations must each have bounded pages');assert.equal(all(review,node=>node.props?.className?.split(' ').includes('production-review-note')).length,1);labelledPager(tree,'已处理建议分页').props.onPageChange(3);labelledPager(tree,'已处理批注分页').props.onPageChange(3);tree=f.render();const current=all(tree,node=>node.props?.title==='贴着原文审稿')[0];assert.equal(all(current,node=>node.type==='details').length,2);assert.equal(all(current,node=>node.props?.className?.split(' ').includes('production-review-note')).length,1);assert.equal(f.contentState.content.body,'完整作者正文。');
});

test('actual workspace connects existing-record management to original ids, snapshot tokens and lifecycle IPC',async()=>{
 const f=fixture('reports',2);let tree=await f.ready();button(tree,'管理与回收').props.onClick();tree=f.render();const manager=all(tree,n=>n.type?.name==='ProductionRecordManagement')[0];assert.ok(manager);assert.equal(manager.props.records.length,2);assert.equal(manager.props.records[0].canManage,true);assert.equal(manager.props.identityKey,'fixture-library');
 await manager.props.onRestore('r001','original-token');await manager.props.onTrash('r002','original-token');await manager.props.onSave({id:'r001',title:'本人改题',type:'调研',accountIds:['a001','a002'],sourceUrl:null,collectedAt:null,meta:{unknown:'保留'},pages:f.snapshot.reports[0].pages,pageId:'page001'},'original-token');
 const writes=f.calls.filter(c=>c[0]==='mutateProduction').map(c=>c[1]);assert.deepEqual(writes.map(w=>w.op),['restoreReport','trashReport','saveReport']);assert.equal(writes[0].input.id,'r001');assert.equal(writes[2].input.expectedToken,'original-token');assert.deepEqual(writes[2].input.accountIds,['a001','a002']);assert.deepEqual(writes[2].input.meta,{unknown:'保留'});assert.equal(all(tree,n=>n.type==='h1').length,0,'redundant workspace heading removed');
});

test('actual report view shows body hit snippets and partial retry while withholding false no-match text',async()=>{
 const f=fixture('reports',1);let tree=await f.ready();let resumed=0;f.setSearch({result:{hits:[{reportId:'r001',fields:['body'],snippets:[{field:'body',text:'第二页正文独有词',pageId:'page001'}]}],status:'partial',pendingPages:0,unreadablePages:1,cursor:'opaque',issues:[{reportId:'r001',pageId:'page001',message:'原件暂不可读'}],snapshotKey:'partial'},working:false,error:'',continueSearch(){resumed++;},restart(){}});tree=change(f,'搜索标题、账号或正文','正文独有词');const rendered=all(tree,()=>true).flatMap(n=>children(n).filter(c=>typeof c==='string')).join(' ');assert.ok(rendered.includes('当前结果仅为已核验部分'));assert.ok(rendered.includes('第二页正文独有词'));assert.ok(rendered.includes('原件暂不可读'));assert.ok(!rendered.includes('没有匹配报告'));button(tree,'重试不可读页面').props.onClick();assert.equal(resumed,1);assert.equal(cards(tree).length,1);
});
