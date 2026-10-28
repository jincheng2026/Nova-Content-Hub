import {executeReportSearch} from './report-search-worker.mts';
import {productionRecordPermissions} from '../../../plugin-src/src/lib/file-library/production-record-policy.mjs';
import path from 'node:path';
import {reportNavigation,readRegisteredReportAttachment} from './report-navigation.mts';
import {verifiedBoundReader} from './bound-reader.mts';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import {productionReferenceHash,validateTranscriptReference} from '../../../plugin-src/src/lib/file-library/production-reference.mjs';
import {researchMediaAuthorized,researchVideoAuthorized,researchGrantAuthorized} from '../../../plugin-src/src/lib/research-runtime/common.mjs';
import {openLibrary} from '../../../plugin-src/src/lib/file-library/index.mjs';
import {validateImportedRaster} from '../../../plugin-src/src/lib/image-validation/index.mjs';
import {exact,libraryBinding,uuid,token,requireWrite,fail} from '../shared/validation.ts';
import {productionPending} from '../shared/production-validation.ts';
import type {ProductionWorkerOperations,ProductionPending,ProductionFile,ProductionCreationState} from '../shared/production-contracts.ts';
import type {ProductionCoreLibrary} from '../shared/production-core.d.ts';
import type {LibraryBinding} from '../shared/contracts.ts';
const ops=new Set(['productionReportSearch','productionAuthority','productionObserverMutation','productionArchive','productionContext','productionReserve','productionTaskMutation','productionAsset','productionMediaGrant','productionMedia','productionRead','productionCreation','productionMutate','productionRecover','productionReport','productionReportAttachment']);
export const isProductionOperation=(op:unknown):op is keyof ProductionWorkerOperations=>typeof op==='string'&&ops.has(op);
const same=(p:ProductionPending,b:LibraryBinding)=>p.binding.libraryId===b.libraryId&&p.binding.rootIdentity.dev===b.rootIdentity.dev&&p.binding.rootIdentity.ino===b.rootIdentity.ino;
const creation=(l:ProductionCoreLibrary,id:string):ProductionCreationState=>{const v=l.readProductionCreation(id);return {content:{id:v.content.id,title:v.content.title,body:v.content.body,editToken:v.content.editToken,bodyHash:v.content.bodyHash,deletedAt:v.content.deletedAt},creation:v.creation,productionToken:v.productionToken,history:v.history};};
async function files(l:ProductionCoreLibrary,p:Extract<ProductionPending,{kind:'files'}>):Promise<ProductionFile[]> {
 const output:ProductionFile[]=[];
 if(p.sources.length>(p.fileKind==='media'?1:p.fileKind==='images'?50:100))fail('INVALID_FILES','选择的文件数量超过限制。');
 for(const [index,source] of p.sources.entries()) {
  if(!path.isAbsolute(source)||source.includes('\0'))fail('INVALID_FILES','必须选择本机普通文件。');
  const stat=await fs.lstat(source),ext=path.extname(source).toLowerCase();
  const extensions=p.fileKind==='images'?['.png','.jpg','.jpeg','.webp','.gif']:p.fileKind==='report'?['.html','.htm']:['.mp3','.mp4','.m4a','.wav','.webm','.ogg','.flac','.mov'];
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>(p.fileKind==='report'?8:64)*1024*1024||!extensions.includes(ext))fail('INVALID_FILES','文件格式、大小或位置不可用。');
  if(createHash('sha256').update(await fs.readFile(source)).digest('hex')!==p.hashes[index])fail('STALE_INPUT','选择的源文件已改变，请保留原文件后恢复或明确放弃本次导入。');
  if(p.fileKind==='images')await validateImportedRaster(await fs.readFile(source));
  if(p.fileKind==='report'){const bytes=await fs.readFile(source);let html;try{html=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{fail('INVALID_FILES','报告必须为 UTF-8 HTML。');}if(!/<(?:!doctype\s+html|html|body|article|section)\b/i.test(html!))fail('INVALID_FILES','请选择完整 HTML 报告。');}
  const imported=l.importAsset(source,{purpose:p.fileKind==='images'?'photo':p.fileKind==='report'?'production-report':'production-reference'});
  if(imported.assetHash!==p.hashes[index])fail('STALE_INPUT','导入期间源文件已改变，已停止建立引用。');
  const asset=l.readAsset(imported.assetHash);
  output.push({assetHash:asset.assetHash,originalName:path.basename(source),detectedType:asset.detectedType,bytes:asset.bytes});
 }
 return output;
}
export async function executeProduction(op:keyof ProductionWorkerOperations,args:unknown,mode:'required'|'disabled'='required'):Promise<ProductionWorkerOperations[keyof ProductionWorkerOperations]['result']> {
 requireWrite(mode);
 if(op==='productionReportSearch')return executeReportSearch(args);
 if(['productionAuthority','productionObserverMutation','productionContext','productionReserve','productionTaskMutation','productionAsset','productionMediaGrant'].includes(op))return executeTool(op,args);

 const fields=op==='productionArchive'?['binding','taskId']:op==='productionMedia'?['binding','contentId','assetHash']:op==='productionRead'?['binding']:op==='productionCreation'?['binding','contentId']:op==='productionReportAttachment'?['binding','reportId','pageId','fingerprint','index']:op==='productionReport'?null:['binding','pending'];
 if(!(fields?exact(args,fields):typeof args==='object'&&args!==null&&Object.keys(args).every(k=>['binding','reportId','pageId'].includes(k)))||!args||!libraryBinding((args as {binding:unknown}).binding))fail('INVALID_INPUT','生产任务参数无效。');
 const a=args as {binding:LibraryBinding;fingerprint?:string;index?:number;pending?:ProductionPending;contentId?:string;assetHash?:string;reportId?:string;pageId?:string;taskId?:string};
 if(!path.isAbsolute(a.binding.root)||a.binding.root.includes('\0'))fail('INVALID_INPUT','内容库路径无效。');
 if(op==='productionCreation'&&!uuid(a.contentId)||['productionReport','productionReportAttachment'].includes(op)&&(!uuid(a.reportId)||a.pageId!==undefined&&!uuid(a.pageId)))fail('INVALID_INPUT','对象编号无效。');
 if((op==='productionMutate'||op==='productionRecover')&&(!productionPending(a.pending)||!same(a.pending,a.binding)))fail('CONFLICT','待核验操作与当前内容库不一致。');
 const l=(['productionRead','productionCreation','productionReport','productionReportAttachment','productionMedia'].includes(op)?verifiedBoundReader(a.binding):openLibrary(a.binding.root,{expectedLibraryId:a.binding.libraryId,expectedRootIdentity:a.binding.rootIdentity})) as unknown as ProductionCoreLibrary;
 if(op==='productionMedia'){if(!uuid(a.contentId)||!token(a.assetHash))fail('INVALID_INPUT','媒体引用无效。');const state=l.readProductionCreation(a.contentId!);if(!state.creation?.references.some(r=>r.mediaAssetHash===a.assetHash))fail('FORBIDDEN','仅可读取本文已登记原片。');const asset=l.readAsset(a.assetHash!);if(!['audio/wav','audio/mpeg','audio/mp4','audio/ogg','audio/flac','video/mp4','video/webm'].includes(asset.detectedType)||asset.bytes>64*1024*1024)fail('INVALID_INPUT','媒体不可播放。');return {data:asset.data,detectedType:asset.detectedType};}
 if(op==='productionArchive'){if(!uuid(a.taskId))fail('INVALID_INPUT','任务编号无效。');return l.rebuildProductionArchive(a.taskId!);}
 if(op==='productionRead'){const snapshot=l.readProduction();return {...snapshot,libraryScope:createHash('sha256').update(JSON.stringify(a.binding)).digest('hex'),recordPermissions:productionRecordPermissions(a.binding.root,snapshot)};}
 if(op==='productionCreation')return creation(l,a.contentId!);
 if(op==='productionReport'||op==='productionReportAttachment') {
  const reports=l.readProduction().reports,report=reports.find(r=>r.id===a.reportId&&!r.deletedAt),page=report?.pages.find(p=>p.id===(a.pageId??report.pageId));
  if(!report||!page)fail('NOT_FOUND','报告页面不存在。');
  const asset=l.readAsset(page.assetHash);
  if(asset.bytes>8*1024*1024||!['text/plain','text/html'].includes(asset.detectedType))fail('INVALID_REPORT','报告不是受支持的 HTML。');
  const html=new TextDecoder('utf-8',{fatal:true}).decode(asset.data);
  if(op==='productionReportAttachment'){
   if(!uuid(a.pageId)||!token(a.fingerprint)||!Number.isInteger(a.index)||a.index!<0||a.index!>=500)fail('INVALID_INPUT','报告附件请求无效。');
   const attachment=readRegisteredReportAttachment(a.binding,reports,report.id,page.id,html,a.fingerprint!,a.index!);if(!attachment)fail('CONFLICT','报告原件或附件已变化，请重新打开。');return attachment;
  }
  return {html,report,navigation:reportNavigation(a.binding,reports,report.id,page.id,html)};
 }
 const pending=a.pending!;
 if(op==='productionRecover') {
  if(pending.kind==='files')return {found:false};
  const receipt=l.queryMutation(pending.mutationId);
  if(!receipt)return {found:false};
  if(receipt.objectKind!==(pending.kind==='draft'||['saveCreation','adoptResearchReferences'].includes(pending.op)?'content':'workspace')||receipt.objectId!==(pending.kind==='draft'||['saveCreation','adoptResearchReferences'].includes(pending.op)?pending.input.contentId:'default'))fail('CONFLICT','事务回执不属于原操作。');
  // Replaying the exact transaction verifies its persisted request digest before clearing recovery intent.
  if(pending.kind==='mutate')l.mutateProduction(pending.op,pending.input,{mutationId:pending.mutationId});
  else {const i=pending.input;l.saveProductionDraft(i.contentId,{body:i.body,expectedBodyHash:i.bodyHash,expectedProductionToken:i.productionToken,creationPatch:i.creationPatch},i.editToken,{mutationId:pending.mutationId});}
  return {found:true,objectId:receipt.objectId};
 }
 if(pending.kind==='files')return files(l,pending);
 if(pending.kind==='mutate'){const snapshot=l.mutateProduction(pending.op,pending.input,{mutationId:pending.mutationId});return {...snapshot,libraryScope:createHash('sha256').update(JSON.stringify(a.binding)).digest('hex'),recordPermissions:productionRecordPermissions(a.binding.root,snapshot)};}
 const i=pending.input;l.saveProductionDraft(i.contentId,{body:i.body,expectedBodyHash:i.bodyHash,expectedProductionToken:i.productionToken,creationPatch:i.creationPatch},i.editToken,{mutationId:pending.mutationId});
 return creation(l,i.contentId);
}

