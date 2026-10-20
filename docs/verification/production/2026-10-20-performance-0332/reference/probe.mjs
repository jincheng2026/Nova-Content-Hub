import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const output=path.dirname(new URL(import.meta.url).pathname), app='/Applications/旅游营销工作台.app', resources=path.join(app,'Contents/Resources');
const scratch=await fs.mkdtemp(path.join(os.tmpdir(),'nova-travel-reference-'));
const mode=process.env.REFERENCE_MODE||'official';assert.ok(['official','matched'].includes(mode));
const fixture=path.join(scratch,'活动库');await fs.cp(path.join(resources,'示例活动库'),fixture,{recursive:true});
await fs.mkdir(path.join(fixture,'机构信息'),{recursive:true});
await fs.cp(path.join(resources,'插件/nova-travel-marketing/自带模板/海报模板'),path.join(fixture,'机构信息/海报模板'),{recursive:true});
await fs.writeFile(path.join(fixture,'工作台设置.json'),JSON.stringify({schema:1,remindAt:'08:30',hideSample:true}));
const version=execFileSync('/usr/bin/plutil',['-extract','CFBundleShortVersionString','raw',path.join(app,'Contents/Info.plist')],{encoding:'utf8'}).trim();assert.equal(version,'0.4.1');
async function inventory(dir,base=dir){const out=[];for(const e of await fs.readdir(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())out.push(...await inventory(f,base));else if(/\.(png|jpe?g|webp)$/i.test(e.name)){const b=await fs.readFile(f);out.push({file:path.relative(base,f),bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')});}}return out;}
const sourceImages=process.env.REFERENCE_SYNTHETIC_DIR;
assert.ok(sourceImages,'REFERENCE_SYNTHETIC_DIR must point to the shared deterministic JPEG fixture');
const names=(await fs.readdir(sourceImages)).filter(n=>n.endsWith('.jpg')).sort();assert.equal(names.length,24);
const bank=path.join(scratch,'images');await fs.cp(sourceImages,bank,{recursive:true});
const sourceInventory=await inventory(bank);
const sample=path.join(resources,'示例活动库/示例 可可奇遇记');
await fs.rm(path.join(fixture,'示例 可可奇遇记'),{recursive:true});
const coverFiles=['物料/海报-横版.jpg','物料/海报-竖版.jpg','物料/研学知识卡/今日知识.jpg','物料/研学知识卡/活动记录.jpg'];
for(let i=0;i<100;i++){
 const dest=path.join(fixture,`性能活动-${String(i).padStart(3,'0')}`);await fs.cp(sample,dest,{recursive:true});
 const project=JSON.parse(await fs.readFile(path.join(dest,'项目.json'),'utf8'));Object.assign(project,{id:`perf-${i}`,name:`性能活动${i}`,sample:false,cover:'封面.jpg'});await fs.writeFile(path.join(dest,'项目.json'),JSON.stringify(project));
 await fs.copyFile(path.join(bank,names[i%24]),path.join(dest,'封面.jpg'));
 for(let j=0;j<coverFiles.length;j++)await fs.copyFile(path.join(bank,names[(i*2+j)%24]),path.join(dest,coverFiles[j]));
}
if(mode==='matched'){
 const templateDir=path.join(fixture,'机构信息/海报模板');await fs.rm(templateDir,{recursive:true});await fs.mkdir(templateDir,{recursive:true});
 const templates=[];for(let i=0;i<24;i++){await fs.copyFile(path.join(bank,names[i]),path.join(templateDir,names[i]));templates.push({id:`perf-template-${i}`,name:`性能模板${i}`,source:'自带',images:[names[i]],createdAt:'2026-10-20'});}
 await fs.writeFile(path.join(templateDir,'模板.json'),JSON.stringify({schema:1,templates}));
}
const fixtureImages=await inventory(fixture);
// Preparation and inventory are complete before any timed process is launched.

// This function is serialized into the installed app's existing WB_SHOTS run hook.
async function measure(target){
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));const frame=()=>new Promise(r=>requestAnimationFrame(r));
 const expected={templates:'模板',acts:'活动',materials:'物料'}[target];
 const visible=()=>[...document.querySelectorAll('main.page img')].filter(im=>{const r=im.getBoundingClientRect(),s=getComputedStyle(im);return r.width>0&&r.height>0&&r.bottom>0&&r.right>0&&r.top<innerHeight&&r.left<innerWidth&&s.visibility!=='hidden'&&s.display!=='none';});
 const t0=performance.now();window.__wbGo(target,null,null,null);let domMs=null,firstImageMs=null,last='',stable=0,images=[],failed=[];
 for(let i=0;i<800;i++){
  const ready=document.querySelector('main.page h1')?.textContent?.trim()===expected;
  if(ready&&domMs===null)domMs=performance.now()-t0;
  if(ready){images=visible();const signature=images.map(im=>im.currentSrc||im.src).join('|');stable=signature===last?stable+1:0;last=signature;
   if(images.some(im=>im.complete&&im.naturalWidth>0)&&firstImageMs===null)firstImageMs=performance.now()-t0;
   if(stable>=2&&images.length&&images.every(im=>im.complete)){
    failed=images.filter(im=>!im.naturalWidth).map(im=>im.src);await Promise.all(images.filter(im=>im.naturalWidth).map(im=>im.decode().catch(()=>{})));await frame();await frame();
    const next=visible();if(next.map(im=>im.currentSrc||im.src).join('|')!==signature){stable=0;continue;}
    return {target,domMs,firstImageMs,totalMs:performance.now()-t0,images:images.map(im=>({url:im.currentSrc||im.src,width:im.naturalWidth,height:im.naturalHeight,display: {width:im.getBoundingClientRect().width,height:im.getBoundingClientRect().height}})),failed,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},heading:document.querySelector('main.page h1')?.textContent};
   }
  }
  await sleep(25);
 }
 throw Error('No complete visible image set: '+target+' '+document.body.innerText.slice(0,160));
}
const byFile=new Map(fixtureImages.map(x=>[x.file,x]));
const targets=(process.env.REFERENCE_PAGES||'templates,acts,materials').split(',');assert.ok(targets.length&&targets.every(p=>['templates','acts','materials'].includes(p)));
const runs=[];const count=Number(process.env.REFERENCE_RUNS||3);
for(let n=0;n<count;n++){
 const dir=path.join(output,`${mode}-run-${Date.now()}-${n+1}`),profile=path.join(scratch,`profile-${n+1}`);await fs.mkdir(dir,{recursive:true});
 const shots=[];for(const target of targets)for(const temperature of ['first-navigation','warm-1','warm-2'])shots.push({name:`${target}-${temperature}`,page:'more',width:1440,height:1000,run:`(async()=>{window.__benchResult=await (${measure.toString()})(${JSON.stringify(target)});})()`,probe:'window.__benchResult',wait:0});
 await fs.writeFile(path.join(dir,'shots.json'),JSON.stringify(shots,null,2));
 const env={...process.env,WB_USERDATA:profile,WB_LIBRARY:fixture,HUODONG_SHARED_DIR:path.join(scratch,'shared'),HUODONG_DATA_DIR:path.join(scratch,'data'),HUODONG_DESKTOP:path.join(scratch,'desktop'),WB_SHOTS:dir,WB_AUTH:'已开通',WB_SETUP:'workbuddy,plugin',HUODONG_TODAY:'2026-10-10',HUODONG_NOW:'2026-10-10T09:00'};
 delete env.ELECTRON_RUN_AS_NODE;delete env.WB_PLUGIN_GUARD;delete env.WB_PLUGIN_VERSION_FILE;
 const started=Date.now();const child=spawn(path.join(app,'Contents/MacOS/旅游营销工作台'),[],{env,stdio:['ignore','pipe','pipe']});let consoleText='';child.stdout.on('data',b=>consoleText+=b);child.stderr.on('data',b=>consoleText+=b);const timer=setTimeout(()=>child.kill('SIGTERM'),105000);
 const exit=await new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));clearTimeout(timer);await fs.writeFile(path.join(dir,'process.log'),consoleText);
 const log=await fs.readFile(path.join(dir,'log.txt'),'utf8');assert.ok(log.includes('done'),log);assert.ok(!log.includes('error '),log);assert.equal(exit.code,0);
 const measurements=log.split('\n').filter(l=>l.includes(' 量：')).map(l=>({name:l.slice(0,l.indexOf(' 量：')), ...JSON.parse(l.slice(l.indexOf(' 量：')+3))}));assert.equal(measurements.length,targets.length*3);for(const row of measurements){assert.equal(row.failed.length,0);const urls=[...new Set(row.images.map(im=>im.url))];const originals=urls.map(u=>byFile.get(decodeURIComponent(new URL(u).pathname.slice(1))));assert.ok(originals.every(Boolean));row.load={elements:row.images.length,uniqueURLs:urls.length,uniqueSourceHashes:new Set(originals.map(x=>x.sha256)).size,originalBytesForUniqueURLs:originals.reduce((n,x)=>n+x.bytes,0),naturalPixelsForUniqueURLs:urls.reduce((n,u)=>{const im=row.images.find(im=>im.url===u);return n+im.width*im.height;},0)};}
 for(const row of measurements){const payloads=[];for(const url of new Set(row.images.map(im=>im.url))){const parsed=new URL(url),full=path.join(fixture,decodeURIComponent(parsed.pathname.slice(1))),st=await fs.stat(full),width=[256,640,1280].find(w=>w>=Number(parsed.searchParams.get('w')))||1280;let cached=null;for(const candidate of [full,await fs.realpath(full)]){const key=createHash('sha1').update(`${candidate}|${st.mtimeMs}|${st.size}|${width}`).digest('hex'),f=path.join(profile,'缩略图',`${key}.jpg`);try{const stat=await fs.stat(f);cached={url,bytes:stat.size,cacheFile:path.basename(f)};}catch{}}assert.ok(cached,'Expected JPEG thumbnail cache entry');payloads.push(cached);}row.load.cachedPayloadBytesForUniqueURLs=payloads.reduce((n,x)=>n+x.bytes,0);row.load.cachedPayloads=payloads;}
 // Keep one visual evidence sample per page; other screenshots stay in temporary storage.
 const extraShots=path.join(scratch,`extra-screenshots-${n+1}`);await fs.mkdir(extraShots,{recursive:true});for(const f of await fs.readdir(dir))if(f.endsWith('.png')&&(n>0||!f.includes('first-navigation')))await fs.rename(path.join(dir,f),path.join(extraShots,f));
 const appLog=await fs.readFile(path.join(profile,'logs/工作台.log'),'utf8');assert.match(appLog,/假装登录状态/);await fs.writeFile(path.join(dir,'isolated-app.log'),appLog);
 runs.push({n:n+1,elapsedMs:Date.now()-started,exit,measurements});console.log(JSON.stringify({run:n+1,measurements:measurements.map(({images,load,...m})=>({...m,imageCount:images.length,uniqueURLs:load.uniqueURLs,uniqueSourceHashes:load.uniqueSourceHashes}))}));
}
const median=x=>[...x].sort((a,b)=>a-b)[Math.floor(x.length/2)];const summary=[];for(const target of targets)for(const temperature of ['first-navigation','warm-1','warm-2']){const rows=runs.flatMap(r=>r.measurements).filter(r=>r.name===`${target}-${temperature}`);summary.push({target,temperature,samples:rows.length,medianDomMs:median(rows.map(r=>r.domMs)),medianTotalMs:median(rows.map(r=>r.totalMs)),visibleCounts:rows.map(r=>r.images.length)});}
await fs.writeFile(path.join(output,`${mode}-result.json`),JSON.stringify({mode,targets,sourceInventory,version,sourceReference:'7149ebb',scratch,fixture,fixtureImages,scope:'Installed 0.4.1 WB_SHOTS test runtime; fake auth, isolated profile and 100 cloned official sample activities, shared deterministic image fixture, and official or matched templates. Navigation starts inside run hook after fixed screenshot navigation wait. OS cache not purged. No true login or normal startup claims.',runs,summary},null,2));console.log(JSON.stringify(summary));
