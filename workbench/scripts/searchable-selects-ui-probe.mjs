// Actual renderer pages and Semi controls, synthetic in-memory data and isolated Electron userData.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import electron from 'electron';
import {build} from 'vite';
const workbench = fileURLToPath(new URL('../', import.meta.url));
const evidence = path.resolve(workbench, '../docs/verification/production/2026-10-22-searchable-selects-0340');
const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'nova-searchable-selects-')));
await fs.mkdir(evidence, {recursive: true});
await fs.writeFile(path.join(root, 'index.html'), '<html lang="zh-CN"><meta charset="utf-8"><div id="root"></div><script type="module" src="/probe.jsx"></script></html>');
await fs.writeFile(path.join(root, 'probe.jsx'), `
import {useState} from 'react';import {createRoot} from 'react-dom/client';
import '${workbench}/node_modules/@douyinfe/semi-ui-19/react19-adapter';import '${workbench}/node_modules/@douyinfe/semi-ui-19/lib/es/_base/base.css';import '${workbench}/src/renderer/style.css';
import {CalendarPage,PromptsPage} from '${workbench}/src/renderer/workspace-pages.tsx';
import {PublicationEditor} from '${workbench}/src/renderer/publication-panel.tsx';
import {LibraryPanels} from '${workbench}/src/renderer/library-panels.tsx';
const makeDocument=(i)=>({id:'content-'+i,title:'内容 '+String(i).padStart(3,'0'),body:'正文 '+i,editToken:'token-'+i,channelIds:[],plans:[],deletedAt:null,isExample:false,candidates:[],coverVariants:[],publications:[],publicationEvents:[],candidateCount:0,selectedCandidateId:null});
window.calls=[];window.errors=[];window.addEventListener('error',e=>window.errors.push(e.message));window.contentHub=new Proxy({},{get:(_,method)=>async input=>{window.calls.push({method,input});throw Error('Unexpected native call: '+method)}});
function makeLibrary(count){return {contentDetails:Array.from({length:count},(_,i)=>({...makeDocument(i),...(i===0?{candidates:Array.from({length:count},(_,j)=>({id:'candidate-'+j,displayNumber:j+1,favorite:true})),coverVariants:Array.from({length:count},(_,j)=>({id:'variant-'+j,name:'构图 '+String(j).padStart(3,'0'),ratio:'3:4'}))}:{})})),collections:[],prompts:[],photos:Array.from({length:count},(_,i)=>({id:'photo-'+i,title:'照片 '+String(i).padStart(3,'0'),isOwnPhoto:true,availability:'available',deletedAt:null,updatedAt:'2026-10-22'})),templates:Array.from({length:count},(_,i)=>({id:'template-'+i,title:'模板 '+String(i).padStart(3,'0'),currentVersion:i+1,deletedAt:null})),settings:{editToken:'settings-token',defaults:{photoId:null,templateId:null,coverCount:1},channels:Array.from({length:count},(_,i)=>({id:'channel-'+i,name:'渠道 '+String(i).padStart(3,'0'),enabled:true,deletedAt:null})),visiblePromptCategories:Array.from({length:count},(_,i)=>'分类 '+String(i).padStart(3,'0'))}}}
function Probe(){const [library,setLibrary]=useState(()=>makeLibrary(5)),[mode,setMode]=useState('calendar'),[busy,setBusy]=useState(false),[epoch,setEpoch]=useState(0);window.library=library;window.configure=(count,mode)=>{setLibrary(makeLibrary(count));setMode(mode);setEpoch(n=>n+1)};window.mode=mode=>{setMode(mode);setEpoch(n=>n+1)};window.busy=setBusy;window.replace=next=>setLibrary(next);const props={workspace:{contents:library.contentDetails,channels:library.settings.channels,prompts:[]},library,busy,run:async fn=>fn(),refresh:async()=>{},open:()=>{}};return <main key={epoch} style={{padding:24}}>{mode==='calendar'?<CalendarPage {...props}/>:mode==='prompts'?<PromptsPage {...props}/>:mode==='defaults'?<LibraryPanels {...props} initialTab="defaults" assets={null}/>:<PublicationEditor props={props} selection={{mode:'plan',kind:'content',documentId:'content-0'}} initialDay="2026-10-22" close={()=>setMode('calendar')}/>}</main>};createRoot(document.getElementById('root')).render(<Probe/>);
`);
await build({configFile: false, root, base: './', resolve: {alias: {react: path.join(workbench, 'node_modules/react'), 'react-dom': path.join(workbench, 'node_modules/react-dom')}}, oxc: {jsx: {runtime: 'automatic'}}, build: {outDir: path.join(root, 'dist'), modulePreload: false, target: 'chrome148'}});
async function main(root, evidence) {
  const {app, BrowserWindow} = await import('electron');
  const {default: assert} = await import('node:assert/strict');
  const {default: fs} = await import('node:fs/promises');
  const {default: path} = await import('node:path');
  app.setPath('userData', path.join(root, 'machine'));await app.whenReady();
  const win = new BrowserWindow({show: false, width: 1280, height: 1000, webPreferences: {contextIsolation: true, nodeIntegration: false}});
  win.webContents.on('console-message', event => console.log('renderer:', event.message));
  const run = source => win.webContents.executeJavaScript(source).catch(error => {console.error('Browser script:', source);throw error;});
  const paint = () => run('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  const wait = condition => run(`new Promise((resolve,reject)=>{const end=Date.now()+5000;const tick=()=>{if(${condition})return resolve(true);if(Date.now()>end)return reject(Error(${JSON.stringify(condition)}+' / '+document.body.innerText.slice(-700)));setTimeout(tick,20)};tick()})`);
  const shot = async name => {await paint();await run('Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})))');await fs.writeFile(path.join(evidence, name+'.png'), (await win.webContents.capturePage()).toPNG());};
  const click = async selector => {await run(`document.querySelector(${JSON.stringify(selector)}).click()`);await paint();};
  const button = async text => {await run(`[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)}&&!e.disabled).click()`);await paint();};
  const field = text => `[...document.querySelectorAll('.semi-control')].find(e=>e.querySelector('.semi-control-label')?.textContent===${JSON.stringify(text)}).querySelector('.semi-select')`;
  const open = async source => {await run(`${source}.click()`);await wait('!!document.querySelector(".semi-select-option-list-wrapper")');await paint();};
  const type = async (source, value) => {await run(`(()=>{const el=${source}.querySelector('input:not(.semi-control-validation)');if(!el)throw Error('Search input missing');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);await paint();};
  const options = () => run('[...document.querySelectorAll(".semi-select-option:not(.semi-select-option-empty)")].map(e=>e.textContent)');
  const select = async (text, selectedId) => {await run(`[...document.querySelectorAll('.semi-select-option')].find(e=>e.textContent===${JSON.stringify(text)}).click()`);if(selectedId)await wait(`[...document.querySelectorAll('.semi-control-validation')].some(e=>e.value===${JSON.stringify(selectedId)})`);await paint();};
  const key = async keyCode => {win.webContents.focus();win.webContents.sendInputEvent({type: 'keyDown', keyCode});win.webContents.sendInputEvent({type: 'keyUp', keyCode});await paint();};
  const escape = async () => {await run('document.querySelector(".semi-select[aria-expanded=true] input,.semi-select[aria-expanded=true]")?.focus()');win.webContents.sendInputEvent({type: 'keyDown', keyCode: 'Escape'});win.webContents.sendInputEvent({type: 'keyUp', keyCode: 'Escape'});await wait('!document.querySelector(".semi-select-option-list-wrapper")');};
  const inspect = () => run(`(()=>{const e=document.querySelector('.semi-select-option-list-wrapper'),s=getComputedStyle(e);return {radius:s.borderRadius,overflow:s.overflow,height:e.getBoundingClientRect().height,options:[...e.querySelectorAll('.semi-select-option')].map(e=>e.textContent)}})()`);
  const records = [];
  try {
    await win.loadFile(path.join(root, 'dist/index.html'));await wait('!!document.querySelector(".calendar-workspace")');
    await button('＋ 新增计划');await wait('!!document.querySelector("dialog[aria-label=选择要发布的内容][open]")');
    const calendar = field('选择发布内容');await open(calendar);
    const short = await inspect();await shot(process.env.SEARCH_SELECT_EXPECT_RED ? 'before-calendar-short' : 'after-calendar-short');
    assert.equal(await run(`!!${calendar}.querySelector('input:not(.semi-control-validation)')`), true, 'explicit searchable Calendar contents must accept input even with only five saved contents');
    assert.ok(short.height < 252, 'short searchable lists retain natural height');
    await type(calendar, '内容 004');assert.deepEqual(await options(), ['内容 004']);
    assert.equal(await run('[...document.querySelectorAll("dialog button")].find(e=>e.textContent.trim()==="继续安排").disabled'), true, 'typing is not selecting');
    await type(calendar, '不存在');assert.deepEqual(await options(), []);assert.ok(await run('document.body.innerText.includes("没有匹配的选项")'));
    await type(calendar, '');assert.equal((await options()).length, 6, 'clearing search restores all options and empty selection');
    await type(calendar, '内容 004');await select('内容 004', 'content-4');assert.equal(await run('document.querySelector("dialog .semi-control-validation").value'), 'content-4');
    await open(calendar);await type(calendar, '不存在');assert.equal(await run('document.querySelector("dialog .semi-control-validation").value'), 'content-4', 'no-match query preserves selected ID');
    await escape();assert.equal(await run('!!document.querySelector("dialog[open]")'), true, 'first Escape closes only portal popup');
    await open(calendar);assert.ok((await options()).includes('内容 000'), 'closing search resets only query');await escape();await button('继续安排');await wait('!!document.querySelector("dialog[aria-label=新增发布计划][open]")');assert.ok(await run('document.querySelector("dialog").textContent.includes("内容 004")'), 'selection flows to actual editor');
    records.push({scenario: 'actual Calendar short content picker', ...short});
    await run('window.configure(350,"calendar")');await wait('!document.querySelector("dialog[open]")');await button('＋ 新增计划');await open(calendar);assert.ok((await options()).length < 40, 'large option lists keep bounded virtual DOM');await type(calendar, '内容 349');assert.deepEqual(await options(), ['内容 349']);await shot('after-calendar-large-last');await select('内容 349', 'content-349');assert.equal(await run('document.querySelector("dialog .semi-control-validation").value'), 'content-349');await button('关闭');
    await open(`document.querySelector('.schedule-legend .semi-select')`);assert.ok((await options()).length < 40, 'large channel filter keeps bounded virtual DOM');await type(`document.querySelector('.schedule-legend .semi-select')`, '渠道 349');assert.deepEqual(await options(), ['渠道 349']);await select('渠道 349');await wait('document.querySelector(".schedule-channel-summary").textContent.includes("349")');await escape();await button('恢复全部渠道');
    await run('window.configure(80,"prompts")');await wait('!!document.querySelector(".prompt-workspace")');const category = field('提示词分类');await open(category);await type(category, '分类 079');assert.deepEqual(await options(), ['分类 079']);await select('分类 079', '分类 079');assert.equal(await run(`${category}.closest('.semi-control').querySelector('.semi-control-validation').value`), '分类 079');await open(category);await type(category, '不存在');await shot('after-prompt-no-match');await escape();
    await run('window.mode("calendar")');await wait('!!document.querySelector(".calendar-workspace")');await button('＋ 新增计划');await open(calendar);assert.ok((await options()).includes('请选择内容'), 'switching modes has no previous query bleed');await escape();await button('关闭');
    await run('window.configure(80,"defaults")');await wait('document.querySelector(".management-form")');
    for (const [index, label, id] of [[0, '照片 079', 'photo-79'], [1, '模板 079 · v80', 'template-79']]) {const source = `document.querySelectorAll('.management-form .semi-select')[${index}]`;await open(source);await type(source, label);assert.deepEqual(await options(), [label]);await select(label, id);assert.equal(await run(`${source}.closest('.semi-control').querySelector('.semi-control-validation').value`), id);}
    await shot('after-defaults-selected');
    await run('window.configure(80,"editor")');await wait('!!document.querySelector("dialog[aria-label=新增发布计划][open]")');const channel = `document.querySelector('dialog .semi-select')`;await open(channel);await type(channel, '渠道 079');assert.deepEqual(await options(), ['渠道 079']);await select('渠道 079', 'channel-79');assert.equal(await run('document.querySelector("dialog .semi-control-validation").value'), 'channel-79');
    const cover = field('计划使用的封面');for (const [text,id] of [['候选 80 · 收藏','candidate:candidate-79'],['构图 079 · 3:4','variant:variant-79']]) {await open(cover);await type(cover,text);assert.deepEqual(await options(),[text]);if(id.startsWith('candidate:')) {await run(`${cover}.querySelector('input').focus()`);await key('Down');await key('Return');await wait(`[...document.querySelectorAll('.semi-control-validation')].some(e=>e.value===${JSON.stringify(id)})`);assert.deepEqual(await run('window.calls'), [], 'Enter chooses a searched option without submitting the actual publication form');}else await select(text,id);assert.equal(await run(`${cover}.closest('.semi-control').querySelector('.semi-control-validation').value`),id);}await open(cover);await type(cover,'不存在');assert.deepEqual(await options(),[]);await shot('after-cover-no-match-retained');await escape();
    await run('window.replace({...window.library,settings:{...window.library.settings,channels:window.library.settings.channels.map(c=>c.id==="channel-79"?{...c,deletedAt:"recycled"}:c)}})');await paint();await open(channel);await type(channel, '渠道 079');assert.equal(await run('document.querySelector(".semi-select-option").getAttribute("aria-disabled")'), 'true');await select('渠道 079（已停用，请重新选择）');assert.equal(await run('document.querySelector("dialog .semi-control-validation").value'), 'channel-79', 'disabled historical reference retains ID without choosing a new value');await escape();
    await run('window.busy(true)');await paint();await run(`${channel}.click()`);assert.equal(await run('!!document.querySelector(".semi-select-option-list-wrapper")'), false, 'busy controls stay disabled');
    assert.deepEqual(await run('window.calls'), [], 'search and selection do not call native APIs');assert.deepEqual(await run('window.errors'), []);
    assert.ok(parseFloat(short.radius) > 0 && short.overflow === 'hidden', 'global rounded clipping survives');
    await fs.writeFile(path.join(evidence, 'after.json'), JSON.stringify({platform: process.platform, arch: process.arch, viewport: [1280,1000], records, checks: ['short input/filter/no-match/clear/retained ID', 'native dialog portal/Escape', 'Down+Enter selects candidate without submitting actual form', '350 contents virtual last match', '350 multi channels', '80 prompt categories', '80 default photos and templates', '80 plan channels including disabled retained reference', '80 candidates and 80 variants full rendered labels and IDs', 'mode switch query reset', 'busy disabled', 'no native APIs']}, null, 2));
    console.log('PASS actual Calendar/Prompts/Defaults/PublicationEditor: searchable short and long lists, virtual last match, clear/no match, selected IDs, retained disabled references, busy, portal/Escape, mode query isolation, rounded wrapper, no native API calls');app.exit(0);
  } catch (error) {await shot(process.env.SEARCH_SELECT_EXPECT_RED ? 'before-failure' : 'after-failure');console.error(error);app.exit(1);}
}
await fs.writeFile(path.join(root, 'main.mjs'), `(${main.toString()})(${JSON.stringify(root)},${JSON.stringify(evidence)});`);
const child = spawn(electron, [path.join(root, 'main.mjs')], {stdio: 'inherit', env: {...process.env, ELECTRON_RUN_AS_NODE: ''}});
const code = await new Promise((resolve,reject) => {const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('Searchable selects probe timeout'));},60000);child.once('exit',code=>{clearTimeout(timer);resolve(code)});child.once('error',reject)});
assert.equal(code, 0, 'Searchable selects probe failed');
