import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync, spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { createLibrary, openLibrary, upgradeLibrary, __testing } from '../index.mjs';
import { validateImage } from '../../image-validation/index.mjs';
process.env.NODE_ENV = 'test';
const digest = value => createHash('sha256').update(value).digest('hex');
const rejects = (code, callback) => assert.rejects(callback, error => error.code === code);
const throws = (code, callback) => assert.throws(callback, error => error.code === code);
const image = (color = 'red', width = 8, height = 6, format = 'png') => sharp({ create: { width, height, channels: 3, background: color } })[format]().toBuffer();
async function fixture(t, count = 2) {
  const parent = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'nova-cover-'));
  const root = path.join(parent, 'library');
  t.after(() => { __testing.setHook(undefined); fs.rmSync(parent, { recursive: true, force: true }); });
  const lib = createLibrary(root);
  const styleBytes = await image();
  const source = path.join(parent, 'sample.png'); fs.writeFileSync(source, styleBytes);
  const style = lib.importAsset(source, { purpose: 'template-reference' });
  const secondSource = path.join(parent, 'other.png'); fs.writeFileSync(secondSource, await image('blue'));
  const second = lib.importAsset(secondSource, { purpose: 'template-reference' });
  const template = lib.createTemplate({ name: 'template', definition: { accepted: false }, resources: { a: { assetHash: style.assetHash, bytes: style.bytes, detectedType: style.detectedType, role: 'style' }, b: { assetHash: second.assetHash, bytes: second.bytes, detectedType: second.detectedType, role: 'style' } } });
  let content = lib.createContent({ title: 'Fixed title', body: '# original\r\n' });
  const input = { template: { id: template.id, version: 1 }, styleAssetHashes: [style.assetHash, second.assetHash], photo: null, materialIds: [], prompt: 'Make a cover without any person', pixels: { width: 8, height: 6 }, ratio: '4:3', count, outputFormat: 'png', scope: 'cover-only' };
  const created = lib.createCoverRequest(content.id, input, content.editToken); content = created.content;
  const request = created.request;
  const started = lib.createCoverAttempt(content.id, request.requestId, { host: 'codex' });
  const attemptId = started.attempt.attemptId;
  const context = lib.readCoverContext(content.id, request.requestId, attemptId);
  const claim = () => lib.claimCoverAttempt(content.id, request.requestId, attemptId, { host: 'codex', readAssetHashes: [...new Set(context.inputs.map(entry => entry.assetHash))] });
  const receipt = async (colors = ['green', 'yellow']) => {
    const files = [];
    for (let index = 0; index < colors.length; index++) {
      const bytes = await image(colors[index]); const name = `result-${index}.png`; fs.writeFileSync(path.join(context.inbox, name), bytes); files.push({ name, sha256: digest(bytes) });
    }
    return { libraryId: lib.info.libraryId, contentId: content.id, requestId: request.requestId, attemptId, requestHash: request.requestHash, resultId: randomUUID(), files };
  };
  const commit = value => lib.commitCoverAttempt(content.id, request.requestId, attemptId, value);
  return { parent, root, lib, content, input, request, attemptId, context, claim, receipt, commit, style };
}

test('fixed packages, explicit claim and whole batch commit retain candidate selection as a manual step', async t => {
  const f = await fixture(t); const current = f.lib.readContent(f.content.id);
  assert.equal(current.schemaVersion, 4); assert.equal(f.lib.info.schemaVersion, 5);
  assert.equal(f.request.photo, null); assert.equal(f.context.body, '# original\r\n'); assert.equal(f.context.inputs.length, 2);
  for (const input of f.context.inputs) assert.equal(digest(fs.readFileSync(input.path)), input.assetHash);
  assert.equal(f.context.attempt.status, 'created');
  const original = await f.receipt(); await rejects('ATTEMPT_NOT_CLAIMED', () => f.commit(original));
  f.claim(); const done = await f.commit(original);
  assert.equal(done.attempt.status, 'committed'); assert.equal(done.candidateIds.length, 2); assert.equal(done.content.selectedCover, null);
  assert.ok(done.content.candidates.every(entry => entry.accepted === false));
  const dir = path.join(f.root, '内容', f.content.id, '封面任务', f.request.requestId, '尝试', f.attemptId, '收件', done.attempt.receiptHash);
  const report = JSON.parse(fs.readFileSync(path.join(dir, '校验报告.json')));
  assert.equal(report.decoded, true); assert.equal(report.quality, 'pending-human-review'); assert.equal(report.files[0].width, 8);
  for (const file of original.files) fs.unlinkSync(path.join(f.context.inbox, file.name));
  assert.deepEqual((await f.commit(original)).candidateIds, done.candidateIds);
  await rejects('RECEIPT_CONFLICT', () => f.commit({ ...original, resultId: randomUUID() }));
  const selected = f.lib.selectContentCover(f.content.id, done.candidateIds[0], done.content.editToken);
  const retry = f.lib.createCoverAttempt(f.content.id, f.request.requestId, { host: 'workbuddy', reason: 'try another host' });
  assert.equal(retry.content.selectedCover.candidateId, selected.selectedCover.candidateId); assert.equal(retry.content.candidates.length, 2);
  assert.equal(openLibrary(f.root).readContent(f.content.id).coverJobs[0].attempts.length, 2);
});

