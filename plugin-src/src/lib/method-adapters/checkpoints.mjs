export function checkpointKey(artifact){const scope=artifact.kepuScope;return artifact.kind==='kepu-segment'?scope?`kepu-segment:${scope.frameworkId}:${scope.frameworkHash}:${scope.index}`:`kepu-segment:${artifact.artifactId}`:artifact.kind;}
export function currentStageArtifacts(artifacts){return artifacts.filter((a,i,all)=>!all.slice(i+1).some(b=>checkpointKey(a)===checkpointKey(b)));}
