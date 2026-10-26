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
