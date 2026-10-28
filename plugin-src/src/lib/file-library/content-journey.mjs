import {readJourneyEvidence} from './journey-evidence.mjs';
import {validateJourneyMaterials} from './journey-materials.mjs';
import {journeyFinalCheckpoint} from './journey-final-assets.mjs';
import {parseCreationHtml} from '../creation-document/parse.mjs';
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
 if(task.journeyState){if(claiming&&task.journeyState.continuation?.consumedAt===null)fail('CONTINUATION_REQUIRED','Claim the explicit one-time continuation first');if(task.journeyState.status!=='active')fail('ATTEMPT_INACTIVE','Journey is no longer active');return {root:task,attempt};}
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
 return {kind:stage==='research'?'research':'writing',title:`${root.title.slice(0,460)} · ${stage}`,prompt:`继续同一内容主线的固定 ${stage} 步骤。完整读取 context 与业务方法；只在当前步骤权限内保存真实产物，作者确认须由工作台准确版本决定。${stage==='author-materials'?'使用 jincheng-workflow materials 保存typed材料包：逐个采访3—5问，保留本人回答、复述、明确取舍；逐项绑定当前原件、真实研究/原片/转写/拆解来源；缺媒体或时间码写真实缺口，再等待作者确认材料包。材料包不是完整稿。':''}`,contentId:root.contentId,host,parameters,tools,budget:{amount:stage==='research'?step.config.maxRequests:0,currency:'REQ'},bodyHash};
}

export function initialJourneyState(childId,stepId){
 return {revision:1,ownerEpoch:1,status:'active',activeStepId:stepId,activeTaskId:childId,members:[{taskId:childId,stepId,ownerEpoch:1,planIndex:0}],checkpoints:[]};
}

/** Only committed Vault writes from reciprocal members can bridge a working HTML
 * revision. Both the before and after bytes are checked; arbitrary external edits
 * cannot become an authorized source by sharing a path or T. A committed receipt
 * remains read-only evidence after its writer retires; execution still requires
 * the active step and epoch at every final commit. */
export function journeyRevisionCurrent(runtimeRoot,root,production,source,actual,{buildTaskId=null}={}){
 if(source.relativePath===actual.relativePath&&source.hash===actual.hash&&source.documentId===actual.sourceDocumentId)return true;
 const vaultRoot=vaultRootForRuntime(runtimeRoot),receipts=[];
 let names;try{names=fs.readdirSync(path.join(vaultRoot,'.workbench/mutations'));}catch(error){if(error.code==='ENOENT')return false;throw error;}
 for(const name of names){
  if(!/^[A-Za-z0-9_-]{8,100}\.json$/.test(name))continue;
  const receipt=JSON.parse(readBytes(vaultRoot,'.workbench/mutations/'+name)),r=receipt.request,e=r?.execution;
  if(receipt.status!=='committed'||r?.action!=='creation-document'||!e||receipt.requestHash!==digest(JSON.stringify(r))||receipt.path!==actual.relativePath||r.source?.relativePath!==actual.relativePath||typeof receipt.after!=='string')continue;
  const task=production.tasks.find(t=>t.id===e.taskId),member=root.journeyState.members.find(m=>m.taskId===e.taskId);
  if(!task||!member||task.journeyMember?.journeyId!==root.id||task.requestHash!==e.requestHash||!task.attempts.some(a=>a.id===e.attemptId))continue;
  const after=digest(Buffer.from(receipt.after,'base64'));
  if(after!==receipt.result?.revision||receipt.creationBefore!==undefined&&digest(Buffer.from(receipt.creationBefore,'base64'))!==receipt.beforeHash)continue;
  const sameDocument=r.source.documentId===actual.sourceDocumentId;
  if(!sameDocument&&!(r.operation==='build'&&task.id===buildTaskId&&receipt.beforeHash===null))continue;
  receipts.push({before:receipt.beforeHash,after,build:r.operation==='build'&&task.id===buildTaskId&&receipt.beforeHash===null});
 }
 for(const rebase of root.journeyState.sourceRebases??[]){if(rebase.documentId!==actual.sourceDocumentId)continue;const r=JSON.parse(readBytes(vaultRoot,'.workbench/mutations/'+rebase.mutationId+'.json'));if(r.status!=='committed'||r.requestHash!==digest(JSON.stringify(r.request))||r.path!==actual.relativePath||r.beforeHash!==rebase.fromHash||r.result?.revision!==rebase.toHash||digest(Buffer.from(r.after,'base64'))!==rebase.toHash)fail('STALE_INPUT','Author revision receipt changed');receipts.push({before:rebase.fromHash,after:rebase.toHash,build:false});}
 const reached=new Set(source.relativePath===actual.relativePath&&source.documentId===actual.sourceDocumentId?[source.hash]:[]);
 for(const receipt of receipts)if(receipt.build)reached.add(receipt.after);
 for(let pass=0;pass<=receipts.length;pass++){const before=reached.size;for(const receipt of receipts)if(reached.has(receipt.before))reached.add(receipt.after);if(reached.size===before)break;}
 return reached.has(actual.hash);
}

