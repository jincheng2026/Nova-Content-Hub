import fs from 'node:fs';
import path from 'node:path';
import {rootPath,safe,readBytes,identity,scan,contentSources,digest} from '../vault/core.mjs';
const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
const same=(a,b)=>a?.dev===b?.dev&&a?.ino===b?.ino;
/** Explicit locator only. No recovering handle, projection, lock, claim, service,
 * credentials or pending transaction repair is reachable from this reader. */
export function lookupContentJourney(input){
 if(!input||Object.keys(input).length!==2||typeof input.library!=='string'||!path.isAbsolute(input.library)||!/^(?:T\d{3,})$/.test(input.work??''))fail('INVALID_INPUT','请明确提供内容库绝对路径和稳定 T 编号。');
 const root=rootPath(input.library),before=identity(root),touched=new Map();
 const directories=new Map();
 const finish=value=>{if(!same(identity(root),before))fail('CONFLICT','只读定位期间根身份变化。');for(const [file,hash] of touched)if(digest(readBytes(root,path.relative(root,file).split(path.sep).join('/')))!==hash)fail('CONFLICT','只读定位期间记录变化。');for(const [relative,names]of directories)if(JSON.stringify(fs.readdirSync(safe(root,relative)).sort())!==names)fail('CONFLICT','只读定位期间事务目录变化。');return value;};
 const read=relative=>{const file=safe(root,relative),bytes=readBytes(root,relative);touched.set(file,digest(bytes));return JSON.parse(bytes);};
 const descriptor=read('.workbench/vault.json');if(descriptor.format!=='nova-knowledge-vault'||descriptor.schemaVersion!==1||!same(descriptor.rootIdentity,before))fail('CONFLICT','内容库根身份已变化，请在工作台重新核对绑定。');
 const runtime='.workbench/runtime',binding=read(runtime+'/vault-binding.json'),library=read(runtime+'/内容库.json');
 if(binding.format!=='nova-vault-runtime'||binding.vaultRoot!==root||binding.vaultId!==descriptor.vaultId||!same(binding.rootIdentity,before)||library.format!=='nova-content-library'||typeof library.libraryId!=='string')fail('CONFLICT','库与原位内容绑定不匹配。');
 const base={library:root,libraryId:library.libraryId,vaultId:descriptor.vaultId,work:{vaultId:descriptor.vaultId,workId:input.work},journeys:[],instruction:'只读定位不授予执行权；请在工作台对准确内容明确选择在新聊天接续。'};
 const entries=relative=>{try{const names=fs.readdirSync(safe(root,relative)).sort();directories.set(relative,JSON.stringify(names));return names;}catch(error){if(error.code==='ENOENT')return [];throw error;}};
 let pending=entries(runtime+'/系统（别动）/事务/待恢复').length>0||entries('.workbench/pending-mutations').length>0;
 if(!pending){const names=entries('.workbench/mutations');if(names.length>20000)fail('LIMIT_REACHED','事务记录过多，请在工作台核对。');pending=names.some(name=>/^[A-Za-z0-9_-]{8,100}\.json$/.test(name)&&read('.workbench/mutations/'+name).status==='pending');}
 if(pending)return finish({...base,status:'recovery-required',issues:['PENDING_RECOVERY']});
 const state={root,vaultId:descriptor.vaultId,...scan(root,descriptor.vaultId)},works=contentSources(state).filter(work=>work.tNumber===input.work);
 if(works.length!==1)return finish({...base,status:works.length?'ambiguous':'not-found',issues:[works.length?'MULTIPLE_WORK_SOURCES':'WORK_NOT_FOUND']});
 const work=works[0],workspace=read(runtime+'/库配置/default/配置.json'),tasks=workspace.production?.tasks??[],roots=tasks.filter(task=>task.journeyState&&task.request.parameters?.work?.vaultId===descriptor.vaultId&&task.request.parameters.work.workId===input.work);
 const journeys=roots.map(task=>{const current=task.attempts.find(a=>a.id===task.activeAttemptId),child=tasks.find(c=>c.id===task.journeyState.activeTaskId);return {journeyId:task.id,attemptId:current.id,host:current.host,status:task.journeyState.status,revision:task.journeyState.revision,ownerEpoch:task.journeyState.ownerEpoch,stepId:task.journeyState.activeStepId,childTaskId:child?.id??null,childAttemptId:child?.activeAttemptId??null,step:child?.request.parameters?.stage??child?.request.parameters?.workflow??null,waiting:current.status,checkpoints:task.journeyState.checkpoints.map(pin=>({kind:pin.kind,artifactId:pin.artifactId,hash:pin.hash,decisionId:pin.decisionId}))};});
 if(!same(identity(root),before))fail('CONFLICT','读取期间内容库根身份变化。');for(const [file,hash] of touched)if(digest(readBytes(root,path.relative(root,file).split(path.sep).join('/')))!==hash)fail('CONFLICT','只读定位期间库记录变化，请重读。');
 if(digest(readBytes(root,work.document.relativePath))!==work.document.hash)fail('CONFLICT','定位原稿在读取期间变化。');
 const ambiguous=work.sourceResolution!=='resolved'||roots.filter(task=>task.journeyState.status==='active').length>1;
 return finish({...base,status:ambiguous?'ambiguous':'found',contentId:work.contentId,title:work.title,sourceResolution:work.sourceResolution,source:{documentId:work.document.id,relativePath:work.document.relativePath,hash:work.document.hash},journeys,issues:ambiguous?['SOURCE_OR_JOURNEY_AMBIGUOUS']:[]});
}
