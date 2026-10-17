import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { createLibrary, openLibrary, __testing } from '../index.mjs';

process.env.NODE_ENV = 'test';
const moduleURL = new URL('../index.mjs', import.meta.url).href;
const system = '系统（别动）';

function fixture(t) {
  const parent = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'nova-library-'));
  const root = path.join(parent, 'library');
  t.after(() => { __testing.setHook(undefined); fs.rmSync(parent, { recursive: true, force: true }); });
  return { parent, root, library: createLibrary(root) };
}
const contentFile = (root, item, name = '正文.md') => path.join(root, '内容', item.id, name);
const transactionRoot = root => path.join(root, system, '事务');
const transactions = root => path.join(transactionRoot(root), '已提交');
const pendingRoot = root => path.join(transactionRoot(root), '待恢复');
const transactionDir = (root, mutationId) => {
  const history = path.join(transactions(root), mutationId);
  return fs.existsSync(history) ? history : path.join(pendingRoot(root), mutationId);
};
const lockPath = root => path.join(root, system, '库锁');
function reject(code, fn) { assert.throws(fn, error => error.code === code); }
function child(script, data = {}) {
  return spawnSync(process.execPath, ['--input-type=module', '-e', `import {openLibrary,__testing} from ${JSON.stringify(moduleURL)}; ${script}`], {
    encoding: 'utf8', env: { ...process.env, NODE_ENV: 'test', TASK_DATA: JSON.stringify(data) }, timeout: 10000,
  });
}
function killDuring(root, item, phase, mutationId = randomUUID()) {
  const childResult = child(`
    const data=JSON.parse(process.env.TASK_DATA);
    const lib=openLibrary(data.root);
    __testing.setHook(event=> { if(event.phase===data.phase && (event.phase!=='afterFile'||event.index===0)) process.kill(process.pid,'SIGKILL'); });
    lib.updateContent(data.item.id,{title:'after title',body:'after body'},data.item.editToken,{mutationId:data.mutationId});
  `, { root, item, phase, mutationId });
  assert.equal(childResult.signal, 'SIGKILL', childResult.stderr);
  return mutationId;
}
function placeLock(root, { pid = process.pid, host = os.hostname(), token = randomUUID() } = {}) {
  fs.mkdirSync(lockPath(root));
  fs.writeFileSync(path.join(lockPath(root), `${token}.json`), JSON.stringify({ token, host, pid }));
  return token;
}

test('real files: independent records, reopen, title/ID separation and whole-library relocation', t => {
  const { parent, root, library } = fixture(t);
  const first = library.createContent({ title: 'first', body: '# body\n' });
  const second = library.createContent({ title: 'second', body: '' });
  const updated = library.updateContent(first.id, { title: '../../display only' }, first.editToken);
  assert.equal(updated.id, first.id);
  assert.equal(updated.revision, 2);
  assert.equal(fs.readFileSync(contentFile(root, first), 'utf8'), '# body\n');
  assert.equal(JSON.parse(fs.readFileSync(contentFile(root, first, '内容.json'))).body, undefined);
  assert.equal(library.readContent(second.id).body, '');
  assert.equal(openLibrary(root).listContents().length, 2);
  const moved = path.join(parent, 'moved');
  fs.renameSync(root, moved);
  const reopened = openLibrary(moved);
  assert.equal(reopened.info.libraryId, library.info.libraryId);
  assert.equal(reopened.info.root, moved);
  assert.equal(reopened.readContent(first.id).title, '../../display only');
});

test('external raw Markdown and metadata edits change token; stale writes do not touch bytes', t => {
  const { root, library } = fixture(t);
  const item = library.createContent({ title: 'old', body: 'old' });
  fs.writeFileSync(contentFile(root, item), 'external body\r\n');
  const external = library.readContent(item.id);
  assert.equal(external.body, 'external body\r\n');
  assert.notEqual(external.editToken, item.editToken);
  reject('CONFLICT', () => library.updateContent(item.id, { body: 'stale' }, item.editToken));
  reject('CONFLICT', () => library.trashContent(item.id, item.editToken));
  assert.equal(fs.readFileSync(contentFile(root, item), 'utf8'), external.body);
  const metadataPath = contentFile(root, item, '内容.json');
  const meta = fs.readFileSync(metadataPath);
  fs.writeFileSync(metadataPath, Buffer.concat([meta, Buffer.from(' ')]));
  assert.notEqual(library.readContent(item.id).editToken, external.editToken);
  reject('CONFLICT', () => library.updateContent(item.id, { title: 'stale' }, external.editToken));
});

