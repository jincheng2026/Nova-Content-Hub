// Dense template gallery in actual React/Semi/Electron; synthetic library and IPC only.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import electron from 'electron';
import {build} from 'vite';
const workbench=fileURLToPath(new URL('../',import.meta.url));
const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'nova-template-density-')));
    await fs.writeFile(path.join(root, 'index.html'), '<html lang="zh-CN"><div id="root"></div><script type="module" src="/probe.jsx"></script></html>');
    await fs.writeFile(path.join(root, 'probe.jsx'), `
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import ${JSON.stringify(path.join(workbench, 'node_modules/@douyinfe/semi-ui-19/react19-adapter'))};
import ${JSON.stringify(path.join(workbench, 'node_modules/@douyinfe/semi-ui-19/lib/es/_base/base.css'))};
import ${JSON.stringify(path.join(workbench, 'src/renderer/style.css'))};
import {TemplatesPage} from ${JSON.stringify(path.join(workbench, 'src/renderer/workspace-pages.tsx'))};
const templates = Array.from({length: 16}, (_, i) => ({id: 'template-' + i, title: '参考模板 ' + i, name: '参考模板 ' + i, description: '整组参考样张，保留完整横竖画面和所有文字。这是一段刻意很长的说明，用来核对密集卡片仍然保持两行摘要，完整内容可在整组预览里阅读。', builtin: i > 1, version: 1, currentVersion: 1, versions: [{version: 1, packageHash: 'hash-' + i}], editToken: 'token-' + i, deletedAt: null, rules: [], accepted: false, aiTested: false, samples: Array.from({length: i === 0 ? 6 : 2},(_,n)=>({assetHash:'sample-'+i+'-'+n,url:'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="'+((n+i)%2?640:300)+'" height="400"><rect width="100%" height="100%" fill="'+((n+i)%2?'#6d557e':'#476d8b')+'"/><rect x="8" y="8" width="'+((n+i)%2?624:284)+'" height="384" stroke="white" fill="none" stroke-width="5"/><text x="50%" y="50%" fill="white" font-size="24" text-anchor="middle">完整原图 '+(n+1)+'</text></svg>')}))}));
let pendingCopy = null;
window.reads = 0; window.writes = [];
window.contentHub = {
  readTemplateWorkflow: async ({templateId}) => {
    window.reads++;
    const template = window.probe.library.templates.find(t => t.id === templateId);
    const requestId = 'request-' + templateId;
    const attempts = [0, 1].map(i => ({attemptId: 'attempt-' + i, host: 'codex', status: 'cancelled', reference: {templateId, requestId, sourceVersion: 1, sourcePackageHash: template.versions[0].packageHash}}));
    return {ok: true, value: {...template, templateId, jobs: template.builtin ? [] : [{id: requestId, attempts, activeAttemptId: null, acceptance: null}]}};
  },
  readTemplateAssistantSetup: async () => ({ok: true, value: {host: 'codex', ready: true}}),
  mutateWorkspace: async input => {
    window.writes.push(input);
    pendingCopy = {...window.probe.library.templates.find(t => t.id === input.sourceTemplateId), id: 'derived-template', title: input.name, name: input.name, builtin: false};
    return {ok: true, value: {objectId: pendingCopy.id}};
  }
};
function Probe() {
  const [library, setLibrary] = useState({templates, photos: [], settings: {defaults: {coverCount: 1}}});
  const [assets, setAssets] = useState({templates, photos: []}), [busy, setBusy] = useState(false);
  async function refresh() {
    const copy = pendingCopy;
    setLibrary(old => ({...old, templates: copy ? [...old.templates, copy] : [...old.templates]}));
    setAssets(old => ({...old, templates: copy ? [...old.templates, copy] : [...old.templates]}));
    pendingCopy = null;
  }
  window.probe = {library, refresh};
  return <main><aside className="app-navigation">隔离验证</aside><div className="app-stage"><header className="app-header"><h1>自媒体工作台</h1></header><TemplatesPage library={library} assets={assets} busy={busy} run={async action => {setBusy(true); try {await action();} finally {setBusy(false);}}} refresh={refresh} useTemplate={template => {window.usedTemplate=template.id;}} managePhotos={() => {window.configurationOpened=(window.configurationOpened??0)+1;}}/></div></main>;
}
createRoot(document.getElementById('root')).render(<Probe/>);
`);

