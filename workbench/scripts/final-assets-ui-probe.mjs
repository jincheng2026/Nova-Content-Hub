// Real React/Semi integration. Writes only to an explicitly supplied test Vault.
// Candidate image submission below is a fixture, never evidence of real AI generation.
import {app} from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';

const root=process.env.NOVA_FINAL_ASSETS_PROBE_ROOT;
assert.ok(root&&path.isAbsolute(root)&&/^nova-(?:detail-continuation|final-assets)-/.test(path.basename(root)),'Explicit isolated fixture required');
const phase=process.env.NOVA_FINAL_ASSETS_PHASE??'save';
assert.ok(['save','reopen'].includes(phase));
const number=process.env.NOVA_FINAL_ASSETS_CONTENT??'T044';
assert.ok(['T044','T099'].includes(number),'Only the original-copy case and the dedicated synthetic content are allowed');
const desktop=path.resolve(process.env.NOVA_FINAL_ASSETS_DESKTOP??'workbench/dist-desktop/auth-disabled/workbench/dist/main/desktop.mjs');
const {startDesktop}=await import(pathToFileURL(desktop).href);
const businessBase=path.resolve(path.dirname(desktop),'../../../plugin-src/src/lib');
const out=path.join(root,'evidence','final-assets',number,phase),exportsRoot=path.join(root,'final-assets-exports');
await fs.mkdir(out,{recursive:true});await fs.mkdir(exportsRoot,{recursive:true});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const evidence={at:new Date().toISOString(),phase,number,desktop,scope:'Isolated Vault; actual React/Semi; fixture image only; not installed-app or real-model acceptance',steps:[],views:{}};
// Seed before starting Electron's background readers. Direct fixture writes must
// never race the app's own worker; the UI only uses the finite native bridge.
async function prepareFixture(){
const runtime=path.join(root,'第二大脑/.workbench/runtime');
const {openLibrary}=await import(pathToFileURL(path.join(businessBase,'file-library/index.mjs')).href);
const core=await import(pathToFileURL(path.join(businessBase,'vault/core.mjs')).href);
const binding=core.bindingForRuntime(runtime);assert.ok(binding);
if(number==='T099'&&phase==='save'){
 const creation=await import(pathToFileURL(path.join(businessBase,'creation-document/index.mjs')).href);
 const relativePath='05_内容草稿/T099_最终资产流程验收/创作页.html';
 try{await fs.access(path.join(binding.vaultRoot,relativePath));}catch(error){if(error.code!=='ENOENT')throw error;
  await creation.buildCreationPage(binding.vaultRoot,{work:{vaultId:binding.vaultId,workId:number},source:{sourceId:'drafts',documentId:'fixture-T099',relativePath,vaultId:binding.vaultId},templateVersion:'jincheng-source-v2',mutationId:randomUUID(),data:{content_id:number,type:'口播',stage:'写稿',title:'最终资产流程验收示例',narrative:{story:'核对保存后的结果',audience:'验收人员',problem:'确认未发布也能保存四项资产'},segments:[{id:'fixture-segment',title:'示例正文',role:'正文',mine:'这是一条流程验收示例，不代表任何人的真实经历。\n第二行保留原始换行。',baseline:'示例正文',refs:[]}],suggestions:[],items:[{id:'fixture-title',kind:'pubslot',locked:{slot:'标题'},fields:{final:'未发布也能保留最终资产'}},{id:'fixture-cover',kind:'pubslot',locked:{slot:'封面文字'},fields:{final:'四项资产\n同篇保存'}},{id:'fixture-description',kind:'pubslot',locked:{slot:'简介'},fields:{final:'独立测试内容，仅用于验证逐字稿、标题、简介与封面的保存和读回。\n没有录完或发布事实。'}}]}});
 }
}
const library=openLibrary(runtime);library.listContents();
const work=core.contentSources({root:binding.vaultRoot,vaultId:binding.vaultId,...core.scan(binding.vaultRoot,binding.vaultId)}).find(item=>item.tNumber===number);assert.ok(work);
const packaging=library.readCoverPackaging({contentId:work.contentId});assert.equal(packaging.kind,'jc-doc');
if(phase==='save'){
 const sharp=createRequire(desktop)('sharp');
 const fixtureBytes=await sharp({create:{width:120,height:160,channels:3,background:'#0071e3'}}).png().toBuffer();
 const image=path.join(root,'final-assets-fixture.png');await fs.writeFile(image,fixtureBytes);
 const asset=library.importAsset(image,{purpose:'template-reference'}),template=library.createTemplate({name:'最终资产验收专用示例',definition:{accepted:false},resources:{sample:{assetHash:asset.assetHash,bytes:asset.bytes,detectedType:asset.detectedType,role:'style'}}});
 const current=library.readContent(work.contentId),request=library.createCoverRequest(work.contentId,{template:{id:template.id,version:1},styleAssetHashes:[asset.assetHash],photo:null,materialIds:[],prompt:'Integration fixture image only; no model invoked',pixels:{width:120,height:160},ratio:'3:4',count:1,outputFormat:'png',scope:'cover-only',packagingSource:{documentId:packaging.source.documentId,pageId:packaging.source.pageId,revision:packaging.source.revision,selectionToken:packaging.selectionToken}},current.editToken,{mutationId:randomUUID()}).request;
 const attempt=library.createCoverAttempt(work.contentId,request.requestId,{host:'codex'}).attempt,context=library.readCoverContext(work.contentId,request.requestId,attempt.attemptId);
 library.claimCoverAttempt(work.contentId,request.requestId,attempt.attemptId,{host:'codex',readAssetHashes:[...new Set(context.inputs.map(input=>input.assetHash))]});
 await fs.writeFile(path.join(context.inbox,'fixture.png'),fixtureBytes);
 const committed=await library.commitCoverAttempt(work.contentId,request.requestId,attempt.attemptId,{libraryId:library.info.libraryId,contentId:work.contentId,requestId:request.requestId,attemptId:attempt.attemptId,requestHash:request.requestHash,resultId:randomUUID(),files:[{name:'fixture.png',sha256:hash(fixtureBytes)}]});
 library.selectContentCover(work.contentId,committed.candidateIds[0],library.readContent(work.contentId).editToken,{mutationId:randomUUID()});
 evidence.fixtureCandidate={candidateId:committed.candidateIds[0],assetHash:hash(fixtureBytes),requestHash:request.requestHash,notRealModelGeneration:true};
}
return packaging;
}
let packaging;
try{packaging=await prepareFixture();}catch(error){await fs.writeFile(path.join(out,'fixture-failure.json'),JSON.stringify({at:new Date().toISOString(),message:String(error),stack:error.stack}));app.exit(1);throw error;}
const deadline=setTimeout(()=>app.exit(2),300000);
startDesktop({show:false,publicationObserver:false,userData:path.join(root,'machine'),marketRoot:process.env.NOVA_FINAL_ASSETS_MARKET??path.resolve('workbench/dist-desktop/auth-disabled/workbench/plugin-marketplace'),dialogs:{library:async()=>path.join(root,'第二大脑'),maintenanceParent:async()=>exportsRoot},async ready({window,controller,release}){
 const run=source=>window.webContents.executeJavaScript(source);
 const wait=async(fn,label,ms=60000)=>{const end=Date.now()+ms;for(;;){const value=await fn();if(value)return value;if(Date.now()>end)throw Error('Timeout '+label);await new Promise(resolve=>setTimeout(resolve,75));}};
 const dom=(source,label=source)=>wait(()=>run(source),label);
 const button=label=>dom(`(()=>{const e=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(label)}&&!e.disabled&&e.getClientRects().length);if(!e)return false;e.click();return true})()`,'button '+label);
 const bridge=async(method,input)=>{const reply=await run(`window.contentHub[${JSON.stringify(method)}](${input===undefined?'':JSON.stringify(input)})`);assert.equal(reply.ok,true,JSON.stringify(reply));return reply.value;};
 const shot=async name=>{await run(`(async()=>{await document.fonts.ready;await Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))})()`);evidence.views[name]=await run('({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth})');await fs.writeFile(path.join(out,name+'.png'),(await window.webContents.capturePage()).toPNG());};
 try{
  window.webContents.setBackgroundThrottling(false);window.setSize(1440,980);
  await dom(`!!document.querySelector('main[data-app="ready"][data-loaded="true"][data-busy="false"]')`);
  if(await run(`!!document.getElementById('welcome-open-library')`))await button('打开知识库');
  await wait(()=>run(`document.getElementById('library-summary')?.textContent==='第二大脑'&&!!document.querySelector('main[data-loaded="true"][data-busy="false"]')`),'library initialized',120000);
  const status=await bridge('status');assert.equal(!!status.seedPending,false,'Handle initialization through the existing recovery flow before running this probe');
  evidence.version=release.version;evidence.binding=controller.binding.current;
  assert.equal(evidence.binding.root,path.join(root,'第二大脑/.workbench/runtime'));
  const rows=await bridge('readVaultWorkDirectory'),row=rows.find(item=>item.tNumber===number);assert.ok(row);evidence.beforeFacts={recorded:row.recorded,published:row.published,sourceResolution:row.sourceResolution};
  if(number==='T099')assert.deepEqual(evidence.beforeFacts,{recorded:false,published:false,sourceResolution:'resolved'});
  const source=packaging.script.manuscriptSource,sourceFile=path.join(root,'第二大脑',source.relativePath),sourceBytes=await fs.readFile(sourceFile);evidence.originalSourceHash=hash(sourceBytes);
  await dom(`(()=>{const b=document.getElementById('nav-content');if(!b||b.disabled)return false;b.click();return true})()`);
  await dom(`(()=>{const row=[...document.querySelectorAll('.jincheng-content-directory [data-content-id]')].find(e=>e.querySelector('.jincheng-content-number')?.textContent.trim()===${JSON.stringify(number)});const b=row?.querySelector('button');if(!b||b.disabled)return false;b.click();return true})()`,'open '+number);
  await dom(`document.querySelector('.jincheng-detail-number')?.textContent===${JSON.stringify(number)}&&!document.body.innerText.includes('正在读取选题卡与内容文件…')`);
  await button('最终资产');await dom(`!!document.querySelector('.final-assets-panel')`);
  await run(`document.querySelector('.final-assets-panel').scrollIntoView({block:'start',behavior:'instant'})`);
  if(phase==='save'){
   await button('预览最终资产');await dom(`!![...document.querySelectorAll('.final-assets-panel button')].find(e=>e.textContent.trim()==='保存这一版'&&!e.disabled)`);
   await run(`document.querySelector('.final-assets-panel').scrollIntoView({block:'start',behavior:'instant'})`);await shot('preview');await button('保存这一版');
   await wait(async()=>!!(await bridge('readFinalAssets',{contentId:row.contentId})).current,'saved current');
  }
  const view=await bridge('readFinalAssets',{contentId:row.contentId});assert.ok(view.current&&view.selected);assert.equal(view.selected.manifest.adoption.kind,'author-save');
  assert.equal(view.selected.texts.title,packaging.fields.title.value);assert.equal(view.selected.texts.coverText,packaging.fields.coverText.value);assert.equal(view.selected.texts.description,packaging.fields.description.value);assert.equal(view.selected.texts.script,packaging.script.text);
  assert.equal(view.selected.cover.assetHash,view.selected.manifest.cover.assetHash);evidence.bundle={bundleId:view.selected.bundleId,manifestHash:view.selected.manifestHash,coverHash:view.selected.cover.assetHash};
  await dom(`(()=>{const image=document.querySelector('.final-assets-panel img');return image?.complete&&image.naturalWidth>0})()`,'verified saved cover image');
  await run(`document.querySelector('.final-assets-panel').scrollIntoView({block:'start',behavior:'instant'})`);await shot('saved');
  if(phase==='reopen'){
   const prior=JSON.parse(await fs.readFile(path.join(root,'evidence/final-assets',number,'save/result.json'),'utf8'));assert.equal(prior.passed,true);assert.deepEqual(evidence.bundle,prior.bundle);assert.deepEqual(evidence.binding,prior.binding);evidence.steps.push('Independent process reopens identical bundle, cover and library identities');
  }
  const directoriesBefore=new Set(await fs.readdir(exportsRoot));await button('导出这一版');
  await dom(`document.querySelector('.final-assets-panel')?.innerText.includes('已核验并导出到 ')`,'native export completion feedback');
  const exportedName=await wait(async()=>{const entries=await fs.readdir(exportsRoot,{withFileTypes:true});return entries.find(entry=>entry.isDirectory()&&!entry.name.startsWith('.')&&!directoriesBefore.has(entry.name))?.name;},'complete exported directory');
  const exported=path.join(exportsRoot,exportedName),manifestBytes=await fs.readFile(path.join(exported,'manifest.json'));assert.equal(hash(manifestBytes),view.selected.manifestHash);
  const manifest=JSON.parse(manifestBytes);for(const file of manifest.files){const bytes=await fs.readFile(path.join(exported,file.name));assert.equal(bytes.length,file.bytes);assert.equal(hash(bytes),file.sha256);}
  evidence.export={name:exportedName,allManifestHashesMatch:true};
  for(const [width,height]of [[1280,860],[960,680]]){window.setSize(width,height);await run(`document.querySelector('.final-assets-panel').scrollIntoView({block:'start',behavior:'instant'})`);await shot('window-'+width);assert.ok(evidence.views['window-'+width].scrollWidth<=evidence.views['window-'+width].width);}
  if(phase==='save'){
   const beforeJobs=(await bridge('readCover',{contentId:row.contentId})).jobs.length;
   await button('制作封面');
   await dom(`document.querySelector('.cover-create-dialog[open] .cover-content-summary h3')?.textContent===${JSON.stringify(packaging.fields.title.value)}`,'original adopted title in real cover composer');
   await dom(`(()=>{const imgs=[...document.querySelectorAll('.cover-create-dialog[open] .cover-template-pane img')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.top<innerHeight&&r.bottom>0});return imgs.length>0&&imgs.every(e=>e.complete&&e.naturalWidth>0)})()`,'visible template samples fully loaded');
   assert.equal(await run(`!!document.querySelector('.cover-create-dialog[open] #cover-title')`),false,'original packaging is not another editor');
   for(const [width,height]of [[1280,860],[960,680]]){window.setSize(width,height);await dom(`['cover-ratio','cover-count','generate-cover'].every(id=>{const e=document.getElementById(id),r=e?.getBoundingClientRect();return r&&r.top>=0&&r.bottom<=innerHeight})`,'composer controls reachable in '+width);await shot('cover-source-'+width);}
   await button('暂时收起');assert.equal((await bridge('readCover',{contentId:row.contentId})).jobs.length,beforeJobs);
   evidence.steps.push('Real cover composer reads adopted original packaging, has no second title editor, and opening it creates no task');
  }
  const after=(await bridge('readVaultWorkDirectory')).find(item=>item.tNumber===number);assert.deepEqual({recorded:after.recorded,published:after.published,sourceResolution:after.sourceResolution},evidence.beforeFacts);
  assert.equal(hash(await fs.readFile(sourceFile)),evidence.originalSourceHash);assert.equal((await bridge('readCoverPackaging',{contentId:row.contentId})).script.manuscriptSource.documentId,source.documentId);
  evidence.steps.push('Exact original packaging and current manuscript survive save/export; source bytes and publication facts unchanged','Saved cover renders through verified local resource','Every exported byte matches immutable manifest','Actual 1440, 1280 and 960px layouts captured');evidence.passed=true;
 }catch(error){evidence.passed=false;evidence.failure={message:String(error),stack:error.stack};evidence.body=await run('document.body.innerText').catch(()=>null);evidence.images=await run(`[...document.querySelectorAll('img')].map(e=>({src:e.currentSrc||e.src,complete:e.complete,naturalWidth:e.naturalWidth,visible:e.getClientRects().length>0}))`).catch(()=>null);await shot('failure').catch(()=>{});
 }finally{await fs.writeFile(path.join(out,'result.json'),JSON.stringify(evidence,null,2));clearTimeout(deadline);console.log(JSON.stringify({phase,passed:evidence.passed,steps:evidence.steps,failure:evidence.failure}));app.exit(evidence.passed?0:1);}
}}).catch(async error=>{await fs.writeFile(path.join(out,'startup-failure.json'),JSON.stringify({message:String(error),stack:error.stack}));console.error(error);app.exit(1);});
