import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {openLibrary} from '../lib/file-library/index.mjs';
import {validRelease} from '../content.mjs';
import {productionArchiveCategory} from '../lib/file-library/production-archive-category.mjs';
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
export function productionHandoffContext(envelope,launching=false){
 const library=openLibrary(envelope.binding.root,{expectedLibraryId:envelope.binding.libraryId,expectedRootIdentity:envelope.binding.rootIdentity});
 const context=library.readProductionContext(envelope.task.taskId,envelope.task.attemptId);
 const attempt=context.attempt??context.task?.attempts.find(a=>a.id===envelope.task.attemptId);
 check(context.task?.requestHash===envelope.task.requestHash&&attempt?.host===envelope.task.host,'Fixed task changed');
 if(launching)check(context.task.activeAttemptId===attempt.id&&attempt.status==='created','Attempt is already claimed or no longer awaiting launch');
 return {library,context:{...context,attempt,...(envelope.serviceDescriptorPath ? {serviceDescriptorPath:envelope.serviceDescriptorPath} : {})}};
}
export async function prepareProductionHandoff(target,binding,task,release,options={}){
 releaseFor(release);bindingFor(binding);taskFor(task);
 const {context}=productionHandoffContext({binding,task},true),id=randomUUID();
 const skill=options.installedSkill||(context.task.kind==='research'?'nova-content-research-execution':'nova-content-writing-execution');
 check(typeof skill==='string'&&/^[a-z0-9][a-z0-9:_-]{0,199}$/.test(skill),'Invalid installed skill');
 const comments=context.task.request.parameters?.comments===true;
 const prompt=[`请继续「${context.task.title}」任务。`,`任务编号：${id}`,...(task.host==='codex'?[`$${skill}`]:[]),'在当前助手对话中接单、说明进度并与用户确认；CLI 仅作为本对话内部读取与回写工具，不能把终端输出当作交付对话。',`绑定内容库：${JSON.stringify(binding.root)}；库 ID：${binding.libraryId}。`,`回传产物由工作台归档到本库 知识库/助手产物/${productionArchiveCategory(context.task)}/${task.taskId}/${task.attemptId}/；保持任务、内容与来源关联，不以临时目录或助手全局目录替代归档。`,'先用 production context --handoff 读取冻结请求，再 claim / progress / submit。通过本任务回传全文、结构化资料与已导入资产；归档目录由工作台派生并维护，不直接改写其投影文件。对话结束不代表提交成功，待人工验收的知识不冒充已采纳。',`TikHub 评论采集：${comments?'本次已勾选，仍受设置与预算限制。':'本次未勾选，不得采集评论。'}`,'用户本次需求：',context.task.request.prompt,'原任务保留；当前没有可靠的原聊天定位，此入口打开对应任务工作区的新会话。'].join('\n');
 const url=new URL(task.host==='codex'?'codex://new':'workbuddy://task');
 if(task.host==='workbuddy'){url.searchParams.set('action','start');url.searchParams.set('skills',skill);}
 url.searchParams.set(task.host==='codex'?'path':'cwd',binding.root);url.searchParams.set('prompt',prompt);
 const requiresPaste=url.href.length>2048;if(requiresPaste)url.searchParams.set('prompt',`请用工作台已复制的完整需求替换本段，再手动发送。任务编号：${id}`);check(url.href.length<=2048,'Library path too long');
 if(options.serviceDescriptorPath!==undefined)check(typeof options.serviceDescriptorPath==='string'&&path.isAbsolute(options.serviceDescriptorPath)&&!options.serviceDescriptorPath.includes('\0'),'Invalid service descriptor path');
 const before=directory(target,true),envelope={format:'nova-content-production-handoff',schemaVersion:1,handoffId:id,pairId:release.pairId,AUTH_MODE:release.AUTH_MODE,platform:release.platform,arch:release.arch,binding,task,...(options.serviceDescriptorPath ? {serviceDescriptorPath:options.serviceDescriptorPath} : {}),createdAt:new Date().toISOString()};
 const bytes=Buffer.from(JSON.stringify(envelope)+'\n');check(bytes.length<=65536,'Handoff too large');
 const fd=fs.openSync(path.join(target,`${id}.production.json`),fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);
 try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 check(same(before,directory(target)),'Handoff directory changed');productionHandoffContext(envelope,true);
 return {id,url:url.href,prompt,requiresPaste};
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