await build({configFile:false,root,base:'./',resolve:{alias:{react:path.join(workbench,'node_modules/react'),'react-dom':path.join(workbench,'node_modules/react-dom')}},oxc:{jsx:{runtime:'automatic'}},build:{outDir:path.join(root,'dist'),modulePreload:false,target:'chrome148'}});
async function probeMain(probeRoot){
 const {app,BrowserWindow}=await import('electron');
 const {default:assert}=await import('node:assert/strict');
 const {default:path}=await import('node:path');
 const {default:fs}=await import('node:fs/promises');
 app.setPath('userData',path.join(probeRoot,'machine'));await app.whenReady();
 const win=new BrowserWindow({show:false,width:1280,height:1000,webPreferences:{contextIsolation:true,nodeIntegration:false}});
 const run=source=>win.webContents.executeJavaScript(source);
 const wait=condition=>run(`new Promise((resolve,reject)=>{const end=Date.now()+5000;const check=()=>{if(${condition})return resolve(true);if(Date.now()>end)return reject(new Error('State timeout: '+${JSON.stringify(condition)}));setTimeout(check,20)};check()})`);
 const paint=()=>run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
 const click=text=>run(`[...document.querySelectorAll('button')].find(button=>button.textContent.trim()===${JSON.stringify(text)}).click()`);
 try{
  await win.loadFile(path.join(probeRoot,'dist/index.html'));await wait('document.querySelectorAll(".creator-style-card").length===16');
  assert.equal(await run('!!document.querySelector(".creator-template-sidebar")'),false,'configuration no longer consumes the gallery width');
  for(const [width,columns] of [[1280,5],[1600,5],[1080,4],[900,3],[700,2]]){
   win.setSize(width,1000);await paint();
   assert.equal(await run('getComputedStyle(document.querySelector(".creator-template-grid")).gridTemplateColumns.split(" ").length'),columns,width+' gallery columns');
   assert.equal(await run('document.documentElement.scrollWidth<=innerWidth'),true,width+' has no page overflow');
   assert.equal(await run(`(()=>{const grid=document.querySelector('.creator-template-grid').getBoundingClientRect(),library=document.querySelector('.creator-template-library').getBoundingClientRect();return Math.abs(grid.width-library.width)<1;})()`),true,'gallery fills available workspace width');
   assert.equal(await run(`(()=>{const first=document.querySelector('.creator-style-card'),frame=first.querySelector('.creator-reference-stack').getBoundingClientRect();return Math.abs(frame.width/frame.height-.75)<.01&&first.getBoundingClientRect().height<450;})()`),true,'concise cards retain reachable actions');
   if(width>=1280)await fs.writeFile(path.join(probeRoot,'templates-'+width+'.png'),(await win.webContents.capturePage()).toPNG());
  }
  assert.equal(await run(`([...document.querySelectorAll('.creator-template-original')].every(el=>getComputedStyle(el).objectFit==='contain'))`),true,'all original image previews stay uncropped');
  assert.equal(await run(`getComputedStyle(document.querySelector('.creator-reference-backdrop')).filter.includes('blur(')`),true,'preview uses blurred original backdrop');
  assert.equal(await run('document.querySelectorAll(".creator-stack-sheet,.creator-sample-strip,.creator-style-description").length'),0,'gallery keeps only the original image and concise caption');
  assert.equal(await run(`(()=>{const wrapper=document.querySelector('.creator-template-search'),input=wrapper.querySelector('input'),a=wrapper.getBoundingClientRect(),b=input.getBoundingClientRect(),style=getComputedStyle(input);return Math.abs((a.top+a.height/2)-(b.top+b.height/2))<1&&style.textAlign==='left'&&parseFloat(style.paddingTop)===0&&parseFloat(style.paddingBottom)===0;})()`),true,'search text is vertically centered and left aligned');
  await run('document.querySelector(".creator-template-use").focus()');await wait('getComputedStyle(document.querySelector(".creator-template-use")).opacity==="1"');
  assert.equal(await run('getComputedStyle(document.querySelector(".creator-template-use")).opacity'),'1','keyboard focus reveals the use action');
  await run('document.querySelector(".creator-template-use").click()');assert.equal(await run('window.usedTemplate'),'template-0','primary use action remains connected');
  await click('照片与默认设置');assert.equal(await run('window.configurationOpened'),1,'uses existing configuration callback');
  await run('document.querySelector(".creator-reference-stack").click()');await wait('document.querySelector(".image-preview[open]")');
  assert.equal(await run('document.querySelectorAll(".image-preview .preview-grid img").length'),6,'group preview includes all six original references');
  assert.equal(await run('document.querySelector(".creator-preview-description").textContent'),await run('window.probe.library.templates[0].description'),'full description remains accessible');
  await click('关闭预览');await wait('!document.querySelector(".image-preview")');
  await run('document.querySelector(".creator-template-details").open=true;document.querySelector(".creator-style-actions button:last-child").click()');await wait('document.querySelector(".template-workflow h3")?.textContent==="参考模板 0 · 学习与还原"');
  assert.equal(await run('document.activeElement.id'),'template-learning-workflow','learning and restore still focus their own workflow');
  assert.equal(await run('!!document.querySelector(".template-study-notes textarea")'),true,'personal template learning controls retained');
  assert.deepEqual(await run('window.writes'),[],'gallery and configuration entry make no business writes');
  console.log('PASS actual React/Semi/Electron: full-width 5-column image gallery, responsive 4/3/2 columns, centered left-aligned search, keyboard use action, no sidebar/overflow, uncropped blurred originals, all group samples/full description, configuration callback, learning workflow focus. Synthetic assets/IPC only.');
  console.log('Screenshots:',path.join(probeRoot,'templates-1280.png'),path.join(probeRoot,'templates-1600.png'));app.exit(0);
 }catch(error){console.error(error);app.exit(1);}
}
await fs.writeFile(path.join(root,'probe-main.mjs'),`(${probeMain.toString()})(${JSON.stringify(root)});`);
const child=spawn(electron,[path.join(root,'probe-main.mjs')],{stdio:'inherit',env:{...process.env,ELECTRON_RUN_AS_NODE:''}});
process.exitCode=await new Promise(resolve=>child.on('exit',code=>resolve(code??1)));
console.log('Probe fixture:',root);
