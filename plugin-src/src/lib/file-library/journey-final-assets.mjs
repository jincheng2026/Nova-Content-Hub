import {LibraryError} from './index.mjs';
import {readFinalAssets} from '../final-assets/index.mjs';
import {queryVaultMutation} from '../vault/core.mjs';
const required=()=>{throw new LibraryError('FINAL_ASSETS_REQUIRED','请先由作者保存同内容、当前稿件与包装、当前已选封面的准确最终资产版本。');};
/** Completion reads the adopted bundle and its verified files. Assistant prose,
 * an old snapshot and an acknowledged source warning never complete a journey. */
export function journeyFinalCheckpoint(runtimeRoot,root,child,currentContent){
 let view;try{view=readFinalAssets(runtimeRoot,{contentId:root.contentId});}catch{required();}
 const selected=view.selected,manifest=selected?.manifest,work=root.request.parameters.work,cover=currentContent.selectedCover,design=root.journeyState.checkpoints.findLast(pin=>pin.kind==='cover-design'),provenance=manifest?.cover.provenance,designSource=provenance?.designSource;
 if(!selected||!view.current||view.current.bundleId!==selected.bundleId||view.current.manifestHash!==selected.manifestHash||view.sourceState!=='current'||view.issues.length||manifest.adoption.kind!=='author-save'||manifest.work.vaultId!==work.vaultId||manifest.work.workId!==work.workId||manifest.contentIdAtSave!==root.contentId||manifest.cover.sourceMatch!=='current'||manifest.manuscript.kind!=='jc-doc-segments'||manifest.manuscript.documentId!==child.request.parameters.source.documentId||manifest.packaging.documentId!==child.request.parameters.source.documentId||manifest.packaging.revision!==child.request.parameters.source.hash||!design||provenance.kind!=='generated'||designSource?.vaultId!==work.vaultId||designSource?.workId!==work.workId||designSource?.artifactId!==design.artifactId||designSource?.artifactHash!==design.hash||designSource?.taskId!==design.taskId||!cover||cover.candidateId!==manifest.cover.candidateId||cover.assetHash!==manifest.cover.assetHash||cover.requestId!==provenance.requestId||cover.attemptId!==provenance.attemptId)required();
 const receipt=queryVaultMutation(runtimeRoot,manifest.adoption.mutationId);
 if(receipt?.status!=='committed'||receipt.request?.action!=='final-assets'||receipt.request.input.contentId!==root.contentId||receipt.request.input.expectedPreviewToken!==manifest.adoption.previewToken||receipt.result?.selected?.bundleId!==selected.bundleId||receipt.result.selected.manifestHash!==selected.manifestHash||view.current.mutationId!==manifest.adoption.mutationId)required();
 return {taskId:child.id,stepId:child.journeyMember.stepId,kind:'final-assets',artifactId:selected.bundleId,hash:selected.manifestHash,path:selected.relativeDirectory+'/manifest.json',decisionId:manifest.adoption.mutationId};
}
