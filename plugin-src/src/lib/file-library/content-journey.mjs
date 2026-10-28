import fs from 'node:fs';
import path from 'node:path';
import {researchResponseDigest} from '../research-runtime/samples.mjs';
import {validateResearchConfig,canonical,hash} from '../research-runtime/common.mjs';
import {LibraryError} from './index.mjs';
import {readWorkFlow} from '../vault/workflow.mjs';
import {vaultRootForRuntime} from '../vault/index.mjs';
import {readBytes,digest,queryVaultMutation} from '../vault/core.mjs';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const HASH=/^[a-f0-9]{64}$/;
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys)=>object(v)&&Object.keys(v).length===keys.length&&keys.every(key=>Object.hasOwn(v,key));
const fail=(code,message)=>{throw new LibraryError(code,message);};
const check=(ok,message)=>{if(!ok)fail('INVALID_INPUT',message);};
const methods=['ordinary-writing','explicitly-selected-tutorial','explicitly-selected-kepu'];
const running=['claimed','waiting-user','waiting-permission'];

/** An exact committed build receipt bridges the brief interval before its stage
 * artifact is registered. A same-T path alone never authorizes that transition. */
export function isJourneyOutputReceipt(runtimeRoot,task,attemptId,source,mutationId){
 if(!task.journeyMember||typeof mutationId!=='string'||!/^[-A-Za-z0-9_]{8,100}$/.test(mutationId))return false;
 const receipt=queryVaultMutation(runtimeRoot,mutationId),request=receipt?.request,execution=request?.execution;
 return receipt?.status==='committed'&&request.action==='creation-document'&&request.operation==='build'&&execution?.taskId===task.id&&execution.attemptId===attemptId&&execution.requestHash===task.requestHash&&request.source?.relativePath===source.relativePath&&receipt.result?.revision===source.hash;
}

export function rejectJourneyForgery(input){
 const parameters=input.request?.parameters??input.parameters??{};
 check(!Object.keys(input).some(key=>['journey','journeyState','journeyMember','journeyId','ownerEpoch','stepId','parent'].includes(key))&&!Object.keys(parameters).some(key=>['journey','journeyState','journeyMember','journeyId','ownerEpoch','stepId','parent'].includes(key))&&parameters.workflow!=='content-journey','Journey membership can only be created by its coordinator');
}

/** Membership comes from the reciprocal stored root record, never request prose. */
export function assertJourneyAuthority(production,task,attempt,input={},claiming=false){
 if(task.journeyState){if(task.journeyState.status!=='active')fail('ATTEMPT_INACTIVE','Journey is no longer active');return {root:task,attempt};}
 if(!task.journeyMember)return null;
 const member=task.journeyMember;if(canonical(task.request.parameters.journey)!==canonical(member))fail('CLAIM_MISMATCH','The child request does not bind its journey membership');const root=production.tasks.find(value=>value.id===member.journeyId),state=root?.journeyState,owner=root?.attempts.find(value=>value.id===root.activeAttemptId);
 if(!state||state.status!=='active'||state.ownerEpoch!==member.ownerEpoch||state.activeStepId!==member.stepId||state.activeTaskId!==task.id||!state.members.some(value=>value.taskId===task.id&&value.stepId===member.stepId&&value.ownerEpoch===member.ownerEpoch)||!owner||!running.includes(owner.status))fail('ATTEMPT_INACTIVE','Journey ownership or active step has changed');
 if(owner.host!==attempt.host||owner.workerId!==(claiming?input.workerId:attempt.workerId))fail('CLAIM_MISMATCH','The child belongs to the root worker and host');
 if(claiming&&(!owner.claimToken||input.rootClaimToken!==owner.claimToken))fail('CLAIM_MISMATCH','Claim the child with the current root owner');
 return {root,attempt:owner};
}

export function journeyPlan(parameters){
 const research=parameters.researchPlan.map((config,index)=>({kind:'research',index,config}));
 const writing=parameters.method==='explicitly-selected-tutorial'?'tutorial':parameters.method==='explicitly-selected-kepu'?'kepu':'writing';
 return [...research,...(research.length?[{kind:'analysis-ai'}]:[]),{kind:'author-materials'},{kind:writing},{kind:'review-page'},{kind:'cover-copy'},{kind:'cover-design'},{kind:'final-assets'}];
}

