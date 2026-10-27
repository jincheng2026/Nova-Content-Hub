import path from 'node:path';
import {createHash} from 'node:crypto';
import {bindingForRuntime,readBytes} from '../../../plugin-src/src/lib/vault/core.mjs';
import {resolveSource} from '../../../plugin-src/src/lib/vault/source-map.mjs';
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
/** Resolve one HTML reference as data. Never use the returned path to open an unregistered file. */
export function resolveReportReference(from:string,href:string):{relativePath:string;fragment:string}|null {
 if(href.length>4096||href!==href.trim()||/[\u0000-\u0020\\]/.test(href)||href.startsWith('/')||/^[a-z][a-z\d+.-]*:/i.test(href)||href.includes('?'))return null;
 const hash=href.indexOf('#'),pathname=hash<0?href:href.slice(0,hash),fragment=hash<0?'':href.slice(hash);
 if(!pathname)return null;
 let segments:string[];try{segments=pathname.split('/').map(part=>decodeURIComponent(part));}catch{return null;}
 if(segments.some(part=>/[\\/\u0000-\u001f\u007f%:]/.test(part)))return null;
 const normalized=path.posix.normalize(path.posix.join(path.posix.dirname(from),segments.join('/')));
 if(!relative(normalized)||!/^\.html?$/i.test(path.posix.extname(normalized)))return null;
 return {relativePath:normalized,fragment};
}
/** Both original bytes and prepared assets must still describe the registered original page. */
export function registeredReportPage(binding:LibraryBinding,report:ProductionReport,pageId:string):{identity:string;relativePath:string;sourceId:string}|null {
 try{
  const vault=object(report.meta)?.vault,source=object(vault),page=report.pages.find(p=>p.id===pageId);
  if(report.deletedAt||!source||source.currentBody!=='original'||source.missing===true||typeof source.sourceId!=='string'||!page||!Array.isArray(source.originalPages))return null;
  const originals=source.originalPages.map(object).filter(p=>p?.id===pageId);if(originals.length!==1)return null;
  const original=originals[0]!;
  if(!relative(original.relativePath)||typeof original.hash!=='string'||!/^[a-f0-9]{64}$/.test(original.hash))return null;
  const bound=bindingForRuntime(binding.root);if(!bound)return null;
  const linked=resolveSource(bound.vaultRoot,source.sourceId);if(linked.mode!=='internal'||linked.role!=='reports'||!linked.available)return null;
  const prefix=path.relative(bound.vaultRoot,linked.root).split(path.sep).join('/');if(!relative(prefix))return null;
  if(!original.relativePath.startsWith(prefix+'/'))return null;
  const sourceRelative=original.relativePath.slice(prefix.length+1);if(!relative(sourceRelative))return null;
  const bytes=readBytes(linked.root,sourceRelative);if(digest(bytes)!==original.hash)return null;
  const html=new TextDecoder('utf-8',{fatal:true}).decode(bytes),prepared=prepareOfflineReport(html,{root:linked.root,relativePath:sourceRelative});
  if(digest(prepared)!==page.assetHash)return null;
  return {sourceId:source.sourceId,relativePath:sourceRelative,identity:digest(JSON.stringify([binding.libraryId,binding.rootIdentity,report.id,pageId,source.sourceId,sourceRelative,original.hash,page.assetHash]))};
 }catch{return null;}
}
export function reportNavigation(binding:LibraryBinding,reports:ProductionReport[],reportId:string,pageId:string,html:string):ReportNavigation {
 const report=reports.find(r=>r.id===reportId),current=report&&registeredReportPage(binding,report,pageId),links:ReportNavigation['links']=[],seen=new Set<string>();
 for(const anchor of html.matchAll(/<a\b[^>]*>/gi)){
  const attr=anchor[0].match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);if(!attr)continue;
  const href=decodeEntities(attr[1]??attr[2]??attr[3]);
  if(!href||href.startsWith('#')||/^https?:/i.test(href)||seen.has(href)||!/(?:\.html?|%2ehtml?)(?:[?#]|$)/i.test(href))continue;
  seen.add(href);if(links.length>=500)break;
  const ref=current&&resolveReportReference(current.relativePath,href),matches:ReportNavigationTarget[]=[];
  if(ref)for(const candidate of reports){
   const source=object(object(candidate.meta)?.vault);if(candidate.deletedAt||source?.sourceId!==current!.sourceId||source.currentBody!=='original'||!Array.isArray(source.originalPages))continue;
   for(const page of candidate.pages){
    const original=source.originalPages.map(object).find(p=>p?.id===page.id);
    // Compare registered paths before reading; unknown references never trigger filesystem reads.
    if(typeof original?.relativePath!=='string'||!original.relativePath.endsWith('/'+ref.relativePath))continue;
    const valid=registeredReportPage(binding,candidate,page.id);
    if(valid?.sourceId===current!.sourceId&&valid.relativePath===ref.relativePath)matches.push({reportId:candidate.id,pageId:page.id,identity:valid.identity,fragment:ref.fragment});
   }
  }
  links.push({href,target:matches.length===1?matches[0]:null,message:matches.length===1?'':unavailable});
 }
 const pageIdentity=current?.identity??null;
 return {pageIdentity,links,fingerprint:digest(JSON.stringify([reportId,pageId,pageIdentity,digest(html),links]))};
}
/** The opaque frame can request only indices; it receives no filesystem or host API. */
export function reportNavigationFrame(html:string,navigation:ReportNavigation,pageId:string,nonce:string):string {
 const config=JSON.stringify({links:navigation.links.map(x=>x.href),pageId,nonce}).replace(/</g,'\\u003c');
 const script=`(()=>{const config=${config};document.addEventListener('click',event=>{const link=event.target.closest?.('a[href]');if(!link)return;const href=link.getAttribute('href');if(!href||href.startsWith('#')||/^https?:/i.test(href))return;if(!/\\.html?(?:[?#]|$)/i.test(href)&&!config.links.includes(href))return;event.preventDefault();event.stopImmediatePropagation();parent.postMessage({kind:'nova-report-navigate',pageId:config.pageId,nonce:config.nonce,index:config.links.indexOf(href)},'*');},true);})();`;
 const injection=`<script>${script.replace(/<\/script/gi,'<\\/script')}</script>`;
 return /<head\b[^>]*>/i.test(html)?html.replace(/<head\b[^>]*>/i,m=>m+injection):injection+html;
}
