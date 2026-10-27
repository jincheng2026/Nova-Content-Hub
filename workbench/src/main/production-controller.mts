import {contentCreationPrompt} from '../shared/content-creation-workflow.ts';
import {researchDepthRequirements} from '../shared/research-depth.ts';
import {productionLaunchFailure} from './assistant-failure.mts';
import {radarQueryOperations,radarSearchFilters,radarPrompt} from '../../../plugin-src/src/lib/file-library/radar.mjs';
import {publicEndpoint} from './service-tools.mts';
import type {RadarQuery,RadarAdopt,RadarDecision,RadarReport} from '../shared/radar-contracts.ts';
import {platformCollectionCapability} from '../shared/platform-catalog.ts';
import fs from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {fail,requireWrite} from '../shared/validation.ts';
import {productionDesktopInput} from '../shared/production-validation.ts';
import type {Binding,LibraryBinding,Worker,Dialogs} from '../shared/contracts.ts';
import type {ProductionMutation,ProductionStart,ProductionAction,ProductionDraft,ProductionPending,ProductionSnapshot,ProductionInputs,ProductionCreationState,ProductionFile} from '../shared/production-contracts.ts';
import type {ServiceSettingsView,ServiceBrokerDescriptor} from '../shared/service-contracts.ts';
export interface ProductionCallbacks {
 launch(binding:LibraryBinding,reference:{taskId:string;attemptId:string;requestHash:string;host:'codex'|'workbuddy'}):Promise<void>;
 focus?(host:'codex'|'workbuddy'):Promise<void>;
 open(binding:LibraryBinding,target:ProductionInputs['openProductionLink']):Promise<string>;
 serviceSettings():Promise<ServiceSettingsView>;
 openSource?(url:string):Promise<void>;
 costReconciled?(requestId:string):Promise<void>;
 servicesDescriptor?():ServiceBrokerDescriptor|null|Promise<ServiceBrokerDescriptor|null>;
}
interface ProductionOwner {binding:Binding;authMode:'required'|'disabled';worker:Worker;dialogs:Dialogs;covers:{grant(hash:string):string};current():LibraryBinding;noPending():void;persist(binding:Binding):Promise<void>;exclusive<T>(action:()=>Promise<T>):Promise<T>}
export class ProductionController {
 readonly owner:ProductionOwner; readonly callbacks:ProductionCallbacks;
 constructor(owner:ProductionOwner,callbacks:ProductionCallbacks){this.owner=owner;this.callbacks=callbacks;}
 validate(method:string,input:unknown){if(productionDesktopInput(method,input)!==true)fail('INVALID_INPUT','生产任务拒绝无效或额外字段。');requireWrite(this.owner.authMode);}
 decorate(snapshot:ProductionSnapshot):ProductionSnapshot {
  const next=structuredClone(snapshot);
  for(const task of next.tasks)for(const attempt of task.attempts)attempt.claimToken=null;
  next.assetUrls=Object.fromEntries([...new Set(next.accounts.flatMap(a=>a.images))].filter(h=>!next.missingAssetHashes?.includes(h)).map(h=>[h,this.owner.covers.grant(h)]));
  return next;
 }
 async read(){return this.decorate(await this.owner.worker.call('productionRead',{binding:this.owner.current()}));}
 readProduction(input?:undefined){this.validate('readProduction',input);return this.owner.exclusive(()=>this.read());}
 readProductionCreation(input:ProductionInputs['readProductionCreation']){this.validate('readProductionCreation',input);return this.owner.exclusive(()=>this.owner.worker.call('productionCreation',{binding:this.owner.current(),...input}));}
 async write(pending:ProductionPending) {
  this.owner.noPending();this.owner.current();
  await this.owner.persist({...this.owner.binding,productionPending:pending});
  const result=await this.owner.worker.call('productionMutate',{binding:this.owner.current(),pending});
  if(pending.kind!=='files') {
   const receipt=await this.owner.worker.call('productionRecover',{binding:this.owner.current(),pending});
   if(!receipt.found)fail('PENDING_MUTATION','操作结果尚未核验，原输入已保留。');
  }
  await this.reconciled(pending);
  await this.owner.persist({...this.owner.binding,productionPending:null});
  return result;
 }
 async reconciled(pending:ProductionPending){
  if(pending.kind==='mutate'&&pending.op==='reconcileCost'&&this.callbacks.costReconciled){const snapshot=await this.owner.worker.call('productionRead',{binding:this.owner.current()}),cost=snapshot.costs.find(c=>c.id===pending.input.id);if(!cost)fail('PENDING_MUTATION','费用核验结果无法定位。');await this.callbacks.costReconciled(cost.requestId);}
 }
 pendingBase(mutationId:string=randomUUID()){const b=this.owner.current();return {mutationId,binding:{libraryId:b.libraryId,rootIdentity:{...b.rootIdentity}}};}
 mutateProduction(input:ProductionMutation){this.validate('mutateProduction',input);return this.owner.exclusive(async()=>{await this.write({...this.pendingBase(input.mutationId),kind:'mutate',op:input.op,input:input.input});return this.read();});}
 async launch(taskId:string):Promise<{opened:boolean;message?:string}> {
  const b=this.owner.current(),snapshot=await this.owner.worker.call('productionRead',{binding:b}),task=snapshot.tasks.find(t=>t.id===taskId),attempt=task?.attempts.find(a=>a.id===task.activeAttemptId);
  if(!task||!attempt)fail('NOT_FOUND','任务不存在。');
  if(['accepted','cancelled','failed'].includes(attempt.status))fail('ATTEMPT_INACTIVE','此任务已结束，请重试后打开。');
  if(attempt.status==='submitted')return {opened:false,message:'任务结果已提交，请在创作页或任务结果中预览并确认采用。'};
  if(attempt.status!=='created'){
   if(!this.callbacks.focus)return {opened:false,message:'请在原对话继续此任务；当前无法自动定位原聊天，请手动打开所选助手。'};
   try{await this.callbacks.focus(attempt.host);return {opened:true,message:'已打开助手，请在原对话继续，当前无法自动定位原聊天。'};}
   catch(error){return {opened:false,message:productionLaunchFailure(error)};}
  }
  try{await this.callbacks.launch(b,{taskId:task.id,attemptId:attempt.id,requestHash:task.requestHash,host:attempt.host});return {opened:true};}
  catch(error){return {opened:false,message:productionLaunchFailure(error)};}
 }
 startProductionTask(input:ProductionStart){this.validate('startProductionTask',input);return this.owner.exclusive(async()=>{
  this.owner.noPending();const b=this.owner.current();let snapshot=await this.owner.worker.call('productionRead',{binding:b});
  if(input.workflow==='content-creation'){
   const existing=[...snapshot.tasks].reverse().find(task=>task.contentId===input.contentId&&task.request.parameters!==null&&typeof task.request.parameters==='object'&&!Array.isArray(task.request.parameters)&&task.request.parameters.workflow==='content-creation'&&task.attempts.some(attempt=>attempt.id===task.activeAttemptId&&['created','claimed','waiting-user','waiting-permission','submitted'].includes(attempt.status)));
   if(existing){const launched=await this.launch(existing.id);return {snapshot:await this.read(),...launched};}
   if(!snapshot.creations.some(creation=>creation.contentId===input.contentId))snapshot=await this.write({...this.pendingBase(),kind:'mutate',op:'ensureCreation',input:{contentId:input.contentId,expectedToken:snapshot.editToken}}) as ProductionSnapshot;
  }
  const settings=await this.callbacks.serviceSettings(),v=settings.values;
  const bodyHash=input.contentId?(await this.owner.worker.call('productionCreation',{binding:b,contentId:input.contentId})).content.bodyHash:null;
  const serviceDescriptor=await this.callbacks.servicesDescriptor?.();
  const account=input.accountId?snapshot.accounts.find(account=>account.id===input.accountId&&!account.deletedAt):undefined;
  if(input.accountId&&!account)fail('NOT_FOUND','对标账号不存在，请刷新后重新选择。');
  const platformCollection=account?platformCollectionCapability(account.platform):null;
  const parameters={...(input.workflow?{workflow:input.workflow}:{}),...(account?{platform:account.platform,platformCollection}:{}),mode:input.mode,...(input.kind==='research'?{researchDepth:researchDepthRequirements(input.mode)}:{}),comments:input.comments&&v.commentsEnabled&&platformCollection!=='manual',budgetEnabled:v.budget.enabled,maxRequestsPerTask:v.budget.maxRequestsPerTask,serviceConfig:{model:v.model,asr:v.asr},...(serviceDescriptor?{serviceDescriptor:{version:serviceDescriptor.version,host:serviceDescriptor.host,port:serviceDescriptor.port}}:{})};
  const tools=platformCollection==='manual'?['model','asr']:['tikhub','model','asr'];
  const prior=new Set(snapshot.tasks.map(t=>t.id));
  const result=await this.write({...this.pendingBase(),kind:'mutate',op:'createTask',input:{kind:input.kind,title:input.title,prompt:input.workflow==='content-creation'?contentCreationPrompt(input.prompt):input.prompt,contentId:input.contentId??null,accountId:input.accountId??null,host:this.owner.binding.assistant??'codex',parameters,tools,budget:{amount:v.budget.enabled?v.budget.maxRequestsPerTask:0,currency:'REQ'},bodyHash,expectedToken:snapshot.editToken}}) as ProductionSnapshot;
  const task=result.tasks.find(t=>!prior.has(t.id));if(!task)fail('PENDING_MUTATION','任务已写入但无法定位，请刷新原任务列表。');
  const launched=await this.launch(task.id);return {snapshot:await this.read(),...launched};
 });}
 createRadarTask(input:RadarQuery){this.validate('createRadarTask',input);return this.owner.exclusive(async()=>{
  this.owner.noPending();const snapshot=await this.owner.worker.call('productionRead',{binding:this.owner.current()}),settings=await this.callbacks.serviceSettings(),v=settings.values,ops=radarQueryOperations(input),query=structuredClone(input);
  const budget=v.budget.enabled&&ops.length?Math.min(4,1+query.sampleLimit,v.budget.maxRequestsPerTask):0,descriptor=await this.callbacks.servicesDescriptor?.();
  const parameters={workflow:'viral-radar',query,operations:budget?ops:[],search:radarSearchFilters(query),comments:false,budgetEnabled:budget>0,maxRequestsPerTask:budget,...(descriptor?{serviceDescriptor:{version:descriptor.version,host:descriptor.host,port:descriptor.port}}:{})};
  const prior=new Set(snapshot.tasks.map(t=>t.id));
  const result=await this.write({...this.pendingBase(),kind:'mutate',op:'createTask',input:{kind:'research',title:`${query.direction} · 低粉爆款雷达`,prompt:radarPrompt(query)+(budget?'':' 本次未授权付费采集；只接受用户材料与可核验人工来源。'),contentId:null,accountId:null,host:this.owner.binding.assistant??'codex',parameters,tools:budget?['tikhub']:[],budget:{amount:budget,currency:'REQ'},bodyHash:null,expectedToken:snapshot.editToken}}) as ProductionSnapshot;
  const task=result.tasks.find(t=>!prior.has(t.id));if(!task)fail('PENDING_MUTATION','雷达任务已写入，定位尚待核验。');return {snapshot:await this.read(),...await this.launch(task.id)};
 });}
 adoptRadarResult(input:RadarAdopt){this.validate('adoptRadarResult',input);return this.owner.exclusive(async()=>{await this.write({...this.pendingBase(),kind:'mutate',op:'adoptRadarResult',input:{...input}});return this.read();});}
 decideRadarCandidate(input:RadarDecision){this.validate('decideRadarCandidate',input);return this.owner.exclusive(async()=>{await this.write({...this.pendingBase(),kind:'mutate',op:'decideRadarCandidate',input:{...input}});return this.read();});}
 openRadarSource(input:ProductionInputs['openRadarSource']){this.validate('openRadarSource',input);return this.owner.exclusive(async()=>{
  const snapshot=await this.owner.worker.call('productionRead',{binding:this.owner.current()}),report=snapshot.reports.find(r=>r.id===input.reportId&&!r.deletedAt&&r.type==='viral-radar'),radar=(report?.meta as {radar?:RadarReport}|undefined)?.radar,candidate=radar?.candidates.find(c=>c.id===input.candidateId);
  if(!candidate)fail('NOT_FOUND','雷达来源不存在。');if(!this.callbacks.openSource)fail('NOT_READY','系统外链打开入口尚未配置。');
  const checked=await publicEndpoint(candidate.url);await this.callbacks.openSource(checked.url.href);return {opened:true as const};
 });}
 openProductionTask(input:ProductionInputs['openProductionTask']){this.validate('openProductionTask',input);return this.owner.exclusive(async()=>{
  this.owner.noPending();
  const snapshot=await this.owner.worker.call('productionRead',{binding:this.owner.current()}),task=snapshot.tasks.find(t=>t.id===input.taskId),attempt=task?.attempts.find(a=>a.id===task.activeAttemptId);
  if(!attempt)fail('NOT_FOUND','任务不存在。');
  if(input.host&&input.host!==attempt.host)await this.write({...this.pendingBase(),kind:'mutate',op:'retryTask',input:{taskId:input.taskId,host:input.host,expectedToken:snapshot.editToken}});
  return this.launch(input.taskId);
 });}
 actProductionTask(input:ProductionAction){this.validate('actProductionTask',input);return this.owner.exclusive(async()=>{
  const snapshot=await this.owner.worker.call('productionRead',{binding:this.owner.current()}),task=snapshot.tasks.find(t=>t.id===input.taskId),attempt=task?.attempts.find(a=>a.id===task.activeAttemptId);
  if(!attempt)fail('NOT_FOUND','任务不存在。');
  const request=input.action==='accept'?{taskId:input.taskId,attemptId:input.attemptId,receiptHash:input.receiptHash,expectedToken:input.expectedToken}:input.action==='retry'?{taskId:input.taskId,host:input.host??attempt.host,expectedToken:snapshot.editToken}:{taskId:input.taskId,expectedToken:snapshot.editToken};
  const written=await this.write({...this.pendingBase(),kind:'mutate',op:input.action==='accept'?'acceptTask':input.action==='retry'?'retryTask':'cancelTask',input:request}) as ProductionSnapshot;const current=await this.read();return {...current,...(written.archiveWarnings?.length?{archiveWarnings:written.archiveWarnings}:{})};
 });}
 openProductionLink(input:ProductionInputs['openProductionLink']){this.validate('openProductionLink',input);return this.owner.exclusive(async()=>{const message=await this.callbacks.open(this.owner.current(),input);return {opened:true as const,...(input.kind==='task-archive'&&message?{message}:{})};});}
 chooseProductionFiles(input:ProductionInputs['chooseProductionFiles']){this.validate('chooseProductionFiles',input);return this.owner.exclusive(async()=>{this.owner.noPending();const sources=await this.owner.dialogs.productionFiles?.(input.kind);if(!sources?.length)return null;const hashes:string[]=[];for(const source of sources){const stat=await fs.lstat(source);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>64*1024*1024)fail('INVALID_FILES','请选择64 MiB以内的普通文件。');hashes.push(createHash('sha256').update(await fs.readFile(source)).digest('hex'));}const files=await this.write({...this.pendingBase(),kind:'files',fileKind:input.kind,sources,hashes}) as ProductionFile[];return files.map(f=>({...f,...(input.kind==='images'?{url:this.owner.covers.grant(f.assetHash)}:{})}));});}
 saveProductionDraft(input:ProductionDraft){this.validate('saveProductionDraft',input);return this.owner.exclusive(async()=>await this.write({...this.pendingBase(),kind:'draft',input}) as ProductionCreationState);}
 readProductionPending(input?:undefined){this.validate('readProductionPending',input);return Promise.resolve({pending:!!this.owner.binding.productionPending,message:this.owner.binding.productionPending?'上次操作结果尚待核验。原输入与事务编号已保留，重试将只核验并继续原操作。':''});}
 recoverProductionPending(input:ProductionInputs['recoverProductionPending']){this.validate('recoverProductionPending',input);return this.owner.exclusive(async()=>{
  const pending=this.owner.binding.productionPending;if(!pending)return this.read();
  if(input.action==='discard'){await this.owner.persist({...this.owner.binding,productionPending:null});return this.read();}
  const b=this.owner.current(),receipt=await this.owner.worker.call('productionRecover',{binding:b,pending});
  if(!receipt.found)await this.owner.worker.call('productionMutate',{binding:b,pending});
  if(pending.kind!=='files'&&!(await this.owner.worker.call('productionRecover',{binding:b,pending})).found)fail('PENDING_MUTATION','原操作仍无法核验，请保留恢复记录。');
  await this.reconciled(pending);
  await this.owner.persist({...this.owner.binding,productionPending:null});return this.read();
 });}
}
