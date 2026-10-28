import type {LibraryBinding} from './contracts.ts';
import type {VaultWorkContext} from './vault-contracts.ts';
import type {CheckpointKind} from '../../../plugin-src/src/lib/vault/workflow.mjs';
export type JinchengStage='intake'|'analysis-author'|'analysis-ai'|'narrative'|'key-segment'|'writing'|'tutorial'|'kepu'|'review-page'|'cover-design'|'synthesis'|'revision'|'cover-copy'|'closeout'|'review'|'research'|'comments'|'patterns';
export interface SynthesisBrief {depth:'orientation'|'issue'|'generative';question:string;purpose:string;timeBoundary:string;scopeBoundary:string}
export interface ResearchBrief {route:'account'|'topic'|'comments'|'intake';platform:'douyin'|'xiaohongshu'|'manual';targetIds:string[];videoIds?:string[];commentMode?:'report'|'audience-depth'|'reference-card'|'diagnostic'}
export interface StageInputs {
 confirmJinchengCheckpoint:{contentId:string;kind:CheckpointKind;artifactId:string;artifactHash:string;expectedRevision:string;decision:'confirm'|'reopen'|'reject';decisionText:string};
 saveJinchengAuthorAnalysis:{contentId:string;text:string;expectedRevision:string};
}
export interface StageResults {confirmJinchengCheckpoint:VaultWorkContext|null;saveJinchengAuthorAnalysis:VaultWorkContext|null}
export interface StageWorkerOperations {
 stageConfirm:{args:{binding:LibraryBinding;input:StageInputs['confirmJinchengCheckpoint']};result:VaultWorkContext|null};
 stageAuthorAnalysis:{args:{binding:LibraryBinding;input:StageInputs['saveJinchengAuthorAnalysis']};result:VaultWorkContext|null};
}
