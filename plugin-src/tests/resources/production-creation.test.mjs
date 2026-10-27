import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto,createHash} from 'node:crypto';
import {acceptReviewSuggestion, reviewParagraphs, quotePosition} from '../../src/lib/file-library/production-review.mjs';
const html=fs.readFileSync(new URL('../../resources/production-creation.html',import.meta.url),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
class Element{
 constructor(){this.classes=new Set();this.classList={add:value=>this.classes.add(value),remove:value=>this.classes.delete(value)};this.value='';this.textContent='';this.children=[];this.hidden=false;this.listeners={};}
 append(...items){this.children.push(...items);}replaceChildren(...items){this.children=items;}setAttribute(key,value){this[key]=value;}addEventListener(event,fn){this.listeners[event]=fn;}play(){this.played=true;return Promise.resolve();}focus(){this.focused=true;}scrollIntoView(options){this.scrolled=options;}
}
const bodyHash=value=>createHash('sha256').update(value).digest('hex');
async function fixture(overrides={}){
 const elements=new Map(),calls=[];
 const initial={content:{id:'fixed-content',title:'演示稿',body:'保留原文',bodyHash:bodyHash('保留原文'),editToken:'content-token'},productionToken:'production-token',creation:{tNumber:'T001',references:[],analysis:'',narrative:'',suggestions:[],annotations:[],packaging:{titles:[],coverTexts:[],intros:[]},confirmedBodyHash:null}};
 if(overrides.history)initial.history=overrides.history;Object.assign(initial.content,overrides.content);Object.assign(initial.creation,overrides.creation);let state=structuredClone(initial),conflict=false;
 const descendants=()=>{const result=[];const visit=e=>{result.push(e);for(const child of e.children)visit(child);};for(const e of elements.values())visit(e);return result;};
 const get=id=>{const found=descendants().find(e=>e.id===id);if(found)return found;if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
 const context=vm.createContext({document:{getElementById:get,createElement:tag=>{const element=new Element();element.tagName=tag;return element;},querySelectorAll:()=>[]},window:{novaCreation:{basePath:'/p/'+'a'.repeat(64)},addEventListener(){},confirm:()=>true},crypto:webcrypto,TextEncoder,URL,structuredClone,fetch:async(url,options={})=>{
  calls.push({url,options});if(options.method==='POST'){
   if(conflict)return{ok:false,status:409,json:async()=>({error:{code:'CONFLICT'}})};
   const payload=JSON.parse(options.body);state={...state,content:{...state.content,body:payload.body,bodyHash:bodyHash(payload.body),editToken:'next-content-token'},productionToken:'next-production-token',creation:{...state.creation,...payload.creationPatch}};
  }
  return{ok:true,status:200,json:async()=>structuredClone(state)};
 }});
 vm.runInContext(script,context);await new Promise(resolve=>setImmediate(resolve));
 return{get,calls,context,conflict(){conflict=true;state.content.body='来自其他窗口的新稿';},edit(value){get('body').value=value;get('body').listeners.input();}};
}
test('creation page saves the fixed content through its capability using original CAS tokens',async()=>{
 const f=await fixture();assert.equal(f.get('body').value,'保留原文');f.edit('我的手动修改');await vm.runInContext('save()',f.context);
 const post=f.calls.find(x=>x.options.method==='POST'),input=JSON.parse(post.options.body);
 assert.equal(post.url,'/p/'+'a'.repeat(64)+'/save');assert.equal(Object.hasOwn(input,'contentId'),false);
 assert.equal(input.body,'我的手动修改');assert.equal(input.bodyHash,bodyHash('保留原文'));assert.equal(input.editToken,'content-token');assert.equal(input.productionToken,'production-token');
 assert.equal(f.get('body').value,'我的手动修改');assert.equal(f.get('save').disabled,true);
});
test('a conflict retains unsaved text, shows the latest body and blocks stale re-submission',async()=>{
 const f=await fixture();f.edit('必须保留的手动改稿');f.conflict();await vm.runInContext('save()',f.context);
 assert.equal(f.get('body').value,'必须保留的手动改稿');assert.equal(f.get('latest').textContent,'来自其他窗口的新稿');assert.equal(f.get('conflict').hidden,false);
 await vm.runInContext('save()',f.context);assert.equal(f.calls.filter(x=>x.options.method==='POST').length,1);
});
test('manual edits clear a previous content confirmation without changing saved tokens',async()=>{
 const f=await fixture();await f.get('confirm').onclick();assert.equal(f.get('confirm')['aria-pressed'],'true');f.edit('更新稿件');assert.equal(f.get('confirm')['aria-pressed'],'false');
 assert.equal(vm.runInContext('state.content.editToken',f.context),'content-token');
});

const suggestion=(id,quote,body,replacement=quote+'改')=>({id,quote,bodyHash:bodyHash(body),replacement,reason:'表达更准确',status:'pending'});
test('HTML embeds the same pure review rules consumed by React',()=>{
 const helper=fs.readFileSync(new URL('../../src/lib/file-library/production-review.mjs',import.meta.url),'utf8').replaceAll('export ','');
 assert.equal(html.split('// BEGIN SHARED REVIEW\n')[1].split('// END SHARED REVIEW')[0],helper);
});
test('independent suggestions can be accepted consecutively and save atomically without mutating source artifacts',async()=>{
 const body='开头保持。\n第一处原句。\n中间手稿。\n第二处原句。';
 const suggestions=[suggestion('one','第一处原句',body,'第一处更新'),suggestion('two','第二处原句',body,'第二处更新')];
 const receipt=structuredClone(suggestions);
 const f=await fixture({content:{body,bodyHash:bodyHash(body)},creation:{suggestions}});
 await vm.runInContext("decideSuggestion('one',true)",f.context);
 assert.equal(vm.runInContext("draft.suggestions[1].bodyHash",f.context),bodyHash(f.get('body').value));
 await vm.runInContext("decideSuggestion('two',true)",f.context);
 assert.equal(f.get('body').value,'开头保持。\n第一处更新。\n中间手稿。\n第二处更新。');
 await vm.runInContext('save()',f.context);const payload=JSON.parse(f.calls.find(c=>c.options.method==='POST').options.body);
 assert.equal(payload.creationPatch.suggestions.every(s=>s.status==='accepted'),true);assert.equal(payload.body,f.get('body').value);assert.deepEqual(suggestions,receipt);
});
test('overlapping, externally stale, ambiguous and user-edited suggestions stay stale and never replace handwritten text',async()=>{
 const body='唯一开头。甲乙丙丁。独立结尾。重复重复';
 const suggestions=[suggestion('one','乙丙',body,'修改'),suggestion('overlap','甲乙丙丁',body),suggestion('old','独立结尾','其他正文'),suggestion('repeat','重复',body)];
 const f=await fixture({content:{body,bodyHash:bodyHash(body)},creation:{suggestions}});
 await vm.runInContext("decideSuggestion('one',true)",f.context);const next=f.get('body').value;
 for(const id of ['overlap','old','repeat']){await vm.runInContext(`decideSuggestion('${id}',true)`,f.context);assert.equal(f.get('body').value,next);}
 f.edit('我手写保留。'+next);await vm.runInContext("decideSuggestion('old',true)",f.context);assert.equal(f.get('body').value,'我手写保留。'+next);
 assert.equal(vm.runInContext("draft.suggestions[1].bodyHash",f.context),bodyHash(body));
 assert.equal(vm.runInContext("draft.suggestions[2].bodyHash",f.context),bodyHash('其他正文'));
});
test('a manual change outside otherwise intact quotes prevents automatic rebasing',async()=>{
 const body='第一句。第二句。', suggestions=[suggestion('one','第一句',body),suggestion('two','第二句',body)];
 const f=await fixture({content:{body,bodyHash:bodyHash(body)},creation:{suggestions}});f.edit(body+'我的补充');await vm.runInContext("decideSuggestion('one',true)",f.context);
 assert.equal(f.get('body').value,body+'我的补充');assert.equal(vm.runInContext("draft.suggestions[1].bodyHash",f.context),bodyHash(body));
});
test('long paragraph quotes and annotation markers scroll the exact source into view at the end',async()=>{
 const body='开头批注原句。'+'完整手稿'.repeat(2500)+'末尾定位原句。', suggestions=[suggestion('last','末尾定位原句',body)];
 const f=await fixture({content:{body,bodyHash:bodyHash(body)},creation:{suggestions,annotations:[{id:'note',bodyHash:bodyHash(body),quote:'开头批注原句',text:'核对前后文',status:'open'}]}});
 await vm.runInContext('renderSuggestions()',f.context);vm.runInContext("focusReview('s-last',true)",f.context);
 const mark=vm.runInContext("reviewMarks.get('s-last')",f.context);assert.equal(mark.textContent,'末尾定位原句');assert.equal(mark.scrolled.block,'center');assert.equal(mark.focused,true);
 vm.runInContext("focusReview('s-last')",f.context);assert.equal(f.get('review-card-s-last').scrolled.block,'center');
 vm.runInContext("focusReview('a-note',true)",f.context);const annotation=vm.runInContext("reviewMarks.get('a-note')",f.context);assert.equal(annotation.textContent,'开头批注原句');assert.equal(annotation.scrolled.block,'center');
 assert.equal(f.get('body').value,body);
});
test('review paragraph derivation preserves every body character including multiline quotes and overlapping occurrences',()=>{
 const body='第一段\n中间\n最后原句', entries=[{id:'span',quote:'段\n中间\n最'},{id:'last',quote:'最后原句'}];
 const paragraphs=reviewParagraphs(body,entries);assert.equal(paragraphs.flatMap(p=>p.parts.map(p=>p.text)).join(''),body);assert.equal(paragraphs.length,1);assert.equal(paragraphs[0].items.length,2);assert.equal(quotePosition('aaa','aa'),-1);
});
test('newly duplicated quotes are not rebased even when their old range was disjoint',async()=>{
 const body='甲句。乙句。', suggestions=[suggestion('one','甲句',body,'乙句'),suggestion('two','乙句',body)];
 const result=await acceptReviewSuggestion({body,suggestions,id:'one'});assert.equal(result.suggestions[1].bodyHash,bodyHash(body));await assert.rejects(acceptReviewSuggestion({body:result.body,suggestions:result.suggestions,id:'two'}));
});

test('an overlapping quote that survives a containing replacement is never silently rebased',async()=>{
 const body='甲乙丙。独立句。', suggestions=[suggestion('whole','甲乙丙',body,'新乙丙'),suggestion('overlap','乙丙',body)];
 const next=await acceptReviewSuggestion({body,suggestions,id:'whole'});assert.equal(quotePosition(next.body,'乙丙')>=0,true);assert.equal(next.suggestions[1].bodyHash,bodyHash(body));await assert.rejects(acceptReviewSuggestion({body:next.body,suggestions:next.suggestions,id:'overlap'}));
});

test('history search and explicit restore fill the same body draft and preserve original CAS and stale suggestions',async()=>{
 const versions=[{transactionId:'tx1',revision:1,at:'2026-10-26',operation:'update',source:'手工编辑',author:null,reason:null,beforeBody:'之前',afterBody:'历史完整正文',bodyTruncated:false,summary:{removed:'之前',added:'历史完整正文',beforeCharacters:2,afterCharacters:6}},{transactionId:'tx2',revision:2,at:'2026-10-26',operation:'update',source:'助手候选',author:null,reason:null,beforeBody:null,afterBody:null,bodyTruncated:true,summary:{removed:'',added:'',beforeCharacters:5000,afterCharacters:6000}}];
 const f=await fixture({history:{versions,truncated:true,limit:20}});await f.get('confirm').onclick();f.context.version=versions[0];vm.runInContext('restoreHistoryVersion(version)',f.context);assert.equal(f.get('body').value,'历史完整正文');assert.equal(f.get('confirm')['aria-pressed'],'false');assert.equal(vm.runInContext('state.content.body',f.context),'保留原文');
 f.get('history-search').value='手工编辑';f.get('history-search').listeners.input();assert.equal(f.get('history').children.filter(c=>c.className==='history-entry').length,1);
 await vm.runInContext('save()',f.context);const payload=JSON.parse(f.calls.find(c=>c.options.method==='POST').options.body);assert.equal(payload.body,'历史完整正文');assert.equal(payload.bodyHash,bodyHash('保留原文'));assert.equal(payload.editToken,'content-token');assert.equal(payload.productionToken,'production-token');
});

test('registered reference media uses the same capability and timestamp playback preserves transcript text',async()=>{
 const mediaHash='d'.repeat(64),f=await fixture({creation:{references:[{id:'ref',title:'参考原片',url:'https://example.com/original',mediaAssetHash:mediaHash,originalText:'完整原文',segments:[{startMs:12500,endMs:15000,text:'逐句字幕'}]}]}});
 const descendants=[];function walk(element){descendants.push(element);for(const child of element.children)walk(child);}walk(f.get('references'));const media=descendants.find(e=>e.tagName==='video');assert.equal(media.src,'/p/'+'a'.repeat(64)+'/media/'+mediaHash);assert.equal(media.controls,true);assert.equal(media.preload,'metadata');
 assert.ok(descendants.some(e=>e.textContent==='12.5–15.0 秒  逐句字幕'));const seek=descendants.find(e=>e.textContent==='从 12.5 秒看原片');seek.onclick();assert.equal(media.currentTime,12.5);assert.equal(media.played,true);assert.equal(media.scrolled.block,'center');
 media.listeners.error();assert.ok(descendants.some(e=>e.textContent==='原片暂不可读，可查看原始来源或重新导入媒体。'&&!e.hidden));
});

test('filming checklist adds anchored shots, requires completed shots for recording and saves through unchanged CAS',async()=>{
 const f=await fixture();await vm.runInContext('renderFilming()',f.context);
 assert.equal(vm.runInContext('draft.filming',f.context),undefined);
 f.get('filming-quote').value='保留原文';f.get('filming-visual').value='展示当前界面';f.get('filming-owner').value='screen';f.get('filming-add').onclick();
 assert.equal(vm.runInContext('draft.filming.shots.length',f.context),1);assert.equal(f.get('body').value,'保留原文');
 await f.get('filming-read').onclick();assert.equal(f.get('filming-read')['aria-pressed'],'true');await f.get('filming-record').onclick();assert.equal(vm.runInContext('draft.filming.recordedBodyHash',f.context),null);
 vm.runInContext('changeFilmingShots(currentFilming().shots.map(s=>({...s,done:true})))',f.context);await f.get('filming-record').onclick();assert.equal(f.get('filming-record')['aria-pressed'],'true');
 await vm.runInContext('save()',f.context);const payload=JSON.parse(f.calls.find(c=>c.options.method==='POST').options.body);assert.equal(payload.creationPatch.filming.shots[0].quote,'保留原文');assert.equal(payload.creationPatch.filming.recordedBodyHash,bodyHash('保留原文'));assert.equal(payload.editToken,'content-token');assert.equal(payload.productionToken,'production-token');
});

test('filming confirmations become visibly stale after body editing and invalid quotes never alter body',async()=>{
 const hash=bodyHash('保留原文'),f=await fixture({creation:{filming:{shots:[],readThroughBodyHash:hash,recordedBodyHash:hash}}});await vm.runInContext('renderFilming()',f.context);assert.equal(f.get('filming-read')['aria-pressed'],'true');assert.equal(f.get('filming-record')['aria-pressed'],'true');
 f.edit('更新后的唯一正文');await vm.runInContext('renderFilming()',f.context);assert.equal(f.get('filming-read')['aria-pressed'],'false');assert.equal(f.get('filming-record')['aria-pressed'],'false');assert.match(f.get('filming-status').textContent,/正文版本已变/);
 f.get('filming-quote').value='不存在的句子';f.get('filming-visual').value='展示画面';f.get('filming-owner').value='screen';f.get('filming-add').onclick();assert.equal(vm.runInContext('draft.filming.shots.length',f.context),0);assert.equal(f.get('body').value,'更新后的唯一正文');
 await f.get('filming-read').onclick();assert.equal(vm.runInContext('draft.filming.readThroughBodyHash',f.context),bodyHash('更新后的唯一正文'));assert.equal(vm.runInContext('draft.filming.recordedBodyHash',f.context),hash);
});


test('creation views keep one untouched body draft and switch only the relevant workspace',async()=>{
 const f=await fixture();f.edit('保留切换前的手写稿');
 await vm.runInContext("setView('reading')",f.context);
 assert.equal(f.get('compare-view').hidden,true);assert.equal(f.get('reading-view').hidden,false);assert.equal(f.get('recording-view').hidden,true);
 assert.equal(f.get('view-reading')['aria-selected'],'true');assert.equal(f.get('body').value,'保留切换前的手写稿');
 await vm.runInContext("setView('recording')",f.context);assert.equal(f.get('recording-view').hidden,false);assert.equal(f.get('reading-view').hidden,true);
 await vm.runInContext("setView('compare')",f.context);assert.equal(f.get('compare-view').hidden,false);assert.equal(f.get('body').value,'保留切换前的手写稿');
 assert.equal(f.calls.filter(c=>c.options.method==='POST').length,0);
 await vm.runInContext('save()',f.context);assert.equal(JSON.parse(f.calls.find(c=>c.options.method==='POST').options.body).body,'保留切换前的手写稿');
});
test('selecting a sentence reuses it for an inline annotation and filming without dirtying or saving the draft',async()=>{
 const f=await fixture();f.get('body').selectionStart=0;f.get('body').selectionEnd=4;
 f.get('body').listeners.select();assert.equal(f.get('selection-tools').hidden,false);assert.equal(f.get('annotation-quote').value,'保留原文');assert.equal(f.get('save').disabled,true);
 f.get('quote').onclick();assert.equal(f.get('annotation-composer').hidden,false);assert.equal(f.get('annotation-text').focused,true);
 f.get('annotation-text').value='这句保留现场演示';await f.get('add-annotation').onclick();assert.equal(vm.runInContext('draft.annotations[0].quote',f.context),'保留原文');
 f.get('selection-filming').onclick();assert.equal(f.get('recording-view').hidden,false);assert.equal(f.get('filming-quote').value,'保留原文');assert.equal(f.get('filming-visual').focused,true);
 assert.equal(f.get('body').value,'保留原文');assert.equal(f.calls.filter(c=>c.options.method==='POST').length,0);
});
test('empty creation draft gives actionable guidance and no invented body or automatic changes',async()=>{
 const f=await fixture({content:{body:'',bodyHash:bodyHash('')}});assert.equal(f.get('empty-draft').hidden,false);assert.equal(f.get('body').value,'');assert.equal(f.get('save').disabled,true);
 f.edit('我写下第一句');assert.equal(f.get('empty-draft').hidden,true);assert.equal(f.get('body').value,'我写下第一句');assert.equal(f.calls.filter(c=>c.options.method==='POST').length,0);
});

test('a new selection cannot reattach an unfinished annotation or filming description to another sentence',async()=>{
 const body='第一句。第二句。',f=await fixture({content:{body,bodyHash:bodyHash(body)}});
 f.get('body').selectionStart=0;f.get('body').selectionEnd=4;f.get('body').listeners.select();f.get('quote').onclick();f.get('annotation-text').value='只针对第一句的批注';
 f.get('body').selectionStart=4;f.get('body').selectionEnd=8;f.get('body').listeners.select();assert.equal(f.get('annotation-quote').value,'第一句。');f.get('quote').onclick();assert.equal(f.get('annotation-quote').value,'第一句。');assert.equal(f.get('annotation-text').value,'只针对第一句的批注');
 f.get('filming-quote').value='第一句。';f.get('filming-visual').value='第一句的演示画面';f.get('selection-filming').onclick();assert.equal(f.get('filming-quote').value,'第一句。');assert.equal(f.get('filming-visual').value,'第一句的演示画面');
 for(const view of ['reading','recording','compare'])vm.runInContext(`setView('${view}')`,f.context);assert.equal(f.get('annotation-text').value,'只针对第一句的批注');assert.equal(f.get('annotation-quote').value,'第一句。');assert.equal(f.get('body').value,body);assert.equal(f.calls.filter(c=>c.options.method==='POST').length,0);
});

test('routine load and save use the compact saved status while errors remain visible',async()=>{
 const f=await fixture();assert.equal(f.get('notice').hidden,true);assert.equal(f.get('draft-status').textContent,'已保存到工作台');f.edit('一次明确保存');await vm.runInContext('save()',f.context);assert.equal(f.get('notice').hidden,true);assert.equal(f.get('draft-status').textContent,'已保存到工作台');f.edit('保留冲突输入');f.conflict();await vm.runInContext('save()',f.context);assert.equal(f.get('notice').hidden,false);assert.match(f.get('notice').textContent,/冲突/);
});
