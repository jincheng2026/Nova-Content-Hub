import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const here=new URL('./',import.meta.url);
const input=JSON.parse(await fs.readFile(new URL('unavailable-references.json',here),'utf8')).filter(x=>x.kind==='unavailable-creation-media');
const {root}=JSON.parse(await fs.readFile(new URL('all-library-items.json',here),'utf8'));
async function check(relativePath){if(relativePath===null)return null;const absolute=path.resolve(root,relativePath);assert.ok(absolute.startsWith(root+path.sep));let file;try{const s=await fs.lstat(absolute);file={exists:true,isFile:s.isFile(),isSymbolicLink:s.isSymbolicLink(),bytes:s.size};}catch(e){if(e.code!=='ENOENT')throw e;file={exists:false,error:e.code};}let parentExists;try{parentExists=(await fs.lstat(path.dirname(absolute))).isDirectory();}catch(e){if(e.code!=='ENOENT')throw e;parentExists=false;}return {relativePath:path.relative(root,absolute),...file,parentExists};}
const rows=[];
for(const [index,ref]of input.entries()){
 const originalTarget=path.relative(root,path.resolve(root,path.dirname(ref.sourcePath),decodeURIComponent(ref.href.split('#')[0])));
 const at=ref.href.indexOf('02_内容素材/');
 const rootMaterialTarget=at>=0?ref.href.slice(at):null;
 const archiveAt=ref.href.indexOf('内容数据统计/视频项目/');
 const importedArchiveTarget=archiveAt>=0?'08_原锦成来源/jincheng-original/archives/'+ref.href.slice(archiveAt+'内容数据统计/视频项目/'.length):null;
 const original=await check(originalTarget),rootMaterial=await check(rootMaterialTarget),importedArchive=await check(importedArchiveTarget);
 const misaligned=rootMaterial!==null&&original.relativePath!==rootMaterial.relativePath;
 rows.push({index:index+1,sourcePath:ref.sourcePath,href:ref.href,originalHrefTarget:original,rootMaterialSameSuffixTarget:rootMaterial,registeredImportedArchiveCandidate:importedArchive,relativePathMisalignedFromRootMaterials:misaligned,classification:misaligned?(rootMaterial.exists?'relative-path-failure-target-file-present':'relative-path-misaligned-and-file-missing-at-both-checked-locations'):rootMaterial?'correct-root-material-path-but-file-missing':'archive-file-missing-at-original-and-imported-candidate-locations'});
}
const result={at:new Date().toISOString(),scope:'Only 14 previously failed registered media references; direct lstat of original href resolution and corresponding root materials path (plus explicit imported archive candidate for the two archive references). No rebind, whole-library rescan, worker rerun, product or library writes.',root,summary:{referenceEntries:rows.length,uniqueSourceAndHrefPairs:new Set(rows.map(r=>r.sourcePath+'\0'+r.href)).size,uniqueHrefStrings:new Set(rows.map(r=>r.href)).size,uniqueOriginalResolvedTargets:new Set(rows.map(r=>r.originalHrefTarget.relativePath)).size,rootMaterialReferences:rows.filter(r=>r.rootMaterialSameSuffixTarget!==null).length,uniqueRootMaterialTargets:new Set(rows.filter(r=>r.rootMaterialSameSuffixTarget).map(r=>r.rootMaterialSameSuffixTarget.relativePath)).size,misalignedRootMaterialRelativePaths:rows.filter(r=>r.relativePathMisalignedFromRootMaterials).length,originalFilesPresent:rows.filter(r=>r.originalHrefTarget.exists&&r.originalHrefTarget.isFile).length,rootMaterialFilesPresent:rows.filter(r=>r.rootMaterialSameSuffixTarget?.exists&&r.rootMaterialSameSuffixTarget.isFile).length,importedArchiveFilesPresent:rows.filter(r=>r.registeredImportedArchiveCandidate?.exists&&r.registeredImportedArchiveCandidate.isFile).length},references:rows};
assert.equal(result.summary.referenceEntries,14);assert.equal(result.summary.uniqueOriginalResolvedTargets,14);assert.equal(result.summary.rootMaterialReferences,12);assert.equal(result.summary.misalignedRootMaterialRelativePaths,8);
await fs.writeFile(new URL('media-reference-location-correction.json',here),JSON.stringify(result,null,2));
const readme=new URL('README.md',here),text=await fs.readFile(readme,'utf8');
const heading='## 本地原片路径的追加校正';
const base=text.includes(heading)?text.slice(0,text.indexOf(heading)).trimEnd():text.trimEnd();
await fs.writeFile(readme,base+`\n\n${heading}\n\n追加只读逐条核对（${result.at}）：此前14条失败记录对应 **14个唯一 href / 14个唯一原位置目标**，不是去重后的14个可播放文件。其中12条指向02_内容素材；4条原相对地址正确落在库根02_内容素材下，但视频不存在；另8条位于已做目录，原 ../../02_内容素材 实际落入05_内容草稿/02_内容素材，存在明显少退一层的问题。对这8条再按库根02_内容素材的同一后缀核对，文件仍全部不存在。因此应同时记录“相对路径偏移”和“原位置及根素材候选位置均未提供文件”，不能仅改路径便宣称可播放，也不能把8条纯粹归为应用新增的丢文件。剩余2条是内容数据统计/视频项目的成片引用：原href解析位置和已注册08_原锦成来源/jincheng-original/archives的同名候选均不存在成片。\n\n本次只做14条引用的定位与lstat，没有整库重跑、改href或补文件。14个原位置、12个根素材候选、2个导入档案候选的文件存在数均为0；这只证明所列位置未提供文件，不代表凭此检索了用户全机其他位置。逐条路径与分类见 [media-reference-location-correction.json](media-reference-location-correction.json)。\n`);
console.log(JSON.stringify(result.summary));
