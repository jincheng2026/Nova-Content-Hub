import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto,createHash} from 'node:crypto';
const html=fs.readFileSync(new URL('../../resources/production-creation.html',import.meta.url),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
class Element{
 constructor(){this.value='';this.textContent='';this.children=[];this.hidden=false;this.listeners={};}
 append(...items){this.children.push(...items);}replaceChildren(...items){this.children=items;}setAttribute(key,value){this[key]=value;}addEventListener(event,fn){this.listeners[event]=fn;}focus(){}
}
const bodyHash=value=>createHash('sha256').update(value).digest('hex');
async function fixture(){
 const elements=new Map(),calls=[];
 const initial={content:{id:'fixed-content',title:'演示稿',body:'保留原文',bodyHash:bodyHash('保留原文'),editToken:'content-token'},productionToken:'production-token',creation:{tNumber:'T001',references:[],analysis:'',narrative:'',suggestions:[],annotations:[],packaging:{titles:[],coverTexts:[],intros:[]},confirmedBodyHash:null}};
 let state=structuredClone(initial),conflict=false;
 const get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
 const context=vm.createContext({document:{getElementById:get,createElement:()=>new Element(),querySelectorAll:()=>[]},window:{novaCreation:{basePath:'/p/'+'a'.repeat(64)},addEventListener(){},confirm:()=>true},crypto:webcrypto,TextEncoder,URL,structuredClone,fetch:async(url,options={})=>{
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
