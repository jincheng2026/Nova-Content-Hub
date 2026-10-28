import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require = createRequire(new URL('../package.json', import.meta.url));
const React = require('react');
const {rolldown} = await import(require.resolve('rolldown'));
const chunks = {};
for (const name of ['library-panels', 'jincheng-stage-actions', 'jincheng-work-detail']) {
  const file = new URL(`../src/renderer/${name}.tsx`, import.meta.url).pathname;
  const bundle = await rolldown({input:file, external:id => id !== file});
  chunks[name] = (await bundle.generate({format:'cjs'})).output.find(item => item.type === 'chunk').code;
  await bundle.close();
}

// Run the real components, callbacks, guard registry and effect cleanup; only
// host controls and IPC are substituted, since this suite has no browser DOM.
function fixture({prior = false, fail = false, actions = ['writing'], initialAction = 'writing', detail = false} = {}) {
  const instances = new Map(), values = new Map(), calls = [], modules = {};
  let current, index, effects = [], nodes = [], ancestorsByNode = new Map(), live = new Set();
  const hooks = {...React,
    useState(initial) {const slot=index++, instance=current; if (!(slot in instance.slots)) instance.slots[slot]=typeof initial==='function'?initial():initial; return [instance.slots[slot], value => {instance.slots[slot]=typeof value==='function'?value(instance.slots[slot]):value;}];},
    useRef(initial) {const slot=index++; return current.slots[slot] ??= {current:initial};},
    useEffect(callback, deps) {const slot=index++, instance=current, old=instance.effects[slot]; if (!old || deps.some((value,i)=>!Object.is(value,old.deps[i]))) {instance.effects[slot]={deps, cleanup:old?.cleanup}; effects.push(()=>{instance.effects[slot].cleanup?.(); instance.effects[slot].cleanup=callback();});}},
    useContext(context) {return values.get(context) ?? context._currentValue;},
  };
  const control = tag => ({children,...props}) => React.createElement(tag,props,children);
  const invoke = async (name,input) => {calls.push({name,input}); if (name==='readVaultWorkContext') return null; if (name==='readProduction') return {tasks:prior?[{id:'original-task',contentId:'T051',title:actions.includes('synthesis')?'综合调研':'共创口播稿',request:{parameters:{workflow:'jincheng-stage',businessSkill:actions.includes('synthesis')?'jc-synthesis-research':'jc-content-writer'}},activeAttemptId:'attempt',attempts:[{id:'attempt',status:'waiting-user'}]}]:[]}; if (name==='openProductionTask' || name==='startProductionTask') {if (fail) throw new Error('启动失败，保留填写'); return {opened:true,message:'继续当前原任务'};} throw new Error(`Unexpected IPC: ${name}`);};
  for (const name of ['library-panels', 'jincheng-stage-actions', 'jincheng-work-detail']) {
    const module = {exports:{}};
    vm.runInNewContext(chunks[name], {module,exports:module.exports,Intl,Set,Symbol,TextEncoder,setTimeout,clearTimeout,window:{addEventListener(){},removeEventListener(){}},require:id => {
      if (id==='react') return hooks;
      if (id==='react/jsx-runtime') return require(id);
      if (id.endsWith('library-panels.tsx')) return modules['library-panels'];
      if (id.endsWith('/button')) return control('button');
      if (id.endsWith('/input/textarea')) return control('textarea');
      if (id.endsWith('/banner')) return props => React.createElement('aside',{},props.description);
      if (id.endsWith('production-dialog.tsx')) return {ProductionDialog:({title,children,...props}) => React.createElement('dialog',{'aria-label':title,...props},children)};
      if (id.endsWith('client.ts')) return {invoke};
      if (id.endsWith('contracts.ts')) return {errorInfo:error=>({message:error.message})};
      if (id.endsWith('jincheng-work-detail-data.ts')) return {topicReferenceGroups:()=>({videos:[],materials:[]})};
      return new Proxy({}, {get:(_,key)=>key==='__esModule'?true:control('div')});
    }});
    modules[name]=module.exports;
  }
  const stage = React.createElement(modules['jincheng-stage-actions'].JinchengStageActions,{contentId:'T051',actions,initialAction});
  let flush;
  const root = detail ? React.createElement(modules['jincheng-work-detail'].JinchengWorkDetail,{contentId:'T051',title:'空正文',stage:'写稿',busy:false,dirty:false,activeTool:'production',chooseTool(){},makeCover(){},showTasks(){},registerCloseGuard:value=>{flush=value;},children:stage}) : stage;
  function visit(node,path='0',ancestors=[]) {
    if (node==null || typeof node==='boolean') return;
    if (Array.isArray(node)) return node.forEach((child,i)=>visit(child,`${path}.${i}`,ancestors));
    if (typeof node!=='object') {nodes.push(node);return;}
    const {type,props}=node;
    if (type===React.Fragment) return visit(props.children,path+'.f',ancestors);
    if (type?.$$typeof===Symbol.for('react.context')) {const before=values.get(type);values.set(type,props.value);visit(props.children,path+'.p',ancestors);values.set(type,before);return;}
    if (typeof type==='function') {let instance=instances.get(path);if (!instance) {instance={slots:[],effects:[]};instances.set(path,instance);}live.add(path);current=instance;index=0;return visit(type(props),path+'.c',ancestors);}
    nodes.push(node);ancestorsByNode.set(node,ancestors);visit(props?.children,path+'.h',[...ancestors,type]);
  }
  function render() {nodes=[];ancestorsByNode=new Map();effects=[];live=new Set();visit(root);for(const [path,instance] of instances) if(!live.has(path)){instance.effects.forEach(effect=>effect?.cleanup?.());instances.delete(path);}effects.forEach(effect=>effect());return nodes;}
  function text(node) {return typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
  const button = label => nodes.find(node=>node?.type==='button' && text(node.props.children)===label);
  const field = id => nodes.find(node=>node?.type==='textarea' && node.props.id===id);
  async function settle() {for(let i=0;i<8;i++){await Promise.resolve();render();}}
  render();
  return {render,settle,button,field,calls,ancestors:node=>ancestorsByNode.get(node),dirty:modules['library-panels'].hasManagedDrafts,dialog:()=>nodes.find(node=>node?.type==='dialog'),notice:()=>nodes.map(text).join(''),flush:()=>flush?.(),dispose(){for(const instance of instances.values()) instance.effects.forEach(effect=>effect?.cleanup?.());}};
}

test('untouched defaults do not register a draft and a successful new task clears input', async () => {
  const f=fixture(); assert.equal(f.dirty(),false);
  f.field('jincheng-stage-note').props.onChange('怎么做自媒体');f.render();assert.equal(f.dirty(),true);
  f.button('交给助手继续').props.onClick();await f.settle();assert.equal(f.dirty(),false);assert.equal(f.dialog(),undefined);
  assert.equal(f.calls.filter(call=>call.name==='startProductionTask').length,1);f.dispose();
});

test('resuming an existing task keeps unsubmitted input accessible and never starts a duplicate', async () => {
  const f=fixture({prior:true});f.field('jincheng-stage-note').props.onChange('怎么做自媒体');f.render();
  f.button('交给助手继续').props.onClick();await f.settle();
  assert.ok(f.dialog(),'existing task must not hide unsubmitted input');
  assert.equal(f.field('jincheng-stage-note').props.value,'怎么做自媒体');assert.equal(f.dirty(),true);
  assert.equal(f.calls.filter(call=>call.name==='openProductionTask').length,1);assert.equal(f.calls.some(call=>call.name==='startProductionTask'),false);f.dispose();
});

test('collapsed stage input exposes recovery outside its closed disclosure and clears every guarded field', () => {
  const f=fixture({actions:['research','synthesis'],initialAction:'research'});
  f.field('jincheng-research-target').props.onChange('参考账号');f.field('jincheng-stage-note').props.onChange('要求');f.render();
  f.button('暂时收起').props.onClick();f.render();
  assert.ok(f.button('继续本次填写'),'minimized draft needs a visible recovery entry');assert.equal(f.ancestors(f.button('继续本次填写')).includes('details'),false,'recovery must remain visible outside the closed disclosure');f.button('继续本次填写').props.onClick();f.render();
  assert.equal(f.field('jincheng-research-target').props.value,'参考账号');
  f.button('综合调研').props.onClick();f.render();f.field('jincheng-synthesis-question').props.onChange('真正问题');f.render();
  f.button('清空本次填写').props.onClick();f.render();assert.equal(f.dirty(),false);assert.equal(f.field('jincheng-synthesis-question').props.value,'');
  f.button('新建调研').props.onClick();f.render();assert.equal(f.field('jincheng-research-target').props.value,'');f.dispose();
});

test('failed task launch retains input and a recovery path after minimizing', async () => {
  const f=fixture({fail:true});f.field('jincheng-stage-note').props.onChange('保留作者要求');f.render();f.button('交给助手继续').props.onClick();await f.settle();
  assert.equal(f.field('jincheng-stage-note').props.value,'保留作者要求');assert.equal(f.dirty(),true);
  f.button('暂时收起').props.onClick();f.render();assert.ok(f.button('继续本次填写'));f.dispose();
});

test('detail tool guard still blocks losing a real draft, then permits collapse after explicit clear', async () => {
  const f=fixture({detail:true});await f.settle();assert.equal(f.dirty(),false,'closed tools do not mount a draft guard');
  f.button('更多操作').props.onClick();await f.settle();f.field('jincheng-stage-note').props.onChange('保留作者填写');f.render();
  f.button('暂时收起').props.onClick();f.render();await f.flush();assert.equal(f.dirty(),true);
  f.button('更多操作 · 收起').props.onClick();await f.settle();assert.match(f.notice(),/当前辅助窗口有未保存的填写/);
  assert.ok(f.button('继续本次填写'),'guarded detail must expose recovery without another guarded tool switch');f.button('继续本次填写').props.onClick();f.render();assert.equal(f.field('jincheng-stage-note').props.value,'保留作者填写');
  f.button('清空本次填写').props.onClick();f.render();f.button('暂时收起').props.onClick();f.render();
  f.button('更多操作 · 收起').props.onClick();await f.settle();assert.ok(f.button('更多操作'));assert.equal(f.dirty(),false);f.dispose();
});

for (const [action,fieldId] of [['research','jincheng-research-target'],['synthesis','jincheng-synthesis-question']]) test(`${action} input alone can be cleared without a note`, () => {
  const f=fixture({actions:[action],initialAction:action});f.field(fieldId).props.onChange('单独保留的输入');f.render();assert.equal(f.dirty(),true);
  assert.ok(f.button('清空本次填写'));f.button('暂时收起').props.onClick();f.render();assert.equal(f.ancestors(f.button('继续本次填写')).includes('details'),false);
  f.button('继续本次填写').props.onClick();f.render();assert.equal(f.field(fieldId).props.value,'单独保留的输入');
  f.button('清空本次填写').props.onClick();f.render();assert.equal(f.dirty(),false);assert.equal(f.field(fieldId).props.value,'');f.dispose();
});
