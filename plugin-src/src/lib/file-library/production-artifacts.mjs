// Adoption is an explicit UI action after receipt acceptance; submission alone is insufficient.
export function productionArtifactDraft({task,attemptId,artifactId,creation,body,bodyHash}) {
    const error = (code,message) => {throw Object.assign(new Error(message),{code});};
    if(task.contentId !== creation.contentId) error('INVALID_INPUT','产物不属于当前内容。');
    const attempt=task.attempts.find(a=>a.id===attemptId);
    if(task.activeAttemptId!==attemptId || attempt?.status!=='accepted' || !attempt.receipt || attempt.receipt.requestHash!==task.requestHash || attempt.receipt.attemptId!==attemptId) error('ATTEMPT_INACTIVE','请先人工验收当前尝试。');
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
    case 'draft': nextBody=artifact.text;creationPatch={...creationPatch,confirmedBodyHash:null};action='采用此正文候选';break;
    case 'analysis': creationPatch={...creationPatch,analysis:artifact.text};action='保存拆解';break;
    case 'narrative': creationPatch={...creationPatch,narrative:artifact.text};action='保存叙事方案';break;
    case 'research': case 'transcript': {
        if(!Array.isArray(data.references) || !data.references.length)error('INVALID_INPUT','产物缺少完整 references 结构。');
        const incoming=data.references;const merged=[...creation.references];for(const r of incoming){const index=merged.findIndex(x=>x.id===r.id);if(index<0)merged.push(r);else merged[index]=r;}
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
export function productionArtifactBundleDraft({task,attemptId,creation,body,bodyHash,preview=false}) {
    const error=(code,message)=>{throw Object.assign(new Error(message),{code});};
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
        if(!object(data)||['suggestions','annotations','filming'].some(key=>Object.hasOwn(data,key)))error('INVALID_INPUT','整套创作不能混入审稿或拍摄确认，请分别处理。');
        if(['analysis','narrative','draft','packaging'].includes(artifact.kind)){if(owners.has(artifact.kind))error('INVALID_INPUT','整套产物对同一字段存在多个候选，请明确唯一版本。');owners.add(artifact.kind);}
        if(['analysis','narrative'].includes(artifact.kind)){if(!text(artifact.text))error('INVALID_INPUT','拆解或叙事超出长度限制。');creationPatch[artifact.kind]=artifact.text;}
        if(artifact.kind==='draft'){if(!artifact.text.trim())error('INVALID_INPUT','正文候选不能为空。');nextBody=artifact.text;creationPatch.confirmedBodyHash=null;}
        if(['research','transcript'].includes(artifact.kind)) {
            if(!Array.isArray(data.references)||!data.references.length||data.references.length>10000||!data.references.every(reference))error('INVALID_INPUT','参考产物缺少有效的完整 references 结构。');
            for(const incoming of data.references){if(referenceIds.has(incoming.id))error('INVALID_INPUT','整套产物存在重复参考编号，请明确唯一版本。');referenceIds.add(incoming.id);const index=references.findIndex(value=>value.id===incoming.id);if(index<0)references.push(incoming);else references[index]=incoming;}
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
    return {creationPatch,body:nextBody,stale:false,action:'确认并采用整套结果'};
}