test('trash and restore preserve ID, directory, body and history snapshots', t => {
  const { root, library } = fixture(t);
  const item = library.createContent({ title: 'keep', body: 'original body' });
  const trashed = library.trashContent(item.id, item.editToken);
  assert.equal(library.listContents().length, 0);
  assert.equal(library.listTrash()[0].id, item.id);
  reject('INVALID_STATE', () => library.trashContent(item.id, trashed.editToken));
  reject('INVALID_STATE', () => library.updateContent(item.id, { body: 'no' }, trashed.editToken));
  const restored = library.restoreContent(item.id, trashed.editToken);
  assert.equal(restored.id, item.id);
  assert.equal(restored.body, item.body);
  assert.equal(restored.revision, 3);
  assert.equal(library.listTrash().length, 0);
  reject('INVALID_STATE', () => library.restoreContent(item.id, restored.editToken));
  assert.equal(fs.readdirSync(transactions(root)).length, 3);
  const trashIntent = JSON.parse(fs.readFileSync(path.join(transactionDir(root, trashed.mutationId), 'intent.json')));
  assert.equal(Buffer.from(trashIntent.before[1].bytes, 'base64').toString(), item.body);
  assert.ok(fs.existsSync(contentFile(root, item)));
});

test('two independent processes reject the second stale token', t => {
  const { root, library } = fixture(t);
  const item = library.createContent({ title: 'first', body: 'first' });
  const script = `const d=JSON.parse(process.env.TASK_DATA);try { console.log(JSON.stringify(openLibrary(d.root).updateContent(d.item.id,{body:d.body},d.item.editToken))); } catch(e) {console.log(e.code);process.exitCode=2;}`;
  const first = child(script, { root, item, body: 'process one' });
  const second = child(script, { root, item, body: 'process two' });
  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 2, second.stderr);
  assert.equal(second.stdout.trim(), 'CONFLICT');
  assert.equal(library.readContent(item.id).body, 'process one');
});

test('a live child owns a lock with no age-based takeover', async t => {
  const { parent, root, library } = fixture(t);
  const item = library.createContent({ title: 'x', body: 'x' });
  const ready = path.join(parent, 'ready');
  const worker = spawn(process.execPath, ['--input-type=module', '-e', `
    import fs from 'node:fs';import {openLibrary,__testing} from ${JSON.stringify(moduleURL)};
    const d=JSON.parse(process.env.TASK_DATA);const lib=openLibrary(d.root);
    __testing.setHook(e=>{if(e.phase==='afterJournal'){fs.writeFileSync(d.ready,'ready');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10000);}});
    lib.updateContent(d.item.id,{body:'child'},d.item.editToken);
  `], { env: { ...process.env, NODE_ENV: 'test', TASK_DATA: JSON.stringify({ root, item, ready }) }, stdio: 'ignore' });
  const ended = new Promise(resolve => worker.once('exit', resolve));
  t.after(() => worker.kill('SIGKILL'));
  for (let i = 0; i < 100 && !fs.existsSync(ready); i++) await delay(20);
  assert.ok(fs.existsSync(ready), 'child acquired lock');
  fs.utimesSync(lockPath(root), new Date(0), new Date(0));
  reject('BUSY', () => library.readContent(item.id));
  worker.kill('SIGKILL');
  await ended;
  assert.equal(openLibrary(root).readContent(item.id).body, 'child');
});

test('dead same-host lock is reclaimed, live/foreign/empty/malformed owners fail closed', t => {
  const { root, library } = fixture(t);
  const exited = child('process.stdout.write(String(process.pid))');
  placeLock(root, { pid: Number(exited.stdout) });
  assert.equal(openLibrary(root).listContents().length, 0);
  placeLock(root);
  reject('BUSY', () => library.listContents());
  fs.rmSync(lockPath(root), { recursive: true });
  placeLock(root, { host: 'another-host' });
  reject('BUSY', () => library.listContents());
  fs.rmSync(lockPath(root), { recursive: true });
  fs.mkdirSync(lockPath(root));
  reject('LOCK_UNCERTAIN', () => library.listContents());
  assert.ok(fs.existsSync(lockPath(root)));
  fs.writeFileSync(path.join(lockPath(root), 'bad'), 'bad');
  reject('LOCK_UNCERTAIN', () => library.listContents());
});