test('request requires explicit identity choice, selected version style samples and matching exact pixels', async t => {
  const f = await fixture(t); const current = f.lib.readContent(f.content.id);
  for (const bad of [ { photo: undefined }, { styleAssetHashes: ['0'.repeat(64)] }, { pixels: { width: 0, height: 6 } }, { pixels: { width: 8, height: 5 } }, { ratio: '' }, { count: 0 }, { count: 21 }, { scope: 'all' }, { outputFormat: 'gif' } ]) throws('INVALID_INPUT', () => f.lib.createCoverRequest(current.id, { ...f.input, ...bad }, current.editToken));
  const notOwn = f.lib.createPhoto({ title: 'template person', assetHash: f.style.assetHash, isOwnPhoto: false });
  throws('INVALID_INPUT', () => f.lib.createCoverRequest(current.id, { ...f.input, photo: { id: notOwn.id, assetHash: notOwn.assetHash } }, current.editToken));
  const own = f.lib.createPhoto({ title: 'me', assetHash: f.style.assetHash, isOwnPhoto: true });
  const photoRequest = f.lib.createCoverRequest(current.id, { ...f.input, photo: { id: own.id, assetHash: own.assetHash } }, current.editToken);
  assert.equal(photoRequest.request.photo.id, own.id); assert.equal(photoRequest.content.coverJobs[0].attempts[0].status, 'created');
});

test('same fixed input reuses request; changing input makes a new request; task metadata revisions do not make content stale', async t => {
  const f = await fixture(t); const current = f.lib.readContent(f.content.id);
  const repeated = f.lib.createCoverRequest(current.id, f.input, current.editToken);
  assert.equal(repeated.request.requestId, f.request.requestId); assert.equal(repeated.content.revision, current.revision);
  const changed = f.lib.createCoverRequest(current.id, { ...f.input, prompt: 'different prompt' }, current.editToken);
  assert.notEqual(changed.request.requestId, f.request.requestId);
  assert.equal(changed.content.coverJobs[0].attempts[0].status, 'created');
  const next = f.lib.createCoverAttempt(current.id, changed.request.requestId, { host: 'workbuddy' });
  const context = f.lib.readCoverContext(current.id, changed.request.requestId, next.attempt.attemptId);
  const claim = f.lib.claimCoverAttempt(current.id, changed.request.requestId, next.attempt.attemptId, { host: 'workbuddy', readAssetHashes: context.inputs.map(input => input.assetHash) });
  assert.equal(claim.attempt.status, 'claimed');
});

const fingerprint = prepared => ({ inputHash: prepared.inputHash, title: prepared.title, bodyHash: prepared.bodyHash });

test('read-only preparation finds an older reused request after a different request without writing a receipt', async t => {
  const f = await fixture(t), current = f.lib.readContent(f.content.id);
  const b = f.lib.createCoverRequest(current.id, { ...f.input, prompt: 'second request' }, current.editToken);
  const history = path.join(f.root, '系统（别动）', '事务', '已提交'), before = fs.readdirSync(history);
  const prepared = f.lib.inspectCoverInput(current.id, f.input, b.content.editToken);
  assert.deepEqual(prepared.existingRequest, { requestId: f.request.requestId, requestHash: f.request.requestHash });
  assert.equal(prepared.contentId, current.id); assert.equal(prepared.title, current.title);
  assert.equal(prepared.bodyHash, digest(Buffer.from('# original\r\n'))); assert.equal(prepared.editToken, b.content.editToken);
  const mutationId = randomUUID(), reused = f.lib.createCoverRequest(current.id, f.input, b.content.editToken, { mutationId });
  assert.equal(reused.request.requestId, f.request.requestId);
  const found = f.lib.findCoverRequest(current.id, fingerprint(prepared));
  assert.equal(found.request.requestId, f.request.requestId); assert.deepEqual(found.content, f.lib.readContent(current.id));
  assert.equal(found.content.editToken, b.content.editToken);
  assert.equal(found.bodyBytes.toString(), '# original\r\n'); assert.deepEqual(fs.readdirSync(history), before);
  assert.equal(fs.existsSync(path.join(history, mutationId)), false);
});

test('prepared fingerprint finds a newly committed request after its response is lost and recovery runs', async t => {
  const f = await fixture(t), current = f.lib.readContent(f.content.id), raw = { ...f.input, prompt: 'prepared new request' };
  const prepared = f.lib.inspectCoverInput(current.id, raw, current.editToken);
  assert.equal(prepared.existingRequest, null); assert.equal(f.lib.findCoverRequest(current.id, fingerprint(prepared)), null);
  let thrown = false;
  __testing.setHook(event => { if (event.phase === 'afterCommit' && !thrown) { thrown = true; throw Object.assign(new Error('lost response'), { code: 'EIO' }); } });
  throws('IO_ERROR', () => f.lib.createCoverRequest(current.id, raw, prepared.editToken, { mutationId: randomUUID() }));
  __testing.setHook(undefined);
  const found = f.lib.findCoverRequest(current.id, fingerprint(prepared));
  assert.equal(found.request.inputHash, prepared.inputHash); assert.equal(found.request.prompt, raw.prompt);
  assert.equal(found.content.coverJobs.length, current.coverJobs.length + 1);
  assert.equal(openLibrary(f.root).findCoverRequest(current.id, fingerprint(prepared)).request.requestId, found.request.requestId);
});

