import {compositionBodyHash,createProductionComposition,validProductionComposition} from './production-composition.mjs';
import {serializeProductionReference,productionReferenceHash,validateTranscriptReference} from './production-reference.mjs';
const referenceError=(code,message)=>{throw Object.assign(new Error(message),{code});};
const ordered=value=>Array.isArray(value)?value.map(ordered):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,ordered(value[key])])):value;
const referenceEqual=(a,b)=>JSON.stringify(ordered(a))===JSON.stringify(ordered(b));
const transcriptBinding=task=>task.request.parameters&&typeof task.request.parameters==='object'&&!Array.isArray(task.request.parameters)&&Object.hasOwn(task.request.parameters,'transcript')?task.request.parameters.transcript:undefined;
function mergeReference(existing,incoming){
    serializeProductionReference(incoming);if(!existing)return incoming;
    serializeProductionReference(existing);
    for(const key of ['id','url','title','platform','originalText','segments','analysis','mediaAssetHash','subtitleAssetHash'])if(!referenceEqual(existing[key],incoming[key]))referenceError('STALE_INPUT','原始逐字稿、时间轴或来源已变化；请使用明确的提取任务，不能用校对覆盖原证据。');
    if((incoming.correctedText!==existing.correctedText||!referenceEqual(incoming.corrections,existing.corrections))&&!existing.originalText.trim())referenceError('INVALID_INPUT','没有原始逐字稿，不能采用校对结果。');
    return {...existing,correctedText:incoming.correctedText,corrections:incoming.corrections};
}
// Adoption is an explicit UI action after receipt acceptance; submission alone is insufficient.
function artifactDraft({task,attemptId,artifactId,creation,body,bodyHash},verifiedReference) {
    if(transcriptBinding(task)!==undefined&&!verifiedReference)referenceError('INVALID_INPUT','转写任务须先异步核验参考版本，再预览采用。');
    const error = (code,message) => {throw Object.assign(new Error(message),{code});};
    if(task.contentId !== creation.contentId) error('INVALID_INPUT','产物不属于当前内容。');
    const attempt=task.attempts.find(a=>a.id===attemptId);
    if(task.activeAttemptId!==attemptId || attempt?.status!=='accepted' || !attempt.receipt || attempt.receipt.taskId!==task.id || !/^[a-f0-9]{64}$/.test(attempt.receipt.sha256) || attempt.receipt.requestHash!==task.requestHash || attempt.receipt.attemptId!==attemptId) error('ATTEMPT_INACTIVE','请先人工验收当前尝试。');
    const artifact=attempt.result?.artifacts.find(a=>a.id===artifactId);if(!artifact)error('NOT_FOUND','找不到产物。');
    const stale=task.request.bodyHash!==bodyHash;
    if(stale && ['draft','analysis','narrative'].includes(artifact.kind)) error('STALE_INPUT','正文版本已变化，请基于当前正文重新生成。');
    let creationPatch={},nextBody=body,action='保存此产物';
    const data=artifact.data && typeof artifact.data==='object' && !Array.isArray(artifact.data) ? artifact.data : {};
    if(data.filming){if(stale)error('STALE_INPUT','拍摄清单对应旧版正文，请重新核对。');creationPatch.filming={...data.filming,shots:Array.isArray(data.filming.shots)?data.filming.shots.map(shot=>({...shot,done:false})):data.filming.shots,readThroughBodyHash:null,recordedBodyHash:null};}
    if(data.suggestions || data.annotations) {
        if(stale)error('STALE_INPUT','审稿结果对应旧版正文，请重新审稿。');
        if(data.suggestions)creationPatch.suggestions=[...creation.suggestions,...data.suggestions.filter(x=>!creation.suggestions.some(y=>y.id===x.id))];
        if(data.annotations)creationPatch.annotations=[...creation.annotations,...data.annotations.filter(x=>!creation.annotations.some(y=>y.id===x.id))];
        return {creationPatch,body,stale,action:'保存审稿建议与批注'};
    }
    switch(artifact.kind) {
    case 'draft': nextBody=artifact.text;creationPatch={...creationPatch,confirmedBodyHash:null,composition:draftComposition(artifact)};action='采用此正文候选';break;
    case 'analysis': creationPatch={...creationPatch,analysis:artifact.text};action='保存拆解';break;
    case 'narrative': creationPatch={...creationPatch,narrative:artifact.text};action='保存叙事方案';break;
    case 'research': case 'transcript': {
        if(!Array.isArray(data.references) || !data.references.length)error('INVALID_INPUT','产物缺少完整 references 结构。');
        const incoming=data.references,seen=new Set();const merged=[...creation.references];for(const r of incoming){serializeProductionReference(r);if(seen.has(r.id))error('INVALID_INPUT','参考编号重复。');seen.add(r.id);const index=merged.findIndex(x=>x.id===r.id),next=verifiedReference??mergeReference(index<0?null:merged[index],r);if(index<0)merged.push(next);else merged[index]=next;}
        creationPatch={...creationPatch,references:merged};action='保存参考与转写';break;
    }
    case 'packaging': {
        const packaging={...creation.packaging};
        for(const key of ['titles','coverTexts','intros']) {const incoming=(data.packaging || data)[key] || [];if(!Array.isArray(incoming))error('INVALID_INPUT','包装候选应为数组。');const existing=packaging[key];packaging[key]=[...existing,...incoming.filter(x=>!existing.some(y=>y.id===x.id))];}
        creationPatch={...creationPatch,packaging};action='加入包装候选并保留已有选择';break;
    }
    default:
        if(data.suggestions || data.annotations) {
            if(stale)error('STALE_INPUT','审稿结果对应旧版正文，请重新审稿。');
            if(data.suggestions)creationPatch.suggestions=[...creation.suggestions,...data.suggestions.filter(x=>!creation.suggestions.some(y=>y.id===x.id))];
            if(data.annotations)creationPatch.annotations=[...creation.annotations,...data.annotations.filter(x=>!creation.annotations.some(y=>y.id===x.id))];
            action='保存审稿建议与批注';
        } else if(data.filming)action='保存拍摄清单候选';else error('INVALID_INPUT','此类产物请在报告或知识页面处理。');
    }
    return {creationPatch,body:nextBody,stale,action};
}

