import {randomUUID} from 'node:crypto';
import {isRecord} from '../shared/contracts.ts';
import {validateInput,fail,exact,requireWrite} from '../shared/validation.ts';
import type {DesktopController} from './controller.mts';
import type {LibraryBinding} from '../shared/contracts.ts';
import type {CreationInputs,CreationStash,CreationWorkerAction} from '../shared/creation-contracts.ts';
import {creationFrameHtml} from './creation-frame-html.mts';
type Session={id:string;binding:LibraryBinding;documentId:string;pageId:string;html:string};
export class CreationController {
 owner:DesktopController;
 sessions=new Map<string,Session>();
 openLocalFile?: (filename:string)=>Promise<void>;
 constructor(owner:DesktopController){this.owner=owner;}
 async openCreationPage(input:CreationInputs['openCreationPage']){
  validateInput('openCreationPage',input);
  return this.owner.exclusive(async()=>{
   const binding=structuredClone(this.owner.current());
   const result=await this.owner.worker.call('creationPage',{binding,documentId:input.id,action:'read'});
   if(!isRecord(result)||typeof result.html!=='string'||typeof result.pageId!=='string'||typeof result.fingerprint!=='string'||typeof result.path!=='string'||!isRecord(result.stash))fail('CORRUPT','创作页读取结果无效。');
   const id=randomUUID(),html=creationFrameHtml(result.html,{sessionId:id,pageId:result.pageId,fingerprint:result.fingerprint,path:result.path,stash:result.stash as unknown as CreationStash});this.sessions.set(id,{id,binding,documentId:input.id,pageId:result.pageId,html});
   // Cap stale abandoned frames without revoking a concurrently mounted page.
   if(this.sessions.size>20)this.sessions.delete(this.sessions.keys().next().value!);
   return {sessionId:id,pageId:result.pageId,title:typeof result.title==='string'?result.title:'创作页',html,url:`nova-content://creation/${id}/index.html`};
  });
 }
 resource(url:string):string|null {
  const parsed=new URL(url);if(parsed.protocol!=='nova-content:'||parsed.hostname!=='creation'||parsed.search||parsed.hash)return null;
  const match=/^\/([a-f0-9-]{36})\/index\.html$/.exec(parsed.pathname);if(!match)return null;
  try{return this.session(match[1]).html;}catch{return null;}
 }
 private session(id:string){
  const session=this.sessions.get(id),current=this.owner.current();
  if(!session||session.binding.libraryId!==current.libraryId||session.binding.root!==current.root||session.binding.rootIdentity.dev!==current.rootIdentity.dev||session.binding.rootIdentity.ino!==current.rootIdentity.ino)fail('CONFLICT','创作页所属知识库已改变，请重新打开。');
  return session;
 }
 async creationPageRequest(input:CreationInputs['creationPageRequest']){
  validateInput('creationPageRequest',input);
  return this.owner.exclusive(async()=>{
   const session=this.session(input.sessionId);
   const call=(action:CreationWorkerAction,payload?:unknown)=>this.owner.worker.call('creationPage',{binding:session.binding,documentId:session.documentId,pageId:session.pageId,action,...(payload===undefined?{}:{payload})});
   if(input.action==='stash-read')return call('stash-read');
   if(input.action==='stash-write'){requireWrite(this.owner.authMode);return call('stash-write',input.payload);}
   if(input.action==='reload')return {reload:true};
   if(input.action==='copy'){
    if(!exact(input.payload,['text'])||typeof input.payload.text!=='string'||input.payload.text.length>1_000_000)fail('INVALID_INPUT','复制文字无效。');
    if(!this.owner.copyText)fail('NOT_READY','当前环境未提供剪贴板。');await this.owner.copyText(input.payload.text);return {copied:true};
   }
   if(input.action==='open-link'){
    const link=await call('reference',input.payload);if(!isRecord(link))fail('INVALID_INPUT','来源解析失败。');
    if(typeof link.url==='string'&&this.owner.openPublicationURL){await this.owner.openPublicationURL(link.url);return {opened:true};}
    if(typeof link.localPath==='string'&&this.openLocalFile){await this.openLocalFile(link.localPath);return {opened:true};}
    fail('NOT_READY','此环境没有原片打开入口。');
   }
   const p=input.payload;
   if(!exact(p,['method','url','body'])||!['GET','POST'].includes(p.method as string)||typeof p.url!=='string')fail('INVALID_INPUT','页面请求格式无效。');
   const route=new URL(p.url,'https://creation.invalid');
   if(route.origin!=='https://creation.invalid')fail('INVALID_INPUT','创作页不能访问任意地址。');
   const page=`/p/${encodeURIComponent(session.pageId)}`;
   try{
    let data:unknown;
    if(p.method==='POST'&&route.pathname==='/save'){
     requireWrite(this.owner.authMode);this.owner.noPending();
     if(!isRecord(p.body)||Object.keys(p.body).some(key=>!['page_id','token','changes','self_path'].includes(key))||p.body.self_path)fail('INVALID_INPUT','页面保存不能指定本机路径。');
     data=await call('save',{page_id:p.body.page_id,token:p.body.token,changes:p.body.changes});
    }else if(p.method==='GET'&&[`${page}/meta`,`${page}/doc`].includes(route.pathname))data=await call('meta');
    else if(p.method==='GET'&&route.pathname===`${page}/changes`)data=await call('history',{itemId:route.searchParams.get('item')??undefined});
    else if(p.method==='GET'&&route.pathname==='/healthz')data={ok:true,writable:this.owner.authMode==='disabled',features:['desktop-bridge','creation-doc','save-groups']};
    else fail('INVALID_INPUT','此页面路由没有受控适配。');
    return {ok:true,status:200,data};
   }catch(error){const issue=error as {code?:string;message?:string};return {ok:false,status:issue.code==='NOT_FOUND'?404:issue.code==='CONFLICT'?409:400,data:{error:issue.message??'页面请求失败'}};}
  });
 }
 async closeCreationPage(input:CreationInputs['closeCreationPage']){
  validateInput('closeCreationPage',input);this.sessions.delete(input.sessionId);return {closed:true as const};
 }
}
