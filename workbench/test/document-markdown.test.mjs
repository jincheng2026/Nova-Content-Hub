import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../package.json',import.meta.url));
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const {rolldown}=await import(require.resolve('rolldown'));
const bundle=await rolldown({input:new URL('../src/renderer/document-markdown.tsx',import.meta.url).pathname,external:id=>['react','react/jsx-runtime'].includes(id)||id.endsWith('.css')});
const generated=await bundle.generate({format:'cjs'});await bundle.close();
const module={exports:{}};vm.runInNewContext(generated.output.find(item=>item.type==='chunk').code,{module,exports:module.exports,require:id=>id.endsWith('.css')?{}:require(id),URL});
function render(source,props={}){return renderToStaticMarkup(React.createElement(module.exports.DocumentMarkdown,{text:source,...props}));}
test('Markdown reading gives account notes headings, quotes, lists and table semantics',()=>{
 const html=render('# 账号资料\n\n> 核心定位 **真实经验**\n\n1. 第一项\n2. 第二项\n   - 子项\n\n| 方向 | 说明 |\n| :--- | ---: |\n| AI | 清楚\\|具体 |');
 assert.match(html,/<h1>账号资料<\/h1>/);assert.match(html,/<blockquote><p>核心定位 <strong>真实经验<\/strong><\/p><\/blockquote>/);
 assert.match(html,/<ol[^>]*><li>/);assert.match(html,/<ul><li>/);assert.match(html,/<thead><tr><th/);assert.match(html,/<tbody><tr><td/);assert.match(html,/清楚\|具体/);
});
test('Markdown treats markup as text and refuses executable, local and relative destinations',()=>{
 const html=render('<script>alert(1)</script>\n\n[安全](https://example.com/path?a=1&b=2) [脚本](javascript:alert(1)) [文件](file:///tmp/a) [相对](../secret.md) ![照片](https://example.com/tracker.png)');
 assert.doesNotMatch(html,/<script|<img|href="(?:javascript|file|\.\.)/i);assert.match(html,/&lt;script&gt;/);assert.match(html,/安全（https:\/\/example.com\/path\?a=1&amp;b=2）/);assert.match(html,/脚本/);assert.match(html,/相对/);
});
test('Markdown preserves code, plain line breaks and empty content',()=>{
 const source='# 标题\r\n\r\n```js\r\nconst value = "<unsafe>";\r\n```\r\n\r\n第一行\r\n第二行 `code` 和 *说明* 与 ~~旧值~~';
 const html=render(source);assert.match(html,/<pre[^>]*><code[^>]*>const value = &quot;&lt;unsafe&gt;&quot;;/);assert.match(html,/第一行<br\/>第二行 <code>code<\/code> 和 <em>说明<\/em> 与 <del>旧值<\/del>/);assert.doesNotMatch(render(''),/undefined|null/);
});

test('Markdown keeps literal heading hashes and handles pipes inside multibacktick code',()=>{
 const html=render('# C#\n\n| 表达 | 说明 |\n| --- | --- |\n| ``a|b`` | 运算 |');
 assert.match(html,/<h1>C#<\/h1>/);assert.match(html,/<code>a\|b<\/code>/);assert.match(html,/>运算<\/td>/);
});
test('Markdown suppresses only a matching first heading already shown in its dialog',()=>{
 const html=render('# 账号名字\n\n正文\n\n## 账号名字',{title:'账号名字'});assert.doesNotMatch(html,/<h1>/);assert.match(html,/<h2>账号名字<\/h2>/);assert.match(html,/正文/);
 assert.match(render('# 其他标题',{title:'账号名字'}),/<h1>其他标题<\/h1>/);
});

test('Markdown keeps blocked link and image destinations as selectable escaped evidence',()=>{
 const html=render('[本地证据](../证据/原件.md) [原文件](file:///tmp/original.md) [脚本](javascript:alert(1)) ![截图](./images/source.png) ![原图](https://example.com/image.png?a=1&b=2)');
 for(const destination of ['../证据/原件.md','file:///tmp/original.md','javascript:alert(1)','./images/source.png','https://example.com/image.png?a=1&amp;b=2'])assert.ok(html.includes(destination),`reading must retain ${destination}`);
 assert.doesNotMatch(html,/<a\b|<img\b|<script\b|href=/i);
});
test('Markdown tables retain every authored cell and stop before subsequent blocks containing pipes',()=>{
 const table='| 分类 |\n| --- |\n| 常规 | 额外证据不能丢 |\n';
 for(const [following,pattern] of [
  ['## 后续结论 | 关键证据',/<\/table><\/div><h2>后续结论 \| 关键证据<\/h2>/],
  ['> 引用 | 原话',/<\/table><\/div><blockquote><p>引用 \| 原话<\/p><\/blockquote>/],
  ['- 资料 | 附件',/<\/table><\/div><ul><li><p>资料 \| 附件<\/p><\/li><\/ul>/],
  ['```text | source\n保留代码\n```',/<\/table><\/div><pre[^>]*><code>保留代码<\/code><\/pre>/]
 ]){
  const html=render(table+following);assert.match(html,/额外证据不能丢<\/td>/);assert.match(html,pattern);
 }
});

test('account card summary removes layout syntax while retaining authored text and source targets',()=>{
 const source='# 账号名字\n\n> 核心 **真实经验**\n\n- 第一条\n- 第二条\n\n| 方向 | 说明 |\n| --- | --- |\n| AI | 清楚具体 |\n\n![原图](./source.png)';
 assert.equal(module.exports.markdownSummary(source,'账号名字'),'核心 真实经验 第一条 第二条 方向 说明 AI 清楚具体 原图（图片：./source.png）');
 assert.equal(module.exports.markdownSummary('普通备注，使用 C#。'),'普通备注，使用 C#。');
 assert.equal(module.exports.markdownSummary(''),'');
});
test('account card summary remains plain React text with markup and code preserved safely',()=>{
 const summary=module.exports.markdownSummary('## 原始说明\n\n<script>alert(1)</script>\n\n```md\n# 原代码 | >\n```');
 assert.equal(summary,'原始说明 <script>alert(1)</script> # 原代码 | >');
 const html=renderToStaticMarkup(React.createElement('p',null,summary));assert.doesNotMatch(html,/<script/);assert.match(html,/&lt;script&gt;/);
});

test('trusted renderer can replace only saved reference tokens while code and plain callers stay inert',()=>{
 const source='![图](./中%20文.png)\n\n[[目标|别名]]\n\n`[[目标|别名]]`\n\n```md\n![图](./中%20文.png)\n```';
 const seen=[];const html=render(source,{renderReference:raw=>{seen.push(raw);return React.createElement('button',{type:'button'},raw);}});
 assert.equal((html.match(/<button/g)??[]).length,2);assert.deepEqual(seen,['![图](./中%20文.png)','[[目标|别名]]']);
 assert.doesNotMatch(render(source),/<button|<img|href=/);assert.match(render(source),/\[\[目标\|别名\]\]/);
});
test('trusted images retain angle-delimited authored paths containing spaces',()=>{
 const raw='![原图](<../图片/中 文.png>)';const seen=[];const html=render(raw,{renderReference:value=>{seen.push(value);return React.createElement('button',{type:'button'},'受控原图');}});assert.deepEqual(seen,[raw]);assert.match(html,/受控原图/);
});
test('trusted reference replacement preserves emphasis and accepts empty image descriptions',()=>{
 const seen=[];const html=render('**重点** *说明* ~~旧值~~ **[[目标]]** ![](./image.png)',{renderReference:raw=>{seen.push(raw);return React.createElement('button',null,raw);}});
 assert.deepEqual(seen,['[[目标]]','![](./image.png)']);
 assert.match(html,/<strong>重点<\/strong>/);assert.match(html,/<em>说明<\/em>/);assert.match(html,/<del>旧值<\/del>/);
 assert.match(html,/<strong><button>\[\[目标\]\]<\/button><\/strong>/);
 assert.match(render('![](./image.png)'),/图片：\.\/image.png/);
});
