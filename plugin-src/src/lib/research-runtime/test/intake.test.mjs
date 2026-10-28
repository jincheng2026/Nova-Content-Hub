import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createResearchRuntime} from '../index.mjs';
import {nativeProof,cover} from './fixtures/intake-native.mjs';
const body='这是校正的句子。下一句继续讲。';
async function fixture(t,ids=['123','456'],researchId='batch',titles={'123':'第一条','456':'第二条'}){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'nova-intake-items-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const bytes=id=>Buffer.from(`0000ftyp00000000synthetic registered media ${id}`),hash=id=>createHash('sha256').update(bytes(id)).digest('hex');
 const runtime=createResearchRuntime({vaultRoot:root,fetchMedia:async({videoId})=>({source:{videoId,platform:'douyin',title:titles[videoId]??'登记标题'},data:{assetHash:hash(videoId),videoId,canonicalUrl:`https://www.douyin.com/video/${videoId}`}}),readMedia:async({videoId})=>({data:bytes(videoId),extension:'.mp4',proof:nativeProof(bytes(videoId)),coverBytes:cover}),executeService:async()=>({data:{text:body,durationMs:4000,segments:[{startMs:0,endMs:2000,text:'这是校正的句子。'},{startMs:2000,endMs:4000,text:'下一句继续讲。'}]}})});
 const config={version:1,researchId,outputDirectory:`02_内容素材/research-${researchId}`,route:'intake',platform:'douyin',targetIds:['author'],operations:['video'],maxRequests:1,comments:false,videoIds:ids};
 await runtime.prepare(config);
 const ready=async(id)=>{await runtime.download(researchId,id);await runtime.transcribe(researchId,id);await runtime.correct(researchId,id,{correctedText:body,corrections:[],reviewedBy:'作者'});};
 return {root,runtime,config,ready,bytes,hash};
}
test('each authorized video finalizes separately after two downloads without losing pending evidence',async t=>{
 const f=await fixture(t);await f.ready('123');await f.ready('456');
 const first=await f.runtime.finalizeIntake('batch',{videoId:'123',title:'第一条',platform:'抖音'});
 assert.equal(first.directory,'02_内容素材/未参考/抖音/抖音_第一条_123');
 assert.equal(f.runtime.status('batch').stage,'intake-partial');
 assert.deepEqual(first.pendingMediaIds,['456']);
 await assert.rejects(f.runtime.correct('batch','123',{correctedText:body,corrections:[],reviewedBy:'作者'}),{code:'INTAKE_FINALIZED'});
 assert.equal(await fs.readFile(path.join(f.root,f.runtime.status('batch').transcripts[1].directory,'raw/transcript.txt'),'utf8'),body);
 const second=await f.runtime.finalizeIntake('batch',{mediaId:'456',title:'第二条',platform:'douyin'});
 assert.equal(second.directory,'02_内容素材/未参考/抖音/抖音_第二条_456');
 assert.equal(f.runtime.status('batch').stage,'intake-finalized');
 assert.deepEqual(await f.runtime.finalizeIntake('batch',{videoId:'123',title:'第一条',platform:'抖音'}),first);
 assert.deepEqual(await fs.readFile(path.join(f.root,first.originalPath)),f.bytes('123'));
 assert.deepEqual(await fs.readFile(path.join(f.root,second.originalPath)),f.bytes('456'));
});
test('intake preserves copied source exactly and appends separate check results',async t=>{
 const f=await fixture(t,['123'],'batch',{'123':'标题/含:字符'});await f.ready('123');
 const sourceText='  原文第一行\n第二行：# 原样 | 表格\n';
 const result=await f.runtime.finalizeIntake('batch',{videoId:'123',title:'标题/含:字符',platform:'抖音',sourceText,description:'原作品描述全文',shareUrl:'https://www.douyin.com/video/123/?tracking=one#fragment',pageData:'点赞 42（页面原文）'});
 const note=await fs.readFile(path.join(f.root,result.notePath),'utf8');
 assert.ok(note.includes('## 原始复制内容\n\n'+sourceText));assert.ok(note.includes('原作品描述全文'));assert.ok(note.includes('点赞 42（页面原文）'));assert.ok(note.includes(body));
 assert.equal(result.directory,'02_内容素材/未参考/抖音/抖音_标题_含_字符_123');
 assert.equal(result.reportPath,'02_内容素材/_入库检查报告.md');
 const report=await fs.readFile(path.join(f.root,result.reportPath),'utf8');assert.ok(report.includes(result.directory));assert.match(report,/字幕.*2/);assert.match(report,/严格验收.*通过/);
});
for(const layer of ['work-id','canonical-url','media-sha256'])test(`cross-task ${layer} duplicate returns the existing folder without new media`,async t=>{
 const f=await fixture(t,['123']);await f.ready('123');
 const existing='02_内容素材/已参考/抖音/原有作品';await fs.mkdir(path.join(f.root,existing),{recursive:true});
 const note=layer==='work-id'?'# 已有\n| 平台 | 抖音 |\n| 作品ID | 123 |\n':layer==='canonical-url'?'# 已有\n| 平台 | 抖音 |\n| 作品链接 | https://www.douyin.com/video/123/?old=1#x |\n':`# 已有\n| 平台 | 小红书 |\n| SHA-256 | ${f.hash('123')} |\n`;
 await fs.writeFile(path.join(f.root,existing,'笔记信息.md'),note);
 const result=await f.runtime.finalizeIntake('batch',{videoId:'123',title:'新标题',platform:'抖音'});
 assert.equal(result.dedup.layer,layer);assert.equal(result.directory,existing);assert.equal(result.status,'duplicate');
 await assert.rejects(fs.stat(path.join(f.root,'02_内容素材/未参考/抖音/抖音_新标题_123')),{code:'ENOENT'});
 assert.equal(await fs.readFile(path.join(f.root,existing,'笔记信息.md'),'utf8'),note);
});
test('publication interruption after media archival retries without losing evidence or duplicating the report',async t=>{
 const f=await fixture(t,['123'],'batch',{'123':'可恢复素材'});await f.ready('123');
 await fs.mkdir(path.join(f.root,'02_内容素材/_入库检查报告.md'));
 await assert.rejects(f.runtime.finalizeIntake('batch',{videoId:'123',title:'可恢复素材',platform:'抖音'}));
 await fs.rmdir(path.join(f.root,'02_内容素材/_入库检查报告.md'));
 const result=await f.runtime.finalizeIntake('batch',{videoId:'123',title:'可恢复素材',platform:'抖音'});
 assert.deepEqual(await fs.readFile(path.join(f.root,result.originalPath)),f.bytes('123'));
 const report=await fs.readFile(path.join(f.root,result.reportPath),'utf8');assert.equal(report.split('<!-- intake:batch:123 -->').length,2);
});
test('registered provider metadata rejects mismatched caller titles and preserves the original destination',async t=>{
 const f=await fixture(t,['123']);await f.ready('123');
 const stateFile=path.join(f.root,f.config.outputDirectory,'research-runtime.json');const state=JSON.parse(await fs.readFile(stateFile,'utf8'));
 state.media[0].source={videoId:'123',platform:'douyin',title:'真实标题',description:'真实描述'};await fs.writeFile(stateFile,JSON.stringify(state));
 await assert.rejects(f.runtime.finalizeIntake('batch',{videoId:'123',title:'伪造标题',platform:'抖音'}),{code:'INTAKE_SOURCE_MISMATCH'});
 const result=await f.runtime.finalizeIntake('batch',{videoId:'123',title:'真实标题',platform:'抖音'});assert.equal(result.directory,'02_内容素材/未参考/抖音/抖音_真实标题_123');assert.equal(result.sourceProvenance,'registered-provider-metadata');
});
test('untrusted intake inputs cannot persist credentials, arbitrary paths or unsupported platforms',async t=>{
 const f=await fixture(t,['123']);await f.ready('123');
 for(const extra of [{pageData:{headers:{Authorization:'Bearer private'}}},{pageData:{nested:{access_token:'private'}}},{sourceText:'api_key=private-credential'},{directory:'../../elsewhere'},{platform:'小红书'},{mediaId:'456'}])await assert.rejects(f.runtime.finalizeIntake('batch',{videoId:'123',title:'合法标题',platform:'抖音',...extra}),{code:'INVALID_INPUT'});
 assert.equal(f.runtime.status('batch').stage,'transcript-reviewed');
});
test('separate intake tasks serialize publication and identify the first task on retry',async t=>{
 const f=await fixture(t,['123'],'batch',{'123':'并发素材'});await f.ready('123');
 const second=createResearchRuntime({vaultRoot:f.root,fetchMedia:async()=>({source:{videoId:'123',platform:'douyin',title:'并发素材'},data:{assetHash:f.hash('123'),videoId:'123',canonicalUrl:'https://www.douyin.com/video/123'}}),readMedia:async()=>({data:f.bytes('123'),extension:'.mp4',proof:nativeProof(f.bytes('123')),coverBytes:cover}),executeService:async()=>({data:{text:body,durationMs:4000,segments:[{startMs:0,endMs:2000,text:'这是校正的句子。'},{startMs:2000,endMs:4000,text:'下一句继续讲。'}]}})});
 await second.prepare({...f.config,researchId:'other',outputDirectory:'02_内容素材/research-other'});await second.download('other','123');await second.transcribe('other','123');await second.correct('other','123',{correctedText:body,corrections:[],reviewedBy:'作者'});
 const input={videoId:'123',title:'并发素材',platform:'抖音'},results=await Promise.allSettled([f.runtime.finalizeIntake('batch',input),second.finalizeIntake('other',input)]);
 assert.equal(results[0].status,'fulfilled');assert.equal(results[1].status,'rejected');assert.equal(results[1].reason.code,'RESEARCH_BUSY');
 const duplicate=await second.finalizeIntake('other',input);assert.equal(duplicate.status,'duplicate');assert.equal(duplicate.directory,results[0].value.directory);
 const report=await fs.readFile(path.join(f.root,duplicate.reportPath),'utf8');assert.ok(report.includes('intake:batch:123'));assert.ok(report.includes('intake:other:123'));
});
test('known work identity is rejected before any new download or transcription request',async t=>{
 const f=await fixture(t,['123']);const directory='02_内容素材/未参考/抖音/已入库';await fs.mkdir(path.join(f.root,directory),{recursive:true});await fs.writeFile(path.join(f.root,directory,'笔记信息.md'),'# 已有\n| 平台 | 抖音 |\n| 作品 ID | 123 |\n');
 await assert.rejects(f.runtime.download('batch','123'),{code:'INTAKE_DUPLICATE'});assert.deepEqual(f.runtime.status('batch').media,[]);
 const result=await f.runtime.finalizeIntake('batch',{videoId:'123',title:'已选来源',platform:'抖音'});assert.equal(result.status,'duplicate');assert.equal(result.directory,directory);
});
test('legacy finalized single-item states return their existing receipt without rewriting files',async t=>{
 const f=await fixture(t,['123'],'batch',{'123':'旧素材'});await f.ready('123');const result=await f.runtime.finalizeIntake('batch',{videoId:'123',title:'旧素材',platform:'抖音'});
 const locator=JSON.parse(await fs.readFile(path.join(f.root,'.workbench/research-runtime/batch.json'),'utf8')),statePath=path.join(f.root,locator.path),state=JSON.parse(await fs.readFile(statePath,'utf8'));delete state.intakes;delete state.intakePlans;await fs.writeFile(statePath,JSON.stringify(state));
 assert.deepEqual(await f.runtime.finalizeIntake('batch',{videoId:'123',title:'旧素材',platform:'抖音'}),result);
});
test('tampered corrected subtitles cannot be published even when the saved validation says passed',async t=>{
 const f=await fixture(t,['123'],'batch',{'123':'待核验'});await f.ready('123');const entry=f.runtime.status('batch').transcripts[0];await fs.writeFile(path.join(f.root,entry.correctedDirectory,'transcript_corrected.srt'),'forged subtitle');
 await assert.rejects(f.runtime.finalizeIntake('batch',{videoId:'123',title:'待核验',platform:'抖音'}),{code:'CONFLICT'});
 await assert.rejects(fs.stat(path.join(f.root,'02_内容素材/未参考/抖音/抖音_待核验_123')),{code:'ENOENT'});
});
test('version 2 frozen intake requires registered source metadata while old fixed requests remain compatible',async t=>{
 const f=await fixture(t,['123']);await f.ready('123');
 const statePath=path.join(f.root,f.config.outputDirectory,'research-runtime.json'),state=JSON.parse(await fs.readFile(statePath,'utf8'));state.config.intakeContractVersion=2;delete state.media[0].source;await fs.writeFile(statePath,JSON.stringify(state));
 await assert.rejects(f.runtime.finalizeIntake('batch',{videoId:'123',title:'用户标题',platform:'抖音'}),{code:'INTAKE_SOURCE_REQUIRED'});
 assert.equal(f.runtime.status('batch').stage,'transcript-reviewed');state.media[0].source={videoId:'123',platform:'douyin',title:'真实登记标题'};await fs.writeFile(statePath,JSON.stringify(state));
 const result=await f.runtime.finalizeIntake('batch',{videoId:'123',title:'真实登记标题',platform:'抖音'});assert.equal(result.sourceProvenance,'registered-provider-metadata');
});
test('contract version 2 can be frozen only for intake and unsupported contract versions are rejected',async t=>{
 const f=await fixture(t,['123']);
 await f.runtime.prepare({...f.config,researchId:'v2',outputDirectory:'02_内容素材/research-v2',intakeContractVersion:2});assert.equal(f.runtime.status('v2').config.intakeContractVersion,2);
 for(const config of [{route:'account',intakeContractVersion:2},{intakeContractVersion:1},{intakeContractVersion:3}])await assert.rejects(f.runtime.prepare({...f.config,researchId:'invalid',outputDirectory:'02_内容素材/research-invalid',...config}),{code:'INVALID_INPUT'});
});
