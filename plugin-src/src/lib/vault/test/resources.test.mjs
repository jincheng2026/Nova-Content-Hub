import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createVault, readVaultSnapshot} from '../index.mjs';
import {classifyVaultResources, encodeResourceBlock, renderMarkdownReport} from '../resources.mjs';

function fixture(t) {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'nova-resources-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const binding=createVault(root);
 return {root, runtime:binding.root, put(rel,text){fs.mkdirSync(path.dirname(path.join(root,rel)),{recursive:true});fs.writeFileSync(path.join(root,rel),text);}};
}

test('classifies actual account profiles and reports, excluding attachments, research copies, indexes and transcripts',t=>{
 const f=fixture(t);
 f.put('01_对标账号/科普/01_小红书_大李.md','# 大李（小红书）\n\n| 平台 | 小红书 |\n| 博主昵称 | 大李 |\n\nhttps://www.xiaohongshu.com/user/profile/123\n\n人工正文');
 f.put('01_对标账号/调研/大李副本.md','# 大李\n| 平台 | 小红书 |\n| 博主昵称 | 大李 |');
 f.put('01_对标账号/_账号总览.md','# 账号总览');
 f.put('01_对标账号/调研/概念分析报告.md','# 概念分析报告\n调查结论');
 f.put('02_内容素材/逐字稿.md','# 视频逐字稿\n字幕');
 f.put('06_发布复盘/T001_复盘.md','# 发布复盘\n实际观察');
 f.put('07_提示词/文案.md','---\ncategory: 文案\ntags: [短视频, 标题]\nunknown: 保留\n---\n# 写标题\n给定选题写标题');
 const r=classifyVaultResources(readVaultSnapshot(f.runtime));
 assert.equal(r.accounts.length,1);
 assert.equal(r.accounts[0].record.name,'大李');
 assert.equal(r.accounts[0].record.platform,'小红书');
 assert.equal(r.reports.length,2);
 assert.equal(r.prompts.length,1);
 assert.deepEqual(r.prompts[0].record.tags,['短视频','标题']);
 assert.equal(r.prompts[0].record.category,'文案');
 assert.equal(r.inventory.length,readVaultSnapshot(f.runtime).documents.length);
 assert.ok(r.inventory.some(x=>x.relativePath.includes('大李副本')&&x.kind==='excluded'));
});

test('resource management blocks preserve original user text and unknown JSON fields',()=>{
 const original='# 人工档案\n原文不可丢失\n';
 const once=encodeResourceBlock(original,{kind:'account',record:{name:'修改后'},futureField:'保留'});
 assert.ok(once.startsWith(original));
 const twice=encodeResourceBlock(once,{kind:'account',record:{name:'再次修改'}});
 assert.ok(twice.startsWith(original));
 assert.match(twice,/futureField/);
 assert.equal((twice.match(/nova-content-hub:resource/g)||[]).length,1);
});

