import {productionArchiveCategory} from './production-archive-category.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HASH=/^[a-f0-9]{64}$/;
const digest=value=>createHash('sha256').update(value).digest('hex');
const json=value=>JSON.stringify(value,null,2)+'\n';
const archiveError=(code,message)=>{throw Object.assign(Error(message),{code});};
const relative=(home,file)=>path.relative(home,file).split(path.sep).join('/');
const link=value=>value.split('/').map(encodeURIComponent).join('/');
/** Rebuildable, versioned view. Receipts and immutable assets remain authoritative. Called under the library lock. */
export function productionArchive({root,libraryId,task,reports,assertRootIdentity,ensureDirectory,safePath,syncDirectory,readAsset,assetPath,hook=()=>{},fail=archiveError}){
 if(!task||!UUID.test(task.id))fail('NOT_FOUND','助手任务不存在。');
 const attempt=task.attempts.find(a=>a.id===task.activeAttemptId&&['submitted','accepted'].includes(a.status))??task.attempts.slice().reverse().find(a=>['submitted','accepted'].includes(a.status));
 if(!attempt?.receipt||!attempt.result)fail('ARCHIVE_NOT_READY','任务尚未提交真实回执，暂不能归档。');
 const receipt=attempt.receipt,resultHash=digest(JSON.stringify(attempt.result));
 if(!UUID.test(attempt.id)||digest(JSON.stringify(task.request))!==task.requestHash||receipt.taskId!==task.id||receipt.attemptId!==attempt.id||receipt.requestHash!==task.requestHash||receipt.resultHash!==resultHash||receipt.sha256!==digest(JSON.stringify({taskId:task.id,attemptId:attempt.id,requestHash:task.requestHash,resultHash})))fail('CORRUPT','任务回执完整性校验失败。');
 const category=productionArchiveCategory(task);
 const boundReports=reports.filter(r=>r.meta?.taskId===task.id&&r.meta?.attemptId===attempt.id||r.meta?.radar?.taskId===task.id&&r.meta?.radar?.attemptId===attempt.id&&r.meta.radar.receiptHash===receipt.sha256).map(r=>({id:r.id,title:r.title,type:r.type,pages:r.pages,sourceUrl:r.sourceUrl,collectedAt:r.collectedAt,taskId:task.id,attemptId:attempt.id}));
 const facts={format:'nova-production-archive',schemaVersion:1,libraryId,category,taskId:task.id,attemptId:attempt.id,status:attempt.status,requestHash:task.requestHash,receiptHash:receipt.sha256,receipt,task:{title:task.title,kind:task.kind,contentId:task.contentId,accountId:task.accountId},host:attempt.host,request:task.request,result:attempt.result,reports:boundReports,submittedOrAcceptedAt:attempt.updatedAt};
 let generation=digest(JSON.stringify(facts)),home=path.join(root,'知识库','助手产物',category,task.id,attempt.id,generation);const warnings=[],assets=new Map();
 function add(hash,source){if(HASH.test(hash)){const sources=assets.get(hash)??[];if(!sources.includes(source))sources.push(source);assets.set(hash,sources);}}
 function dataAssets(value,source){if(Array.isArray(value)){value.forEach((v,i)=>dataAssets(v,`${source}[${i}]`));return;}if(!value||typeof value!=='object')return;for(const [key,v]of Object.entries(value)){if((key==='assetHash'||key.endsWith('AssetHash'))&&typeof v==='string')add(v,`${source}.${key}`);else dataAssets(v,`${source}.${key}`);}}
 for(const artifact of attempt.result.artifacts){if(artifact.assetHash)add(artifact.assetHash,`artifact:${artifact.id}`);dataAssets(artifact.data,`artifact:${artifact.id}.data`);}
 for(const report of boundReports)for(const page of report.pages)add(page.assetHash,`report:${report.id}/page:${page.id}`);
 const assetRecords=[...assets].sort(([a],[b])=>a.localeCompare(b)).map(([hash,sources])=>{const entry={assetHash:hash,relativePath:relative(home,assetPath(hash)),sources,available:false,detectedType:null,bytes:null};try{const asset=readAsset(hash);Object.assign(entry,{available:true,detectedType:asset.detectedType,bytes:asset.bytes});}catch(error){warnings.push(`关联资产 ${hash} 暂不可读取（${/^[A-Z_]+$/.test(error.code)?error.code:'IO_ERROR'}）；原回执保留。`);}return entry;});
 generation=digest(JSON.stringify({facts,assets:assetRecords}));home=path.join(root,'知识库','助手产物',category,task.id,attempt.id,generation);
 const lines=[`# ${task.title}`,'',attempt.status==='accepted'?'状态：人工已验收。知识候选仍须单独审核。':'状态：已提交，待人工验收；回执不代表内容质量已通过。','', '本目录从任务事实重建，人工整理请另存或在知识管理中编辑。不要将投影修改当作原任务提交或知识已采纳。','',`内容库：${libraryId}`,`任务：${task.id}`,`尝试：${attempt.id}`,`固定请求 SHA256：${task.requestHash}`,`回执 SHA256：${receipt.sha256}`,'','## 固定请求','',task.request.prompt,'','```json',json(task.request.parameters).trimEnd(),'```','','## 完整结论','',attempt.result.summary];
 for(const artifact of attempt.result.artifacts)lines.push('',`## ${artifact.title} · ${artifact.kind}`,'',artifact.text,'','### 结构化原始资料','','```json',json(artifact.data).trimEnd(),'```');
 lines.push('','## 关联原始资产','','资产保留在本内容库的 SHA256 资源目录；本归档不复制或自动执行报告 HTML。');
 for(const asset of assetRecords)lines.push('',asset.available?`- [${asset.assetHash}](${link(asset.relativePath)}) · ${asset.detectedType} · ${asset.bytes} 字节 · ${asset.sources.join('；')}`:`- ${asset.assetHash} · 暂不可读取 · ${asset.sources.join('；')}`);
 if(warnings.length)lines.push('','## 待补充资料','',...warnings);
 const outputs={'结果.md':lines.join('\n')+'\n','结果.json':json(facts)},manifest={format:'nova-production-archive-manifest',schemaVersion:1,libraryId,category,taskId:task.id,attemptId:attempt.id,requestHash:task.requestHash,receiptHash:receipt.sha256,resultHash,status:attempt.status,generation,files:Object.entries(outputs).map(([name,bytes])=>({name,sha256:digest(bytes),bytes:Buffer.byteLength(bytes)})),assets:assetRecords};
 outputs['manifest.json']=json(manifest);
 const reply={directory:home,category,taskId:task.id,attemptId:attempt.id,receiptHash:receipt.sha256,status:attempt.status,warnings,ready:warnings.length===0};
 assertRootIdentity();
 let parent=root;for(const part of ['知识库','助手产物',category,task.id,attempt.id]){parent=path.join(parent,part);ensureDirectory(parent);}
 const existing=safePath(home,true);
 if(existing){
  if(!existing.isDirectory())fail('UNSAFE_PATH','归档位置不是普通目录。');
  const names=fs.readdirSync(home).sort(),expected=Object.keys(outputs).sort();let matches=JSON.stringify(names)===JSON.stringify(expected);
  for(const [name,bytes]of Object.entries(outputs)){const file=path.join(home,name),stat=safePath(file,true);if(!stat?.isFile()||stat.size!==Buffer.byteLength(bytes)){matches=false;continue;}const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);try{if(!fs.readFileSync(fd).equals(Buffer.from(bytes)))matches=false;}finally{fs.closeSync(fd);}}
  if(!matches){reply.ready=false;warnings.push('归档文件或清单含人工修改、陌生文件或未完成写入，已保留现场；请另存整理内容后移走此投影目录，再重建。');}
  return reply;
 }
 const staging=path.join(parent,`.nova-archive-${randomUUID()}`);ensureDirectory(staging);
 try{
  for(const [name,bytes]of Object.entries(outputs)){const temporary=path.join(staging,`.tmp-${randomUUID()}`),fd=fs.openSync(temporary,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}assertRootIdentity();safePath(temporary);fs.renameSync(temporary,path.join(staging,name));}
  syncDirectory(staging);hook('productionArchiveBeforePublish',{taskId:task.id,attemptId:attempt.id,directory:home});assertRootIdentity();safePath(staging);if(safePath(home,true))fail('CONFLICT','归档位置已改变。');fs.renameSync(staging,home);syncDirectory(parent);
 }catch(error){
  // Remove only our known regular staging files; uncertain or foreign entries stay untouched.
  try{assertRootIdentity();safePath(staging);for(const name of Object.keys(outputs)){const file=path.join(staging,name);if(safePath(file,true)?.isFile())fs.unlinkSync(file);}fs.rmdirSync(staging);}catch{}
  throw error;
 }
 return reply;
}
