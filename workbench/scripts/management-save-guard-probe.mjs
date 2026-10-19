// Real React/Semi in Electron; delayed fixture bridge and isolated userData, no business writes.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import electron from 'electron';
import {build} from 'vite';
import {fileURLToPath} from 'node:url';
const workbench = fileURLToPath(new URL('../', import.meta.url));
const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'nova-management-save-guard-')));
await fs.writeFile(path.join(root, 'index.html'), '<html lang="zh-CN"><div id="root"></div><script type="module" src="/probe.jsx"></script></html>');
await fs.writeFile(path.join(root, 'probe.jsx'), `
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import '${workbench}/node_modules/@douyinfe/semi-ui-19/react19-adapter';
import '${workbench}/node_modules/@douyinfe/semi-ui-19/lib/es/_base/base.css';
import '${workbench}/src/renderer/style.css';
import {LibraryPanels, CollectionEditor, MembersEditor} from '${workbench}/src/renderer/library-panels.tsx';
window.calls = []; window.errors = []; window.refreshes = 0;
window.library = {
  photos: [{id:'photo-1',title:'原照片',isOwnPhoto:false,editToken:'photo-v1',availability:'available',deletedAt:null}],
  settings: {editToken:'settings-v1',defaults:{photoId:null},channels:[{id:'channel-1',name:'原渠道',requiredRatio:null,ink:'#555555',bg:'#f0f0f0',deletedAt:null}]},
  collections: [{id:'collection-1',title:'原合集',body:'原正文',editToken:'collection-v1',memberIds:[],channelIds:[],dateRange:{start:null,end:null},deletedAt:null}],
  contentDetails: [{id:'content-1',title:'内容一',deletedAt:null},{id:'content-2',title:'内容二',deletedAt:null}]
};
window.contentHub = {mutateWorkspace: input => new Promise(resolve => {
  window.calls.push(structuredClone(input));
  window.settle = ok => { window.settle = null; resolve(ok ? {ok:true,value:{library:window.library}} : {ok:false,error:{code:'CONFLICT',message:'隔离回执拒绝'}}); };
})};
function Probe({tab}) {
  const [busy,setBusy] = useState(false), [editor,setEditor] = useState(null);
  const run = async action => {setBusy(true);try {return await action();}catch(error){window.errors.push(error.message);}finally{setBusy(false);}};
  const props={library:window.library,busy,run,refresh:async()=>{window.refreshes++;}};
  if(tab==='collections') return <><button onClick={()=>setEditor('name')}>编辑</button><button onClick={()=>setEditor('members')}>管理内容</button>{editor==='name'&&<CollectionEditor collection={window.library.collections[0]} props={props} close={()=>setEditor(null)}/ >}{editor==='members'&&<MembersEditor collection={window.library.collections[0]} props={props} close={()=>setEditor(null)}/ >}</>;
  return <LibraryPanels library={window.library} assets={{photos:[],templates:[]}} initialTab={tab} busy={busy} run={run} refresh={async()=>{window.refreshes++;}}/>;
}
const root = createRoot(document.getElementById('root'));
window.mount = tab => root.render(<Probe key={tab} tab={tab}/>);
window.mount('photos');
`);
await build({configFile:false,root,base:'./',resolve:{alias:{react:path.join(workbench,'node_modules/react'),'react-dom':path.join(workbench,'node_modules/react-dom')}},oxc:{jsx:{runtime:'automatic'}},build:{outDir:path.join(root,'dist'),modulePreload:false,target:'chrome148'}});
async function probeMain(probeRoot) {
  const {app,BrowserWindow} = await import('electron');
  const {default:assert} = await import('node:assert/strict');
  const {default:path} = await import('node:path');
  app.setPath('userData',path.join(probeRoot,'machine'));
  await app.whenReady();
  const win = new BrowserWindow({show:false,width:1440,height:1100,webPreferences:{contextIsolation:true,nodeIntegration:false}});
  const run = source => win.webContents.executeJavaScript(source);
  const wait = condition => run(`new Promise((resolve,reject)=>{const end=Date.now()+5000;const check=()=>{if(${condition})return resolve(true);if(Date.now()>end)return reject(new Error('State timeout: '+${JSON.stringify(condition)}));setTimeout(check,15)};check()})`);
  const flush = () => run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  const click = text => run(`[...document.querySelectorAll('button')].find(button=>button.textContent===${JSON.stringify(text)}).click()`);
  const snapshot = () => run(`[...document.querySelectorAll('dialog form input, dialog form textarea, dialog form select')].map(el=>({type:el.type,value:el.value,checked:el.checked}))`);
  const type = async (selector,text) => {
    await run(`document.querySelector(${JSON.stringify(selector)}).focus()`);
    win.webContents.insertText(text);
    await flush();
  };
  const assertLocked = async (label, expected) => {
    assert.equal(await run('!!document.querySelector("dialog[open]")'),true,label+' stays open before receipt');
    const states = await run(`[...document.querySelectorAll('dialog form input, dialog form textarea, dialog form select')].map(el=>el.matches(':disabled'))`);
    assert.ok(states.length > 0 && states.every(Boolean),label+' locks every field while waiting');
    await run(`document.querySelectorAll('dialog form input[type=checkbox]').forEach(el=>el.click())`);
    await type('dialog form input','等待期间不能输入');
    assert.deepEqual(await snapshot(),expected,label+' ignores checkbox clicks and native typing while waiting');
  };
  try {
    await win.loadFile(path.join(probeRoot,'dist/index.html'));
    const cases = [
      {tab:'photos',open:'管理',save:'保存照片设置',op:'updatePhoto',edit:async()=>{await type('dialog input','修改后的照片');await run('document.querySelector("dialog input[type=checkbox]").click()');}},
      {tab:'channels',open:'编辑',save:'保存渠道',op:'updateChannel',edit:async()=>{await type('dialog input','修改后的渠道');await type('dialog input[placeholder="如 3:4"]','3:4');}},
      {tab:'collections',open:'编辑',save:'保存合集',op:'updateCollection',edit:async()=>{await type('dialog input','修改后的合集');}},
      {tab:'collections',open:'管理内容',save:'保存成员',op:'setCollectionMembers',edit:async()=>{await run('document.querySelector("dialog input[type=checkbox]").click()');}}
    ];
    let count = 0;
    for (const test of cases) {
      // Remount even when consecutive cases use the same tab.
      await run('window.mount("photos")'); await flush();
      await run(`window.mount(${JSON.stringify(test.tab)})`); await flush();
      await click(test.open); await wait('!!document.querySelector("dialog[open]")');
      await test.edit(); await flush();
      const draft = await snapshot();
      await click(test.save); count++;
      await wait('typeof window.settle === "function"'); await flush();
      assert.equal(await run(`window.calls[${count-1}].op`),test.op);
      await assertLocked(test.op+' rejection path',draft);
      await run('window.settle(false)');
      await wait('document.querySelector("dialog [role=status]").textContent.includes("编辑内容仍保留")');
      assert.deepEqual(await snapshot(),draft,test.op+' rejection preserves all draft values');
      assert.equal(await run(`[...document.querySelectorAll('dialog form input, dialog form textarea, dialog form select')].every(el=>!el.matches(':disabled'))`),true,test.op+' fields unlock after rejection');
      assert.equal(await run('window.refreshes'),Math.floor((count-1)/2),test.op+' rejection does not refresh');
      // Editing again proves the rejected form remains usable, then retry successfully.
      if (test.op === 'setCollectionMembers') await run('document.querySelectorAll("dialog input[type=checkbox]")[1].click()');
      else await type('dialog input','继续填写');
      await flush();
      const retryDraft = await snapshot();
      assert.notDeepEqual(retryDraft,draft,test.op+' can keep editing after rejection');
      await click(test.save); count++;
      await wait('typeof window.settle === "function"'); await flush();
      await assertLocked(test.op+' success path',retryDraft);
      const input = await run(`window.calls[${count-1}]`);
      if (test.op === 'setCollectionMembers') assert.deepEqual(input.memberIds,['content-1','content-2']);
      else assert.equal(input[test.op === 'updateChannel' ? 'name' : 'title'],retryDraft[0].value);
      await run('window.settle(true)');
      await wait('!document.querySelector("dialog")');
      assert.equal(await run('window.refreshes'),count/2,test.op+' successful receipt closes and refreshes once');
      console.log('PASS:',test.op,'delayed success locks all fields; rejection preserves draft, unlocks and accepts edited retry');
    }
    assert.equal(await run('window.calls.length'),8);
    assert.equal(await run('window.errors.length'),4);
    assert.equal(await run('window.refreshes'),4);
    console.log('PASS: four real React/Semi editors, eight delayed bridge receipts, no real library writes');
    app.exit(0);
  } catch(error) { console.error(error); app.exit(1); }
}
await fs.writeFile(path.join(root,'probe-main.mjs'),`(${probeMain.toString()})(${JSON.stringify(root)});`);
const child = spawn(electron,[path.join(root,'probe-main.mjs')],{stdio:'inherit',env:{...process.env,ELECTRON_RUN_AS_NODE:''}});
const code = await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
console.log('Probe fixture:',root);
process.exitCode = code ?? 1;
