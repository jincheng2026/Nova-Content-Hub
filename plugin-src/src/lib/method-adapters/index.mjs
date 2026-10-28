import {createHash} from 'node:crypto';
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const text=(v,max=500000)=>typeof v==='string'&&v.trim().length>0&&v.length<=max&&!v.includes('\0');
const fail=(code,message=code)=>{throw Object.assign(new Error(message),{code});};
const check=(v,code='INVALID_METHOD_INPUT')=>{if(!v)fail(code);};
const keys=(v,allowed)=>object(v)&&Object.keys(v).every(k=>allowed.includes(k));
const pin=v=>keys(v,['artifactId','hash'])&&text(v.artifactId,200)&&/^[a-f0-9]{64}$/.test(v.hash);
const list=(v,min=1,max=100)=>Array.isArray(v)&&v.length>=min&&v.length<=max&&v.every(x=>text(x));
const sha=v=>createHash('sha256').update(v).digest('hex');
const escape=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export {validateSynthesisBrief} from './brief.mjs';
import {validateSynthesisBrief,validMethodRatio} from './brief.mjs';
const levelSections={orientation:{consensus:'当前共识',misconceptions:'常见误区',oneMinute:'一分钟版本'},issue:{issues:'核心议题',schools:'主要派别',agreement:'共识与分歧',power:'话语权结构',bottlenecks:'卡点',action:'可行动判断'},generative:{puzzle:'拼图桌面',relationships:'材料之间',gaps:'缺失拼图',hypothesis:'微原创',limits:'下注边界',validation:'下一步验证'}};
const baseSections={conclusions:'先给结论',elevator:'电梯致辞',understanding:'当前理解',debates:'争议与误区',judgment:'我的判断',next:'下一步'};
export function compileSynthesisReport(brief,report){
 check(validateSynthesisBrief(brief));check(keys(report,['title','sections','sources','claims','externalVerification'])&&text(report.title,200)&&object(report.sections));
 const headings={...baseSections,...levelSections[brief.depth]};for(const k of Object.keys(headings))check(text(report.sections[k]),'REPORT_SECTION_REQUIRED');
 check(Array.isArray(report.sources)&&report.sources.length<=1000&&Array.isArray(report.claims)&&report.claims.length>0,'SOURCE_REQUIRED');
 check(['verified-online','provided-materials-only','no-external-sources'].includes(report.externalVerification),'VERIFICATION_REQUIRED');
 const ids=new Set();for(const s of report.sources){check(keys(s,['id','title','url','accessedAt','text','sha256'])&&text(s.id,100)&&!ids.has(s.id)&&text(s.title)&&text(s.text)&&/^\d{4}-\d{2}-\d{2}$/.test(s.accessedAt),'SOURCE_REQUIRED');if(s.url){let u;try{u=new URL(s.url);}catch{}check(u&&['https:','http:'].includes(u.protocol),'SOURCE_REQUIRED');}check(sha(s.text)===s.sha256,'SOURCE_HASH_MISMATCH');ids.add(s.id);}
 for(const c of report.claims){check(keys(c,['kind','text','sourceIds','quotes'])&&['fact','consensus','dispute','judgment'].includes(c.kind)&&text(c.text)&&Array.isArray(c.sourceIds)&&c.sourceIds.every(id=>ids.has(id))&&(c.kind==='judgment'||c.sourceIds.length>0),'SOURCE_REQUIRED');check(c.quotes===undefined||Array.isArray(c.quotes),'QUOTE_MISMATCH');for(const q of c.quotes??[])check(keys(q,['sourceId','text'])&&c.sourceIds.includes(q.sourceId)&&text(q.text)&&report.sources.find(s=>s.id===q.sourceId)?.text.includes(q.text),'QUOTE_MISMATCH');}
 const boundary=`${brief.question}\n\n用途：${brief.purpose}\n时间边界：${brief.timeBoundary}\n范围边界：${brief.scopeBoundary}`;
 let markdown=`# ${report.title}\n\n## 真问题\n\n${boundary}\n\n`;
 for(const [key,heading] of Object.entries(headings))markdown+=`## ${heading}\n\n${report.sections[key]}\n\n`;
 markdown+='## 事实、共识、争议与判断账本\n\n'+report.claims.map(c=>`- [${{fact:'事实',consensus:'共识',dispute:'争议',judgment:'判断'}[c.kind]}] ${c.text}（${c.sourceIds.join('、')||'AI 判断，无外部证据'}）`).join('\n')+'\n\n## References\n\n';
 markdown+=report.sources.length?report.sources.map(s=>`- ${s.id}：${s.title}${s.url?' — '+s.url:''}；取得日期 ${s.accessedAt}；SHA256 ${s.sha256}`).join('\n'):'无外部来源。';
 markdown+=`\n\n核验状态：${{ 'verified-online':'已按本次声明联网核验，逐项原证据见来源账本','provided-materials-only':'仅使用所给材料；未联网核验最新动态','no-external-sources':'没有联网或外部来源'}[report.externalVerification]}\n`;
 return {markdown,html:`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(report.title)}</title><style>body{max-width:880px;margin:40px auto;padding:24px;background:#F5F5F7;color:#1D1D1F;font:16px/1.7 system-ui}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#fff;padding:24px;border-radius:16px}</style><body><pre>${escape(markdown)}</pre></body></html>`,ledger:structuredClone(report.sources)};
}
export const REVIEW_REASON_TYPES=['voice','frame','caption','meet','you','rule','plat','op','ai'];
const reasonLabel={voice:'参考口播',frame:'参考画面',caption:'发布文字（视频里没说）',meet:'会议',you:'你之前定的',rule:'已确认判断',plat:'平台规则',op:'原稿自己的内容',ai:'AI 自己的判断'};
const basisType={voice:'参考口播',frame:'参考画面',you:'你之前定的',rule:'你之前定的',meet:'运营',caption:'运营',plat:'运营',op:'运营',ai:'AI 自己的判断'};
const verdict={must:'已定要改',optional:'待你定',keep:'不用改',wait:'等录屏再定'};
export function compileReviewPage(workId,spec,{confirmed=()=>false}={}){
 check(keys(spec,['title','original','changes'])&&text(spec.title,200)&&text(spec.original)&&Array.isArray(spec.changes)&&spec.changes.length>0&&spec.changes.length<=500);
 const intervals=[];const suggestions=spec.changes.map((c,i)=>{
  check(keys(c,['old','insert_after','new','verdict','reasons','confirmation'])&&typeof c.new==='string'&&Object.hasOwn(verdict,c.verdict)&&Array.isArray(c.reasons)&&c.reasons.length>0);
  if(c.verdict==='keep')check(c.insert_after===undefined&&c.new===c.old,'KEEP_MUST_PRESERVE');
  if(c.verdict==='must')check(pin(c.confirmation)&&confirmed(c.confirmation,c),'AUTHOR_CONFIRMATION_REQUIRED');
  for(const r of c.reasons){check(keys(r,['type','text','time','quote','sourceText'])&&REVIEW_REASON_TYPES.includes(r.type)&&text(r.text),'REASON_REQUIRED');if(r.type==='voice')check(text(r.time)&&/\d+:\d{2}/.test(r.time)&&text(r.quote)&&text(r.sourceText)&&r.sourceText.includes(r.quote),'QUOTE_MISMATCH');}
  let original=c.old,proposed=c.new;check((c.old===undefined)!==(c.insert_after===undefined));
  if(c.insert_after!==undefined){check(text(c.insert_after)&&spec.original.split('\n').filter(l=>l===c.insert_after).length===1,'QUOTE_NOT_UNIQUE');original=c.insert_after;proposed=c.insert_after+'\n'+c.new;}
  check(text(original)&&spec.original.split(original).length===2,'QUOTE_NOT_UNIQUE');const start=spec.original.indexOf(original),end=start+original.length;check(!intervals.some(([a,b])=>start<b&&end>a),'OVERLAPPING_CHANGES');intervals.push([start,end]);
  return {id:'review-'+sha(JSON.stringify(c)).slice(0,18),segment:'review-original',category:'表达',source:'AI',original,proposed,reason:c.reasons.map(r=>reasonLabel[r.type]+'：'+r.text).join('\n'),basis:{type:basisType[c.reasons[0].type],text:c.reasons.map(r=>reasonLabel[r.type]+'：'+r.text).join('\n')},verdict:verdict[c.verdict],locked:{reviewReasons:structuredClone(c.reasons),reviewVerdict:c.verdict,...(c.confirmation?{reviewConfirmation:structuredClone(c.confirmation)}:{}),...(c.insert_after!==undefined?{insert_after:c.insert_after}:{})}};
 });
 return {content_id:workId,type:'口播',stage:'审稿',title:spec.title,narrative:{story:'原稿审定',audience:'当前作者',problem:'逐条核对修改依据'},segments:[{id:'review-original',title:'原稿',mine:spec.original,baseline:spec.original}],suggestions,info:{locked:{reviewOriginalHash:sha(spec.original)}}};
}
export function validateKepuCandidate(kind,data){
 if(kind==='framework'){check(keys(data,['narrative','segments','opening','ending','duration'])&&pin(data.narrative)&&Array.isArray(data.segments)&&data.segments.length>0&&data.segments.length<=100&&data.segments.every(x=>keys(x,['id','title','purpose'])&&text(x.id,64)&&text(x.title)&&text(x.purpose))&&new Set(data.segments.map(s=>s.id)).size===data.segments.length&&text(data.opening)&&text(data.ending)&&text(data.duration));return;}
 if(kind==='kepu-segment'){check(keys(data,['framework','index','title','authorSpeech','text','additions','references','checks','suggestion','initiation','previous']));check(text(data.authorSpeech),'AUTHOR_SPEECH_REQUIRED');check(pin(data.framework)&&Number.isInteger(data.index)&&data.index>=0&&text(data.title)&&text(data.text)&&list(data.additions,0)&&text(data.suggestion));check(Array.isArray(data.references)&&data.references.length>=2&&data.references.length<=3,'REFERENCE_REQUIRED');for(const r of data.references)check(keys(r,['who','text','sourceText','time','patterns','url'])&&text(r.who)&&text(r.text)&&text(r.sourceText)&&r.sourceText.includes(r.text)&&text(r.time)&&list(r.patterns,1,3),'REFERENCE_REQUIRED');check(keys(data.checks,['continuity','repetition','facts','bannedWords'])&&['continuity','repetition','facts','bannedWords'].every(k=>text(data.checks[k])),'CHECKS_REQUIRED');return;}
 if(kind==='kepu-readthrough'){check(keys(data,['framework','segments','checks','accurateNotes','changeLog'])&&pin(data.framework)&&Array.isArray(data.segments)&&data.segments.length>0&&data.segments.every(pin)&&text(data.checks)&&text(data.accurateNotes)&&text(data.changeLog));return;}
 fail('STAGE_FORBIDDEN');
}
export function validateCoverDesign(data){
 check(keys(data,['title','style','visualProposition','caseId','preserve','replace','exclude','specification','evidence','identity','ratio'])&&['title','style','visualProposition','caseId','specification'].every(k=>text(data[k]))&&list(data.replace)&&list(data.exclude)&&list(data.evidence)&&['none','own-photo-required'].includes(data.identity)&&validMethodRatio(data.ratio));check(list(data.preserve,3,5),'CASE_STRUCTURE_REQUIRED');
}
