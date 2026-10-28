import {vaultReferenceLinks} from '../shared/vault-reference-links.ts';
import {randomUUID} from 'node:crypto';
import {validateInput,requireWrite,fail} from '../shared/validation.ts';
import type {DesktopController} from './controller.mts';
import type {VaultInputs,VaultMutationMethod,VaultPending,VaultText,VaultRecovery,VaultMutationResult} from '../shared/vault-contracts.ts';
export class VaultController {
 owner:DesktopController;
 private readingQueue:Promise<unknown>=Promise.resolve();
 private readingQueued=0;
 private documentRead<T>(action:()=>Promise<T>):Promise<T>{
  if(this.readingQueued>=100)return Promise.reject(Object.assign(new Error('原文读取队列已满，请稍后重试。'),{code:'BUSY'}));
  this.readingQueued++;const result=this.readingQueue.then(async()=>{const deadline=Date.now()+10_000;while(this.owner.busy){if(Date.now()>deadline)fail('BUSY','当前操作尚未完成，请稍后重新读取原文。');await new Promise(resolve=>setTimeout(resolve,40));}return this.owner.exclusive(action);}).finally(()=>{this.readingQueued--;});this.readingQueue=result.catch(()=>{});return result;
 }
 openBoundSource?:(binding:import('../shared/contracts.ts').LibraryBinding,sourceId:string,relativePath:string)=>Promise<void>;
 constructor(owner:DesktopController){this.owner=owner;}
 readDocumentView(input:VaultInputs['readDocumentView']){validateInput('readDocumentView',input);return this.documentRead(()=>{this.owner.noPending();return this.owner.worker.call('documentView',{binding:this.owner.current(),input});});}
 readDocumentReference(input:VaultInputs['readDocumentReference']){validateInput('readDocumentReference',input);return this.documentRead(()=>{this.owner.noPending();return this.owner.worker.call('documentReference',{binding:this.owner.current(),input});});}
 openDocumentExternalReference(input:VaultInputs['openDocumentExternalReference']){validateInput('openDocumentExternalReference',input);requireWrite(this.owner.authMode);return this.documentRead(async()=>{
  this.owner.noPending();if(!this.owner.openPublicationURL)fail('NOT_READY','此安装没有系统浏览器入口。');
  const binding=this.owner.current(),url=await this.owner.worker.call('documentExternalReference',{binding,input});
  if(JSON.stringify(this.owner.current())!==JSON.stringify(binding))fail('CONFLICT','内容库已变化，请重新打开原文。');
  try{await this.owner.openPublicationURL(url);}catch{fail('REFERENCE_OPEN_FAILED','系统未能打开链接，可复制原URL后重试。');}return {opened:true as const};
 });}

