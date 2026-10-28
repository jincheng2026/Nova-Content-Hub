import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../package.json',import.meta.url)), React=require('react'), jsx=require('react/jsx-runtime');
const {rolldown}=await import(require.resolve('rolldown'));
const real=['workspace-pages.tsx','assistant-settings.tsx','covers.tsx','template-workflow-panel.tsx','paged-items.tsx','use-paged-items.ts','template-groups.ts','template-availability.ts','cover-gallery.ts'];
const compiled={};
for(const file of ['workspace-pages','assistant-settings','covers','template-workflow-panel']){
 const bundle=await rolldown({input:new URL(`../src/renderer/${file}.tsx`,import.meta.url).pathname,external:id=>!real.some(name=>id.endsWith('/'+name)),plugins:[{name:'test-private-components',transform(code,id){if(id.endsWith('/workspace-pages.tsx'))return code+'\nexport {TemplateImportDialog};';if(id.endsWith('/template-workflow-panel.tsx'))return code+'\nexport {TemplateComparison};';}}]});
 const generated=await bundle.generate({format:'cjs'});await bundle.close();compiled[file]=generated.output.find(item=>item.type==='chunk').code;
}
// Render each real component, PagedItems, and its hook with separate keyed hook
// slots. Only platform UI, IPC, and unrelated workspaces are memory boundaries.
function fixture(file,name,props,read=async()=>undefined){
 const states=new Map(),effects=new Map(),calls=[];let owner='',cursor=0,pending=[],tree=[],changed=false;
 const hooks={
  useState(initial){const key=owner+':'+cursor++;if(!states.has(key))states.set(key,typeof initial==='function'?initial():initial);return[states.get(key),next=>{const value=typeof next==='function'?next(states.get(key)):next;if(!Object.is(value,states.get(key))){states.set(key,value);changed=true;}}];},
  useRef(initial){const key=owner+':'+cursor++;if(!states.has(key))states.set(key,{current:initial});return states.get(key);},
  useMemo(compute){cursor++;return compute();},useCallback(fn){cursor++;return fn;},useContext(context){cursor++;return context._currentValue;},
  useEffect(setup,deps){const key=owner+':'+cursor++,old=effects.get(key);if(!old||!deps||deps.some((value,i)=>!Object.is(value,old.deps?.[i])))pending.push(()=>{old?.cleanup?.();effects.set(key,{deps,cleanup:setup()});});},
 };
 const ui=(tag='ui')=>props=>jsx.jsx(tag,Object.fromEntries(Object.keys(props).filter(key=>key!=='key').map(key=>[key,props[key]])));
 const generic=Object.assign(ui(),{Item:ui(),TabPane:ui(),Title:ui(),Paragraph:ui()});
 const module={exports:{}};
 vm.runInNewContext(compiled[file],{module,exports:module.exports,requestAnimationFrame:fn=>fn(),HTMLElement:class{},window:{addEventListener(){},removeEventListener(){}},document:{activeElement:null,querySelector:()=>null,getElementById:()=>null},require:id=>{
  if(id==='react')return{...React,...hooks};if(id==='react/jsx-runtime')return jsx;
  if(id==='react-dom')return{createPortal:children=>children};
  if(id.endsWith('/client.ts'))return{invoke:async(method,args)=>{calls.push([method,args]);return read(method,args);}};
  if(id.endsWith('/pagination-bar.tsx'))return{PaginationBar:ui('pagination')};
  if(id.endsWith('/cover-image-viewer.tsx'))return{ImagePreviewButton:ui('image-preview'),CoverImageViewer:ui('image-viewer')};
  if(id.endsWith('/template-preview.tsx'))return{TemplatePreview:ui('template-preview')};
  if(id.endsWith('/file-dropzone.tsx'))return{FileDropzone:ui('file-dropzone')};
  if(id.endsWith('/library-panels.tsx'))return{ManagementDialog:ui('dialog'),useManagedDraftGuard(){},hasManagedDrafts:()=>false,materialType:()=>'',materialSize:()=>''};
  if(id.endsWith('/list-primitives.tsx'))return{List:generic,ImageList:generic,ListToolbar:ui(),DataTable:ui('data-table')};
  if(id.endsWith('/task-progress.tsx'))return{useTaskProgress(){},TaskProgressDetails:ui()};
  if(id.endsWith('/task-progress.ts'))return{assistantLaunchNotice:()=>'',taskProgressLabel:()=>'',taskStatusChanged:()=>false};
  if(id.endsWith('/semi-controls.tsx'))return{PopupSelect:ui('select'),PopupCreatableSelect:ui('select'),CoverCountInput:ui('input')};
  if(id.endsWith('/cover-contracts.ts'))return{ASSISTANTS:['codex','workbuddy']};
  if(id.endsWith('/button'))return ui('button');if(id.endsWith('/checkbox'))return ui('checkbox');
  if(id.includes('/input'))return ui('input');
  return new Proxy(generic,{get:(target,key)=>key in target?target[key]:generic});
 }});
 function visit(element,path){
  if(element==null||typeof element==='boolean')return;if(Array.isArray(element)){element.forEach((child,i)=>visit(child,path+'/'+(child?.key??i)));return;}
  if(typeof element!=='object'){tree.push({type:'text',text:String(element)});return;}
  if(typeof element.type==='function'){owner=path;cursor=0;visit(element.type(element.props),path+'/'+element.type.name);return;}
  if(typeof element.type==='string')tree.push(element);visit(element.props?.children,path+'/children');
 }
 const render=()=>{let pass=0;do{changed=false;pending=[];tree=[];visit(jsx.jsx(module.exports[name],props),'root');pending.forEach(effect=>effect());assert.ok(++pass<15,'render settles');}while(changed);return tree;};
 return{props,calls,render,async ready(){render();await new Promise(resolve=>setImmediate(resolve));return render();},nodes:type=>tree.filter(node=>node.type===type),text:()=>tree.filter(node=>node.type==='text').map(node=>node.text).join(''),page(label){const page=tree.find(node=>node.type==='pagination'&&node.props.label===label);assert.ok(page,`missing ${label}`);return page.props;},button(label){const node=tree.find(node=>node.type==='button'&&node.props.children===label);assert.ok(node,`missing button ${label}`);return node.props;}};
}
const images=count=>Array.from({length:count},(_,i)=>({assetHash:`hash-${i+1}`,url:`asset://image-${i+1}`,originalName:`原样张-${i+1}.png`}));
const template=count=>({id:'template-one',name:'完整原模板',title:'完整原模板',version:1,currentVersion:1,versions:[{version:1,packageHash:'package'}],builtin:true,catalogStatus:'default',studyComplete:true,description:'完整说明\n'.repeat(12),rules:[],samples:images(count)});
const library=t=>({settings:{profile:{name:'本人',intro:'完整简介',marks:[]},channels:[],defaults:{}},photos:[],templates:[t],contentDetails:[],collections:[]});
const noop=()=>{};

