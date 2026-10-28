import {productionCompositionRuntime} from '../../../plugin-src/src/lib/file-library/production-composition.mjs';
import http from 'node:http';
import {randomBytes,createHash} from 'node:crypto';
import type {AddressInfo} from 'node:net';
import type {LibraryBinding,Worker} from '../shared/contracts.ts';
import type {ProductionCreationState,ProductionDraft} from '../shared/production-contracts.ts';
import {productionDraft} from '../shared/production-validation.ts';
import {fail} from '../shared/validation.ts';
import {reportSources,boundSourceFrame} from './report-sources.mts';
import {reportNavigationFrame} from './report-navigation.mts';
import type {ReportNavigation} from '../shared/production-contracts.ts';
interface PageOptions {
 worker:Worker;
 openSource?(binding:LibraryBinding,url:string):Promise<void>;
 creationHtml:string;
 authorize(binding:LibraryBinding):void|Promise<void>;
 readCreation(binding:LibraryBinding,contentId:string):Promise<ProductionCreationState>;
 setReportPosition?(binding:LibraryBinding,reportId:string,pageId:string):Promise<void>;
 saveDraft(binding:LibraryBinding,input:ProductionDraft):Promise<ProductionCreationState>;
}
type Capability={binding:LibraryBinding;kind:'creation'|'report'|'source'|'attachment';id:string;pageId?:string;relativePath?:string;reportGuard?:{pageId:string;identity:string};reportFragment?:string;attachment?:{fingerprint:string;index:number;identity:string}};
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const sourceFingerprint=(page:{hash:string;api:Record<string,unknown>})=>createHash('sha256').update(JSON.stringify([page.hash,Object.fromEntries(Object.entries(page.api).filter(([key])=>key!=='/api/reviews').map(([key,value])=>[key,key==='/api/snapshot'&&value&&typeof value==='object'&&'data'in value?value.data:value]))])).digest('hex');
const errorCode=(error:unknown)=>typeof error==='object'&&error!==null&&'code'in error?String(error.code):'IO_ERROR';
export class ProductionPages {
 readonly options:PageOptions;
 private server:http.Server|null=null;
 private startupPromise:Promise<string>|null=null;
 private origin:string|null=null;
 private capabilities=new Map<string,Capability>();
 private closed=false;
 private reportNavigations=new Map<string,{token:string;pageId:string;navigation:ReportNavigation}>();
 constructor(options:PageOptions){this.options=options;}
 private start():Promise<string> {
  if(this.closed)return Promise.reject(Object.assign(new Error('本地创作服务已关闭。'),{code:'CLOSED'}));
  if(this.startupPromise)return this.startupPromise;
  this.startupPromise=new Promise((resolve,reject)=>{
   const server=this.server=http.createServer((req,res)=>void this.handle(req,res).catch(error=>{if(!res.headersSent)this.send(res,['CONFLICT','STALE_INPUT'].includes(errorCode(error))?409:errorCode(error)==='FORBIDDEN'?403:400,JSON.stringify({error:{code:errorCode(error),message:'操作未完成，原输入保留。请读取最新资料后重试。'}}),'application/json; charset=utf-8');else res.destroy();}));
   server.requestTimeout=20_000;server.headersTimeout=10_000;server.keepAliveTimeout=1000;
   server.once('error',error=>{this.server=null;this.startupPromise=null;reject(error);});
   server.listen(0,'127.0.0.1',()=>{if(this.closed){server.close();reject(Object.assign(new Error('服务已关闭。'),{code:'CLOSED'}));return;}const address=server.address() as AddressInfo;this.origin=`http://127.0.0.1:${address.port}`;server.unref();resolve(this.origin);});
  });return this.startupPromise;
 }
 private async open(capability:Capability){await this.options.authorize(capability.binding);const origin=await this.start();for(const [existing,cap] of this.capabilities)if(cap.kind===capability.kind&&cap.id===capability.id&&cap.pageId===capability.pageId&&cap.relativePath===capability.relativePath&&JSON.stringify(cap.reportGuard)===JSON.stringify(capability.reportGuard)&&cap.reportFragment===capability.reportFragment&&JSON.stringify(cap.attachment)===JSON.stringify(capability.attachment)&&cap.binding.root===capability.binding.root&&cap.binding.libraryId===capability.binding.libraryId&&cap.binding.rootIdentity.dev===capability.binding.rootIdentity.dev&&cap.binding.rootIdentity.ino===capability.binding.rootIdentity.ino)return `${origin}/p/${existing}/`;const token=randomBytes(32).toString('hex');if(this.capabilities.size>=256)this.capabilities.delete(this.capabilities.keys().next().value!);this.capabilities.set(token,structuredClone(capability));return `${origin}/p/${token}/`;}
 openCreation(binding:LibraryBinding,contentId:string){return this.open({binding,kind:'creation',id:contentId});}
 openReport(binding:LibraryBinding,reportId:string,pageId?:string){return this.open({binding,kind:'report',id:reportId,...(pageId?{pageId}:{})});}
 openBoundSource(binding:LibraryBinding,sourceId:string,relativePath:string){return this.open({binding,kind:'source',id:sourceId,relativePath});}
 private send(res:http.ServerResponse,status:number,body:string,type='text/html; charset=utf-8',csp="default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"){
  res.writeHead(status,{'Content-Type':type,'Content-Security-Policy':csp,'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin'});res.end(body);
 }
 private async handle(req:http.IncomingMessage,res:http.ServerResponse){
  if(!this.origin||req.headers.host!==new URL(this.origin).host)return this.send(res,403,'Forbidden','text/plain');
  const match=/^\/p\/([a-f0-9]{64})(\/[^?#]*)$/.exec(req.url??'');if(!match)return this.send(res,404,'Not found','text/plain');
  const cap=this.capabilities.get(match[1]);if(!cap)return this.send(res,404,'Not found','text/plain');
  await this.options.authorize(cap.binding);
  const route=match[2],basePath=`/p/${match[1]}`;
  const sourceAsset=cap.kind==='source'&&req.method==='GET'&&match[2].startsWith('/file/');
  if(!sourceAsset&&(req.headers.origin!==undefined&&req.headers.origin!==this.origin||req.headers['sec-fetch-site']==='cross-site'))return this.send(res,403,'Forbidden','text/plain');
  if(cap.kind==='source')return this.handleBoundSource(req,res,cap,route,basePath);
  if(cap.kind==='attachment'){
   if(req.method!=='GET'||!['/','/download'].includes(route)||!cap.attachment||!cap.pageId)return this.send(res,404,'Not found','text/plain');
   const fixed=cap.attachment,result=await this.options.worker.call('productionReportAttachment',{binding:cap.binding,reportId:cap.id,pageId:cap.pageId,fingerprint:fixed.fingerprint,index:fixed.index});
   if(result.identity!==fixed.identity)fail('CONFLICT','报告附件已变化，请重新打开报告。');
   if(route==='/download'){
    if(/[\u0000-\u001f\u007f/\\]/.test(result.filename))fail('INVALID_INPUT','附件名称无效。');
    const extension=/\.(?:csv|json|md|txt)$/i.exec(result.filename)?.[0].toLowerCase()??'.txt',encoded=encodeURIComponent(result.filename).replace(/[!'()*]/g,char=>'%'+char.charCodeAt(0).toString(16).toUpperCase());
    res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="attachment${extension}"; filename*=UTF-8''${encoded}`,'Content-Length':result.data.length,'Content-Security-Policy':"sandbox; default-src 'none'; frame-ancestors 'none'",'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin'});res.end(Buffer.from(result.data));return;
   }
   const text=new TextDecoder('utf-8',{fatal:true}).decode(result.data);
   return this.send(res,200,`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escape(result.filename)}</title><style>body{margin:24px;background:#F5F5F7;color:#1D1D1F;font:14px/1.6 -apple-system,BlinkMacSystemFont,"Microsoft YaHei",sans-serif}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:white;padding:20px}a{color:#0071E3}</style></head><body><h1>${escape(result.filename)}</h1><p>原报告数据附件 · 只读预览</p><a href="${basePath}/download" download>下载原文件</a><pre>${escape(text)}</pre></body></html>`,'text/html; charset=utf-8',"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  }
  if(cap.kind==='creation') {
   if(req.method==='GET'&&route==='/'){
    const nonce=randomBytes(20).toString('base64');
    const config=JSON.stringify({basePath}).replace(/</g,'\\u003c');
    const html=this.options.creationHtml.replace('/* __PRODUCTION_COMPOSITION_RUNTIME__ */',`window.productionComposition = (${productionCompositionRuntime.toString()})();`).replace(/<script\b/gi,`<script nonce="${nonce}"`).replace('</head>',`<script nonce="${nonce}">window.novaCreation=${config};</script></head>`);
    return this.send(res,200,html,'text/html; charset=utf-8',`default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; connect-src 'self'; media-src 'self'; img-src data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`);
   }
   const media=/^\/media\/([a-f0-9]{64})$/.exec(route);
   if(req.method==='GET'&&media){
    const asset=await this.options.worker.call('productionMedia',{binding:cap.binding,contentId:cap.id,assetHash:media[1]}),data=Buffer.from(asset.data);let start=0,end=data.length-1,status=200;
    if(req.headers.range){const range=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);if(!range||!range[1]&&!range[2])return this.send(res,416,'Invalid range','text/plain');if(!range[1])start=Math.max(0,data.length-Number(range[2]));else{start=Number(range[1]);if(range[2])end=Number(range[2]);}if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<start||start>=data.length){res.writeHead(416,{'Content-Range':`bytes */${data.length}`});res.end();return;}end=Math.min(end,data.length-1);status=206;}
    res.writeHead(status,{'Content-Type':asset.detectedType,'Content-Length':end-start+1,'Accept-Ranges':'bytes',...(status===206?{'Content-Range':`bytes ${start}-${end}/${data.length}`} : {}),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin'});res.end(data.subarray(start,end+1));return;
   }
   if(req.method==='GET'&&route==='/state')return this.send(res,200,JSON.stringify(await this.options.readCreation(cap.binding,cap.id)),'application/json; charset=utf-8');
   if(req.method==='POST'&&route==='/save'){
    if(req.headers.origin!==this.origin||!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type']??''))return this.send(res,403,'Forbidden','text/plain');
    const length=Number(req.headers['content-length']??0);if(!Number.isFinite(length)||length>2_000_000)return this.send(res,413,'Payload too large','text/plain');
    const chunks:Buffer[]=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>2_000_000){req.resume();this.send(res,413,'Payload too large','text/plain');return;}chunks.push(chunk);}
    let body:unknown;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail('INVALID_INPUT','JSON无效。');}
    if(!body||typeof body!=='object'||Array.isArray(body)||Object.hasOwn(body,'contentId'))fail('INVALID_INPUT','创作页只可保存固定内容。');
    const input={...body,contentId:cap.id};if(!productionDraft(input))fail('INVALID_INPUT','创作草稿字段无效。');
    return this.send(res,200,JSON.stringify(await this.options.saveDraft(cap.binding,input as ProductionDraft)),'application/json; charset=utf-8');
   }
  } else if(req.method==='POST'&&route==='/navigate') {
   if(req.headers.origin!==this.origin||!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type']??''))return this.send(res,403,'Forbidden','text/plain');
   const chunks:Buffer[]=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>4096)return this.send(res,413,'Payload too large','text/plain');chunks.push(chunk);}
   let input:unknown;try{input=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail('INVALID_INPUT','报告导航请求无效。');}
   if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).sort().join(',')!=='fingerprint,index,nonce,pageId')fail('INVALID_INPUT','报告导航请求无效。');
   const {pageId,index,fingerprint,nonce}=input as {pageId:string;index:number;fingerprint:string;nonce:string};
   const context=typeof nonce==='string'?this.reportNavigations.get(nonce):undefined;
   if(!context||context.token!==match[1]||context.pageId!==pageId||context.navigation.fingerprint!==fingerprint||!Number.isInteger(index)||index<0||index>=context.navigation.links.length)return this.send(res,403,'报告导航已失效，请重新打开报告。','text/plain');
   const target=context.navigation.links[index].target;if(!target)return this.send(res,403,context.navigation.links[index].message,'text/plain');
   const current=await this.options.worker.call('productionReport',{binding:cap.binding,reportId:cap.id,pageId});
   if(cap.reportGuard){const guarded=pageId===cap.reportGuard.pageId?current:await this.options.worker.call('productionReport',{binding:cap.binding,reportId:cap.id,pageId:cap.reportGuard.pageId});if(guarded.navigation.pageIdentity!==cap.reportGuard.identity)fail('CONFLICT','引用原件已变化，请重新打开报告。');}
   if(current.navigation.fingerprint!==fingerprint||JSON.stringify(current.navigation.links[index]?.target)!==JSON.stringify(target))fail('CONFLICT','报告原件已变化，请重新打开。');
   if(target.kind==='attachment'){
    const attachment=await this.options.worker.call('productionReportAttachment',{binding:cap.binding,reportId:cap.id,pageId,fingerprint,index});
    if(attachment.identity!==target.identity)fail('CONFLICT','引用附件已变化，请重新打开。');
    const url=await this.open({binding:cap.binding,kind:'attachment',id:cap.id,pageId,attachment:{fingerprint,index,identity:target.identity}});
    return this.send(res,200,JSON.stringify({url}),'application/json; charset=utf-8');
   }
   const destination=await this.options.worker.call('productionReport',{binding:cap.binding,reportId:target.reportId,pageId:target.pageId});
   if(destination.navigation.pageIdentity!==target.identity)fail('CONFLICT','引用页面已变化，请重新打开。');
   const url=await this.open({binding:cap.binding,kind:'report',id:target.reportId,pageId:target.pageId,reportGuard:{pageId:target.pageId,identity:target.identity},reportFragment:target.fragment});
   return this.send(res,200,JSON.stringify({url:url+target.fragment}),'application/json; charset=utf-8');
  } else if(req.method==='POST'&&route==='/source') {
   if(req.headers.origin!==this.origin||!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type']??''))return this.send(res,403,'Forbidden','text/plain');
   const chunks:Buffer[]=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>4096)return this.send(res,413,'Payload too large','text/plain');chunks.push(chunk);}
   let input:unknown;try{input=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail('INVALID_INPUT','来源请求无效。');}
   if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).sort().join(',')!=='index,pageId')fail('INVALID_INPUT','来源请求无效。');
   const {pageId,index}=input as {pageId:string;index:number};
   if(!/^[0-9a-f-]{36}$/.test(pageId)||!Number.isInteger(index)||index<0||index>=100)fail('INVALID_INPUT','来源请求无效。');
   const result=await this.options.worker.call('productionReport',{binding:cap.binding,reportId:cap.id,pageId});
   const source=reportSources(result.html,result.report.sourceUrl)[index];
   if(!source||!this.options.openSource)fail('NOT_READY','此来源暂不可打开，请复制链接核查。');
   await this.options.openSource(cap.binding,source);return this.send(res,200,JSON.stringify({opened:true}),'application/json; charset=utf-8');
  } else if(req.method==='GET') {
   const page=/^\/(?:view|page)\/([0-9a-f-]{36})$/.exec(route)??/^\/page\/([0-9a-f-]{36})\/bridge\/([a-f0-9]{48})$/.exec(route),pageId=page?.[1]??cap.pageId;
   if(route!=='/'&&!page)return this.send(res,404,'Not found','text/plain');
   const result=await this.options.worker.call('productionReport',{binding:cap.binding,reportId:cap.id,...(pageId?{pageId}:{})});
   if(cap.reportGuard){
    const guarded=pageId===cap.reportGuard.pageId?result:await this.options.worker.call('productionReport',{binding:cap.binding,reportId:cap.id,pageId:cap.reportGuard.pageId});
    if(guarded.navigation.pageIdentity!==cap.reportGuard.identity)fail('CONFLICT','引用原件已变化，请重新打开报告。');
   }
   const frameContext=page?.[2]?this.reportNavigations.get(page[2]):undefined;
   if(page?.[2]&&(!frameContext||frameContext.token!==match[1]||frameContext.pageId!==pageId||frameContext.navigation.fingerprint!==result.navigation.fingerprint))return this.send(res,409,'报告已变化，请重新打开。','text/plain');
   if(route.startsWith('/page/'))return this.send(res,200,page?.[2]?reportNavigationFrame(result.html,result.navigation,pageId!,page[2]):result.html,'text/html; charset=utf-8',"sandbox allow-scripts; default-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; frame-ancestors 'self'; base-uri 'none'; form-action 'none'");
   const selected=pageId??result.report.pageId;
   if(route.startsWith('/view/')&&pageId)await this.options.setReportPosition?.(cap.binding,cap.id,pageId);
   const nav=result.report.pages.map(p=>`<a href="${basePath}/view/${p.id}"${p.id===selected?' aria-current="page"':''}>${escape(p.title)}</a>`).join('');
   const sources=reportSources(result.html,result.report.sourceUrl),nonce=randomBytes(20).toString('base64');
   const sourceList=sources.map((url,index)=>`<li><button type="button" data-source="${index}">打开来源 ${index+1}</button><span>${escape(url)}</span></li>`).join('');
   const bridgeNonce=randomBytes(24).toString('hex');
   if(this.reportNavigations.size>=256)this.reportNavigations.delete(this.reportNavigations.keys().next().value!);
   this.reportNavigations.set(bridgeNonce,{token:match[1],pageId:selected,navigation:structuredClone(result.navigation)});
   const frameSrc=`${this.origin}${basePath}/page/${selected}/bridge/${bridgeNonce}${selected===cap.pageId?cap.reportFragment??'':''}`;
   const config=JSON.stringify({basePath,pageId:selected,bridgeNonce,fingerprint:result.navigation.fingerprint,frameSrc}).replace(/</g,'\\u003c');
   return this.send(res,200,`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(result.report.title)}</title><style>body{margin:0;background:#F5F5F7;color:#1D1D1F;font:14px/1.6 -apple-system,BlinkMacSystemFont,"Microsoft YaHei",sans-serif}header{padding:16px 24px;background:white}h1{font-size:24px;margin:0 0 8px}nav{display:flex;gap:12px;flex-wrap:wrap}a,button{color:#0071E3}a[aria-current]{font-weight:700}button{font:inherit;background:#FAFAFC;border:1px solid #ddd;border-radius:10px;padding:5px 12px;cursor:pointer}li{display:flex;align-items:start;gap:12px;margin:8px 0}li span{overflow-wrap:anywhere}iframe{width:100%;height:calc(100vh - 130px);border:0;background:white}</style></head><body><header><h1>${escape(result.report.title)}</h1><nav aria-label="报告页">${nav}</nav>${sources.length?`<details><summary>核查本页原始来源（${sources.length}）</summary><p>通过此处打开原始作品；报告正文保持隔离阅读。</p><ul>${sourceList}</ul></details>`:''}<p id="source-status" role="status"></p></header><iframe id="report-frame" title="报告完整内容" sandbox="allow-scripts" src="${escape(frameSrc)}"></iframe><script nonce="${nonce}">const config=${config},frame=document.getElementById('report-frame'),reportStatus=document.getElementById('source-status');let navigating=false,historyRestoreTimer;addEventListener('pageshow',event=>{if(!event.persisted&&performance.getEntriesByType('navigation')[0]?.type!=='back_forward')return;if(historyRestoreTimer!==undefined)clearTimeout(historyRestoreTimer);historyRestoreTimer=setTimeout(()=>{historyRestoreTimer=undefined;navigating=false;if(frame.isConnected)try{frame.contentWindow.location.replace(config.frameSrc);}catch{reportStatus.textContent='报告历史恢复未完成，请从报告目录重新打开。';}},0);});addEventListener('message',async event=>{const data=event.data;if(event.source!==frame.contentWindow||event.origin!=='null'||!data||data.kind!=='nova-report-navigate'||data.pageId!==config.pageId||data.nonce!==config.bridgeNonce||navigating)return;if(!Number.isInteger(data.index)||data.index<0){reportStatus.textContent='此报告引用未提供，或不在已注册页面中。';return;}navigating=true;try{const response=await fetch(config.basePath+'/navigate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pageId:config.pageId,index:data.index,fingerprint:config.fingerprint,nonce:config.bridgeNonce})});if(!response.ok)throw Error();const result=await response.json();location.href=result.url;}catch{reportStatus.textContent='引用页面未提供或原件已变化，请重新打开报告后核查。';navigating=false;}});document.querySelectorAll('[data-source]').forEach(button=>button.addEventListener('click',async()=>{const status=document.getElementById('source-status');button.disabled=true;try{const response=await fetch(config.basePath+'/source',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pageId:config.pageId,index:Number(button.dataset.source)})});if(!response.ok)throw Error();status.textContent='已请求在浏览器打开来源。';}catch{status.textContent='来源未打开，请检查链接或网络后重试。';}finally{button.disabled=false;}}));</script></body></html>`,'text/html; charset=utf-8',`default-src 'none'; script-src 'nonce-${nonce}'; connect-src 'self'; style-src 'unsafe-inline'; frame-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`);
  }
  this.send(res,405,'Method not allowed','text/plain');
 }
 private async handleBoundSource(req:http.IncomingMessage,res:http.ServerResponse,cap:Capability,route:string,basePath:string){
  if(req.method==='GET'&&route.startsWith('/file/')){
   let relativePath:string;try{relativePath=decodeURIComponent(route.slice('/file/'.length));}catch{return this.send(res,400,'Invalid path','text/plain');}
   const asset=await this.options.worker.call('jinchengSourceAsset',{binding:cap.binding,sourceId:cap.id,relativePath});
   res.writeHead(200,{'Content-Type':asset.detectedType,'Content-Security-Policy':"sandbox; default-src 'none'; frame-ancestors 'none'",'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'cross-origin','Referrer-Policy':'no-referrer'});res.end(Buffer.from(asset.data));return;
  }
  if(req.method==='POST'&&route==='/request'){
   if(req.headers.origin!==this.origin||!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type']??''))return this.send(res,403,'Forbidden','text/plain');
   const chunks:Buffer[]=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>350000)return this.send(res,413,'Payload too large','text/plain');chunks.push(chunk);}
   let input:unknown;try{input=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail('INVALID_INPUT','保存请求无效。');}
   if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).sort().join(',')!=='expectedHash,relativePath,request,sourceHash')fail('INVALID_INPUT','保存字段无效。');
   const {expectedHash,relativePath,sourceHash,request}=input as {expectedHash:string|null;relativePath:string;sourceHash:string;request:{method:'POST';path:string;body:unknown}};
   const activePage=await this.options.worker.call('jinchengSourcePage',{binding:cap.binding,sourceId:cap.id,relativePath});if(sourceFingerprint(activePage)!==sourceHash)fail('CONFLICT','来源内容已变化，请重新打开后继续。');if(!activePage.allowWrites)fail('FORBIDDEN','此修改过的原页面仅可读取，保存桥未授权。');
   const result=await this.options.worker.call('jinchengSourceRequest',{binding:cap.binding,sourceId:cap.id,expectedHash,request});return this.send(res,200,JSON.stringify(result),'application/json; charset=utf-8');
  }
  if(req.method!=='GET')return this.send(res,405,'Method not allowed','text/plain');
  const view=/^\/(frame|source)\/(.+)$/.exec(route);if(route!=='/'&&!view)return this.send(res,404,'Not found','text/plain');
  let relativePath=cap.relativePath!;if(view){try{relativePath=decodeURIComponent(view[2]);}catch{return this.send(res,400,'Invalid path','text/plain');}}
  const page=await this.options.worker.call('jinchengSourcePage',{binding:cap.binding,sourceId:cap.id,relativePath});
  if(view?.[1]==='frame')return this.send(res,200,boundSourceFrame(page,basePath,relativePath),'text/html; charset=utf-8',`sandbox allow-scripts; default-src 'none'; connect-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: ${this.origin}${basePath}/file/; font-src data: ${this.origin}${basePath}/file/; frame-src 'none'; object-src 'none'; frame-ancestors 'self'; base-uri 'self'; form-action 'none'`);
  const nonce=randomBytes(20).toString('base64'),config=JSON.stringify({basePath,relativePath,sourceHash:sourceFingerprint(page),allowWrites:page.allowWrites===true,stateHash:page.stateHash}).replace(/</g,'\\u003c');
  const html=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(page.title)}</title><style>body{margin:0;background:#F5F5F7;color:#1D1D1F;font:14px/1.6 -apple-system,BlinkMacSystemFont,"Microsoft YaHei",sans-serif}header{padding:12px 24px;background:#fff;border-bottom:1px solid rgba(0,0,0,.08)}h1{font-size:18px;margin:0}p{margin:2px 0;color:#6E6E73}iframe{display:block;border:0;width:100%;height:calc(100vh - 90px);background:#fff}#status{color:#7A4B00}</style></head><body><header><h1>${escape(page.title)}</h1><p>${page.allowWrites?'原页面离线阅读 · 选择与备注保存在当前第二大脑':'原页面只读 · 当前版本未通过保存桥校验'}</p><p id="source-issues" role="status"></p><p id="status" role="status"></p></header><iframe id="source" title="原资料页面" sandbox="allow-scripts" src="${basePath}/frame/${encodeURIComponent(relativePath)}"></iframe><script nonce="${nonce}">const config=${config},frame=document.getElementById('source'),status=document.getElementById('status'),issues=document.getElementById('source-issues');let queue=Promise.resolve();addEventListener('message',event=>{if(event.source!==frame.contentWindow||event.origin!=='null'||!event.data||typeof event.data!=='object')return;const data=event.data;if(data.kind==='nova-source-error'){issues.textContent=String(data.message).slice(0,500);return;}if(data.kind==='nova-source-download'&&config.allowWrites&&typeof data.filename==='string'&&/^[^\\/<>:\"|?*]{1,100}\\.(?:md|txt|json|csv)$/i.test(data.filename)&&typeof data.text==='string'&&data.text.length<=2000000){const link=document.createElement('a'),blob=new Blob([data.text],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob);link.href=url;link.download=data.filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);return;}if(data.kind==='nova-source-navigate'&&typeof data.relativePath==='string'){location.href=config.basePath+'/source/'+encodeURIComponent(data.relativePath);return;}if(data.kind!=='nova-source-request'||!config.allowWrites||typeof data.id!=='string'||data.id.length>100)return;queue=queue.then(async()=>{try{const response=await fetch(config.basePath+'/request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expectedHash:config.stateHash,relativePath:config.relativePath,sourceHash:config.sourceHash,request:data.request})});if(!response.ok)throw Error(response.status===409?'选择已在其他窗口变化，请重开页面后继续；当前输入保留。':'保存未完成；当前输入保留。');const result=await response.json();config.stateHash=result.stateHash;frame.contentWindow.postMessage({kind:'nova-source-result',id:data.id,ok:true,data:result.data},'*');status.textContent='选择与备注已保存到当前第二大脑。';}catch(error){status.textContent=error.message;frame.contentWindow.postMessage({kind:'nova-source-result',id:data.id,ok:false,message:error.message},'*');}});});</script></body></html>`;
  return this.send(res,200,html,'text/html; charset=utf-8',`default-src 'none'; script-src 'nonce-${nonce}'; connect-src 'self'; style-src 'unsafe-inline'; frame-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`);
 }
 async close(){this.closed=true;this.capabilities.clear();this.reportNavigations.clear();const server=this.server;this.server=null;this.origin=null;if(server){server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}}
}
