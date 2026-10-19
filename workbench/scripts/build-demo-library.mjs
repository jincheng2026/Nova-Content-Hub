import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {createLibrary} from '../../plugin-src/src/lib/file-library/index.mjs';
import {installBuiltins} from '../../plugin-src/src/lib/library-seed/index.mjs';
export function buildDemoLibrary() {
 const workbench=fileURLToPath(new URL('../',import.meta.url));
 const release=path.join(workbench,'release');fs.mkdirSync(release,{recursive:true});
 const root=path.join(fs.mkdtempSync(path.join(release,'demo-')),'AI自媒体示例库');
 const lib=createLibrary(root);installBuiltins(lib);
 const resources=fileURLToPath(new URL('../../plugin-src/resources/builtin-examples/',import.meta.url));
 const proof=JSON.parse(fs.readFileSync(path.join(resources,'provenance.json'),'utf8'));
 let content=lib.createContent({title:'让创作更有条理',body:'这是AI自媒体方向的真实生图示例，使用内置「科技姐聊AI · 空间操作风」模板。\n\n把灵感、素材和封面放进同一个工作空间，让每次表达更清楚。先明确主题，再组织资料，最后比较封面并安排发布。\n\n封面来自2026-10-19真实WorkBuddy生图，人物为AI虚构创作者，并非本人照片；未裁剪、去标或重编码，也不代表已经发布。',preferredTemplateId:proof.templateId,isExample:true});
 for(let i=0;i<proof.hashes.length;i++){
  const source=path.join(resources,`ai-creator-${i+1}.png`),bytes=fs.readFileSync(source);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),proof.hashes[i]);
  const asset=lib.importAsset(source,{purpose:'generated-cover'});
  content=lib.registerContentCandidate(content.id,{assetHash:asset.assetHash,requestId:'real-demo-20261019',attemptId:'workbuddy-original',template:{id:proof.templateId,version:proof.templateVersion},source:'workbuddy',originalName:`真实科技封面-${i+1}.png`},content.editToken);
 }
 content=lib.selectContentCover(content.id,content.candidates[0].id,content.editToken);
 assert.equal(content.candidates.length,2);assert.equal(content.isExample,true);
 fs.writeFileSync(path.join(root,'示例说明.txt'),'在工作台打开这个文件夹，即可查看真实候选、收藏、比较和批注。\n模板是内置科技姐空间操作风；人物为AI虚构。原生候选保留当时平台标识，新的生图提示已要求不额外绘制水印，平台强制标识不保证可关闭。\n原图未经后处理。请把此库复制到文稿等可写位置后打开，不要直接在DMG只读挂载内使用。\n');
 return root;
}
