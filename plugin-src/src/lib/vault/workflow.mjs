import {checkpointKey,currentStageArtifacts} from '../method-adapters/checkpoints.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {json,scan,contentSources,creationData,readBytes,digest,fail,safe,atomic,mkdir,withVaultLock} from './core.mjs';
const KINDS=['topic','author-analysis','analysis-comparison','narrative','framework','kepu-segment','kepu-readthrough','cover-design','key-segments','complete-draft','final-script','packaging','recorded','publication','archive','review'];
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export function workContext(root,work){
    const descriptor=json(root,'.workbench/vault.json');
    if(!work||work.vaultId!==descriptor.vaultId||!/^T\d{3,}$/.test(work.workId??''))fail('INVALID_INPUT','知识库或内容身份不匹配');
    const snapshot={root,vaultId:descriptor.vaultId,...scan(root,descriptor.vaultId)};
    const source=contentSources(snapshot).find(s=>s.tNumber===work.workId);
    if(!source)fail('SOURCE_MISSING','此知识库没有该内容的可恢复来源');
    return {snapshot,source,file:source.contentDirectory+'/创作过程.json'};
}
function load(root,work){
    const context=workContext(root,work);
    const empty={format:'nova-work-flow',schemaVersion:1,work,artifacts:[],decisions:[],metaQuestions:{}};
    let state=empty,bytes;
    try{bytes=readBytes(root,context.file);state=JSON.parse(bytes.toString('utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
    if(state.format!=='nova-work-flow'||state.schemaVersion!==1||state.work?.vaultId!==work.vaultId||state.work?.workId!==work.workId||!Array.isArray(state.artifacts)||!Array.isArray(state.decisions))fail('CORRUPT','创作过程记录损坏');
    return {...context,state,beforeHash:bytes?digest(bytes):null,revision:digest(bytes??JSON.stringify(empty))};
}
function persist(root,context){mkdir(root,path.posix.dirname(context.file));const bytes=Buffer.from(JSON.stringify(context.state,null,2)+'\n');atomic(root,context.file,bytes,context.beforeHash);return digest(bytes);}
function originalFacts(root,source){
    return source.documents.filter(d=>d.format==='html').map(d=>{
        const data=creationData(readBytes(root,d.relativePath).toString('utf8'));if(!data)return null;
        const info=data.items.find(i=>i.kind==='info');
        return {source:{sourceId:'drafts',documentId:d.id,relativePath:d.relativePath,hash:d.hash},pageId:data.page_id??data.pageId??null,applicable:d.id===source.document.id&&!source.document.sourceConflict,approved:typeof info?.fields?.approved==='string'?info.fields.approved:'',recorded:typeof info?.fields?.recorded==='string'?info.fields.recorded:'',suggestionDecisions:data.items.filter(i=>i.kind==='suggestion').map(i=>({id:i.id,decision:i.fields?.decision??''})),packaging:data.items.filter(i=>['pubslot','pubcand','final'].includes(i.kind))};
    }).filter(Boolean);
}
function artifactCurrent(root,artifact){try{return digest(readBytes(root,artifact.path))===artifact.hash;}catch(e){if(['ENOENT','INVALID_INPUT'].includes(e.code))return false;throw e;}}
function scopedArtifact(root,a){
 if(a.kind!=='kepu-segment'||a.kepuScope||!artifactCurrent(root,a))return a;
 try{const data=JSON.parse(readBytes(root,a.path).toString('utf8')).data;if(Number.isInteger(data.index)&&data.index>=0&&typeof data.framework?.artifactId==='string'&&hash(data.framework.hash))return {...a,kepuScope:{frameworkId:data.framework.artifactId,frameworkHash:data.framework.hash,index:data.index,title:data.title}};}catch{}return a;
}
function dependenciesCurrent(root,artifact,state,visited=new Set()){
 if(!['framework','kepu-segment','kepu-readthrough'].includes(artifact.kind)||artifact.methodId!=='jc-kepu-video')return true;
 if(visited.has(artifact.artifactId))return false;visited.add(artifact.artifactId);
 let record;try{record=JSON.parse(readBytes(root,artifact.path).toString('utf8'));}catch{return false;}
 if(!Array.isArray(record.dependencies))return false;
 return record.dependencies.every(pin=>{const a=state.artifacts.find(a=>a.artifactId===pin.artifactId&&a.hash===pin.hash),d=state.decisions.findLast(d=>d.artifactId===pin.artifactId);if(!a||!artifactCurrent(root,a)||d?.decision!=='confirm'||d.artifactHash!==pin.hash||d.decisionId!==pin.decisionId)return false;const key=checkpointKey(scopedArtifact(root,a)),latest=state.artifacts.findLast(b=>checkpointKey(scopedArtifact(root,b))===key);return latest?.artifactId===a.artifactId&&dependenciesCurrent(root,a,state,new Set(visited));});
}
export function readWorkFlow(root,work){
    const context=load(root,work),{source,state}=context,original=originalFacts(root,source),facts={},artifacts=state.artifacts.map(a=>scopedArtifact(root,a)),checkpointStates={};
    for(const artifact of artifacts){const decision=state.decisions.findLast(d=>d.artifactId===artifact.artifactId);checkpointStates[artifact.artifactId]={confirmed:artifactCurrent(root,artifact)&&dependenciesCurrent(root,artifact,state)&&decision?.decision==='confirm'&&decision.artifactHash===artifact.hash,stale:!artifactCurrent(root,artifact)};}
    for(const kind of KINDS){
        const artifact=state.artifacts.findLast(a=>a.kind===kind),decision=state.decisions.findLast(d=>d.kind===kind);
        const confirmed=!!artifact&&checkpointStates[artifact.artifactId].confirmed;
        facts[kind]={artifact:artifact??null,confirmed,stale:!!artifact&&!artifactCurrent(root,artifact)};
        facts[kind.replace(/-([a-z])/g,(_,c)=>c.toUpperCase())+'Confirmed']=confirmed;
    }
    // Original field values stay authoritative; this ledger never replaces them with a second flag.
    const applicable=original.filter(f=>f.applicable);
    if(applicable.length){facts.finalScriptConfirmed=applicable.some(f=>f.approved.trim());facts['final-script']={...facts['final-script'],confirmed:facts.finalScriptConfirmed,authority:'creation-document'};}
    facts.recorded=source.recorded||applicable.some(f=>f.recorded.trim());
    facts.recordedConfirmed=facts.recorded;
    facts.published=source.published;
    facts.publicationConfirmed=source.published;
    facts.publication={...facts.publication,confirmed:source.published,authority:'publication-source'};
    facts.sourceResolution=source.sourceResolution;
    const nextActions=[{action:'edit-current',source:{sourceId:source.document.section==='topics'?'topics':'drafts',documentId:source.document.id},available:!source.document.sourceConflict}];
    if(source.document.sourceConflict)nextActions.push({action:'choose-current-source',candidates:source.sourceCandidates});
    for(const a of currentStageArtifacts(artifacts)){const f=checkpointStates[a.artifactId];if(!f.confirmed&&!f.stale&&!['recorded','publication','archive'].includes(a.kind))nextActions.push({action:'confirm-checkpoint',kind:a.kind,artifactId:a.artifactId,artifactHash:a.hash});}
    return {work,revision:context.revision,facts,decisions:structuredClone(state.decisions),artifacts:structuredClone(artifacts),checkpointStates,metaQuestions:structuredClone(state.metaQuestions??{}),originalFacts:original,nextActions,sourceCandidates:source.sourceCandidates};
}
export function appendStageArtifact(root,input){
    if(!input||!KINDS.includes(input.kind)||typeof input.artifactId!=='string'||!input.artifactId.trim()||!hash(input.hash)||typeof input.path!=='string'||typeof input.methodId!=='string'||typeof input.taskId!=='string')fail('INVALID_INPUT','阶段产物信息无效');
    return withVaultLock(root,()=>{
        const context=load(root,input.work);
        if(!input.path.startsWith(context.source.contentDirectory+'/')&&!context.source.documents.some(d=>d.relativePath===input.path))fail('INVALID_INPUT','阶段产物必须属于同一T内容目录');
        safe(root,input.path);if(digest(readBytes(root,input.path))!==input.hash)fail('CONFLICT','阶段产物版本已变化');
        let entry={kind:input.kind,artifactId:input.artifactId,hash:input.hash,path:input.path,methodId:input.methodId,taskId:input.taskId,at:new Date().toISOString()};
        entry=scopedArtifact(root,entry);
        const previous=context.state.artifacts.find(a=>a.artifactId===entry.artifactId);
        if(previous&&!['kind','hash','path','methodId','taskId'].every(k=>previous[k]===entry[k]))fail('CONFLICT','阶段产物身份已用于其他版本');
        if(previous&&['kind','artifactId','hash','path','methodId','taskId'].every(k=>previous[k]===entry[k]))return {revision:context.revision,artifactId:entry.artifactId,path:entry.path,hash:entry.hash};
        context.state.artifacts.push(entry);return {revision:persist(root,context),artifactId:entry.artifactId,path:entry.path,hash:entry.hash};
    });
}
/** Only a trusted author controller or verified host response may supply evidence. Assistant request prose is not evidence. */
export function confirmCheckpoint(root,input){
    if(!input||!KINDS.includes(input.kind)||!['confirm','reopen','reject'].includes(input.decision)||!hash(input.artifactHash)||!hash(input.expectedRevision))fail('INVALID_INPUT','阶段决定参数无效');
    if(input.evidence?.actor!=='author'||typeof input.evidence.text!=='string'||!input.evidence.text.trim()||!Number.isFinite(Date.parse(input.evidence.at)))fail('INVALID_INPUT','阶段决定需要可核实的作者确认');
    return withVaultLock(root,()=>{
        const context=load(root,input.work);
        if(context.revision!==input.expectedRevision)fail('CONFLICT','阶段记录版本已变化，请重新读取');
        const requested=context.state.artifacts.find(a=>a.artifactId===input.artifactId&&a.kind===input.kind),key=requested?checkpointKey(scopedArtifact(root,requested)):null;
        const artifact=context.state.artifacts.findLast(a=>checkpointKey(scopedArtifact(root,a))===key);
        if(artifact&&input.decision==='confirm'&&!dependenciesCurrent(root,artifact,context.state))fail('CHECKPOINT_REQUIRED','上游决定已变化，先重新整理该阶段候选。');
        if(!artifact||artifact.artifactId!==input.artifactId||artifact.hash!==input.artifactHash||!artifactCurrent(root,artifact))fail('CONFLICT','待决定的产物版本已变化');
        const legacy=originalFacts(root,context.source).filter(f=>f.applicable);
        if((input.kind==='final-script'&&legacy.length>0)||['recorded','publication'].includes(input.kind))fail('INVALID_INPUT','此状态由原创作页字段或实际发布事实维护，请更新对应真源');
        const decision={decisionId:randomUUID(),kind:input.kind,artifactId:input.artifactId,artifactHash:input.artifactHash,decision:input.decision,evidence:structuredClone(input.evidence)};
        context.state.decisions.push(decision);return {revision:persist(root,context),decisionId:decision.decisionId};
    });
}
export function answerMetaQuestion(root,{work,number,answer,at,expectedHash}){
    if(!Number.isInteger(number)||number<1||number>11||typeof answer!=='string'||!answer.trim()||!Number.isFinite(Date.parse(at)))fail('INVALID_INPUT','元问题答案无效');
    return withVaultLock(root,()=>{const context=load(root,work);if(context.revision!==expectedHash)fail('CONFLICT','元问题版本已变化');const questions=context.state.metaQuestions??={};const previous=questions[number];questions[number]={answer,at,history:[...(previous?.history??[]),...(previous?[{answer:previous.answer,at:previous.at}]:[])]};return {revision:persist(root,context)};});
}
export function metaQuestionsForStage(stage){
    const stages={topic:[1,2,4],narrative:[3,4,5,6,7],'complete-draft':[8],recorded:[8],packaging:[9],publication:[9],review:[10],learning:[11]};
    return stages[stage]??[];
}
/** Explicit author choice pins a source identity; changed document bytes remain the same current source. */
export function selectWorkSource(root,input){
    if(input?.authorDecision?.actor!=='author'||typeof input.authorDecision.text!=='string'||!input.authorDecision.text.trim()||!Number.isFinite(Date.parse(input.authorDecision.at)))fail('INVALID_INPUT','当前稿选择需要作者决定');
    return withVaultLock(root,()=>{
        const context=load(root,input.work);
        if(context.revision!==input.expectedRevision)fail('CONFLICT','当前稿选择版本已变化');
        const document=context.source.documents.find(d=>d.id===input.documentId);
        if(!document||document.hash!==input.expectedHash)fail('CONFLICT','所选原件版本已变化');
        if(digest(readBytes(root,document.relativePath))!==input.expectedHash)fail('CONFLICT','所选原件被外部修改');
        const selection={sourceId:document.section==='topics'?'topics':'drafts',documentId:document.id,relativePath:document.relativePath,hash:document.hash,evidence:structuredClone(input.authorDecision)};
        if(context.state.currentSource)(context.state.sourceHistory??=[]).push(context.state.currentSource);
        context.state.currentSource=selection;
        return {revision:persist(root,context),source:selection};
    });
}
