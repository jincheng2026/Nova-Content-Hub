import {createHash} from 'node:crypto';
import {LibraryError} from './index.mjs';
import {readVaultSnapshot,readVaultDocument,saveVaultDocument,createVaultDocument,queryVaultMutation} from '../vault/index.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HASH=/^[a-f0-9]{64}$/;
const stages={personal:'当前的我',account:'账号要说什么',content:'内容边界',packaging:'主页呈现'};
const fail=(code,message)=>{throw new LibraryError(code,message);};
const childId=(id,label)=>{const b=createHash('sha256').update(`${id}:${label}`).digest();b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const h=b.subarray(0,16).toString('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;};

function replaceStage(text,stage,content,confirmation,at){
    const start=`<!-- nova-positioning:${stage}:start -->`,end=`<!-- nova-positioning:${stage}:end -->`;
    const block=[start,`## ${stages[stage]}`,'',`状态：已确认 ${new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at))}`,'',content,'',`确认记录：${confirmation}`,`保存时间：${at}`,end].join('\n');
    const from=text.indexOf(start),to=text.indexOf(end);
    if(from>=0||to>=0){if(from<0||to<from||text.indexOf(start,from+start.length)>=0||text.indexOf(end,to+end.length)>=0)fail('CONFLICT','定位受管区块存在冲突，已保留原文。');return text.slice(0,from)+block+text.slice(to+end.length);}
    return `${text.trimEnd()}\n\n${block}\n`;
}

/** Only a claimed positioning task may persist an explicitly confirmed stage. */
export function savePositioningCheckpoint({library,context,raw}){
    if(typeof library.checkpointPositioning!=='function')fail('NOT_READY','当前工作台尚未提供受控定位检查点。');
    return library.checkpointPositioning({...raw,taskId:context?.task?.id,attemptId:context?.attempt?.id});
}

function finishCheckpoint(root,context,raw,saved){
    const {task,attempt}=context;
    let overview=null;
    if(raw.stage==='packaging'){
        const operationId=childId(raw.mutationId,'overview-packaging'),existing=queryVaultMutation(root,operationId);
        if(existing){
            overview=existing.status==='committed'?existing.result:existing.request.action==='create'?createVaultDocument(root,existing.request.input,{mutationId:operationId}):saveVaultDocument(root,existing.request.input,{mutationId:operationId});
        }else{
            const snapshot=readVaultSnapshot(root),doc=snapshot.documents.find(d=>d.section==='profile'&&/(?:^|\/)定位总览(?:_v[^/]*)?\.md$/.test(d.relativePath));
            const link=encodeURIComponent(saved.document.relativePath.split('/').at(-1));
            const text=replaceStage(doc?readVaultDocument(root,doc.id).text:'# 定位总览\n','packaging',`已确认的主页方案见[账号包装](${link})。`,raw.confirmation.trim(),raw.confirmedAt);
            overview=doc?saveVaultDocument(root,{id:doc.id,expectedHash:doc.hash,text},{mutationId:operationId}):createVaultDocument(root,{section:'profile',title:'定位总览',text},{mutationId:operationId});
        }
    }
    return {stage:raw.stage,document:saved.document,text:saved.text,...(overview?{overview:overview.document}:{}),taskId:task.id,attemptId:attempt.id,mutationId:raw.mutationId,completedTask:false};
}

/** Internal implementation; called while the runtime attempt lock is held. */
export function applyPositioningCheckpoint({root,context,raw}){
    const allowed=['workerId','claimToken','mutationId','stage','text','confirmation','confirmedAt','documentId','expectedHash'];
    if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!allowed.includes(k))||!UUID.test(raw.mutationId)||!Object.hasOwn(stages,raw.stage)||typeof raw.text!=='string'||!raw.text.trim()||raw.text.length>50_000||typeof raw.confirmation!=='string'||!raw.confirmation.trim()||raw.confirmation.length>2_000||typeof raw.confirmedAt!=='string'||!Number.isFinite(Date.parse(raw.confirmedAt))||new Date(raw.confirmedAt).toISOString()!==raw.confirmedAt||[raw.text,raw.confirmation].some(value=>value.includes('<!-- nova-positioning:')))fail('INVALID_INPUT','定位检查点需要阶段、已确认内容、用户确认原话、实际确认时间和操作编号。');
    const {task,attempt}=context;
    if(task?.request.parameters?.workflow!=='positioning-interview'||task.contentId!==null||task.activeAttemptId!==attempt?.id||attempt.status!=='claimed'||attempt.workerId!==raw.workerId||!raw.workerId||attempt.claimToken!==raw.claimToken)fail('ATTEMPT_INACTIVE','请先领取并恢复当前定位任务，再保存已确认阶段。');
    const operationId=childId(raw.mutationId,raw.stage),previous=queryVaultMutation(root,operationId);
    if(previous){
        const expected=replaceStage('',raw.stage,raw.text.trim(),raw.confirmation.trim(),raw.confirmedAt).trim();
        if(!previous.result?.text?.includes(expected)||previous.request?.input?.expectedHash!==raw.expectedHash||previous.request?.input?.id!==raw.documentId)fail('INVALID_INPUT','检查点操作编号已用于另一份内容，请核对原始 JSON。');
        let saved=previous.result;
        if(previous.status==='pending')saved=previous.request.action==='create'?createVaultDocument(root,previous.request.input,{mutationId:operationId}):saveVaultDocument(root,previous.request.input,{mutationId:operationId});
        return finishCheckpoint(root,context,raw,saved);
    }
    const snapshot=readVaultSnapshot(root);
    if(!snapshot)fail('NOT_READY','定位阶段保存需要已打开的第二大脑知识库。');
    const packaging=raw.stage==='packaging',title=packaging?'账号包装':'定位总览';
    let doc=raw.documentId?snapshot.documents.find(d=>d.id===raw.documentId):snapshot.documents.find(d=>d.section==='profile'&&new RegExp(`(?:^|/)${title}(?:_v[^/]*)?\\.md$`).test(d.relativePath));
    if(raw.documentId&&(!doc||doc.section!=='profile'||!doc.writable||!new RegExp(`(?:^|/)${title}(?:_v[^/]*)?\\.md$`).test(doc.relativePath)))fail('INVALID_INPUT','检查点只能写入本知识库对应的定位总览或账号包装。');
    if(doc&&(!raw.documentId||!HASH.test(raw.expectedHash)))fail('CONFLICT','已有定位需先读取当前版本，并携带 documentId 和 expectedHash 保存。');
    if(!doc&&(raw.documentId!==undefined||raw.expectedHash!==undefined))fail('CONFLICT','原定位文件已变化，请读取当前检查点。');
    const before=doc?readVaultDocument(root,doc.id).text:`# ${title}\n`;
    const next=replaceStage(before,raw.stage,raw.text.trim(),raw.confirmation.trim(),raw.confirmedAt);
    const options={mutationId:operationId};
    const saved=doc?saveVaultDocument(root,{id:doc.id,expectedHash:raw.expectedHash,text:next},options):createVaultDocument(root,{section:'profile',title,text:next},options);
    return finishCheckpoint(root,context,raw,saved);
}
