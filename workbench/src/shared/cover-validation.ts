import { ASSISTANTS } from './cover-contracts.ts';
import type { CoverInput, CoverPending, PhotoPending, CoverActionPending, Fingerprint, CoverReference } from './cover-contracts.ts';
import { exact, uuid, token } from './validation.ts';
import { isRecord } from './contracts.ts';
export const assistant = (v: unknown) => ASSISTANTS.includes(v as typeof ASSISTANTS[number]);
export const templateId = (v: unknown) => uuid(v) || typeof v === 'string' && /^builtin-[a-z0-9-]{1,80}$/.test(v);
export function coverInput(v: unknown): v is CoverInput {
  const hasSizePolicy = isRecord(v) && Object.hasOwn(v, 'sizePolicy');
  return exact(v, ['template', 'styleAssetHashes', 'photo', 'materialIds', 'prompt', 'pixels', 'ratio', 'count', 'outputFormat', 'scope', ...(hasSizePolicy ? ['sizePolicy'] : [])]) &&
    (!hasSizePolicy || v.sizePolicy === 'exact' || v.sizePolicy === 'ratio-minimum') &&
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
  return exact(v, ['contentId', 'title', 'bodyHash', 'editToken', 'inputHash', 'existingRequest']) && uuid(v.contentId) && typeof v.title === 'string' && token(v.bodyHash) && token(v.editToken) && token(v.inputHash) && (v.existingRequest === null || exact(v.existingRequest, ['requestId', 'requestHash']) && uuid(v.existingRequest.requestId) && token(v.existingRequest.requestHash));
}
export function photoPending(v: unknown): v is PhotoPending { return exact(v, ['source', 'expectedHash', 'mutationId', 'title', 'originalName', 'isOwnPhoto']) && typeof v.source === 'string' && token(v.expectedHash) && uuid(v.mutationId) && typeof v.title === 'string' && !!v.title.trim() && v.title.length <= 500 && typeof v.originalName === 'string' && typeof v.isOwnPhoto === 'boolean'; }
export function coverActionPending(v: unknown): v is CoverActionPending { return exact(v, ['mutationId', 'action', 'contentId', 'candidateId', 'editToken']) && v.action === 'select' && uuid(v.mutationId) && uuid(v.contentId) && uuid(v.candidateId) && token(v.editToken) || exact(v, ['mutationId', 'action', 'reference']) && v.action === 'cancel' && uuid(v.mutationId) && coverReference(v.reference); }
export function coverPending(v: unknown): v is CoverPending { return exact(v, ['input', 'fingerprint', 'requestMutationId', 'attemptMutationId', 'host', 'requestId', 'requestHash', 'reason']) && coverInput(v.input) && fingerprint(v.fingerprint) && [v.requestMutationId, v.attemptMutationId].every(uuid) && assistant(v.host) && (v.requestId === null && v.requestHash === null || uuid(v.requestId) && token(v.requestHash)) && ['initial', 'retry', 'host-change'].includes(v.reason as string); }
export function coverDesktopInput(method: string, v: unknown): boolean | undefined {
  switch (method) {
    case 'readAssistantSetup': case 'resumeCoverAction': case 'abandonCoverAction': case 'listCoverAssets': case 'retryBuiltins': case 'resumePhoto': case 'abandonPhoto': case 'resumeCover': case 'abandonCover': return v === undefined;
    case 'choosePhoto': return exact(v, ['title', 'isOwnPhoto']) && typeof v.title === 'string' && !!v.title.trim() && v.title.length <= 500 && typeof v.isOwnPhoto === 'boolean';
    case 'readCoverProgress': case 'readCover': case 'revealCoverFolder': return exact(v, ['contentId']) && uuid(v.contentId);
    case 'generateCover': return exact(v, ['contentId', 'editToken', 'input']) && uuid(v.contentId) && token(v.editToken) && coverInput(v.input);
    case 'continueBoundCover': case 'continueCover': case 'retryCover': case 'cancelCover': return coverReference(v);
    case 'selectCover': return exact(v, ['contentId', 'candidateId', 'editToken']) && uuid(v.contentId) && uuid(v.candidateId) && token(v.editToken);
    case 'exportCover': return exact(v, ['contentId', 'candidateId']) && uuid(v.contentId) && uuid(v.candidateId);
    case 'setAssistant': return exact(v, ['host']) && assistant(v.host);
  }
}
