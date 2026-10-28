import fs from 'node:fs';
import path from 'node:path';
import {SECTIONS, digest, fail, identity, json, readBytes, runMutation, safe, vaultState, withVaultReadLock} from './core.mjs';
import {isManagedFinalAssetPath} from '../final-assets/transaction.mjs';

const ID=/^[a-zA-Z0-9_-]{8,100}$/;
const HASH=/^[a-f0-9]{64}$/;
const docId=relative=>`doc-${digest(relative).slice(0,32)}`;
const dedicatedSource=relative=>typeof relative==='string'&&(isManagedFinalAssetPath(relative)||/^06_发布复盘\/(?:正式发布档案|已发布视频档案)(?:\/|$)/.test(relative)||/(?:^|\/)T\d{3,}(?=[_ /.-]|$)/.test(relative));
const titleFor=(relative,bytes)=>['.md','.markdown'].includes(path.posix.extname(relative).toLowerCase())&&bytes?.toString('utf8').match(/^#\s+(.+)$/m)?.[1]?.trim()||path.posix.basename(relative,path.posix.extname(relative));
function present(root,relative) {
  try {safe(root,relative);return true;} catch(error) {if(error.code==='ENOENT')return false;throw error;}
}
function sameIdentity(a,b) {return a?.dev===b?.dev&&a?.ino===b?.ino;}
function binding(runtimeRoot) {
  const b=vaultState(runtimeRoot),descriptor=json(b.root,'.workbench/vault.json');
  if(descriptor.format!=='nova-knowledge-vault'||descriptor.vaultId!==b.vaultId||!sameIdentity(descriptor.rootIdentity,b.rootIdentity)||!sameIdentity(identity(b.root),b.rootIdentity))fail('CONFLICT','知识库目录身份已变化，请重新选择');
  return b;
}
function ordinarySection(relative) {
  if(typeof relative!=='string'||relative.includes('\\')||relative.split('/').some(p=>!p||p==='.'||p==='..'||p.startsWith('.'))||dedicatedSource(relative))return null;
  return Object.entries(SECTIONS).find(([,directory])=>relative.startsWith(directory+'/'))?.[0]??(relative.startsWith('11_提示词/')?'prompts':null);
}
function contentProjection(b) {
  if(!present(b.root,'.workbench/projection.json'))return [];
  const projection=json(b.root,'.workbench/projection.json');
  if(!projection||typeof projection.contents!=='object'||!projection.contents||Array.isArray(projection.contents))fail('CORRUPT','内容映射损坏，无法安全区分资料与内容回收');
  return Object.values(projection.contents);
}
function excluded(r,projection) {
  return dedicatedSource(r.path)||projection.some(p=>p?.trashMutationId===r.mutationId||p?.relativePath===r.path);
}
function validateTrash(b,r,trashId) {
  if(!r||r.format!=='nova-vault-mutation'||r.mutationId!==trashId||r.status!=='committed'||r.action!=='trash'||r.request?.action!=='trash'||!HASH.test(r.requestHash??'')||digest(JSON.stringify(r.request))!==r.requestHash)fail('CORRUPT','回收回执未提交或校验失败');
  const pins=r.request.documentTrash;
  if(!pins)fail('INVALID_INPUT','旧版回收记录缺少知识库身份，不能安全恢复');
  if(pins.schemaVersion!==1||pins.vaultId!==b.vaultId||!sameIdentity(pins.rootIdentity,b.rootIdentity))fail('CONFLICT','回收记录不属于当前知识库目录身份');
  if(r.documentTrash&&JSON.stringify(r.documentTrash)!==JSON.stringify(pins))fail('CORRUPT','回收记录身份与请求校验不一致');
  if(!ordinarySection(r.path)||r.after!==null||!HASH.test(r.beforeHash??'')||r.request.input?.id!==docId(r.path)||r.request.input.expectedHash!==r.beforeHash||Object.keys(r.request.input).some(k=>!['id','expectedHash'].includes(k)))fail('CORRUPT','回收记录原路径、文档身份或正文校验无效');
  safe(b.root,r.path,true);
  const bytes=readBytes(b.root,`.workbench/trash/${trashId}/source`);
  if(digest(bytes)!==r.beforeHash)fail('CONFLICT','回收原文件已变化，不能恢复');
  return bytes;
}
function committedRestores(b) {
  const restored=new Set();
  for(const name of fs.readdirSync(safe(b.root,'.workbench/mutations'))) {
    if(!/^[a-zA-Z0-9_-]{8,100}\.json$/.test(name))continue;
    const r=json(b.root,`.workbench/mutations/${name}`);
    if(r?.format==='nova-vault-mutation'&&r.mutationId===name.slice(0,-5)&&r.status==='committed'&&r.action==='create'&&r.request?.action==='restore-document'&&HASH.test(r.requestHash??'')&&digest(JSON.stringify(r.request))===r.requestHash&&r.request.vaultId===b.vaultId&&sameIdentity(r.request.rootIdentity,b.rootIdentity)&&r.result?.trashId===r.request.input?.trashId&&r.result?.document?.relativePath===r.path&&r.result.document.hash===r.request.input.expectedHash&&typeof r.after==='string'&&digest(Buffer.from(r.after,'base64'))===r.request.input.expectedHash)restored.add(r.request.input.trashId);
  }
  return restored;
}
function issueText(error) {
  if(error.code==='ENOENT')return '回收原文件已丢失，无法恢复';
  return error.message||'无法核验回收记录';
}
/** Returns receipt-derived records only. Never scans trash folder names for source authority. */
export function listVaultDocumentTrash(runtimeRoot) {
  const b=binding(runtimeRoot);
  return withVaultReadLock(b.root,()=>{
    binding(runtimeRoot);
    const projection=contentProjection(b),restored=committedRestores(b),rows=[];
    for(const name of fs.readdirSync(safe(b.root,'.workbench/mutations'))) {
      if(!/^[a-zA-Z0-9_-]{8,100}\.json$/.test(name))continue;
      const trashId=name.slice(0,-5),r=json(b.root,`.workbench/mutations/${name}`);
      if(r?.action!=='trash'||excluded(r,projection))continue;
      let issue=null,bytes;
      try {bytes=validateTrash(b,r,trashId);if(restored.has(trashId))issue='已恢复';else if(present(b.root,r.path))issue='原路径已有文件，恢复不会覆盖';}
      catch(error){issue=issueText(error);}
      const relativePath=typeof r.path==='string'?r.path:'';
      rows.push({trashId,documentId:docId(relativePath),title:relativePath?titleFor(relativePath,bytes):'无法识别原路径',relativePath,section:ordinarySection(relativePath),hash:HASH.test(r.beforeHash??'')?r.beforeHash:null,deletedAt:typeof r.deletedAt==='string'&&Number.isFinite(Date.parse(r.deletedAt))?r.deletedAt:null,restorable:issue===null,issue});
    }
    return rows.sort((a,b)=>(b.deletedAt??'').localeCompare(a.deletedAt??'')||a.trashId.localeCompare(b.trashId));
  });
}
/** Resolves all authority inside the same Vault mutation lock that commits bytes. */
export function restoreVaultDocument(runtimeRoot,input,options) {
  if(!input||Object.keys(input).some(k=>!['trashId','expectedHash'].includes(k))||!ID.test(input.trashId??'')||!HASH.test(input.expectedHash??''))fail('INVALID_INPUT','恢复资料仅接受回收记录与原文件校验值');
  const before=binding(runtimeRoot);
  const receipt=runMutation(runtimeRoot,{action:'restore-document',input,vaultId:before.vaultId,rootIdentity:before.rootIdentity},options,b=>{
    const current=binding(runtimeRoot);
    if(current.vaultId!==before.vaultId||!sameIdentity(current.rootIdentity,before.rootIdentity))fail('CONFLICT','知识库在恢复前已切换');
    const r=json(b.root,`.workbench/mutations/${input.trashId}.json`);
    if(excluded(r,contentProjection(b)))fail('INVALID_INPUT','此回收记录由内容或资产专属入口管理');
    const bytes=validateTrash(b,r,input.trashId);
    if(r.beforeHash!==input.expectedHash)fail('CONFLICT','回收记录已变化，请刷新后重试');
    if(committedRestores(b).has(input.trashId))fail('CONFLICT','此资料已恢复，请读取现有原件');
    if(present(b.root,r.path))fail('CONFLICT','恢复路径已有文件，拒绝覆盖');
    const ext=path.posix.extname(r.path).toLowerCase(),format=['.md','.markdown'].includes(ext)?'markdown':ext==='.json'?'json':ext==='.txt'?'text':'other';
    const document={id:docId(r.path),section:ordinarySection(r.path),title:titleFor(r.path,bytes),relativePath:r.path,hash:r.beforeHash,format,writable:['markdown','text','json'].includes(format),contentId:null,tNumber:null,bytes:bytes.length};
    return {action:'create',path:r.path,beforeHash:null,after:bytes.toString('base64'),result:{trashId:input.trashId,document,text:bytes.toString('utf8')}};
  });
  return receipt.result;
}
