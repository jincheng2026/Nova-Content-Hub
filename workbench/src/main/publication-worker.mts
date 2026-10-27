import type {ProductionLibrary} from '../../../plugin-src/src/lib/file-library/production.d.ts';
import {verifiedBoundReader} from './bound-reader.mts';
import {withVaultReadLock} from '../../../plugin-src/src/lib/vault/core.mjs';
import {openLibrary} from '../../../plugin-src/src/lib/file-library/index.mjs';
import {readVaultTaskContext,vaultRootForRuntime} from '../../../plugin-src/src/lib/vault/index.mjs';
import {readPublicationFacts,recordPublication,importSnapshot,confirmReview,decideKnowledge,readObservationDue,enableObservation,reserveObservation,finishObservation,reconcileObservation,associateExternalArchive} from '../../../plugin-src/src/lib/publication-runtime/index.mjs';
import {exact,fail,libraryBinding,requireWrite} from '../shared/validation.ts';
import {publicationRuntimeInput} from '../shared/publication-runtime-validation.ts';
import type {LibraryBinding} from '../shared/contracts.ts';
import type {PublicationMutation,PublicationRuntimeWorkerOperations} from '../shared/publication-runtime-contracts.ts';
export const isPublicationOperation=(op:unknown):op is keyof PublicationRuntimeWorkerOperations=>['publicationRead','publicationMutate','publicationDue','publicationReserveObservation','publicationFinishObservation'].includes(op as string);
export function executePublication(op:keyof PublicationRuntimeWorkerOperations,args:unknown,mode:'required'|'disabled') {
 if(!exact(args,op==='publicationDue'?['binding']:['binding','input'])||!libraryBinding(args.binding))fail('INVALID_INPUT','发布请求无效');const binding=args.binding as LibraryBinding;if(op==='publicationRead'||op==='publicationDue')verifiedBoundReader(binding);else openLibrary(binding.root,{expectedLibraryId:binding.libraryId,expectedRootIdentity:binding.rootIdentity});
 if(op==='publicationReserveObservation'||op==='publicationFinishObservation'){requireWrite(mode);const input=args.input as PublicationRuntimeWorkerOperations['publicationFinishObservation']['args']['input']&PublicationRuntimeWorkerOperations['publicationReserveObservation']['args']['input'];if(op==='publicationReserveObservation')return reserveObservation(binding.root,input);
  if(input.result?.state==='unknown'&&input.result.serviceReceipt?.reconcileExisting===true){const library=verifiedBoundReader(binding) as unknown as ProductionLibrary,snapshot=library.readProduction();const task=snapshot.tasks.find(task=>{const parameters=task.request.parameters as Record<string,unknown>,scope=parameters.publicationScope as Record<string,unknown>|undefined;return parameters.workflow==='publication-observe'&&parameters.executor==='native-observer'&&scope?.reservationId===input.reservationId;});const scope=task?.request.parameters as Record<string,unknown>|undefined,requestId=(scope?.publicationScope as Record<string,unknown>|undefined)?.requestId,cost=task?snapshot.costs.find(cost=>cost.taskId===task.id&&cost.requestId===requestId):undefined;const originalAttemptId=cost?.attemptId??task?.attempts.find(attempt=>attempt.workerId==='native-publication-observer')?.id;return reconcileObservation(binding.root,input,task?library.readProductionContext(task.id,originalAttemptId):null);}
  return finishObservation(binding.root,input);}
 if(op==='publicationDue'){const root=vaultRootForRuntime(binding.root);return root?withVaultReadLock(root,()=>readObservationDue(binding.root)):[];}
 const method=op==='publicationRead'?'readJinchengPublication':'mutateJinchengPublication';if(publicationRuntimeInput(method,args.input)!==true)fail('INVALID_INPUT','请核对真实发布、证据和作者决定');
 const input=args.input as PublicationMutation,context=readVaultTaskContext(binding.root,input.contentId);if(!context?.content||!vaultRootForRuntime(binding.root)){if(op==='publicationRead')return null;fail('NOT_FOUND','知识库内容不可读取');}
 const work={vaultId:context.vaultId,workId:context.content.tNumber};if(op==='publicationRead')return withVaultReadLock(vaultRootForRuntime(binding.root)??binding.root,()=>readPublicationFacts(binding.root,work));
 requireWrite(mode);const authorDecision={actor:'author' as const,text:input.decisionText,at:input.decisionAt},base={...input,work,authorDecision};
 if(input.op==='associate-archive')associateExternalArchive(binding.root,{...base,sourceId:input.sourceId,videoId:input.videoId,manifestPath:input.manifestPath,expectedSourceHash:input.expectedSourceHash});
 else if(input.op==='enable-observation')enableObservation(binding.root,{...base,enabled:input.enabled,provider:input.provider,maxRequestsPerCheckpoint:input.maxRequestsPerCheckpoint,maxUnits:input.maxUnits});
 else if(input.op==='record')recordPublication(binding.root,{...base,publication:input.publication,finalScript:input.finalScript,contentPackageId:input.contentPackageId});
 else if(input.op==='snapshot')importSnapshot(binding.root,{...base,platform:input.platform,checkpoint:input.checkpoint,collectedAt:input.collectedAt,rawEvidence:input.rawEvidence,metrics:input.metrics,delayReason:input.delayReason});
 else if(input.op==='confirm-review')confirmReview(binding.root,{...base,candidateId:input.candidateId,candidateHash:input.candidateHash,selectedActionIndex:input.selectedActionIndex});
 else if(input.op==='decide-knowledge')decideKnowledge(binding.root,{...base,candidateId:input.candidateId,candidateHash:input.candidateHash,decision:input.decision});
 return withVaultReadLock(vaultRootForRuntime(binding.root)??binding.root,()=>readPublicationFacts(binding.root,work));
}