test('stale-token unlink loser never removes a replacement lock', t => {
  const { root, library } = fixture(t);
  const dead = Number(child('process.stdout.write(String(process.pid))').stdout);
  const oldToken = placeLock(root, { pid: dead });
  const replacement = randomUUID();
  __testing.setHook(event => {
    if (event.phase === 'beforeStaleUnlink') {
      fs.unlinkSync(path.join(lockPath(root), `${oldToken}.json`));
      fs.rmdirSync(lockPath(root));
      placeLock(root, { token: replacement });
    }
  });
  reject('BUSY', () => library.listContents());
  assert.ok(fs.existsSync(path.join(lockPath(root), `${replacement}.json`)));
});

test('release only removes its own token, preserving a replacement holder', t => {
  const { root, library } = fixture(t);
  const replacement = randomUUID();
  __testing.setHook(event => {
    if (event.phase === 'beforeRelease') {
      fs.unlinkSync(path.join(lockPath(root), `${event.token}.json`));
      fs.rmdirSync(lockPath(root));
      placeLock(root, { token: replacement });
    }
  });
  library.listContents();
  assert.ok(fs.existsSync(path.join(lockPath(root), `${replacement}.json`)));
});

for (const phase of ['afterJournal', 'afterFile', 'beforeCommit', 'beforeMarkerPublish']) {
  test(`SIGKILL ${phase}: reopen recovers complete bytes and mutation receipt`, t => {
    const { root, library } = fixture(t);
    const item = library.createContent({ title: 'before', body: 'before' });
    const mutationId = killDuring(root, item, phase);
    const reopened = openLibrary(root);
    const recovered = reopened.readContent(item.id);
    assert.equal(recovered.title, 'after title');
    assert.equal(recovered.body, 'after body');
    assert.equal(recovered.revision, 2);
    assert.equal(reopened.queryMutation(mutationId).content.editToken, recovered.editToken);
    assert.equal(fs.readFileSync(path.join(transactionDir(root, mutationId), 'captured-1'), 'utf8'), 'before');
  });
}

test('recovery detects a third external state before touching either target', t => {
  const { root, library } = fixture(t);
  const item = library.createContent({ title: 'before', body: 'before' });
  const mutationId = killDuring(root, item, 'afterJournal');
  const oldMeta = fs.readFileSync(contentFile(root, item, '内容.json'));
  fs.writeFileSync(contentFile(root, item), 'third-party body');
  reject('RECOVERY_CONFLICT', () => openLibrary(root));
  assert.deepEqual(fs.readFileSync(contentFile(root, item, '内容.json')), oldMeta);
  assert.equal(fs.readFileSync(contentFile(root, item), 'utf8'), 'third-party body');
  assert.ok(fs.existsSync(path.join(transactionDir(root, mutationId), 'intent.json')));
  assert.ok(!fs.existsSync(path.join(transactionDir(root, mutationId), 'COMMITTED')));
});

test('capture closes check/rename window and preserves newly observed external bytes', t => {
  const { root, library } = fixture(t);
  const item = library.createContent({ title: 'before', body: 'before' });
  const mutationId = randomUUID();
  __testing.setHook(event => {
    if (event.phase === 'beforeCapture' && event.index === 1) fs.writeFileSync(contentFile(root, item), 'racing external writer');
  });
  assert.throws(() => library.updateContent(item.id, { title: 'after', body: 'after' }, item.editToken, { mutationId }), error => error.code === 'RECOVERY_CONFLICT' && error.pendingRecovery);
  assert.equal(fs.readFileSync(path.join(transactionDir(root, mutationId), 'captured-1'), 'utf8'), 'racing external writer');
  __testing.setHook(undefined);
  reject('RECOVERY_CONFLICT', () => openLibrary(root));
});

