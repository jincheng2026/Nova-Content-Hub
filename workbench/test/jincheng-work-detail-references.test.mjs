import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import * as data from '../src/renderer/jincheng-work-detail-data.ts';
const require = createRequire(new URL('../package.json', import.meta.url));
const React = require('react'), {renderToStaticMarkup} = require('react-dom/server');
const {rolldown} = await import(require.resolve('rolldown'));
const bundle = await rolldown({input:new URL('../src/renderer/jincheng-work-detail.tsx',import.meta.url).pathname, external:id => !id.endsWith('/jincheng-work-detail.tsx')});
const generated = await bundle.generate({format:'cjs'}); await bundle.close();
const module = {exports:{}}, buttons=[];
vm.runInNewContext(generated.output.find(item => item.type === 'chunk').code, {module,exports:module.exports,require:id => {
 if (id === 'react' || id === 'react/jsx-runtime') return require(id);
 if (id.endsWith('/button')) return ({children,...props}) => {buttons.push({children,...props}); return React.createElement('button',{disabled:props.disabled},children);};
 if (id.endsWith('jincheng-work-detail-data.ts')) return data;
 return {};
}});
const transcript={id:'transcript',relativePath:'02_内容素材/视频/逐字稿.md',format:'markdown'};
const references={videos:[{key:'video',title:'一条真正的参考视频',links:[{title:'原片',target:'https://www.douyin.com/video/123',url:'https://www.douyin.com/video/123'},{title:'逐字稿',target:transcript.relativePath,document:transcript},{title:'素材文件夹',target:'02_内容素材/视频/'}]}],materials:[{title:'飞书文档',target:'https://example.feishu.cn/docx/abc',url:'https://example.feishu.cn/docx/abc'},{title:'T042',target:'04_选题库/T042.md'}]};
function render(props={}) {
 assert.equal(typeof module.exports.JinchengReferences,'function','reference sections must be renderable as separate sources');
 buttons.length=0;
 return renderToStaticMarkup(React.createElement(module.exports.JinchengReferences,{references,busy:false,onRead:()=>{},onLocate:()=>{},onCopy:()=>{},...props}));
}
test('renders true work groups separately from other source links with accurate copy actions', () => {
 const html=render();
 assert.match(html,/>参考视频<span>1<\/span>/);
 assert.match(html,/>参考资料<span>2<\/span>/);
 assert.match(html,/一条真正的参考视频/);
 assert.equal(buttons.filter(button=>button.children==='复制原视频链接').length,1);
 assert.equal(buttons.filter(button=>button.children==='复制链接').length,1);
 assert.match(html,/尚未索引/);
 assert.doesNotMatch(html,/链接失效|找不到文件/);
});
test('read and locate use indexed IDs while copy retains the exact URL or unindexed location', () => {
 const calls=[];
 render({onRead:id=>calls.push(['read',id]),onLocate:id=>calls.push(['locate',id]),onCopy:(target,isVideo)=>calls.push(['copy',target,isVideo])});
 const named = name=>buttons.find(button=>button.children===name);
 named('阅读逐字稿').onClick();
 named('定位原件').onClick();
 named('复制原视频链接').onClick();
 named('复制链接').onClick();
 named('复制位置').onClick();
 assert.deepEqual(calls,[['read','transcript'],['locate','transcript'],['copy','https://www.douyin.com/video/123',true],['copy','https://example.feishu.cn/docx/abc',false],['copy','02_内容素材/视频/',false]]);
 assert.equal(buttons.filter(button=>button.children==='定位原件').length,1);
});
test('reference actions respect busy state without starting work during render', () => {
 let calls=0;
 render({busy:true,onRead:()=>calls++,onLocate:()=>calls++,onCopy:()=>calls++});
 assert.equal(calls,0);
 assert.equal(buttons.every(button=>button.disabled),true);
});
