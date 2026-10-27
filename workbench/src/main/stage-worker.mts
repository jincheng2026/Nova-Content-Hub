import {randomUUID,createHash} from 'node:crypto';
import {verifiedBoundReader} from './bound-reader.mts';
import {vaultRootForRuntime,readVaultTaskContext} from '../../../plugin-src/src/lib/vault/index.mjs';
import {readWorkFlow,confirmCheckpoint,appendStageArtifact} from '../../../plugin-src/src/lib/vault/workflow.mjs';
import {atomic,mkdir} from '../../../plugin-src/src/lib/vault/core.mjs';
import {stageDesktopInput} from '../shared/stage-validation.ts';
import {exact,libraryBinding,requireWrite,fail} from '../shared/validation.ts';
import type {StageWorkerOperations,StageInputs} from '../shared/stage-contracts.ts';
import type {LibraryBinding} from '../shared/contracts.ts';
export const isStageOperation=(op:unknown):op is keyof StageWorkerOperations=>op==='stageConfirm'||op==='stageAuthorAnalysis';
export function executeStage(op:keyof StageWorkerOperations,args:unknown,mode:'required'|'disabled') {
 requireWrite(mode);if(!exact(args,['binding','input'])||!libraryBinding(args.binding)||stageDesktopInput(op==='stageConfirm'?'confirmJinchengCheckpoint':'saveJinchengAuthorAnalysis',args.input)!==true)fail('INVALID_INPUT','阶段请求无效。');
 const binding=args.binding as LibraryBinding;verifiedBoundReader(binding);
 const input=args.input as StageInputs['confirmJinchengCheckpoint']&StageInputs['saveJinchengAuthorAnalysis'],context=readVaultTaskContext(binding.root,input.contentId),root=vaultRootForRuntime(binding.root);
 if(!root||!context?.content)fail('NOT_FOUND','当前T内容来源不可读取。');
 const work={vaultId:context.vaultId,workId:context.content.tNumber};
 if(op==='stageConfirm')confirmCheckpoint(root,{...input,work,evidence:{actor:'author',text:input.decisionText,at:new Date().toISOString()}});
 else {if(readWorkFlow(root,work).revision!==input.expectedRevision)fail('CONFLICT','创作过程已变化，请重新读取。');const id=randomUUID(),relative=context.contentDirectory+'/作者先拆-'+id+'.md',bytes=Buffer.from(input.text+'\n');mkdir(root,context.contentDirectory!);atomic(root,relative,bytes,null);const hash=createHash('sha256').update(bytes).digest('hex'),result=appendStageArtifact(root,{work,kind:'author-analysis',artifactId:id,hash,path:relative,methodId:'author-analysis',taskId:'author'});confirmCheckpoint(root,{work,kind:'author-analysis',artifactId:id,artifactHash:hash,expectedRevision:result.revision,decision:'confirm',evidence:{actor:'author',text:input.text,at:new Date().toISOString()}});}
 return {...readVaultTaskContext(binding.root,input.contentId)!,workflow:readWorkFlow(root,work)};
}
