// The CLI chooses a registered reference; paths, engines, credentials and cloud permission stay with the broker.
import {randomUUID} from 'node:crypto';
import {callServiceTool} from './client.mjs';
import {productionReferenceHash,serializeProductionReference,validateTranscriptReference} from '../file-library/production-reference.mjs';
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const hash=value=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
export async function productionAsr({envelope,context,payload},call=callServiceTool){
 if(!object(payload)||Object.keys(payload).some(key=>!['claimToken','workerId','referenceId'].includes(key))||!uuid(payload.claimToken)||typeof payload.workerId!=='string'||!payload.workerId.trim()||payload.workerId.length>200||payload.referenceId!==undefined&&!uuid(payload.referenceId))fail('INVALID_INPUT','ASR只接受本次workerId、claimToken及可选referenceId，不接受路径、引擎或云授权。');
 const task=context.task,attempt=context.attempt;
 if(!task||!attempt||task.id!==envelope.task.taskId||attempt.id!==envelope.task.attemptId||task.activeAttemptId!==attempt.id||attempt.status!=='claimed'||attempt.workerId!==payload.workerId||attempt.claimToken!==payload.claimToken)fail('ATTEMPT_INACTIVE','请先以当前worker领取并恢复到claimed，再调用受控转写。');
 if(!task.contentId||!context.creation||context.creation.contentId!==task.contentId||!task.request.tools.includes('asr'))fail('ASR_NOT_AUTHORIZED','本次固定任务未授权内容参考转写。');
 const parameters=object(task.request.parameters)?task.request.parameters:{},binding=parameters.transcript;
 let referenceId;
 if(binding!==undefined){
  if(!object(binding)||Object.keys(binding).sort().join(',')!=='baselineHash,intent,referenceId,version'||binding.version!==1||!uuid(binding.referenceId)||!hash(binding.baselineHash)||!['extract','correct','reextract'].includes(binding.intent)||task.kind!=='transcription'||task.accountId||parameters.workflow)fail('INVALID_INPUT','固定转写意图或参考版本无效。');
  if(binding.intent==='correct')fail('ASR_INTENT_FORBIDDEN','纠错任务不能用此命令重新提取；请保留已有原稿并提交校对结果。');
  if(payload.referenceId!==undefined&&payload.referenceId!==binding.referenceId)fail('INVALID_INPUT','referenceId与冻结参考不一致。');
  referenceId=binding.referenceId;
 }else{
  if(parameters.workflow!=='content-creation'||task.kind!=='writing'||task.accountId)fail('ASR_NOT_AUTHORIZED','此命令仅用于固定提取任务或整篇创作的已登记参考。');
  if(!payload.referenceId)fail('INVALID_INPUT','整篇创作须显式提供一个已登记referenceId，不自动猜选媒体。');
  referenceId=payload.referenceId;
 }
 const registered=context.creation.references.find(value=>value.id===referenceId),grant=!binding&&attempt.mediaGrants?.find(value=>value.referenceId===referenceId&&value.requestHash===task.requestHash);
 const reference=registered??(grant?{id:grant.referenceId,url:grant.canonicalUrl,title:`抖音 ${grant.videoId}`,platform:'抖音',originalText:'',correctedText:'',segments:[],corrections:[],analysis:'',mediaAssetHash:grant.assetHash,subtitleAssetHash:null}:null);
 if(!reference)fail('REFERENCE_NOT_FOUND','固定参考不存在，请回读context并核对referenceId。');
 serializeProductionReference(reference);
 if(binding){if(await productionReferenceHash(reference)!==binding.baselineHash)fail('STALE_INPUT','参考版本已变化，请基于当前参考重新创建提取任务。');validateTranscriptReference(reference,binding.intent);}
 if(!hash(reference.mediaAssetHash))fail('ASR_MEDIA_REQUIRED','本参考没有已登记的音视频资产；字幕可直接阅读，不能把文件路径当作资产编号。');
 const asr=parameters.serviceConfig?.asr;
 if(!object(asr)||!['local-only','local-first'].includes(asr.mode)||!['faster-whisper','whisper-cpp','qwen3-asr'].includes(asr.localEngine))fail('ASR_LOCAL_ONLY','本命令仅执行冻结的本地ASR；不启用云端或更换引擎。');
 if(typeof envelope.serviceDescriptorPath!=='string'||!envelope.serviceDescriptorPath)fail('SERVICE_UNAVAILABLE','固定任务的受控服务入口不可用，请在工作台恢复。');
 let serviceResult;
 try{serviceResult=await call(envelope.serviceDescriptorPath,{taskId:task.id,attemptId:attempt.id,claimToken:payload.claimToken,workerId:payload.workerId,requestId:randomUUID(),tool:'asr',audioPath:reference.mediaAssetHash,allowCloud:false});}
 catch(error){const code=typeof error?.code==='string'&&/^[A-Z_]{1,80}$/.test(error.code)?error.code:'SERVICE_FAILED';fail(code,`受控转写失败（${code}）；请记录真实错误，不重试或改用其他引擎。`);}
 return{referenceId,reference,mediaAssetHash:reference.mediaAssetHash,requestedEngine:asr.localEngine,serviceResult};
}