test('Markdown report projection is readable HTML and cannot execute source markup',()=>{
 const html=renderMarkdownReport('# 调研结果\n<script>alert(1)</script>\n[危险](javascript:alert(1))\n\n| 指标 | 数值 |\n| --- | --- |\n| 样本 | 10 |');
 assert.match(html,/<h1>调研结果<\/h1>/);
 assert.doesNotMatch(html,/<script|href="javascript:/i);
 assert.match(html,/&lt;script&gt;/);
 assert.match(html,/<table>/);
});

import {openLibrary} from '../../file-library/index.mjs';
import {registerVaultResourceProjector} from '../bridge.mjs';
import {projectVaultResources} from '../resources.mjs';

test('original production and prompt APIs expose stable source-backed resources and update from source hashes',t=>{
 const f=fixture(t);
 f.put('01_对标账号/account.md','---\nname: 原位账号\nplatform: 小红书\n---\n# 原位账号\n人工资料');
 f.put('06_发布复盘/实际报告.md','# 实际报告\n<script>evil()</script>\n结论');
 f.put('07_提示词/prompt.md','---\ncategory: 文案\nunknown: 不要改\n---\n# 原位提示词\n写标题');
 registerVaultResourceProjector(projectVaultResources);
 const api=openLibrary(f.runtime),p=api.readProduction(),prompts=api.listPrompts();
 assert.equal(p.accounts.length,1);assert.equal(p.reports.length,1);assert.equal(prompts.length,1);
 const {data}=api.readAsset(p.reports[0].pages[0].assetHash);
 assert.doesNotMatch(data.toString(),/<script>/);
 const revision=p.editToken,id=p.accounts[0].id,promptId=prompts[0].id;
 assert.equal(api.readProduction().editToken,revision);
 f.put('01_对标账号/account.md','---\nname: 外部修改账号\nplatform: 小红书\n---\n# 外部修改账号\n保留资料');
 const changed=api.readProduction();assert.equal(changed.accounts[0].id,id);assert.equal(changed.accounts[0].name,'外部修改账号');
 f.put('07_提示词/prompt.md','---\ncategory: 新分类\nunknown: 不要改\n---\n# 更新标题\n外部正文');
 api.readProduction();assert.equal(api.readPrompt(promptId).body,'# 更新标题\n外部正文');
 assert.equal(api.readPrompt(promptId).category,'新分类');
});

import {randomUUID} from 'node:crypto';
import {__testing} from '../../file-library/index.mjs';
process.env.NODE_ENV='test';

test('legacy account/prompt/report edits and creations persist to Vault and retain handwritten sources',t=>{
 const f=fixture(t),original='# 初始账号\n\n| 平台 | 抖音 |\n| 博主昵称 | 初始账号 |\n\n人工正文不能丢失\n';
 f.put('01_对标账号/account.md',original);
 f.put('07_提示词/prompt.md','---\ncategory: 文案\nunknown: 原样保留\n---\n# 旧提示\n原提示正文');
 f.put('06_发布复盘/原报告.md','# 原报告\n\n人工报告内容');
 const api=openLibrary(f.runtime),p=api.readProduction(),a=p.accounts[0],r=p.reports[0];
 api.mutateProduction('saveAccount',{id:a.id,name:'界面改名',platform:a.platform,url:a.url,note:'界面备注',expectedToken:p.editToken},{mutationId:randomUUID()});
 assert.ok(fs.readFileSync(path.join(f.root,'01_对标账号/account.md'),'utf8').startsWith(original));
 assert.match(fs.readFileSync(path.join(f.root,'01_对标账号/account.md'),'utf8'),/界面改名/);
 const prompt=api.listPrompts()[0];
 api.updatePrompt(prompt.id,{body:'新正文',category:'新分类'},prompt.editToken,{mutationId:randomUUID()});
 const promptText=fs.readFileSync(path.join(f.root,'07_提示词/prompt.md'),'utf8');
 assert.match(promptText,/unknown: 原样保留/);assert.match(promptText,/新正文/);
 const current=api.readProduction(),report=current.reports.find(x=>x.id===r.id);
 api.mutateProduction('saveReport',{...Object.fromEntries(['id','title','type','accountIds','sourceUrl','collectedAt','pages','pageId','meta'].map(k=>[k,report[k]])),title:'报告新标题',expectedToken:current.editToken},{mutationId:randomUUID()});
 assert.match(fs.readFileSync(path.join(f.root,'06_发布复盘/原报告.md'),'utf8'),/人工报告内容/);
 assert.match(fs.readFileSync(path.join(f.root,'06_发布复盘/原报告.md'),'utf8'),/报告新标题/);
 api.createPrompt({title:'新建提示',body:'新建提示正文'},{mutationId:randomUUID()});
 let snapshot=api.readProduction();
 api.mutateProduction('saveAccount',{name:'新建账号',platform:'未知',expectedToken:snapshot.editToken},{mutationId:randomUUID()});
 snapshot=api.readProduction();
 api.mutateProduction('saveReport',{title:'新建报告',pages:report.pages,expectedToken:snapshot.editToken},{mutationId:randomUUID()});
 const docs=readVaultSnapshot(f.runtime).documents;
 assert.ok(docs.some(d=>d.relativePath.startsWith('11_提示词/新建提示_')));
 assert.ok(docs.some(d=>d.relativePath.startsWith('01_对标账号/')&&d.title==='新建账号'));
 assert.ok(docs.some(d=>d.relativePath.startsWith('10_调研报告/')&&d.title==='新建报告'));
 assert.equal(openLibrary(f.runtime).readProduction().accounts.filter(x=>x.name==='新建账号').length,1);
});

test('resource source commit survives runtime capture crash, exact replay and later external conflict',t=>{
 const f=fixture(t);f.put('01_对标账号/account.md','---\nname: 原账号\nplatform: 未知\n---\n# 账号\n人工正文');
 const api=openLibrary(f.runtime),p=api.readProduction(),a=p.accounts[0],mid=randomUUID();
 const input={id:a.id,name:'崩溃恢复后',platform:'未知',expectedToken:p.editToken};
 __testing.setHook((event)=>{if(event.phase==='beforeCapture'&&event.mutationId===mid)throw Error('capture crash');});
 t.after(()=>__testing.setHook(null));
 assert.throws(()=>api.mutateProduction('saveAccount',input,{mutationId:mid}),/capture crash/);
 __testing.setHook(null);
 const text=fs.readFileSync(path.join(f.root,'01_对标账号/account.md'),'utf8');assert.match(text,/崩溃恢复后/);
 const recovered=openLibrary(f.runtime),p2=recovered.readProduction();assert.equal(p2.accounts[0].name,'崩溃恢复后');
 recovered.mutateProduction('saveAccount',input,{mutationId:mid});
 assert.equal(fs.readFileSync(path.join(f.root,'01_对标账号/account.md'),'utf8'),text);
 // Change after the wrapper has synchronized, immediately before the durable transaction source CAS.
 const token=recovered.readProduction().editToken,conflictMid=randomUUID();
 __testing.setHook((event)=>{if(event.phase==='afterJournal'&&event.mutationId===conflictMid)fs.appendFileSync(path.join(f.root,'01_对标账号/account.md'),'\n外部独立新文字');});
 assert.throws(()=>recovered.mutateProduction('saveAccount',{...input,name:'不能覆盖',expectedToken:token},{mutationId:conflictMid}),{code:'CONFLICT'});
 __testing.setHook(null);
 assert.match(fs.readFileSync(path.join(f.root,'01_对标账号/account.md'),'utf8'),/外部独立新文字/);
});

test('JSON account edits preserve valid JSON and unknown fields; prompts retain exact body across reopen',t=>{
 const f=fixture(t);f.put('01_对标账号/account.json',JSON.stringify({name:'JSON账号',platform:'未知',unknown:{keep:true},note:'原备注'}));
 const api=openLibrary(f.runtime),p=api.readProduction(),a=p.accounts[0];
 api.mutateProduction('saveAccount',{id:a.id,name:'更新JSON',platform:'未知',note:'新备注',expectedToken:p.editToken},{mutationId:randomUUID()});
 const parsed=JSON.parse(fs.readFileSync(path.join(f.root,'01_对标账号/account.json'),'utf8'));
 assert.deepEqual(parsed.unknown,{keep:true});assert.equal(parsed.$novaContentHub.record.name,'更新JSON');
 const created=api.createPrompt({title:'精确正文',body:'无结尾换行',category:'分类'},{mutationId:randomUUID()});
 assert.equal(api.readPrompt(created.id).body,'无结尾换行');
 const updated=api.updatePrompt(created.id,{body:'第二次\n\n'},api.readPrompt(created.id).editToken,{mutationId:randomUUID()});
 assert.equal(openLibrary(f.runtime).readPrompt(updated.id).body,'第二次\n\n');
});

test('explicit research-report frontmatter imports ordinary filenames without treating ordinary material as a report',t=>{
 const f=fixture(t);f.put('02_内容素材/notes.md','---\ntype: research-report\ntitle: 明确手工报告\nsourceUrl: https://example.com/report\n---\n真实报告');
 f.put('02_内容素材/ordinary.md','# 普通素材\n只是一条笔记');
 const api=openLibrary(f.runtime),p=api.readProduction();
 assert.equal(p.reports.length,1);assert.equal(p.reports[0].title,'明确手工报告');assert.equal(p.reports[0].sourceUrl,'https://example.com/report');
});

test('HTML report preserves original and uses a readable companion for metadata and explicit replacement body',t=>{
 const f=fixture(t),original='<!doctype html><html><body><article>原始报告</article></body></html>';
 f.put('01_对标账号/比较报告.html',original);
 const api=openLibrary(f.runtime),p=api.readProduction(),r=p.reports[0];
 api.mutateProduction('saveReport',{id:r.id,title:'改标题',pages:r.pages,expectedToken:p.editToken},{mutationId:randomUUID()});
 assert.equal(fs.readFileSync(path.join(f.root,'01_对标账号/比较报告.html'),'utf8'),original);
 let current=api.readProduction();assert.equal(current.reports.length,1);assert.equal(current.reports[0].title,'改标题');assert.equal(current.reports[0].meta.vault.currentBody,'original');
 const replacement=path.join(f.root,'replacement.html');fs.writeFileSync(replacement,'<!doctype html><body>新正文</body>');
 const asset=api.importAsset(replacement,{purpose:'production-report'});
 api.mutateProduction('saveReport',{id:r.id,title:'显式新正文',pages:[{id:randomUUID(),title:'新正文',assetHash:asset.assetHash}],expectedToken:current.editToken},{mutationId:randomUUID()});
 current=openLibrary(f.runtime).readProduction();assert.equal(current.reports.length,1);assert.equal(current.reports[0].meta.vault.currentBody,'managed-pages');
 assert.match(api.readAsset(current.reports[0].pages[0].assetHash).data.toString(),/新正文/);
 assert.equal(fs.readFileSync(path.join(f.root,'01_对标账号/比较报告.html'),'utf8'),original);
});

test('missing source preserves history with a read-only status and reappearing source retains the same ID',t=>{
 const f=fixture(t);f.put('01_对标账号/account.md','---\nname: 会移动的账号\nplatform: 未知\n---\n人工资料');f.put('07_提示词/prompt.md','# 提示词\n正文');
 const api=openLibrary(f.runtime),p=api.readProduction(),id=p.accounts[0].id,promptId=api.listPrompts()[0].id;
 fs.renameSync(path.join(f.root,'01_对标账号/account.md'),path.join(f.root,'account-away.md'));
 fs.renameSync(path.join(f.root,'07_提示词/prompt.md'),path.join(f.root,'prompt-away.md'));
 const missing=api.readProduction();assert.equal(missing.accounts.find(a=>a.id===id).deletedAt,null);assert.equal(missing.accounts.find(a=>a.id===id).vaultSource.status,'source-missing');assert.equal(api.readPrompt(promptId).provenance.vault.writable,false);assert.equal(missing.editToken,p.editToken);
 fs.renameSync(path.join(f.root,'account-away.md'),path.join(f.root,'01_对标账号/account.md'));
 fs.renameSync(path.join(f.root,'prompt-away.md'),path.join(f.root,'07_提示词/prompt.md'));
 const restored=api.readProduction();assert.equal(restored.accounts.find(a=>a.id===id).deletedAt,null);assert.ok(api.listPrompts().some(x=>x.id===promptId));
});

test('new manual Markdown report and explicit body edit keep Markdown as the current source',t=>{
 const f=fixture(t),api=openLibrary(f.runtime);let p=api.readProduction();
 p=api.mutateProduction('saveReport',{title:'手工报告',markdown:'原Markdown正文',expectedToken:p.editToken},{mutationId:randomUUID()});
 const r=p.reports[0],source=readVaultSnapshot(f.runtime).documents.find(d=>d.relativePath.startsWith('10_调研报告/'));
 assert.ok(source);assert.ok(fs.readFileSync(path.join(f.root,source.relativePath),'utf8').includes('原Markdown正文'));
 p=api.mutateProduction('saveReport',{id:r.id,title:'手工报告',markdown:'明确修改正文',expectedToken:p.editToken},{mutationId:randomUUID()});
 assert.match(fs.readFileSync(path.join(f.root,source.relativePath),'utf8'),/明确修改正文/);
 assert.match(api.readAsset(api.readProduction().reports[0].pages[0].assetHash).data.toString(),/明确修改正文/);
});

test('real profile nickname aliases and explicit duplicate markers do not create phantom accounts or transcript reports',t=>{
 const f=fixture(t);
 f.put('01_对标账号/科普/森森.md','# 森森（抖音）\n## 基础信息\n| 平台 | 抖音 |\n| 达人昵称 | 森森AI日记 |');
 f.put('01_对标账号/科普/副本.md','> 副本：主档案是 [[森森]]，修改请改主档案。\n# 森森\n| 平台 | 抖音 |\n| 博主昵称 | 森森AI日记 |');
 f.put('01_对标账号/调研/corpus/123.md','# 一种AI分析方法\n真实字幕，不能成为报告');
 f.put('01_对标账号/调研/transcript/corrected/456.md','# 数据复盘研究报告\n真实字幕，不能成为报告');
 f.put('06_发布复盘/历史版本/历史复盘.md','# 历史复盘\n旧副本');
 f.put('01_对标账号/调研/work/backups/research_report.html','<html><body>旧副本报告</body></html>');
 const c=classifyVaultResources(readVaultSnapshot(f.runtime));assert.equal(c.accounts.length,1);assert.equal(c.accounts[0].record.name,'森森AI日记');assert.equal(c.reports.length,0);
});

test('large original HTML preserves charts and full data in the isolated reader without changing its source',t=>{
 const f=fixture(t),data=JSON.stringify({finding:'原始结构化结论',samples:['样本数据']}),html=`<!doctype html><html><body><h1>真实结论</h1><script>${' '.repeat(2*1024*1024)}</script><script type="application/json" id="dataset">${data}</script></body></html>`;
 f.put('01_对标账号/大页研究报告.html',html);
 const api=openLibrary(f.runtime),reports=api.readProduction().reports;
 assert.equal(reports.length,1);assert.equal(reports[0].pages.length,1);
 assert.equal(api.readAsset(reports[0].pages[0].assetHash).data.toString(),html);
 assert.equal(fs.readFileSync(path.join(f.root,'01_对标账号/大页研究报告.html'),'utf8'),html);
 assert.equal(reports[0].meta.vault.previewMode,'isolated-html');
 assert.equal(reports[0].meta.vault.preview.complete,true);
 assert.equal(reports[0].meta.vault.preview.scriptExecution,'sandbox');
});

test('manual Markdown external edits become current report pages and editor Markdown while provenance input cannot move authority',t=>{
 const f=fixture(t),api=openLibrary(f.runtime),p=api.readProduction();
 const saved=api.mutateProduction('saveReport',{title:'可编辑报告',markdown:'原始正文',expectedToken:p.editToken},{mutationId:randomUUID()}),r=saved.reports[0],source=r.meta.vault.relativePath;
 const file=path.join(f.root,source);fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace(/原始正文$/,'外部手改正文'));
 const fresh=api.readProduction(),current=fresh.reports.find(x=>x.id===r.id);
 assert.equal(current.meta.manualMarkdown,'外部手改正文');assert.match(api.readAsset(current.pages[0].assetHash).data.toString(),/外部手改正文/);
 const forged=api.mutateProduction('saveReport',{id:r.id,title:'仅改标题',pages:current.pages,meta:{...current.meta,vault:{relativePath:'../../outside',documentId:'forged'}},expectedToken:fresh.editToken},{mutationId:randomUUID()});
 assert.equal(forged.reports.find(x=>x.id===r.id).meta.vault.relativePath,source);
 assert.match(fs.readFileSync(file,'utf8'),/外部手改正文/);
});