test('exclusive link refuses a target recreated after capture and retains both versions', t => {
  const { root, library } = fixture(t);
  const item = library.createContent({ title: 'before', body: 'before' });
  const mutationId = randomUUID();
  __testing.setHook(event => {
    if (event.phase === 'beforeInstall' && event.index === 1) fs.writeFileSync(contentFile(root, item), 'external replacement');
  });
  reject('RECOVERY_CONFLICT', () => library.updateContent(item.id, { body: 'our replacement' }, item.editToken, { mutationId }));
  assert.equal(fs.readFileSync(contentFile(root, item), 'utf8'), 'external replacement');
  assert.equal(fs.readFileSync(path.join(transactionDir(root, mutationId), 'captured-1'), 'utf8'), 'before');
  const temporary = fs.readdirSync(path.dirname(contentFile(root, item))).find(name => name.startsWith('.install-'));
  assert.equal(fs.readFileSync(path.join(path.dirname(contentFile(root, item)), temporary), 'utf8'), 'our replacement');
});

test('injected write error reports pending recovery and never false success', t => {
  const { root, library } = fixture(t);
  const item = library.createContent({ title: 'before', body: 'before' });
  const mutationId = randomUUID();
  __testing.setHook(event => {
    if (event.phase === 'afterFile' && event.index === 0) throw Object.assign(new Error('injected ENOSPC'), { code: 'ENOSPC' });
  });
  assert.throws(() => library.updateContent(item.id, { title: 'after', body: 'after' }, item.editToken, { mutationId }), error => error.code === 'IO_ERROR' && error.pendingRecovery && error.mutationId === mutationId);
  assert.ok(!fs.existsSync(path.join(transactionDir(root, mutationId), 'COMMITTED')));
  __testing.setHook(undefined);
  assert.equal(openLibrary(root).readContent(item.id).body, 'after');
});

test('actual file-write boundary failure leaves durable intent and recovers on reopen', t => {
  const { root, library } = fixture(t);
  const item = library.createContent({ title: 'before', body: 'before' });
  const mutationId = randomUUID();
  const originalWrite = fs.writeFileSync;
  t.after(() => { fs.writeFileSync = originalWrite; });
  fs.writeFileSync = function (file, data, ...rest) {
    if (Buffer.isBuffer(data) && data.equals(Buffer.from('failed body write'))) {
      throw Object.assign(new Error('injected disk full at writeFileSync'), { code: 'ENOSPC' });
    }
    return originalWrite.call(this, file, data, ...rest);
  };
  assert.throws(() => library.updateContent(item.id, { title: 'after', body: 'failed body write' }, item.editToken, { mutationId }), error => error.code === 'IO_ERROR' && error.cause.code === 'ENOSPC' && error.pendingRecovery);
  assert.ok(!fs.existsSync(path.join(transactionDir(root, mutationId), 'COMMITTED')));
  assert.equal(fs.readFileSync(path.join(transactionDir(root, mutationId), 'captured-1'), 'utf8'), 'before');
  fs.writeFileSync = originalWrite;
  assert.equal(openLibrary(root).readContent(item.id).body, 'failed body write');
});

test('incomplete unpublished journal is retained and cannot brick library recovery', t => {
  const { root, library } = fixture(t);
  const item = library.createContent({ title: 'before', body: 'before' });
  const mutationId = randomUUID();
  const originalWrite = fs.writeFileSync;
  t.after(() => { fs.writeFileSync = originalWrite; });
  fs.writeFileSync = function (file, data, ...rest) {
    if (Buffer.isBuffer(data) && data.includes(Buffer.from('"requestDigest"'))) {
      originalWrite.call(this, file, Buffer.from('{partial'));
      throw Object.assign(new Error('injected partial journal write'), { code: 'ENOSPC' });
    }
    return originalWrite.call(this, file, data, ...rest);
  };
  assert.throws(() => library.updateContent(item.id, { title: 'after', body: 'after' }, item.editToken, { mutationId }), error => error.code === 'IO_ERROR' && error.pendingRecovery === false);
  fs.writeFileSync = originalWrite;
  assert.equal(fs.readFileSync(contentFile(root, item), 'utf8'), 'before');
  assert.equal(JSON.parse(fs.readFileSync(contentFile(root, item, '内容.json'))).title, 'before');
  assert.equal(openLibrary(root).readContent(item.id).body, 'before');
  const staging = fs.readdirSync(pendingRoot(root)).find(name => name.startsWith(`.staging-${mutationId}-`));
  assert.equal(fs.readFileSync(path.join(pendingRoot(root), staging, 'intent.json'), 'utf8'), '{partial');
  assert.equal(library.queryMutation(mutationId), null);
  assert.equal(library.updateContent(item.id, { title: 'after', body: 'after' }, item.editToken, { mutationId }).body, 'after');
});

