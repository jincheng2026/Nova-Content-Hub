// Actual shared viewer and Chromium input, synthetic images and isolated userData only.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import electron from 'electron';
import {build} from 'vite';
const workbench = fileURLToPath(new URL('../', import.meta.url));
const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'nova-image-gestures-')));
const evidence = path.resolve(process.argv[2] ?? path.join(root, 'evidence'));
await fs.mkdir(evidence, {recursive: true});
await fs.writeFile(path.join(root, 'index.html'), '<html lang="zh-CN"><meta charset="utf-8"><div id="root"></div><script type="module" src="/probe.jsx"></script></html>');
await fs.writeFile(path.join(root, 'probe.jsx'), `
import {useState} from 'react';import {createRoot} from 'react-dom/client';
import '${workbench}/node_modules/@douyinfe/semi-ui-19/react19-adapter';
import '${workbench}/node_modules/@douyinfe/semi-ui-19/lib/es/_base/base.css';
import '${workbench}/src/renderer/style.css';
import {CoverImageViewer,ImagePreviewButton} from '${workbench}/src/renderer/cover-image-viewer.tsx';
window.errors=[];window.addEventListener('error',e=>window.errors.push(e.message));
const art=(w,h)=>'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'"><rect width="100%" height="100%" fill="#e8f1fc"/><path d="M0 0L'+w+' '+h+'M'+w+' 0L0 '+h+'" stroke="#0071e3" stroke-width="8"/><text x="20" y="60" font-size="40">完整原图 '+w+' × '+h+'</text></svg>');
window.sources=[art(1200,1600),art(300,200),art(100,10000),art(10000,100),'data:image/png;base64,invalid'];
function Fixture(){const [index,setIndex]=useState(0),[open,setOpen]=useState(true),[nested,setNested]=useState(false);window.switchImage=setIndex;window.openViewer=setOpen;window.showNested=setNested;return nested?<dialog ref={e=>{if(e&&!e.open)e.showModal()}} onKeyDown={e=>{if(e.key==='Escape')window.outerEscape=true}}><ImagePreviewButton url={window.sources[0]} label="嵌套原图"/></dialog>:open?<CoverImageViewer url={window.sources[index]} label={'手势测试 '+index} close={()=>setOpen(false)}/>:<button onClick={()=>setOpen(true)}>重新打开</button>;}createRoot(document.getElementById('root')).render(<Fixture/>);
`);
await build({configFile: false, root, base: './', resolve: {alias: {react: path.join(workbench, 'node_modules/react'), 'react-dom': path.join(workbench, 'node_modules/react-dom')}}, oxc: {jsx: {runtime: 'automatic'}}, build: {outDir: path.join(root, 'dist'), modulePreload: false, target: 'chrome148'}, logLevel: 'error'});
async function main(root, evidence) {
  const {app, BrowserWindow} = await import('electron');
  const {default: fs} = await import('node:fs/promises'), {default: path} = await import('node:path'), {default: assert} = await import('node:assert/strict');
  app.setPath('userData', path.join(root, 'machine'));
  await app.whenReady();
  const win = new BrowserWindow({show: true, width: 1280, height: 860, webPreferences: {contextIsolation: true, nodeIntegration: false}});
  const run = source => win.webContents.executeJavaScript(source);
  const paint = () => run('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  const wait = condition => run(`new Promise((resolve,reject)=>{const end=Date.now()+5000;function check(){if(${condition})return resolve();if(Date.now()>end)return reject(Error(${JSON.stringify(condition)}));setTimeout(check,20)}check()})`);
  const shot = async name => {await paint(); await fs.writeFile(path.join(evidence, name + '.png'), (await win.webContents.capturePage()).toPNG());};
  const button = async text => {await run(`[...document.querySelectorAll('button')].find(e=>e.textContent===${JSON.stringify(text)}).click()`); await paint();};
  const state = () => run(`(()=>{const s=document.querySelector('.cover-viewer-stage'),i=s.querySelector('img'),r=i?.getBoundingClientRect();return {scale:r?.width/i?.naturalWidth,left:s.scrollLeft,top:s.scrollTop,width:s.clientWidth,height:s.clientHeight,natural:[i?.naturalWidth,i?.naturalHeight],image:[r?.width,r?.height],source:i?.src,dragging:s.classList.contains('is-dragging'),page:visualViewport.scale}})()`);
  const point = () => run(`(()=>{const s=document.querySelector('.cover-viewer-stage'),r=s.getBoundingClientRect();return {x:Math.round(r.left+s.clientWidth*.7),y:Math.round(r.top+s.clientHeight*.65)}})()`);
  const pixel = p => run(`(()=>{const i=document.querySelector('.cover-viewer-stage img'),r=i.getBoundingClientRect();return {x:(${p.x}-r.left)/(r.width/i.naturalWidth),y:(${p.y}-r.top)/(r.height/i.naturalHeight)}})()`);
  const wheel = async (p, deltaY, modifiers = 0, buttons = 0) => {await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {type: 'mouseWheel', ...p, deltaX: 0, deltaY, modifiers, buttons}); await paint();};
  const mouse = (type, p, extra = {}) => win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {type, ...p, ...extra});
  const key = async keyCode => {await run('document.querySelector(".cover-viewer-stage")?.focus()'); win.webContents.sendInputEvent({type: 'keyDown', keyCode}); win.webContents.sendInputEvent({type: 'keyUp', keyCode}); await paint();};
  const select = async index => {await run('window.switchImage(' + index + ')'); await paint(); await wait(index === 4 ? '!!document.querySelector(".cover-viewer-stage [role=alert]")' : 'document.querySelector(".cover-viewer-stage img")?.naturalWidth>0'); await paint();};
  const records = [], check = (name, value) => {assert.ok(value, name); records.push({name, passed: true});};
  try {
    await win.loadFile(path.join(root, 'dist/index.html'));
    await wait('document.querySelector(".cover-viewer-stage img")?.naturalWidth===1200'); await paint();
    win.webContents.debugger.attach();
    for (const [width, height] of [[1280, 860], [960, 680]]) {
      win.setContentSize(width, height); await paint(); await button('适合窗口');
      let p = await point(), before = await state();
      await wheel(p, -100, 2); let after = await state();
      check('Ctrl/pinch wheel zooms image ' + width, Math.abs(after.scale / before.scale - Math.exp(.2)) < .01);
      check('Ctrl wheel leaves document zoom unchanged ' + width, after.page === 1 && win.webContents.getZoomFactor() === 1);
      await button('原始尺寸'); await run('document.querySelector(".cover-viewer-stage").scrollTo(200,300)'); await paint();
      p = await point(); const anchor = await pixel(p);
      await wheel(p, -100, 4); const anchored = await pixel(p);
      check('Meta wheel keeps offcenter image pixel ' + width, Math.abs(anchor.x - anchored.x) < 2 && Math.abs(anchor.y - anchored.y) < 2);
      before = await state(); await wheel(p, 120); after = await state();
      check('Plain wheel scrolls without zoom ' + width, after.scale === before.scale && after.top > before.top);
      // One JS task forces all wheel handlers to run before React can commit.
      await button('原始尺寸'); await run('document.querySelector(".cover-viewer-stage").scrollTo(100,200)'); await paint();
      p = await point(); const burstAnchor = await pixel(p);
      await run(`(()=>{const s=document.querySelector('.cover-viewer-stage');for(let n=0;n<20;n++)s.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,ctrlKey:true,deltaY:-10,clientX:${p.x},clientY:${p.y}}))})()`); await paint(); after = await state();
      const burstAfter = await pixel(p);
      check('Rapid wheel deltas accumulate ' + width, Math.abs(after.scale - Math.exp(.4)) < .001);
      check('Rapid wheel anchor remains stable ' + width, Math.abs(burstAnchor.x - burstAfter.x) < 2 && Math.abs(burstAnchor.y - burstAfter.y) < 2);
      await button('原始尺寸'); await run(`(()=>{const s=document.querySelector('.cover-viewer-stage');for(const deltaY of [-100,100])s.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,ctrlKey:true,deltaY,clientX:${p.x},clientY:${p.y}}))})()`); await paint();
      check('Reversed burst returns to original scale ' + width, Math.abs((await state()).scale - 1) < .001);
      await wheel(p, -100000, 2); check('Maximum 800% ' + width, Math.abs((await state()).scale - 8) < .001);
      await wheel(p, 100000, 2); check('Minimum 5% ' + width, Math.abs((await state()).scale - .05) < .001);
      await button('适合窗口'); p = await point();
      for (let n = 1; n <= 2; n++) {await mouse('mousePressed', p, {button: 'left', buttons: 1, clickCount: n}); await mouse('mouseReleased', p, {button: 'left', buttons: 0, clickCount: n});} await paint();
      check('Doubleclick opens original detail ' + width, Math.abs((await state()).scale - 1) < .001);
      await run(`document.querySelector('.cover-viewer-stage').dispatchEvent(new MouseEvent('dblclick',{bubbles:true,clientX:${p.x},clientY:${p.y}}))`); await paint();
      check('Second doubleclick returns to fit ' + width, await run('[...document.querySelectorAll("button")].find(b=>b.textContent==="适合窗口").getAttribute("aria-pressed")==="true"'));
      await mouse('mousePressed', p, {button: 'left', buttons: 1, clickCount: 1}); before = await state(); await wheel(p, -100, 0, 1); after = await state();
      check('Held primary button wheel zooms ' + width, after.scale > before.scale);
      await mouse('mouseReleased', p, {button: 'left', buttons: 0, clickCount: 1});
      await button('原始尺寸'); await run('document.querySelector(".cover-viewer-stage").scrollTo(0,0)'); await paint(); p = await point();
      await mouse('mousePressed', p, {button: 'left', buttons: 1, clickCount: 1}); await mouse('mouseMoved', {x: p.x - 60, y: p.y - 60}, {button: 'left', buttons: 1}); await paint();
      check('Primary drag pans both axes ' + width, (await state()).left > 0 && (await state()).top > 0);
      await run('document.querySelector(".cover-viewer-stage").dispatchEvent(new PointerEvent("pointercancel",{bubbles:true,pointerId:1}))'); await paint();
      check('Pointercancel clears drag ' + width, !(await state()).dragging);
      await mouse('mouseReleased', p, {button: 'left', buttons: 0, clickCount: 1});
      before = await state(); await wheel(p, 80); after = await state(); check('Canceled drag does not hijack later plain wheel ' + width, after.scale === before.scale);
      await key('1'); check('Keyboard 1 original ' + width, (await state()).scale === 1); await key('-'); check('Keyboard minus ' + width, (await state()).scale === .8); await key('+'); check('Keyboard plus ' + width, (await state()).scale === 1); await key('0');
      await shot('gestures-' + width);
    }
    await select(1); let p = await run(`(()=>{const r=document.querySelector('.cover-viewer-stage img').getBoundingClientRect();return {x:Math.round(r.left+r.width*.6),y:Math.round(r.top+r.height*.6)}})()`); const smallAnchor = await pixel(p);
    // Enough enlargement to cross both centered whitespace and overflow boundaries.
    await wheel(p, -750, 2); const smallAfter = await pixel(p);
    check('Small centered image cursor anchor across overflow', Math.abs(smallAnchor.x - smallAfter.x) < 2 && Math.abs(smallAnchor.y - smallAfter.y) < 2);
    await button('适合窗口'); await run(`document.querySelector('.cover-viewer-stage').dispatchEvent(new MouseEvent('dblclick',{bubbles:true,clientX:${p.x},clientY:${p.y}}))`); await paint(); check('Small original doubles on doubleclick', (await state()).scale === 2);
    for (const index of [2, 3]) {
      await select(index); const fit = await state(); check('Extreme aspect ratio fits ' + index, fit.image[0] <= fit.width + 1 && fit.image[1] <= fit.height + 1);
      await button('原始尺寸'); p = await point(); const initial = await state(); await wheel(p, 100); const scrolled = await state();
      if (index === 2) check('Long image plain wheel retains reading scroll', scrolled.top > initial.top && scrolled.scale === initial.scale);
      await run('document.querySelector(".cover-viewer-stage").scrollTo(100000,100000)'); const end = await state(); check('Extreme image opposite end reachable ' + index, end.left > 0 || end.top > 0);
    }
    await select(0); await button('原始尺寸'); p = await point();
    for (const [mode, delta, pixels] of [[1, -2, 32], [2, -.2, (await state()).height * .2]]) {
      await button('原始尺寸'); await run(`document.querySelector('.cover-viewer-stage').dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,ctrlKey:true,deltaMode:${mode},deltaY:${delta},clientX:${p.x},clientY:${p.y}}))`); await paint();
      check('Wheel deltaMode normalization ' + mode, Math.abs((await state()).scale - Math.exp(pixels * .002)) < .001);
    }
    await button('原始尺寸');
    await run(`(()=>{const s=document.querySelector('.cover-viewer-stage');s.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,ctrlKey:true,deltaY:-300,clientX:${p.x},clientY:${p.y}}));window.switchImage(1)})()`); await paint(); await wait('document.querySelector(".cover-viewer-stage img")?.naturalWidth===300'); await paint();
    check('URL switch discards pending zoom and scroll', (await state()).scale === 1 && (await state()).left === 0 && (await state()).top === 0);
    await select(4); check('Error disables zoom controls', await run('[...document.querySelectorAll(".image-zoom-controls button")].every(b=>b.disabled)')); p = await point(); await wheel(p, -100, 2); check('Error pinch still prevents page zoom', win.webContents.getZoomFactor() === 1 && await run('visualViewport.scale===1'));
    await select(0); check('Valid URL recovers after image error', (await state()).natural[0] === 1200);
    await button('原始尺寸'); p = await point(); await mouse('mousePressed', p, {button: 'left', buttons: 1, clickCount: 1});
    check('Capture acquired before blur', (await state()).dragging && await run('document.querySelector(".cover-viewer-stage").hasPointerCapture(1)'));
    await run('window.dispatchEvent(new Event("blur"))'); await paint(); check('Window blur clears drag and capture', !(await state()).dragging && await run('!document.querySelector(".cover-viewer-stage").hasPointerCapture(1)'));
    await mouse('mouseReleased', p, {button: 'left', buttons: 0, clickCount: 1});
    await mouse('mousePressed', p, {button: 'left', buttons: 1, clickCount: 1}); await mouse('mouseMoved', {x:p.x-1,y:p.y}, {button: 'left', buttons: 1}); await run('document.querySelector(".cover-viewer-stage").releasePointerCapture(1)'); await mouse('mouseMoved', p, {button: 'left', buttons: 1}); await paint();
    check('Lost pointer capture clears drag', !(await state()).dragging); await mouse('mouseReleased', p, {button: 'left', buttons: 0, clickCount: 1});
    check('Preview keeps original source', await run('document.querySelector(".cover-viewer-stage img").src===window.sources[0]'));
    await run('window.oldStage=document.querySelector(".cover-viewer-stage");window.openViewer(false)'); await paint();
    check('Unmount removes native wheel listener', await run('window.oldStage.dispatchEvent(new WheelEvent("wheel",{ctrlKey:true,deltaY:-100,cancelable:true}))'));
    await run('window.openViewer(true)'); await wait('document.querySelector(".cover-viewer-stage img")?.naturalWidth===1200'); await paint();
    p = await point(); const reopened = await state(); await wheel(p, -100, 2);
    check('Remount installs one wheel listener', Math.abs((await state()).scale / reopened.scale - Math.exp(.2)) < .01);

    await run('window.showNested(true)'); await wait('!!document.querySelector(".image-preview-trigger")'); await run('document.querySelector(".image-preview-trigger").click()'); await wait('document.querySelectorAll("dialog[open]").length===2'); await key('Escape'); await wait('document.querySelectorAll("dialog[open]").length===1'); check('Nested escape returns focus and preserves outer layer', await run('!window.outerEscape&&document.activeElement.className==="image-preview-trigger"'));
    check('No renderer errors', (await run('window.errors')).length === 0);
    const result = {passed: true, platform: process.platform, arch: process.arch, electron: process.versions.electron, checks: records, scope: 'Source component in Chromium/Electron using CDP wheel and mouse input plus synchronous burst/cancel lifecycle events. No installed application or physical trackpad/Windows validation.'};
    await fs.writeFile(path.join(evidence, 'result.json'), JSON.stringify(result, null, 2));
    console.log('PASS ' + records.length + ' image gesture checks. Evidence: ' + evidence); app.exit(0);
  } catch (error) {await shot('failure'); console.error(error); console.error('Evidence:', evidence); app.exit(1);}
}
await fs.writeFile(path.join(root, 'main.mjs'), `(${main.toString()})(${JSON.stringify(root)},${JSON.stringify(evidence)});`);
const child = spawn(electron, [path.join(root, 'main.mjs')], {stdio: 'inherit', env: {...process.env, ELECTRON_RUN_AS_NODE: ''}});
const timer = setTimeout(() => child.kill('SIGKILL'), 60000);
process.exitCode = await new Promise(resolve => child.once('exit', code => {clearTimeout(timer); resolve(code ?? 1);}));
console.log('Probe fixture:', root);
