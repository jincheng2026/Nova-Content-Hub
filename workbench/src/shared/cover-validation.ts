import {validCoverDesignSelection,validFrozenCoverDesign} from '../../../plugin-src/src/lib/file-library/cover-design-validation.mjs';
import { ASSISTANTS } from './cover-contracts.ts';
import type { CoverInput, CoverPending, PhotoPending, CoverActionPending, Fingerprint, CoverReference } from './cover-contracts.ts';
import { exact, uuid, token } from './validation.ts';
import { isRecord } from './contracts.ts';
export const assistant = (v: unknown) => ASSISTANTS.includes(v as typeof ASSISTANTS[number]);
export const templateId = (v: unknown) => uuid(v) || typeof v === 'string' && /^builtin-[a-z0-9-]{1,80}$/.test(v);
export function coverPackagingSelection(v:unknown):boolean {return exact(v,['documentId','pageId','revision','selectionToken'])&&typeof v.documentId==='string'&&/^doc-[a-f0-9]{32}$/.test(v.documentId)&&typeof v.pageId==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(v.pageId)&&token(v.revision)&&token(v.selectionToken);}
export function coverPackagingRead(v:unknown):boolean {return exact(v,['contentId',...(isRecord(v)&&Object.hasOwn(v,'documentId')?['documentId']:[])])&&uuid(v.contentId)&&(!Object.hasOwn(v,'documentId')||typeof v.documentId==='string'&&/^doc-[a-f0-9]{32}$/.test(v.documentId));}
export function frozenCoverPackaging(v:unknown):boolean {
 if(!exact(v,['vaultId','workId','documentId','pageId','revision','selectionToken','slots','manuscriptSource'])||!uuid(v.vaultId)||typeof v.workId!=='string'||!/^T\d{3,}$/.test(v.workId)||!coverPackagingSelection({documentId:v.documentId,pageId:v.pageId,revision:v.revision,selectionToken:v.selectionToken})||!exact(v.slots,['title','coverText','description']))return false;
 for(const key of ['title','coverText','description']){const item=v.slots[key];if(key==='description'&&item===null)continue;if(!exact(item,['itemId','hash'])||typeof item.itemId!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(item.itemId)||!token(item.hash))return false;}
 const m=v.manuscriptSource;
 return exact(m,['vaultId','workId','documentId','pageId','revision','relativePath','format'])&&m.vaultId===v.vaultId&&m.workId===v.workId&&typeof m.documentId==='string'&&/^doc-[a-f0-9]{32}$/.test(m.documentId)&&token(m.revision)&&(m.pageId===null||typeof m.pageId==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(m.pageId))&&typeof m.relativePath==='string'&&!/^[\\/]|^[a-z]:/i.test(m.relativePath)&&m.relativePath.split(/[\\/]/).every(p=>!!p&&p!=='.'&&p!=='..')&&['html','markdown','text'].includes(m.format as string);
}
export function frozenCoverContext(v:unknown):boolean {
 return exact(v,['kind','vaultId','workId','documentId','pageId','revision','relativePath','format'])&&['topic','manuscript','title-only'].includes(v.kind as string)&&uuid(v.vaultId)&&typeof v.workId==='string'&&/^T\d{3,}$/.test(v.workId)&&typeof v.documentId==='string'&&/^doc-[a-f0-9]{32}$/.test(v.documentId)&&token(v.revision)&&(v.pageId===null||typeof v.pageId==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(v.pageId))&&typeof v.relativePath==='string'&&!/^[\\/]|^[a-z]:/i.test(v.relativePath)&&v.relativePath.split(/[\\/]/).every(p=>!!p&&p!=='.'&&p!=='..')&&['html','markdown','text'].includes(v.format as string)&&(v.kind!=='topic'||v.format==='markdown'&&v.pageId===null)&&(v.kind!=='title-only'||['markdown','text'].includes(v.format as string)&&v.pageId===null);
}
export function coverInput(v: unknown): v is CoverInput {
  const hasDesign = isRecord(v) && Object.hasOwn(v,'designSource');
  const hasSizePolicy = isRecord(v) && Object.hasOwn(v, 'sizePolicy');
  const hasSource = isRecord(v) && Object.hasOwn(v,'packagingSource');
  const hasCoverText = isRecord(v) && Object.hasOwn(v, 'coverText');
  return exact(v, ['template', 'styleAssetHashes', 'photo', 'materialIds', 'prompt', 'pixels', 'ratio', 'count', 'outputFormat', 'scope', ...(hasSizePolicy ? ['sizePolicy'] : []), ...(hasCoverText ? ['coverText'] : []), ...(hasSource ? ['packagingSource'] : []), ...(hasDesign ? ['designSource'] : [])]) && (!hasDesign || validCoverDesignSelection(v.designSource)) && (!hasSource || !hasCoverText && coverPackagingSelection(v.packagingSource)) &&
    (!hasSizePolicy || v.sizePolicy === 'exact' || v.sizePolicy === 'ratio-minimum') &&
    (!hasCoverText || typeof v.coverText === 'string' && v.coverText.trim().length > 0 && v.coverText.length <= 10000) &&
    exact(v.template, ['id', 'version']) && templateId(v.template.id) && Number.isSafeInteger(v.template.version) && (v.template.version as number) > 0 &&
    Array.isArray(v.styleAssetHashes) && v.styleAssetHashes.length > 0 && v.styleAssetHashes.length <= 100 && v.styleAssetHashes.every(token) && new Set(v.styleAssetHashes).size === v.styleAssetHashes.length &&
    (v.photo === null || exact(v.photo, ['id', 'assetHash']) && uuid(v.photo.id) && token(v.photo.assetHash)) &&
    Array.isArray(v.materialIds) && v.materialIds.length <= 100 && v.materialIds.every(uuid) && new Set(v.materialIds).size === v.materialIds.length &&
    typeof v.prompt === 'string' && v.prompt.trim().length > 0 && v.prompt.length <= 30_000 &&
    exact(v.pixels, ['width', 'height']) && [v.pixels.width, v.pixels.height].every(n => Number.isSafeInteger(n) && (n as number) > 0) && (v.pixels.width as number) * (v.pixels.height as number) <= 40_000_000 &&
    typeof v.ratio === 'string' && /^\d{1,8}:\d{1,8}$/.test(v.ratio) && Number.isSafeInteger(v.count) && (v.count as number) >= 1 && (v.count as number) <= 20 && ['png', 'jpeg', 'webp'].includes(v.outputFormat as string) && v.scope === 'cover-only';
}
export function coverReference(v: unknown): v is CoverReference { return exact(v, ['contentId', 'requestId', 'attemptId']) && [v.contentId, v.requestId, v.attemptId].every(uuid); }
export function fingerprint(v: unknown): v is Fingerprint {
  return exact(v, ['contentId', 'title', 'bodyHash', 'editToken', 'inputHash', 'existingRequest', ...(isRecord(v)&&Object.hasOwn(v,'packagingSource')?['packagingSource']:[]), ...(isRecord(v)&&Object.hasOwn(v,'designSource')?['designSource']:[]), ...(isRecord(v)&&Object.hasOwn(v,'contextSource')?['contextSource']:[])]) && (!Object.hasOwn(v,'contextSource')||frozenCoverContext(v.contextSource)) && (!Object.hasOwn(v,'designSource')||validFrozenCoverDesign(v.designSource)) && (!Object.hasOwn(v,'packagingSource')||frozenCoverPackaging(v.packagingSource)) && uuid(v.contentId) && typeof v.title === 'string' && token(v.bodyHash) && token(v.editToken) && token(v.inputHash) && (v.existingRequest === null || exact(v.existingRequest, ['requestId', 'requestHash']) && uuid(v.existingRequest.requestId) && token(v.existingRequest.requestHash));
}
export function photoPending(v: unknown): v is PhotoPending { return exact(v, ['source', 'expectedHash', 'mutationId', 'title', 'originalName', 'isOwnPhoto']) && typeof v.source === 'string' && token(v.expectedHash) && uuid(v.mutationId) && typeof v.title === 'string' && !!v.title.trim() && v.title.length <= 500 && typeof v.originalName === 'string' && typeof v.isOwnPhoto === 'boolean'; }
export function coverActionPending(v: unknown): v is CoverActionPending { return exact(v, ['mutationId', 'action', 'contentId', 'candidateId', 'editToken']) && v.action === 'select' && uuid(v.mutationId) && uuid(v.contentId) && uuid(v.candidateId) && token(v.editToken) || exact(v, ['mutationId', 'action', 'reference']) && v.action === 'cancel' && uuid(v.mutationId) && coverReference(v.reference); }
export function coverPending(v: unknown): v is CoverPending { return exact(v, ['input', 'fingerprint', 'requestMutationId', 'attemptMutationId', 'host', 'requestId', 'requestHash', 'reason']) && coverInput(v.input) && fingerprint(v.fingerprint) && [v.requestMutationId, v.attemptMutationId].every(uuid) && assistant(v.host) && (v.requestId === null && v.requestHash === null || uuid(v.requestId) && token(v.requestHash)) && ['initial', 'retry', 'host-change'].includes(v.reason as string); }
export function coverDesktopInput(method: string, v: unknown): boolean | undefined {
  switch (method) {
    case 'readCoverPackaging': return coverPackagingRead(v);
    case 'readAssistantSetup': case 'resumeCoverAction': case 'abandonCoverAction': case 'listCoverAssets': case 'retryBuiltins': case 'resumePhoto': case 'abandonPhoto': case 'resumeCover': case 'abandonCover': return v === undefined;
    case 'choosePhoto': return exact(v, ['title', 'isOwnPhoto']) && typeof v.title === 'string' && !!v.title.trim() && v.title.length <= 500 && typeof v.isOwnPhoto === 'boolean';
    case 'readCoverDesigns': case 'readCoverProgress': case 'readCover': case 'revealCoverFolder': return exact(v, ['contentId']) && uuid(v.contentId);
    case 'generateCover': return exact(v, ['contentId', 'editToken', 'input']) && uuid(v.contentId) && token(v.editToken) && coverInput(v.input);
    case 'continueBoundCover': case 'continueCover': case 'retryCover': case 'cancelCover': return coverReference(v);
    case 'selectCover': return exact(v, ['contentId', 'candidateId', 'editToken']) && uuid(v.contentId) && uuid(v.candidateId) && token(v.editToken);
    case 'exportCover': return exact(v, ['contentId', 'candidateId']) && uuid(v.contentId) && uuid(v.candidateId);
    case 'setAssistant': return exact(v, ['host']) && assistant(v.host);
  }
}
