import {sha256} from './fingerprint.mjs';
export const MAX_CREATION_BYTES = 8*1024*1024;
export const isRecord = value => value!==null && typeof value==='object' && !Array.isArray(value);
export function protocolError(code,detail='') { const error=new Error(code+(detail?':'+detail:''));error.code=code;throw error; }
export function kindOf(item) {
 if(typeof item?.kind==='string' && item.kind)return item.kind;
 for(const [prefix,kind] of [['info-','info'],['seg-','segment'],['sug-','suggestion']])if(item?.id?.startsWith(prefix))return kind;
 if(item?.locked?.original!==undefined && item?.locked?.segment!==undefined)return 'suggestion';
 if(item?.locked?.type!==undefined && item?.locked?.stage!==undefined)return 'info';
 if(item?.locked?.order!==undefined)return 'segment';
 return null;
}
// Token walk detects duplicate keys before JSON.parse can discard them. JSON.parse
// remains responsible for the JSON grammar; this walk is bounded and never evals.
function uniqueJson(text) {
 let i=0;
 const ws=()=>{while(/\s/.test(text[i]??'')&&i<text.length)i++;};
 const string=()=>{const start=i++;while(i<text.length){if(text[i]==='\\'){i+=2;continue;}if(text[i++]==='"')return JSON.parse(text.slice(start,i));}protocolError('INVALID_JSON');};
 function value(depth=0){
  if(depth>160)protocolError('JSON_TOO_DEEP'); ws();
  if(text[i]==='"'){string();return;}
  if(text[i]==='{'){i++;ws();const keys=new Set();if(text[i]==='}'){i++;return;}while(i<text.length){ws();if(text[i]!=='"')protocolError('INVALID_JSON');const key=string();if(keys.has(key))protocolError('DUPLICATE_JSON_KEY',key);keys.add(key);ws();if(text[i++]!==':')protocolError('INVALID_JSON');value(depth+1);ws();const c=text[i++];if(c==='}')return;if(c!==',')protocolError('INVALID_JSON');}protocolError('INVALID_JSON');}
  if(text[i]==='['){i++;ws();if(text[i]===']'){i++;return;}while(i<text.length){value(depth+1);ws();const c=text[i++];if(c===']')return;if(c!==',')protocolError('INVALID_JSON');}protocolError('INVALID_JSON');}
  const m=/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(i));if(!m)protocolError('INVALID_JSON');i+=m[0].length;
 }
 value();ws();if(i!==text.length)protocolError('INVALID_JSON');
 try{return JSON.parse(text);}catch{protocolError('INVALID_JSON');}
}
function dataRange(text) {
 let i=0; const found=[];
 while(i<text.length){
  const start=text.indexOf('<',i);if(start<0)break;
  if(text.startsWith('<!--',start)){const end=text.indexOf('-->',start+4);if(end<0)protocolError('INVALID_HTML_COMMENT');i=end+3;continue;}
  const match=/^<([A-Za-z][A-Za-z0-9:-]*)\b/.exec(text.slice(start));if(!match){i=start+1;continue;}
  const tag=match[1].toLowerCase();let at=start+match[0].length;let quote=null;
  for(;at<text.length;at++){const c=text[at];if(quote){if(c===quote)quote=null;}else if(c==='"'||c==="'")quote=c;else if(c==='>')break;}
  if(at===text.length)protocolError('INVALID_HTML_TAG');
  const attrs=text.slice(start+match[0].length,at);const parsed=new Map();
  for(const a of attrs.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)){
   const key=a[1].toLowerCase();if(parsed.has(key)&&['id','type'].includes(key))protocolError('DUPLICATE_HTML_ATTRIBUTE');parsed.set(key,a[2]??a[3]??a[4]??'');
  }
  i=at+1;
  if(['script','style','textarea','title','xmp','iframe','noembed','noframes'].includes(tag)){
   const close=new RegExp('</'+tag+'\\s*>','ig');close.lastIndex=i;const end=close.exec(text);if(!end)protocolError('UNCLOSED_RAW_TAG',tag);
   if(tag==='script'&&parsed.get('id')==='jc-doc'){
    if(parsed.get('type')?.toLowerCase()!=='application/json')protocolError('JC_DOC_TYPE');
    found.push({start:i,end:end.index});
   }
   i=close.lastIndex;
  }
 }
 if(found.length!==1)protocolError('JC_DOC_COUNT',String(found.length));return found[0];
}
export function validateRaw(raw) {
 const issues=[];
 if(!isRecord(raw)||!Array.isArray(raw.items)||typeof raw.page_id!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(raw.page_id))protocolError('INVALID_JC_DOC');
 const seen=new Set();
 for(const item of raw.items){
  if(!isRecord(item)){issues.push('INVALID_ITEM');continue;}
  if(typeof item.id!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(item.id)||/^\d+$/.test(item.id))issues.push('INVALID_ITEM_ID');
  if(seen.has(item.id))issues.push('DUPLICATE_ITEM_ID:'+item.id);seen.add(item.id);
  if(!kindOf(item))issues.push('MISSING_ITEM_KIND:'+item.id);
  if(!isRecord(item.locked))issues.push('INVALID_LOCKED:'+item.id);
  if(!isRecord(item.fields)||Object.values(item.fields).some(x=>typeof x!=='string'))issues.push('NON_STRING_FIELDS:'+item.id);
 }
 return issues;
}
export function parseCreationHtml(bytes,source) {
 if(!(bytes instanceof Uint8Array)||bytes.byteLength>MAX_CREATION_BYTES)protocolError('CREATION_SIZE_LIMIT');
 if(!source||typeof source.sourceId!=='string'||typeof source.documentId!=='string')protocolError('SOURCE_REQUIRED');
 let text;try{text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}catch{protocolError('INVALID_UTF8');}
 const range=dataRange(text),raw=uniqueJson(text.slice(range.start,range.end));const issues=validateRaw(raw);
 const orders=new Set();for(const item of raw.items.filter(it=>kindOf(it)==='segment')){const order=item.locked?.order;if(typeof order!=='number'||!Number.isFinite(order))issues.push('MISSING_ORDER:'+item.id);else if(orders.has(order))issues.push('DUPLICATE_ORDER:'+order);orders.add(order);}
 const fatalIssues=issues.filter(x=>!x.startsWith('MISSING_ORDER:')&&!x.startsWith('DUPLICATE_ORDER:'));
 return {source:{...source},revision:sha256(bytes),pageId:raw.page_id,raw,items:raw.items,writable:source.writable!==false&&fatalIssues.length===0,issues};
}
export function orderedSegments(doc) {
 return doc.items.filter(it=>kindOf(it)==='segment').map((item,index)=>({item,index,order:typeof item.locked?.order==='number'?item.locked.order:Infinity})).sort((a,b)=>a.order-b.order||a.index-b.index).map(x=>x.item);
}
export function replaceCreationData(bytes,doc) {
 const original=parseCreationHtml(bytes,doc.source);
 if(!original.writable||!doc.writable||validateRaw(doc.raw).length)protocolError('READ_ONLY');
 if(original.pageId!==doc.pageId||doc.raw.page_id!==doc.pageId)protocolError('IDENTITY_CHANGED');
 if(JSON.stringify(original.raw)===JSON.stringify(doc.raw))return Buffer.from(bytes);
 const text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes),range=dataRange(text);
 const start=Buffer.byteLength(text.slice(0,range.start)),end=Buffer.byteLength(text.slice(0,range.end));
 const json='\n'+JSON.stringify(doc.raw,null,2).replaceAll('<','\\u003c').replaceAll('>','\\u003e')+'\n';
 const out=Buffer.concat([Buffer.from(bytes).subarray(0,start),Buffer.from(json),Buffer.from(bytes).subarray(end)]);
 if(out.byteLength>MAX_CREATION_BYTES)protocolError('CREATION_SIZE_LIMIT');return out;
}
