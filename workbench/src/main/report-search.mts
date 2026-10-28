import {createHash,randomBytes} from 'node:crypto';
import {DOMParser} from '@xmldom/xmldom';
import postcss from 'postcss';
import parseInlineStyle from 'inline-style-parser';
import {renderMarkdownReport} from '../../../plugin-src/src/lib/vault/resources.mjs';
import type {ProductionReport} from '../../../plugin-src/src/lib/file-library/production.d.ts';
import {matchReportSearchFields,reportSearchText,reportSearchSnippet} from '../shared/report-search-contracts.ts';
import type {ReportSearchHit,ReportSearchInput,ReportSearchResult} from '../shared/report-search-contracts.ts';
type Binding={libraryId:string;rootIdentity:{dev:string;ino:string}};
export interface ReportSearchSnapshot {binding:Binding;snapshotToken:string;reports:ProductionReport[];accounts:{id:string;name:string}[]}
export interface RegisteredSearchPage {binding:Binding;reportId:string;pageId:string;assetHash:string;signal:AbortSignal}
export interface ReportSearchDependencies {capture():ReportSearchSnapshot;readRegisteredPage(input:RegisteredSearchPage):Promise<{data:Uint8Array;detectedType:string}>|{data:Uint8Array;detectedType:string}}
const LIMIT=8*1024*1024,MAX_PAGES=20,MAX_CACHE_BYTES=32*1024*1024;
const digest=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const fail=(code:string,message:string):never=>{throw Object.assign(new Error(message),{code});};
const object=(value:unknown):Record<string,unknown>|null=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;
const hiddenValue=(property:string,value:string)=>{
 const name=property.toLowerCase(),clean=value.replace(/\s*!important\s*$/i,'').trim().toLowerCase();
 return name==='display'&&clean==='none'||name==='visibility'&&['hidden','collapse'].includes(clean)||name==='content-visibility'&&clean==='hidden'||name==='opacity'&&clean.length>0&&Number(clean.replace(/%$/,''))<=0;
};
/** Parses static HTML without scripts, network requests, or a browser capability.
 * Simple stylesheet visibility is supported; complex hiding selectors fail closed. */