test('prepared lookup tolerates metadata token changes and returns the latest content projection', async t => {
  const f = await fixture(t), current = f.lib.readContent(f.content.id);
  const prepared = f.lib.inspectCoverInput(current.id, f.input, current.editToken);
  const updated = f.lib.attachContentMaterial(current.id, { assetHash: f.style.assetHash, originalName: 'later.png' }, current.editToken);
  assert.notEqual(updated.editToken, prepared.editToken);
  throws('CONFLICT', () => f.lib.inspectCoverInput(current.id, f.input, prepared.editToken));
  const found = f.lib.findCoverRequest(current.id, fingerprint(prepared));
  assert.equal(found.request.requestId, prepared.existingRequest.requestId); assert.deepEqual(found.content, f.lib.readContent(current.id));
  assert.equal(found.content.editToken, updated.editToken); assert.equal(found.content.materials.length, 1);
});

for (const patch of [{ title: 'Changed title' }, { body: '# original\n' }]) test(`prepared lookup rejects changed ${Object.keys(patch)[0]} before reporting an absent request`, async t => {
  const f = await fixture(t), current = f.lib.readContent(f.content.id), prepared = f.lib.inspectCoverInput(current.id, f.input, current.editToken);
  f.lib.updateContent(current.id, patch, current.editToken);
  throws('STALE_INPUT', () => f.lib.findCoverRequest(current.id, fingerprint(prepared)));
  throws('STALE_INPUT', () => f.lib.findCoverRequest(current.id, { ...fingerprint(prepared), inputHash: '0'.repeat(64) }));
});

test('preparation validates exact selected inputs and lookup accepts only its finite fingerprint fields', async t => {
  const f = await fixture(t), current = f.lib.readContent(f.content.id), prepared = f.lib.inspectCoverInput(current.id, f.input, current.editToken);
  for (const bad of [{ photo: undefined }, { styleAssetHashes: ['0'.repeat(64)] }, { template: { id: f.input.template.id, version: 99 } }, { materialIds: [randomUUID()] }, { count: 0 }, { scope: 'all' }]) {
    throws('INVALID_INPUT', () => f.lib.inspectCoverInput(current.id, { ...f.input, ...bad }, current.editToken));
  }
  for (const bad of [null, {}, { ...fingerprint(prepared), inputHash: 'bad' }, { ...fingerprint(prepared), bodyHash: null }, { ...fingerprint(prepared), title: '' }, prepared]) {
    throws('INVALID_INPUT', () => f.lib.findCoverRequest(current.id, bad));
  }
  throws('STALE_INPUT', () => f.lib.findCoverRequest(current.id, { ...fingerprint(prepared), bodyHash: '0'.repeat(64) }));
  throws('STALE_INPUT', () => f.lib.findCoverRequest(current.id, { ...fingerprint(prepared), title: 'wrong captured title' }));
  assert.equal(f.lib.findCoverRequest(current.id, { ...fingerprint(prepared), inputHash: '0'.repeat(64) }), null);
});

test('both read-only cover methods reject damaged fixed packages and replaced library roots', async t => {
  const f = await fixture(t), current = f.lib.readContent(f.content.id), prepared = f.lib.inspectCoverInput(current.id, f.input, current.editToken);
  const requestFile = path.join(f.root, '内容', current.id, '封面任务', f.request.requestId, '请求.json'), bytes = fs.readFileSync(requestFile);
  fs.writeFileSync(requestFile, 'damaged');
  throws('CORRUPT', () => f.lib.inspectCoverInput(current.id, f.input, current.editToken));
  throws('CORRUPT', () => f.lib.findCoverRequest(current.id, fingerprint(prepared)));
  fs.writeFileSync(requestFile, bytes);
  fs.renameSync(f.root, `${f.root}-original`); fs.cpSync(`${f.root}-original`, f.root, { recursive: true });
  throws('CONFLICT', () => f.lib.inspectCoverInput(current.id, f.input, current.editToken));
  throws('CONFLICT', () => f.lib.findCoverRequest(current.id, fingerprint(prepared)));
  assert.equal(openLibrary(f.root).findCoverRequest(current.id, fingerprint(prepared)).request.requestId, f.request.requestId);
});

test('host claim must match immutable input set and assigned host', async t => {
  const f = await fixture(t);
  throws('INVALID_INPUT', () => f.lib.claimCoverAttempt(f.content.id, f.request.requestId, f.attemptId, { host: 'workbuddy', readAssetHashes: [] }));
  throws('INVALID_INPUT', () => f.lib.claimCoverAttempt(f.content.id, f.request.requestId, f.attemptId, { host: 'codex', readAssetHashes: [f.style.assetHash] }));
  fs.writeFileSync(f.context.inputs[0].path, 'changed'); throws('CORRUPT', () => f.claim());
});

