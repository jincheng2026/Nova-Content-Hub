import fs from 'node:fs';
import path from 'node:path';
import {validRelease} from '../content.mjs';
import {nativeHandoffDirectory} from '../bridge/native-handoff.mjs';
import {collectRadar} from '../lib/file-library/radar-collector.mjs';
import {productionAsr} from '../lib/service-tools/production-asr.mjs';
import {readProductionHandoff,productionHandoffContext} from '../bridge/production-handoff.mjs';
const MAX=2*1024*1024;
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
function release(){let r;try{r=JSON.parse(fs.readFileSync(new URL('../release.json',import.meta.url),'utf8'));}catch{fail('PACKAGE_NOT_BUILT','请使用已构建配套插件。');}if(!validRelease(r)||r.format!=='nova-content-plugin-release'||r.schemaVersion!==1||r.experimental!==true||r.productionReady!==false)fail('PACKAGE_INVALID','Invalid packaged release');if(r.platform!==process.platform||r.arch!==process.arch)fail('PLATFORM_MISMATCH','Package platform mismatch');return r;}
async function input(values){
 if(!!values.file===!!values.stdin)fail('INVALID_ARGUMENTS','只接受 --file 或 --stdin 中的一项。');
 let bytes;
 if(values.file){
  if(!path.isAbsolute(values.file))fail('INVALID_INPUT','JSON file must be absolute');
  const fd=fs.openSync(values.file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
  try{const st=fs.fstatSync(fd);if(!st.isFile()||st.size>MAX)fail('INPUT_TOO_LARGE','Invalid input file');const buffer=Buffer.alloc(MAX+1);let offset=0;while(offset<buffer.length){const n=fs.readSync(fd,buffer,offset,buffer.length-offset,null);if(!n)break;offset+=n;}bytes=buffer.subarray(0,offset);}finally{fs.closeSync(fd);}
 }else bytes=await new Promise((resolve,reject)=>{
  const chunks=[];let size=0;const done=(e,v)=>{clearTimeout(timer);process.stdin.off('data',data).off('end',end).off('error',error).pause();e?reject(e):resolve(v);};
  const data=chunk=>{size+=chunk.length;if(size>MAX)done(Object.assign(new Error('Input too large'),{code:'INPUT_TOO_LARGE'}));else chunks.push(chunk);};const end=()=>done(null,Buffer.concat(chunks));const error=e=>done(e);const timer=setTimeout(()=>done(Object.assign(new Error('Input timeout'),{code:'INPUT_TIMEOUT'})),5000);process.stdin.on('data',data).once('end',end).once('error',error).resume();
 });
 if(bytes.length>MAX)fail('INPUT_TOO_LARGE','Input too large');const data=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(bytes));if(!data||typeof data!=='object'||Array.isArray(data))fail('INVALID_INPUT','JSON object required');return data;
}
export async function main(argv){
 try{
  const [command='help',...rest]=argv,values={};if(!['help','context','status','claim','progress','submit','fail','import','collect-radar','asr'].includes(command))fail('INVALID_ARGUMENTS','Unknown production command');
  for(let i=0;i<rest.length;i++){const key=rest[i].slice(2);if(!rest[i].startsWith('--')||!['handoff','file','stdin'].includes(key)||Object.hasOwn(values,key))fail('INVALID_ARGUMENTS','Unknown or duplicate flag');if(key==='stdin')values[key]=true;else{values[key]=rest[++i];if(!values[key]||values[key].startsWith('--'))fail('INVALID_ARGUMENTS','Missing flag value');}}
  const r=release();if(command==='help'){if(rest.length)fail('INVALID_ARGUMENTS','Help has no flags');process.stdout.write(JSON.stringify({ok:true,commands:['context','status','claim','progress','submit','fail','import','collect-radar','asr'],usage:'production COMMAND --handoff UUID [--file ABSOLUTE_JSON | --stdin]'})+'\n');return 0;}
  if(r.AUTH_MODE!=='disabled')fail('AUTH_NOT_CONFIGURED','可信权益未接入，停止业务读写。');
  if(!values.handoff)fail('INVALID_ARGUMENTS','An explicit handoff is required');
  const envelope=readProductionHandoff(nativeHandoffDirectory(),values.handoff,r),{library,context}=productionHandoffContext(envelope),locator={taskId:envelope.task.taskId,attemptId:envelope.task.attemptId};
  let result;
  if(['context','status'].includes(command)){if(values.file||values.stdin)fail('INVALID_ARGUMENTS','Read has no input');result=context;}
  else{
   const raw=await input(values),{mutationId,...payload}=raw;
   if(command==='collect-radar'){
    if(Object.keys(raw).some(k=>!['claimToken','workerId'].includes(k))||!envelope.serviceDescriptorPath)fail('INVALID_INPUT','Radar collection requires only the claimed worker identity and a configured broker');
    if(context.task.activeAttemptId!==locator.attemptId||context.attempt.status!=='claimed'||context.attempt.claimToken!==payload.claimToken||!payload.workerId||context.attempt.workerId!==payload.workerId)fail('ATTEMPT_INACTIVE','Claim the active task before radar collection');
    const parameters=context.task.request.parameters;
    if(parameters?.workflow!=='viral-radar'||parameters.budgetEnabled!==true||!context.task.request.tools.includes('tikhub'))fail('BUDGET_DISABLED','This radar task permits manual evidence only');
    result={radar:await collectRadar({query:parameters.query,allowedOperations:parameters.operations,identity:{...locator,claimToken:payload.claimToken,workerId:payload.workerId},descriptorPath:envelope.serviceDescriptorPath,maxRequests:Math.min(4,context.task.request.budget.amount)})};
   }else if(command==='asr'){
    result=await productionAsr({envelope,context,payload:raw});
   }else if(command==='import'){
    if(Object.keys(payload).some(k=>!['path','purpose','claimToken','workerId'].includes(k))||!['production-report','production-reference'].includes(payload.purpose)||typeof payload.path!=='string'||!path.isAbsolute(payload.path))fail('INVALID_INPUT','Invalid task import');
    if(context.task.activeAttemptId!==locator.attemptId||context.attempt.status!=='claimed'||context.attempt.claimToken!==payload.claimToken||!payload.workerId||context.attempt.workerId!==payload.workerId)fail('ATTEMPT_INACTIVE','Claim the active task before importing');
    result=library.importAsset(payload.path,{purpose:payload.purpose});
   }else{
    if(Object.keys(payload).some(k=>['taskId','attemptId','expectedToken'].includes(k)))fail('INVALID_INPUT','Cannot override task binding');
    const op={claim:'claimTask',progress:'progressTask',submit:'submitTask',fail:'failTask'}[command];
    result=library.mutateProduction(op,{...locator,...payload},{mutationId});
    result={...library.readProductionContext(locator.taskId,locator.attemptId),mutationId:result.mutationId,...(result.archiveWarnings?.length?{archiveWarnings:result.archiveWarnings}:{})};
   }
  }
  process.stdout.write(JSON.stringify({ok:true,result:command!=='asr'&&envelope.serviceDescriptorPath?{...result,serviceDescriptorPath:envelope.serviceDescriptorPath}:result})+'\n');return 0;
 }catch(error){process.stdout.write(JSON.stringify({ok:false,code:error.code||'PRODUCTION_FAILED',message:error.message})+'\n');return 1;}
}
