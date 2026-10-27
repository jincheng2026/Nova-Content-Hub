import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as radar from '../radar.mjs';
import {collectRadar} from '../radar-collector.mjs';
const source=new URL('../../../../../docs/verification/2026-10-27-live-services/tikhub-all-after-recharge/',import.meta.url);
const read=async name=>JSON.parse(await fs.readFile(new URL(`${name}.fixture.json`,source),'utf8'));
const at='2026-10-27T07:14:30.000Z';
const query={platform:'抖音',platforms:['抖音','小红书'],direction:'人工智能',sampleLimit:2,maxFollowers:1000000,minLikes:0,minRatio:0,lookbackDays:3650};
test('shared policy freezes both supported platforms, global sample shares and one request budget',()=>{
 assert.deepEqual(radar.radarQueryOperations(query),['douyin-search','profile','xhs-search','xhs-profile']);
 assert.equal(radar.radarRequestLimit(query,100),4);assert.equal(radar.radarRequestLimit(query,2),2);
 assert.equal(radar.radarRequestLimit({...query,platforms:['小红书'],platform:'小红书',sampleLimit:1},10),2);
 assert.equal(radar.radarRequestLimit({...query,platform:'YouTube',platforms:['YouTube']},10),0);
 assert.equal(radar.radarPlatformSampleLimit(query,'抖音'),1);assert.equal(radar.radarPlatformSampleLimit(query,'小红书'),1);
 const three={...query,sampleLimit:3};assert.equal(radar.radarPlatformSampleLimit(three,'抖音'),2);assert.equal(radar.radarPlatformSampleLimit(three,'小红书'),1);
 assert.equal(radar.radarPlatformSampleLimit(query,'抖音',['douyin-search','profile']),2,'legacy frozen operations do not acquire XHS scope');
 assert.equal(radar.radarRequestLimit({...query,sampleLimit:1},100),2,'a zero-share platform must not inflate the search budget');
});
test('zero-share platforms are not queried and unknown cost stops all later operations',async()=>{
 const dy=await read('douyin-search'),calls=[];const one=await collectRadar({query:{...query,sampleLimit:1},identity:{},descriptorPath:'/unused',maxRequests:1},async(_d,r)=>{calls.push(r.operation);return{data:dy,requestsUsed:1,cacheHit:false,collectedAt:at};});
 assert.deepEqual(calls,['douyin-search']);assert.deepEqual(one.collection.unsearchedReasons,[{platform:'小红书',reason:'SAMPLE_LIMIT'}]);assert.equal(one.candidates.length,1);
 const failing=[];const partial=await collectRadar({query,identity:{},descriptorPath:'/unused',maxRequests:4},async(_d,r)=>{failing.push(r.operation);if(r.operation==='xhs-search')throw Object.assign(Error('unknown cost'),{code:'COST_UNKNOWN'});return{data:dy,requestsUsed:1,cacheHit:false,collectedAt:at};});
 assert.deepEqual(failing,['douyin-search','xhs-search']);assert.equal(partial.collection.stoppedReason,'COST_UNKNOWN');assert.equal(partial.collection.unknownRequests,1);assert.equal(partial.collection.partial,true);
});
test('XHS actual-response structure preserves source, numeric metrics and missing fields',async()=>{
 const raw=await read('xhs-search'),profile=await read('xhs-profile'),note=raw.data.data.items[0].note;
 const normalized=radar.normalizeXhsRadar(raw,query,at,{[note.user.userid]:radar.xhsProfileFollowers(profile)});
 assert.equal(normalized.length,1);const candidate=normalized[0];
 assert.equal(candidate.sourceKey,`xiaohongshu:${note.id}`);assert.equal(candidate.url,`https://www.xiaohongshu.com/explore/${note.id}`);assert.equal(candidate.author.id,note.user.userid);
 assert.equal(candidate.author.followers,profile.data.data.fans);assert.equal(candidate.metrics.likes,note.liked_count);assert.equal(candidate.metrics.saves,note.collected_count);assert.equal(candidate.metrics.comments,note.comments_count);assert.equal(candidate.metrics.shares,note.shared_count);assert.equal(candidate.metrics.views,null);
 assert.equal(candidate.publishedAt,new Date(note.timestamp*1000).toISOString());
 const missing=structuredClone(raw);const n=missing.data.data.items[0].note;delete n.timestamp;delete n.liked_count;
 const unknown=radar.normalizeXhsRadar(missing,query,at)[0];assert.equal(unknown.author.followers,null);assert.equal(unknown.publishedAt,null);assert.equal(unknown.metrics.likes,null);assert.equal(unknown.eligibility,'unknown');
 n.id='';assert.equal(radar.normalizeXhsRadar(missing,query,at).length,1,'invalid first source is discarded before applying the shared per-platform sample quota');
});
test('two-request collection searches both platforms before profiles with real redacted response structures',async()=>{
 const dy=await read('douyin-search'),xhs=await read('xhs-search'),calls=[];
 const result=await collectRadar({query,identity:{},descriptorPath:'/unused',maxRequests:2},async(_descriptor,request)=>{calls.push(request);assert(['douyin-search','xhs-search'].includes(request.operation));return{data:request.operation==='douyin-search'?dy:xhs,requestsUsed:1,cacheHit:false,collectedAt:at};});
 assert.deepEqual(calls.map(x=>x.operation),['douyin-search','xhs-search']);assert.equal(result.collection.requests,2);assert.equal(result.candidates.length,2);assert.deepEqual(result.candidates.map(x=>x.platform),['抖音','小红书']);assert.deepEqual(result.collection.manualPlatforms,[]);assert(result.candidates.every(x=>x.author.followers===null||typeof x.author.followers==='number'));
 assert(result.candidates.find(x=>x.platform==='小红书').author.followers===null);assert.equal(result.collection.partial,true);assert(result.collection.unverifiedAuthors.length>0);
});
test('cache hits do not consume external request allowance and legacy scope is not expanded',async()=>{
 const dy=await read('douyin-search'),xhs=await read('xhs-search'),profile=await read('xhs-profile'),calls=[];
 const result=await collectRadar({query,identity:{},descriptorPath:'/unused',maxRequests:2},async(_d,r)=>{calls.push(r.operation);return{data:r.operation==='douyin-search'?dy:r.operation==='xhs-search'?xhs:profile,requestsUsed:r.operation==='douyin-search'?0:1,cacheHit:r.operation==='douyin-search',collectedAt:at};});
 assert.equal(result.collection.requests,2);assert.equal(result.collection.cacheHits,1);assert(calls.includes('xhs-search'));
 const legacyCalls=[];const legacy=await collectRadar({query,allowedOperations:['douyin-search','profile'],identity:{},descriptorPath:'/unused',maxRequests:2},async(_d,r)=>{legacyCalls.push(r.operation);return{data:r.operation==='douyin-search'?dy:{data:{user:{follower_count:20}}},requestsUsed:1,cacheHit:false,collectedAt:at};});
 assert(!legacyCalls.includes('xhs-search'));assert(legacy.collection.unsearchedPlatforms.includes('小红书'));
});