test('settings photos and channels keep bounded independent pages for zero, one and three pages',async()=>{
 for(const count of [0,1,45]){
  const t=template(1),snapshot=library(t),photos=images(count).map((image,i)=>({...image,id:`photo-${i+1}`,title:`照片 ${i+1}`,availability:'available'}));snapshot.photos=photos;snapshot.settings.channels=photos.map((photo,i)=>({id:`channel-${i+1}`,name:`渠道 ${i+1}`}));
  const f=fixture('assistant-settings','AssistantSettings',{status:null,busy:false,blocked:false,run:action=>action(),close:noop,library:snapshot,assets:{photos,templates:[]},refresh:async()=>{},managePhotos:noop,manageChannels:noop});await f.ready();
  assert.equal(f.page('设置照片分页').total,count);assert.equal(f.page('设置渠道分页').total,count);
  for(const size of [50,100,20]){f.page('设置照片分页').onPageSizeChange(size);f.render();assert.equal(f.nodes('img').filter(node=>node.props.alt.startsWith('照片 ')).length,Math.min(count,size));assert.equal(f.page('设置渠道分页').pageSize,20);}
  if(count>20){f.page('设置照片分页').onPageChange(3);f.page('设置渠道分页').onPageChange(3);f.render();assert.equal(f.nodes('img').filter(node=>node.props.alt.startsWith('照片 ')).length,5);assert.match(f.text(),/渠道 45/);assert.doesNotMatch(f.text(),/渠道 1渠道/);}
 }
});