// Pure whole-result preview/adoption. Every artifact uses the same immutable body baseline.
export function productionArtifactBundleDraft({task,attemptId,creation,body,bodyHash,preview=false,now=new Date().toISOString()}) {
    const error=(code,message)=>{throw Object.assign(new Error(message),{code});};
    if(transcriptBinding(task)!==undefined)error('INVALID_INPUT','专用转写任务请逐项核验参考版本，不能混入整套采用。');
    const attempt=task.attempts.find(value=>value.id===attemptId),receipt=attempt?.receipt;
    if(task.contentId!==creation.contentId)error('INVALID_INPUT','整套产物不属于当前内容。');
    if(task.activeAttemptId!==attemptId || !attempt || !(preview?['submitted','accepted']:['accepted']).includes(attempt.status) || !receipt || receipt.taskId!==task.id || receipt.attemptId!==attemptId || receipt.requestHash!==task.requestHash || !/^[a-f0-9]{64}$/.test(receipt.sha256))error('ATTEMPT_INACTIVE','请先核对当前尝试的真实提交记录；采用前须人工验收。');
    if(task.request.bodyHash!==bodyHash)error('STALE_INPUT','整套产物对应的正文版本已变化，请基于当前正文重新生成。');
    const items=attempt.result?.artifacts;
    if(!Array.isArray(items)||!items.length)error('INVALID_INPUT','整套产物为空。');
    const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,hash=/^[a-f0-9]{64}$/;
    const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
    const fields=(value,keys)=>object(value)&&Object.keys(value).every(key=>keys.includes(key));
    const text=(value,max=100000)=>typeof value==='string'&&value.length<=max;
    const url=value=>{try{const parsed=new URL(value);return ['http:','https:'].includes(parsed.protocol)&&!parsed.username&&!parsed.password;}catch{return false;}};
    const reference=value=>fields(value,['id','url','title','platform','originalText','correctedText','segments','corrections','analysis','mediaAssetHash','subtitleAssetHash'])&&uuid.test(value.id)&&(value.url===null||url(value.url))&&['title','platform','originalText','correctedText','analysis'].every(key=>text(value[key]))&&['mediaAssetHash','subtitleAssetHash'].every(key=>value[key]===null||hash.test(value[key]))&&Array.isArray(value.segments)&&value.segments.every(segment=>fields(segment,['startMs','endMs','text'])&&Number.isFinite(segment.startMs)&&segment.startMs>=0&&Number.isFinite(segment.endMs)&&segment.endMs>=segment.startMs&&text(segment.text))&&Array.isArray(value.corrections)&&value.corrections.every(correction=>fields(correction,['original','corrected','reason'])&&['original','corrected','reason'].every(key=>text(correction[key])));
    const owners=new Set(),ids=new Set(),referenceIds=new Set(),packagingIds=new Set();
    let nextBody=body,creationPatch={},references=[...creation.references],packaging={...creation.packaging};
    const order=['research','transcript','analysis','narrative','draft','packaging'];
    for(const artifact of [...items].sort((a,b)=>order.indexOf(a.kind)-order.indexOf(b.kind))) {
        if(!order.includes(artifact.kind)||!uuid.test(artifact.id)||ids.has(artifact.id)||!text(artifact.text,200000))error('INVALID_INPUT','整套产物包含不支持或重复的项目，请修正后重新提交。');
        ids.add(artifact.id);
        const data=artifact.data===null?{}:artifact.data;
        if(!object(data)||['suggestions','annotations','filming','adoptions'].some(key=>Object.hasOwn(data,key)))error('INVALID_INPUT','整套创作不能混入审稿或拍摄确认，请分别处理。');
        if(['analysis','narrative'].includes(artifact.kind)&&Object.keys(data).length||artifact.kind==='draft'&&Object.keys(data).some(key=>key!=='composition')||['research','transcript'].includes(artifact.kind)&&Object.keys(data).some(key=>key!=='references'))error('INVALID_INPUT','产物包含不属于其类别的字段。');
        if(['analysis','narrative','draft','packaging'].includes(artifact.kind)){if(owners.has(artifact.kind))error('INVALID_INPUT','整套产物对同一字段存在多个候选，请明确唯一版本。');owners.add(artifact.kind);}
        if(['analysis','narrative'].includes(artifact.kind)){if(!text(artifact.text))error('INVALID_INPUT','拆解或叙事超出长度限制。');creationPatch[artifact.kind]=artifact.text;}
        if(artifact.kind==='draft'){if(!artifact.text.trim())error('INVALID_INPUT','正文候选不能为空。');nextBody=artifact.text;creationPatch.confirmedBodyHash=null;creationPatch.composition=draftComposition(artifact);}
        if(['research','transcript'].includes(artifact.kind)) {
            if(!Array.isArray(data.references)||!data.references.length||data.references.length>10000||!data.references.every(reference))error('INVALID_INPUT','参考产物缺少有效的完整 references 结构。');
            for(const incoming of data.references){if(referenceIds.has(incoming.id))error('INVALID_INPUT','整套产物存在重复参考编号，请明确唯一版本。');referenceIds.add(incoming.id);const index=references.findIndex(value=>value.id===incoming.id),next=mergeReference(index<0?null:references[index],incoming);if(index<0)references.push(next);else references[index]=next;}
            if(references.length>10000)error('INVALID_INPUT','合并后参考资料超过保存上限。');creationPatch.references=references;
        }
        if(artifact.kind==='packaging') {
            const incoming=data.packaging??data;
            if(!fields(incoming,['titles','coverTexts','intros','selectedTitleId','selectedCoverTextId','selectedIntroId']))error('INVALID_INPUT','包装候选结构无效。');
            for(const key of ['titles','coverTexts','intros']) {
                const list=incoming[key]??[];
                if(!Array.isArray(list)||list.length>10000||!list.every(value=>fields(value,['id','text'])&&uuid.test(value.id)&&text(value.text,10000)&&value.text.trim()))error('INVALID_INPUT','包装候选应包含有效的编号与文字。');
                for(const value of list){const marker=`${key}:${value.id}`;if(packagingIds.has(marker))error('INVALID_INPUT','包装候选编号重复。');packagingIds.add(marker);const existing=packaging[key].find(item=>item.id===value.id);if(existing&&existing.text!==value.text)error('INVALID_INPUT','包装编号与已有候选冲突，请使用新的编号。');if(!existing)packaging[key]=[...packaging[key],value];}
            }
            if(['titles','coverTexts','intros'].some(key=>packaging[key].length>10000))error('INVALID_INPUT','合并后包装候选超过保存上限。');creationPatch.packaging=packaging;
        }
    }
    if(!owners.has('draft'))error('INVALID_INPUT','整套创作须包含一份完整正文。');
    if(task.request.parameters?.workflow==='content-creation'&&(!['draft','analysis','narrative','packaging'].every(kind=>owners.has(kind))||!creationPatch.analysis?.trim()||!creationPatch.narrative?.trim()||!['titles','coverTexts','intros'].every(key=>(creationPatch.packaging?.[key]??[]).some(value=>value.text.trim()))))error('INVALID_INPUT','整篇创作须交齐正文、拆解、叙事和标题／封面文字／简介候选；缺口请回写失败或等待，不能标为整套完成。');
    if(!validProductionComposition(creationPatch.composition,nextBody,compositionBodyHash(nextBody),references.map(value=>value.id)))error('INVALID_INPUT','段落范围、正文版本或参考关联无效。');
    if(!preview)creationPatch.adoptions=adoptionHistory({task,attemptId,creation,body:nextBody,artifactIds:items.map(value=>value.id),now});
    return {creationPatch,body:nextBody,stale:false,action:'确认并采用整套结果'};
}

