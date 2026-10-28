import type {IntakeSource} from '../../../plugin-src/src/lib/research-runtime/index.mjs';
const record=(value:unknown):Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
/** Keep only public fields from an exact registered provider response. */
export function registeredIntakeSource(value:unknown,videoId:string):IntakeSource|null{
 const top=record(value),inner=record(top.data),detail=typeof top.videoId==='string'?top:record(inner.aweme_detail??top.aweme_detail??inner.aweme_details??inner);
 if(String(detail.videoId??detail.aweme_id??detail.id??'')!==videoId)return null;
 const description=typeof detail.description==='string'?detail.description.slice(0,256*1024):typeof detail.desc==='string'?detail.desc.slice(0,256*1024):'';
 const heading=description.split(/\r?\n/).find(line=>line.trim())?.trim()??videoId;
 let title='';for(const character of heading){if(Buffer.byteLength(title+character)>180)break;title+=character;}
 const author=record(detail.author),nickname=typeof author.nickname==='string'?author.nickname.slice(0,500):undefined;
 const stamp=typeof detail.create_time==='number'?detail.create_time:null;
 const publishedAt=stamp!==null&&Number.isFinite(stamp)&&stamp>=946684800&&stamp<4133980800?new Date(stamp*1000).toISOString():undefined;
 return {videoId,platform:'douyin',title,description,...(nickname?{author:nickname}:{}),...(publishedAt?{publishedAt}:{})};
}
