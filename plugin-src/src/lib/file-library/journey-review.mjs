import fs from 'node:fs';
import path from 'node:path';
import {LibraryError} from './index.mjs';
import {readBytes,digest} from '../vault/core.mjs';
import {vaultRootForRuntime} from '../vault/index.mjs';
import {parseCreationHtml,orderedSegments} from '../creation-document/parse.mjs';
const fail=()=>{throw new LibraryError('REVIEW_REQUIRED','请在当前原创作页完成逐句建议的作者决定，或明确确认本版无需修改。');};
const decisions=new Set(['采纳','不采纳','部分采纳']);
export function journeyReviewRecord(runtimeRoot,root,child,production,source,input){
 if(!input||Object.keys(input).sort().join(',')!=='expectedRevision,mode,summary'||input.expectedRevision!==source.hash||!['suggestions','no-changes'].includes(input.mode)||typeof input.summary!=='string'||!input.summary.trim()||input.summary.length>20000)fail();
 const vaultRoot=vaultRootForRuntime(runtimeRoot),doc=parseCreationHtml(readBytes(vaultRoot,source.relativePath),{sourceId:'drafts',documentId:source.documentId,relativePath:source.relativePath,writable:true});if(doc.revision!==source.hash||doc.raw.content_id!==root.request.parameters.work.workId)fail();
 const suggestions=doc.items.filter(i=>i.kind==='suggestion');if(suggestions.some(i=>!decisions.has(i.fields.decision)))fail();
 let reviewReceipt=null;
 if(input.mode==='suggestions'){
  const index=root.journeyState.members.find(m=>m.taskId===child.id)?.planIndex,names=fs.readdirSync(path.join(vaultRoot,'.workbench/mutations'));if(names.length>20000)fail();
  for(const name of names){if(!/^[A-Za-z0-9_-]{8,100}\.json$/.test(name))continue;const receipt=JSON.parse(readBytes(vaultRoot,'.workbench/mutations/'+name)),r=receipt.request,e=r?.execution,member=root.journeyState.members.find(m=>m.taskId===e?.taskId&&m.planIndex===index),task=production.tasks.find(t=>t.id===member?.taskId);if(receipt.status!=='committed'||r?.action!=='creation-document'||!['build','regenerate'].includes(r.operation)||!/^[a-f0-9]{64}$/.test(r.input?.reviewRequestHash??'')||!member||task.request.parameters.stage!=='review-page'||task.requestHash!==e.requestHash||!task.attempts.some(a=>a.id===e.attemptId)||r.source?.relativePath!==source.relativePath||receipt.path!==source.relativePath||receipt.requestHash!==digest(JSON.stringify(r))||typeof receipt.after!=='string')continue;
   const after=Buffer.from(receipt.after,'base64');if(digest(after)!==receipt.result?.revision)continue;const reviewed=parseCreationHtml(after,doc.source),reviewSuggestions=reviewed.items.filter(i=>i.kind==='suggestion'&&i.locked.reviewVerdict);if(!reviewSuggestions.length||reviewSuggestions.some(i=>!suggestions.some(actual=>actual.id===i.id&&actual.locked.original===i.locked.original&&actual.fields.proposed===i.fields.proposed)))continue;
   if(orderedSegments(reviewed).map(i=>i.fields.mine).join('\n\n')!==orderedSegments(doc).map(i=>i.fields.mine).join('\n\n'))continue;
   reviewReceipt={mutationId:name.slice(0,-5),requestHash:receipt.requestHash,taskId:task.id,attemptId:e.attemptId,revision:receipt.result.revision};break;
  }
  if(!reviewReceipt)fail();
 }
 return {version:1,mode:input.mode,source:structuredClone(source),work:{vaultId:root.request.parameters.work.vaultId,workId:root.request.parameters.work.workId},fullOriginal:orderedSegments(doc).map(i=>i.fields.mine).join('\n\n'),summary:input.summary,suggestions:suggestions.map(i=>({id:i.id,original:i.locked.original,proposed:i.fields.proposed,decision:i.fields.decision})),reviewReceipt};
}
export function validateJourneyReview(runtimeRoot,root,child,production,data,{sourceCurrent}={}){
 if(!data||data.version!==1||data.work?.vaultId!==root.request.parameters.work.vaultId||data.work?.workId!==root.request.parameters.work.workId||typeof data.fullOriginal!=='string'||!data.fullOriginal||!data.source||!['suggestions','no-changes'].includes(data.mode))fail();
 const vaultRoot=vaultRootForRuntime(runtimeRoot),actualHash=digest(readBytes(vaultRoot,data.source.relativePath));if(actualHash!==data.source.hash&&!sourceCurrent?.(data.source,actualHash))fail();
 const current={...data.source,hash:actualHash},record=journeyReviewRecord(runtimeRoot,root,child,production,current,{expectedRevision:actualHash,mode:data.mode,summary:data.summary});
 if(record.fullOriginal!==data.fullOriginal||JSON.stringify(record.suggestions)!==JSON.stringify(data.suggestions)||JSON.stringify(record.reviewReceipt)!==JSON.stringify(data.reviewReceipt))fail();return true;
}
