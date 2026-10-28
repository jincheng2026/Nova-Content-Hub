import type {Status} from '../shared/contracts.ts';
import type {FinalAssetSelection,FinalAssetWarning,FinalAssetsPreview,FinalAssetSaveInput} from '../shared/final-assets-contracts.ts';
import type {VaultRecovery} from '../shared/vault-contracts.ts';
/** Retain the author's exact choice and review across flush/save failures.
 * Durable mutation identity remains in the native Vault pending record.
 */
export class FinalAssetsDraft {
 selection:FinalAssetSelection;preview:FinalAssetsPreview|null=null;
 acknowledged=new Set<FinalAssetWarning>();pending=false;
 constructor(contentId:string){this.selection={contentId,manuscript:{kind:'current'}};}
 select(selection:FinalAssetSelection){this.selection=structuredClone(selection);this.preview=null;this.acknowledged.clear();}
 acknowledge(code:FinalAssetWarning,checked:boolean){if(checked)this.acknowledged.add(code);else this.acknowledged.delete(code);}
 async readPreview(flush:()=>Promise<void>,read:(selection:FinalAssetSelection)=>Promise<FinalAssetsPreview>){
  if(this.pending)throw Error('请先核验上次保存结果。');const selection=this.selection;
  await flush();const preview=await read(structuredClone(selection));
  if(selection!==this.selection)throw Error('来源选择已变化，请重新预览。');
  this.preview=preview;this.acknowledged.clear();return preview;
 }
 async save<T>(flush:()=>Promise<void>,save:(input:FinalAssetSaveInput)=>Promise<T>,pendingStatus?:()=>Promise<Pick<Status,'vaultPending'|'vaultPendingOperation'>>){
  const preview=this.preview,selection=this.selection;
  if(!preview)throw Error('请先预览最终资产。');if(this.pending)throw Error('请先核验上次保存结果。');
  if(preview.warnings.some(code=>!this.acknowledged.has(code)))throw Error('请明确确认封面来源提示后再保存。');
  await flush();if(this.preview!==preview||this.selection!==selection)throw Error('来源选择已变化，请重新预览。');
  this.pending=true;
  let result:T;
  try{result=await save({...structuredClone(selection),expectedPreviewToken:preview.previewToken,expectedCurrentHash:preview.currentHash,acknowledgedWarnings:preview.warnings.filter(code=>this.acknowledged.has(code))});}
  catch(error){try{const status=await pendingStatus?.();if(status?.vaultPending===false||status?.vaultPendingOperation&&(status.vaultPendingOperation.method!=='saveFinalAssets'||status.vaultPendingOperation.contentId!==selection.contentId))this.pending=false;}catch{/* Uncertain native state keeps the existing recovery intent. */}throw error;}
  this.pending=false;this.preview=null;this.acknowledged.clear();return result;
 }
 recovered(recovery:Pick<VaultRecovery,'method'|'input'|'outcome'>){
  if(recovery.method!=='saveFinalAssets'||!('contentId'in recovery.input)||recovery.input.contentId!==this.selection.contentId)return false;
  this.pending=false;return true;
 }
}
