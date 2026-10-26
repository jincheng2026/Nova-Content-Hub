import {templateStudyComplete} from './template-study-state.mts';
import {isTemplateCatalogSelectable, templateCatalogFields} from './template-catalog.mts';
import {boundReader, forgetBoundReader} from './bound-reader.mts';
import {errorInfo} from '../shared/contracts.ts';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { openLibrary } from '../../../plugin-src/src/lib/file-library/index.mjs';
import { installBuiltins } from '../../../plugin-src/src/lib/library-seed/index.mjs';
import { validateImportedRaster } from '../../../plugin-src/src/lib/image-validation/index.mjs';
import { exact, uuid, token, libraryBinding, requireWrite, fail } from '../shared/validation.ts';
import { coverInput, coverPending, photoPending, fingerprint, coverReference } from '../shared/cover-validation.ts';
import type { LibraryBinding, Content } from '../shared/contracts.ts';
import type { CoverView, Photo, CoverWorkerOperations, CoverPending } from '../shared/cover-contracts.ts';
const schemas = {
  seed: ['binding'], coverAssets: ['binding'], preflightPhoto: ['source'], importPhoto: ['binding', 'pending'], raster: ['binding', 'assetHash'], rasterBatch: ['binding', 'assetHashes'],
  inspectCoverInput: ['binding', 'contentId', 'input', 'editToken'], findCoverRequest: ['binding', 'fingerprint'], createCoverRequest: ['binding', 'pending'], createCoverAttempt: ['binding', 'pending'], findCoverAttempt: ['binding', 'pending'], handoffContext: ['binding', 'reference'], coverContext: ['binding', 'reference'], readCover: ['binding', 'contentId'], readCoverProgress: ['binding', 'contentId'],
  selectCover: ['binding', 'contentId', 'candidateId', 'editToken', 'mutationId'], cancelCover: ['binding', 'reference', 'mutationId'], candidateRaster: ['binding', 'contentId', 'candidateId'],
} satisfies Record<keyof CoverWorkerOperations, string[]>;
export function isCoverOperation(op: unknown): op is keyof CoverWorkerOperations { return typeof op === 'string' && Object.hasOwn(schemas, op); }
const absolute = (v: unknown): v is string => typeof v === 'string' && path.isAbsolute(v) && !v.includes('\0');
export const contentProjection = ({ id, title, body, editToken, deletedAt }: Content): Content => ({ id, title, body, editToken, deletedAt });
const photoProjection = (p: Photo): Photo => ({ id: p.id, title: p.title, assetHash: p.assetHash, isOwnPhoto: p.isOwnPhoto, availability: p.availability === 'unavailable' ? 'unavailable' : 'available', url: null });
export function sourceBytes(source: string, maxBytes = 64 * 1024 * 1024) {
  const info = fs.lstatSync(source, { bigint: true });
  if (!info.isFile() || info.isSymbolicLink() || info.size < 1n || info.size > BigInt(maxBytes)) fail('INVALID_IMAGE', '请选择大小符合限制的完整普通文件。');
  const fd = fs.openSync(source, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const before = fs.fstatSync(fd, { bigint: true });
    if (!before.isFile() || before.size < 1n || before.size > BigInt(maxBytes) || before.dev !== info.dev || before.ino !== info.ino) fail('CONFLICT', '文件在选择后被替换。');
    const chunks: Buffer[] = []; let size = 0;
    for (;;) { const chunk = Buffer.alloc(65536), count = fs.readSync(fd, chunk); if (!count) break; size += count; if (size > maxBytes) fail('INVALID_IMAGE', '文件超过大小限制。'); chunks.push(chunk.subarray(0, count)); }
    const bytes = Buffer.concat(chunks, size);
    const after = fs.fstatSync(fd, { bigint: true }), current = fs.lstatSync(source, { bigint: true });
    if (bytes.length > maxBytes || current.isSymbolicLink() || ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].some(k => before[k as keyof typeof before] !== after[k as keyof typeof after] || after[k as keyof typeof after] !== current[k as keyof typeof current]) || BigInt(bytes.length) !== after.size) fail('CONFLICT', '选择的文件在读取时改变，请重新选择。');
    return bytes;
  } finally { fs.closeSync(fd); }
}
type Library = ReturnType<typeof openLibrary>;
function view(library: Library, contentId: string): CoverView {
  const {content: current, progress, requests} = library.readCoverState(contentId);
  return { content: contentProjection(current), jobs: (current.coverJobs || []).map(job => {
    const request = requests.get(job.id);
    const summary: CoverView['jobs'][number]['summary'] = request ? { template: { id: request.template.id, version: request.template.version }, styleSampleCount: request.styleAssetHashes.length, hasOwnPhoto: request.photo !== null, pixels: { width: request.pixels.width, height: request.pixels.height }, sizePolicy: request.sizePolicy ?? 'exact', count: request.count, ratio: request.ratio, outputFormat: request.outputFormat } : null;
    return { id: job.id, requestHash: job.requestHash, inputHash: job.inputHash, activeAttemptId: job.activeAttemptId, summary, attempts: job.attempts.map(a => ({ attemptId: a.attemptId, host: a.host, status: a.status, reason: a.reason, failure: a.failure, progress: progress.jobs.find(j => j.id === job.id)?.attempts.find(p => p.attemptId === a.attemptId)?.progress, progressUnavailable: progress.jobs.find(j => j.id === job.id)?.attempts.find(p => p.attemptId === a.attemptId)?.progressUnavailable })) };
  }), candidates: (current.candidates || []).map(c => ({ id: c.id, assetHash: c.assetHash, originalName: c.originalName, requestId: c.requestId, attemptId: c.attemptId, accepted: c.accepted, url: '' })), selectedCandidateId: current.selectedCover?.candidateId ?? null };
}
// Only cache the conclusion for immutable bytes, never bytes or library authority.
const validatedMimes = new Map<string, string>();
async function raster(library: Library, assetHash: string) {
  const asset = library.readAsset(assetHash), cached = validatedMimes.get(assetHash);
  if (cached !== undefined) {
    if (asset.detectedType !== cached) fail('INVALID_IMAGE', '图片类型或摘要不一致。');
    return {data: asset.data, mime: cached};
  }
  const decoded = await validateImportedRaster(Buffer.from(asset.data));
  // Reopen after full decode so a replaced root cannot authorize old bytes.
  library.readAsset(assetHash);
  const mime = `image/${decoded.format}`;
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mime) || decoded.assetHash !== assetHash || asset.detectedType !== mime) fail('INVALID_IMAGE', '图片类型或摘要不一致。');
  if (validatedMimes.size >= 128) validatedMimes.delete(validatedMimes.keys().next().value!);
  validatedMimes.set(assetHash, mime);
  return { data: asset.data, mime };
}
function findAttempt(library: Library, pending: CoverPending) {
  const receipt = library.queryMutation(pending.attemptMutationId);
  if (!receipt) return null;
  if (receipt.objectKind !== 'content' || receipt.objectId !== pending.fingerprint.contentId) fail('CONFLICT', '封面尝试回执属于其他内容。');
  const job = receipt.content.coverJobs?.find(j => j.id === pending.requestId);
  if (!job?.activeAttemptId) fail('CORRUPT', '封面尝试回执缺少本次尝试。');
  const context = library.readCoverContext(pending.fingerprint.contentId, job.id, job.activeAttemptId);
  if (context.request.requestHash !== pending.requestHash || context.attempt.host !== pending.host) fail('CONFLICT', '封面尝试身份不一致。');
  return context;
}
export async function executeCover(op: keyof CoverWorkerOperations, raw: unknown, mode: 'required' | 'disabled'): Promise<CoverWorkerOperations[keyof CoverWorkerOperations]['result']> {
  if (!exact(raw, schemas[op]) || Object.entries(raw).some(([key, v]) => {
    if (key === 'binding') return !libraryBinding(v) || !absolute(v.root);
    if (key === 'source') return !absolute(v);
    if (key === 'assetHashes') return !Array.isArray(v) || v.length < 1 || v.length > 2 || !Array.from(v).every(token) || new Set(v).size !== v.length;
    if (key === 'pending') return op === 'importPhoto' ? !photoPending(v) || !absolute(v.source) : !coverPending(v);
    if (key === 'input') return !coverInput(v);
    if (key === 'fingerprint') return !fingerprint(v);
    if (key === 'reference') return !coverReference(v);
    return ['editToken', 'assetHash'].includes(key) ? !token(v) : !uuid(v);
  })) fail('INVALID_INPUT', '工作进程拒绝无效封面输入。');
  if (['seed', 'importPhoto', 'createCoverRequest', 'createCoverAttempt', 'selectCover', 'cancelCover', 'handoffContext'].includes(op)) requireWrite(mode);
  if (op === 'preflightPhoto') return validateImportedRaster(sourceBytes(raw.source as string));
  const binding = raw.binding as unknown as LibraryBinding;
  if (op === 'raster' || op === 'rasterBatch') {
    try {
      const library = boundReader(binding);
      if (op === 'raster') return await raster(library, raw.assetHash as string);
      // File reads/locks stay synchronous in one worker; only two full raster
      // decodes overlap. One bad image must not fail the other batch member.
      return await Promise.all((raw.assetHashes as string[]).map(async assetHash => {
        try { return {ok: true as const, value: await raster(library, assetHash)}; }
        catch (error) { forgetBoundReader(); return {ok: false as const, error: {code: errorInfo(error).code, message: '图片读取未完成。'}}; }
      }));
    } catch (error) { forgetBoundReader(); throw error; }
  }
  const library = ['coverAssets', 'readCover', 'readCoverProgress'].includes(op) ? boundReader(binding) : openLibrary(binding.root, { expectedLibraryId: binding.libraryId, expectedRootIdentity: binding.rootIdentity });
  if (op === 'readCoverProgress') return library.readCoverProgress(raw.contentId as string);
  if (op === 'seed') { installBuiltins(library); return; }
  if (op === 'importPhoto') {
    const p = raw.pending as unknown as import('../shared/cover-contracts.ts').PhotoPending;
    const receipt = library.queryMutation(p.mutationId);
    if (receipt) { const photo = library.readPhoto(receipt.objectId); await raster(library, photo.assetHash!); return photoProjection(photo); }
    let stored = false;
    try { library.readAsset(p.expectedHash); stored = true; } catch (e) { if ((e as { code?: string }).code !== 'CORRUPT') throw e; }
    if (!stored) {
      let decoded;
      try { decoded = await validateImportedRaster(sourceBytes(p.source)); }
      catch (e) { if ((e as { code?: string }).code === 'ENOENT') fail('PHOTO_SOURCE_MISSING', '照片尚未进入内容库，原文件已不在原位置。请恢复原文件后继续；待处理记录保留。'); throw e; }
      if (decoded.assetHash !== p.expectedHash) fail('SOURCE_CHANGED', '原照片已改变，固定的照片输入仍保留。');
      const asset = library.importAsset(p.source, { purpose: 'photo' });
      if (asset.assetHash !== p.expectedHash) fail('SOURCE_CHANGED', '导入的照片与原预检摘要不同。');
    }
    await raster(library, p.expectedHash);
    return photoProjection(library.createPhoto({ title: p.title, originalName: p.originalName, assetHash: p.expectedHash, isOwnPhoto: p.isOwnPhoto }, { mutationId: p.mutationId }));
  }
  if (op === 'coverAssets') return {
    templates: library.listTemplates().filter(isTemplateCatalogSelectable).map(t => { const pkg = library.readTemplate(t.id, t.currentVersion); const accepted = !!t.templateJobs?.some(job => job.acceptance?.acceptedTemplate.id === t.id && job.acceptance.acceptedTemplate.version === t.currentVersion && job.acceptance.acceptedTemplate.packageHash === t.versions.find(v => v.version === t.currentVersion)?.packageHash); return { ...templateCatalogFields(t, pkg.definition), studyComplete: templateStudyComplete(library, pkg), builtin: t.builtin === true, id: t.id, version: t.currentVersion, name: pkg.title, description: typeof pkg.definition.desc === 'string' ? pkg.definition.desc : '', accepted, aiTested: accepted, samples: [...new Set(Object.values(pkg.resources).filter(r => r.role === 'style').map(r => r.assetHash))].map(assetHash => ({ assetHash, url: '' })) }; }).filter(template => template.samples.length > 0),
    photos: library.listPhotos().map(photoProjection),
  };
  if (op === 'inspectCoverInput') return library.inspectCoverInput(raw.contentId as string, raw.input as unknown as import('../shared/cover-contracts.ts').CoverInput, raw.editToken as string);
  if (op === 'findCoverRequest') { const f = raw.fingerprint as unknown as import('../shared/cover-contracts.ts').Fingerprint; return library.findCoverRequest(f.contentId, { inputHash: f.inputHash, title: f.title, bodyHash: f.bodyHash }); }
  if (op === 'createCoverRequest') { const p = raw.pending as unknown as CoverPending; return library.createCoverRequest(p.fingerprint.contentId, p.input, p.fingerprint.editToken, { mutationId: p.requestMutationId }); }
  if (op === 'findCoverAttempt') return findAttempt(library, raw.pending as unknown as CoverPending);
  if (op === 'createCoverAttempt') {
    const p = raw.pending as unknown as CoverPending;
    const existing = findAttempt(library, p); if (existing) return existing;
    const result = library.createCoverAttempt(p.fingerprint.contentId, p.requestId!, { host: p.host, reason: p.reason }, { mutationId: p.attemptMutationId });
    return library.readCoverContext(p.fingerprint.contentId, p.requestId!, result.attempt.attemptId);
  }
  if (op === 'coverContext' || op === 'handoffContext') {
    const r = raw.reference as unknown as import('../shared/cover-contracts.ts').CoverReference;
    const context = library.readCoverContext(r.contentId, r.requestId, r.attemptId);
    if (op === 'handoffContext') {
      if (context.content.title !== context.request.title || createHash('sha256').update(context.content.body).digest('hex') !== context.request.bodyHash) fail('STALE_INPUT', '标题或正文已改变，请重新准备封面。');
      const job = context.content.coverJobs?.find(j => j.id === r.requestId);
      if (context.content.deletedAt || job?.activeAttemptId !== r.attemptId || !['created', 'claimed'].includes(context.attempt.status)) fail('ATTEMPT_INACTIVE', '此尝试已完成、取消或被替换。');
    }
    return context;
  }
  if (op === 'selectCover') { library.selectContentCover(raw.contentId as string, raw.candidateId as string, raw.editToken as string, { mutationId: raw.mutationId as string }); return view(library, raw.contentId as string); }
  if (op === 'cancelCover') { const r = raw.reference as unknown as import('../shared/cover-contracts.ts').CoverReference; library.cancelCoverAttempt(r.contentId, r.requestId, r.attemptId, { mutationId: raw.mutationId as string }); return view(library, r.contentId); }
  if (op === 'candidateRaster') {
    const candidate = library.readContent(raw.contentId as string).candidates?.find(c => c.id === raw.candidateId);
    if (!candidate) fail('INVALID_INPUT', '候选图不属于当前内容。');
    return raster(library, candidate.assetHash);
  }
  return view(library, raw.contentId as string);
}