for (const scenario of ['missing', 'extra', 'broken', 'truncated', 'dimensions', 'format', 'duplicate', 'hash']) test(`whole batch rejects ${scenario} without partial candidates`, async t => {
  const f = await fixture(t); f.claim(); let receipt = await f.receipt();
  if (scenario === 'missing') receipt.files.pop();
  if (scenario === 'extra') receipt.files.push({ name: 'third.png', sha256: f.style.assetHash });
  if (['broken', 'truncated', 'dimensions', 'format'].includes(scenario)) {
    let bytes = scenario === 'broken' ? Buffer.from('not image') : scenario === 'truncated' ? (await image()).subarray(0, 45) : scenario === 'format' ? await image('red', 8, 6, 'jpeg') : await image('red', 9, 6);
    fs.writeFileSync(path.join(f.context.inbox, receipt.files[1].name), bytes); receipt.files[1].sha256 = digest(bytes);
  }
  if (scenario === 'duplicate') { const bytes = fs.readFileSync(path.join(f.context.inbox, receipt.files[0].name)); fs.writeFileSync(path.join(f.context.inbox, receipt.files[1].name), bytes); receipt.files[1].sha256 = receipt.files[0].sha256; }
  if (scenario === 'hash') receipt.files[1].sha256 = '0'.repeat(64);
  const code = { missing: 'IMAGE_COUNT_MISMATCH', extra: 'IMAGE_COUNT_MISMATCH', broken: 'INVALID_IMAGE', truncated: 'INVALID_IMAGE', dimensions: 'IMAGE_DIMENSIONS_MISMATCH', format: 'IMAGE_FORMAT_MISMATCH', duplicate: 'DUPLICATE_IMAGE', hash: 'IMAGE_HASH_MISMATCH' }[scenario];
  await rejects(code, () => f.commit(receipt));
  const current = openLibrary(f.root).readContent(f.content.id); assert.equal(current.candidates.length, 0); assert.equal(current.coverJobs[0].attempts[0].status, 'claimed');
});

for (const name of ['../outside.png', '/tmp/image.png', 'https://example.test/image.png', 'C:\\image.png', '..\\image.png', 'CON.png', 'result.png ']) test(`receipt refuses unsafe basename ${name}`, async t => {
  const f = await fixture(t); f.claim(); const receipt = await f.receipt(); receipt.files[0].name = name;
  await rejects('UNSAFE_PATH', () => f.commit(receipt));
});

test('receipt refuses unknown fields and symlink inbox files and ancestors', async t => {
  const f = await fixture(t); f.claim(); const receipt = await f.receipt();
  await rejects('INVALID_INPUT', () => f.commit({ ...receipt, decoded: true }));
  const filename = path.join(f.context.inbox, receipt.files[0].name); fs.unlinkSync(filename); fs.symlinkSync(path.join(f.parent, 'sample.png'), filename);
  await rejects('UNSAFE_PATH', () => f.commit(receipt));
});

for (const change of ['body', 'title', 'retry', 'cancel', 'fail', 'trash']) test(`in-flight decode rechecks ${change} before atomic registration`, async t => {
  const f = await fixture(t); f.claim(); const receipt = await f.receipt();
  let changed = false;
  __testing.setHook(event => {
    if (event.phase !== 'coverAfterDecode' || changed) return; changed = true;
    const current = f.lib.readContent(f.content.id);
    if (change === 'body') fs.writeFileSync(path.join(f.root, '内容', current.id, '正文.md'), 'external body');
    if (change === 'title') f.lib.updateContent(current.id, { title: 'new title' }, current.editToken);
    if (change === 'retry') f.lib.createCoverAttempt(current.id, f.request.requestId, { host: 'workbuddy' });
    if (change === 'cancel') f.lib.cancelCoverAttempt(current.id, f.request.requestId, f.attemptId);
    if (change === 'fail') f.lib.failCoverAttempt(current.id, f.request.requestId, f.attemptId, { code: 'HOST_FAILED', message: 'Provider failed' });
    if (change === 'trash') f.lib.trashContent(current.id, current.editToken);
  });
  await rejects(['body', 'title'].includes(change) ? 'STALE_INPUT' : change === 'trash' ? 'INVALID_STATE' : 'ATTEMPT_INACTIVE', () => f.commit(receipt));
  __testing.setHook(undefined); const current = f.lib.readContent(f.content.id); assert.equal(current.candidates.length, 0);
  const evidenceDir = path.join(f.root, '内容', current.id, '封面任务', f.request.requestId, '尝试', f.attemptId, '收件'); assert.ok(fs.readdirSync(evidenceDir).length > 0);
});

test('replacement after stable capture cannot change the bytes being decoded or registered', async t => {
  const f = await fixture(t); f.claim(); const receipt = await f.receipt();
  __testing.setHook(event => { if (event.phase === 'coverBeforeDecode') fs.writeFileSync(path.join(f.context.inbox, receipt.files[event.index].name), 'replaced'); });
  const done = await f.commit(receipt); __testing.setHook(undefined);
  assert.deepEqual(done.content.candidates.map(item => item.assetHash), receipt.files.map(file => file.sha256));
});