test('SIGKILL before intent publication leaves only staging; reopen can retry same mutation', t => {
  const { root, library } = fixture(t);
  const item = library.createContent({ title: 'before', body: 'before' });
  const mutationId = killDuring(root, item, 'beforeIntentPublish');
  const reopened = openLibrary(root);
  assert.equal(reopened.readContent(item.id).body, 'before');
  assert.equal(reopened.queryMutation(mutationId), null);
  assert.ok(fs.readdirSync(pendingRoot(root)).some(name => name.startsWith(`.staging-${mutationId}-`)));
  assert.equal(reopened.updateContent(item.id, { title: 'after title', body: 'after body' }, item.editToken, { mutationId }).body, 'after body');
});

test('a partially written completion staging file is ignored and recovery completes after state', t => {
  const { root, library } = fixture(t);
  const item = library.createContent({ title: 'before', body: 'before' });
  const mutationId = randomUUID();
  const originalWrite = fs.writeFileSync;
  t.after(() => { fs.writeFileSync = originalWrite; });
  fs.writeFileSync = function (file, data, ...rest) {
    if (Buffer.isBuffer(data) && /^[0-9a-f]{64}\n$/.test(data.toString())) {
      originalWrite.call(this, file, data.subarray(0, 7));
      throw Object.assign(new Error('partial marker write'), { code: 'ENOSPC' });
    }
    return originalWrite.call(this, file, data, ...rest);
  };
  assert.throws(() => library.updateContent(item.id, { title: 'after', body: 'after' }, item.editToken, { mutationId }), error => error.code === 'IO_ERROR' && error.pendingRecovery);
  fs.writeFileSync = originalWrite;
  assert.ok(!fs.existsSync(path.join(transactionDir(root, mutationId), 'COMMITTED')));
  assert.ok(fs.readdirSync(transactionDir(root, mutationId)).some(name => name.startsWith('.COMMITTED-')));
  const reopened = openLibrary(root);
  assert.equal(reopened.readContent(item.id).body, 'after');
  assert.equal(reopened.queryMutation(mutationId).status, 'committed');
});

test('lock owner file-write failure cleans the exact token and does not leave a live-PID lock', t => {
  const { root, library } = fixture(t);
  const originalWrite = fs.writeFileSync;
  t.after(() => { fs.writeFileSync = originalWrite; });
  fs.writeFileSync = function (file, data, ...rest) {
    if (Buffer.isBuffer(data) && data.includes(Buffer.from('"host"'))) {
      originalWrite.call(this, file, Buffer.from('{partial'));
      throw Object.assign(new Error('owner write failure'), { code: 'ENOSPC' });
    }
    return originalWrite.call(this, file, data, ...rest);
  };
  reject('IO_ERROR', () => library.listContents());
  fs.writeFileSync = originalWrite;
  assert.ok(!fs.existsSync(lockPath(root)));
  assert.equal(library.listContents().length, 0);
});

test('lock post-owner sync failure cleans only its lock; failed cleanup is diagnosable', t => {
  const { root, library } = fixture(t);
  __testing.setHook(event => { if (event.phase === 'afterOwnerWrite') throw new Error('post-owner failure'); });
  reject('IO_ERROR', () => library.listContents());
  assert.ok(!fs.existsSync(lockPath(root)));
  const replacement = randomUUID();
  __testing.setHook(event => {
    if (event.phase === 'afterOwnerWrite') {
      fs.writeFileSync(path.join(lockPath(root), `${replacement}.json`), 'replacement');
      throw new Error('post-owner failure with another token');
    }
  });
  reject('LOCK_UNCERTAIN', () => library.listContents());
  assert.deepEqual(fs.readdirSync(lockPath(root)), [`${replacement}.json`]);
});

