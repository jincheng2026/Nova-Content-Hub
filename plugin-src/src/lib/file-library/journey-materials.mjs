import {readJourneyEvidence} from './journey-evidence.mjs';
import {LibraryError} from './index.mjs';
import {readBytes,digest} from '../vault/core.mjs';
import {readFinalBytes} from '../final-assets/transaction.mjs';
import {vaultRootForRuntime} from '../vault/index.mjs';
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const text=v=>typeof v==='string'&&v.trim().length>0&&v.length<=20000;
const fail=()=>{throw new LibraryError('MATERIALS_REQUIRED','材料包须包含可核验来源、逐题本人回答与取舍，以及真实未知缺口。');};
export function validateJourneyMaterials(runtimeRoot,root,child,production,data,{sourceCurrent}={}){
 if(!exact(data,['version','work','audience','goal','materials','interview','choices','gaps','draftBrief'])||data.version!==1||!exact(data.work,['vaultId','workId'])||data.work.vaultId!==root.request.parameters.work.vaultId||data.work.workId!==root.request.parameters.work.workId||!text(data.audience)||!text(data.goal)||!Array.isArray(data.materials)||!data.materials.length||data.materials.length>100||!Array.isArray(data.interview)||data.interview.length<3||data.interview.length>5||data.interview.some(i=>!exact(i,['question','authorAnswer','understanding'])||![i.question,i.authorAnswer,i.understanding].every(text))||!Array.isArray(data.choices)||!data.choices.length||data.choices.some(c=>!exact(c,['choice','reason'])||![c.choice,c.reason].every(text))||!Array.isArray(data.gaps)||data.gaps.some(g=>!exact(g,['code','detail','impact'])||![g.code,g.detail,g.impact].every(text))||!exact(data.draftBrief,['promise','angle','voice'])||!Object.values(data.draftBrief).every(text))fail();
 const vaultRoot=vaultRootForRuntime(runtimeRoot),members=new Set(root.journeyState.members.map(m=>m.taskId)),hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);let current=false;
 for(const item of data.materials){
  if(!exact(item,['id','source','summary','use','reason'])||!text(item.id)||!text(item.summary)||!text(item.reason)||!['use','exclude'].includes(item.use))fail();const source=item.source;
  if(source?.kind==='current-source'){
   if(!exact(source,['kind','documentId','relativePath','hash'])||!['documentId','relativePath','hash'].every(k=>source[k]===child.request.parameters.source[k])||digest(readBytes(vaultRoot,source.relativePath))!==source.hash&&!sourceCurrent?.(source))fail();current=true;
  }else if(source?.kind==='analysis'){
   if(!exact(source,['kind','artifactId','hash']))fail();const pin=root.journeyState.checkpoints.find(p=>p.kind==='analysis-comparison'&&p.artifactId===source.artifactId&&p.hash===source.hash);if(!pin||digest(readBytes(vaultRoot,pin.path))!==pin.hash)fail();
  }else if(['research','transcript','media'].includes(source?.kind)){
   const keys=source.kind==='research'?['kind','taskId','attemptId','requestHash','researchId','reportHash']:source.kind==='media'?['kind','taskId','attemptId','requestHash','researchId','videoId','mediaHash']:['kind','taskId','attemptId','requestHash','researchId','videoId','mediaHash','rawHash','correctedHash','timing'];if(!exact(source,keys))fail();
   const task=production.tasks.find(t=>t.id===source.taskId),attempt=task?.attempts.find(a=>a.id===source.attemptId);if(!task||!attempt||!members.has(task.id)||task.requestHash!==source.requestHash||task.request.parameters.researchRuntime?.researchId!==source.researchId)fail();
   const rebound=readJourneyEvidence(runtimeRoot,production,task),config=task.request.parameters.researchRuntime,locator=JSON.parse(readBytes(vaultRoot,'.workbench/research-runtime/'+config.researchId+'.json'));if(locator.path!==config.outputDirectory+'/research-runtime.json')fail();const state=JSON.parse(readBytes(vaultRoot,locator.path));
   if(source.kind==='research'){const pin=root.journeyState.checkpoints.find(p=>p.taskId===task.id&&p.kind==='research'&&p.hash===source.reportHash);if(!pin||state.report?.sha256!==pin.hash||digest(readBytes(vaultRoot,state.report.relativePath))!==pin.hash)fail();}
   else {
    const media=state.media.find(m=>m.videoId===source.videoId&&m.assetHash===source.mediaHash),transcript=state.transcripts.find(t=>t.videoId===source.videoId),grant=[...(attempt.mediaGrants??[]),...(rebound?.mediaGrants??[])].find(g=>g.videoId===source.videoId&&g.assetHash===source.mediaHash),cost=grant&&(production.costs.find(c=>c.taskId===task.id&&c.attemptId===attempt.id&&c.requestId===grant.sourceRequestId&&c.status==='measured'&&c.usage?.ok===true)??rebound?.costs.find(c=>c.requestId===grant.sourceRequestId&&c.status==='measured'&&c.usage?.ok===true));if(!media||!grant||!cost||!hash(source.mediaHash)||digest(readFinalBytes(runtimeRoot,'资产/sha256/'+source.mediaHash.slice(0,2)+'/'+source.mediaHash,67108864))!==source.mediaHash)fail();
    if(source.kind==='media'){if(!data.gaps.some(g=>g.code==='TRANSCRIPT_UNAVAILABLE'&&g.detail.includes(source.videoId)))fail();continue;}
    if(!transcript||transcript.rawHash!==source.rawHash||digest(readBytes(vaultRoot,transcript.directory+'/raw/transcript.txt'))!==source.rawHash||digest(readBytes(vaultRoot,transcript.directory+'/raw/segments.jsonl'))!==transcript.segmentsHash)fail();const segments=readBytes(vaultRoot,transcript.directory+'/raw/segments.jsonl').toString('utf8').trim(),hasTiming=segments.length>0;if(source.timing!==(hasTiming?'segments':'none'))fail();
    if(source.correctedHash!==null&&(!transcript.correctedDirectory||transcript.correctedHash!==source.correctedHash||digest(readBytes(vaultRoot,transcript.correctedDirectory+'/transcript_corrected.md'))!==source.correctedHash))fail();
    if(!hasTiming&&!data.gaps.some(g=>g.code==='TIMING_UNAVAILABLE'))fail();
   }
  }else fail();
 }
 for(const pin of root.journeyState.checkpoints){
  if(pin.kind==='analysis-comparison'&&!data.materials.some(m=>m.source.kind==='analysis'&&m.source.artifactId===pin.artifactId&&m.source.hash===pin.hash))fail();
  if(pin.kind==='research'){
   if(!data.materials.some(m=>m.source.kind==='research'&&m.source.taskId===pin.taskId&&m.source.reportHash===pin.hash))fail();
   const task=production.tasks.find(t=>t.id===pin.taskId),config=task.request.parameters.researchRuntime,state=JSON.parse(readBytes(vaultRoot,config.outputDirectory+'/research-runtime.json'));
   if(!state.media.length&&!data.gaps.some(g=>g.code==='MEDIA_UNAVAILABLE'&&g.detail.includes(config.researchId)))fail();
   for(const media of state.media)if(!data.materials.some(m=>['transcript','media'].includes(m.source.kind)&&m.source.taskId===pin.taskId&&m.source.videoId===media.videoId&&m.source.mediaHash===media.assetHash))fail();
  }
 }
 if(!current||new Set(data.materials.map(m=>m.id)).size!==data.materials.length)fail();
 return structuredClone(data);
}
