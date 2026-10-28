import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../package.json',import.meta.url)),React=require('react'),{rolldown}=await import(require.resolve('rolldown'));
const bundle=await rolldown({input:new URL('../src/renderer/production-record-management.tsx',import.meta.url).pathname,external:id=>!id.endsWith('/production-record-management.tsx')});const generated=await bundle.generate({format:'cjs'});await bundle.close();const code=generated.output.find(i=>i.type==='chunk').code;
const children=n=>[n?.props?.children].flat(Infinity).filter(Boolean),all=(n,p)=>!n||typeof n!=='object'?[]:[...(p(n)?[n]:[]),...children(n).flatMap(c=>all(c,p))],text=n=>children(n).map(c=>typeof c==='string'?c:text(c)).join('');
const plain=value=>JSON.parse(JSON.stringify(value));
const button=(tree,label)=>all(tree,n=>(!!n.props?.onClick||n.props?.htmlType==='submit')&&text(n)===label)[0],control=(tree,label)=>all(tree,n=>n.props?.['aria-label']===label&&typeof n.props?.onChange==='function')[0],table=tree=>all(tree,n=>n.type?.name==='DataTable')[0];
const at='2026-10-28T00:00:00.000Z';
const account=id=>({id,name:'账号 '+id,platform:'抖音',url:'https://example.test/'+id,note:'完整备注',tags:['原标签，含逗号'],images:['original-image'],avatarAssetHash:'original-avatar',reportIds:['r'],createdAt:at,updatedAt:at,deletedAt:null});
const report=id=>({id,title:'报告 '+id,type:'调研',accountIds:['a','b'],sourceUrl:'https://example.test/source',collectedAt:at,pages:[{id:'p1',title:'第一页',assetHash:'first-hash'},{id:'p2',title:'第二页',assetHash:'second-hash'}],pageId:'p2',meta:{nested:{unknown:[1,'原样']},author:'本人'},createdAt:at,updatedAt:at,deletedAt:null});
function fixture(component='editor',kind='report'){
 const states=[],refs=[],effects=[];let cursor=0,pending=[];const calls=[];
 const entry={kind,record:kind==='report'?report('r'):account('a'),canManage:true};
 const props={identityKey:'library-a',record:entry,records:[entry],snapshotToken:'token-1',open:true,busy:false,accounts:[account('a'),account('b')],onSave:async(input,token)=>{calls.push(['save',input,token]);},onTrash:async(id,token)=>{calls.push(['trash',id,token]);},onRestore:async(id,token)=>{calls.push(['restore',id,token]);},onChanged:async()=>{},close:()=>{props.open=false;}};
 const module={exports:{}};vm.runInNewContext(code,{module,exports:module.exports,structuredClone,require:id=>{
  if(id==='react')return {...React,useState(initial){const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return[states[i],v=>states[i]=typeof v==='function'?v(states[i]):v];},useRef(initial){const i=cursor++;return refs[i]??={current:initial};},useMemo(fn){cursor++;return fn();},useEffect(setup,deps){const i=cursor++;if(!effects[i]||deps?.some((d,j)=>d!==effects[i].deps[j]))pending.push(()=>{effects[i]?.cleanup?.();effects[i]={deps,cleanup:setup()};});}};
  if(id==='react/jsx-runtime')return require(id);if(id.endsWith('list-primitives.tsx'))return{DataTable:function DataTable(){},ListToolbar:function ListToolbar(){}};if(id.endsWith('semi-controls.tsx'))return{PopupSelect:function PopupSelect(){},PopupMultiSelect:function PopupMultiSelect(){},PopupCreatableSelect:function PopupCreatableSelect(){}};if(id.endsWith('library-panels.tsx'))return{useManagedDraftGuard(){}};return function UIControl(){};
 }});
 return{props,calls,render(){let tree;for(let pass=0;pass<3;pass++){cursor=0;pending=[];tree=module.exports[component==='editor'?'ProductionRecordEditor':'ProductionRecordManagement'](props);if(!pending.length)return tree;pending.forEach(f=>f());}return tree;}};
}
const submit=tree=>all(tree,n=>n.type==='form')[0].props.onSubmit({preventDefault(){}});
test('manual Markdown edits preserve report id, all accounts and arbitrary metadata verbatim',async()=>{
 const f=fixture();f.props.record.record.meta.manualMarkdown='# 原稿\n\n本人  空格与换行\n';f.props.record.verifiedMarkdown=f.props.record.record.meta.manualMarkdown;let tree=f.render();assert.equal(control(tree,'报告正文').props.value,'# 原稿\n\n本人  空格与换行\n');control(tree,'报告标题').props.onChange('本人修改标题');await submit(f.render());
 const [,input,token]=f.calls[0];assert.equal(input.id,'r');assert.deepEqual(plain(input.accountIds),['a','b']);assert.deepEqual(input.meta,f.props.record.record.meta);assert.equal(input.markdown,'# 原稿\n\n本人  空格与换行\n');assert.equal('pages' in input,false);assert.equal(token,'token-1');
});
test('HTML replacement changes only the explicitly selected page and retains reading position',async()=>{
 const f=fixture();f.props.chooseReportPage=async(reportId,pageId)=>{assert.equal(reportId,'r');assert.equal(pageId,'p1');return{assetHash:'replacement-hash'};};let tree=f.render();control(tree,'替换页面').props.onChange('p1');await button(f.render(),'替换选定页').props.onClick();await submit(f.render());
 const input=f.calls[0][1];assert.deepEqual(plain(input.pages),[{id:'p1',title:'第一页',assetHash:'replacement-hash'},{id:'p2',title:'第二页',assetHash:'second-hash'}]);assert.equal(input.pageId,'p2');assert.deepEqual(input.meta,f.props.record.record.meta);assert.equal('markdown' in input,false);
});
test('failed saves and cancelling retain author input; unchanged records use the latest snapshot token',async()=>{
 const f=fixture('editor','account');f.props.onSave=async(input,token)=>{f.calls.push(['save',input,token]);throw {message:'真实保存错误'};};control(f.render(),'账号名称').props.onChange('本人尚未保存');f.props.snapshotToken='token-2';await submit(f.render());let tree=f.render();assert.ok(text(tree).includes('真实保存错误'));assert.equal(control(tree,'账号名称').props.value,'本人尚未保存');assert.equal(f.calls[0][2],'token-2');assert.deepEqual(plain(f.calls[0][1].tags),['原标签，含逗号']);assert.deepEqual(plain(f.calls[0][1].images),['original-image']);assert.equal(f.calls[0][1].avatarAssetHash,'original-avatar');
 button(tree,'收起并保留').props.onClick();assert.equal(f.render(),null);f.props.open=true;assert.equal(control(f.render(),'账号名称').props.value,'本人尚未保存');
});
test('an external record revision blocks overwrite while retaining the draft',async()=>{
 const f=fixture();control(f.render(),'报告标题').props.onChange('本人草稿');f.props.record={...f.props.record,record:{...f.props.record.record,title:'外部修改'}};f.props.snapshotToken='token-2';const tree=f.render();assert.equal(control(tree,'报告标题').props.value,'本人草稿');assert.equal(button(tree,'保存修改').props.disabled,true);assert.ok(text(tree).includes('已变化'));
 button(tree,'载入当前记录').props.onClick();assert.equal(control(f.render(),'报告标题').props.value,'本人草稿');button(f.render(),'确认放弃填写并载入').props.onClick();assert.equal(control(f.render(),'报告标题').props.value,'外部修改');assert.equal(button(f.render(),'保存修改').props.disabled,false);
});
test('registered projections and task/radar reports expose no writable editor',()=>{
 for(const meta of [{vault:{sourceId:'linked'}},{taskId:'controlled-task'},{radar:{receiptHash:'real'}}]){const f=fixture();f.props.record.record.meta=meta;assert.equal(button(f.render(),'保存修改'),undefined);assert.equal(f.calls.length,0);}
});
test('normal/trash lists filter before 20/50/100 paging and require a concrete danger confirmation',async()=>{
 const f=fixture('list');f.props.records=Array.from({length:121},(_,i)=>({kind:'report',record:report('r'+i),canManage:true}));let tree=f.render(),t=table(tree);assert.equal(t.props.rows.length,20);t.props.onPageChange(7);tree=f.render();t=table(tree);assert.equal(t.props.rows.length,1);
 for(const size of [50,100,20]){t.props.onPageSizeChange(size);t=table(f.render());assert.equal(t.props.page,1);assert.equal(t.props.rows.length,size);}
 t.props.onPageChange(7);t=table(f.render());const actions=t.props.columns.find(c=>c.key==='actions').render(null,t.props.rows[0]);button(actions,'移入回收区').props.onClick();assert.equal(f.calls.length,0);await button(f.render(),'确认移入回收区').props.onClick();assert.deepEqual(f.calls[0],['trash','r120','token-1']);
 f.props.records[120].record.deletedAt=at;t=table(f.render());assert.equal(t.props.page,6);assert.equal(t.props.rows.length,20);control(f.render(),'资料范围').props.onChange('trash');t=table(f.render());assert.equal(t.props.total,1);const recovery=t.props.columns.find(c=>c.key==='actions').render(null,t.props.rows[0]);await button(recovery,'恢复').props.onClick();assert.deepEqual(f.calls[1],['restore','r120','token-1']);
});
test('native-authorized Vault manual reports remain editable and do not drop source annotations',async()=>{const f=fixture();f.props.record.verifiedMarkdown='原文';f.props.record.record.meta={manualMarkdown:'原文',unknown:'保留',vault:{documentId:'managed',relativePath:'10_调研报告/手工.md',hash:'native-hash',status:'available',writable:true}};control(f.render(),'报告标题').props.onChange('更新手工报告');await submit(f.render());assert.equal(f.calls[0][1].meta.vault.hash,'native-hash');assert.equal(f.calls[0][1].markdown,'原文');});
test('author can explicitly discard a retained management draft without writing a record',()=>{const f=fixture();control(f.render(),'报告标题').props.onChange('未存草稿');button(f.render(),'放弃填写').props.onClick();assert.equal(f.render(),null);f.props.open=true;assert.equal(control(f.render(),'报告标题').props.value,'报告 r');assert.equal(f.calls.length,0);});
test('unverified Markdown metadata cannot replace registered HTML pages during a title edit',async()=>{for(const count of [1,2]){const f=fixture();f.props.record.record.pages=f.props.record.record.pages.slice(0,count);f.props.record.record.pageId=f.props.record.record.pages.at(-1).id;f.props.record.record.meta.manualMarkdown='陈旧元数据正文';control(f.render(),'报告标题').props.onChange('只改标题');await submit(f.render());const input=f.calls[0][1];assert.equal('markdown' in input,false);assert.deepEqual(plain(input.pages),f.props.record.record.pages);assert.equal(input.pageId,f.props.record.record.pageId);assert.equal(input.meta.manualMarkdown,'陈旧元数据正文');}});
