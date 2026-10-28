export type SynthesisBrief={depth:'orientation'|'issue'|'generative';question:string;purpose:string;timeBoundary:string;scopeBoundary:string};
export function validateSynthesisBrief(value:unknown):boolean;
export function compileSynthesisReport(brief:SynthesisBrief,report:unknown):{markdown:string;html:string;ledger:unknown[]};
export function compileReviewPage(workId:string,spec:unknown,options?:{confirmed?:(pin:unknown,change:unknown)=>boolean}):unknown;
export function validateKepuCandidate(kind:string,data:unknown):void;
export function validateCoverDesign(data:unknown):void;
export const REVIEW_REASON_TYPES:string[];