test('post-commit release failure returns generated mutationId for query instead of duplicate create', t => {
  const { root, library } = fixture(t);
  const originalUnlink = fs.unlinkSync;
  t.after(() => { fs.unlinkSync = originalUnlink; });
  __testing.setHook(event => {
    if (event.phase === 'beforeRelease') {
      fs.unlinkSync = function (file, ...rest) {
        if (path.dirname(file) === lockPath(root)) throw Object.assign(new Error('release denied'), { code: 'EACCES' });
        return originalUnlink.call(this, file, ...rest);
      };
    }
  });
  let failure;
  try { library.createContent({ title: 'once', body: 'once' }); } catch (error) { failure = error; }
  fs.unlinkSync = originalUnlink;
  __testing.setHook(undefined);
  assert.equal(failure.code, 'IO_ERROR');
  assert.equal(failure.outcome, 'committed');
  assert.ok(failure.mutationId);
  assert.ok(failure.contentId);
  // A failed release correctly leaves the live holder's exact token for diagnosis.
  const owner = fs.readdirSync(lockPath(root));
  assert.equal(owner.length, 1);
  fs.unlinkSync(path.join(lockPath(root), owner[0]));
  fs.rmdirSync(lockPath(root));
  const receipt = library.queryMutation(failure.mutationId);
  assert.equal(receipt.content.id, failure.contentId);
  assert.equal(library.listContents().length, 1);
});

test('macOS /tmp and /var ancestor aliases work without caller realpath; linked roots stay refused', { skip: process.platform !== 'darwin' }, t => {
  const parent = fs.mkdtempSync('/tmp/nova-library-alias-');
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const root = path.join(parent, 'library');
  const library = createLibrary(root);
  library.createContent({ title: 'alias', body: 'body' });
  assert.equal(openLibrary(root).listContents().length, 1);
  assert.ok(library.info.root.startsWith('/private/tmp/'));
  const varParent = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-library-var-'));
  t.after(() => fs.rmSync(varParent, { recursive: true, force: true }));
  const varRoot = path.join(varParent.replace(/^\/private\/var\//, '/var/'), 'library');
  assert.equal(openLibrary(createLibrary(varRoot).info.root).info.libraryId, openLibrary(varRoot).info.libraryId);
  const linkedRoot = path.join(parent, 'linked');
  fs.symlinkSync(root, linkedRoot);
  reject('UNSAFE_PATH', () => openLibrary(linkedRoot));
});

test('mutation IDs replay the same committed snapshot and query an ambiguous success', t => {
  const { library } = fixture(t);
  const mutationId = randomUUID();
  __testing.setHook(event => { if (event.phase === 'afterCommit') throw new Error('lost response'); });
  assert.throws(() => library.createContent({ title: 'once', body: 'once' }, { mutationId }), error => error.mutationId === mutationId);
  __testing.setHook(undefined);
  const receipt = library.queryMutation(mutationId);
  assert.equal(receipt.status, 'committed');
  const replay = library.createContent({ title: 'once', body: 'once' }, { mutationId });
  assert.deepEqual(replay, receipt.content);
  assert.equal(library.listContents().length, 1);
  reject('INVALID_INPUT', () => library.createContent({ title: 'different', body: 'once' }, { mutationId }));
  const updateId = randomUUID();
  const updated = library.updateContent(replay.id, { body: 'second' }, replay.editToken, { mutationId: updateId });
  library.updateContent(replay.id, { body: 'third' }, updated.editToken);
  assert.deepEqual(library.updateContent(replay.id, { body: 'second' }, replay.editToken, { mutationId: updateId }), updated);
  assert.equal(library.readContent(replay.id).body, 'third');
  assert.equal(library.queryMutation(randomUUID()), null);
});

test('invalid inputs, traversal and unknown fields do not create transactions', t => {
  const { root, library } = fixture(t);
  reject('INVALID_INPUT', () => library.createContent({ title: '', body: '' }));
  reject('INVALID_INPUT', () => library.createContent({ title: 'x', body: '', id: randomUUID() }));
  reject('INVALID_INPUT', () => library.readContent('../escape'));
  reject('INVALID_INPUT', () => library.queryMutation('../escape'));
  const item = library.createContent({ title: 'x', body: 'x' });
  reject('INVALID_INPUT', () => library.updateContent(item.id, {}, item.editToken));
  reject('INVALID_INPUT', () => library.updateContent(item.id, { deletedAt: null }, item.editToken));
  reject('INVALID_INPUT', () => library.updateContent(item.id, { body: 'x' }, 'bad'));
  assert.equal(fs.readdirSync(transactions(root)).length, 1);
});

test('bad JSON, missing body, duplicate identity and newer metadata fail without rewriting', t => {
  const { root, library } = fixture(t);
  const item = library.createContent({ title: 'x', body: 'x' });
  const metaFile = contentFile(root, item, '内容.json');
  const original = fs.readFileSync(metaFile);
  fs.writeFileSync(metaFile, '{broken');
  reject('CORRUPT', () => openLibrary(root));
  assert.equal(fs.readFileSync(metaFile, 'utf8'), '{broken');
  fs.writeFileSync(metaFile, original);
  fs.unlinkSync(contentFile(root, item));
  reject('CORRUPT', () => library.readContent(item.id));
  fs.writeFileSync(contentFile(root, item), 'x');
  const meta = JSON.parse(original);
  fs.writeFileSync(metaFile, JSON.stringify({ ...meta, schemaVersion: 4 }));
  reject('FORMAT_UNSUPPORTED', () => library.readContent(item.id));
  fs.writeFileSync(metaFile, JSON.stringify({ ...meta, id: randomUUID() }));
  reject('CORRUPT', () => library.listContents());
});

test('newer/foreign root format and unknown nonempty directories are never taken over', t => {
  const { parent, root, library } = fixture(t);
  const file = path.join(root, '内容库.json');
  const original = JSON.parse(fs.readFileSync(file));
  fs.writeFileSync(file, JSON.stringify({ ...original, schemaVersion: 5 }));
  reject('FORMAT_UNSUPPORTED', () => library.createContent({ title: 'x', body: '' }));
  fs.writeFileSync(file, JSON.stringify({ ...original, format: 'other-product' }));
  reject('FORMAT_UNSUPPORTED', () => openLibrary(root));
  const unknown = path.join(parent, 'unknown');
  fs.mkdirSync(unknown);
  fs.writeFileSync(path.join(unknown, 'keep'), 'user data');
  reject('NOT_EMPTY', () => createLibrary(unknown));
  assert.equal(fs.readFileSync(path.join(unknown, 'keep'), 'utf8'), 'user data');
});

for (const surface of ['root', 'contentDirectory', 'body', 'system', 'transaction']) {
  test(`symlink escape at ${surface} is refused and outside bytes stay intact`, t => {
    const { parent, root, library } = fixture(t);
    const item = library.createContent({ title: 'x', body: 'x' });
    const outside = path.join(parent, 'outside');
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 'keep'), 'outside');
    let target;
    if (surface === 'root') target = root;
    if (surface === 'contentDirectory') target = path.dirname(contentFile(root, item));
    if (surface === 'body') target = contentFile(root, item);
    if (surface === 'system') target = path.join(root, system);
    if (surface === 'transaction') target = transactionDir(root, item.mutationId);
    fs.renameSync(target, `${target}.saved`);
    fs.symlinkSync(surface === 'body' ? path.join(outside, 'keep') : outside, target);
    reject('UNSAFE_PATH', () => surface === 'transaction' ? library.queryMutation(item.mutationId) : library.readContent(item.id));
    assert.equal(fs.readFileSync(path.join(outside, 'keep'), 'utf8'), 'outside');
  });
}

