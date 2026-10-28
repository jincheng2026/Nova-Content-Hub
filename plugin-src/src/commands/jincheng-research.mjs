import {withProductionWriteScope} from '../lib/production-authority.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {validRelease} from '../content.mjs';
import {nativeHandoffDirectory} from '../bridge/native-handoff.mjs';
import {readProductionHandoff,productionHandoffContext} from '../bridge/production-handoff.mjs';
import {callServiceTool} from '../lib/service-tools/client.mjs';
import {vaultRootForRuntime} from '../lib/vault/index.mjs';
import {createResearchRuntime} from '../lib/research-runtime/index.mjs';
import {validateResearchConfig,readResearchSearchEvidence,researchGrantAuthorized,object,fail} from '../lib/research-runtime/common.mjs';
import {executeResearchOperation,RESEARCH_OPERATIONS} from '../lib/research-runtime/operations.mjs';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
async function executeResearchHandoff({envelope,library,operation,payload},call=callServiceTool){
 if(!object(payload)||Object.keys(payload).some(k=>!['claimToken','workerId','input'].includes(k))||!UUID.test(payload.claimToken)||typeof payload.workerId!=='string'||!payload.workerId.trim()||payload.workerId.length>200||payload.input!==undefined&&!object(payload.input))fail('INVALID_INPUT','研究命令只接受当前领取身份与操作输入；库、路径、服务配置均来自固定任务。');
 const identity={taskId:envelope.task.taskId,attemptId:envelope.task.attemptId,claimToken:payload.claimToken,workerId:payload.workerId};
 const context=()=>{const ctx=library.readProductionContext(identity.taskId,identity.attemptId),t=ctx.task,a=ctx.attempt;if(!t||t.requestHash!==envelope.task.requestHash||t.activeAttemptId!==identity.attemptId||a?.claimToken!==identity.claimToken||a.workerId!==identity.workerId||!['claimed','waiting-user','waiting-permission'].includes(a.status)||t.request.parameters?.workflow!=='jincheng-research'||!['research','analysis','transcription'].includes(t.kind))fail('CLAIM_MISMATCH');if(t.journeyMember)library.assertProductionAuthority(identity);return ctx;};
 const initial=context(),config=validateResearchConfig(initial.task.request.parameters.researchRuntime),vaultRoot=vaultRootForRuntime(envelope.binding.root);if(!vaultRoot)fail('VAULT_REQUIRED');
 const executeService=req=>{if(!envelope.serviceDescriptorPath)fail('SERVICE_UNAVAILABLE');return call(envelope.serviceDescriptorPath,{...identity,...req,requestId:req.requestId??randomUUID()});};
 const runtime=createResearchRuntime({vaultRoot,executeService,resolveSampleEvidence:async(sourceRequestId,grant)=>{const ctx=context();if(grant){if(!ctx.attempt.mediaGrants?.some(value=>['assetHash','videoId','sourceReceiptId','sourceRequestId','requestHash','referenceId'].every(key=>value[key]===grant[key]))||!researchGrantAuthorized(ctx.task,ctx.snapshot.costs,identity.attemptId,grant))fail('INVALID_MEDIA_GRANT');library.readAsset(grant.assetHash);}return readResearchSearchEvidence(ctx.task,ctx.snapshot.costs,identity.attemptId,sourceRequestId);},authorize:async({config:actual})=>{const ctx=context();if(!isDeepStrictEqual(validateResearchConfig(ctx.task.request.parameters.researchRuntime),actual))fail('SERVICE_CONFIG_CHANGED');},readMedia:async(grant)=>{const ctx=context();if(!researchGrantAuthorized(ctx.task,ctx.snapshot.costs,identity.attemptId,grant))fail('INVALID_MEDIA_GRANT');if(!ctx.attempt.mediaGrants?.some(g=>g.assetHash===grant.assetHash&&g.videoId===grant.videoId&&g.requestHash===ctx.task.requestHash))fail('INVALID_MEDIA_GRANT');const asset=library.readAsset(grant.assetHash),extensions={'video/mp4':'.mp4','video/webm':'.webm','audio/mp4':'.m4a','audio/mpeg':'.mp3','audio/wav':'.wav','audio/x-wav':'.wav','audio/ogg':'.ogg','audio/flac':'.flac'};if(!extensions[asset.detectedType]||asset.bytes>67108864)fail('INVALID_MEDIA_GRANT');return{data:asset.data,extension:extensions[asset.detectedType]};},fetchMedia:async({videoId,url})=>{
  const ctx=context(),existing=ctx.attempt.mediaGrants?.find(g=>g.videoId===videoId&&g.canonicalUrl===url&&g.requestHash===ctx.task.requestHash);
  if(existing)return executeService({tool:'media',operation:'fetch',sourceReceiptId:existing.sourceReceiptId});
  const source=await executeService({tool:'tikhub',operation:'video',id:videoId}),receipt=source.data?.sourceReceipt;if(!UUID.test(receipt?.id)||receipt.videoId!==videoId||receipt.canonicalUrl!==url)fail('MEDIA_SOURCE_UNAVAILABLE');
  return executeService({tool:'media',operation:'fetch',sourceReceiptId:receipt.id});
 }});
 return executeResearchOperation(runtime,config,operation,payload.input??{});
}
export function runResearchHandoff(args,call=callServiceTool){const identity={taskId:args.envelope.task.taskId,attemptId:args.envelope.task.attemptId,claimToken:args.payload?.claimToken,workerId:args.payload?.workerId};return withProductionWriteScope(args.library,identity,()=>executeResearchHandoff(args,call));}
export async function main(argv){try{
 const [operation='help',...rest]=argv,values={};
 if(operation==='help'){if(rest.length)fail('INVALID_ARGUMENTS');process.stdout.write(JSON.stringify({ok:true,operations:RESEARCH_OPERATIONS,usage:'jincheng-research OP --handoff UUID (--file ABSOLUTE_JSON | --stdin)',input:{claimToken:'current UUID',workerId:'current worker',input:'operation payload; no paths or provider settings'}})+'\n');return 0;}
 if(!RESEARCH_OPERATIONS.includes(operation))fail('INVALID_ARGUMENTS');
 for(let i=0;i<rest.length;i++){const flag=rest[i];if(!['--handoff','--file','--stdin'].includes(flag)||Object.hasOwn(values,flag))fail('INVALID_ARGUMENTS');values[flag]=flag==='--stdin'?true:rest[++i];if(!values[flag])fail('INVALID_ARGUMENTS');}
 if(!UUID.test(values['--handoff'])||!!values['--file']===!!values['--stdin'])fail('INVALID_ARGUMENTS');
 const release=JSON.parse(fs.readFileSync(new URL('../release.json',import.meta.url),'utf8'));if(!validRelease(release)||release.AUTH_MODE!=='disabled'||release.platform!==process.platform||release.arch!==process.arch)fail('PACKAGE_INVALID');
 let bytes;if(values['--file']){if(!path.isAbsolute(values['--file']))fail('INVALID_INPUT');const fd=fs.openSync(values['--file'],fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW??0)|fs.constants.O_NONBLOCK);try{const st=fs.fstatSync(fd);if(!st.isFile()||st.size>8*1024*1024)fail('INPUT_TOO_LARGE');const buffer=Buffer.alloc(8*1024*1024+1);let n=0;while(n<buffer.length){const read=fs.readSync(fd,buffer,n,buffer.length-n,null);if(!read)break;n+=read;}bytes=buffer.subarray(0,n);}finally{fs.closeSync(fd);}}
 else {bytes=await new Promise((resolve,reject)=>{const chunks=[];let count=0;const cleanup=()=>{clearTimeout(timer);process.stdin.off('data',data).off('end',end).off('error',error).pause();};const error=e=>{cleanup();reject(e);},data=b=>{count+=b.length;if(count>8*1024*1024){error(Object.assign(new Error('输入超过8MiB。'),{code:'INPUT_TOO_LARGE'}));return;}chunks.push(b);},end=()=>{cleanup();resolve(Buffer.concat(chunks));},timer=setTimeout(()=>error(Object.assign(new Error('JSON输入超时。'),{code:'INPUT_TIMEOUT'})),10000);process.stdin.on('data',data).once('end',end).once('error',error).resume();});}
 if(bytes.length>8*1024*1024)fail('INPUT_TOO_LARGE');let payload;try{payload=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(bytes));}catch{fail('INVALID_INPUT','需要有效UTF-8 JSON输入。');}
 const envelope=readProductionHandoff(nativeHandoffDirectory(),values['--handoff'],release),{library}=productionHandoffContext(envelope);
 const result=await runResearchHandoff({envelope,library,operation,payload});process.stdout.write(JSON.stringify({ok:true,result})+'\n');return 0;
 }catch(error){process.stdout.write(JSON.stringify({ok:false,code:/^[A-Z_]{1,80}$/.test(error?.code)?error.code:'RESEARCH_FAILED',message:error.message})+'\n');return 1;}}
