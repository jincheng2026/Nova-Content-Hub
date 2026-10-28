import {validateSynthesisBrief} from '../../../plugin-src/src/lib/method-adapters/brief.mjs';
export const validSynthesisBrief=validateSynthesisBrief;
import {exact,uuid,token} from './validation.ts';
export const jinchengStages=['intake','analysis-author','analysis-ai','narrative','key-segment','writing','tutorial','kepu','review-page','cover-design','synthesis','revision','cover-copy','closeout','review','research','comments','patterns'];
const text=(v:unknown,max=2000)=>typeof v==='string'&&!!v.trim()&&v.length<=max&&!v.includes('\0');
export function validResearchBrief(v:unknown):boolean {
 if(!v||typeof v!=='object'||Array.isArray(v))return false;const b=v as Record<string,unknown>;
 return Object.keys(b).every(k=>['route','platform','targetIds','videoIds','commentMode'].includes(k))&&['account','topic','comments','intake'].includes(b.route as string)&&['douyin','xiaohongshu','manual'].includes(b.platform as string)&&Array.isArray(b.targetIds)&&b.targetIds.length>0&&b.targetIds.length<=100&&new Set(b.targetIds).size===b.targetIds.length&&b.targetIds.every(x=>text(x,300))&&(b.videoIds===undefined||Array.isArray(b.videoIds)&&b.videoIds.length<=3&&new Set(b.videoIds).size===b.videoIds.length&&b.videoIds.every(x=>typeof x==='string'&&/^\d{1,32}$/.test(x)))&&(b.commentMode===undefined||b.route==='comments'&&['report','audience-depth','reference-card','diagnostic'].includes(b.commentMode as string));
}
export function stageDesktopInput(method:string,input:unknown):boolean|undefined {
 if(method==='saveJinchengAuthorAnalysis')return exact(input,['contentId','text','expectedRevision'])&&uuid(input.contentId)&&text(input.text,100000)&&token(input.expectedRevision);
 if(method!=='confirmJinchengCheckpoint')return undefined;
 return exact(input,['contentId','kind','artifactId','artifactHash','expectedRevision','decision','decisionText'])&&uuid(input.contentId)&&['topic','author-analysis','analysis-comparison','narrative','framework','kepu-segment','kepu-readthrough','cover-design','key-segments','complete-draft','final-script','packaging','archive','review'].includes(input.kind as string)&&text(input.artifactId,200)&&token(input.artifactHash)&&token(input.expectedRevision)&&['confirm','reopen','reject'].includes(input.decision as string)&&text(input.decisionText);
}
