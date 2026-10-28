import path from 'node:path';
import {atomic,digest,fail,identity,json,mkdir,readBytes,safe,writeJSON} from '../vault/core.mjs';
export function optional(root,relative){try{return readBytes(root,relative);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
export function planned(root,relative,value){const before=optional(root,relative),after=Buffer.isBuffer(value)?value:Buffer.from(typeof value==='string'?value:JSON.stringify(value,null,2)+'\n');return {relativePath:relative,beforeHash:before===null?null:digest(before),after:after.toString('base64')};}
/** Recoverable write-ahead intent. Each target is CAS checked before ANY target changes.
 * Recovery accepts only before or exact planned after bytes; unrelated edits never get overwritten. */
function applyPublicationReceiptWrites(root,r){
 if(r.format!=='nova-vault-mutation'||r.action!=='publication-runtime'||!['pending','committed'].includes(r.status)||!/^[A-Za-z0-9_-]{8,100}$/.test(r.mutationId??'')||digest(JSON.stringify(r.request))!==r.requestHash||!Array.isArray(r.writes)||!r.writes.length||r.writes.length>30)fail('CORRUPT','发布事务损坏');
 // A recovered sink intent keeps its original destination identity. A source-map grant
 // or recreated directory must never redirect a frozen payload during recovery.
 if(r.request?.input?.operation==='sync-publication-knowledge'){
  const target=r.request.input.target;
  try{
   const source=json(root,'.workbench/source-map.json').sources?.find(s=>s.id==='author-evidence');
   if(!target||source?.id!==target.sourceId||source.role!=='author-evidence'||source.mode!=='internal'||source.authority!=='official'||source.writable!==true||source.root!==target.sourceRoot)fail('CONFLICT','沉淀事务的固定目标已变化');
   const current=identity(safe(root,target.sourceRoot));
   if(current.dev!==target.sourceIdentity?.dev||current.ino!==target.sourceIdentity?.ino)fail('CONFLICT','沉淀事务的目标根身份已变化');
  }catch(error){fail('CONFLICT','沉淀事务保留待恢复记录，未写入已变化或不可用的目标：'+error.message);}
 }
 const seen=new Set();const writes=r.writes.map(w=>{if(!w||seen.has(w.relativePath)||typeof w.after!=='string'||w.after.length>12000000||!(w.beforeHash===null||/^[a-f0-9]{64}$/.test(w.beforeHash)))fail('CORRUPT','发布事务目标无效');seen.add(w.relativePath);safe(root,w.relativePath,true);const bytes=Buffer.from(w.after,'base64');if(bytes.toString('base64')!==w.after||bytes.length>8*1024*1024)fail('CORRUPT','发布事务正文无效');const current=optional(root,w.relativePath),hash=current===null?null:digest(current),afterHash=digest(bytes);if(hash!==w.beforeHash&&hash!==afterHash)fail('CONFLICT','发布事务遇到外部修改；保留原文件和待恢复记录：'+w.relativePath);return {...w,bytes,hash,afterHash};});
 for(const w of writes)if(w.hash!==w.afterHash){mkdir(root,path.posix.dirname(w.relativePath));atomic(root,w.relativePath,w.bytes,w.beforeHash);}
 r.status='committed';writeJSON(root,'.workbench/mutations/'+r.mutationId+'.json',r);return r.result;
}

/** Sink failures remain recoverable issues; a broken text copy must not hide a committed publication. */
export function applyPublicationReceipt(root,r){
 try{return applyPublicationReceiptWrites(root,r);}
 catch(error){
  if(r.request?.input?.operation==='sync-publication-knowledge'&&error.code!=='CORRUPT')fail('CONFLICT','沉淀事务未完成，保留正式档案与待恢复记录（'+(error.code??'IO_ERROR')+'）：'+error.message);
  throw error;
 }
}