test('asset installation before SIGKILL leaves no candidate fact; retry reuses evidence and commits exactly once', async t => {
  const f = await fixture(t); f.claim(); const receipt = await f.receipt();
  const moduleURL = new URL('../index.mjs', import.meta.url).href;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `import{openLibrary,__testing}from ${JSON.stringify(moduleURL)};const x=JSON.parse(process.env.COVER_TASK);__testing.setHook(e=>{if(e.phase==='coverAfterAssetsInstalled')process.kill(process.pid,'SIGKILL')});await openLibrary(x.root).commitCoverAttempt(x.contentId,x.requestId,x.attemptId,x.receipt);`], { env: { ...process.env, NODE_ENV: 'test', COVER_TASK: JSON.stringify({ root: f.root, contentId: f.content.id, requestId: f.request.requestId, attemptId: f.attemptId, receipt }) }, encoding: 'utf8', timeout: 15000 });
  assert.equal(child.signal, 'SIGKILL', child.stderr);
  assert.equal(openLibrary(f.root).readContent(f.content.id).candidates.length, 0);
  const done = await f.commit(receipt); assert.equal(done.candidateIds.length, 2); assert.equal((await f.commit(receipt)).content.candidates.length, 2);
});

test('image decoder verifies EXIF display dimensions, rejects truncation and animation, and never edits source bytes', async () => {
  const jpeg = await sharp({ create: { width: 8, height: 6, channels: 3, background: 'red' } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const before = Buffer.from(jpeg); const decoded = await validateImage(jpeg);
  assert.equal(decoded.width, 6); assert.equal(decoded.height, 8); assert.equal(decoded.format, 'jpeg'); assert.equal(decoded.decoded, true); assert.deepEqual(jpeg, before);
  await rejects('INVALID_IMAGE', () => validateImage(jpeg.subarray(0, jpeg.length - 20)));
  const header = Buffer.from('47494638396101000100800000000000ffffff', 'hex');
  const frame = Buffer.from('21f90400000000002c0000000001000100000202440100', 'hex');
  const animated = await sharp(Buffer.concat([header, frame, Buffer.from('21f90400000000002c00000000010001000002024c0100', 'hex'), Buffer.from([0x3b])]), { animated: true }).webp().toBuffer();
  assert.equal((await sharp(animated, { animated: true }).metadata()).pages, 2);
  await rejects('INVALID_IMAGE', () => validateImage(animated));
});

test('explicit schema-3 upgrade preserves historical bytes and erects an old-writer barrier', async t => {
  const f = await fixture(t); const descriptor = path.join(f.root, '内容库.json'); const info = JSON.parse(fs.readFileSync(descriptor));
  fs.writeFileSync(descriptor, JSON.stringify({ ...info, schemaVersion: 3 }));
  const original = fs.readFileSync(descriptor); throws('UPGRADE_REQUIRED', () => openLibrary(f.root)); assert.deepEqual(fs.readFileSync(descriptor), original);
  const upgraded = upgradeLibrary(f.root); assert.equal(upgraded.info.schemaVersion, 5); assert.equal(upgraded.readContent(f.content.id).body, f.content.body);
  assert.deepEqual(fs.readFileSync(path.join(f.root, '系统（别动）', '内容库.schema3.bak.json')), original);
  assert.ok(fs.existsSync(path.join(f.root, '系统（别动）', '事务', '升级到4', '完成.json')));
});

for (const phase of ['afterFile', 'beforeArchive']) test(`SIGKILL at ${phase} recovers one committed result batch and accepts receipt retry`, async t => {
  const f = await fixture(t); f.claim(); const receipt = await f.receipt();
  const moduleURL = new URL('../index.mjs', import.meta.url).href;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `import{openLibrary,__testing}from ${JSON.stringify(moduleURL)};const x=JSON.parse(process.env.COVER_TASK);__testing.setHook(e=>{if(e.phase===x.phase)process.kill(process.pid,'SIGKILL')});await openLibrary(x.root).commitCoverAttempt(x.contentId,x.requestId,x.attemptId,x.receipt);`], { env: { ...process.env, NODE_ENV: 'test', COVER_TASK: JSON.stringify({ root: f.root, contentId: f.content.id, requestId: f.request.requestId, attemptId: f.attemptId, receipt, phase }) }, encoding: 'utf8', timeout: 15000 });
  assert.equal(child.signal, 'SIGKILL', child.stderr);
  const current = openLibrary(f.root).readContent(f.content.id); assert.equal(current.candidates.length, 2);
  assert.deepEqual((await f.commit(receipt)).candidateIds, current.coverJobs[0].attempts[0].candidateIds);
});

for (const phase of ['upgrade4AfterBackup', 'upgrade4AfterBarrier', 'upgrade4BeforeDescriptorPublish', 'upgrade4AfterDescriptorPublish']) test(`schema4 upgrade reenters after ${phase}`, async t => {
  const f = await fixture(t); const filename = path.join(f.root, '内容库.json'); const info = JSON.parse(fs.readFileSync(filename)); fs.writeFileSync(filename, JSON.stringify({ ...info, schemaVersion: 3 }));
  __testing.setHook(event => { if (event.phase === phase) throw new Error('interrupted upgrade'); });
  throws('IO_ERROR', () => upgradeLibrary(f.root)); __testing.setHook(undefined);
  const current = upgradeLibrary(f.root); assert.equal(current.info.schemaVersion, 5); assert.equal(current.readContent(f.content.id).coverJobs[0].id, f.request.requestId);
});

