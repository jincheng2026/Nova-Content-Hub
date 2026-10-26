import path from 'node:path';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import {openLibrary} from '../../../plugin-src/src/lib/file-library/index.mjs';
import {validateImportedRaster} from '../../../plugin-src/src/lib/image-validation/index.mjs';
import {exact,libraryBinding,uuid,token,requireWrite,fail} from '../shared/validation.ts';
import {productionPending} from '../shared/production-validation.ts';
import type {ProductionWorkerOperations,ProductionPending,ProductionFile,ProductionCreationState} from '../shared/production-contracts.ts';
import type {ProductionCoreLibrary} from '../shared/production-core.d.ts';
import type {LibraryBinding} from '../shared/contracts.ts';
const ops=new Set(['productionContext','productionReserve','productionTaskMutation','productionAsset','productionRead','productionCreation','productionMutate','productionRecover','productionReport']);
export const isProductionOperation=(op:unknown):op is keyof ProductionWorkerOperations=>typeof op==='string'&&ops.has(op);
const same=(p:ProductionPending,b:LibraryBinding)=>p.binding.libraryId===b.libraryId&&p.binding.rootIdentity.dev===b.rootIdentity.dev&&p.binding.rootIdentity.ino===b.rootIdentity.ino;
const creation=(l:ProductionCoreLibrary,id:string):ProductionCreationState=>{const v=l.readProductionCreation(id);return {content:{id:v.content.id,title:v.content.title,body:v.content.body,editToken:v.content.editToken,bodyHash:v.content.bodyHash,deletedAt:v.content.deletedAt},creation:v.creation,productionToken:v.productionToken};};
async function files(l:ProductionCoreLibrary,p:Extract<ProductionPending,{kind:'files'}>):Promise<ProductionFile[]> {
 const output:ProductionFile[]=[];
 if(p.sources.length>(p.fileKind==='media'?1:p.fileKind==='images'?50:100))fail('INVALID_FILES','选择的文件数量超过限制。');
 for(const [index,source] of p.sources.entries()) {
  if(!path.isAbsolute(source)||source.includes('\0'))fail('INVALID_FILES','必须选择本机普通文件。');
  const stat=await fs.lstat(source),ext=path.extname(source).toLowerCase();
  const extensions=p.fileKind==='images'?['.png','.jpg','.jpeg','.webp','.gif']:p.fileKind==='report'?['.html','.htm']:['.mp3','.mp4','.m4a','.wav','.webm','.ogg','.flac','.mov'];
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>(p.fileKind==='report'?2:64)*1024*1024||!extensions.includes(ext))fail('INVALID_FILES','文件格式、大小或位置不可用。');
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
 if(['productionContext','productionReserve','productionTaskMutation','productionAsset'].includes(op))return executeTool(op,args);

 const fields=op==='productionRead'?['binding']:op==='productionCreation'?['binding','contentId']:op==='productionReport'?null:['binding','pending'];
 if(!(fields?exact(args,fields):typeof args==='object'&&args!==null&&Object.keys(args).every(k=>['binding','reportId','pageId'].includes(k)))||!args||!libraryBinding((args as {binding:unknown}).binding))fail('INVALID_INPUT','生产任务参数无效。');
 const a=args as {binding:LibraryBinding;pending?:ProductionPending;contentId?:string;reportId?:string;pageId?:string};
 if(!path.isAbsolute(a.binding.root)||a.binding.root.includes('\0'))fail('INVALID_INPUT','内容库路径无效。');
 if(op==='productionCreation'&&!uuid(a.contentId)||op==='productionReport'&&(!uuid(a.reportId)||a.pageId!==undefined&&!uuid(a.pageId)))fail('INVALID_INPUT','对象编号无效。');
 if((op==='productionMutate'||op==='productionRecover')&&(!productionPending(a.pending)||!same(a.pending,a.binding)))fail('CONFLICT','待核验操作与当前内容库不一致。');
 const l=openLibrary(a.binding.root,{expectedLibraryId:a.binding.libraryId,expectedRootIdentity:a.binding.rootIdentity}) as unknown as ProductionCoreLibrary;
 if(op==='productionRead')return l.readProduction();
 if(op==='productionCreation')return creation(l,a.contentId!);
 if(op==='productionReport') {
  const report=l.readProduction().reports.find(r=>r.id===a.reportId&&!r.deletedAt),page=report?.pages.find(p=>p.id===(a.pageId??report.pageId));
  if(!report||!page)fail('NOT_FOUND','报告页面不存在。');
  const asset=l.readAsset(page.assetHash);
  if(asset.bytes>2*1024*1024||!['text/plain','text/html'].includes(asset.detectedType))fail('INVALID_REPORT','报告不是受支持的 HTML。');
  return {html:new TextDecoder('utf-8',{fatal:true}).decode(asset.data),report};
 }
 const pending=a.pending!;
 if(op==='productionRecover') {
  if(pending.kind==='files')return {found:false};
  const receipt=l.queryMutation(pending.mutationId);
  if(!receipt)return {found:false};
  if(receipt.objectKind!==(pending.kind==='draft'||pending.op==='saveCreation'?'content':'workspace')||receipt.objectId!==(pending.kind==='draft'||pending.op==='saveCreation'?pending.input.contentId:'default'))fail('CONFLICT','事务回执不属于原操作。');
  // Replaying the exact transaction verifies its persisted request digest before clearing recovery intent.
  if(pending.kind==='mutate')l.mutateProduction(pending.op,pending.input,{mutationId:pending.mutationId});
  else {const i=pending.input;l.saveProductionDraft(i.contentId,{body:i.body,expectedBodyHash:i.bodyHash,expectedProductionToken:i.productionToken,creationPatch:i.creationPatch},i.editToken,{mutationId:pending.mutationId});}
  return {found:true,objectId:receipt.objectId};
 }
 if(pending.kind==='files')return files(l,pending);
 if(pending.kind==='mutate')return l.mutateProduction(pending.op,pending.input,{mutationId:pending.mutationId});
 const i=pending.input;l.saveProductionDraft(i.contentId,{body:i.body,expectedBodyHash:i.bodyHash,expectedProductionToken:i.productionToken,creationPatch:i.creationPatch},i.editToken,{mutationId:pending.mutationId});
 return creation(l,i.contentId);
}

