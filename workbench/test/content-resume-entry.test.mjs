import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import * as detail from '../src/renderer/jincheng-work-detail-data.ts';
const source=await fs.readFile(new URL('../src/renderer/jincheng-work-detail.tsx',import.meta.url),'utf8');
const body=source.slice(source.indexOf('function WorkDetail('),source.indexOf('\n  function fileRow('))+'\nreturn {pageId,readable,bodyFocus,support,notice};\n}';
function fixture({resolution='resolved',format='html',resumeOnOpen=true,dirty=false,failFlush=false,multiple=false}={}){
 const slots=[],effects=[],calls=[];let cursor=0,pending=[];
 const current={id:'original',relativePath:`05_内容草稿/T019/原当前稿.${format==='html'?'html':'md'}`,format,writable:format==='markdown',section:'drafts',hash:'one'};
 const candidate={documentId:current.id,relativePath:current.relativePath,hash:'one',role:'creation-page'};
 const extras=multiple?[{documentId:'newer',relativePath:'05_内容草稿/T019/另一个新稿.html',hash:'two'}]:[];
 const work={id:'T019',tNumber:'T019',sourceDocumentId:current.id,sourceResolution:resolution,sourceCandidates:[candidate,...extras],relatedDocuments:[candidate,...extras],creationDocuments:format==='html'?[candidate,...extras]:[],hash:'one'};
 const runtime=vm.createContext({...detail,
  useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],next=>{slots[i]=typeof next==='function'?next(slots[i]):next;}];},
  useRef(initial){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];},
  useEffect(setup,deps){const i=cursor++,old=effects[i];if(!old||deps.some((value,at)=>!Object.is(value,old.deps[at])))pending.push(()=>{old?.cleanup?.();effects[i]={deps,cleanup:setup()};});},
  setTimeout,clearTimeout,requestAnimationFrame:()=>1,cancelAnimationFrame(){},
  window:{addEventListener(){},removeEventListener(){}},hasManagedDrafts:()=>false,errorInfo:e=>({message:e.message}),
  invoke:async(method,args)=>{calls.push([method,args]);if(method==='readVaultWorkContext')return{content:work};if(method==='readVault')return{documents:[current]};if(method==='readVaultDocument')return{document:current,text:'原正文'};throw Error(method);},
 });
 vm.runInContext(stripTypeScriptTypes(body),runtime);
 const render=()=>{cursor=0;pending=[];const view=runtime.WorkDetail({contentId:'T019',resumeOnOpen,title:'原稿',stage:'writing',busy:false,dirty,activeTool:'production',chooseTool:tool=>calls.push(['tool',tool]),makeCover(){},showTasks(){},sourceNotice:null,children:null,flush:async()=>{calls.push(['flush']);if(failFlush)throw Error('原页保存失败');}});pending.forEach(setup=>setup());return view;};
 const settle=()=>new Promise(resolve=>setImmediate(resolve));
 return{calls,render,async ready(){render();await settle();render();await settle();return render();}};
}
test('the doing-card resume intent opens the resolved original HTML once, even with newer alternative pages',async()=>{
 const f=fixture({multiple:true});const view=await f.ready();assert.equal(view.pageId,'original');assert.equal(f.calls.filter(([method])=>method==='flush').length,1);f.render();assert.equal(f.calls.filter(([method])=>method==='flush').length,1);
});
test('opening a title remains a summary and unresolved or missing sources never guess an HTML page',async()=>{
 for(const options of [{resumeOnOpen:false},{resolution:'conflict',multiple:true},{resolution:'missing',multiple:true}]){const f=fixture(options);const view=await f.ready();assert.equal(view.pageId,null);assert.equal(f.calls.some(([method])=>method==='tool'||method==='readVaultDocument'),false);}
});
test('a resolved writable Markdown resumes the guarded body tool instead of inventing an HTML page',async()=>{
 const f=fixture({format:'markdown'});const view=await f.ready();assert.equal(view.pageId,null);assert.equal(view.bodyFocus.contentId,'T019');assert.deepEqual(f.calls.filter(([method])=>method==='tool'),[['tool','body']]);
});
test('dirty drafts and failed original-page close protection prevent automatic resume',async()=>{
 for(const options of [{dirty:true},{failFlush:true}]){const f=fixture(options);const view=await f.ready();assert.equal(view.pageId,null);assert.equal(f.calls.some(([method])=>method==='tool'),false);if(options.failFlush)assert.equal(view.notice,'原页保存失败');}
});
