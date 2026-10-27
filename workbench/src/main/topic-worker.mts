import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {openLibrary} from '../../../plugin-src/src/lib/file-library/index.mjs';
import {verifiedBoundReader} from './bound-reader.mts';
import {vaultRootForRuntime,readVaultSnapshot} from '../../../plugin-src/src/lib/vault/index.mjs';
import {readBytes,safe,digest,contentSources,queryVaultMutation,resumeVaultMutation} from '../../../plugin-src/src/lib/vault/core.mjs';
import {saveTopicCandidates,adoptTopic} from '../../../plugin-src/src/lib/vault/topics.mjs';
import {isRecord} from '../shared/contracts.ts';
import {fail,requireWrite} from '../shared/validation.ts';
import type {LibraryBinding} from '../shared/contracts.ts';
import type {TopicMenu} from '../shared/vault-contracts.ts';
import type {ProductionCoreLibrary} from '../shared/production-core.d.ts';
export function readTopicMenus(binding:LibraryBinding):TopicMenu[]{
 const library=verifiedBoundReader(binding) as unknown as ProductionCoreLibrary,root=vaultRootForRuntime(binding.root);if(!root)return [];
 const menus:TopicMenu[]=[],directory=safe(root,'04_选题库/候选',true);
 if(fs.existsSync(directory))for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
  if(!entry.isFile()||!entry.name.endsWith('.json'))continue;const relativePath=`04_选题库/候选/${entry.name}`,bytes=readBytes(root,relativePath);let value:unknown;try{value=JSON.parse(bytes.toString('utf8'));}catch{continue;}
  if(isRecord(value)&&value.format==='nova-topic-menu'&&typeof value.sessionId==='string'&&Array.isArray(value.candidates)&&Array.isArray(value.adoptions))menus.push({...value,relativePath,hash:digest(bytes)} as unknown as TopicMenu);
 }
 for(const task of library.readProduction().tasks){
  if(!isRecord(task.request.parameters)||task.request.parameters.workflow!=='topic-suggestion')continue;const attempt=task.attempts.find(item=>item.id===task.activeAttemptId),receipt=attempt?.receipt;
  if(!attempt||!['submitted','accepted'].includes(attempt.status)||receipt?.requestHash!==task.requestHash||receipt.attemptId!==attempt.id||receipt.taskId!==task.id)continue;
  for(const artifact of attempt.result?.artifacts??[]){
   const data=artifact.data;if(!isRecord(data)||!Array.isArray(data.topicCandidates))continue;
   const sessionId=`${task.id}-${artifact.id}`;if(menus.some(menu=>menu.sessionId===sessionId))continue;
   const candidates=data.topicCandidates;if(!candidates.length||candidates.length>4||!candidates.every(isRecord))continue;
   const payload={sessionId,candidates,sourceRefs:Array.isArray(data.sourceRefs)?data.sourceRefs:[],receiptHash:receipt.sha256};
   menus.push({...payload,relativePath:'',hash:digest(JSON.stringify(payload)),adoptions:[],taskId:task.id,attemptId:attempt.id,artifactId:artifact.id} as unknown as TopicMenu);
  }
 }
 return menus;
}
export function adoptVaultTopic(binding:LibraryBinding,input:{sessionId:string;candidateId:string;expectedHash:string;decisionText:string;mutationId:string},mode:'required'|'disabled'){
 requireWrite(mode);const library=verifiedBoundReader(binding) as unknown as ProductionCoreLibrary,root=vaultRootForRuntime(binding.root);if(!root)fail('NOT_READY','请打开知识库后选择选题。');
 const resultFor=(work:{vaultId:string;workId:string})=>{const context=readVaultSnapshot(binding.root),source=context?contentSources(context).find((entry:{tNumber:string})=>entry.tNumber===work.workId):null;return {...work,contentId:source?.contentId??null};};
 const previous=queryVaultMutation(binding.root,input.mutationId);
 if(previous){
  const request=previous.request;
  if(!isRecord(request)||request.action!=='topic-adoption'||!isRecord(request.input)||request.input.sessionId!==input.sessionId||request.input.candidateId!==input.candidateId||!isRecord(request.input.authorDecision)||request.input.authorDecision.text!==input.decisionText)fail('CONFLICT','同一操作编号已用于其他选题决定。');
  const restored=previous.status==='committed'?previous:resumeVaultMutation(binding.root,input.mutationId) as {status:string;result:unknown};
  if(restored.status!=='committed'||!isRecord(restored.result)||typeof restored.result.vaultId!=='string'||typeof restored.result.workId!=='string')fail('PENDING_MUTATION','选题原操作仍待核验。');
  return resultFor({vaultId:restored.result.vaultId,workId:restored.result.workId});
 }
 const menu=readTopicMenus(binding).find(item=>item.sessionId===input.sessionId);if(!menu||menu.hash!==input.expectedHash)fail('CONFLICT','选题候选已经变化，请重新读取菜单。');
 let hash=menu.hash;
 if(!menu.relativePath){
  const snapshot=library.readProduction(),task=snapshot.tasks.find(item=>item.id===menu.taskId),attempt=task?.attempts.find(item=>item.id===menu.attemptId);
  if(!task||!attempt?.receipt||task.activeAttemptId!==attempt.id)fail('CONFLICT','选题任务版本已改变。');
  if(attempt.status==='submitted')library.mutateProduction('acceptTask',{taskId:task.id,attemptId:attempt.id,receiptHash:attempt.receipt.sha256,expectedToken:snapshot.editToken},{mutationId:randomUUID()});
  const saved=saveTopicCandidates(root,{sessionId:menu.sessionId,candidates:menu.candidates,sourceRefs:menu.sourceRefs??[]});hash=saved.hash;
 }
 const work=adoptTopic(root,{sessionId:input.sessionId,candidateId:input.candidateId,expectedHash:hash,authorDecision:{actor:'author',text:input.decisionText,at:new Date().toISOString()},mutationId:input.mutationId});
 return resultFor(work);
}
