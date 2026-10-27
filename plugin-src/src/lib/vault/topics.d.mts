import type {WorkRef,AuthorEvidence} from './workflow.mjs';
import type {SourceCandidate} from './index.mjs';
export type TopicCandidate = {id?:string;title:string;description:string;change:string;audience:string;coverage:string;titleExample:string;caution:string};
export function saveTopicCandidates(root:string,input:{sessionId:string;candidates:TopicCandidate[];sourceRefs:unknown[];expectedHash?:string|null}):{sessionId:string;relativePath:string;hash:string;candidates:(TopicCandidate & {id:string})[]};
export function adoptTopic(root:string,input:{sessionId:string;candidateId:string;expectedHash:string;authorDecision:AuthorEvidence;mutationId:string}):WorkRef;
export function resolveCurrentWork(root:string,work:WorkRef):{status:'resolved'|'conflict'|'missing';source:{sourceId:string;documentId:string;relativePath:string;hash:string};candidates:SourceCandidate[];evidence:unknown[];sourceConflict:string|null};
export function selectCurrentWork(root:string,input:{work:WorkRef;documentId:string;expectedHash:string;expectedRevision:string;authorDecision:AuthorEvidence}):{revision:string;source:{sourceId:string;documentId:string;relativePath:string;hash:string;evidence:AuthorEvidence}};
export {answerMetaQuestion,metaQuestionsForStage} from './workflow.mjs';
