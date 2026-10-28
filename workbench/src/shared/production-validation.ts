import {validReportSearchInput} from './report-search-contracts.ts';
import {jinchengStages,validResearchBrief,validSynthesisBrief} from './stage-validation.ts';
import {vaultDocumentId} from './vault-validation.ts';
import {validRadarQuery} from '../../../plugin-src/src/lib/file-library/radar.mjs';
import {isRecord} from './contracts.ts';
import {exact, uuid, token, identity} from './validation.ts';
import {scopedProductionRecordOps} from './production-contracts.ts';
import type {ProductionPending} from './production-contracts.ts';
const text=(v:unknown,n=1000000)=>typeof v==='string' && v.length<=n && !v.includes('\0');
const optionalKeys=(v:unknown,required:string[],optional:string[]=[])=>isRecord(v)&&required.every(k=>Object.hasOwn(v,k))&&Object.keys(v).every(k=>[...required,...optional].includes(k));
const json=(v:unknown,depth=0):boolean=>depth<30&&(v===null||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v)||text(v)||Array.isArray(v)&&v.length<=10000&&v.every(x=>json(x,depth+1))||isRecord(v)&&Object.keys(v).length<=200&&Object.entries(v).every(([k,x])=>!['__proto__','constructor','prototype'].includes(k)&&json(x,depth+1)));
const boundedJSON=(v:unknown)=>json(v)&&JSON.stringify(v).length<=4_000_000;
const strings=(v:unknown,check:(x:unknown)=>boolean,n=500)=>Array.isArray(v)&&v.length<=n&&v.every(check);
const host=(v:unknown)=>v==='codex'||v==='workbuddy';
const kinds=['research','transcription','analysis','writing','packaging','review'];
const manualFields:Record<string,[string[],string[]?]>={adoptResearchReferences:[['contentId','taskId','attemptId','receiptHash','artifactId','expectedContentToken']],enable:[[]],saveAccount:[['name','platform','url','note','tags','images','reportIds'],['id','avatarAssetHash']],trashAccount:[['id']],restoreAccount:[['id']],saveReport:[['title','type','accountIds','sourceUrl','collectedAt','meta'],['id','pages','pageId','markdown']],trashReport:[['id']],restoreReport:[['id']],setReportPosition:[['id','pageId']],ensureCreation:[['contentId']],saveCreation:[['contentId','patch','expectedContentToken']],recordFeedback:[['text','source'],['contentId']],recordKnowledge:[['text','source'],['contentId']],decideKnowledge:[['id','status']],reconcileCost:[['taskId','attemptId','id','status','amount','usage']]};
export function productionMutationInput(op:unknown,input:unknown):boolean {
 if(typeof op!=='string'||!Object.hasOwn(manualFields,op))return false;
 const [required,optional=[]]=manualFields[op];
 if(!optionalKeys(input,[...required,'expectedToken'],optional)||!isRecord(input)||!token(input.expectedToken)||!boundedJSON(input))return false;
 for(const [key,v] of Object.entries(input)) {
  if(['id','contentId','pageId','taskId','attemptId','artifactId'].includes(key)&&!uuid(v))return false;
  if(['name','platform','title','type','source','text'].includes(key)&&(!text(v,key==='text'?1000000:500)||!(v as string).trim()))return false;
  if(['url','note'].includes(key)&&!text(v,key==='url'?4096:100000))return false;
  if(key==='avatarAssetHash'&&v!==null&&!token(v))return false;
  if(['images'].includes(key)&&!strings(v,token,50))return false;
  if(['reportIds','accountIds'].includes(key)&&!strings(v,uuid))return false;
  if(key==='tags'&&!strings(v,x=>text(x,100),100))return false;
 }
 if(['saveCreation','adoptResearchReferences'].includes(op)&&!token(input.expectedContentToken))return false;
 if(op==='adoptResearchReferences'&&!token(input.receiptHash))return false;
 if(op==='saveReport'){
  if(input.markdown!==undefined){if(input.pages!==undefined||typeof input.markdown!=='string'||!text(input.markdown,100000)||!input.markdown.trim())return false;}
  else if(!Array.isArray(input.pages)||!input.pages.length||input.pages.length>100||!input.pages.every(p=>optionalKeys(p,['title','assetHash'],['id'])&&isRecord(p)&&text(p.title,500)&&token(p.assetHash)&&(p.id===undefined||uuid(p.id))))return false;
 }
 if(op==='reconcileCost'&&(!['actual','measured','estimated','billed','cancelled'].includes(input.status as string)||![0,1].includes(input.amount as number)))return false;
 if(op==='decideKnowledge'&&!['accepted','rejected'].includes(input.status as string))return false;
 return true;
}
export function productionDraft(v:unknown):boolean {return exact(v,['contentId','body','editToken','bodyHash','productionToken','creationPatch'])&&uuid(v.contentId)&&text(v.body)&&token(v.editToken)&&token(v.bodyHash)&&token(v.productionToken)&&isRecord(v.creationPatch)&&Object.keys(v.creationPatch).every(k=>['stage','kind','references','analysis','narrative','suggestions','annotations','packaging','confirmedBodyHash','filming','composition','adoptions'].includes(k))&&boundedJSON(v.creationPatch);}
export function productionDesktopInput(method:string,input:unknown):boolean|undefined {
 switch(method) {
 case 'searchProductionReports':return validReportSearchInput(input);
 case 'createRadarTask':return validRadarQuery(input);
 case 'adoptRadarResult':return exact(input,['taskId','attemptId','receiptHash','expectedToken'])&&uuid(input.taskId)&&uuid(input.attemptId)&&token(input.receiptHash)&&token(input.expectedToken);
 case 'decideRadarCandidate':return exact(input,['reportId','candidateId','decision','expectedToken'])&&uuid(input.reportId)&&uuid(input.candidateId)&&['add-topic','reject'].includes(input.decision as string)&&token(input.expectedToken);
 case 'openRadarSource':return exact(input,['reportId','candidateId'])&&uuid(input.reportId)&&uuid(input.candidateId);
 case 'readPlatformCatalog':case 'readProduction':case 'readProductionPending':return input===undefined;
 case 'mutateProduction':return optionalKeys(input,['op','input','mutationId'],['scope'])&&isRecord(input)&&uuid(input.mutationId)&&productionMutationInput(input.op,input.input)&&(scopedProductionRecordOps.has(String(input.op))?token(input.scope):input.scope===undefined||token(input.scope));
 case 'startProductionTask':{
  if(!optionalKeys(input,['kind','title','prompt','mode','comments'],['contentId','accountId','workflow','businessSkill','stage','researchBrief','synthesisBrief','coverDesignRatio','source','transcript'])||!isRecord(input))return false;
  if(input.stage!==undefined&&(!jinchengStages.includes(input.stage as string)||input.workflow!=='jincheng-stage'))return false;
  if(input.researchBrief!==undefined&&(!validResearchBrief(input.researchBrief)||input.kind!=='research'&&!(input.workflow==='jincheng-stage'&&input.stage==='intake')))return false;
  const positioning=input.workflow==='positioning-interview',topics=input.workflow==='topic-suggestion',stage=input.workflow==='jincheng-stage';
  const synthesis=stage&&input.stage==='synthesis';
  if(synthesis&&(input.kind!=='research'||input.businessSkill!=='jc-synthesis-research'||input.accountId!=null||input.comments!==false||input.mode!=='simple'||input.researchBrief!==undefined||!validSynthesisBrief(input.synthesisBrief)))return false;
  if(!synthesis&&input.synthesisBrief!==undefined)return false;
  const coverDesign=stage&&input.stage==='cover-design';
  if(coverDesign?(input.businessSkill!=='jc-cover-design'||typeof input.coverDesignRatio!=='string'||!(/^[1-9]\d{0,7}:[1-9]\d{0,7}$/).test(input.coverDesignRatio)):input.coverDesignRatio!==undefined)return false;
  if(input.source!==undefined&&(!(topics||stage)||!exact(input.source,['documentId','expectedHash'])||!vaultDocumentId(input.source.documentId)||!token(input.source.expectedHash)))return false;
  if(positioning&&(input.kind!=='writing'||input.contentId!==null||input.accountId!==null||input.comments!==false||input.mode!=='simple'||input.businessSkill!=='xindao-interview'||input.transcript!==undefined))return false;
  if(topics&&(input.kind!=='research'||!(input.contentId===null||uuid(input.contentId))||input.accountId!==null||input.comments!==false||input.mode!=='simple'||input.businessSkill!=='xindao-xuanti'||input.transcript!==undefined))return false;
  if(stage&&(typeof input.businessSkill!=='string'||!/^(?:jc-[a-z0-9-]+|nova-workbench-writing-method)$/.test(input.businessSkill)||!['contentId','accountId'].every(k=>input[k]===undefined||input[k]===null||uuid(input[k]))||input.transcript!==undefined))return false;
  if(!positioning&&!topics&&!stage&&((input.businessSkill!==undefined&&!((input.kind==='research'||input.kind==='analysis'&&uuid(input.accountId))&&input.businessSkill==='jc-media-research'||input.kind==='transcription'&&input.transcript!==undefined&&input.businessSkill==='jc-zhuanxie'))||!['contentId','accountId'].every(k=>input[k]===undefined||uuid(input[k]))))return false;
  if(input.workflow!==undefined&&!positioning&&!topics&&!stage&&!(input.workflow==='content-creation'&&input.kind==='writing'&&uuid(input.contentId)))return false;
  return (input.transcript===undefined||(input.workflow===undefined&&input.accountId===undefined&&input.kind==='transcription'&&uuid(input.contentId)&&exact(input.transcript,['intent','referenceId','expectedReferenceHash'])&&['extract','correct','reextract'].includes(input.transcript.intent as string)&&uuid(input.transcript.referenceId)&&token(input.transcript.expectedReferenceHash)))&&kinds.includes(input.kind as string)&&text(input.title,500)&&!!(input.title as string).trim()&&text(input.prompt,input.workflow==='content-creation'||input.transcript!==undefined?95000:100000)&&!!(input.prompt as string).trim()&&['simple','detailed'].includes(input.mode as string)&&typeof input.comments==='boolean';
 }
 case 'openProductionTask':return optionalKeys(input,['taskId'],['host'])&&isRecord(input)&&uuid(input.taskId)&&(input.host===undefined||host(input.host));
 case 'actProductionTask':return isRecord(input)&&uuid(input.taskId)&&(input.action==='reject'?exact(input,['taskId','action','expectedToken','attemptId','receiptHash','reason'])&&token(input.expectedToken)&&uuid(input.attemptId)&&token(input.receiptHash)&&text(input.reason,2000)&&!!(input.reason as string).trim():input.action==='accept'?exact(input,['taskId','action','expectedToken','attemptId','receiptHash'])&&token(input.expectedToken)&&uuid(input.attemptId)&&token(input.receiptHash):optionalKeys(input,['taskId','action'],['host'])&&['cancel','retry'].includes(input.action as string)&&(input.host===undefined||host(input.host)));
 case 'openProductionLink':return optionalKeys(input,['kind','id'],['pageId'])&&isRecord(input)&&['account','report','creation','task-archive'].includes(input.kind as string)&&uuid(input.id)&&(input.pageId===undefined||input.kind==='report'&&uuid(input.pageId));
 case 'chooseProductionFiles':return exact(input,['kind'])&&['images','report','media'].includes(input.kind as string);
 case 'readProductionCreation':return exact(input,['contentId'])&&uuid(input.contentId);
 case 'saveProductionDraft':return productionDraft(input);
 case 'recoverProductionPending':return exact(input,['action'])&&['retry','discard'].includes(input.action as string);
 default:return undefined;
 }
}
export function productionPending(v:unknown):v is ProductionPending {
 if(!isRecord(v)||!uuid(v.mutationId)||!exact(v.binding,['libraryId','rootIdentity'])||!uuid(v.binding.libraryId)||!identity(v.binding.rootIdentity))return false;
 if(v.kind==='draft')return exact(v,['kind','binding','mutationId','input'])&&productionDraft(v.input);
 if(v.kind==='files')return exact(v,['kind','binding','mutationId','fileKind','sources','hashes'])&&['images','report','media'].includes(v.fileKind as string)&&strings(v.sources,x=>text(x,32768),100)&&(v.sources as unknown[]).length>0&&strings(v.hashes,token,100)&&(v.hashes as unknown[]).length===(v.sources as unknown[]).length;
 if(v.kind==='mutate'&&v.op==='rejectTask')return exact(v,['kind','binding','mutationId','op','input'])&&exact(v.input,['taskId','attemptId','receiptHash','expectedToken','reason'])&&productionDesktopInput('actProductionTask',{...v.input,action:'reject'})===true;
 if(v.kind!=='mutate'||!exact(v,['kind','binding','mutationId','op','input'])||!boundedJSON(v.input))return false;
 if(productionMutationInput(v.op,v.input))return true;
 const internal:Record<string,string[]>={cancelJourney:['journeyId','expectedJourneyRevision','expectedToken'],refreshJourneySource:['journeyId','expectedJourneyRevision','expectedStepId','sourceMutationId','expectedToken'],prepareJourneyContinuation:['journeyId','expectedJourneyRevision','expectedStepId','rootAttemptId','childAttemptId','host','challengeHash','expectedToken'],startJourney:['contentId','host','method','researchPlan','limits','serviceConfig','expectedToken'],adoptRadarResult:['taskId','attemptId','receiptHash','expectedToken'],decideRadarCandidate:['reportId','candidateId','decision','expectedToken'],createTask:['kind','title','prompt','contentId','accountId','host','parameters','tools','budget','bodyHash','expectedToken'],cancelTask:['taskId','expectedToken'],retryTask:['taskId','host','expectedToken'],acceptTask:['taskId','attemptId','receiptHash','expectedToken']};
 return typeof v.op==='string'&&Object.hasOwn(internal,v.op)&&exact(v.input,internal[v.op])&&token(v.input.expectedToken);
}
