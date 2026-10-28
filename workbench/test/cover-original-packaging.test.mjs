import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import {stripTypeScriptTypes,createRequire} from 'node:module';
import {coverInput,coverPackagingRead} from '../src/shared/cover-validation.ts';
const source=await fs.readFile(new URL('../src/renderer/covers.tsx',import.meta.url),'utf8');
const code=stripTypeScriptTypes(source.slice(source.indexOf('  async function selectedCoverText('),source.indexOf('  async function refineCandidate(')));
const snapshot={kind:'jc-doc',issues:[],contentId:'content',source:{documentId:'doc-'+'a'.repeat(32),pageId:'page-one',revision:'b'.repeat(64)},selectionToken:'c'.repeat(64),fields:{title:{value:'原页标题'},coverText:{value:'原页封面字'},description:{value:'简介'}}};
function fixture(next=snapshot,flushError=null){const calls=[],context=vm.createContext({content:{id:'content'},flush:async()=>{calls.push('flush');if(flushError)throw flushError;},originalPackaging:snapshot,packagingDocumentId:undefined,packagingContentRef:{current:'content'},setOriginalPackaging:value=>calls.push(['snapshot',value.kind]),setPackagingIssue:value=>calls.push(['issue',value]),invoke:async(method)=>{calls.push(method);if(method==='readCoverPackaging')return next;throw Error('must not fall back');}});vm.runInContext(code,context);return{calls,read:()=>context.selectedCoverText('edit-token')};}
test('cover preparation flushes author edits before reading original packaging and submits identity instead of caller text',async()=>{
 const f=fixture(),input=await f.read();assert.deepEqual(f.calls.slice(0,2),['flush','readCoverPackaging']);assert.deepEqual(JSON.parse(JSON.stringify(input)),{packagingSource:{documentId:snapshot.source.documentId,pageId:'page-one',revision:'b'.repeat(64),selectionToken:'c'.repeat(64)}});
});
test('changed or unavailable original sources block without legacy packaging fallback',async()=>{
 for(const next of [{...snapshot,selectionToken:'d'.repeat(64)},{kind:'unavailable',contentId:'content',issues:['missing']}]){
  const f=fixture(next);await assert.rejects(f.read());assert.equal(f.calls.includes('readProductionCreation'),false);
 }
});
test('source input rejects caller cover text and arbitrary paths while legacy inputs remain compatible',()=>{
 const input={template:{id:'builtin-demo',version:1},styleAssetHashes:['a'.repeat(64)],photo:null,materialIds:[],prompt:'真实请求',pixels:{width:8,height:6},ratio:'4:3',count:1,outputFormat:'png',scope:'cover-only'};
 const packagingSource={documentId:snapshot.source.documentId,pageId:'page-one',revision:'b'.repeat(64),selectionToken:'c'.repeat(64)};
 assert.equal(coverInput({...input,packagingSource}),true);assert.equal(coverInput({...input,packagingSource,coverText:'绕过原页'}),false);assert.equal(coverInput({...input,packagingSource:{...packagingSource,path:'/tmp/page.html'}}),false);assert.equal(coverInput(input),true);
 assert.equal(coverPackagingRead({contentId:'00112233-4455-4677-8899-aabbccddeeff',root:'/tmp'}),false);
});

test('a failed author flush prevents the packaging read and cannot prepare a request',async()=>{
 const f=fixture(snapshot,new Error('作者保存冲突'));await assert.rejects(f.read(),/作者保存冲突/);assert.deepEqual(f.calls,['flush']);
});

const require=createRequire(new URL('../package.json',import.meta.url)),React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),{rolldown}=await import(require.resolve('rolldown'));
const bundle=await rolldown({input:new URL('../src/renderer/covers.tsx',import.meta.url).pathname,external:id=>!id.endsWith('/covers.tsx')}),generated=await bundle.generate({format:'cjs'});await bundle.close();
const componentModule={exports:{}};vm.runInNewContext(generated.output.find(item=>item.type==='chunk').code,{module:componentModule,exports:componentModule.exports,require:id=>id==='react'||id==='react/jsx-runtime'?require(id):id.endsWith('task-progress.ts')?{assistantLaunchNotice:()=>''}:id.endsWith('semi-controls.tsx')?{PopupSelect:({children,searchable,...props})=>React.createElement('select',props,children)}:{}});
const render=value=>renderToStaticMarkup(React.createElement(componentModule.exports.OriginalCoverPackaging,{value,issue:'',disabled:false,choose:()=>{}}));
test('original packaging renders full source text as read-only fields and shows explicit candidate selection',()=>{
 const html=render({...snapshot,script:{text:'精确正文\r\n\n  保留缩进',manuscriptSource:{relativePath:'05_内容草稿/T044/工作稿.md'}}});assert.match(html,/原页已采用标题/);assert.match(html,/原页封面字/);assert.match(html,/保留缩进/);assert.match(html,/工作稿.md/);assert.doesNotMatch(html,/<(?:input|textarea|select)\b/);
 const choice=render({kind:'choose-source',contentId:'content',candidates:[{documentId:'doc-one',relativePath:'T044/唯一包装页.html'}]});assert.match(choice,/请选择同篇创作页/);assert.match(choice,/唯一包装页.html/);assert.match(choice,/<option value="" selected="">/);
});
test('unavailable packaging renders an actionable error instead of any editable title or legacy text',()=>{
 const html=render({kind:'unavailable',contentId:'content',issues:['CURRENT_SOURCE_CONFLICT']});assert.match(html,/role="alert"/);assert.match(html,/CURRENT_SOURCE_CONFLICT/);assert.doesNotMatch(html,/<(?:input|textarea|select)\b/);
});
