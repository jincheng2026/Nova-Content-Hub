import {fail,object,number,hash} from './common.mjs';
/** Node port of upstream/current/scripts/validate_transcript_ready.py. No timing is invented. */
export function validateTranscript({manifest,correctedText,segments=[],mediaSha256,mediaDurationSeconds},requirement='text'){
 const bad=message=>fail('TRANSCRIPT_NOT_READY',message);
 if(!['text','timing'].includes(requirement))fail('INVALID_INPUT');
 if(!object(manifest)||manifest.status!=='corrected_validated')bad('逐字稿尚未完成校正复核。');
 if(typeof correctedText!=='string'||correctedText.length>4*1024*1024)bad('缺少校正版逐字稿。');
 const body=correctedText.split(/\r?\n/).filter(l=>l.trim()&&!l.trimStart().startsWith('#')).join('\n').trim();
 if(!body||/^[\s\[\]【】]*待(?:人工)?(?:校正|复核|确认)[。\s\[\]【】]*$/.test(body))bad('校正版为空或仍是占位内容。');
 if(!Array.isArray(segments)||segments.length>100000)bad('分段无效。');
 if(!segments.length&&manifest.evidence_kind!=='reviewed_text')bad('缺少分段；只有明确的 reviewed_text 材料可仅按文字分析。');
 if(manifest.segment_count!==undefined&&manifest.segment_count!==segments.length)bad('分段数量与 manifest 不一致。');
 let duration=manifest.duration_seconds;
 if(duration!==undefined&&duration!==null&&(!number(duration)||!duration))bad('媒体时长无效。');
 if(mediaSha256){if(!/^[a-f0-9]{64}$/.test(mediaSha256)||mediaSha256!==(manifest.source_sha256??manifest.sha256))bad('媒体 SHA-256 与 manifest 不一致。');}
 if(mediaDurationSeconds!==undefined){if(!number(mediaDurationSeconds)||!mediaDurationSeconds||duration!=null&&Math.abs(duration-mediaDurationSeconds)>.5)bad('媒体实际时长与 manifest 不一致。');duration=mediaDurationSeconds;}
 const gaps=[];let end=0;
 for(const [i,s]of segments.entries()){
  if(!object(s)||typeof s.text!=='string'||!number(s.start_seconds)||!number(s.end_seconds)||s.end_seconds<=s.start_seconds||s.start_seconds<end-.05||duration!=null&&s.end_seconds>duration+.5)bad(`第 ${i+1} 段时间范围无效、重叠、乱序或超过媒体时长。`);
  if(s.start_seconds>end+.5)gaps.push([end,s.start_seconds]);end=s.end_seconds;
 }
 if(duration!=null&&end<duration-.5)gaps.push([end,duration]);
 const coverage=segments.length>0&&duration!=null&&!gaps.length,precision=manifest.time_precision??(segments.length?'block':'unknown'),precise=coverage&&['sentence','word'].includes(precision)&&manifest.alignment_reviewed===true;
 const uncertainty=[...correctedText.matchAll(/【[^】]*(?:待确认|疑似|听不清|待复核)[^】]*】|\[待确认[^\]]*\]/g)].map(m=>({start:m.index,end:m.index+m[0].length,text:m[0]})),limitations=[];
 if(!segments.length)limitations.push('仅有已复核文字，缺少时间轴');if(duration==null)limitations.push('媒体时长未知，覆盖率未验证');if(gaps.length)limitations.push('时间轴存在缺口');if(!precise)limitations.push('没有已复核的句子或词级对齐，不能作精确时间结论');if(uncertainty.length)limitations.push('局部疑问需按范围限制对应判断');
 if(requirement==='timing'&&!precise)bad(limitations.join('；'));
 return{status:'ready',schema_version:2,manifest_status:manifest.status,capabilities:{text_structure:true,block_timing:coverage,precise_timing:precise},time_precision:precision,duration_seconds:duration??null,segment_count:segments.length,coverage_gaps:gaps,corrected_characters:correctedText.length,uncertainties:uncertainty,limitations,media_verified:!!mediaSha256&&mediaDurationSeconds!==undefined};
}
export function normalizeAsrResult(result){
 const d=result?.data;if(!object(d)||typeof d.text!=='string'||!d.text.trim())fail('INVALID_LOCAL_RESPONSE','本地识别没有可用正文；保留失败，不能当已完成转写。');
 const segments=Array.isArray(d.segments)?d.segments.map(s=>({start_seconds:number(s.startMs)?s.startMs/1000:s.start_seconds,end_seconds:number(s.endMs)?s.endMs/1000:s.end_seconds,text:s.text})):[];
 if(segments.some(s=>!number(s.start_seconds)||!number(s.end_seconds)||s.end_seconds<=s.start_seconds||typeof s.text!=='string'))fail('INVALID_LOCAL_RESPONSE','本地识别时间段无效。');
 return{manifest:{schema_version:2,status:'raw_transcribed',evidence_kind:'audio',segment_count:segments.length,duration_seconds:number(d.durationMs)&&d.durationMs>0?d.durationMs/1000:null,time_precision:segments.length?'block':'unknown',alignment_reviewed:false,raw_sha256:hash(d.text)},rawText:d.text,segments};
}
export function subtitles(segments){const time=s=>{const n=Math.round(s*1000);return`${String(Math.floor(n/3600000)).padStart(2,'0')}:${String(Math.floor(n/60000)%60).padStart(2,'0')}:${String(Math.floor(n/1000)%60).padStart(2,'0')},${String(n%1000).padStart(3,'0')}`;};return segments.map((s,i)=>`${i+1}\n${time(s.start_seconds)} --> ${time(s.end_seconds)}\n${s.text}\n`).join('\n');}
