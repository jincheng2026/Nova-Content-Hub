const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function load(mode='disabled', savedStorage=[]) {
 const nodes=new Map(),events={};
 function node(id='') {
  let html='', parsed=null;
  const attrs=new Map(),out={id,tagName:'DIV',textContent:'',dataset:{},style:{},value:'',scrollTop:0,children:[],isConnected:true,hidden:false,
   classList:{add(){},remove(){},toggle(){}},
   setAttribute(k,v){attrs.set(k,String(v));if(k==='id')this.id=String(v);},
   getAttribute:k=>attrs.get(k)||null,
   removeAttribute(k){attrs.delete(k);if(k==='id')this.id='';},
   appendChild(x){this.children.push(x);x.parentElement=this;return x;},
   insertAdjacentHTML(_where,value){this.innerHTML+=value;},
   querySelector(selector){return this.querySelectorAll(selector)[0]||null;},
   querySelectorAll(selector){
    if(!parsed){
     parsed=[];
     for(const match of html.matchAll(/<(\w+)\b([^>]*)>/g)){
      const child=node();child.tagName=match[1].toUpperCase();
      for(const attr of match[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g)){
       const [,key,value='']=attr;child.setAttribute(key,value);
       if(key.startsWith('data-'))child.dataset[key.slice(5).replace(/-([a-z])/g,(_m,c)=>c.toUpperCase())]=value;
       if(key==='hidden')child.hidden=true;
       if(key==='value')child.value=value.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&amp;/g,'&');
      }
      if(child.tagName==='TEXTAREA')child.value=html.slice(match.index+match[0].length).split('</textarea>')[0].replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&amp;/g,'&');
      parsed.push(child);
     }
    }
    return parsed.filter(x=>selector.split(',').some(part=>x.matches(part.trim())));
   },
   matches(selector){
    if(selector.startsWith('#'))return this.id===selector.slice(1);
    if(selector.startsWith('.'))return (attrs.get('class')||'').split(/\s+/).includes(selector.slice(1));
    if(selector.startsWith('[')){const m=selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]/);return !!m&&attrs.has(m[1])&&(m[2]===undefined||attrs.get(m[1])===m[2]);}
    return this.tagName===selector.toUpperCase();
   },
   closest(){return null;},
   focus(){document.activeElement=this;this.focused=true;},
   remove(){this.isConnected=false;if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(x=>x!==this);},
   click(){this.clicked=true;},get firstChild(){return this.children[0];},get firstElementChild(){return this.children[0];},select(){this.selected=true;},getClientRects(){return this.hidden?[]:[{}];},getBoundingClientRect(){return {left:0,top:0,bottom:20,width:100,height:20};}
  };
  Object.defineProperty(out,'innerHTML',{get:()=>html,set:value=>{html=String(value);parsed=null;}});
  return out;
 }
 for(const id of ['body','nav','side-bot','mask','layer','toasts'])nodes.set('#'+id,node(id));
 function find(selector){return nodes.get(selector)||nodes.get('#layer').children.find(x=>x.matches(selector))||null;}
 const document={documentElement:node('html'),body:node('document-body'),activeElement:null,querySelector:find,querySelectorAll:()=>[],getElementById:id=>find('#'+id),createElement:tag=>{const x=node();x.tagName=tag.toUpperCase();return x;},addEventListener(name,fn){(events[name]||=[]).push(fn);}};
 const storage=new Map(savedStorage),windowEvents={};const ctx={document,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},location:{search:'',hash:''},requestAnimationFrame:()=>{},setTimeout:()=>{},clearTimeout(){},addEventListener(){},removeEventListener(){},console,Date,URL,Blob,TextEncoder,crypto:require('node:crypto').webcrypto,innerWidth:1280,innerHeight:900,navigator:{}};
 ctx.window=ctx;ctx.window.addEventListener=(name,fn)=>windowEvents[name]=fn;
 vm.createContext(ctx);for(const file of ['build-config.js','data.js','builtin-templates.js','shared/handoff.js','shared/zip.js','core.js']){let source=fs.readFileSync('原型/'+file,'utf8');if(file==='build-config.js')source=source.replaceAll('required',mode);vm.runInContext(source,ctx,{filename:file});}
 let source=fs.readFileSync('原型/app.js','utf8');source=source.replace('  apply(); render();','  apply(); render(); globalThis.TEST_UI = {A,S,V,render,route,actionKinds,startCover,openCoverSetup,photoFiles,normalizeCreatorPhoto,readFile,pwFiles,pwDrop,pwParse,pwModal,pwKeys,pwPickModal,closeModal,getPromptAdd:()=>PWADD,getPromptUse:()=>PWUSE,getCover:()=>CV};');vm.runInContext(source,ctx,{filename:'app.js'});
 return {ctx,ui:ctx.TEST_UI,D:ctx.NCH,W:ctx.NCH_WORKSPACE,nodes,node,events,storage};
}
const photoPng=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/mXcAAAAASUVORK5CYII=','base64');
function imageUploads(app) {
 const decoded=[],downloads=[],originals=new Map();app.ctx.File=globalThis.File || require('node:buffer').File;
 app.ctx.FileReader=class { readAsDataURL(file){Promise.resolve().then(async()=>{this.result='data:'+file.type+';base64,'+Buffer.from(await file.arrayBuffer()).toString('base64');this.onload();});} };
 app.ctx.Image=class {set src(value){decoded.push(value);Promise.resolve().then(()=>{const f=originals.get(value);if(!(f?f.data.equals(photoPng):value.endsWith(photoPng.toString('base64'))))return this.onerror();this.naturalWidth=f?.px?.[0]||1;this.naturalHeight=f?.px?.[1]||1;this.onload();});}};
 app.ctx.fetch=async src=>{assert.match(src,/^data:image\//);return fetch(src);};
 app.ctx.URL=class extends URL {static createObjectURL(blob){if(blob.data){const id='blob:input-'+originals.size;originals.set(id,blob);return id;}downloads.push(blob);return 'blob:local-photo';}static revokeObjectURL(){}};
 return {decoded,downloads,file:(name='我的照片.png',data=photoPng,type='image/png')=>({name,data,type,size:data.length,arrayBuffer:async()=>Uint8Array.from(data).buffer})};
}
test('photo uploader validates decoded images, cancellation and atomic capacity failures before reporting success',async()=>{
 const app=load(),{ui,W,D,nodes}=app,h=imageUploads(app);ui.S.page='templates';ui.render();assert.match(nodes.get('#body').innerHTML,/我的照片|拖拽图片/);assert.match(nodes.get('#body').innerHTML,/还没有上传自己的照片/);
 let picker;const create=app.ctx.document.createElement;app.ctx.document.createElement=tag=>{const el=create(tag);if(tag==='input')picker=el;return el;};
 ui.A['photo-upload']();assert.ok(picker.clicked);assert.match(picker.accept,/image\/png/);picker.files=[];await picker.onchange();assert.equal(D.ACCOUNT.photos.filter(W.isOwnPhoto).length,0);
 ui.A['photo-upload']();picker.files=[h.file()];await picker.onchange();const first=W.defaultPhoto();assert.ok(first);assert.equal(first.bytes,photoPng.length);assert.equal(h.decoded.length,2);assert.match(nodes.get('#body').innerHTML,/默认照片/);
 await ui.photoFiles([h.file('第二张.png')]);assert.equal(W.defaultPhoto().id,first.id);const before=app.ctx.localStorage.getItem(W.key),count=D.ACCOUNT.photos.length;
 await assert.rejects(ui.photoFiles([h.file('无效.png',Buffer.from('not an image'))]),/解码/);assert.equal(app.ctx.localStorage.getItem(W.key),before);
 await assert.rejects(ui.photoFiles([h.file('不接受.svg',photoPng,'image/svg+xml')]),/不接受 SVG/);
 await assert.rejects(ui.photoFiles([{...h.file('太大.png'),size:20*1024*1024+1}]),/20 MiB/);
 const set=app.ctx.localStorage.setItem;app.ctx.localStorage.setItem=()=>{throw Error('quota');};await assert.rejects(ui.photoFiles([h.file('容量.png')]),/修改已回退/);app.ctx.localStorage.setItem=set;assert.equal(D.ACCOUNT.photos.length,count);assert.equal(app.ctx.localStorage.getItem(W.key),before);
});
test('creator upload locally resizes common large photos and rolls back when canvas compression fails',async()=>{
 const app=load(),h=imageUploads(app),canvases=[],create=app.ctx.document.createElement;
 app.ctx.document.createElement=tag=>{if(tag!=='canvas')return create(tag);const canvas={width:0,height:0,getContext:()=>({clearRect(){},drawImage(){}}),toBlob(callback,type,quality){this.type=type;this.quality=quality;callback(new Blob([photoPng],{type}));}};canvases.push(canvas);return canvas;};
 await app.ui.photoFiles([{...h.file('手机原图.png'),size:4*1024*1024,px:[3200,2400]}]);assert.equal(canvases[0].width,1600);assert.equal(canvases[0].height,1200);assert.equal(canvases[0].type,'image/webp');assert.ok(app.W.defaultPhoto().bytes<=1024*1024);assert.match(app.nodes.get('#toasts').children.at(-1).innerHTML,/已在本机优化用于封面/);
 const before=app.ctx.localStorage.getItem(app.W.key),count=app.D.ACCOUNT.photos.length;app.ctx.document.createElement=tag=>tag==='canvas'?{getContext:()=>({clearRect(){},drawImage(){}}),toBlob(callback){callback(null);}}:create(tag);
 await assert.rejects(app.ui.photoFiles([h.file('同批有效.png'),{...h.file('失败.jpg'),size:3*1024*1024,px:[2400,1800]}]),/优化失败/);assert.equal(app.D.ACCOUNT.photos.length,count);assert.equal(app.ctx.localStorage.getItem(app.W.key),before);
 await assert.rejects(app.ui.photoFiles([{...h.file('像素过大.png'),px:[9000,9000]}]),/4000 万像素/);assert.equal(app.ctx.localStorage.getItem(app.W.key),before);
});
test('cover keeps the selected person across template changes, permits no person, and exports actual local bytes',async()=>{
 const app=load(),{ui,W,D,nodes}=app,h=imageUploads(app);await ui.photoFiles([h.file('含真名的照片.png'),h.file('另一张.png')]);const mine=D.ACCOUNT.photos.filter(W.isOwnPhoto),p=D.PROJECTS.find(x=>x.kind==='内容'),ts=D.TEMPLATES.filter(W.isBuiltinTemplate);
 ui.openCoverSetup(p);assert.ok(ui.getCover().ref.includes(mine[0].id));ui.A['cv-tpl']({dataset:{k:ts[0].id}});const style=W.referenceChoices(ts[0],p).find(a=>a.kind==='template');ui.A['cv-ref']({dataset:{k:style.id}});ui.A['cv-tpl']({dataset:{k:ts[1].id}});assert.ok(ui.getCover().ref.includes(mine[0].id));assert.ok(!ui.getCover().ref.includes(style.id));assert.ok(ui.getCover().ref.some(id=>W.referenceChoices(ts[1],p).some(a=>a.kind==='ai'&&a.id===id)));
 ui.A['cv-person']({dataset:{k:mine[1].id}});assert.ok(ui.getCover().ref.includes(mine[1].id));assert.ok(!ui.getCover().ref.includes(mine[0].id));assert.equal(W.defaultPhoto().id,mine[0].id);await ui.A['photo-export']({dataset:{scope:'cover'}});assert.equal(h.downloads.length,1);assert.deepEqual(Buffer.from(await h.downloads[0].arrayBuffer()),photoPng);
 ui.A['cv-person']({dataset:{k:''}});ui.A['cv-tpl']({dataset:{k:ts[0].id}});assert.ok(!ui.getCover().ref.some(id=>W.photoById(id)));ui.startCover(p,ts[0],['方图'],1,'不放人物的内容',ui.getCover().ref);assert.match(D.TASKS.at(-1).request.rules.fixed.join(' '),/本次不放人物/);assert.ok(!D.TASKS.at(-1).request.references.some(r=>W.photoById(r.id)));
 ui.openCoverSetup(p);ui.A['cv-brief']({value:'这条内容只讲我提供的三个操作步骤'});ui.A['cv-tpl']({dataset:{k:ts[0].id}});ui.startCover(p,ts[0],['方图'],1,'用自己的照片',[mine[1].id]);const task=D.TASKS.at(-1),frozen=JSON.stringify(task);assert.ok(!frozen.includes('含真名'));assert.ok(!frozen.includes('base64'));assert.equal(task.request.references[0].id,mine[1].id);assert.equal(task.request.options.brief,undefined);assert.match(task.request.rules.fixed.join(' '),/这条内容只讲我提供的三个操作步骤/);assert.match(nodes.get('#layer').children.at(-1).innerHTML,/单独导出本人照片/);
 ui.A['photo-delete']({dataset:{id:mine[1].id}});assert.equal(JSON.stringify(task),frozen);await ui.A['photo-export']({dataset:{scope:'handoff'}});assert.deepEqual(Buffer.from(await h.downloads.at(-1).arrayBuffer()),photoPng);
 ui.A['photo-delete']({dataset:{id:mine[0].id}});assert.equal(W.defaultPhoto(),null);const record=W.trash.find(x=>x.kind==='photo'&&x.value.id===mine[1].id);ui.A['photo-restore']({dataset:{id:record.id}});assert.equal(W.defaultPhoto().id,mine[1].id);assert.equal(JSON.stringify(task),frozen);
});
test('photo clicks and drag uploads enforce current authorization, including auth expiry during decoding',async()=>{
 const app=load('required'),{ui,W,D,ctx,node,events}=app,h=imageUploads(app);await assert.rejects(ui.photoFiles([h.file()]),/鉴权/);assert.equal(D.ACCOUNT.photos.filter(W.isOwnPhoto).length,0);
 W.setAuth('active');let release;ctx.FileReader=class {readAsDataURL(file){release=()=>{this.result='data:image/png;base64,'+file.data.toString('base64');this.onload();};}};
 const pending=ui.photoFiles([h.file()]);await new Promise(resolve=>setImmediate(resolve));W.setAuth('expired');release();await assert.rejects(pending,/鉴权/);assert.equal(D.ACCOUNT.photos.filter(W.isOwnPhoto).length,0);
 imageUploads(app);W.setAuth('active');await ui.photoFiles([h.file()]);const id=W.defaultPhoto().id;W.setAuth('expired');ui.A['photo-delete']({dataset:{id}});assert.equal(W.defaultPhoto().id,id);ui.A['photo-default']({dataset:{id}});assert.equal(W.defaultPhoto().id,id);
 const drop=node();drop.closest=selector=>selector==='[data-photo-drop]'?drop:null;let prevented=0;await Promise.all(events.drop.map(handler=>handler({target:drop,dataTransfer:{files:[h.file('拖进来的.png')],types:['Files']},preventDefault(){prevented++;}})));assert.equal(D.ACCOUNT.photos.filter(W.isOwnPhoto).length,1);assert.ok(prevented>0);
 W.setAuth('active');await Promise.all(events.drop.map(handler=>handler({target:drop,dataTransfer:{files:[h.file('拖进来的.png')],types:['Files']},preventDefault(){}})));assert.equal(D.ACCOUNT.photos.filter(W.isOwnPhoto).length,2);
});
for(const action of ['photo-delete','photo-default','photo-restore'])test(action+' quota rollback preserves this batch person and rebinds the cover project',()=>{
 const app=load(),{ui,W,D,ctx}=app,p=D.PROJECTS.find(x=>x.kind==='内容'),t=D.TEMPLATES.find(W.isBuiltinTemplate);
 W.addPhotos(['photo-a','photo-b'].map(id=>({id,name:id+'.png',img:'data:image/png;base64,'+photoPng.toString('base64'),bytes:photoPng.length,px:[1,1]})));
 if(action==='photo-restore'){W.removePhoto('photo-a');W.removePhoto('photo-b');}
 ui.openCoverSetup(D.byId(p.id));ui.A['cv-tpl']({dataset:{k:t.id}});const cv=ui.getCover(),refs=Array.from(cv.ref),none=cv.personNone,before=ctx.localStorage.getItem(W.key),save=ctx.localStorage.setItem;
 const id=action==='photo-restore'?W.trash.find(x=>x.kind==='photo'&&x.value.id==='photo-a').id:action==='photo-default'?'photo-b':'photo-a';
 ctx.localStorage.setItem=()=>{throw Error('quota');};ui.A[action]({dataset:{id}});ctx.localStorage.setItem=save;
 assert.equal(ctx.localStorage.getItem(W.key),before);assert.doesNotThrow(()=>ui.startCover(cv.p,D.tplOf(t.id),['方图'],1,'容量回退后继续出图',cv.ref));
 assert.deepEqual(Array.from(cv.ref),refs);assert.equal(cv.personNone,none);assert.equal(cv.p,D.byId(p.id));assert.equal(D.TASKS.at(-1).request.targetId,p.id);
});
test('isolated renderer executes five pages and details without missing references',()=>{
 const {ui,D,nodes}=load();for(const page of ['today','templates','projects','calendar','prompts','more','check']){ui.S.page=page;ui.render();assert.ok(nodes.get('#body').innerHTML.length>100,page);assert.ok(!nodes.get('#body').innerHTML.includes('undefined'),page+' '+nodes.get('#body').innerHTML.match(/.{0,60}undefined.{0,60}/g));}
 ui.S.page='template';ui.S.tid=D.TEMPLATES[0].id;ui.render();assert.ok(nodes.get('#body').innerHTML.includes(D.TEMPLATES[0].name));
 for(const p of D.PROJECTS){ui.S.page='project';ui.S.pid=p.id;ui.render();}
});
test('action classification is exhaustive and UI filters remain readable when logged out',()=>{
 const {ui,W}=load('required');assert.equal(W.auth,'logged-out');assert.deepEqual(Object.keys(ui.A).sort(),Object.keys(ui.actionKinds).filter(x=>x in ui.A).sort());
 for(const key of ['pf','mpick','mon','wk','pw-fav','pw-fav-one','pw-off-view','cv-title','files','versions','dl','backup-export'])assert.equal(ui.actionKinds[key],'read',key);
 const before=W.D.PROJECTS.length;ui.A['new-project-ok']();assert.equal(W.D.PROJECTS.length,before);
 ui.A.pf({dataset:{k:'all'}});assert.equal(ui.S.filter,'all');
});
test('collection UI creates a collection, project route clears comparisons, template target never comes from stale pid',()=>{
 const {ui,D,nodes,node}=load();const input=node();input.value='隔离合集';nodes.set('#nc-name',input);ui.A['new-collection-ok']();const created=D.PROJECTS.at(-1);assert.equal(created.kind,'合集');assert.equal(created.name,'隔离合集');assert.equal(created.materials.length,0);
 ui.S.sel={'cover-v:01':1};ui.S.old={'cover-v':true};ui.route('p/'+D.PROJECTS[0].id);assert.equal(Object.keys(ui.S.sel).length,0);assert.equal(Object.keys(ui.S.old).length,0);
 const before=D.PROJECTS.map(p=>p.tpl);ui.S.pid=D.PROJECTS[0].id;ui.A['use-tpl']({dataset:{id:D.TEMPLATES[0].id}});assert.deepEqual(D.PROJECTS.map(p=>p.tpl),before);
});
test('generation persists handoff facts without fake candidates and freezes template version',()=>{
 const {ui,W,D}=load();const p=D.PROJECTS.find(p=>p.kind==='内容'),t=D.TEMPLATES[0];W.rules(t,{fixed:['规则'],varies:[],evidence:[{sourceIndex:0,rule:'有证据'}]});t.validation={restoreImage:'data:image/png;base64,aGVsbG8=',accepted:false};t.state='待验收';W.acceptTemplate(t);const before=D.TASKS.length;ui.startCover(p,t,['4:5'],2,'真实标题',[]);const task=D.TASKS.at(-1);assert.equal(D.TASKS.length,before+1);assert.equal(task.state,'handoff');assert.equal(D.matOf(p,task.mid).batches.at(-1).cands.length,0);assert.equal(task.request.options.title,'真实标题');assert.equal(task.request.templateVersion,t.version);
});
test('real inline blur callback enforces auth and authorized edits persist',()=>{
 const {ui,W,D,node,ctx}=load('required');const p=D.PROJECTS[0],old=p.name;
 function inline(value){const el=node();el.dataset={t:'pname',v:D.byId(p.id).name,iId:p.id};el.closest=()=>null;let input;el.after=x=>{input=x;};ui.A.ie(el);assert.ok(input);input.value=value;input.onblur();}
 inline('未授权修改');assert.equal(D.byId(p.id).name,old);W.setAuth('active');inline('授权后保存的修改');assert.equal(D.byId(p.id).name,'授权后保存的修改');assert.equal(JSON.parse(ctx.localStorage.getItem(W.key)).data.PROJECTS.find(x=>x.id===p.id).name,'授权后保存的修改');
});
test('external task creation/acceptance use the same persistent transaction',()=>{
 const {ui,W,D,ctx}=load('required'),tid=D.TEMPLATES[0].id,n=D.TASKS.length;ui.A['analyze-template']({dataset:{id:tid}});assert.equal(D.TASKS.length,n);W.setAuth('active');ui.A['analyze-template']({dataset:{id:tid}});const task=D.TASKS.at(-1);assert.equal(task.state,'handoff');ui.A['task-accept']({dataset:{id:task.id}});assert.equal(JSON.parse(ctx.localStorage.getItem(W.key)).data.TASKS.find(x=>x.id===task.id).state,'running');
});
test('prompt file preview is read-only and saving rechecks current write authorization',async()=>{
 const {ui,W,D,ctx}=load('required');let resolveRead;const pending={name:'callback.md',size:20,text:()=>new Promise(resolve=>resolveRead=resolve)};
 W.setAuth('active');const saving=ui.pwFiles([pending]);W.setAuth('expired');resolveRead('---\ntitle: 回调测试\nwhen: 测试时\n---\n真实文件正文');await saving;assert.ok(!D.PROMPTS.some(x=>x.title==='回调测试'));
 assert.equal(ui.getPromptAdd().mm.querySelector('#pwb').value,'真实文件正文');ui.A['new-prompt-ok']();assert.ok(!D.PROMPTS.some(x=>x.title==='回调测试'));assert.equal(ui.getPromptAdd().mm.id,'m-live');
 W.setAuth('active');ui.A['new-prompt-ok']();assert.ok(JSON.parse(ctx.localStorage.getItem(W.key)).data.PROMPTS.some(x=>x.title==='回调测试'&&x.body==='真实文件正文'));
});
test('prompt drag callback blocks unauthenticated sorting and persists authorized sorting',()=>{
 const {ui,W,D,node,events,ctx}=load('required'),first=D.PROMPTS[0].id,second=D.PROMPTS[1].id;
 function drag(){const from=node(),to=node();from.dataset.pwdrag=first;to.dataset.pwdrag=second;events.dragstart[0]({target:{closest:()=>from},dataTransfer:{setData(){}}});events.drop[0]({target:{closest:()=>to},preventDefault(){}});}
 drag();assert.equal(D.PROMPTS[0].id,first);W.setAuth('active');drag();assert.equal(D.PROMPTS[0].id,second);assert.equal(JSON.parse(ctx.localStorage.getItem(W.key)).data.PROMPTS[0].id,second);
});
test('context menu favorite callback is gated and persists without changing another project',()=>{
 const {W,D,events,node,ctx}=load('required'),p=D.PROJECTS[0],m=p.materials[0],c=m.batches[0].cands[0],old=c.fav;
 function favorite(){const target=node();target.dataset.ctx=`cand:${p.id}:${m.id}:${c.no}`;events.contextmenu[0]({target:{closest:()=>target},preventDefault(){},clientX:10,clientY:10});const menu=ctx.document.body.children.at(-1);menu.onclick({target:{closest:()=>({dataset:{mi:'3'}})}});}
 favorite();assert.equal(c.fav,old);W.setAuth('active');favorite();assert.equal(c.fav,!old);const saved=JSON.parse(ctx.localStorage.getItem(W.key));assert.equal(saved.data.PROJECTS[0].materials[0].batches[0].cands[0].fav,!old);
});
test('template analysis result is reviewed and finishes only after manual acceptance',()=>{
 const {ui,W,D,nodes,node}=load('required');W.setAuth('active');const tid=D.TEMPLATES[0].id;ui.A['analyze-template']({dataset:{id:tid}});const task=D.TASKS.at(-1);ui.A['task-accept']({dataset:{id:task.id}});const input=node();input.value=JSON.stringify({fixed:['已分析的规则'],varies:[],evidence:[{sourceIndex:0,rule:'对应原图证据'}]});nodes.set('#rules-json',input);ui.A['rules-save']({dataset:{id:tid}});assert.equal(task.state,'review');assert.equal(D.tplOf(tid).state,'待还原');ui.A['task-success']({dataset:{id:task.id}});assert.equal(task.state,'success');assert.equal(D.tplOf(tid).state,'待还原');
});
function hostSelect(app,id='settings-host') {
 return app.nodes.get('#body').querySelector('#'+id);
}
function changeHost(app,value,id='settings-host') {
 const select=hostSelect(app,id);assert.ok(select);select.value=value;select.closest=selector=>selector==='select[data-act]'?select:null;
 const query=app.ctx.document.querySelector;app.ctx.document.querySelector=selector=>selector==='#settings-host'?hostSelect(app,selector.slice(1)):query(selector);
 try { for(const change of app.events.change)change({target:select}); } finally { app.ctx.document.querySelector=query; }
 assert.equal(hostSelect(app,id).focused,true);
}
test('host selection lives only in settings and manual configuration follows the current assistant',()=>{
 const app=load(),{ui,D,nodes}=app;ui.A['set-host']({dataset:{k:'codex'}});D.hostChoices=()=>['workbuddy','codex','future-assistant'];ui.S.page='more';ui.render();
 const options=html=>Array.from(html.matchAll(/<option value="([^"]+)"([^>]*)>([^<]+)<\/option>/g),m=>[m[1],m[2].includes('selected'),m[3]]);
 const list=root=>options(root.match(/<select[^>]*data-act="set-host"[^>]*>(.*?)<\/select>/s)[1]);
 const expected=[['workbuddy',false,'WorkBuddy'],['codex',true,'Codex'],['future-assistant',false,'future-assistant']];
 assert.doesNotMatch(nodes.get('#side-bot').innerHTML,/<select|sidebar-host|host-picker|当前助手/);assert.match(nodes.get('#side-bot').innerHTML,/打开 Codex/);assert.deepEqual(list(nodes.get('#body').innerHTML),expected);
 for(const id of ['settings-host']){const select=hostSelect(app,id);assert.match(select.getAttribute('aria-label'),/Codex/);assert.equal(select.getAttribute('data-act'),'set-host');}
 assert.doesNotMatch(nodes.get('#side-bot').innerHTML,/host-short|aria-pressed|data-k="(?:codex|workbuddy)"/);
 ui.A['plugin-settings']();const config=nodes.get('#layer').children.at(-1).innerHTML;assert.doesNotMatch(config,/host-choice|future-assistant|WorkBuddy/);assert.match(config,/当前助手：Codex/);
 assert.equal(D.SETTINGS.host,'codex');assert.ok(!app.ctx.localStorage.getItem(app.W.key).includes('future-assistant'));
});
test('settings host changes update the sidebar launch button, persist on reload and preserve existing task owners',()=>{
 const app=load(),{ui,D}=app;ui.S.page='more';ui.render();const tasks=JSON.stringify(D.TASKS);
 changeHost(app,'workbuddy');assert.equal(D.SETTINGS.host,'workbuddy');assert.equal(JSON.stringify(D.TASKS),tasks);
 assert.match(app.nodes.get('#body').innerHTML,/<option value="workbuddy" selected>WorkBuddy<\/option>/);assert.match(app.nodes.get('#side-bot').innerHTML,/打开 WorkBuddy/);
 const restored=load('disabled',app.storage);assert.equal(restored.D.SETTINGS.host,'workbuddy');assert.equal(JSON.stringify(restored.D.TASKS),tasks);
 changeHost(app,'codex','settings-host');assert.equal(D.SETTINGS.host,'codex');assert.equal(JSON.parse(app.ctx.localStorage.getItem(app.W.key)).data.SETTINGS.host,'codex');
 const select=hostSelect(app);select.closest=()=>select;let prevented=false;app.events.click[0]({target:select,preventDefault(){prevented=true;}});assert.equal(prevented,false);
});
test('rejected host changes restore selection and storage failures never show a success toast',()=>{
 const app=load('required');app.W.setAuth('active');app.ui.A['set-host']({dataset:{k:'codex'}});app.nodes.get('#toasts').children=[];app.W.setAuth('logged-out');app.ui.S.page='more';app.ui.render();changeHost(app,'workbuddy');assert.equal(app.D.SETTINGS.host,'codex');
 assert.match(app.nodes.get('#body').innerHTML,/<option value="codex" selected>Codex<\/option>/);assert.match(app.nodes.get('#side-bot').innerHTML,/打开 Codex/);
 app.W.setAuth('active');app.ctx.localStorage.setItem=()=>{throw Error('quota');};changeHost(app,'workbuddy','settings-host');assert.equal(app.D.SETTINGS.host,'codex');
 const toasts=app.nodes.get('#toasts').children.map(x=>x.innerHTML).join('');assert.match(toasts,/保存失败/);assert.doesNotMatch(toasts,/所有 AI 操作将使用/);
 assert.match(app.nodes.get('#body').innerHTML,/<option value="codex" selected>Codex<\/option>/);assert.match(app.nodes.get('#side-bot').innerHTML,/打开 Codex/);
});
test('every AI entry uses the current assistant and cross-host launch preserves historical facts',()=>{
 const {ui,W,D,nodes}=load();const p=D.PROJECTS[0];p.host='codex';ui.A['set-host']({dataset:{k:'workbuddy'}});assert.equal(D.SETTINGS.host,'workbuddy');assert.match(nodes.get('#side-bot').innerHTML,/打开 WorkBuddy|打开WorkBuddy/);
 ui.S.page='project';ui.S.pid=p.id;ui.render();assert.doesNotMatch(nodes.get('#body').innerHTML,/item-host/);assert.match(nodes.get('#body').innerHTML,/当前助手.*WorkBuddy/s);
 const modal=()=>nodes.get('#layer').children.at(-1).innerHTML;
 for(const action of ['open-host','project-handoff','intake','schedule','diagnostic-handoff']){ui.A[action]({dataset:{id:p.id}});assert.match(modal(),/交接到WorkBuddy/);assert.match(modal(),/workbuddy:\/\/task\?action=start&amp;prompt=/);}
 ui.A['pw-ask-ai']({dataset:{id:D.PROMPTS[0].id}});assert.match(modal(),/交接到WorkBuddy/);assert.match(modal(),/提示词/);
 const builtin=D.TEMPLATES.find(t=>W.isBuiltinTemplate(t));ui.A['analyze-template']({dataset:{id:builtin.id}});const task=D.TASKS.at(-1);assert.equal(task.host,'workbuddy');assert.match(modal(),/交接到WorkBuddy/);task.conv='original-workbuddy-session';W.commit();const original=JSON.stringify(task);ui.A['set-host']({dataset:{k:'codex'}});
 ui.S.page='project';ui.S.pid=p.id;ui.render();assert.doesNotMatch(nodes.get('#body').innerHTML,/回原|WorkBuddy/);
 ui.A['task-open']({dataset:{id:task.id}});assert.match(modal(),/交给Codex/);assert.doesNotMatch(modal(),/回原WorkBuddy|task-transfer|带项目摘要到当前助手/);
 const count=D.TASKS.length;ui.A['task-bridge']({dataset:{id:task.id}});assert.match(modal(),/交接到Codex/);assert.match(modal(),/codex:\/\/new\?prompt=/);assert.equal(D.TASKS.length,count+1);
 const transferred=D.TASKS.at(-1);assert.equal(transferred.host,'codex');assert.equal(transferred.sourceTaskId,task.id);assert.equal(transferred.handoff.sourceTaskId,task.id);assert.equal(transferred.handoff.target.mode,'new');assert.equal(transferred.handoff.target.sessionId,null);assert.notEqual(transferred.request.requestId,task.request.requestId);assert.equal(transferred.conv,'');assert.equal(JSON.stringify(task),original);assert.match(nodes.get('#layer').children.at(-1).querySelector('#host-text').value,new RegExp(task.id));
 assert.equal(JSON.parse(W.raw()).data.TASKS.find(t=>t.id===task.id).host,'workbuddy');
});
test('same-host task actions resume through the bridge without creating or rewriting tasks',()=>{
 const {ui,W,D,nodes}=load();W.setHost('codex');ui.A['analyze-template']({dataset:{id:D.TEMPLATES[0].id}});const task=D.TASKS.at(-1);task.conv='same-host-session';W.commit();const before=JSON.stringify(D.TASKS);
 for(const action of ['task-bridge','task-transfer','task-fix','fix-go']){ui.A[action]({dataset:{id:task.id}});const html=nodes.get('#layer').children.at(-1).innerHTML;assert.match(html,/交接到Codex/);assert.match(html,/codex:\/\/threads\/same-host-session\?prompt=/);assert.equal(JSON.stringify(D.TASKS),before);}
});
test('new generation and restore actions go straight to the current assistant bridge',()=>{
 const {ui,W,D,nodes}=load();W.setHost('workbuddy');const t=D.TEMPLATES.find(t=>W.isBuiltinTemplate(t)),p=D.PROJECTS.find(p=>p.kind==='内容');
 ui.startCover(p,t,['4:5'],1,'直接桥接',[]);assert.match(nodes.get('#layer').children.at(-1).innerHTML,/交接到WorkBuddy/);
 W.rules(t,{fixed:['保留构图'],varies:[],evidence:[{sourceIndex:0,rule:'原图证据'}]});ui.A['restore-template']({dataset:{id:t.id}});assert.match(nodes.get('#layer').children.at(-1).innerHTML,/交接到WorkBuddy/);assert.equal(D.TASKS.at(-1).request.kind,'restore');
});
test('cross-host task bridge rechecks external permission while read-only history stays available',()=>{
 const {ui,W,D,nodes}=load('required');W.setAuth('active');W.setHost('workbuddy');ui.A['analyze-template']({dataset:{id:D.TEMPLATES[0].id}});const task=D.TASKS.at(-1);ui.A['set-host']({dataset:{k:'codex'}});const before=W.raw(),count=D.TASKS.length;
 for(const state of ['logged-out','offline-valid']){W.setAuth(state);ui.A['task-open']({dataset:{id:task.id}});assert.match(nodes.get('#layer').children.at(-1).innerHTML,/请求/);ui.A['task-bridge']({dataset:{id:task.id}});assert.equal(D.TASKS.length,count);assert.equal(W.raw(),before);}
 W.setAuth('active');ui.A['task-bridge']({dataset:{id:task.id}});const html=nodes.get('#layer').children.at(-1).innerHTML;assert.equal(D.TASKS.length,count+1);assert.match(html,/交接到Codex/);assert.match(html,/真实授权/);assert.doesNotMatch(html,/href="[^" ]*[?&](?:amp;)?prompt=/);
});
test('failed cross-host persistence preserves history and never opens a new target handoff',()=>{
 const {ui,W,D,nodes,ctx}=load();W.setHost('workbuddy');ui.A['analyze-template']({dataset:{id:D.TEMPLATES[0].id}});const task=D.TASKS.at(-1);ui.A['set-host']({dataset:{k:'codex'}});ui.A['task-open']({dataset:{id:task.id}});const before=JSON.stringify(W.snapshot().data),saved=W.raw();ctx.localStorage.setItem=()=>{throw Error('quota');};
 ui.A['task-bridge']({dataset:{id:task.id}});assert.equal(JSON.stringify(W.snapshot().data),before);assert.equal(W.raw(),saved);assert.doesNotMatch(nodes.get('#layer').children.at(-1).innerHTML,/交接到Codex/);assert.match(nodes.get('#toasts').children.at(-1).innerHTML,/保存失败/);
});
test('required auth demo never produces a content-bearing outbound link, including active demo',()=>{
 const {ui,W,nodes}=load('required');for(const state of ['logged-out','active']){W.setAuth(state);ui.A['open-host']();const html=nodes.get('#layer').children.at(-1).innerHTML;assert.match(html,/真实授权/);assert.match(html,/下载 HANDOFF.json/);assert.match(html,/href="(?:codex|workbuddy):\/\/[^" ]+"/);assert.doesNotMatch(html,/href="[^" ]*[?&](?:amp;)?prompt=/);}
});
test('built-in templates are usable from actual cover UI without claiming AI restore verification',()=>{
 const {ui,W,D,nodes}=load();ui.S.page='templates';ui.render();assert.match(nodes.get('#body').innerHTML,/内置原创 · 可直接使用/);const t=D.TEMPLATES.find(t=>W.isBuiltinTemplate(t)),p=D.PROJECTS.find(p=>p.kind==='内容');ui.startCover(p,t,['4:5'],1,'直接用内置模板',[]);const task=D.TASKS.at(-1);assert.equal(task.request.templateId,t.id);assert.equal(task.state,'handoff');assert.ok(task.handoff.context.template.fixed.length);
});
test('manual plugin configuration writes only the current assistant',()=>{
 const {ui,D,nodes,node}=load();ui.A['set-host']({dataset:{k:'codex'}});for(const [id,value]of Object.entries({'host-choice':'workbuddy','host-version':'0.2.0','client-id':'','host-install':'unknown','plugin-pair-id':'','host-trust':'unknown'})){const input=node();input.value=value;nodes.set('#'+id,input);}ui.A['plugin-config-save']();assert.equal(D.SETTINGS.host,'codex');assert.equal(D.SETTINGS.hostConfig.codex.version,'0.2.0');assert.equal(D.SETTINGS.hostConfig.workbuddy.version,'');
});

test('prompt fields deduplicate names, preserve hints and replace all occurrences literally',()=>{
 const {D}=load(),p={body:'{{ 问题 |第一行提示}}\n{{问题}}\n{{正文|保留|分隔符}}\n{{缺项}}'};
 assert.deepEqual(JSON.parse(JSON.stringify(D.pfill(p))),[{k:'问题',hint:'第一行提示'},{k:'正文',hint:'保留|分隔符'},{k:'缺项',hint:''}]);
 const values=Object.assign(Object.create(null),{问题:'多行\n$& $` $\' <script>"',正文:'\n保留两端换行\n',缺项:'   '});
 assert.equal(D.ptext(p,values),[values.问题,values.问题,values.正文,'【待填写：缺项】'].join('\n'));
 assert.equal(D.ptext({body:'{{__proto__}}'},Object.create(null)),'【待填写：__proto__】');
 assert.equal(D.pfill({body:'{{A}} {{A|后出现的提示}}'}).length,1);assert.equal(D.pfill({body:'{{A}} {{A|后出现的提示}}'})[0].hint,'后出现的提示');
});
function promptSession(app,body='背景：{{情况|可以换行}}\n再次：{{情况}}\n目标：{{目标}}') {
 const p={id:'test-prompt-'+app.D.PROMPTS.length,title:'测试提示词',when:'测试复制时',summary:'说明',body,tags:[],cat:'测试',file:'test',source:'测试'};
 app.D.PROMPTS.push(p);app.ui.A['pw-copy']({dataset:{id:p.id}});
 return {p,use:app.ui.getPromptUse(),mm:app.ui.getPromptUse().mm};
}
function fillPrompt(app,index,value) {
 const use=app.ui.getPromptUse(),field=use.mm.querySelector('#pu-field-'+index);field.value=value;
 use.mm.oninput({target:field});return field;
}
test('prompt missing values block clipboard, focus first field, and show explicit preview markers',async()=>{
 const app=load(),{mm}=promptSession(app);let calls=0;app.ctx.navigator.clipboard={writeText:async()=>calls++};
 assert.equal(mm.querySelector('#pu-preview').value,'背景：【待填写：情况】\n再次：【待填写：情况】\n目标：【待填写：目标】');
 assert.equal(await app.ui.A['pw-fill-copy'](),false);assert.equal(calls,0);assert.equal(app.D.pcopies(),0);
 assert.equal(mm.querySelector('#pu-field-0').focused,true);assert.match(mm.querySelector('#pu-status').textContent,/2 项未填/);
 assert.equal(mm.querySelector('#pu-field-0').getAttribute('aria-invalid'),'true');
 fillPrompt(app,0,'实际情况\n$&');assert.match(mm.querySelector('#pu-progress').textContent,/1 \/ 2/);
 assert.equal(mm.querySelector('#pu-field-0').getAttribute('aria-invalid'),'false');
 assert.equal(await app.ui.A['pw-fill-copy'](),false);assert.equal(mm.querySelector('#pu-field-1').focused,true);
});
test('prompt successful async copy retains values and dialog, counts only success and blocks double-click in flight',async()=>{
 const app=load(),{p,mm}=promptSession(app);const before=app.ctx.localStorage.getItem(app.W.key);let resolveCopy,calls=[];
 app.ctx.navigator.clipboard={writeText:text=>{calls.push(text);return new Promise(resolve=>resolveCopy=resolve);}};
 fillPrompt(app,0,'长内容\n$& <b>');fillPrompt(app,1,'拿到方案');
 const expected=app.D.ptext(p,app.ui.getPromptUse().draft.values),pending=app.ui.A['pw-fill-copy']();
 await app.ui.A['pw-fill-copy']();assert.equal(calls.length,1);assert.equal(app.D.pcopies(),0);assert.equal(mm.querySelector('#pu-copy').disabled,true);
 resolveCopy();assert.equal(await pending,true);assert.equal(app.D.pcopies(),1);assert.equal(calls[0],expected);
 assert.equal(app.ctx.document.querySelector('#m-live'),mm);assert.equal(mm.querySelector('#pu-field-0').value,'长内容\n$& <b>');
 assert.match(mm.querySelector('#pu-status').textContent,/到 AI 对话中粘贴发送/);assert.equal(mm.querySelector('#pu-copy').disabled,false);
 assert.equal(app.ctx.localStorage.getItem(app.W.key),before);assert.ok(!app.ctx.localStorage.getItem(app.W.key).includes('长内容'));
 app.ctx.navigator.clipboard.writeText=async text=>calls.push(text);await app.ui.A['pw-fill-copy']();assert.equal(calls.length,2);assert.equal(app.D.pcopies(),2);
 app.ui.closeModal();app.ui.A['pw-copy']({dataset:{id:p.id}});assert.equal(app.ui.getPromptUse().mm.querySelector('#pu-field-0').value,'长内容\n$& <b>');
 assert.equal(p.body,'背景：{{情况|可以换行}}\n再次：{{情况}}\n目标：{{目标}}');
 app.ui.A['pw-reset']();assert.equal(app.ui.getPromptUse().mm.querySelector('#pu-field-0').value,'');assert.equal(app.D.pcopies(),2);
});
test('prompt clipboard failure retains input and exposes full manual selection; fallback success is counted',async()=>{
 const app=load(),{p,mm}=promptSession(app);fillPrompt(app,0,'保留我');fillPrompt(app,1,'目标');
 app.ctx.navigator.clipboard={writeText:async()=>{throw Error('denied');}};app.ctx.document.execCommand=()=>false;
 assert.equal(await app.ui.A['pw-fill-copy'](),false);assert.equal(app.D.pcopies(),0);assert.equal(mm.querySelector('#pu-field-0').value,'保留我');assert.equal(mm.querySelector('#pu-select').hidden,false);
 app.ui.A['pw-select'](mm.querySelector('#pu-select'));assert.equal(mm.querySelector('#pu-preview').selected,true);assert.equal(mm.querySelector('#pu-preview').value,app.D.ptext(p,app.ui.getPromptUse().draft.values));
 app.ctx.document.execCommand=()=>true;assert.equal(await app.ui.A['pw-fill-copy'](),true);assert.equal(app.D.pcopies(),1);assert.equal(mm.querySelector('#pu-select').hidden,true);
});
test('no-variable prompts use the same preview window; raw template is an explicit copy path',async()=>{
 const app=load(),{p,mm}=promptSession(app,'无需填写\n完整原文');let calls=[];app.ctx.navigator.clipboard={writeText:async text=>calls.push(text)};
 assert.equal(calls.length,0);assert.equal(app.ui.getPromptUse().fields.length,0);assert.equal(mm.querySelector('#pu-preview').value,p.body);
 await app.ui.A['pw-fill-copy']();assert.deepEqual(calls,[p.body]);
 promptSession(app,'{{需要填|提示}}');await app.ui.A['pw-raw-copy']();assert.equal(calls.at(-1),'{{需要填|提示}}');assert.equal(app.ui.getPromptUse().draft.values.需要填,undefined);
 for(const key of ['pw-copy','pw-fill-copy','pw-raw-copy','pw-reset','pw-select'])assert.equal(app.ui.actionKinds[key],'read');
});
test('prompt card, search Enter and project picker open the shared use window; IME and ordinary Enter never copy',()=>{
 const app=load(),{p}=promptSession(app);app.ui.closeModal();app.ui.S.page='prompts';app.ui.S.pkw='测试提示词';
 const search=app.node('pw-kw');let prevented=0;
 app.ui.pwKeys({key:'Enter',target:search,preventDefault(){prevented++;}},true);assert.equal(app.ui.getPromptUse().p,p);assert.equal(prevented,1);
 app.ui.closeModal();app.ui.pwPickModal({name:'项目'});const picker=app.ctx.document.querySelector('#m-live'),kw=picker.querySelector('#pp-kw');
 kw.value='测试提示词';kw.oninput();kw.onkeydown({key:'Enter',isComposing:true,preventDefault(){throw Error('IME intercepted');}});assert.equal(app.ctx.document.querySelector('#m-live'),picker);
 kw.onkeydown({key:'Enter',preventDefault(){}});assert.equal(app.ui.getPromptUse().p,p);assert.ok(app.ui.getPromptUse().mm.className.includes('pw-use'));
 const field=fillPrompt(app,0,'输入'),keydown=app.events.keydown[0];
 keydown({key:'Enter',isComposing:true,target:field,preventDefault(){throw Error('IME intercepted');}});
 keydown({key:'Enter',target:field,preventDefault(){throw Error('newline intercepted');}});assert.equal(app.D.pcopies(),0);
 app.ui.S.pkw='';const page=app.ui.V.prompts();assert.ok(page.includes('填写并复制'));assert.ok(page.includes('查看并复制'));assert.ok(page.includes('Enter 打开'));assert.ok(!page.includes('回车复制'));
});
test('prompt card click and Ctrl/Cmd Enter use the shared flow, including close/reopen during pending copy',async()=>{
 const app=load(),{p}=promptSession(app);app.ui.closeModal();
 const card=app.node();card.dataset.pw=p.id;
 app.events.click[0]({target:{closest:selector=>selector==='[data-pw]'?card:null},preventDefault(){}});
 assert.equal(app.ui.getPromptUse().p,p);fillPrompt(app,0,'内容');fillPrompt(app,1,'目标');
 let resolveCopy,calls=0;app.ctx.navigator.clipboard={writeText:()=>{calls++;return new Promise(resolve=>resolveCopy=resolve);}};
 const field=app.ui.getPromptUse().mm.querySelector('#pu-field-0');let prevented=false;
 const pending=app.events.keydown[0]({key:'Enter',metaKey:true,target:field,preventDefault(){prevented=true;}});
 assert.equal(prevented,true);assert.equal(calls,1);app.ui.closeModal();app.ui.A['pw-copy']({dataset:{id:p.id}});
 const reopened=app.ui.getPromptUse().mm;assert.equal(reopened.querySelector('#pu-copy').disabled,true);
 resolveCopy();await pending;assert.equal(reopened.querySelector('#pu-copy').disabled,false);assert.match(reopened.querySelector('#pu-status').textContent,/已复制/);assert.equal(app.D.pcopies(),1);
 app.ctx.navigator.clipboard.writeText=async()=>calls++;
 await app.events.keydown[0]({key:'Enter',ctrlKey:true,target:reopened.querySelector('#pu-field-0'),preventDefault(){}});assert.equal(calls,2);assert.equal(app.D.pcopies(),2);
});
test('unsettled Clipboard API times out, recovers the copy button and permits manual full-text selection',async()=>{
 const app=load(),{mm}=promptSession(app,'无需填写，等待剪贴板');let timeoutMs=0;
 app.ctx.navigator.clipboard={writeText:()=>new Promise(()=>{})};app.ctx.document.execCommand=()=>false;
 app.ctx.setTimeout=(fn,ms)=>{timeoutMs=ms;queueMicrotask(fn);return 1;};
 assert.equal(await app.ui.A['pw-fill-copy'](),false);assert.equal(timeoutMs,2500);assert.equal(app.D.pcopies(),0);
 assert.equal(mm.querySelector('#pu-copy').disabled,false);assert.equal(mm.querySelector('#pu-select').hidden,false);
 app.ui.A['pw-select'](mm.querySelector('#pu-select'));assert.equal(mm.querySelector('#pu-preview').selected,true);
});

test('actual builtin cover selection shows source design, changed-title reference and fixed rules',()=>{
 const {ui,W,D,nodes}=load(),t=D.TEMPLATES.find(t=>W.isBuiltinTemplate(t)),p=D.PROJECTS.find(p=>p.kind==='内容');
 ui.A['make-cover']({dataset:{id:p.id}});ui.A['cv-tpl']({dataset:{k:t.id}});const mm=nodes.get('#layer').children.at(-1),html=mm.querySelector('.modal-b').innerHTML;
 const evidence=html.slice(html.indexOf('<div class="cv-evidence">'));assert.ok(evidence.includes(t.img));assert.ok(evidence.includes(t.validation.referenceImage));assert.match(evidence,/已选组内样张 1 · 共同风格与构图差异/);for(const rule of t.fixed)assert.ok(evidence.includes(rule));
});
test('long handoff separates actual URI prefill from the complete text available for copying',()=>{
 const {ui,W,D,nodes}=load();W.setHost('workbuddy');const t=D.TEMPLATES[0];W.rules(t,{fixed:Array(5).fill('长'.repeat(500)),varies:[],evidence:[{sourceIndex:0,rule:'对应原图'}]});ui.A['analyze-template']({dataset:{id:t.id}});const task=D.TASKS.at(-1);ui.A['task-bridge']({dataset:{id:task.id}});
 const mm=nodes.get('#layer').children.at(-1),html=mm.innerHTML,actual=mm.querySelector('#protocol-prompt'),full=mm.querySelector('#host-text');assert.ok(actual);assert.ok(full);assert.match(html,/协议链接实际预填文本/);assert.match(html,/完整交接文本（供复制；不代表已通过链接传入）/);assert.match(actual.value,/请等待我附上交接 JSON/);assert.match(html,/下载 HANDOFF.json 并在助手中附上/);assert.ok(full.value.length>actual.value.length);assert.ok(!actual.value.includes('长'.repeat(500)));assert.ok(full.value.includes('长'.repeat(500)));
 const link=html.match(/href="(workbuddy:\/\/task\?action=start&amp;prompt=[^"]+)"/)[1].replaceAll('&amp;','&');assert.equal(new URL(link).searchParams.get('prompt'),actual.value);assert.equal(task.state,'handoff');
});
test('actual intake and scheduling actions carry distinct intent and only relevant planning context',()=>{
 const {ui,D,nodes}=load(),p=D.PROJECTS.find(p=>p.kind==='内容'),other=D.PROJECTS.find(x=>x.id!==p.id);p.plan='2026-11-12';p.channels=['小红书','公众号'];p.posts=[{id:'schedule-intent-test',date:'2026-11-10',channel:'公众号',time:'12:00',text:'无关完整帖文不应随排期指令传出',mat:''}];ui.S.pid=other.id;
 const text=()=>nodes.get('#layer').children.at(-1).querySelector('#host-text').value;
 ui.A['intake']({dataset:{id:p.id}});const intake=text();assert.match(intake,/本次动作：整理资料/);assert.ok(intake.includes(p.name));assert.ok(!intake.includes(other.name));
 ui.A['schedule']({dataset:{id:p.id}});const schedule=text();assert.match(schedule,/本次动作：排发布/);assert.match(schedule,/计划日期：2026-11-12/);assert.match(schedule,/2026-11-10 公众号/);assert.match(schedule,/小红书、公众号/);assert.ok(!schedule.includes(p.posts[0].text));assert.ok(!schedule.includes(other.name));assert.notEqual(schedule,intake);
});

function addForm(app) { app.ui.A['new-prompt']({dataset:{}});return app.ui.getPromptAdd().mm; }
function addInput(mm,id,value,inputType) { const x=mm.querySelector('#'+id);x.value=value;mm.oninput({target:x,inputType});return x; }
test('adding requires only body, derives an editable name and stores literal optional fields',()=>{
 const app=load(),mm=addForm(app),before=app.D.PROMPTS.length;
 app.ui.A['new-prompt-ok']();assert.equal(app.D.PROMPTS.length,before);assert.match(mm.querySelector('#pwa-status').textContent,/正文/);
 addInput(mm,'pwb','\n## 第一行标题\n完整正文');assert.equal(mm.querySelector('#pwt').value,'第一行标题');
 addInput(mm,'pwt','自己的: 名称');addInput(mm,'pwb','改过的正文');assert.equal(mm.querySelector('#pwt').value,'自己的: 名称');
 addInput(mm,'pww','当我: 困惑\ntitle: 不能注入');addInput(mm,'pwo','分享者: A\ncat: 不能注入');app.ui.S.pkw='原来的筛选';app.ui.S.pmiss=true;app.ui.A['new-prompt-ok']();
 const p=app.D.PROMPTS.at(-1);assert.equal(p.title,'自己的: 名称');assert.equal(p.body,'改过的正文');assert.equal(p.when,'当我: 困惑\ntitle: 不能注入');assert.equal(p.source,'分享者: A\ncat: 不能注入');assert.equal(p.cat,'未分类');assert.equal(app.ui.S.pkw,'');assert.equal(app.ui.S.pmiss,false);
 const success=app.nodes.get('#layer').children.at(-1);assert.match(success.innerHTML,/提示词已保存/);assert.match(success.innerHTML,/立即使用/);
});
test('prompt field blocks are parsed once and ordinary Markdown separators remain literal',()=>{
 const app=load(),mm=addForm(app),nested='---\n普通正文\n---\n接下来的正文';
 addInput(mm,'pwb','---\ntitle: 文件名称\ncat: 分享\n---\n'+nested,'insertFromPaste');assert.equal(mm.querySelector('#pwb').value,nested);assert.equal(mm.querySelector('#pwt').value,'文件名称');
 addInput(mm,'pwb',nested+'继续');assert.equal(mm.querySelector('#pwb').value,nested+'继续');app.ui.A['new-prompt-ok']();assert.equal(app.D.PROMPTS.at(-1).body,nested+'继续');
 const ordinary=app.ui.pwParse('---\n不是元数据\n---\n正文','','');assert.equal(ordinary.body,'---\n不是元数据\n---\n正文');assert.equal(app.ui.pwParse('---\ntitle: 只有名字\n---\n','',''),null);
});
test('only URL is explained, and duplicate bodies require an explicit retained copy',()=>{
 const app=load(),mm=addForm(app),count=app.D.PROMPTS.length;
 addInput(mm,'pwb','https://example.com/shared');app.ui.A['new-prompt-ok']();assert.equal(app.D.PROMPTS.length,count);assert.match(mm.querySelector('#pwa-status').textContent,/提示词正文/);
 addInput(mm,'pwb',app.D.PROMPTS[0].body);addInput(mm,'pwt','另一名称');app.ui.A['new-prompt-ok']();assert.equal(app.D.PROMPTS.length,count);assert.match(mm.querySelector('#pwa-duplicate').innerHTML,/查看已有/);assert.match(mm.querySelector('#pwa-duplicate').innerHTML,/仍保存为副本/);
 app.ui.A['pw-save-copy']();assert.equal(app.D.PROMPTS.length,count+1);assert.equal(app.D.PROMPTS.at(-1).body,app.D.PROMPTS[0].body);
});
test('clipboard failure gives a paste instruction; pending and cancelled reads never replace text',async()=>{
 const app=load(),mm=addForm(app);app.ctx.navigator.clipboard={readText:async()=>{throw Error('denied');}};await app.ui.A['pw-paste']();assert.equal(mm.querySelector('#pwb').focused,true);assert.match(mm.querySelector('#pwa-status').textContent,/Ctrl \/ ⌘ \+ V/);
 let resolve;app.ctx.navigator.clipboard={readText:()=>new Promise(r=>resolve=r)};const read=app.ui.A['pw-paste']();addInput(mm,'pwb','读取期间我自己写的');resolve('较晚的剪贴板');await read;assert.equal(mm.querySelector('#pwb').value,'读取期间我自己写的');
 addInput(mm,'pwb','');const cancelled=app.ui.A['pw-paste']();app.ui.closeModal();const next=addForm(app);resolve('取消后的文字');await cancelled;assert.equal(next.querySelector('#pwb').value,'');
 addInput(next,'pwb','已经写好的正文');await app.ui.A['pw-paste']();assert.equal(next.querySelector('#pwb').value,'已经写好的正文');assert.match(next.querySelector('#pwa-status').textContent,/已有内容/);
});
test('draft stays in memory and failed persistence keeps the editable dialog without success',()=>{
 const app=load(),mm=addForm(app);addInput(mm,'pwb','保留草稿正文');addInput(mm,'pwt','保留草稿名称');app.ui.closeModal();const again=addForm(app);assert.equal(again.querySelector('#pwb').value,'保留草稿正文');assert.equal(again.querySelector('#pwt').value,'保留草稿名称');assert.ok(!String(app.ctx.localStorage.getItem(app.W.key)).includes('保留草稿正文'));
 const count=app.D.PROMPTS.length;app.ctx.localStorage.setItem=()=>{throw Error('quota');};app.ui.A['new-prompt-ok']();assert.equal(app.D.PROMPTS.length,count);assert.equal(again.id,'m-live');assert.equal(again.querySelector('#pwb').value,'保留草稿正文');assert.match(again.querySelector('#pwa-status').textContent,/保存失败/);assert.doesNotMatch(again.innerHTML,/提示词已保存/);
});
test('multiple txt/md files are previewed, errors remain visible and duplicate copies need confirmation',async()=>{
 const app=load(),count=app.D.PROMPTS.length,existing=app.D.PROMPTS[0];
 await app.ui.pwFiles([
  {name:'第一份.txt',size:12,text:async()=> '第一份完整正文'},
  {name:'重复.md',size:12,text:async()=>existing.body},
  {name:'空.txt',size:0,text:async()=>''},
  {name:'过大.md',size:1024*1024+1,text:async()=>{throw Error('must not read');}},
  {name:'损坏.txt',size:10,text:async()=>{throw Error('无法读取');}}
 ]);
 assert.equal(app.D.PROMPTS.length,count);const preview=app.nodes.get('#layer').children.at(-1);assert.match(preview.innerHTML,/可保存 2 条/);assert.match(preview.innerHTML,/正文为空/);assert.match(preview.innerHTML,/超过 1 MiB/);assert.match(preview.innerHTML,/无法读取/);assert.match(preview.innerHTML,/重复/);
 app.ui.closeModal();app.ui.A['new-prompt']({dataset:{}});assert.match(app.nodes.get('#layer').children.at(-1).innerHTML,/检查要添加的提示词/);
 app.ui.A['pw-batch-save']();assert.equal(app.D.PROMPTS.length,count+2);assert.equal(app.D.PROMPTS.at(-2).body,'第一份完整正文');assert.equal(app.D.PROMPTS.at(-1).body,existing.body);
});
test('cancelled file reads do not overwrite a new draft and directory reads enforce the same limits',async()=>{
 const app=load();let resolve;const waiting=app.ui.pwFiles([{name:'晚到.txt',size:10,text:()=>new Promise(r=>resolve=r)}]);app.ui.closeModal();const next=addForm(app);addInput(next,'pwb','新的草稿');resolve('旧文件正文');await waiting;assert.equal(next.querySelector('#pwb').value,'新的草稿');
 app.ui.closeModal();let reads=0;const entry={isFile:true,name:'大.txt',file(ok){ok({name:'大.txt',size:1024*1024+1,text:async()=>{reads++;return '不读取';}});}};const directory={isDirectory:true,name:'分类',createReader(){let first=true;return {readEntries(ok){ok(first ? (first=false,[entry]) : []);}};}};
 await app.ui.pwDrop({dataTransfer:{items:[{webkitGetAsEntry:()=>directory}]}});assert.equal(reads,0);assert.match(app.nodes.get('#layer').children.at(-1).innerHTML,/超过 1 MiB/);
});
test('variable helper replaces only a valid retained selection and the use dialog reads body before fields',()=>{
 const app=load(),mm=addForm(app),box=addInput(mm,'pwb','请解释我不理解的概念。');box.selectionStart=3;box.selectionEnd=9;box.onselect();app.ui.A['pw-variable']();assert.equal(mm.querySelector('#pwa-variable').hidden,false);
 mm.querySelector('#pwa-field-name').value='坏|名称';app.ui.A['pw-variable-ok']();assert.equal(box.value,'请解释我不理解的概念。');
 mm.querySelector('#pwa-field-name').value='我的概念';app.ui.A['pw-variable-ok']();assert.equal(box.value,'请解释{{我的概念}}念。');app.ui.A['new-prompt-ok']();const p=app.D.PROMPTS.at(-1);app.ui.A['pw-copy']({dataset:{id:p.id}});const html=app.ui.getPromptUse().mm.innerHTML;assert.ok(html.indexOf('class="pw-output"')<html.indexOf('class="pw-inputs"'));assert.match(html,/填写后，这里会自动更新/);assert.equal(app.D.pfill(p)[0].k,'我的概念');
});
test('clipboard read timeout releases retry, ignores late results and cannot invalidate newer file reads',async()=>{
 const app=load(),mm=addForm(app);let fireTimeout,latePaste,finishFile;
 app.ctx.setTimeout=(fn,ms)=>{if(ms===2500)fireTimeout=fn;return 9;};
 app.ctx.navigator.clipboard={readText:()=>new Promise(r=>latePaste=r)};
 const pending=app.ui.A['pw-paste']();assert.equal(app.ui.getPromptAdd().pasteBusy,true);fireTimeout();await pending;
 assert.equal(app.ui.getPromptAdd().pasteBusy,false);assert.match(mm.querySelector('#pwa-status').textContent,/Ctrl \/ ⌘ \+ V/);
 latePaste('超时以后才到的文字');await Promise.resolve();assert.equal(mm.querySelector('#pwb').value,'');
 app.ctx.navigator.clipboard={readText:async()=> '重试得到的正文'};await app.ui.A['pw-paste']();assert.equal(mm.querySelector('#pwb').value,'重试得到的正文');
 addInput(mm,'pwb','');app.ctx.navigator.clipboard={readText:()=>new Promise(r=>latePaste=r)};
 const paste=app.ui.A['pw-paste'](),file=app.ui.pwFiles([{name:'后来选择.txt',size:10,text:()=>new Promise(r=>finishFile=r)}]);
 latePaste('先前剪贴板');await paste;finishFile('后来选择的文件正文');await file;assert.equal(mm.querySelector('#pwb').value,'后来选择的文件正文');
});
test('a URL-only file is a visible per-file error while other valid files can still be confirmed',async()=>{
 const app=load(),before=app.D.PROMPTS.length;
 await app.ui.pwFiles([{name:'链接.txt',size:40,text:async()=> 'https://example.com/prompt'},{name:'可用.txt',size:20,text:async()=> '这是一份可用的正文'}]);
 const preview=app.nodes.get('#layer').children.at(-1);assert.match(preview.innerHTML,/可保存 1 条/);assert.match(preview.innerHTML,/文件里只有链接/);assert.equal(app.D.PROMPTS.length,before);
 app.ui.A['pw-batch-save']();assert.equal(app.D.PROMPTS.length,before+1);assert.equal(app.D.PROMPTS.at(-1).body,'这是一份可用的正文');
});

test('media template filters show eleven general and four AI templates and details expose actionable design rules',()=>{
 const {ui,D,nodes}=load();ui.S.page='templates';ui.render();let html=nodes.get('#body').innerHTML;assert.match(html,/通用自媒体<span class="c">11/);assert.match(html,/AI 自媒体<span class="c">4/);
 ui.A['tpl-audience']({dataset:{k:'ai'}});html=nodes.get('#body').innerHTML;assert.ok(html.includes('data-tpl="builtin-agent"'));assert.ok(!html.includes('data-tpl="builtin-geometry"'));
 const t=D.TEMPLATES.find(x=>x.id==='builtin-agent');ui.S.page='template';ui.S.tid=t.id;ui.render();html=nodes.get('#body').innerHTML;for(const text of ['区域拆解','结构固定','内容可改','提示词骨架与变量','容易翻车','看图逐项验收','制作来源与检查说明','不代表新标题还原测试通过'])assert.ok(html.includes(text),text);
});
test('cover automatically carries the selected template PNG style and keeps other references scoped to this project',()=>{
 const {ui,W,D}=load(),p=D.PROJECTS.find(x=>x.kind==='内容'),t=D.TEMPLATES.find(x=>W.isBuiltinTemplate(x)),other=D.TEMPLATES.find(x=>W.isBuiltinTemplate(x)&&x.id!==t.id);
 ui.openCoverSetup(p);ui.A['cv-tpl']({dataset:{k:t.id}});const ref=W.referenceChoices(t,p).find(a=>a.kind==='ai');assert.deepEqual(Array.from(ui.getCover().ref),Array.from(W.styleReferences(t,p),a=>a.id));
 ui.startCover(p,t,['方图'],1,'本次明确的长标题',ui.getCover().ref);const request=D.TASKS.at(-1).request;assert.equal(request.references[0].id,ref.id);assert.equal(request.references[0].version,ref.version);assert.equal(request.options.title,'本次明确的长标题');assert.ok(!JSON.stringify(request).includes('.svg'));
 ui.A['cv-tpl']({dataset:{k:other.id}});const next=W.referenceChoices(other,p).find(a=>a.kind==='ai');assert.deepEqual(Array.from(ui.getCover().ref),Array.from(W.styleReferences(other,p),a=>a.id));const second=D.PROJECTS.find(x=>x.kind==='内容'&&x.id!==p.id);ui.openCoverSetup(second);assert.ok(!ui.getCover().ref.includes(ref.id));assert.equal(ui.getCover().pixels,'');
});
test('template failure preserves an explicit reason and passing review requires all five checks',()=>{
 const {ui,W,D,nodes}=load(),t=D.TEMPLATES[0];W.rules(t,{fixed:['真实规则'],varies:[],evidence:[{sourceIndex:0,rule:'原图证据'}]});t.validation={restoreImage:'data:image/png;base64,aGVsbG8=',accepted:false};t.state='待验收';W.commit();
 ui.A['template-accept']({dataset:{id:t.id}});let mm=nodes.get('#layer').children.at(-1);for(const key of ['title','readability','boundary','rules','identity'])mm.querySelector('#review-'+key).value='unclear';assert.equal(t.state,'待验收');
 ui.A['template-review-save']({dataset:{id:t.id}});assert.equal(t.state,'待验收');
 ui.A['template-fail']({dataset:{id:t.id}});mm=nodes.get('#layer').children.at(-1);for(const key of ['title','readability','boundary','rules','identity'])mm.querySelector('#review-'+key).value='unclear';mm.querySelector('#review-reason').value='标题第二个字看不清，需要重新排字';ui.A['template-fail-save']({dataset:{id:t.id}});assert.equal(D.tplOf(t.id).state,'失败');assert.equal(D.tplOf(t.id).review.reason,'标题第二个字看不清，需要重新排字');
});
test('v2 draft DOM offers explicit reference update, then selects real AI style asset without changing historical task',()=>{
 const {ui,W,D,nodes}=load(),draft=JSON.parse(JSON.stringify(require('../builtin-templates/legacy-v2-draft.json').templates.find(t=>t.id==='builtin-agent')));Object.assign(draft,{state:'可用',evidence:[],restoreTest:false,sample:false});const b=W.snapshot();b.data.TEMPLATES[b.data.TEMPLATES.findIndex(t=>t.id===draft.id)]=draft;W.importBackup(JSON.stringify(b));const p=D.PROJECTS.find(x=>x.kind==='内容'),t=D.tplOf(draft.id);ui.openCoverSetup(p);ui.A['cv-tpl']({dataset:{k:t.id}});assert.equal(ui.getCover().ref.length,0);assert.ok(!W.referenceChoices(t,p).some(a=>a.kind==='ai'));
 const oldRef=W.referenceChoices(t,p).find(a=>a.kind==='template');ui.startCover(p,t,['方图'],1,'旧任务原图参考',[oldRef.id]);const oldTask=D.TASKS.at(-1),oldJson=JSON.stringify(oldTask);ui.S.page='template';ui.S.tid=t.id;ui.render();let html=nodes.get('#body').innerHTML;assert.match(html,/更新内置定义/);assert.match(html,/已有任务仍保留原版快照|任务仍保留原版快照/);assert.equal(t.generatedReferences.length,0);
 ui.A['builtin-update']({dataset:{id:t.id}});assert.equal(t.generatedReferences.length,2);assert.equal(JSON.stringify(oldTask),oldJson);assert.equal(t.history.at(-1).definition.generatedReferences.length,0);html=nodes.get('#body').innerHTML;assert.ok(!html.includes('data-act="builtin-update"'));assert.match(html,/图库\/AI参考\/agent-v2.png/);
 ui.openCoverSetup(p);ui.A['cv-tpl']({dataset:{k:t.id}});const ai=W.referenceChoices(t,p).find(a=>a.kind==='ai');assert.ok(ai);assert.deepEqual(Array.from(ui.getCover().ref),Array.from(W.styleReferences(t,p),a=>a.id));ui.A['cv-ref']({dataset:{k:ai.id}});assert.equal(ui.getCover().ref.length,1);ui.A['cv-ref']({dataset:{k:ai.id}});ui.startCover(p,t,['方图'],1,'显式选择AI风格',[ai.id]);const request=D.TASKS.at(-1).request;assert.equal(request.references[0].id,'builtin-agent-ai-reference-v2');assert.equal(request.references[0].version,2);assert.match(request.references[0].note,/待人工验收/);assert.equal(JSON.stringify(oldTask),oldJson);
});
function restorationFixture() {
 const env=load(),{ctx,node,ui,W,D}=env;let chooser;
 const create=ctx.document.createElement;ctx.document.createElement=tag=>{if(tag==='input'){const i=node();i.click=()=>{};chooser=i;return i;}return create(tag);};
 ctx.FileReader=class{readAsDataURL(){this.result='data:image/png;base64,aGVsbG8=';this.onload();}};ctx.Image=class{set src(value){this.naturalWidth=900;this.naturalHeight=1200;this.onload();}};
 const t=D.TEMPLATES[0];W.transact(()=>W.rules(t,{fixed:['标题留白'],varies:[],evidence:[{sourceIndex:0,rule:'标题与主体分区'}]}));
 const start=()=>{ui.A['restore-template']({dataset:{id:t.id}});const id=D.TASKS.at(-1).id;ui.A['task-accept']({dataset:{id}});return id;};
 const importImage=async()=>{ui.A['restore-import']({dataset:{id:t.id}});const i=chooser;i.files=[{name:'restore.png',size:5,type:'image/png',arrayBuffer:async()=>new Uint8Array([1,2,3,4,5]).buffer}];await i.onchange();};
 const pass=()=>{const mm=env.nodes.get('#layer').children.at(-1);for(const k of ['title','readability','boundary','rules','identity'])mm.querySelector('#review-'+k).value='pass';mm.querySelector('#review-reason').value='逐项对照完成';};
 return {...env,tid:t.id,start,importImage,pass,chooser:()=>chooser};
}
test('older same-version restoration task cannot accept a newer imported candidate',async()=>{
 const {ui,W,D,nodes,tid,start,importImage,pass}=restorationFixture(),first=start();await importImage();const firstRestore=D.tplOf(tid).validation.restoreId;assert.equal(D.TASKS.find(t=>t.id===first).state,'review');
 const second=start();await importImage();const currentRestore=D.tplOf(tid).validation.restoreId;assert.notEqual(firstRestore,currentRestore);const before=JSON.stringify(W.snapshot().data);
 ui.A['task-success']({dataset:{id:first}});assert.equal(JSON.stringify(W.snapshot().data),before);assert.equal(D.tplOf(tid).validation.accepted,false);assert.equal(D.TASKS.find(t=>t.id===first).state,'review');assert.equal(D.TASKS.find(t=>t.id===second).state,'review');assert.ok(!nodes.get('#layer').children.at(-1).templateReview);ui.A['task-open']({dataset:{id:first}});assert.match(nodes.get('#layer').children.at(-1).innerHTML,/当前还原图不能作为旧任务的产物/);
 ui.A['task-success']({dataset:{id:second}});pass();ui.A['template-review-save']({dataset:{id:tid}});assert.equal(D.tplOf(tid).validation.restoreId,currentRestore);assert.equal(D.tplOf(tid).validation.accepted,true);assert.equal(D.TASKS.find(t=>t.id===second).state,'success');assert.equal(D.TASKS.find(t=>t.id===first).state,'review');
});
test('review modal pins restoration candidate and template version until save',async()=>{
 const {ui,W,D,tid,start,importImage,pass}=restorationFixture(),first=start();await importImage();ui.A['task-success']({dataset:{id:first}});pass();
 W.transact(()=>{D.tplOf(tid).validation.restoreId='replacement-while-review-open';});const before=JSON.stringify(W.snapshot().data);ui.A['template-review-save']({dataset:{id:tid}});assert.equal(JSON.stringify(W.snapshot().data),before);assert.equal(D.tplOf(tid).validation.accepted,false);assert.equal(D.TASKS.find(t=>t.id===first).state,'review');
 ui.A['template-accept']({dataset:{id:tid}});pass();W.transact(()=>W.rules(D.tplOf(tid),{fixed:['新版规则'],varies:[],evidence:[{sourceIndex:0,rule:'新版依据'}]}));const changed=JSON.stringify(W.snapshot().data);ui.A['template-review-save']({dataset:{id:tid}});assert.equal(JSON.stringify(W.snapshot().data),changed);assert.equal(D.tplOf(tid).state,'待还原');assert.equal(D.TASKS.find(t=>t.id===first).state,'review');
});
test('old running restoration request cannot import into a newer template or relabel its result version',async()=>{
 const {ui,W,D,tid,start,chooser}=restorationFixture(),old=start(),requestVersion=D.TASKS.find(t=>t.id===old).request.templateVersion;W.transact(()=>W.rules(D.tplOf(tid),{fixed:['新版规则'],varies:[],evidence:[{sourceIndex:0,rule:'新版依据'}]}));const before=JSON.stringify(W.snapshot().data);
 ui.A['restore-import']({dataset:{id:tid}});assert.equal(chooser(),undefined);assert.equal(JSON.stringify(W.snapshot().data),before);assert.equal(D.tplOf(tid).validation,null);assert.equal(D.TASKS.find(t=>t.id===old).state,'running');assert.equal(D.TASKS.find(t=>t.id===old).request.templateVersion,requestVersion);assert.equal(D.TASKS.find(t=>t.id===old).result,undefined);
});
test('restoration file picker rejects a template version change while the file is being selected',async()=>{
 const {ui,W,D,tid,start,chooser}=restorationFixture(),old=start();ui.A['restore-import']({dataset:{id:tid}});const input=chooser();assert.ok(input);W.transact(()=>W.rules(D.tplOf(tid),{fixed:['选择文件时的新规则'],varies:[],evidence:[{sourceIndex:0,rule:'新版依据'}]}));const before=JSON.stringify(W.snapshot().data);input.files=[{name:'old.png',size:5,type:'image/png',arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer}];await input.onchange();assert.equal(JSON.stringify(W.snapshot().data),before);assert.equal(D.tplOf(tid).validation,null);assert.equal(D.TASKS.find(t=>t.id===old).state,'running');assert.equal(D.TASKS.find(t=>t.id===old).result,undefined);
});

test('builtin gallery uses fifteen finished PNG previews and keeps unfinished demos out of cover selection',()=>{
 const {ui,W,D,nodes}=load();ui.S.page='templates';ui.render();const html=nodes.get('#body').innerHTML,builtins=D.TEMPLATES.filter(t=>W.isBuiltinTemplate(t));assert.equal(builtins.length,15);
 assert.ok(html.indexOf('data-tpl="builtin-geometry"')<html.indexOf('历史演示模板'));
 for(const t of builtins){assert.equal(t.state,'可用');assert.match(t.img,/\.png$/);assert.ok(html.includes(t.img));ui.S.page='template';ui.S.tid=t.id;ui.render();assert.ok(!nodes.get('#body').innerHTML.includes('data-act="analyze-template"'));}
 const p=D.PROJECTS.find(x=>x.kind==='内容');ui.openCoverSetup(p);const body=nodes.get('#layer').children.at(-1).querySelector('.modal-b').innerHTML;assert.ok(!body.includes('data-k="tpl-banner"'));assert.ok(!body.includes('data-k="tpl-quote"'));
});
test('cover submit keeps either its single bridge or an explicit per-size selector open',()=>{
 const {ui,W,D,nodes}=load(),t=D.TEMPLATES.find(t=>W.isBuiltinTemplate(t)),p=D.PROJECTS.find(p=>p.kind==='内容');ui.openCoverSetup(p);ui.A['cv-tpl']({dataset:{k:t.id}});const n=ui.getCover().sizes.length;ui.A['cv-go']();let m=nodes.get('#layer').children.at(-1);assert.equal(m.id,'m-live');if(n>1){assert.match(m.innerHTML,/本批封面任务/);const option=m.querySelector('[data-act="task-pick"]');ui.A['task-pick'](option);ui.A['task-picker-go']();m=nodes.get('#layer').children.at(-1);}assert.match(m.innerHTML,/交接到WorkBuddy/);assert.equal(ui.getCover(),null);
});
test('unsupported original-session resume falls back to a new bridge in the same selected assistant',()=>{
 const {ui,D,nodes}=load(),task=D.TASKS.find(t=>t.host==='workbuddy');task.conv='original-session';const before=JSON.stringify(task);ui.A['task-bridge']({dataset:{id:task.id}});const html=nodes.get('#layer').children.at(-1).innerHTML;assert.match(html,/workbuddy:\/\/task/);assert.ok(!html.includes('RESUME_UNAVAILABLE'));assert.equal(JSON.stringify(task),before);
});

test('a trusted builtin explicitly marked failed keeps its status and update path without claiming usability',()=>{
 const {ui,W,D,nodes}=load(),old=JSON.parse(JSON.stringify(require('../builtin-templates/legacy-v2-complete.json').templates.find(t=>t.id==='builtin-agent')));Object.assign(old,{state:'失败',evidence:[],restoreTest:false,sample:false});const backup=W.snapshot();backup.data.TEMPLATES[backup.data.TEMPLATES.findIndex(t=>t.id===old.id)]=old;W.importBackup(JSON.stringify(backup));ui.S.page='template';ui.S.tid=old.id;ui.render();const html=nodes.get('#body').innerHTML;assert.equal(W.isTemplateUsable(D.tplOf(old.id)),false);assert.match(html,/失败 · 从“当前步骤”继续/);assert.match(html,/更新内置定义/);assert.ok(!html.includes('<span class="tag ok">可直接使用</span>'));
});

test('six imported samples are one default group, person and candidates survive switching, and result count stays independent',()=>{
 const {ui,W,D,nodes}=load(),p=D.PROJECTS.find(p=>p.kind==='内容'),base=D.TEMPLATES.find(t=>!W.isBuiltinTemplate(t)),t=JSON.parse(JSON.stringify(base));
 Object.assign(t,{id:'my-six-samples',sample:false,builtin:false,version:1,shots:Array.from({length:6},(_,i)=>'data:image/png;base64,'+Buffer.from('sample-'+i).toString('base64')),state:'可用',fixed:['共同字体与配色'],varies:['组内布局'],evidence:[{sourceIndex:0,rule:'第一张依据'}],validation:{restoreImage:photoPng.toString('base64').replace(/^/,'data:image/png;base64,'),accepted:true}});t.img=t.shots[0];D.TEMPLATES.push(t);W.commit();
 W.addPhotos([{id:'group-person',name:'本人.png',img:'data:image/png;base64,'+photoPng.toString('base64'),bytes:photoPng.length,px:[1,1],sha256:''}]);p.tpl=t.id;
 ui.openCoverSetup(p);assert.equal(ui.getCover().ref.length,7);assert.equal(ui.getCover().count,4);assert.match(nodes.get('#layer').children.at(-1).querySelector('.modal-b').innerHTML,/本组使用 6 \/ 6 张样张 · 生成数量在上方独立设置/);
 const group=Array.from(W.styleReferences(t,p));ui.A['cv-ref']({dataset:{k:group[0].id}});assert.match(nodes.get('#layer').children.at(-1).querySelector('.modal-b').innerHTML,/已取消部分组内样张/);
 ui.A['cv-ref']({dataset:{k:group[0].id}});ui.startCover(p,t,['方图'],3,'多构图候选',ui.getCover().ref);const req=D.TASKS.at(-1).request;assert.equal(req.references.length,7);assert.equal(req.options.count,3);assert.match(req.rules.fixed.join(' '),/样张数量不等于成品数量/);assert.equal(W.requestReferenceSources(req).length,7);assert.ok(!JSON.stringify(req).includes('base64'));
 ui.openCoverSetup(p);const candidate=p.materials.flatMap(m=>Array.from(D.candsOf(m))).find(c=>c.img);assert.ok(candidate);candidate.fav=true;ui.A['cv-ref']({dataset:{k:candidate.id}});const other=D.TEMPLATES.find(W.isBuiltinTemplate);ui.A['cv-tpl']({dataset:{k:other.id}});assert.equal(ui.getCover().ref.length,4);assert.ok(ui.getCover().ref.includes('group-person'));assert.ok(ui.getCover().ref.includes(candidate.id));assert.equal(ui.getCover().ref.filter(id=>group.some(r=>r.id===id)).length,0);
 ui.S.page='template';ui.S.tid=t.id;ui.render();const before=JSON.stringify(t);ui.A['tpl-browse']({dataset:{id:t.id,i:'4'}});assert.equal(JSON.stringify(t),before);assert.match(nodes.get('#body').innerHTML,/5 \/ 6/);assert.match(nodes.get('#body').innerHTML,/aria-label="查看样张 5" aria-pressed="true"/);
});

test('reference export uses request IDs and original template version after a builtin group update',async()=>{
 const app=load(),{ui,W,D}=app,old=JSON.parse(JSON.stringify(require('../builtin-templates/legacy-v3.json').templates.find(t=>t.id==='builtin-agent')));Object.assign(old,{state:'可用',evidence:[],restoreTest:false,sample:false});
 const backup=W.snapshot();backup.data.TEMPLATES[backup.data.TEMPLATES.findIndex(t=>t.id===old.id)]=old;W.importBackup(JSON.stringify(backup));const p=D.PROJECTS.find(p=>p.kind==='内容'),t=D.tplOf(old.id),ref=W.styleReferences(t,p)[0];ui.startCover(p,t,['方图'],1,'旧版样张',[ref.id]);const req=D.TASKS.at(-1).request,frozen=JSON.stringify(req);
 W.transact(()=>W.updateBuiltin(t));const sources=W.requestReferenceSources(req);assert.equal(sources.length,1);assert.equal(sources[0].img,old.generatedReferences[0].path);assert.equal(JSON.stringify(req),frozen);
 const fetched=[],names=[],archives=[];app.ctx.fetch=async src=>{fetched.push(src);return {ok:true,blob:async()=>new Blob(['PNG'],{type:'image/png'})};};app.ctx.URL=class extends URL{static createObjectURL(blob){archives.push(blob);return 'blob:sample';}static revokeObjectURL(){}};const create=app.ctx.document.createElement;app.ctx.document.createElement=tag=>{const el=create(tag);if(tag==='a')el.click=()=>names.push(el.download);return el;};
 await ui.A['reference-export']({dataset:{scope:'handoff'}});assert.deepEqual(fetched,[old.generatedReferences[0].path]);assert.deepEqual(names,[req.requestId+'.zip']);const packed=await require('./zip-tools.cjs')(archives[0]);assert.deepEqual([...packed.keys()],[ref.id+'.png']);assert.deepEqual(packed.get(ref.id+'.png'),Buffer.from('PNG'));
});

test('a group above the reference budget stays intact and requires explicit deselection before submission',()=>{
 const {ui,W,D,nodes}=load(),p=D.PROJECTS.find(p=>p.kind==='内容'),t=JSON.parse(JSON.stringify(D.TEMPLATES.find(t=>!W.isBuiltinTemplate(t))));Object.assign(t,{id:'over-budget-group',sample:false,builtin:false,version:1,state:'可用',shots:Array.from({length:33},(_,i)=>'data:image/png;base64,'+Buffer.from('budget-'+i).toString('base64')),fixed:['同组规则'],varies:[],evidence:[{sourceIndex:0,rule:'样图依据'}],validation:{restoreImage:'data:image/png;base64,YQ==',accepted:true}});t.img=t.shots[0];D.TEMPLATES.push(t);p.tpl=t.id;W.commit();ui.openCoverSetup(p);assert.equal(ui.getCover().ref.length,33);assert.match(nodes.get('#layer').children.at(-1).querySelector('.modal-f').innerHTML,/参考超过 32 张，请取消部分参考/);
 const before=JSON.stringify(W.snapshot());ui.A['cv-go']();assert.match(nodes.get('#toasts').children.at(-1).innerHTML,/超过 32 张/);assert.equal(ui.getCover().p,D.byId(p.id));assert.equal(JSON.stringify(W.snapshot()),before);ui.A['cv-ref']({dataset:{k:ui.getCover().ref[0]}});assert.equal(ui.getCover().ref.length,32);ui.A['cv-go']();assert.equal(D.TASKS.at(-1).request.references.length,32);
});

test('template card downloads its whole group even when another project remains selected',async()=>{
 const app=load(),{ui,W,D,nodes}=app,t=D.TEMPLATES.find(W.isBuiltinTemplate),p=D.PROJECTS.find(p=>p.kind==='内容');ui.S.pid=p.id;ui.S.page='templates';ui.render();const el=nodes.get('#body').querySelectorAll('[data-act="dl"]').find(el=>el.dataset.tid===t.id);assert.ok(el);
 const fetched=[];app.ctx.fetch=async src=>{fetched.push(src);return {ok:true,blob:async()=>new Blob(['PNG'],{type:'image/png'})};};app.ctx.URL=class extends URL{static createObjectURL(){return 'blob:group';}static revokeObjectURL(){}};await ui.A['dl'](el);assert.deepEqual(fetched,Array.from(W.templateSamples(t)));
});

test('custom candidate count does not leave a stale generated count beside the sample group',()=>{
 const {ui,W,D,nodes}=load(),p=D.PROJECTS.find(p=>p.kind==='内容'),t=D.TEMPLATES.find(W.isBuiltinTemplate);ui.openCoverSetup(p);ui.A['cv-tpl']({dataset:{k:t.id}});ui.A['cv-nc']();ui.A['cv-cnt']({value:'13'});const m=nodes.get('#layer').children.at(-1);assert.match(dialogFoot(m),/<b>13<\/b> 张/);assert.ok(!m.querySelector('.modal-b').innerHTML.includes('每版生成 4 张'));assert.match(m.querySelector('.modal-b').innerHTML,/生成数量在上方独立设置/);
});

test('rejected person replacement over budget preserves the prior person until references are reduced',()=>{
 const {ui,W,D}=load(),p=D.PROJECTS.find(p=>p.kind==='内容'),t=JSON.parse(JSON.stringify(D.TEMPLATES.find(t=>!W.isBuiltinTemplate(t))));Object.assign(t,{id:'person-budget-group',sample:false,builtin:false,version:1,state:'可用',shots:Array.from({length:32},(_,i)=>'data:image/png;base64,'+Buffer.from('person-budget-'+i).toString('base64')),fixed:['同组规则'],varies:[],evidence:[{sourceIndex:0,rule:'样图依据'}],validation:{restoreImage:'data:image/png;base64,YQ==',accepted:true}});t.img=t.shots[0];D.TEMPLATES.push(t);p.tpl=t.id;W.commit();W.addPhotos(['person-a','person-b'].map(id=>({id,name:id+'.png',img:'data:image/png;base64,'+photoPng.toString('base64'),bytes:photoPng.length,px:[1,1]})));ui.openCoverSetup(p);assert.equal(ui.getCover().ref.length,33);const before=Array.from(ui.getCover().ref);ui.A['cv-person']({dataset:{k:'person-b'}});assert.deepEqual(Array.from(ui.getCover().ref),before);assert.equal(ui.getCover().personNone,false);ui.A['cv-ref']({dataset:{k:before.find(id=>!W.photoById(id))}});ui.A['cv-person']({dataset:{k:'person-b'}});assert.ok(ui.getCover().ref.includes('person-b'));assert.ok(!ui.getCover().ref.includes('person-a'));assert.equal(ui.getCover().ref.length,32);
});

test('group ZIP download happens once after every image validates and a failed image produces no partial archive',async()=>{
 const app=load(),{ui,W,D}=app,t=D.TEMPLATES.find(W.isBuiltinTemplate),samples=Array.from(W.templateSamples(t)),downloads=[],names=[];let failing='';
 app.ctx.fetch=async src=>({ok:src!==failing,blob:async()=>new Blob([Buffer.from(src)],{type:failing==='mime'&&src===samples[1]?'text/html':'image/png'})});app.ctx.URL=class extends URL{static createObjectURL(blob){downloads.push(blob);return 'blob:whole-group';}static revokeObjectURL(){}};const create=app.ctx.document.createElement;app.ctx.document.createElement=tag=>{const el=create(tag);if(tag==='a')el.click=()=>names.push(el.download);return el;};
 await ui.A['dl']({dataset:{tid:t.id}});assert.equal(downloads.length,1);assert.deepEqual(names,[t.id+'-v'+t.version+'-样张组.zip']);const packed=await require('./zip-tools.cjs')(downloads[0]),refs=Array.from(W.styleReferences(t,null));assert.deepEqual([...packed.keys()],refs.map(r=>r.id+'.png'));for(const r of refs)assert.deepEqual(packed.get(r.id+'.png'),Buffer.from(r.img));
 failing=samples[1];await assert.rejects(ui.A['dl']({dataset:{tid:t.id}}),/读取图片失败/);assert.equal(downloads.length,1);assert.equal(names.length,1);
 failing='mime';await assert.rejects(ui.A['dl']({dataset:{tid:t.id}}),/图片格式不正确/);assert.equal(downloads.length,1);assert.equal(names.length,1);
});

function dialogFoot(m) { return m.querySelector('.modal-f')?.innerHTML || (m.innerHTML.match(/<div class="modal-f">([\s\S]*)<\/div>$/)||[])[1] || ''; }
function addFlowTask(app,p,format='方图') {
 const {ui,W,D}=app,t=D.TEMPLATES.find(W.isBuiltinTemplate);ui.startCover(p,t,[format],1,'任务入口回归',[]);return D.TASKS.at(-1);
}
function setFlowTaskState(app,task,state) {
 const {W,D}=app;
 if(['review','success','partial'].includes(state)) {
  W.taskState(task,'running');const m=D.matOf(D.byId(task.pid),task.mid),b=m.batches.find(b=>b.requestId===task.request.requestId),c={id:W.uid('flow-candidate'),no:String(D.candsOf(m).length+1).padStart(2,'0'),img:'data:image/png;base64,'+photoPng.toString('base64'),px:[1,1],bytes:photoPng.length,sha256:'',srcPath:'内容/测试候选.png',store:'browser',use:false,fav:false,from:'测试图片'};
  b.cands.push(c);task.resultCount=1;task.result={requestId:task.request.requestId,candidates:[{id:c.id,px:c.px,bytes:c.bytes,sha256:''}]};W.taskState(task,'review');if(state!=='review')W.taskState(task,state);
 } else if(state!=='handoff')W.taskState(task,state);
 W.commit();
}

test('project has one state entry, keeps legacy demos in read-only history, and uses a summary when no real request exists',()=>{
 const app=load(),{ui,W,D,nodes}=app,p=D.byId('ph-1020') || D.PROJECTS.find(p=>p.kind==='内容');ui.S.page='project';ui.S.pid=p.id;ui.render();const html=nodes.get('#body').innerHTML;assert.equal((html.match(/data-act="project-tasks"/g)||[]).length,1);assert.ok(!html.includes('data-act="project-handoff"'));assert.ok(!html.includes('data-act="task-bridge"'));const before=JSON.stringify(W.snapshot().data);ui.A['project-tasks']({dataset:{id:p.id}});assert.match(nodes.get('#layer').children.at(-1).innerHTML,/交接到WorkBuddy/);assert.equal(JSON.stringify(W.snapshot().data),before);
 const legacy=D.TASKS.find(t=>t.pid===p.id&&!t.request);if(legacy){ui.A['task-open']({dataset:{id:legacy.id}});const m=nodes.get('#layer').children.at(-1);assert.match(m.innerHTML,/历史演示/);assert.ok(!m.innerHTML.includes('data-act="task-bridge"'));}
});

test('single real project tasks route by state and completed results never default to another handoff',()=>{
 for(const state of ['handoff','running','review','failed','interrupted','success','partial']) {
  const app=load(),{ui,W,D,nodes}=app,p=D.PROJECTS.find(p=>p.kind==='内容'),task=addFlowTask(app,p);setFlowTaskState(app,task,state);const before=JSON.stringify(W.snapshot().data);ui.A['project-tasks']({dataset:{id:p.id}});const m=nodes.get('#layer').children.at(-1),foot=dialogFoot(m);
  if(state==='handoff')assert.match(m.innerHTML,/交接到WorkBuddy/);else{assert.ok(m.innerHTML.includes(task.request.requestId));if(state==='running')assert.match(foot,/导入本任务候选图/);if(state==='review'){assert.ok(m.taskResultReview);assert.match(foot,/对照结果完成验收/);}if(['failed','interrupted'].includes(state))assert.match(foot,/重新交接到WorkBuddy/);if(['success','partial'].includes(state)){assert.ok(!m.innerHTML.includes('data-act="task-bridge"'));assert.ok(!foot.includes('class="btn p"'));}}
  assert.equal(JSON.stringify(W.snapshot().data),before,state);
 }
});

test('mixed project tasks are scoped, sorted without preselection, and keep completed history reachable',()=>{
 const app=load(),{ui,W,D,nodes}=app,p=D.PROJECTS.find(p=>p.kind==='内容'),other=D.PROJECTS.find(q=>q.kind==='内容'&&q.id!==p.id),handoff=addFlowTask(app,p),review=addFlowTask(app,p),running=addFlowTask(app,p),failed=addFlowTask(app,p),done=addFlowTask(app,p),foreign=addFlowTask(app,other);setFlowTaskState(app,review,'review');setFlowTaskState(app,running,'running');setFlowTaskState(app,failed,'failed');setFlowTaskState(app,done,'success');const before=JSON.stringify(W.snapshot().data);
 ui.A['project-tasks']({dataset:{id:p.id}});let m=nodes.get('#layer').children.at(-1),options=m.querySelectorAll('[data-act="task-pick"]');assert.deepEqual(options.map(el=>el.dataset.id),[review.id,running.id,handoff.id,failed.id]);assert.ok(options.every(el=>el.getAttribute('checked')===null));assert.ok(!m.innerHTML.includes(foreign.id));assert.ok(m.innerHTML.includes(done.id));assert.ok(/data-act="task-picker-go" disabled/.test(dialogFoot(m)));ui.A['task-picker-go']();assert.equal(JSON.stringify(W.snapshot().data),before);
 ui.A['task-pick'](options[0]);ui.A['task-picker-go']();m=nodes.get('#layer').children.at(-1);assert.equal(m.taskResultReview.taskId,review.id);assert.equal(JSON.stringify(W.snapshot().data),before);
 ui.S.page='today';ui.render();const html=nodes.get('#body').innerHTML;assert.ok(!html.includes('data-act="task-open" data-id="'+done.id+'"'));assert.ok(html.includes('data-act="task-open" data-id="'+running.id+'"'));
});

test('all-complete project entry selects existing results and preserves original session details',()=>{
 const app=load(),{ui,D,nodes}=app,p=D.PROJECTS.find(p=>p.kind==='内容'),a=addFlowTask(app,p),b=addFlowTask(app,p);setFlowTaskState(app,a,'success');setFlowTaskState(app,b,'partial');a.conv='historical-session';ui.A['project-tasks']({dataset:{id:p.id}});let m=nodes.get('#layer').children.at(-1);assert.match(m.innerHTML,/查看结果/);ui.A['task-pick']({dataset:{id:a.id}});ui.A['task-picker-go']();m=nodes.get('#layer').children.at(-1);assert.match(m.innerHTML,/historical-session/);assert.ok(!m.innerHTML.includes('data-act="task-bridge"'));assert.ok(!m.innerHTML.includes('data-act="task-import"'));
});

test('a multi-size cover batch exposes every newly created request and never silently launches its last task',()=>{
 const app=load(),{ui,W,D,nodes}=app,p=D.PROJECTS.find(p=>p.kind==='内容'),t=D.TEMPLATES.find(W.isBuiltinTemplate),before=D.TASKS.length;ui.startCover(p,t,['方图','竖版','横版'],1,'多尺寸全部可达',[]);const created=D.TASKS.slice(before);let m=nodes.get('#layer').children.at(-1);assert.equal(created.length,3);assert.equal(m.querySelectorAll('[data-act="task-pick"]').length,3);assert.equal(m.querySelector('#host-text'),null);
 for(const task of created){ui.A['project-tasks']({dataset:{id:p.id}});ui.A['task-pick']({dataset:{id:task.id}});ui.A['task-picker-go']();m=nodes.get('#layer').children.at(-1);assert.ok(m.querySelector('#host-text').value.includes(task.request.requestId));}assert.equal(D.TASKS.length,before+3);
});

test('cover empty and pending summaries are accurate and offer one creation action or a read-only task view',()=>{
 const app=load(),{ui,D,nodes}=app,p=D.PROJECTS.find(p=>p.kind==='内容');p.materials=[];p.posts=[];ui.S.page='project';ui.S.pid=p.id;ui.render();let html=nodes.get('#body').innerHTML;assert.equal((html.match(/data-act="make-cover"/g)||[]).length,1);assert.ok(!html.includes('出了的都挑了'));
 const task=addFlowTask(app,p);ui.render();html=nodes.get('#body').innerHTML;assert.match(html,/暂无候选/);assert.match(html,/1 批待交接/);assert.ok(!html.includes('出了的都挑了'));assert.ok(!html.includes('再出一批'));assert.match(html,/其他封面操作/);ui.A['project-cover-tasks']({dataset:{id:p.id}});const m=nodes.get('#layer').children.at(-1);assert.ok(m.innerHTML.includes(task.request.requestId));assert.ok(!m.innerHTML.includes('交接到WorkBuddy'));
});

test('task review only shows its own request batch and requires that actual batch to be opened before approval',()=>{
 const app=load(),{ui,W,D,nodes}=app,p=D.PROJECTS.find(p=>p.kind==='内容'),old=addFlowTask(app,p),task=addFlowTask(app,p);setFlowTaskState(app,old,'review');setFlowTaskState(app,task,'review');ui.A['task-open']({dataset:{id:old.id}});ui.A['task-success']({dataset:{id:task.id}});assert.equal(D.TASKS.find(t=>t.id===task.id).state,'review');
 ui.A['task-open']({dataset:{id:task.id}});const m=nodes.get('#layer').children.at(-1),current=D.TASKS.find(t=>t.id===task.id);assert.deepEqual(Array.from(m.taskResultReview.candidateIds),Array.from(current.result.candidates,c=>c.id));assert.ok(!m.taskResultReview.candidateIds.includes(old.result.candidates[0].id));ui.A['task-success']({dataset:{id:task.id}});assert.equal(D.TASKS.find(t=>t.id===task.id).state,'success');
});

function retryCover(app,count=1,expectedPixels=null) {
 const {ui,W,D,ctx}=app,p=D.PROJECTS.find(p=>p.kind==='内容'),t=D.TEMPLATES.find(W.isBuiltinTemplate),h=imageUploads(app),pixels=new Map();let picker;
 const create=ctx.document.createElement;ctx.document.createElement=tag=>{const el=create(tag);if(tag==='input')picker=el;return el;};
 ctx.Image=class {set src(value){Promise.resolve().then(()=>{[this.naturalWidth,this.naturalHeight]=pixels.get(value)||[1,1];this.onload();});}};
 if(expectedPixels){ui.openCoverSetup(p);ui.getCover().pixels=expectedPixels;}
 ui.startCover(p,t,['方图'],count,'重试导入',[]);const id=D.TASKS.at(-1).id;
 const task=()=>D.TASKS.find(t=>t.id===id),material=()=>D.matOf(D.byId(p.id),task().mid),current=()=>material().batches.find(b=>b.requestId===task().request.requestId);
 return {id,pid:p.id,task,material,current,file(name,px=[1,1]){const data=Buffer.concat([photoPng,Buffer.from(name)]);pixels.set('data:image/png;base64,'+data.toString('base64'),px);return h.file(name+'.png',data);},async import(files){ui.A['task-import']({dataset:{id}});picker.files=files;await picker.onchange();},act(name){ui.A['task-'+name]({dataset:{id}});}};
}

test('retry replaces bad-ratio candidates in a new attempt and preserves selected and published history across reload',async()=>{
 const app=load(),{ui,W,D,nodes}=app,r=retryCover(app);r.act('accept');assert.match(nodes.get('#layer').children.at(-1).innerHTML,/本次导入作为新一轮结果/);await r.import([r.file('错误比例',[2,1])]);r.act('success');assert.equal(r.task().state,'review');
 const original=r.current(),oldNo=original.no,oldId=original.cands[0].id;r.material().batches.forEach(b=>b.cands.forEach(c=>c.use=false));original.cands[0].use=true;original.cands[0].fav=true;const p=D.byId(r.pid),post=p.posts[0];post.mat=r.material().id;delete post.pub;W.publish(p,post,'2026-10-17','https://example.com/old');W.commit();assert.equal(post.pub.snapshot.candidateId,oldId);assert.equal(post.pub.snapshot.batch,oldNo);const published=JSON.stringify(post.pub);
 r.act('failed');r.act('accept');assert.equal(r.current().state,'failed');await r.import([r.file('正确比例')]);assert.equal(r.current().attempt,2);assert.equal(r.task().result.attempt,2);assert.equal(r.task().resultCount,1);assert.equal(r.task().result.candidates.length,1);assert.ok(!r.task().result.candidates.some(c=>c.id===oldId));r.act('success');assert.equal(r.task().state,'success');
 const old=r.material().batches.find(b=>b.no===oldNo);assert.equal(old.sourceRequestId,r.task().request.requestId);assert.equal(old.requestId,undefined);assert.equal(old.state,'failed');assert.equal(old.attempt,1);assert.equal(old.cands[0].id,oldId);assert.equal(old.cands[0].use,true);assert.equal(old.cands[0].fav,true);assert.equal(JSON.stringify(D.byId(r.pid).posts[0].pub),published);
 ui.A['versions']({dataset:{p:r.pid,id:r.material().id}});assert.match(nodes.get('#layer').children.at(-1).innerHTML,/历史导入（已被重试替换）/);ui.S.page='project';ui.S.pid=r.pid;ui.S.old[r.material().id]=true;ui.render();assert.match(nodes.get('#body').innerHTML,/历史导入 · 第 1 轮 · 原状态：失败/);
 const before=app.ctx.localStorage.getItem(W.key);for(const mutate of [b=>b.sourceRequestId='../bad',b=>b.attempt=0,b=>delete b.attempt,b=>b.requestId=b.sourceRequestId]){const backup=W.snapshot(),batch=backup.data.PROJECTS.find(p=>p.id===r.pid).materials.find(m=>m.id===r.material().id).batches.find(b=>b.no===oldNo);mutate(batch);assert.throws(()=>W.importBackup(JSON.stringify(backup)),/批次元数据/);assert.equal(app.ctx.localStorage.getItem(W.key),before);}
 const reloaded=load('disabled',app.storage),restored=reloaded.D.byId(r.pid);assert.equal(JSON.stringify(restored.posts[0].pub),published);assert.equal(restored.materials.find(m=>m.id===r.material().id).batches.find(b=>b.no===oldNo).cands[0].id,oldId);assert.equal(reloaded.D.TASKS.find(t=>t.id===r.id).state,'success');
});

test('repeated failed or interrupted imports isolate duplicate hashes and enforce each attempt count',async()=>{
 const app=load(),{ctx,W}=app,r=retryCover(app,2),a=r.file('同一文件'),b=r.file('第二文件');r.act('accept');await r.import([a]);const firstHash=r.current().cands[0].sha256;r.act('failed');r.act('accept');
 let before=JSON.stringify(W.snapshot().data);await r.import([a,a]);assert.equal(JSON.stringify(W.snapshot().data),before);assert.equal(r.current().attempt,1);assert.equal(r.task().state,'running');
 await r.import([a]);assert.equal(r.current().attempt,2);assert.equal(r.current().cands.length,1);assert.equal(r.current().cands[0].sha256,firstHash);assert.equal(r.task().resultCount,1);assert.equal(r.task().result.candidates.length,1);
 r.act('stop');r.act('accept');before=JSON.stringify(W.snapshot().data);await r.import([a,b,r.file('超量')]);assert.equal(JSON.stringify(W.snapshot().data),before);assert.equal(r.current().attempt,2);
 await r.import([a,b]);assert.equal(r.current().attempt,3);assert.equal(r.current().cands.length,2);assert.equal(r.task().resultCount,2);assert.equal(r.material().batches.filter(b=>b.sourceRequestId===r.task().request.requestId).length,2);r.act('success');assert.equal(r.task().state,'success');
 const partial=retryCover(load(),2);partial.act('accept');await partial.import([partial.file('仅第一轮一张')]);partial.act('failed');partial.act('accept');await partial.import([partial.file('第二轮也一张')]);partial.act('success');assert.equal(partial.task().state,'partial');assert.equal(partial.task().resultCount,1);assert.equal(partial.task().result.candidates.length,1);
});

test('retry import storage failure rolls back history creation and remains retryable without bypassing authorization',async()=>{
 const app=load('required'),{W,ctx}=app;W.setAuth('active');const r=retryCover(app),old=r.file('保留旧图');r.act('accept');await r.import([old]);r.act('failed');r.act('accept');const before=ctx.localStorage.getItem(W.key),saved=JSON.stringify(W.snapshot().data),set=ctx.localStorage.setItem;
 ctx.localStorage.setItem=()=>{throw Error('quota');};await r.import([r.file('配额失败')]);ctx.localStorage.setItem=set;assert.equal(ctx.localStorage.getItem(W.key),before);assert.equal(JSON.stringify(W.snapshot().data),saved);assert.equal(r.task().state,'running');assert.equal(r.current().attempt,1);
 W.setAuth('expired');r.act('import');assert.equal(ctx.localStorage.getItem(W.key),before);W.setAuth('active');await r.import([r.file('恢复后成功')]);assert.equal(r.current().attempt,2);r.act('success');assert.equal(r.task().state,'success');assert.equal(r.material().batches.find(b=>b.sourceRequestId===r.task().request.requestId).cands[0].sha256,require('node:crypto').createHash('sha256').update(old.data).digest('hex'));
});

test('retry recovers after repeated ratio and exact-pixel failures while earlier attempts remain historical',async()=>{
 const r=retryCover(load(),1,[100,100]);r.act('accept');await r.import([r.file('比例错误',[100,200])]);r.act('success');assert.equal(r.task().state,'review');r.act('failed');r.act('accept');
 await r.import([r.file('像素错误',[200,200])]);r.act('success');assert.equal(r.task().state,'review');r.act('stop');r.act('accept');await r.import([r.file('终于正确',[100,100])]);r.act('success');assert.equal(r.task().state,'success');assert.equal(r.task().result.attempt,3);assert.deepEqual(Array.from(r.material().batches.filter(b=>b.sourceRequestId===r.task().request.requestId),b=>b.state),['failed','interrupted']);
});

test('template current step does not advance old requests and keeps historical tasks readable',()=>{
 const app=load(),{ui,W,D,nodes}=app,t=D.TEMPLATES[0];ui.A['analyze-template']({dataset:{id:t.id}});const old=D.TASKS.at(-1);W.transact(()=>W.rules(t,{fixed:['新版规则'],varies:[],evidence:[{sourceIndex:0,rule:'新版依据'}]}));const frozen=JSON.stringify(old);ui.A['tpl-task']({dataset:{id:t.id}});let m=nodes.get('#layer').children.at(-1);assert.match(m.innerHTML,/当前 v2 与历史任务/);assert.equal(m.querySelectorAll('[data-act="task-pick"]').length,0);assert.ok(m.innerHTML.includes(old.id));ui.A['task-open']({dataset:{id:old.id}});assert.ok(!nodes.get('#layer').children.at(-1).innerHTML.includes('data-act="task-bridge"'));
 ui.A['template-step']({dataset:{id:t.id}});assert.equal(D.TASKS.at(-1).request.kind,'restore');assert.equal(D.TASKS.at(-1).request.templateVersion,t.version);assert.equal(JSON.stringify(old),frozen);ui.S.page='template';ui.S.tid=t.id;ui.render();const flow=nodes.get('#body').querySelector('.stack').innerHTML;assert.equal((flow.match(/class="btn p"/g)||[]).length,1);assert.match(flow,/其他操作/);assert.match(flow,/data-act="rules-import"/);assert.match(flow,/data-act="restore-import"/);
});

test('handoff footer has one main action while ZIP and mandatory long JSON attachment live in preparation',()=>{
 const app=load(),{ui,W,D,nodes}=app,p=D.PROJECTS.find(p=>p.kind==='内容'),t=D.TEMPLATES.find(W.isBuiltinTemplate);ui.startCover(p,t,['方图'],1,'准备与主入口',Array.from(W.styleReferences(t,p),a=>a.id));const m=nodes.get('#layer').children.at(-1),foot=dialogFoot(m);assert.equal((foot.match(/class="btn p"/g)||[]).length,1);assert.ok(!foot.includes('reference-export'));assert.ok(!foot.includes('photo-export'));assert.equal((m.innerHTML.match(/data-act="reference-export"/g)||[]).length,1);assert.match(m.innerHTML,/其他交接方式/);assert.match(m.innerHTML,/技术详情与完整交接内容/);assert.match(m.innerHTML,/必须先下载 HANDOFF.json 并在助手中附上/);
});

test('new task viewing and selection stay read-only under required auth while handoff preserves the existing gate',()=>{
 const app=load('required'),{ui,W,D,nodes}=app;W.setAuth('active');const p=D.PROJECTS.find(p=>p.kind==='内容'),a=addFlowTask(app,p),b=addFlowTask(app,p);W.setAuth('logged-out');const before=W.raw();for(const k of ['project-tasks','project-cover-tasks','task-pick','task-picker-go','template-step'])assert.equal(ui.actionKinds[k],'read');ui.A['project-tasks']({dataset:{id:p.id}});ui.A['task-pick']({dataset:{id:a.id}});ui.A['task-picker-go']();const m=nodes.get('#layer').children.at(-1);assert.match(m.innerHTML,/真实授权/);assert.match(dialogFoot(m),/复制交接文本/);assert.ok(!dialogFoot(m).includes('href='));assert.equal(W.raw(),before);assert.equal(D.TASKS.find(t=>t.id===b.id).state,'handoff');
});

test('usable custom template current step offers use instead of creating another restoration',()=>{
 const {ui,W,D,nodes}=load(),t=D.TEMPLATES[0];W.transact(()=>{W.rules(t,{fixed:['标题留白'],varies:[],evidence:[{sourceIndex:0,rule:'真实依据'}]});t.validation={restoreImage:'data:image/png;base64,'+photoPng.toString('base64'),accepted:false};t.state='待验收';W.acceptTemplate(t);t.sample=false;});const before=JSON.stringify(W.snapshot().data),count=D.TASKS.length;ui.S.page='template';ui.S.tid=t.id;ui.render();const flow=nodes.get('#body').querySelector('.stack').innerHTML;assert.match(flow,/模板已可用/);assert.ok(!flow.includes('class="btn p"'));ui.A['template-step']({dataset:{id:t.id}});assert.match(nodes.get('#layer').children.at(-1).innerHTML,/选择使用这套模板的内容/);assert.equal(D.TASKS.length,count);assert.equal(JSON.stringify(W.snapshot().data),before);assert.equal(D.tplOf(t.id).state,'可用');
});

test('legacy-marked records carrying a request stay in template history and never route to the assistant',()=>{
 const {ui,W,D,nodes}=load(),t=D.TEMPLATES[0];ui.A['analyze-template']({dataset:{id:t.id}});const task=D.TASKS.at(-1);task.legacyDemo=true;W.commit();const before=JSON.stringify(W.snapshot().data);ui.A['tpl-task']({dataset:{id:t.id}});let m=nodes.get('#layer').children.at(-1);assert.equal(m.querySelectorAll('[data-act="task-pick"]').length,0);assert.ok(m.innerHTML.includes(task.id));ui.A['task-open']({dataset:{id:task.id}});m=nodes.get('#layer').children.at(-1);assert.match(m.innerHTML,/历史演示/);assert.ok(!m.innerHTML.includes('data-act="task-bridge"'));assert.ok(!dialogFoot(m).includes('class="btn p"'));assert.equal(JSON.stringify(W.snapshot().data),before);
});

test('analysis import binds the selected earlier running task and never writes a later same-version task',()=>{
 const {ui,W,D,nodes}=load(),t=D.TEMPLATES[0];const start=()=>{ui.A['analyze-template']({dataset:{id:t.id}});const task=D.TASKS.at(-1);ui.A['task-accept']({dataset:{id:task.id}});return task;},first=start(),second=start();ui.A['rules-import']({dataset:{id:t.id}});let m=nodes.get('#layer').children.at(-1);assert.equal(m.querySelectorAll('[data-act="task-pick"]').length,2);assert.ok(!m.ruleImport);
 ui.A['task-pick']({dataset:{id:first.id}});ui.A['task-picker-go']();m=nodes.get('#layer').children.at(-1);const button=m.querySelector('[data-act="rules-import"]');assert.equal(button.dataset.taskId,first.id);ui.A['rules-import'](button);m=nodes.get('#layer').children.at(-1);assert.equal(m.ruleImport.taskId,first.id);const input=m.querySelector('#rules-json');input.value=JSON.stringify({fixed:['只记到选中的任务'],varies:[],evidence:[{sourceIndex:0,rule:'真实依据'}]});nodes.set('#rules-json',input);ui.A['rules-save']({dataset:{id:t.id}});assert.equal(D.TASKS.find(t=>t.id===first.id).state,'review');assert.equal(D.TASKS.find(t=>t.id===first.id).result.requestId,first.request.requestId);assert.equal(D.TASKS.find(t=>t.id===second.id).state,'running');assert.equal(D.TASKS.find(t=>t.id===second.id).result,undefined);assert.equal(D.tplOf(t.id).version,2);
});

for(const changed of ['state','version'])test('analysis rule modal rejects changed '+changed+' without relabeling another task',()=>{
 const {ui,W,D,nodes}=load(),t=D.TEMPLATES[0];ui.A['analyze-template']({dataset:{id:t.id}});const task=D.TASKS.at(-1);ui.A['task-accept']({dataset:{id:task.id}});ui.A['rules-import']({dataset:{id:t.id,taskId:task.id}});const m=nodes.get('#layer').children.at(-1),input=m.querySelector('#rules-json');input.value=JSON.stringify({fixed:['过期内容不得保存'],varies:[],evidence:[{sourceIndex:0,rule:'旧依据'}]});nodes.set('#rules-json',input);W.transact(()=>changed==='state'?W.taskState(task,'failed'):W.rules(t,{fixed:['已更新的内容'],varies:[],evidence:[{sourceIndex:0,rule:'新依据'}]}));const before=JSON.stringify(W.snapshot().data);ui.A['rules-save']({dataset:{id:t.id}});assert.equal(JSON.stringify(W.snapshot().data),before);assert.equal(D.TASKS.find(t=>t.id===task.id).result,undefined);
});

test('restoration import explicitly selects the earlier of two running tasks and preserves the other',async()=>{
 const env=restorationFixture(),{ui,W,D,nodes,tid,start,chooser}=env,first=start(),second=start();ui.A['restore-import']({dataset:{id:tid}});assert.equal(chooser(),undefined);assert.equal(nodes.get('#layer').children.at(-1).querySelectorAll('[data-act="task-pick"]').length,2);ui.A['task-pick']({dataset:{id:first}});ui.A['task-picker-go']();const button=nodes.get('#layer').children.at(-1).querySelector('[data-act="restore-import"]');assert.equal(button.dataset.taskId,first);ui.A['restore-import'](button);const input=chooser();input.files=[{name:'first.png',size:5,type:'image/png',arrayBuffer:async()=>new Uint8Array([1,2,3,4,5]).buffer}];await input.onchange();assert.equal(D.TASKS.find(t=>t.id===first).state,'review');assert.equal(D.TASKS.find(t=>t.id===first).result.requestId,D.TASKS.find(t=>t.id===first).request.requestId);assert.equal(D.TASKS.find(t=>t.id===second).state,'running');assert.equal(D.TASKS.find(t=>t.id===second).result,undefined);
});

test('restoration file callback rejects selected task state changes during image reading without switching tasks',async()=>{
 const {ui,W,D,tid,start,chooser}=restorationFixture(),first=start(),second=start();ui.A['restore-import']({dataset:{id:tid,taskId:first}});const input=chooser();let release;input.files=[{name:'stale.png',size:5,type:'image/png',arrayBuffer:()=>new Promise(resolve=>release=resolve)}];const pending=input.onchange();await new Promise(resolve=>setImmediate(resolve));assert.ok(release);W.transact(()=>W.taskState(D.TASKS.find(t=>t.id===first),'failed'));const before=JSON.stringify(W.snapshot().data);release(new Uint8Array([1,2,3,4,5]).buffer);await pending;assert.equal(JSON.stringify(W.snapshot().data),before);assert.equal(D.tplOf(tid).validation,null);assert.equal(D.TASKS.find(t=>t.id===second).state,'running');assert.equal(D.TASKS.find(t=>t.id===second).result,undefined);
});

test('sidebar and overview share real current pending counts while old generation snapshots remain actionable',()=>{
 const app=load(),{ui,W,D,nodes}=app,p=D.PROJECTS.find(p=>p.kind==='内容'),generation=addFlowTask(app,p),t=D.TEMPLATES[0];ui.A['analyze-template']({dataset:{id:t.id}});const oldTemplateTask=D.TASKS.at(-1);W.transact(()=>{W.rules(t,{fixed:['升级后的规则'],varies:[],evidence:[{sourceIndex:0,rule:'当前依据'}]});const used=D.tplOf(generation.request.templateId);W.rules(used,{fixed:['模板后续更新'],varies:[],evidence:[{sourceIndex:0,rule:'当前依据'}]});});ui.S.page='today';ui.render();assert.match(nodes.get('#side-bot').innerHTML,/1 件要你处理/);const html=nodes.get('#body').innerHTML;assert.match(html,/<h2>在做的<\/h2><span class="sub">1 件<\/span>/);assert.ok(!html.includes('data-act="task-open" data-id="'+oldTemplateTask.id+'"'));assert.ok(html.includes('data-act="task-open" data-id="'+generation.id+'"'));
});

test('a transferred source remains history and the unified project action reuses its current-host successor',()=>{
 const app=load(),{ui,W,D,nodes}=app,p=D.PROJECTS.find(p=>p.kind==='内容'),old=addFlowTask(app,p);old.conv='original-workbuddy-session';W.commit();const original=JSON.stringify(old);ui.A['set-host']({dataset:{k:'codex'}});ui.A['task-bridge']({dataset:{id:old.id}});const next=D.TASKS.at(-1),count=D.TASKS.length;assert.equal(next.sourceTaskId,old.id);ui.S.page='project';ui.S.pid=p.id;ui.render();assert.match(nodes.get('#body').innerHTML,/历史与已移交任务/);ui.A['project-tasks']({dataset:{id:p.id}});assert.equal(D.TASKS.length,count);const text=nodes.get('#layer').children.at(-1).querySelector('#host-text').value;assert.ok(text.includes(next.request.requestId));assert.equal(JSON.stringify(D.TASKS.find(t=>t.id===old.id)),original);ui.A['task-open']({dataset:{id:old.id}});assert.match(nodes.get('#layer').children.at(-1).innerHTML,/original-workbuddy-session/);assert.ok(!nodes.get('#layer').children.at(-1).innerHTML.includes('data-act="task-bridge"'));
});

test('running cover batches display manual progress without invented or undefined external steps',()=>{
 const app=load(),{ui,D,nodes}=app,p=D.PROJECTS.find(p=>p.kind==='内容');addFlowTask(app,p);const current=addFlowTask(app,p);ui.A['task-accept']({dataset:{id:current.id}});ui.S.page='project';ui.S.pid=p.id;ui.render();const html=nodes.get('#body').innerHTML;assert.match(html,/已手动接单 · 等待导入结果/);assert.match(html,/等待导入真实候选图/);assert.ok(!html.includes('undefined'));
});

test('task selector accepts a native radio change event before continuing',()=>{
 const app=load(),{ui,D,nodes,events}=app,p=D.PROJECTS.find(p=>p.kind==='内容'),a=addFlowTask(app,p);addFlowTask(app,p);ui.A['project-tasks']({dataset:{id:p.id}});const radio=nodes.get('#layer').children.at(-1).querySelectorAll('[data-act="task-pick"]').find(r=>r.dataset.id===a.id);radio.closest=selector=>selector==='input[data-act="task-pick"]'?radio:null;for(const change of events.change)change({target:radio});ui.A['task-picker-go']();assert.ok(nodes.get('#layer').children.at(-1).querySelector('#host-text').value.includes(a.request.requestId));
});
