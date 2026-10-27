// A single browser/Node representation binds transcript tasks without copying raw text into parameters.
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const fields=(value,keys)=>object(value)&&Object.keys(value).every(key=>keys.includes(key));
const text=value=>typeof value==='string'&&value.length<=100000;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,hash=/^[a-f0-9]{64}$/;
const keys=['id','url','title','platform','originalText','correctedText','segments','corrections','analysis','mediaAssetHash','subtitleAssetHash'];
const url=value=>{try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password;}catch{return false;}};
export function serializeProductionReference(reference){
 const r=reference;
 if(!fields(r,keys)||!uuid.test(r.id)||(r.url!==null&&!url(r.url))||!['title','platform','originalText','correctedText','analysis'].every(key=>text(r[key]))||!['mediaAssetHash','subtitleAssetHash'].every(key=>r[key]===null||hash.test(r[key]))||!Array.isArray(r.segments)||r.segments.length>10000||!r.segments.every(s=>fields(s,['startMs','endMs','text'])&&Number.isFinite(s.startMs)&&s.startMs>=0&&Number.isFinite(s.endMs)&&s.endMs>=s.startMs&&text(s.text))||!Array.isArray(r.corrections)||r.corrections.length>10000||!r.corrections.every(c=>fields(c,['original','corrected','reason'])&&['original','corrected','reason'].every(key=>text(c[key]))))fail('INVALID_INPUT','参考结构不完整，请保存后重新读取。');
 return JSON.stringify(Object.fromEntries(keys.map(key=>[key,key==='segments'?r.segments.map(({startMs,endMs,text})=>({startMs,endMs,text})):key==='corrections'?r.corrections.map(({original,corrected,reason})=>({original,corrected,reason})):r[key]])));
}
export async function productionReferenceHash(reference){
 const bytes=new TextEncoder().encode(serializeProductionReference(reference));
 if(!globalThis.crypto?.subtle)fail('NOT_READY','当前环境无法核验参考版本。');
 return [...new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',bytes))].map(value=>value.toString(16).padStart(2,'0')).join('');
}
export function validateTranscriptReference(reference,intent,missingAssetHashes=[]){
 serializeProductionReference(reference);
 if(!['extract','correct','reextract'].includes(intent)||!Array.isArray(missingAssetHashes)||missingAssetHashes.some(value=>!hash.test(value)))fail('INVALID_INPUT','转写意图或资产状态无效。');
 if(intent==='correct'){if(!reference.originalText.trim())fail('INVALID_INPUT','没有原始逐字稿，请先提取或粘贴原文。');return;}
 if(intent==='extract'&&(reference.originalText.trim()||reference.segments.length||reference.correctedText.trim()||reference.corrections.length))fail('INVALID_INPUT','已有逐字稿；重新提取需明确确认。');
 if(![reference.mediaAssetHash,reference.subtitleAssetHash].some(value=>value!==null&&!missingAssetHashes.includes(value)))fail('INVALID_INPUT','没有可用的音视频或字幕资产，不能提取逐字稿。');
}
