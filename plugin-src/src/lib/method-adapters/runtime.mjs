import path from 'node:path';
import {readBytes,digest,atomic,mkdir} from '../vault/core.mjs';
import {readWorkFlow,appendStageArtifact} from '../vault/workflow.mjs';
import {validateSynthesisBrief,compileSynthesisReport,validateKepuCandidate,validateCoverDesign} from './index.mjs';
const fail=(code,message=code)=>{throw Object.assign(new Error(message),{code});};
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const mutation=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{8,100}$/.test(v);
function stored(root,artifact){const bytes=readBytes(root,artifact.path);if(digest(bytes)!==artifact.hash)fail('CONFLICT','阶段产物已变化');try{return JSON.parse(bytes.toString('utf8'));}catch{if(artifact.kind==='narrative')return {data:{text:bytes.toString('utf8')}};fail('CORRUPT');}}
export function confirmedMethodArtifact(root,flow,pin,kind){
 if(!pin||typeof pin.artifactId!=='string'||!/^[a-f0-9]{64}$/.test(pin.hash??''))fail('CHECKPOINT_REQUIRED');
 const a=flow.artifacts.find(x=>x.artifactId===pin.artifactId&&x.hash===pin.hash&&x.kind===kind),d=flow.decisions.findLast(x=>x.artifactId===pin.artifactId);
 if(!a||d?.decision!=='confirm'||d.artifactHash!==a.hash)fail('CHECKPOINT_REQUIRED','请由作者确认当前准确版本');const record=stored(root,a);if(['framework','kepu-segment','kepu-readthrough'].includes(kind)&&(record.schemaVersion!==2||!Array.isArray(record.dependencies)))fail('CHECKPOINT_REQUIRED','旧候选缺上游决定绑定，请重新保存候选。');for(const dep of record.dependencies??[]){const d=flow.decisions.findLast(d=>d.artifactId===dep.artifactId);if(d?.decisionId!==dep.decisionId||d?.decision!=='confirm')fail('CHECKPOINT_REQUIRED','上游决定已变化');const upstream=flow.artifacts.find(a=>a.artifactId===dep.artifactId);if(!upstream)fail('CHECKPOINT_REQUIRED');confirmedMethodArtifact(root,flow,{artifactId:dep.artifactId,hash:dep.hash},upstream.kind);}
 return {artifact:a,data:record.data};
}
function latest(root,flow,pin,kind){if(flow.artifacts.findLast(a=>a.kind===kind)?.artifactId!==pin?.artifactId)fail('CHECKPOINT_REQUIRED','请使用最新阶段版本');return confirmedMethodArtifact(root,flow,pin,kind);}
function put(root,relative,bytes){mkdir(root,path.posix.dirname(relative));try{const current=readBytes(root,relative);if(digest(current)!==digest(bytes))fail('CONFLICT','同一mutationId的输入已变化');}catch(e){if(e.code!=='ENOENT')throw e;atomic(root,relative,bytes,null);}}
export function assertKepuReady(context){
 const {root,flow}=context,a=flow.artifacts.findLast(a=>a.kind==='kepu-readthrough');if(!a)fail('CHECKPOINT_REQUIRED','逐段确认后先完成全篇通读');const read=latest(root,flow,{artifactId:a.artifactId,hash:a.hash},'kepu-readthrough').data;
 const framework=latest(root,flow,read.framework,'framework').data;latest(root,flow,framework.narrative,'narrative');
 if(read.segments.length!==framework.segments.length)fail('CHECKPOINT_REQUIRED');
 return read.segments.map((p,index)=>{const s=confirmedMethodArtifact(root,flow,p,'kepu-segment').data;const latestSegment=flow.artifacts.findLast(a=>a.kind==='kepu-segment'&&stored(root,a).data.index===index&&stored(root,a).data.framework.artifactId===read.framework.artifactId);if(latestSegment?.artifactId!==p.artifactId||index>0&&(s.previous?.artifactId!==read.segments[index-1].artifactId||s.previous?.hash!==read.segments[index-1].hash))fail('CHECKPOINT_REQUIRED');if(s.index!==index||s.framework.artifactId!==read.framework.artifactId||s.framework.hash!==read.framework.hash)fail('CHECKPOINT_REQUIRED');return s;});
}
export function runMethodArtifact(context){
 const {root,work,flow,task,input}=context,stage=task.request.parameters.stage;
 if(!exact(input,['mutationId','kind','data'])||!mutation(input.mutationId))fail('INVALID_INPUT');
 if(stage==='synthesis'){
  if(input.kind!=='synthesis-report'||!validateSynthesisBrief(task.request.parameters.synthesisBrief))fail('STAGE_FORBIDDEN');
  const result=compileSynthesisReport(task.request.parameters.synthesisBrief,input.data),base=`.workbench/method-results/${task.id}/${task.activeAttemptId}/${input.mutationId}`,files={markdown:base+'/报告.md',html:base+'/报告.html',ledger:base+'/来源账本.json'};
  const envelope={format:'nova-synthesis-report',schemaVersion:1,taskId:task.id,attemptId:task.activeAttemptId,requestHash:task.requestHash,brief:task.request.parameters.synthesisBrief,sources:result.ledger};
  const outputs=[['markdown',Buffer.from(result.markdown)],['html',Buffer.from(result.html)],['ledger',Buffer.from(JSON.stringify(envelope,null,2)+'\n')]];for(const [kind,bytes] of outputs)put(root,files[kind],bytes);
  return {taskId:task.id,attemptId:task.activeAttemptId,requestHash:task.requestHash,files:outputs.map(([kind,bytes])=>({kind,path:files[kind],sha256:digest(bytes)})),text:result.markdown,runtimeStatus:'contract-unverified'};
 }
 if(!work)fail('STAGE_FORBIDDEN');
 const expected=stage==='cover-design'?['cover-design']:stage==='kepu'?['framework','kepu-segment','kepu-readthrough']:[];
 if(!expected.includes(input.kind))fail('STAGE_FORBIDDEN');
 if(stage==='cover-design'){validateCoverDesign(input.data);if(task.request.parameters.coverDesignRatio!==input.data.ratio)fail('FROZEN_RATIO_MISMATCH','设计比例须与本次冻结选择一致。');}else validateKepuCandidate(input.kind,input.data);
 // Replays are checked before gates, so an acknowledged result stays replayable after the next stage.
 const prior=flow.artifacts.find(a=>a.artifactId===input.mutationId),relative=context.vault.contentDirectory+'/助手任务/方法候选-'+input.mutationId+'.json';
 if(prior){const record=stored(root,prior);if(prior.taskId!==task.id||prior.path!==relative||record.kind!==input.kind||record.methodId!==task.request.parameters.businessSkill||JSON.stringify(record.data)!==JSON.stringify(input.data))fail('CONFLICT');return {artifactId:prior.artifactId,hash:prior.hash,path:prior.path,revision:flow.revision,replayed:true};}
 if(input.kind==='framework')latest(root,flow,input.data.narrative,'narrative');
 if(['kepu-segment','kepu-readthrough'].includes(input.kind)){
  const f=latest(root,flow,input.data.framework,'framework').data;latest(root,flow,f.narrative,'narrative');
  if(input.kind==='kepu-segment'){
   const i=input.data.index;if(i>=f.segments.length||input.data.title!==f.segments[i].title)fail('FRAMEWORK_MISMATCH');
   for(let n=0;n<i;n++){const a=flow.artifacts.findLast(a=>a.kind==='kepu-segment'&&stored(root,a).data.index===n&&stored(root,a).data.framework.artifactId===input.data.framework.artifactId);if(!a)fail('CHECKPOINT_REQUIRED');confirmedMethodArtifact(root,flow,{artifactId:a.artifactId,hash:a.hash},'kepu-segment');if(n===i-1&&(input.data.previous?.artifactId!==a.artifactId||input.data.previous?.hash!==a.hash))fail('CHECKPOINT_REQUIRED','段落须绑定上一段当前已确认版本');}
  }else{
   if(input.data.segments.length!==f.segments.length)fail('FRAMEWORK_MISMATCH');
   input.data.segments.forEach((p,i)=>{const a=flow.artifacts.findLast(a=>a.kind==='kepu-segment'&&stored(root,a).data.index===i&&stored(root,a).data.framework.artifactId===input.data.framework.artifactId);if(a?.artifactId!==p.artifactId)fail('CHECKPOINT_REQUIRED');const s=confirmedMethodArtifact(root,flow,p,'kepu-segment').data;if(i>0&&(s.previous?.artifactId!==input.data.segments[i-1].artifactId||s.previous?.hash!==input.data.segments[i-1].hash))fail('CHECKPOINT_REQUIRED');if(s.index!==i||s.framework.hash!==input.data.framework.hash)fail('FRAMEWORK_MISMATCH');});
  }
 }
 const upstream=input.kind==='framework'?[input.data.narrative]:input.kind==='kepu-segment'?[input.data.framework,...(input.data.index>0?[input.data.previous]:[])]:input.kind==='kepu-readthrough'?[input.data.framework,...input.data.segments]:[];
 const dependencies=upstream.map(pin=>({...pin,decisionId:flow.decisions.findLast(d=>d.artifactId===pin.artifactId)?.decisionId}));
 const record={format:'nova-method-candidate',schemaVersion:2,methodId:task.request.parameters.businessSkill,taskId:task.id,kind:input.kind,data:input.data,dependencies},bytes=Buffer.from(JSON.stringify(record,null,2)+'\n'),hash=digest(bytes);
 put(root,relative,bytes);const result=appendStageArtifact(root,{work,kind:input.kind,artifactId:input.mutationId,hash,path:relative,methodId:task.request.parameters.businessSkill,taskId:task.id});return {...result,hash,path:relative,runtimeStatus:'contract-unverified'};
}
/** Consumed by the desktop cover request builder, never an assistant supplied prompt or path. */
export function readConfirmedCoverDesign(root,{work,artifactId,artifactHash}){
 const flow=readWorkFlow(root,work),{artifact,data}=latest(root,flow,{artifactId,hash:artifactHash},'cover-design');validateCoverDesign(data);if(artifact.methodId!=='jc-cover-design')fail('STAGE_FORBIDDEN');
 return {prompt:data.specification+'\n本次已确认画面比例：'+data.ratio+'。画面按本比例生成。\n实际封面中文仅使用固定cover请求coverText/title，逐字保留；设计title仅为方案元信息，规格中的其他文案视作版式占位，不替代本次已确认包装。',title:data.title,ratio:data.ratio,identity:data.identity,designSource:{workId:work.workId,vaultId:work.vaultId,artifactId:artifact.artifactId,artifactHash:artifact.hash,methodId:artifact.methodId,taskId:artifact.taskId},design:structuredClone(data)};
}