export function journeyAuthorRefresh(runtimeRoot,root,child,production,mutationId,actual){
 if(typeof mutationId!=='string'||!/^[-A-Za-z0-9_]{8,100}$/.test(mutationId))fail('INVALID_INPUT','A precise author save receipt is required');
 const vaultRoot=vaultRootForRuntime(runtimeRoot),source={sourceId:'drafts',documentId:actual.sourceDocumentId,relativePath:actual.relativePath,writable:true},frozen=child.request.parameters.source;
 const valid=receipt=>{const r=receipt.request,author=r?.group?.actor??r?.input?.actor;return receipt.status==='committed'&&r?.action==='creation-document'&&author?.kind==='author'&&!r.execution&&receipt.requestHash===digest(JSON.stringify(r))&&receipt.path===actual.relativePath&&r.source?.relativePath===actual.relativePath&&r.source?.documentId===actual.sourceDocumentId&&typeof receipt.creationBefore==='string'&&typeof receipt.after==='string'&&digest(Buffer.from(receipt.after,'base64'))===receipt.result?.revision&&digest(Buffer.from(receipt.creationBefore,'base64'))===receipt.beforeHash;};
 const receipt=JSON.parse(readBytes(vaultRoot,'.workbench/mutations/'+mutationId+'.json'));if(!valid(receipt)||receipt.result.revision!==actual.hash)fail('AUTHOR_SAVE_REQUIRED','The current bytes need their exact same-work author save receipt');
 const names=fs.readdirSync(path.join(vaultRoot,'.workbench/mutations'));if(names.length>20000)fail('LIMIT_REACHED','Author revision history requires manual review');
 const candidates=names.filter(name=>/^[A-Za-z0-9_-]{8,100}\.json$/.test(name)).map(name=>({mutationId:name.slice(0,-5),receipt:JSON.parse(readBytes(vaultRoot,'.workbench/mutations/'+name))})).filter(value=>valid(value.receipt));
 const search=(target,visited=new Set())=>{
  if(journeyRevisionCurrent(runtimeRoot,root,production,frozen,{...actual,hash:target},{buildTaskId:child.id}))return [];
  if(visited.has(target)||visited.size>=256)return null;visited.add(target);
  for(const candidate of candidates.filter(c=>c.receipt.result.revision===target)){const prior=search(candidate.receipt.beforeHash,new Set(visited));if(prior)return [...prior,candidate];}return null;
 };
 const chain=search(receipt.beforeHash);if(!chain)fail('SOURCE_CHANGED','Author saves do not form an exact chain from the authorized working revision');chain.push({mutationId,receipt});
 const before=parseCreationHtml(Buffer.from(chain[0].receipt.creationBefore,'base64'),source),after=parseCreationHtml(Buffer.from(receipt.after,'base64'),source);
 if(chain.some(c=>{const a=parseCreationHtml(Buffer.from(c.receipt.creationBefore,'base64'),source),b=parseCreationHtml(Buffer.from(c.receipt.after,'base64'),source);return a.pageId!==before.pageId||b.pageId!==before.pageId||a.raw.content_id!==root.request.parameters.work.workId||b.raw.content_id!==root.request.parameters.work.workId;}))fail('SOURCE_CHANGED','Author saves must preserve original page and work identity');
 const manuscript=doc=>doc.items.filter(i=>i.kind==='segment').map(i=>({id:i.id,order:i.locked.order,mine:i.fields.mine})),packaging=doc=>doc.items.filter(i=>['pubslot','pubcand','final'].includes(i.kind)),plan=journeyPlan(root.request.parameters),current=root.journeyState.members.find(m=>m.taskId===child.id).planIndex;
 const manuscriptChanged=canonical(manuscript(before))!==canonical(manuscript(after)),packagingChanged=canonical(packaging(before))!==canonical(packaging(after)),index=manuscriptChanged?plan.findIndex(step=>['writing','tutorial','kepu'].includes(step.kind)):packagingChanged?Math.min(current,plan.findIndex(step=>step.kind==='cover-copy')):current;
 return {index,rebases:chain.map(c=>({taskId:child.id,documentId:actual.sourceDocumentId,fromHash:c.receipt.beforeHash,toHash:c.receipt.result.revision,mutationId:c.mutationId}))};
}