test('prompt enabled, favorite and builtin provenance remain source-backed across external source refresh',t=>{
 const f=fixture(t),api=openLibrary(f.runtime);let p=api.createPrompt({title:'系统提示',body:'正文',builtinKey:'builtin-prompt:test',provenance:{source:'approved-seed'}},{mutationId:randomUUID()});
 p=api.setPromptFavorite(p.id,true,p.editToken,{mutationId:randomUUID()});
 p=api.setPromptEnabled(p.id,false,p.editToken,{mutationId:randomUUID()});
 const d=readVaultSnapshot(f.runtime).documents.find(x=>x.relativePath.startsWith('11_提示词/'));
 fs.appendFileSync(path.join(f.root,d.relativePath),'\n外部补充');
 const read=api.readPrompt(p.id);
 assert.equal(read.favorite,true);assert.equal(read.enabled,false);assert.equal(read.builtinKey,'builtin-prompt:test');assert.equal(read.provenance.source,'approved-seed');
});

for(const kind of ['account','prompt','report'])test(`${kind} source missing is rejected before journal publication and the library stays readable`,t=>{
 const f=fixture(t);
 f.put('01_对标账号/account.md','---\nname: 留存账号\nplatform: 未知\n---\n人工账号原文');
 f.put('07_提示词/prompt.md','# 留存提示\n人工提示正文');
 f.put('02_内容素材/report.md','---\ntype: research-report\n---\n# 留存报告\n人工报告正文');
 const api=openLibrary(f.runtime),before=api.readProduction(),prompt=api.listPrompts()[0];
 const original=kind==='account'?'01_对标账号/account.md':kind==='prompt'?'07_提示词/prompt.md':'02_内容素材/report.md',saved=fs.readFileSync(path.join(f.root,original),'utf8');
 fs.renameSync(path.join(f.root,original),path.join(f.root,'temporarily-away.md'));
 const current=api.readProduction(),mid=randomUUID(),input={name:'失败时保留用户输入',note:'不能吞掉编辑',platform:'未知'};
 let error;
 try {
   if(kind==='account')api.mutateProduction('saveAccount',{...input,id:before.accounts[0].id,expectedToken:current.editToken},{mutationId:mid});
   else if(kind==='prompt')api.updatePrompt(prompt.id,{body:'失败时保留提示输入'},api.readPrompt(prompt.id).editToken,{mutationId:mid});
   else api.mutateProduction('saveReport',{id:before.reports[0].id,title:'失败时保留报告输入',pages:before.reports[0].pages,expectedToken:current.editToken},{mutationId:mid});
 }catch(e){error=e;}
 assert.equal(error?.code,'CONFLICT');assert.equal(error?.pendingRecovery??false,false);
 const reopened=openLibrary(f.runtime),still=reopened.readProduction();
 assert.equal(still.accounts[0].name,before.accounts[0].name);assert.equal(still.reports[0].title,before.reports[0].title);assert.equal(reopened.readPrompt(prompt.id).body,prompt.body);
 assert.deepEqual(input,{name:'失败时保留用户输入',note:'不能吞掉编辑',platform:'未知'});
 fs.renameSync(path.join(f.root,'temporarily-away.md'),path.join(f.root,original));
 assert.equal(fs.readFileSync(path.join(f.root,original),'utf8'),saved);
 assert.doesNotThrow(()=>openLibrary(f.runtime).readProduction());
});