test('the template group preview reaches every image with its original ordinal',()=>{
 const t=template(45),f=fixture('workspace-pages','TemplatesPage',{library:library(t),assets:{templates:[t],photos:[]},busy:false,useTemplate:noop,managePhotos:noop,run:action=>action(),refresh:async()=>{}});f.render();f.nodes('template-preview')[0].props.preview();f.render();
 assert.equal(f.page('模板整组样张分页').total,45);assert.equal(f.nodes('image-preview').length,20);
 const seen=[];for(const page of [1,2,3]){f.page('模板整组样张分页').onPageChange(page);f.render();seen.push(...f.nodes('image-preview').map(node=>node.props.url));}
 assert.equal(new Set(seen).size,45);assert.equal(f.nodes('image-preview').at(-1).props.label,'完整原模板样张 45');
});

test('template import removal on the last page deletes its own hash and preserves fields and all remaining save hashes',async()=>{
 const source=images(45),f=fixture('workspace-pages','TemplateImportDialog',{props:{busy:false,run:action=>action(),refresh:async()=>{}},template:null,initialImages:source,close:noop,onImported:async()=>{}},async()=>({objectId:'new-template',library:{}}));f.render();
 assert.equal(f.nodes('img').length,20);f.nodes('input')[0].props.onChange('作者自定名称');f.render();f.page('待导入样张分页').onPageChange(3);f.render();assert.equal(f.nodes('img')[0].props.alt,'待导入样张 41：原样张-41.png');
 f.nodes('button').filter(node=>node.props.children==='移除这张').at(-1).props.onClick();f.render();assert.equal(f.page('待导入样张分页').total,44);assert.equal(f.nodes('input')[0].props.value,'作者自定名称');f.button('仅保存样张').onClick();await new Promise(resolve=>setImmediate(resolve));
 const saved=f.calls.find(([method])=>method==='mutateWorkspace')[1];assert.equal(saved.name,'作者自定名称');assert.equal(saved.styleAssetHashes.length,44);assert.equal(saved.styleAssetHashes.at(-1),'hash-44');assert.equal(source.length,45);
});

test('fixed reference samples page independently without splitting complete rules or evidence',()=>{
 const samples=images(45),attempt={attemptId:'fixed-attempt',samples,result:{restore:{url:'asset://restore'},rules:{fixed:['原始固定规则\n'.repeat(15)],variable:['完整可变规则'],evidence:[{ruleType:'fixed',ruleIndex:0,sourceAssetHash:'hash-45',observation:'原始末张证据'}]}}};
 const f=fixture('template-workflow-panel','TemplateComparison',{attempt});f.render();f.nodes('details')[0].props.onToggle({currentTarget:{open:true}});f.render();assert.equal(f.page('固定参考样张分页').total,45);assert.equal(f.nodes('image-preview').length,22);
 f.page('固定参考样张分页').onPageChange(3);f.render();assert.equal(f.nodes('image-preview').at(-1).props.label,'本次固定参考样张 45');assert.match(f.text(),/样张 45：原始末张证据/);assert.ok(f.text().includes(attempt.result.rules.fixed[0]));
});

