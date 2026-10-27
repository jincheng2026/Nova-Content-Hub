/** Pure policy shared by renderer, collector and broker. Catalog presence grants no operation. */
export const radarPlatforms=query=>query.platforms??[query.platform];
export const radarPlatform=platform=>['抖音','douyin'].includes(platform.trim().toLowerCase())?'douyin':['小红书','xiaohongshu','rednote'].includes(platform.trim().toLowerCase())?'xiaohongshu':platform.trim().toLowerCase();
export function radarOperations(platform){const name=radarPlatform(platform);return name==='douyin'?['douyin-search','profile']:name==='xiaohongshu'?['xhs-search','xhs-profile']:[];}
export const radarSearchOperation=platform=>radarOperations(platform)[0]??null;
export const radarProfileOperation=platform=>radarOperations(platform)[1]??null;
export const radarQueryOperations=query=>[...new Set(radarPlatforms(query).flatMap(radarOperations))];
export const radarAutomaticPlatforms=(query,allowedOperations)=>radarPlatforms(query).filter(platform=>{const search=radarSearchOperation(platform);return search&&(!allowedOperations||allowedOperations.includes(search));});
export function radarPlatformSampleLimit(query,platform,allowedOperations){const platforms=radarAutomaticPlatforms(query,allowedOperations),index=platforms.findIndex(value=>radarPlatform(value)===radarPlatform(platform)),limit=query.sampleLimit;if(index<0||!Number.isInteger(limit)||limit<1||limit>100)return 0;return Math.floor(limit/platforms.length)+(index<limit%platforms.length?1:0);}
export const radarPlannedPlatforms=(query,allowedOperations)=>radarAutomaticPlatforms(query,allowedOperations).filter(platform=>radarPlatformSampleLimit(query,platform,allowedOperations)>0);
export function radarRequestLimit(query,currentMax=4){const searches=radarPlannedPlatforms(query).length;if(!searches||!Number.isInteger(query.sampleLimit)||query.sampleLimit<1||query.sampleLimit>100||!Number.isInteger(currentMax)||currentMax<1)return 0;return Math.min(4,searches+query.sampleLimit,currentMax);}
