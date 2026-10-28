import fs from 'node:fs';
import path from 'node:path';
import {contentSources,digest,fail,identity,isManagedAuthorPlanningPath,json,readBytes,recoverVault,runMutation,safe,scan,vaultState,withVaultReadLock} from './core.mjs';

const HASH=/^[a-f0-9]{64}$/,MID=/^[a-zA-Z0-9_-]{8,100}$/;
const STATUSES=new Set(['todo','paused','written']);
const FILE='作者安排.json',LIMIT=8*1024*1024;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const sameIdentity=(a,b)=>a?.dev===b?.dev&&a?.ino===b?.ino;
const managed=isManagedAuthorPlanningPath;
function exists(root,relative){try{safe(root,relative);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}}
function bound(runtimeRoot){
 const b=vaultState(runtimeRoot),descriptor=json(b.root,'.workbench/vault.json');
 if(descriptor.format!=='nova-knowledge-vault'||descriptor.vaultId!==b.vaultId||!sameIdentity(descriptor.rootIdentity,b.rootIdentity)||!sameIdentity(identity(b.root),b.rootIdentity))fail('CONFLICT','知识库目录身份已变化，不能修改作者安排');
 return b;
}
function pins(value){
 if(!Array.isArray(value)||value.length<1||value.length>256||value.some(p=>!p||Object.keys(p).some(k=>!['documentId','relativePath','hash'].includes(k))||!/^doc-[a-f0-9]{32}$/.test(p.documentId??'')||typeof p.relativePath!=='string'||!HASH.test(p.hash??'')))fail('INVALID_INPUT','作者安排来源版本无效');
 const ordered=value.map(p=>({documentId:p.documentId,relativePath:p.relativePath,hash:p.hash})).sort((a,b)=>a.relativePath.localeCompare(b.relativePath)||a.documentId.localeCompare(b.documentId));
 if(new Set(ordered.map(p=>p.relativePath)).size!==ordered.length||new Set(ordered.map(p=>p.documentId)).size!==ordered.length)fail('INVALID_INPUT','作者安排来源版本重复');
 return ordered;
}
function managedPath(relative,tNumber){return typeof relative==='string'&&new RegExp('^05_内容草稿/(?:已做/)?'+tNumber+'_[^/]+/作者安排\\.json$').test(relative)&&!relative.includes('\\')&&!relative.includes('\0');}
function existingRecords(b,tNumber){
 const found=[];
 for(const parent of ['05_内容草稿','05_内容草稿/已做']){
  if(!exists(b.root,parent))continue;
  for(const entry of fs.readdirSync(safe(b.root,parent),{withFileTypes:true})){
   if(!entry.name.startsWith(tNumber+'_'))continue;
   const directory=parent+'/'+entry.name;
   safe(b.root,directory);
   if(!entry.isDirectory())continue;
   const relative=directory+'/'+FILE;if(exists(b.root,relative))found.push(relative);
  }
 }
 if(found.length>1)fail('CONFLICT','同一 T 编号存在多份作者安排，请核对来源');
 return found[0]??null;
}
function overviewPaused(b,documents,tNumber){
 const overview=documents.find(d=>d.relativePath==='04_选题库/00_选题总览.md');if(!overview)return false;
 let section='';
 for(const line of readBytes(b.root,overview.relativePath).toString('utf8').split(/\r?\n/)){
  if(/^##\s/.test(line))section=line.replace(/^##\s+/,'');
  if(section==='顺延事项'&&line.startsWith('|')&&new RegExp('(?:^|[^A-Za-z0-9])'+tNumber+'(?!\\d)').test(line))return true;
 }
 return false;
}
function context(runtimeRoot,contentId,b,shared){
 if(typeof contentId!=='string'||!contentId||contentId.length>200)fail('INVALID_INPUT','作者安排内容身份无效');
 const snapshot=shared?.snapshot??{root:b.root,vaultId:b.vaultId,...scan(b.root,b.vaultId)};
 if(!shared)snapshot.documents=snapshot.documents.filter(d=>!managed(d.relativePath));
 const source=shared?shared.sources.get(contentId):contentSources(snapshot).find(s=>s.contentId===contentId);
 if(!source||!/^T\d{3,}$/.test(source.tNumber??''))fail('INVALID_INPUT','未找到明确的 T 内容来源');
 if(source.sourceResolution!=='resolved'||source.sourceMissing||source.document.sourceConflict)fail('CONFLICT',source.document.sourceConflict??'原件缺失或来源冲突，不能修改作者安排');
 if(new Set(source.documents.map(d=>d.tNumber).filter(Boolean)).size!==1)fail('CONFLICT','内容存在多个 T 身份，不能修改作者安排');
 if(new Set(source.topicStatus.evidence.map(e=>e.status)).size>1)fail('CONFLICT','原选题状态存在多个不同依据，请先核对来源');
 if(shared?shared.projection!==null:exists(b.root,'.workbench/projection.json')){
  const projection=shared?shared.projection:json(b.root,'.workbench/projection.json');
  if(!projection||!projection.contents||typeof projection.contents!=='object'||Array.isArray(projection.contents))fail('CORRUPT','内容来源映射损坏');
  const saved=projection.contents[contentId];
  if(saved?.trashMutationId)fail('CONFLICT','内容已回收，不能修改作者安排');
  if(saved?.relativePath&&!snapshot.documents.some(d=>d.relativePath===saved.relativePath))fail('CONFLICT','登记原件已缺失，不能修改作者安排');
 }
 const relevant=shared?[...(shared.byContent.get(contentId)??[]),...shared.overviews]:snapshot.documents.filter(d=>!d.managedFinalAsset&&(d.contentId===contentId||['04_选题库/00_选题总览.md','05_内容草稿/00_草稿总览.md'].includes(d.relativePath)));
 const sourcePins=pins(relevant.map(d=>{
  if(shared)shared.verifiedBytes(d);else if(digest(readBytes(b.root,d.relativePath))!==d.hash)fail('CONFLICT','原件在读取作者安排时变化，请重试');
  return {documentId:d.id,relativePath:d.relativePath,hash:d.hash};
 }));
 const relatedIssue=snapshot.issues.find(issue=>issue.relativePath&&(new RegExp('(?:^|/)'+source.tNumber+'(?=[_ /.-]|$)').test(issue.relativePath)||['04_选题库/00_选题总览.md','05_内容草稿/00_草稿总览.md'].includes(issue.relativePath))&&!managed(issue.relativePath)&&!['HTML_READ_ONLY'].includes(issue.code));
 if(relatedIssue)fail('CONFLICT','作者安排依据未完整读到：'+relatedIssue.message);
 const hasDraft=source.sourceCandidates.some(s=>['creation-page','working-draft','final-script','legacy-compare'].includes(s.role))||source.documents.some(d=>d.section==='drafts'&&/(?:参考拆解|叙事|视频框架)[^/]*\.md$/.test(d.relativePath));
 const facts={hasDraft,recorded:!!source.recorded,published:!!source.published,paused:!!source.topicStatus.paused||(shared?shared.paused.has(source.tNumber):overviewPaused(b,snapshot.documents,source.tNumber))};
 const derivedStatus=facts.published?'written':facts.paused?'paused':facts.recorded||facts.hasDraft?'written':'todo';
 const relativePath=(shared?shared.recordPath(source.tNumber):existingRecords(b,source.tNumber))??source.contentDirectory+'/'+FILE;
 if(!managedPath(relativePath,source.tNumber))fail('CONFLICT','作者安排目标不属于明确的 T 内容目录');
 safe(b.root,relativePath,true);
 return {contentId,tNumber:source.tNumber,relativePath,sourcePins,facts,derivedStatus,sourceStatus:source.topicStatus.status};
}
function parseRecord(bytes,b,c){
 let record;
 try{record=JSON.parse(bytes.toString('utf8'));}catch{fail('CORRUPT','作者安排记录无法读取，保留来源原状态');}
 if(record?.format!=='nova-author-planning'||record.schemaVersion!==1||record.work?.vaultId!==b.vaultId||record.work.workId!==c.tNumber||record.contentId!==c.contentId||!sameIdentity(record.rootIdentity,b.rootIdentity)||!(record.status===null||STATUSES.has(record.status))||typeof record.reason!=='string'||!MID.test(record.mutationId??'')||!Array.isArray(record.history)||!record.history.length||record.version!==record.history.length||!Number.isFinite(Date.parse(record.updatedAt)))fail('CORRUPT','作者安排记录身份或版本无效');
 if(!same(pins(record.sourcePins),record.sourcePins))fail('CORRUPT','作者安排来源版本排序或字段无效');
 for(const decision of record.history){
  if(!decision||!(decision.status===null||STATUSES.has(decision.status))||typeof decision.reason!=='string'||decision.reason.length>2000||!MID.test(decision.mutationId??'')||!Number.isFinite(Date.parse(decision.at))||!same(pins(decision.sourcePins),decision.sourcePins))fail('CORRUPT','作者安排历史决定无效');
 }
 if(new Set(record.history.map(d=>d.mutationId)).size!==record.history.length)fail('CORRUPT','作者安排历史事务重复');
 const last=record.history.at(-1);
 if(!last||last.status!==record.status||last.reason!==record.reason||last.mutationId!==record.mutationId||last.at!==record.updatedAt||!same(last.sourcePins,record.sourcePins))fail('CORRUPT','作者安排决定与历史不一致');
 return record;
}
/** Recovery validates its frozen plan, then a normal read reports changed live evidence as stale. */
export function validateAuthorPlanningReceipt(root,receipt){
 const descriptor=json(root,'.workbench/vault.json'),b={root,vaultId:descriptor.vaultId,rootIdentity:descriptor.rootIdentity};
 if(descriptor.format!=='nova-knowledge-vault'||!sameIdentity(identity(root),b.rootIdentity))fail('CONFLICT','作者安排事务的知识库目录身份已变化');
 const request=receipt?.request,input=request?.input;
 if(receipt?.format!=='nova-vault-mutation'||!MID.test(receipt.mutationId??'')||!['pending','committed'].includes(receipt.status)||!['create','save'].includes(receipt.action)||request?.action!=='author-planning'||request.vaultId!==b.vaultId||!sameIdentity(request.rootIdentity,b.rootIdentity)||!HASH.test(receipt.requestHash??'')||digest(JSON.stringify(request))!==receipt.requestHash||!input||Object.keys(input).length!==5||Object.keys(input).some(k=>!['contentId','status','reason','expectedRevision','sourcePins'].includes(k))||typeof input.contentId!=='string'||!(input.status===null||STATUSES.has(input.status))||typeof input.reason!=='string'||input.reason.length>2000||!(input.expectedRevision===null||HASH.test(input.expectedRevision??''))||receipt.beforeHash!==input.expectedRevision||receipt.action!==(input.expectedRevision===null?'create':'save')||typeof receipt.after!=='string'||receipt.after.length>Math.ceil(LIMIT/3)*4)fail('CORRUPT','作者安排事务请求、身份或版本校验失败');
 const bytes=Buffer.from(receipt.after,'base64');if(bytes.length>LIMIT||bytes.toString('base64')!==receipt.after)fail('CORRUPT','作者安排事务正文编码无效');
 const tNumber=receipt.path?.match(/^05_内容草稿\/(?:已做\/)?(T\d{3,})_[^/]+\/作者安排\.json$/)?.[1];
 if(!tNumber||!managedPath(receipt.path,tNumber))fail('CORRUPT','作者安排事务不属于同 T 的受管记录');
 const record=parseRecord(bytes,b,{contentId:input.contentId,tNumber});
 if(record.mutationId!==receipt.mutationId||record.status!==input.status||record.reason!==input.reason||!same(record.sourcePins,pins(input.sourcePins))||receipt.action==='create'&&record.history.length!==1||receipt.action==='save'&&record.history.length<2)fail('CORRUPT','作者安排事务正文与固定请求不一致');
 const result=receipt.result;
 if(!result||result.contentId!==record.contentId||!same(result.work,record.work)||result.relativePath!==receipt.path||result.revision!==digest(bytes)||result.status!==record.status||result.reason!==record.reason||!same(result.sourcePins,record.sourcePins)||!same(result.history,record.history))fail('CORRUPT','作者安排事务结果与受管记录不一致');
 return record;
}
function priorRecord(b,c,shared){
 if(shared)return shared.priorRecord(c.contentId);
 for(const name of fs.readdirSync(safe(b.root,'.workbench/mutations'))){
  if(!/^[a-zA-Z0-9_-]{8,100}\.json$/.test(name))continue;
  const receipt=json(b.root,`.workbench/mutations/${name}`);
  if(receipt?.request?.action!=='author-planning'||receipt.request.input?.contentId!==c.contentId)continue;
  validateAuthorPlanningReceipt(b.root,receipt);
  if(receipt.status==='committed')return true;
 }
 return false;
}
function loadRecord(b,c,shared){
 if(!exists(b.root,c.relativePath)){
  if(priorRecord(b,c,shared))fail('CONFLICT','已提交的作者安排原记录缺失，请先核验恢复；未清除作者决定');
  return {record:null,revision:null};
 }
 const bytes=shared?shared.bytes(c.relativePath):readBytes(b.root,c.relativePath),revision=digest(bytes),record=parseRecord(bytes,b,c),receipt=shared?shared.receipt(record.mutationId):json(b.root,`.workbench/mutations/${record.mutationId}.json`);
 if(shared)shared.validateReceipt(record.mutationId);else validateAuthorPlanningReceipt(b.root,receipt);
 if(receipt.status!=='committed'||receipt.path!==c.relativePath||(shared?receipt.afterHash:digest(Buffer.from(receipt.after,'base64')))!==revision)fail('CORRUPT','作者安排缺少对应的已提交事务，请保留原文件并核验');
 return {record,revision};
}
function view(b,c,record,revision){
 const stale=!!record&&!same(record.sourcePins,c.sourcePins),status=record?.status??null;
 return {contentId:c.contentId,work:{vaultId:b.vaultId,workId:c.tNumber},relativePath:c.relativePath,revision,status,reason:record?.reason??'',sourcePins:c.sourcePins,decisionSourcePins:record?.sourcePins??null,stale,derivedStatus:c.derivedStatus,effectiveStatus:status===null||stale?c.derivedStatus:status,sourceStatus:c.sourceStatus,facts:c.facts,updatedAt:record?.updatedAt??null,history:record?.history??[],notice:stale?'来源已变化，待核对':status==='written'&&!c.facts.hasDraft?'本人标记已写；尚未找到稿件':''};
}
const OVERVIEWS=new Set(['04_选题库/00_选题总览.md','05_内容草稿/00_草稿总览.md']);
/** Read-call-local caches only. They never escape this lock or enter mutation admission. */
function batchContext(b){
 const snapshot={root:b.root,vaultId:b.vaultId,...scan(b.root,b.vaultId)};
 snapshot.documents=snapshot.documents.filter(document=>!managed(document.relativePath));
 const sources=new Map(contentSources(snapshot).map(({body,...source})=>[source.contentId,source]));
 const projection=exists(b.root,'.workbench/projection.json')?json(b.root,'.workbench/projection.json'):null;
 if(projection!==null&&(!projection||!projection.contents||typeof projection.contents!=='object'||Array.isArray(projection.contents)))fail('CORRUPT','内容来源映射损坏');
 const byContent=new Map(),overviews=[],byteCache=new Map(),verified=new Set();
 function bytes(relative){
  if(!byteCache.has(relative)){try{byteCache.set(relative,{value:readBytes(b.root,relative)});}catch(error){byteCache.set(relative,{error});}}
  const result=byteCache.get(relative);if(result.error)throw result.error;return result.value;
 }
 function verifiedBytes(document){const key=document.relativePath+':'+document.hash;if(verified.has(key))return null;const value=readBytes(b.root,document.relativePath);if(digest(value)!==document.hash)fail('CONFLICT','原件在读取作者安排时变化，请重试');verified.add(key);return value;}
 for(const document of snapshot.documents){
  if(document.managedFinalAsset)continue;
  if(OVERVIEWS.has(document.relativePath)){overviews.push(document);continue;}
  if(document.contentId){const docs=byContent.get(document.contentId)??[];docs.push(document);byContent.set(document.contentId,docs);}
 }
 // Parse the author-overview pause section once; each actual pin is still checked.
 const paused=new Set(),overview=overviews.find(document=>document.relativePath==='04_选题库/00_选题总览.md');let overviewIssue=null;
 if(overview)try{let section='';for(const line of verifiedBytes(overview).toString('utf8').split(/\r?\n/)){
  if(/^##\s/.test(line))section=line.replace(/^##\s+/,'');
  if(section==='顺延事项'&&line.startsWith('|'))for(const match of line.matchAll(/(?:^|[^A-Za-z0-9])(T\d{3,})(?!\d)/g))paused.add(match[1]);
 }}catch(error){overviewIssue=error;}
 const recordPaths=new Map(),recordIssues=new Map();
 for(const parent of ['05_内容草稿','05_内容草稿/已做']){
  if(!exists(b.root,parent))continue;
  for(const entry of fs.readdirSync(safe(b.root,parent),{withFileTypes:true})){
   const tNumber=entry.name.match(/^(T\d{3,})_/)?.[1];if(!tNumber)continue;
   try{const directory=parent+'/'+entry.name;safe(b.root,directory);if(!entry.isDirectory())continue;const relative=directory+'/'+FILE;if(exists(b.root,relative)){const paths=recordPaths.get(tNumber)??[];paths.push(relative);recordPaths.set(tNumber,paths);}}
   catch(error){recordIssues.set(tNumber,error);}
  }
 }
 function recordPath(tNumber){
  if(recordIssues.has(tNumber))throw recordIssues.get(tNumber);
  const paths=recordPaths.get(tNumber)??[];if(paths.length>1)fail('CONFLICT','同一 T 编号存在多份作者安排，请核对来源');return paths[0]??null;
 }
 const receipts=new Map(),priorByContent=new Map(),committedIds=new Set();let firstReadFailure=null,receiptOrder=0;
 function receipt(mid){
  if(!receipts.has(mid)){try{receipts.set(mid,{value:json(b.root,`.workbench/mutations/${mid}.json`)});}catch(error){receipts.set(mid,{error});}}
  const result=receipts.get(mid);if(result.error)throw result.error;return result.value;
 }
 function validateReceipt(mid){
  const value=receipt(mid),result=receipts.get(mid);
  if(!result.validation){try{result.validation={value:{contentId:validateAuthorPlanningReceipt(b.root,value).contentId}};}catch(error){result.validation={error};}}
  if(result.validation.error)throw result.validation.error;return result.validation.value;
 }
 for(const name of fs.readdirSync(safe(b.root,'.workbench/mutations'))){
  if(!/^[a-zA-Z0-9_-]{8,100}\.json$/.test(name))continue;
  const mid=name.slice(0,-5),order=receiptOrder++;let r;
  try{r=receipt(mid);}catch(error){firstReadFailure??={order,error};continue;}
  if(r?.request?.action!=='author-planning'||typeof r.request.input?.contentId!=='string'){receipts.get(mid).value={status:r?.status};continue;}
  const contentId=r.request.input.contentId,prior=priorByContent.get(contentId)??[];prior.push({mid,order});priorByContent.set(contentId,prior);
  let validated=false;try{const proof=validateReceipt(mid);validated=true;if(r.status==='committed')committedIds.add(proof.contentId);}catch{/* Only this content's referenced/missing-record read surfaces the cached validation failure. */}
  // Keep a small receipt proof, not every historical base64 body and full decision history.
  receipts.get(mid).value={status:r.status,path:r.path,afterHash:validated?digest(Buffer.from(r.after,'base64')):null};
 }
 function priorRecord(contentId){
  for(const {mid,order} of priorByContent.get(contentId)??[]){
   if(firstReadFailure&&firstReadFailure.order<order)throw firstReadFailure.error;
   const r=receipt(mid);validateReceipt(mid);if(r.status==='committed')return true;
  }
  if(firstReadFailure)throw firstReadFailure.error;return false;
 }
 return {snapshot,sources,projection,byContent,overviews,paused,overviewIssue,recordPath,bytes,verifiedBytes,receipt,validateReceipt,priorRecord,committedIds};
}
/** One directory read uses one source decomposition, one historical index and
 * cached current-byte checks. A row failure is explicit, never a todo default. */
export function readAuthorPlanningStatuses(runtimeRoot){
 const b=bound(runtimeRoot);
 return withVaultReadLock(b.root,()=>{
  bound(runtimeRoot);recoverVault(b.root);const shared=batchContext(b);
  const ids=new Set([...shared.sources.keys(),...Object.keys(shared.projection?.contents??{}),...shared.committedIds]);
  const entries=[];
  for(const contentId of ids){
   try{
    if(shared.overviewIssue)throw shared.overviewIssue;
    const c=context(runtimeRoot,contentId,b,shared),{record,revision}=loadRecord(b,c,shared);
    entries.push({contentId,value:view(b,c,record,revision),issue:null});
   }catch(error){entries.push({contentId,value:null,issue:error instanceof Error?error.message:'作者安排暂不可读取，请先核验来源。'});}
  }
  bound(runtimeRoot);return {entries};
 });
}
/** Reads fail closed: unreadable original evidence is never inferred as todo. */
export function readAuthorPlanningStatus(runtimeRoot,contentId){
 const b=bound(runtimeRoot);
 return withVaultReadLock(b.root,()=>{bound(runtimeRoot);recoverVault(b.root);const c=context(runtimeRoot,contentId,b),{record,revision}=loadRecord(b,c);return view(b,c,record,revision);});
}
/** The renderer supplies a content identity and CAS, never a path or T directory. */
export function setAuthorPlanningStatus(runtimeRoot,input,options){
 if(!input||Object.keys(input).length!==5||Object.keys(input).some(k=>!['contentId','status','reason','expectedRevision','sourcePins'].includes(k))||typeof input.contentId!=='string'||!(input.status===null||STATUSES.has(input.status))||typeof input.reason!=='string'||input.reason.length>2000||!(input.expectedRevision===null||HASH.test(input.expectedRevision??'')))fail('INVALID_INPUT','作者安排参数无效');
 const expectedPins=pins(input.sourcePins),before=bound(runtimeRoot);
 return runMutation(runtimeRoot,{action:'author-planning',input,vaultId:before.vaultId,rootIdentity:before.rootIdentity},options,b=>{
  const current=bound(runtimeRoot);if(current.vaultId!==before.vaultId||!sameIdentity(current.rootIdentity,before.rootIdentity))fail('CONFLICT','知识库在修改作者安排前已切换');
  const c=context(runtimeRoot,input.contentId,b),previous=loadRecord(b,c);
  if(previous.revision!==input.expectedRevision)fail('CONFLICT','作者安排已被其他操作修改，请读取最新版本');
  if(!same(c.sourcePins,expectedPins))fail('CONFLICT','来源已变化，请核对当前原件后重新确认作者安排');
  const at=new Date().toISOString(),decision={status:input.status,reason:input.reason,sourcePins:c.sourcePins,at,mutationId:options.mutationId},history=[...(previous.record?.history??[]),decision];
  const record={format:'nova-author-planning',schemaVersion:1,work:{vaultId:b.vaultId,workId:c.tNumber},contentId:c.contentId,rootIdentity:b.rootIdentity,status:input.status,reason:input.reason,sourcePins:c.sourcePins,updatedAt:at,mutationId:options.mutationId,version:history.length,history};
  const bytes=Buffer.from(JSON.stringify(record,null,2)+'\n');if(bytes.length>LIMIT)fail('INVALID_INPUT','作者安排历史超过安全大小，请保留原记录后处理');
  return {action:previous.record?'save':'create',path:c.relativePath,beforeHash:previous.revision,after:bytes.toString('base64'),result:view(b,c,record,digest(bytes))};
 }).result;
}
