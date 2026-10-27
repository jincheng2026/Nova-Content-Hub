import {prepareResearchAdoption} from './production-research.mjs';
import {validProductionComposition,validProductionAdoptions,migrateProductionComposition} from './production-composition.mjs';
import {productionArtifactBundleDraft,productionArtifactDraft} from './production-artifacts.mjs';
import {productionArchive} from './production-archive.mjs';
import {freezeCreatorContext,businessSkillForTask} from './production-creator-context.mjs';
import {readVaultTaskContext} from '../vault/index.mjs';
import {createHash, randomUUID} from 'node:crypto';
import path from 'node:path';
import {radarArtifactCandidates,radarId,renderRadarReport} from './radar.mjs';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HASH = /^[a-f0-9]{64}$/;
const STAGES = ['idea','research','references','transcription','analysis','narrative','writing','ready','published'];
const KINDS = ['research','transcription','analysis','writing','packaging','review'];
const STATES = ['created','claimed','waiting-user','waiting-permission','submitted','accepted','rejected','failed','cancelled'];
const LIVE = ['created','claimed','waiting-user','waiting-permission'];
const REFERENCE_ARTIFACTS = ['research','transcript','report'];
const ARTIFACTS = ['report','research','transcript','analysis','narrative','draft','packaging','feedback','knowledge'];
const plain = v => !!v && typeof v === 'object' && !Array.isArray(v) && [Object.prototype,null].includes(Object.getPrototypeOf(v));
const bodyDigest = value => createHash('sha256').update(value).digest('hex');
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const iso = v => {try {return typeof v === 'string' && new Date(v).toISOString() === v;} catch {return false;}};
const text = (v, max = 100000, empty = true) => typeof v === 'string' && v.length <= max && (empty || !!v.trim());
const url = v => {try {const u = new URL(v); return ['http:','https:'].includes(u.protocol) && !u.username && !u.password;} catch {return false;}};
function jsonOK(v, depth = 0, secret = false) {
    if (depth > 20) return false;
    if (v === null || typeof v === 'boolean' || typeof v === 'string') return typeof v !== 'string' || v.length <= 200000;
    if (typeof v === 'number') return Number.isFinite(v);
    if (Array.isArray(v)) return v.length <= 2000 && v.every(x => jsonOK(x, depth + 1, secret));
    return plain(v) && Object.keys(v).length <= 200 && Object.entries(v).every(([k,x]) => !['__proto__','constructor','prototype'].includes(k) && (!secret || !/(?:api.?key|secret|password|authorization|token|credential)/i.test(k)) && jsonOK(x,depth + 1,secret));
}
const fields = (v, names) => plain(v) && Object.keys(v).every(k => names.includes(k));
const unique = values => Array.isArray(values) && new Set(values).size === values.length;
const objects = values => Array.isArray(values) && values.length <= 10000 && values.every(x => plain(x) && UUID.test(x.id)) && unique(values.map(x => x.id));
export const emptyProduction = () => ({schemaVersion:1,nextTNumber:1,accounts:[],reports:[],creations:[],tasks:[],feedback:[],knowledge:[],costs:[]});
export function defaultProductionCreation(contentId, number, now) {
    return {contentId,tNumber:`T${String(number).padStart(3,'0')}`,stage:'idea',kind:'other',references:[],analysis:'',narrative:'',suggestions:[],annotations:[],packaging:{titles:[],coverTexts:[],intros:[],selectedTitleId:null,selectedCoverTextId:null,selectedIntroId:null},confirmedBodyHash:null,filming:{shots:[],readThroughBodyHash:null,recordedBodyHash:null},createdAt:now,updatedAt:now};
}
export function validProductionCreation(c) {
    if (!fields(c,['contentId','tNumber','stage','kind','references','analysis','narrative','suggestions','annotations','packaging','confirmedBodyHash','filming','composition','adoptions','createdAt','updatedAt']) || !UUID.test(c.contentId) || !/^T[0-9]{3,}$/.test(c.tNumber) || !STAGES.includes(c.stage) || !['tutorial','spoken','science','other'].includes(c.kind) || !text(c.analysis) || !text(c.narrative) || !(c.confirmedBodyHash === null || HASH.test(c.confirmedBodyHash)) || !iso(c.createdAt) || !iso(c.updatedAt) || !Array.isArray(c.suggestions) || !Array.isArray(c.annotations) || !jsonOK(c.suggestions) || !jsonOK(c.annotations) || !objects(c.references)) return false;
    if(c.composition!==undefined&&!validProductionComposition(c.composition,undefined,undefined,c.references.map(r=>r.id))||c.adoptions!==undefined&&!validProductionAdoptions(c.adoptions))return false;
    for (const r of c.references) if (!fields(r,['id','url','title','platform','originalText','correctedText','segments','corrections','analysis','mediaAssetHash','subtitleAssetHash']) || !(r.url === null || url(r.url)) || !['title','platform','originalText','correctedText','analysis'].every(k => text(r[k])) || !['mediaAssetHash','subtitleAssetHash'].every(k => r[k] === null || HASH.test(r[k])) || !Array.isArray(r.segments) || !r.segments.every(s => fields(s,['startMs','endMs','text']) && Number.isFinite(s.startMs) && s.startMs >= 0 && Number.isFinite(s.endMs) && s.endMs >= s.startMs && text(s.text)) || !Array.isArray(r.corrections) || !r.corrections.every(x => fields(x,['original','corrected','reason']) && ['original','corrected','reason'].every(k => text(x[k])))) return false;
    if (!objects(c.suggestions) || !c.suggestions.every(x=>fields(x,['id','bodyHash','quote','replacement','reason','status']) && HASH.test(x.bodyHash) && ['quote','replacement','reason'].every(k=>text(x[k])) && ['pending','accepted','rejected'].includes(x.status)) || !objects(c.annotations) || !c.annotations.every(x=>fields(x,['id','bodyHash','quote','text','status']) && HASH.test(x.bodyHash) && text(x.quote) && text(x.text) && ['open','resolved'].includes(x.status))) return false;
    if (c.filming !== undefined) {
        const f=c.filming;
        if (!fields(f,['shots','readThroughBodyHash','recordedBodyHash']) || !Array.isArray(f.shots) || f.shots.length>200 || !objects(f.shots) || !f.shots.every(x=>fields(x,['id','quote','visual','owner','done','segmentId','optional','steps']) && text(x.quote,100000,false) && text(x.visual,100000,false) && ['screen','self','editing'].includes(x.owner) && typeof x.done==='boolean' && (x.segmentId===undefined||UUID.test(x.segmentId)) && (x.optional===undefined||typeof x.optional==='boolean') && (x.steps===undefined||objects(x.steps)&&x.steps.length<=200&&x.steps.every(step=>fields(step,['id','where','prompt','expect','caution'])&&['where','prompt','expect','caution'].every(key=>text(step[key]))))) || !['readThroughBodyHash','recordedBodyHash'].every(k=>f[k]===null || HASH.test(f[k]))) return false;
    }
    const p = c.packaging;
    return fields(p,['titles','coverTexts','intros','selectedTitleId','selectedCoverTextId','selectedIntroId']) && [['titles','selectedTitleId'],['coverTexts','selectedCoverTextId'],['intros','selectedIntroId']].every(([a,b]) => objects(p[a]) && p[a].every(x => fields(x,['id','text']) && text(x.text,10000,false)) && (p[b] === null || p[a].some(x => x.id === p[b])));
}
export function validateProductionMetadata(meta,kind,fail) {
    const check = (v,label) => {if (!v) fail('CORRUPT',`Invalid production ${label}`);};
    if (kind === 'content') {if (meta.schemaVersion === 5) check(validProductionCreation(meta.productionState) && meta.productionState.contentId === meta.id,'content overlay'); return;}
    if (kind !== 'workspace' || meta.schemaVersion !== 2) return;
    const p = meta.production;
    check(fields(p,['schemaVersion','nextTNumber','accounts','reports','creations','tasks','feedback','knowledge','costs']) && p.schemaVersion === 1 && Number.isSafeInteger(p.nextTNumber) && p.nextTNumber > 0,'aggregate');
    for (const k of ['accounts','reports','tasks','feedback','knowledge','costs']) check(objects(p[k]),k);
    check(Array.isArray(p.creations) && p.creations.every(validProductionCreation) && unique(p.creations.map(c => c.contentId)) && unique(p.creations.map(c => c.tNumber)) && p.creations.every(c => Number(c.tNumber.slice(1)) < p.nextTNumber),'creation IDs');
    for (const a of p.accounts) check(fields(a,['id','name','platform','url','note','tags','images','avatarAssetHash','reportIds','createdAt','updatedAt','deletedAt']) && text(a.name,500,false) && text(a.platform,100,false) && (a.url === '' || url(a.url)) && text(a.note) && unique(a.tags) && a.tags.every(x => text(x,200,false)) && unique(a.images) && a.images.every(x => HASH.test(x)) && (a.avatarAssetHash === undefined || a.avatarAssetHash === null || HASH.test(a.avatarAssetHash)) && unique(a.reportIds) && a.reportIds.every(x => UUID.test(x)) && iso(a.createdAt) && iso(a.updatedAt) && (a.deletedAt === null || iso(a.deletedAt)),'account');
    for (const r of p.reports) check(fields(r,['id','title','type','accountIds','sourceUrl','collectedAt','pages','pageId','meta','createdAt','updatedAt','deletedAt']) && text(r.title,500,false) && text(r.type,100,false) && unique(r.accountIds) && r.accountIds.every(x => UUID.test(x)) && (r.sourceUrl === null || url(r.sourceUrl)) && (r.collectedAt === null || iso(r.collectedAt)) && objects(r.pages) && r.pages.length > 0 && r.pages.every(x => fields(x,['id','title','assetHash']) && text(x.title,500,false) && HASH.test(x.assetHash)) && r.pages.some(x => x.id === r.pageId) && jsonOK(r.meta) && iso(r.createdAt) && iso(r.updatedAt) && (r.deletedAt === null || iso(r.deletedAt)),'report');
    for (const t of p.tasks) {
        check(fields(t,['id','kind','title','contentId','accountId','request','requestHash','attempts','activeAttemptId','createdAt','updatedAt']) && KINDS.includes(t.kind) && text(t.title,500,false) && (t.contentId === null || UUID.test(t.contentId)) && (t.accountId === null || UUID.test(t.accountId)) && validRequest(t.request) && digest(t.request) === t.requestHash && objects(t.attempts) && t.attempts.length > 0 && t.attempts.some(a => a.id === t.activeAttemptId) && iso(t.createdAt) && iso(t.updatedAt),'task');
        for (const a of t.attempts) {
            check(fields(a,['id','host','status','claimToken','workerId','progress','message','failure','result','receipt','rejection','mediaGrants','createdAt','updatedAt']) && ['codex','workbuddy'].includes(a.host) && STATES.includes(a.status) && (a.claimToken === null || UUID.test(a.claimToken)) && (a.workerId === null || text(a.workerId,200,false)) && Number.isFinite(a.progress) && a.progress >= 0 && a.progress <= 100 && text(a.message,10000) && (a.failure === null || fields(a.failure,['code','message']) && text(a.failure.code,100,false) && text(a.failure.message,2000,false)) && iso(a.createdAt) && iso(a.updatedAt),'attempt');
            check(a.mediaGrants===undefined || objects(a.mediaGrants) && a.mediaGrants.length<=3 && unique(a.mediaGrants.map(g=>g.sourceReceiptId)) && unique(a.mediaGrants.map(g=>g.referenceId)) && a.mediaGrants.every(g=>fields(g,['id','referenceId','assetHash','sourceReceiptId','sourceRequestId','requestHash','videoId','canonicalUrl','responseHash','createdAt']) && UUID.test(g.referenceId) && HASH.test(g.assetHash) && UUID.test(g.sourceReceiptId) && UUID.test(g.sourceRequestId) && g.requestHash===t.requestHash && /^\d{1,32}$/.test(g.videoId) && g.canonicalUrl===`https://www.douyin.com/video/${g.videoId}` && HASH.test(g.responseHash) && iso(g.createdAt)),'media grants');
            check(a.status==='rejected' ? fields(a.rejection,['reason','at']) && text(a.rejection.reason,2000,false) && a.rejection.reason===a.rejection.reason.trim() && !a.rejection.reason.includes('\0') && iso(a.rejection.at) : a.rejection===undefined,'rejection');
            check(a.id === t.activeAttemptId || !LIVE.includes(a.status),'retired attempt');
            check(['submitted','accepted','rejected'].includes(a.status) ? validResult(a.result) && fields(a.receipt,['sha256','taskId','attemptId','requestHash','resultHash']) && a.receipt.taskId === t.id && a.receipt.attemptId === a.id && a.receipt.requestHash === t.requestHash && a.receipt.resultHash === digest(a.result) && a.receipt.sha256 === digest({taskId:t.id,attemptId:a.id,requestHash:t.requestHash,resultHash:digest(a.result)}) : a.result === null && a.receipt === null,'receipt');
        }
    }
    for (const r of [...p.feedback,...p.knowledge]) check(UUID.test(r.id) && (r.contentId === null || UUID.test(r.contentId)) && text(r.text,100000,false) && text(r.source,500,false) && iso(r.createdAt),'record');
    for (const k of p.knowledge) check(['candidate','accepted','rejected'].includes(k.status) && iso(k.updatedAt),'knowledge decision');
    for (const c of p.costs) check(fields(c,['id','taskId','attemptId','requestId','service','status','amount','currency','usage','createdAt','updatedAt']) && UUID.test(c.taskId) && UUID.test(c.attemptId) && text(c.requestId,200,false) && text(c.service,100,false) && ['reserved','estimated','measured','actual','billed','unknown','cancelled'].includes(c.status) && (c.amount === null || Number.isFinite(c.amount) && c.amount >= 0) && text(c.currency,20,false) && jsonOK(c.usage) && iso(c.createdAt) && iso(c.updatedAt),'cost');
    check(unique(p.costs.map(c => `${c.taskId}:${c.requestId}`)),'cost request uniqueness');
}
function validRequest(r) {return fields(r,['prompt','parameters','tools','budget','bodyHash']) && text(r.prompt,100000,false) && jsonOK(r.parameters,0,true) && JSON.stringify(r.parameters).length <= 100000 && unique(r.tools) && r.tools.every(t => text(t,100,false)) && fields(r.budget,['amount','currency']) && r.budget.currency === 'REQ' && Number.isSafeInteger(r.budget.amount) && r.budget.amount >= 0 && (r.bodyHash === null || HASH.test(r.bodyHash));}
function validResult(r) {return fields(r,['summary','artifacts']) && text(r.summary,100000,false) && objects(r.artifacts) && r.artifacts.length > 0 && r.artifacts.every(a => fields(a,['id','kind','title','text','assetHash','data']) && ARTIFACTS.includes(a.kind) && text(a.title,500,false) && text(a.text,200000) && (a.assetHash === null || HASH.test(a.assetHash)) && jsonOK(a.data)) && JSON.stringify(r).length <= 2 * 1024 * 1024;}

