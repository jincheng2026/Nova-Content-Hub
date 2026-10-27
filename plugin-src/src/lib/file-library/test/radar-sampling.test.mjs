import test from 'node:test';
import assert from 'node:assert/strict';
import {radarSampleRows,radarMissingAuthorIds,normalizeXhsRadar} from '../radar.mjs';
import {radarLatestEntries} from '../radar-policy.mjs';
import {collectRadar} from '../radar-collector.mjs';

const at='2026-10-27T00:00:00.000Z',oldAt='2026-10-20T00:00:00.000Z';
const query={platform:'抖音',direction:'测试',sampleLimit:2,maxFollowers:1000,minLikes:100,minRatio:1,lookbackDays:7};
const seconds=value=>Date.parse(value)/1000;
const dy=(id,patch={})=>({aweme_id:id,author:{sec_uid:`author-${id}`},statistics:{digg_count:200},create_time:seconds('2026-10-26T00:00:00.000Z'),...patch});
const rawDy=rows=>({data:{business_data:rows.map(row=>({data:{aweme_info:row}}))}});

test('known failures in the returned pool cannot consume final sample or author allowance',()=>{
 const raw=rawDy([
  dy('1',{statistics:{digg_count:99}}),
  dy('2',{author:{sec_uid:'too-many',follower_count:1001}}),
  dy('3',{author:{sec_uid:'low-ratio',follower_count:500}}),
  dy('4',{create_time:seconds('2026-10-01T00:00:00.000Z')}),
  dy('5',{create_time:seconds('2026-10-28T00:00:00.000Z')}),
  dy('6'),dy('6'),dy('7'),dy('8')
 ]);
 assert.deepEqual(radarSampleRows(raw,query,'抖音',undefined,at).map(row=>row.aweme_id),['6','7']);
 assert.deepEqual(radarMissingAuthorIds(raw,query,'抖音',undefined,at),['author-6','author-7']);
 assert.deepEqual(radarMissingAuthorIds(raw,query,'抖音',['xhs-search','xhs-profile'],at),[]);
});

test('unknown metrics and zero followers retain unknown eligibility without being invented',()=>{
 const raw=rawDy([dy('1',{statistics:{},create_time:undefined}),dy('2',{author:{follower_count:0}})]);
 assert.equal(radarSampleRows(raw,query,'抖音',undefined,at).length,2);
 assert.deepEqual(radarMissingAuthorIds(raw,query,'抖音',undefined,at),['author-1']);
});

test('XHS applies the same known-condition selection before the final per-platform limit',()=>{
 const id=n=>String(n).repeat(24),note=(n,patch={})=>({id:id(n),user:{userid:id(n)},liked_count:200,timestamp:seconds('2026-10-26T00:00:00.000Z'),...patch});
 const xhs={data:{data:{items:[note(1,{liked_count:10}),note(2,{user:{userid:id(2),fans:2000}}),note(3,{user:{userid:id(3),fans:500}}),note(4,{timestamp:seconds('2026-10-01T00:00:00.000Z')}),note(5),note(6)].map(note=>({note}))}}};
 const fixed={...query,platform:'小红书',sampleLimit:1};
 assert.deepEqual(radarMissingAuthorIds(xhs,fixed,'小红书',undefined,at),[id(5)]);
 const result=normalizeXhsRadar(xhs,fixed,at,{[id(5)]:10});
 assert.equal(result.length,1);assert.equal(result[0].sourceId,id(5));assert.equal(result[0].eligibility,'qualified');
});

test('collector profiles only selected pool authors and never grows the frozen request budget',async()=>{
 const calls=[],raw=rawDy([dy('1',{statistics:{digg_count:1}}),dy('2'),dy('3'),dy('4')]);
 const result=await collectRadar({query,allowedOperations:['douyin-search','profile'],identity:{},descriptorPath:'/unused',maxRequests:3},async(_descriptor,request)=>{
  calls.push(request);return{data:request.operation==='douyin-search'?raw:{data:{user:{follower_count:10}}},requestsUsed:1,cacheHit:false,collectedAt:at};
 });
 assert.deepEqual(calls.map(({operation,id})=>[operation,id]),[['douyin-search','测试'],['profile','author-2'],['profile','author-3']]);
 assert.equal(result.collection.requests,3);assert.equal(result.collection.onePage,true);
 assert.equal(result.collection.strategy,'keyword-search-first-page-filter-known-then-limit');
 assert.deepEqual(result.candidates.map(c=>c.sourceId),['2','3']);
});

test('cached sources retain their own time and profile enrichment records its independent timestamp',async()=>{
 const xhsId='1'.repeat(24),multi={...query,platforms:['抖音','小红书']};
 const old=rawDy([dy('1',{create_time:seconds('2026-10-19T00:00:00.000Z')})]);
 const fresh={data:{data:{items:[{note:{id:xhsId,user:{userid:xhsId},liked_count:200,timestamp:seconds('2026-10-26T00:00:00.000Z')}}]}}};
 const result=await collectRadar({query:multi,identity:{},descriptorPath:'/unused',maxRequests:4},async(_descriptor,request)=>({
  data:request.operation==='douyin-search'?old:request.operation==='xhs-search'?fresh:request.operation==='profile'?{data:{user:{follower_count:10}}}:{data:{data:{fans:10}}},
  requestsUsed:request.operation==='douyin-search'?0:1,cacheHit:request.operation==='douyin-search',collectedAt:request.operation==='douyin-search'?oldAt:at
 }));
 assert.equal(result.sourceTimeVersion,1);assert.equal(result.collectedAt,at);assert.equal(result.candidates[0].collectedAt,oldAt);assert.equal(result.candidates[1].collectedAt,at);
 assert.equal(result.candidates[0].eligibility,'qualified','age is checked against its own snapshot, not the newest platform');
 assert(result.candidates[0].evidence.some(text=>text.includes(`作者粉丝资料采集：${at}`)&&text.includes(oldAt)));
});

test('empty filtered pools are valid and do not trigger profiles, extra pages or retries',async()=>{
 const calls=[];const result=await collectRadar({query,identity:{},descriptorPath:'/unused',maxRequests:4},async(_descriptor,request)=>{
  calls.push(request.operation);return{data:rawDy([dy('1',{statistics:{digg_count:1}})]),requestsUsed:1,cacheHit:false,collectedAt:at};
 });
 assert.deepEqual(calls,['douyin-search']);assert.deepEqual(result.candidates,[]);assert.equal(result.collection.requests,1);
});

test('latest source evidence wins over adoption order while persisted add and reject intent survives',()=>{
 const c=(sourceKey,collectedAt,decision='pending',topicId=null)=>({sourceKey,collectedAt,decision,topicId,title:`${sourceKey}:${collectedAt}`});
 const reports=[
  {id:'fresh',radar:{candidates:[c('a',at),c('b',at)]}},
  {id:'later-adopted-cache',radar:{candidates:[c('a',oldAt,'added','topic'),c('b',oldAt,'rejected')]}}
 ];
 const entries=radarLatestEntries(reports);
 assert.equal(entries.length,2);
 assert(entries.every(entry=>entry.id==='fresh'&&entry.candidate.collectedAt===at));
 assert.equal(entries.find(entry=>entry.candidate.sourceKey==='a').candidate.topicId,'topic');
 assert.equal(entries.find(entry=>entry.candidate.sourceKey==='a').candidate.decision,'added');
 assert.equal(entries.find(entry=>entry.candidate.sourceKey==='b').candidate.decision,'rejected');
 assert.equal(reports[0].radar.candidates[0].decision,'pending','display selection must not mutate persisted evidence');
});
