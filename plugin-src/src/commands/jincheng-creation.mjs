import {randomUUID} from 'node:crypto';
import {appendStageArtifact} from '../lib/vault/workflow.mjs';
import {fixedStageContext,assertStageGate,runFixedCLI,fail} from './jincheng-workflow.mjs';
import {readCreationDocument,exportCreationData,loadTrustedCreationTemplate,buildCreationPage,regenerateCreationPage,commitCreationStructure,replyToNote} from '../lib/creation-document/index.mjs';
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const protectedField=k=>/^(?:approved|recorded|decision|note|overall_note|final|picked|selected|mine)$/.test(k);
function validateAssistantBuild(data,old){
 if(!data||typeof data!=='object'||data.service_origin!==undefined&&(!old||data.service_origin!==old.raw.service_origin)||data.items?.some(item=>['final'].includes(item.kind)&&!old?.items.some(i=>i.id===item.id&&i.kind===item.kind)||Object.entries(item.fields??{}).some(([k,v])=>v&&protectedField(k)&&old?.items.find(i=>i.id===item.id)?.fields[k]!==v))||Object.entries(data.info?.fields??{}).some(([k,v])=>v&&old?.items.find(i=>i.kind==='info')?.fields[k]!==v)||data.segments?.some(s=>s.note&&old?.items.find(i=>i.id===s.id)?.fields.note!==s.note||Object.entries(s.fields??{}).some(([k,v])=>v&&protectedField(k)&&old?.items.find(i=>i.id===s.id)?.fields[k]!==v))||data.suggestions?.some(s=>s.decision||Object.entries(s.fields??{}).some(([k,v])=>v&&protectedField(k))))fail('AUTHOR_FIELD');
 // Existing mine is only read back; regeneration preserves the original author fields.
 if(old&&data.segments?.some(s=>{const prior=old.items.find(i=>i.id===s.id);return prior&&s.mine!==prior.fields.mine;}))fail('AUTHOR_FIELD','已有作者正文只能提建议，不可通过重生成修改。');
}
export async function runCreationHandoff(args){
 const context=fixedStageContext(args),{root,task,work,vault,input}=context,stage=task.request.parameters.stage;
 const source={sourceId:vault.content.source.sourceId,documentId:vault.content.sourceDocumentId,relativePath:vault.content.relativePath,vaultId:work.vaultId,writable:vault.content.writable};
 if(args.operation==='build'){
  if(!['writing','tutorial'].includes(stage)||!exact(input,['data','mutationId']))fail('STAGE_FORBIDDEN');assertStageGate(context,'complete-draft');validateAssistantBuild(input.data);if(input.data.content_id!==work.workId)fail('WORK_BINDING_CONFLICT');
  if(vault.content.creationDocuments.length)fail('ALREADY_EXISTS','已有原创作页，请使用read与建议或精确版本的regenerate。');
  const target={...source,sourceId:'drafts',documentId:'creation-'+work.workId,relativePath:vault.contentDirectory+'/创作页.html'};
  const result=await buildCreationPage(root,{work,source:target,data:input.data,mutationId:input.mutationId,templateVersion:loadTrustedCreationTemplate().version});
  const stageArtifact=appendStageArtifact(root,{work,kind:'complete-draft',artifactId:randomUUID(),hash:result.revision,path:target.relativePath,methodId:task.request.parameters.businessSkill,taskId:task.id});
  return {...result,stageArtifact};
 }
 const doc=await readCreationDocument(root,source);
 if(args.operation==='read'){if(Object.keys(input).length)fail('INVALID_INPUT');return {document:doc,buildData:exportCreationData(doc),workflow:context.flow};}
 assertStageGate(context,args.operation==='regenerate'?'complete-draft':args.operation);
 const actor={kind:'assistant',taskId:task.id,requestId:args.envelope.task.requestHash};
 if(args.operation==='regenerate'){
  if(!['writing','tutorial','revision'].includes(stage)||!exact(input,['data','expectedRevision','mutationId']))fail('STAGE_FORBIDDEN');validateAssistantBuild(input.data,doc);return regenerateCreationPage(root,{work,source,data:input.data,expectedRevision:input.expectedRevision,mutationId:input.mutationId,templateVersion:loadTrustedCreationTemplate().version});
 }
 if(args.operation==='suggest'){
  if(!['writing','tutorial','revision','analysis-ai','analysis-author','cover-copy'].includes(stage)||!exact(input,['expectedRevision','mutationId','suggestion']))fail('STAGE_FORBIDDEN');return commitCreationStructure(root,{source,expectedRevision:input.expectedRevision,mutationId:input.mutationId,actor,action:{kind:'append-suggestion',payload:input.suggestion}});
 }
 if(args.operation==='reply'){
  if(!exact(input,['itemId','handledNote','reply','expectedFingerprint','mutationId']))fail('INVALID_INPUT');return replyToNote(root,{...input,source,actor});
 }
 if(args.operation==='append-item'){
  if(!exact(input,['expectedRevision','mutationId','item'])||Object.entries(input.item?.fields??{}).some(([k,v])=>v&&protectedField(k))||!['refnote','skeleton','step','pubslot','pubcand'].includes(input.item?.kind)||input.item.kind.startsWith('pub')&&stage!=='cover-copy')fail('STAGE_FORBIDDEN');return commitCreationStructure(root,{source,expectedRevision:input.expectedRevision,mutationId:input.mutationId,actor,action:{kind:'append-item',payload:input.item}});
 }
 fail('INVALID_INPUT');
}
export const main=argv=>runFixedCLI(argv,['read','build','regenerate','suggest','reply','append-item'],runCreationHandoff);
