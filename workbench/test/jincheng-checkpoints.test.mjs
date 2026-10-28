import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {currentStageArtifacts} from '../../plugin-src/src/lib/method-adapters/checkpoints.mjs';
const require=createRequire(new URL('../package.json',import.meta.url)),React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),{rolldown}=await import(require.resolve('rolldown'));
const bundle=await rolldown({input:new URL('../src/renderer/jincheng-checkpoints.tsx',import.meta.url).pathname,external:id=>!id.endsWith('/jincheng-checkpoints.tsx')}),out=await bundle.generate({format:'cjs'});await bundle.close();const module={exports:{}};
const primitive=tag=>({children,...props})=>React.createElement(tag,{disabled:props.disabled},children);
vm.runInNewContext(out.output.find(x=>x.type==='chunk').code,{module,exports:module.exports,require:id=>id==='react'||id==='react/jsx-runtime'?require(id):id.endsWith('/button')?primitive('button'):id.endsWith('/input/textarea')?primitive('textarea'):id.endsWith('/banner')?primitive('aside'):id.endsWith('checkpoints.mjs')?{currentStageArtifacts}:id.endsWith('library-panels.tsx')?{useManagedDraftGuard:()=>{}}:{invoke:()=>{throw Error('render must not invoke');}}});
const artifact=(id,index,frameworkId='frame')=>({kind:'kepu-segment',artifactId:id,hash:'a'.repeat(64),path:id+'.json',methodId:'jc-kepu-video',taskId:'task',at:'2026-10-28',kepuScope:{frameworkId,frameworkHash:'b'.repeat(64),index,title:index===0?'开头':'结尾'}});
test('every current framework segment stays visible with its own confirmation, reopen and rejection controls',()=>{
 const first=artifact('first',0),second=artifact('second',1),old=artifact('old',0),flow={revision:'a'.repeat(64),artifacts:[old,first,second],facts:{},checkpointStates:{first:{confirmed:true,stale:false},second:{confirmed:false,stale:false}}};
 const html=renderToStaticMarkup(React.createElement(module.exports.JinchengCheckpoints,{contentId:'content',context:{workflow:flow},busy:false,changed:()=>{}}));assert.match(html,/科普第1段/);assert.match(html,/科普第2段/);assert.doesNotMatch(html,/old.json/);assert.equal((html.match(/重新讨论/g)||[]).length,2);assert.equal((html.match(/拒绝这个版本/g)||[]).length,2);assert.match(html,/此版本已确认/);assert.match(html,/等待你决定/);
});
