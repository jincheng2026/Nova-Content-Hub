import fs from 'node:fs';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {readBytes,safe} from '../vault/core.mjs';
import {kindOf,isRecord,protocolError,validateRaw,parseCreationHtml} from './parse.mjs';
import {sha256,norm} from './fingerprint.mjs';
import {transactCreation,sourcePath,resultFor,assertUniqueCreationPage} from './store.mjs';
import {verifyCreationRemoval} from './decisions.mjs';
const TYPES=['口播','AI教程','AI科普'],STAGES=['写稿','审稿','定稿','录制准备'];
const LOCKED={info:['type','stage','title','narrative','speech_rate'],segment:['order','title','role','refs','baseline'],suggestion:['segment','category','source','original','reason','basis','verdict']};
const FIELDS={info:['overall_note','approved','recorded'],segment:['mine','note'],suggestion:['proposed','decision']};
const NARRATIVE=['story','audience','problem'];
const filled=s=>typeof s==='string'&&s.trim().length>0;
const clone=x=>structuredClone(x);
const check=(condition,code)=>{if(!condition)protocolError('BUILD_SCHEMA',code);};
function extra(x,kind){
 check(isRecord(x),'ITEM_OBJECT');for(const part of ['locked','fields']){
  if(x[part]===undefined)continue;check(isRecord(x[part]),part.toUpperCase()+'_OBJECT');
  const disallowed=[...(LOCKED[kind]??[]),...(FIELDS[kind]??[]),'id','kind'];
  check(!Object.keys(x[part]).some(k=>disallowed.includes(k)),'FIXED_KEY_IN_'+part);
  if(part==='locked')check(!Object.hasOwn(x.locked,'ai_state'),'AI_STATE_REQUIRES_REPLY');
  else check(Object.values(x.fields).every(v=>typeof v==='string'),'STRING_FIELDS_REQUIRED');
 }
}
export function countQuote(hay,needle){hay=norm(hay??'');needle=norm(needle??'');if(!needle)return 0;let count=0,index=hay.indexOf(needle);while(index>=0){count++;index=hay.indexOf(needle,index+1);}return count;}
const pos=v=>(typeof v==='number'&&Number.isInteger(v))||typeof v==='string'&&/^\d+$/.test(v)?Number(v):null;
function segRef(v,segs){const n=pos(v);return n===null?segs.find(x=>x.id===v):segs[n-1];}
function validateReference(ref){
 check(isRecord(ref),'REFERENCE_OBJECT');check(['口播原话','简介文案','发布文字','说明'].includes(ref.source_type),'SOURCE_TYPE');
 check(ref.source_type==='说明'||filled(ref.who),'REF_WHO');check(filled(ref.text),'REF_TEXT');
 for(const key of ['who','time','url','visual'])if(key in ref)check(typeof ref[key]==='string','REF_'+key);
 if(ref.url){let u;try{u=new URL(ref.url);}catch{}check(u&&['http:','https:'].includes(u.protocol)&&u.hostname,'REF_URL');}
 if(ref.role!==undefined)check(['对标','补充参考','效果样例'].includes(ref.role),'REF_ROLE');
 if(ref.video!==undefined)check(filled(ref.video)&&!/^([A-Za-z][A-Za-z0-9+.-]*:|\/)/.test(ref.video)&&!ref.video.includes('\\'),'REF_VIDEO_RELATIVE');
}
function validateSuggestion(g,segs){
 extra(g,'suggestion');check(segRef(g.segment,segs),'SUGGESTION_SEGMENT');
 check(['表达','衔接','拗口','口径','事实'].includes(g.category),'CATEGORY');check(['AI','运营'].includes(g.source??'AI'),'SUGGESTION_SOURCE');
 check(filled(g.original)&&typeof g.proposed==='string'&&filled(g.reason),'SUGGESTION_TEXT');
 check(isRecord(g.basis)&&['参考口播','参考画面','你之前定的','AI 自己的判断','运营'].includes(g.basis.type)&&typeof (g.basis.text??'')==='string','BASIS');
 check(['已定要改','待你定','等录屏再定','不用改'].includes(g.verdict??'待你定'),'VERDICT');
}
function secs(value){const m=/(\d+):(\d{1,2})(?::(\d{1,2}))?/.exec(value??'');return !m?null:m[3]===undefined?Number(m[1])*60+Number(m[2]):Number(m[1])*3600+Number(m[2])*60+Number(m[3]);}
function timeMatches(time,refs){const t=secs(time);if(t===null)return false;const ranges=refs.map(r=>(r.time??'').match(/\d+:\d{1,2}(?::\d{1,2})?/g)).filter(x=>x?.length>=2).map(x=>[secs(x[0]),secs(x[1])]);return !ranges.length||ranges.some(([a,b])=>t>=a-3&&t<=b+3);}
function validateAnalysisItems(data){
 const refnoted=new Set();let skeletons=0;const suggestionIds=new Set((data.suggestions??[]).map(x=>x.id));
 for(const item of data.items??[]){const lk=item.locked??{};
  if(item.kind==='refnote'){
   const seg=segRef(lk.segment,data.segments);check(seg,'REFNOTE_SEGMENT');check(!refnoted.has(seg),'DUPLICATE_REFNOTE');refnoted.add(seg);
   const families=new Map();for(const r of seg.refs??[])if(r.source_type!=='说明'&&filled(r.who)){if(!families.has(r.who))families.set(r.who,[]);families.get(r.who).push(r);}
   check(filled(lk.summary)&&[...lk.summary].length<=180,'REFNOTE_SUMMARY');check(Array.isArray(lk.points)&&lk.points.length>=1&&lk.points.length<=4,'REFNOTE_POINTS');
   for(const pt of lk.points){check(isRecord(pt)&&['引入','顺序','操作','解释','画面','定义','比喻','例子','对照','收句'].includes(pt.tag)&&filled(pt.say),'REFNOTE_POINT');check(['共性','独有','多做'].includes(pt.cover)&&Array.isArray(pt.who)&&pt.who.length&&pt.who.every(w=>families.has(w)),'REFNOTE_COVER');check(Array.isArray(pt.quotes)&&pt.quotes.length,'QUOTE_EVIDENCE');
    for(const q of pt.quotes){check(isRecord(q)&&families.has(q.who)&&filled(q.text)&&[...q.text].length<=60,'QUOTE_EVIDENCE');check(families.get(q.who).some(r=>countQuote(r.text,q.text)>0),'QUOTE_EVIDENCE');check(filled(q.time)&&timeMatches(q.time,families.get(q.who)),'QUOTE_TIME');}
    const quoted=new Set(pt.quotes.map(q=>q.who));if(pt.cover==='共性')check(pt.who.length>=2&&pt.who.every(w=>quoted.has(w)),'QUOTE_EACH_FAMILY');else check(pt.who.length===1&&quoted.has(pt.who[0]),'QUOTE_FAMILY');
    if(pt.cover==='多做')check(families.has(pt.over)&&!pt.who.includes(pt.over),'REFNOTE_OVER');
    if(pt.visual!==undefined){const v=pt.visual;check(isRecord(v)&&families.has(v.who)&&filled(v.text)&&filled(v.time)&&timeMatches(v.time,families.get(v.who)),'VISUAL_EVIDENCE');}
   }
   check(lk.borrow===undefined||Array.isArray(lk.borrow)&&lk.borrow.length<=3,'REFNOTE_BORROW');for(const b of lk.borrow??[])check(isRecord(b)&&['照用','超一步'].includes(b.type)&&filled(b.text)&&(b.sug===undefined||suggestionIds.has(b.sug)),'REFNOTE_BORROW');
   check(lk.merged===undefined||Array.isArray(lk.merged),'REFNOTE_MERGED');for(const m of lk.merged??[])check(isRecord(m)&&families.has(m.who)&&families.has(m.base)&&m.who!==m.base,'REFNOTE_MERGED');
  }else if(item.kind==='skeleton'){
   check(++skeletons<=1,'DUPLICATE_SKELETON');check(Array.isArray(lk.families)&&lk.families.length>=1&&lk.families.length<=4&&lk.families.every(f=>isRecord(f)&&filled(f.who)),'SKELETON_FAMILIES');const names=new Set(lk.families.map(f=>f.who));
   check(Array.isArray(lk.rows)&&lk.rows.length>=1&&lk.rows.length<=8,'SKELETON_ROWS');for(const row of lk.rows){check(isRecord(row)&&filled(row.step)&&isRecord(row.cells),'SKELETON_ROW');check(Object.keys(row.cells).every(k=>names.has(k)),'SKELETON_FAMILY');if(row.segment!==undefined&&row.segment!==null)check(segRef(row.segment,data.segments),'SKELETON_SEGMENT');}
  }
 }
}