export function writeKepuCompanions(context){
 const segments=assertKepuReady(context),readthrough=context.flow.artifacts.findLast(a=>a.kind==='kepu-readthrough'),read=stored(context.root,readthrough).data,framework=stored(context.root,context.flow.artifacts.find(a=>a.artifactId===read.framework.artifactId)).data;
 const base=context.vault.contentDirectory+'/助手任务/科普过程-'+readthrough.artifactId;
 const documents={'叙事与框架.md':'# 已确认叙事与框架\n\n'+JSON.stringify(framework,null,2)+'\n','逐字稿.md':segments.map(s=>'## 段：'+s.title+'\n\n### 本人版\n\n'+s.text+'\n\n'+s.references.map(r=>'### '+r.who+' '+r.time+'\n\n'+r.text+'\n\n范式：'+r.patterns.join('、')).join('\n\n')).join('\n\n'),'后台准确说法.md':'# 后台准确说法\n\n'+read.accurateNotes+'\n','改稿日志.md':'# 改稿日志\n\n'+segments.map((s,i)=>`## 第 ${i+1} 段 ${s.title}\n\n本人原话：\n${s.authorSpeech}\n\n整理候选（作者已确认准确hash）：\n${s.text}\n\nAI 新增句：\n${s.additions.join('\n')||'无'}\n\n四查：\n${Object.entries(s.checks).map(([k,v])=>k+'：'+v).join('\n')}\n\n建议及作者取舍以阶段决定账本为准：\n${s.suggestion}`).join('\n\n')+'\n\n## 全篇通读\n\n'+read.checks+'\n\n'+read.changeLog+'\n'};
 const files=Object.entries(documents).map(([name,text])=>({relative:base+'/'+name,bytes:Buffer.from(text)}));
 // Check the whole set before repairing missing companions: never write past an author edit.
 for(const {relative,bytes} of files){try{if(digest(readBytes(context.root,relative))!==digest(bytes))fail('CONFLICT','科普配套文档已有作者修改');}catch(e){if(e.code!=='ENOENT')throw e;}}
 const outputs=[];for(const {relative,bytes} of files){put(context.root,relative,bytes);outputs.push({path:relative,sha256:digest(bytes)});}return outputs;
}
