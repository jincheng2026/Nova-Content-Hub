import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import type { DesktopController } from './controller.mts';
import type { CoverStart, CoverReference, CoverView, Photo, CoverPending, CoverInput, Assistant, AssistantSetup, CoverContext, CoverActionPending } from '../shared/cover-contracts.ts';
import type { LibraryBinding, Worker } from '../shared/contracts.ts';
import { requireWrite, validateInput, fail } from '../shared/validation.ts';
export class Covers {
  reader: Worker; reading: Promise<void> = Promise.resolve();
  owner: DesktopController; epoch = randomUUID(); grants = new Map<string, string>();
  launch?: (binding: LibraryBinding, reference: CoverReference & { requestHash: string; host: Assistant }) => Promise<void>;
  setup: (host: Assistant) => Promise<AssistantSetup>;
  constructor(owner: DesktopController, launch?: Covers['launch'], reader: Worker = owner.worker, setup?: Covers['setup']) { this.owner = owner; this.launch = launch; this.reader = reader; this.setup = setup ?? (async host => ({ host, ready: false, skill: null, reason: 'unconfigured' })); }
  readAssistantSetup() { return this.setup(this.owner.binding.assistant ?? 'codex'); }
  async requireAssistant(host: Assistant) {
    const setup = await this.setup(host);
    if (!setup.ready || setup.host !== host || setup.skill !== 'nova-content-cover-execution') fail('NOT_READY', '助手尚未准备好。请打开左下角设置，检查助手与配套插件后重试。');
    if (!this.launch) fail('NOT_READY', '此构建尚未配置助手打开入口，请检查工作台安装。');
  }
  async openAttempt(reference: CoverReference) {
    const c = this.owner;
    const context = await c.worker.call('handoffContext', { binding: c.current(), reference });
    await this.requireAssistant(context.attempt.host);
    await this.launch!(c.current(), { ...reference, requestHash: context.request.requestHash, host: context.attempt.host });
  }
  revoke() { this.epoch = randomUUID(); this.grants.clear(); }
  grant(hash: string) { const url = `nova-content://assets/${this.epoch}/${hash}`; this.grants.set(url, hash); return url; }
  allows(url: string) { return this.grants.has(url); }
  resource(url: string) { const next = this.reading.then(() => this.readResource(url)); this.reading = next.then(() => {}, () => {}); return next; }
  async readResource(url: string) {
    const assetHash = this.grants.get(url); if (!assetHash) return null;
    const epoch = this.epoch, binding = this.owner.current();
    const result = await this.reader.call('raster', { binding, assetHash });
    if (epoch !== this.epoch || this.grants.get(url) !== assetHash) return null;
    const bytes = Buffer.from(result.data);
    if (createHash('sha256').update(bytes).digest('hex') !== assetHash || !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(result.mime)) fail('CORRUPT', '图片内容校验失败。');
    return { data: bytes, mime: result.mime };
  }
  photo(photo: Photo): Photo { return { ...photo, url: photo.availability === 'available' && photo.assetHash ? this.grant(photo.assetHash) : null }; }
  decorate(view: CoverView) { return { ...view, candidates: view.candidates.map(c => ({ ...c, url: this.grant(c.assetHash) })) }; }
  async writable() { const c = this.owner; c.noPending(); c.current(); const task = await c.query(); if (c.binding.started && task?.status !== 'committed') fail('IMPORT_IN_PROGRESS', '请先完成或核验当前导入。'); }
  async seed() {
    const c = this.owner; requireWrite(c.authMode);
    await c.persist({ ...c.binding, seedPending: true });
    await c.worker.call('seed', { binding: c.current() });
    await c.persist({ ...c.binding, seedPending: false });
  }
  async retryBuiltins() { return this.owner.exclusive(async () => { await this.writable(); await this.seed(); }); }
  async listCoverAssets() { const c = this.owner; return c.exclusive(async () => { const result = await c.worker.call('coverAssets', { binding: c.current() }); return { templates: result.templates.map(t => ({ ...t, samples: t.samples.map(r => ({ ...r, url: this.grant(r.assetHash) })) })), photos: result.photos.map(p => this.photo(p)) }; }); }
  async choosePhoto(input: { title: string; isOwnPhoto: boolean }) {
    const c = this.owner; validateInput('choosePhoto', input); requireWrite(c.authMode);
    return c.exclusive(async () => {
      await this.writable(); const binding = c.current(); const source = await c.dialogs.photo?.(); if (!source) return null;
      const decoded = await c.worker.call('preflightPhoto', { source });
      await c.persist({ ...c.binding, photoPending: { source, expectedHash: decoded.assetHash, mutationId: randomUUID(), title: input.title, originalName: path.basename(source), isOwnPhoto: input.isOwnPhoto } });
      return this.finishPhoto(binding);
    });
  }
  async finishPhoto(binding = this.owner.current()) {
    const c = this.owner; if (!c.binding.photoPending) fail('NO_PENDING', '没有待核验的照片。');
    const photo = await c.worker.call('importPhoto', { binding, pending: c.binding.photoPending });
    await c.persist({ ...c.binding, photoPending: null }); return this.photo(photo);
  }
  async resumePhoto() { requireWrite(this.owner.authMode); return this.owner.exclusive(() => this.finishPhoto()); }
  async abandonPhoto() { return this.owner.exclusive(async () => { await this.owner.persist({ ...this.owner.binding, photoPending: null }); }); }
  async readCover(input: { contentId: string }) { validateInput('readCover', input); return this.owner.exclusive(async () => this.decorate(await this.owner.worker.call('readCover', { binding: this.owner.current(), contentId: input.contentId }))); }
  async generateCover(input: CoverStart) {
    const c = this.owner; validateInput('generateCover', input); requireWrite(c.authMode);
    return c.exclusive(async () => {
      await this.writable(); await this.requireAssistant(c.binding.assistant ?? 'codex');
      const fingerprint = await c.worker.call('inspectCoverInput', { binding: c.current(), ...input });
      const pending: CoverPending = { input: structuredClone(input.input), fingerprint, requestMutationId: randomUUID(), attemptMutationId: randomUUID(), host: c.binding.assistant ?? 'codex', requestId: null, requestHash: null, reason: 'initial' };
      await c.persist({ ...c.binding, coverPending: pending });
      return this.finishCover();
    });
  }
  async finishCover(open = true) {
    const c = this.owner; let pending = c.binding.coverPending;
    if (!pending) fail('NO_PENDING', '没有待核验的封面操作。');
    await this.requireAssistant(pending.host);
    const binding = c.current();
    // A reused request may have no receipt for this mutation; lookup is authoritative.
    let found = await c.worker.call('findCoverRequest', { binding, fingerprint: pending.fingerprint });
    if (!found) {
      if (pending.requestId) fail('CORRUPT', '已固定的封面请求丢失，待处理意图保留。');
      await c.worker.call('createCoverRequest', { binding, pending });
      found = await c.worker.call('findCoverRequest', { binding, fingerprint: pending.fingerprint });
      if (!found) fail('PENDING_MUTATION', '封面请求结果尚待核验。');
    }
    if (pending.requestId && (pending.requestId !== found.request.requestId || pending.requestHash !== found.request.requestHash)) fail('CONFLICT', '封面请求与固定的待处理意图不同。');
    if (!pending.requestId) {
      pending = { ...pending, requestId: found.request.requestId, requestHash: found.request.requestHash };
      await c.persist({ ...c.binding, coverPending: pending });
    }
    let context = await c.worker.call('findCoverAttempt', { binding, pending });
    if (!context && pending.reason === 'initial') {
      const job = found.content.coverJobs?.find(j => j.id === pending!.requestId);
      const existing = job?.attempts.find(a => a.attemptId === job.activeAttemptId);
      if (existing && !['created', 'claimed'].includes(existing.status)) {
        const result = this.decorate(await c.worker.call('readCover', { binding, contentId: pending.fingerprint.contentId }));
        await c.persist({ ...c.binding, coverPending: null }); return { ...result, launchRequested: false };
      }
      // Repeated generate/continue reuses the active attempt; only explicit retry/host change adds one.
      if (existing && existing.host !== pending.host) { pending = { ...pending, reason: 'host-change' }; await c.persist({ ...c.binding, coverPending: pending }); }
      if (existing && existing.host === pending.host) context = await c.worker.call('coverContext', { binding, reference: { contentId: pending.fingerprint.contentId, requestId: pending.requestId!, attemptId: existing.attemptId } });
      else if (job?.attempts.length && !existing) {
        const result = this.decorate(await c.worker.call('readCover', { binding, contentId: pending.fingerprint.contentId }));
        await c.persist({ ...c.binding, coverPending: null }); return { ...result, launchRequested: false };
      }
    }
    if (!context) context = await c.worker.call('createCoverAttempt', { binding, pending });
    if (context.request.requestHash !== pending.requestHash) fail('CONFLICT', '尝试不属于已固定的封面请求。');
    const result = this.decorate(await c.worker.call('readCover', { binding, contentId: pending.fingerprint.contentId }));
    await c.persist({ ...c.binding, coverPending: null });
    const launchRequested = open && ['created', 'claimed'].includes(context.attempt.status);
    if (launchRequested) await this.openAttempt({ contentId: pending.fingerprint.contentId, requestId: context.request.requestId, attemptId: context.attempt.attemptId });
    return { ...result, launchRequested };
  }
  async resumeCover() { requireWrite(this.owner.authMode); return this.owner.exclusive(() => this.finishCover()); }
  async abandonCover() { return this.owner.exclusive(async () => { await this.owner.persist({ ...this.owner.binding, coverPending: null }); }); }
  async newAttempt(reference: CoverReference, reason: 'retry' | 'host-change', context?: CoverContext, open = true) {
    const c = this.owner; await this.writable(); const binding = c.current();
    await this.requireAssistant(c.binding.assistant ?? 'codex');
    const current = context ?? await c.worker.call('coverContext', { binding, reference });
    const request = current.request as CoverContext['request'] & CoverInput & { materials?: { id: string }[] };
    const input: CoverInput = { template: { id: request.template.id, version: request.template.version }, styleAssetHashes: [...request.styleAssetHashes], photo: request.photo ? { id: request.photo.id, assetHash: request.photo.assetHash } : null, materialIds: (request.materials || []).map(m => m.id), prompt: request.prompt, pixels: { ...request.pixels }, ratio: request.ratio, count: request.count, outputFormat: request.outputFormat, scope: 'cover-only' };
    const fingerprint = await c.worker.call('inspectCoverInput', { binding, contentId: reference.contentId, input, editToken: current.content.editToken });
    if (fingerprint.title !== request.title || fingerprint.bodyHash !== request.bodyHash) fail('STALE_INPUT', '正文或标题已改变，请使用当前内容重新准备封面。');
    await c.persist({ ...c.binding, coverPending: { input, fingerprint, host: c.binding.assistant ?? 'codex', requestId: reference.requestId, requestHash: request.requestHash, requestMutationId: randomUUID(), attemptMutationId: randomUUID(), reason } });
    return this.finishCover(open);
  }
  async retryCover(reference: CoverReference) { validateInput('retryCover', reference); requireWrite(this.owner.authMode); return this.owner.exclusive(() => this.newAttempt(reference, 'retry')); }
  async continueCover(reference: CoverReference) {
    const c = this.owner; validateInput('continueCover', reference); requireWrite(c.authMode);
    return c.exclusive(async () => {
      await this.writable(); await this.requireAssistant(c.binding.assistant ?? 'codex');
      const context = await c.worker.call('handoffContext', { binding: c.current(), reference });
      if (context.attempt.host !== (c.binding.assistant ?? 'codex')) {
        const updated = await this.newAttempt(reference, 'host-change', context, false);
        const job = updated.jobs.find(j => j.id === reference.requestId)!;
        reference = { ...reference, attemptId: job.activeAttemptId! };
      }
      await this.openAttempt(reference);
      return { launchRequested: true as const };
    });
  }
  async checkAction() {
    const c = this.owner, pending = c.binding.coverActionPending;
    if (!pending) fail('NO_PENDING', '没有待核验的封面选用或取消操作。');
    const receipt = await c.worker.call('queryMutation', { binding: c.current(), mutationId: pending.mutationId });
    if (!receipt) return null;
    const contentId = pending.action === 'select' ? pending.contentId : pending.reference.contentId;
    if (receipt.objectId !== contentId) fail('CONFLICT', '封面操作回执不属于原内容。');
    const result = this.decorate(await c.worker.call('readCover', { binding: c.current(), contentId }));
    await c.persist({ ...c.binding, coverActionPending: null }); return result;
  }
  async dispatchAction() {
    const c = this.owner, p = c.binding.coverActionPending!; requireWrite(c.authMode);
    if (p.action === 'select') await c.worker.call('selectCover', { binding: c.current(), contentId: p.contentId, candidateId: p.candidateId, editToken: p.editToken, mutationId: p.mutationId });
    else await c.worker.call('cancelCover', { binding: c.current(), reference: p.reference, mutationId: p.mutationId });
    const result = await this.checkAction(); if (!result) fail('PENDING_MUTATION', '封面操作结果尚待核验。'); return result;
  }
  async writeAction(pending: CoverActionPending) { await this.writable(); await this.owner.persist({ ...this.owner.binding, coverActionPending: pending }); return this.dispatchAction(); }
  async resumeCoverAction() { return this.owner.exclusive(async () => await this.checkAction() ?? await this.dispatchAction()); }
  async abandonCoverAction() { return this.owner.exclusive(async () => { await this.owner.persist({ ...this.owner.binding, coverActionPending: null }); }); }
  async cancelCover(reference: CoverReference) { validateInput('cancelCover', reference); requireWrite(this.owner.authMode); return this.owner.exclusive(() => this.writeAction({ action: 'cancel', reference, mutationId: randomUUID() })); }
  async selectCover(input: { contentId: string; candidateId: string; editToken: string }) { validateInput('selectCover', input); requireWrite(this.owner.authMode); return this.owner.exclusive(() => this.writeAction({ action: 'select', ...input, mutationId: randomUUID() })); }
  async exportCover(input: { contentId: string; candidateId: string }) {
    const c = this.owner; validateInput('exportCover', input);
    return c.exclusive(async () => {
      const raster = await c.worker.call('candidateRaster', { binding: c.current(), ...input });
      const ext = raster.mime.split('/')[1]; const destination = await c.dialogs.export?.(`封面.${ext}`);
      if (!destination) return { exported: false };
      const temporary = path.join(path.dirname(destination), `.nova-export-${randomUUID()}`);
      const fd = await fs.open(temporary, 'wx', 0o600);
      try { await fd.writeFile(raster.data); await fd.sync(); } finally { await fd.close(); }
      await fs.rename(temporary, destination); return { exported: true };
    });
  }
  async setAssistant(input: { host: Assistant }) { const c = this.owner; validateInput('setAssistant', input); return c.exclusive(async () => { c.noPending(); await c.persist({ ...c.binding, assistant: input.host }); }); }
}