test('the actual previous schema3 implementation refuses schema4 and refuses the added barrier after descriptor rollback', async t => {
  const f = await fixture(t);
  const oldSource = spawnSync('git', ['show', '39dda17:file-library/index.mjs'], { cwd: new URL('../..', import.meta.url), encoding: 'utf8' }); assert.equal(oldSource.status, 0, oldSource.stderr);
  const oldFile = path.join(f.parent, 'old-schema3.mjs'); fs.writeFileSync(oldFile, oldSource.stdout);
  const run = () => spawnSync(process.execPath, ['--input-type=module', '-e', `import{openLibrary}from ${JSON.stringify(pathToFileURL(oldFile).href)};try{openLibrary(process.env.COVER_ROOT);process.exitCode=9}catch(e){console.log(e.code)}`], { env: { ...process.env, COVER_ROOT: f.root }, encoding: 'utf8', timeout: 10000 });
  const unsupported = run(); assert.equal(unsupported.status, 0, unsupported.stderr); assert.match(unsupported.stdout, /FORMAT_UNSUPPORTED/);
  const filename = path.join(f.root, '内容库.json'), info = JSON.parse(fs.readFileSync(filename)); fs.writeFileSync(filename, JSON.stringify({ ...info, schemaVersion: 3 })); upgradeLibrary(f.root);
  fs.writeFileSync(filename, JSON.stringify({ ...info, schemaVersion: 3 })); const barrier = run(); assert.equal(barrier.status, 0, barrier.stderr); assert.match(barrier.stdout, /CORRUPT/);
});

test('decoder missing from a packaged runtime fails explicitly without a header-only fallback', async t => {
  const parent = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'nova-decoder-')); t.after(() => fs.rmSync(parent, { force: true, recursive: true }));
  const loader = path.join(parent, 'missing-sharp.mjs'); fs.writeFileSync(loader, "export async function resolve(specifier,context,next){if(specifier==='sharp')throw new Error('deliberately absent decoder');return next(specifier,context)}");
  const bytes = await image(); const moduleURL = new URL('../../image-validation/index.mjs', import.meta.url).href;
  const child = spawnSync(process.execPath, ['--experimental-loader', loader, '--input-type=module', '-e', `import{validateImage}from ${JSON.stringify(moduleURL)};try{await validateImage(Buffer.from(process.env.COVER_IMAGE,'base64'));process.exitCode=9}catch(e){console.log(e.code)}`], { env: { ...process.env, COVER_IMAGE: bytes.toString('base64') }, encoding: 'utf8', timeout: 10000 });
  assert.equal(child.status, 0, child.stderr); assert.match(child.stdout, /DECODER_UNAVAILABLE/);
});

test('the same captured bytes are rejected for APNG animation and the pixel cap before any candidate registration', async () => {
  const png = await image();
  const animation = Buffer.alloc(20); animation.writeUInt32BE(8, 0); animation.write('acTL', 4); animation.writeUInt32BE(2, 8);
  await rejects('INVALID_IMAGE', () => validateImage(Buffer.concat([png.subarray(0, 33), animation, png.subarray(33)])));
  const hugeHeader = Buffer.from(png); hugeHeader.writeUInt32BE(50_000, 16); hugeHeader.writeUInt32BE(50_000, 20);
  await rejects('INVALID_IMAGE', () => validateImage(hugeHeader));
});

test('moving and replacing the bound root during decode cannot commit into a different library', async t => {
  const f = await fixture(t); f.claim(); const receipt = await f.receipt(); let moved = false;
  __testing.setHook(event => { if (event.phase !== 'coverAfterDecode' || moved) return; moved = true; fs.renameSync(f.root, `${f.root}-moved`); createLibrary(f.root); });
  await rejects('CONFLICT', () => f.commit(receipt)); __testing.setHook(undefined);
  assert.equal(openLibrary(f.root).listContents().length, 0); assert.equal(openLibrary(`${f.root}-moved`).readContent(f.content.id).candidates.length, 0);
});

for (const same of [true, false]) test(`two independent processes submitting ${same ? 'same' : 'different'} receipts cannot double-register`, async t => {
  const f = await fixture(t); f.claim(); const first = await f.receipt(); const second = same ? first : { ...first, resultId: randomUUID() };
  const moduleURL = new URL('../index.mjs', import.meta.url).href;
  const script = `import{openLibrary}from ${JSON.stringify(moduleURL)};const x=JSON.parse(process.env.COVER_TASK);const deadline=Date.now()+30000;let finished=false;while(Date.now()<deadline){try{const r=await openLibrary(x.root).commitCoverAttempt(x.contentId,x.requestId,x.attemptId,x.receipt);console.log(JSON.stringify({status:'committed',ids:r.candidateIds}));finished=true;break}catch(e){if(['BUSY','LOCK_UNCERTAIN'].includes(e.code)){await new Promise(r=>setTimeout(r,20));continue}console.log(JSON.stringify({status:e.code,message:e.message}));finished=true;break}}if(!finished)throw Error('receipt submission timed out waiting for library lock after 30000ms');`;
  const run = receipt => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, COVER_TASK: JSON.stringify({ root: f.root, contentId: f.content.id, requestId: f.request.requestId, attemptId: f.attemptId, receipt }) }, stdio: ['ignore', 'pipe', 'pipe'], timeout: 45000, killSignal: 'SIGKILL' });
    let stdout = '', stderr = '', spawnError; child.stdout.on('data', data => stdout += data); child.stderr.on('data', data => stderr += data); child.on('error', error => { spawnError = error; }); child.on('close', (status, signal) => spawnError ? reject(spawnError) : resolve({ status, signal, stdout, stderr }));
  });
  const settled = await Promise.allSettled([run(first), run(second)]);
  for (const result of settled) assert.equal(result.status, 'fulfilled', String(result.reason));
  const outputs = settled.map(result => result.value);
  for (const output of outputs) assert.equal(output.status, 0, JSON.stringify(output));
  const parsed = outputs.map(output => {
    let value;
    assert.doesNotThrow(() => { value = JSON.parse(output.stdout); }, `invalid child JSON: ${JSON.stringify(output)}`);
    return value;
  });
  assert.deepEqual(parsed.map(item => item.status).sort(), same ? ['committed', 'committed'] : ['RECEIPT_CONFLICT', 'committed']);
  if (same) assert.deepEqual(parsed[0].ids, parsed[1].ids);
  assert.equal(openLibrary(f.root).readContent(f.content.id).candidates.length, 2);
});

