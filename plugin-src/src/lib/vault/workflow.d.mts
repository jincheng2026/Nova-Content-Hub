export type WorkRef = {vaultId:string;workId:string};
export type CheckpointKind = 'topic'|'author-analysis'|'analysis-comparison'|'narrative'|'framework'|'kepu-segment'|'kepu-readthrough'|'cover-design'|'key-segments'|'complete-draft'|'final-script'|'packaging'|'recorded'|'publication'|'archive'|'review';
export type AuthorEvidence = {actor:'author';text:string;at:string};
export type StageArtifact = {kind:CheckpointKind;artifactId:string;hash:string;path:string;methodId:string;taskId:string;at:string;kepuScope?:{frameworkId:string;frameworkHash:string;index:number;title:string}};
export type DecisionInput = {work:WorkRef;kind:CheckpointKind;artifactId:string;artifactHash:string;expectedRevision:string;decision:'confirm'|'reopen'|'reject';evidence:AuthorEvidence};
export type StageDecision = Omit<DecisionInput,'work'|'expectedRevision'> & {decisionId:string};
export type FlowFacts = Record<string,unknown> & {narrativeConfirmed:boolean;finalScriptConfirmed:boolean;recorded:boolean;published:boolean;sourceResolution:'resolved'|'conflict'|'missing'};
export type WorkFlow = {work:WorkRef;revision:string;facts:FlowFacts;checkpointStates:Record<string,{confirmed:boolean;stale:boolean}>;decisions:StageDecision[];artifacts:StageArtifact[];metaQuestions:Record<string,{answer:string;at:string;history:{answer:string;at:string}[]}>;originalFacts:{source:{sourceId:string;documentId:string;relativePath:string;hash:string};pageId:string|null;applicable:boolean;approved:string;recorded:string;suggestionDecisions:{id:string;decision:string}[];packaging:unknown[]}[];nextActions:Record<string,unknown>[];sourceCandidates:import('./index.mjs').SourceCandidate[]};
export function readWorkFlow(root:string,work:WorkRef):WorkFlow;
export function appendStageArtifact(root:string,input:Omit<StageArtifact,'at'> & {work:WorkRef}):{revision:string;artifactId:string;path:string;hash:string};
/** Must be invoked by trusted author controller or verified host response adapter. */
export function confirmCheckpoint(root:string,input:DecisionInput):{revision:string;decisionId:string};
export function answerMetaQuestion(root:string,input:{work:WorkRef;number:number;answer:string;at:string;expectedHash:string}):{revision:string};
export function metaQuestionsForStage(stage:CheckpointKind|'learning'):number[];
export function selectWorkSource(root:string,input:{work:WorkRef;documentId:string;expectedHash:string;expectedRevision:string;authorDecision:AuthorEvidence}):{revision:string;source:{sourceId:string;documentId:string;relativePath:string;hash:string;evidence:AuthorEvidence}};
