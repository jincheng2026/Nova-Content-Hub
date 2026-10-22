import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {snapshotPackage} from '../../../../plugin-src/src/lib/package-snapshot.mjs';

const repo=path.resolve(import.meta.dirname,'../../../..'),oldEvidence=path.join(repo,'docs/verification/production/2026-10-22-desktop-interactions-0343');
const read=async file=>JSON.parse(await fs.readFile(file,'utf8')),hash=bytes=>createHash('sha256').update(bytes).digest('hex'),digest=value=>hash(JSON.stringify(value));
export const preservationFile=path.join(repo,'workbench/release/preserved-preview-0343.noindex/initial-266922901c7547e73923184e9c44b93971e095b2/preservation.json');

export async function verifyPreservation(){
 const record=await read(preservationFile),old=await read(path.join(oldEvidence,'package.json'));
 assert.equal(record.sourceCommit,old.sourceCommit);assert.equal(record.dmgSha256,old.dmgSha256);
 for(const file of record.files)assert.equal(hash(await fs.readFile(file.preservedPath)),file.sha256,'Preserved original build file changed');
 assert.equal(record.files.find(file=>file.originalPath===old.dmg)?.sha256,old.dmgSha256);
 assert.equal(digest(await snapshotPackage(old.source)),old.treeSha256,'Original archived application changed');
 assert.equal(digest(await snapshotPackage(old.deliveryDirectory)),record.deliveryTreeSha256,'Original delivery changed');
 assert.equal(hash(await fs.readFile(path.join(old.deliveryDirectory,`自媒体工作台-${old.version}-Mac苹果芯片.dmg`))),old.dmgSha256);
 return {file:preservationFile,sourceCommit:record.sourceCommit,dmgSha256:record.dmgSha256,files:record.files,oldArchive:old.source,oldDelivery:old.deliveryDirectory,oldArchiveAndDeliveryUnchanged:true};
}

async function preserve(){
 const old=await read(path.join(oldEvidence,'package.json'));assert.equal(old.version,'0.3.43');
 const destination=path.dirname(preservationFile);await fs.mkdir(destination,{recursive:true});
 // Refuse a second copy from an already replaced standard output path.
 try{await fs.lstat(preservationFile);return await verifyPreservation();}catch(error){if(error.code!=='ENOENT')throw error;}
 const output=path.dirname(old.dmg),files=[];
 for(const name of [path.basename(old.dmg),path.basename(old.dmg)+'.blockmap','builder-debug.yml','electron-builder.json']){
  const originalPath=path.join(output,name),preservedPath=path.join(destination,name),bytes=await fs.readFile(originalPath),sha256=hash(bytes);
  if(originalPath===old.dmg)assert.equal(sha256,old.dmgSha256,'Original DMG must still match its frozen receipt');
  await fs.writeFile(preservedPath,bytes,{flag:'wx'});assert.equal(hash(await fs.readFile(preservedPath)),sha256);assert.equal(hash(await fs.readFile(originalPath)),sha256);
  files.push({originalPath,preservedPath,bytes:bytes.length,sha256});
 }
 const record={recordedAt:new Date().toISOString(),version:old.version,sourceCommit:old.sourceCommit,dmgSha256:old.dmgSha256,files,archive:old.source,archiveTreeSha256:old.treeSha256,deliveryDirectory:old.deliveryDirectory,deliveryTreeSha256:digest(await snapshotPackage(old.deliveryDirectory))};
 await fs.writeFile(preservationFile,JSON.stringify(record,null,2)+'\n',{flag:'wx'});return await verifyPreservation();
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 assert.ok(['preserve','verify'].includes(process.argv[2])&&process.argv.length===3,'Use preserve.mjs preserve|verify');
 console.log(JSON.stringify({status:'PASS',...await(process.argv[2]==='preserve'?preserve():verifyPreservation())}));
}
