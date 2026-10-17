import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { BindingStore } from '../src/main/bindings.mts';
import { DesktopController } from '../src/main/controller.mts';

async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-desktop-controller-')); t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'binding.json'); const source = path.join(dir, 'source.json'); const destination = path.join(dir, 'library');
  const inspection = { source: { sha256: 'a'.repeat(64) }, counts: {} }; const calls = []; let task = null; let importFailure = false;
  const worker = { async call(op, args) {
    calls.push({ op, args });
    if (op === 'inspect') return inspection;
    if (op === 'query') return task;
    if (op === 'import') {
      assert.equal(args.expectedSourceHash, inspection.source.sha256);
      assert.equal((await new BindingStore(file).load()).started, true, 'binding must persist before worker starts');
      task = { importId: randomUUID(), sourceHash: inspection.source.sha256, status: importFailure ? 'prepared' : 'committed', libraryId: importFailure ? undefined : randomUUID(), issues: [], progress: {} };
      if (importFailure) throw Object.assign(new Error('worker exited'), { code: 'WORKER_EXIT' });
      return task;
    }
    if (op === 'resume') { assert.equal(args.importId, task.importId); task = { ...task, status: 'committed', libraryId: randomUUID() }; return task; }
    if (op === 'bind') return { root: args.destination, libraryId: args.libraryId, rootIdentity: { dev: '1', ino: '2' } };
    if (op === 'list') return [{ title: '<script>bad()</script>', body: 'original' }];
    throw new Error(op);
  } };
  const create = () => new DesktopController({ store: new BindingStore(file), worker, documents: dir, dialogs: { backup: async () => source, destination: async () => destination } });
  const controller = create(); await controller.initialize(); await controller.chooseBackup(); await controller.chooseDestination();
  return { controller, create, calls, inspection, worker, failImport: () => { importFailure = true; }, setTask: next => { task = next; } };
}
test('persisted accepted task is recovered after worker exit and fresh application; resume uses exact task', async t => {
  const f = await fixture(t); f.failImport();
  await assert.rejects(f.controller.importBackup(), { code: 'WORKER_EXIT' });
  const id = f.controller.binding.importId; assert.ok(id);
  const reopened = f.create(); await reopened.initialize(); assert.equal((await reopened.status()).task.status, 'prepared');
  await assert.rejects(reopened.chooseBackup(), { code: 'IMPORT_IN_PROGRESS' });
  await assert.rejects(reopened.chooseDestination(), { code: 'TARGET_FIXED' });
  await reopened.resumeImport(); assert.equal(reopened.binding.importId, id); assert.equal((await reopened.status()).task.status, 'committed');
  assert.equal((await reopened.listContents())[0].body, 'original');
  assert.equal(f.calls.filter(call => call.op === 'import').length, 1);
});
test('committed retries never replay import and reject changed source or replaced library', async t => {
  const f = await fixture(t); await f.controller.importBackup();
  await f.controller.importBackup(); await f.controller.resumeImport(); assert.equal(f.calls.filter(call => call.op === 'import').length, 1);
  f.setTask({ importId: randomUUID(), sourceHash: 'a'.repeat(64), status: 'committed' });
  await assert.rejects(f.controller.status(), { code: 'BINDING_CONFLICT' });
});
test('source must still match the preview before launching, and failed pre-reservation can be reselected', async t => {
  const f = await fixture(t); f.inspection.source.sha256 = 'b'.repeat(64);
  await assert.rejects(f.controller.importBackup(), { code: 'SOURCE_CHANGED' });
  assert.equal(f.calls.filter(call => call.op === 'import').length, 0);
  f.controller.binding.started = true; // Simulates failure before import reservation exists.
  await f.controller.chooseDestination(); assert.equal(f.controller.binding.started, false);
  f.controller.binding.started = true;
  await f.controller.chooseBackup(); assert.equal(f.controller.binding.started, false);
});
test('a restart finds the accepted disk task even when both operation response and recovery query were lost', async t => {
  const f = await fixture(t); f.failImport(); const original = f.worker.call.bind(f.worker); let queryLost = false;
  f.worker.call = async (op, args) => {
    if (op === 'query' && queryLost) { queryLost = false; throw Object.assign(new Error('worker gone'), { code: 'WORKER_EXIT' }); }
    try { return await original(op, args); } catch (error) { if (op === 'import') queryLost = true; throw error; }
  };
  await assert.rejects(f.controller.importBackup(), { code: 'WORKER_EXIT' });
  assert.equal(f.controller.binding.importId, null);
  const reopened = f.create(); await reopened.initialize();
  assert.equal((await reopened.status()).task.status, 'prepared'); assert.ok(reopened.binding.importId);
  await reopened.resumeImport(); assert.equal(f.calls.filter(call => call.op === 'import').length, 1);
});
test('replaced committed target cannot be listed or resumed', async t => {
  const f = await fixture(t); await f.controller.importBackup(); f.setTask({ ...f.controller.last, targetChanged: true });
  await assert.rejects(f.controller.listContents(), { code: 'LIBRARY_NOT_READY' });
  await assert.rejects(f.controller.resumeImport(), { code: 'TARGET_CHANGED' });
});
test('startup and user status queries share one disk query instead of colliding in the worker', async t => {
  const f = await fixture(t); await f.controller.importBackup();
  const original = f.worker.call.bind(f.worker); let queries = 0;
  f.worker.call = async (op, args) => { if (op === 'query') { queries += 1; await new Promise(resolve => setTimeout(resolve, 10)); } return original(op, args); };
  const results = await Promise.all([f.controller.status(), f.controller.status(), f.controller.status()]);
  assert.equal(queries, 1); assert.ok(results.every(value => value.task.status === 'committed'));
});