function draftComposition(artifact) {
    if(artifact.data?.composition!==undefined){if(!validProductionComposition(artifact.data.composition,artifact.text,compositionBodyHash(artifact.text)))referenceError('INVALID_INPUT','正文产物的段落范围或版本无效。');return structuredClone(artifact.data.composition);}
    let index=0;return createProductionComposition(artifact.text,()=>{const value=compositionBodyHash(`${artifact.id}:${index++}`);return `${value.slice(0,8)}-${value.slice(8,12)}-4${value.slice(13,16)}-8${value.slice(17,20)}-${value.slice(20,32)}`;});
}
function adoptionHistory({task,attemptId,creation,body,artifactIds,now=new Date().toISOString()}) {
    const receipt=task.attempts.find(value=>value.id===attemptId)?.receipt;
    if((creation.adoptions??[]).some(value=>value.taskId===task.id&&value.attemptId===attemptId&&value.artifactIds?.some(id=>artifactIds.includes(id))))referenceError('ALREADY_ADOPTED','此提交的产物已经采用，不能重复加入。');
    return [...(creation.adoptions??[]),{taskId:task.id,attemptId,receiptHash:receipt.sha256,bodyHash:compositionBodyHash(body),at:now,artifactIds}];
}
function withAdoption(input,result){if(transcriptBinding(input.task)!==undefined)return result;return {...result,creationPatch:{...result.creationPatch,adoptions:adoptionHistory({...input,body:result.body,artifactIds:[input.artifactId]})}};}
export function productionArtifactDraft(input){return withAdoption(input,artifactDraft(input));}

