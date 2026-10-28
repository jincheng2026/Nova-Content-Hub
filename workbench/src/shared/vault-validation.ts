import {finalAssetsDesktopInput} from './final-assets-validation.ts';
import {exact,token,uuid,identity} from './validation.ts';
import type {VaultPending} from './vault-contracts.ts';
export const vaultSections = ['profile','accounts','materials','patterns','topics','drafts','reviews','prompts'] as const;
// IDs are opaque source identities, never filesystem paths supplied by a renderer.
export const vaultDocumentId = (value:unknown):value is string => typeof value==='string' && /^[A-Za-z0-9_-]{1,200}$/.test(value);
const text = (value:unknown,max:number) => typeof value==='string' && value.length<=max && !value.includes('\0') && new TextEncoder().encode(value).byteLength<=max;
export function vaultDesktopInput(method:string,input:unknown):boolean|undefined {
 switch(method){
 case 'listVaultDocumentTrash':return input===undefined;
 case 'restoreVaultDocument':return exact(input,['trashId','expectedHash'])&&typeof input.trashId==='string'&&/^[a-zA-Z0-9_-]{8,100}$/.test(input.trashId)&&token(input.expectedHash);
 case 'readDocumentView':return exact(input,['documentId','expectedHash','scope'])&&typeof input.documentId==='string'&&/^(?:doc-|source-|reading-)[a-f0-9]{32,64}$/.test(input.documentId)&&token(input.expectedHash)&&token(input.scope);
 case 'readDocumentReference':case 'openDocumentExternalReference':return (exact(input,['documentId','expectedHash','refId','targetIdentity','scope'])||exact(input,['documentId','expectedHash','refId','targetIdentity','scope','intent']))&&typeof input.documentId==='string'&&/^(?:doc-|source-|reading-)[a-f0-9]{32,64}$/.test(input.documentId)&&token(input.expectedHash)&&token(input.refId)&&token(input.targetIdentity)&&token(input.scope)&&(input.intent===undefined||['embed','navigate'].includes(input.intent as string));
 case 'revealVaultReference':return exact(input,['id','target'])&&vaultDocumentId(input.id)&&text(input.target,2000)&&!!input.target;
 case 'openVaultReference':return exact(input,['id','url'])&&vaultDocumentId(input.id)&&text(input.url,4096)&&!/[\u0000-\u0020\u007f]/.test(input.url as string);
 case 'readVault':return input===undefined;
 case 'readVaultWorkDirectory':case 'readVaultTopicMenus':case 'readVaultSources':return input===undefined;
 case 'openVaultSourcePage':return exact(input,['sourceId','relativePath'])&&vaultDocumentId(input.sourceId)&&typeof input.relativePath==='string'&&input.relativePath.length<2000&&!/^[\\/]|^[A-Za-z]:/.test(input.relativePath)&&!input.relativePath.split(/[\\/]/).some(part=>!part||part==='..'||part==='.')&&!input.relativePath.includes('\0');
 case 'chooseVaultSource':return exact(input,['role'])&&['benchmark-accounts','topics','drafts','materials','market-patterns','official-archives','archive-analysis','judgments','methods','author-evidence','cases','reports','prompts','visual-assets','bookmarks'].includes(input.role as string);
 case 'adoptVaultTopic':return exact(input,['sessionId','candidateId','expectedHash','decisionText','mutationId'])&&typeof input.sessionId==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(input.sessionId)&&typeof input.candidateId==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(input.candidateId)&&token(input.expectedHash)&&text(input.decisionText,2000)&&!!String(input.decisionText).trim()&&uuid(input.mutationId);
 case 'readVaultContentSource':case 'readVaultWorkContext':case 'revealVaultContentDirectory':return exact(input,['contentId'])&&uuid(input.contentId);
 case 'selectVaultCurrentWork':return exact(input,['contentId','documentId','expectedHash','expectedRevision','decisionText'])&&uuid(input.contentId)&&vaultDocumentId(input.documentId)&&token(input.expectedHash)&&token(input.expectedRevision)&&text(input.decisionText,2000)&&!!String(input.decisionText).trim();
 case 'readVaultDocument':case 'revealVaultDocument':return exact(input,['id'])&&vaultDocumentId(input.id);
 case 'saveVaultDocument':return exact(input,['id','expectedHash','text'])&&vaultDocumentId(input.id)&&token(input.expectedHash)&&text(input.text,1_000_000);
 case 'createVaultDocument':return exact(input,['section','title','text'])&&vaultSections.includes(input.section as typeof vaultSections[number])&&text(input.title,500)&&text(input.text,1_000_000);
 case 'createVaultWorkingDraft':case 'trashVaultDocument':return exact(input,['id','expectedHash'])&&vaultDocumentId(input.id)&&token(input.expectedHash);
 case 'recoverVaultMutation':return exact(input,['action'])&&['retry','discard'].includes(input.action as string);
 }
}
export function vaultPending(value:unknown):value is VaultPending {
 return exact(value,['method','input','mutationId','binding']) && ['restoreVaultDocument','saveFinalAssets','saveVaultDocument','createVaultDocument','createVaultWorkingDraft','trashVaultDocument'].includes(value.method as string) && uuid(value.mutationId) && exact(value.binding,['libraryId','rootIdentity']) && uuid(value.binding.libraryId)&&identity(value.binding.rootIdentity)&&(value.method==='saveFinalAssets'?finalAssetsDesktopInput(value.method,value.input):vaultDesktopInput(value.method as string,value.input))===true;
}