export function prepareJourney({input,context,libraryId,contentId}){
 check(exact(input,['contentId','host','method','researchPlan','limits','serviceConfig','expectedToken']),'Journey start accepts only a bounded plan and current production token');
 check(methods.includes(input.method)&&['codex','workbuddy'].includes(input.host),'Unknown journey method or assistant');
 check(context?.content?.sourceResolution==='resolved'&&context.content.contentId===contentId,'Journey requires one resolved persisted Vault work');
 check(typeof context.vaultId==='string'&&/^T\d{3,}$/.test(context.content.tNumber),'Journey requires stable Vault and T identities');
 const source={documentId:context.content.sourceDocumentId,relativePath:context.content.relativePath,hash:context.content.hash};
 check(typeof source.documentId==='string'&&typeof source.relativePath==='string'&&HASH.test(source.hash),'Journey requires a current source version');
 const limits=input.limits;
 check(exact(limits,['maxRequestsTotal','commentsAllowed','mediaCount','mediaBytes'])&&Number.isInteger(limits.maxRequestsTotal)&&limits.maxRequestsTotal>=0&&limits.maxRequestsTotal<=100&&typeof limits.commentsAllowed==='boolean'&&Number.isInteger(limits.mediaCount)&&limits.mediaCount>=0&&limits.mediaCount<=3&&limits.mediaBytes===67108864,'Invalid fixed journey limits');
 check(Array.isArray(input.researchPlan)&&input.researchPlan.length<=10,'Research plan must be bounded');
 const researchPlan=input.researchPlan.map(value=>validateResearchConfig(value));
 check(researchPlan.every(config=>config.comments!==true||limits.commentsAllowed),'Comments require separate journey permission');
 check(researchPlan.every(config=>config.maxRequests<=limits.maxRequestsTotal),'A research step cannot exceed the whole journey budget');
 check(new Set(researchPlan.map(config=>config.researchId)).size===researchPlan.length,'Research identities must be unique');
 check(object(input.serviceConfig),'Journey service settings must be frozen');
 const parameters={workflow:'content-journey',journeyVersion:1,work:{libraryId,vaultId:context.vaultId,workId:context.content.tNumber,contentId},initialSource:source,method:input.method,researchPlan:structuredClone(researchPlan),limits:structuredClone(limits),serviceConfig:structuredClone(input.serviceConfig)};
 parameters.allowedStepKinds=journeyPlan(parameters).map(step=>step.kind);
 return parameters;
}

export function journeyChildInput(root,source,bodyHash,host,index=0,member){
 const plan=journeyPlan(root.request.parameters),step=plan[index];
 check(step,'Journey has no next step');
 check(exact(member,['journeyId','stepId','ownerEpoch']),'The child needs its frozen parent identity');
 const stage=step.kind,businessSkill=stage==='author-materials'||['writing','tutorial','kepu'].includes(stage)?stage==='tutorial'?'jc-jiaocheng-video':stage==='kepu'?'jc-kepu-video':'jc-content-writer':stage==='review-page'?'jc-review-page':stage==='cover-copy'?'jc-cover-copy':stage==='cover-design'?'jc-cover-design':stage==='analysis-ai'?'jc-video-analysis':stage==='final-assets'?'nova-workbench-writing-method':'jc-media-research';
 const parameters=stage==='research'?{workflow:'jincheng-research',researchRuntime:step.config,businessSkill,source,comments:step.config.comments,budgetEnabled:step.config.maxRequests>0,maxRequestsPerTask:step.config.maxRequests,serviceConfig:root.request.parameters.serviceConfig,...(step.config.platform==='douyin'?{media:{version:1,maxDownloads:3,maxBytes:67108864}}:{})}:{workflow:'jincheng-stage',stage,businessSkill,source,...(stage==='cover-design'?{coverDesignRatio:'3:4'}:{})};
 parameters.journey=structuredClone(member);
 const tools=stage==='research'&&step.config.maxRequests>0?['tikhub',...(step.config.platform==='douyin'?['media','asr']:[])]:[];
 return {kind:stage==='research'?'research':'writing',title:`${root.title.slice(0,460)} · ${stage}`,prompt:`继续同一内容主线的固定 ${stage} 步骤。完整读取 context 与业务方法；只在当前步骤权限内保存真实产物，作者确认须由工作台准确版本决定。`,contentId:root.contentId,host,parameters,tools,budget:{amount:stage==='research'?step.config.maxRequests:0,currency:'REQ'},bodyHash};
}

export function initialJourneyState(childId,stepId){
 return {revision:1,ownerEpoch:1,status:'active',activeStepId:stepId,activeTaskId:childId,members:[{taskId:childId,stepId,ownerEpoch:1,planIndex:0}],checkpoints:[]};
}

/** Only committed Vault writes from reciprocal members can bridge a working HTML
 * revision. Both the before and after bytes are checked; arbitrary external edits
 * cannot become an authorized source by sharing a path or T. */
