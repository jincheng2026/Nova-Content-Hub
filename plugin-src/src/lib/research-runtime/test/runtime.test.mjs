import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createResearchRuntime, validateTranscript, computeAccount, renderAccountReport, freezeFindings} from '../index.mjs';
import {createHash} from 'node:crypto';
import {nativeProof,cover} from './fixtures/intake-native.mjs';
const sha='a'.repeat(64);
const transcript=()=>({manifest:{status:'corrected_validated',segment_count:2,duration_seconds:2,time_precision:'sentence',alignment_reviewed:true,source_sha256:sha},correctedText:'这是已校正的正文。',segments:[{start_seconds:0,end_seconds:1,text:'这是已校正'},{start_seconds:1,end_seconds:2,text:'的正文。'}]});
test('reviewed transcript preserves original timing limits and uncertainty ranges',()=>{
 assert.equal(validateTranscript(transcript(),'timing').capabilities.precise_timing,true);
 const t=transcript();t.manifest.alignment_reviewed=false;assert.throws(()=>validateTranscript(t,'timing'),{code:'TRANSCRIPT_NOT_READY'});
 t.manifest.alignment_reviewed=true;t.segments[1].start_seconds=1.8;assert.equal(validateTranscript(t).capabilities.block_timing,false);
 t.segments[1].start_seconds=.8;assert.throws(()=>validateTranscript(t),{code:'TRANSCRIPT_NOT_READY'});
 assert.throws(()=>validateTranscript({...transcript(),correctedText:'待人工校正'}),{code:'TRANSCRIPT_NOT_READY'});
});
const payload=()=>({title:'账号研究',as_of:'2026-10-28',records:[{platform:'douyin',author_id:'author',collection_batch_id:'batch',content_id:'1',title:'作品一',source_url:'https://www.douyin.com/video/1',like_count:10,main_direction:'教程'},{platform:'douyin',author_id:'author',collection_batch_id:'batch',content_id:'2',title:'作品二',like_count:null,main_direction:'教程'}],comments:[{comment_id:'c',content_id:'1',text:'怎样下载？',level:'reply',like_count:3,demand_tags:['步骤'],annotation_reviewed:true}],sources:[{source_id:'s',content_id:'1',text:'原始作品证据',kind:'publication'}],account_analysis:{version:1,summary_cards:[{title:'观察',observation:'仅一条观察',citations:[{source_id:'s',quote:'作品证据'}]}]}});
test('one dataset drives account figures; missing values, comment levels and citations are truthful',async()=>{
 const p=payload(),c=computeAccount(p);assert.equal(c.medians.like_count,10);assert.equal(c.valid_n.like_count,1);assert.equal(c.comment_levels.reply,1);
 const html=await renderAccountReport(p);assert.match(html,/chart-data/);assert.match(html,/AccountCharts.mount/);assert.match(html,/原始作品证据/);assert.doesNotMatch(html,/src="https?:/);
 p.account_analysis.summary_cards[0].citations[0].quote='不存在的引用';await assert.rejects(renderAccountReport(p),{code:'INVALID_CITATION'});
});
test('findings freeze binds full corpus and separates personal advice',()=>{
 const p=payload(),f=freezeFindings(p);assert.equal(f.object_findings.account_analysis.summary_cards.length,1);assert.equal(f.personal_advice.length,0);assert.equal(f.sha256.length,64);
 assert.throws(()=>freezeFindings({...p,personal_advice:['给我的建议']}),{code:'OBJECT_FINDINGS_CONTAMINATED'});
});
test('explicit vault directory persists raw→review→frozen report without overwriting historical files',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'nova-research-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));await fs.mkdir(path.join(root,'01_对标账号'));
 const calls=[],runtime=createResearchRuntime({vaultRoot:root,executeService:async req=>{calls.push(req);return{data:{text:'原始转写',segments:[]},service:'asr',requestsUsed:0};}});
 const config={version:1,researchId:'research-1',outputDirectory:'01_对标账号/测试/调研',route:'account',platform:'douyin',targetIds:['author'],operations:['profile','user-posts'],maxRequests:2,comments:false};
 const first=await runtime.prepare(config);assert.equal(first.stage,'prepared');await assert.rejects(runtime.prepare(config),{code:'CONFLICT'});
 await runtime.collect('research-1',{operation:'profile',id:'author'});assert.equal(calls.length,1);
 await assert.rejects(runtime.collect('research-1',{operation:'comments',id:'1'}),{code:'RESEARCH_OPERATION_FORBIDDEN'});
 await runtime.saveDataset('research-1',payload());await runtime.freeze('research-1');const report=await runtime.render('research-1');assert.match(report.relativePath,/报告\.html$/);assert.ok(await fs.readFile(path.join(root,report.relativePath),'utf8'));
 await assert.rejects(runtime.saveDataset('research-1',payload()),{code:'FINDINGS_FROZEN'});
 await assert.rejects(runtime.prepare({...config,researchId:'research-2',outputDirectory:'../escape'}),{code:'INVALID_INPUT'});
});
test('registered original media, unaligned Qwen text, reviewed correction and personal advice stay separate',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'nova-research-chain-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const bytes=Buffer.from('synthetic registered WAV fixture'),assetHash=createHash('sha256').update(bytes).digest('hex'),grant={assetHash,videoId:'123',canonicalUrl:'https://www.douyin.com/video/123'},calls=[];
 const runtime=createResearchRuntime({vaultRoot:root,fetchMedia:async()=>({data:grant}),readMedia:async()=>({data:bytes,extension:'.wav'}),executeService:async req=>{calls.push(req);return{data:{text:'这是本地识别待校对原稿',segments:[]},service:'asr',requestsUsed:0};}});
 await runtime.prepare({version:1,researchId:'chain',outputDirectory:'02_内容素材/未参考/素材一',route:'intake',platform:'douyin',targetIds:['author'],operations:['video'],maxRequests:1,comments:false,videoIds:['123']});
 const downloaded=await runtime.download('chain','123');assert.deepEqual(await fs.readFile(path.join(root,downloaded.originalPath)),bytes);
 const raw=await runtime.transcribe('chain','123');assert.equal(raw.manifest.status,'raw_transcribed');assert.equal(raw.manifest.time_precision,'unknown');assert.equal(calls[0].allowCloud,false);
 const corrected=await runtime.correct('chain','123',{correctedText:'这是已校对原稿',corrections:[{original:'本地识别待校对',corrected:'已校对',reason:'听回核验'}],reviewedBy:'作者'});assert.equal(corrected.validation.capabilities.precise_timing,false);assert.equal(corrected.validation.capabilities.text_structure,true);
 await assert.rejects(runtime.finalizeIntake('chain',{videoId:'123',title:'素材',platform:'抖音'}),{code:'INTAKE_NOT_READY'});
 await runtime.saveDataset('chain',payload());const findings=await runtime.freeze('chain'),own={source_id:'own',kind:'own_material',text:'我正在制作教程',title:'本人现有材料'};
 await runtime.advise('chain',{findingsHash:findings.sha256,ownSources:[own],advice:[{title:'增加导出步骤',observation:'本人在做教程',interpretation:'加入字幕导出示范',own_citations:[{source_id:'own',quote:'正在制作教程'}],citations:[]}]});
 const report=await runtime.render('chain'),html=await fs.readFile(path.join(root,report.relativePath),'utf8');assert.match(html,/本人应用建议/);assert.equal(runtime.status('chain').findings.sha256,findings.sha256);assert.equal(await fs.readFile(path.join(root,raw.directory,'raw/transcript.txt'),'utf8'),'这是本地识别待校对原稿');
});
test('timed material finalization leaves exact formal originals and moves intermediate evidence to trash',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'nova-intake-finalize-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const bytes=Buffer.from('0000ftyp00000000synthetic timed media'),assetHash=createHash('sha256').update(bytes).digest('hex'),grant={assetHash,videoId:'123',canonicalUrl:'https://www.douyin.com/video/123'};
 const runtime=createResearchRuntime({vaultRoot:root,fetchMedia:async()=>({data:grant,source:{videoId:'123',platform:'douyin',title:'字幕验收合成素材'}}),readMedia:async()=>({data:bytes,extension:'.mp4',proof:nativeProof(bytes),coverBytes:cover}),executeService:async()=>({data:{text:'这是校正的句子。下一句继续讲。',durationMs:4000,segments:[{startMs:0,endMs:2000,text:'这是校正的句子。'},{startMs:2000,endMs:4000,text:'下一句继续讲。'}]}})});
 const outputDirectory='02_内容素材/未参考/抖音/测试_123';await runtime.prepare({version:1,researchId:'finalize',outputDirectory,route:'intake',platform:'douyin',targetIds:['author'],operations:['video'],maxRequests:1,comments:false,videoIds:['123']});await runtime.download('finalize','123');await runtime.transcribe('finalize','123');await runtime.correct('finalize','123',{correctedText:'这是校正的句子。下一句继续讲。',corrections:[],reviewedBy:'作者'});
 const result=await runtime.finalizeIntake('finalize',{videoId:'123',title:'字幕验收合成素材',platform:'抖音'});assert.equal(runtime.status('finalize').stage,'intake-finalized');assert.deepEqual(await fs.readdir(path.join(root,result.directory)),['媒体校验.json','封面.png','笔记信息.md','视频.mp4','转写']);assert.deepEqual(await fs.readdir(path.join(root,result.directory,'转写','校正版逐字稿')),['123.md','123.srt']);assert.match(await fs.readFile(path.join(root,result.subtitlePath),'utf8'),/00:00:00,000 --> 00:00:02,000/);assert.ok(await fs.stat(path.join(root,result.intermediateArchive)));await assert.rejects(runtime.saveDataset('finalize',payload()),{code:'INTAKE_FINALIZED'});
});
