import {saveFinalAssets} from '../../../plugin-src/src/lib/final-assets/index.mjs';
import fs from 'node:fs';
import {verifiedBoundReader,verifyBoundRoot} from './bound-reader.mts';
import {createVaultWorkingDraft} from '../../../plugin-src/src/lib/vault/working-draft.mjs';
import {selectCurrentWork} from '../../../plugin-src/src/lib/vault/topics.mjs';
import {readWorkFlow} from '../../../plugin-src/src/lib/vault/workflow.mjs';
import {safe,contentSources} from '../../../plugin-src/src/lib/vault/core.mjs';
import {readSourceInventory,linkSource} from '../../../plugin-src/src/lib/vault/source-map.mjs';
import {readTopicMenus,adoptVaultTopic} from './topic-worker.mts';
import path from 'node:path';
import * as fileLibrary from '../../../plugin-src/src/lib/file-library/index.mjs';
import {readVaultSnapshot,readVaultDocument,readVaultTaskContext,saveVaultDocument,createVaultDocument,trashVaultDocument,vaultRootForRuntime,resolveVaultMutation} from '../../../plugin-src/src/lib/vault/index.mjs';
import {exact,libraryBinding,requireWrite,fail,uuid} from '../shared/validation.ts';
import {vaultDocumentId,vaultPending,vaultDesktopInput} from '../shared/vault-validation.ts';
import type {VaultWorkerOperations,VaultPending,VaultResolution} from '../shared/vault-contracts.ts';
import {isRecord} from '../shared/contracts.ts';
import type {LibraryBinding} from '../shared/contracts.ts';
function workContext(binding:LibraryBinding,contentId:string){const context=readVaultTaskContext(binding.root,contentId),root=vaultRootForRuntime(binding.root);return context?{...context,workflow:root&&context.content?readWorkFlow(root,{vaultId:context.vaultId,workId:context.content.tNumber}):null}:null;}
export const isVaultOperation = (op:unknown):op is keyof VaultWorkerOperations => typeof op==='string'&&['vaultResolve','vaultRead','vaultDocument','vaultContentSource','vaultWorkContext','vaultSelectCurrent','vaultContentDirectory','vaultWorkDirectory','vaultTopicMenus','vaultAdoptTopic','vaultSources','vaultLinkSource','vaultMutate','vaultLocation'].includes(op);
export function executeVault(op:keyof VaultWorkerOperations,args:unknown,mode:'required'|'disabled') {
 const fields=op==='vaultLinkSource'?['binding','selectedRoot','role']:op==='vaultAdoptTopic'?['binding','input']:op==='vaultSelectCurrent'?['binding','contentId','documentId','expectedHash','expectedRevision','decisionText']:op==='vaultResolve'?['binding','mutationId']:['vaultRead','vaultWorkDirectory','vaultTopicMenus','vaultSources'].includes(op)?['binding']:op==='vaultMutate'?['binding','pending']:op==='vaultDocument'?['binding','id']:['vaultContentSource','vaultWorkContext','vaultContentDirectory'].includes(op)?['binding','contentId']:null;
 if (!isRecord(args))fail('INVALID_INPUT','资料请求无效。');
 if (!(fields?exact(args,fields):exact(args,['binding'])||exact(args,['binding','id'])) || !libraryBinding(args.binding)||!path.isAbsolute(args.binding.root)||args.binding.root.includes('\0'))fail('INVALID_INPUT','资料操作拒绝额外、路径或无效字段。');
 const binding=args.binding as LibraryBinding;
 // A root label is metadata, not a request to project every business source.
 if(op==='vaultLocation'&&args.id===undefined){verifyBoundRoot(binding);return vaultRootForRuntime(binding.root)??binding.root;}
 // Business reads retain their existing recovery and lock checks.
 verifiedBoundReader(binding);
 if(op==='vaultResolve'){requireWrite(mode);if(!uuid(args.mutationId))fail('INVALID_INPUT','资料恢复标识无效。');return resolveVaultMutation(binding.root,args.mutationId) as VaultResolution;}
 if(op==='vaultRead')return readVaultSnapshot(binding.root);
 if(op==='vaultTopicMenus')return readTopicMenus(binding);
 if(op==='vaultAdoptTopic'){if(!vaultDesktopInput('adoptVaultTopic',args.input))fail('INVALID_INPUT','选题选择请求无效。');return adoptVaultTopic(binding,args.input as import('../shared/vault-contracts.ts').VaultInputs['adoptVaultTopic'],mode);}
 if(op==='vaultSources'){const root=vaultRootForRuntime(binding.root);return root?readSourceInventory(root):{sources:[],issues:[]};}
 if(op==='vaultLinkSource'){
  requireWrite(mode);if(typeof args.selectedRoot!=='string'||!path.isAbsolute(args.selectedRoot)||!vaultDesktopInput('chooseVaultSource',{role:args.role}))fail('INVALID_INPUT','关联来源无效。');const root=vaultRootForRuntime(binding.root);if(!root)fail('NOT_READY','请打开知识库后关联来源。');
  return linkSource(root,{role:args.role as import('../../../plugin-src/src/lib/vault/source-map.mjs').SourceRole,selectedRoot:args.selectedRoot,authority:args.role==='archive-analysis'?'analysis-copy':args.role==='official-archives'?'official':'candidate',writable:false});
 }
 if(op==='vaultWorkDirectory'){const snapshot=readVaultSnapshot(binding.root);return snapshot?contentSources(snapshot).map((entry:any)=>({contentId:entry.contentId,tNumber:entry.tNumber,title:entry.title,recorded:entry.recorded,published:entry.published,topicStatus:entry.topicStatus,statusEvidence:entry.evidence.filter((e:any)=>['topic-card-status','draft-overview'].includes(e.origin)),hasDraft:entry.sourceCandidates.some((source:any)=>['creation-page','working-draft','final-script','legacy-compare'].includes(source.role))||entry.documents.some((doc:any)=>doc.section==='drafts'&&/(?:参考拆解|叙事|视频框架)[^/]*\.md$/.test(doc.relativePath)),sourceResolution:entry.sourceResolution,sourceConflict:entry.document.sourceConflict??null,relativePath:entry.document.relativePath})):[];}
 if(op==='vaultWorkContext'){if(!uuid(args.contentId))fail('INVALID_INPUT','内容标识无效。');return workContext(binding,args.contentId);}
 if(op==='vaultSelectCurrent'){
  requireWrite(mode);if(!uuid(args.contentId)||!vaultDocumentId(args.documentId)||typeof args.expectedHash!=='string'||typeof args.expectedRevision!=='string'||typeof args.decisionText!=='string'||!args.decisionText.trim()||args.decisionText.length>2000)fail('INVALID_INPUT','当前稿选择无效。');
  const context=readVaultTaskContext(binding.root,args.contentId),content=context?.content,root=vaultRootForRuntime(binding.root);
  if(!context||!content||!root)fail('NOT_FOUND','内容来源不存在。');
  selectCurrentWork(root,{work:{vaultId:context.vaultId,workId:content.tNumber},documentId:args.documentId,expectedHash:args.expectedHash,expectedRevision:args.expectedRevision,authorDecision:{actor:'author',text:args.decisionText,at:new Date().toISOString()}});
  return workContext(binding,args.contentId);
 }
 if(op==='vaultContentDirectory'){
  if(!uuid(args.contentId))fail('INVALID_INPUT','内容标识无效。');const context=readVaultTaskContext(binding.root,args.contentId),root=vaultRootForRuntime(binding.root);
  if(!root||!context?.contentDirectory)fail('NOT_FOUND','此内容尚无原位草稿目录。');
  const location=safe(root,context.contentDirectory);if(!fs.statSync(location).isDirectory())fail('NOT_FOUND','原稿目录不存在。');return location;
 }
 if(op==='vaultContentSource'){
  if(!uuid(args.contentId))fail('INVALID_INPUT','内容标识无效。');
  const context=readVaultTaskContext(binding.root,args.contentId);
  if(!context)return null;
  const content=context.content;
  if(content===null)fail('NOT_FOUND','此内容缺少可读取的原位来源，请刷新或恢复原文件后继续。');
  if(!isRecord(content)||!vaultDocumentId(content.sourceDocumentId))fail('CORRUPT','当前稿来源登记无效。');
  if(content.sourceMissing)fail('NOT_FOUND','当前稿来源已移走或不可读取，请恢复原文件后继续。');
  if(typeof content.sourceConflict==='string'&&content.sourceConflict)fail('CONFLICT',content.sourceConflict);
  return readVaultDocument(binding.root,content.sourceDocumentId);
 }
 if(op==='vaultMutate'){
  requireWrite(mode);
  if(!vaultPending(args.pending))fail('INVALID_INPUT','资料变更意图无效。');
  const pending=args.pending as VaultPending;
  if(pending.binding.libraryId!==binding.libraryId||pending.binding.rootIdentity.dev!==binding.rootIdentity.dev||pending.binding.rootIdentity.ino!==binding.rootIdentity.ino)fail('CONFLICT','资料变更绑定的知识库已改变。');
  const options={mutationId:pending.mutationId};
  if(pending.method==='saveFinalAssets'){const input=pending.input;if(typeof fileLibrary.ensureSelectedCoverDecoded!=='function')fail('NOT_READY','已选封面验证能力尚未就绪。');return fileLibrary.ensureSelectedCoverDecoded(binding.root,{contentId:input.contentId}).then(()=>{verifyBoundRoot(binding);return saveFinalAssets(binding.root,input,options);});}
  if(pending.method==='saveVaultDocument')return saveVaultDocument(binding.root,pending.input,options);
  if(pending.method==='createVaultWorkingDraft')return createVaultWorkingDraft(binding.root,pending.input,options);
  if(pending.method==='createVaultDocument')return createVaultDocument(binding.root,pending.input,options);
  return trashVaultDocument(binding.root,pending.input,options);
 }
 if(op==='vaultLocation'){
  const root=vaultRootForRuntime(binding.root)??binding.root;
  if(args.id===undefined)return root;
  if(!vaultDocumentId(args.id))fail('INVALID_INPUT','资料标识无效。');
  const document=readVaultSnapshot(binding.root)?.documents.find(item=>item.id===args.id);
  if(!document)fail('NOT_FOUND','资料不存在，请刷新知识库。');
  const location=path.resolve(root,document.relativePath),relative=path.relative(root,location);
  if(!relative||relative.startsWith(`..${path.sep}`)||relative==='..'||path.isAbsolute(relative))fail('UNSAFE_PATH','资料位置超出知识库。');
  let current=root;
  for(const part of relative.split(path.sep)){
   current=path.join(current,part);const stat=fs.lstatSync(current);
   if(stat.isSymbolicLink())fail('UNSAFE_PATH','资料位置不能经过符号链接。');
  }
  if(fs.realpathSync(location)!==location)fail('UNSAFE_PATH','资料位置已改变。');
  return location;
 }
 if(!vaultDocumentId(args.id))fail('INVALID_INPUT','资料标识无效。');
 return readVaultDocument(binding.root,args.id);
}