function referenceAssetHashes(refs){return Array.isArray(refs)?refs.filter(plain).flatMap(ref=>[ref.mediaAssetHash,ref.subtitleAssetHash].filter(hash=>typeof hash==='string'&&HASH.test(hash))):[];}
export function productionMethods(h) {
    const {root,locked,mutate,snapshot,result,metadata,fail,readAssetInternal,safePath,assetPath,finderMetadataFile,historyForContent,storeProductionHtml} = h;
    const invalid = (ok,msg) => {if (!ok) fail('INVALID_INPUT',msg);};
    const current = () => result(snapshot(root,'default','workspace'),'default',undefined,'workspace');
    const content = cid => {invalid(UUID.test(cid),'Expected content UUID'); const c = result(snapshot(root,cid,'content'),cid,undefined,'content'); return {...c,bodyHash:bodyDigest(c.body)};};
    const overlay = p => ({...p,creations:p.creations.map(c => {const next = content(c.contentId); return next.productionState || c;})});
    const project = w => {const p=structuredClone(overlay(w.production || emptyProduction()));p.reports=p.reports.map(r=>r.type==='viral-radar'&&!trustedRadar(p,r)?{...r,type:'调研'}:r);for(const t of p.tasks)for(const a of t.attempts)a.claimToken=null;return {...p,editToken:w.editToken,...(w.mutationId ? {mutationId:w.mutationId} : {})};};
    function checkAsset(hash,missing = false) {
        invalid(HASH.test(hash),'Expected asset SHA256');
        if (missing && !safePath(assetPath(root,hash),true)) return false;
        readAssetInternal(root,hash); return true;
    }
    function validateReferenceAssetOwnership(task,attempt,references,p) {
        invalid(task && attempt,'Reference assets require a source task and attempt');
        // Adoption is authorized by the evidence source, never by the destination creation.
        // Terminal grants remain valid evidence for explicit adoption; tool access checks live state separately.
        const sourceCreation=task.contentId ? content(task.contentId).productionState || p.creations.find(c=>c.contentId===task.contentId) : null;
        for(const reference of references) {
            invalid(plain(reference),'Invalid result reference');
            const prior=sourceCreation?.references.find(r=>r.id===reference.id);
            if(reference.mediaAssetHash!=null) {
                const known=prior && prior.mediaAssetHash===reference.mediaAssetHash && prior.url===reference.url && prior.platform===reference.platform;
                const granted=attempt.mediaGrants?.some(g=>g.referenceId===reference.id && g.assetHash===reference.mediaAssetHash && g.canonicalUrl===reference.url && reference.platform==='抖音' && g.requestHash===task.requestHash);
                invalid(known || granted,'Reference media must belong to this creation or exact attempt grant');checkAsset(reference.mediaAssetHash);
            }
            if(reference.subtitleAssetHash!=null){invalid(prior && prior.subtitleAssetHash===reference.subtitleAssetHash && prior.url===reference.url && prior.platform===reference.platform,'Reference subtitles must belong to this creation');checkAsset(reference.subtitleAssetHash);}
        }
    }
    function rebuildProductionArchive(taskId){invalid(UUID.test(taskId),'Expected task UUID');return locked(()=>{const p=current().production||emptyProduction(),task=p.tasks.find(t=>t.id===taskId);return productionArchive({...h,task,reports:p.reports,readAsset:hash=>readAssetInternal(root,hash),assetPath:hash=>assetPath(root,hash)});});}
    function readProduction() {return locked(() => {const p = project(current()), missing = []; for (const hash of new Set([...p.accounts.flatMap(a=>[...a.images,...(a.avatarAssetHash?[a.avatarAssetHash]:[])]),...p.creations.flatMap(c=>referenceAssetHashes(c.references)),...p.tasks.flatMap(t=>t.attempts.flatMap(a=>(a.result?.artifacts??[]).filter(a=>REFERENCE_ARTIFACTS.includes(a.kind)).flatMap(a=>referenceAssetHashes(a.data?.references))))])) if (!checkAsset(hash,true)) missing.push(hash); return {...p,missingAssetHashes:[...new Set(missing)]};});}
    function readProductionCreation(cid) {return locked(() => {const w = current(), c = content(cid); return {content:c,creation:c.productionState || w.production?.creations.find(x => x.contentId === cid) || null,productionToken:w.editToken,history:historyForContent(cid)};});}
    function readProductionContext(taskId,attemptId) {return locked(() => {const w=current(), p = project(w), t = taskId ? structuredClone(w.production?.tasks.find(x => x.id === taskId)) : null; if(t)for(const a of t.attempts)if(a.id !== (attemptId || t.activeAttemptId))a.claimToken=null; if (taskId && !t) fail('NOT_FOUND','Unknown production task'); if(attemptId && !t?.attempts.some(a=>a.id===attemptId))fail('NOT_FOUND','Unknown production attempt'); const c = t?.contentId ? content(t.contentId) : null; return {snapshot:p,task:t || null,attempt:t ? t.attempts.find(a=>a.id===(attemptId || t.activeAttemptId)) || null : null,account:t?.accountId ? p.accounts.find(a=>a.id===t.accountId) || null : null,content:c,creation:c ? p.creations.find(x => x.contentId === c.id) || null : null,knowledge:p.knowledge.filter(x => x.status === 'accepted'),creatorContext:t?.request.parameters?.creatorContext??null,businessMethod:t?.request.parameters?.businessMethodVersion??null,history:c ? (() => {const history=historyForContent(c.id);return {...history,versions:history.versions.map(({beforeBody,afterBody,...entry})=>entry)};})() : null};});}
    function trustedRadar(p,r) {
        if(r.type!=='viral-radar'||!plain(r.meta?.radar))return null;
        try {
            const state=r.meta.radar,t=p.tasks.find(t=>t.id===state.taskId),verified=radarArtifactCandidates(t,state.attemptId,state.receiptHash);
            if(r.id!==radarId(`radar-report:${state.taskId}:${state.attemptId}:${state.receiptHash}`)||!Array.isArray(state.candidates))return null;
            if(!state.candidates.every(c=>['pending','added','rejected'].includes(c.decision)&&(c.decision==='added'?UUID.test(c.topicId):c.topicId===null)))return null;
            const source={...state,candidates:state.candidates.map(c=>({...c,decision:'pending',topicId:null}))};
            return JSON.stringify(source)===JSON.stringify(verified)?state:null;
        }catch{return null;}
    }
    const find = (list,id,label) => {const v = list.find(x => x.id === id); if (!v) fail('NOT_FOUND',`Unknown ${label}`); return v;};
    function taskAttempt(p,i,worker = false) {
        const t = find(p.tasks,i.taskId,'task'), a = find(t.attempts,i.attemptId || t.activeAttemptId,'attempt');
        if (t.activeAttemptId !== a.id) fail('ATTEMPT_INACTIVE','Attempt was retired');
        if (worker && (!a.claimToken || a.claimToken !== i.claimToken || a.workerId !== i.workerId)) fail('CLAIM_MISMATCH','Worker does not own this attempt');
        return {t,a};
    }
    const newAttempt = (host,now) => {invalid(['codex','workbuddy'].includes(host),'Unknown assistant');return {id:randomUUID(),host,status:'created',claimToken:null,workerId:null,progress:0,message:'',failure:null,result:null,receipt:null,createdAt:now,updatedAt:now};};
    function patchCreation(c,patch,now) {invalid(fields(patch,['stage','kind','references','analysis','narrative','suggestions','annotations','packaging','confirmedBodyHash','filming','composition','adoptions']),'Invalid creation patch'); const n = {...c,...structuredClone(patch),updatedAt:now}; invalid(validProductionCreation(n),'Invalid creation state'); return n;}
    function validateCompositionChange(previous,next,previousBody,body,patch) {
        if(!next.composition)return;
        if(previousBody!==body&&!Object.hasOwn(patch,'composition')) {
            if(previous.composition?.bodyHash!==bodyDigest(previousBody))fail('STALE_INPUT','段落关联对应旧稿，请先核对段落后再保存。');
            const migrated=migrateProductionComposition(previous.composition,previousBody,body);
            if(migrated.unmatchedSegments.length)fail('STALE_INPUT','部分段落已改变或出现多次，关联保留；请在逐段稿件中核对后保存。');
            next.composition=migrated.composition;
        }
        invalid(validProductionComposition(next.composition,body,bodyDigest(body),next.references.map(r=>r.id)),'Composition must identify current body and known references');
        for(const segment of next.composition.segments)for(const link of segment.references){const reference=next.references.find(value=>value.id===link.referenceId);invalid(!link.quote||reference.originalText.includes(link.quote)||reference.correctedText.includes(link.quote),'Segment reference quote must come from preserved source');if(link.startMs!==null)invalid(reference.segments.some(value=>value.startMs<=link.startMs&&value.endMs>=link.endMs),'Segment reference time must belong to preserved source');}
    }
    function validateAdoptionChange(previous,next,previousBody,body,p) {
        const before=previous.adoptions??[],after=next.adoptions??[];
        invalid(after.length>=before.length&&before.every((item,index)=>JSON.stringify(item)===JSON.stringify(after[index])),'Adoption history is append-only');
        for(const record of after.slice(before.length)) {
            invalid(record.bodyHash===bodyDigest(body)&&Array.isArray(record.artifactIds)&&record.artifactIds.length>0,'Adoption must identify saved body and artifacts');
            const task=p.tasks.find(value=>value.id===record.taskId),attempt=task?.attempts.find(value=>value.id===record.attemptId);
            invalid(task?.contentId===next.contentId&&task.activeAttemptId===record.attemptId&&attempt?.status==='accepted'&&attempt.receipt?.sha256===record.receiptHash,'Adoption requires current accepted receipt');
            invalid(!before.some(item=>item.taskId===record.taskId&&item.attemptId===record.attemptId&&item.artifactIds?.some(id=>record.artifactIds.includes(id))),'Artifact has already been adopted');
            const args={task,attemptId:record.attemptId,creation:previous,body:previousBody,bodyHash:bodyDigest(previousBody),now:record.at};
            const all=attempt.result.artifacts.map(value=>value.id),candidate=record.artifactIds.length===1?productionArtifactDraft({...args,artifactId:record.artifactIds[0]}):record.artifactIds.length===all.length&&record.artifactIds.every(id=>all.includes(id))?productionArtifactBundleDraft(args):null;
            invalid(candidate&&candidate.body===body,'Adoption must apply the receipted artifact body');
            for(const [key,value]of Object.entries(candidate.creationPatch))if(key!=='adoptions')invalid(JSON.stringify(value)===JSON.stringify(next[key]),'Adoption fields must match receipted artifact ownership');
        }
    }
    function validateFilmingChange(previous,next,body) {
        if (!next.filming) return;
        for (const shot of next.filming.shots) {
            const old=previous.filming?.shots.find(x=>x.id===shot.id);
            if(shot.segmentId&&(!old||old.segmentId!==shot.segmentId))invalid(next.composition?.segments.some(segment=>segment.id===shot.segmentId&&body.slice(segment.start,segment.end).includes(shot.quote)),'Shot must belong to current segment');
            if ((!old || old.quote!==shot.quote) && !shot.segmentId) invalid(body.indexOf(shot.quote)>=0 && body.indexOf(shot.quote)===body.lastIndexOf(shot.quote),'Shot quote must uniquely identify the current body');
        }
        for (const key of ['readThroughBodyHash','recordedBodyHash']) {
            const value=next.filming[key];
            if (value!==null && value!==previous.filming?.[key]) invalid(value===bodyDigest(body),'Filming confirmation must identify the current body');
        }
    }
    function mutateProduction(op,raw,options = {}) {
        invalid(plain(raw),'Expected operation input');
        if(op==='adoptResearchReferences') {
            invalid(fields(raw,['contentId','taskId','attemptId','receiptHash','artifactId','expectedToken','expectedContentToken'])&&['contentId','taskId','attemptId','artifactId'].every(key=>UUID.test(raw[key]))&&['receiptHash','expectedToken','expectedContentToken'].every(key=>HASH.test(raw[key])),'Research adoption requires identities and both version tokens');
            mutate('update',raw.contentId,{productionOp:op,productionInput:raw},raw.expectedContentToken,options,'content',(meta)=>{
                const w=current();if(w.editToken!==raw.expectedToken)fail('CONFLICT','Production state changed');
                const creation=meta.productionState||w.production?.creations.find(value=>value.contentId===raw.contentId);if(!creation)fail('INVALID_STATE','Enable creation first');
                let patch;try{patch=prepareResearchAdoption({snapshot:w.production||emptyProduction(),...raw,creation,bodyHash:content(raw.contentId).bodyHash,now:new Date().toISOString()});}catch(error){if(['STALE_INPUT','CONFLICT','INVALID_INPUT'].includes(error?.code))fail(error.code,error.message);throw error;}const sourceTask=w.production?.tasks.find(task=>task.id===raw.taskId),sourceAttempt=sourceTask?.attempts.find(attempt=>attempt.id===raw.attemptId),sourceArtifact=sourceAttempt?.result?.artifacts.find(artifact=>artifact.id===raw.artifactId);
                if(Array.isArray(sourceArtifact?.data?.references))validateReferenceAssetOwnership(sourceTask,sourceAttempt,sourceArtifact.data.references,w.production);
                const next=patchCreation(creation,patch,new Date().toISOString());
                for(const reference of next.references)for(const key of ['mediaAssetHash','subtitleAssetHash'])if(reference[key])checkAsset(reference[key]);
                meta.schemaVersion=5;meta.productionState=next;return meta;
            });return readProduction();
        }
        if(op==='saveCreation') {
            invalid(UUID.test(raw.contentId) && HASH.test(raw.expectedToken) && HASH.test(raw.expectedContentToken),'Creation, content and production tokens required');
            mutate('update',raw.contentId,{productionOp:op,productionInput:raw},raw.expectedContentToken,options,'content',(meta)=>{
                const w=current();if(!meta.productionState && w.editToken!==raw.expectedToken)fail('CONFLICT','Production state changed');
                const c=meta.productionState || w.production?.creations.find(x=>x.contentId===raw.contentId);if(!c)fail('INVALID_STATE','Enable creation first');
                const next=patchCreation(c,raw.creationPatch || raw.patch,new Date().toISOString());
                const body=content(raw.contentId).body;
                validateCompositionChange(c,next,body,body,raw.creationPatch||raw.patch);
                validateAdoptionChange(c,next,body,body,w.production||emptyProduction());
                validateFilmingChange(c,next,body);
                for(const r of next.references)for(const key of ['mediaAssetHash','subtitleAssetHash'])if(r[key])checkAsset(r[key]);
                meta.schemaVersion=5;meta.productionState=next;return meta;
            });
            return readProduction();
        }
        // Create a source-keyed, empty canonical topic before the workspace receipt. The child
        // transaction has a stable identity, so recovery after either publication cannot duplicate it.
        let radarTopic = null,radarResume=false;
        if(op==='decideRadarCandidate' && raw.decision==='add-topic') {
            invalid(plain(options)&&Object.keys(options).every(k=>k==='mutationId')&&(options.mutationId===undefined||UUID.test(options.mutationId)),'Invalid radar transaction identity');
            options={mutationId:options.mutationId??randomUUID()};
            const w=locked(()=>current());
            // Completed parent transactions replay without executing any child write.
            const p=w.production || emptyProduction(), r=find(p.reports,raw.reportId,'report');
            invalid(trustedRadar(p,r) && r.deletedAt===null,'Trusted radar report required');
            const state=r.meta?.radar,t=find(p.tasks,state?.taskId,'radar task');
            const verified=radarArtifactCandidates(t,state.attemptId,state.receiptHash),candidate=find(verified.candidates,raw.candidateId,'radar candidate');
            const stored=find(state.candidates,raw.candidateId,'radar candidate');
            invalid(JSON.stringify({...stored,decision:'pending',topicId:null})===JSON.stringify(candidate),'Radar evidence was changed');
            invalid(stored.decision==='pending'||stored.decision==='added','Candidate already rejected');
            const existing=p.reports.flatMap(x=>trustedRadar(p,x)?.candidates??[]).find(x=>x.sourceKey===candidate.sourceKey&&x.decision==='added'&&x.topicId);
            const contentId=existing?.topicId || radarId(`radar-topic:${candidate.sourceKey}`);
            let c=locked(()=>safePath(path.join(root,'内容',contentId),true)?content(contentId):null);
            const childInput={title:candidate.title,body:'',radarSource:candidate.sourceKey,radarParent:{mutationId:options.mutationId,input:raw}};
            const childOptions={mutationId:radarId(`radar-topic-create:${candidate.sourceKey}`)};
            if(!c){invalid(w.editToken===raw.expectedToken,'Production state changed');c=mutate('create',undefined,childInput,undefined,childOptions,'content',undefined,contentId);radarResume=true;}
            else if(stored.decision==='pending'){
                // Replay verifies the original child request digest, including this exact parent
                // mutation ID and original input. Only that proven continuation may rebase CAS.
                mutate('create',undefined,childInput,undefined,childOptions,'content',undefined,contentId);radarResume=true;
            }
            invalid(c.deletedAt===null,'Previously added radar topic is trashed; restore the original topic');
            radarTopic={contentId,candidate};
        }
        const workerOps = ['claimTask','progressTask','failTask','submitTask','reserveCost','recordCost','registerMediaGrant'];
        const token = raw.expectedToken;
        if (!workerOps.includes(op)) invalid(HASH.test(token),'A current production editToken is required');
        const out = mutate('update','default',{productionOp:op,productionInput:raw},token,options,'workspace',(meta) => {
            const now = new Date().toISOString(), p = structuredClone(meta.production || emptyProduction());
            meta.schemaVersion = 2; meta.production = p;
            const editable = a => {if (a.deletedAt !== null) fail('INVALID_STATE','Record is trashed');};
            switch(op) {
            case 'enable': break;
            case 'saveAccount': {
                invalid(fields(raw,['id','name','platform','url','note','tags','images','avatarAssetHash','reportIds','expectedToken']),'Unknown account fields');
                const old = raw.id ? find(p.accounts,raw.id,'account') : null; if (old) editable(old);
                const a = {...(old || {id:randomUUID(),createdAt:now,deletedAt:null}),name:raw.name,platform:raw.platform,url:raw.url || '',note:raw.note || '',tags:raw.tags || [],images:raw.images || [],avatarAssetHash:Object.hasOwn(raw,'avatarAssetHash')?raw.avatarAssetHash:old?.avatarAssetHash??null,reportIds:raw.reportIds || [],updatedAt:now};
                for (const hash of a.images) checkAsset(hash,old?.images.includes(hash));
                if(a.avatarAssetHash && checkAsset(a.avatarAssetHash,old?.avatarAssetHash===a.avatarAssetHash))invalid(['image/png','image/jpeg','image/webp'].includes(readAssetInternal(root,a.avatarAssetHash).detectedType),'Avatar must be a PNG, JPEG or WebP image');
                for (const rid of a.reportIds) editable(find(p.reports,rid,'report'));
                if (old) Object.assign(old,a); else p.accounts.push(a); break;
            }
            case 'trashAccount': case 'restoreAccount': {const a = find(p.accounts,raw.id,'account'); invalid(op === 'restoreAccount' ? a.deletedAt !== null : a.deletedAt === null,'Account is already in requested state'); a.deletedAt = op === 'trashAccount' ? now : null; a.updatedAt = now; break;}
            case 'saveReport': {
                invalid(fields(raw,['id','title','type','accountIds','sourceUrl','collectedAt','pages','pageId','meta','expectedToken']),'Unknown report fields');
                const old = raw.id ? find(p.reports,raw.id,'report') : null; if (old) editable(old);
                invalid(raw.type!=='viral-radar' && old?.type!=='viral-radar'&&!Object.hasOwn(raw.meta??{},'radar'),'Radar reports require receipt-based adoption and dedicated decisions');
                invalid(Array.isArray(raw.pages) && raw.pages.length > 0,'Report pages are required');
                const pages = raw.pages.map(x => {invalid(fields(x,['id','title','assetHash']),'Invalid report page'); const asset = readAssetInternal(root,x.assetHash); invalid(asset.bytes <= 2*1024*1024 && ['text/plain','text/html'].includes(asset.detectedType) && /<(?:!doctype\s+html|html|body|article|section)\b/i.test(asset.data.toString('utf8')),'Report must be UTF-8 HTML'); return {id:x.id || randomUUID(),title:x.title,assetHash:x.assetHash};});
                const reportMeta=plain(raw.meta)?Object.fromEntries(Object.entries(raw.meta).filter(([key])=>!['taskId','attemptId','artifactId','receiptHash'].includes(key))):raw.meta||{};
                const r = {...(old || {id:randomUUID(),createdAt:now,deletedAt:null}),title:raw.title,type:raw.type || '调研',accountIds:raw.accountIds || [],sourceUrl:raw.sourceUrl || null,collectedAt:raw.collectedAt || null,pages,pageId:raw.pageId || pages[0].id,meta:reportMeta,updatedAt:now};
                for (const aid of r.accountIds) editable(find(p.accounts,aid,'account'));
                if(old) Object.assign(old,r); else p.reports.push(r);
                for(const a of p.accounts) {a.reportIds = a.reportIds.filter(id => id !== r.id); if(r.accountIds.includes(a.id)) a.reportIds.push(r.id);} break;
            }
            case 'adoptRadarResult': {
                const {t,a}=taskAttempt(p,raw),radar=radarArtifactCandidates(t,a.id,raw.receiptHash);
                const existing=p.reports.find(r=>trustedRadar(p,r)&&r.meta?.radar?.taskId===t.id&&r.meta.radar.attemptId===a.id&&r.meta.radar.receiptHash===raw.receiptHash);
                if(existing)break;
                for(const candidate of radar.candidates){const previous=p.reports.flatMap(r=>trustedRadar(p,r)?.candidates??[]).find(c=>c.sourceKey===candidate.sourceKey&&['added','rejected'].includes(c.decision));if(previous){candidate.decision=previous.decision;candidate.topicId=previous.topicId;}}
                const assetHash=storeProductionHtml(Buffer.from(renderRadarReport(radar),'utf8'));
                const page={id:randomUUID(),title:'雷达采集报告',assetHash};
                p.reports.push({id:radarId(`radar-report:${t.id}:${a.id}:${raw.receiptHash}`),title:`${radar.query.direction} · 低粉爆款`,type:'viral-radar',accountIds:[],sourceUrl:null,collectedAt:radar.collectedAt,pages:[page],pageId:page.id,meta:{radar},createdAt:now,updatedAt:now,deletedAt:null});break;
            }
            case 'decideRadarCandidate': {
                invalid(['add-topic','reject'].includes(raw.decision),'Invalid radar decision');
                const r=find(p.reports,raw.reportId,'report');editable(r);invalid(trustedRadar(p,r),'Trusted radar report required');
                const state=r.meta?.radar,t=find(p.tasks,state?.taskId,'radar task');
                const verified=radarArtifactCandidates(t,state.attemptId,state.receiptHash),original=find(verified.candidates,raw.candidateId,'radar candidate'),c=find(state.candidates,raw.candidateId,'radar candidate');
                invalid(JSON.stringify({...c,decision:'pending',topicId:null})===JSON.stringify(original),'Radar evidence was changed');
                if(c.decision!=='pending'){invalid(c.decision===(raw.decision==='reject'?'rejected':'added'),'Candidate already decided');break;}
                if(raw.decision==='reject'){for(const report of p.reports.filter(x=>trustedRadar(p,x)))for(const candidate of report.meta?.radar?.candidates??[])if(candidate.sourceKey===original.sourceKey&&candidate.decision==='pending'){candidate.decision='rejected';report.updatedAt=now;}break;}
                invalid(radarTopic,'Topic transaction required');
                let creation=p.creations.find(x=>x.contentId===radarTopic.contentId);
                if(!creation){creation=defaultProductionCreation(radarTopic.contentId,p.nextTNumber++,now);creation.references=[{id:radarId(`radar-reference:${original.sourceKey}`),url:original.url,title:original.title,platform:original.platform,originalText:'',correctedText:'',segments:[],corrections:[],analysis:`雷达来源 ${original.sourceKey}；粉丝 ${original.author.followers??'未知'}；点赞 ${original.metrics.likes??'未知'}；赞粉比 ${original.metrics.likeFollowerRatio??'未知'}。采集 ${original.collectedAt}。${original.angle?`\n可借鉴角度：${original.angle}`:''}`,mediaAssetHash:null,subtitleAssetHash:null}];p.creations.push(creation);}
                for(const report of p.reports.filter(x=>trustedRadar(p,x)))for(const candidate of report.meta?.radar?.candidates??[])if(candidate.sourceKey===original.sourceKey&&candidate.decision==='pending'){candidate.decision='added';candidate.topicId=radarTopic.contentId;report.updatedAt=now;}break;
            }
            case 'trashReport': {const r = find(p.reports,raw.id,'report'); editable(r); r.deletedAt = now; r.updatedAt = now; break;}
            case 'setReportPosition': {const r = find(p.reports,raw.id,'report'); editable(r); invalid(r.pages.some(x => x.id === raw.pageId),'Unknown page'); r.pageId = raw.pageId; r.updatedAt = now; break;}
            case 'ensureCreation': {
                const c = content(raw.contentId); invalid(c.deletedAt === null,'Content is trashed');
                if (!p.creations.some(x => x.contentId === c.id)) p.creations.push(defaultProductionCreation(c.id,p.nextTNumber++,now)); break;
            }
            case 'recordFeedback': case 'recordKnowledge': {
                invalid(text(raw.text,100000,false),'Record text is required'); if(raw.contentId) invalid(content(raw.contentId).deletedAt === null,'Content is trashed');
                const r = {id:randomUUID(),contentId:raw.contentId || null,text:raw.text,source:raw.source || '手工记录',createdAt:now};
                if(op === 'recordFeedback') p.feedback.push(r); else p.knowledge.push({...r,status:'candidate',updatedAt:now}); break;
            }
            case 'decideKnowledge': {const k = find(p.knowledge,raw.id,'knowledge'); invalid(k.status === 'candidate' && ['accepted','rejected'].includes(raw.status),'Invalid knowledge decision'); k.status = raw.status; k.updatedAt = now; break;}
            case 'createTask': {
                invalid(KINDS.includes(raw.kind) && text(raw.title,500,false),'Invalid task kind or title');
                const c = raw.contentId ? content(raw.contentId) : null; if(c) invalid(c.deletedAt === null,'Content is trashed');
                if(raw.accountId) editable(find(p.accounts,raw.accountId,'account'));
                const request = structuredClone(raw.request || {prompt:raw.prompt,parameters:raw.parameters ?? {},tools:raw.tools || [],budget:raw.budget || {amount:0,currency:'REQ'},bodyHash:Object.hasOwn(raw,'bodyHash') ? raw.bodyHash : c?.bodyHash || null});
                invalid(plain(request.parameters),'Task parameters must be an object');
                // Freeze the actual sources before hashing. Caller-supplied snapshots never
                // replace the bound creator information or turn it into tool authorization.
                const creatorContext=freezeCreatorContext(meta.profile,readVaultTaskContext(root,c?.id??null));
                const method=businessSkillForTask(raw.kind,request.parameters,raw.accountId??null);
                request.parameters={...request.parameters,creatorContext,...(method?{businessSkill:method.id,businessMethodVersion:method}:{})};
                if(['positioning-interview','topic-suggestion'].includes(request.parameters.workflow)){
                    request.tools=[];request.budget={amount:0,currency:'REQ'};
                    request.parameters={...request.parameters,comments:false,budgetEnabled:false,maxRequestsPerTask:0};
                }
                invalid(validRequest(request),'Invalid fixed request; parameters must be bounded JSON without secrets');
                if(c) invalid(request.bodyHash === c.bodyHash,'Fixed body hash is stale');
                const a = newAttempt(raw.host || 'codex',now); p.tasks.push({id:raw.id || randomUUID(),kind:raw.kind,title:raw.title,contentId:c?.id || null,accountId:raw.accountId || null,request:structuredClone(request),requestHash:digest(request),attempts:[a],activeAttemptId:a.id,createdAt:now,updatedAt:now}); break;
            }
            case 'claimTask': {const {t,a} = taskAttempt(p,raw); invalid(a.status === 'created','Attempt must be awaiting claim'); invalid(UUID.test(raw.claimToken) && text(raw.workerId,200,false),'Claim requires UUID token and worker ID'); a.claimToken = raw.claimToken; a.workerId = raw.workerId; a.status = 'claimed'; a.updatedAt = t.updatedAt = now; break;}
            case 'progressTask': {const {t,a} = taskAttempt(p,raw,true); if(!['claimed','waiting-user','waiting-permission'].includes(a.status)) fail('ATTEMPT_INACTIVE','Attempt is not running'); invalid(['claimed','waiting-user','waiting-permission'].includes(raw.status) && Number.isFinite(raw.progress) && raw.progress >= a.progress && raw.progress <= 100 && text(raw.message,10000),'Invalid progress'); a.status = raw.status; a.progress = raw.progress; a.message = raw.message; a.updatedAt = t.updatedAt = now; break;}
            case 'failTask': {const {t,a} = taskAttempt(p,raw,true); if(!LIVE.includes(a.status)) fail('ATTEMPT_INACTIVE','Attempt has ended'); invalid(fields(raw.failure,['code','message']) && text(raw.failure.code,100,false) && text(raw.failure.message,2000,false),'Failure reason required'); a.status = 'failed'; a.failure = raw.failure; a.updatedAt = t.updatedAt = now; for(const c of p.costs.filter(x => x.attemptId === a.id && x.status === 'reserved')) {c.status='unknown';c.amount=null;c.updatedAt=now;} break;}
            case 'cancelTask': {const {t,a} = taskAttempt(p,raw); if(!LIVE.includes(a.status)) fail('ATTEMPT_INACTIVE','Attempt has ended'); a.status='cancelled';a.updatedAt=t.updatedAt=now; for(const c of p.costs.filter(x => x.attemptId === a.id && x.status === 'reserved')) {c.status='unknown';c.amount=null;c.updatedAt=now;} break;}
            case 'retryTask': {const {t,a} = taskAttempt(p,raw); invalid(!['submitted','accepted','rejected'].includes(a.status),'Submitted results require a user decision; rejected tasks require a new request'); if(p.costs.some(c => c.taskId === t.id && ['unknown','reserved'].includes(c.status))) fail('COST_UNKNOWN','Reconcile outstanding service costs before retry'); if(LIVE.includes(a.status)) {a.status='cancelled';a.updatedAt=now;} const next=newAttempt(raw.host || a.host,now);t.attempts.push(next);t.activeAttemptId=next.id;t.updatedAt=now;break;}
            case 'registerMediaGrant': {
                invalid(fields(raw,['taskId','attemptId','claimToken','workerId','requestId','sourceReceiptId','sourceRequestId','requestHash','videoId','canonicalUrl','responseHash','assetHash']),'Invalid media grant fields');
                const {t,a}=taskAttempt(p,raw,true),config=t.request.parameters?.media;
                invalid(['claimed','waiting-user','waiting-permission'].includes(a.status) && t.contentId && !content(t.contentId).deletedAt && t.request.tools.includes('media') && t.request.tools.includes('tikhub') && fields(config,['version','maxDownloads','maxBytes']) && config.version===1 && config.maxDownloads===3 && config.maxBytes===67108864,'Media was not authorized in fixed request');
                invalid(UUID.test(raw.sourceReceiptId) && UUID.test(raw.sourceRequestId) && UUID.test(raw.requestId) && raw.requestHash===t.requestHash && /^\d{1,32}$/.test(raw.videoId) && raw.canonicalUrl===`https://www.douyin.com/video/${raw.videoId}` && HASH.test(raw.responseHash) && HASH.test(raw.assetHash),'Invalid media receipt');
                const source=p.costs.find(c=>c.taskId===t.id && c.attemptId===a.id && c.requestId===raw.sourceRequestId),proof=source?.usage;
                invalid(source?.service==='tikhub' && source.status==='measured' && proof?.ok===true && proof.operation==='video' && proof.id===raw.videoId && ['sourceReceiptId','videoId','canonicalUrl','responseHash'].every(key=>proof[key]===raw[key]),'Media source receipt was not settled by broker');
                const existing=a.mediaGrants?.find(g=>g.sourceReceiptId===raw.sourceReceiptId);
                if(existing){invalid(['assetHash','sourceRequestId','requestHash','videoId','canonicalUrl','responseHash'].every(key=>existing[key]===raw[key]),'Media receipt cannot be rebound');break;}
                invalid((a.mediaGrants?.length??0)<config.maxDownloads,'Media download limit reached');
                const asset=readAssetInternal(root,raw.assetHash);invalid(asset.bytes>0 && asset.bytes<=config.maxBytes && ['video/mp4','video/webm','audio/mp4','audio/mpeg','audio/wav','audio/x-wav','audio/ogg','audio/flac'].includes(asset.detectedType),'Invalid media asset');
                const grant={id:randomUUID(),referenceId:randomUUID(),assetHash:raw.assetHash,sourceReceiptId:raw.sourceReceiptId,sourceRequestId:raw.sourceRequestId,requestHash:t.requestHash,videoId:raw.videoId,canonicalUrl:raw.canonicalUrl,responseHash:raw.responseHash,createdAt:now};
                (a.mediaGrants??=[]).push(grant);a.updatedAt=t.updatedAt=now;break;
            }
            case 'submitTask': {
                const {t,a}=taskAttempt(p,raw,true);if(!['claimed','waiting-user','waiting-permission'].includes(a.status)) fail('ATTEMPT_INACTIVE','Attempt is not running'); invalid(validResult(raw.result),'Invalid result artifacts');
                for(const artifact of raw.result.artifacts) if(artifact.assetHash) checkAsset(artifact.assetHash);
                for(const artifact of raw.result.artifacts) if(REFERENCE_ARTIFACTS.includes(artifact.kind) && Array.isArray(artifact.data?.references)) validateReferenceAssetOwnership(t,a,artifact.data.references,p);

                a.result=structuredClone(raw.result);const receipt={taskId:t.id,attemptId:a.id,requestHash:t.requestHash,resultHash:digest(a.result)};a.receipt={...receipt,sha256:digest(receipt)};a.status='submitted';a.progress=100;a.updatedAt=t.updatedAt=now;
                for(const artifact of a.result.artifacts.filter(x => x.kind === 'report' && t.request.parameters?.workflow!=='viral-radar')) {
                    const inputs=plain(artifact.data) && Array.isArray(artifact.data.pages) ? artifact.data.pages : artifact.assetHash ? [{title:artifact.title,assetHash:artifact.assetHash}] : [];
                    invalid(inputs.length>0 && inputs.length<=100,'Report artifact requires imported HTML pages');
                    invalid(new Set(inputs.map(page=>page?.assetHash)).size===inputs.length,'Different report pages require distinct HTML assets');
                    const pages=inputs.map(page=>{invalid(plain(page) && HASH.test(page.assetHash) && text(page.title,500,false),'Invalid report page');const asset=readAssetInternal(root,page.assetHash);invalid(asset.bytes<=2*1024*1024 && ['text/plain','text/html'].includes(asset.detectedType) && /<(?:!doctype\s+html|html|body|article|section)\b/i.test(asset.data.toString('utf8')),'Invalid report HTML asset');return {id:randomUUID(),title:page.title,assetHash:page.assetHash};});
                    const details=plain(artifact.data)?artifact.data:{};invalid(details.type!=='viral-radar'&&!Object.hasOwn(details.meta??{},'radar'),'Radar reports require accepted receipt adoption');const r={id:randomUUID(),title:artifact.title,type:details.type??'调研',accountIds:t.accountId?[t.accountId]:[],sourceUrl:details.sourceUrl??null,collectedAt:details.collectedAt??now,pages,pageId:pages[0].id,meta:{...(plain(details.meta)?details.meta:{}),taskId:t.id,attemptId:a.id,artifactId:artifact.id,receiptHash:a.receipt.sha256},createdAt:now,updatedAt:now,deletedAt:null};p.reports.push(r);if(t.accountId)find(p.accounts,t.accountId,'account').reportIds.push(r.id);
                }
                for(const artifact of a.result.artifacts.filter(x => ['feedback','knowledge'].includes(x.kind))) {
                    invalid(text(artifact.text,100000,false),'Feedback and knowledge require bounded evidence text');
                    const record={id:randomUUID(),contentId:t.contentId,text:artifact.text,source:`助手产物 task:${t.id} attempt:${a.id} artifact:${artifact.id}（尚需人工核对）`,createdAt:now};
                    if(artifact.kind==='feedback')p.feedback.push(record);else p.knowledge.push({...record,status:'candidate',updatedAt:now});
                } break;
            }
            case 'acceptTask': {const {t,a}=taskAttempt(p,raw);invalid(a.status==='submitted' && raw.receiptHash===a.receipt.sha256,'Acceptance requires submitted receipt');a.status='accepted';a.updatedAt=t.updatedAt=now;break;}
            case 'rejectTask': {
                invalid(fields(raw,['taskId','attemptId','receiptHash','expectedToken','reason']) && UUID.test(raw.taskId) && UUID.test(raw.attemptId) && HASH.test(raw.receiptHash) && text(raw.reason,2000,false) && !raw.reason.includes('\0'),'Rejection requires exact attempt, receipt and a bounded reason');
                const {t,a}=taskAttempt(p,raw);invalid(a.status==='submitted' && raw.receiptHash===a.receipt.sha256,'Rejection requires the current submitted receipt');
                const reason=raw.reason.trim();a.status='rejected';a.rejection={reason,at:now};a.updatedAt=t.updatedAt=now;
                p.feedback.push({id:randomUUID(),contentId:t.contentId,text:reason,source:`用户拒绝 task:${t.id} attempt:${a.id} receipt:${a.receipt.sha256}`,createdAt:now});break;
            }
            case 'reserveCost': {
                const {t,a}=taskAttempt(p,raw,true);if(!['claimed','waiting-user','waiting-permission'].includes(a.status)) fail('ATTEMPT_INACTIVE','Attempt is not running');
                invalid(text(raw.requestId,200,false) && text(raw.service,100,false),'Cost requires request and service');
                if(p.costs.some(c=>c.taskId===t.id && c.requestId===raw.requestId)) fail('REQUEST_ALREADY_RESERVED','Request already reserved; inspect the existing result before replay');
                if(p.costs.some(c=>c.taskId===t.id && c.status==='unknown')) fail('COST_UNKNOWN','An unknown cost blocks further calls');
                invalid(t.request.tools.includes(raw.service),'Service was not authorized in fixed request');
                const units=raw.usage?.requests ?? 1; invalid([0,1].includes(units),'Requests must be 0 or 1');
                if(p.costs.filter(c=>c.taskId===t.id && c.status!=='cancelled').reduce((n,c)=>n+(c.amount ?? 1),0)+units>t.request.budget.amount) fail('BUDGET_EXCEEDED','Fixed request budget is exhausted');
                p.costs.push({id:randomUUID(),taskId:t.id,attemptId:a.id,requestId:raw.requestId,service:raw.service,status:'reserved',amount:units,currency:'REQ',usage:raw.usage ?? null,createdAt:now,updatedAt:now});break;
            }
            case 'recordCost': case 'reconcileCost': {
                const {t,a}=taskAttempt(p,raw,op==='recordCost'),c=raw.id ? find(p.costs,raw.id,'cost') : p.costs.find(x=>x.taskId===t.id && x.requestId===raw.requestId);
                invalid(c && c.taskId===t.id && c.attemptId===a.id,'Cost does not belong to attempt');
                invalid(['unknown','reserved'].includes(c.status),'Cost already settled');
                invalid(['actual','billed','measured','estimated','unknown','cancelled'].includes(raw.status),'Invalid cost settlement');
                invalid(raw.status==='unknown' ? raw.amount===null : [0,1].includes(raw.amount),'REQ settlement must be 0 or 1, unknown must be null');
                c.status=raw.status;c.amount=raw.amount;c.usage=raw.usage ?? null;c.updatedAt=now;break;
            }
            default: fail('INVALID_INPUT','Unknown production operation');
            }
            try {validateProductionMetadata(meta,'workspace',fail);} catch(error) {if(error.code==='CORRUPT') fail('INVALID_INPUT',error.message);throw error;}
            return meta;
        },undefined,workerOps.includes(op)||radarResume);
        if(radarTopic){
            const {contentId,candidate}=radarTopic;
            const reference={id:radarId(`radar-reference:${candidate.sourceKey}`),url:candidate.url,title:candidate.title,platform:candidate.platform,originalText:'',correctedText:'',segments:[],corrections:[],analysis:`雷达来源 ${candidate.sourceKey}；粉丝 ${candidate.author.followers??'未知'}；点赞 ${candidate.metrics.likes??'未知'}；赞粉比 ${candidate.metrics.likeFollowerRatio??'未知'}。采集 ${candidate.collectedAt}。`,mediaAssetHash:null,subtitleAssetHash:null};
            const state=readProductionCreation(contentId);
            if(!state.creation?.references.some(r=>r.id===reference.id)){
                // Creation may have been independently registered/edited after the topic child.
                // Append to the latest canonical overlay after the parent receipt, preserving all
                // user fields. Parent replay continues this stable transaction if publication fails.
                mutate('update',contentId,{productionOp:'attachRadarReference',productionInput:{parentMutationId:options.mutationId,parent:raw,reference}},undefined,{mutationId:radarId(`radar-reference-merge:${options.mutationId}`)},'content',(meta)=>{
                    const creation=meta.productionState||current().production?.creations.find(c=>c.contentId===contentId);
                    invalid(creation,'Radar topic creation is missing');
                    const next=structuredClone(creation);
                    if(!next.references.some(r=>r.id===reference.id)){next.references.push(reference);next.updatedAt=new Date().toISOString();}
                    invalid(validProductionCreation(next),'Invalid radar topic creation');
                    meta.schemaVersion=5;meta.productionState=next;return meta;
                },undefined,true);
            }
            return readProduction();
        }
        const projected=project(out);
        if(['submitTask','acceptTask','rejectTask'].includes(op))try{const archive=rebuildProductionArchive(raw.taskId);if(archive.warnings.length)projected.archiveWarnings=archive.warnings;}catch(error){projected.archiveWarnings=[`任务回执已保存，知识目录投影待重建（${/^[A-Z_]+$/.test(error.code)?error.code:'IO_ERROR'}）。`];}
        return projected;
    }
    function saveProductionDraft(cid,input,editToken,options={}) {
        invalid(fields(input,['body','expectedBodyHash','expectedProductionToken','creationPatch']) && text(input.body,4*1024*1024) && HASH.test(input.expectedBodyHash) && HASH.test(input.expectedProductionToken),'Invalid production draft');
        return mutate('update',cid,{body:input.body,productionDraft:input},editToken,options,'content',(meta,before) => {
            const w=current();if(!meta.productionState && w.editToken!==input.expectedProductionToken) fail('CONFLICT','Production state changed');
            const previous=result(before,cid);if(bodyDigest(previous.body)!==input.expectedBodyHash) fail('STALE_INPUT','Body changed');
            const creation=meta.productionState || w.production?.creations.find(c=>c.contentId===cid);if(!creation) fail('INVALID_STATE','Enable creation first');
            const next=patchCreation(creation,input.creationPatch,new Date().toISOString());
            validateCompositionChange(creation,next,previous.body,input.body,input.creationPatch);
            validateAdoptionChange(creation,next,previous.body,input.body,w.production||emptyProduction());
            validateFilmingChange(creation,next,input.body);
            if(next.confirmedBodyHash!==null && next.confirmedBodyHash!==bodyDigest(input.body)) fail('INVALID_INPUT','Confirmed hash must identify the saved body');
            // An explicit confirmation in this save is valid only for the exact new body hash checked above.
            for(const r of next.references) for(const key of ['mediaAssetHash','subtitleAssetHash']) if(r[key]) checkAsset(r[key]);
            meta.schemaVersion=5;meta.productionState=next;return meta;
        });
    }
    return {rebuildProductionArchive,readProduction,readProductionContext,readProductionCreation,mutateProduction,saveProductionDraft,reserveProductionTool:(input,options)=>mutateProduction('reserveCost',input,options)};
}

export function productionAssetHashes(meta) {
    const hashes = new Set();
    if(meta.production) {for(const a of meta.production.accounts){for(const h of a.images)hashes.add(h);if(a.avatarAssetHash)hashes.add(a.avatarAssetHash);}for(const r of meta.production.reports) for(const page of r.pages) hashes.add(page.assetHash);for(const t of meta.production.tasks)for(const a of t.attempts){for(const grant of a.mediaGrants??[])hashes.add(grant.assetHash);for(const artifact of a.result?.artifacts||[]){if(artifact.assetHash)hashes.add(artifact.assetHash);if(REFERENCE_ARTIFACTS.includes(artifact.kind))for(const hash of referenceAssetHashes(artifact.data?.references))hashes.add(hash);}}}
    for(const c of [...(meta.production?.creations || []),...(meta.productionState ? [meta.productionState] : [])]) for(const r of c.references) for(const k of ['mediaAssetHash','subtitleAssetHash']) if(r[k]) hashes.add(r[k]);
    return [...hashes];
}
