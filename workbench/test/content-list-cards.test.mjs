import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../package.json',import.meta.url));
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),{rolldown}=await import(require.resolve('rolldown'));
const bundle=await rolldown({input:new URL('../src/renderer/content-list.tsx',import.meta.url).pathname,external:id=>!id.endsWith('/content-list.tsx')});
const generated=await bundle.generate({format:'cjs'});await bundle.close();
function fixture(extra={}){
 let state=[],cursor=0,buttons=[],tables=[],paginations=[],selects=[];
 const module={exports:{}};
 const Button=({children,...props})=>{buttons.push({children,...props});return React.createElement('button',{'aria-pressed':props['aria-pressed'],'aria-label':props['aria-label'],disabled:props.disabled},children);};
 const Box=({children})=>React.createElement('div',null,children);Box.Item=Box;Box.Menu=Box;
 const api={
 './list-primitives.tsx':{DataTable:props=>{tables.push(props);return React.createElement('div',{'data-table':'true'},props.rows.length?props.rows.map(item=>React.createElement('span',{key:item.id},item.title)):props.empty);},ListToolbar:({children})=>React.createElement('div',null,children),List:Box,ImageList:Box},
 './pagination-bar.tsx':{PaginationBar:props=>{paginations.push(props);return null;}},
 './semi-controls.tsx':{PopupSelect:props=>{selects.push(props);return React.createElement('select',{'aria-label':props['aria-label']},props.children);}},
 './collection-preview.tsx':{CollectionPreview:()=>null},
 '../shared/publication-view.ts':{publicationEntries:()=>[],scheduleForView:value=>value,compareSchedules:()=>0},
 './workspace-model.ts':{scheduleDay:value=>value},'./publication-model.ts':{publicationTime:value=>value},'./schedule-view.tsx':{channelTone:()=>'',channelStyle:()=>({}),scheduleClock:()=>''}
 };
 vm.runInNewContext(generated.output.find(item=>item.type==='chunk').code,{module,exports:module.exports,require:id=>{
  if(id==='react/jsx-runtime')return require(id);
  if(id==='react')return{useState(initial){const i=cursor++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return[state[i],next=>state[i]=typeof next==='function'?next(state[i]):next];},useRef(initial){const i=cursor++;if(!(i in state))state[i]={current:initial};return state[i];},useEffect(){},useMemo:fn=>fn()};
  if(api[id])return api[id];if(id.endsWith('/radio'))return{Group:props=>React.createElement('div',{'aria-label':props['aria-label']},props.options.map(option=>React.createElement(Button,{key:option.value,onClick:()=>props.onChange({target:{value:option.value}}),'aria-pressed':props.value===option.value},option.label)))};if(id.endsWith('/button'))return Button;if(id.includes('@douyinfe/'))return Box;return{};
 }});
 const opened=[],recycled=[];
 const props={contents:[{id:'one',title:'第一篇',body:'正文',editToken:'one'},{id:'two',title:'第二篇',body:'另一个正文',editToken:'two'}],workspace:{contents:[{id:'one',plans:[],candidateCount:0},{id:'two',plans:[],candidateCount:0}],channels:[]},library:null,query:'',setQuery(){},view:'active',busy:false,blocked:false,ready:true,changeView(){},open:(item,generate)=>opened.push([item.id,generate]),recycle:item=>recycled.push(item.id),...extra};
 return{props,opened,recycled,render(){cursor=0;buttons=[];tables=[];paginations=[];selects=[];const html=renderToStaticMarkup(module.exports.ContentList(props));return{html,buttons,tables,paginations,selects};}};
}
test('all contents opens in cards and changing to list preserves the visible filtered content',()=>{
 const f=fixture();let view=f.render();assert.match(view.html,/<article[^>]*data-content-id="one"/);assert.equal(view.tables.length,0);
 view.buttons.find(b=>b.children==='列表').onClick();view=f.render();assert.equal(view.tables.length,1);assert.deepEqual(view.tables[0].rows.map(item=>item.id),['one','two']);
 view.buttons.find(b=>b.children==='卡片').onClick();assert.match(f.render().html,/<article[^>]*data-content-id="two"/);
});
test('card title opens the original content while cover action preserves its generate intent',()=>{
 const f=fixture();const view=f.render();view.buttons.find(b=>b.children==='第一篇').onClick();view.buttons.find(b=>b.children==='制作封面').onClick();assert.deepEqual(f.opened,[['one',undefined],['one',true]]);
});
test('cards and list share pagination instead of a second content projection',()=>{
 const contents=Array.from({length:23},(_,i)=>({id:`id-${i}`,title:`第${String(i).padStart(2,'0')}篇`,body:'正文'}));
 const f=fixture({contents});let view=f.render();const pagination=view.paginations.find(p=>p.label==='内容列表分页');assert.ok(pagination);assert.equal((view.html.match(/<article/g)||[]).length,20);pagination.onPageChange(2);view=f.render();assert.equal((view.html.match(/<article/g)||[]).length,3);view.buttons.find(b=>b.children==='列表').onClick();view=f.render();assert.equal(view.tables[0].page,2);assert.equal(view.tables[0].rows.length,3);
});
test('a true collection keeps its existing table presentation',()=>{
 const f=fixture({collection:{id:'group',title:'真实合集'}});const view=f.render();assert.equal(view.tables.length,1);assert.equal(view.buttons.some(b=>b.children==='卡片'),false);
});

