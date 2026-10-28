import fs from 'node:fs';
import {bindingForRuntime,digest,fail,identity,json,readBytes,safe,uuidFor} from '../vault/core.mjs';
const provenance=value=>{const copy={...(object(value)??{})};delete copy.status;delete copy.writable;return JSON.stringify(copy);};
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const object=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:null;
let cachedRoot='',cachedReceipts=new Map();
function creationIdentity(receipt,name){
 const r=receipt;if(r?.format!=='nova-vault-mutation'||r.status!=='committed'||r.action!=='create'||r.beforeHash!==null||r.mutationId!==name.slice(0,-5)||!r.request||r.requestHash!==digest(JSON.stringify(r.request))||!['create','create-report'].includes(r.request.action)||typeof r.after!=='string')return null;
 const bytes=Buffer.from(r.after,'base64');if(bytes.toString('base64')!==r.after||r.result?.text!==bytes.toString('utf8')||r.result?.document?.relativePath!==r.path||r.result.document.hash!==digest(bytes))return null;
 const blocks=[...r.result.text.matchAll(/<!-- nova-content-hub:resource\r?\n([\s\S]*?)\r?\n-->/g)];if(blocks.length!==1)return null;let block;try{block=JSON.parse(blocks[0][1]);}catch{return null;}
 if(!['account','report'].includes(block.kind)||!UUID.test(block.id??'')||!UUID.test(block.transaction?.mutationId??'')||r.mutationId!==uuidFor(`${block.transaction.mutationId}:resource:${block.kind}:${block.id}`))return null;
 if(r.request.action==='create-report'?block.kind!=='report'||r.request.text!==r.result.text:block.kind!=='account'||r.request.input?.section!=='accounts'||r.request.input.text!==r.result.text)return null;
 return JSON.stringify([block.kind,block.id,r.path]);
}
function manualBirths(binding){
 const root=binding.vaultRoot,key=JSON.stringify([root,binding.vaultId,identity(root)]);if(cachedRoot!==key){cachedRoot=key;cachedReceipts=new Map();}
 const names=fs.readdirSync(safe(root,'.workbench/mutations'));if(names.length>20000)fail('NOT_READY','资料变更记录超过来源核验上限');
 const next=new Map(),births=new Set();
 for(const name of names){
  if(!/^[A-Za-z0-9_-]{8,100}\.json$/.test(name))continue;
  const relative='.workbench/mutations/'+name,stat=fs.lstatSync(safe(root,relative),{bigint:true});if(!stat.isFile()||stat.nlink!==1n)fail('CORRUPT','管理来源事务文件类型无效');
  const version=[stat.dev,stat.ino,stat.size,stat.mtimeNs,stat.ctimeNs].join(':'),old=cachedReceipts.get(name),birth=old?.version===version?old.birth:creationIdentity(json(root,relative),name);next.set(name,{version,birth});if(birth)births.add(birth);
 }
 cachedReceipts=next;return births;
}
function context(runtimeRoot){
 const binding=bindingForRuntime(runtimeRoot);if(!binding)return null;let state;
 try{state=json(binding.vaultRoot,'.workbench/resource-projection.json');}catch(error){if(error.code==='ENOENT')return{binding,resources:{account:{},report:{}},births:new Set()};throw error;}
 if(state.format!=='nova-vault-resources'||!object(state.resources)||!object(state.resources.account)||!object(state.resources.report))fail('CORRUPT','资料来源映射无效');
 return{binding,resources:state.resources,births:manualBirths(binding)};
}
function policy(kind,record,source){
 const meta=object(record.meta);if(kind==='report'&&(record.type==='viral-radar'||meta?.radar||meta?.taskId||meta?.attemptId||meta?.receiptHash))return{editable:false,reason:'任务与雷达报告由专属事实和回执管理。'};
 const entry=source?.resources[kind]?.[record.id];if(!entry)return{editable:true,reason:null};
 if(entry.missing)return{editable:false,reason:'原来源缺失，保留历史；不能当作已回收资料改写。'};
 if(entry.sourceId||entry.sourceWritable===false||entry.companion||!source.births.has(JSON.stringify([kind,record.id,entry.relativePath])))return{editable:false,reason:'原来源投影只读，请在原来源核对。'};
 if(digest(readBytes(source.binding.vaultRoot,entry.relativePath))!==entry.hash)return{editable:false,reason:'原资料已变化，请刷新后核对。'};
 return{editable:true,reason:null};
}
export function productionRecordPermissions(runtimeRoot,snapshot){const source=context(runtimeRoot),result={accounts:{},reports:{}};for(const [kind,collection]of [['account','accounts'],['report','reports']])for(const record of snapshot[collection])result[collection][record.id]=policy(kind,record,source);return result;}
/** Core invokes this while holding its existing workspace lock, before publishing an intent. */
export function assertProductionRecordMutation(runtimeRoot,snapshot,op,input){
 const kind=/Account$/.test(op)?'account':/Report$/.test(op)?'report':null;if(!kind)return;const old=input.id?snapshot[kind==='account'?'accounts':'reports'].find(record=>record.id===input.id):null;
 if(input.id&&!old)fail('NOT_FOUND','资料记录不存在');if(old){const permission=policy(kind,old,context(runtimeRoot));if(!permission.editable)fail('FORBIDDEN',permission.reason);}
 if(op==='saveReport'){const meta=object(input.meta);if(input.type==='viral-radar'||meta?.radar||['taskId','attemptId','artifactId','receiptHash'].some(key=>Object.hasOwn(meta??{},key)))fail('FORBIDDEN','普通报告表单不能写入任务或雷达回执身份');if(meta?.vault&&provenance(meta.vault)!==provenance(context(runtimeRoot)?.resources.report?.[old?.id]??object(old?.meta)?.vault))fail('FORBIDDEN','普通报告表单不能自选原来源身份');}
}
