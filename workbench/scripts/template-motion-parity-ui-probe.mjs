// Isolated React/Semi/Electron fixture. Only synthetic images and callbacks; no library IPC.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import electron from 'electron';
import {build} from 'vite';
const workbench = fileURLToPath(new URL('../', import.meta.url));
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-template-motion-'));
await fs.writeFile(path.join(root, 'index.html'), '<html lang="zh-CN"><div id="root"></div><script type="module" src="/probe.jsx"></script></html>');
await fs.writeFile(path.join(root, 'probe.jsx'), `
import {createRoot} from 'react-dom/client';
import '${workbench}/node_modules/@douyinfe/semi-ui-19/react19-adapter';
import '${workbench}/node_modules/@douyinfe/semi-ui-19/lib/es/_base/base.css';
import '${workbench}/src/renderer/style.css';
import {TemplatePreview} from '${workbench}/src/renderer/template-preview.tsx';
const sample=i=>({assetHash:'synthetic-'+i,url:'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="'+(i%2?1200:300)+'" height="'+(i%2?300:400)+'"><rect width="100%" height="100%" fill="#0071e3"/><rect x="4" y="4" width="98%" height="97%" stroke="white" fill="none"/><text x="15" y="60" fill="white" font-size="40">Sample '+i+'</text></svg>')});
window.actions=[];
const template=n=>({id:'group-'+n,version:1,name:'真实'+n+'张',builtin:false,samples:Array.from({length:n},(_,i)=>sample(i))});
createRoot(document.getElementById('root')).render(<div style={{display:'flex',gap:20,padding:30}}>{[1,2,6,50].map(n=><div key={n} data-group={n} style={{width:210}}><TemplatePreview template={template(n)} disabled={false} select={()=>window.actions.push('select-'+n)} preview={()=>window.actions.push('preview-'+n)}/></div>)}</div>);
`);
await build({configFile:false,root,base:'./',resolve:{alias:{react:path.join(workbench,'node_modules/react'),'react-dom':path.join(workbench,'node_modules/react-dom')}},oxc:{jsx:{runtime:'automatic'}},build:{outDir:path.join(root,'dist'),modulePreload:false,target:'chrome148'}});
async function main(root) {
  const {app,BrowserWindow}=await import('electron'), {default:assert}=await import('node:assert/strict'), {default:fs}=await import('node:fs/promises'), {default:path}=await import('node:path');
  app.setPath('userData',path.join(root,'machine')); await app.whenReady();
  const win=new BrowserWindow({show:false,width:1100,height:700,webPreferences:{contextIsolation:true,nodeIntegration:false}});
  const run=source=>win.webContents.executeJavaScript(source);
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const paint=()=>run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  const current=n=>run(`document.querySelector('[data-group="${n}"] .sheet-0 img').alt`);
  const click=async selector=>{await run(`document.querySelector(${JSON.stringify(selector)}).click()`);await paint();};
  try {
    await win.loadFile(path.join(root,'dist/index.html')); await pause(150); await paint();
    assert.equal(await run('document.querySelectorAll("button button").length'),0);
    assert.equal(await run('document.querySelectorAll(\'[data-group="1"] .creator-stack-sheet\').length'),1,'one image never gains fake backing');
    assert.equal(await run('document.querySelectorAll(\'[data-group="2"] .creator-stack-sheet\').length'),2,'two images never gain third backing');
    assert.equal(await run('document.querySelectorAll(\'[data-group="6"] .creator-stack-sheet\').length'),6,'real reference deck includes later samples');
    assert.equal(await run('document.querySelectorAll(\'[data-group="50"] .creator-stack-sheet\').length'),8,'reference uses bounded eight image deck');
    assert.equal(await run('document.querySelector(\'[data-group="50"] .creator-sample-count\').textContent'),'整组 50 张','full group count is not preview cap');
    assert.equal(await run('[...document.querySelectorAll(".creator-stack-sheet img")].every(img=>getComputedStyle(img).objectFit==="contain")'),true,'all images remain uncropped');
    assert.equal(await run('getComputedStyle(document.querySelector(\'[data-group="6"] .sheet-0\')).transitionDuration'),'1s, 1s','source deck easing duration');
    await run('document.querySelector(\'[data-group="6"] .creator-template-preview\').dispatchEvent(new PointerEvent("pointerover",{bubbles:true,pointerType:"mouse"}))'); await paint();
    const first=await current(6); await pause(850); assert.equal(await current(6),first,'hover initial dwell matches source'); await pause(450); assert.notEqual(await current(6),first,'first hover flip at 1100ms');
    const second=await current(6); await pause(1000); assert.equal(await current(6),second,'no premature second flip'); await pause(1450); assert.notEqual(await current(6),second,'subsequent hover flip at 2400ms');
    await run('document.querySelector(\'[data-group="6"] .creator-template-preview\').dispatchEvent(new PointerEvent("pointerout",{bubbles:true,pointerType:"mouse"}))'); await paint(); const stopped=await current(6); await pause(2450); assert.equal(await current(6),stopped,'leaving stops playback');
    await click('[data-group="6"] [aria-label="下一张样张：真实6张"]'); await click('[data-group="6"] [aria-label="下一张样张：真实6张"]'); assert.match(await current(6),/样张 5$/,'manual controls reach later samples without choosing template');
    await run('document.querySelector(\'[data-group="6"] .creator-reference-stack\').dispatchEvent(new KeyboardEvent("keydown",{key:"End",bubbles:true}))');await paint();assert.match(await current(6),/样张 6$/,'keyboard reaches last deck sample');
    await run('document.querySelector(\'[data-group="6"] .creator-reference-stack\').dispatchEvent(new KeyboardEvent("keydown",{key:"Home",bubbles:true}))');await paint();assert.match(await current(6),/样张 1$/,'keyboard returns to first deck sample');
    assert.deepEqual(await run('window.actions'),[],'browsing never selects or previews');
    await pause(1100);
    await fs.writeFile(path.join(root,'ordinary.png'),(await win.webContents.capturePage()).toPNG());
    win.webContents.debugger.attach();await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await pause(50);
    await run('document.querySelector(\'[data-group="6"] .creator-template-preview\').dispatchEvent(new PointerEvent("pointerover",{bubbles:true,pointerType:"mouse"}))');await paint();const reduced=await current(6);await pause(1400);assert.equal(await current(6),reduced,'system reduced motion disables automatic flips');
    await click('[data-group="6"] [aria-label="下一张样张：真实6张"]');assert.match(await current(6),/样张 2$/,'touch/click control remains usable with reduced motion');
    assert.equal(await run('getComputedStyle(document.querySelector(\'[data-group="6"] .sheet-1\')).transform'),await run('(()=>{const e=document.querySelector(\'[data-group="2"] .sheet-1\');return getComputedStyle(e).transform;})()'),'reduced motion retains identical static fanned geometry');
    await click('[data-group="50"] [aria-label="查看整组：真实50张"]');assert.deepEqual(await run('window.actions'),['preview-50'],'full group remains separately accessible');
    await fs.writeFile(path.join(root,'reduced-motion.png'),(await win.webContents.capturePage()).toPNG());
    console.log('PASS: reference cadence/easing, bounded real deck, one/two/50 image counts, manual/keyboard browsing, no selection side effects, contain, reduced-motion static deck. Synthetic fixture only.');app.exit(0);
  } catch(error) { console.error(error);await fs.writeFile(path.join(root,'failure.png'),(await win.webContents.capturePage()).toPNG());app.exit(1); }
}
await fs.writeFile(path.join(root,'main.mjs'),`(${main.toString()})(${JSON.stringify(root)})`);
const child=spawn(electron,[path.join(root,'main.mjs')],{stdio:'inherit',env:{...process.env,ELECTRON_RUN_AS_NODE:''}});
const timer=setTimeout(()=>child.kill('SIGKILL'),45000);
const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);}).finally(()=>clearTimeout(timer));
console.log('Evidence:',root);assert.equal(code,0);
