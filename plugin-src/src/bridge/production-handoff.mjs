import fs from 'node:fs';
import path from 'node:path';
import {uuidFor} from '../lib/vault/core.mjs';
import {randomUUID} from 'node:crypto';
import {openLibrary} from '../lib/file-library/index.mjs';
import {vaultRootForRuntime,readVaultTaskContext} from '../lib/vault/index.mjs';
import {validRelease} from '../content.mjs';
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const exact=(v,keys)=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const fail=(message,code='INVALID_HANDOFF')=>{throw Object.assign(new Error(message),{code});};
const check=(ok,message)=>{if(!ok)fail(message);};
const same=(a,b)=>a.dev===b.dev&&a.ino===b.ino;
function directory(target,create=false){
 check(typeof target==='string'&&path.isAbsolute(target)&&!target.includes('\0'),'Handoff directory must be absolute');
 let current=path.parse(target).root;
 for(const part of path.relative(current,target).split(path.sep).filter(Boolean)){
  current=path.join(current,part);if(create)try{fs.mkdirSync(current,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;}
  const st=fs.lstatSync(current);check(!st.isSymbolicLink()&&st.isDirectory(),'Unsafe handoff directory');
 }
 return fs.lstatSync(target,{bigint:true});
}
function releaseFor(release){
 check(release&&validRelease({...release,format:'nova-content-plugin-release'})&&['nova-content-plugin-release','nova-content-desktop-release'].includes(release.format),'Invalid packaged release');
 if(release.AUTH_MODE!=='disabled')fail('Trusted entitlement is not configured','AUTH_NOT_CONFIGURED');
 check(release.platform===process.platform&&release.arch===process.arch,'Platform mismatch');
}
function bindingFor(b){check(exact(b,['root','libraryId','rootIdentity'])&&typeof b.root==='string'&&path.isAbsolute(b.root)&&!b.root.includes('\0')&&uuid(b.libraryId)&&exact(b.rootIdentity,['dev','ino'])&&[b.rootIdentity.dev,b.rootIdentity.ino].every(v=>typeof v==='string'&&/^(0|[1-9][0-9]*)$/.test(v)),'Invalid library binding');}
function taskFor(t){check(exact(t,['taskId','attemptId','requestHash','host'])&&uuid(t.taskId)&&uuid(t.attemptId)&&hash(t.requestHash)&&['codex','workbuddy'].includes(t.host),'Invalid task locator');}
export function productionExecutionCapability(task){return task.kind==='research'||task.kind==='analysis'&&typeof task.accountId==='string'&&task.accountId.length>0?'research':'writing';}
export function productionHandoffContext(envelope,launching=false){
 const library=openLibrary(envelope.binding.root,{expectedLibraryId:envelope.binding.libraryId,expectedRootIdentity:envelope.binding.rootIdentity});
 const context=library.readProductionContext(envelope.task.taskId,envelope.task.attemptId);
 const attempt=context.attempt??context.task?.attempts.find(a=>a.id===envelope.task.attemptId);
 check(context.task?.requestHash===envelope.task.requestHash&&attempt?.host===envelope.task.host,'Fixed task changed');
 if(launching)check(context.task.activeAttemptId===attempt.id&&attempt.status==='created','Attempt is already claimed or no longer awaiting launch');
 return {library,context:{...context,attempt,...(context.task.request.parameters?.workflow==='positioning-interview'?{positioningCheckpoint:readVaultTaskContext(envelope.binding.root,null)}:{}),...(envelope.serviceDescriptorPath ? {serviceDescriptorPath:envelope.serviceDescriptorPath} : {})}};
}
export async function prepareProductionHandoff(target,binding,task,release,options={}){
 releaseFor(release);bindingFor(binding);taskFor(task);
 const {context}=productionHandoffContext({binding,task},true),stable=options.currentChat===true||!!context.task.journeyState||!!context.task.journeyMember,id=stable?uuidFor('production-handoff:'+release.pairId+':'+binding.libraryId+':'+task.taskId+':'+task.attemptId):randomUUID();
 const expectedSkill=`nova-content-${productionExecutionCapability(context.task)}-execution`,skill=options.installedSkill||expectedSkill;
 check(skill===expectedSkill,'Installed skill does not match the fixed task capability');
 const business=context.task.request.parameters?.businessSkill;
 const businessSkill=typeof business==='string'&&/^[a-z][a-z0-9-]{0,100}$/.test(business)?business:null;
 const prompt=[`请使用 ${skill} 执行工作台任务。`,`任务编号：${id}`,...(task.host==='codex'?[`$${skill}`]:[]),...(businessSkill?[`本任务业务方法：${businessSkill}。读取固定 context 后按该方法执行，接单和提交继续使用 ${skill}。`]:[]),`先按 Skill 运行 production context --handoff ${id}，完整读取冻结 REQUEST/context、定位与公开边界、正文和相关资料，再接单执行。完整需求以固定请求为准，在当前聊天执行与交付，提交后回读回执。`].join('\n');
 const url=new URL(task.host==='codex'?'codex://new':'workbuddy://task');
 if(task.host==='workbuddy'){url.searchParams.set('action','start');url.searchParams.set('skills',skill);}
 url.searchParams.set(task.host==='codex'?'path':'cwd',vaultRootForRuntime(binding.root)||binding.root);url.searchParams.set('prompt',prompt);
 if(!options.currentChat&&url.href.length>2048)fail('内容库路径过长，无法自动预填助手任务，请选择路径较短的内容库。','HANDOFF_PATH_TOO_LONG');
 if(options.serviceDescriptorPath!==undefined)check(typeof options.serviceDescriptorPath==='string'&&path.isAbsolute(options.serviceDescriptorPath)&&!options.serviceDescriptorPath.includes('\0'),'Invalid service descriptor path');
 const before=directory(target,true),envelope={format:'nova-content-production-handoff',schemaVersion:1,handoffId:id,pairId:release.pairId,AUTH_MODE:release.AUTH_MODE,platform:release.platform,arch:release.arch,binding,task,...(options.serviceDescriptorPath ? {serviceDescriptorPath:options.serviceDescriptorPath} : {}),createdAt:stable?context.attempt.createdAt:new Date().toISOString()};
 const bytes=Buffer.from(JSON.stringify(envelope)+'\n');check(bytes.length<=65536,'Handoff too large');
 let fd;try{fd=fs.openSync(path.join(target,`${id}.production.json`),fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);}catch(error){if(error.code!=='EEXIST'||!stable)throw error;const prior=readProductionHandoff(target,id,release);check(JSON.stringify(prior)===JSON.stringify(envelope),'The fixed handoff locator is bound to a different envelope');}
 if(fd!==undefined)try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 check(same(before,directory(target)),'Handoff directory changed');productionHandoffContext(envelope,true);
 return {id,url:options.currentChat?null:url.href,prompt,requiresPaste:false};
}
export function readProductionHandoff(target,id,release){
 releaseFor(release);check(uuid(id),'Invalid handoff ID');
 const before=directory(target),file=path.join(target,`${id}.production.json`),named=fs.lstatSync(file,{bigint:true});
 check(!named.isSymbolicLink()&&named.isFile()&&named.size<=65536n,'Unsafe handoff file');
 const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW),buffer=Buffer.alloc(65537);let size=0;
 try{
  const opened=fs.fstatSync(fd,{bigint:true});check(same(named,opened),'Handoff changed');
  while(size<buffer.length){const n=fs.readSync(fd,buffer,size,buffer.length-size,null);if(!n)break;size+=n;}
  const after=fs.fstatSync(fd,{bigint:true});check(size<=65536&&same(opened,after)&&opened.size===after.size&&opened.mtimeNs===after.mtimeNs&&opened.ctimeNs===after.ctimeNs,'Handoff changed');
 }finally{fs.closeSync(fd);}
 check(same(before,directory(target))&&same(named,fs.lstatSync(file,{bigint:true})),'Handoff changed');
 const envelope=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(buffer.subarray(0,size)));
 check(exact(envelope,['format','schemaVersion','handoffId','pairId','AUTH_MODE','platform','arch','binding','task','createdAt',...(Object.hasOwn(envelope,'serviceDescriptorPath')?['serviceDescriptorPath']:[])])&&envelope.format==='nova-content-production-handoff'&&envelope.schemaVersion===1&&envelope.handoffId===id&&Number.isFinite(Date.parse(envelope.createdAt)),'Invalid envelope');
 for(const key of ['pairId','AUTH_MODE','platform','arch'])check(envelope[key]===release[key],'Release mismatch');
 if(envelope.serviceDescriptorPath!==undefined)check(typeof envelope.serviceDescriptorPath==='string'&&path.isAbsolute(envelope.serviceDescriptorPath)&&!envelope.serviceDescriptorPath.includes('\0'),'Invalid service descriptor path');
 bindingFor(envelope.binding);taskFor(envelope.task);productionHandoffContext(envelope);return envelope;
}
