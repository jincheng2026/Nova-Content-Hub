import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { assertCaller, staticResource, PAGE, CHANNELS } from '../boundary.mjs';
import { BindingStore, emptyBinding, validateBinding } from '../bindings.mjs';
import { WorkerClient } from '../worker-client.mjs';

test('only exact top-level sender with no renderer arguments can invoke business', () => {
  const frame = { url: PAGE }; const sender = { mainFrame: frame, isDestroyed: () => false };
  const event = { sender, senderFrame: frame };
  assert.doesNotThrow(() => assertCaller(event, sender, []));
  for (const attack of [{ ...event, sender: {} }, { ...event, senderFrame: { url: PAGE } }, { ...event, senderFrame: null }]) assert.throws(() => assertCaller(attack, sender, []), { code: 'FORBIDDEN' });
  assert.throws(() => assertCaller(event, sender, ['/arbitrary/path']), { code: 'FORBIDDEN' });
  frame.url = 'https://app/index.html'; assert.throws(() => assertCaller(event, sender, []), { code: 'FORBIDDEN' });
  assert.equal(CHANNELS.length, 6);
});
test('static protocol maps only exact bundled files', () => {
  assert.deepEqual(staticResource(PAGE), ['index.html', 'text/html; charset=utf-8']);
  for (const url of ['file:///etc/passwd', 'nova-content://other/app.js', 'nova-content://app/%2e%2e/%2fetc/passwd', 'nova-content://app/app.js?file=/etc/passwd', 'nova-content://app/private.json', 'nova-content://user@app/app.js']) assert.equal(staticResource(url), null);
});
test('machine binding survives fresh store and refuses malformed or symlink state', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-desktop-binding-')); t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'machine.json'); const store = new BindingStore(file);
  assert.deepEqual(await store.load(), emptyBinding());
  const binding = { ...emptyBinding(), source: path.join(dir, 'old.json'), sourceHash: 'a'.repeat(64), destination: path.join(dir, 'library'), started: true };
  await store.save(binding); assert.deepEqual(await new BindingStore(file).load(), binding);
  assert.throws(() => validateBinding({ ...binding, arbitrary: '/etc/passwd' }), { code: 'BINDING_INVALID' });
  assert.throws(() => validateBinding({ ...emptyBinding(), importId: '60063774-3b67-46be-a089-5ac3cc625d89' }), { code: 'BINDING_INVALID' });
  await fs.rename(file, `${file}.original`); await fs.symlink(`${file}.original`, file);
  await assert.rejects(store.load(), { code: 'BINDING_INVALID' });
});
test('worker exit rejects operation, next query starts fresh worker, shutdown cannot respawn', async () => {
  const children = []; const client = new WorkerClient(() => { const child = new EventEmitter(); child.postMessage = message => { child.sent = message; }; child.kill = () => child.emit('exit', 0); children.push(child); return child; });
  const first = client.call('import', {}); children[0].emit('exit', 9); await assert.rejects(first, { code: 'WORKER_EXIT' });
  const query = client.call('query', {}); children[1].emit('message', { id: children[1].sent.id, ok: true, value: { status: 'prepared' } });
  assert.deepEqual(await query, { status: 'prepared' }); client.stop(); await assert.rejects(client.call('query', {}), { code: 'WORKER_STOPPED' });
});
