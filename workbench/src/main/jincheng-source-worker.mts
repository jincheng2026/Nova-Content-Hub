import fs from 'node:fs';
import path from 'node:path';
import {openLibrary} from '../../../plugin-src/src/lib/file-library/index.mjs';
import {vaultRootForRuntime,createVaultDocument} from '../../../plugin-src/src/lib/vault/index.mjs';
import {readSourceMap,resolveSource,readBoundSourceCatalog,readBoundSourceFile} from '../../../plugin-src/src/lib/vault/source-map.mjs';
import {safe,readBytes,digest,atomic,mkdir,withVaultLock,uuidFor,identity} from '../../../plugin-src/src/lib/vault/core.mjs';
import {exact,libraryBinding,requireWrite,fail} from '../shared/validation.ts';
import {isRecord} from '../shared/contracts.ts';
import type {LibraryBinding} from '../shared/contracts.ts';
export type JinchengSourceOperation='jinchengSources'|'jinchengSourceCatalog'|'jinchengSourcePage'|'jinchengSourceAsset'|'jinchengSourceRequest';
const validatedBindings=new Set<string>();
export const isJinchengSourceOperation=(op:unknown):op is JinchengSourceOperation=>typeof op==='string'&&['jinchengSources','jinchengSourceCatalog','jinchengSourcePage','jinchengSourceAsset','jinchengSourceRequest'].includes(op);
// Frozen reviewed upstream template/dependency identities. User-edited HTML remains read-only.
const BRIDGE_SOURCE_HASHES=new Set(["10613ee18eecd99479d4147987d03135260880f0f23f33a836d608d91747883b", "17ce8e8e887c95a9dc3c80544a8b9c73179dbf1f84f42183b77f95934ae3279e", "2b5e17b61d8633b85bb8cf5e2dd872cbf0d57f012ebfae6778d707ed1eade94c", "2ccc3ecc648ade501652e0609123e59ee8fa953e395cad5e8714162abf103d69", "3dae5a77b8d6feb909e29f63a2d7b31207d7c49d8cd1a85c5f9e218040df9452", "3f6b27aefacedca72eda0f19c2ecf63845eb73fa2dc9ef94c4c44f71c1bfbb5e", "46b2ffb238c7751aef75576054d5dd6d922c35f5f698c253c3b64c8a6b0a7dd0", "4db9d1f009035d3e2c5cfc0dd87cc54708d6f09cb94e4f7738bf3dc4a04f0105", "54b3d9cd8a56c27bbcffe2a7748649dc4d030d8ebb53980b9f892fb3b1114acf", "595205f35dadb1c00a85046b3d2d859e0ccc4c7c74c20e0ec02b0ec14b0fe441", "982cc15ab1c928dc928a9bd18eb0357c1ce37c3162e9aa56dec19c7210798958", "9db5b3b45a57d8655c15bfef9b52d25913b5fc87c5a3e8340cf9ae0120fac7e4", "a600fc7435498f09dead32b98953e5d52e73526e07faaef283d7c4eb6e9ca868", "af1fa19322ec399ee96bb74ff6b80cddca0cb65a12b2f7fdde857917dcbf3c19", "af2f0d0d5b651a4df077a6df5f14c5d03f0615cadefd9fde75d0a1b760915362", "b331f65ca64e4ca1be16f59c5ce0fe38698b17ec627b2d80031e5793b8c87dc5", "b8f326f8590029dcbbe6fafb94be165faa07d023351e31c096d4b538f96aa468", "bb1d7634f3f3ef45bc6aa9a0ed7a6a24802cbb12b97e11e0ff709f4ed671f3db", "d90f26c5cc764a0515495d0c2bbfa2b09f99685a3c04f0f35028fc5dd9271c20", "e2b3a60ce97dd0c73bafa41769ed0df1d819aa5238a5b75c96bc971cfc9ab66e", "eaedc75e37d537758282cc2552bb18ecda4d7f794ddd248eaa96f016127cc551", "f442f47960487ee1b4ebc325b2844069859e2003f4886c0f622e55f56371652b", "fa8091186550fb7bdfd2c617eefefa6469b0afea9634a5c474bfc6c337adc4f1", "fb1e061df762d4a934534c335265f6b0bef7e1831964fe8ea9ffc3138ab348c7"]);
const jsonSafe=(value:unknown)=>JSON.parse(JSON.stringify(value)) as unknown;
const MIME:Record<string,string>={'.html':'text/html; charset=utf-8','.htm':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.svg':'image/svg+xml','.woff':'font/woff','.woff2':'font/woff2','.md':'text/plain; charset=utf-8','.txt':'text/plain; charset=utf-8','.csv':'text/csv; charset=utf-8'};
const sourceIdOK=(id:unknown):id is string=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(id);
const relativeOK=(relative:unknown):relative is string=>typeof relative==='string'&&relative.length<=2000&&!path.isAbsolute(relative)&&!relative.includes('\0')&&!relative.includes('\\')&&!relative.split('/').some(p=>!p||p==='.'||p==='..');
type Review={status:string;note:string;selectedImages:string[];_revision:number;updatedAt:string};
type SourceState={format:'nova-jincheng-source-state';schemaVersion:1;sourceId:string;reviews:Record<string,Review>;overall:string;overallRevision:number;storage:Record<string,string>;bookmarkProgress?:Record<string,{decision?:string;note?:string;updatedAt:string}>;history:unknown[]};
const emptyState=(sourceId:string):SourceState=>({format:'nova-jincheng-source-state',schemaVersion:1,sourceId,reviews:{},overall:'',overallRevision:0,storage:{},history:[]});
function stateFile(id:string){return `.workbench/source-state/${id}.json`;}
function readState(root:string,id:string){const file=stateFile(id);if(!fs.existsSync(safe(root,file,true)))return {state:emptyState(id),hash:null};const bytes=readBytes(root,file),state=JSON.parse(bytes.toString('utf8')) as SourceState;if(state.format!=='nova-jincheng-source-state'||state.schemaVersion!==1||state.sourceId!==id||!isRecord(state.reviews)||!isRecord(state.storage)||!Array.isArray(state.history))fail('CORRUPT','原资源选择档案损坏。');return {state,hash:digest(bytes)};}
function sourceJSON(root:string,id:string,relative:string){return JSON.parse(readBoundSourceFile(root,{sourceId:id,relativePath:relative}).data.toString('utf8')) as unknown;}
function visualAPI(root:string,id:string){const api:Record<string,unknown>={};for(const [route,relative] of Object.entries({'/api/portal':'data/portal.json','/api/catalogue':'data/catalogue.json','/cover-collection.json':'public/cover-collection.json','/face-expression-study/manifest.json':'public/face-expression-study/manifest.json'})){try{api[route]=sourceJSON(root,id,relative);}catch(error){api[route]={error:'该来源数据未取得',code:typeof error==='object'&&error&&'code'in error?String(error.code):'SOURCE_MISSING'};}}return api;}
function inlineVisualDependencies(root:string,id:string,relativePath:string,html:string){
 let size=Buffer.byteLength(html),dependenciesApproved=true;
 const local=(url:string,ext:string)=>{if(/^[a-z][a-z\d+.-]*:|^\/\//i.test(url))fail('FORBIDDEN','外部资源未授权。');const rel=url.startsWith('/')?`public/${url.slice(1)}`:path.posix.normalize(path.posix.join(path.posix.dirname(relativePath),url));if(!relativeOK(rel)||path.posix.extname(rel)!==ext)fail('FORBIDDEN','资源路径无效。');const dependency=readBoundSourceFile(root,{sourceId:id,relativePath:rel});if(!BRIDGE_SOURCE_HASHES.has(dependency.hash))dependenciesApproved=false;const value=dependency.data.toString('utf8');size+=Buffer.byteLength(value);if(size>8*1024*1024)fail('INVALID_INPUT','离线页面超过8MiB。');return value;};
 html=html.replace(/<script\b([^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)')[^>]*)>[\s\S]*?<\/script\s*>/gi,(_,attrs:string,d:string,s:string)=>{const code=local(d??s,'.js').replace(/<\/script/gi,'<\\/script'),body=/\bdefer\b/i.test(attrs)?`document.addEventListener('DOMContentLoaded',()=>{${code}\n});`:code;return `<script${attrs.replace(/\bsrc\s*=\s*(?:"[^"]*"|'[^']*')/i,'')}>${body}</script>`;});
 html=html.replace(/<link\b[^>]*>/gi,(whole:string)=>{if(!/\brel\s*=\s*["']stylesheet["']/i.test(whole))return whole;const match=whole.match(/\bhref\s*=\s*(?:"([^"]+)"|'([^']+)')/i);return match?`<style>${local(match[1]??match[2],'.css').replace(/<\/style/gi,'<\\/style')}</style>`:whole;});return {html,dependenciesApproved};
}
export function executeJinchengSource(op:JinchengSourceOperation,args:unknown,mode:'required'|'disabled'){
 if(!isRecord(args))fail('INVALID_INPUT','原资源请求无效。');
 const fields=op==='jinchengSources'?['binding']:op==='jinchengSourceCatalog'?['binding','sourceId']:op==='jinchengSourceRequest'?['binding','sourceId','expectedHash','request']:['binding','sourceId','relativePath'];
 if(!exact(args,fields)||!libraryBinding(args.binding))fail('INVALID_INPUT','原资源字段或知识库绑定无效。');
 const binding=args.binding as LibraryBinding;
 const actualIdentity=identity(binding.root);if(actualIdentity.dev!==binding.rootIdentity.dev||actualIdentity.ino!==binding.rootIdentity.ino)fail('CONFLICT','当前内容库根身份变化。');
 const descriptorBytes=readBytes(binding.root,'内容库.json'),descriptor=JSON.parse(descriptorBytes.toString('utf8')) as {libraryId?:string};if(descriptor.libraryId!==binding.libraryId)fail('CONFLICT','当前内容库身份变化。');
 const bindingKey=JSON.stringify([binding,digest(descriptorBytes)]);if(!validatedBindings.has(bindingKey)){openLibrary(binding.root,{expectedLibraryId:binding.libraryId,expectedRootIdentity:binding.rootIdentity});if(validatedBindings.size>128)validatedBindings.clear();validatedBindings.add(bindingKey);}
 const root=vaultRootForRuntime(binding.root);if(!root)fail('NOT_READY','原资源需要绑定第二大脑。');
 if(op==='jinchengSources')return readSourceMap(root).sources.map(entry=>{try{const source=resolveSource(root,entry.id);return {sourceId:entry.id,role:entry.role,title:entry.role==='visual-assets'?'原视觉门户':entry.role==='bookmarks'?'X收藏':entry.id,available:source.available,entryPath:entry.role==='visual-assets'?'public/hub.html':entry.role==='bookmarks'?'X书签工作台.html':null,issue:source.available?'':'已绑定来源暂不可用，不代表空数据'};}catch(error){return {sourceId:entry.id,role:entry.role,title:entry.id,available:false,entryPath:null,issue:error instanceof Error?error.message:'来源不可用'};}});
 if(!sourceIdOK(args.sourceId))fail('INVALID_INPUT','原资源来源ID无效。');
 const id=args.sourceId,source=resolveSource(root,id);
 if(!source.available)fail('SOURCE_NOT_AVAILABLE','来源尚未取得或已移动。');
 if(op==='jinchengSourceCatalog'){const {files,issues}=readBoundSourceCatalog(root,{sourceId:id});return {sourceId:id,files,issues};}
 if(op==='jinchengSourceRequest'){
  requireWrite(mode);
  if(!['visual-assets','bookmarks'].includes(source.role))fail('FORBIDDEN','此来源未提供可写资料契约。');
  if(!(args.expectedHash===null||typeof args.expectedHash==='string'&&/^[a-f0-9]{64}$/.test(args.expectedHash))||!isRecord(args.request)||!exact(args.request,['method','path','body'])||args.request.method!=='POST'||typeof args.request.path!=='string'||!isRecord(args.request.body))fail('INVALID_INPUT','原视觉保存请求无效。');
  const request=args.request,body=request.body as Record<string,unknown>;
  const bridgeTemplate=source.role==='bookmarks'?'X书签工作台.html':'public/index.html';if(!BRIDGE_SOURCE_HASHES.has(readBoundSourceFile(root,{sourceId:id,relativePath:bridgeTemplate}).hash))fail('FORBIDDEN','原页面版本未通过保存桥校验。');
  if(JSON.stringify(body).length>300000)fail('INVALID_INPUT','原视觉保存数据超过上限。');
  if(source.role==='visual-assets'&&request.path==='/api/export'){
   if(!exact(body,[]))fail('INVALID_INPUT','导出不接受额外字段。');const current=readState(root,id),catalogue=sourceJSON(root,id,'data/catalogue.json') as {items?:{id:string;title:string}[]};const lines=['# 当前视觉选择','','来源：当前绑定原视觉门户；历史喜好不作为本次选择。',''];if(current.state.overall)lines.push('## 整体想法','',current.state.overall,'');for(const item of catalogue.items??[]){const review=current.state.reviews[item.id];if(!review||!review.status&&!review.note&&!review.selectedImages.length)continue;lines.push(`## ${item.id} · ${item.title}`,'',`判断：${review.status||'未判断'}`,review.note,`选中图片：${review.selectedImages.join('、')}`,'');}return {data:{exportText:lines.join('\n'),filename:'visual-choices.md'},stateHash:current.hash};
  }
  if(source.role==='bookmarks'&&request.path==='/api/start-production'){
   if(!exact(body,['id','preferredCarrier'])||typeof body.id!=='string'||typeof body.preferredCarrier!=='string')fail('INVALID_INPUT','书签选用请求无效。');
   const raw=sourceJSON(root,id,'X书签原始数据.json') as {items?:Record<string,unknown>[]},item=raw.items?.find(x=>x.id===body.id);if(!item)fail('NOT_FOUND','书签来源不存在。');
   const result=createVaultDocument(binding.root,{section:'materials',title:`X收藏_${String(item.author??item.handle??'原帖')}_${String(item.id)}`,text:`# X收藏选用材料\n\n来源：${String(item.url??'')}\n作者：${String(item.author??item.handle??'')}\n来源ID：${id} / ${String(item.id)}\n来源条目SHA256：${digest(JSON.stringify(item))}\n\n${String(item.text??'')}\n\n此为用户选用的参考材料，尚未确认选题或创建生产内容。\n`},{mutationId:uuidFor(`${binding.libraryId}:bookmark-material:${id}:${String(item.id)}`)});
   return {data:{ok:true,selected:true,materialPath:result.document.relativePath},stateHash:readState(root,id).hash};
  }
  return withVaultLock(root,()=>{
   const current=readState(root,id);if(current.hash!==args.expectedHash)fail('CONFLICT','视觉选择已在其他窗口变化，请重新读取后继续。');
   const state=structuredClone(current.state),at=new Date().toISOString();
   if(request.path==='/storage'){
    if(!exact(body,['key','value'])||typeof body.key!=='string'||body.key.length>200||!body.key||!(body.value===null||typeof body.value==='string'&&body.value.length<=250000))fail('INVALID_INPUT','选择存储字段无效。');
    if(body.value===null)delete state.storage[body.key];else state.storage[body.key]=body.value;
    if(Object.keys(state.storage).length>100)fail('INVALID_INPUT','选择存储数量超过上限。');
   }else if(source.role==='bookmarks'&&request.path==='/api/progress'){
    if(Object.keys(body).some(k=>!['id','decision','status','note','updatedAt'].includes(k))||typeof body.id!=='string'||typeof body.updatedAt!=='string'||!Number.isFinite(Date.parse(body.updatedAt)))fail('INVALID_INPUT','书签决策字段无效。');
    const raw=sourceJSON(root,id,'X书签原始数据.json') as {items?:{id:string}[]};if(!raw.items?.some(x=>x.id===body.id))fail('NOT_FOUND','书签原件不存在。');
    const decision=body.decision??body.status;if(decision!==undefined&&!['系统推荐','优先做','暂缓','忽略'].includes(String(decision))||body.note!==undefined&&(typeof body.note!=='string'||body.note.length>20000))fail('INVALID_INPUT','书签决策或备注无效。');
    state.bookmarkProgress??={};const prior=state.bookmarkProgress[body.id];if(!prior||prior.updatedAt<=body.updatedAt)state.bookmarkProgress[body.id]={...prior,...(decision===undefined?{}:{decision:String(decision)}),...(body.note===undefined?{}:{note:String(body.note)}),updatedAt:body.updatedAt};
   }else{
    const revision=body._revision;if(!Number.isInteger(revision)||Number(revision)<1)fail('INVALID_INPUT','缺少有效保存序号。');
    if(request.path==='/api/overall'){
     if(!exact(body,['_revision','overall'])||typeof body.overall!=='string'||body.overall.length>10000)fail('INVALID_INPUT','整体意见无效。');
     if(Number(revision)<=state.overallRevision)return {data:{saved:true,stale:true},stateHash:current.hash};state.overall=body.overall;state.overallRevision=Number(revision);
    }else{
     const match=/^\/api\/reviews\/([A-Za-z0-9_-]{1,100})$/.exec(request.path as string);if(!match)fail('FORBIDDEN','原接口不在允许的保存契约内。');
     const catalogue=sourceJSON(root,id,'data/catalogue.json') as {items?:{id:string;images?:{id:string}[]}[]},item=catalogue.items?.find(item=>item.id===match[1]);if(!item)fail('NOT_FOUND','选择的原作品不存在。');
     if(Object.keys(body).some(k=>!['_revision','status','note','selectedImages'].includes(k)))fail('INVALID_INPUT','原作品保存字段无效。');
     const prior=state.reviews[match[1]]??{status:'',note:'',selectedImages:[],_revision:0,updatedAt:at};
     if(Number(revision)<=prior._revision)return {data:{saved:true,stale:true},stateHash:current.hash};
     const updated={...prior,...body,_revision:Number(revision),updatedAt:at};
     if(!['','like','adjust','no','unsure'].includes(String(updated.status))||typeof updated.note!=='string'||updated.note.length>10000||!Array.isArray(updated.selectedImages)||updated.selectedImages.some(p=>typeof p!=='string'||!item.images?.some(img=>img.id===p)))fail('INVALID_INPUT','原作品意见或图片选择无效。');
     state.reviews[match[1]]=updated as Review;
    }
   }
   state.history.push({at,request:jsonSafe(request)});if(state.history.length>1000)fail('INVALID_INPUT','视觉选择历史已满，请归档后继续。');
   mkdir(root,'.workbench/source-state');const bytes=Buffer.from(JSON.stringify(state,null,2)+'\n');if(bytes.length>8*1024*1024)fail('INVALID_INPUT','视觉选择档案超过8MiB。');atomic(root,stateFile(id),bytes,current.hash);return {data:{saved:true,ok:true,accepted:true,updatedAt:at},stateHash:digest(bytes)};
  });
 }
 if(!relativeOK(args.relativePath))fail('INVALID_INPUT','原资源相对路径无效。');
 const file=readBoundSourceFile(root,{sourceId:id,relativePath:args.relativePath}),detectedType=MIME[path.extname(args.relativePath).toLowerCase()];
 if(!detectedType)fail('FORBIDDEN','此原资源类型不提供浏览器执行。');
 if(op==='jinchengSourceAsset'){
  if(/(?:text\/html|javascript)/.test(detectedType))fail('FORBIDDEN','活动页面须通过隔离阅读入口。');return {data:file.data,detectedType,hash:file.hash};
 }
 if(!(source.role==='visual-assets'&&/^public\/.+\.html?$/i.test(args.relativePath)||source.role==='bookmarks'&&args.relativePath==='X书签工作台.html'))fail('FORBIDDEN','此来源未提供原页面阅读契约。');
 const prepared=inlineVisualDependencies(root,id,args.relativePath,file.data.toString('utf8'));let html=prepared.html;const api:Record<string,unknown>=source.role==='visual-assets'?visualAPI(root,id):{},current=readState(root,id);
 if(source.role==='visual-assets'&&args.relativePath==='public/cover-collection.html')html=html.replace(/f\.onload=\(\)=>f\.contentWindow\.postMessage\([\s\S]*?f\.src='http:\/\/127\.0\.0\.1:43139\/cover-selection-bridge\.html'/,"/* Historical sidecar is absent; current choices use the selected vault. */");
 if(source.role==='bookmarks'){
  const data=sourceJSON(root,id,'X书签原始数据.json'),progress=current.state.bookmarkProgress??{};
  api['/api/snapshot']={data,decisions:Object.fromEntries(Object.entries(progress).map(([id,p])=>[id,p.decision??'系统推荐'])),notes:Object.fromEntries(Object.entries(progress).map(([id,p])=>[id,p.note??''])),sync:{storage:'current-vault',offline:true}};
  html=html.replace(/async function startProduction\(item\) \{[\s\S]*?(?=    function quickViewMatch)/,`async function startProduction(item) { const id=item.id;productionStates[id]={status:'loading',message:'正在选入当前第二大脑素材…'};render();try{const response=await fetch(BRIDGE_URL+'/api/start-production',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,preferredCarrier:itemPreferredCarrier(item)})});const result=await response.json();if(!response.ok||!result.ok)throw Error(result.error||'选用未完成');productionStates[id]={status:'success',message:'已选入素材：'+result.materialPath};}catch(error){productionStates[id]={status:'error',message:String(error.message||error)};}render();}\n`)
   .replace(/BOOKMARKS · LIVE/g,'BOOKMARKS · 来源快照').replace(/开始生产/g,'选入素材').replace(/正在创建飞书工作稿/g,'正在选入第二大脑素材').replace(/正在写入飞书/g,'正在保存到第二大脑').replace(/人工决策已同步/g,'人工决策已保存到第二大脑').replace(/已同步飞书/g,'已保存到第二大脑');
 }

 api['/api/reviews']={reviews:current.state.reviews,overall:current.state.overall,overallRevision:current.state.overallRevision};
 return {html,hash:file.hash,allowWrites:BRIDGE_SOURCE_HASHES.has(file.hash)&&prepared.dependenciesApproved,api,storage:current.state.storage,stateHash:current.hash,title:html.match(/<title>([^<]+)<\/title>/i)?.[1]??'原视觉门户'};
}
