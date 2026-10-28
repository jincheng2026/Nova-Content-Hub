import type {StageArtifact} from '../vault/workflow.mjs';
export function checkpointKey(artifact:StageArtifact):string;
export function currentStageArtifacts(artifacts:StageArtifact[]):StageArtifact[];
