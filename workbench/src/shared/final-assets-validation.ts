import {exact,token,uuid} from './validation.ts';
import {vaultDocumentId} from './vault-validation.ts';

const warningCodes=['COVER_SOURCE_DIFFERENT','COVER_SOURCE_UNKNOWN'];
function selection(value:unknown):value is Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const input=value as Record<string,unknown>;
 return uuid(input.contentId)&&(!Object.hasOwn(input,'packagingDocumentId')||vaultDocumentId(input.packagingDocumentId))&&
  (exact(input.manuscript,['kind'])&&input.manuscript.kind==='current'||
   exact(input.manuscript,['kind','documentId'])&&input.manuscript.kind==='recorded'&&vaultDocumentId(input.manuscript.documentId));
}
const selectionKeys=(value:Record<string,unknown>)=>['contentId','manuscript',...(Object.hasOwn(value,'packagingDocumentId')?['packagingDocumentId']:[])];

/** Renderer supplies identities and preview versions; every byte is reread by the backend. */
export function finalAssetsDesktopInput(method:string,value:unknown):boolean|undefined{
 switch(method){
  case 'readFinalAssets':return (exact(value,['contentId'])||exact(value,['contentId','bundleId'])&&uuid(value.bundleId))&&uuid(value.contentId);
  case 'previewFinalAssets':return selection(value)&&exact(value,selectionKeys(value));
  case 'saveFinalAssets':return selection(value)&&exact(value,[...selectionKeys(value),'expectedPreviewToken','expectedCurrentHash','acknowledgedWarnings'])&&
   token(value.expectedPreviewToken)&&(value.expectedCurrentHash===null||token(value.expectedCurrentHash))&&
   Array.isArray(value.acknowledgedWarnings)&&value.acknowledgedWarnings.length<=warningCodes.length&&
   new Set(value.acknowledgedWarnings).size===value.acknowledgedWarnings.length&&value.acknowledgedWarnings.every(code=>warningCodes.includes(code));
  case 'exportFinalAssets':return exact(value,['contentId','bundleId','manifestHash'])&&uuid(value.contentId)&&uuid(value.bundleId)&&token(value.manifestHash);
 }
}
