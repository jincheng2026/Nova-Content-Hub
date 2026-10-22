// Real renderer in a hidden Electron window, with isolated synthetic artwork and IPC.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import electron from 'electron';
import {build} from 'vite';
const workbench=fileURLToPath(new URL('../',import.meta.url));
const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'unobstructed-cover-')));
const evidence=path.resolve(process.argv[2]??path.join(root,'evidence'));
try {
  await fs.mkdir(evidence,{recursive:true});
  await fs.writeFile(path.join(root,'index.html'),'<html lang="zh-CN"><div id="root"></div><script type="module" src="/probe.jsx"></script></html>');
  await fs.writeFile(path.join(root,'probe.jsx'),`
import {createRoot} from 'react-dom/client';
import ${JSON.stringify(path.join(workbench,'node_modules/@douyinfe/semi-ui-19/react19-adapter'))};
import ${JSON.stringify(path.join(workbench,'node_modules/@douyinfe/semi-ui-19/lib/es/_base/base.css'))};
import ${JSON.stringify(path.join(workbench,'src/renderer/style.css'))};
import {CoverPanel} from ${JSON.stringify(path.join(workbench,'src/renderer/covers.tsx'))};
const artwork=(w,h)=>'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'"><rect width="100%" height="100%" fill="#244a70"/><rect x="2" y="2" width="'+(w-4)+'" height="'+(h-4)+'" fill="none" stroke="#ffde6b" stroke-width="4"/><text x="50%" y="27" text-anchor="middle" fill="white" font-size="22">TOP 完整顶部</text><text x="50%" y="'+(h-10)+'" text-anchor="middle" fill="white" font-size="22">BOTTOM 完整底部</text></svg>');
const content={id:'content',title:'封面原图完整显示',body:'原图上边和下边均有文字。',editToken:'content-token'};
const candidates=[[300,400],[640,360],[400,400],[200,1000],[1000,200]].map(([w,h],index)=>({id:'c'+index,url:artwork(w,h),assetHash:'hash'+index,originalName:'候选'+index+'.svg',requestId:'history',attemptId:'history',accepted:false}));
let view={content,candidates,jobs:[],selectedCandidateId:'c0'};
let details={id:'content',editToken:'details-token',materials:[],coverVariants:[],candidates:candidates.map(item=>({...item,favorite:item.id==='c0',note:'',displayNumber:'',variantId:null}))};
const assets={templates:[],photos:[]};
const library={contentDetails:[details],templates:[],photos:[],settings:{defaults:{templateId:'',photoId:'',coverCount:2},customRatios:[]}};
const ok=value=>({ok:true,value});
window.originalSources=candidates.map(item=>item.url);window.calls=[];
window.contentHub={listCoverAssets:async()=>ok(assets),readCover:async()=>ok(view),selectCover:async input=>{window.calls.push(input);view={...view,selectedCandidateId:input.candidateId};return ok(view);},exportCover:async input=>{window.calls.push(input);return ok({exported:true});},mutateWorkspace:async input=>{window.calls.push(input);details={...details,candidates:details.candidates.map(item=>item.id===input.candidateId?{...item,favorite:input.favorite,note:input.note,displayNumber:input.displayNumber,variantId:input.variantId}:item)};return ok({library:{...library,contentDetails:[details]}});}};
window.contentHub.readWorkspaceContent=async()=>ok({...content,...details});window.contentHub.updateCoverCandidate=async input=>{await window.contentHub.mutateWorkspace(input);return ok({...content,...details});};
createRoot(document.getElementById('root')).render(<div style={{padding:24,maxWidth:1160,margin:'auto'}}><CoverPanel library={library} status={{currentName:'synthetic',assistant:'codex'}} content={content} dirty={false} busy={false} blocked={false} refreshToken={0} readAutomatically={async()=>({assets,cover:view})} run={async action=>{try{return await action();}catch(error){window.probeError=error.message;}}} onContent={()=>{}}/></div>);
`);
  await build({configFile:false,root,base:'./',resolve:{alias:{react:path.join(workbench,'node_modules/react'),'react-dom':path.join(workbench,'node_modules/react-dom')}},oxc:{jsx:{runtime:'automatic'}},build:{outDir:path.join(root,'dist'),modulePreload:false,target:'chrome148'}});
  async function main(root,evidence) {
    const {app,BrowserWindow}=await import('electron');
    const {default:assert}=await import('node:assert/strict');
    const {default:fs}=await import('node:fs/promises');
    const {default:path}=await import('node:path');
    app.setPath('userData',path.join(root,'userData'));await app.whenReady();
    const win=new BrowserWindow({show:false,width:1280,height:1000,webPreferences:{contextIsolation:true,nodeIntegration:false}});
    const run=source=>win.webContents.executeJavaScript(source).catch(error=>{throw new Error(source+": "+error.message);});
    const wait=condition=>run(`new Promise((resolve,reject)=>{let end=Date.now()+5000;function check(){if(${condition})return resolve();if(Date.now()>end)return reject(new Error('Timeout '+${JSON.stringify(condition)}));setTimeout(check,20)}check()})`);
    const paint=()=>run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    const click=(selector,text)=>run(`(()=>{const button=[...document.querySelectorAll(${JSON.stringify(selector)})].find(el=>el.textContent===${JSON.stringify(text)});if(!button||button.disabled)throw new Error('Missing enabled '+${JSON.stringify(text)});button.click()})()`);
    try {
      await win.loadFile(path.join(root,'dist/index.html'));await wait('document.querySelectorAll(".cover-result-card").length===5');
      for(const width of [1280,900,620]) {
        win.setSize(width,1000);await paint();
        await run('document.querySelectorAll(".cover-result-image img").forEach(img=>img.loading="eager")');
        await wait('[...document.querySelectorAll(".cover-result-image img")].every(img=>img.complete&&img.naturalWidth>0)');
        const rows=await run(`(()=>[...document.querySelectorAll('.cover-result-card')].map(card=>{
          const frame=card.querySelector('.cover-result-image'),image=frame.querySelector('.cover-artwork-original'),rect=frame.getBoundingClientRect(),caption=card.querySelector('.cover-result-caption').getBoundingClientRect();
          const regions=[...card.querySelectorAll('.cover-candidate-number,.cover-result-badges,.cover-card-tools,.cover-result-actions')].map(el=>el.getBoundingClientRect());
          const scale=Math.min(image.clientWidth/image.naturalWidth,image.clientHeight/image.naturalHeight);
          return {imagesOnly:!frame.querySelector('button,input,svg,.cover-candidate-number,.cover-result-badges')&&frame.textContent.trim()==='',fit:getComputedStyle(image).objectFit,captionOutside:caption.top>=rect.bottom-1,controlsOutside:regions.every(r=>r.top>=rect.bottom-1),fullWidth:image.naturalWidth*scale<=rect.width+1,fullHeight:image.naturalHeight*scale<=rect.height+1,focusable:frame.tabIndex>=0,label:frame.getAttribute('aria-label'),src:image.src};
        }))()`);
        assert.equal(rows.length,5);for(const row of rows){assert.equal(row.imagesOnly,true,JSON.stringify(row));assert.equal(row.fit,'contain');assert.equal(row.captionOutside,true);assert.equal(row.controlsOutside,true);assert.equal(row.fullWidth,true);assert.equal(row.fullHeight,true);assert.equal(row.focusable,true);assert.ok(row.label);}
        assert.deepEqual(rows.map(row=>row.src),await run('window.originalSources'),'renderer keeps source image URLs unchanged');
        await fs.writeFile(path.join(evidence,'gallery-'+width+'.png'),(await win.webContents.capturePage()).toPNG());
      }
      win.setSize(1280,1000);await paint();
      assert.equal(await run('document.querySelectorAll(".cover-result-card.is-selected .cover-result-actions button[aria-pressed=true]").length'),2);
      win.webContents.focus();await run('document.querySelector(".cover-result-image").focus()');
      win.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter'});win.webContents.sendInputEvent({type:'char',keyCode:'\r'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter'});
      await wait('document.querySelector(".image-preview[open]")');
      await fs.writeFile(path.join(evidence,'keyboard-preview.png'),(await win.webContents.capturePage()).toPNG());
      await click('.image-preview button','关闭预览');
      await run('document.querySelectorAll(".cover-card-title input")[0].click();document.querySelectorAll(".cover-card-title input")[1].click()');
      await click('.cover-gallery-toolbar button','并排比较（2）');await wait('document.querySelectorAll(".cover-compare-image").length===2');
      assert.equal(await run(`[...document.querySelectorAll(".cover-compare-image")].every(frame=>!frame.querySelector('button,input,svg')&&frame.textContent.trim()==='' &&getComputedStyle(frame.querySelector(".cover-artwork-original")).objectFit==="contain")`),true);
      await fs.writeFile(path.join(evidence,'compare.png'),(await win.webContents.capturePage()).toPNG());
      await click('.management-dialog button','关闭');
      await click('.cover-result-card:has([aria-label="放大候选 02"]) button','选用');await wait('document.querySelectorAll(".cover-result-card.is-selected .cover-result-actions button:disabled").length===1');
      await click('.cover-result-card:has([aria-label="放大候选 02"]) button','收藏');await wait('document.querySelectorAll(".cover-result-card.is-selected .cover-result-actions button[aria-pressed=true]").length===2');
      await click('.cover-result-card:has([aria-label="放大候选 02"]) button','下载');
      await click('.cover-result-card:has([aria-label="放大候选 02"]) button','⋯');await wait('document.querySelector(".management-dialog textarea")');
      await click('.management-dialog button','关闭');
      await click('.cover-result-card:has([aria-label="放大候选 02"]) button','批注');await wait('document.querySelector(".cover-annotation-image img")');
      assert.equal(await run('window.probeError??null'),null);
      const result={passed:true,scope:'Synthetic real React/Semi/hidden Electron; five aspect ratios at 1280/900/620 widths, exterior metadata/actions, unchanged image source URLs, contain, keyboard Enter preview, comparison, select/favorite/download/note/annotation entry. No user library or installed app.',screenshots:['gallery-1280.png','gallery-900.png','gallery-620.png','keyboard-preview.png','compare.png']};
      await fs.writeFile(path.join(evidence,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));app.exit(0);
    }catch(error){console.error(error);app.exit(1);}
  }
  await fs.writeFile(path.join(root,'main.mjs'),`(${main.toString()})(${JSON.stringify(root)},${JSON.stringify(evidence)})`);
  await new Promise((resolve,reject)=>{const child=spawn(electron,[path.join(root,'main.mjs')],{env:process.env,stdio:'inherit'});const timer=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('Probe timeout'));},60000);child.once('error',reject);child.once('close',code=>{clearTimeout(timer);code===0?resolve():reject(new Error('Probe failed '+code));});});
}finally{await fs.rm(root,{recursive:true,force:true});}
