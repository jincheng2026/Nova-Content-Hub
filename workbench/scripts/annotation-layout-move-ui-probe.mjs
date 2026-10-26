// Real React/Semi UI in an isolated Electron window; synthetic assets and IPC only.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import electron from 'electron';
import {build} from 'vite';

const workbench = fileURLToPath(new URL('../', import.meta.url));
const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'nova-annotation-layout-move-')));
try {
  await fs.writeFile(path.join(root, 'index.html'), '<html lang="zh-CN"><div id="root"></div><script type="module" src="/probe.jsx"></script></html>');
  await fs.writeFile(path.join(root, 'probe.jsx'), `
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import ${JSON.stringify(path.join(workbench, 'node_modules/@douyinfe/semi-ui-19/react19-adapter'))};
import ${JSON.stringify(path.join(workbench, 'node_modules/@douyinfe/semi-ui-19/lib/es/_base/base.css'))};
import ${JSON.stringify(path.join(workbench, 'src/renderer/style.css'))};
import {annotationNote,readAnnotationNote} from ${JSON.stringify(path.join(workbench, 'src/renderer/cover-gallery.ts'))};
import TextArea from ${JSON.stringify(path.join(workbench,'node_modules/@douyinfe/semi-ui-19/lib/es/input/textarea'))};
import {CoverPanel} from ${JSON.stringify(path.join(workbench, 'src/renderer/covers.tsx'))};
const artwork=(w,h,color,label)=>'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'"><rect width="100%" height="100%" fill="'+color+'"/><rect x="8" y="8" width="'+(w-16)+'" height="'+(h-16)+'" fill="none" stroke="white" stroke-width="5"/><text x="50%" y="50%" text-anchor="middle" fill="white" font-size="32">'+label+'</text></svg>');
const portrait=artwork(300,400,'#426b9a','竖图完整边界'),landscape=artwork(640,360,'#8a6144','横图完整边界');
const content={id:'content',title:'让每一张候选都清楚可选',body:'已保存的正文摘要。本人照只决定身份，模板样张只提供风格。',editToken:'content-token'};
const candidates=[['old-portrait','old','old-attempt',portrait],['old-landscape','old','old-attempt',landscape],['new-landscape','new','new-attempt',landscape],['new-portrait','new','new-attempt',portrait],['imported','browser-import','unknown',portrait]].map(([id,requestId,attemptId,url])=>({id,requestId,attemptId,url,assetHash:id,originalName:id+'.png',accepted:false}));
const summary={template:{id:'template',version:1},styleSampleCount:2,hasOwnPhoto:false,count:2,ratio:'3:4',sizePolicy:'ratio-minimum',pixels:{width:768,height:1024},outputFormat:'png'};
const jobs=['old','new'].map(id=>({id,requestHash:id,inputHash:id,activeAttemptId:null,summary,attempts:[{attemptId:id+'-attempt',host:'workbuddy',status:'committed',reason:'initial',failure:null}]}));
let view={content,jobs,candidates,selectedCandidateId:'old-portrait'},serial=0;
let details={id:content.id,editToken:'metadata-0',materials:[{id:'material',originalName:'本次资料.txt',detectedType:'text/plain',bytes:30,availability:'available',assetHash:'material-hash'},{id:'material-pdf',originalName:'本次资料.pdf',detectedType:'application/pdf',bytes:40,availability:'available',assetHash:'pdf-hash'},{id:'unselected',originalName:'不选资料.txt',detectedType:'text/plain',bytes:20,availability:'available',assetHash:'unselected-hash'}],coverVariants:[],candidates:candidates.map(item=>({...item,favorite:false,note:'',displayNumber:'',variantId:null}))};
const fixturePoints=[{x:20,y:20,text:'原位置\\n  保留缩进'},{type:'rect',x:40,y:25,width:20,height:20,text:'原矩形'},{type:'path',points:[{x:25,y:70},{x:45,y:80},{x:60,y:65}],text:'原划线'}];
if(location.hash==='#cap')for(let i=3;i<20;i++)fixturePoints.push({x:85,y:5+i*3,text:'位置'+i});
window.fixtureNote=annotationNote(fixturePoints,'原整体要求');window.readAnnotationNote=readAnnotationNote;
details.candidates=details.candidates.map((item,i)=>({...item,note:item.id==='new-landscape'?window.fixtureNote:item.id==='old-portrait'?'很长的普通备注'.repeat(100):''}));
const assets={templates:[{id:'template',version:1,currentVersion:1,name:'清爽图文组',description:'整组有横竖两种样张。',accepted:false,aiTested:false,builtin:false,samples:[{assetHash:'portrait',url:portrait},{assetHash:'landscape',url:landscape}]}],photos:[{id:'photo',title:'我的本人照',url:portrait,assetHash:'photo-hash',isOwnPhoto:true,availability:'available'}]};
const library={contentDetails:[details],templates:assets.templates,photos:assets.photos,settings:{defaults:{templateId:'template',photoId:'',coverCount:2},customRatios:[]}};
const ok=value=>({ok:true,value});
window.annotationSources={landscape,portrait,wide:artwork(1200,200,'#926347','宽图完整边界'),tall:artwork(200,1200,'#457192','长图完整边界')};window.mutations=[];
window.contentHub={readProductionCreation:async()=>ok({content:view.content,creation:null}),revealCoverFolder:async input=>{window.folderRequest=input;window.folderRequests=(window.folderRequests??0)+1;const revealed=!window.cancelFolder;window.cancelFolder=false;return ok({revealed});},listCoverAssets:async()=>ok(assets),readCover:async()=>ok(view),exportCover:async input=>{window.exported=input;return ok({exported:true});},selectCover:async input=>{view={...view,selectedCandidateId:input.candidateId};return ok(view);},mutateWorkspace:async input=>{window.mutations.push(input);if(input.op==='updateCandidate')window.latestNote=input.note;details=input.op==='attachMaterial'?{...details,editToken:'metadata-'+(++serial),materials:[...details.materials,{id:'refinement-material',assetHash:input.assetHash,role:input.role,originalName:input.originalName,availability:'available',bytes:100,detectedType:'image/png'}]}:{...details,editToken:'metadata-'+(++serial),candidates:details.candidates.map(item=>item.id===input.candidateId?{...item,favorite:input.favorite,note:input.note,displayNumber:input.displayNumber,variantId:input.variantId}:item)};view={...view,content:{...view.content,editToken:details.editToken}};return ok({library:{...library,contentDetails:[details]}});},cancelCover:async()=>{view={...view,jobs};return ok(view);},generateCover:async input=>{if(window.failGenerateOnce){window.failGenerateOnce=false;return {ok:false,error:{code:'TEST_GENERATE_FAILURE',message:'模拟助手启动失败'}};}window.generated=input;const attempt={attemptId:'live-attempt',host:'workbuddy',status:'created',reason:'initial',failure:null};view={...view,jobs:[...jobs,{id:'live',requestHash:'live',inputHash:'live',activeAttemptId:attempt.attemptId,summary,attempts:[attempt]}]};return ok({...view,launchRequested:true});},continueBoundCover:async input=>{window.continued=input;return ok({launchRequested:true});},continueCover:async input=>{window.continued=input;return ok({launchRequested:true});}};
function Probe(){const [busy,setBusy]=useState(false),[assistant,setAssistant]=useState('workbuddy'),[blocked,setBlocked]=useState(false),[activeContent,setActiveContent]=useState(content);window.chooseAssistant=setAssistant;window.forceBusy=setBusy;window.forceBlocked=setBlocked;window.changeContent=()=>{const next={...content,id:'other-content',title:'另一篇内容'};view={content:next,jobs:[],candidates:[],selectedCandidateId:null};details={...details,id:next.id,materials:[],candidates:[]};library.contentDetails=[details];setActiveContent(next);};return <CoverPanel library={library} status={{currentName:'isolated-fixture',assistant}} content={activeContent} dirty={false} busy={busy} blocked={blocked} refreshToken={0} readAutomatically={async()=>({assets,cover:view})} run={async action=>{setBusy(true);try{return await action();}catch(error){window.probeError=error.message;return undefined;}finally{setBusy(false);}}} onContent={()=>{}}/>;}
window.contentHub.readWorkspaceContent=async()=>ok({...content,...details});window.contentHub.updateCoverCandidate=async input=>{await window.contentHub.mutateWorkspace(input);return ok({...content,...details});};
createRoot(document.getElementById('root')).render(<div style={{padding:24,maxWidth:1160,margin:'auto',fontFamily:'sans-serif'}}><Probe/><div style={{position:"absolute",left:-1000,width:300}}><TextArea id="autosize-fixture" textareaStyle={{minHeight:0}} autosize={{minRows:2,maxRows:6}}/><TextArea id="disabled-fixture" disabled defaultValue="禁用内容"/></div></div>);
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
    const run=source=>window.webContents.executeJavaScript(source).catch(error=>{throw new Error('Renderer probe failed: '+source, {cause:error});});
    const wait=condition=>run(`new Promise((resolve,reject)=>{const end=Date.now()+4000;const check=()=>{if(${condition})return resolve(true);if(Date.now()>end)return reject(new Error('State timeout: '+${JSON.stringify(condition)}));setTimeout(check,15)};check()})`);
    const click=(selector,text)=>run(`(()=>{const button=[...document.querySelectorAll(${JSON.stringify(selector)})].find(el=>(el.textContent===${JSON.stringify(text)}||el.getAttribute("aria-label")===${JSON.stringify(text)}));if(!button||button.disabled)throw new Error('Missing enabled button: '+${JSON.stringify(text)});button.click()})()`);
    const paint=()=>run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    const enter=(selector,value)=>run(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    const trustedClick = async (x, y) => {
      const point = {x: Math.round(x), y: Math.round(y)};
      window.webContents.sendInputEvent({type: 'mouseMove', ...point});
      window.webContents.sendInputEvent({type: 'mouseDown', button: 'left', clickCount: 1, ...point});
      window.webContents.sendInputEvent({type: 'mouseUp', button: 'left', clickCount: 1, ...point});
      await paint(); return point;
    };
    const trustedDrag = async (coordinates, release = true) => {
      const rect = await run('document.querySelector(".cover-annotation-image img").getBoundingClientRect().toJSON()');
      const pixels = coordinates.map(([x,y]) => ({x: Math.round(rect.left + rect.width*x), y: Math.round(rect.top + rect.height*y)}));
      window.webContents.sendInputEvent({type:'mouseMove', ...pixels[0]});
      window.webContents.sendInputEvent({type:'mouseDown', button:'left', clickCount:1, ...pixels[0]}); await paint();
      for (const point of pixels.slice(1)) {window.webContents.sendInputEvent({type:'mouseMove', modifiers:['leftButtonDown'], ...point}); await paint();}
      if (release) {window.webContents.sendInputEvent({type:'mouseUp', button:'left', clickCount:1, ...pixels.at(-1)}); await paint();}
      return {rect,pixels};
    };
    const imagePoint = async (x, y) => {
      const rect = await run('document.querySelector(".cover-annotation-image img").getBoundingClientRect().toJSON()');
      const clicked = await trustedClick(rect.left + rect.width * x, rect.top + rect.height * y);
      await wait('document.querySelector(".cover-annotation-marker.is-draft") && document.getElementById("annotation-point-text")');
      const marker = await run('document.querySelector(".cover-annotation-marker.is-draft").getBoundingClientRect().toJSON()');
      assert.ok(Math.abs(marker.left + marker.width / 2 - clicked.x) <= 1, 'marker center matches trusted pointer x');
      assert.ok(Math.abs(marker.top + marker.height / 2 - clicked.y) <= 1, 'marker center matches trusted pointer y');
      assert.equal(await run('document.querySelectorAll(".cover-annotation-note").length'),0,'unconfirmed points stay out of the right list');
      return clicked;
    };
    try {
      await window.loadFile(path.join(probeRoot,'dist/index.html'));
      await wait('document.querySelectorAll(".cover-result-card").length===5');
      const screenshots=process.env.NOVA_PROBE_EVIDENCE_DIR ?? path.join(os.tmpdir(),'nova-annotation-layout-move-shots');
      await fs.mkdir(screenshots,{recursive:true});
      const evidence={viewports:[],checks:[],synthetic:true};
      const beforeGrowth=await run('document.getElementById("autosize-fixture").getBoundingClientRect().height');
      await enter('#autosize-fixture','多行内容\n'.repeat(12));await paint();
      const afterGrowth=await run('document.getElementById("autosize-fixture").getBoundingClientRect().height');assert.ok(afterGrowth>beforeGrowth,'shared border fix preserves Semi autosize growth');
      assert.equal(await run('document.getElementById("disabled-fixture").disabled && getComputedStyle(document.getElementById("disabled-fixture")).borderTopWidth==="0px"'),true);evidence.autosize={beforeGrowth,afterGrowth};
      const shot=async name=>{await paint();await fs.writeFile(path.join(screenshots,name+'.png'),(await window.webContents.capturePage()).toPNG());};
      const open=async()=>{await click('.cover-result-card:first-child button','批注');await wait('document.getElementById("annotation-overall")');await paint();};
      const tool=async name=>{await run(`document.querySelector('.cover-annotation-tools [aria-label="${name}"]').click()`);await paint();};
      const geometry=()=>run('window.readAnnotationNote(window.latestNote || window.fixtureNote).points');
      const visibleGeometry=()=>run(`(()=>{const canvas=document.querySelector('.cover-annotation-canvas'),rect=canvas.getBoundingClientRect();return [...canvas.querySelectorAll(':scope > .cover-annotation-marker:not(.is-draft)')].map(el=>({x:parseFloat(el.style.left),y:parseFloat(el.style.top)}));})()`);
      const save=async()=>{await click('.cover-annotation-form button','保存批注');await wait('!document.querySelector(".cover-annotation-form")');await paint();};
      for(const [width,height] of [[1280,860],[960,680]]) {
        window.setContentSize(width,height);await paint();
        const rows=await run(`(()=>{const cards=[...document.querySelectorAll('.cover-result-card')];return cards.map(card=>({top:card.getBoundingClientRect().top,actions:card.querySelector('.cover-result-actions').getBoundingClientRect().top,noteRow:!!card.querySelector('.cover-result-caption > p')}))})()`);
        for(const row of rows) {assert.equal(row.noteRow,false);for(const other of rows.filter(other=>Math.abs(other.top-row.top)<1))assert.ok(Math.abs(other.actions-row.actions)<1,'same-row mixed notes/image aspects align actions');}
        assert.equal(await run('document.querySelector(".cover-result-caption").textContent.includes("x=")'),false);
        await shot('gallery-'+width+'x'+height);await open();
        const inputs=await run(`(()=>{const el=document.getElementById('annotation-overall'),outer=el.parentElement;return {tag:outer.className,innerBorder:getComputedStyle(el).borderTopWidth,innerMargin:getComputedStyle(el).marginTop,outerBorder:getComputedStyle(outer).borderTopWidth,height:el.clientHeight,minHeight:getComputedStyle(el).minHeight,toolCount:document.querySelectorAll('.cover-annotation-tools button[title][aria-label] svg').length};})()`);
        assert.equal(inputs.innerBorder,'0px');assert.equal(inputs.innerMargin,'0px');assert.equal(inputs.outerBorder,'1px');assert.ok(inputs.height>=100);assert.equal(inputs.minHeight,'100px');assert.equal(inputs.toolCount,4);
        await run('document.getElementById("annotation-overall").scrollIntoView({block:"center"});document.getElementById("annotation-overall").focus()');await paint();
        const focus=await run('getComputedStyle(document.getElementById("annotation-overall").parentElement).boxShadow');assert.notEqual(focus,'none');
        await shot('annotation-focus-'+width+'x'+height);evidence.viewports.push({width,height,rows,inputs,focus});
        await tool('选择 / 移动');assert.equal(await run('document.querySelector(".cover-annotation-tools button").getAttribute("aria-pressed")'),'true');
        await trustedDrag([[.2,.2],[.2,.2]]);await click('.management-dialog > .dialog-heading button','关闭');
        await wait('!document.querySelector(".management-dialog")');assert.equal(await run('window.mutations.length'),0,'no-op selection neither dirties nor saves');
      }
      window.setContentSize(1280,860);await paint();await open();await tool('选择 / 移动');
      // Move point from its marker; box from its visible interior; line from its visible middle.
      const initial=await geometry();
      for(const gesture of [[[.2,.2],[.3,.3]],[[.5,.35],[.6,.45]],[[.35,.75],[.45,.85]]])await trustedDrag(gesture);
      const moved=await visibleGeometry();
      assert.ok(Math.abs(moved[0].x-30)<.5 && Math.abs(moved[0].y-30)<.5,'point marker moved');
      assert.ok(Math.abs(moved[1].x-50)<.5 && Math.abs(moved[1].y-35)<.5,'box moved from visible shape');
      assert.ok(Math.abs(moved[2].x-35)<.5 && Math.abs(moved[2].y-80)<.5,'path moved from visible shape');
      assert.equal(await run('window.mutations.length'),0,'drag never autosaves');
      await click('.management-dialog > .dialog-heading button','关闭');await wait('document.querySelector(".management-dialog [role=alert]")');
      await click('.management-dialog [role=alert] button','继续填写');
      await shot('moved-point-box-path');
      // Roll back active motion on each interruption without losing prior committed draft moves.
      for(const cancellation of ['pointercancel','lostcapture','blur']) {
        const before=await visibleGeometry();
        await run('document.querySelector(".cover-annotation-marker").addEventListener("pointerdown",e=>window.movingPointer=e.pointerId,{once:true})');
        await trustedDrag([[moved[0].x/100,moved[0].y/100],[.4,.4]],false);
        assert.notDeepEqual(await visibleGeometry(),before,'active movement is visible');
        if(cancellation==='pointercancel')await run('document.querySelector(".cover-annotation-marker").dispatchEvent(new PointerEvent("pointercancel",{bubbles:true,pointerId:window.movingPointer}))');
        if(cancellation==='lostcapture')await run('document.querySelector(".cover-annotation-marker").releasePointerCapture(window.movingPointer)');
        if(cancellation==='blur')await run('window.dispatchEvent(new Event("blur"))');
        await paint();window.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,x:10,y:10});await paint();
        assert.deepEqual(await visibleGeometry(),before,cancellation+' rolls back only active movement');
      }
      await run('document.querySelector(".cover-annotation-note-edit").click()');
      await wait('document.getElementById("annotation-point-text")');
      assert.equal(await run('document.getElementById("annotation-point-text").value'),initial[0].text);
      assert.equal(await run('getComputedStyle(document.getElementById("annotation-point-text")).borderTopWidth'),'0px');
      await enter('#annotation-point-text','移动后仍可编辑\n  原样换行');await click('.cover-annotation-popover button','确认批注');
      await save();
      const saved=await geometry();assert.equal(saved[0].text,'移动后仍可编辑\n  原样换行');
      assert.equal(saved[1].width,initial[1].width);assert.equal(saved[1].height,initial[1].height);
      assert.equal(saved[2].points[1].x-saved[2].points[0].x,initial[2].points[1].x-initial[2].points[0].x);
      assert.equal(saved[2].points[1].y-saved[2].points[0].y,initial[2].points[1].y-initial[2].points[0].y);
      await open();await tool('选择 / 移动');
      assert.ok(Math.abs((await visibleGeometry())[0].x-saved[0].x)<.01,'save/reparse persists moved coordinates');
      // Whole shapes clamp at original image bounds, retaining size and spacing.
      await trustedDrag([[saved[1].x/100+.1,saved[1].y/100+.1],[1.25,1.25]]);await save();
      const bounded=await geometry();assert.ok(Math.abs(bounded[1].x+bounded[1].width-100)<.01);assert.ok(Math.abs(bounded[1].y+bounded[1].height-100)<.01);
      await open();await tool('选择 / 移动');await trustedDrag([[bounded[0].x/100,bounded[0].y/100],[-.01,-.01]]);await save();
      assert.deepEqual((await geometry())[0],{...saved[0],x:0,y:0});
      await open();await tool('选择 / 移动');await trustedDrag([[-.005,-.005],[.1,.1]]);await save();assert.ok((await geometry())[0].x>0 && (await geometry())[0].y>0,'edge marker remains draggable from its visible area beyond the image');
      await open();await tool('选择 / 移动');await trustedDrag([[saved[2].points[1].x/100,saved[2].points[1].y/100],[1.05,-.01]]);await save();
      const final=await geometry();assert.equal(Math.max(...final[2].points.map(p=>p.x)),100);assert.equal(Math.min(...final[2].points.map(p=>p.y)),0);
      // Existing drawing and text confirmation remain available.
      await open();await tool('标框');await trustedDrag([[.15,.3],[.35,.5]]);await wait('document.getElementById("annotation-point-text")');await enter('#annotation-point-text','新框');await click('.cover-annotation-popover button','确认批注');
      await tool('划线');await trustedDrag([[.1,.6],[.2,.5],[.3,.6]]);await wait('document.getElementById("annotation-point-text")');await enter('#annotation-point-text','新线');await click('.cover-annotation-popover button','确认批注');
      await tool('点选');await trustedDrag([[.6,.6],[.6,.6]]);await wait('document.getElementById("annotation-point-text")');await enter('#annotation-point-text','新点');await click('.cover-annotation-popover button','确认批注');await save();assert.equal((await geometry()).length,6);
      // Reopen at the cap: selection and movement remain usable while creation is blocked.
      await window.loadFile(path.join(probeRoot,'dist/index.html'),{query:{fixture:'cap'},hash:'cap'});await wait('document.querySelectorAll(".cover-result-card").length===5');await open();await tool('选择 / 移动');
      assert.equal(await run('document.querySelectorAll(".cover-annotation-note").length'),20);await trustedDrag([[.2,.2],[.3,.3]]);await save();assert.ok(Math.abs((await geometry())[0].x-30)<.5);assert.equal((await geometry()).length,20);
      await open();await tool('选择 / 移动');
      const latest=await run('window.latestNote');await click('.cover-annotation-form button','按批注修改');await wait('document.querySelector(".cover-refinement-confirm")');assert.equal(await run('document.querySelector(".cover-refinement-confirm pre").textContent.includes(window.latestNote)'),true,'refinement receives moved geometry verbatim');
      await shot('cap20-moved-refinement');await click('.cover-refinement-confirm button','继续调整批注');await run('document.querySelectorAll(".cover-annotation-marker")[1].click()');await paint();await click('.cover-annotation-note button','删除位置 1');assert.equal(await run('document.querySelectorAll(".cover-annotation-marker.is-selected").length'),0,'deletion clears stale index selection');
      evidence.checks=['same-row mixed-note actions','shared Semi textarea frame/focus/min-height','4 named icon buttons/pressed state','trusted point/rect/path movement','no-op remains clean','dirty draft close guard','cancel/lostcapture/blur rollback','no autosave','text edit/save/reopen','whole-shape clamp point/rect/path','existing drawing tools','move at 20 mark cap','full moved note in refinement confirmation'];
      evidence.saved=final;await fs.writeFile(path.join(screenshots,'evidence.json'),JSON.stringify(evidence,null,2));
      console.log('PASS annotation layout/move Electron probe: '+evidence.checks.join(', '));console.log('Screenshots: '+screenshots);app.exit(0);
    }catch(error){console.error(error);app.exit(1);}
  }
  await fs.writeFile(path.join(root,'main.mjs'),`(${probeMain.toString()})(${JSON.stringify(root)})`);
  await new Promise((resolve,reject)=>{
    const child=spawn(electron,[path.join(root,'main.mjs')],{env:process.env,stdio:'inherit'});
    const timeout=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('Cover gallery UI probe timed out'));},90000);
    child.once('error',reject);
    child.once('close',code=>{clearTimeout(timeout);code===0?resolve():reject(new Error('Cover gallery UI probe failed: '+code));});
  });
}finally{await fs.rm(root,{recursive:true,force:true});}
