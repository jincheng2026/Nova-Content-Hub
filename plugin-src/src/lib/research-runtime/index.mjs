import {atProductionCommit} from '../production-authority.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {rootPath,identity,safe,mkdir,atomic,readBytes,digest} from '../vault/core.mjs';
import {validateResearchConfig,deriveResearchVideoIds,fail,object,hash,canonical} from './common.mjs';
import {validateTranscript,normalizeAsrResult} from './transcript.mjs';
import {buildCorrectedSubtitles} from './subtitles.mjs';
import {prepareContentRecords} from './normalize.mjs';
import {validateTopicDataset,freezeTopicFindings,renderTopicReport} from './topic-report.mjs';
import {freezeFindings,computeAccount,renderAccountReport,validateCitations} from './report.mjs';
import {validateIntakeProof,readIntakeFile,verifyIntakeReceipt} from './intake-proof.mjs';
import {validateIntakeInput,intakeSource,intakeMetadata,findIntakeDuplicates,intakeNote,intakeReport,intakeContentHash} from './intake.mjs';
import {validateCommentReport,freezeCommentFindings,renderCommentReport,renderReferenceCard} from './comment-report.mjs';
export {validateResearchConfig,researchMediaAuthorized} from './common.mjs';
export {validateTranscript,normalizeAsrResult,subtitles} from './transcript.mjs';
export {buildCorrectedSubtitles,validateSubtitleCues,transcriptBody,spokenText} from './subtitles.mjs';
export {freezeFindings,computeAccount,renderAccountReport,validateCitations,accountChartSpecs} from './report.mjs';
export {validateCommentReport,freezeCommentFindings,renderCommentReport,renderReferenceCard} from './comment-report.mjs';
export {prepareContentRecords,parseCount,extractServiceRows} from './normalize.mjs';
export {validateTopicDataset,freezeTopicFindings,renderTopicReport} from './topic-report.mjs';
const now=()=>new Date().toISOString();
const commentLevel=s=>['reference-card','diagnostic'].includes(s.config.commentMode)?'L2':s.config.commentMode==='audience-depth'?'L3':'L4';
const working=(s,part)=>`${s.config.outputDirectory}/${s.config.route==='intake'?'.staging/':''}${part}`;
const filename=v=>{if(typeof v!=='string'||!/^[-a-zA-Z0-9_]{1,100}$/.test(v))fail('INVALID_INPUT');return v;};
/** All provider work uses the existing main-process broker. This module never fetches, spawns Python or reads credentials. */
export function createResearchRuntime({vaultRoot,executeService,fetchMedia,readMedia,assetRoot,readiness,authorize}={}){
 const root=rootPath(vaultRoot),expected=identity(root);
 const check=()=>{const current=identity(root);if(current.dev!==expected.dev||current.ino!==expected.ino)fail('ROOT_REPLACED','所选知识库根目录已替换。');};
 const locator=id=>`.workbench/research-runtime/${filename(id)}.json`;
 const read=relative=>JSON.parse(readBytes(root,relative).toString('utf8'));
 const load=id=>{check();const loc=read(locator(id)),state=read(loc.path);if(state.config?.researchId!==id||state.config.outputDirectory!==path.posix.dirname(loc.path)&&!(state.stage==='intake-finalized'&&loc.path===`.trash/jincheng-research/${id}/research-runtime.json`))fail('CORRUPT');validateResearchConfig(state.config);return{state,relative:loc.path,expectedHash:digest(readBytes(root,loc.path))};};
 const write=(relative,data,expectedHash=null)=>atProductionCommit(()=>{check();mkdir(root,path.posix.dirname(relative));atomic(root,relative,Buffer.isBuffer(data)?data:Buffer.from(typeof data==='string'?data:JSON.stringify(data,null,2)+'\n'),expectedHash);return relative;});
 const persist=loaded=>{loaded.state.updatedAt=now();write(loaded.relative,loaded.state,loaded.expectedHash);loaded.expectedHash=digest(readBytes(root,loaded.relative));};
 const moveIntake=(from,to)=>atProductionCommit(()=>{check();if(!fs.existsSync(safe(root,from,true)))return;mkdir(root,path.posix.dirname(to));if(fs.existsSync(safe(root,to,true)))fail('CONFLICT','中间证据归档已存在，保留原文件等待核对。');fs.renameSync(safe(root,from),safe(root,to,true));});
 const finishIntakeArchive=loaded=>{const s=loaded.state;if(s.stage!=='intake-finalized')return;const id=s.config.researchId,archive=`.trash/jincheng-research/${id}`,archivedState=`${archive}/research-runtime.json`;if(loaded.relative===archivedState)return;
  moveIntake(`${s.config.outputDirectory}/.staging`,`${archive}/remaining`);const bytes=Buffer.from(JSON.stringify(s,null,2)+'\n');if(fs.existsSync(safe(root,archivedState,true))){if(hash(readBytes(root,archivedState))!==hash(bytes))fail('CONFLICT','归档运行状态与本任务不一致。');}else write(archivedState,bytes);
  const loc=locator(id),oldLoc=digest(readBytes(root,loc));write(loc,{version:1,path:archivedState},oldLoc);if(digest(readBytes(root,loaded.relative))!==loaded.expectedHash)fail('CONFLICT');atProductionCommit(()=>fs.unlinkSync(safe(root,loaded.relative)));
 };
 const locked=async(id,fn,publication=false)=>{
  check();mkdir(root,'.workbench/research-runtime');const lock=safe(root,publication?'.workbench/research-runtime/.intake-publication.lock':`.workbench/research-runtime/${filename(id)}.lock`,true);let fd;
  try{fd=fs.openSync(lock,'wx',0o600);}catch(e){if(e.code==='EEXIST')fail('RESEARCH_BUSY','研究由另一操作持有；异常退出后需人工核对锁和费用，不能自动重试。');throw e;}
  try{fs.writeFileSync(fd,JSON.stringify({pid:process.pid,at:now()}));return await fn();}finally{fs.closeSync(fd);fs.unlinkSync(lock);}
 };
 const approved=async(state,action,input)=>{if(state.stage==='intake-finalized')fail('INTAKE_FINALIZED','素材已正式入库；后续修订需新固定任务，不能改写原验收。');if(authorize)await authorize({config:structuredClone(state.config),action,input});};
 const api={
  async prepare(input){const c=validateResearchConfig(input);return locked(c.researchId,async()=>{
   if(fs.existsSync(safe(root,locator(c.researchId),true)))fail('CONFLICT','此研究编号已存在；请恢复原任务。');
   if(c.route==='intake'&&fs.existsSync(safe(root,`${c.outputDirectory}/.staging`,true)))fail('CONFLICT','此素材已有暂存证据；保留旧任务，不能混入新的转写批次。');
   const relative=`${c.outputDirectory}/research-runtime.json`,state={format:'jincheng-research-runtime',version:1,config:c,stage:'prepared',createdAt:now(),updatedAt:now(),requests:[],media:[],transcripts:[],dataset:null,findings:null,report:null,limitations:[]};
   await approved(state,'prepare',c);write(relative,state);write(locator(c.researchId),{version:1,path:relative});return structuredClone(state);
  });},
  status(id){return structuredClone(load(id).state);},
  async readiness(){return readiness?readiness():{localAsr:{available:false,reason:'未绑定本机语音服务；本适配器不安装 Python、Qwen 模型或原来源包。'},capabilities:{node:true,network:false}};},
  normalizeContent(id,input){const s=load(id).state;if(!object(input)||Object.keys(input).some(k=>!['rows','asOf'].includes(k)))fail('INVALID_INPUT');return prepareContentRecords(input.rows,{platform:s.config.platform,asOf:input.asOf});},
  async collect(id,input){return locked(id,async()=>{
   const l=load(id),s=l.state,c=s.config;
   if(!object(input)||Object.keys(input).some(k=>!['operation','id','cursor','search'].includes(k))||!c.operations.includes(input.operation)||typeof input.id!=='string'||input.id.length>300||input.operation==='comments'&&!c.comments)fail('RESEARCH_OPERATION_FORBIDDEN');
   const isVideo=['video','comments'].includes(input.operation),allowed=isVideo?[...(c.videoIds??[]),...(s.samples?.videoIds??[])]:c.targetIds;
   if(!allowed.includes(input.id))fail('RESEARCH_TARGET_FORBIDDEN','采集对象未列入固定研究请求；需先明确更新任务。');
   if(s.findings)fail('FINDINGS_FROZEN');
   const key=hash(input),existing=s.requests.find(r=>r.key===key);
   if(existing?.status==='complete')return read(existing.path);
   if(existing)fail('RESEARCH_REQUEST_UNSETTLED','原请求尚未结清；回读费用和错误，不自动重试。');
   if(s.requests.length>=c.maxRequests)fail('RESEARCH_REQUEST_LIMIT');
   if(typeof executeService!=='function')fail('SERVICE_UNAVAILABLE');await approved(s,'collect',input);
   const req={id:randomUUID(),key,input:structuredClone(input),status:'started',at:now()};s.requests.push(req);persist(l);
   try{const result=await executeService({tool:'tikhub',...input,requestId:req.id});const relative=working(s,`raw/tikhub/${req.id}.json`);await approved(s,'archive-collection',input);write(relative,{request:input,collectedAt:result.collectedAt??now(),requestsUsed:result.requestsUsed,cacheHit:result.cacheHit??false,data:result.data});req.status='complete';req.path=relative;req.responseHash=hash(result.data);s.stage='collected';persist(l);return read(relative);}
   catch(error){req.status='failed';req.error=/^[A-Z_]{1,80}$/.test(error.code)?error.code:'SERVICE_FAILED';s.stage='blocked';persist(l);throw error;}
  });},
  async deriveSamples(id){return locked(id,async()=>{const l=load(id),s=l.state,c=s.config;if(s.findings)fail('FINDINGS_FROZEN');if(!c.sampleLimit||c.route!=='account')fail('RESEARCH_TARGET_FORBIDDEN');const req=s.requests.find(r=>r.status==='complete'&&r.input.operation==='user-posts'&&c.targetIds.includes(r.input.id));if(!req)fail('RESEARCH_RECEIPT_REQUIRED');const receipt=read(req.path);if(!req.responseHash||hash(receipt.data)!==req.responseHash)fail('CONFLICT');const videoIds=deriveResearchVideoIds(receipt.data,c.sampleLimit);await approved(s,'derive-samples',{requestId:req.id,responseHash:req.responseHash,videoIds});s.samples={requestId:req.id,responseHash:req.responseHash,videoIds};persist(l);return structuredClone(s.samples);});},
  async download(id,videoId){return locked(id,async()=>{
   const l=load(id),s=l.state;if(s.findings)fail('FINDINGS_FROZEN');if(![...(s.config.videoIds??[]),...(s.samples?.videoIds??[])].includes(videoId)||!s.config.operations.includes('video')||s.config.platform!=='douyin')fail('RESEARCH_TARGET_FORBIDDEN');
   const previous=s.media.find(m=>m.videoId===videoId),intake=s.config.route==='intake';
   if(previous&&(!intake||s.intakes?.[videoId]))return structuredClone(previous);
   if(!previous&&intake){const duplicates=findIntakeDuplicates(root,{videoId,canonicalUrl:`https://www.douyin.com/video/${videoId}`});if(duplicates.length)throw Object.assign(new Error('素材已在知识库，停止新下载和转写；请查看现有目录。'),{code:'INTAKE_DUPLICATE',matches:duplicates});}
   if(!previous&&s.media.length>=3)fail('MEDIA_DOWNLOAD_LIMIT');if(typeof fetchMedia!=='function')fail('MEDIA_BROKER_REQUIRED');await approved(s,'download',{videoId});
   const result=await fetchMedia({videoId,url:`https://www.douyin.com/video/${videoId}`}),grant=result.grant??result.data??result;
   if(typeof grant.assetHash!=='string'||!/^[a-f0-9]{64}$/.test(grant.assetHash)||grant.videoId!==videoId||grant.canonicalUrl!==`https://www.douyin.com/video/${videoId}`||previous&&previous.assetHash!==grant.assetHash)fail('INVALID_MEDIA_GRANT');
   const media={...grant,videoId},source=intakeSource(result.source??previous?.source,videoId);if(source)media.source=source;
   if(intake&&s.config.intakeContractVersion===2&&!source)fail('INTAKE_SOURCE_REQUIRED','新入库任务需要已登记作品元数据；未登记来源时不保存媒体条目。');
   const save=(relative,data)=>{const value=Buffer.isBuffer(data)?data:Buffer.from(typeof data==='string'?data:JSON.stringify(data,null,2)+'\n');if(fs.existsSync(safe(root,relative,true))){if(hash(readIntakeFile(root,relative))!==hash(value))fail('CONFLICT','暂存证据已有不同内容，未覆盖。');}else write(relative,value);};
   if(readMedia){const file=await readMedia(grant),bytes=Buffer.from(file.data);if(!/^\.(?:mp4|webm|mp3|m4a|wav|ogg|flac)$/.test(file.extension)||!bytes.length||bytes.length>67108864||hash(bytes)!==grant.assetHash)fail('INVALID_MEDIA_GRANT','归档原片字节与本次登记资产不一致。');
    let proof,coverBytes;if(intake&&(file.proof!==undefined||file.coverBytes!==undefined)){coverBytes=file.coverBytes instanceof Uint8Array?Buffer.from(file.coverBytes):file.coverBytes;proof=validateIntakeProof(file.proof,bytes,coverBytes,file.extension,grant.assetHash);}
    await approved(s,'archive-media',{videoId,assetHash:grant.assetHash});media.originalPath=working(s,`raw/media/${videoId}-${grant.assetHash.slice(0,12)}${file.extension}`);save(media.originalPath,bytes);
    if(proof){const evidence=working(s,`raw/media/${videoId}-${hash(proof).slice(0,12)}`);media.mediaValidationPath=`${evidence}/媒体校验.json`;media.coverPath=`${evidence}/封面.png`;save(media.mediaValidationPath,proof);save(media.coverPath,coverBytes);media.verificationStatus='verified';}
    else if(intake)media.verificationStatus='pending-native-verification';
   }
   if(previous)s.media[s.media.indexOf(previous)]=media;else s.media.push(media);
   const mediaPath=working(s,`raw/media/${videoId}.json`),old=fs.existsSync(safe(root,mediaPath,true))?digest(readBytes(root,mediaPath)):null;write(mediaPath,media,old);s.stage='media-ready';persist(l);return structuredClone(media);
  });},
  async transcribe(id,videoId){return locked(id,async()=>{const l=load(id),s=l.state;if(s.findings)fail('FINDINGS_FROZEN');const media=s.media.find(m=>m.videoId===videoId);if(!media)fail('ASR_MEDIA_REQUIRED');if(typeof executeService!=='function')fail('SERVICE_UNAVAILABLE');const previous=s.transcripts.find(x=>x.videoId===videoId);if(previous)return structuredClone(previous);await approved(s,'transcribe',{videoId,assetHash:media.assetHash});const result=await executeService({tool:'asr',requestId:randomUUID(),audioPath:media.assetHash,allowCloud:false}),raw=normalizeAsrResult(result);raw.manifest.source_sha256=media.assetHash;raw.manifest.requested_engine='qwen3-asr';const dir=working(s,`transcripts/${videoId}`);await approved(s,'archive-transcript',{videoId});write(`${dir}/manifest.json`,raw.manifest);write(`${dir}/raw/transcript.txt`,raw.rawText);write(`${dir}/raw/segments.jsonl`,raw.segments.map(x=>JSON.stringify(x)).join('\n')+'\n');const entry={videoId,directory:dir,status:'raw_transcribed',hasTiming:raw.segments.length>0};s.transcripts.push(entry);s.stage='awaiting-correction';persist(l);return{...entry,...raw};});},
  async correct(id,videoId,input){return locked(id,async()=>{const l=load(id),s=l.state;if(s.intakes?.[videoId]||s.stage==='intake-finalized')fail('INTAKE_FINALIZED');if(s.findings)fail('FINDINGS_FROZEN');const entry=s.transcripts.find(x=>x.videoId===videoId);if(!entry)fail('TRANSCRIPT_NOT_FOUND');if(!object(input)||Object.keys(input).some(k=>!['correctedText','segments','durationSeconds','timePrecision','alignmentReviewed','corrections','reviewedBy'].includes(k))||typeof input.reviewedBy!=='string'||!input.reviewedBy.trim()||!Array.isArray(input.corrections))fail('INVALID_INPUT','校正需保留逐项修改及复核人，不能隐式确认。');
   const rawManifest=read(`${entry.directory}/manifest.json`),rawSegments=readBytes(root,`${entry.directory}/raw/segments.jsonl`).toString('utf8').trim().split('\n').filter(Boolean).map(x=>JSON.parse(x)),segments=input.segments??rawSegments;
   const manifest={...rawManifest,status:'corrected_validated',segment_count:segments.length,duration_seconds:input.durationSeconds??rawManifest.duration_seconds,time_precision:input.timePrecision??rawManifest.time_precision,alignment_reviewed:input.alignmentReviewed===true,reviewed_by:input.reviewedBy,reviewed_at:now()};
   if(!segments.length)manifest.evidence_kind='reviewed_text';const validation=validateTranscript({manifest,correctedText:input.correctedText,segments});const original=readBytes(root,`${entry.directory}/raw/transcript.txt`).toString('utf8');if(input.corrections.length>10000||input.corrections.some(c=>!object(c)||Object.keys(c).some(k=>!['original','corrected','reason'].includes(k))||!['original','corrected','reason'].every(k=>typeof c[k]==='string')||!c.reason.trim()||!original.includes(c.original)||!input.correctedText.includes(c.corrected)))fail('INVALID_INPUT','校正明细必须回到原稿、校正版及具体修改依据。');let subtitle;try{subtitle=buildCorrectedSubtitles(input.correctedText,rawSegments,manifest.duration_seconds);}catch(e){if(!['SUBTITLE_TIMING_REQUIRED','SUBTITLE_TEXT_MISMATCH','SUBTITLE_INVALID','SUBTITLE_ALIGNMENT_TOO_LARGE'].includes(e.code))throw e;entry.subtitleValidation={ok:false,code:e.code,message:e.message};}await approved(s,'correct',{videoId,input});
   const version=hash({manifest,correctedText:input.correctedText,segments,corrections:input.corrections}),dir=`${entry.directory}/corrected/${version}`;
   write(`${dir}/manifest.json`,manifest);write(`${dir}/transcript_corrected.md`,input.correctedText);write(`${dir}/segments.jsonl`,segments.map(x=>JSON.stringify(x)).join('\n')+'\n');write(`${dir}/corrections.json`,input.corrections);if(subtitle){write(`${dir}/transcript_corrected.srt`,subtitle.srt);write(`${dir}/subtitle-validation.json`,subtitle.validation);entry.subtitleValidation=subtitle.validation;}
   entry.status='corrected_validated';entry.correctedDirectory=dir;entry.validation=validation;s.stage='transcript-reviewed';persist(l);return structuredClone(entry);
  });},
  async finalizeIntake(id,rawInput){return locked(id,()=>locked(id,async()=>{
   const l=load(id),s=l.state,input=validateIntakeInput(rawInput),videoId=input.videoId;
   const previous=s.intakes?.[videoId]??(s.stage==='intake-finalized'&&s.intake&&(s.intake.transcriptPath?.endsWith(`/${videoId}.md`))?s.intake:null);
   if(previous){verifyIntakeReceipt(root,previous);finishIntakeArchive(l);return structuredClone({...previous,strictValidation:previous.strictValidation??{ok:false,limitations:['历史回执未包含完整来源、真实解码与封面证据；未重新验收或改写正式资料。']}});}
   if(s.stage==='intake-finalized')fail('INTAKE_FINALIZED');
   if(s.config.route!=='intake'||s.config.platform!=='douyin'||!s.config.videoIds?.includes(videoId))fail('RESEARCH_TARGET_FORBIDDEN');
   const media=s.media.find(m=>m.videoId===videoId),entry=s.transcripts.find(t=>t.videoId===videoId);
   const priorPlan=s.intakePlans?.[videoId],duplicates=findIntakeDuplicates(root,media??{videoId,canonicalUrl:`https://www.douyin.com/video/${videoId}`},priorPlan?.directory);
   const reportPath='02_内容素材/_入库检查报告.md',appendReport=text=>{const exists=fs.existsSync(safe(root,reportPath,true)),before=exists?readBytes(root,reportPath):null;if(before?.toString('utf8').includes(`<!-- intake:${id}:${videoId} -->`))return;write(reportPath,(before?.toString('utf8')??'# 入库检查报告\n')+text,before?digest(before):null);};
   if(duplicates.length>1)fail('INTAKE_DUPLICATE_AMBIGUOUS','多项现有素材匹配，需明确核对目标；未自动选择或合并。');
   if(duplicates.length){await approved(s,'finalize-intake',input);const at=now();appendReport(intakeReport({id,videoId,directory:duplicates[0].directory,at,status:'duplicate',dedup:duplicates,validation:entry?.subtitleValidation}));return{status:'duplicate',directory:duplicates[0].directory,reportPath,dedup:{layer:duplicates[0].foundBy[0],foundBy:duplicates[0].foundBy,matches:duplicates},foundBy:duplicates[0].foundBy,pendingMediaIds:s.config.videoIds.filter(v=>!s.intakes?.[v])};}
   if(!media?.originalPath||entry?.status!=='corrected_validated'||!entry.subtitleValidation?.ok||!entry.correctedDirectory)fail('INTAKE_NOT_READY','本项须有已登记原片、完整校正版和通过校验的同名字幕；其他素材可以独立继续。');
   if(!media.source)fail('INTAKE_SOURCE_REQUIRED','新入库任务需要已登记作品元数据；保留暂存，不能把助手填写的标题当平台来源。');
   const metadata=intakeMetadata(input,media);
   const archive=`.trash/jincheng-research/${id}`,intermediateArchive=`${archive}/intermediate/${videoId}`,transcriptDirectory=fs.existsSync(safe(root,entry.directory,true))?entry.directory:`${intermediateArchive}/transcript`,correctedDirectory=`${transcriptDirectory}/${path.posix.relative(entry.directory,entry.correctedDirectory)}`;
   const corrected=readBytes(root,`${correctedDirectory}/transcript_corrected.md`).toString('utf8'),savedSrt=readBytes(root,`${correctedDirectory}/transcript_corrected.srt`).toString('utf8'),rawSegments=readBytes(root,`${transcriptDirectory}/raw/segments.jsonl`).toString('utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line)),manifest=read(`${correctedDirectory}/manifest.json`),rebuilt=buildCorrectedSubtitles(corrected,rawSegments,manifest.duration_seconds);
   if(savedSrt!==rebuilt.srt)fail('CONFLICT','验收前字幕或校正版已变化，保留暂存等待重新核验。');
   const originalSource=fs.existsSync(safe(root,media.originalPath,true))?media.originalPath:`${intermediateArchive}/${path.posix.basename(media.originalPath)}`,bytes=readIntakeFile(root,originalSource);if(hash(bytes)!==media.assetHash)fail('CONFLICT','原片在验收前变化。');
   if(!media.mediaValidationPath||!media.coverPath)fail('INTAKE_MEDIA_VERIFICATION_REQUIRED','缺少真实解码与封面证据；保留暂存，可重新下载补验后继续。');
   const archivedEvidence=relative=>fs.existsSync(safe(root,relative,true))?relative:`${intermediateArchive}/media-evidence/${path.posix.basename(relative)}`;
   const proofBytes=readIntakeFile(root,archivedEvidence(media.mediaValidationPath),262144),coverBytes=readIntakeFile(root,archivedEvidence(media.coverPath),2097152);
   let proof;try{proof=JSON.parse(proofBytes.toString('utf8'));}catch{fail('INTAKE_MEDIA_INVALID_PROOF');}
   validateIntakeProof(proof,bytes,coverBytes,path.posix.extname(media.originalPath),media.assetHash);
   validateTranscript({manifest,correctedText:corrected,mediaSha256:media.assetHash,mediaDurationSeconds:proof.container.durationSeconds,segments:readBytes(root,`${correctedDirectory}/segments.jsonl`).toString('utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line))});
   const contentHash=intakeContentHash({metadata,assetHash:media.assetHash,corrected,srt:savedSrt,proof,coverHash:hash(coverBytes)});if(priorPlan&&priorPlan.contentHash!==contentHash)fail('CONFLICT','此素材已有发布计划，不能在失败重试时改写。');
   const plan=priorPlan??{directory:metadata.directory,verifiedAt:now(),contentHash};
   await approved(s,'finalize-intake',input);s.intakePlans??={};s.intakePlans[videoId]=plan;persist(l);
   const base=plan.directory,extension=path.posix.extname(media.originalPath);if(!['.mp4','.webm'].includes(extension))fail('INTAKE_NOT_READY','当前正式入库适配仅支持已授权抖音视频；音频、图文与其他平台须专门适配验收。');
   const originalPath=`${base}/视频${extension}`,transcriptPath=`${base}/转写/校正版逐字稿/${videoId}.md`,subtitlePath=`${base}/转写/校正版逐字稿/${videoId}.srt`,notePath=`${base}/笔记信息.md`,mediaValidationPath=`${base}/媒体校验.json`,coverPath=`${base}/封面.png`,note=intakeNote(metadata,media,corrected,extension,plan.verifiedAt);
   const items=[['视频'+extension,bytes],[`转写/校正版逐字稿/${videoId}.md`,corrected],[`转写/校正版逐字稿/${videoId}.srt`,savedSrt],['笔记信息.md',note],['媒体校验.json',proofBytes],['封面.png',coverBytes]],formal=safe(root,base,true),publication=`${s.config.outputDirectory}/.staging/publication/${videoId}`;
   const verify=(relative,data)=>{const target=safe(root,relative),stat=fs.lstatSync(target);if(!stat.isFile()||stat.nlink!==1||stat.size>67108864||hash(readIntakeFile(root,relative))!==hash(Buffer.isBuffer(data)?data:Buffer.from(data)))fail('CONFLICT','正式素材或发布暂存已有不同内容，未覆盖。');};
   if(fs.existsSync(formal)){for(const [name,data] of items)verify(`${base}/${name}`,data);}else{for(const [name,data] of items){const relative=`${publication}/${name}`;if(fs.existsSync(safe(root,relative,true)))verify(relative,data);else write(relative,data);}for(const [name,data] of items)verify(`${publication}/${name}`,data);validateIntakeProof(proof,readIntakeFile(root,`${publication}/视频${extension}`),readIntakeFile(root,`${publication}/封面.png`,2097152),extension,media.assetHash);check();mkdir(root,path.posix.dirname(base));fs.renameSync(safe(root,publication),formal);}
   for(const [name,data] of items)verify(`${base}/${name}`,data);
   const move=moveIntake;
   move(media.mediaValidationPath,`${intermediateArchive}/media-evidence/媒体校验.json`);move(media.coverPath,`${intermediateArchive}/media-evidence/封面.png`);
   move(entry.directory,`${intermediateArchive}/transcript`);move(media.originalPath,`${intermediateArchive}/${path.posix.basename(media.originalPath)}`);move(working(s,`raw/media/${videoId}.json`),`${intermediateArchive}/media.json`);
   appendReport(intakeReport({id,videoId,directory:base,at:plan.verifiedAt,validation:rebuilt.validation}));
   s.intakes??={};const finalizedMediaIds=[...new Set([...Object.keys(s.intakes),videoId])],pendingMediaIds=s.config.videoIds.filter(v=>!finalizedMediaIds.includes(v));
   const result={status:'published',directory:base,originalPath,transcriptPath,subtitlePath,notePath,mediaValidationPath,coverPath,fileHashes:Object.fromEntries(items.map(([name,data])=>[`${base}/${name}`,hash(Buffer.isBuffer(data)?data:Buffer.from(data))])),reportPath,source_sha256:media.assetHash,sourceProvenance:metadata.sourceProvenance,subtitleValidation:rebuilt.validation,intermediateArchive,verifiedAt:plan.verifiedAt,dedup:{layer:null,foundBy:[],matches:[]},foundBy:[],finalizedMediaIds,pendingMediaIds,strictValidation:{ok:true,limitations:[]}};
   s.intakes[videoId]=result;s.intake=result;s.stage=pendingMediaIds.length?'intake-partial':'intake-finalized';persist(l);
   if(!pendingMediaIds.length)finishIntakeArchive(l);
   return structuredClone(result);
  },true));},
  async saveDataset(id,payload){return locked(id,async()=>{const l=load(id),s=l.state;if(s.findings)fail('FINDINGS_FROZEN');if(s.config.route==='comments')validateCommentReport(payload,commentLevel(s)==='L4'?'L3':commentLevel(s));else if(s.config.route==='topic')validateTopicDataset(payload);else{computeAccount(payload);validateCitations(payload);}await approved(s,'save-dataset',payload);const relative=`${s.config.outputDirectory}/normalized/dataset-${hash(payload)}.json`;if(!fs.existsSync(safe(root,relative,true)))write(relative,payload);s.dataset={path:relative,sha256:hash(payload)};s.stage='analyzed';persist(l);return structuredClone(s.dataset);});},
  async freeze(id){return locked(id,async()=>{const l=load(id),s=l.state;if(s.findings)return structuredClone(s.findings);if(!s.dataset)fail('DATASET_REQUIRED');const payload=read(s.dataset.path);if(hash(payload)!==s.dataset.sha256)fail('CONFLICT');const frozen=s.config.route==='comments'?freezeCommentFindings(payload,commentLevel(s)==='L4'?'L3':commentLevel(s)):s.config.route==='topic'?freezeTopicFindings(payload):freezeFindings(payload);await approved(s,'freeze-findings',frozen);const relative=`${s.config.outputDirectory}/findings/object-findings-${frozen.sha256}.json`;write(relative,frozen);s.findings={path:relative,sha256:frozen.sha256,corpus_sha256:frozen.corpus_sha256};s.stage='findings-frozen';persist(l);return structuredClone(s.findings);});},
  async advise(id,{findingsHash,advice,ownSources=[]}){return locked(id,async()=>{
   const l=load(id),s=l.state;if(!s.findings||s.findings.sha256!==findingsHash||!Array.isArray(advice)||advice.length>100||!Array.isArray(ownSources)||ownSources.length>100||ownSources.some(v=>!object(v)||v.kind!=='own_material'))fail('FROZEN_FINDINGS_REQUIRED');
   const frozen=read(s.findings.path);if(hash(frozen.object_findings)!==findingsHash)fail('CONFLICT');
   const payload={...frozen.object_findings,sources:[...(frozen.object_findings.sources??[]),...ownSources]};
   if(s.config.route==='comments')validateCommentReport({...payload,recommendations:[...payload.recommendations,...advice],frozen_findings_sha256:frozen.findings_sha256},commentLevel(s));
   else{validateCitations({...payload,personal_advice:advice});for(const item of advice){if(!Array.isArray(item.own_citations)||!item.own_citations.length||item.own_citations.some(c=>!ownSources.some(v=>v.source_id===c.source_id)))fail('INVALID_CITATION','个人建议须引用冻结后单独读入的本人材料。');}}
   await approved(s,'personal-advice',{findingsHash,advice,ownSources});const body={findingsHash,advice,ownSources},relative=`${s.config.outputDirectory}/findings/personal-advice-${hash(body)}.json`;
   if(!fs.existsSync(safe(root,relative,true)))write(relative,body);s.advice={path:relative,sha256:hash(body)};persist(l);return structuredClone(s.advice);
  });},
  async render(id){return locked(id,async()=>{const l=load(id),s=l.state;if(!s.findings)fail('FROZEN_FINDINGS_REQUIRED');const frozen=read(s.findings.path);if(hash(frozen.object_findings)!==s.findings.sha256)fail('CONFLICT');const advice=s.advice?read(s.advice.path):null;if(advice&&(advice.findingsHash!==s.findings.sha256||hash(advice)!==s.advice.sha256))fail('CONFLICT');const comments=s.config.route==='comments',base={...frozen.object_findings,sources:[...(frozen.object_findings.sources??[]),...(advice?.ownSources??[])]},payload=comments?{...base,recommendations:[...frozen.object_findings.recommendations,...(advice?.advice??[])],frozen_findings_sha256:frozen.findings_sha256}:{...base,personal_advice:advice?.advice??[]};await approved(s,'render-report',payload);const card=comments&&s.config.commentMode==='reference-card',html=comments?(card?renderReferenceCard(payload):await renderCommentReport(payload,{level:commentLevel(s)})):s.config.route==='topic'?await renderTopicReport(payload):await renderAccountReport(payload,{assetRoot}),relative=`${s.config.outputDirectory}/${card?'洞察卡':'报告'}-${hash(html).slice(0,12)}${card?'.md':'-报告.html'}`;await approved(s,'publish-report',payload);if(!fs.existsSync(safe(root,relative,true)))write(relative,html);s.report={relativePath:relative,sha256:hash(html),findingsHash:s.findings.sha256,mechanicalValidation:'passed',visualValidation:'pending'};s.stage='report-generated';persist(l);return structuredClone(s.report);});},
 };
 return api;
}
