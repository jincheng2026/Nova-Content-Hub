import {vaultRootForRuntime} from '../../../plugin-src/src/lib/vault/index.mjs';
import {researchBriefFromText} from '../shared/jincheng-research-brief.ts';
import type {ResearchBrief} from '../shared/stage-contracts.ts';
import {validateResearchConfig} from '../../../plugin-src/src/lib/research-runtime/common.mjs';
import {productionReferenceHash, validateTranscriptReference} from '../../../plugin-src/src/lib/file-library/production-reference.mjs';
import {businessSkillForTask} from '../../../plugin-src/src/lib/file-library/production-creator-context.mjs';
import {contentCreationPrompt} from '../shared/content-creation-workflow.ts';
import {researchDepthRequirements} from '../shared/research-depth.ts';
import {productionLaunchFailure} from './assistant-failure.mts';
import {radarQueryOperations,radarSearchFilters,radarPrompt,radarRequestLimit} from '../../../plugin-src/src/lib/file-library/radar.mjs';
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
  next.assetUrls=Object.fromEntries([...new Set(next.accounts.flatMap(a=>[...a.images,...(a.avatarAssetHash?[a.avatarAssetHash]:[])]))].filter(h=>!next.missingAssetHashes?.includes(h)).map(h=>[h,this.owner.covers.grant(h)]));
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
  if(attempt.status==='rejected')fail('ATTEMPT_INACTIVE','此结果已拒绝。请修改要求并显式创建新任务。');
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
  let stageSource:{documentId:string;hash:string;relativePath:string}|null=null;
  if(input.workflow==='jincheng-stage'){
   businessSkillForTask(input.kind,{businessSkill:input.businessSkill},input.accountId??null);
   if(input.source){const source=await this.owner.worker.call('vaultDocument',{binding:b,id:input.source.documentId});if(source.document.hash!==input.source.expectedHash||source.document.contentId!==(input.contentId??null))fail('CONFLICT','此环节的原位来源或内容身份已变化，请重新读取。');stageSource={documentId:source.document.id,hash:source.document.hash,relativePath:source.document.relativePath};}
   if(!stageSource&&input.contentId){const context=await this.owner.worker.call('vaultWorkContext',{binding:b,contentId:input.contentId});if(context?.content){if(context.content.sourceResolution!=='resolved')fail('SOURCE_CONFLICT','请先在工作台选择当前继续写的原件。');stageSource={documentId:context.content.sourceDocumentId,hash:context.content.hash,relativePath:context.content.relativePath};}}
  }
  if(input.workflow==='positioning-interview'||input.workflow==='topic-suggestion'){
   const bodyHash=input.contentId?(await this.owner.worker.call('productionCreation',{binding:b,contentId:input.contentId})).content.bodyHash:null;
   const source=input.source?await this.owner.worker.call('vaultDocument',{binding:b,id:input.source.documentId}):null;
   if(source&&(source.document.hash!==input.source!.expectedHash||source.document.contentId!==(input.contentId??null)))fail('CONFLICT','推荐选题的资料版本或关联内容已变化，请重新读取后再开始。');
   const topicSource=source?{documentId:source.document.id,hash:source.document.hash,relativePath:source.document.relativePath}:null;
   const topicRequestHash=input.workflow==='topic-suggestion'?createHash('sha256').update(JSON.stringify({contentId:input.contentId??null,bodyHash,source:topicSource,prompt:input.prompt})).digest('hex'):null;
   const prompt=source?`${input.prompt}\n\n固定资料来源：${source.document.relativePath}\n资料原文（超长时保留可读取范围，版本已固定）：\n${source.text.slice(0,Math.max(0,95000-input.prompt.length-500))}`:input.prompt;
   const existing=[...snapshot.tasks].reverse().find(task=>task.contentId===(input.contentId??null)&&task.request.parameters!==null&&typeof task.request.parameters==='object'&&!Array.isArray(task.request.parameters)&&task.request.parameters.workflow===input.workflow&&(input.workflow!=='topic-suggestion'||task.request.parameters.topicRequestHash===topicRequestHash)&&task.attempts.some(attempt=>attempt.id===task.activeAttemptId&&['created','claimed','waiting-user','waiting-permission','submitted'].includes(attempt.status)));
   if(existing){const launched=await this.launch(existing.id);return {snapshot:await this.read(),...launched};}
   const prior=new Set(snapshot.tasks.map(task=>task.id));
   const result=await this.write({...this.pendingBase(),kind:'mutate',op:'createTask',input:{kind:input.kind,title:input.title,prompt,contentId:input.contentId??null,accountId:null,host:this.owner.binding.assistant??'codex',parameters:{workflow:input.workflow,businessSkill:input.workflow==='positioning-interview'?'xindao-interview':'xindao-xuanti',...(topicRequestHash?{topicRequestHash,topicSource}:{}),mode:'simple',comments:false,budgetEnabled:false,maxRequestsPerTask:0},tools:[],budget:{amount:0,currency:'REQ'},bodyHash,expectedToken:snapshot.editToken}}) as ProductionSnapshot;
   const task=result.tasks.find(task=>!prior.has(task.id));if(!task)fail('PENDING_MUTATION','任务已保留，请在助手任务中继续。');
   const launched=await this.launch(task.id);return {snapshot:await this.read(),...launched};
  }
  if(input.workflow==='content-creation'){
   const existing=[...snapshot.tasks].reverse().find(task=>task.contentId===input.contentId&&task.request.parameters!==null&&typeof task.request.parameters==='object'&&!Array.isArray(task.request.parameters)&&task.request.parameters.workflow==='content-creation'&&task.attempts.some(attempt=>attempt.id===task.activeAttemptId&&['created','claimed','waiting-user','waiting-permission','submitted'].includes(attempt.status)));
   if(existing){const launched=await this.launch(existing.id);return {snapshot:await this.read(),...launched};}
   if(!snapshot.creations.some(creation=>creation.contentId===input.contentId))snapshot=await this.write({...this.pendingBase(),kind:'mutate',op:'ensureCreation',input:{contentId:input.contentId,expectedToken:snapshot.editToken}}) as ProductionSnapshot;
  }
  const settings=await this.callbacks.serviceSettings(),v=settings.values;
  const creationState=input.contentId?await this.owner.worker.call('productionCreation',{binding:b,contentId:input.contentId}):null,bodyHash=creationState?.content.bodyHash??null;
  if(input.transcript){
   const ref=creationState?.creation?.references.find(ref=>ref.id===input.transcript!.referenceId);if(!ref)fail('NOT_FOUND','找不到当前内容中已保存的参考资料。');
   if(await productionReferenceHash(ref)!==input.transcript.expectedReferenceHash)fail('STALE_INPUT','参考资料已变化，请先保存并重新核对。');
   validateTranscriptReference(ref,input.transcript.intent,snapshot.missingAssetHashes??[]);
   const existing=[...snapshot.tasks].reverse().find(task=>{const p=task.request.parameters;if(task.contentId!==input.contentId||p===null||typeof p!=='object'||Array.isArray(p)||p.transcript===null||typeof p.transcript!=='object'||Array.isArray(p.transcript))return false;const a=task.attempts.find(a=>a.id===task.activeAttemptId);return p.transcript.referenceId===ref.id&&a&&['created','claimed','waiting-user','waiting-permission','submitted'].includes(a.status);});
   if(existing){const p=existing.request.parameters as {transcript:{intent:string;baselineHash:string}};if(p.transcript.intent!==input.transcript.intent||p.transcript.baselineHash!==input.transcript.expectedReferenceHash)fail('INVALID_STATE','本条参考已有其他进行中的任务，请先在原任务中处理或明确取消。');const launched=await this.launch(existing.id);return {snapshot:await this.read(),...launched};}
  }
  const serviceDescriptor=await this.callbacks.servicesDescriptor?.();
  const account=input.accountId?snapshot.accounts.find(account=>account.id===input.accountId&&!account.deletedAt):undefined;
  if(input.accountId&&!account)fail('NOT_FOUND','对标账号不存在，请刷新后重新选择。');
  const platformCollection=account?platformCollectionCapability(account.platform):null;
  const stage=input.stage??(input.businessSkill==='jc-content-writer'?'writing':input.businessSkill==='jc-video-analysis'?'analysis-ai':input.businessSkill==='jc-cover-copy'?'cover-copy':input.businessSkill==='nova-workbench-writing-method'?'revision':input.businessSkill==='jc-media-review'?'review':input.businessSkill==='jc-publish-closeout'?'closeout':input.businessSkill==='jc-pattern-extractor'?'patterns':input.businessSkill==='jc-benchmark-intake'?'intake':undefined);
  let brief:ResearchBrief|undefined=input.researchBrief;
  const researchWorkflow=!!vaultRootForRuntime(b.root)&&(input.kind==='research'||input.kind==='analysis'&&!!input.accountId||stage==='intake'&&!!brief);
  if(researchWorkflow&&account&&!brief){const platform=platformCollection==='douyin'?'douyin':platformCollection==='xiaohongshu'?'xiaohongshu':'manual';brief=researchBriefFromText(account.url,platform);if(!brief&&platform!=='manual')fail('RESEARCH_TARGET_REQUIRED','请为账号提供完整主页链接后开始研究。');}
  if(researchWorkflow&&!brief)brief={route:input.businessSkill==='jc-comment-visualize'?'comments':'topic',platform:'manual',targetIds:[stageSource?.documentId??input.contentId??'provided-materials']};
  const canCollect=researchWorkflow&&brief?.platform!=='manual'&&v.budget.enabled;
  const commentsAuthorized=!!(input.comments&&v.commentsEnabled&&canCollect&&brief?.platform==='douyin');
  if(researchWorkflow&&input.comments&&brief?.platform==='douyin'&&!commentsAuthorized)fail('COMMENTS_DISABLED','本次评论采集需要先在服务中开启评论和请求预算；也可选择手工资料。');
  const operations=canCollect?(brief!.platform==='xiaohongshu'?(brief!.route==='account'?['xhs-profile']:['xhs-search']):[...(brief!.route==='account'?['profile','user-posts']:brief!.route==='topic'&&!brief!.videoIds?.length?['douyin-search']:[]),...(brief!.videoIds?.length||brief!.route==='account'?['video']:[]),...(commentsAuthorized?['comments']:[])]):[];
  const researchId='research-'+randomUUID();
  const researchRuntime=researchWorkflow?validateResearchConfig({version:1,researchId,outputDirectory:(brief!.route==='intake'?'02_内容素材/':'调研报告库/')+researchId,route:brief!.route,platform:canCollect?brief!.platform:'manual',targetIds:brief!.targetIds,operations,maxRequests:canCollect?v.budget.maxRequestsPerTask:0,comments:commentsAuthorized,...(brief!.videoIds?{videoIds:brief!.videoIds}:{}),...(brief!.commentMode?{commentMode:brief!.commentMode}:{}),...(brief!.route==='account'&&canCollect&&brief!.platform==='douyin'?{sampleLimit:3}:{})}):undefined;
  const parameters={...(input.contentId||researchRuntime&&brief?.platform==='douyin'?{media:{version:1,maxDownloads:3,maxBytes:64*1024*1024}}:{}),...(input.transcript?{transcript:{version:1,intent:input.transcript.intent,referenceId:input.transcript.referenceId,baselineHash:input.transcript.expectedReferenceHash}}:{}),...(input.workflow?{workflow:input.workflow}:{}),...(researchRuntime?{workflow:'jincheng-research',researchRuntime}:{}),...(stage?{stage}:{}),...(input.workflow==='jincheng-stage'?{businessSkill:input.businessSkill,source:stageSource}:{}),...(account?{platform:account.platform,platformCollection}:{}),mode:input.mode,...(input.kind==='research'?{researchDepth:researchDepthRequirements(input.mode)}:{}),comments:researchRuntime?commentsAuthorized:input.comments&&v.commentsEnabled&&(!account||platformCollection==='douyin'),budgetEnabled:researchRuntime?canCollect:v.budget.enabled,maxRequestsPerTask:researchRuntime?researchRuntime.maxRequests:v.budget.maxRequestsPerTask,serviceConfig:{asr:v.asr},...(serviceDescriptor?{serviceDescriptor:{version:serviceDescriptor.version,host:serviceDescriptor.host,port:serviceDescriptor.port}}:{})};
  const tools=researchRuntime?(canCollect?['tikhub',...(brief?.platform==='douyin'?['asr','media']:[])]:[]):platformCollection==='manual'?['asr']:input.contentId?['tikhub','asr','media']:['tikhub','asr'];
  const prior=new Set(snapshot.tasks.map(t=>t.id));
  const result=await this.write({...this.pendingBase(),kind:'mutate',op:'createTask',input:{kind:input.kind,title:input.title,prompt:input.workflow==='content-creation'?contentCreationPrompt(input.prompt):input.transcript?`${input.prompt}\n\n本任务仅处理固定parameters.transcript.referenceId的已保存参考。intent=${input.transcript.intent}；基线由baselineHash固定。extract只提取原稿和真实时间轴；correct只生成校对后文本和逐项纠错，保留原始逐字稿、来源、媒体与原时间轴；reextract按用户明确要求重新提取原稿和时间轴，旧校对若无新版本应清空。由同一个助手对话完成并交回一份transcript artifact，其data.references必须恰有一条同id完整reference。不得另建参考ID或改写自己的正文，提交后等工作台前后预览与人工采用。没有时间戳证据时segments为空数组，不编造时码。`:input.prompt,contentId:input.contentId??null,accountId:input.accountId??null,host:this.owner.binding.assistant??'codex',parameters,tools,budget:{amount:researchRuntime?researchRuntime.maxRequests:v.budget.enabled?v.budget.maxRequestsPerTask:0,currency:'REQ'},bodyHash,expectedToken:snapshot.editToken}}) as ProductionSnapshot;
  const task=result.tasks.find(t=>!prior.has(t.id));if(!task)fail('PENDING_MUTATION','任务已写入但无法定位，请刷新原任务列表。');
  const launched=await this.launch(task.id);return {snapshot:await this.read(),...launched};
 });}
 createRadarTask(input:RadarQuery){this.validate('createRadarTask',input);return this.owner.exclusive(async()=>{
  this.owner.noPending();const snapshot=await this.owner.worker.call('productionRead',{binding:this.owner.current()}),settings=await this.callbacks.serviceSettings(),v=settings.values,ops=radarQueryOperations(input),query=structuredClone(input);
  const budget=v.budget.enabled&&ops.length?radarRequestLimit(query,v.budget.maxRequestsPerTask):0,descriptor=await this.callbacks.servicesDescriptor?.();
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
  if(attempt.status==='rejected')fail('ATTEMPT_INACTIVE','此结果已拒绝。请修改要求并显式创建新任务。');
  if(input.host&&input.host!==attempt.host)await this.write({...this.pendingBase(),kind:'mutate',op:'retryTask',input:{taskId:input.taskId,host:input.host,expectedToken:snapshot.editToken}});
  return this.launch(input.taskId);
 });}
 actProductionTask(input:ProductionAction){this.validate('actProductionTask',input);return this.owner.exclusive(async()=>{
  const snapshot=await this.owner.worker.call('productionRead',{binding:this.owner.current()}),task=snapshot.tasks.find(t=>t.id===input.taskId),attempt=task?.attempts.find(a=>a.id===task.activeAttemptId);
  if(!attempt)fail('NOT_FOUND','任务不存在。');
  const request=input.action==='reject'?{taskId:input.taskId,attemptId:input.attemptId,receiptHash:input.receiptHash,expectedToken:input.expectedToken,reason:input.reason}:input.action==='accept'?{taskId:input.taskId,attemptId:input.attemptId,receiptHash:input.receiptHash,expectedToken:input.expectedToken}:input.action==='retry'?{taskId:input.taskId,host:input.host??attempt.host,expectedToken:snapshot.editToken}:{taskId:input.taskId,expectedToken:snapshot.editToken};
  const written=await this.write({...this.pendingBase(),kind:'mutate',op:input.action==='reject'?'rejectTask':input.action==='accept'?'acceptTask':input.action==='retry'?'retryTask':'cancelTask',input:request}) as ProductionSnapshot;const current=await this.read();return {...current,...(written.archiveWarnings?.length?{archiveWarnings:written.archiveWarnings}:{})};
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
