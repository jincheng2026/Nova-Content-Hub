import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../package.json',import.meta.url)),React=require('react');
const {rolldown}=await import(require.resolve('rolldown'));
const bundle=await rolldown({input:new URL('../src/renderer/author-planning-status.tsx',import.meta.url).pathname,external:id=>!id.endsWith('/author-planning-status.tsx')});
const generated=await bundle.generate({format:'cjs'});await bundle.close();const code=generated.output.find(i=>i.type==='chunk').code;
const children=n=>[n?.props?.children].flat(Infinity).filter(Boolean),all=(n,p)=>!n||typeof n!=='object'?[]:[...(p(n)?[n]:[]),...children(n).flatMap(c=>all(c,p))];
const text=n=>children(n).map(c=>typeof c==='string'?c:text(c)).join('');
const button=(tree,label)=>all(tree,n=>!!n.props?.onClick&&text(n)===label)[0],control=(tree,label)=>all(tree,n=>n.props?.['aria-label']===label&&typeof n.props?.onChange==='function')[0];
function fixture(){
 const states=[],refs=[],effects=[];let at=0,pending=[];
 const value={contentId:'content-a',work:{vaultId:'vault-a',workId:'T050'},relativePath:'05_内容草稿/T050_选题/作者安排.json',revision:'a'.repeat(64),status:null,reason:'',sourcePins:[{documentId:'doc-a',relativePath:'04_选题库/T050.md',hash:'b'.repeat(64)}],decisionSourcePins:null,stale:false,derivedStatus:'todo',effectiveStatus:'todo',sourceStatus:'待写',facts:{hasDraft:false,recorded:false,published:false,paused:false},updatedAt:null,history:[],notice:''};
 const calls=[],props={identityKey:'vault-a',value,busy:false,onSave:async input=>{calls.push(input);return {...props.value,status:input.status,reason:input.reason};},onChanged:async()=>{}};
 const module={exports:{}};vm.runInNewContext(code,{module,exports:module.exports,require:id=>{
  if(id==='react')return {...React,useState(initial){const i=at++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return[states[i],v=>states[i]=typeof v==='function'?v(states[i]):v];},useRef(initial){const i=at++;return refs[i]??={current:initial};},useEffect(setup,deps){const i=at++;if(!effects[i]||deps?.some((d,j)=>d!==effects[i].deps[j]))pending.push(()=>{effects[i]?.cleanup?.();effects[i]={deps,cleanup:setup()};});}};
  if(id==='react/jsx-runtime')return require(id);if(id.endsWith('paged-items.tsx'))return{PagedItems:function PagedItems(){}};if(id.endsWith('semi-controls.tsx'))return{PopupSelect:function PopupSelect(){}};return function UIControl(){};
 }});
 return{props,calls,render(){let tree;for(let i=0;i<2;i++){at=0;pending=[];tree=module.exports.AuthorPlanningStatusEditor(props);if(!pending.length)return tree;pending.forEach(f=>f());}return tree;}};
}
test('opening and reading does not mutate; explicit written retains separate manuscript/recording/publication facts',()=>{
 const f=fixture();f.props.value={...f.props.value,status:'written',effectiveStatus:'written',notice:'本人标记已写；尚未找到稿件'};
 let tree=f.render();assert.ok(text(tree).includes('本人标记已写'));assert.ok(text(tree).includes('尚未找到稿件'));assert.equal(f.calls.length,0);
 f.props.value={...f.props.value,status:'paused',effectiveStatus:'paused',facts:{hasDraft:true,recorded:true,published:true,paused:false}};tree=f.render();assert.ok(text(tree).includes('已录制'));assert.ok(text(tree).includes('已发布'));assert.ok(text(tree).includes('暂缓'));
});
test('save failure retains selected enum and explanation and submits only native identity/CAS/pins',async()=>{
 const f=fixture();f.props.onSave=async input=>{f.calls.push(input);throw {code:'CONFLICT',message:'作者安排版本冲突'};};button(f.render(),'修改作者安排').props.onClick();
 control(f.render(),'作者安排').props.onChange('written');control(f.render(),'安排说明').props.onChange('作者手改说明');await button(f.render(),'保存作者安排').props.onClick();
 let tree=f.render();assert.equal(control(tree,'作者安排').props.value,'written');assert.equal(control(tree,'安排说明').props.value,'作者手改说明');assert.ok(text(tree).includes('版本冲突'));
 assert.deepEqual(JSON.parse(JSON.stringify(f.calls[0])),{contentId:'content-a',status:'written',reason:'作者手改说明',expectedRevision:'a'.repeat(64),sourcePins:f.props.value.sourcePins});
});
test('a new source/revision never silently replaces the author draft baseline',async()=>{
 const f=fixture();button(f.render(),'修改作者安排').props.onClick();control(f.render(),'作者安排').props.onChange('paused');control(f.render(),'安排说明').props.onChange('保留本人解释');
 f.props.value={...f.props.value,revision:'c'.repeat(64),sourcePins:[{...f.props.value.sourcePins[0],hash:'d'.repeat(64)}]};let tree=f.render();assert.equal(control(tree,'安排说明').props.value,'保留本人解释');assert.equal(button(tree,'保存作者安排').props.disabled,true);
 button(tree,'已核对当前来源，保留本次选择').props.onClick();await button(f.render(),'保存作者安排').props.onClick();assert.equal(f.calls[0].expectedRevision,'c'.repeat(64));assert.equal(f.calls[0].sourcePins[0].hash,'d'.repeat(64));assert.equal(f.calls[0].status,'paused');
});
test('stale decisions need an explicit source review and clear uses null',async()=>{
 const f=fixture();f.props.value={...f.props.value,status:'paused',stale:true,decisionSourcePins:[{...f.props.value.sourcePins[0],hash:'e'.repeat(64)}]};button(f.render(),'修改作者安排').props.onClick();let tree=f.render();assert.equal(button(tree,'保存作者安排').props.disabled,true);assert.ok(text(tree).includes('来源已变化，待核对'));
 button(tree,'已核对当前来源，保留本次选择').props.onClick();control(f.render(),'作者安排').props.onChange('source');await button(f.render(),'保存作者安排').props.onClick();assert.equal(f.calls[0].status,null);
});
test('source read failure renders unavailable without inventing todo or a writable form',()=>{
 const f=fixture();f.props.value=null;f.props.error='来源暂时不可读';const tree=f.render();assert.ok(text(tree).includes('来源暂时不可读'));assert.ok(!text(tree).includes('待做'));assert.equal(button(tree,'修改作者安排'),undefined);
});
test('switching work identity discards a late completion without updating the new work',async()=>{
 const f=fixture();let complete,changed=0;f.props.onSave=()=>new Promise(resolve=>{complete=resolve;});f.props.onChanged=async()=>{changed++;};button(f.render(),'修改作者安排').props.onClick();control(f.render(),'作者安排').props.onChange('written');const pending=button(f.render(),'保存作者安排').props.onClick();f.props.identityKey='vault-b';f.props.value={...f.props.value,contentId:'content-b'};f.render();complete({});await pending;assert.equal(changed,0);assert.ok(!text(f.render()).includes('作者安排已保存'));
});
