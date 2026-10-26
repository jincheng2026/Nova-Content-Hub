/** One-page helper executed by the claimed external assistant, never a hidden task host. */
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {callServiceTool} from '../service-tools/client.mjs';
import {validRadarQuery,radarOperations,radarSearchFilters,douyinRows,douyinProfileFollowers,normalizeDouyinRadar} from './radar.mjs';
export async function collectRadar({query,identity,descriptorPath,maxRequests=4},call=callServiceTool){
 if(!validRadarQuery(query)||!radarOperations(query.platform).length)throw Object.assign(new Error('This platform requires manual source evidence'),{code:'RADAR_MANUAL_ONLY'});
 if(!Number.isInteger(maxRequests)||maxRequests<1||maxRequests>4)throw Object.assign(new Error('Bounded radar budget required'),{code:'INVALID_INPUT'});
 let requests=0,cacheHits=0,stoppedReason=null;const calls=[];
 const execute=async(operation,id,extra={})=>{if(calls.length>=maxRequests)throw Object.assign(new Error('Radar request budget exhausted'),{code:'BUDGET_EXCEEDED'});const requestId=randomUUID(),entry={requestId,operation,id,requestsUsed:null,cacheHit:false,collectedAt:null};calls.push(entry);try{const result=await call(descriptorPath,{...identity,requestId,tool:'tikhub',operation,id,...extra});Object.assign(entry,{requestsUsed:result.requestsUsed,cacheHit:result.cacheHit,collectedAt:result.collectedAt});requests+=result.requestsUsed??0;if(result.cacheHit)cacheHits++;return result;}catch(error){entry.errorCode=/^[A-Z_]{1,80}$/.test(error?.code)?error.code:'SERVICE_FAILED';throw error;}};
 const result=await execute('douyin-search',query.direction,{search:radarSearchFilters(query)}),profiles={};
 for(const row of douyinRows(result.data).slice(0,query.sampleLimit)){
  const a=row.author??{},id=a.sec_uid;if(a.follower_count!==undefined&&a.follower_count!==null&&a.follower_count!==''&&Number.isFinite(Number(a.follower_count))&&Number(a.follower_count)>=0||typeof id!=='string'||!id||Object.hasOwn(profiles,id)||calls.length>=maxRequests)continue;
  try{profiles[id]=douyinProfileFollowers((await execute('profile',id)).data);}catch(error){stoppedReason=/^[A-Z_]{1,80}$/.test(error?.code)?error.code:'SERVICE_FAILED';break;}
 }
 return {schemaVersion:1,query,collectedAt:result.collectedAt,candidates:normalizeDouyinRadar(result.data,query,result.collectedAt,profiles),collection:{requests,unknownRequests:calls.filter(c=>c.requestsUsed===null).length,cacheHits,calls,onePage:true,stoppedReason,partial:stoppedReason!==null||calls.length>=maxRequests}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){let text='';for await(const part of process.stdin){text+=part;if(text.length>32768)throw new Error('INPUT_TOO_LARGE');}collectRadar(JSON.parse(text)).then(result=>process.stdout.write(JSON.stringify({ok:true,result})+'\n')).catch(error=>{process.stderr.write(JSON.stringify({ok:false,code:error.code??'RADAR_FAILED'})+'\n');process.exitCode=1;});}
