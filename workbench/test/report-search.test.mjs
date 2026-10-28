import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createReportSearchService,extractRegisteredHtmlText} from '../src/main/report-search.mts';
import {matchReportSearchFields} from '../src/shared/report-search-contracts.ts';
import {renderMarkdownReport} from '../../plugin-src/src/lib/vault/resources.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const report=(id,title='普通标题',pages=[],extra={})=>({id,title,type:'调研',accountIds:[],sourceUrl:null,collectedAt:'2026-10-20T00:00:00.000Z',pages,pageId:pages[0]?.id??'',meta:{},createdAt:'2026-10-20T00:00:00.000Z',updatedAt:'2026-10-20T00:00:00.000Z',deletedAt:null,...extra});
function fixture(){
 const assets=new Map(),reads=[];const snapshot={binding:{libraryId:'library-a',rootIdentity:{dev:'1',ino:'2'}},snapshotToken:'v1',reports:[],accounts:[{id:'account-a',name:'独有账号名'}]};
 const add=(id,html,extra={})=>{const data=Buffer.from(html),page={id:id+'-page',title:'正文',assetHash:hash(data)};assets.set(page.assetHash,data);const r=report(id,'普通标题',[page],extra);snapshot.reports.push(r);return r;};
 let reader=async request=>{reads.push(request);if(!assets.has(request.assetHash))throw Error('原件缺失');return{data:assets.get(request.assetHash),detectedType:'text/html'};};
 const service=createReportSearchService({capture:()=>structuredClone(snapshot),readRegisteredPage:request=>reader(request)});
 const search=(query,rest={})=>service.search({query,type:null,from:null,scope:'active',...rest});
 return{snapshot,assets,reads,add,search,service,setReader(fn){reader=fn;}};
}
test('pure title/account/manual Markdown matching includes body-only words and excludes arbitrary metadata',()=>{
 const r=report('r','标题'),names=new Map([['account-a','独有账号名']]);r.accountIds=['account-a'];r.meta={secret:'不该命中'};
 assert.equal(matchReportSearchFields(r,names,'独有账号名').fields[0],'account');assert.deepEqual(matchReportSearchFields(r,names,'正文独有', '## 正文独有').fields,['body']);assert.equal(matchReportSearchFields(r,names,'不该命中'),null);
});
test('HTML parser decodes entities, joins actual body text and excludes scripts/styles/templates and hidden subtrees',()=>{
 const html='<html><head><title>头部诱饵</title><style>.secret {display:none}</style></head><body><p>第二页 &amp; café &#x4E2D;文</p><script>脚本诱饵</script><template><p>模板诱饵</p></template><div hidden="hidden"><p>隐藏诱饵</p></div><div aria-hidden="true">辅助隐藏</div><p style="display:none">样式隐藏</p><div class="secret">类隐藏</div><!-- 注释诱饵 --></body></html>';
 const text=extractRegisteredHtmlText(html);assert.ok(text.includes('第二页 & café 中文'));for(const word of ['头部诱饵','脚本诱饵','模板诱饵','隐藏诱饵','辅助隐藏','样式隐藏','类隐藏','注释诱饵'])assert.ok(!text.includes(word),word);
});
test('inline emphasis does not split a visible Chinese phrase and unsupported visibility is partial',async()=>{
 assert.ok(extractRegisteredHtmlText('<article>独有<strong>中文</strong>正文</article>').includes('独有中文正文'));
 const f=fixture();f.add('r','<html><head><link rel="stylesheet" href="outside.css" /></head><body>不能猜可见性</body></html>');assert.equal((await f.search('可见性')).status,'partial');
});
test('supported visibility follows simple cascade and condition-dependent hiding remains partial',async()=>{
 const html='<html><head><style>.secret {display:none}.secret {display:block}.parent {visibility:hidden}.child {visibility:visible}</style></head><body><div class="secret">覆盖后可见</div><p style="display:none;display:block">行内覆盖可见</p><div class="parent">父隐藏<span class="child">子元素可见</span></div></body></html>';
 const visible=extractRegisteredHtmlText(html);for(const word of ['覆盖后可见','行内覆盖可见','子元素可见'])assert.ok(visible.includes(word));assert.ok(!visible.includes('父隐藏'));
 const f=fixture();f.add('conditional','<html><head><style>@media print {.print-hidden {display:none}}</style></head><body><p class="print-hidden">屏幕可见</p></body></html>');assert.equal((await f.search('屏幕可见')).status,'partial');
});
test('only registered pages are read and a second-page body-only query matches with page evidence',async()=>{
 const f=fixture(),r=f.add('report','<article>第一页</article>'),second=Buffer.from('<article>第二页独有中文 CAFÉ &amp; 完整</article>');r.pages.push({id:'second',title:'第二页',assetHash:hash(second)});f.assets.set(hash(second),second);f.assets.set(hash('outside'),Buffer.from('未注册诱饵'));
 const found=await f.search('独有中文 café');assert.equal(found.status,'complete');assert.deepEqual(found.hits.map(h=>h.reportId),['report']);assert.equal(found.hits[0].snippets[0].pageId,'second');assert.equal(f.reads.length,2);assert.equal((await f.search('未注册诱饵')).hits.length,0);
});
test('account-name and title matches remain available when a registered body is unreadable',async()=>{
 const f=fixture();const r=f.add('r','<article>正文</article>',{accountIds:['account-a']});f.assets.clear();const found=await f.search('独有账号名');assert.equal(found.status,'partial');assert.equal(found.hits[0].reportId,r.id);assert.equal(found.issues.length,1);assert.ok(found.cursor);assert.equal(found.pendingPages,0);
 f.assets.set(r.pages[0].assetHash,Buffer.from('<article>正文</article>'));assert.equal((await f.search('独有账号名',{cursor:found.cursor})).status,'complete');
});
test('each batch reads at most 20 pages before continuing with an opaque request-bound cursor',async()=>{
 const f=fixture();for(let i=0;i<23;i++)f.add('report-'+i,'<article>正文独有 '+i+'</article>');const first=await f.search('正文独有');assert.equal(f.reads.length,20);assert.equal(first.status,'partial');assert.equal(first.pendingPages,3);assert.equal(first.hits.length,20);assert.match(first.cursor,/^[A-Za-z0-9_-]{32,}$/);assert.ok(!first.cursor.includes('report'));
 for(const change of [{query:'不同查询'},{type:'复盘'},{from:'2026-10-01'},{scope:'trash'}])await assert.rejects(()=>f.search('正文独有',{cursor:first.cursor,...change}),error=>error.code==='STALE_SEARCH');assert.equal(f.reads.length,20);
 const last=await f.search('正文独有',{cursor:first.cursor});assert.equal(last.status,'complete');assert.equal(last.hits.length,23);assert.equal(last.cursor,null);await assert.rejects(()=>f.search('别的查询',{cursor:first.cursor}));
});
test('type/date/scope filtering occurs before reading any page and trash/restore membership invalidates old cursors',async()=>{
 const f=fixture();f.add('active','<article>命中</article>');f.add('old','<article>命中</article>',{collectedAt:'2026-01-01T00:00:00.000Z'});f.add('trash','<article>命中</article>',{deletedAt:'2026-10-21T00:00:00.000Z',type:'复盘'});
 const active=await f.search('命中',{from:'2026-10-01T00:00:00.000Z'});assert.deepEqual(active.hits.map(h=>h.reportId),['active']);assert.equal(f.reads.length,1);const trash=await f.search('命中',{type:'复盘',scope:'trash'});assert.deepEqual(trash.hits.map(h=>h.reportId),['trash']);
});
test('all request dimensions, snapshot/source version and binding changes invalidate a cursor',async()=>{
 for(const change of [f=>f.snapshot.snapshotToken='v2',f=>f.snapshot.binding.libraryId='library-b',f=>f.snapshot.binding.rootIdentity.ino='3',f=>f.snapshot.reports[0].pages[0].assetHash='a'.repeat(64),f=>f.snapshot.accounts[0].name='新账号名',f=>f.snapshot.reports[0].deletedAt='2026-10-21']){
  const f=fixture();for(let i=0;i<21;i++)f.add('r'+i,'<article>命中</article>');const first=await f.search('命中');change(f);await assert.rejects(()=>f.search('命中',{cursor:first.cursor}),error=>error.code==='STALE_SEARCH');
 }
});
test('switching libraries while a page read is in flight never returns matches from the old library',async()=>{
 const f=fixture();f.add('r','<article>旧库独有</article>');let release;f.setReader(()=>new Promise(resolve=>{release=resolve;}));const pending=f.search('旧库');await Promise.resolve();f.snapshot.binding.libraryId='new-library';release({data:Buffer.from('<article>旧库独有</article>'),detectedType:'text/html'});await assert.rejects(()=>pending,error=>error.code==='STALE_SEARCH');
});
test('tampered bytes, invalid UTF-8 and oversized pages are partial, never false complete no-match',async()=>{
 for(const bytes of [Buffer.from('被篡改'),Buffer.from([0xff,0xfe]),Buffer.alloc(8*1024*1024+1,65)]){
  const f=fixture(),r=f.add('r','<article>原文</article>');r.pages[0].assetHash=hash(bytes);f.assets.set(r.pages[0].assetHash,bytes);if(bytes.toString()==='被篡改')r.pages[0].assetHash='a'.repeat(64);
  const result=await f.search('词语');assert.equal(result.status,'partial');assert.equal(result.hits.length,0);assert.equal(result.issues.length,1);
 }
});
test('a fresh query cancels an older read and cache rechecks bytes instead of trusting stale assets',async()=>{
 const f=fixture(),r=f.add('r','<article>正文词语</article>');assert.equal((await f.search('正文')).hits.length,1);f.assets.set(r.pages[0].assetHash,Buffer.from('<article>篡改</article>'));assert.equal((await f.search('正文')).status,'partial');
});
test('untrusted metadata cannot impersonate a Markdown body and HTML cache never inherits raw Markdown markers',async()=>{
 const f=fixture(),markdown='## 独有正文\n\n保留原文',html=renderMarkdownReport(markdown,'普通标题');f.add('manual',html,{meta:{manualMarkdown:markdown}});f.add('html-copy',html);f.add('forged','<article>真实正文</article>',{meta:{manualMarkdown:'伪造元数据正文'}});
 const result=await f.search('##');assert.deepEqual(result.hits.map(h=>h.reportId),['manual']);assert.equal((await f.search('伪造元数据正文')).hits.length,0);
});
test('starting a new query aborts the old generation even if its reader finishes later',async()=>{
 const f=fixture(),r=f.add('r','<article>真实正文</article>');let release,first=true;
 f.setReader(()=>{if(first){first=false;return new Promise(resolve=>{release=resolve;});}return{data:f.assets.get(r.pages[0].assetHash),detectedType:'text/html'};});
 const old=f.search('旧查询');await Promise.resolve();const rejected=assert.rejects(()=>old,error=>error.code==='STALE_SEARCH');assert.equal((await f.search('真实正文')).hits.length,1);release({data:f.assets.get(r.pages[0].assetHash),detectedType:'text/html'});await rejected;
});
