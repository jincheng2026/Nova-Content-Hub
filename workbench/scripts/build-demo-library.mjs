import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {createLibrary} from '../../plugin-src/src/lib/file-library/index.mjs';
import {installBuiltins} from '../../plugin-src/src/lib/library-seed/index.mjs';
export function buildDemoLibrary(releaseDirectory) {
 const workbench=fileURLToPath(new URL('../',import.meta.url));
 const release=releaseDirectory ?? path.join(workbench,'release');fs.mkdirSync(release,{recursive:true});
 const root=path.join(fs.mkdtempSync(path.join(release,'demo-')),'AI自媒体示例库');
 const lib=createLibrary(root);installBuiltins(lib);
 assert.equal(lib.listTemplates().length,20);assert.equal(lib.listPrompts().length,52);
 const resources=fileURLToPath(new URL('../../plugin-src/resources/builtin-examples/',import.meta.url));
 const proof=JSON.parse(fs.readFileSync(path.join(resources,'provenance.json'),'utf8'));
 let content=lib.createContent({title:'让创作更有条理',body:'把灵感、素材和封面放进同一个工作空间，让每次表达更清楚。\n\n先明确这次想说什么，再整理资料、选好模板，比较两张封面的标题与视觉重点，挑选更适合发布的一张。\n\n本篇使用「科技姐聊AI · 空间操作风」模板，附两张 WorkBuddy 生成的原始封面供参考。人物为 AI 虚构创作者，并非本人照片；图片未经裁剪或去标，保留平台原有标识。此内容为创作示例，尚未发布。',preferredTemplateId:proof.templateId,isExample:true});
 for(let i=0;i<proof.hashes.length;i++){
  const source=path.join(resources,`ai-creator-${i+1}.png`),bytes=fs.readFileSync(source);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),proof.hashes[i]);
  const asset=lib.importAsset(source,{purpose:'generated-cover'});
  content=lib.registerContentCandidate(content.id,{assetHash:asset.assetHash,requestId:'real-demo-20261019',attemptId:'workbuddy-original',template:{id:proof.templateId,version:proof.templateVersion},source:'workbuddy',originalName:`真实科技封面-${i+1}.png`},content.editToken);
 }
 content=lib.selectContentCover(content.id,content.candidates[0].id,content.editToken);
 assert.equal(content.candidates.length,2);assert.equal(content.isExample,true);
 fs.writeFileSync(path.join(root,'示例说明.txt'),'先将整个“AI自媒体示例库”文件夹复制到“文稿”等可写位置，再在工作台选择打开此内容库。\n这里包含 20 个模板、52 条提示词，以及一篇附有两张封面的示例内容，可直接查看、比较、收藏和批注。\n两张封面由 WorkBuddy 生成，使用“科技姐聊AI · 空间操作风”模板；人物为 AI 虚构，图片保留原始内容与平台标识，尚未实际发布。\n制作自己的内容时，可选择模板并改写标题，再交给你选择的助手生成封面。\n');
 return root;
}
