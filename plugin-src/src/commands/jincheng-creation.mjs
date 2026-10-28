import {readBytes,digest,queryVaultMutation,resumeVaultMutation,atomic,mkdir} from '../lib/vault/core.mjs';
import {compileReviewPage} from '../lib/method-adapters/index.mjs';
import {assertKepuReady,confirmedMethodArtifact,writeKepuCompanions} from '../lib/method-adapters/runtime.mjs';
import {randomUUID} from 'node:crypto';
import {appendStageArtifact} from '../lib/vault/workflow.mjs';
import {fixedStageContext,assertStageGate,runFixedCLI,fail} from './jincheng-workflow.mjs';
import {readCreationDocument,parseCreationHtml,exportCreationData,loadTrustedCreationTemplate,buildCreationPage,regenerateCreationPage,commitCreationStructure,replyToNote} from '../lib/creation-document/index.mjs';
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const protectedField=k=>/^(?:approved|recorded|decision|note|overall_note|final|picked|selected|mine)$/.test(k);
function validateAssistantBuild(data,old){
 if(!data||typeof data!=='object'||data.service_origin!==undefined&&(!old||data.service_origin!==old.raw.service_origin)||data.items?.some(item=>['final'].includes(item.kind)&&!old?.items.some(i=>i.id===item.id&&i.kind===item.kind)||Object.entries(item.fields??{}).some(([k,v])=>v&&protectedField(k)&&old?.items.find(i=>i.id===item.id)?.fields[k]!==v))||Object.entries(data.info?.fields??{}).some(([k,v])=>v&&old?.items.find(i=>i.kind==='info')?.fields[k]!==v)||data.segments?.some(s=>s.note&&old?.items.find(i=>i.id===s.id)?.fields.note!==s.note||Object.entries(s.fields??{}).some(([k,v])=>v&&protectedField(k)&&old?.items.find(i=>i.id===s.id)?.fields[k]!==v))||data.suggestions?.some(s=>s.decision||Object.entries(s.fields??{}).some(([k,v])=>v&&protectedField(k))))fail('AUTHOR_FIELD');
 // Existing mine is only read back; regeneration preserves the original author fields.
 if(old&&data.segments?.some(s=>{const prior=old.items.find(i=>i.id===s.id);return prior&&s.mine!==prior.fields.mine;}))fail('AUTHOR_FIELD','已有作者正文只能提建议，不可通过重生成修改。');
}
function reviewConfirmed(context,pin,change){try{const data=confirmedMethodArtifact(context.root,context.flow,pin,'review').data;return data?.changes?.some(c=>c.old===change.old&&c.new===change.new&&c.insert_after===change.insert_after);}catch{return false;}}
function reviewSuggestion(context,doc,suggestion){
 const g=suggestion,segment=doc.items.find(item=>item.kind==='segment'&&item.id===g?.segment);if(!segment)fail('INVALID_INPUT');
 const verdict={'已定要改':'must','待你定':'optional','不用改':'keep','等录屏再定':'wait'}[g.verdict];
 const change={old:g.original,new:g.proposed,verdict,reasons:g.locked?.reviewReasons,confirmation:g.locked?.reviewConfirmation};
 if(verdict==='must'&&!reviewConfirmed(context,change.confirmation,change))fail('AUTHOR_CONFIRMATION_REQUIRED');
 if(!Array.isArray(change.reasons)||!change.reasons.length)fail('REASON_REQUIRED');
 const data=compileReviewPage(context.work.workId,{title:'逐句审定',original:segment.fields.mine,changes:[change]},{confirmed:(pin,c)=>reviewConfirmed(context,pin,c)});
 return {...data.suggestions[0],segment:segment.id};
}
function selectedCreationPage(context){
 const c=context.vault.content,pages=c.creationDocuments,current=pages.find(p=>p.documentId===c.sourceDocumentId);
 if(current)return current;
 if(context.task.request.parameters.stage==='review-page'){const fixed=pages.find(p=>p.relativePath===context.vault.contentDirectory+'/助手任务/审稿页.html');if(fixed)return fixed;}
 if(pages.length)fail('SOURCE_SELECTION_REQUIRED','请明确选择本次接着编辑的原创作页，不能猜历史页。');return null;
}
function supportedCreationSource(context,source,page){
 const chosen={...source,sourceId:'drafts',documentId:page.documentId,relativePath:page.relativePath,writable:true},doc=parseCreationHtml(readBytes(context.root,chosen.relativePath),chosen);
 if(doc.raw.schema!==1||doc.raw.kind!=='创作页'||doc.raw.content_id!==context.work.workId||!doc.writable)fail('READ_ONLY','当前文件不是受支持的同T原jc-doc协议。');return chosen;
}
function withConfirmedKepuReferences(context,data,{firstBuild=false}={}){
 if(context.task.request.parameters.stage!=='kepu'&&!context.flow.artifacts.some(a=>a.kind==='framework'&&a.methodId==='jc-kepu-video'))return data;
 const segments=assertKepuReady(context);
 if(data?.type!=='AI科普'||data?.segments?.length!==segments.length||segments.some((s,i)=>data.segments[i].title!==s.title||firstBuild&&data.segments[i].mine!==s.text))fail('AUTHOR_FIELD','完整稿须沿用作者已确认段落及参考。');
 return {...data,segments:data.segments.map((s,i)=>({...s,refs:segments[i].references.map(r=>({source_type:'口播原话',who:r.who,time:r.time,text:r.text,url:r.url??'',source_sha256:digest(r.sourceText),patterns:r.patterns}))}))};
}
function kepuBuildCheckpoints(flow){
 const artifacts=flow.artifacts.filter(a=>['narrative','framework','kepu-segment','kepu-readthrough','key-segments','author-analysis'].includes(a.kind));
 return digest(JSON.stringify(artifacts.map(a=>({artifactId:a.artifactId,kind:a.kind,path:a.path,hash:a.hash,decision:flow.decisions.findLast(d=>d.artifactId===a.artifactId)??null}))));
}
async function recoverableKepuBuild(context,args,source){
 const {root,work,task,vault,input}=context;
 if(!/^[A-Za-z0-9_-]{8,100}$/.test(input.mutationId??''))fail('INVALID_INPUT');
 const relative='.workbench/kepu-builds/'+input.mutationId+'.json',requestHash=digest(JSON.stringify({work,taskId:task.id,requestHash:args.envelope.task.requestHash,input}));
 let priorBytes,prior;
 try{priorBytes=readBytes(root,relative);prior=JSON.parse(priorBytes);}catch(e){if(e.code!=='ENOENT')throw e;}
 if(prior&&(prior.format!=='nova-kepu-build'||prior.requestHash!==requestHash))fail('CONFLICT','mutationId已用于另一项完整稿请求');
 // Publishing the first creation page can make it the resolved current source. Keep
 // validating the frozen original bytes, and accept only that original or this build's page.
 if(prior&&![prior.source.relativePath,prior.buildInput.source.relativePath].includes(source.relativePath))fail('CONFLICT','当前原稿入口已变化');
 const frozenSource=prior?.source??source;
 const checkpoints=kepuBuildCheckpoints(context.flow),currentSource={documentId:frozenSource.documentId,relativePath:frozenSource.relativePath,hash:digest(readBytes(root,frozenSource.relativePath))};
 if(prior&&(prior.checkpoints!==checkpoints||JSON.stringify(prior.source)!==JSON.stringify(currentSource)))fail('CONFLICT','完整稿的来源或作者确认已变化');
 try{assertStageGate(context,'complete-draft');}catch(e){if(prior&&['CHECKPOINT_REQUIRED','AUTHOR_ANALYSIS_REQUIRED'].includes(e.code))fail('CONFLICT','完整稿的确认产物已变化');throw e;}
 validateAssistantBuild(input.data);
 const data=withConfirmedKepuReferences(context,input.data,{firstBuild:true});
 if(input.data.content_id!==work.workId)fail('WORK_BINDING_CONFLICT');
 const target=prior?.buildInput.source??{...source,sourceId:'drafts',documentId:'creation-'+work.workId,relativePath:vault.contentDirectory+'/创作页.html'};
 const buildInput={work,source:target,data,mutationId:input.mutationId,templateVersion:loadTrustedCreationTemplate().version};
 if(!prior){
  if(vault.content.creationDocuments.length)fail('ALREADY_EXISTS','已有原创作页，请使用read与建议或精确版本的regenerate。');
  if(task.request.parameters.source?.hash&&task.request.parameters.source.hash!==currentSource.hash)fail('CONFLICT','任务冻结的原稿已变化');
  prior={format:'nova-kepu-build',requestHash,source:currentSource,checkpoints,buildInput,stageArtifactId:randomUUID()};
  priorBytes=Buffer.from(JSON.stringify(prior,null,2)+'\n');mkdir(root,'.workbench/kepu-builds');atomic(root,relative,priorBytes,null);
 }else if(JSON.stringify(prior.buildInput)!==JSON.stringify(buildInput))fail('CONFLICT','冻结完整稿输入已变化');
 // A vault receipt replays its original result; verify the live HTML before accepting it.
 const receipt=queryVaultMutation(args.envelope.binding.root,input.mutationId);
 if(receipt){
  try{if(digest(readBytes(root,target.relativePath))!==receipt.result.revision)fail('CONFLICT','原创作页已有作者修改');}catch(e){if(e.code!=='ENOENT'||receipt.status==='committed')throw e;}
 }
 const result=await buildCreationPage(root,prior.buildInput);
 if(digest(readBytes(root,target.relativePath))!==result.revision)fail('CONFLICT','原创作页已有作者修改');
 const stageArtifact=appendStageArtifact(root,{work,kind:'complete-draft',artifactId:prior.stageArtifactId,hash:result.revision,path:target.relativePath,methodId:task.request.parameters.businessSkill,taskId:task.id});
 const companions=writeKepuCompanions(context);
 if(prior.result)return prior.result;
 const completed={...result,stageArtifact,companions};
 atomic(root,relative,Buffer.from(JSON.stringify({...prior,result:completed},null,2)+'\n'),digest(priorBytes));
 return completed;
}
export async function runCreationHandoff(args){
 const context=fixedStageContext(args),{root,task,work,vault,input}=context,stage=task.request.parameters.stage;
 if(!work||!vault.content)fail('STAGE_FORBIDDEN');
 let source={sourceId:vault.content.source.sourceId,documentId:vault.content.sourceDocumentId,relativePath:vault.content.relativePath,vaultId:work.vaultId,writable:vault.content.writable};
 if(stage==='review-page'&&args.operation==='review'){
  if(!input.spec||!input.mutationId||Object.keys(input).some(k=>!['spec','mutationId','expectedRevision'].includes(k)))fail('INVALID_INPUT');
  const reviewRequestHash=digest(JSON.stringify({taskId:task.id,requestHash:args.envelope.task.requestHash,input})),receipt=queryVaultMutation(args.envelope.binding.root,input.mutationId);
  if(receipt){if(receipt.request?.input?.reviewRequestHash!==reviewRequestHash||receipt.request.input.work?.vaultId!==work.vaultId||receipt.request.input.work?.workId!==work.workId)fail('INVALID_INPUT','mutationId已用于另一项请求');return (receipt.status==='pending'?resumeVaultMutation(args.envelope.binding.root,input.mutationId):receipt).result;}
  const originalPage=selectedCreationPage(context);
  const confirmed=(pin,change)=>reviewConfirmed(context,pin,change);
  const data=compileReviewPage(work.workId,input.spec,{confirmed});
  const target={...source,sourceId:'drafts',documentId:'review-'+work.workId,relativePath:vault.contentDirectory+'/助手任务/审稿页.html'};
  if(originalPage?.relativePath===target.relativePath&&input.expectedRevision===vault.content.hash&&input.spec.original===readBytes(root,vault.content.relativePath).toString('utf8'))return buildCreationPage(root,{work,source:target,data,mutationId:input.mutationId,reviewRequestHash,templateVersion:loadTrustedCreationTemplate().version});
  if(originalPage){
   const currentSource=supportedCreationSource(context,source,originalPage);const old=await readCreationDocument(root,currentSource),prior=exportCreationData(old);
   if(!input.expectedRevision||old.revision!==input.expectedRevision)fail('CONFLICT');
   if(prior.segments.map(s=>s.mine).join('\n\n')!==input.spec.original)fail('ORIGINAL_MISMATCH','请先完整读回当前原页正文，再按原句给建议。');
   for(const g of data.suggestions){const matches=prior.segments.filter(s=>s.mine.split(g.original).length===2);if(matches.length!==1)fail('QUOTE_NOT_UNIQUE');g.segment=matches[0].id;}
   prior.suggestions.push(...data.suggestions.filter(g=>!prior.suggestions.some(x=>x.id===g.id)));validateAssistantBuild(prior,old);
   return regenerateCreationPage(root,{work,source:currentSource,data:prior,expectedRevision:input.expectedRevision,mutationId:input.mutationId,reviewRequestHash,templateVersion:loadTrustedCreationTemplate().version});
  }
  if(input.expectedRevision!==vault.content.hash||task.request.parameters.source?.hash&&task.request.parameters.source.hash!==vault.content.hash)fail('CONFLICT');
  if(input.spec.original!==readBytes(root,vault.content.relativePath).toString('utf8'))fail('ORIGINAL_MISMATCH','原稿必须与当前冻结的原文件逐字一致。');
  // Supporting review entry: the original manuscript and current-source decision stay in place.
  return buildCreationPage(root,{work,source:target,data,mutationId:input.mutationId,reviewRequestHash,templateVersion:loadTrustedCreationTemplate().version});
 }
 if(args.operation!=='build'&&vault.content.creationDocuments.length){const page=selectedCreationPage(context);if(page)source=supportedCreationSource(context,source,page);}
 if(args.operation==='build'){
  if(!['writing','tutorial','kepu'].includes(stage)||!exact(input,['data','mutationId']))fail('STAGE_FORBIDDEN');
  if(stage==='kepu')return recoverableKepuBuild(context,args,source);
  assertStageGate(context,'complete-draft');validateAssistantBuild(input.data);const buildData=withConfirmedKepuReferences(context,input.data,{firstBuild:true});
  if(input.data.content_id!==work.workId)fail('WORK_BINDING_CONFLICT');
  if(vault.content.creationDocuments.length)fail('ALREADY_EXISTS','已有原创作页，请使用read与建议或精确版本的regenerate。');
  const target={...source,sourceId:'drafts',documentId:'creation-'+work.workId,relativePath:vault.contentDirectory+'/创作页.html'};
  const result=await buildCreationPage(root,{work,source:target,data:buildData,mutationId:input.mutationId,templateVersion:loadTrustedCreationTemplate().version});
  const stageArtifact=appendStageArtifact(root,{work,kind:'complete-draft',artifactId:randomUUID(),hash:result.revision,path:target.relativePath,methodId:task.request.parameters.businessSkill,taskId:task.id});
  return {...result,stageArtifact,...(stage==='kepu'?{companions:writeKepuCompanions(context)}:{})};
 }
 const doc=await readCreationDocument(root,source);
 if(args.operation==='read'){if(Object.keys(input).length)fail('INVALID_INPUT');return {document:doc,buildData:exportCreationData(doc),workflow:context.flow};}
 assertStageGate(context,args.operation==='regenerate'?'complete-draft':args.operation);
 const actor={kind:'assistant',taskId:task.id,requestId:args.envelope.task.requestHash};
 if(args.operation==='regenerate'){
  if(!['writing','tutorial','revision','kepu'].includes(stage)||!exact(input,['data','expectedRevision','mutationId']))fail('STAGE_FORBIDDEN');validateAssistantBuild(input.data,doc);return regenerateCreationPage(root,{work,source,data:withConfirmedKepuReferences(context,input.data),expectedRevision:input.expectedRevision,mutationId:input.mutationId,templateVersion:loadTrustedCreationTemplate().version});
 }
 if(args.operation==='suggest'){
  if(!['writing','tutorial','revision','analysis-ai','analysis-author','cover-copy','kepu','review-page'].includes(stage)||!exact(input,['expectedRevision','mutationId','suggestion']))fail('STAGE_FORBIDDEN');return commitCreationStructure(root,{source,expectedRevision:input.expectedRevision,mutationId:input.mutationId,actor,action:{kind:'append-suggestion',payload:stage==='review-page'?reviewSuggestion(context,doc,input.suggestion):input.suggestion}});
 }
 if(args.operation==='reply'){
  if(!exact(input,['itemId','handledNote','reply','expectedFingerprint','mutationId']))fail('INVALID_INPUT');return replyToNote(root,{...input,source,actor});
 }
 if(args.operation==='append-item'){
  if(!exact(input,['expectedRevision','mutationId','item'])||Object.entries(input.item?.fields??{}).some(([k,v])=>v&&protectedField(k))||!['refnote','skeleton','step','pubslot','pubcand'].includes(input.item?.kind)||input.item.kind.startsWith('pub')&&stage!=='cover-copy')fail('STAGE_FORBIDDEN');return commitCreationStructure(root,{source,expectedRevision:input.expectedRevision,mutationId:input.mutationId,actor,action:{kind:'append-item',payload:input.item}});
 }
 fail('INVALID_INPUT');
}
export const main=argv=>runFixedCLI(argv,['read','build','regenerate','suggest','reply','append-item','review'],runCreationHandoff);
