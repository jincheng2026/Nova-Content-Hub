// Layered template gallery in actual React/Semi/Electron; synthetic library and IPC only.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import electron from 'electron';
import {build} from 'vite';
const workbench=fileURLToPath(new URL('../',import.meta.url));
const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'nova-design-system-')));
    await fs.writeFile(path.join(root, 'index.html'), '<html lang="zh-CN"><div id="root"></div><script type="module" src="/probe.jsx"></script></html>');
    await fs.writeFile(path.join(root, 'probe.jsx'), `
import {useState} from 'react';
import Button from ${JSON.stringify(path.join(workbench,'node_modules/@douyinfe/semi-ui-19/lib/es/button'))};
import {ContentList} from ${JSON.stringify(path.join(workbench, 'src/renderer/content-list.tsx'))};
import {createRoot} from 'react-dom/client';
import ${JSON.stringify(path.join(workbench, 'node_modules/@douyinfe/semi-ui-19/react19-adapter'))};
import ${JSON.stringify(path.join(workbench, 'node_modules/@douyinfe/semi-ui-19/lib/es/_base/base.css'))};
import ${JSON.stringify(path.join(workbench, 'src/renderer/style.css'))};
import {TemplatesPage, Overview, CalendarPage, PromptsPage} from ${JSON.stringify(path.join(workbench, 'src/renderer/workspace-pages.tsx'))};
const templates = Array.from({length: 4}, (_, i) => ({id: 'template-' + i, title: '参考模板 ' + i, name: '参考模板 ' + i, description: '整组参考样张，保留完整横竖画面和所有文字。这是一段刻意很长的说明，用来核对密集卡片仍然保持两行摘要，完整内容可在整组预览里阅读。', builtin: i > 1, version: 1, currentVersion: 1, versions: [{version: 1, packageHash: 'hash-' + i}], editToken: 'token-' + i, deletedAt: null, rules: [], accepted: false, aiTested: false, samples: Array.from({length: i === 0 ? 50 : 3},(_,n)=>({assetHash:'sample-'+i+'-'+n,url:'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="'+((n+i)%2?640:300)+'" height="400"><rect width="100%" height="100%" fill="'+((n+i)%2?'#6d557e':'#476d8b')+'"/><rect x="8" y="8" width="'+((n+i)%2?624:284)+'" height="384" stroke="white" fill="none" stroke-width="5"/><text x="50%" y="50%" fill="white" font-size="24" text-anchor="middle">完整原图 '+(n+1)+'</text></svg>')}))}));
const artwork=templates[0].samples[0].url;
const day=new Date().toLocaleDateString('sv-SE');
const documents=Array.from({length:4},(_,i)=>({id:'content-'+i,title:['让想法变成内容','日常也值得记录','寻找自己的节奏','知识需要被看见'][i],body:'保留每一次创作的想法。\\n'+('长正文完整阅读核对。'.repeat(100)),editToken:'content-'+i,updatedAt:'2026-10-20',channelIds:['wechat'],plans:[{id:'plan-'+i,schedule:{precision:'local-minute',date:day,time:(13+i)+':30',timezone:'Asia/Shanghai'},channelId:'wechat',status:'planned',textMode:'body',coverChoice:{kind:'candidate',candidateId:'cover'}}],deletedAt:null,isExample:false,candidateCount:1,selectedCandidateId:'cover',candidates:[{id:'cover',url:artwork}],coverVariants:[],publications:[],publicationEvents:[]}));
const prompts=Array.from({length:6},(_,i)=>({id:'prompt-'+i,title:['整理内容思路','把想法写成初稿','让标题更有吸引力'][i%3],body:'你是一位内容编辑。'+('请保留事实，梳理观点并完整输出。'.repeat(50)),summary:'适合内容创作。'+('长说明展开核对。'.repeat(50)),when:'',category:['写作','策划','复盘'][i%3],tags:[],enabled:true,editToken:'prompt-'+i,deletedAt:null,favorite:false}));
const channels=[{id:'wechat',name:'公众号',ink:'#176B2F',bg:'#E9F9EE',enabled:true}];
window.writes = [];
window.contentHub = new Proxy({}, {get: (_, method) => async input => {window.writes.push({method,input}); throw new Error('Unexpected business call in visual sweep');}});
function Probe() {
 const [page,setPage]=useState('overview'),[empty,setEmpty]=useState(false);window.showPage=(value,blank=false)=>{setPage(value);setEmpty(blank)}; const workspace={contents:empty?[]:documents,channels,prompts};
  const library={templates,photos:[],contentDetails:documents,collections:[],prompts,settings:{channels,visiblePromptCategories:['写作','策划','复盘'],defaults:{coverCount:1}}};
  const assets={templates,photos:[]},busy=false,refresh=async()=>{};
  const props={workspace,library:empty?{...library,contentDetails:[]}:library,busy,run:async action=>action(),refresh,open:()=>{}};
  return <main><Button theme="borderless" className="cover-result-image cover-artwork" style={{position:"absolute",visibility:"hidden",width:100,height:134}} aria-label="封面图片形状检查"><img src={artwork}/></Button><aside className="app-navigation"><div className="brand"><span className="brand-mark">N</span><strong>自媒体工作台</strong></div><nav>{[['overview','总览'],['content','内容'],['templates','模板'],['calendar','日程'],['prompts','提示词']].map(([id,label])=><Button key={id} theme="borderless" className={'nav-item'+(page===id?' active':'')} onClick={()=>setPage(id)}>{label}</Button>)}</nav></aside><div className="app-stage"><header className="app-header"><span className="breadcrumb">我的内容库</span><span className="header-actions save-indicator">已保存到本机</span></header>{page==='overview'?<Overview {...props} createContent={()=>{}} openTemplates={()=>setPage('templates')} openCalendar={()=>setPage('calendar')}/>:page==='templates'?<TemplatesPage {...props} assets={assets} useTemplate={()=>{}} managePhotos={()=>{}}/>:page==='calendar'?<CalendarPage {...props}/>:page==='prompts'?<PromptsPage {...props}/>:<ContentList {...props} contents={documents} query="" setQuery={()=>{}} view="active" changeView={()=>{}} blocked={false} ready create={()=>{}} recycle={()=>{}}/>}</div></main>;
}
createRoot(document.getElementById('root')).render(<Probe/>);
`);

