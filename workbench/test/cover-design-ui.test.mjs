import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {coverInput,coverDesktopInput,fingerprint} from '../src/shared/cover-validation.ts';
const require=createRequire(new URL('../package.json',import.meta.url)),React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),{rolldown}=await import(require.resolve('rolldown'));
const bundle=await rolldown({input:new URL('../src/renderer/covers.tsx',import.meta.url).pathname,external:id=>!id.endsWith('/covers.tsx')}),generated=await bundle.generate({format:'cjs'});await bundle.close();
const componentModule={exports:{}};vm.runInNewContext(generated.output.find(item=>item.type==='chunk').code,{module:componentModule,exports:componentModule.exports,require:id=>id==='react'||id==='react/jsx-runtime'?require(id):id.endsWith('task-progress.ts')?{assistantLaunchNotice:()=>''}:id.endsWith('semi-controls.tsx')?{PopupSelect:({children,searchable,...props})=>React.createElement('select',props,children)}:id.includes('/button')?(({children,theme,size,...props})=>React.createElement('button',props,children)):{}});
const source={vaultId:'00112233-4455-4677-8899-aabbccddeeff',workId:'T044',methodId:'jc-cover-design',taskId:'task-design',artifactId:'design-one',artifactHash:'a'.repeat(64)},design={title:'设计候选名',prompt:'冻结画面说明',ratio:'16:9',identity:'own-photo-required',designSource:source};
const render=(props={})=>renderToStaticMarkup(React.createElement(componentModule.exports.ConfirmedCoverDesignPicker,{designs:[design],selection:{artifactId:source.artifactId,artifactHash:source.artifactHash},ratio:'3:4',photoReady:false,disabled:false,issue:'',choose:()=>{},adoptRatio:()=>{},...props}));
test('confirmed design picker displays trusted full requirements with explicit ratio adoption and own-photo requirement',()=>{
 const html=render();assert.match(html,/已确认封面设计/);assert.match(html,/设计候选名/);assert.match(html,/冻结画面说明/);assert.match(html,/采用设计比例 16:9/);assert.match(html,/需要本人照片/);assert.match(html,/原包装/);assert.doesNotMatch(html,/<textarea/);
});
test('missing or changed selected design remains visible and actionable while original flow remains available',()=>{
 const stale=render({designs:[]});assert.match(stale,/已失效/);assert.match(stale,/沿用原生成设置/);assert.match(stale,/role="alert"/);
 const empty=render({designs:[],selection:null});assert.match(empty,/暂无已确认/);assert.doesNotMatch(empty,/role="alert"/);
});
test('IPC validation accepts only content identity and artifact reference, never a root or trusted prompt injection',()=>{
 const base={template:{id:'builtin-demo',version:1},styleAssetHashes:['b'.repeat(64)],photo:null,materialIds:[],prompt:'普通提示词',pixels:{width:8,height:6},ratio:'4:3',count:1,outputFormat:'png',scope:'cover-only'},selection={artifactId:'design-one',artifactHash:'a'.repeat(64)};
 assert.equal(coverInput({...base,designSource:selection}),true);assert.equal(coverInput({...base,designSource:{...selection,prompt:'伪造可信设计'}}),false);assert.equal(coverInput({...base,designSource:{...selection,workId:'T999'}}),false);assert.equal(coverDesktopInput('readCoverDesigns',{contentId:source.vaultId}),true);assert.equal(coverDesktopInput('readCoverDesigns',{contentId:source.vaultId,root:'/tmp/elsewhere'}),false);
 assert.equal(fingerprint({designSource:source,contentId:source.vaultId,title:'正文标题',bodyHash:'b'.repeat(64),editToken:'c'.repeat(64),inputHash:'d'.repeat(64),existingRequest:null}),true);
});