export function journeyRevisionCurrent(runtimeRoot,root,production,source,actual,{buildTaskId=null}={}){
 if(source.relativePath===actual.relativePath&&source.hash===actual.hash&&source.documentId===actual.sourceDocumentId)return true;
 const vaultRoot=vaultRootForRuntime(runtimeRoot),receipts=[];
 let names;try{names=fs.readdirSync(path.join(vaultRoot,'.workbench/mutations'));}catch(error){if(error.code==='ENOENT')return false;throw error;}
 for(const name of names){
  if(!/^[A-Za-z0-9_-]{8,100}\.json$/.test(name))continue;
  const receipt=JSON.parse(readBytes(vaultRoot,'.workbench/mutations/'+name)),r=receipt.request,e=r?.execution;
  if(receipt.status!=='committed'||r?.action!=='creation-document'||!e||receipt.requestHash!==digest(JSON.stringify(r))||receipt.path!==actual.relativePath||r.source?.relativePath!==actual.relativePath||typeof receipt.after!=='string')continue;
  const task=production.tasks.find(t=>t.id===e.taskId),member=root.journeyState.members.find(m=>m.taskId===e.taskId);
  if(!task||!member||task.journeyMember?.journeyId!==root.id||task.requestHash!==e.requestHash||!task.attempts.some(a=>a.id===e.attemptId&&['accepted','claimed','waiting-user','waiting-permission'].includes(a.status)))continue;
  const after=digest(Buffer.from(receipt.after,'base64'));
  if(after!==receipt.result?.revision||receipt.creationBefore!==undefined&&digest(Buffer.from(receipt.creationBefore,'base64'))!==receipt.beforeHash)continue;
  const sameDocument=r.source.documentId===actual.sourceDocumentId;
  if(!sameDocument&&!(r.operation==='build'&&task.id===buildTaskId&&receipt.beforeHash===null))continue;
  receipts.push({before:receipt.beforeHash,after,build:r.operation==='build'&&task.id===buildTaskId&&receipt.beforeHash===null});
 }
 const reached=new Set(source.relativePath===actual.relativePath&&source.documentId===actual.sourceDocumentId?[source.hash]:[]);
 for(const receipt of receipts)if(receipt.build)reached.add(receipt.after);
 for(let pass=0;pass<=receipts.length;pass++){const before=reached.size;for(const receipt of receipts)if(reached.has(receipt.before))reached.add(receipt.after);if(reached.size===before)break;}
 return reached.has(actual.hash);
}

export function assertJourneyPins(runtimeRoot,root,production){
 const source=root.request.parameters.work,vaultRoot=vaultRootForRuntime(runtimeRoot),flow=readWorkFlow(vaultRoot,{vaultId:source.vaultId,workId:source.workId});
 for(const pin of root.journeyState.checkpoints){
  if(!pin.decisionId){if(digest(readBytes(vaultRoot,pin.path))!==pin.hash)fail('STALE_INPUT','An upstream research report changed');continue;}
  const artifact=flow.artifacts.find(value=>value.artifactId===pin.artifactId&&value.hash===pin.hash),decision=flow.decisions.findLast(value=>value.artifactId===pin.artifactId);
  let current=!!artifact&&digest(readBytes(vaultRoot,artifact.path))===pin.hash;
  if(!current&&artifact&&pin.kind==='complete-draft'){
   const document=flow.originalFacts.find(f=>f.source.relativePath===pin.path)?.source;
   current=!!document&&journeyRevisionCurrent(runtimeRoot,root,production,{documentId:document.documentId,relativePath:pin.path,hash:pin.hash},{sourceDocumentId:document.documentId,relativePath:pin.path,hash:document.hash});
  }
  if(!artifact||!current||decision?.decision!=='confirm'||decision.artifactHash!==pin.hash||decision.decisionId!==pin.decisionId)fail('STALE_INPUT','An upstream artifact or author decision has changed');
 }
 return flow;
}