test('the established twenty-image batch is supported without reducing the product count contract', async t => {
  const f = await fixture(t, 20); f.claim(); const receipt = await f.receipt(Array.from({ length: 20 }, (_, index) => `rgb(${index * 10},20,100)`));
  const done = await f.commit(receipt); assert.equal(done.candidateIds.length, 20); assert.equal(new Set(done.content.candidates.map(item => item.assetHash)).size, 20);
});

test('request and attempt mutationIds replay their historical result after later content and task edits', async t => {
  const f = await fixture(t); const first = f.lib.readContent(f.content.id), mutationId = randomUUID();
  const input = { ...f.input, prompt: 'a new fixed prompt' };
  const created = f.lib.createCoverRequest(first.id, input, first.editToken, { mutationId });
  const attemptMutation = randomUUID(), attempt = f.lib.createCoverAttempt(first.id, created.request.requestId, { host: 'workbuddy' }, { mutationId: attemptMutation });
  f.lib.createCoverAttempt(first.id, created.request.requestId, { host: 'codex' });
  const current = f.lib.readContent(first.id); f.lib.updateContent(first.id, { body: 'later draft' }, current.editToken);
  const replayed = f.lib.createCoverRequest(first.id, input, first.editToken, { mutationId }); assert.deepEqual(replayed.content, created.content); assert.equal(replayed.request.requestId, created.request.requestId);
  const replayedAttempt = f.lib.createCoverAttempt(first.id, created.request.requestId, { host: 'workbuddy' }, { mutationId: attemptMutation }); assert.equal(replayedAttempt.attempt.attemptId, attempt.attempt.attemptId);
  throws('INVALID_INPUT', () => f.lib.createCoverRequest(first.id, { ...input, prompt: 'different' }, first.editToken, { mutationId }));
});

test('legacy manual candidate registration cannot bypass validation for a managed task', async t => {
  const f = await fixture(t); const current = f.lib.readContent(f.content.id);
  throws('INVALID_INPUT', () => f.lib.registerContentCandidate(current.id, { assetHash: f.style.assetHash, requestId: f.request.requestId, attemptId: f.attemptId }, current.editToken));
});

test('metadata-only updates during decoding are preserved without declaring title or body stale', async t => {
  const f = await fixture(t); f.claim(); const receipt = await f.receipt(); let changed = false;
  __testing.setHook(event => { if (event.phase !== 'coverAfterDecode' || changed) return; changed = true; const current = f.lib.readContent(f.content.id); f.lib.attachContentMaterial(current.id, { assetHash: f.style.assetHash, originalName: 'added-after-request.png' }, current.editToken); });
  const done = await f.commit(receipt); __testing.setHook(undefined); assert.equal(done.content.materials.length, 1); assert.equal(done.content.candidates.length, 2);
});

test('only explicitly selected style samples are materialized; structure resources are not silently sent', async t => {
  const f = await fixture(t); const svg = path.join(f.parent, 'structure.svg'); fs.writeFileSync(svg, '<svg xmlns="http://www.w3.org/2000/svg"/>'); const structure = f.lib.importAsset(svg, { purpose: 'template-structure' });
  const template = f.lib.createTemplate({ name: 'style and structure', definition: { instruction: 'fixed rule' }, resources: { style: { assetHash: f.style.assetHash, bytes: f.style.bytes, detectedType: f.style.detectedType, role: 'style' }, structure: { assetHash: structure.assetHash, bytes: structure.bytes, detectedType: structure.detectedType, role: 'structure' } } });
  const current = f.lib.readContent(f.content.id); const created = f.lib.createCoverRequest(current.id, { ...f.input, template: { id: template.id, version: 1 }, styleAssetHashes: [f.style.assetHash] }, current.editToken);
  const attempt = f.lib.createCoverAttempt(current.id, created.request.requestId, { host: 'codex' }); const context = f.lib.readCoverContext(current.id, created.request.requestId, attempt.attempt.attemptId);
  assert.equal(context.inputs.length, 1); assert.equal(context.inputs[0].assetHash, f.style.assetHash); assert.equal(context.request.templateDefinition.instruction, 'fixed rule');
});