export function assertJourneyPins(runtimeRoot,root,production){
 const source=root.request.parameters.work,vaultRoot=vaultRootForRuntime(runtimeRoot),flow=readWorkFlow(vaultRoot,{vaultId:source.vaultId,workId:source.workId});
 for(const pin of root.journeyState.checkpoints){
  if(!pin.decisionId){const researchTask=production.tasks.find(t=>t.id===pin.taskId);if(researchTask)readJourneyEvidence(runtimeRoot,production,researchTask);if(digest(readBytes(vaultRoot,pin.path))!==pin.hash)fail('STALE_INPUT','An upstream research report changed');continue;}
  const artifact=flow.artifacts.find(value=>value.artifactId===pin.artifactId&&value.hash===pin.hash),decision=flow.decisions.findLast(value=>value.artifactId===pin.artifactId);
  if(pin.kind==='author-materials'){const materialTask=production.tasks.find(t=>t.id===pin.taskId);if(!materialTask)fail('STALE_INPUT','The material task is unavailable');validateJourneyMaterials(runtimeRoot,root,materialTask,production,JSON.parse(readBytes(vaultRoot,pin.path)),{sourceCurrent:source=>journeyRevisionCurrent(runtimeRoot,root,production,source,{sourceDocumentId:source.documentId,relativePath:source.relativePath,hash:digest(readBytes(vaultRoot,source.relativePath))})});}
  let current=!!artifact&&digest(readBytes(vaultRoot,artifact.path))===pin.hash;
  if(!current&&artifact&&pin.kind==='complete-draft'){
   const document=flow.originalFacts.find(f=>f.source.relativePath===pin.path)?.source;
   current=!!document&&journeyRevisionCurrent(runtimeRoot,root,production,{documentId:document.documentId,relativePath:pin.path,hash:pin.hash},{sourceDocumentId:document.documentId,relativePath:pin.path,hash:document.hash});
  }
  if(!artifact||!current||decision?.decision!=='confirm'||decision.artifactHash!==pin.hash||decision.decisionId!==pin.decisionId)fail('STALE_INPUT','An upstream artifact or author decision has changed');
 }
 return flow;
}

