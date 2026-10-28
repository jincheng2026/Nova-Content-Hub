import test from 'node:test';
import assert from 'node:assert/strict';
const api=await import('../reference-card-delivery.mjs').catch(()=>({}));
import {referenceCardPayload as payload} from './fixtures/reference-card.mjs';

test('reference-card delivery keeps validated Markdown and readable static HTML without raising evidence level',()=>{
 assert.equal(typeof api.renderReferenceCardDelivery,'function');const p=payload(),before=JSON.stringify(p),r=api.renderReferenceCardDelivery(p);
 assert.equal(JSON.stringify(p),before);assert.match(r.markdown,/cid c1/);assert.match(r.html,/cid c1/);
 for(const value of ['怎么下载字幕？','评论实证','推测','待用户记录采纳、否决与理由。']){assert.ok(r.markdown.includes(value));assert.ok(r.html.includes(value));}
 assert.match(r.html,/<h[12][^>]*>[^<]*钩子判定/);assert.doesNotMatch(r.html,/<script\b|<iframe\b|\b(?:src|href)=["']https?:/i);
 assert.doesNotMatch(r.html,/L[34]|已人工验收/);
 assert.doesNotMatch(r.html,/type: research-report/,'generated frontmatter stays in the original, outside the reading representation');
});
test('reference-card delivery rejects wrong citations and escapes authored HTML',()=>{
 assert.equal(typeof api.renderReferenceCardDelivery,'function');const p=payload();p.reference_card.questions[0].citations[0].quote='编造评论';assert.throws(()=>api.renderReferenceCardDelivery(p),{code:'INVALID_CITATION'});
 const safe=payload();safe.reference_card.audience='<img src=x onerror=alert(1)>';
 const r=api.renderReferenceCardDelivery(safe);assert.match(r.html,/&lt;img/);assert.doesNotMatch(r.html,/<img\b/);
});
