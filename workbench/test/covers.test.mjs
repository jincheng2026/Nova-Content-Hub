import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import { randomUUID, createHash } from 'node:crypto';
import { DesktopController } from '../src/main/controller.mts';
import { BindingStore, emptyBinding, validateBinding } from '../src/main/bindings.mts';
import { execute } from '../src/main/worker.mts';
import { validateInput } from '../src/shared/validation.ts';
import { createLibrary, openLibrary, __testing } from '../../plugin-src/src/lib/file-library/index.mjs';
process.env.NODE_ENV = 'test';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function fixture(t, mode = 'disabled') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-native-cover-')); t.after(() => { __testing.setHook(undefined); return fs.rm(root, { recursive: true, force: true }); });
  const libraryRoot = path.join(root, 'library'), library = createLibrary(libraryRoot);
  const source = path.join(root, 'original.png'), bytes = await sharp({ create: { width: 8, height: 6, channels: 3, background: '#53acde' } }).png().toBuffer(); await fs.writeFile(source, bytes);
  const asset = library.importAsset(source, { purpose: 'template-reference' });
  const template = library.createTemplate({ name: 'custom', definition: { accepted: false, aiTested: false }, resources: { sample: { assetHash: asset.assetHash, bytes: asset.bytes, detectedType: asset.detectedType, role: 'style' } } });
  const content = library.createContent({ title: 'fixed title', body: 'fixed body' });
  const input = { template: { id: template.id, version: 1 }, styleAssetHashes: [asset.assetHash], photo: null, materialIds: [], prompt: 'A', pixels: { width: 8, height: 6 }, ratio: '4:3', count: 1, outputFormat: 'png', scope: 'cover-only' };
  const binding = { root: library.info.root, libraryId: library.info.libraryId, rootIdentity: library.info.rootIdentity };
  const store = new BindingStore(path.join(root, 'machine.json')); await store.save({ ...emptyBinding(), current: binding });
  const worker = { call: (op, args) => execute(op, args, mode) }, launches = [];
  const make = () => new DesktopController({ store, worker, documents: root, authMode: mode, dialogs: { backup: async () => null, destination: async () => null, photo: async () => source, export: async () => path.join(root, 'export.png'), library: async () => libraryRoot }, launch: async (bound, reference) => launches.push({ bound, reference }) });
  const controller = make(); await controller.initialize();
  const start = (c = controller, raw = input) => c.generateCover({ contentId: content.id, editToken: library.readContent(content.id).editToken, input: raw });
  return { root, libraryRoot, library, content, input, binding, source, bytes, asset, controller, make, worker, store, start, launches };
}
test('exact cover IPC refuses paths/host/URLs and corrupt or simultaneous durable intents', async t => {
  const f = await fixture(t);
  for (const method of ['generateCover', 'choosePhoto', 'continueCover', 'setAssistant', 'selectCover', 'exportCover']) {
    for (const attack of [{ path: '/tmp/private' }, { url: 'https://evil.test' }, { authMode: 'disabled' }]) assert.throws(() => validateInput(method, attack), { code: 'INVALID_INPUT' });
  }
  await assert.rejects(f.controller.generateCover({ contentId: f.content.id, editToken: f.content.editToken, input: { ...f.input, photo: undefined } }), { code: 'INVALID_INPUT' });
  await assert.rejects(execute('raster', { binding: f.binding, assetHash: f.asset.assetHash, url: 'file:///tmp/x' }), { code: 'INVALID_INPUT' });
  assert.throws(() => validateBinding({ ...emptyBinding(), current: f.binding, photoPending: { source: f.source, expectedHash: f.asset.assetHash, mutationId: randomUUID(), title: 'me', originalName: 'x.png', isOwnPhoto: false }, creation: { root: f.libraryRoot, mutationId: randomUUID(), rootIdentity: f.binding.rootIdentity } }), { code: 'BINDING_INVALID' });
});
test('request and attempt lost acknowledgements resume same durable mutations after restart', async t => {
  for (const phase of ['createCoverRequest', 'createCoverAttempt']) {
    const f = await fixture(t); const call = f.worker.call; let lost = false, durable;
    f.worker.call = async (op, args) => { const result = await call(op, args); if (op === phase && !lost) { lost = true; durable = (await f.store.load()).coverPending; throw Object.assign(new Error('lost ack'), { code: 'WORKER_EXIT' }); } return result; };
    await assert.rejects(f.start(), { code: 'WORKER_EXIT' }); assert.ok(durable);
    await assert.rejects(f.controller.createContent({ title: 'blocked', body: '' }), { code: 'PENDING_MUTATION' });
    await assert.rejects(f.controller.choosePhoto({ title: 'blocked', isOwnPhoto: true }), { code: 'PENDING_MUTATION' });
    const reopened = f.make(); await reopened.initialize(); const result = await reopened.resumeCover();
    assert.equal(result.jobs.length, 1);
    assert.deepEqual(result.jobs[0].summary, { template: f.input.template, styleSampleCount: 1, hasOwnPhoto: false, pixels: f.input.pixels, count: 1, ratio: '4:3', outputFormat: 'png' });
    assert.equal(JSON.stringify(result.jobs).includes('inbox'), false);
    assert.equal(JSON.stringify(result.jobs).includes('fixed body'), false);
    assert.equal(result.jobs[0].attempts.length, 1); assert.equal(result.jobs[0].attempts[0].host, 'codex'); assert.equal(reopened.binding.coverPending, null);
    assert.ok(f.library.queryMutation(durable.requestMutationId)); assert.ok(f.library.queryMutation(durable.attemptMutationId));
    await reopened.continueCover({ contentId: f.content.id, requestId: result.jobs[0].id, attemptId: result.jobs[0].activeAttemptId });
    await reopened.continueCover({ contentId: f.content.id, requestId: result.jobs[0].id, attemptId: result.jobs[0].activeAttemptId });
    assert.equal(f.launches.length, 2); assert.equal(f.library.readContent(f.content.id).coverJobs[0].attempts.length, 1);
  }
});
test('reused A after B has no new request receipt; recovery resolves A and metadata edits, never last request', async t => {
  const f = await fixture(t); const a = f.library.createCoverRequest(f.content.id, f.input, f.content.editToken);
  const b = f.library.createCoverRequest(f.content.id, { ...f.input, prompt: 'B' }, a.content.editToken);
  const call = f.worker.call; let pending;
  f.worker.call = async (op, args) => { if (op === 'createCoverAttempt') { pending = args.pending; throw Object.assign(new Error('before attempt'), { code: 'WORKER_EXIT' }); } return call(op, args); };
  await assert.rejects(f.start(), { code: 'WORKER_EXIT' }); assert.equal(pending.requestId, a.request.requestId); assert.equal(f.library.queryMutation(pending.requestMutationId), null);
  const current = f.library.readContent(f.content.id); f.library.savePublicationPlan(current.id, { channelId: 'wechat', scheduledAt: '2026-10-20T00:00:00Z', timezone: 'UTC' }, current.editToken);
  f.worker.call = call; const reopened = f.make(); await reopened.initialize(); const result = await reopened.resumeCover();
  assert.equal(result.jobs.find(j => j.id === a.request.requestId).attempts.length, 1); assert.equal(result.jobs.find(j => j.id === b.request.requestId).attempts.length, 0); assert.equal(result.jobs.find(j => j.id === b.request.requestId).summary, null);
});
test('body/title changes are stale, preserve cover intent, and cannot launch; explicit retry/host change has continuous source', async t => {
  const f = await fixture(t); const first = await f.start(); const job = first.jobs[0], reference = { contentId: f.content.id, requestId: job.id, attemptId: job.activeAttemptId };
  const repeated = await f.start(); assert.equal(repeated.jobs[0].attempts.length, 1);
  await f.controller.setAssistant({ host: 'workbuddy' }); await f.controller.continueCover(reference);
  let current = f.library.readContent(f.content.id); assert.equal(current.coverJobs[0].attempts.length, 2); const second = current.coverJobs[0].activeAttemptId;
  assert.equal(f.library.readCoverContext(f.content.id, job.id, second).handoff.sourceAttemptId, reference.attemptId);
  await f.controller.retryCover({ ...reference, attemptId: second }); current = f.library.readContent(f.content.id); assert.equal(current.coverJobs[0].attempts.length, 3);
  const active = { ...reference, attemptId: current.coverJobs[0].activeAttemptId }; f.library.updateContent(current.id, { body: 'changed' }, current.editToken);
  await assert.rejects(f.controller.continueCover(active), { code: 'STALE_INPUT' });
  const g = await fixture(t); const call = g.worker.call; g.worker.call = async (op, args) => { const result = await call(op, args); if (op === 'createCoverRequest') throw Object.assign(new Error('lost'), { code: 'WORKER_EXIT' }); return result; };
  await assert.rejects(g.start(), { code: 'WORKER_EXIT' }); const old = g.library.readContent(g.content.id); g.library.updateContent(old.id, { title: 'changed title' }, old.editToken);
  const reopened = g.make(); await reopened.initialize(); await assert.rejects(reopened.resumeCover(), { code: 'STALE_INPUT' }); assert.ok(reopened.binding.coverPending);
});
test('photos require full decode, preserve false declaration, resume from stored asset without source and never fake unavailable', async t => {
  const f = await fixture(t); await fs.writeFile(f.source, f.bytes.subarray(0, 60));
  await assert.rejects(f.controller.choosePhoto({ title: 'bad', isOwnPhoto: false }), { code: 'INVALID_IMAGE' }); assert.equal(f.library.listPhotos().length, 0); assert.equal(f.controller.binding.photoPending, undefined);
  await fs.writeFile(f.source, f.bytes); const notOwn = await f.controller.choosePhoto({ title: 'undeclared', isOwnPhoto: false }); assert.equal(notOwn.isOwnPhoto, false);
  await assert.rejects(f.start(f.controller, { ...f.input, photo: { id: notOwn.id, assetHash: notOwn.assetHash } }), { code: 'INVALID_INPUT' });
  const jpeg = await sharp({ create: { width: 8, height: 6, channels: 3, background: '#cc2211' } }).jpeg().withMetadata({ orientation: 6 }).toBuffer(); await fs.writeFile(f.source, jpeg);
  let fault = true; __testing.setHook(({ phase }) => { if (phase === 'afterAssetInstall' && fault) { fault = false; throw new Error('exit after asset'); } });
  await assert.rejects(f.controller.choosePhoto({ title: 'me', isOwnPhoto: true })); __testing.setHook(undefined); await fs.rm(f.source);
  const reopened = f.make(); await reopened.initialize(); const resumed = await reopened.resumePhoto(); assert.equal(resumed.isOwnPhoto, true); assert.equal(resumed.assetHash, hash(jpeg)); assert.equal(f.library.listPhotos().length, 2); assert.equal(resumed.availability, 'available');
  const again = f.make(); await again.initialize(); assert.equal(again.binding.photoPending, null);
});
test('missing photo source retains same pending, resource grants revoke on switch and refuse tampering or non-raster', async t => {
  const f = await fixture(t); const call = f.worker.call;
  f.worker.call = async (op, args) => { if (op === 'importPhoto') throw Object.assign(new Error('exit before import'), { code: 'WORKER_EXIT' }); return call(op, args); };
  await fs.writeFile(f.source, await sharp({ create: { width: 9, height: 5, channels: 3, background: '#456789' } }).png().toBuffer()); await assert.rejects(f.controller.choosePhoto({ title: 'me', isOwnPhoto: true })); await fs.rm(f.source);
  f.worker.call = call; const reopened = f.make(); await reopened.initialize(); const pending = reopened.binding.photoPending;
  await assert.rejects(reopened.resumePhoto(), { code: 'PHOTO_SOURCE_MISSING' }); assert.deepEqual(reopened.binding.photoPending, pending); assert.equal(f.library.listPhotos().length, 0); await reopened.abandonPhoto();
  const assets = await reopened.listCoverAssets(); const url = assets.templates[0].samples[0].url;
  assert.equal(assets.templates[0].accepted, false); assert.equal(assets.templates[0].aiTested, false);
  for (const attack of [url + '?', url + '#', url.replace('assets/', 'app/'), url.replace(/.$/, '0'), 'file:///etc/passwd', 'data:image/png;base64,AAAA', 'blob:x', 'https://evil.test/x']) assert.equal(reopened.covers.allows(attack), false);
  assert.equal((await reopened.covers.resource(url)).mime, 'image/png');
  const structure = path.join(f.root, 'structure.svg'); await fs.writeFile(structure, '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="6"><rect width="8" height="6"/></svg>');
  const svg = f.library.importAsset(structure, { purpose: 'template-structure' }); await assert.rejects(call('raster', { binding: f.binding, assetHash: svg.assetHash }), { code: 'INVALID_IMAGE' });
  const assetFile = path.join(f.libraryRoot, '资产', 'sha256', f.asset.assetHash.slice(0, 2), f.asset.assetHash); await fs.writeFile(assetFile, Buffer.from('corrupted'));
  await assert.rejects(reopened.covers.resource(url), { code: 'CORRUPT' }); await fs.writeFile(assetFile, f.bytes);
  await reopened.persist({ ...reopened.binding, current: null }); assert.equal(reopened.covers.allows(url), false); assert.equal(await reopened.covers.resource(url), null);
});
test('synthetic committed candidates show real bytes, manual selection/export, cancel rejects late continuation', async t => {
  const f = await fixture(t); const prepared = await f.start(); const job = prepared.jobs[0], attemptId = job.activeAttemptId;
  const context = f.library.readCoverContext(f.content.id, job.id, attemptId); f.library.claimCoverAttempt(f.content.id, job.id, attemptId, { host: 'codex', readAssetHashes: context.inputs.map(i => i.assetHash) });
  await fs.writeFile(path.join(context.inbox, 'result.png'), f.bytes); const receipt = { libraryId: f.binding.libraryId, contentId: f.content.id, requestId: job.id, attemptId, requestHash: job.requestHash, resultId: randomUUID(), files: [{ name: 'result.png', sha256: hash(f.bytes) }] };
  await f.library.commitCoverAttempt(f.content.id, job.id, attemptId, receipt);
  let view = await f.controller.readCover({ contentId: f.content.id }); assert.equal(view.candidates.length, 1); assert.equal(view.selectedCandidateId, null); assert.deepEqual((await f.controller.covers.resource(view.candidates[0].url)).data, f.bytes);
  const candidateId = view.candidates[0].id; view = await f.controller.selectCover({ contentId: f.content.id, candidateId, editToken: view.content.editToken }); assert.equal(view.selectedCandidateId, candidateId);
  assert.deepEqual(await f.controller.exportCover({ contentId: f.content.id, candidateId }), { exported: true }); assert.deepEqual(await fs.readFile(path.join(f.root, 'export.png')), f.bytes);
  const required = f.make(); await required.initialize(); required.authMode = 'required'; required.worker = { call: (op, args) => execute(op, args, 'required') };
  assert.deepEqual(await required.exportCover({ contentId: f.content.id, candidateId }), { exported: true });
  await assert.rejects(f.controller.exportCover({ contentId: randomUUID(), candidateId }));
  const retry = await f.controller.retryCover({ contentId: f.content.id, requestId: job.id, attemptId }); const ref = { contentId: f.content.id, requestId: job.id, attemptId: retry.jobs[0].activeAttemptId }; await f.controller.cancelCover(ref);
  await assert.rejects(f.controller.continueCover(ref), { code: 'ATTEMPT_INACTIVE' });
});
test('unavailable historical snapshots do not hide healthy jobs, candidates or completed actions', async t => {
  const f = await fixture(t); const first = await f.start(), old = first.jobs[0];
  const oldReference = { contentId: f.content.id, requestId: old.id, attemptId: old.activeAttemptId };
  await f.controller.cancelCover(oldReference);
  const next = await f.start(f.controller, { ...f.input, prompt: 'healthy newer request' }), job = next.jobs.find(j => j.id !== old.id), attemptId = job.activeAttemptId;
  const context = f.library.readCoverContext(f.content.id, job.id, attemptId);
  f.library.claimCoverAttempt(f.content.id, job.id, attemptId, { host: 'codex', readAssetHashes: context.inputs.map(i => i.assetHash) });
  await fs.writeFile(path.join(context.inbox, 'result.png'), f.bytes);
  await f.library.commitCoverAttempt(f.content.id, job.id, attemptId, { libraryId: f.binding.libraryId, contentId: f.content.id, requestId: job.id, attemptId, requestHash: job.requestHash, resultId: randomUUID(), files: [{ name: 'result.png', sha256: hash(f.bytes) }] });
  const snapshot = path.join(f.libraryRoot, '内容', f.content.id, '封面任务', old.id, '输入', f.asset.assetHash);
  await fs.rm(snapshot);
  for (const errorCode of ['IO_ERROR', 'CORRUPT']) {
    await assert.rejects(f.worker.call('coverContext', { binding: f.binding, reference: oldReference }), { code: errorCode });
    const view = await f.controller.readCover({ contentId: f.content.id });
    assert.equal(view.jobs.length, 2); assert.equal(view.jobs.find(j => j.id === old.id).summary, null);
    assert.equal(view.jobs.find(j => j.id === old.id).attempts[0].status, 'cancelled');
    assert.deepEqual(view.jobs.find(j => j.id === job.id).summary.pixels, f.input.pixels);
    assert.equal(view.candidates.length, 1); assert.equal(view.candidates[0].requestId, job.id);
    assert.deepEqual((await f.controller.covers.resource(view.candidates[0].url)).data, f.bytes);
    const selected = await f.controller.selectCover({ contentId: f.content.id, candidateId: view.candidates[0].id, editToken: view.content.editToken });
    assert.equal(selected.selectedCandidateId, view.candidates[0].id); assert.equal(f.controller.binding.coverActionPending, null);
    await fs.writeFile(snapshot, 'corrupt snapshot');
  }
});
test('summary fallback preserves strict input integrity checks for execution', async t => {
  const f = await fixture(t), prepared = await f.start(), job = prepared.jobs[0], attemptId = job.activeAttemptId;
  const reference = { contentId: f.content.id, requestId: job.id, attemptId };
  const context = f.library.readCoverContext(f.content.id, job.id, attemptId), claim = { host: 'codex', readAssetHashes: context.inputs.map(i => i.assetHash) };
  f.library.claimCoverAttempt(f.content.id, job.id, attemptId, claim);
  await fs.writeFile(context.inputs[0].path, 'corrupt snapshot');
  assert.equal((await f.controller.readCover({ contentId: f.content.id })).jobs[0].summary, null);
  for (const op of ['coverContext', 'handoffContext']) await assert.rejects(f.worker.call(op, { binding: f.binding, reference }), { code: 'CORRUPT' });
  assert.throws(() => f.library.createCoverAttempt(f.content.id, job.id, { host: 'codex', reason: 'retry' }), { code: 'CORRUPT' });
  assert.throws(() => f.library.claimCoverAttempt(f.content.id, job.id, attemptId, claim), { code: 'CORRUPT' });
  await fs.writeFile(path.join(context.inbox, 'result.png'), f.bytes);
  await assert.rejects(f.library.commitCoverAttempt(f.content.id, job.id, attemptId, { libraryId: f.binding.libraryId, contentId: f.content.id, requestId: job.id, attemptId, requestHash: job.requestHash, resultId: randomUUID(), files: [{ name: 'result.png', sha256: hash(f.bytes) }] }), { code: 'CORRUPT' });
});
test('unexpected errors during summary loading still propagate', async t => {
  const f = await fixture(t), prepared = await f.start(), job = prepared.jobs[0];
  const context = f.library.readCoverContext(f.content.id, job.id, job.activeAttemptId);
  const unexpected = new TypeError('unexpected summary failure'), openSync = fsSync.openSync;
  t.mock.method(fsSync, 'openSync', function (file, ...args) {
    if (file === context.inputs[0].path) throw unexpected;
    return openSync(file, ...args);
  });
  await assert.rejects(f.controller.readCover({ contentId: f.content.id }), error => error.code === 'IO_ERROR' && error.cause === unexpected);
});
test('required main and worker gates seed, photos, cover, selection, cancellation and launch', async t => {
  const f = await fixture(t, 'required');
  for (const action of [() => f.controller.retryBuiltins(), () => f.controller.choosePhoto({ title: 'me', isOwnPhoto: true }), () => f.start(), () => f.controller.continueCover({ contentId: f.content.id, requestId: randomUUID(), attemptId: randomUUID() }), () => f.controller.selectCover({ contentId: f.content.id, candidateId: randomUUID(), editToken: f.content.editToken })]) await assert.rejects(action, { code: 'AUTH_NOT_CONFIGURED' });
  const fingerprint = f.library.inspectCoverInput(f.content.id, f.input, f.content.editToken);
  const pending = { input: f.input, fingerprint, requestMutationId: randomUUID(), attemptMutationId: randomUUID(), host: 'codex', requestId: null, requestHash: null, reason: 'initial' };
  const reference = { contentId: f.content.id, requestId: randomUUID(), attemptId: randomUUID() };
  for (const [op, args] of [['seed', {}], ['importPhoto', { pending: { source: f.source, expectedHash: f.asset.assetHash, mutationId: randomUUID(), title: 'me', originalName: 'x.png', isOwnPhoto: true } }], ['createCoverRequest', { pending }], ['createCoverAttempt', { pending }], ['handoffContext', { reference }], ['cancelCover', { reference, mutationId: randomUUID() }], ['selectCover', { contentId: f.content.id, candidateId: randomUUID(), editToken: f.content.editToken, mutationId: randomUUID() }]]) await assert.rejects(f.worker.call(op, { binding: f.binding, ...args }), { code: 'AUTH_NOT_CONFIGURED' });
  assert.equal(f.library.listPhotos().length, 0); assert.equal(f.library.readContent(f.content.id).coverJobs.length, 0); assert.equal(f.launches.length, 0); assert.equal(f.controller.binding.seedPending, undefined);
});
test('select/cancel durable action loss resumes same mutation, reads later selection and never rolls it back', async t => {
  const f = await fixture(t); f.input.count = 2;
  const prepared = await f.start(), job = prepared.jobs[0], attemptId = job.activeAttemptId;
  const context = f.library.readCoverContext(f.content.id, job.id, attemptId);
  f.library.claimCoverAttempt(f.content.id, job.id, attemptId, { host: 'codex', readAssetHashes: context.inputs.map(i => i.assetHash) });
  const other = await sharp({ create: { width: 8, height: 6, channels: 3, background: '#7744cc' } }).png().toBuffer();
  await fs.writeFile(path.join(context.inbox, 'a.png'), f.bytes); await fs.writeFile(path.join(context.inbox, 'b.png'), other);
  await f.library.commitCoverAttempt(f.content.id, job.id, attemptId, { libraryId: f.binding.libraryId, contentId: f.content.id, requestId: job.id, attemptId, requestHash: job.requestHash, resultId: randomUUID(), files: [{ name: 'a.png', sha256: hash(f.bytes) }, { name: 'b.png', sha256: hash(other) }] });
  let view = await f.controller.readCover({ contentId: f.content.id });
  const call = f.worker.call; let dropped = false;
  f.worker.call = async (op, args) => { const result = await call(op, args); if (op === 'selectCover' && !dropped) { dropped = true; throw Object.assign(new Error('lost ack'), { code: 'WORKER_EXIT' }); } return result; };
  await assert.rejects(f.controller.selectCover({ contentId: f.content.id, candidateId: view.candidates[0].id, editToken: view.content.editToken }), { code: 'WORKER_EXIT' });
  const pending = f.controller.binding.coverActionPending; assert.ok(pending); assert.equal(f.library.queryMutation(pending.mutationId).objectId, f.content.id);
  await assert.rejects(f.controller.createContent({ title: 'blocked', body: '' }), { code: 'PENDING_MUTATION' });
  let current = f.library.readContent(f.content.id); f.library.selectContentCover(current.id, view.candidates[1].id, current.editToken);
  const reopened = f.make(); await reopened.initialize(); view = await reopened.resumeCoverAction(); assert.equal(view.selectedCandidateId, view.candidates[1].id); assert.equal(reopened.binding.coverActionPending, null);
  const retry = await reopened.retryCover({ contentId: f.content.id, requestId: job.id, attemptId });
  const reference = { contentId: f.content.id, requestId: job.id, attemptId: retry.jobs[0].activeAttemptId };
  f.worker.call = async (op, args) => { const result = await call(op, args); if (op === 'cancelCover') throw Object.assign(new Error('lost cancel ack'), { code: 'WORKER_EXIT' }); return result; };
  await assert.rejects(reopened.cancelCover(reference), { code: 'WORKER_EXIT' });
  const cancel = reopened.binding.coverActionPending; const next = f.make(); await next.initialize(); view = await next.resumeCoverAction();
  assert.equal(view.jobs[0].attempts.find(a => a.attemptId === reference.attemptId).status, 'cancelled'); assert.ok(f.library.queryMutation(cancel.mutationId)); assert.equal(next.binding.coverActionPending, null);
  // A pre-dispatch loss explicitly retries only the captured ID and expected token.
  dropped = false; f.worker.call = async (op, args) => { if (op === 'selectCover' && !dropped) { dropped = true; throw Object.assign(new Error('before select'), { code: 'WORKER_EXIT' }); } return call(op, args); };
  await assert.rejects(next.selectCover({ contentId: f.content.id, candidateId: view.candidates[0].id, editToken: view.content.editToken }), { code: 'WORKER_EXIT' });
  const fixed = next.binding.coverActionPending; assert.equal(f.library.queryMutation(fixed.mutationId), null);
  const last = f.make(); await last.initialize(); assert.equal((await last.resumeCoverAction()).selectedCandidateId, view.candidates[0].id); assert.ok(f.library.queryMutation(fixed.mutationId));
});