await build({configFile:false,root,base:'./',resolve:{alias:{react:path.join(workbench,'node_modules/react'),'react-dom':path.join(workbench,'node_modules/react-dom')}},oxc:{jsx:{runtime:'automatic'}},build:{outDir:path.join(root,'dist'),modulePreload:false,target:'chrome148'}});
async function probeMain(probeRoot){
 const {app,BrowserWindow}=await import('electron');const {default:assert}=await import('node:assert/strict');const {default:path}=await import('node:path');const {default:fs}=await import('node:fs/promises');
 app.setPath('userData',path.join(probeRoot,'machine'));await app.whenReady();const win=new BrowserWindow({show:false,width:1440,height:1000,webPreferences:{contextIsolation:true,nodeIntegration:false}});const run=s=>win.webContents.executeJavaScript(s);
 const wait=condition=>run(`new Promise((resolve,reject)=>{const end=Date.now()+5000;function check(){if(${condition})return resolve();if(Date.now()>end)return reject(new Error(${JSON.stringify(condition)}));setTimeout(check,20)}check()})`);
 const paint=()=>run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');const shot=async name=>{await paint();await run('new Promise(resolve=>setTimeout(resolve,120))');await fs.writeFile(path.join(probeRoot,name+'.png'),(await win.webContents.capturePage()).toPNG());};
 try{await win.loadFile(path.join(probeRoot,'dist/index.html'));await wait('!!document.querySelector(".creator-featured-copy")');await shot('overview');
 assert.equal(await run('getComputedStyle(document.querySelector(".app-navigation .nav-item:not(.active)")).color'),'rgb(29, 29, 31)','inactive real Semi navigation uses neutral text');
 assert.equal(await run('getComputedStyle(document.querySelector(".app-navigation .nav-item.active")).color'),'rgb(0, 113, 227)','active real Semi navigation uses primary blue');
 assert.equal(await run('getComputedStyle(document.querySelector(".cover-result-image")).borderTopLeftRadius'),'12px','cover image buttons keep rectangular artwork instead of pill clipping');
 assert.equal(await run('(()=>{const hero=document.querySelector(".creator-featured-content").getBoundingClientRect(),layout=document.querySelector(".creator-overview-layout").getBoundingClientRect(),copy=document.querySelector(".creator-featured-copy").getBoundingClientRect(),cover=document.querySelector(".creator-featured-cover").getBoundingClientRect();return Math.abs(hero.width-layout.width)<2&&copy.right<=cover.left;})()'),true,'full width hero with copy left and image right');
 await run('document.querySelector(".creator-body-excerpt .semi-typography-ellipsis-expand").click()');await paint();assert.equal(await run('document.querySelector(".creator-body-excerpt").textContent.includes("收起")'),true,'hero full text expands');
 for(const page of ['templates','content','calendar','prompts']){await run(`window.showPage(${JSON.stringify(page)})`);await paint();await wait('document.querySelectorAll(".creator-featured-copy").length===0');assert.equal(await run('document.documentElement.scrollWidth<=innerWidth'),true,page+' no overflow');await shot(page);}
 await run('document.querySelector(".prompt-card-preview .semi-typography-ellipsis-expand").click()');await paint();assert.equal(await run('document.querySelector(".prompt-card-preview").textContent.includes("收起")'),true,'long prompt summary expands');await run('document.querySelector(".prompt-library-use").click()');await wait('!!document.querySelector(".prompt-dialog[open]")');await shot('prompt-dialog');await run('[...document.querySelectorAll(".prompt-dialog button")].find(b=>b.textContent==="关闭").click()');
 await run('window.showPage("templates")');await paint();await run('document.querySelector(".creator-reference-stack").click()');await wait('!!document.querySelector(".image-preview[open]")');assert.equal(await run('document.querySelectorAll(".preview-grid img").length'),50,'all 50 samples accessible');await shot('template-dialog');await run('[...document.querySelectorAll(".image-preview button")].find(b=>b.textContent==="关闭预览").click()');
 win.setSize(760,1000);await paint();assert.equal(await run('document.documentElement.scrollWidth<=innerWidth'),true,'narrow templates no overflow');await shot('templates-narrow');win.setSize(1440,1000);await run('window.showPage("overview",true)');await wait('!!document.querySelector(".creator-empty")');await shot('overview-empty');assert.deepEqual(await run('window.writes'),[]);console.log('PASS focused real Electron sweep: overview full-width left text/right original, long text expand/collapse, templates/content/calendar/prompts, prompt and 50-sample dialogs, narrow templates and empty overview. Synthetic fixtures only. Evidence:',probeRoot);app.exit(0);
 }catch(e){console.error(e);console.log('Evidence:',probeRoot);app.exit(1);}
}
await fs.writeFile(path.join(root,'probe-main.mjs'),`(${probeMain.toString()})(${JSON.stringify(root)});`);
const child=spawn(electron,[path.join(root,'probe-main.mjs')],{stdio:'inherit',env:{...process.env,ELECTRON_RUN_AS_NODE:''}});
process.exitCode=await new Promise(resolve=>child.on('exit',code=>resolve(code??1)));
console.log('Probe fixture:',root);