for(const mode of ['external-edit','disappeared'])test(`resource ${mode} at journal boundary rejects without a pending recovery transaction`,t=>{
 const f=fixture(t);f.put('01_对标账号/account.md','---\nname: 原位账号\nplatform: 未知\n---\n人工历史');
 const api=openLibrary(f.runtime),p=api.readProduction(),mid=randomUUID(),file=path.join(f.root,'01_对标账号/account.md');
 __testing.setHook(event=>{if(event.phase==='beforeJournal'&&event.mutationId===mid){if(mode==='external-edit')fs.appendFileSync(file,'\n外部新输入');else fs.renameSync(file,path.join(f.root,'away.md'));}});
 t.after(()=>__testing.setHook(null));
 let error;try{api.mutateProduction('saveAccount',{id:p.accounts[0].id,name:'保留未保存输入',platform:'未知',expectedToken:p.editToken},{mutationId:mid});}catch(e){error=e;}
 __testing.setHook(null);assert.equal(error?.code,'CONFLICT');assert.equal(error?.pendingRecovery??false,false);
 const reopened=openLibrary(f.runtime);assert.equal(reopened.queryMutation(mid),null);assert.equal(reopened.readProduction().accounts[0].name,'原位账号');
 if(mode==='external-edit')assert.match(fs.readFileSync(file,'utf8'),/外部新输入/);else assert.equal(reopened.readProduction().accounts[0].vaultSource.status,'source-missing');
});

