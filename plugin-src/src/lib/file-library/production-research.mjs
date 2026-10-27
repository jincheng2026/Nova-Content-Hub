import {serializeProductionReference} from './production-reference.mjs';
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);

/** Only receipt-backed, manually accepted evidence is available for reuse. */
export function researchReferenceCatalog(snapshot) {
 const entries=[];
 for(const task of snapshot.tasks??[]) {
  if(!['research','analysis'].includes(task.kind)||task.request.parameters?.workflow==='viral-radar')continue;
  const attempt=task.attempts.find(item=>item.id===task.activeAttemptId),receipt=attempt?.receipt;
  if(attempt?.status!=='accepted'||receipt?.taskId!==task.id||receipt.attemptId!==attempt.id||receipt.requestHash!==task.requestHash)continue;
  for(const artifact of attempt.result?.artifacts??[]) {
   if(!['research','transcript','report'].includes(artifact.kind))continue;
   const incoming=record(artifact.data)&&Array.isArray(artifact.data.references)?artifact.data.references:artifact.kind==='report'&&artifact.text.trim()?[{id:artifact.id,url:null,title:artifact.title+'（报告摘要）',platform:'调研报告',originalText:artifact.text,correctedText:'',segments:[],corrections:[],analysis:'报告全文与原始证据保留在来源任务归档；此项仅为已提交的文字摘要。',mediaAssetHash:null,subtitleAssetHash:null}]:[];
   const references=[];let valid=true;
   for(const reference of incoming){try{serializeProductionReference(reference);references.push(reference);}catch{valid=false;break;}}
   if(valid&&references.length&&new Set(references.map(item=>item.id)).size===references.length)entries.push({taskId:task.id,attemptId:attempt.id,receiptHash:receipt.sha256,artifactId:artifact.id,title:task.title,summary:artifact.text,references:structuredClone(references)});
  }
 }
 return entries;
}

export function prepareResearchAdoption({snapshot,taskId,attemptId,receiptHash,artifactId,creation,bodyHash,now}) {
 const source=researchReferenceCatalog(snapshot).find(item=>item.taskId===taskId&&item.attemptId===attemptId&&item.receiptHash===receiptHash&&item.artifactId===artifactId);
 if(!source)fail('STALE_INPUT','调研来源未验收或回执已变化，请重新核对。');
 const references=structuredClone(creation.references);
 for(const incoming of source.references){
  const sameId=references.find(item=>item.id===incoming.id);
  if(sameId){if(serializeProductionReference(sameId)!==serializeProductionReference(incoming))fail('CONFLICT','本篇已有同编号的不同参考版本，请保留原版本并先核对差异。');continue;}
  // A locally corrected copy wins over an older research snapshot of the same URL.
  if(incoming.url&&references.some(item=>item.url===incoming.url))continue;
  references.push(incoming);
 }
 if(references.length>10000)fail('INVALID_INPUT','合并后参考资料超过保存上限。');
 const adoptions=structuredClone(creation.adoptions??[]),existing=adoptions.find(item=>item.taskId===taskId&&item.attemptId===attemptId&&item.receiptHash===receiptHash);
 if(existing){existing.artifactIds=[...new Set([...(existing.artifactIds??[]),artifactId])];}
 else adoptions.push({taskId,attemptId,receiptHash,artifactIds:[artifactId],bodyHash,at:now});
 return {references,adoptions};
}
