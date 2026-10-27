import fs from 'node:fs';
import path from 'node:path';
import {json,readBytes,digest,fail,safe,mkdir,atomic,writeJSON,withVaultLock,runMutation,readVaultSnapshot,nextTNumber,uuidFor,contentSources} from './core.mjs';
import {workContext,readWorkFlow,selectWorkSource} from './workflow.mjs';
const menuPath=id=>{if(!/^[A-Za-z0-9_-]{1,100}$/.test(id??''))fail('INVALID_INPUT','选题菜单身份无效');return '04_选题库/候选/'+id+'.json';};
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const author=e=>{if(e?.actor!=='author'||typeof e.text!=='string'||!e.text.trim()||!Number.isFinite(Date.parse(e.at)))fail('INVALID_INPUT','选择选题需要明确的作者决定');};
const slug=value=>value.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,60)||'未定选题';
const exists=(root,rel)=>{try{safe(root,rel);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}};
export function saveTopicCandidates(root,{sessionId,candidates,sourceRefs,expectedHash}){
    const relative=menuPath(sessionId);
    if(!Array.isArray(candidates)||candidates.length<1||candidates.length>4||!Array.isArray(sourceRefs))fail('INVALID_INPUT','选题菜单须包含1至4个候选和来源引用');
    const ids=new Set(),cards=candidates.map((c,i)=>{
        if(!c||typeof c!=='object'||Array.isArray(c))fail('INVALID_INPUT','选题卡格式无效');
        const card={id:c.id??'c'+(i+1)};
        if(!/^[A-Za-z0-9_-]{1,100}$/.test(card.id)||ids.has(card.id))fail('INVALID_INPUT','候选身份重复或无效');ids.add(card.id);
        for(const k of ['title','description','change','audience','coverage','titleExample','caution']){
            if(typeof c[k]!=='string'||c[k].length>4000||(k!=='caution'&&!c[k].trim()))fail('INVALID_INPUT','候选缺少七项字段：'+k);
            card[k]=c[k];
        }
        return card;
    });
    // Snapshot sources as data. No URL requests, file traversal or external service calls happen here.
    const value={format:'nova-topic-menu',schemaVersion:1,sessionId,candidates:cards,sourceRefs:structuredClone(sourceRefs),adoptions:[],at:new Date().toISOString()};
    const bytes=Buffer.from(JSON.stringify(value,null,2)+'\n');if(bytes.length>1024*1024)fail('INVALID_INPUT','选题菜单过大');
    return withVaultLock(root,()=>{let before=null;if(exists(root,relative)){before=digest(readBytes(root,relative));if(expectedHash!==before)fail('CONFLICT','选题菜单版本已变化');const previous=json(root,relative);if(previous.adoptions?.length)fail('CONFLICT','已选定菜单保留原快照，请新建候选轮次');}else if(expectedHash!==undefined&&expectedHash!==null)fail('CONFLICT','选题菜单来源缺失');mkdir(root,path.posix.dirname(relative));atomic(root,relative,bytes,before);return {sessionId,relativePath:relative,hash:digest(bytes),candidates:cards};});
}
const plan=(root,relativePath,text)=>({relativePath,beforeHash:exists(root,relativePath)?digest(readBytes(root,relativePath)):null,after:Buffer.from(text).toString('base64')});
function appendOverview(root,file,header,row){const old=exists(root,file)?readBytes(root,file).toString('utf8'):header;return old+(old.endsWith('\n')?'':'\n')+row+'\n';}
export function adoptTopic(root,input){
    if(!input||!hash(input.expectedHash))fail('INVALID_INPUT','选择选题参数无效');author(input.authorDecision);
    const selectedPath=menuPath(input.sessionId),runtime=safe(root,'.workbench/runtime');
    return runMutation(runtime,{action:'topic-adoption',input},{mutationId:input.mutationId},()=>{
        const before=readBytes(root,selectedPath);if(digest(before)!==input.expectedHash)fail('CONFLICT','选题菜单版本已变化');
        const menu=JSON.parse(before.toString('utf8'));if(menu.format!=='nova-topic-menu'||menu.sessionId!==input.sessionId)fail('CORRUPT','选题菜单损坏');
        const card=menu.candidates.find(c=>c.id===input.candidateId);if(!card)fail('INVALID_INPUT','所选候选不存在');
        if(menu.adoptions.some(a=>a.candidateId===card.id))fail('CONFLICT','此候选已建立正式内容，请继续原T内容');
        const snapshot=readVaultSnapshot(runtime),n=nextTNumber(snapshot),workId='T'+String(n).padStart(3,'0'),work={vaultId:snapshot.vaultId,workId},name=slug(card.title),dir='05_内容草稿/'+workId+'_'+name;
        const cardPath='04_选题库/口播观点/待做/'+workId+'_'+name+'.md';
        if(exists(root,cardPath)||exists(root,dir))fail('CONFLICT','内容目录或选题卡已存在，未覆盖');
        const title=card.title.replace(/[\r\n]/g,' '),cardText='# '+title+'\n\n**编号**：'+workId+'\n**状态**：待写\n**选题名**：'+card.title+'\n**说明**：'+card.description+'\n**改动**：'+card.change+'\n**谁会感兴趣**：'+card.audience+'\n**资料够不够**：'+card.coverage+'\n**标题示例**：'+card.titleExample+'（示例，正文定稿后由包装复核）\n**要注意**：'+(card.caution||'暂无')+'\n\n## 来源资料\n\n'+JSON.stringify(menu.sourceRefs,null,2)+'\n\n## 定题决定\n\n'+input.authorDecision.text+'\n\n未选候选保留在 ../候选/'+input.sessionId+'.json。\n';
        const source={sourceId:'topics',documentId:'doc-'+digest(cardPath).slice(0,32),relativePath:cardPath,hash:digest(cardText)};
        const artifact={kind:'topic',artifactId:'topic:'+card.id,hash:source.hash,path:cardPath,methodId:'xindao-xuanti',taskId:input.sessionId,at:input.authorDecision.at};
        const state={format:'nova-work-flow',schemaVersion:1,work,artifacts:[artifact],decisions:[{decisionId:uuidFor(input.mutationId+':topic'),kind:'topic',artifactId:artifact.artifactId,artifactHash:source.hash,decision:'confirm',evidence:input.authorDecision}],currentSource:{...source,evidence:input.authorDecision},metaQuestions:Object.fromEntries(Array.from({length:11},(_,i)=>[i+1,{answer:'还没到',at:input.authorDecision.at,history:[]}]))};
        menu.adoptions.push({candidateId:card.id,work,mutationId:input.mutationId,at:input.authorDecision.at});
        const topicOverview='04_选题库/00_选题总览.md',draftOverview='05_内容草稿/00_草稿总览.md';
        const writes=[plan(root,cardPath,cardText),plan(root,dir+'/创作过程.json',JSON.stringify(state,null,2)+'\n'),plan(root,topicOverview,appendOverview(root,topicOverview,'# 选题总览\n','| '+workId+' | '+title.replaceAll('|','／')+' | 待写 | [选题卡]('+encodeURI('口播观点/待做/'+workId+'_'+name+'.md')+') |')),plan(root,draftOverview,appendOverview(root,draftOverview,'# 草稿总览\n','| '+workId+' | '+title.replaceAll('|','／')+' | 已定题，还没开始写 | [选题卡]('+encodeURI('../'+cardPath)+') |')),plan(root,selectedPath,JSON.stringify(menu,null,2)+'\n')];
        // Reserve before publishing files: even a conflicting/cancelled attempt never reuses its T number.
        writeJSON(root,'.workbench/numbering.json',{lastNumber:n});
        return {action:'topic-adoption',work,contentDirectory:dir,writes,result:work};
    }).result;
}
/** Replay an immutable adoption plan; check every file before the first write. */
export function applyTopicReceipt(root,receipt){
    if(receipt.format!=='nova-vault-mutation'||receipt.action!=='topic-adoption'||receipt.request?.action!=='topic-adoption'||digest(JSON.stringify(receipt.request))!==receipt.requestHash||!Array.isArray(receipt.writes)||receipt.writes.length!==5||!/^T\d{3,}$/.test(receipt.work?.workId??'')||receipt.work.vaultId!==json(root,'.workbench/vault.json').vaultId||!/^05_内容草稿\/T\d{3,}_[^/]+$/.test(receipt.contentDirectory??''))fail('CORRUPT','选题落库事务无效');
    const suffix=path.posix.basename(receipt.contentDirectory),expected=['04_选题库/口播观点/待做/'+suffix+'.md',receipt.contentDirectory+'/创作过程.json','04_选题库/00_选题总览.md','05_内容草稿/00_草稿总览.md',menuPath(receipt.request.input.sessionId)];
    const writes=receipt.writes.map((w,i)=>{
        if(w.relativePath!==expected[i]||!(w.beforeHash===null||hash(w.beforeHash))||typeof w.after!=='string'||w.after.length>4*1024*1024)fail('CORRUPT','选题事务目标或内容无效');
        const bytes=Buffer.from(w.after,'base64');if(bytes.toString('base64')!==w.after)fail('CORRUPT','选题事务编码无效');
        const current=exists(root,w.relativePath)?digest(readBytes(root,w.relativePath)):null;
        if(current!==w.beforeHash&&current!==digest(bytes))fail('CONFLICT','选题落库文件被外部修改，保留现有文件');
        return {w,bytes,current};
    });
    for(const {w,bytes,current}of writes)if(current!==digest(bytes)){mkdir(root,path.posix.dirname(w.relativePath));atomic(root,w.relativePath,bytes,w.beforeHash);}
    receipt.status='committed';writeJSON(root,'.workbench/mutations/'+receipt.mutationId+'.json',receipt);
}
export function resolveCurrentWork(root,work){
    const {source}=workContext(root,work);
    return {status:source.sourceResolution,source:{sourceId:source.document.section==='topics'?'topics':'drafts',documentId:source.document.id,relativePath:source.document.relativePath,hash:source.document.hash},candidates:source.sourceCandidates,evidence:source.evidence,sourceConflict:source.document.sourceConflict??null};
}
export function selectCurrentWork(root,input){return selectWorkSource(root,input);}
export {answerMetaQuestion,metaQuestionsForStage} from './workflow.mjs';