function workerIdentity(input:Record<string,unknown>){if(!uuid(input.taskId)||!uuid(input.attemptId)||!uuid(input.claimToken)||typeof input.workerId!=='string'||!input.workerId.trim()||input.workerId.length>200)fail('INVALID_INPUT','Invalid production worker identity');return {taskId:String(input.taskId),attemptId:String(input.attemptId),claimToken:String(input.claimToken),workerId:String(input.workerId)};}

async function executeTool(op:keyof ProductionWorkerOperations,args:unknown):Promise<ProductionWorkerOperations[keyof ProductionWorkerOperations]['result']> {
 const fields=op==='productionAuthority'?['binding','input']:op==='productionMediaGrant'?['binding','input','source','mutationId']:op==='productionContext'?['binding','taskId']:op==='productionAsset'?['binding','taskId','attemptId','claimToken','workerId','audioPath']:op==='productionReserve'?['binding','input','mutationId']:['binding','op','input','mutationId'];
 if(!exact(args,fields)||!libraryBinding(args.binding)||!path.isAbsolute(args.binding.root)||args.binding.root.includes('\0'))fail('INVALID_INPUT','工具调用参数无效。');
 const l=openLibrary(args.binding.root,{expectedLibraryId:args.binding.libraryId,expectedRootIdentity:args.binding.rootIdentity}) as unknown as ProductionCoreLibrary;
 if(op==='productionAuthority'){const identity=args.input;if(!exact(identity,['taskId','attemptId','claimToken','workerId'])||!uuid(identity.taskId)||!uuid(identity.attemptId)||!uuid(identity.claimToken)||typeof identity.workerId!=='string'||identity.workerId.length>200)fail('INVALID_INPUT','Invalid journey authority identity');return l.assertProductionAuthority(workerIdentity(identity));}
 if(op==='productionObserverMutation'){
  const i=args.input,operation=args.op;
  if(typeof operation!=='string'||!['claimTask','submitTask','failTask'].includes(operation)||!uuid(args.mutationId)||!exact(i,['taskId','attemptId','claimToken','workerId',...(operation==='submitTask'?['result']:operation==='failTask'?['failure']:[])])||!uuid(i.taskId)||!uuid(i.attemptId)||!uuid(i.claimToken)||i.workerId!=='native-publication-observer')fail('INVALID_INPUT','原生观察任务身份无效。');
  const context=l.readProductionContext(i.taskId),task=context.task,p=task?.request.parameters as Record<string,unknown>|undefined,scope=p?.publicationScope as Record<string,unknown>|undefined;
  if(!task||task.activeAttemptId!==i.attemptId||task.kind!=='research'||task.contentId!==null||task.accountId!==null||p?.workflow!=='publication-observe'||p.executor!=='native-observer'||p.comments!==false||p.budgetEnabled!==true||p.maxRequestsPerTask!==1||task.request.budget.amount!==1||task.request.budget.currency!=='REQ'||task.request.tools.length!==1||task.request.tools[0]!=='tikhub'||!scope||typeof scope.postId!=='string'||!/^\d{1,32}$/.test(scope.postId)||!['12h','7d'].includes(String(scope.checkpoint))||!uuid(scope.consentId)||!uuid(scope.reservationId)||!uuid(scope.requestId))fail('PUBLICATION_OPERATION_FORBIDDEN','仅可领取或提交冻结的原生发布观察任务。');
  return l.mutateProduction(operation as 'claimTask'|'submitTask'|'failTask',i,{mutationId:args.mutationId});
 }
 if(op==='productionContext'){if(!uuid(args.taskId))fail('INVALID_INPUT','任务编号无效。');return l.readProductionContext(args.taskId);}
 if(op==='productionMediaGrant') {
  const i=args.input;
  if(!uuid(args.mutationId)||!exact(i,['taskId','attemptId','claimToken','workerId','requestId','sourceReceiptId','sourceRequestId','requestHash','videoId','canonicalUrl','responseHash'])||!uuid(i.taskId)||!uuid(i.attemptId)||!uuid(i.claimToken)||!uuid(i.requestId)||!uuid(i.sourceReceiptId)||!uuid(i.sourceRequestId)||!token(i.requestHash)||!token(i.responseHash)||typeof i.workerId!=='string'||i.workerId.length>200||typeof i.videoId!=='string'||!/^\d{1,32}$/.test(i.videoId)||i.canonicalUrl!==`https://www.douyin.com/video/${i.videoId}`||typeof args.source!=='string'||!path.isAbsolute(args.source))fail('INVALID_INPUT','媒体授权参数无效。');
  const context=l.readProductionContext(i.taskId),task=context.task,attempt=task?.attempts.find(a=>a.id===i.attemptId);
  const research=researchMediaAuthorized(task);
  if(task?.contentId&&l.readProductionCreation(task.contentId).content.deletedAt)fail('CLAIM_MISMATCH','当前内容已在回收站，原任务不能继续读取或登记原片。');
  if(!task||task.activeAttemptId!==i.attemptId||attempt?.claimToken!==i.claimToken||attempt.workerId!==i.workerId||!['claimed','waiting-user','waiting-permission'].includes(attempt.status)||!research&&(!task.contentId||!context.creation||l.readProductionCreation(task.contentId).content.deletedAt)||!task.request.tools.includes('media'))fail('CLAIM_MISMATCH','下载已结束，但原任务或内容已失效。');
  if(research&&!researchVideoAuthorized(task,context.snapshot.costs,i.attemptId,i.videoId))fail('MEDIA_NOT_AUTHORIZED','该原片不在固定研究来源中。');
  if(research&&!researchGrantAuthorized(task,context.snapshot.costs,i.attemptId,i))fail('MEDIA_NOT_AUTHORIZED','The video detail receipt does not belong to the registered sample source');
  if(task.journeyMember)l.assertProductionAuthority(workerIdentity(i));
  const stat=await fs.lstat(args.source);if(!stat.isFile()||stat.isSymbolicLink()||stat.size<1||stat.size>64*1024*1024)fail('INVALID_INPUT','下载媒体不可用。');
  const asset=l.importProductionAsset(workerIdentity(i),args.source,'production-reference');
  const result=l.mutateProduction('registerMediaGrant',{...i,assetHash:asset.assetHash},{mutationId:args.mutationId});
  const grant=result.tasks.find(t=>t.id===i.taskId)?.attempts.find(a=>a.id===i.attemptId)?.mediaGrants?.find(g=>g.sourceReceiptId===i.sourceReceiptId);
  if(!grant)fail('INVALID_INPUT','媒体授权登记未完成。');return grant;
 }
 if(op==='productionAsset') {
  if(!uuid(args.taskId)||!uuid(args.attemptId)||!uuid(args.claimToken)||typeof args.workerId!=='string'||!token(args.audioPath))fail('INVALID_INPUT','音频只接受已登记的资产编号。');
  const context=l.readProductionContext(args.taskId),task=context.task,attempt=task?.attempts.find(a=>a.id===args.attemptId);
  if(!task||!attempt||task.activeAttemptId!==attempt.id||attempt.claimToken!==args.claimToken||attempt.workerId!==args.workerId||!['claimed','waiting-user','waiting-permission'].includes(attempt.status))fail('CLAIM_MISMATCH','工具调用不属于当前运行中的任务。');
  const research=researchMediaAuthorized(task);
  if(task?.contentId&&l.readProductionCreation(task.contentId).content.deletedAt)fail('CLAIM_MISMATCH','当前内容已在回收站，原任务不能继续读取或登记原片。');
  if(!task.request.tools.includes('asr')||!research&&(!task.contentId||l.readProductionCreation(task.contentId).content.deletedAt))fail('INVALID_INPUT','任务内容或转写权限已失效。');
  const frozen=task.request.parameters as Record<string,unknown>,transcript=frozen?.transcript;
  if(transcript!==undefined){
   const binding=transcript as Record<string,unknown>;
   if(!exact(binding,['version','referenceId','baselineHash','intent'])||binding.version!==1||!uuid(binding.referenceId)||!token(binding.baselineHash)||!['extract','reextract'].includes(String(binding.intent))||task.kind!=='transcription'||task.accountId||frozen.workflow)fail('INVALID_INPUT','固定转写意图不允许本次提取。');
   const reference=context.creation?.references.find(r=>r.id===binding.referenceId);
   if(!reference||reference.mediaAssetHash!==args.audioPath||await productionReferenceHash(reference)!==binding.baselineHash)fail('STALE_INPUT','固定参考或基线已变化。');
   validateTranscriptReference(reference,binding.intent as 'extract'|'reextract');
  }
  if(!context.creation?.references.some(r=>r.mediaAssetHash===args.audioPath)&&!attempt.mediaGrants?.some(g=>g.assetHash===args.audioPath&&g.requestHash===task.requestHash))fail('INVALID_INPUT','该媒体没有登记到当前内容的参考资料。');
  if(research&&!researchGrantAuthorized(task,context.snapshot.costs,attempt.id,attempt.mediaGrants?.find(grant=>grant.assetHash===args.audioPath)))fail('MEDIA_NOT_AUTHORIZED','ASR media does not belong to the registered sample source');
  const asset=l.readProductionAsset(workerIdentity(args),args.audioPath);
  const extensions:Record<string,string>={'audio/mpeg':'.mp3','audio/wav':'.wav','audio/x-wav':'.wav','video/mp4':'.mp4','audio/mp4':'.m4a','video/webm':'.webm','audio/ogg':'.ogg','audio/flac':'.flac'};
  const extension=extensions[asset.detectedType];if(!extension||asset.bytes>64*1024*1024)fail('INVALID_INPUT','媒体格式或大小不受支持。');
  return {data:asset.data,extension};
 }
 if(!uuid(args.mutationId)||!args.input||typeof args.input!=='object'||Array.isArray(args.input))fail('INVALID_INPUT','工具事务编号无效。');
 const input=args.input as Record<string,unknown>,required=['taskId','attemptId','claimToken','workerId','requestId',...(op==='productionReserve'?['service']:['status','amount'])],keys=Object.keys(input);
 if(!required.every(k=>Object.hasOwn(input,k))||keys.some(k=>![...required,'usage'].includes(k))||!uuid(input.taskId)||!uuid(input.attemptId)||!uuid(input.claimToken)||typeof input.workerId!=='string'||input.workerId.length>200||typeof input.requestId!=='string'||input.requestId.length>200)fail('INVALID_INPUT','工具身份字段无效。');
 if(op==='productionTaskMutation'&&args.op!=='recordCost')fail('INVALID_INPUT','工具只能回写本次费用。');
 if(op==='productionReserve'&&!['tikhub','model','asr'].includes(input.service as string))fail('INVALID_INPUT','服务类型无效。');
 return l.mutateProduction(op==='productionReserve'?'reserveCost':'recordCost',input,{mutationId:args.mutationId});
}
