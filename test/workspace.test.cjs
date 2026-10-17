const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Core = require('../原型/core.js');
const image = 'data:image/png;base64,iVBORw0KGgo=';
const photo = (id='own-photo',name='私密姓名-照片.png') => ({id,name,img:image,bytes:8,px:[1,1],sha256:''});
function memory() { const data=new Map(); return { data, getItem:k=>data.get(k)||null, setItem(k,v){data.set(k,v);} }; }
function setup(mode='disabled', storage=memory()) {
  const ctx={window:{},localStorage:memory(),Date,console}; vm.createContext(ctx); vm.runInContext(fs.readFileSync('原型/data.js','utf8'),ctx); const D=ctx.window.NCH;
  const W=Core.create(D,storage,{prototype:true,AUTH_MODE:mode,appScope:'nova-content-hub',version:'0.2.0',protocolVersion:1}); W.commit(); return {W,D,storage};
}
function usable(W,D) { const t=D.TEMPLATES[0]; W.rules(t,{fixed:['左侧标题留白'],varies:['换标题'],evidence:[{sourceIndex:0,rule:'左侧留白可见'}]});t.validation={restoreImage:image,accepted:false};t.state='待验收';W.acceptTemplate(t);return t; }
test('local photos have one default, survive reload and use recoverable immutable identities',()=>{
 const {W,D,storage}=setup();assert.equal(W.defaultPhoto(),null);assert.equal(D.ACCOUNT.photos.filter(W.isOwnPhoto).length,0);
 W.addPhotos([photo('mine-a')]);assert.equal(W.defaultPhoto().id,'mine-a');W.addPhotos([photo('mine-b')]);assert.equal(W.defaultPhoto().id,'mine-a');
 W.setDefaultPhoto('mine-b');assert.equal(D.ACCOUNT.photos.filter(p=>p.use).length,1);const re=setup('disabled',storage);assert.equal(re.W.defaultPhoto().id,'mine-b');
 const t=D.TEMPLATES.find(W.isBuiltinTemplate),p=D.PROJECTS[0],ref=W.referenceChoices(t,p).find(a=>a.id==='mine-b');
 const task=W.addTask(W.request('generate',p,{templateId:t.id,title:'自己的内容',count:1,format:'方图',ratio:'1:1',pixels:null,references:[{id:ref.id,version:ref.version,note:'/Users/private/私密姓名.png'}]}));W.commit();const frozen=JSON.stringify(task);
 assert.ok(!frozen.includes('私密姓名'));assert.ok(!frozen.includes('base64'));assert.match(task.request.rules.fixed.join(' '),/保留本人五官、脸型、发型|保留本人五官、脸型和发型|保留本人五官、脸型、发型/);
 W.removePhoto('mine-b');assert.equal(W.defaultPhoto().id,'mine-a');assert.equal(W.photoById('mine-b').img,image);assert.equal(JSON.stringify(task),frozen);assert.ok(!W.referenceChoices(t,p).some(a=>a.id==='mine-b'));
 assert.throws(()=>W.addPhotos([photo('mine-b')]),/历史照片 ID/);const record=W.trash.find(x=>x.kind==='photo'&&x.value.id==='mine-b');W.transact(()=>W.restore(record.id));assert.equal(W.defaultPhoto().id,'mine-a');assert.equal(W.photoById('mine-b').img,image);assert.equal(JSON.stringify(D.TASKS.find(x=>x.id===task.id)),frozen);
});
test('photo writes recheck authorization, invalid input and storage quota roll back the whole batch',()=>{
 const {W,D,storage}=setup('required');assert.throws(()=>W.addPhotos([photo()]),/鉴权/);W.setAuth('active');W.addPhotos([photo('mine-a')]);const saved=storage.getItem(Core.KEY);
 assert.throws(()=>W.addPhotos([photo('mine-b'),{...photo('mine-bad'),img:'图库/示例/avatar.svg'}]),/已解码/);assert.equal(storage.getItem(Core.KEY),saved);assert.ok(!D.ACCOUNT.photos.some(p=>p.id==='mine-b'));
 const set=storage.setItem;storage.setItem=()=>{throw Error('quota');};assert.throws(()=>W.addPhotos([photo('mine-quota')]),/保存失败/);storage.setItem=set;assert.equal(storage.getItem(Core.KEY),saved);assert.equal(W.defaultPhoto().id,'mine-a');assert.ok(!D.ACCOUNT.photos.some(p=>p.id==='mine-quota'));
 assert.throws(()=>W.addPhotos(['mine-large-a','mine-large-b'].map(id=>({...photo(id),bytes:810000,img:'data:image/png;base64,'+'YWFh'.repeat(270000)}))),/4 MiB/);assert.equal(storage.getItem(Core.KEY),saved);assert.ok(!D.ACCOUNT.photos.some(p=>p.id==='mine-large'));
 W.setAuth('expired');assert.throws(()=>W.setDefaultPhoto('mine-a'),/鉴权/);assert.throws(()=>W.removePhoto('mine-a'),/鉴权/);assert.equal(D.ACCOUNT.photos.filter(W.isOwnPhoto).length,1);
});
test('creator content stays in request rules and current person policy replaces sample identity instructions',()=>{
 const {W,D}=setup();W.addPhotos([photo()]);const p=D.PROJECTS[0],options={title:'自己的内容',count:3,format:'方图',ratio:'1:1',pixels:null,references:[{id:W.defaultPhoto().id,version:1}]},brief='只讲用户提供的事实。'.repeat(100);
 for(const t of D.TEMPLATES.filter(W.isBuiltinTemplate)) {const r=W.request('generate',p,{...options,templateId:t.id,brief});assert.equal(r.options.brief,undefined);assert.ok(r.rules.fixed.some(x=>x.startsWith('本次内容说明 1：')));const rules=r.rules.fixed.join(' ');assert.match(rules,/唯一人物身份来源/);assert.match(rules,/不能只换底色/);assert.ok(!rules.includes('不添加人物'));assert.ok(!rules.includes('不采用轨道球、人物'));assert.ok(!rules.includes('默认AI生成的虚构成年人物肖像'));assert.equal(Core.validateRequest(r),r);}
 const collage=D.tplOf('builtin-tech-collage'),rules=W.request('generate',p,{...options,templateId:collage.id}).rules.fixed.join(' ');
 for(const text of ['顶部白色撕纸承托深黑超大标题','单个创作者位于偏右中景','前景放无品牌笔记本','手部姿态自然','文字不得穿过脸部、手部或设备边缘','真实透视和柔和接触阴影','人物手部、视线、透视与接触阴影自然'])assert.ok(rules.includes(text),text);
 for(const check of collage.generation.qualityChecks)assert.ok(rules.includes(check),check);
 const t=D.TEMPLATES.find(W.isBuiltinTemplate);assert.throws(()=>W.request('generate',p,{...options,templateId:t.id,brief:'字'.repeat(1501)}),/1500 字/);
 const noPerson=W.request('generate',p,{...options,templateId:t.id,references:[]});assert.match(noPerson.rules.fixed.join(' '),/本次不放人物/);assert.match(noPerson.rules.fixed.join(' '),/本次未提供内容说明/);
});
test('startup upgrades only unchanged shipped definitions and keeps old task and definition snapshots',()=>{
 const {W,D,storage}=setup(),old=JSON.parse(JSON.stringify(require('../builtin-templates/legacy-v2-complete.json').templates.find(t=>t.id==='builtin-agent')));
 Object.assign(old,{state:'可用',evidence:[],restoreTest:false,sample:false});const b=W.snapshot();b.data.TEMPLATES[b.data.TEMPLATES.findIndex(t=>t.id===old.id)]=old;W.importBackup(JSON.stringify(b));
 const task=W.addTask(W.request('generate',D.PROJECTS[0],{templateId:old.id,title:'旧任务不变',count:1,format:'方图',ratio:'1:1',pixels:null,references:[]}));W.commit();const original=JSON.stringify(task);
 const re=setup('disabled',storage),t=re.D.tplOf(old.id);assert.equal(t.version,4);assert.match(t.img,/\.png$/);assert.equal(t.history.at(-1).definition.version,2);assert.deepEqual(t.history.at(-1).definition.fixed,old.fixed);assert.equal(JSON.stringify(re.D.TASKS.find(x=>x.id===task.id)),original);
 const again=setup('disabled',storage);assert.equal(again.D.tplOf(old.id).history.length,t.history.length);
 const custom=JSON.parse(JSON.stringify(old));custom.fixed.push('用户定制的规则');custom.state='待还原';const changed=again.W.snapshot();changed.data.TEMPLATES[changed.data.TEMPLATES.findIndex(x=>x.id===custom.id)]=custom;again.W.importBackup(JSON.stringify(changed));const kept=setup('disabled',storage);assert.equal(kept.D.tplOf(custom.id).version,2);assert.ok(kept.D.tplOf(custom.id).fixed.includes('用户定制的规则'));assert.equal(kept.W.isTemplateUsable(kept.D.tplOf(custom.id)),false);
});
test('real dates, safe protocols, confined paths, equivalent ratios',()=>{
 assert.equal(Core.date('2026-02-30'),null);assert.equal(Core.date('2026-99-99'),null);assert.equal(Core.date('2024-02-29'),'2024-02-29');assert.equal(Core.date('2025-02-29'),null);
 assert.equal(Core.ratio('1080:1440'),'3:4');assert.equal(Core.ratio('2.35:1'),'47:20');assert.equal(Core.ratio('0:4'),'');assert.equal(Core.ratio('99999:1'),'');
 assert.equal(Core.url('javascript:alert(1)'),null);assert.equal(Core.url('data:text/html,hi'),null);assert.equal(Core.url('https://a:b@example.com'),null);assert.equal(Core.url('https://example.com/'),'https://example.com/');
 for(const value of ['../库/a.png','/etc/passwd','a/../b','~/库','C:/x','a\\b','a//b'])assert.equal(Core.path(value),false,value);
});
test('all business facts persist including builtin channel override, collection and members',()=>{
 const {W,D,storage}=setup(); assert.equal(D.BRAND.version, W.config.version); const p=W.addProject('真实新内容');const c=W.addProject('本月合集','合集',[],[p.id]);D.CHANNELS.抖音.need='方图';W.commit();
 const re=setup('disabled',storage);assert.ok(re.D.byId(p.id));assert.deepEqual(Array.from(re.D.byId(c.id).members),[p.id]);assert.equal(re.D.CHANNELS.抖音.need,'方图');
 assert.throws(()=>W.addProject('本月合集','合集'),/同名/);assert.throws(()=>W.addProject(' ','合集'),/不能为空/);assert.throws(()=>W.removeProject(p),/合集/);
});
test('same-name attachment delete affects only its stable id and can restore actual bytes',()=>{
 const {W,D,storage}=setup(); const p=D.PROJECTS[0];p.files.push({id:'asset-a',name:'a.md',size:'3 B',content:'data:text/plain;base64,YWJj'},{id:'asset-b',name:'a.md',size:'3 B',content:'data:text/plain;base64,ZGVm'});
 W.transact(()=>W.removeFile(p,'asset-a')); assert.ok(p.files.some(x=>x.id==='asset-b'));assert.ok(!p.files.some(x=>x.id==='asset-a'));
 const restored=setup('disabled',storage);const trash=restored.W.trash.at(-1);restored.W.transact(()=>restored.W.restore(trash.id));assert.equal(restored.D.byId(p.id).files.find(x=>x.id==='asset-a').content,'data:text/plain;base64,YWJj');
});
test('template request or checkbox never implies verification; rules and actual restore proof required',()=>{
 const {W,D}=setup();const t=D.TEMPLATES[0];assert.equal(t.state,'待拆解');assert.equal(t.restoreTest,false);assert.throws(()=>W.acceptTemplate(t),/先导入/);
 W.rules(t,{fixed:['字大'],evidence:[{sourceIndex:0,rule:'原图大字'}]});assert.equal(t.state,'待还原');assert.throws(()=>W.acceptTemplate(t),/先导入/);
 t.validation={restoreImage:image,accepted:false};t.state='待验收';W.acceptTemplate(t);assert.equal(t.state,'可用'); W.commit();
 W.transact(()=>W.removeShot(t,0));assert.equal(t.state,'待拆解');assert.equal(t.validation,null);
});
test('external requests are explicit, isolated snapshots without image payload; no implicit task running',()=>{
 const {W,D}=setup();const t=usable(W,D),p=D.PROJECTS[0];const r=W.request('generate',p,{templateId:t.id,title:p.name,count:4,format:'竖版',ratio:'3:4',pixels:[1200,1600],references:[]});const task=W.addTask(r);assert.equal(task.state,'handoff');
 assert.equal(r.libraryRoot,null);assert.equal(r.pathsResolved,false);assert.equal(r.targetId,p.id);assert.equal(r.templateVersion,t.version);assert.ok(!JSON.stringify(r).includes('base64'));t.fixed.push('后改规则');assert.equal(r.rules.fixed[0],'左侧标题留白');assert.ok(!r.rules.fixed.includes('后改规则'));assert.match(r.rules.fixed.join(' '),/本次不放人物/);
 assert.throws(()=>W.taskState(task,'success'),/不允许/);W.taskState(task,'running');assert.throws(()=>W.taskState(task,'success'),/不允许/);W.taskState(task,'review');assert.throws(()=>W.taskState(task,'success'),/没有真实/);task.resultCount=2;W.taskState(task,'partial');assert.equal(task.state,'partial');assert.throws(()=>W.taskState(task,'running'),/不允许/);
});
test('publication pins candidate snapshot through later selections and reload',()=>{
 const {W,D,storage}=setup(),p=D.PROJECTS.find(x=>x.posts.length&&x.materials[0]?.batches[0]?.cands.length>1),post=p.posts[0],m=D.matOf(p,post.mat)||p.materials[0];post.mat=m.id;const c=D.candsOf(m)[0];c.use=true;W.publish(p,post,'2026-10-16','https://example.com/');const imageAtPublication=post.pub.snapshot.img,identity=post.pub.snapshot.candidateId;
 m.batches.forEach(b=>b.cands.forEach(x=>x.use=false));D.candsOf(m)[1].use=true;W.commit();const reload=setup('disabled',storage).D.byId(p.id).posts.find(x=>x.id===post.id);assert.equal(reload.pub.snapshot.img,imageAtPublication);assert.equal(reload.pub.snapshot.candidateId,identity);
 assert.throws(()=>W.publish(p,post,'2026-02-30',''),/日期/);assert.throws(()=>W.publish(p,post,'2026-10-16','javascript:x'),/HTTP/);
});
test('quota/validation failure rolls back whole workspace without deleting stored facts',()=>{
 const {W,D,storage}=setup();const before=storage.getItem(Core.KEY),n=D.PROJECTS.length;const originalSet=storage.setItem;storage.setItem=()=>{throw Error('quota');};assert.throws(()=>W.transact(()=>W.addProject('不能保存')),/保存失败/);assert.equal(D.PROJECTS.length,n);assert.equal(storage.getItem(Core.KEY),before);storage.setItem=originalSet;
 assert.throws(()=>W.transact(()=>{D.PROJECTS[0].dates.record='2026-02-30';}),/日期/);assert.equal(storage.getItem(Core.KEY),before);
});
test('backup import rejects malformed, future, path escape, unsafe URLs and oversize without overwrite',()=>{
 const {W,D,storage}=setup();const before=storage.getItem(Core.KEY);
 for(const mutate of [x=>{x.schema=99;},x=>{x.data.PROJECTS[0].posts[0].pub={at:'2026-10-16',link:'javascript:x'};},x=>{x.data.TEMPLATES[0].shots=['../secret.png'];},x=>{x.data.PROJECTS[0].files[0].srcPath='../secret';},x=>{x.data.PROJECTS[0].name='x'.repeat(Core.MAX_BYTES);}]){const b=W.snapshot();mutate(b);assert.throws(()=>W.importBackup(JSON.stringify(b)));assert.equal(storage.getItem(Core.KEY),before);}
 assert.throws(()=>W.importBackup('{'));assert.equal(storage.getItem(Core.KEY),before);
 const backup=W.snapshot();backup.libraryId='library-restored';W.importBackup(JSON.stringify(backup));assert.equal(W.libraryId,'library-restored');W.previous();assert.notEqual(W.libraryId,'library-restored');
});
test('corrupt storage remains intact and is read-only until valid recovery',()=>{
 const storage=memory();storage.setItem(Core.KEY,'broken');const {W}=setupCorrupt(storage);assert.equal(W.readonly,true);assert.equal(storage.getItem(Core.KEY),'broken');assert.throws(()=>W.commit());const good=setup().W.snapshot();W.importBackup(JSON.stringify(good));assert.equal(W.readonly,false);assert.equal(W.libraryId,good.libraryId);
 function setupCorrupt(storage){const ctx={window:{},localStorage:memory(),Date};vm.createContext(ctx);vm.runInContext(fs.readFileSync('原型/data.js','utf8'),ctx);return {W:Core.create(ctx.window.NCH,storage,{prototype:true,AUTH_MODE:'disabled',appScope:'nova-content-hub',version:'0.2.0'})};}
});
test('required/disabled gating, no auth credentials in backup; offline grace blocks external',()=>{
 const {W}=setup('required');assert.equal(W.allowed('read'),true);assert.equal(W.allowed('export'),true);assert.equal(W.allowed('write'),false);W.setAuth('active');assert.equal(W.allowed('external'),true);W.setAuth('offline-valid');assert.equal(W.allowed('write'),true);assert.equal(W.allowed('external'),false);W.setAuth('expired');assert.equal(W.allowed('write'),false);assert.equal(W.allowed('export'),true);assert.ok(!JSON.stringify(W.snapshot()).includes('accessToken'));assert.equal(setup('disabled').W.allowed('external'),true);
});
test('malicious channel styles and malformed account imports are rejected without overwrite',()=>{
 const {W,storage}=setup();const before=storage.getItem(Core.KEY);
 for(const mutate of [x=>x.data.CHANNELS.抖音.ink='red" onmouseover="alert(1)',x=>x.data.CHANNELS.抖音.bg='url(javascript:x)',x=>x.data.CHANNELS.抖音.need='bad',x=>x.data.ACCOUNT.photos={},x=>x.data.PROJECTS[0].tpl='missing',x=>x.data.TEMPLATES[0].evidence=[{sourceIndex:999,rule:'无对应图'}]]){const b=W.snapshot();mutate(b);assert.throws(()=>W.importBackup(JSON.stringify(b)));assert.equal(storage.getItem(Core.KEY),before);}
});
test('nested IDs, numeric candidate numbers and template text shapes are validated at import',()=>{
 const {W,storage}=setup();const before=storage.getItem(Core.KEY);
 const cases=[x=>x.data.PROJECTS[0].materials[0].batches[0].cands[0].no='"><img src=x onerror=alert(1)>',x=>x.data.PROJECTS[0].posts[0].id='" onmouseover="x',x=>x.data.PROJECTS[0].materials[0].batches[0].no='1" bad',x=>x.data.TEMPLATES[0].why=[null],x=>x.data.TEMPLATES[0].fixed=[{}],x=>x.data.TEMPLATES[0].version='1" bad',x=>{const b=x.data.PROJECTS[0].materials[0].batches[0];b.cands.push({...b.cands[0],id:'candidate-copy'});}];
 for(const mutate of cases){const b=W.snapshot();mutate(b);assert.throws(()=>W.importBackup(JSON.stringify(b)));assert.equal(storage.getItem(Core.KEY),before);}
});
test('request boundary normalizes ratios and rejects references/pixels beyond plugin contract',()=>{
 const {W,D}=setup();const t=usable(W,D),p=D.PROJECTS[0];const options={templateId:t.id,title:p.name,count:1,format:'头图',ratio:'2.35:1',pixels:null,references:[]};assert.equal(W.request('generate',p,options).options.ratio,'47:20');
 assert.throws(()=>W.request('generate',p,{...options,pixels:[17000,1000]}),/像素/);assert.throws(()=>W.request('generate',p,{...options,pixels:[1200,1600]}),/比例/);t.shots=Array(33).fill(image);assert.throws(()=>W.request('analyze',t),/32/);
});
test('template edits preserve previous text, evidence and validation references without copying image bytes',()=>{
 const {W,D}=setup();const t=usable(W,D),oldVersion=t.version;t.validation.sha256='testhash';W.rules(t,{fixed:['新规则'],evidence:[{sourceIndex:0,rule:'新证据'}]});assert.equal(t.history.at(-1).version,oldVersion);assert.equal(t.history.at(-1).validation.sha256,'testhash');assert.ok(!JSON.stringify(t.history).includes('base64'));assert.equal(t.validation,null);assert.equal(t.state,'待还原');
});
test('direct commit validation/serialization failure restores data and trash, then accepts a new valid edit',()=>{
 const {W,D,storage}=setup();const before=storage.getItem(Core.KEY),p=D.PROJECTS[0],old=p.name,n=p.files.length;
 W.removeFile(p,p.files[0].id);p.name='x'.repeat(201);assert.throws(()=>W.commit());assert.equal(storage.getItem(Core.KEY),before);assert.equal(D.PROJECTS[0].name,old);assert.equal(D.PROJECTS[0].files.length,n);assert.equal(W.trash.length,0);
 D.PROJECTS[0].cycle=D.PROJECTS[0];assert.throws(()=>W.commit());assert.equal(D.PROJECTS[0].cycle,undefined);assert.equal(storage.getItem(Core.KEY),before);
 D.PROJECTS[0].name='回退后正常编辑';W.commit();assert.equal(JSON.parse(storage.getItem(Core.KEY)).data.PROJECTS[0].name,'回退后正常编辑');
});
test('request pretty JSON is bounded by actual UTF8 bytes and rejects unknown or executable fields',()=>{
 const {W,D}=setup();const t=usable(W,D),p=D.PROJECTS[0];t.fixed=Array(30).fill('图'.repeat(1000));assert.throws(()=>W.request('analyze',t),/16 KiB/);t.fixed=['正常规则'];
 const options={templateId:t.id,title:'安全请求',count:1,format:'方图',ratio:'1:1',pixels:null,references:[]};
 assert.throws(()=>W.request('generate',p,{...options,token:'not-a-secret'}),/未知/);assert.throws(()=>W.request('generate',p,{...options,references:[{id:'asset-one',image:image}]}),/引用/);
 const req=W.request('generate',p,options);assert.equal(Core.utf8Bytes(JSON.stringify(req,null,2)),Buffer.byteLength(JSON.stringify(req,null,2),'utf8'));assert.ok(Core.utf8Bytes(JSON.stringify(req,null,2))<=16384);
});
test('deep schema rejects null records, arrays instead of maps and poisoned trash without overwriting',()=>{
 const {W,storage}=setup();const before=storage.getItem(Core.KEY);
 for(const mutate of [s=>s.data.ACCOUNT=[],s=>s.data.SETTINGS=[],s=>s.data.CHANNELS=[],s=>s.data.TEMPLATES=[null],s=>s.data.PROMPTS[0].tags=[{}],s=>s.data.PROJECTS[0].materials[0].batches[0].cands[0].use='yes',s=>s.data.PROJECTS[0].posts[0].text={},s=>s.data.TASKS[0].steps=-1,s=>s.trash.push({id:'trash-bad',kind:'project',value:{id:'p-bad'}}),s=>s.data.TEMPLATES.push({...s.data.TEMPLATES[0]})]){const snapshot=W.snapshot();mutate(snapshot);assert.throws(()=>W.importBackup(JSON.stringify(snapshot)));assert.equal(storage.getItem(Core.KEY),before);}
});
test('one global host controls new work while original tasks and cross-host source stay intact',()=>{
 const {W,D,storage}=setup();const p=D.PROJECTS[0],t=usable(W,D);p.host='workbuddy';W.setHost('codex');const task=W.addTask(W.request('generate',p,{templateId:t.id,title:'全局助手',count:1,format:'方图',ratio:'1:1',pixels:null,references:[]}));task.conv='original-session';W.commit();
 assert.equal(task.host,'codex');assert.equal(task.handoff.target.host,'codex');assert.equal(task.handoff.context.project.id,p.id);const original=JSON.stringify(task);W.setHost('workbuddy');assert.equal(W.createHandoff(task,{mode:'resume'}).target.host,'codex');
 const transferred=W.transact(()=>W.transferTask(task));assert.equal(JSON.stringify(task),original);assert.equal(transferred.host,'workbuddy');assert.equal(transferred.sourceTaskId,task.id);assert.equal(transferred.handoff.sourceTaskId,task.id);assert.equal(transferred.handoff.context.project.id,p.id);assert.notEqual(transferred.request.requestId,task.request.requestId);assert.equal(transferred.conv,'');assert.equal(transferred.state,'handoff');assert.ok(transferred.mid);const batch=D.matOf(p,transferred.mid).batches.find(b=>b.requestId===transferred.request.requestId);assert.ok(batch);assert.equal(batch.cands.length,0);assert.equal(batch.state,'handoff');
 const re=setup('disabled',storage);assert.equal(re.D.TASKS.find(x=>x.id===task.id).conv,'original-session');assert.equal(re.D.TASKS.find(x=>x.id===transferred.id).sourceTaskId,task.id);assert.throws(()=>W.createHandoff(task,{host:'workbuddy'}),/显式/);
});
test('new handoff backups validate task binding and request snapshots without overwriting on forgery',()=>{
 const {W,D,storage}=setup();const t=usable(W,D);const task=W.addTask(W.request('analyze',t));W.commit();const before=storage.getItem(Core.KEY);
 for(const mutate of [x=>x.target.host=x.target.host==='workbuddy'?'codex':'workbuddy',x=>x.context.libraryId='different-library',x=>x.context.template.fixed=['偷偷改变规则'],x=>x.target.extra='javascript:alert(1)',x=>x.request.options.token='secret']){
  const backup=W.snapshot();mutate(backup.data.TASKS.find(x=>x.id===task.id).handoff);assert.throws(()=>W.importBackup(JSON.stringify(backup)));assert.equal(storage.getItem(Core.KEY),before);
 }
 const legacy=W.snapshot();delete legacy.data.TASKS.find(x=>x.id===task.id).handoff;W.importBackup(JSON.stringify(legacy));assert.equal(D.TASKS.find(x=>x.id===task.id).request.requestId,task.request.requestId);
});
test('bundled authored designs generate immediately and lose bundled trust after source or rule edits',()=>{
 const {W,D}=setup(),builtins=D.TEMPLATES.filter(t=>W.isBuiltinTemplate(t));assert.equal(builtins.length,15);
 for(const t of builtins){assert.equal(W.isTemplateUsable(t),true);assert.equal(t.validation.aiTested,false);assert.equal(t.validation.accepted,undefined);assert.equal(t.validation.restoreImage,undefined);W.request('generate',D.PROJECTS[0],{templateId:t.id,title:'原创风格',count:1,format:'竖版',ratio:'3:4',pixels:null,references:[]});}
 const edited=builtins[0];W.transact(()=>W.rules(edited,{fixed:['用户新规则'],varies:[],evidence:[{sourceIndex:0,rule:'对应用户新规则'}]}));assert.equal(W.isBuiltinTemplate(edited),false);assert.equal(W.isTemplateUsable(edited),false);assert.equal(edited.state,'待还原');assert.equal(edited.history.at(-1).state,'可用');
});
test('bundled manifest is never trusted from backup and missing builtins install additively',()=>{
 const {W,D,storage}=setup();const before=storage.getItem(Core.KEY),id=D.TEMPLATES.find(t=>W.isBuiltinTemplate(t)).id;
 for(const mutate of [t=>t.fixed.push('伪造规则'),t=>t.source='伪造来源',t=>t.ratio='1:1',t=>t.assets[0].path='用户/任意.svg',t=>t.version++,t=>t.id='forged-builtin']){
  const snapshot=W.snapshot(),t=snapshot.data.TEMPLATES.find(t=>t.id===id);mutate(t);assert.throws(()=>W.importBackup(JSON.stringify(snapshot)));assert.equal(storage.getItem(Core.KEY),before);
 }
 const older=W.snapshot();older.data.TEMPLATES=older.data.TEMPLATES.filter(t=>!t.id.startsWith('builtin-'));older.data.TEMPLATES[0].name='用户旧风格';W.importBackup(JSON.stringify(older));assert.equal(D.TEMPLATES.filter(t=>W.isBuiltinTemplate(t)).length,15);assert.ok(D.TEMPLATES.some(t=>t.name==='用户旧风格'));
 for(const t of require('../原型/builtin-templates.js'))for(const a of t.assets)assert.equal(Core.source(a.path),true);assert.equal(Core.source('图库/内置模板/任意.svg'),false);
});
test('older release handoffs stay recoverable and a transfer explicitly creates a current release request',()=>{
 const {W,D,storage}=setup();W.setHost('codex');const task=W.addTask(W.request('analyze',D.TEMPLATES[0]));task.conv='prior-release-session';W.commit();const old=JSON.stringify(task);
 const next=Core.create(D,storage,{prototype:true,AUTH_MODE:'disabled',appScope:'nova-content-hub',version:'0.3.0',protocolVersion:1});assert.equal(next.readonly,false);const restored=D.TASKS.find(t=>t.id===task.id),envelope=next.createHandoff(restored,{mode:'resume'});assert.equal(envelope.pairId,'nova-content-hub@0.2.0:p1:disabled');assert.equal(require('../原型/shared/handoff.js').url(envelope,{release:next.config}).code,'PAIR_MISMATCH');assert.equal(JSON.stringify(restored),old);
 next.setHost('workbuddy');const transferred=next.transact(()=>next.transferTask(restored));assert.equal(transferred.request.pairId,'nova-content-hub@0.3.0:p1:disabled');assert.equal(transferred.handoff.sourceTaskId,restored.id);assert.equal(JSON.stringify(restored),old);
});
test('a legacy task can carry its project summary into a new assistant without inventing chat history',()=>{
 const {W,D}=setup();const old=D.TASKS.find(t=>t.legacyDemo&&t.pid),before=JSON.stringify(old);W.setHost(old.host==='codex'?'workbuddy':'codex');const next=W.transact(()=>W.transferTask(old));assert.equal(JSON.stringify(old),before);assert.equal(next.request,undefined);assert.equal(next.handoff.request,null);assert.equal(next.sourceTaskId,old.id);assert.equal(next.handoff.context.project.id,old.pid);assert.match(next.handoff.context.project.summary,/浏览器附件/);assert.equal(next.conv,'');
});
test('context-only transfer preserves all original context and source without borrowing another project',()=>{
 const {W,D,storage}=setup();W.setHost('codex');const old={id:W.uid('task'),name:'纯摘要交接',host:'codex',state:'handoff',step:0,steps:1,order:['交接'],conv:''};old.handoff=W.createHandoff(null,{summary:'只处理这一份独立摘要'});Object.assign(old.handoff.context,{project:{id:'standalone-project',name:'独立摘要项目',summary:'原始动作与独立摘要'},template:{id:'standalone-template',version:3,fixed:['保留原规则'],varies:['仅改标题']},materials:[{id:'standalone-material',name:'原物料引用'}],references:[{id:'standalone-reference',name:'原参考引用'}]});D.TASKS.push(old);W.commit();const original=JSON.stringify(old),context=JSON.stringify(old.handoff.context);W.setHost('workbuddy');const next=W.transact(()=>W.transferTask(old));assert.equal(JSON.stringify(old),original);assert.equal(JSON.stringify(next.handoff.context),context);assert.equal(next.sourceTaskId,old.id);assert.equal(next.handoff.sourceTaskId,old.id);assert.equal(next.handoff.target.host,'workbuddy');assert.equal(next.pid,undefined);assert.equal(next.tid,undefined);assert.notEqual(next.handoff.handoffId,old.handoff.handoffId);
 next.handoff.context.materials[0].name='新任务的独立修改';assert.equal(JSON.stringify(old),original);assert.equal(old.handoff.context.materials[0].name,'原物料引用');W.commit();const restored=setup('disabled',storage);assert.equal(restored.D.TASKS.find(t=>t.id===old.id).handoff.context.project.id,'standalone-project');assert.equal(restored.D.TASKS.find(t=>t.id===next.id).handoff.context.references[0].id,'standalone-reference');
});
test('media catalog groups eleven general and four AI designs, generation rules fill known values without invented facts',()=>{
 const {W,D}=setup(),catalog=D.TEMPLATES.filter(t=>W.isBuiltinTemplate(t));assert.equal(catalog.filter(t=>t.audience==='general').length,11);assert.equal(catalog.filter(t=>t.audience==='ai').length,4);
 for(const t of catalog){assert.ok(t.anatomy.some(a=>a.editable));assert.ok(t.anatomy.some(a=>!a.editable));assert.ok(t.generation.qualityChecks.length>=5);const r=W.request('generate',D.PROJECTS[0],{templateId:t.id,title:'本次长标题逐字使用，不悄悄改动原文',count:1,format:'方图',ratio:'1:1',pixels:null,references:[]});assert.equal(r.version,1);assert.ok(r.rules.fixed.some(x=>x.includes('本次长标题逐字使用')));assert.ok(r.rules.varies.some(x=>x.includes('比例变化重新排版')));assert.ok(!r.rules.fixed.some(x=>/\{(?:title|ratio|topic|subject|supportingText|facts)\}/.test(x)));assert.equal(Core.validateRequest(r),r);}
});
test('reference selection accepts only stable assets for current template version, same project and authorized account material',()=>{
 const {W,D}=setup(),p=D.PROJECTS[0],t=D.TEMPLATES.find(t=>W.isBuiltinTemplate(t)),other=D.TEMPLATES.find(x=>W.isBuiltinTemplate(x)&&x.id!==t.id);
 const options={templateId:t.id,title:'引用校验',count:1,format:'方图',ratio:'1:1',pixels:null,references:[]};const asset=W.referenceChoices(t,p).find(a=>a.kind==='template');assert.ok(asset);
 const valid={id:asset.id,version:asset.version,note:asset.note};const r=W.request('generate',p,{...options,references:[valid]});assert.deepEqual(r.references,[valid]);assert.ok(!JSON.stringify(r).includes('base64'));
 for(const references of [[{...valid,version:asset.version+1}],[valid,valid],[{id:W.referenceChoices(other,p).find(a=>a.kind==='template').id,version:other.version}],[{id:'unrelated-candidate',version:1}]])assert.throws(()=>W.request('generate',p,{...options,references}),/参考/);
 const own=D.candsOf(p.materials[0])[0];own.fav=true;assert.ok(W.referenceChoices(t,p).some(a=>a.id===own.id));const p2=D.PROJECTS.find(x=>x.kind==='内容'&&x.id!==p.id);assert.throws(()=>W.request('generate',p2,{...options,references:[{id:own.id,version:1}]}),/参考/);
 D.ACCOUNT.photos.push({id:'authorized-photo',name:'明确授权图片',img:image,use:false});assert.ok(W.referenceChoices(t,p).some(a=>a.id==='authorized-photo'));assert.ok(!W.referenceChoices(t,p).some(a=>a.id==='fa1'));W.setDefaultPhoto('authorized-photo');assert.equal(W.defaultPhoto().id,'authorized-photo');
 const frozen=JSON.stringify(r);t.fixed.push('后续变化');assert.equal(JSON.stringify(r),frozen);
});
test('legacy authored v1 stays writable and explicit builtin update preserves definition and task snapshots',()=>{
 const {W,D,storage}=setup(),old=JSON.parse(JSON.stringify(require('../原型/builtin-templates.js').legacy[0]));Object.assign(old,{state:'可用',evidence:[],restoreTest:false,sample:false});
 const backup=W.snapshot(),at=backup.data.TEMPLATES.findIndex(x=>x.id===old.id);backup.data.TEMPLATES[at]=old;W.importBackup(JSON.stringify(backup));assert.equal(W.readonly,false);assert.equal(W.isTemplateUsable(D.tplOf(old.id)),true);assert.equal(D.tplOf(old.id).version,1);
 const task=W.addTask(W.request('generate',D.PROJECTS[0],{templateId:old.id,title:'旧版请求',count:1,format:'方图',ratio:'1:1',pixels:null,references:[]}));W.commit();const taskSnapshot=JSON.stringify(task),oldDefinition=JSON.stringify(old.fixed);W.transact(()=>W.updateBuiltin(D.tplOf(old.id)));const updated=D.tplOf(old.id);assert.equal(updated.version,4);assert.equal(updated.history.at(-1).definition.version,1);assert.equal(JSON.stringify(updated.history.at(-1).definition.fixed),oldDefinition);assert.equal(JSON.stringify(task),taskSnapshot);
 const re=setup('disabled',storage);assert.equal(re.W.readonly,false);assert.equal(re.D.tplOf(old.id).history.at(-1).definition.version,1);assert.equal(JSON.stringify(re.D.TASKS.find(x=>x.id===task.id)),taskSnapshot);
});
test('new design metadata rejects malicious structures without widening SVG or import trust',()=>{
 const {W,D,storage}=setup(),before=storage.getItem(Core.KEY);
 for(const mutate of [t=>{t.audience='everyone';},t=>{t.anatomy=[{region:'标题',role:'层级',rule:'规则',editable:'yes'}];},t=>{t.generation.variables[0].required=true;t.generation.variables[0].key='unavailableInput';},t=>{t.generation.promptTemplate={path:'/secret'};},t=>{t.generatedReferences=[{id:'forged-ai',path:'图库/内置模板/任意.svg',role:'style',origin:'ai-generated',templateVersion:t.version,accepted:false,promptFile:'assets/test.md',tool:'imagegen',generatedAt:'2026-10-17',width:900,height:1200}];}]){const b=W.snapshot(),t=b.data.TEMPLATES.find(x=>x.id==='builtin-geometry');t.state='待还原';mutate(t);assert.throws(()=>W.importBackup(JSON.stringify(b)));assert.equal(storage.getItem(Core.KEY),before);}
 assert.equal(Core.source('图库/AI参考/任意.svg'),false);
 const custom=D.TEMPLATES[0];assert.throws(()=>W.rules(custom,{fixed:['规则'],varies:[],evidence:[{sourceIndex:0,rule:'原图'}],generation:{intent:'bad',extra:'../secret'}}),/生成/);
});
test('trusted v2 drafts upgrade explicitly and preserve old task snapshots and custom rules',()=>{
 const {W,D,storage}=setup(),draft=JSON.parse(JSON.stringify(require('../builtin-templates/legacy-v2-draft.json').templates.find(t=>t.id==='builtin-agent')));Object.assign(draft,{state:'可用',evidence:[],restoreTest:false,sample:false});const b=W.snapshot();b.data.TEMPLATES[b.data.TEMPLATES.findIndex(t=>t.id===draft.id)]=draft;W.importBackup(JSON.stringify(b));
 let t=D.tplOf(draft.id);assert.equal(W.readonly,false);assert.equal(W.isTemplateUsable(t),true);assert.equal(W.referenceChoices(t,D.PROJECTS[0]).filter(a=>a.kind==='ai').length,0);assert.equal(W.builtinUpdate(t).version,4);
 const ref=W.referenceChoices(t,D.PROJECTS[0]).find(a=>a.kind==='template'),task=W.addTask(W.request('generate',D.PROJECTS[0],{templateId:t.id,title:'保留旧参考',count:1,format:'方图',ratio:'1:1',pixels:null,references:[{id:ref.id,version:ref.version,note:ref.note}]}));W.commit();const taskJson=JSON.stringify(task),fixedJson=JSON.stringify(t.fixed),generationJson=JSON.stringify(t.generation);
 W.transact(()=>W.updateBuiltin(t));assert.equal(t.version,4);assert.equal(t.generatedReferences.length,2);assert.equal(t.history.at(-1).definition.generatedReferences.length,0);assert.equal(JSON.stringify(t.history.at(-1).definition.fixed),fixedJson);assert.equal(JSON.stringify(t.history.at(-1).definition.generation),generationJson);assert.equal(JSON.stringify(task),taskJson);assert.equal(W.builtinUpdate(t),null);
 const re=setup('disabled',storage);assert.equal(re.W.readonly,false);assert.equal(JSON.stringify(re.D.TASKS.find(x=>x.id===task.id)),taskJson);
 const custom=JSON.parse(JSON.stringify(draft));custom.fixed.push('用户改过的规则');custom.state='待还原';Object.assign(D.tplOf(draft.id),custom);assert.equal(W.builtinUpdate(D.tplOf(draft.id)),null);assert.throws(()=>W.updateBuiltin(D.tplOf(draft.id)),/没有更新/);
});
test('generated reference metadata must match a known asset and cannot move across templates or imply acceptance',()=>{
 const {W,D,storage}=setup(),t=D.tplOf('builtin-agent'),p=D.PROJECTS[0],ai=W.referenceChoices(t,p).find(a=>a.kind==='ai');assert.ok(ai);const options={templateId:t.id,title:'只参考生成风格',count:1,format:'方图',ratio:'1:1',pixels:null,references:[{id:ai.id,version:ai.version,note:ai.note}]};const r=W.request('generate',p,options);assert.match(r.references[0].note,/待人工验收/);assert.equal(t.validation.aiTested,false);assert.ok(!JSON.stringify(r).includes('.png'));
 assert.throws(()=>W.request('generate',p,{...options,templateId:'builtin-interview'}),/参考/);assert.throws(()=>W.request('generate',p,{...options,references:[{id:ai.id,version:ai.version+1}]}),/参考/);
 const before=storage.getItem(Core.KEY);for(const mutate of [a=>a.path='图库/AI参考/任意.png',a=>a.promptFile='../secret.md',a=>a.accepted=true,a=>a.templateVersion=999,a=>a.origin='original',a=>a.width=1,a=>a.extra='unregistered']){const b=W.snapshot(),target=b.data.TEMPLATES.find(x=>x.id===t.id);target.state='待还原';mutate(target.generatedReferences[0]);assert.throws(()=>W.importBackup(JSON.stringify(b)));assert.equal(storage.getItem(Core.KEY),before);}
});
test('custom extended design history preserves anatomy and generation without copying imported image bytes',()=>{
 const {W,D}=setup(),t=usable(W,D),metadata=JSON.parse(JSON.stringify(require('../原型/builtin-templates.js')[0]));t.shots[0]=image;t.img=image;t.audience='general';t.anatomy=metadata.anatomy;t.generation=metadata.generation;const anatomyJson=JSON.stringify(t.anatomy),generationJson=JSON.stringify(t.generation);
 W.transact(()=>W.rules(t,{fixed:['新规则'],varies:[],evidence:[{sourceIndex:0,rule:'原图依据'}],anatomy:[{region:'新标题',role:'焦点',rule:'新分区',editable:true}],generation:{...metadata.generation,intent:'新的生成目的'}}));const h=t.history.at(-1);assert.equal(JSON.stringify(h.definition.anatomy),anatomyJson);assert.equal(JSON.stringify(h.definition.generation),generationJson);assert.ok(!JSON.stringify(h).includes('base64'));t.generation.intent='再变化';assert.equal(JSON.stringify(h.definition.generation),generationJson);
});