 readVault(input?:undefined){validateInput('readVault',input);return this.owner.exclusive(()=>this.owner.worker.call('vaultRead',{binding:this.owner.current()}));}
 readVaultContentSource(input:VaultInputs['readVaultContentSource']){validateInput('readVaultContentSource',input);return this.owner.exclusive(()=>this.owner.worker.call('vaultContentSource',{binding:this.owner.current(),contentId:input.contentId}));}
 readVaultWorkContext(input:VaultInputs['readVaultWorkContext']){validateInput('readVaultWorkContext',input);return this.owner.exclusive(()=>this.owner.worker.call('vaultWorkContext',{binding:this.owner.current(),contentId:input.contentId}));}
 readVaultWorkDirectory(input?:undefined){validateInput('readVaultWorkDirectory',input);return this.owner.exclusive(()=>this.owner.worker.call('vaultWorkDirectory',{binding:this.owner.current()}));}
 readVaultTopicMenus(input?:undefined){validateInput('readVaultTopicMenus',input);return this.owner.exclusive(()=>this.owner.worker.call('vaultTopicMenus',{binding:this.owner.current()}));}
 readVaultSources(input?:undefined){validateInput('readVaultSources',input);return this.owner.exclusive(()=>this.owner.worker.call('vaultSources',{binding:this.owner.current()}));}
 async chooseVaultSource(input:VaultInputs['chooseVaultSource']){validateInput('chooseVaultSource',input);requireWrite(this.owner.authMode);return this.owner.exclusive(async()=>{this.owner.noPending();const selectedRoot=await this.owner.dialogs.sourceRoot?.(input.role);return selectedRoot?this.owner.worker.call('vaultLinkSource',{binding:this.owner.current(),selectedRoot,role:input.role}):null;});}
 async revealVaultReference(input:VaultInputs['revealVaultReference']){
  validateInput('revealVaultReference',input);requireWrite(this.owner.authMode);
  return this.owner.exclusive(async()=>{
   if(!this.owner.revealFolder)fail('NOT_READY','此安装没有文件管理器入口。');
   const location=await this.owner.worker.call('vaultReferenceLocation',{binding:this.owner.current(),...input});
   this.owner.revealFolder(location);return {revealed:true as const};
  });
 }
 async openVaultReference(input:VaultInputs['openVaultReference']){
  validateInput('openVaultReference',input);requireWrite(this.owner.authMode);
  return this.owner.exclusive(async()=>{
   if(!this.owner.openPublicationURL)fail('NOT_READY','此安装没有浏览器打开入口。');
   const card=await this.owner.worker.call('vaultDocument',{binding:this.owner.current(),id:input.id});
   if(card.document.section!=='topics'||card.document.format!=='markdown')fail('INVALID_REFERENCE_LINK','请从原选题卡打开参考链接。');
   if(!vaultReferenceLinks(card,[]).some(link=>link.url===input.url))fail('INVALID_REFERENCE_LINK','原文中的链接已变化，请刷新后再打开。');
   let url:URL;
   try{url=new URL(input.url);}catch{fail('INVALID_REFERENCE_LINK','原文不是完整的网页链接。');}
   if(!['http:','https:'].includes(url.protocol)||!url.hostname||url.username||url.password)fail('INVALID_REFERENCE_LINK','只支持不含账号密码的 HTTP 或 HTTPS 链接。');
   try{await this.owner.openPublicationURL(url.href);}catch{fail('REFERENCE_OPEN_FAILED','系统未能打开链接，可复制后重试。');}
   return {opened:true as const};
  });
 }
 async openVaultSourcePage(input:VaultInputs['openVaultSourcePage']){validateInput('openVaultSourcePage',input);return this.owner.exclusive(async()=>{if(!this.openBoundSource)fail('NOT_READY','此环境没有原资料页面服务。');const binding=this.owner.current();await this.owner.worker.call('jinchengSourcePage',{binding,...input});await this.openBoundSource(binding,input.sourceId,input.relativePath);return {opened:true as const};});}
 adoptVaultTopic(input:VaultInputs['adoptVaultTopic']){validateInput('adoptVaultTopic',input);requireWrite(this.owner.authMode);return this.owner.exclusive(()=>{this.owner.noPending();return this.owner.worker.call('vaultAdoptTopic',{binding:this.owner.current(),input});});}
 selectVaultCurrentWork(input:VaultInputs['selectVaultCurrentWork']){validateInput('selectVaultCurrentWork',input);requireWrite(this.owner.authMode);return this.owner.exclusive(()=>{this.owner.noPending();return this.owner.worker.call('vaultSelectCurrent',{binding:this.owner.current(),...input});});}
 revealVaultContentDirectory(input:VaultInputs['revealVaultContentDirectory']){validateInput('revealVaultContentDirectory',input);return this.owner.exclusive(async()=>{if(!this.owner.revealFolder)fail('NOT_READY','此环境没有文件管理器入口。');const location=await this.owner.worker.call('vaultContentDirectory',{binding:this.owner.current(),...input});this.owner.revealFolder(location);return {revealed:true as const};});}
 readVaultDocument(input:VaultInputs['readVaultDocument']){validateInput('readVaultDocument',input);return this.owner.exclusive(()=>this.owner.worker.call('vaultDocument',{binding:this.owner.current(),id:input.id}));}
 async revealVaultDocument(input:VaultInputs['revealVaultDocument']){validateInput('revealVaultDocument',input);return this.owner.exclusive(async()=>{if(!this.owner.revealFolder)fail('NOT_READY','此安装没有文件管理器入口。');const location=await this.owner.worker.call('vaultLocation',{binding:this.owner.current(),id:input.id});this.owner.revealFolder(location);return {revealed:true as const};});}
 async mutate<K extends VaultMutationMethod>(method:K,input:VaultInputs[K]){
  validateInput(method,input);requireWrite(this.owner.authMode);
  return this.owner.exclusive(async()=>{
   this.owner.noPending();const binding=this.owner.current();
   const pending={method,input:structuredClone(input),mutationId:randomUUID(),binding:{libraryId:binding.libraryId,rootIdentity:{...binding.rootIdentity}}} as VaultPending;
   await this.owner.persist({...this.owner.binding,vaultPending:pending});
   return this.dispatch();
  });
 }
 async dispatch(){const pending=this.owner.binding.vaultPending;if(!pending)fail('NO_PENDING','没有需要核验的资料修改。');const result=await this.owner.worker.call('vaultMutate',{binding:this.owner.current(),pending});await this.owner.persist({...this.owner.binding,vaultPending:null});return result;}
 async recovery(pending:VaultPending,result:VaultMutationResult):Promise<VaultRecovery>{
  let current:VaultText|null=null;
  if('document' in result){try{current=await this.owner.worker.call('vaultDocument',{binding:this.owner.current(),id:result.document.id});}catch{/* Preserve the committed identity even if today's source was moved or became unavailable. */}}
  await this.owner.persist({...this.owner.binding,vaultPending:null});
  return {mutationId:pending.mutationId,method:pending.method,input:pending.input,outcome:'committed',result,current};
 }
 async recoverVaultMutation(input:VaultInputs['recoverVaultMutation']){
  validateInput('recoverVaultMutation',input);requireWrite(this.owner.authMode);
  return this.owner.exclusive(async()=>{
   const pending=this.owner.binding.vaultPending;if(!pending)return null;
   const resolved=await this.owner.worker.call('vaultResolve',{binding:this.owner.current(),mutationId:pending.mutationId});
   if(resolved.state==='uncertain')fail('PENDING_MUTATION','上次资料修改结果仍不确定。请恢复原知识库后再次核验，本次填写继续保留。');
   if(resolved.state==='committed')return this.recovery(pending,resolved.result);
   if(input.action==='discard'){
    let current:VaultText|null=null;
    if('id' in pending.input){try{current=await this.owner.worker.call('vaultDocument',{binding:this.owner.current(),id:pending.input.id});}catch{/* Keep the retained author input read-only until its original source can be restored. */}}
    await this.owner.persist({...this.owner.binding,vaultPending:null});
    return {mutationId:pending.mutationId,method:pending.method,input:pending.input,outcome:'discarded' as const,result:null,current};
   }
   // A missing receipt permits retrying precisely the durable intent, never a fresh mutation.
   const result=await this.owner.worker.call('vaultMutate',{binding:this.owner.current(),pending});
   return this.recovery(pending,result);
  });
 }
 saveVaultDocument(input:VaultInputs['saveVaultDocument']){return this.mutate('saveVaultDocument',input) as Promise<VaultText>;}
 createVaultWorkingDraft(input:VaultInputs['createVaultWorkingDraft']){return this.mutate('createVaultWorkingDraft',input) as Promise<VaultText>;}
 createVaultDocument(input:VaultInputs['createVaultDocument']){return this.mutate('createVaultDocument',input) as Promise<VaultText>;}
 trashVaultDocument(input:VaultInputs['trashVaultDocument']){return this.mutate('trashVaultDocument',input) as Promise<{trashed:true}>;}
}
