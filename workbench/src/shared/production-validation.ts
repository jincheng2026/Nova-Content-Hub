import {isRecord} from './contracts.ts';
import {exact, uuid, token, identity} from './validation.ts';
import type {ProductionPending} from './production-contracts.ts';
const text=(v:unknown,n=1000000)=>typeof v==='string' && v.length<=n && !v.includes('\0');
const optionalKeys=(v:unknown,required:string[],optional:string[]=[])=>isRecord(v)&&required.every(k=>Object.hasOwn(v,k))&&Object.keys(v).every(k=>[...required,...optional].includes(k));
const json=(v:unknown,depth=0):boolean=>depth<30&&(v===null||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v)||text(v)||Array.isArray(v)&&v.length<=10000&&v.every(x=>json(x,depth+1))||isRecord(v)&&Object.keys(v).length<=200&&Object.entries(v).every(([k,x])=>!['__proto__','constructor','prototype'].includes(k)&&json(x,depth+1)));
const boundedJSON=(v:unknown)=>json(v)&&JSON.stringify(v).length<=4_000_000;
const strings=(v:unknown,check:(x:unknown)=>boolean,n=500)=>Array.isArray(v)&&v.length<=n&&v.every(check);
const host=(v:unknown)=>v==='codex'||v==='workbuddy';
const kinds=['research','transcription','analysis','writing','packaging','review'];
const manualFields:Record<string,[string[],string[]?]>={enable:[[]],saveAccount:[['name','platform','url','note','tags','images','reportIds'],['id']],trashAccount:[['id']],restoreAccount:[['id']],saveReport:[['title','type','accountIds','sourceUrl','collectedAt','pages','meta'],['id']],trashReport:[['id']],setReportPosition:[['id','pageId']],ensureCreation:[['contentId']],saveCreation:[['contentId','patch','expectedContentToken']],recordFeedback:[['text','source'],['contentId']],recordKnowledge:[['text','source'],['contentId']],decideKnowledge:[['id','status']],reconcileCost:[['taskId','attemptId','id','status','amount','usage']]};
export function productionMutationInput(op:unknown,input:unknown):boolean {
 if(typeof op!=='string'||!Object.hasOwn(manualFields,op))return false;
 const [required,optional=[]]=manualFields[op];
 if(!optionalKeys(input,[...required,'expectedToken'],optional)||!isRecord(input)||!token(input.expectedToken)||!boundedJSON(input))return false;
 for(const [key,v] of Object.entries(input)) {
  if(['id','contentId','pageId','taskId','attemptId'].includes(key)&&!uuid(v))return false;
  if(['name','platform','title','type','source','text'].includes(key)&&(!text(v,key==='text'?1000000:500)||!(v as string).trim()))return false;
  if(['url','note'].includes(key)&&!text(v,key==='url'?4096:100000))return false;
  if(['images'].includes(key)&&!strings(v,token,50))return false;
  if(['reportIds','accountIds'].includes(key)&&!strings(v,uuid))return false;
  if(key==='tags'&&!strings(v,x=>text(x,100),100))return false;
 }
 if(op==='saveCreation'&&!token(input.expectedContentToken))return false;
 if(op==='saveReport'&&(!Array.isArray(input.pages)||!input.pages.length||input.pages.length>100||!input.pages.every(p=>optionalKeys(p,['title','assetHash'],['id'])&&isRecord(p)&&text(p.title,500)&&token(p.assetHash)&&(p.id===undefined||uuid(p.id)))))return false;
 if(op==='reconcileCost'&&(!['actual','measured','estimated','billed','cancelled'].includes(input.status as string)||![0,1].includes(input.amount as number)))return false;
 if(op==='decideKnowledge'&&!['accepted','rejected'].includes(input.status as string))return false;
 return true;
}
export function productionDraft(v:unknown):boolean {return exact(v,['contentId','body','editToken','bodyHash','productionToken','creationPatch'])&&uuid(v.contentId)&&text(v.body)&&token(v.editToken)&&token(v.bodyHash)&&token(v.productionToken)&&isRecord(v.creationPatch)&&Object.keys(v.creationPatch).every(k=>['stage','kind','references','analysis','narrative','suggestions','annotations','packaging','confirmedBodyHash','filming'].includes(k))&&boundedJSON(v.creationPatch);}
export function productionDesktopInput(method:string,input:unknown):boolean|undefined {
 switch(method) {
 case 'readPlatformCatalog':case 'readProduction':case 'readProductionPending':return input===undefined;
 case 'mutateProduction':return exact(input,['op','input','mutationId'])&&uuid(input.mutationId)&&productionMutationInput(input.op,input.input);
 case 'startProductionTask':return optionalKeys(input,['kind','title','prompt','mode','comments'],['contentId','accountId'])&&isRecord(input)&&kinds.includes(input.kind as string)&&text(input.title,500)&&!!(input.title as string).trim()&&text(input.prompt,100000)&&!!(input.prompt as string).trim()&&['simple','detailed'].includes(input.mode as string)&&typeof input.comments==='boolean'&&['contentId','accountId'].every(k=>input[k]===undefined||uuid(input[k]));
 case 'openProductionTask':return optionalKeys(input,['taskId'],['host'])&&isRecord(input)&&uuid(input.taskId)&&(input.host===undefined||host(input.host));
 case 'actProductionTask':return isRecord(input)&&uuid(input.taskId)&&(input.action==='accept'?exact(input,['taskId','action','expectedToken','attemptId','receiptHash'])&&token(input.expectedToken)&&uuid(input.attemptId)&&token(input.receiptHash):optionalKeys(input,['taskId','action'],['host'])&&['cancel','retry'].includes(input.action as string)&&(input.host===undefined||host(input.host)));
 case 'openProductionLink':return optionalKeys(input,['kind','id'],['pageId'])&&isRecord(input)&&['account','report','creation'].includes(input.kind as string)&&uuid(input.id)&&(input.pageId===undefined||input.kind==='report'&&uuid(input.pageId));
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
 if(v.kind!=='mutate'||!exact(v,['kind','binding','mutationId','op','input'])||!boundedJSON(v.input))return false;
 if(productionMutationInput(v.op,v.input))return true;
 const internal:Record<string,string[]>={createTask:['kind','title','prompt','contentId','accountId','host','parameters','tools','budget','bodyHash','expectedToken'],cancelTask:['taskId','expectedToken'],retryTask:['taskId','host','expectedToken'],acceptTask:['taskId','attemptId','receiptHash','expectedToken']};
 return typeof v.op==='string'&&Object.hasOwn(internal,v.op)&&exact(v.input,internal[v.op])&&token(v.input.expectedToken);
}