test('foreign HTML keeps its original DOM and scripts for the opaque isolated report reader',t=>{
 const f=fixture(t),html='<!doctype html><html><head><script>globalThis.chart=42</script></head><body><h1>完整原报告</h1><canvas id="chart"></canvas><details><summary>评论</summary><p>楼内回复</p></details></body></html>';
 f.put('01_对标账号/互动分析报告.html',html);
 const api=openLibrary(f.runtime),report=api.readProduction().reports[0];
 assert.equal(api.readAsset(report.pages[0].assetHash).data.toString(),html);
 assert.equal(report.meta.vault.preview.scriptExecution,'sandbox');
 assert.equal(fs.readFileSync(path.join(f.root,'01_对标账号/互动分析报告.html'),'utf8'),html);
});

for(const mode of ['metadata','managed-pages','managed-markdown'])test(`missing ${mode} HTML companion retains current source authority instead of reverting original report`,t=>{
 const f=fixture(t);f.put('01_对标账号/报告.html','<!doctype html><html><body>旧HTML正文</body></html>');
 const api=openLibrary(f.runtime),p=api.readProduction(),r=p.reports[0];
 const extra=mode==='managed-markdown'?{markdown:'用户当前Markdown正文'}:mode==='managed-pages'?{pages:[{id:randomUUID(),title:'当前页',assetHash:(()=>{const file=path.join(f.root,'replacement.html');fs.writeFileSync(file,'<html><body>用户当前页面</body></html>');return api.importAsset(file,{purpose:'production-report'}).assetHash;})()}]}:{pages:r.pages};
 api.mutateProduction('saveReport',{id:r.id,title:'用户当前标题',...extra,expectedToken:p.editToken},{mutationId:randomUUID()});
 const before=api.readProduction(),current=before.reports[0],companion=current.meta.vault.companion;
 fs.renameSync(path.join(f.root,companion.relativePath),path.join(f.root,'.workbench/companion-away.md'));
 const missing=api.readProduction(),retained=missing.reports.find(x=>x.id===r.id);
 assert.equal(retained.title,'用户当前标题');assert.deepEqual(retained.pages,current.pages);assert.equal(retained.meta.manualMarkdown,current.meta.manualMarkdown);
 assert.equal(retained.meta.vault.status,'source-missing');assert.equal(retained.meta.vault.currentBody,current.meta.vault.currentBody);assert.equal(missing.editToken,before.editToken);
 fs.renameSync(path.join(f.root,'.workbench/companion-away.md'),path.join(f.root,companion.relativePath));
 assert.equal(api.readProduction().reports.find(x=>x.id===r.id).meta.vault.status,'available');
});

