// Actual React/Semi components; synthetic data and isolated Electron userData only.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import electron from 'electron';
import {build} from 'vite';
import {fileURLToPath} from 'node:url';
const workbench = fileURLToPath(new URL('../', import.meta.url));
const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'nova-collection-preview-')));
await fs.writeFile(path.join(root, 'index.html'), '<html lang="zh-CN"><div id="root"></div><script type="module" src="/probe.jsx"></script></html>');
await fs.writeFile(path.join(root, 'probe.jsx'), `
import {createRoot} from 'react-dom/client';
import '${workbench}/node_modules/@douyinfe/semi-ui-19/react19-adapter';
import '${workbench}/node_modules/@douyinfe/semi-ui-19/lib/es/_base/base.css';
import '${workbench}/src/renderer/style.css';
import {Overview} from '${workbench}/src/renderer/workspace-pages.tsx';
import {ContentList} from '${workbench}/src/renderer/content-list.tsx';
const picture=(width,height,label,color)=>'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="'+height+'"><rect width="100%" height="100%" rx="12" fill="'+color+'"/><rect x="4" y="4" width="'+(width-8)+'" height="'+(height-8)+'" fill="none" stroke="#17446d" stroke-width="4"/><text x="50%" y="50%" text-anchor="middle" font-size="20" fill="#17446d">'+label+'</text></svg>');
const portrait=picture(108,144,'竖图','#d9e9fb'), landscape=picture(192,108,'横图','#e7eedc');
const doc=(id,url)=>({id,title:'内容'+id,body:'原始正文不变',updatedAt:'2026-10-22',deletedAt:null,plans:[],channelIds:[],candidates:url?[{id:'selected',url},{id:'unselected',url:landscape}]:[],candidateCount:url?2:0,selectedCandidateId:url?'selected':null,coverVariants:[],publications:[],publicationEvents:[]});
const appRoot=createRoot(document.getElementById('root')); window.calls=[];
window.contentHub=new Proxy({},{get:(_,method)=>async input=>{throw Error('Unexpected native call '+method);}});
window.fixture=(scenario,screen)=>{
 let members=[doc('a',portrait),doc('b',landscape)];
 if(scenario==='empty')members=[];
 if(scenario==='one')members=members.slice(0,1);
 if(scenario==='recycled')members[0].deletedAt='2026-10-22';
 if(scenario==='invalid')members.forEach(item=>item.selectedCandidateId='missing');
 if(scenario==='unselected')members.forEach(item=>item.selectedCandidateId=null);
 if(scenario==='broken')members.forEach(item=>item.candidates[0].url='data:image/png;base64,broken'+item.id);
 if(scenario==='partial-broken')members[0].candidates[0].url='data:image/png;base64,broken';
 if(scenario==='duplicate')members[1].candidates[0].url=portrait;
 const collection={...doc('group'),title:'旅行生活与日常记录的长合集标题'.repeat(8),memberIds:members.map(item=>item.id).concat('missing-member')};
 if(scenario==='empty')collection.memberIds=[];
 window.workspace={contents:members,channels:[]};window.library={contentDetails:members,collections:[collection],settings:{channels:[]}};
 window.original=JSON.stringify({workspace:window.workspace,library:window.library});
 window.calls=[];
 appRoot.render(<main key={scenario+screen}><aside className="app-navigation">隔离验收</aside><div className="app-stage">{screen==='overview'?<Overview workspace={window.workspace} library={window.library} busy={false} open={()=>{}} openCollection={target=>window.calls.push(target)}/>:<ContentList contents={members.filter(item=>!item.deletedAt)} workspace={window.workspace} library={window.library} query="" setQuery={()=>{}} view="active" busy={false} blocked={false} ready={true} changeView={()=>{}} open={()=>{}} recycle={()=>{}} openCollection={id=>window.calls.push(id)}/>}</div></main>);
};
window.fixture('two','overview');
`);
await build({configFile:false,root,base:'./',resolve:{alias:{react:path.join(workbench,'node_modules/react'),'react-dom':path.join(workbench,'node_modules/react-dom')}},oxc:{jsx:{runtime:'automatic'}},build:{outDir:path.join(root,'dist'),modulePreload:false,target:'chrome148'}});
async function probeMain(probeRoot) {
 const {app,BrowserWindow}=await import('electron');const {default:assert}=await import('node:assert/strict');const {default:path}=await import('node:path');const {default:fs}=await import('node:fs/promises');
 app.setPath('userData',path.join(probeRoot,'machine'));await app.whenReady();const win=new BrowserWindow({show:false,useContentSize:true,width:1280,height:860,webPreferences:{contextIsolation:true,nodeIntegration:false}});const run=source=>win.webContents.executeJavaScript(source);
 const results=[];
 try {
  await win.loadFile(path.join(probeRoot,'dist/index.html'));
  for(const [width,height] of [[1280,860],[960,680],[760,680]]) {
   win.setContentSize(width,height);
   for(const screen of ['overview','contents'])for(const [scenario,count] of Object.entries({empty:0,one:1,two:2,recycled:1,invalid:0,unselected:0,broken:0,'partial-broken':1,duplicate:1})) {
    await run('window.fixture('+JSON.stringify(scenario)+','+JSON.stringify(screen)+')');
    await run('new Promise(resolve=>setTimeout(resolve,50))');
    await run('document.querySelector(".collection-preview").scrollIntoView({block:"center",behavior:"instant"})');
    for(let attempt=0;attempt<40;attempt++){if(await run('document.querySelectorAll(".collection-preview img").length==='+count+' && [...document.querySelectorAll(".collection-preview img")].every(img=>img.complete&&img.naturalWidth>0)'))break;await run('new Promise(resolve=>setTimeout(resolve,50))');}
    await run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    const result=await run(`(()=>{const preview=document.querySelector('.collection-preview'),button=preview.closest('button'),box=preview.getBoundingClientRect(),title=button.querySelector('strong').getBoundingClientRect();return {scenario:${JSON.stringify(scenario)},screen:${JSON.stringify(screen)},width:innerWidth,height:innerHeight,count:preview.querySelectorAll('img').length,declared:Number(preview.dataset.images),fallback:!!preview.querySelector('.collection-preview-empty'),bounded:box.right<=title.left+1&&title.right<=button.getBoundingClientRect().right+1,overflow:document.documentElement.scrollWidth>innerWidth,images:[...preview.querySelectorAll('img')].map(img=>{const r=img.getBoundingClientRect();return {loaded:img.complete&&img.naturalWidth>0,fit:getComputedStyle(img).objectFit,ratio:r.width/r.height,naturalRatio:img.naturalWidth/img.naturalHeight,bounded:r.left>=box.left&&r.right<=box.right&&r.top>=box.top&&r.bottom<=box.bottom}}),unchanged:JSON.stringify({workspace:window.workspace,library:window.library})===window.original};})()`);
    assert.equal(result.width,width);assert.equal(result.height,height);assert.equal(result.count,count,scenario+' '+screen);assert.equal(result.declared,count);assert.equal(result.fallback,count===0);assert.equal(result.bounded,true);assert.equal(result.overflow,false);assert.equal(result.unchanged,true);
    for(const img of result.images){assert.equal(img.loaded,true);assert.equal(img.fit,'contain');assert.equal(img.bounded,true);assert.ok(Math.abs(img.ratio-img.naturalRatio)<0.02,'image aspect ratio');}
    await run('document.querySelector(".collection-preview").closest("button").click()');
    assert.deepEqual(await run('window.calls'),screen==='overview'?[{kind:'collection',id:'group'}]:['group']);
    results.push(result);
    if(['empty','one','two','broken'].includes(scenario))await fs.writeFile(path.join(probeRoot,screen+'-'+scenario+'-'+width+'.png'),(await win.webContents.capturePage()).toPNG());
   }
  }
  await fs.writeFile(path.join(probeRoot,'results.json'),JSON.stringify(results,null,2));console.log('PASS '+results.length+' React/Semi/Electron collection cases; 0/1/2, recycled/missing/unselected/broken/duplicate; intact ratio, bounds, navigation payload and immutable fixture. Evidence: '+probeRoot);app.exit(0);
 }catch(error){await fs.writeFile(path.join(probeRoot,'failure.png'),(await win.webContents.capturePage()).toPNG());console.error(error);console.error('Evidence: '+probeRoot);app.exit(1);}
}
await fs.writeFile(path.join(root,'probe-main.mjs'),'('+probeMain.toString()+')('+JSON.stringify(root)+');');
const child=spawn(electron,[path.join(root,'probe-main.mjs')],{stdio:'inherit',env:{...process.env,ELECTRON_RUN_AS_NODE:''}});
const timer=setTimeout(()=>child.kill('SIGKILL'),120000);
process.exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>resolve(code??1));});clearTimeout(timer);console.log('Probe fixture: '+root);