function executeTool(op:keyof ProductionWorkerOperations,args:unknown):ProductionWorkerOperations[keyof ProductionWorkerOperations]['result'] {
 const fields=op==='productionContext'?['binding','taskId']:op==='productionAsset'?['binding','taskId','attemptId','claimToken','workerId','audioPath']:op==='productionReserve'?['binding','input','mutationId']:['binding','op','input','mutationId'];
 if(!exact(args,fields)||!libraryBinding(args.binding)||!path.isAbsolute(args.binding.root)||args.binding.root.includes('\0'))fail('INVALID_INPUT','工具调用参数无效。');
 const l=openLibrary(args.binding.root,{expectedLibraryId:args.binding.libraryId,expectedRootIdentity:args.binding.rootIdentity}) as unknown as ProductionCoreLibrary;
 if(op==='productionContext'){if(!uuid(args.taskId))fail('INVALID_INPUT','任务编号无效。');return l.readProductionContext(args.taskId);}
 if(op==='productionAsset') {
  if(!uuid(args.taskId)||!uuid(args.attemptId)||!uuid(args.claimToken)||typeof args.workerId!=='string'||!token(args.audioPath))fail('INVALID_INPUT','音频只接受已登记的资产编号。');
  const context=l.readProductionContext(args.taskId),task=context.task,attempt=task?.attempts.find(a=>a.id===args.attemptId);
  if(!task||!attempt||task.activeAttemptId!==attempt.id||attempt.claimToken!==args.claimToken||attempt.workerId!==args.workerId||!['claimed','waiting-user','waiting-permission'].includes(attempt.status))fail('CLAIM_MISMATCH','工具调用不属于当前运行中的任务。');
  if(!context.creation?.references.some(r=>r.mediaAssetHash===args.audioPath))fail('INVALID_INPUT','该媒体没有登记到当前内容的参考资料。');
  const asset=l.readAsset(args.audioPath);
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