test('journal is validated data, never a caller-controlled filesystem instruction', t => {
  const { parent, root, library } = fixture(t);
  const item = library.createContent({ title: 'before', body: 'before' });
  const mutationId = killDuring(root, item, 'afterJournal');
  const intentFile = path.join(transactionDir(root, mutationId), 'intent.json');
  const intent = JSON.parse(fs.readFileSync(intentFile));
  const outside = path.join(parent, 'outside.md');
  fs.writeFileSync(outside, 'keep');
  fs.writeFileSync(intentFile, JSON.stringify({ ...intent, target: outside }));
  reject('CORRUPT', () => openLibrary(root));
  assert.equal(fs.readFileSync(outside, 'utf8'), 'keep');
});

test('checksum damage fails closed and keeps the unfinished intent', t => {
  const { root, library } = fixture(t);
  const item = library.createContent({ title: 'before', body: 'before' });
  const mutationId = killDuring(root, item, 'afterJournal');
  const intentFile = path.join(transactionDir(root, mutationId), 'intent.json');
  const intent = JSON.parse(fs.readFileSync(intentFile));
  intent.after[1].bytes = Buffer.from('tampered').toString('base64');
  fs.writeFileSync(intentFile, JSON.stringify(intent));
  reject('CORRUPT', () => openLibrary(root));
  assert.equal(fs.readFileSync(contentFile(root, item), 'utf8'), 'before');
  assert.ok(fs.existsSync(intentFile));
});