export function journeyCheckpoint(runtimeRoot,root,child,production,currentContent){
 const flow=assertJourneyPins(runtimeRoot,root,production),stage=child.request.parameters.stage;
 if(child.request.parameters.workflow==='jincheng-research'){
  const config=child.request.parameters.researchRuntime,vaultRoot=vaultRootForRuntime(runtimeRoot);
  let state;
  try{const locator=JSON.parse(readBytes(vaultRoot,`.workbench/research-runtime/${config.researchId}.json`));if(locator.path!==`${config.outputDirectory}/research-runtime.json`)fail('CONFLICT','Research locator changed');state=JSON.parse(readBytes(vaultRoot,locator.path));}catch(error){if(error.code==='ENOENT')fail('CHECKPOINT_REQUIRED','The fixed research report is not saved');throw error;}
  if(canonical(state.config)!==canonical(config)||state.stage!=='report-generated'||!state.findings||!state.report||state.report.findingsHash!==state.findings.sha256||state.report.mechanicalValidation!=='passed'||!state.report.relativePath.startsWith(config.outputDirectory+'/')||digest(readBytes(vaultRoot,state.report.relativePath))!==state.report.sha256)fail('CHECKPOINT_REQUIRED','The exact fixed research report has not been verified');
  const rebound=readJourneyEvidence(runtimeRoot,production,child);
  for(const request of state.requests){const cost=production.costs.find(cost=>cost.taskId===child.id&&cost.attemptId===child.activeAttemptId&&cost.requestId===request.id)??rebound?.costs.find(cost=>cost.requestId===request.id);if(request.status!=='complete'||!cost||cost.status!=='measured'||cost.usage?.ok!==true||(request.responseHashAlgorithm==='json-stringify-sha256-v1'?researchResponseDigest(JSON.parse(readBytes(vaultRoot,request.path)).data):hash(JSON.parse(readBytes(vaultRoot,request.path)).data))!==request.responseHash)fail('CHECKPOINT_REQUIRED','Research requires settled registered response evidence');}
  return {taskId:child.id,stepId:child.journeyMember.stepId,kind:'research',artifactId:config.researchId,hash:state.report.sha256,path:state.report.relativePath,decisionId:null};
 }
 if(stage==='final-assets')return journeyFinalCheckpoint(runtimeRoot,root,child,currentContent);
 const kind={'author-materials':'author-materials','analysis-ai':'analysis-comparison',writing:'complete-draft',tutorial:'complete-draft',kepu:'complete-draft','review-page':'review','cover-copy':'packaging','cover-design':'cover-design'}[stage];
 if(!kind)fail('CHECKPOINT_REQUIRED','This step requires its verified business completion handler');
 const artifact=flow.artifacts.findLast(value=>value.kind===kind);
 const decision=artifact&&flow.decisions.findLast(value=>value.artifactId===artifact.artifactId);
 if(kind==='author-materials'&&artifact?.taskId===child.id)validateJourneyMaterials(runtimeRoot,root,child,production,JSON.parse(readBytes(vaultRootForRuntime(runtimeRoot),artifact.path)));
 const original=artifact&&flow.originalFacts.find(f=>f.source.relativePath===artifact.path)?.source;
 if(kind==='complete-draft'&&!original)fail('CHECKPOINT_REQUIRED','Complete draft requires the same-work original creation page');
 const current=artifact&&(flow.checkpointStates[artifact.artifactId]?.confirmed||kind==='complete-draft'&&original&&journeyRevisionCurrent(runtimeRoot,root,production,{documentId:original.documentId,relativePath:artifact.path,hash:artifact.hash},{sourceDocumentId:original.documentId,relativePath:artifact.path,hash:original.hash}));
 if(!artifact||artifact.taskId!==child.id||!current||decision?.decision!=='confirm'||decision.artifactHash!==artifact.hash)fail('CHECKPOINT_REQUIRED','The current step needs its exact persisted artifact and author decision');
 return {taskId:child.id,stepId:child.journeyMember.stepId,kind,artifactId:artifact.artifactId,hash:artifact.hash,path:artifact.path,decisionId:decision.decisionId};
}