test('search, name sorting and cover-state filters act on the same content in either presentation',()=>{
 const f=fixture({contents:[{id:'z',title:'Z 中文',body:'含目标词'},{id:'a',title:'A 中文',body:'含目标词'},{id:'other',title:'不匹配',body:'其他'}],query:'目标词',workspace:{contents:[{id:'a',plans:[],candidateCount:0},{id:'z',plans:[],candidateCount:2},{id:'other',plans:[],candidateCount:0}],channels:[]}});
 let view=f.render();view.selects.find(select=>select['aria-label']==='内容列表排序').onChange('name');view=f.render();assert.ok(view.html.indexOf('data-content-id="z"')<view.html.indexOf('data-content-id="a"'));assert.doesNotMatch(view.html,/data-content-id="other"/);
 view.selects.find(select=>select['aria-label']==='内容状态').onChange('needs-cover');view=f.render();assert.match(view.html,/data-content-id="a"/);assert.doesNotMatch(view.html,/data-content-id="z"/);view.buttons.find(button=>button.children==='列表').onClick();view=f.render();assert.deepEqual(view.tables[0].rows.map(item=>item.id),['a']);
});


test('name order is descending with numeric titles before pagination in both cards and lists',()=>{
 const contents=Array.from({length:23},(_,i)=>({id:`id-${i+1}`,title:`T${i+1} 内容`,body:'正文'}));
 const f=fixture({contents});let view=f.render();view.selects.find(select=>select['aria-label']==='内容列表排序').onChange('name');view=f.render();
 assert.deepEqual([...view.html.matchAll(/data-content-id="([^"]+)"/g)].map(match=>match[1]),Array.from({length:20},(_,i)=>`id-${23-i}`));
 view.paginations.find(p=>p.label==='内容列表分页').onPageChange(2);view=f.render();
 assert.deepEqual([...view.html.matchAll(/data-content-id="([^"]+)"/g)].map(match=>match[1]),['id-3','id-2','id-1']);
 view.buttons.find(button=>button.children==='列表').onClick();view=f.render();assert.deepEqual(view.tables[0].rows.map(item=>item.id),['id-3','id-2','id-1']);
});
test('collections use the same descending numeric name order',()=>{
 const collections=[2,10,1].map(n=>({id:`group-${n}`,title:`合集${n}`,memberIds:[],updatedAt:'2026-10-28'}));
 const f=fixture({library:{collections,contentDetails:[],settings:{channels:[]}}});let view=f.render();view.selects.find(select=>select['aria-label']==='内容列表排序').onChange('name');view=f.render();
 assert.deepEqual(view.buttons.filter(button=>button['data-collection-id']).map(button=>button['data-collection-id']),['group-10','group-2','group-1']);
});
test('a new untitled work remains visible by native T number, searchable and first under number order',()=>{
 const contents=[{id:'old',title:'T050 旧内容',body:''},{id:'new',title:'未定标题',body:''}];
 const library={collections:[],settings:{channels:[]},contentDetails:[{id:'old',tNumber:'T050',createdAt:'2026-10-27',updatedAt:'2026-10-27',candidates:[],plans:[],channelIds:[]},{id:'new',tNumber:'T051',createdAt:'2026-10-28',updatedAt:'2026-10-28',candidates:[],plans:[],channelIds:[]}]};
 const f=fixture({contents,library});let view=f.render();
 view.selects.find(select=>select['aria-label']==='内容列表排序').onChange('number');view=f.render();
 assert.ok(view.html.indexOf('data-content-id="new"')<view.html.indexOf('data-content-id="old"'));assert.match(view.html,/T051 未定标题/);
 f.props.query='T051';view=f.render();assert.match(view.html,/data-content-id="new"/);assert.doesNotMatch(view.html,/data-content-id="old"/);
 view.buttons.find(button=>button.children==='列表').onClick();view=f.render();assert.deepEqual(view.tables[0].rows.map(item=>item.id),['new']);
 assert.equal(view.tables[0].total,1);
});
