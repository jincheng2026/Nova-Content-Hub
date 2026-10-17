import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { makeBackup } from '../../browser-import/test/fixture.mjs';
import { inspectBrowserBackup, getBrowserImport } from '../../browser-import/index.mjs';
import { execute } from '../src/main/worker.mts';
import { BindingStore } from '../src/main/bindings.mts';
import { DesktopController } from '../src/main/controller.mts';

test('actual import boundary rejects changed bytes after preview, creates no reservation and allows normal reselect', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-electron-source-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'source.json'); const destination = path.join(root, 'library');
  const { state } = await makeBackup(); await fs.writeFile(source, JSON.stringify(state));
  const originalHash = inspectBrowserBackup(source).source.sha256;
  let swapped = false;
  const store = new BindingStore(path.join(root, 'machine.json'));
  const persistedSave = store.save.bind(store);
  store.save = async binding => {
    await persistedSave(binding);
    if (binding.started && !swapped) { swapped = true; state.data.PROJECTS[0].name += ' changed after preview'; await fs.writeFile(source, JSON.stringify(state)); }
  };
  const controller = new DesktopController({ store, worker: { call: execute }, documents: root, dialogs: { backup: async () => source, destination: async () => destination } });
  await controller.initialize(); await controller.chooseBackup(); await controller.chooseDestination();
  assert.equal(controller.binding.sourceHash, originalHash);
  await assert.rejects(controller.importBackup(), { code: 'SOURCE_CHANGED' });
  assert.equal(getBrowserImport(destination), null);
  await assert.rejects(fs.stat(destination), { code: 'ENOENT' });
  await controller.chooseDestination(); assert.equal(controller.binding.started, false);
  await controller.chooseBackup(); assert.notEqual(controller.binding.sourceHash, originalHash);
});
test('worker refuses unknown operations, extra fields, malformed IDs and absent expected source hash', async () => {
  for (const [op, args] of [['shell', {}], ['inspect', { source: '/tmp/backup.json', arbitrary: true }], ['import', { source: '/tmp/backup.json', destination: '/tmp/library' }], ['list', { destination: '/tmp/library', libraryId: 'arbitrary' }]]) await assert.rejects(execute(op, args), { code: 'INVALID_INPUT' });
});
test('real file import through controller and worker survives a fresh binding and keeps later edits', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-electron-roundtrip-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'source.json'); const destination = path.join(root, 'library');
  const { state } = await makeBackup();
  Object.assign(state.data.ACCOUNT, { avatar: '', photos: [], marks: [] });
  for (const key of ['TEMPLATES', 'PROMPTS', 'TASKS', 'CUSTOM_SIZES', 'PCATS']) state.data[key] = [];
  state.data.PROJECTS = [{ ...state.data.PROJECTS[0], name: '<script>untrusted()</script>', tpl: '', files: [], materials: [], posts: [], channels: [] }]; state.trash = [];
  await fs.writeFile(source, JSON.stringify(state));
  const create = () => new DesktopController({ store: new BindingStore(path.join(root, 'machine.json')), worker: { call: execute }, documents: root, dialogs: { backup: async () => source, destination: async () => destination } });
  const first = create(); await first.initialize(); await first.chooseBackup(); await first.chooseDestination(); await first.importBackup();
  assert.equal((await first.status()).task.status, 'committed');
  const list = await first.listContents(); assert.equal(list.length, 1); assert.equal(list[0].title, '<script>untrusted()</script>');
  const { openLibrary } = await import('../../file-library/index.mjs');
  const library = openLibrary(destination); const content = library.readContent(list[0].id);
  library.updateContent(content.id, { body: 'post-import edit' }, content.editToken); await fs.unlink(source);
  const reopened = create(); await reopened.initialize(); await reopened.resumeImport();
  assert.equal(reopened.binding.importId, first.binding.importId); assert.equal(reopened.binding.libraryId, first.binding.libraryId);
  assert.equal((await reopened.listContents())[0].body, 'post-import edit');
});
