import fs from 'node:fs';
import {rootPath,safe,readBytes,vaultState,runMutation,digest,json,scan} from '../vault/core.mjs';
import {parseCreationHtml,replaceCreationData,protocolError,kindOf} from './parse.mjs';
import {applyEditGroup,applyKitChanges} from './mutations.mjs';
import {itemFingerprint,norm} from './fingerprint.mjs';
export function sourcePath(source){if(!source||typeof source.relativePath!=='string')protocolError('SOURCE_RELATIVE_PATH_REQUIRED');return source.relativePath;}
export function boundRuntime(root,source){
 root=rootPath(root);const runtime=safe(root,'.workbench/runtime');const b=vaultState(runtime);
 if(b.root!==root||(source.vaultId&&source.vaultId!==b.vaultId))protocolError('SOURCE_BINDING_CONFLICT');
 sourcePath(source);return {root,runtime,b};
}
export function assertUniqueCreationPage(root,source,pageId){
 const descriptor=json(root,'.workbench/vault.json');
 const snapshot=scan(root,descriptor.vaultId);
 for(const entry of snapshot.documents){
  if(entry.format!=='html')continue;
  let doc;try{doc=parseCreationHtml(readBytes(root,entry.relativePath),{sourceId:source.sourceId,documentId:entry.id,relativePath:entry.relativePath});}catch{continue;}
  if(doc.pageId===pageId&&entry.relativePath!==source.relativePath)protocolError('DUPLICATE_PAGE_ID',pageId);
 }
}
export async function readCreationDocument(root,source){
 root=rootPath(root);const relative=sourcePath(source),bytes=readBytes(root,relative);
 if(source.vaultId){const {b}=boundRuntime(root,source);if(b.vaultId!==source.vaultId)protocolError('SOURCE_BINDING_CONFLICT');}
 const doc=parseCreationHtml(bytes,source);
 try{safe(root,'.workbench/vault.json');assertUniqueCreationPage(root,source,doc.pageId);}catch(error){if(error.code==='DUPLICATE_PAGE_ID'){doc.writable=false;doc.issues.push(error.message);}else if(error.code!=='ENOENT')throw error;}
 return doc;
}
export function resultFor(mutationId,bytes,changedFields,extra={}) {
 const revision=digest(bytes);return {revision,mutationId,receiptHash:digest(JSON.stringify({mutationId,revision,changedFields,...extra})),changedFields,...extra};
}
export async function transactCreation(root,request,mutationId,prepare) {
 const {runtime}=boundRuntime(root,request.source);
 const receipt=runMutation(runtime,{action:'creation-document',...request},{mutationId},b=>{
  try{const current=parseCreationHtml(readBytes(b.root,sourcePath(request.source)),request.source);assertUniqueCreationPage(b.root,request.source,current.pageId);}catch(error){if(error.code!=='ENOENT')throw error;}
  return prepare(b.root);
 });
 return receipt.result;
}
function historyFor(changes,origin){return changes.map(c=>({time:new Date().toISOString(),change_id:c.change_id,item:c.item_id,field:c.field,before:c.before,after:c.after,origin,...(c.group?{group:c.group}:{})}));}
export async function commitCreationEdit(root,group){
 return transactCreation(root,{operation:'fields',source:group.source,group},group.mutationId,r=>{
  const bytes=readBytes(r,sourcePath(group.source)),current=parseCreationHtml(bytes,group.source),next=applyEditGroup(current,group),out=replaceCreationData(bytes,next);
  return {action:'save',path:sourcePath(group.source),beforeHash:current.revision,after:Buffer.from(out).toString('base64'),creationPageId:current.pageId,creationBefore:bytes.toString('base64'),creationHistory:historyFor(group.edits.filter(e=>e.before!==e.after).map((e,i)=>({change_id:group.mutationId+'-'+i,item_id:e.itemId,field:e.field,before:e.before,after:e.after,group:group.mutationId})),group.actor.kind),result:resultFor(group.mutationId,out,group.edits.map(e=>e.itemId+':'+e.field))};
 });
}
export async function saveCreationChanges(root,input){
 return transactCreation(root,{operation:'kit',source:input.source,input},input.mutationId,r=>{
  const relative=sourcePath(input.source),bytes=readBytes(r,relative),current=parseCreationHtml(bytes,input.source);
  if(current.pageId!==input.pageId)protocolError('IDENTITY_CHANGED');
  if(input.token!==undefined&&current.raw.token!==input.token)protocolError('TOKEN_MISMATCH');
  const {doc,results}=applyKitChanges(current,input.changes,input.actor),out=replaceCreationData(bytes,doc);
  const written=input.changes.filter((c,i)=>results[i].reason==='written');
  return {action:'save',path:relative,beforeHash:current.revision,after:Buffer.from(out).toString('base64'),creationPageId:current.pageId,creationBefore:bytes.toString('base64'),creationHistory:historyFor(written,input.actor.kind),result:resultFor(input.mutationId,out,written.map(c=>c.item_id+':'+c.field),{results,base_fingerprint:current.revision,fingerprint:digest(out),path:relative})};
 });
}
/** Author UI entry point: trusted controller binds root/source and must not expose
 * this as an assistant command. A document token is compatibility identity only. */