test('cover sample selections survive page and page-size changes and keep original sample ordinals',async()=>{
 const t=template(45),snapshot=library(t),content={id:'content-one',editToken:'content-v1',title:'原标题',body:'完整正文'},assets={templates:[t],photos:[]},cover={content,jobs:[],candidates:[],selectedCandidateId:null};
 const f=fixture('covers','CoverPanel',{status:{currentName:'测试库',assistant:'codex'},content,dirty:false,busy:false,blocked:false,refreshToken:0,library:snapshot,readAutomatically:async()=>({assets,cover}),run:action=>action(),onContent:noop},async method=>method==='readContentDetails'?{...content,materials:[],candidates:[],plans:[],publications:[],coverVariants:[]}:undefined);await f.ready();
 f.nodes('button').find(node=>node.props.id==='make-cover'||node.props.id==='open-cover-settings'||node.props.children==='制作封面')?.props.onClick();f.render();
 const preview=f.nodes('template-preview')[0];assert.ok(preview,'template card remains available');preview.props.preview();f.render();
 assert.equal(f.page('封面样张选择分页').total,45);assert.equal(f.nodes('checkbox').filter(node=>node.props['aria-label']?.startsWith('使用样张 ')).length,20);
 f.nodes('checkbox').find(node=>node.props['aria-label']==='使用样张 1').props.onChange({target:{checked:false}});f.render();f.page('封面样张选择分页').onPageChange(3);f.render();assert.ok(f.nodes('checkbox').find(node=>node.props['aria-label']==='使用样张 45'));
 f.nodes('checkbox').find(node=>node.props['aria-label']==='使用样张 45').props.onChange({target:{checked:false}});f.render();f.page('封面样张选择分页').onPageSizeChange(50);f.render();assert.equal(f.nodes('checkbox').find(node=>node.props['aria-label']==='使用样张 1').props.checked,false);assert.equal(f.nodes('checkbox').find(node=>node.props['aria-label']==='使用样张 45').props.checked,false);assert.match(f.text(),/本次已选 43 \/ 45 张/);
 f.button('使用所选样张').onClick();f.render();assert.match(f.text(),/43 张样张/);f.nodes('template-preview')[0].props.preview();f.render();assert.equal(f.nodes('checkbox').find(node=>node.props['aria-label']==='使用样张 1').props.checked,false);f.nodes('checkbox').find(node=>node.props['aria-label']==='使用样张 2').props.onChange({target:{checked:false}});f.render();f.button('关闭预览').onClick();f.render();f.nodes('template-preview')[0].props.preview();f.render();assert.equal(f.nodes('checkbox').find(node=>node.props['aria-label']==='使用样张 2').props.checked,true);assert.match(f.text(),/本次已选 43 \/ 45 张/);
});

test('empty cover candidates and history keep the page size selector',async()=>{
 const content={id:'empty-content',editToken:'v1',title:'原标题',body:'完整正文'},f=fixture('covers','CoverPanel',{status:{currentName:'测试库'},content,dirty:false,busy:false,blocked:false,refreshToken:0,readAutomatically:async()=>({assets:{templates:[],photos:[]},cover:{content,jobs:[],candidates:[]}}),run:action=>action(),onContent:noop});await f.ready();
 assert.equal(f.page('封面候选分页').total,0);const history=f.nodes('data-table').find(node=>node.props.label==='封面生成记录分页');assert.ok(history);assert.equal(history.props.total,0);
});

test('single template preview and empty or single imports retain size controls',()=>{
 for(const count of [0,1]){
  const t=template(count),f=fixture('workspace-pages','TemplatesPage',{library:library(t),assets:{templates:[t],photos:[]},busy:false,useTemplate:noop,managePhotos:noop,run:action=>action(),refresh:async()=>{}});f.render();if(count){f.nodes('template-preview')[0].props.preview();f.render();assert.equal(f.page('模板整组样张分页').total,count);}else assert.equal(f.nodes('template-preview').length,0);
  const g=fixture('workspace-pages','TemplateImportDialog',{props:{busy:false,run:action=>action(),refresh:async()=>{}},template:null,initialImages:images(count),close:noop,onImported:async()=>{}});g.render();assert.equal(g.page('待导入样张分页').total,count);
  for(const size of [50,100,20]){g.page('待导入样张分页').onPageSizeChange(size);g.render();assert.equal(g.page('待导入样张分页').pageSize,size);assert.equal(g.nodes('img').length,count);}
 }
});

