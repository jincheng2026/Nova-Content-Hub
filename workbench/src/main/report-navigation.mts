import path from 'node:path';
import {createHash} from 'node:crypto';
import {bindingForRuntime,readBytes} from '../../../plugin-src/src/lib/vault/core.mjs';
import {resolveSource,readSourceMap,readBoundSourceCatalog,readBoundSourceFile} from '../../../plugin-src/src/lib/vault/source-map.mjs';
import {prepareOfflineReport} from '../../../plugin-src/src/lib/vault/resources.mjs';
import type {LibraryBinding} from '../shared/contracts.ts';
import type {ProductionReport,ReportNavigation,ReportNavigationTarget} from '../shared/production-contracts.ts';
const digest=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const unavailable='此报告引用未提供，或原注册页面已变化；请通过报告目录核查。';
const object=(v:unknown):Record<string,unknown>|null=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:null;
const relative=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&!v.startsWith('/')&&!/[\\\0:%]/.test(v)&&path.posix.normalize(v)===v&&!v.split('/').some(x=>x==='..'||x==='.');
const decodeEntities=(v:string)=>v.replace(/&(?:amp|quot|apos|lt|gt|#(?:x[0-9a-f]+|\d+));/gi,entity=>{
 const named:Record<string,string>={'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>'};
 if(named[entity.toLowerCase()])return named[entity.toLowerCase()];
 const n=entity.slice(2,-1),value=parseInt(n[0].toLowerCase()==='x'?n.slice(1):n,n[0].toLowerCase()==='x'?16:10);
 return value>0&&value<=0x10ffff?String.fromCodePoint(value):'\0';
});
const anchors=(html:string)=>html.replace(/<!--[\s\S]*?-->|<(script|style|textarea|title|xmp)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'').matchAll(/<a\b[^>]*>/gi);
const textExtensions=['.md','.txt','.csv','.json'];
const sourceDirectory=(value:string)=>relative(value)&&value.split('/').every(segment=>!segment.startsWith('.')&&!/^(?:node_modules|skills|必要备份|备份|backups)$/i.test(segment));
function resolveReference(from:string,href:string,extensions:string[]):{relativePath:string;fragment:string}|null {
 if(href.length>4096||href!==href.trim()||/[\u0000-\u001f\u007f\\]/.test(href)||href.startsWith('/')||/^[a-z][a-z\d+.-]*:/i.test(href)||href.includes('?'))return null;
 const hash=href.indexOf('#'),pathname=hash<0?href:href.slice(0,hash),fragment=hash<0?'':href.slice(hash);
 if(!pathname)return null;
 let segments:string[];try{segments=pathname.split('/').map(part=>decodeURIComponent(part));}catch{return null;}
 if(segments.some(part=>/[\\/\u0000-\u001f\u007f%:]/.test(part)))return null;
 const normalized=path.posix.normalize(path.posix.join(path.posix.dirname(from),segments.join('/')));
 if(!relative(normalized)||normalized.split('/').some(s=>s.startsWith('.'))||!extensions.includes(path.posix.extname(normalized).toLowerCase()))return null;
 return {relativePath:normalized,fragment};
}
/** Resolve one HTML reference as data. Never open an unregistered file by this path. */
export function resolveReportReference(from:string,href:string){return resolveReference(from,href,['.html','.htm']);}
type Catalog=ReturnType<typeof readBoundSourceCatalog>;
type Catalogs=Map<string,Catalog>;
type RegisteredPage={identity:string;relativePath:string;sourceId:string;sourceRoot:string;vaultRoot:string};
function catalogFor(page:RegisteredPage,catalogs:Catalogs):Catalog {
 let catalog=catalogs.get(page.sourceId);if(!catalog){catalog=readBoundSourceCatalog(page.vaultRoot,{sourceId:page.sourceId});catalogs.set(page.sourceId,catalog);}
 if(!['internal','linked'].includes(catalog.source.mode)||!catalog.source.available||catalog.source.root!==page.sourceRoot)throw Error('来源映射已变化');
 return catalog;
}
/** Original bytes and prepared assets must still describe the registered original page. */
export function registeredReportPage(binding:LibraryBinding,report:ProductionReport,pageId:string,catalogs:Catalogs=new Map()):RegisteredPage|null {
 try{
  const source=object(object(report.meta)?.vault),page=report.pages.find(p=>p.id===pageId);
  if(report.deletedAt||!source||source.currentBody!=='original'||source.missing===true||!page)return null;
  const originals=Array.isArray(source.originalPages)?source.originalPages.map(object).filter(p=>p?.id===pageId):report.pages.length===1&&source.format==='html'&&typeof source.documentId==='string'?[{id:pageId,relativePath:source.relativePath,hash:source.hash}]:[];
  if(originals.length!==1)return null;const original=originals[0]!;
  if(!relative(original.relativePath)||typeof original.hash!=='string'||!/^[a-f0-9]{64}$/.test(original.hash))return null;
  const originalPath=original.relativePath;
  const bound=bindingForRuntime(binding.root);if(!bound)return null;
  let sourceId=source.sourceId;
  // Legacy standalone pages omit sourceId. Select only a unique already-bound
  // internal root; never fall back to the vault root or a guessed ancestor.
  if(sourceId===undefined&&!Array.isArray(source.originalPages)){
   const candidates=readSourceMap(bound.vaultRoot).sources.filter(s=>s.mode==='internal'&&relative(s.root)&&originalPath.startsWith(s.root+'/'));
   if(candidates.length!==1)return null;sourceId=candidates[0].id;
  }
  if(typeof sourceId!=='string')return null;
  const linked=resolveSource(bound.vaultRoot,sourceId);if(!['internal','linked'].includes(linked.mode)||!linked.available)return null;
  const prefix=linked.mode==='internal'?path.relative(bound.vaultRoot,linked.root).split(path.sep).join('/'):sourceId;if(!sourceDirectory(prefix)||!original.relativePath.startsWith(prefix+'/'))return null;
  const sourceRelative=original.relativePath.slice(prefix.length+1);if(!relative(sourceRelative))return null;
  const identity=digest(JSON.stringify([binding.libraryId,binding.rootIdentity,report.id,pageId,sourceId,linked.root,linked.role,sourceRelative,original.hash,page.assetHash])),registered={sourceId,relativePath:sourceRelative,sourceRoot:linked.root,vaultRoot:bound.vaultRoot,identity};
  if(!Array.isArray(source.originalPages)&&catalogFor(registered,catalogs).files.filter(f=>f.relativePath===sourceRelative).length!==1)return null;
  const bytes=readBytes(linked.root,sourceRelative);if(digest(bytes)!==original.hash)return null;
  const html=new TextDecoder('utf-8',{fatal:true}).decode(bytes),prepared=prepareOfflineReport(html,{root:linked.root,relativePath:sourceRelative});
  if(digest(prepared)!==page.assetHash)return null;
  return registered;
 }catch{return null;}
}
type Attachment={source:RegisteredPage;relativePath:string;hash:string;filename:string;identity:string};
function buildNavigation(binding:LibraryBinding,reports:ProductionReport[],reportId:string,pageId:string,html:string){
 const catalogs:Catalogs=new Map(),report=reports.find(r=>r.id===reportId),current=report&&registeredReportPage(binding,report,pageId,catalogs),links:ReportNavigation['links']=[],seen=new Set<string>(),attachments=new Map<string,Attachment>();
 for(const anchor of anchors(html)){
  const attr=anchor[0].match(/(?:^|\s)href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);if(!attr)continue;
  const href=decodeEntities(attr[1]??attr[2]??attr[3]);
  if(!href||href.startsWith('#')||/^https?:/i.test(href)||seen.has(href)||!/(?:\.(?:html?|md|txt|csv|json)|%2e(?:html?|md|txt|csv|json))(?:[?#]|$)/i.test(href))continue;
  seen.add(href);if(links.length>=500)break;
  const ref=current&&resolveReference(current.relativePath,href,['.html','.htm',...textExtensions]);let target:ReportNavigationTarget|null=null;
  if(ref&&current){
   if(textExtensions.includes(path.posix.extname(ref.relativePath).toLowerCase())){
    try{
     const catalog=catalogFor(current,catalogs);
     if(catalog.files.filter(f=>f.relativePath===current.relativePath).length===1&&catalog.files.filter(f=>f.relativePath===ref.relativePath).length===1){
      const file=readBoundSourceFile(current.vaultRoot,{sourceId:current.sourceId,relativePath:ref.relativePath}),text=new TextDecoder('utf-8',{fatal:true}).decode(file.data),filename=path.posix.basename(ref.relativePath);
      if(file.bytes<=8*1024*1024&&!text.includes('\0')&&!/[\u0000-\u001f\u007f]/.test(filename)){
       const identity=digest(JSON.stringify([current.identity,current.sourceId,current.sourceRoot,ref.relativePath,file.hash,file.bytes])),id=digest(JSON.stringify([reportId,pageId,current.sourceId,ref.relativePath]));
       attachments.set(id,{source:current,relativePath:ref.relativePath,hash:file.hash,filename,identity});target={kind:'attachment',id,identity};
      }
     }
    }catch{ /* An unavailable or non-text appendix does not authorize a read. */ }
   }else{
    const matches:Extract<ReportNavigationTarget,{kind:'report'}>[]=[];
    for(const candidate of reports){
     const source=object(object(candidate.meta)?.vault);if(candidate.deletedAt||source?.sourceId!==current.sourceId||source.currentBody!=='original'||!Array.isArray(source.originalPages))continue;
     for(const page of candidate.pages){
      const original=source.originalPages.map(object).find(p=>p?.id===page.id);if(typeof original?.relativePath!=='string'||!original.relativePath.endsWith('/'+ref.relativePath))continue;
      const valid=registeredReportPage(binding,candidate,page.id,catalogs);
      if(valid?.sourceId===current.sourceId&&valid.relativePath===ref.relativePath)matches.push({kind:'report',reportId:candidate.id,pageId:page.id,identity:valid.identity,fragment:ref.fragment});
     }
    }
    if(matches.length===1)target=matches[0];
   }
  }
  links.push({href,target,message:target?'':unavailable});
 }
 const pageIdentity=current?.identity??null,navigation:ReportNavigation={pageIdentity,links,fingerprint:digest(JSON.stringify([reportId,pageId,pageIdentity,digest(html),links]))};
 return {navigation,attachments};
}
export function reportNavigation(binding:LibraryBinding,reports:ProductionReport[],reportId:string,pageId:string,html:string):ReportNavigation{return buildNavigation(binding,reports,reportId,pageId,html).navigation;}
/** The request identifies only an existing mapping index, never a path or URL. */
export function readRegisteredReportAttachment(binding:LibraryBinding,reports:ProductionReport[],reportId:string,pageId:string,html:string,fingerprint:string,index:number){
 const {navigation,attachments}=buildNavigation(binding,reports,reportId,pageId,html),target=navigation.links[index]?.target;
 if(navigation.fingerprint!==fingerprint||target?.kind!=='attachment')return null;
 const fixed=attachments.get(target.id);if(!fixed)return null;
 const file=readBoundSourceFile(fixed.source.vaultRoot,{sourceId:fixed.source.sourceId,relativePath:fixed.relativePath,expectedHash:fixed.hash});
 return {data:file.data,filename:fixed.filename,identity:fixed.identity};
}
/** The opaque frame requests only indices; it receives no filesystem or host API. */
export function reportNavigationFrame(html:string,navigation:ReportNavigation,pageId:string,nonce:string):string {
 const config=JSON.stringify({links:navigation.links.map(x=>x.href),pageId,nonce}).replace(/</g,'\\u003c');
 const script=`(()=>{const config=${config};document.addEventListener('click',event=>{const link=event.target.closest?.('a[href]');if(!link)return;const href=link.getAttribute('href');if(!href||href.startsWith('#')||/^https?:/i.test(href))return;if(!/\\.(?:html?|md|txt|csv|json)(?:[?#]|$)/i.test(href)&&!config.links.includes(href))return;event.preventDefault();event.stopImmediatePropagation();parent.postMessage({kind:'nova-report-navigate',pageId:config.pageId,nonce:config.nonce,index:config.links.indexOf(href)},'*');},true);})();`;
 const injection=`<script>${script.replace(/<\/script/gi,'<\\/script')}</script>`;
 return /<head\b[^>]*>/i.test(html)?html.replace(/<head\b[^>]*>/i,m=>m+injection):injection+html;
}
