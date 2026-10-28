import type {ResearchConfig} from './common.mjs';
export {validateResearchConfig,researchMediaAuthorized} from './common.mjs';
export type IntakePageData = null|boolean|number|string|IntakePageData[]|{[key:string]:IntakePageData};
export interface IntakeInput {videoId?:string;mediaId?:string;title:string;platform:'抖音'|'douyin';author?:string;publishedAt?:string;sourceText?:string;description?:string;shareUrl?:string;sourceDescription?:string;pageData?:IntakePageData}
export interface IntakeSource {videoId:string;platform:'douyin'|'抖音';title:string;description?:string;author?:string;publishedAt?:string}
export interface IntakeDuplicate {directory:string;foundBy:('work-id'|'canonical-url'|'media-sha256')[]}
export interface IntakeResult {status:'published'|'duplicate';directory:string;reportPath:string;originalPath?:string;transcriptPath?:string;subtitlePath?:string;notePath?:string;mediaValidationPath?:string;coverPath?:string;fileHashes?:Record<string,string>;source_sha256?:string;sourceProvenance?:'registered-provider-metadata'|'legacy-user-supplied';subtitleValidation?:Record<string,unknown>;intermediateArchive?:string;verifiedAt?:string;dedup:{layer:string|null;foundBy:string[];matches:IntakeDuplicate[]};foundBy:string[];finalizedMediaIds?:string[];pendingMediaIds:string[];strictValidation?:{ok:boolean;limitations:string[]}}
export interface ResearchRuntime {prepare(config:ResearchConfig):Promise<unknown>;status(id:string):Record<string,unknown>;normalizeContent(id:string,input:Record<string,unknown>):Record<string,unknown>;readiness():Promise<unknown>;collect(id:string,input:Record<string,unknown>):Promise<unknown>;deriveSamples(id:string):Promise<unknown>;download(id:string,videoId:string):Promise<unknown>;transcribe(id:string,videoId:string):Promise<unknown>;correct(id:string,videoId:string,input:Record<string,unknown>):Promise<unknown>;finalizeIntake(id:string,input:IntakeInput|Record<string,unknown>):Promise<IntakeResult>;saveDataset(id:string,payload:unknown):Promise<unknown>;freeze(id:string):Promise<unknown>;advise(id:string,input:{findingsHash:string;advice:unknown[];ownSources?:unknown[]}):Promise<unknown>;render(id:string):Promise<{relativePath:string;sha256:string;findingsHash:string;mechanicalValidation:string;visualValidation:string}>}
export interface ResearchRuntimeOptions {vaultRoot:string;executeService?:(request:Record<string,unknown>)=>Promise<unknown>;fetchMedia?:(input:{videoId:string;url:string})=>Promise<unknown>;readMedia?:(grant:{assetHash:string;videoId:string})=>Promise<{data:Uint8Array;extension:string;proof?:IntakeMediaProof;coverBytes?:Uint8Array}>;assetRoot?:URL|string;readiness?:()=>Promise<unknown>;authorize?:(request:{config:ResearchConfig;action:string;input:unknown})=>Promise<void>}
export function createResearchRuntime(options:ResearchRuntimeOptions):ResearchRuntime;
export function validateTranscript(input:unknown,requirement?:'text'|'timing'):Record<string,unknown>;
export function normalizeAsrResult(result:unknown):Record<string,unknown>;
export function computeAccount(payload:unknown):Record<string,unknown>;
export function freezeFindings(payload:unknown):Record<string,unknown>;
export function renderAccountReport(payload:unknown,options?:{title?:string;assetRoot?:URL|string}):Promise<string>;
export function validateCommentReport(payload:unknown,level?:'L1'|'L2'|'L3'|'L4'):Map<string,unknown>;
export function freezeCommentFindings(payload:unknown,level?:'L1'|'L2'|'L3'|'L4'):Record<string,unknown>;
export function renderCommentReport(payload:unknown,options?:{level?:'L1'|'L2'|'L3'|'L4';assetRoot?:URL}):Promise<string>;
export function buildCorrectedSubtitles(text:string,segments:unknown[],durationSeconds?:number):{srt:string;cues:unknown[];validation:Record<string,unknown>};
export function validateSubtitleCues(cues:unknown[],text:string,durationSeconds?:number):unknown[];

export function prepareContentRecords(rows:unknown[],options?:{platform?:string;asOf?:string}):Record<string,unknown>;
export function parseCount(value:unknown):number|null;
export function extractServiceRows(response:unknown,operation:string):unknown[];
export function validateTopicDataset(payload:unknown):unknown;
export function freezeTopicFindings(payload:unknown):Record<string,unknown>;
export function renderTopicReport(payload:unknown):Promise<string>;

export function renderReferenceCard(payload:unknown):string;

export interface IntakeMediaProof {version:1;engine:'pyav';decoder:'bundled-pyav'|'external-pyav';pyavVersion:string;originalSha256:string;bytes:number;extension:'.mp4'|'.webm';container:{format:string;durationSeconds:number};video:{streamIndex:number;codec:string;width:number;height:number;decodedFrames:1};audio:{streamIndex:number;codec:string;sampleRate:number;channels:number;decodedSamples:number};cover:{sha256:string;mediaType:'image/png';width:number;height:number;bytes:number;captureTimestampSeconds:number};checks:{header:'passed';sha256:'passed';containerProbe:'passed';videoDecode:'passed';audioDecode:'passed';coverScreenshot:'passed'};toolAdaptation:{file:'native-header-and-sha256';ffprobe:'pyav-container-and-stream-probe';ffmpegDecode:'pyav-short-video-and-audio-decode';screenshot:'pyav-decoded-frame-to-png'}}