export function extractRegisteredHtmlText(html:string):string {
 if(Buffer.byteLength(html)>LIMIT)fail('INVALID_REPORT','报告正文超过 8 MiB');
 let invalid=false;const document=new DOMParser({errorHandler:{warning(){invalid=true;},error(){invalid=true;},fatalError(){invalid=true;}}}).parseFromString(html,'text/html');
 if(invalid||!document.documentElement)fail('INVALID_REPORT','HTML 无法按静态文档安全解析');
 const nodes=Array.from(document.getElementsByTagName('*')),visibility=new Map<unknown,Map<string,{value:string;rank:number[]}>>(),properties=new Set(['display','visibility','content-visibility','opacity']);let visibilityChecks=0;
 const inert=(node:Node)=>{for(let parent=node.parentNode;parent;parent=parent.parentNode)if(['template','noscript'].includes(parent.nodeName.toLowerCase()))return true;return false;};
 const apply=(node:unknown,property:string,value:string,rank:number[])=>{const values=visibility.get(node)??new Map(),old=values.get(property);let compare=0;if(old)for(let i=0;i<rank.length;i++)if(rank[i]!==old.rank[i]){compare=rank[i]-old.rank[i];break;}if(!old||compare>=0){values.set(property,{value:value.replace(/\s*!important\s*$/i,'').trim().toLowerCase(),rank});visibility.set(node,values);}};
 if(nodes.length>100000)fail('INVALID_REPORT','报告节点数量超过检索上限');
 if(nodes.some(node=>!inert(node as unknown as Node)&&node.tagName.toLowerCase()==='link'&&(node.getAttribute('rel')??'').toLowerCase().split(/\s+/).includes('stylesheet')))fail('INVALID_REPORT','外部样式的可见性尚未核验，请打开原报告查看');
 for(const style of Array.from(document.getElementsByTagName('style'))){
  if(inert(style as unknown as Node))continue;
  const css=postcss.parse(style.textContent??'');
  css.walkDecls(declaration=>{
   const property=declaration.prop.toLowerCase();if(property.includes('\\'))return fail('INVALID_REPORT','报告可见性样式使用转义属性，尚未支持检索');if(!properties.has(property))return;
   if(/[\\]|\b(?:var|env|calc)\(/i.test(declaration.value))return fail('INVALID_REPORT','报告可见性样式依赖动态值，尚未支持检索');
   const rule=declaration.parent;if(rule?.type!=='rule')return fail('INVALID_REPORT','报告隐藏样式依赖动态环境，需打开原报告核查');
   for(let parent:import('postcss').Node|undefined=rule.parent;parent;parent=parent.parent)if(parent.type==='atrule')return fail('INVALID_REPORT','报告可见性依赖条件样式，请打开原报告核查');
   for(const selector of (rule as import('postcss').Rule).selectors){
    visibilityChecks+=nodes.length;if(visibilityChecks>2_000_000)fail('INVALID_REPORT','报告隐藏样式匹配超过检索上限');
    if(selector!=='*'&&(!/^(?:[a-z][\w-]*)?(?:[.#][\w-]+)*$/i.test(selector)||!selector))fail('INVALID_REPORT','报告隐藏样式使用复杂选择器，正文检索仅返回可核验部分');
    const tag=selector.match(/^[a-z][\w-]*/i)?.[0]?.toLowerCase(),tokens=selector.match(/[.#][\w-]+/g)??[];
    const rank=[declaration.important?1:0,0,tokens.filter(t=>t[0]==='#').length,tokens.filter(t=>t[0]==='.').length,tag?1:0];
    for(const node of nodes)if((!tag||node.tagName.toLowerCase()===tag)&&tokens.every(token=>token[0]==='#'?node.getAttribute('id')===token.slice(1):(node.getAttribute('class')??'').split(/\s+/).includes(token.slice(1))))apply(node,property,declaration.value,rank);
   }
  });
 }
 const ignored=new Set(['head','script','style','template','noscript','iframe','object','embed','canvas']),blocks=new Set(['html','body','div','p','article','section','header','footer','nav','aside','h1','h2','h3','h4','h5','h6','ul','ol','li','table','tr','td','th','blockquote','pre','br','hr']),body=document.getElementsByTagName('body')[0]??document.documentElement,stack:{node:Node|null;depth:number;hiddenText:boolean}[]=[{node:body as unknown as Node,depth:0,hiddenText:false}],parts:string[]=[];
 while(stack.length){
  const item=stack.pop()!,{node,depth}=item;let hiddenText=item.hiddenText;if(!node){parts.push(' ');continue;}if(depth>128)fail('INVALID_REPORT','报告嵌套层级超过检索上限');
  if(node.nodeType===3||node.nodeType===4){if(!hiddenText)parts.push(node.nodeValue??'');continue;}
  if(node.nodeType!==1&&node.nodeType!==9)continue;
  const element=node as Element;
  if(node.nodeType===1){
   const tag=element.tagName.toLowerCase();if(ignored.has(tag)||element.hasAttribute('hidden')||element.hasAttribute('inert')||element.getAttribute('aria-hidden')?.toLowerCase()==='true'||tag==='input'&&element.getAttribute('type')?.toLowerCase()==='hidden')continue;
   const style=element.getAttribute('style');if(style)for(const declaration of parseInlineStyle(style)){if(declaration.type!=='declaration')continue;const property=declaration.property.toLowerCase();if(property.includes('\\')||properties.has(property)&&/[\\]|\b(?:var|env|calc)\(/i.test(declaration.value))fail('INVALID_REPORT','报告行内可见性样式尚未支持');if(properties.has(property))apply(node,property,declaration.value,[/!important\s*$/i.test(declaration.value)?1:0,1,0,0,0]);}
   const values=visibility.get(node);if([...values??[]].some(([property,{value}])=>property!=='visibility'&&hiddenValue(property,value)))continue;
   const ownVisibility=values?.get('visibility')?.value;if(ownVisibility==='visible')hiddenText=false;else if(ownVisibility&&hiddenValue('visibility',ownVisibility))hiddenText=true;
   if(blocks.has(tag)){parts.push(' ');stack.push({node:null,depth,hiddenText});}
  }
  for(let i=node.childNodes.length-1;i>=0;i--)stack.push({node:node.childNodes[i],depth:depth+1,hiddenText});
 }
 return parts.join('').replace(/\s+/g,' ').trim();
}
function normalized(input:ReportSearchInput):Omit<ReportSearchInput,'cursor'> {
 if(!input||Object.keys(input).some(k=>!['query','type','from','scope','cursor'].includes(k))||typeof input.query!=='string'||input.query.length>500||!(input.type===null||typeof input.type==='string'&&input.type.length<=200)||!(input.from===null||typeof input.from==='string'&&Number.isFinite(Date.parse(input.from)))||!['active','trash','all'].includes(input.scope)||!(input.cursor===undefined||input.cursor===null||typeof input.cursor==='string'&&/^[A-Za-z0-9_-]{32,100}$/.test(input.cursor)))fail('INVALID_INPUT','报告检索参数无效');
 return {query:reportSearchText(input.query.trim()),type:input.type,from:input.from===null?null:new Date(input.from).toISOString(),scope:input.scope};
}
const snapshotKey=(snapshot:ReportSearchSnapshot)=>digest(JSON.stringify([snapshot.binding,snapshot.snapshotToken,snapshot.reports,snapshot.accounts]));
function currentMarkdown(report:ProductionReport):string|undefined {
 const meta=object(report.meta),markdown=meta?.manualMarkdown;
 return typeof markdown==='string'&&report.pages.length===1&&Buffer.byteLength(markdown)<=100000&&digest(renderMarkdownReport(markdown,report.title))===report.pages[0].assetHash?markdown:undefined;
}
type Task={reportId:string;pageId:string;assetHash:string;markdown?:string};
type Session={key:string;request:string;generation:number;snapshot:ReportSearchSnapshot;pending:Task[];failed:Map<string,Task>;issues:Map<string,{reportId:string;pageId:string;message:string}>;hits:Map<string,ReportSearchHit>;controller:AbortController};
export function createReportSearchService(dependencies:ReportSearchDependencies){
 let generation=0,cacheBytes=0,current:Session|null=null;const cursors=new Map<string,Session>(),cache=new Map<string,string>();
 const clearCache=()=>{cache.clear();cacheBytes=0;};
 const assertCurrent=(session:Session)=>{if(session.generation!==generation||session.controller.signal.aborted||snapshotKey(dependencies.capture())!==session.key)fail('STALE_SEARCH','知识库、报告来源或查询已变化，请重新检索');};
 const merge=(session:Session,hit:ReportSearchHit)=>{
  const previous=session.hits.get(hit.reportId);if(!previous){session.hits.set(hit.reportId,hit);return;}
  for(const field of hit.fields)if(!previous.fields.includes(field))previous.fields.push(field);
  for(const snippet of hit.snippets)if(!previous.snippets.some(s=>s.field===snippet.field&&s.pageId===snippet.pageId)){if(previous.snippets.length<5)previous.snippets.push(snippet);}
 };
 return {
  cancel(){generation++;current?.controller.abort();cursors.clear();current=null;clearCache();},
  async search(input:ReportSearchInput):Promise<ReportSearchResult>{
   const request=normalized(input),requestKey=JSON.stringify(request);let session:Session;
   if(input.cursor){const existing=cursors.get(input.cursor);if(!existing||existing.request!==requestKey)fail('STALE_SEARCH','检索游标已失效，请重新检索');session=existing!;cursors.delete(input.cursor);assertCurrent(session);}
   else {
    current?.controller.abort();generation++;cursors.clear();const snapshot=structuredClone(dependencies.capture()),key=snapshotKey(snapshot);if(current?.key!==key)clearCache();
    session={key,request:requestKey,generation,snapshot,pending:[],failed:new Map(),issues:new Map(),hits:new Map(),controller:new AbortController()};current=session;
    const accounts=new Map(snapshot.accounts.map(a=>[a.id,a.name]));
    for(const report of snapshot.reports.filter(r=>(request.scope==='all'||(request.scope==='trash'?r.deletedAt!==null:r.deletedAt===null))&&(request.type===null||r.type===request.type)&&(request.from===null||Date.parse(r.collectedAt??r.createdAt)>=Date.parse(request.from)))){
     const hit=matchReportSearchFields(report,accounts,request.query);if(hit)merge(session,hit);
     if(request.query)for(const page of report.pages)session.pending.push({reportId:report.id,pageId:page.id,assetHash:page.assetHash,markdown:currentMarkdown(report)});
    }
   }
   const batch=session.pending.length?session.pending.splice(0,MAX_PAGES):[...session.failed.values()].slice(0,MAX_PAGES);
   for(const task of batch){
    assertCurrent(session);const taskKey=task.reportId+':'+task.pageId;
    try{
     const page=await dependencies.readRegisteredPage({binding:session.snapshot.binding,reportId:task.reportId,pageId:task.pageId,assetHash:task.assetHash,signal:session.controller.signal});assertCurrent(session);
     if(page.data.byteLength>LIMIT||!['text/html','text/plain'].includes(page.detectedType)||digest(page.data)!==task.assetHash)fail('INVALID_REPORT','报告原页超过限制、类型无效或校验值变化');
     const cacheKey=task.assetHash+':'+(task.markdown===undefined?'html':'markdown:'+digest(task.markdown));let text=cache.get(cacheKey);
     if(text===undefined){const html=new TextDecoder('utf-8',{fatal:true}).decode(page.data);text=task.markdown??extractRegisteredHtmlText(html);const size=Buffer.byteLength(text);if(size<=MAX_CACHE_BYTES){while(cache.size&&(cacheBytes+size>MAX_CACHE_BYTES||cache.size>=128)){const [old,value]=cache.entries().next().value!;cache.delete(old);cacheBytes-=Buffer.byteLength(value);}cache.set(cacheKey,text);cacheBytes+=size;}}
     if(reportSearchText(text).includes(request.query))merge(session,{reportId:task.reportId,fields:['body'],snippets:[{field:'body',text:reportSearchSnippet(text,request.query),pageId:task.pageId}]});session.failed.delete(taskKey);session.issues.delete(taskKey);
    }catch(error){if((error as {code?:string})?.code==='STALE_SEARCH')throw error;assertCurrent(session);session.failed.delete(taskKey);session.failed.set(taskKey,task);session.issues.set(taskKey,{reportId:task.reportId,pageId:task.pageId,message:error instanceof Error?error.message:'报告正文暂不可读'});}
   }
   assertCurrent(session);const partial=session.pending.length>0||session.failed.size>0,cursor=partial?randomBytes(32).toString('base64url'):null;if(cursor)cursors.set(cursor,session);
   return {hits:structuredClone([...session.hits.values()]),status:partial?'partial':'complete',cursor,pendingPages:session.pending.length,unreadablePages:session.failed.size,issues:[...session.issues.values()],snapshotKey:session.key};
  }
 };
}
