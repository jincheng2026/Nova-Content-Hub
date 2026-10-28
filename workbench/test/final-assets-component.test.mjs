import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../package.json',import.meta.url)),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const {rolldown}=await import(require.resolve('rolldown'));
const bundle=await rolldown({input:new URL('../src/renderer/final-assets.tsx',import.meta.url).pathname,external:id=>!id.endsWith('/final-assets.tsx')});const generated=await bundle.generate({format:'cjs'});await bundle.close();
const module={exports:{}},buttons=[],checks=[];
vm.runInNewContext(generated.output.find(item=>item.type==='chunk').code,{module,exports:module.exports,require:id=>{
 if(id==='react'||id==='react/jsx-runtime')return require(id);
 if(id.endsWith('/button'))return ({children,...props})=>{buttons.push({children,...props});return React.createElement('button',{disabled:props.disabled},children);};
 if(id.endsWith('/checkbox'))return ({children,...props})=>{checks.push(props);return React.createElement('label',null,React.createElement('input',{type:'checkbox',checked:props.checked,readOnly:true}),children);};
 if(id.endsWith('cover-image-viewer.tsx'))return {ImagePreviewButton:({url,label})=>React.createElement('img',{src:url,alt:label})};
 return {};
}});
const preview={texts:{script:'当前A稿',title:'当前A标题',description:'A简介',coverText:'A封面字'},cover:{url:'nova-content://assets/A'},manuscript:{kind:'current-document',relativePath:'A.md'},packaging:{pageId:'A-page'},warnings:['COVER_SOURCE_UNKNOWN']};
const selected={texts:{script:'历史B稿',title:'历史B标题',description:'B简介',coverText:'B封面字'},cover:{url:'nova-content://assets/B'}};
test('switching to saved history exposes only its contents/actions and returning to preview preserves the author review',()=>{
 assert.equal(typeof module.exports.FinalAssetReview,'function','the actual review component must enforce mode-specific actions');
 let display='preview',saved=0;const acknowledged=new Set(['COVER_SOURCE_UNKNOWN']);
 const render=()=>{buttons.length=0;checks.length=0;return renderToStaticMarkup(React.createElement(module.exports.FinalAssetReview,{display,preview,selected,acknowledged,busy:false,pending:false,onAcknowledge:()=>{},onSave:()=>saved++,onCopy:()=>{},onReturnPreview:()=>{display='preview';}}));};
 let html=render();assert.match(html,/当前A标题/);assert.ok(buttons.find(button=>button.children==='保存这一版'));
 display='saved';html=render();assert.match(html,/历史B标题/);assert.doesNotMatch(html,/当前A标题|当前A稿/);assert.equal(buttons.some(button=>button.children==='保存这一版'),false);assert.equal(checks.length,0);
 buttons.find(button=>button.children==='返回本次预览').onClick();html=render();assert.match(html,/当前A标题/);assert.equal(checks[0].checked,true);buttons.find(button=>button.children==='保存这一版').onClick();assert.equal(saved,1);
});
