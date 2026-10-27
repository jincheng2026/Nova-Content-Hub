import http from 'node:http';
import {randomBytes} from 'node:crypto';
import type {AddressInfo} from 'node:net';
import type {LibraryBinding,Worker} from '../shared/contracts.ts';
import type {ProductionCreationState,ProductionDraft} from '../shared/production-contracts.ts';
import {productionDraft} from '../shared/production-validation.ts';
import {fail} from '../shared/validation.ts';
import {reportSources} from './report-sources.mts';
interface PageOptions {
 worker:Worker;
 openSource?(binding:LibraryBinding,url:string):Promise<void>;
 creationHtml:string;
 authorize(binding:LibraryBinding):void|Promise<void>;
 readCreation(binding:LibraryBinding,contentId:string):Promise<ProductionCreationState>;
 setReportPosition?(binding:LibraryBinding,reportId:string,pageId:string):Promise<void>;
 saveDraft(binding:LibraryBinding,input:ProductionDraft):Promise<ProductionCreationState>;
}
type Capability={binding:LibraryBinding;kind:'creation'|'report';id:string;pageId?:string};
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const errorCode=(error:unknown)=>typeof error==='object'&&error!==null&&'code'in error?String(error.code):'IO_ERROR';
export class ProductionPages {
 readonly options:PageOptions;
 private server:http.Server|null=null;
 private startupPromise:Promise<string>|null=null;
 private origin:string|null=null;
 private capabilities=new Map<string,Capability>();
 private closed=false;
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
 private async open(capability:Capability){await this.options.authorize(capability.binding);const origin=await this.start();for(const [existing,cap] of this.capabilities)if(cap.kind===capability.kind&&cap.id===capability.id&&cap.pageId===capability.pageId&&cap.binding.root===capability.binding.root&&cap.binding.libraryId===capability.binding.libraryId&&cap.binding.rootIdentity.dev===capability.binding.rootIdentity.dev&&cap.binding.rootIdentity.ino===capability.binding.rootIdentity.ino)return `${origin}/p/${existing}/`;const token=randomBytes(32).toString('hex');if(this.capabilities.size>=256)this.capabilities.delete(this.capabilities.keys().next().value!);this.capabilities.set(token,structuredClone(capability));return `${origin}/p/${token}/`;}
 openCreation(binding:LibraryBinding,contentId:string){return this.open({binding,kind:'creation',id:contentId});}
 openReport(binding:LibraryBinding,reportId:string,pageId?:string){return this.open({binding,kind:'report',id:reportId,...(pageId?{pageId}:{})});}
 private send(res:http.ServerResponse,status:number,body:string,type='text/html; charset=utf-8',csp="default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"){
  res.writeHead(status,{'Content-Type':type,'Content-Security-Policy':csp,'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin'});res.end(body);
 }
 private async handle(req:http.IncomingMessage,res:http.ServerResponse){
  if(!this.origin||req.headers.host!==new URL(this.origin).host||req.headers.origin!==undefined&&req.headers.origin!==this.origin||req.headers['sec-fetch-site']==='cross-site')return this.send(res,403,'Forbidden','text/plain');
  const match=/^\/p\/([a-f0-9]{64})(\/[^?#]*)$/.exec(req.url??'');if(!match)return this.send(res,404,'Not found','text/plain');
  const cap=this.capabilities.get(match[1]);if(!cap)return this.send(res,404,'Not found','text/plain');
  await this.options.authorize(cap.binding);
  const route=match[2],basePath=`/p/${match[1]}`;
  if(cap.kind==='creation') {
   if(req.method==='GET'&&route==='/'){
    const nonce=randomBytes(20).toString('base64');
    const config=JSON.stringify({basePath}).replace(/</g,'\\u003c');
    const html=this.options.creationHtml.replace(/<script\b/gi,`<script nonce="${nonce}"`).replace('</head>',`<script nonce="${nonce}">window.novaCreation=${config};</script></head>`);
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
   const page=/^\/(?:view|page)\/([0-9a-f-]{36})$/.exec(route),pageId=page?.[1]??cap.pageId;
   if(route!=='/'&&!page)return this.send(res,404,'Not found','text/plain');
   const result=await this.options.worker.call('productionReport',{binding:cap.binding,reportId:cap.id,...(pageId?{pageId}:{})});
   if(route.startsWith('/page/'))return this.send(res,200,result.html,'text/html; charset=utf-8',"sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; frame-ancestors 'self'; base-uri 'none'; form-action 'none'");
   const selected=pageId??result.report.pageId;
   if(route.startsWith('/view/')&&pageId)await this.options.setReportPosition?.(cap.binding,cap.id,pageId);
   const nav=result.report.pages.map(p=>`<a href="${basePath}/view/${p.id}"${p.id===selected?' aria-current="page"':''}>${escape(p.title)}</a>`).join('');
   const sources=reportSources(result.html,result.report.sourceUrl),nonce=randomBytes(20).toString('base64');
   const sourceList=sources.map((url,index)=>`<li><button type="button" data-source="${index}">打开来源 ${index+1}</button><span>${escape(url)}</span></li>`).join('');
   const config=JSON.stringify({basePath,pageId:selected}).replace(/</g,'\\u003c');
   return this.send(res,200,`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(result.report.title)}</title><style>body{margin:0;background:#F5F5F7;color:#1D1D1F;font:14px/1.6 -apple-system,BlinkMacSystemFont,"Microsoft YaHei",sans-serif}header{padding:16px 24px;background:white}h1{font-size:24px;margin:0 0 8px}nav{display:flex;gap:12px;flex-wrap:wrap}a,button{color:#0071E3}a[aria-current]{font-weight:700}button{font:inherit;background:#FAFAFC;border:1px solid #ddd;border-radius:10px;padding:5px 12px;cursor:pointer}li{display:flex;align-items:start;gap:12px;margin:8px 0}li span{overflow-wrap:anywhere}iframe{width:100%;height:calc(100vh - 130px);border:0;background:white}</style></head><body><header><h1>${escape(result.report.title)}</h1><nav aria-label="报告页">${nav}</nav>${sources.length?`<details><summary>核查本页原始来源（${sources.length}）</summary><p>通过此处打开原始作品；报告正文保持隔离阅读。</p><ul>${sourceList}</ul></details>`:''}<p id="source-status" role="status"></p></header><iframe title="报告完整内容" sandbox="allow-scripts" src="${basePath}/page/${selected}"></iframe><script nonce="${nonce}">const config=${config};document.querySelectorAll('[data-source]').forEach(button=>button.addEventListener('click',async()=>{const status=document.getElementById('source-status');button.disabled=true;try{const response=await fetch(config.basePath+'/source',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pageId:config.pageId,index:Number(button.dataset.source)})});if(!response.ok)throw Error();status.textContent='已请求在浏览器打开来源。';}catch{status.textContent='来源未打开，请检查链接或网络后重试。';}finally{button.disabled=false;}}));</script></body></html>`,'text/html; charset=utf-8',`default-src 'none'; script-src 'nonce-${nonce}'; connect-src 'self'; style-src 'unsafe-inline'; frame-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`);
  }
  this.send(res,405,'Method not allowed','text/plain');
 }
 async close(){this.closed=true;this.capabilities.clear();const server=this.server;this.server=null;this.origin=null;if(server){server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}}
}
