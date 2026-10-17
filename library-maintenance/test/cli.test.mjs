import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createLibrary, openLibrary } from '../../file-library/index.mjs';

const project = fileURLToPath(new URL('../../', import.meta.url));
let parent;
before(() => { parent = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'nch-maintenance-')); });
after(() => { fs.rmSync(parent, { recursive: true, force: true }); });
function run(entry, args) {
  const result = spawnSync(process.execPath, [entry, ...args], { cwd: parent, env: { ...process.env, NODE_PATH: '' }, encoding: 'utf8', timeout: 15000 });
  assert.equal(result.error, undefined, result.stderr);
  assert.equal(result.signal, null, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(result.status, output.ok ? 0 : 1, result.stderr);
  return output;
}

test('maintenance command rejects malformed arguments before touching the chosen library', () => {
  const cli = path.join(project, 'library-maintenance/cli.mjs'), absent = path.join(parent, 'absent');
  for (const args of [['toString'], ['__proto__'], ['backup'], ['verify', '--backup', '.'], ['help', '--library', absent], ['backup', '--library', absent, '--destination', absent, '--library', absent], ['verify', '--backup', absent, '--auth', 'disabled']]) {
    assert.equal(run(cli, args).code, 'INVALID_ARGUMENTS', JSON.stringify(args));
  }
  assert.equal(fs.existsSync(absent), false);
});

for (const mode of ['required', 'disabled']) test(`standalone ${mode} bundle backs up and restores user files without generation authorization`, () => {
  const dir = path.join(parent, randomUUID()); fs.mkdirSync(dir);
  const runtime = path.join(dir, 'runtime');
  fs.cpSync(path.join(project, 'dist-cover-runtime', `auth-${mode}`), runtime, { recursive: true });
  const cli = path.join(runtime, 'library-maintenance/cli.mjs');
  assert.equal(fs.existsSync(path.join(runtime, 'library-maintenance/test')), false);
  assert.equal(run(cli, ['help']).imageGeneration, false);
  const root = path.join(dir, '我的 内容库'), backup = path.join(dir, '备份'), restored = path.join(dir, '恢复');
  const lib = createLibrary(root), item = lib.createContent({ title: '原文保全', body: '\uFEFF# 原文\r\n不改换行' });
  const trashed = lib.trashContent(item.id, item.editToken);
  fs.mkdirSync(path.join(root, '自存附件'));
  const raw = Buffer.from([0, 255, 2, 10]); fs.writeFileSync(path.join(root, '自存附件', 'private.bin'), raw);
  const completed = run(cli, ['backup', '--library', root, '--destination', backup]);
  assert.equal(completed.ok, true, completed.message);
  assert.equal(run(cli, ['verify', '--backup', backup]).result.verified, true);
  const recovered = run(cli, ['restore', '--backup', backup, '--destination', restored]);
  assert.equal(recovered.ok, true, recovered.message);
  assert.deepEqual(recovered.result.interruptedAttempts, []);
  const recoveredLibrary = openLibrary(restored);
  assert.deepEqual(recoveredLibrary.listTrash()[0], lib.listTrash()[0]);
  assert.equal(recoveredLibrary.queryMutation(trashed.mutationId).status, 'committed');
  assert.deepEqual(fs.readFileSync(path.join(restored, '自存附件', 'private.bin')), raw);
  assert.equal(lib.listTrash()[0].body, item.body);
  const occupied = path.join(dir, '已有目录'); fs.mkdirSync(occupied);
  fs.writeFileSync(path.join(occupied, 'keep.txt'), '不能覆盖');
  assert.equal(run(cli, ['restore', '--backup', backup, '--destination', occupied]).code, 'DESTINATION_EXISTS');
  assert.equal(fs.readFileSync(path.join(occupied, 'keep.txt'), 'utf8'), '不能覆盖');
  fs.appendFileSync(path.join(backup, 'data', '自存附件', 'private.bin'), 'broken');
  assert.equal(run(cli, ['verify', '--backup', backup]).code, 'CORRUPT');
  const rejected = path.join(dir, '拒绝恢复');
  assert.equal(run(cli, ['restore', '--backup', backup, '--destination', rejected]).ok, false);
  assert.equal(fs.existsSync(rejected), false);
});
