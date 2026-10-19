// Real React/Semi UI in an isolated Electron window; synthetic assets and IPC only.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import electron from 'electron';
import {build} from 'vite';

const workbench = fileURLToPath(new URL('../', import.meta.url));
const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'nova-cover-gallery-ui-')));
try {
  await fs.writeFile(path.join(root, 'index.html'), '<html lang="zh-CN"><div id="root"></div><script type="module" src="/probe.jsx"></script></html>');
  await fs.writeFile(path.join(root, 'probe.jsx'), `
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import ${JSON.stringify(path.join(workbench, 'node_modules/@douyinfe/semi-ui-19/react19-adapter'))};
import ${JSON.stringify(path.join(workbench, 'node_modules/@douyinfe/semi-ui-19/lib/es/_base/base.css'))};
import {CoverPanel} from ${JSON.stringify(path.join(workbench, 'src/renderer/covers.tsx'))};
const artwork=(w,h,color,label)=>'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'"><rect width="100%" height="100%" fill="'+color+'"/><rect x="8" y="8" width="'+(w-16)+'" height="'+(h-16)+'" fill="none" stroke="white" stroke-width="5"/><text x="50%" y="50%" text-anchor="middle" fill="white" font-size="32">'+label+'</text></svg>');
const portrait=artwork(300,400,'#426b9a','竖图完整边界'),landscape=artwork(640,360,'#8a6144','横图完整边界');
const content={id:'content',title:'让每一张候选都清楚可选',body:'已保存的正文摘要。本人照只决定身份，模板样张只提供风格。',editToken:'content-token'};
const candidates=[['old-portrait','old','old-attempt',portrait],['old-landscape','old','old-attempt',landscape],['new-landscape','new','new-attempt',landscape],['new-portrait','new','new-attempt',portrait],['imported','browser-import','unknown',portrait]].map(([id,requestId,attemptId,url])=>({id,requestId,attemptId,url,assetHash:id,originalName:id+'.png',accepted:false}));
const summary={template:{id:'template',version:1},styleSampleCount:2,hasOwnPhoto:false,count:2,ratio:'3:4',sizePolicy:'ratio-minimum',pixels:{width:768,height:1024},outputFormat:'png'};
const jobs=['old','new'].map(id=>({id,requestHash:id,inputHash:id,activeAttemptId:null,summary,attempts:[{attemptId:id+'-attempt',host:'workbuddy',status:'committed',reason:'initial',failure:null}]}));
let view={content,jobs,candidates,selectedCandidateId:'old-portrait'},serial=0;
let details={id:content.id,editToken:'metadata-0',materials:[{id:'material',originalName:'本次资料.txt',detectedType:'text/plain',bytes:30,availability:'available',assetHash:'material-hash'}],coverVariants:[],candidates:candidates.map(item=>({...item,favorite:false,note:'',displayNumber:'',variantId:null}))};
const assets={templates:[{id:'template',version:1,name:'清爽图文组',description:'整组有横竖两种样张。',accepted:false,aiTested:false,builtin:false,samples:[{assetHash:'portrait',url:portrait},{assetHash:'landscape',url:landscape}]}],photos:[{id:'photo',title:'我的本人照',url:portrait,assetHash:'photo-hash',isOwnPhoto:true,availability:'available'}]};
const library={contentDetails:[details],templates:assets.templates,photos:assets.photos,settings:{defaults:{templateId:'template',photoId:'',coverCount:2},customRatios:[]}};
const ok=value=>({ok:true,value});
window.mutations=[];
window.contentHub={listCoverAssets:async()=>ok(assets),readCover:async()=>ok(view),exportCover:async input=>{window.exported=input;return ok({exported:true});},selectCover:async input=>{view={...view,selectedCandidateId:input.candidateId};return ok(view);},mutateWorkspace:async input=>{window.mutations.push(input);details={...details,editToken:'metadata-'+(++serial),candidates:details.candidates.map(item=>item.id===input.candidateId?{...item,favorite:input.favorite,note:input.note,displayNumber:input.displayNumber,variantId:input.variantId}:item)};return ok({library:{...library,contentDetails:[details]}});},generateCover:async input=>{window.generated=input;const attempt={attemptId:'live-attempt',host:'workbuddy',status:'created',reason:'initial',failure:null};view={...view,jobs:[...jobs,{id:'live',requestHash:'live',inputHash:'live',activeAttemptId:attempt.attemptId,summary,attempts:[attempt]}]};return ok({...view,launchRequested:true});},continueCover:async input=>{window.continued=input;return ok({launchRequested:true});}};
function Probe(){const [busy,setBusy]=useState(false),[assistant,setAssistant]=useState('workbuddy');window.chooseAssistant=setAssistant;return <CoverPanel library={library} status={{currentName:'isolated-fixture',assistant}} content={content} dirty={false} busy={busy} blocked={false} refreshToken={0} readAutomatically={async()=>({assets,cover:view})} run={async action=>{setBusy(true);try{return await action();}catch(error){window.probeError=error.message;throw error;}finally{setBusy(false);}}} onContent={()=>{}}/>;}
createRoot(document.getElementById('root')).render(<div style={{padding:24,maxWidth:1160,margin:'auto',fontFamily:'sans-serif'}}><Probe/></div>);
`);
  await build({configFile:false,root,base:'./',resolve:{alias:{react:path.join(workbench,'node_modules/react'),'react-dom':path.join(workbench,'node_modules/react-dom')}},oxc:{jsx:{runtime:'automatic'}},build:{outDir:path.join(root,'dist'),modulePreload:false,target:'chrome148'}});
  async function probeMain(probeRoot) {
    const {app,BrowserWindow}=await import('electron');
    const {default:assert}=await import('node:assert/strict');
    const {default:fs}=await import('node:fs/promises');
    const {default:path}=await import('node:path');
    const {default:os}=await import('node:os');
    app.setPath('userData',path.join(probeRoot,'machine'));
    await app.whenReady();
    const window=new BrowserWindow({show:false,width:1280,height:900,webPreferences:{contextIsolation:true,nodeIntegration:false}});
    const run=source=>window.webContents.executeJavaScript(source);
    const wait=condition=>run(`new Promise((resolve,reject)=>{const end=Date.now()+4000;const check=()=>{if(${condition})return resolve(true);if(Date.now()>end)return reject(new Error('State timeout: '+${JSON.stringify(condition)}));setTimeout(check,15)};check()})`);
    const click=(selector,text)=>run(`(()=>{const button=[...document.querySelectorAll(${JSON.stringify(selector)})].find(el=>el.textContent===${JSON.stringify(text)});if(!button||button.disabled)throw new Error('Missing enabled button: '+${JSON.stringify(text)});button.click()})()`);
    const paint=()=>run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    const enter=(selector,value)=>run(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    try {
      await window.loadFile(path.join(probeRoot,'dist/index.html'));
      await wait('document.querySelectorAll(".cover-result-card").length===5');
      assert.deepEqual(await run('[...document.querySelectorAll(".cover-result-group")].map(el=>el.getAttribute("aria-label"))'),['第 2 批封面','第 1 批封面','历史候选']);
      assert.deepEqual(await run('[...document.querySelectorAll(".cover-candidate-number")].map(el=>el.textContent)'),['03','04','01','02','05']);
      assert.equal(await run(`(()=>{const frames=[...document.querySelectorAll('.cover-result-image')];return frames.every(frame=>{const a=frame.querySelector('.cover-artwork-original'),b=frame.querySelector('.cover-artwork-backdrop');return a.src===b.src&&getComputedStyle(a).objectFit==='contain'&&getComputedStyle(b).objectFit==='cover'&&getComputedStyle(b).filter.includes('blur(18px)')&&b.getAttribute('aria-hidden')==='true';});})()`),true);
      await click('.cover-result-card:first-child button','收藏');
      await wait('window.mutations.length===1 && document.querySelector(".cover-result-card:first-child button[aria-pressed=true]")');
      assert.equal(await run('window.mutations[0].favorite'),true);
      assert.equal(await run('window.mutations[0].candidateId'),'new-landscape');
      await click('.cover-result-card:first-child button','备注');
      await wait('document.querySelector(".management-dialog[open] textarea")');
      await enter('.management-dialog textarea','保留横图的完整标题与边界');
      await click('.management-dialog button','暂时收起');
      await wait('document.querySelector(".management-resume") && !document.querySelector(".management-dialog[open]")');
      assert.equal(await run('[...document.querySelectorAll(".cover-result-actions button[aria-pressed]")].every(button=>button.disabled&&button.title.includes("先保存或放弃"))'),true,'minimized candidate draft blocks favorite changes');
      assert.equal(await run('[...document.querySelectorAll(".cover-result-actions button")].filter(button=>button.textContent==="备注").every(button=>button.disabled)'),true,'another note entry cannot replace the minimized draft');
      await run('document.querySelector(".cover-result-actions button[aria-pressed]").click()');
      assert.equal(await run('window.mutations.length'),1,'disabled favorite cannot silently mutate or discard a draft');
      await click('.management-resume button','继续编辑');
      await wait('document.querySelector(".management-dialog[open] textarea")');
      assert.equal(await run('document.querySelector(".management-dialog textarea").value'),'保留横图的完整标题与边界','minimized notes survive attempted favorite action');
      await click('.management-dialog button','保存候选信息');
      await wait('window.mutations.length===2 && !document.querySelector(".management-dialog")');
      assert.equal(await run('window.mutations[1].favorite'),true,'notes retain saved favorite');
      assert.equal(await run('window.mutations[1].editToken'),'metadata-1','notes use latest saved token');
      assert.equal(await run('document.querySelector(".cover-result-card:first-child .cover-result-caption > p").textContent'),'保留横图的完整标题与边界');
      await click('.cover-result-card:first-child button','选为封面');
      await wait('document.querySelector(".cover-result-card:first-child.is-selected")');
      await click('.cover-result-card:first-child button','下载');
      await wait('window.exported?.candidateId==="new-landscape"');
      const screenshots=await fs.mkdtemp(path.join(os.tmpdir(),'nova-cover-gallery-ui-shots-'));
      await paint();
      await fs.writeFile(path.join(screenshots,'gallery-wide.png'),(await window.webContents.capturePage()).toPNG());
      await click('.cover-toolbar button','再生成一批');
      await wait('document.querySelector(".cover-create-dialog[open]") && !document.getElementById("generate-cover").disabled');
      assert.equal(await run('document.querySelector(".cover-template-browser").open'),false,'chosen template keeps composer concise');
      assert.equal(await run('document.querySelector(".cover-advanced").open'),false);
      assert.equal(await run('(()=>{const button=document.getElementById("generate-cover");return getComputedStyle(button.querySelector("span")).color===getComputedStyle(button).color;})()'),true,'footer helper text styling preserves action contrast');
      assert.equal(await run('document.querySelectorAll(".cover-sample-grid input:checked").length'),2);
      assert.equal(await run('document.querySelectorAll(".cover-materials input:checked").length'),0,'materials require explicit selection');
      assert.equal(await run('document.querySelector(".cover-content-summary p").textContent.includes("已保存的正文摘要")'),true);
      await paint();
      await fs.writeFile(path.join(screenshots,'composer-wide.png'),(await window.webContents.capturePage()).toPNG());
      for(const [width,height] of [[900,700],[620,700]]) {
        window.setSize(width,height);
        await paint();
        assert.equal(await run('document.documentElement.scrollWidth<=innerWidth'),true,'page avoids horizontal overflow');
        assert.equal(await run('(()=>{const el=document.querySelector(".cover-create-dialog"),r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;})()'),true,'composer fits viewport');
        assert.equal(await run('document.querySelector(".cover-create-settings").scrollWidth<=document.querySelector(".cover-create-settings").clientWidth'),true,'settings avoid horizontal overflow');
        assert.equal(await run('(()=>{const frame=document.querySelector(".cover-style-preview"),image=frame.querySelector(".cover-artwork-original"),a=frame.getBoundingClientRect(),b=image.getBoundingClientRect();return b.width<=a.width&&b.height<=a.height;})()'),true,'full-image element remains inside preview frame');
      }
      await fs.writeFile(path.join(screenshots,'composer-narrow.png'),(await window.webContents.capturePage()).toPNG());
      await enter('#cover-photo','photo');
      await wait('document.getElementById("cover-photo").value==="photo"');
      await click('#no-person','这次不放人物');
      await wait('document.getElementById("cover-photo").value===""');
      await run('document.querySelector(".cover-advanced").open=true;document.querySelector(".cover-materials input").click()');
      await wait('document.querySelector(".cover-materials input").checked');
      await click('#generate-cover','去 WorkBuddy 生成封面');
      await wait('window.generated && !document.querySelector(".cover-create-dialog") && document.getElementById("continue-cover")');
      assert.equal(await run('window.generated.input.photo'),null);
      assert.deepEqual(await run('window.generated.input.styleAssetHashes'),['portrait','landscape']);
      assert.deepEqual(await run('window.generated.input.materialIds'),['material']);
      assert.equal(await run('window.generated.input.count'),2);
      assert.equal(await run('window.generated.input.scope'),'cover-only');
      await run('window.chooseAssistant("codex")');
      await wait('document.getElementById("continue-cover").textContent==="去 Codex 继续"');
      assert.equal(await run('[...document.querySelectorAll("button")].filter(el=>/去 (Codex|WorkBuddy) 继续/.test(el.textContent)).length'),1);
      await click('#continue-cover','去 Codex 继续');
      await wait('window.continued?.attemptId==="live-attempt"');
      assert.equal(await run('window.probeError??null'),null);
      console.log('PASS isolated real React/Semi/Electron: all batches and historical candidates, full-image blur previews, favorite/notes/select/export, concise composer, 900/620px layout, explicit materials, no-person input, single current-assistant continuation. Synthetic IPC and assets only; no real generation or user library.');
      console.log('Screenshots: '+screenshots);
      app.exit(0);
    }catch(error){console.error(error);app.exit(1);}
  }
  await fs.writeFile(path.join(root,'main.mjs'),`(${probeMain.toString()})(${JSON.stringify(root)})`);
  await new Promise((resolve,reject)=>{
    const child=spawn(electron,[path.join(root,'main.mjs')],{env:process.env,stdio:'inherit'});
    const timeout=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('Cover gallery UI probe timed out'));},45000);
    child.once('error',reject);
    child.once('close',code=>{clearTimeout(timeout);code===0?resolve():reject(new Error('Cover gallery UI probe failed: '+code));});
  });
}finally{await fs.rm(root,{recursive:true,force:true});}
