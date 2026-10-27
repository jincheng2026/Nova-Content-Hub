/** One-page helper executed by the claimed external assistant, never a hidden task host. */
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {callServiceTool} from '../service-tools/client.mjs';
import {validRadarQuery,radarOperations,radarQueryOperations,radarPlatforms,radarAutomaticPlatforms,radarPlatformSampleLimit,radarSearchOperation,radarProfileOperation,radarSearchFilters,radarPlatform,radarSampleRows,radarRowAuthor,douyinProfileFollowers,xhsProfileFollowers,normalizeDouyinRadar,normalizeXhsRadar} from './radar.mjs';
export async function collectRadar({query,identity,descriptorPath,maxRequests=4,allowedOperations},call=callServiceTool){
 if(!validRadarQuery(query)||!radarQueryOperations(query).length)throw Object.assign(new Error('This platform requires manual source evidence'),{code:'RADAR_MANUAL_ONLY'});
 if(!Number.isInteger(maxRequests)||maxRequests<1||maxRequests>4)throw Object.assign(new Error('Bounded radar budget required'),{code:'INVALID_INPUT'});
 if(allowedOperations!==undefined&&(!Array.isArray(allowedOperations)||allowedOperations.some(operation=>!radarQueryOperations(query).includes(operation))))throw Object.assign(new Error('Frozen radar operations required'),{code:'INVALID_INPUT'});
 const permitted=allowedOperations??radarQueryOperations(query),automatic=radarAutomaticPlatforms(query,permitted);
 if(!automatic.length)throw Object.assign(new Error('This frozen task permits manual evidence only'),{code:'RADAR_MANUAL_ONLY'});
 const manualPlatforms=radarPlatforms(query).filter(platform=>!radarOperations(platform).length);
 let requests=0,cacheHits=0,stoppedReason=null;const calls=[],sources=[],profiles={};
 const execute=async(operation,id,extra={})=>{if(requests>=maxRequests)throw Object.assign(new Error('Radar request budget exhausted'),{code:'BUDGET_EXCEEDED'});const requestId=randomUUID(),entry={requestId,operation,id,requestsUsed:null,cacheHit:false,collectedAt:null};calls.push(entry);try{const result=await call(descriptorPath,{...identity,requestId,tool:'tikhub',operation,id,...extra});if(![0,1].includes(result.requestsUsed))throw Object.assign(new Error('Unknown request usage'),{code:'COST_UNKNOWN'});Object.assign(entry,{requestsUsed:result.requestsUsed,cacheHit:result.cacheHit,collectedAt:result.collectedAt});requests+=result.requestsUsed;if(result.cacheHit)cacheHits++;return result;}catch(error){entry.errorCode=/^[A-Z_]{1,80}$/.test(error?.code)?error.code:'SERVICE_FAILED';if(['BUDGET_EXCEEDED','BUDGET_DISABLED','RADAR_OPERATION_FORBIDDEN','CLAIM_MISMATCH','INVALID_BUDGET','RADAR_SAMPLE_LIMIT'].includes(entry.errorCode))entry.requestsUsed=0;throw error;}};
 // Every affordable selected-platform search comes before any optional profile request.
 for(const platform of automatic){
  if(!radarPlatformSampleLimit(query,platform,permitted))continue;
  if(requests>=maxRequests){stoppedReason='BUDGET_EXCEEDED';break;}
  try{sources.push({platform,result:await execute(radarSearchOperation(platform),query.direction,{search:radarSearchFilters(query)})});}
  catch(error){if(!sources.length)throw error;stoppedReason=/^[A-Z_]{1,80}$/.test(error?.code)?error.code:'SERVICE_FAILED';break;}
 }
 if(!stoppedReason)outer:for(const source of sources){
  const platformKey=radarPlatform(source.platform),operation=radarProfileOperation(source.platform),values=profiles[platformKey]??=Object.create(null);
  for(const row of radarSampleRows(source.result.data,query,source.platform,permitted)){
   const author=radarRowAuthor(row,source.platform);if(author.followers!==null||!author.id||Object.hasOwn(values,author.id)||!permitted.includes(operation))continue;
   if(requests>=maxRequests)break outer;
   try{const response=await execute(operation,author.id);values[author.id]=platformKey==='douyin'?douyinProfileFollowers(response.data):xhsProfileFollowers(response.data);}
   catch(error){stoppedReason=/^[A-Z_]{1,80}$/.test(error?.code)?error.code:'SERVICE_FAILED';break outer;}
  }
 }
 const collectedAt=sources.map(source=>source.result.collectedAt).sort().at(-1),candidates=sources.flatMap(source=>radarPlatform(source.platform)==='douyin'?normalizeDouyinRadar(source.result.data,query,collectedAt,profiles.douyin,permitted):normalizeXhsRadar(source.result.data,query,collectedAt,profiles.xiaohongshu,permitted));
 const unsearchedPlatforms=radarAutomaticPlatforms(query).filter(platform=>!sources.some(source=>radarPlatform(source.platform)===radarPlatform(platform))),unverifiedAuthors=candidates.filter(candidate=>candidate.author.followers===null).map(candidate=>({platform:candidate.platform,authorId:candidate.author.id,sourceId:candidate.sourceId}));
 const unsearchedReasons=unsearchedPlatforms.map(platform=>({platform,reason:!permitted.includes(radarSearchOperation(platform))?'FROZEN_OPERATIONS':!radarPlatformSampleLimit(query,platform,permitted)?'SAMPLE_LIMIT':stoppedReason??'BUDGET_EXCEEDED'}));
 return {schemaVersion:1,query,collectedAt,candidates,collection:{requests,unknownRequests:calls.filter(c=>c.requestsUsed===null).length,cacheHits,calls,onePage:true,manualPlatforms,unsearchedPlatforms,unsearchedReasons,unverifiedAuthors,stoppedReason,partial:manualPlatforms.length>0||unsearchedPlatforms.length>0||unverifiedAuthors.length>0||stoppedReason!==null||candidates.some(candidate=>candidate.reasons.some(reason=>reason.includes('未知')))}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){let text='';for await(const part of process.stdin){text+=part;if(text.length>32768)throw new Error('INPUT_TOO_LARGE');}collectRadar(JSON.parse(text)).then(result=>process.stdout.write(JSON.stringify({ok:true,result})+'\n')).catch(error=>{process.stderr.write(JSON.stringify({ok:false,code:error.code??'RADAR_FAILED'})+'\n');process.exitCode=1;});}