test('v3 startup migration archives the whole old group, skips failed and edited templates, and rejects over 32 references',()=>{
 const {W,D,storage}=setup(),catalog=require('../builtin-templates/legacy-v3.json'),backup=W.snapshot();
 for(const [i,old] of catalog.templates.slice(0,3).entries()){const t=JSON.parse(JSON.stringify(old));Object.assign(t,{state:i===1?'失败':i===2?'待还原':'可用',evidence:[],restoreTest:false,sample:false});if(i===2)t.fixed.push('用户改动');backup.data.TEMPLATES[backup.data.TEMPLATES.findIndex(a=>a.id===t.id)]=t;}
 W.importBackup(JSON.stringify(backup));const re=setup('disabled',storage),up=re.D.tplOf(catalog.templates[0].id);assert.equal(up.version,4);assert.deepEqual(up.history.at(-1).definition.generatedReferences,catalog.templates[0].generatedReferences);assert.deepEqual(up.history.at(-1).definition.shots,catalog.templates[0].shots);assert.equal(re.D.tplOf(catalog.templates[1].id).state,'失败');assert.equal(re.D.tplOf(catalog.templates[1].id).version,3);assert.equal(re.D.tplOf(catalog.templates[2].id).version,3);
 assert.throws(()=>re.W.request('generate',re.D.PROJECTS[0],{templateId:up.id,title:'预算测试',count:20,ratio:'1:1',pixels:null,references:Array.from({length:33},(_,i)=>({id:'reference-'+i,version:1}))}),/超过 32 张/);
});

