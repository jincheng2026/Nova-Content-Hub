import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTopicOverview,workMatches,classifyWork} from './jincheng-directory.ts';
test('uses the last explicit shooting order, retains deferred and recorded facts',()=>{
 const value=parseTopicOverview('## 选题总表\n### AI教程\n**待做**\n| 编号 | 选题 | 状态 | 来源 |\n| --- | --- | --- | --- |\n| T020 | 测试✅ | 待写 | 自主想法 |\n## 近三天内容安排\n| 日期 | 安排 | 对应选题 |\n| --- | --- | --- |\n| 2026-09-24 | 拍摄顺序 | T026 → T020 |\n| 2026-09-25 | 新顺序 | T029 → T020 |\n## 顺延事项\n| 对应选题 | 安排 | 新日期 |\n| --- | --- | --- |\n| T026 | 暂缓，等补素材 | 待定 |');
 assert.deepEqual(value.order,['T029','T020']);assert.equal(value.rows.get('T020').recorded,true);assert.equal(value.rows.get('T020').type,'AI教程');assert.equal(value.deferred.get('T026').text,'暂缓，等补素材');
});
test('numeric search does not match another work merely mentioning the number',()=>{assert.equal(workMatches('20',{tNumber:'T029',title:'提到 T020',summary:''}),false);assert.equal(workMatches('20',{tNumber:'T020',title:'测试',summary:''}),true);});
test('recorded is doing until actual publication evidence',()=>{assert.equal(classifyWork({published:false,recorded:true,hasDraft:true,overviewStatus:'已做'}),'doing');assert.equal(classifyWork({published:true,recorded:true,hasDraft:true}),'published');assert.equal(classifyWork({published:false,recorded:false,hasDraft:false,overviewStatus:'已做'}),'topics');});
test('explicit author pause overrides draft/recording, while publication has priority',()=>{
 assert.equal(classifyWork({published:false,recorded:false,hasDraft:true,paused:true}),'topics');
 assert.equal(classifyWork({published:false,recorded:true,hasDraft:true,paused:true}),'topics');
 assert.equal(classifyWork({published:true,recorded:true,hasDraft:true,paused:true}),'published');
 assert.equal(classifyWork({published:false,recorded:false,hasDraft:true,paused:false}),'doing');
});
