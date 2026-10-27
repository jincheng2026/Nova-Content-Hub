import test from 'node:test';
import assert from 'node:assert/strict';
import {collectTitleRecommendations, adoptTitleRecommendation} from '../src/shared/content-title-recommendations.ts';

const content={id:'content-a',editToken:'content-token',title:'原标题',body:'已保存正文',bodyHash:'body-a',deletedAt:null};
const candidate=(id,text)=>({id,text});
function task(status='accepted',bodyHash='body-a') {
 return {id:'task-a',kind:'packaging',contentId:content.id,title:'标题任务',requestHash:'request-a',request:{bodyHash},activeAttemptId:'attempt-a',attempts:[{id:'attempt-a',status,receipt:{taskId:'task-a',attemptId:'attempt-a',requestHash:'request-a'},result:{artifacts:[{id:'artifact-a',kind:'packaging',data:{packaging:{titles:[candidate('title-a','可采用标题')]}}}]}}]};
}
const recommendations=(tasks,creation=null)=>collectTitleRecommendations({content,creation,tasks});
test('only a current manually accepted packaging receipt contributes title recommendations',()=>{
 assert.equal(recommendations([task('submitted')]).length,0);
 assert.equal(recommendations([task('waiting-user')]).length,0);
 assert.deepEqual(recommendations([task()]).map(c=>c.text),['可采用标题']);
 for(const change of [t=>{t.contentId='other';},t=>{t.activeAttemptId='old';},t=>{t.attempts[0].receipt.requestHash='different';},t=>{t.attempts[0].receipt.taskId='other';},t=>{t.attempts[0].receipt=null;}]) {const t=task();change(t);assert.equal(recommendations([t]).length,0);}
});
test('saved packaging and accepted flat title artifacts remain readable without changing human choices',()=>{
 const creation={contentId:content.id,packaging:{titles:[candidate('saved','人工标题')],selectedTitleId:'saved'}};
 const t=task();t.attempts[0].result.artifacts[0].data={titles:[candidate('flat','另一标题'),candidate('blank','  '),candidate('long','长'.repeat(501))]};
 const before=JSON.stringify({creation,t});
 assert.deepEqual(recommendations([t],creation).map(c=>c.text),['人工标题','另一标题']);
 assert.equal(JSON.stringify({creation,t}),before);
 assert.equal(recommendations([t],{...creation,contentId:'other'}).some(c=>c.text==='人工标题'),false);
});
test('old body recommendations are explicitly marked and every title carries the editor CAS version',()=>{
 const [c]=recommendations([task('accepted','old-body')]);
 assert.equal(c.stale,true);assert.equal(c.contentId,'content-a');assert.equal(c.editToken,'content-token');
 const adopted=adoptTitleRecommendation(content,{title:content.title,body:content.body},c);
 assert.deepEqual(adopted,{title:'可采用标题',body:'已保存正文'});
 assert.equal(content.title,'原标题');
});
test('adoption refuses unsaved edits, another content, stale read, trashed content and invalid title',()=>{
 const [c]=recommendations([task()]),draft={title:content.title,body:content.body};
 for(const [base,local,title] of [[content,{...draft,title:'未保存标题'},c],[content,{...draft,body:'未保存正文'},c],[content,draft,{...c,contentId:'other'}],[{...content,editToken:'new-token'},draft,c],[{...content,deletedAt:'yesterday'},draft,c],[content,draft,{...c,text:'长'.repeat(501)}],[null,draft,c],[content,null,c]])assert.throws(()=>adoptTitleRecommendation(base,local,title));
 assert.deepEqual(adoptTitleRecommendation(content,draft,c),{title:'可采用标题',body:'已保存正文'});
});
