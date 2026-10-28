import fs from 'node:fs';
import path from 'node:path';
import {atomic,digest,fail,identity,json,mkdir,readBytes,safe,writeJSON} from '../vault/core.mjs';
export const FINAL_ASSET_LIMITS=Object.freeze({text:8*1024*1024,cover:64*1024*1024,raw:80*1024*1024,receipt:120*1024*1024});
const HASH=/^[a-f0-9]{64}$/,UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export const validHash=value=>typeof value==='string'&&HASH.test(value);
export const validBundle=value=>typeof value==='string'&&UUID.test(value);
export const jsonBytes=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
export const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const iso=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
export const isManagedFinalAssetPath=value=>typeof value==='string'&&/^05_内容草稿\/(?:已做\/)?T\d{3,}_[^/]+\/最终资产(?:\/|$)/.test(value);
export const validDirectory=value=>typeof value==='string'&&/^05_内容草稿\/(?:已做\/)?T\d{3,}_[^/\\]+$/.test(value)&&!value.includes('\0');
export function optionalFinalBytes(root,relative,limit=FINAL_ASSET_LIMITS.text){try{return readFinalBytes(root,relative,limit);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
/** Bounded fd reader for immutable rasters. Never widens the ordinary Vault reader. */
export function readFinalBytes(root,relative,limit){
 if(!Number.isSafeInteger(limit)||limit<0||limit>FINAL_ASSET_LIMITS.cover)fail('INVALID_INPUT','最终资产读取上限无效');
 const target=safe(root,relative),before=fs.lstatSync(target,{bigint:true});
 if(!before.isFile()||before.nlink!==1n||before.size>BigInt(limit))fail('INVALID_INPUT','最终资产文件类型、链接或大小无效');
 const fd=fs.openSync(target,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW??0)|(fs.constants.O_NONBLOCK??0));
 const equal=(a,b)=>['dev','ino','size','nlink','mtimeNs','ctimeNs'].every(key=>a[key]===b[key]);
 try{const opened=fs.fstatSync(fd,{bigint:true});if(!opened.isFile()||opened.nlink!==1n||!equal(before,opened))fail('CONFLICT','最终资产在打开时变化');
  const chunks=[];let total=0;for(;;){const block=Buffer.allocUnsafe(Math.min(64*1024,limit-total+1)),count=fs.readSync(fd,block,0,block.length,null);if(!count)break;total+=count;if(total>limit)fail('INVALID_INPUT','最终资产超过读取上限');chunks.push(block.subarray(0,count));}
  if(!equal(opened,fs.fstatSync(fd,{bigint:true}))||!equal(before,fs.lstatSync(target,{bigint:true}))||BigInt(total)!==before.size)fail('CONFLICT','最终资产在读取期间变化');return Buffer.concat(chunks,total);
 }finally{fs.closeSync(fd);}
}
export const namesFor=mime=>({script:'逐字稿.md',title:'标题.txt',description:'简介.txt',coverText:'封面文字.txt',cover:({'image/png':'封面.png','image/jpeg':'封面.jpg','image/webp':'封面.webp','image/gif':'封面.gif'})[mime],sources:'来源.json',readme:'交接说明.md'});
function checkWork(work){return work&&typeof work.vaultId==='string'&&work.vaultId.length<=100&&/^T\d{3,}$/.test(work.workId);}
export function validateManifest(manifest){
 if(!manifest||manifest.format!=='nova-final-assets'||manifest.schemaVersion!==1||!validBundle(manifest.bundleId)||!checkWork(manifest.work)||typeof manifest.contentIdAtSave!=='string'||!iso(manifest.adoptedAt)||manifest.adoption?.kind!=='author-save'||!/^[A-Za-z0-9_-]{8,100}$/.test(manifest.adoption.mutationId??'')||!validHash(manifest.adoption.previewToken)||!validHash(manifest.packaging?.selectionToken)||!validHash(manifest.manuscript?.hash)||!validHash(manifest.cover?.assetHash)||!validBundle(manifest.cover.candidateId)||!iso(manifest.cover.selectedAt)||!['current','different','unknown'].includes(manifest.cover.sourceMatch))fail('CORRUPT','最终资产清单身份无效');
 if(manifest.packaging.vaultId!==manifest.work.vaultId||manifest.packaging.workId!==manifest.work.workId||typeof manifest.packaging.pageId!=='string'||!validHash(manifest.packaging.revision)||!['current-document','jc-doc-segments','recorded'].includes(manifest.manuscript.kind)||manifest.manuscript.vaultId!==manifest.work.vaultId||manifest.manuscript.workId!==manifest.work.workId)fail('CORRUPT','最终资产来源身份无效');
 for(const role of ['title','coverText','description'])if(typeof manifest.packaging.slots?.[role]?.itemId!=='string'||!validHash(manifest.packaging.slots[role].hash))fail('CORRUPT','最终包装字段无效');
 const names=namesFor(manifest.cover.mime);if(!names.cover||!Number.isSafeInteger(manifest.cover.width)||!Number.isSafeInteger(manifest.cover.height)||manifest.cover.width<1||manifest.cover.height<1||!['generated','imported','legacy'].includes(manifest.cover.provenance?.kind))fail('CORRUPT','最终封面描述无效');
 if(!Array.isArray(manifest.files)||manifest.files.length!==7||new Set(manifest.files.map(file=>file.role)).size!==7)fail('CORRUPT','最终资产文件集不完整');
 for(const file of manifest.files)if(!Object.hasOwn(names,file.role)||file.name!==names[file.role]||!validHash(file.sha256)||!Number.isSafeInteger(file.bytes)||file.bytes<0||file.bytes>(file.role==='cover'?FINAL_ASSET_LIMITS.cover:FINAL_ASSET_LIMITS.text)||file.mime!==(file.role==='cover'?manifest.cover.mime:file.role==='sources'?'application/json':file.role==='script'||file.role==='readme'?'text/markdown':'text/plain'))fail('CORRUPT','最终资产文件名、大小或类型无效');
 if(manifest.files.find(file=>file.role==='cover').sha256!==manifest.cover.assetHash||manifest.files.find(file=>file.role==='script').sha256!==manifest.manuscript.hash||manifest.files.reduce((sum,file)=>sum+file.bytes,0)>FINAL_ASSET_LIMITS.raw)fail('CORRUPT','最终资产文件摘要不一致');
 return manifest;
}
export function validateCurrent(value){if(!value||value.format!=='nova-final-assets-current'||value.schemaVersion!==1||!checkWork(value.work)||!validBundle(value.bundleId)||!validHash(value.manifestHash)||!/^[A-Za-z0-9_-]{8,100}$/.test(value.mutationId??'')||!iso(value.adoptedAt))fail('CORRUPT','当前最终资产指针无效');return value;}
export function verifyBundle(root,directory,bundleId,contentId,expectedHash=null){
 if(!validDirectory(directory)||!validBundle(bundleId))fail('INVALID_INPUT','最终资产版本标识无效');
 const relativeDirectory=directory+'/最终资产/版本/'+bundleId,manifestBytes=readFinalBytes(root,relativeDirectory+'/manifest.json',FINAL_ASSET_LIMITS.text),manifestHash=digest(manifestBytes);
 if(expectedHash!==null&&manifestHash!==expectedHash)fail('CONFLICT','最终资产清单已被修改');
 let manifest;try{manifest=validateManifest(JSON.parse(manifestBytes.toString('utf8')));}catch(error){if(error.code)throw error;fail('CORRUPT','最终资产清单不能解析');}
 const descriptor=json(root,'.workbench/vault.json');if(manifest.bundleId!==bundleId||manifest.work.vaultId!==descriptor.vaultId||manifest.contentIdAtSave!==contentId||!directory.split('/').at(-1).startsWith(manifest.work.workId+'_'))fail('CORRUPT','最终资产不属于当前知识库或内容');
 const allowed=new Set(['manifest.json',...manifest.files.map(file=>file.name)]);for(const name of fs.readdirSync(safe(root,relativeDirectory)))if(!allowed.has(name))fail('CORRUPT','最终版本目录含未知文件');
 const files=manifest.files.map(file=>{const bytes=readFinalBytes(root,relativeDirectory+'/'+file.name,file.role==='cover'?FINAL_ASSET_LIMITS.cover:FINAL_ASSET_LIMITS.text);if(bytes.length!==file.bytes||digest(bytes)!==file.sha256)fail('CORRUPT','最终资产字节校验失败：'+file.name);return {...file,bytes};});
 const decode=role=>{try{return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(files.find(file=>file.role===role).bytes);}catch{fail('CORRUPT','最终资产文本编码无效');}};
 const selected={bundleId,manifestHash,relativeDirectory,manifest,texts:Object.fromEntries(['script','title','description','coverText'].map(role=>[role,decode(role)])),cover:{...manifest.cover,resource:{contentId,bundleId,manifestHash,role:'cover'}}};
 return {selected,files:[...files.map(({role,...file})=>file),{name:'manifest.json',sha256:manifestHash,mime:'application/json',bytes:manifestBytes}]};
}
/** Scan only uses manifest metadata for large managed rasters, never the generic 8 MiB text reader. */
export function managedFinalAssetMetadata(root,relative,vaultId,cache={entries:new Map(),bytes:0}){
 const match=/^(05_内容草稿\/(?:已做\/)?T\d{3,}_[^/]+)\/最终资产(?:\/|$)/.exec(relative);if(!match)return null;
 const unverified={managedFinalAsset:'unverified'};const version=/^版本\/([^/]+)\/([^/]+)$/.exec(relative.slice(match[1].length+'/最终资产/'.length));
 if(!version||!validBundle(version[1]))return unverified;
 try{const key=match[1]+'/最终资产/版本/'+version[1],manifestPath=key+'/manifest.json';
  let manifest=cache.entries.get(key);
  if(!cache.entries.has(key)){
   const stat=fs.lstatSync(safe(root,manifestPath));
   if(!stat.isFile()||stat.nlink!==1||stat.size>FINAL_ASSET_LIMITS.text||cache.bytes+stat.size>FINAL_ASSET_LIMITS.text){cache.entries.set(key,null);return unverified;}
   const bytes=readBytes(root,manifestPath);cache.bytes+=bytes.length;manifest=validateManifest(JSON.parse(bytes.toString('utf8')));cache.entries.set(key,manifest);
  }
  if(!manifest||manifest.bundleId!==version[1]||manifest.work.vaultId!==vaultId||!match[1].split('/').at(-1).startsWith(manifest.work.workId+'_'))return unverified;
  const file=manifest.files.find(file=>file.name===version[2]);return file?{managedFinalAsset:'asset',finalAssetFile:file}:unverified;
 }catch{return unverified;}
}
export function applyFinalAssetsReceipt(root,receipt){
 if(!receipt||receipt.format!=='nova-vault-mutation'||receipt.action!=='final-assets'||!['pending','committed'].includes(receipt.status)||!/^[A-Za-z0-9_-]{8,100}$/.test(receipt.mutationId??'')||!validHash(receipt.requestHash)||digest(JSON.stringify(receipt.request))!==receipt.requestHash||receipt.request?.action!=='final-assets'||!validDirectory(receipt.contentDirectory)||!validBundle(receipt.bundleId)||!Array.isArray(receipt.writes)||receipt.writes.length!==9||Buffer.byteLength(JSON.stringify(receipt))>FINAL_ASSET_LIMITS.receipt)fail('CORRUPT','最终资产事务格式或大小无效');
 const rootBefore=identity(root),descriptor=json(root,'.workbench/vault.json');if(!same(rootBefore,descriptor.rootIdentity)||!same(receipt.work,{vaultId:descriptor.vaultId,workId:receipt.work?.workId})||!receipt.contentDirectory.split('/').at(-1).startsWith(receipt.work.workId+'_'))fail('CONFLICT','最终资产事务知识库身份已变化');
 const writes=receipt.writes.map((write,index)=>{
  const max=index===4?FINAL_ASSET_LIMITS.cover:FINAL_ASSET_LIMITS.text;
  if(!write||typeof write.after!=='string'||write.after.length>Math.ceil(max/3)*4||!(write.beforeHash===null||validHash(write.beforeHash)))fail('CORRUPT','最终资产事务目标编码无效');
  const bytes=Buffer.from(write.after,'base64');if(bytes.toString('base64')!==write.after||bytes.length>max)fail('CORRUPT','最终资产事务字节无效');return {...write,bytes,afterHash:digest(bytes)};
 });
 if(writes.reduce((sum,write)=>sum+write.bytes.length,0)>FINAL_ASSET_LIMITS.raw)fail('CORRUPT','最终资产事务原始字节超限');
 let manifest,pointer;try{manifest=validateManifest(JSON.parse(writes[7].bytes.toString('utf8')));pointer=validateCurrent(JSON.parse(writes[8].bytes.toString('utf8')));}catch(error){if(error.code)throw error;fail('CORRUPT','最终资产冻结清单无效');}
 const relativeDirectory=receipt.contentDirectory+'/最终资产/版本/'+receipt.bundleId,names=namesFor(manifest.cover.mime),roles=Object.keys(names),expected=[...roles.map(role=>relativeDirectory+'/'+names[role]),relativeDirectory+'/manifest.json',receipt.contentDirectory+'/最终资产/当前.json'];
 if(!same(manifest.work,receipt.work)||manifest.bundleId!==receipt.bundleId||manifest.contentIdAtSave!==receipt.request.input?.contentId||manifest.adoption.mutationId!==receipt.mutationId||manifest.adoption.previewToken!==receipt.request.input.expectedPreviewToken||!same(pointer.work,receipt.work)||pointer.bundleId!==receipt.bundleId||pointer.manifestHash!==writes[7].afterHash||pointer.mutationId!==receipt.mutationId||pointer.adoptedAt!==manifest.adoptedAt||writes[8].beforeHash!==receipt.request.input.expectedCurrentHash)fail('CORRUPT','最终资产冻结身份不一致');
 for(let index=0;index<writes.length;index++){const write=writes[index];if(write.relativePath!==expected[index]||(index<8&&write.beforeHash!==null))fail('CORRUPT','最终资产事务路径无效');safe(root,write.relativePath,true);if(index<7){const file=manifest.files.find(file=>file.role===roles[index]);if(file.sha256!==write.afterHash||file.bytes!==write.bytes.length)fail('CORRUPT','最终资产事务文件摘要无效');}}
 const result=receipt.result;if(result?.contentId!==manifest.contentIdAtSave||!same(result.work,receipt.work)||result.selected?.relativeDirectory!==relativeDirectory||result.selected?.bundleId!==receipt.bundleId||result.selected?.manifestHash!==pointer.manifestHash||!same(result.selected.manifest,manifest)||!same(result.current,{...pointer,hash:writes[8].afterHash}))fail('CORRUPT','最终资产冻结结果无效');
 for(const role of ['script','title','description','coverText'])if(result.selected.texts?.[role]!==new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(writes[roles.indexOf(role)].bytes))fail('CORRUPT','最终资产冻结文本无效');
 if(receipt.status==='committed'){const stored=json(root,'.workbench/mutations/'+receipt.mutationId+'.json');if(stored.status!=='committed'||!same(stored,receipt))fail('CORRUPT','最终资产已提交回执不一致');return result;}
 // Preflight ALL targets before publishing any one; each write repeats its CAS.
 for(const write of writes){let before;try{before=optionalFinalBytes(root,write.relativePath,write.relativePath.endsWith('/'+names.cover)?FINAL_ASSET_LIMITS.cover:FINAL_ASSET_LIMITS.text);}catch(error){if(['ENOENT','INVALID_INPUT','EISDIR','ENOTDIR'].includes(error.code))fail('CONFLICT','最终资产目标类型已变化，保留现场');throw error;}write.currentHash=before===null?null:digest(before);if(write.currentHash!==write.beforeHash&&write.currentHash!==write.afterHash)fail('CONFLICT','最终资产遇到外部修改，保留当前完整版本与未决收据：'+write.relativePath);}
 for(let index=0;index<writes.length;index++){
  const write=writes[index];if(!same(identity(root),rootBefore)||json(root,'.workbench/vault.json').vaultId!==receipt.work.vaultId)fail('CONFLICT','最终资产写入时知识库根身份已变化');
  // A previous target may have changed while later files were installed. Do not
  // publish a pointer to such a bundle, even when its original CAS succeeded.
  if(index===writes.length-1){try{verifyBundle(root,receipt.contentDirectory,receipt.bundleId,manifest.contentIdAtSave,writes[7].afterHash);}catch(error){fail('CONFLICT','最终资产在发布当前指针前变化，保留现场：'+error.message);}}
  if(write.currentHash===write.afterHash){const current=optionalFinalBytes(root,write.relativePath,index===4?FINAL_ASSET_LIMITS.cover:FINAL_ASSET_LIMITS.text);if(current===null||digest(current)!==write.afterHash)fail('CONFLICT','最终资产已写目标被外部修改');continue;}
  mkdir(root,path.posix.dirname(write.relativePath));
  try{atomic(root,write.relativePath,write.bytes,write.beforeHash);}catch(error){if(['INVALID_INPUT','EISDIR','ENOTDIR','ENOENT','ELOOP'].includes(error.code))fail('CONFLICT','最终资产目标类型或大小在写入前变化，保留收据');throw error;}
 }
 receipt.status='committed';writeJSON(root,'.workbench/mutations/'+receipt.mutationId+'.json',receipt);return result;
}
