import type {CreationStash} from '../shared/creation-contracts.ts';

type Config={sessionId:string;pageId:string;fingerprint:string;path:string;stash:CreationStash};
const bootstrap=String.raw`
(function(config){
 'use strict';
 var port=null,next=1,waiting=new Map(),connected=new Promise(function(resolve){window.addEventListener('message',function receive(event){if(event.source!==parent||!event.data||event.data.kind!=='nova-creation-connect'||event.data.sessionId!==config.sessionId||!event.ports[0])return;window.removeEventListener('message',receive);port=event.ports[0];port.onmessage=function(event){var data=event.data;if(!data||data.sessionId!==config.sessionId)return;if(data.kind==='control'){var operation=data.action==='retry'?retry():data.action==='copy-pending'?window.JC_DESKTOP.copyPending():flushSource();Promise.resolve(operation).then(function(value){port.postMessage({kind:'control-result',sessionId:config.sessionId,id:data.id,ok:true,value:value});},function(error){port.postMessage({kind:'control-result',sessionId:config.sessionId,id:data.id,ok:false,error:error.message});});return;}var item=waiting.get(data.id);if(!item)return;waiting.delete(data.id);clearTimeout(item.timer);data.ok?item.resolve(data.value):item.reject(new Error(data.error||'桌面操作没有完成'));};port.start();resolve();},false);});
 function rpc(action,payload){return connected.then(function(){return new Promise(function(resolve,reject){var id=String(next++),timer=setTimeout(function(){waiting.delete(id);reject(new Error('桌面保存没有响应，改动仍保留，请重试'));},20000);waiting.set(id,{resolve:resolve,reject:reject,timer:timer});port.postMessage({sessionId:config.sessionId,id:id,action:action,payload:payload===undefined?null:payload});});});}
 function copy(value){return value==null?value:JSON.parse(JSON.stringify(value));}
 // The mirror includes unacknowledged edits. Every queued transaction carries
 // its exact before/after records, so another frame cannot silently rebase it.
 var snapshot=copy(config.stash),operations=[],scheduled=false,chain=Promise.resolve(),storageChanges=[],lastError='',activeWrites=0,editBaseline=recordMap(config.stash.records);
 function notify(){if(port)port.postMessage({kind:'state',sessionId:config.sessionId,pending:operations.length+storageChanges.length+activeWrites,error:lastError});}
 function same(a,b){return JSON.stringify(a===undefined?null:a)===JSON.stringify(b===undefined?null:b);}
 function recordMap(records){return new Map(records.map(function(record){return [record.key,copy(record)];}));}
 function schedule(){
  notify();if(scheduled||lastError||activeWrites)return;scheduled=true;
  queueMicrotask(function(){
   scheduled=false;if(lastError)return;
   var batch=operations.splice(0),deltas=storageChanges.splice(0);
   if(!batch.length&&!deltas.length)return;
   var merged=new Map(),storageMerged=new Map();batch.forEach(function(op){op.changes.forEach(function(change){var first=merged.get(change.key);merged.set(change.key,{key:change.key,before:first?first.before:change.before,after:change.after});});});deltas.forEach(function(delta){var key=delta.area+'|'+delta.key,first=storageMerged.get(key);storageMerged.set(key,{area:delta.area,key:delta.key,before:first?first.before:delta.before,after:delta.after});});
   activeWrites++;notify();
   chain=chain.catch(function(){}).then(async function(){
    for(var attempt=0;attempt<5;attempt++){
     var current=await rpc('stash-read',null),records=recordMap(current.records),storage=copy(current.storage);
     merged.forEach(function(change){var before=records.get(change.key);if(!same(before,change.before)&&!same(before,change.after))throw new Error('另一窗口已修改同一处暂存，本窗口输入仍保留。请复制本窗口输入后处理冲突');if(change.after===undefined)records.delete(change.key);else records.set(change.key,copy(change.after));});
     storageMerged.forEach(function(delta){var values=storage[delta.area],before=Object.prototype.hasOwnProperty.call(values,delta.key)?values[delta.key]:null;if(before!==delta.before&&before!==delta.after)throw new Error('另一窗口已修改这条未提交输入，本窗口文字仍保留，请复制后处理冲突');if(delta.after===null)delete values[delta.key];else values[delta.key]=delta.after;});
     try {
      var response=await rpc('stash-write',{expectedVersion:current.version,records:Array.from(records.values()),storage:storage});
      snapshot.version=response.version;
      // Merge remote keys while preserving edits queued during this write.
      operations.forEach(function(op){op.changes.forEach(function(change){if(change.after===undefined)records.delete(change.key);else records.set(change.key,copy(change.after));});});
      snapshot.records=Array.from(records.values());
      storageChanges.forEach(function(delta){if(delta.after===null)delete storage[delta.area][delta.key];else storage[delta.area][delta.key]=delta.after;});snapshot.storage=storage;
      batch.forEach(function(op){op.resolve();});return;
     } catch(error){if(attempt===4)throw error;}
    }
   }).catch(function(error){
    operations=batch.concat(operations);storageChanges=deltas.concat(storageChanges);
    lastError=error.message;batch.forEach(function(op){op.reject(error);});
   }).finally(function(){activeWrites--;notify();if(!lastError)schedule();});
  });
 }
 function storageArea(kind){
  function set(key,value){key=String(key);var values=snapshot.storage[kind],before=Object.prototype.hasOwnProperty.call(values,key)?values[key]:null,after=value===null?null:String(value);if(before===after)return;if(after===null)delete values[key];else values[key]=after;storageChanges.push({area:kind,key:key,before:before,after:after});schedule();}
  return {getItem:function(key){return Object.prototype.hasOwnProperty.call(snapshot.storage[kind],key)?snapshot.storage[kind][key]:null;},setItem:function(key,value){set(key,value);},removeItem:function(key){set(key,null);},clear:function(){Object.keys(snapshot.storage[kind]).forEach(function(key){set(key,null);});},key:function(index){return Object.keys(snapshot.storage[kind])[index]||null;},get length(){return Object.keys(snapshot.storage[kind]).length;}};
 }
 Object.defineProperty(window,'localStorage',{value:storageArea('local')});Object.defineProperty(window,'sessionStorage',{value:storageArea('session')});
 function modifyBatch(fn){return new Promise(function(resolve,reject){
  var before=recordMap(snapshot.records),after=recordMap(snapshot.records);fn(after);var keys=new Set(Array.from(before.keys()).concat(Array.from(after.keys()))),changes=[];
  keys.forEach(function(key){var previous=before.get(key),next=after.get(key);if(same(previous,next))return;var isEdit=next&&(!previous||next.change_id!==previous.change_id),expected=isEdit?editBaseline.get(key):previous;changes.push({key:key,before:copy(expected),after:copy(next)});if(next===undefined)editBaseline.delete(key);else editBaseline.set(key,copy(next));});
  snapshot.records=Array.from(after.values());operations.push({changes:changes,resolve:resolve,reject:reject});schedule();
 });}
 var store={all:async function(){var state=await drain();if(state.error)throw new Error(state.error);var current=await rpc('stash-read',null);if(operations.length||activeWrites||storageChanges.length)return store.all();snapshot.version=current.version;snapshot.records=copy(current.records);return copy(snapshot.records);},modify:function(key,fn){return modifyBatch(function(records){var value=fn(copy(records.get(key)));if(value===null)records.delete(key);else if(value!==undefined)records.set(key,value);});},modifyBatch:modifyBatch};
 function drain(){return new Promise(function(resolve){function check(){queueMicrotask(function(){chain.then(function(){var pending=operations.length+storageChanges.length+activeWrites;if(!lastError&&pending){schedule();check();}else resolve({pending:pending,error:lastError});});});}check();});}
 // Native stash durability and source-file acknowledgement are separate barriers.
 // Keep the frame mounted unless both complete and the kit reports no unsaved work.
 async function flushSource(){
  var state=await drain();if(state.error||state.pending)throw new Error(state.error||'输入仍在等待保全');
  var kit=window.jcKit;if(!kit||!kit.ready)throw new Error('原创作页仍在恢复输入，请稍后重试');
  if(kit.state().composing)throw new Error('输入法仍在选字，请完成输入后重试');
  await kit.flush();state=await drain();var source=kit.state();
  var error=state.error||source.storeError||source.saveRefused||source.metaProblem||kit.failed;
  if(source.conflicts)error=error||'原文件存在同处冲突，请先复制本窗口输入并处理冲突';
  if(state.pending||source.pending||snapshot.records.length)error=error||'输入尚未写回原文件，请重试保全';
  if(source.composing)error=error||'输入法仍在选字，请完成输入后重试';
  if(error)throw new Error(error);
  return {pending:0,error:''};
 }
 async function retry(){lastError='';schedule();var state=await drain();if(state.error||state.pending)throw new Error(state.error||'输入仍在等待保全');if(window.jcKit)await window.jcKit.desktopRefresh();return flushSource();}
 window.JC_SERVED={fingerprint:config.fingerprint,path:config.path};
 window.JC_DESKTOP={
  openStore:function(){return connected.then(function(){return store;});},
  request:function(method,url,body){return rpc('request',{method:method,url:url,body:body===undefined?null:body});},
  reload:function(){flushSource().then(function(state){if(state.error||state.pending)throw new Error(state.error||'输入仍在等待保全');return rpc('reload',null);}).catch(function(error){lastError=error.message;notify();});},
  flush:drain,
  retry:retry,
  copyPending:function(){return rpc('copy',{text:JSON.stringify({records:snapshot.records,storage:snapshot.storage},null,2)});}
 };
 try {
  Object.defineProperty(navigator,'clipboard',{value:{
   writeText:function(text){return rpc('copy',{text:String(text)});},
   write:function(items){return Promise.all(items.map(function(item){return item.getType('text/plain').then(function(blob){return blob.text();});})).then(function(texts){return rpc('copy',{text:texts.join('\n')});});}
  }});
 } catch(error) {}
 document.addEventListener('click',function(event){var anchor=event.target&&event.target.closest?event.target.closest('a[href]'):null;if(!anchor)return;var href=anchor.getAttribute('href');if(!href||href.charAt(0)==='#')return;event.preventDefault();event.stopImmediatePropagation();rpc('open-link',{href:href}).catch(function(error){lastError=error.message;notify();});},true);
 connected.then(function(){notify();});
})(__CONFIG__);
`;
function once(text:string,before:string,after:string){if(text.split(before).length!==2)throw Error('原创作模板接点不匹配：'+before.slice(0,70));return text.replace(before,after);}
/** Only call with HTML generated from our hash-checked trusted templates. */
export function creationFrameHtml(trustedHtml:string,config:Config):string {
 let html=trustedHtml;
 // Keep the original kit algorithms and app business logic. Replace only its
 // environment seams; never execute scripts read from the user's old HTML.
 // The original kit coalesces a second flush but returns an already-resolved
 // Promise. At the desktop seam every caller must await the actual save receipt.
 html=once(html,'var debounceTimer = null, flushing = false,','var desktopFlushing = null, debounceTimer = null, flushing = false,');
 html=once(html,'if (flushing) { flushAgain = true; return Promise.resolve(); }','if (flushing) { flushAgain = true; return desktopFlushing || Promise.resolve(); }');
 html=once(html,'return Promise.resolve(p).catch(function (e) { storeError = errText(e); }).then(function () {','return desktopFlushing = Promise.resolve(p).catch(function (e) { storeError = errText(e); }).then(function () {');
 html=once(html,'function openIdb() {','function openIdb() { if (window.JC_DESKTOP) return window.JC_DESKTOP.openStore();');
 html=once(html,'function withStore(op) {','function withStore(op) { if (window.JC_DESKTOP) return Promise.resolve().then(function(){ return op(inner); });');
 html=once(html,'modify: function (key, fn) { return withStore(function (s) { return s.modify(key, fn); }); }','modify: function (key, fn) { return withStore(function (s) { return s.modify(key, fn); }); }, modifyBatch: function (fn) { return withStore(function (s) { return s.modifyBatch(fn); }); }');
 html=once(html,'function refresh() { return store.all().then(function (list) { recs = list; paint(); }); }','function refresh() { return store.all().then(function (list) { recs = list; storeError = ""; paint(); }); }');
 html=once(html,'flush: flush, tick: tick, markdown: buildMarkdown, copyChanges: copyChanges,','flush: flush, tick: tick, desktopRefresh: refresh, markdown: buildMarkdown, copyChanges: copyChanges,');
 const editStart=html.indexOf('    var jobs = list.map(function (x) { return store.modify('),editEnd=html.indexOf('      list.forEach(function (x) { delete inflight',editStart);
 if(editStart<0||editEnd<0)throw Error('原创作模板批次接点不匹配');
 const desktopEdit=String.raw`    return queue(store.modifyBatch(function (records) {
      var joined = {};
      list.forEach(function (x) { var r = records.get(x.item + '|' + x.field); if(group && r && r.group && r.group !== group) joined[r.group] = true; });
      list.forEach(function (x) { var key = x.item + '|' + x.field, next = stashFn(x.item, x.field, x.value == null ? '' : String(x.value), group)(records.get(key)); if(next === null)records.delete(key);else if(next !== undefined)records.set(key,next); });
      records.forEach(function (r,key) { if(r.group && joined[r.group] && !keys[key] && !r.conflict)records.set(key,Object.assign({},r,{group:group})); });
    })).then(function () {
`;
 html=html.slice(0,editStart)+desktopEdit+html.slice(editEnd);
 html=once(html,'var p = navigator.locks && navigator.locks.request','var p = !window.JC_DESKTOP && navigator.locks && navigator.locks.request');
 html=once(html,'function req(method, url, body) {','function req(method, url, body) { if (window.JC_DESKTOP) return window.JC_DESKTOP.request(method, url, body);');
 html=once(html,"var MODE = served && /^https?:$/.test(location.protocol) ? 'http' : 'file';","var MODE = window.JC_DESKTOP ? 'http' : (served && /^https?:$/.test(location.protocol) ? 'http' : 'file');");
 html=once(html,".catch(function (e) { storeKind = 'memory'; storeNote = errText(e); return memStore([]); })",".catch(function (e) { if(window.JC_DESKTOP) throw e; storeKind = 'memory'; storeNote = errText(e); return memStore([]); })");
 html=html.replaceAll('location.reload();','window.JC_DESKTOP.reload();').replaceAll("location.replace(SERVICE + '/p/' + encodeURIComponent(PID));","window.JC_DESKTOP.reload();");
 // file-mode localHref keeps original relative media identity; the bridge
 // re-resolves it from current refs under the granted Vault root.
 html=once(html,"var served = window.JC_SERVED && typeof window.JC_SERVED.path === 'string' && /^https?:$/.test(location.protocol);","var served = !window.JC_DESKTOP && window.JC_SERVED && typeof window.JC_SERVED.path === 'string' && /^https?:$/.test(location.protocol);");
 const safeConfig=JSON.stringify(config).replaceAll('<','\\u003c').replaceAll('\u2028','\\u2028').replaceAll('\u2029','\\u2029');
 const script=bootstrap.replace('__CONFIG__',safeConfig);
 html=once(html,'<!--jc-kit:start-->','<script>'+script+'</script><!--jc-kit:start-->');
 const policy="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
 html=once(html,'<head>','<head><meta http-equiv="Content-Security-Policy" content="'+policy+'">');
 return html;
}
