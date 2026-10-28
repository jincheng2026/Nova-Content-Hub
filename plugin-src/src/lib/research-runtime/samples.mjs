import {createHash} from 'node:crypto';
import {douyinRows} from '../file-library/radar.mjs';

const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const text=(value,max=500)=>typeof value==='string'?value.slice(0,max):'';
const fail=code=>{throw Object.assign(new Error(code),{code});};
/** Provider JSON digest also used by existing broker media receipts. Keep this
 * distinct from canonical dataset/manifest hashing. */
export function researchResponseDigest(response){const bytes=JSON.stringify(response);if(bytes===undefined)fail('UNSUPPORTED_NORMALIZATION');return createHash('sha256').update(bytes).digest('hex');}

export function deriveSearchSamples(response,limit){
 if(!Number.isInteger(limit)||limit<1||limit>3)fail('INVALID_INPUT');
 const data=object(response?.data)?response.data:response;
 if(!Array.isArray(data?.business_data))fail('UNSUPPORTED_NORMALIZATION');
 const allowed=new Set(data.business_data.filter(entry=>entry?.type===1&&!entry.is_ads&&!entry.data?.is_ads).map(entry=>entry.data?.aweme_info)),seen=new Set(),samples=[];
 for(const row of douyinRows(response)){
  const id=row.aweme_id;
  // Only the real video shape observed in the registered Douyin search envelope.
  // Image posts, advertisements, author identifiers and URLs never supply IDs.
  if(!allowed.has(row)||row.aweme_type!==0||row.is_ads||Array.isArray(row.images)&&row.images.length||!object(row.video)||!(Number.isFinite(row.video.duration)&&row.video.duration>0||object(row.video.play_addr))||typeof id!=='string'||!/^\d{1,32}$/.test(id)||seen.has(id))continue;
  seen.add(id);samples.push({videoId:id,title:text(row.desc),authorId:text(row.author?.uid,200),authorName:text(row.author?.nickname,200),canonicalUrl:`https://www.douyin.com/video/${id}`});
  if(samples.length===limit)break;
 }
 return samples;
}