export async function saveKitChanges(root,source,input){
 const {mutationId,page_id,token,changes}=input??{};
 if(typeof token!=='string')protocolError('TOKEN_REQUIRED');
 return saveCreationChanges(root,{source,pageId:page_id,token,changes,mutationId,actor:{kind:'author'}});
}
export async function replyToNote(root,input){
 if(input.actor?.kind!=='assistant'||!input.actor.taskId||!input.actor.requestId)protocolError('ASSISTANT_REQUEST_REQUIRED');
 return transactCreation(root,{operation:'reply',source:input.source,input},input.mutationId,r=>{
  const bytes=readBytes(r,sourcePath(input.source)),current=parseCreationHtml(bytes,input.source);
  if(!current.writable)protocolError('READ_ONLY');
  const item=current.items.find(it=>it.id===input.itemId),field=kindOf(item)==='info'?'overall_note':'note';
  if(typeof input.handledNote!=='string'||typeof input.reply!=='string'||!item||itemFingerprint(item)!==input.expectedFingerprint||!input.handledNote.trim()||norm(item.fields[field])!==norm(input.handledNote))protocolError('CONFLICT_NOTE');
  const next=structuredClone(current);next.items=next.raw.items;const target=next.items.find(it=>it.id===input.itemId);
  target.locked.ai_state={...(target.locked.ai_state??{}),handled_note:input.handledNote,reply:input.reply,replied_at:new Date().toISOString()};
  const out=replaceCreationData(bytes,next);
  return {action:'save',path:sourcePath(input.source),beforeHash:current.revision,after:Buffer.from(out).toString('base64'),creationPageId:current.pageId,creationBefore:bytes.toString('base64'),result:resultFor(input.mutationId,out,[input.itemId+':ai_state'])};
 });
}
export async function readHistory(root,source,itemId){
 root=rootPath(root);const doc=await readCreationDocument(root,source),records=[];
 const old='.jc-changes/'+doc.pageId+'.jsonl';
 try{for(const line of readBytes(root,old).toString('utf8').split('\n')){try{const rec=JSON.parse(line);if(rec&&typeof rec==='object')records.push(rec);}catch{/* source skips interrupted JSONL lines */}}}catch(e){if(e.code!=='ENOENT')throw e;}
 try{for(const name of fs.readdirSync(safe(root,'.workbench/mutations'))){
  if(!/^[A-Za-z0-9_-]{8,100}\.json$/.test(name))continue;
  const r=json(root,'.workbench/mutations/'+name);
  if(r.format!=='nova-vault-mutation'||r.status!=='committed'||r.request?.action!=='creation-document'||r.request?.source?.relativePath!==source.relativePath||r.creationPageId!==doc.pageId)continue;
  if(digest(JSON.stringify(r.request))!==r.requestHash)protocolError('CORRUPT_CREATION_HISTORY');
  records.push(...(r.creationHistory??[]));
 }}catch(e){if(e.code!=='ENOENT')throw e;}
 const seen=new Set();const changes=records.filter(rec=>{if(itemId&&rec.item!==itemId)return false;if(seen.has(rec.change_id))return false;seen.add(rec.change_id);return true;}).sort((a,b)=>(Date.parse(a.time)||0)-(Date.parse(b.time)||0));
 return {changes};
}
