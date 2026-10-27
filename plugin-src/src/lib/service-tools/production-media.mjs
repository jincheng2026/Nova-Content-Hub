import {randomUUID} from 'node:crypto';
import {callServiceTool} from './client.mjs';
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
export async function productionFetchMedia({envelope,context,payload},call=callServiceTool){
 if(!object(payload)||Object.keys(payload).some(k=>!['claimToken','workerId','url'].includes(k))||!uuid(payload.claimToken)||typeof payload.workerId!=='string'||!payload.workerId.trim()||payload.workerId.length>200)fail('INVALID_INPUT','下载仅接受当前worker身份与规范抖音URL。');
 const match=typeof payload.url==='string'&&/^https:\/\/www\.douyin\.com\/video\/(\d{1,32})$/.exec(payload.url);
 if(!match)fail('CANONICAL_DOUYIN_URL_REQUIRED','请提供规范抖音URL：https://www.douyin.com/video/视频编号；短链尚不支持。');
 const task=context.task,attempt=context.attempt,config=task?.request.parameters?.media;
 if(!task||!attempt||task.id!==envelope.task.taskId||attempt.id!==envelope.task.attemptId||task.activeAttemptId!==attempt.id||attempt.status!=='claimed'||attempt.workerId!==payload.workerId||attempt.claimToken!==payload.claimToken)fail('ATTEMPT_INACTIVE','请先领取当前任务并恢复到claimed。');
 if(!task.contentId||!context.creation||context.creation.contentId!==task.contentId||!['tikhub','media'].every(t=>task.request.tools.includes(t))||!object(config)||Object.keys(config).sort().join(',')!=='maxBytes,maxDownloads,version'||config.version!==1||config.maxDownloads!==3||config.maxBytes!==67108864)fail('MEDIA_NOT_AUTHORIZED','此固定任务未授权受控媒体下载；旧任务需在工作台新建。');
 if(typeof envelope.serviceDescriptorPath!=='string'||!envelope.serviceDescriptorPath)fail('SERVICE_UNAVAILABLE','任务受控服务入口不可用。');
 const identity={taskId:task.id,attemptId:attempt.id,claimToken:payload.claimToken,workerId:payload.workerId};
 // Reuse a registered grant without another TikHub request.
 const existing=attempt.mediaGrants?.find(g=>g.canonicalUrl===payload.url&&g.requestHash===task.requestHash);
 if(existing){const result=await call(envelope.serviceDescriptorPath,{...identity,requestId:randomUUID(),tool:'media',operation:'fetch',sourceReceiptId:existing.sourceReceiptId});return{grant:result.data};}
 const source=await call(envelope.serviceDescriptorPath,{...identity,requestId:randomUUID(),tool:'tikhub',operation:'video',id:match[1]}),receipt=source.data?.sourceReceipt;
 if(!uuid(receipt?.id)||receipt.videoId!==match[1]||receipt.canonicalUrl!==payload.url)fail('MEDIA_SOURCE_UNAVAILABLE','抖音详情没有可下载原片，本次费用按真实回执保留；请在工作台补充可用媒体。');
 const result=await call(envelope.serviceDescriptorPath,{...identity,requestId:randomUUID(),tool:'media',operation:'fetch',sourceReceiptId:receipt.id});
 return{grant:result.data};
}