export function journeyCheckpoint(runtimeRoot,root,child,production){
 const flow=assertJourneyPins(runtimeRoot,root,production),stage=child.request.parameters.stage;
 if(child.request.parameters.workflow==='jincheng-research'){
  const config=child.request.parameters.researchRuntime,vaultRoot=vaultRootForRuntime(runtimeRoot);
  let state;
  try{const locator=JSON.parse(readBytes(vaultRoot,`.workbench/research-runtime/${config.researchId}.json`));if(locator.path!==`${config.outputDirectory}/research-runtime.json`)fail('CONFLICT','Research locator changed');state=JSON.parse(readBytes(vaultRoot,locator.path));}catch(error){if(error.code==='ENOENT')fail('CHECKPOINT_REQUIRED','The fixed research report is not saved');throw error;}
  if(canonical(state.config)!==canonical(config)||state.stage!=='report-generated'||!state.findings||!state.report||state.report.findingsHash!==state.findings.sha256||state.report.mechanicalValidation!=='passed'||!state.report.relativePath.startsWith(config.outputDirectory+'/')||digest(readBytes(vaultRoot,state.report.relativePath))!==state.report.sha256)fail('CHECKPOINT_REQUIRED','The exact fixed research report has not been verified');
  for(const request of state.requests){const cost=production.costs.find(cost=>cost.taskId===child.id&&cost.attemptId===child.activeAttemptId&&cost.requestId===request.id);if(request.status!=='complete'||!cost||cost.status!=='measured'||cost.usage?.ok!==true||(request.responseHashAlgorithm==='json-stringify-sha256-v1'?researchResponseDigest(JSON.parse(readBytes(vaultRoot,request.path)).data):hash(JSON.parse(readBytes(vaultRoot,request.path)).data))!==request.responseHash)fail('CHECKPOINT_REQUIRED','Research requires settled registered response evidence');}
  return {taskId:child.id,stepId:child.journeyMember.stepId,kind:'research',artifactId:config.researchId,hash:state.report.sha256,path:state.report.relativePath,decisionId:null};
 }
 const kind={'author-materials':'author-materials','analysis-ai':'analysis-comparison',writing:'complete-draft',tutorial:'complete-draft',kepu:'complete-draft','review-page':'review','cover-copy':'packaging','cover-design':'cover-design'}[stage];
 if(!kind)fail('CHECKPOINT_REQUIRED','This step requires its verified business completion handler');
 const artifact=flow.artifacts.findLast(value=>value.kind===kind);
 const decision=artifact&&flow.decisions.findLast(value=>value.artifactId===artifact.artifactId);
 const original=artifact&&flow.originalFacts.find(f=>f.source.relativePath===artifact.path)?.source;
 const current=artifact&&(flow.checkpointStates[artifact.artifactId]?.confirmed||kind==='complete-draft'&&original&&journeyRevisionCurrent(runtimeRoot,root,production,{documentId:original.documentId,relativePath:artifact.path,hash:artifact.hash},{sourceDocumentId:original.documentId,relativePath:artifact.path,hash:original.hash}));
 if(!artifact||artifact.taskId!==child.id||!current||decision?.decision!=='confirm'||decision.artifactHash!==artifact.hash)fail('CHECKPOINT_REQUIRED','The current step needs its exact persisted artifact and author decision');
 return {taskId:child.id,stepId:child.journeyMember.stepId,kind,artifactId:artifact.artifactId,hash:artifact.hash,path:artifact.path,decisionId:decision.decisionId};
}

export function validJourneyTask(task,tasks){
 if(task.journeyState!==undefined){
  const state=task.journeyState,p=task.request.parameters;
  if(task.journeyMember!==undefined||p.workflow!=='content-journey'||p.journeyVersion!==1||task.request.tools.length||task.request.budget.amount!==0||!exact(state,['revision','ownerEpoch','status','activeStepId','activeTaskId','members','checkpoints'])||!Number.isSafeInteger(state.revision)||state.revision<1||!Number.isSafeInteger(state.ownerEpoch)||state.ownerEpoch<1||!['active','cancelled','complete'].includes(state.status)||!UUID.test(state.activeStepId)||!UUID.test(state.activeTaskId)||!Array.isArray(state.members)||!state.members.length||!Array.isArray(state.checkpoints))return false;
  return state.members.every(member=>exact(member,['taskId','stepId','ownerEpoch','planIndex'])&&UUID.test(member.taskId)&&UUID.test(member.stepId)&&Number.isSafeInteger(member.ownerEpoch)&&member.ownerEpoch>0&&Number.isSafeInteger(member.planIndex)&&member.planIndex>=0&&tasks.some(child=>child.id===member.taskId&&child.journeyMember?.journeyId===task.id&&child.journeyMember.stepId===member.stepId&&child.journeyMember.ownerEpoch===member.ownerEpoch))&&new Set(state.members.map(member=>member.taskId)).size===state.members.length&&(state.status!=='active'||state.members.some(member=>member.taskId===state.activeTaskId&&member.stepId===state.activeStepId&&member.ownerEpoch===state.ownerEpoch));
 }
 if(task.request.parameters?.workflow==='content-journey')return false;
 if(task.journeyMember!==undefined){const m=task.journeyMember,root=tasks.find(root=>root.id===m?.journeyId);return exact(m,['journeyId','stepId','ownerEpoch'])&&canonical(task.request.parameters.journey)===canonical(m)&&UUID.test(m.journeyId)&&UUID.test(m.stepId)&&Number.isSafeInteger(m.ownerEpoch)&&root?.journeyState?.members.some(member=>member.taskId===task.id&&member.stepId===m.stepId&&member.ownerEpoch===m.ownerEpoch);}
 return true;
}
