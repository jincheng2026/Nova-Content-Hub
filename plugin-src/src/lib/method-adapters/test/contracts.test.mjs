import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validateSynthesisBrief,compileSynthesisReport,compileReviewPage,validateKepuCandidate,validateCoverDesign} from '../index.mjs';
const hash='a'.repeat(64);
const brief={depth:'orientation',question:'模型如何影响我的工作？',purpose:'会前发言',timeBoundary:'截至今天',scopeBoundary:'中国内容创作者'};
test('synthesis has three explicit depths and bounded question; never accepts a social route',()=>{
 assert.equal(validateSynthesisBrief(brief),true);
 assert.equal(validateSynthesisBrief({...brief,route:'topic'}),false);
 for(const depth of ['orientation','issue','generative'])assert.equal(validateSynthesisBrief({...brief,depth}),true);
 assert.equal(validateSynthesisBrief({...brief,scopeBoundary:''}),false);
});
const source={id:'s1',title:'一手材料',url:'https://example.com/paper',accessedAt:'2026-10-28',text:'这里是原文证据。',sha256:createHash('sha256').update('这里是原文证据。').digest('hex')};
const report={title:'研究结论',sections:Object.fromEntries(['conclusions','elevator','understanding','debates','judgment','next','consensus','misconceptions','oneMinute'].map(k=>[k,k+'的实际正文'])),claims:[{kind:'fact',text:'有原文支持',sourceIds:['s1'],quotes:[{sourceId:'s1',text:'原文证据'}]}],sources:[source],externalVerification:'provided-materials-only'};
test('synthesis renders readable MD/HTML/References and a matching source ledger with escaped user input',()=>{
 const out=compileSynthesisReport(brief,{...report,title:'<script>坏</script>'});assert.match(out.markdown,/## References/);assert.match(out.markdown,/一分钟/);assert.match(out.html,/&lt;script&gt;/);assert.doesNotMatch(out.html,/<script>坏/);assert.equal(out.ledger[0].sha256,source.sha256);
 assert.throws(()=>compileSynthesisReport(brief,{...report,claims:[{kind:'fact',text:'假',sourceIds:['unknown']}]}),{code:'SOURCE_REQUIRED'});
 assert.throws(()=>compileSynthesisReport(brief,{...report,sources:[{...source,text:'修改'}]}),{code:'SOURCE_HASH_MISMATCH'});
 assert.throws(()=>compileSynthesisReport(brief,{...report,claims:[{...report.claims[0],quotes:[{sourceId:'s1',text:'不存在的引文'}]}]}),{code:'QUOTE_MISMATCH'});
});
test('review preserves original byte for byte, nine reason identities, four verdicts, and precise insert/delete suggestions',()=>{
 const original='第一句。\n\n第二句。\n第三句。\n第四句。';
 const spec={title:'审稿',original,changes:[{old:'第一句',new:'开头',verdict:'optional',reasons:[{type:'ai',text:'我的判断'}]},{old:'第二句',new:'第二句',verdict:'keep',reasons:[{type:'op',text:'原稿有依据'}]},{insert_after:'第三句。',new:'新增。',verdict:'wait',reasons:[{type:'caption',text:'发布文字，视频里没说'}]},{old:'第四句。',new:'',verdict:'optional',reasons:[{type:'ai',text:'删除候选，等本人定'}]}]};
 const out=compileReviewPage('T001',spec);assert.equal(out.segments[0].mine,original);assert.equal(out.suggestions.length,4);assert.equal(out.suggestions[2].proposed,'第三句。\n新增。');assert.deepEqual(out.suggestions[2].locked.reviewReasons,spec.changes[2].reasons);
 for(const type of ['voice','frame','caption','meet','you','rule','plat','op','ai'])assert.doesNotThrow(()=>compileReviewPage('T001',{...spec,changes:spec.changes.map((c,i)=>({...c,reasons:[{type,text:type==='voice'?'00:01：真实原话':type==='caption'?'发布文字，视频里没说':'依据',...(type==='voice'?{time:'00:01',quote:'真实原话',sourceText:'真实原话'}:{})}]}))}));
 assert.throws(()=>compileReviewPage('T001',{...spec,changes:[{...spec.changes[0],verdict:'keep'}]}),{code:'KEEP_MUST_PRESERVE'});
 assert.throws(()=>compileReviewPage('T001',{...spec,changes:[{...spec.changes[0],verdict:'must'}]}),{code:'AUTHOR_CONFIRMATION_REQUIRED'});
 assert.throws(()=>compileReviewPage('T001',{...spec,original:'重复重复',changes:[{...spec.changes[0],old:'重复'}]}),{code:'QUOTE_NOT_UNIQUE'});
});
test('kepu candidate rejects zero segments, invented generic versions, absent speech/reference/checks, and missing framework pins',()=>{
 assert.throws(()=>validateKepuCandidate('framework',{narrative:{artifactId:'n',hash},segments:[]}),{code:'INVALID_METHOD_INPUT'});
 const segment={framework:{artifactId:'f',hash},index:0,title:'开头',authorSpeech:'我的口述',text:'整理后的口述',additions:[],references:[{who:'甲',text:'原话',sourceText:'原话',time:'00:01',patterns:['5 先演后命名']},{who:'乙',text:'第二家',sourceText:'第二家',time:'00:02',patterns:['9 细节']}],checks:{continuity:'接得上',repetition:'无重复',facts:'待查项已标记',bannedWords:'无'},suggestion:'缺少动作，待你定'};
 assert.doesNotThrow(()=>validateKepuCandidate('framework',{narrative:{artifactId:'n',hash},segments:[{id:'one',title:'单段',purpose:'一个完整动作'}],opening:'开头',ending:'结尾动作',duration:'4分钟'}));
 assert.doesNotThrow(()=>validateKepuCandidate('kepu-segment',segment));assert.throws(()=>validateKepuCandidate('kepu-segment',{...segment,framework:null}),{code:'INVALID_METHOD_INPUT'});
 assert.throws(()=>validateKepuCandidate('kepu-segment',{...segment,authorSpeech:''}),{code:'AUTHOR_SPEECH_REQUIRED'});
 assert.throws(()=>validateKepuCandidate('kepu-segment',{...segment,generic:'通用稿'}),{code:'INVALID_METHOD_INPUT'});
 assert.throws(()=>validateKepuCandidate('kepu-segment',{...segment,references:[]}),{code:'REFERENCE_REQUIRED'});
});
test('cover design freezes complete spec and structural anchor, never accepts source paths or author identity assets',()=>{
 const design={title:'原文标题',style:'纸媒教程',visualProposition:'人物托着流程图',caseId:'example-9',preserve:['标题在上','人物托举','纸面图谱'],replace:['替换产品'],exclude:['他人身份'],specification:'3:4；标题在上，人物左下托着纸面流程图。',evidence:['用户提供的真实产品'],identity:'none',ratio:'3:4'};
 assert.doesNotThrow(()=>validateCoverDesign(design));assert.throws(()=>validateCoverDesign({...design,facePath:'/Users/author/face.jpg'}),{code:'INVALID_METHOD_INPUT'});assert.throws(()=>validateCoverDesign({...design,preserve:['颜色']}),{code:'CASE_STRUCTURE_REQUIRED'});
});

test('cover design accepts the selected standard or custom integer ratio rather than forcing the historical 3:4 default',()=>{
 const base={title:'原字标题',style:'纸媒',visualProposition:'人物托图',caseId:'example-9',preserve:['标题','人物','主视觉'],replace:['产品'],exclude:['作者身份'],specification:'完整画面',evidence:['已给资料'],identity:'none'};
 for(const ratio of ['3:4','1:1','16:9','9:16','7:5'])assert.doesNotThrow(()=>validateCoverDesign({...base,ratio}));
 for(const ratio of ['0:1','1:0','x:y','1.5:2','-1:2'])assert.throws(()=>validateCoverDesign({...base,ratio}),{code:'INVALID_METHOD_INPUT'});
});
