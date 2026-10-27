import type {VaultPending,VaultRecovery,VaultSection,VaultText} from './vault-contracts.ts';
export type VaultEditorSubmission = Pick<VaultPending,'method'|'input'>;
export interface VaultEditorState {current:VaultText|null;text:string;title:string;category:VaultSection;submission:VaultEditorSubmission|null}
export interface VaultEditorRecovered extends VaultEditorState {sourceUnavailable:boolean;conflict:boolean;message:string}
export const VAULT_RECOVERY_EVENT='nova-vault-recovered';
export function announceVaultRecovery(target:EventTarget,recovery:VaultRecovery){target.dispatchEvent(new CustomEvent(VAULT_RECOVERY_EVENT,{detail:recovery}));}
export function listenVaultRecovery(target:EventTarget,receive:(recovery:VaultRecovery)=>void){const listener=(event:Event)=>receive((event as CustomEvent<VaultRecovery>).detail);target.addEventListener(VAULT_RECOVERY_EVENT,listener);return()=>target.removeEventListener(VAULT_RECOVERY_EVENT,listener);}
function sameInput(a:VaultEditorSubmission,b:VaultEditorSubmission){return a.method===b.method&&Object.keys(a.input).length===Object.keys(b.input).length&&Object.entries(a.input).every(([key,value])=>Object.hasOwn(b.input,key)&&b.input[key as keyof typeof b.input]===value);}
/** Correlate a retained editor with its exact submission, preserving later edits and today's source. */
export function reconcileVaultEditor(state:VaultEditorState,recovery:VaultRecovery):VaultEditorRecovered|null{
 if(!state.submission||!sameInput(state.submission,recovery))return null;
 const base={...state,submission:null,conflict:false,sourceUnavailable:false};
 if(recovery.outcome==='discarded')return {...base,message:'已确认上次修改未提交，本次填写仍保留。'};
 if(!recovery.result||!('document' in recovery.result))return {...base,sourceUnavailable:true,message:'已确认资料移入回收区。本次填写仍保留，可关闭后查看知识库。'};
 const committed=recovery.result,latest=recovery.current;
 if(!latest)return {...base,current:committed,sourceUnavailable:true,message:'上次修改已提交，原文件目前不可读取。文档身份与本次填写已保留，请定位原件后继续。'};
 const submittedText='text' in state.submission.input?state.submission.input.text:committed.text;
 const unchanged=state.text===submittedText&&(state.submission.method!=='createVaultDocument'||state.title===('title' in state.submission.input?state.submission.input.title:state.title)&&state.category===('section' in state.submission.input?state.submission.input.section:state.category));
 const conflict=!unchanged&&latest.document.hash!==committed.document.hash;
 return {...base,current:latest,text:unchanged?latest.text:state.text,conflict,message:conflict?'上次修改已提交；原文后来也有变化，本次新填写仍保留，请比较后再保存。':unchanged?'上次修改已确认，已同步当前原文。':'上次修改已确认，本次后续填写仍保留，可继续保存。'};
}