test('old imported group request resolves removed originals from recoverable trash without duplicating private bytes in history',()=>{
 const {W,D}=setup(),t=usable(W,D),p=D.PROJECTS[0];t.shots=['data:image/png;base64,YQ==','data:image/png;base64,Yg=='];t.img=t.shots[0];const refs=W.styleReferences(t,p),req=W.request('generate',p,{templateId:t.id,title:'旧组',count:4,ratio:'1:1',pixels:null,references:refs.map(a=>({id:a.id,version:a.version}))});
 const original=t.shots[0];W.transact(()=>W.removeShot(t,0));const resolved=W.requestReferenceSources(req);assert.equal(resolved[0].img,original);assert.equal(resolved[1].img,t.shots[0]);assert.ok(!JSON.stringify(t.history).includes('base64'));
});

test('reference export strictly rejects photo and archived source version mismatches',()=>{
 const {W,D}=setup(),p=D.PROJECTS[0],t=usable(W,D);W.addPhotos([photo('strict-photo')]);const req=W.request('generate',p,{templateId:t.id,title:'版本严格检查',count:1,ratio:'1:1',pixels:null,references:[{id:'strict-photo',version:1}]});const wrongPhoto=JSON.parse(JSON.stringify(req));wrongPhoto.references[0].version=2;assert.throws(()=>W.requestReferenceSources(wrongPhoto),/参考图已不可用/);
 t.shots=['data:image/png;base64,YQ=='];t.img=t.shots[0];const old=W.request('generate',p,{templateId:t.id,title:'归档版本严格检查',count:1,ratio:'1:1',pixels:null,references:W.styleReferences(t,p).map(a=>({id:a.id,version:a.version}))});W.transact(()=>W.removeShot(t,0));const wrongSource=JSON.parse(JSON.stringify(old));wrongSource.references[0].version++;assert.throws(()=>W.requestReferenceSources(wrongSource),/参考图已不可用/);assert.equal(W.requestReferenceSources(old)[0].img,'data:image/png;base64,YQ==');
});
