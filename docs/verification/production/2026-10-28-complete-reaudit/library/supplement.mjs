import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const evidence=new URL('./',import.meta.url),hash=x=>createHash('sha256').update(x).digest('hex');
const sources=[['original-A','/Users/mac/Downloads/第二大脑交接包_2026-10-16/第二大脑','/tmp/nova-installed-library-reaudit-A-20261028/第二大脑'],['original-B','/Users/mac/Downloads/锦成工作台-同事版/数据和程序/AIJinCheng/个人IP与内容/第二大脑','/tmp/nova-installed-library-reaudit-B-20261028/第二大脑']];
const integrity=[];
for(const[id,source,copy]of sources){const rows=[];for(const entry of await fs.readdir(source,{recursive:true,withFileTypes:true})){if(!entry.isFile())continue;const file=path.join(entry.parentPath,entry.name),relativePath=path.relative(source,file),sourceHash=hash(await fs.readFile(file));let copyHash;try{copyHash=hash(await fs.readFile(path.join(copy,relativePath)));}catch{}rows.push({relativePath,sourceHash,copyHash,unchanged:sourceHash===copyHash});}integrity.push({id,source,copy,sourceWorkbenchExists:await fs.stat(path.join(source,'.workbench')).then(()=>true,()=>false),files:rows.length,allOriginalBytesMatchCopy:rows.every(r=>r.unchanged),mismatches:rows.filter(r=>!r.unchanged),manifest:rows});}
const zip='/Users/mac/Desktop/自媒体工作台-0.5.0-交付/第二大脑-0.5.0-初始内容库.zip';
const installed='/Applications/自媒体工作台.app/Contents/Resources/app';
const runtimePaths=['workbench/dist/release.json','workbench/dist/main/worker.mjs','workbench/dist/main/vault-worker.mjs','workbench/dist/main/production-worker.mjs','workbench/dist/main/creation-worker.mjs','workbench/dist/main/report-navigation.mjs','plugin-src/src/lib/creation-document/parse.mjs','plugin-src/src/lib/creation-document/store.mjs','plugin-src/src/lib/vault/core.mjs','plugin-src/src/lib/vault/source-map.mjs','plugin-src/src/lib/vault/resources.mjs'];
const files=[];for(const relativePath of runtimePaths){const bytes=await fs.readFile(path.join(installed,relativePath));files.push({relativePath,bytes:bytes.length,sha256:hash(bytes)});}
await fs.writeFile(new URL('source-and-runtime-integrity.json',evidence),JSON.stringify({at:new Date().toISOString(),zip:{path:zip,sha256:hash(await fs.readFile(zip))},installed,installedFiles:files,sources:integrity},null,2));
console.log(JSON.stringify(integrity.map(({manifest,...row})=>row)));