for (const evidence of ['receipt', 'image']) test(`persistent ${evidence} tampering during decode is refused before registering references`, async t => {
  const f = await fixture(t); f.claim(); const receipt = await f.receipt(); const receiptHash = digest(Buffer.from(JSON.stringify(receipt, null, 2) + '\n')); let changed = false;
  __testing.setHook(event => { if (event.phase !== 'coverAfterDecode' || changed) return; changed = true; const target = path.join(f.root, '内容', f.content.id, '封面任务', f.request.requestId, '尝试', f.attemptId, '收件', receiptHash, evidence === 'receipt' ? '回执.json' : '图片-0'); fs.writeFileSync(target, 'tampered'); });
  await rejects('CONFLICT', () => f.commit(receipt)); __testing.setHook(undefined); assert.equal(f.lib.readContent(f.content.id).candidates.length, 0);
});

test('a same-libraryId cloned root cannot replace the directory bound to an open handle', async t => {
  const f = await fixture(t); f.claim(); const receipt = await f.receipt(); let changed = false;
  __testing.setHook(event => { if (event.phase !== 'coverAfterDecode' || changed) return; changed = true; fs.renameSync(f.root, `${f.root}-original`); fs.cpSync(`${f.root}-original`, f.root, { recursive: true }); });
  await rejects('CONFLICT', () => f.commit(receipt)); __testing.setHook(undefined);
  throws('CONFLICT', () => f.lib.readContent(f.content.id));
  assert.equal(openLibrary(f.root).readContent(f.content.id).candidates.length, 0); assert.equal(openLibrary(`${f.root}-original`).readContent(f.content.id).candidates.length, 0);
});

test('one content can run and commit two independent size requests without superseding each other', async t => {
  const f = await fixture(t); f.claim(); const receipt = await f.receipt(); const current = f.lib.readContent(f.content.id);
  const square = f.lib.createCoverRequest(current.id, { ...f.input, pixels: { width: 6, height: 6 }, ratio: '1:1', count: 1 }, current.editToken);
  const started = f.lib.createCoverAttempt(current.id, square.request.requestId, { host: 'workbuddy' });
  const context = f.lib.readCoverContext(current.id, square.request.requestId, started.attempt.attemptId);
  f.lib.claimCoverAttempt(current.id, square.request.requestId, started.attempt.attemptId, { host: 'workbuddy', readAssetHashes: [...new Set(context.inputs.map(item => item.assetHash))] });
  const two = f.lib.readContent(current.id); assert.equal(two.coverJobs.filter(job => job.activeAttemptId !== null).length, 2); assert.equal(two.coverJobs[0].attempts[0].status, 'claimed');
  const first = await f.commit(receipt); assert.equal(first.content.coverJobs[1].attempts[0].status, 'claimed');
  const bytes = await image('purple', 6, 6); fs.writeFileSync(path.join(context.inbox, 'square.png'), bytes);
  const second = await f.lib.commitCoverAttempt(current.id, square.request.requestId, started.attempt.attemptId, { libraryId: f.lib.info.libraryId, contentId: current.id, requestId: square.request.requestId, requestHash: square.request.requestHash, attemptId: started.attempt.attemptId, resultId: randomUUID(), files: [{ name: 'square.png', sha256: digest(bytes) }] });
  assert.equal(second.content.candidates.length, 3); assert.equal(second.content.selectedCover, null); assert.ok(second.content.coverJobs.every(job => job.activeAttemptId === null));
});

test('an already committed archival error never writes a contradictory rejected report', async t => {
  const f = await fixture(t); f.claim(); const receipt = await f.receipt(); let thrown = false;
  __testing.setHook(event => { if (event.phase === 'beforeArchive' && !thrown) { thrown = true; throw Object.assign(new Error('archive I/O failed'), { code: 'EIO' }); } });
  await assert.rejects(() => f.commit(receipt), error => error.code === 'IO_ERROR' && error.outcome === 'committed'); __testing.setHook(undefined);
  const current = openLibrary(f.root).readContent(f.content.id), attempt = current.coverJobs[0].attempts[0]; assert.equal(attempt.status, 'committed');
  const location = path.join(f.root, '内容', f.content.id, '封面任务', f.request.requestId, '尝试', f.attemptId, '收件', attempt.receiptHash); assert.ok(!fs.readdirSync(location).some(name => name.startsWith('拒绝-')));
  assert.deepEqual((await f.commit(receipt)).candidateIds, attempt.candidateIds);
});

test('host switches and retries retain their source attempt in the immutable handoff', async t => {
  const f = await fixture(t); assert.equal(f.context.handoff.sourceAttemptId, null);
  const second = f.lib.createCoverAttempt(f.content.id, f.request.requestId, { host: 'workbuddy', reason: 'switch host' }); assert.equal(second.handoff.sourceAttemptId, f.attemptId);
  f.lib.failCoverAttempt(f.content.id, f.request.requestId, second.attempt.attemptId, { code: 'PROVIDER', message: 'Host failed' });
  const third = f.lib.createCoverAttempt(f.content.id, f.request.requestId, { host: 'workbuddy', reason: 'retry' }); assert.equal(third.handoff.sourceAttemptId, second.attempt.attemptId);
  const context = f.lib.readCoverContext(f.content.id, f.request.requestId, third.attempt.attemptId); assert.equal(context.handoff.sourceAttemptId, second.attempt.attemptId);
  const handoffFile = path.join(f.root, '内容', f.content.id, '封面任务', f.request.requestId, '尝试', third.attempt.attemptId, '交接.json'); assert.equal(JSON.parse(fs.readFileSync(handoffFile)).sourceAttemptId, second.attempt.attemptId);
});