export function validateBuildData(data){
 check(isRecord(data),'DATA_OBJECT');check(filled(data.content_id),'CONTENT_ID');check(TYPES.includes(data.type),'TYPE');check(STAGES.includes(data.stage),'STAGE');check(filled(data.title),'TITLE');
 check(data.narrative===undefined||isRecord(data.narrative),'NARRATIVE');
 for(const key of NARRATIVE){const value=data.narrative?.[key];if(value!==undefined)check(typeof value==='string','NARRATIVE_'+key);if(data.type==='口播')check(filled(value),'NARRATIVE_'+key);}
 const rate=data.speech_rate??7;check(typeof rate==='number'&&Number.isFinite(rate)&&rate>0&&rate<=20,'SPEECH_RATE');
 if(data.service_origin!==undefined){const match=/^http:\/\/127\.0\.0\.1:(\d{1,5})$/.exec(data.service_origin);check(match&&Number(match[1])>0&&Number(match[1])<=65535,'SERVICE_ORIGIN');}
 extra(data.info??{},'info');check(Array.isArray(data.segments)&&data.segments.length>0,'SEGMENTS');
 for(const seg of data.segments){extra(seg,'segment');check(filled(seg.title)&&typeof seg.mine==='string','SEGMENT_TITLE_MINE');for(const key of ['role','baseline','note'])if(key in seg)check(typeof seg[key]==='string','SEGMENT_'+key);check(seg.refs===undefined||Array.isArray(seg.refs),'REFS_ARRAY');for(const ref of seg.refs??[])validateReference(ref);}
 check(data.suggestions===undefined||Array.isArray(data.suggestions),'SUGGESTIONS_ARRAY');for(const g of data.suggestions??[])validateSuggestion(g,data.segments);
 check(data.items===undefined||Array.isArray(data.items),'ITEMS_ARRAY');
 for(const item of data.items??[]){check(isRecord(item)&&typeof item.kind==='string'&&/^[a-z][a-z0-9_]{0,31}$/.test(item.kind)&&!Object.hasOwn(FIELDS,item.kind),'EXTRA_ITEM_KIND');extra(item,item.kind);if(item.locked?.segment!==undefined)check(segRef(item.locked.segment,data.segments),'EXTRA_ITEM_SEGMENT');}
 validateAnalysisItems(data);
 const ids=new Set();for(const item of [...data.segments,...(data.suggestions??[]),...(data.items??[])])if(item.id!==undefined){check(typeof item.id==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(item.id)&&!/^\d+$/.test(item.id)&&!item.id.startsWith('info-'),'ITEM_ID');check(!ids.has(item.id),'DUPLICATE_ID');ids.add(item.id);}
}
function newId(kind,taken){let id;do{id=(kind==='segment'?'seg':kind==='suggestion'?'sug':kind)+'-'+randomBytes(6).toString('hex');}while(taken.has(id));taken.add(id);return id;}
export function assembleCreationData(data,old=null,options={}){
 validateBuildData(data);if(old)check(validateRaw(old).length===0,'OLD_DOC_INVALID');
 const oldMap=new Map((old?.items??[]).map(it=>[it.id,it])),taken=new Set([...oldMap.keys(),...data.segments.map(x=>x.id),...(data.suggestions??[]).map(x=>x.id),...(data.items??[]).map(x=>x.id)].filter(Boolean));
 const warnings=[];
 function keep(item){const prior=oldMap.get(item.id);if(!prior)return item;if(kindOf(prior)!==kindOf(item))protocolError('ITEM_KIND_CHANGED',item.id);
  for(const [key,value] of Object.entries(prior.fields)){if(Object.hasOwn(item.fields,key)&&item.fields[key]!==''&&norm(item.fields[key])!==norm(value))warnings.push('AUTHOR_FIELD_PRESERVED:'+item.id+':'+key);}
  return {...clone(prior),...item,locked:{...clone(prior.locked),...item.locked,...(Object.hasOwn(prior.locked,'ai_state')?{ai_state:clone(prior.locked.ai_state)}:{})},fields:{...item.fields,...clone(prior.fields)}};
 }
 const oldInfo=old?.items.find(x=>kindOf(x)==='info'),info=keep({id:oldInfo?.id??newId('info',taken),kind:'info',locked:{type:data.type,stage:data.stage,title:data.title,narrative:Object.fromEntries(NARRATIVE.map(k=>[k,data.narrative?.[k]??''])),speech_rate:data.speech_rate??7,...clone(data.info?.locked??{}),ai_state:{}},fields:{overall_note:'',approved:'',recorded:'',...clone(data.info?.fields??{})}});
 const segs=data.segments.map((s,i)=>keep({id:s.id??newId('segment',taken),kind:'segment',locked:{order:i+1,title:s.title,role:s.role??'',refs:(s.refs??[]).map(ref=>({who:'',time:'',url:'',...clone(ref)})),baseline:s.baseline??'',...clone(s.locked??{}),ai_state:{}},fields:{mine:s.mine,note:s.note??'',...clone(s.fields??{})}}));
 const sugs=(data.suggestions??[]).map(g=>{const segment=segRef(g.segment,segs),id=g.id??newId('suggestion',taken);const item=keep({id,kind:'suggestion',locked:{segment:segment.id,category:g.category,source:g.source??'AI',original:g.original,reason:g.reason,basis:{type:g.basis.type,text:g.basis.text??''},verdict:g.verdict??'待你定',...clone(g.locked??{})},fields:{proposed:g.proposed,decision:'',...clone(g.fields??{})}});
  if(countQuote(segment.fields.mine,g.original)!==1){if(!oldMap.has(id))protocolError('QUOTE_NOT_UNIQUE',id);if(!item.fields.decision)warnings.push('QUOTE_NOT_UNIQUE:'+id);}
  return item;
 });
 const others=(data.items??[]).map(x=>{const item={...clone(x),id:x.id??newId(x.kind,taken),locked:clone(x.locked??{}),fields:clone(x.fields??{})};if(item.locked.segment!==undefined)item.locked.segment=segRef(item.locked.segment,segs).id;return keep(item);});
 const items=[info,...segs,...sugs,...others],ids=new Set(items.map(x=>x.id)),missing=[...oldMap.keys()].filter(id=>!ids.has(id));
 if(missing.length){const allowed=options.removeItemIds;if(!options.authorDecisionId||!Array.isArray(allowed)||missing.some(id=>!allowed.includes(id))||allowed.some(id=>!missing.includes(id)))protocolError('MISSING_OLD_ITEMS',missing.join(','));}
 const raw={...clone(old??{}),page_id:old?.page_id??randomBytes(10).toString('hex'),content_id:data.content_id,kind:'创作页',schema:1,token:old?.token??randomBytes(18).toString('base64url'),service_origin:data.service_origin??old?.service_origin??'http://127.0.0.1:8977',items};
 const issues=validateRaw(raw);if(issues.length)protocolError('BUILD_SCHEMA',issues.join(','));return {raw,warnings};
}
export function exportCreationData(doc){
 const info=doc.items.find(it=>kindOf(it)==='info');if(!info)protocolError('INFO_REQUIRED');
 const pick=(object,keys)=>Object.fromEntries(Object.entries(object).filter(([k])=>keys.includes(k))),extras=(object,keys)=>Object.fromEntries(Object.entries(object).filter(([k])=>!keys.includes(k)&&k!=='ai_state'));
 return {content_id:doc.raw.content_id,...pick(info.locked,LOCKED.info),service_origin:doc.raw.service_origin,info:{locked:extras(info.locked,LOCKED.info),fields:extras(info.fields,FIELDS.info)},segments:doc.items.filter(it=>kindOf(it)==='segment').sort((a,b)=>a.locked.order-b.locked.order).map(it=>({id:it.id,...pick(it.locked,['title','role','refs','baseline']),...pick(it.fields,FIELDS.segment),locked:extras(it.locked,LOCKED.segment),fields:extras(it.fields,FIELDS.segment)})),suggestions:doc.items.filter(it=>kindOf(it)==='suggestion').map(it=>({id:it.id,...pick(it.locked,LOCKED.suggestion),proposed:it.fields.proposed,locked:extras(it.locked,LOCKED.suggestion),fields:extras(it.fields,FIELDS.suggestion)})),items:doc.items.filter(it=>!['info','segment','suggestion'].includes(kindOf(it))).map(it=>({id:it.id,kind:kindOf(it),locked:extras(it.locked,[]),fields:clone(it.fields)}))};
}
const RESOURCE=new URL('../../../resources/jincheng-creation/',import.meta.url);
export function loadTrustedCreationTemplate(){
 const base=fileURLToPath(RESOURCE),manifest=JSON.parse(fs.readFileSync(base+'provenance.json','utf8')),parts={};
 for(const [name,relative] of Object.entries({shell:'template/shell.html',style:'template/style.css',app:'template/app.js',kit:'kit/kit.js'})){
  const bytes=fs.readFileSync(base+relative);if(sha256(bytes)!==manifest.files[relative]?.sha256)protocolError('TRUSTED_TEMPLATE_HASH',relative);
  const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);if(name!=='shell'&&!text.trimEnd().endsWith('/* jc-'+name+':eof */'))protocolError('TRUSTED_TEMPLATE_TRUNCATED',name);parts[name]=text;
 }
 return {parts,version:manifest.version};
}
const escapeHTML=s=>String(s).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#x27;'}[ch]));
export function renderCreationHtml(raw,options={}){
 const {parts}=loadTrustedCreationTemplate();
 if(options.mode!=='trusted-frame'){
  parts.kit=parts.kit.replace('function req(method, url, body) {','function req(method, url, body) { if(!window.JC_DESKTOP) return Promise.resolve({ok:false,status:403,data:{error:"此文件在应用外为只读，请在自媒体工作台中继续编辑"}});');
  parts.kit=parts.kit.replace('function init() {\n    buildUi();','function init() {\n    buildUi();\n    if(!window.JC_DESKTOP){ fail("此文件在应用外为只读，请在自媒体工作台中继续编辑"); return; }');
 }const info=raw.items.find(it=>kindOf(it)==='info');
 const title=escapeHTML(raw.content_id+' '+(info?.locked.title??'')),json=JSON.stringify(raw,null,2).replaceAll('<','\\u003c').replaceAll('>','\\u003e');
 // One pass over the frozen shell: user text containing {{APP}} is inert data.
 const html=parts.shell.replace(/\{\{(TITLE|DOC|STYLE|KIT|APP)\}\}/g,(_,name)=>name==='TITLE'?title:name==='DOC'?json:parts[name.toLowerCase()].replace(name==='STYLE'?/<\/style/gi:/<\/script/gi,name==='STYLE'?'<\\/style':'<\\/script'));
 const bytes=Buffer.from(html);parseCreationHtml(bytes,{sourceId:'trusted-build',documentId:raw.page_id});return bytes;
}
function assertBuildBinding(input,b){if(input.work?.vaultId!==b.vaultId||input.data?.content_id!==input.work?.workId)protocolError('WORK_BINDING_CONFLICT');if(input.templateVersion!==loadTrustedCreationTemplate().version)protocolError('TEMPLATE_VERSION_MISMATCH');}
export async function buildCreationPage(root,input){
 return transactCreation(root,{operation:'build',source:input.source,input},input.mutationId,r=>{
  const runtime=JSON.parse(readBytes(r,'.workbench/vault.json'));assertBuildBinding(input,runtime);
  const relative=sourcePath(input.source);if(fs.existsSync(safe(r,relative,true)))protocolError('ALREADY_EXISTS');
  const {raw,warnings}=assembleCreationData(input.data);assertUniqueCreationPage(r,input.source,raw.page_id);const bytes=renderCreationHtml(raw);
  return {action:'create',path:relative,beforeHash:null,after:Buffer.from(bytes).toString('base64'),creationPageId:raw.page_id,result:resultFor(input.mutationId,bytes,raw.items.map(x=>x.id),{pageId:raw.page_id,warnings})};
 });
}
export async function regenerateCreationPage(root,input){
 return transactCreation(root,{operation:'regenerate',source:input.source,input},input.mutationId,r=>{
  assertBuildBinding(input,JSON.parse(readBytes(r,'.workbench/vault.json')));
  const relative=sourcePath(input.source),before=readBytes(r,relative),current=parseCreationHtml(before,input.source);if(!current.writable)protocolError('READ_ONLY');if(current.revision!==input.expectedRevision)protocolError('CONFLICT');
  if(input.data.content_id!==current.raw.content_id)protocolError('WORK_BINDING_CONFLICT');
  if(input.removeItemIds?.length)verifyCreationRemoval(r,input.source,current.revision,current.pageId,input.removeItemIds,input.authorDecisionId);
  const {raw,warnings}=assembleCreationData(input.data,current.raw,{removeItemIds:input.removeItemIds,authorDecisionId:input.authorDecisionId}),bytes=renderCreationHtml(raw);
  return {action:'save',path:relative,beforeHash:current.revision,after:Buffer.from(bytes).toString('base64'),creationPageId:raw.page_id,creationBefore:before.toString('base64'),result:resultFor(input.mutationId,bytes,['template','structure'],{warnings})};
 });
}
