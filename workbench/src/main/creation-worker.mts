import path from 'node:path';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {verifiedBoundReader} from './bound-reader.mts';
import {readVaultSnapshot,vaultRootForRuntime} from '../../../plugin-src/src/lib/vault/index.mjs';
import {atomic,digest,identity,mkdir,readBytes,safe} from '../../../plugin-src/src/lib/vault/core.mjs';
import {readCreationDocument,renderCreationHtml,saveKitChanges,readHistory} from '../../../plugin-src/src/lib/creation-document/index.mjs';
import {isRecord} from '../shared/contracts.ts';
import {exact,fail,libraryBinding,requireWrite,uuid} from '../shared/validation.ts';
import {stringMap,jsonPayload} from '../shared/creation-validation.ts';
import {vaultDocumentId} from '../shared/vault-validation.ts';
import type {CreationWorkerOperations,CreationStash} from '../shared/creation-contracts.ts';
import type {SourceRef,KitChange} from '../../../plugin-src/src/lib/creation-document/index.mjs';

function changes(value:unknown):value is KitChange[] {
 return Array.isArray(value)&&value.length<=1000&&value.every(item=>isRecord(item)&&Object.keys(item).every(key=>['change_id','item_id','field','before','after','item_fp','group'].includes(key))&&['change_id','item_id','field','before','after','item_fp'].every(key=>typeof item[key]==='string')&&(item.group===undefined||typeof item.group==='string')&&String(item.change_id).length<=200&&String(item.item_id).length<=200&&String(item.field).length<=200&&String(item.before).length<=1_000_000&&String(item.after).length<=1_000_000&&/^[a-f0-9]{12}$/.test(String(item.item_fp)));
}
export async function executeCreation(args:unknown,mode:'required'|'disabled') {
 if(!isRecord(args)||Object.keys(args).some(key=>!['binding','documentId','pageId','action','payload'].includes(key))||!libraryBinding(args.binding)||!vaultDocumentId(args.documentId)||typeof args.action!=='string')fail('INVALID_INPUT','创作页请求无效。');
 const binding=args.binding as CreationWorkerOperations['creationPage']['args']['binding'];
 verifiedBoundReader(binding);
 const root=vaultRootForRuntime(binding.root);if(!root)fail('NOT_READY','请打开第二大脑知识库后继续。');
 const snapshot=readVaultSnapshot(binding.root),entry=snapshot?.documents.find(document=>document.id===args.documentId);
 if(!entry||entry.format!=='html')fail('NOT_FOUND','原创作 HTML 已移走或不在当前知识库。');
 const source:SourceRef={sourceId:'drafts',documentId:entry.id,relativePath:entry.relativePath,vaultId:snapshot!.vaultId};
 const doc=await readCreationDocument(root,source);
 if(args.pageId!==undefined&&args.pageId!==doc.pageId)fail('CONFLICT','页面身份已经变化，请重新打开。');
 const storagePath=`.workbench/creation-pending/${digest(`${snapshot!.vaultId}|${entry.relativePath}|${doc.pageId}`)}.json`;
 const readStash=():CreationStash=>{
  const location=safe(root,storagePath,true);
  if(!fs.existsSync(location))return {version:digest('empty'),records:[],storage:{local:{},session:{}}};
  const bytes=readBytes(root,storagePath),value:unknown=JSON.parse(bytes.toString('utf8'));
  if(!isRecord(value)||!Array.isArray(value.records)||!isRecord(value.storage)||!stringMap(value.storage.local)||!stringMap(value.storage.session))fail('CORRUPT','创作页暂存损坏，原文件保留，请先恢复暂存。');
  return {version:digest(bytes),records:value.records as Record<string,unknown>[],storage:{local:value.storage.local,session:value.storage.session}};
 };
 if(args.action==='read')return {html:Buffer.from(renderCreationHtml(doc.raw,{mode:'trusted-frame'})).toString('utf8'),pageId:doc.pageId,fingerprint:doc.revision,path:entry.relativePath,title:entry.title,stash:readStash(),rootIdentity:identity(root)};
 if(args.action==='meta')return {fingerprint:doc.revision,path:entry.relativePath,same_file:true,doc:doc.raw};
 if(args.action==='stash-read')return readStash();
 if(args.action==='history')return readHistory(root,source,isRecord(args.payload)&&typeof args.payload.itemId==='string'?args.payload.itemId:undefined);
 if(args.action==='save'){
  requireWrite(mode);
  const p=args.payload;if(!isRecord(p)||Object.keys(p).some(key=>!['page_id','token','changes','mutationId'].includes(key))||p.page_id!==doc.pageId||typeof p.token!=='string'||!changes(p.changes)||(p.mutationId!==undefined&&!uuid(p.mutationId)))fail('INVALID_INPUT','保存请求没有通过原页面契约校验。');
  return saveKitChanges(root,source,{mutationId:typeof p.mutationId==='string'?p.mutationId:randomUUID(),page_id:p.page_id as string,token:p.token,changes:p.changes});
 }
 if(args.action==='stash-write'){
  requireWrite(mode);
  const p=args.payload;
  if(!exact(p,['expectedVersion','records','storage'])||typeof p.expectedVersion!=='string'||!Array.isArray(p.records)||p.records.length>2000||!p.records.every(record=>isRecord(record)&&typeof record.key==='string'&&record.key.length<500&&typeof record.change_id==='string')||!isRecord(p.storage)||!stringMap(p.storage.local)||!stringMap(p.storage.session)||!jsonPayload(p))fail('INVALID_INPUT','创作页暂存请求无效。');
  const current=readStash();if(current.version!==p.expectedVersion)fail('CONFLICT','暂存已由另一窗口更新，请回读后合并。');
  mkdir(root,'.workbench/creation-pending');
  const location=safe(root,storagePath,true),expected=fs.existsSync(location)?current.version:null;
  const bytes=Buffer.from(JSON.stringify({format:'nova-creation-pending',schemaVersion:1,pageId:doc.pageId,source,records:p.records,storage:p.storage}));
  atomic(root,storagePath,bytes,expected);return {version:digest(bytes)};
 }
 if(args.action==='reference'){
  const p=args.payload;if(!exact(p,['href'])||typeof p.href!=='string'||p.href.length>4000)fail('INVALID_INPUT','原片链接无效。');
  const refs:Record<string,unknown>[]=[];
  for(const item of doc.items)if(Array.isArray(item.locked?.refs))for(const ref of item.locked.refs)if(isRecord(ref))refs.push(ref);
  if(/^https?:\/\//i.test(p.href)){
   const match=refs.find(ref=>typeof ref.url==='string'&&ref.url===p.href);
   if(!match)fail('INVALID_INPUT','链接不是当前页面的已登记来源。');
   const url=new URL(p.href);if(url.username||url.password)fail('INVALID_INPUT','来源链接不能含凭据。');return {url:url.href};
  }
  const withoutFragment=p.href.split('#')[0];let decoded:string;try{decoded=decodeURIComponent(withoutFragment);}catch{fail('INVALID_INPUT','本地原片路径无效。');}
  const ref=refs.find(item=>typeof item.video==='string'&&item.video===decoded);
  if(!ref||path.isAbsolute(decoded)||decoded.includes('\\')||decoded.includes('\0')||/^[a-z][a-z0-9+.-]*:/i.test(decoded))fail('INVALID_INPUT','原片未在当前页面登记。');
  const target=path.resolve(root,path.dirname(entry.relativePath),decoded),relative=path.relative(root,target);
  if(!relative||relative==='..'||relative.startsWith(`..${path.sep}`)||path.isAbsolute(relative))fail('UNSAFE_PATH','原片位于未关联的知识库外。');
  const checked=safe(root,relative.split(path.sep).join('/'));if(!fs.statSync(checked).isFile())fail('NOT_FOUND','原片文件不存在。');
  if(!['.mp4','.mov','.m4v','.webm','.mkv','.avi','.mp3','.m4a','.wav','.ogg','.flac','.aac','.aiff'].includes(path.extname(checked).toLowerCase()))fail('INVALID_INPUT','原片入口只接受音视频文件，不能打开脚本或程序。');
  return {localPath:checked};
 }
 fail('INVALID_INPUT','创作页操作不在受控范围内。');
}
