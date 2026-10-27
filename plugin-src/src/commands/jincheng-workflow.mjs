import fs from 'node:fs';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {validRelease} from '../content.mjs';
import {nativeHandoffDirectory} from '../bridge/native-handoff.mjs';
import {readProductionHandoff,productionHandoffContext} from '../bridge/production-handoff.mjs';
import {vaultRootForRuntime,readVaultTaskContext} from '../lib/vault/index.mjs';
import {readWorkFlow,appendStageArtifact} from '../lib/vault/workflow.mjs';
import {mkdir,atomic} from '../lib/vault/core.mjs';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export const fail=(code,message=code)=>{throw Object.assign(new Error(message),{code});};
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export function fixedStageContext({envelope,library,payload}){
 if(!object(payload)||Object.keys(payload).some(k=>!['claimToken','workerId','input'].includes(k))||!UUID.test(payload.claimToken)||typeof payload.workerId!=='string'||!payload.workerId.trim()||payload.workerId.length>200||payload.input!==undefined&&!object(payload.input))fail('INVALID_INPUT');
 const ctx=library.readProductionContext(envelope.task.taskId,envelope.task.attemptId),task=ctx.task,attempt=ctx.attempt;
 if(!task||task.requestHash!==envelope.task.requestHash||task.activeAttemptId!==envelope.task.attemptId||attempt?.claimToken!==payload.claimToken||attempt.workerId!==payload.workerId||!['claimed','waiting-user','waiting-permission'].includes(attempt.status)||task.request.parameters?.workflow!=='jincheng-stage'||!task.contentId)fail('CLAIM_MISMATCH');
 const vault=readVaultTaskContext(envelope.binding.root,task.contentId),root=vaultRootForRuntime(envelope.binding.root);
 if(!root||!vault?.content||vault.content.sourceResolution!=='resolved')fail('SOURCE_CONFLICT');
 const work={vaultId:vault.vaultId,workId:vault.content.tNumber},flow=readWorkFlow(root,work);
 const frozen=task.request.parameters.source;
 if(frozen&&frozen.documentId!==vault.content.sourceDocumentId&&!flow.artifacts.some(a=>a.taskId===task.id&&a.kind==='complete-draft'&&a.path===vault.content.relativePath&&a.path===vault.contentDirectory+'/创作页.html'))fail('SOURCE_CHANGED','当前入口已切换，须重新冻结任务。');
 return {ctx,task,attempt,vault,root,work,flow,input:payload.input??{}};
}
export function assertStageGate(context,operation){
 const {task,flow}=context,stage=task.request.parameters.stage;
 if(stage==='closeout'&&operation!=='read'&&!flow.facts.published)fail('PUBLICATION_REQUIRED','发布后收口需要先核实真实发布记录。');
 // jc-content-writer starts from its materials/interview workflow. Only the explicitly
 // selected jc-jiaocheng-video method/branch imposes both tutorial checkpoints.
 const tutorial=stage==='tutorial'||task.request.parameters.businessSkill==='jc-jiaocheng-video';
 const hasArtifact=kind=>flow.artifacts.some(artifact=>artifact.kind===kind);
 if(operation==='complete-draft'){
  if((tutorial||hasArtifact('narrative'))&&!flow.facts.narrativeConfirmed)fail('CHECKPOINT_REQUIRED','请先在工作台确认当前版本的叙事。');
  if((tutorial||hasArtifact('key-segments'))&&!flow.facts.keySegmentsConfirmed)fail('CHECKPOINT_REQUIRED','请先在工作台确认当前版本的重点段。');
  if(hasArtifact('author-analysis')&&!flow.facts.authorAnalysisConfirmed)fail('AUTHOR_ANALYSIS_REQUIRED','作者先拆的当前版本仍待作者确认。');
 }
 if(operation==='key-segments'&&(tutorial||hasArtifact('narrative'))&&!flow.facts.narrativeConfirmed)fail('CHECKPOINT_REQUIRED','请先确认当前版本的叙事。');
 if(stage==='analysis-author'&&operation!=='read'&&!flow.facts.authorAnalysisConfirmed)fail('AUTHOR_ANALYSIS_REQUIRED','作者先拆路线需先在工作台写下自己的拆解；AI完整结论在此之前保持隐藏。');
}
export function runWorkflowHandoff(args){
 const context=fixedStageContext(args),{root,work,task,input}=context;
 if(args.operation==='read')return context.flow;
 if(args.operation!=='artifact'||Object.keys(input).some(k=>!['kind','text','title'].includes(k))||typeof input.text!=='string'||!input.text.trim()||input.text.length>500000)fail('INVALID_INPUT');
 const allowed={ 'analysis-author':['analysis-comparison'],'analysis-ai':['analysis-comparison'],narrative:['narrative'],'key-segment':['key-segments'],writing:['complete-draft'],tutorial:['narrative','key-segments','complete-draft'],revision:['complete-draft'],'cover-copy':['packaging'],review:['review'],closeout:['archive'],patterns:['review'],intake:['analysis-comparison']};
 if(!allowed[task.request.parameters.stage]?.includes(input.kind))fail('STAGE_FORBIDDEN');assertStageGate(context,input.kind);
 const id=randomUUID(),relative=context.vault.contentDirectory+'/阶段产物-'+input.kind+'-'+id+'.md',bytes=Buffer.from(input.text+'\n');mkdir(root,context.vault.contentDirectory);atomic(root,relative,bytes,null);
 return appendStageArtifact(root,{work,kind:input.kind,artifactId:id,hash:createHash('sha256').update(bytes).digest('hex'),path:relative,methodId:task.request.parameters.businessSkill,taskId:task.id});
}
export const main=argv=>runFixedCLI(argv,['read','artifact'],runWorkflowHandoff);
export async function runFixedCLI(argv,operations,execute){try{
 const [operation='help',...rest]=argv,values={};
 if(operation==='help'){if(rest.length)fail('INVALID_ARGUMENTS');process.stdout.write(JSON.stringify({ok:true,operations:operations,usage:'jincheng-workflow / jincheng-creation OP --handoff UUID (--file ABSOLUTE_JSON | --stdin)',input:{claimToken:'current UUID',workerId:'current worker',input:'operation payload; no paths or provider settings'}})+'\n');return 0;}
 if(!operations.includes(operation))fail('INVALID_ARGUMENTS');
 for(let i=0;i<rest.length;i++){const flag=rest[i];if(!['--handoff','--file','--stdin'].includes(flag)||Object.hasOwn(values,flag))fail('INVALID_ARGUMENTS');values[flag]=flag==='--stdin'?true:rest[++i];if(!values[flag])fail('INVALID_ARGUMENTS');}
 if(!UUID.test(values['--handoff'])||!!values['--file']===!!values['--stdin'])fail('INVALID_ARGUMENTS');
 const release=JSON.parse(fs.readFileSync(new URL('../release.json',import.meta.url),'utf8'));if(!validRelease(release)||release.AUTH_MODE!=='disabled'||release.platform!==process.platform||release.arch!==process.arch)fail('PACKAGE_INVALID');
 let bytes;if(values['--file']){if(!path.isAbsolute(values['--file']))fail('INVALID_INPUT');const fd=fs.openSync(values['--file'],fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW??0)|fs.constants.O_NONBLOCK);try{const st=fs.fstatSync(fd);if(!st.isFile()||st.size>8*1024*1024)fail('INPUT_TOO_LARGE');const buffer=Buffer.alloc(8*1024*1024+1);let n=0;while(n<buffer.length){const read=fs.readSync(fd,buffer,n,buffer.length-n,null);if(!read)break;n+=read;}bytes=buffer.subarray(0,n);}finally{fs.closeSync(fd);}}
 else {bytes=await new Promise((resolve,reject)=>{const chunks=[];let count=0;const cleanup=()=>{clearTimeout(timer);process.stdin.off('data',data).off('end',end).off('error',error).pause();};const error=e=>{cleanup();reject(e);},data=b=>{count+=b.length;if(count>8*1024*1024){error(Object.assign(new Error('输入超过8MiB。'),{code:'INPUT_TOO_LARGE'}));return;}chunks.push(b);},end=()=>{cleanup();resolve(Buffer.concat(chunks));},timer=setTimeout(()=>error(Object.assign(new Error('JSON输入超时。'),{code:'INPUT_TIMEOUT'})),10000);process.stdin.on('data',data).once('end',end).once('error',error).resume();});}
 if(bytes.length>8*1024*1024)fail('INPUT_TOO_LARGE');let payload;try{payload=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(bytes));}catch{fail('INVALID_INPUT','需要有效UTF-8 JSON输入。');}
 const envelope=readProductionHandoff(nativeHandoffDirectory(),values['--handoff'],release),{library}=productionHandoffContext(envelope);
 const result=await execute({envelope,library,operation,payload});process.stdout.write(JSON.stringify({ok:true,result})+'\n');return 0;
 }catch(error){process.stdout.write(JSON.stringify({ok:false,code:/^[A-Z_]{1,80}$/.test(error?.code)?error.code:'STAGE_FAILED',message:error.message})+'\n');return 1;}}