export function validJourneyTask(task,tasks){
 if(task.journeyState!==undefined){
  const state=task.journeyState,p=task.request.parameters;
  if(task.journeyMember!==undefined||p.workflow!=='content-journey'||p.journeyVersion!==1||task.request.tools.length||task.request.budget.amount!==0||!exact(state,['revision','ownerEpoch','status','activeStepId','activeTaskId','members','checkpoints',...(state.sourceRebases!==undefined?['sourceRebases']:[]),...(state.continuation!==undefined?['continuation']:[]),...(state.evidenceBindings!==undefined?['evidenceBindings']:[])])||!Number.isSafeInteger(state.revision)||state.revision<1||!Number.isSafeInteger(state.ownerEpoch)||state.ownerEpoch<1||!['active','cancelled','complete'].includes(state.status)||!UUID.test(state.activeStepId)||!UUID.test(state.activeTaskId)||!Array.isArray(state.members)||!state.members.length||!Array.isArray(state.checkpoints))return false;
  if(state.evidenceBindings!==undefined&&(!Array.isArray(state.evidenceBindings)||!state.evidenceBindings.every(b=>exact(b,['targetTaskId','targetAttemptId','ownerEpoch','sourceTaskId','sourceAttemptId','sourceRequestHash','researchId','costIds','grantIds','files'])&&[b.targetTaskId,b.targetAttemptId,b.sourceTaskId,b.sourceAttemptId].every(id=>UUID.test(id))&&HASH.test(b.sourceRequestHash)&&Number.isSafeInteger(b.ownerEpoch)&&b.ownerEpoch>0&&typeof b.researchId==='string'&&Array.isArray(b.costIds)&&b.costIds.every(id=>UUID.test(id))&&Array.isArray(b.grantIds)&&b.grantIds.every(id=>UUID.test(id))&&Array.isArray(b.files)&&b.files.every(f=>exact(f,['relativePath','hash','bytes'])&&typeof f.relativePath==='string'&&HASH.test(f.hash)&&Number.isSafeInteger(f.bytes)&&f.bytes>=0))))return false;
  if(state.continuation!==undefined&&(!exact(state.continuation,['challengeHash','expiresAt','host','attemptId','ownerEpoch','consumedAt'])||!HASH.test(state.continuation.challengeHash)||!UUID.test(state.continuation.attemptId)||state.continuation.attemptId!==task.activeAttemptId||state.continuation.ownerEpoch!==state.ownerEpoch||!['codex','workbuddy'].includes(state.continuation.host)||!Number.isFinite(Date.parse(state.continuation.expiresAt))||state.continuation.consumedAt!==null&&!Number.isFinite(Date.parse(state.continuation.consumedAt))))return false;
  if(state.sourceRebases!==undefined&&(!Array.isArray(state.sourceRebases)||!state.sourceRebases.every(r=>exact(r,['taskId','documentId','fromHash','toHash','mutationId'])&&UUID.test(r.taskId)&&typeof r.documentId==='string'&&HASH.test(r.fromHash)&&HASH.test(r.toHash)&&typeof r.mutationId==='string')))return false;
  return state.members.every(member=>exact(member,['taskId','stepId','ownerEpoch','planIndex'])&&UUID.test(member.taskId)&&UUID.test(member.stepId)&&Number.isSafeInteger(member.ownerEpoch)&&member.ownerEpoch>0&&Number.isSafeInteger(member.planIndex)&&member.planIndex>=0&&tasks.some(child=>child.id===member.taskId&&child.journeyMember?.journeyId===task.id&&child.journeyMember.stepId===member.stepId&&child.journeyMember.ownerEpoch===member.ownerEpoch))&&new Set(state.members.map(member=>member.taskId)).size===state.members.length&&(state.status!=='active'||state.members.some(member=>member.taskId===state.activeTaskId&&member.stepId===state.activeStepId&&member.ownerEpoch===state.ownerEpoch));
 }
 if(task.request.parameters?.workflow==='content-journey')return false;
 if(task.journeyMember!==undefined){const m=task.journeyMember,root=tasks.find(root=>root.id===m?.journeyId);return exact(m,['journeyId','stepId','ownerEpoch'])&&canonical(task.request.parameters.journey)===canonical(m)&&UUID.test(m.journeyId)&&UUID.test(m.stepId)&&Number.isSafeInteger(m.ownerEpoch)&&root?.journeyState?.members.some(member=>member.taskId===task.id&&member.stepId===m.stepId&&member.ownerEpoch===m.ownerEpoch);}
 return true;
}

/** Read-only candidate locator. The author must explicitly apply it through CAS. */
export function latestJourneyAuthorSave(runtimeRoot,actual){
 const vaultRoot=vaultRootForRuntime(runtimeRoot);if(!vaultRoot||!actual)return null;let names;try{names=fs.readdirSync(path.join(vaultRoot,'.workbench/mutations'));}catch(error){if(error.code==='ENOENT')return null;throw error;}if(names.length>20000)return null;
 for(const name of names){if(!/^[A-Za-z0-9_-]{8,100}\.json$/.test(name))continue;const r=JSON.parse(readBytes(vaultRoot,'.workbench/mutations/'+name)),request=r.request,author=request?.group?.actor??request?.input?.actor;if(r.status==='committed'&&request?.action==='creation-document'&&author?.kind==='author'&&!request.execution&&request.source?.documentId===actual.sourceDocumentId&&request.source?.relativePath===actual.relativePath&&r.path===actual.relativePath&&r.result?.revision===actual.hash&&r.requestHash===digest(JSON.stringify(request)))return name.slice(0,-5);}
 return null;
}
