import {createHash} from 'node:crypto';
export const fail=(code,message=code)=>{throw Object.assign(new Error(message),{code});};
export const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export const hash=v=>createHash('sha256').update(typeof v==='string'||Buffer.isBuffer(v)?v:canonical(v)).digest('hex');
export function canonical(v){if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';if(object(v))return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';return JSON.stringify(v);}
export const number=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
export function validateResearchConfig(c){
 const keys=['version','researchId','outputDirectory','route','platform','targetIds','operations','maxRequests','comments','videoIds','commentMode','sampleLimit','intakeContractVersion'];
 if(!object(c)||Object.keys(c).some(k=>!keys.includes(k))||c.version!==1||typeof c.researchId!=='string'||!/^[-a-zA-Z0-9_]{1,100}$/.test(c.researchId)||typeof c.outputDirectory!=='string'||c.outputDirectory.length>500||c.outputDirectory.includes('\\')||c.outputDirectory.includes('\0')||!c.outputDirectory.split('/').every(p=>p&&p!=='.'&&p!=='..')||!(/^(01_对标账号|02_内容素材|调研报告库)\//.test(c.outputDirectory))||!['account','topic','comments','intake'].includes(c.route)||!['douyin','xiaohongshu','manual'].includes(c.platform)||!Array.isArray(c.targetIds)||c.targetIds.length<1||c.targetIds.length>100||c.targetIds.some(v=>typeof v!=='string'||!v.trim()||v.length>300)||new Set(c.targetIds).size!==c.targetIds.length||!Array.isArray(c.operations)||c.operations.length>8||new Set(c.operations).size!==c.operations.length||c.operations.some(v=>!['profile','user-posts','video','comments','douyin-search','user-search','xhs-search','xhs-profile'].includes(v))||!Number.isInteger(c.maxRequests)||c.maxRequests<0||c.maxRequests>100||typeof c.comments!=='boolean'||c.operations.includes('comments')&&!c.comments||c.videoIds!==undefined&&(!Array.isArray(c.videoIds)||c.videoIds.length>3||new Set(c.videoIds).size!==c.videoIds.length||c.videoIds.some(v=>typeof v!=='string'||!/^\d{1,32}$/.test(v))))fail('INVALID_INPUT','固定研究配置无效，须显式选择研究对象、输出目录、权限和预算。');
 if(c.intakeContractVersion!==undefined&&(c.route!=='intake'||c.intakeContractVersion!==2))fail('INVALID_INPUT','入库契约版本仅允许在素材入库任务中冻结为2。');
 if(c.sampleLimit!==undefined&&(!Number.isInteger(c.sampleLimit)||c.sampleLimit<1||c.sampleLimit>3||c.route!=='account'||c.platform!=='douyin'||!c.operations.includes('user-posts')))fail('INVALID_INPUT','账号样本上限须冻结为1到3条，并仅从授权账号作品响应派生。');
 const xhs=c.operations.some(v=>v.startsWith('xhs-')),dy=c.operations.some(v=>!v.startsWith('xhs-'));
 if(c.commentMode!==undefined&&(c.route!=='comments'||!['report','audience-depth','reference-card','diagnostic'].includes(c.commentMode)))fail('INVALID_INPUT','评论产物模式须在固定请求中明确。');
 if(c.platform==='manual'&&c.operations.length||c.platform==='douyin'&&xhs||c.platform==='xiaohongshu'&&dy)fail('INVALID_INPUT','研究平台与冻结操作不一致。');
 return structuredClone(c);
}
export function researchMediaAuthorized(task){
 try{const p=task?.request?.parameters,c=validateResearchConfig(p?.researchRuntime);return p.workflow==='jincheng-research'&&['research','analysis','transcription'].includes(task.kind)&&c.platform==='douyin'&&(c.videoIds?.length>0||c.sampleLimit>0)&&c.operations.includes('video')&&task.request.tools.includes('tikhub')&&task.request.tools.includes('media')&&object(p.media)&&Object.keys(p.media).sort().join(',')==='maxBytes,maxDownloads,version'&&p.media.version===1&&p.media.maxBytes===67108864&&p.media.maxDownloads===3;}catch{return false;}
}
export const safeJSON=v=>JSON.stringify(v).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
export function clean(value){return String(value??'').replace(/\/(?:Users|home)\/[^\s<>"']+/g,'【已隐藏本机路径】').replace(/[A-Za-z]:\\Users\\[^\s<>"']+/g,'【已隐藏本机路径】').replace(/\bBearer\s+[A-Za-z0-9._~+/-]{8,}={0,2}/gi,'【已隐藏敏感信息】').replace(/\bsk-[A-Za-z0-9_-]{12,}/g,'【已隐藏敏感信息】').replace(/\b(?:api[_-]?key|access[_-]?token|authorization|cookie|password|secret)\s*[:=]\s*["']?[^\s,;"']{4,}/gi,'【已隐藏敏感信息】');}
export const escape=v=>clean(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function sourceURL(value){try{const u=new URL(value);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)return null;for(const k of u.searchParams.keys())if(/^(?:access_token|auth|authorization|cookie|decode_key|key|secret|session|sign|signature|token|x-signature)$/i.test(k))return null;u.search='';u.hash='';return u.href;}catch{return null;}}

/** Samples are derived only by the broker from a successful fixed user-posts response. */
export function deriveResearchVideoIds(response,limit){
 if(!Number.isInteger(limit)||limit<1||limit>3)fail('INVALID_INPUT');
 const d=response?.data??response,rows=d?.aweme_list??d?.data?.aweme_list;if(!Array.isArray(rows))fail('UNSUPPORTED_NORMALIZATION');
 return [...new Set(rows.map(r=>typeof r?.aweme_id==='string'&&/^\d{1,32}$/.test(r.aweme_id)?r.aweme_id:null).filter(Boolean))].slice(0,limit);
}
export function researchVideoAuthorized(task,costs,attemptId,videoId){
 try {const c=validateResearchConfig(task.request.parameters.researchRuntime);return !!c.videoIds?.includes(videoId)||!!c.sampleLimit&&costs.some(cost=>cost.taskId===task.id&&cost.attemptId===attemptId&&cost.service==='tikhub'&&cost.status==='measured'&&cost.usage?.ok===true&&cost.usage.operation==='user-posts'&&c.targetIds.includes(cost.usage.id)&&Array.isArray(cost.usage.researchVideoIds)&&cost.usage.researchVideoIds.length<=c.sampleLimit&&cost.usage.researchVideoIds.includes(videoId)&&typeof cost.usage.responseHash==='string');}catch{return false;}
}
