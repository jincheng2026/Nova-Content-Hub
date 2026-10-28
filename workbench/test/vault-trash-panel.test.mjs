import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../package.json',import.meta.url)),React=require('react');
const {rolldown}=await import(require.resolve('rolldown'));
const bundle=await rolldown({input:new URL('../src/renderer/vault-trash-panel.tsx',import.meta.url).pathname,external:id=>!id.endsWith('/vault-trash-panel.tsx')});
const generated=await bundle.generate({format:'cjs'});await bundle.close();
const code=generated.output.find(i=>i.type==='chunk').code;
const children=n=>[n?.props?.children].flat(Infinity).filter(Boolean);
const all=(n,p)=>!n||typeof n!=='object'?[]:[...(p(n)?[n]:[]),...children(n).flatMap(c=>all(c,p))];
const find=(tree,name)=>all(tree,n=>n.type?.name===name)[0];
const text=tree=>children(tree).map(n=>typeof n==='string'?n:text(n)).join('');
function fixture() {
 const states=[],refs=[],effects=[];let at=0,pending=[];
 const props={identityKey:'vault-a',entries:Array.from({length:121},(_,i)=>({trashId:'trash-'+i,documentId:'doc-'+i,title:'资料 '+i,relativePath:`02_内容素材/资料${i}.md`,section:i%2?'patterns':'materials',hash:'a'.repeat(64),deletedAt:null,restorable:true,issue:null})),busy:false,onRestore:async()=>{},onRestored:async()=>{}};
 const module={exports:{}};
 vm.runInNewContext(code,{module,exports:module.exports,require:id=>{
  if(id==='react')return {...React,useState(initial){const i=at++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return [states[i],v=>states[i]=typeof v==='function'?v(states[i]):v];},useRef(initial){const i=at++;return refs[i]??={current:initial};},useMemo(fn){at++;return fn();},useEffect(setup,deps){const i=at++;if(!effects[i]||deps?.some((d,j)=>d!==effects[i].deps[j]))pending.push(()=>{effects[i]?.cleanup?.();effects[i]={deps,cleanup:setup()};});}};
  if(id==='react/jsx-runtime')return require(id);
  if(id.endsWith('list-primitives.tsx'))return {DataTable:function DataTable(){},ListToolbar:function ListToolbar(){}};
  if(id.endsWith('semi-controls.tsx'))return {PopupSelect:function PopupSelect(){}};
  return function UIControl(){};
 }});
 return {props,render(){at=0;pending=[];const tree=module.exports.VaultTrashPanel(props);pending.forEach(f=>f());return tree;}};
}
test('trash searches the entire collection before 20/50/100 paging and category filtering',()=>{
 const f=fixture();let tree=f.render(),table=find(tree,'DataTable');assert.equal(table.props.rows.length,20);assert.equal(table.props.total,121);
 table.props.onPageChange(7);table=find(f.render(),'DataTable');assert.equal(table.props.rows[0].trashId,'trash-120');
 for(const size of [50,100,20]){table.props.onPageSizeChange(size);table=find(f.render(),'DataTable');assert.equal(table.props.page,1);assert.equal(table.props.rows.length,size);}
 find(f.render(),'ListToolbar').props.search.change('资料120.md');table=find(f.render(),'DataTable');assert.deepEqual(table.props.rows.map(r=>r.trashId),['trash-120']);
 find(f.render(),'ListToolbar').props.search.change('');find(f.render(),'PopupSelect').props.onChange('patterns');table=find(f.render(),'DataTable');assert.equal(table.props.total,60);
});
test('restore callback receives only receipt identity/hash; an error survives filtering',async()=>{
 const f=fixture(),calls=[];f.props.onRestore=async input=>{calls.push(input);throw Error('原路径被占用');};
 let tree=f.render(),table=find(tree,'DataTable'),actions=table.props.columns.find(c=>c.key==='actions').render(null,table.props.rows[0]);
 await all(actions,n=>n.props?.onClick)[0].props.onClick();tree=f.render();
 assert.equal(calls.length,1);assert.deepEqual(JSON.parse(JSON.stringify(calls[0])),{trashId:'trash-0',expectedHash:'a'.repeat(64)});
 assert.ok(text(tree).includes('原路径被占用'));
 find(tree,'ListToolbar').props.search.change('新筛选');assert.ok(text(f.render()).includes('原路径被占用'));
});
test('removing the final page clamps to existing entries and untrusted records cannot restore',()=>{
 const f=fixture();find(f.render(),'DataTable').props.onPageChange(7);f.props.entries=f.props.entries.slice(0,2);f.props.entries[0].restorable=false;f.props.entries[0].issue='原文件丢失';
 const table=find(f.render(),'DataTable');assert.equal(table.props.page,1);assert.equal(table.props.rows.length,2);
 const actions=table.props.columns.find(c=>c.key==='actions').render(null,table.props.rows[0]);assert.equal(all(actions,n=>n.props?.onClick)[0].props.disabled,true);
});
test('switching libraries ignores a late restore response and never refreshes the new library',async()=>{
 const f=fixture();let finish,refreshed=0;f.props.onRestore=()=>new Promise(resolve=>{finish=resolve;});f.props.onRestored=async()=>{refreshed++;};
 const table=find(f.render(),'DataTable'),actions=table.props.columns.find(c=>c.key==='actions').render(null,table.props.rows[0]);
 const pending=all(actions,n=>n.props?.onClick)[0].props.onClick();f.props.identityKey='vault-b';f.render();finish({});await pending;
 assert.equal(refreshed,0);assert.ok(!text(f.render()).includes('资料已恢复'));
});