test('removing the only image on the final import page clamps and preserves all earlier hashes',()=>{
 const source=images(41),f=fixture('workspace-pages','TemplateImportDialog',{props:{busy:false,run:action=>action(),refresh:async()=>{}},template:null,initialImages:source,close:noop,onImported:async()=>{}});f.render();f.page('待导入样张分页').onPageChange(3);f.render();f.button('移除这张').onClick();f.render();assert.equal(f.page('待导入样张分页').page,2);assert.equal(f.page('待导入样张分页').total,40);assert.equal(f.nodes('img')[0].props.alt,'待导入样张 21：原样张-21.png');assert.equal(f.nodes('img').at(-1).props.alt,'待导入样张 40：原样张-40.png');assert.equal(source.length,41);
});

test('fixed reference pagination remains usable for zero and one image',()=>{
 for(const count of [0,1]){const attempt={attemptId:'one-attempt',samples:images(count),result:{restore:{url:'asset://restore'},rules:{fixed:['完整规则'],variable:[],evidence:[]}}},f=fixture('template-workflow-panel','TemplateComparison',{attempt});f.render();f.nodes('details')[0].props.onToggle({currentTarget:{open:true}});f.render();for(const size of [50,100,20]){f.page('固定参考样张分页').onPageSizeChange(size);f.render();assert.equal(f.page('固定参考样张分页').total,count);assert.equal(f.page('固定参考样张分页').pageSize,size);assert.match(f.text(),/完整规则/);}}
});

test('replacing an import group resets its page and preserves author fields',()=>{
 const f=fixture('workspace-pages','TemplateImportDialog',{props:{busy:false,run:action=>action(),refresh:async()=>{}},template:null,initialImages:images(45),close:noop,onImported:async()=>{}});f.render();f.nodes('input')[0].props.onChange('保留模板名称');f.render();f.page('待导入样张分页').onPageChange(3);f.render();const replacement=images(45).map(image=>({...image,assetHash:'new-'+image.assetHash,url:'new-'+image.url}));f.nodes('file-dropzone')[0].props.onImported(replacement);f.render();assert.equal(f.page('待导入样张分页').page,1);assert.equal(f.nodes('input')[0].props.value,'保留模板名称');assert.equal(f.nodes('img')[0].props.src,'new-asset://image-1');
});

test('profile field previews page complete rows while keeping each field body intact',async()=>{
 const t=template(1),snapshot=library(t),body='原始字段正文\n'.repeat(30);snapshot.settings.profile.marks=Array.from({length:45},(_,i)=>({key:i===0?'自媒体方向':i===1?'目标读者':`自定字段 ${i+1}`,value:body+`末尾 ${i+1}`}));
 const f=fixture('assistant-settings','AssistantSettings',{status:null,busy:false,blocked:false,run:action=>action(),close:noop,library:snapshot,assets:{photos:[],templates:[]},refresh:async()=>{}});await f.ready();assert.equal(f.page('个人信息字段分页').total,45);assert.equal(f.nodes('dt').length,20);assert.ok(f.text().includes(body+'末尾 1'));assert.ok(!f.text().includes(body+'末尾 45'));
 f.page('个人信息字段分页').onPageChange(3);f.render();assert.equal(f.nodes('dt').length,5);assert.ok(f.text().includes(body+'末尾 45'));f.page('个人信息字段分页').onPageSizeChange(50);f.render();assert.equal(f.nodes('dt').length,45);assert.equal(f.page('个人信息字段分页').pageSize,50);
});