for(const target of ['account','companion'])test(`unreadable ${target} management block preserves history and keeps the rest of the library open`,t=>{
 const f=fixture(t);f.put('01_对标账号/account.md','---\nname: 原账号\nplatform: 未知\n---\n人工正文');f.put('01_对标账号/报告.html','<html><body>原报告</body></html>');
 const api=openLibrary(f.runtime);let p=api.readProduction();
 p=api.mutateProduction('saveAccount',{id:p.accounts[0].id,name:'当前账号',platform:'未知',expectedToken:p.editToken},{mutationId:randomUUID()});
 p=api.mutateProduction('saveReport',{id:p.reports[0].id,title:'当前报告',markdown:'当前报告正文',expectedToken:p.editToken},{mutationId:randomUUID()});
 p=api.readProduction();const relative=target==='account'?p.accounts[0].vaultSource.relativePath:p.reports[0].meta.vault.companion.relativePath,file=path.join(f.root,relative),saved=fs.readFileSync(file,'utf8');
 fs.writeFileSync(file,saved.replace('"kind":','"kind"!!:'));
 const current=openLibrary(f.runtime).readProduction();
 assert.equal(current.accounts[0].name,'当前账号');assert.equal(current.reports[0].title,'当前报告');assert.equal(current.reports[0].meta.manualMarkdown,'当前报告正文');
 const source=target==='account'?current.accounts[0].vaultSource:current.reports[0].meta.vault;
 assert.equal(source.status,'source-missing');assert.equal(source.writable,false);
 fs.writeFileSync(file,saved);assert.equal(openLibrary(f.runtime).readProduction().reports[0].title,'当前报告');
});