// Clone before hashing so an asynchronous preview never silently rebases its reference.
export async function prepareProductionArtifactDraft(input){
    const snapshot=structuredClone(input),binding=transcriptBinding(snapshot.task);
    if(binding===undefined)return productionArtifactDraft(snapshot);
    const {task,creation,attemptId,artifactId}=snapshot;
    if(!binding||typeof binding!=='object'||Array.isArray(binding)||Object.keys(binding).sort().join(',')!=='baselineHash,intent,referenceId,version'||binding.version!==1||!['extract','correct','reextract'].includes(binding.intent)||!/^([a-f0-9]{64})$/.test(binding.baselineHash)||task.kind!=='transcription'||task.accountId||task.request.parameters.workflow)referenceError('INVALID_INPUT','转写任务缺少有效的固定意图与参考版本。');
    const current=creation.references.find(reference=>reference.id===binding.referenceId);
    if(!current||await productionReferenceHash(current)!==binding.baselineHash)referenceError('STALE_INPUT','参考资料版本已变化，请基于当前参考重新创建任务。');
    validateTranscriptReference(current,binding.intent,snapshot.missingAssetHashes??[]);
    const artifact=task.attempts.find(attempt=>attempt.id===attemptId)?.result?.artifacts.find(value=>value.id===artifactId),incoming=artifact?.data?.references;
    if(artifact?.kind!=='transcript'||!Array.isArray(incoming)||incoming.length!==1||incoming[0]?.id!==binding.referenceId||['suggestions','annotations','filming'].some(key=>Object.hasOwn(artifact.data,key)))referenceError('INVALID_INPUT','转写产物必须只包含本次固定参考，不能混入其他采用动作。');
    const candidate=incoming[0];serializeProductionReference(candidate);
    const mutable=binding.intent==='correct'?['correctedText','corrections']:binding.intent==='reextract'?['originalText','segments','correctedText','corrections','subtitleAssetHash']:['originalText','segments'];
    for(const key of Object.keys(current))if(!mutable.includes(key)&&!referenceEqual(current[key],candidate[key]))referenceError('INVALID_INPUT','转写产物改变了本次意图之外的原始证据或参考字段。');
    if(binding.intent!=='correct'&&!candidate.originalText.trim())referenceError('INVALID_INPUT','提取结果没有原始逐字稿，请保留失败并补充资料。');
    const next={...current,...Object.fromEntries(mutable.map(key=>[key,candidate[key]]))};
    if(binding.intent==='reextract'){
        if(next.subtitleAssetHash!==current.subtitleAssetHash&&next.subtitleAssetHash&&(snapshot.missingAssetHashes??[]).includes(next.subtitleAssetHash))referenceError('INVALID_INPUT','新字幕资产缺失，请先导入可核验字幕。');
        validateTranscriptReference(next,'reextract',snapshot.missingAssetHashes??[]);
    }
    return withAdoption(snapshot,artifactDraft(snapshot,next));
}