test('new reports and prompts use declared root-contained output roles',t=>{
 const f=fixture(t),api=openLibrary(f.runtime);const p=api.readProduction();
 api.mutateProduction('saveReport',{title:'新输出报告',markdown:'业务报告正文',expectedToken:p.editToken},{mutationId:randomUUID()});
 api.createPrompt({title:'新输出提示词',body:'业务提示词正文'},{mutationId:randomUUID()});
 const docs=readVaultSnapshot(f.runtime).documents;
 assert.ok(docs.some(d=>d.relativePath.startsWith('10_调研报告/新输出报告_')));
 assert.ok(docs.some(d=>d.relativePath.startsWith('11_提示词/新输出提示词_')));
});

test('Markdown reports render nested lists and quotes while escaping untrusted text in every block',()=>{
 const html=renderMarkdownReport('# 研究结论\n\n> 引用 <img src=x onerror=alert(1)>\n>\n> - 引用内的要点\n\n3. 第一项\n   - 嵌套 <script>evil()</script>\n4. 第二项\n\n尾段\n\n```md\n> 代码中的引用\n- 代码中的列表\n```');
 assert.match(html,/<blockquote>[\s\S]*<p>引用 &lt;img[\s\S]*<ul><li><p>引用内的要点<\/p><\/li><\/ul>[\s\S]*<\/blockquote>/);
 assert.match(html,/<ol start="3"><li><p>第一项<\/p><ul><li><p>嵌套 &lt;script&gt;evil\(\)&lt;\/script&gt;<\/p><\/li><\/ul><\/li><li><p>第二项<\/p><\/li><\/ol>/);
 assert.match(html,/<\/ol>[\s\S]*<p>尾段<\/p>/);assert.match(html,/<pre><code>&gt; 代码中的引用\n- 代码中的列表\n<\/code><\/pre>/);
 assert.doesNotMatch(html,/<script|<img|onerror="/i);assert.match(html,/default-src 'none'; style-src 'unsafe-inline'/);
});

test('Markdown list and quote projection preserves source files and original HTML report bytes',t=>{
 const f=fixture(t),markdown='# 列表研究报告\r\n\r\n- 发现一\r\n- 发现二\r\n\r\n> 有来源的观察\r\n',original='<!doctype html><html><body><p>原 HTML 保留</p><script>original()</script></body></html>';
 f.put('06_发布复盘/列表研究报告.md',markdown);f.put('06_发布复盘/原格式报告.html',original);
 const api=openLibrary(f.runtime),reports=api.readProduction().reports,report=reports.find(value=>value.title==='列表研究报告'),html=api.readAsset(report.pages[0].assetHash).data.toString();
 assert.match(html,/<ul><li><p>发现一<\/p><\/li><li><p>发现二<\/p><\/li><\/ul>/);assert.match(html,/<blockquote><p>有来源的观察<\/p><\/blockquote>/);
 assert.equal(fs.readFileSync(path.join(f.root,'06_发布复盘/列表研究报告.md'),'utf8'),markdown);assert.equal(fs.readFileSync(path.join(f.root,'06_发布复盘/原格式报告.html'),'utf8'),original);
});

test('source resource projection preserves private attempt claims while public snapshots stay redacted',t=>{
 const f=fixture(t),api=openLibrary(f.runtime);
 const created=api.mutateProduction('createTask',{kind:'writing',title:'来源刷新回归',prompt:'只测试本地固定契约',host:'codex',tools:[],budget:{amount:0,currency:'REQ'},expectedToken:api.readProduction().editToken});
 const task=created.tasks.at(-1),identity={taskId:task.id,attemptId:task.activeAttemptId,claimToken:randomUUID(),workerId:'projection-worker'};
 api.mutateProduction('claimTask',identity);
 f.put('01_对标账号/新增账号.md','---\nname: 新增账号\nplatform: 抖音\n---\n# 新增账号\n真实资料');
 const projected=api.readProduction();assert.ok(projected.accounts.some(a=>a.name==='新增账号'));assert.equal(projected.tasks.at(-1).attempts[0].claimToken,null);
 assert.equal(api.readProductionContext(task.id).attempt.claimToken,identity.claimToken,'projection may not persist the public redacted token');
 api.mutateProduction('progressTask',{...identity,status:'claimed',progress:50,message:'来源更新后继续'});
 f.put('01_对标账号/调研/新报告.html','<!doctype html><html><head><title>新报告</title></head><body>原报告内容</body></html>');
 assert.ok(api.readProduction().reports.some(r=>r.title==='新报告'));
 api.mutateProduction('submitTask',{...identity,result:{summary:'仍由同一claim提交',artifacts:[{id:randomUUID(),kind:'draft',title:'候选',text:'正文不丢失',assetHash:null,data:null}]}});
 const ended=api.readProduction().tasks.find(t=>t.id===task.id).attempts[0];assert.equal(ended.status,'submitted');assert.equal(ended.claimToken,null);assert.ok(ended.receipt.sha256);
});
