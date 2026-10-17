import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import Handoff from '../src/bridge/handoff.js';
import PrototypeHandoff from '../../原型/shared/handoff.js';
import { syncBridge } from '../scripts/sync-bridge.mjs';

const root = new URL('../../', import.meta.url);
test('prototype bridge is generated from the pure canonical bridge and retains fixed host routing', async () => {
  await syncBridge(true);
  assert.equal(Handoff.homeUrl('codex'), PrototypeHandoff.homeUrl('codex'));
  assert.equal(Handoff.homeUrl('workbuddy'), PrototypeHandoff.homeUrl('workbuddy'));
  assert.throws(() => Handoff.homeUrl('unknown'), /INVALID_TARGET/);
  const source = fs.readFileSync(new URL('plugin-src/src/bridge/handoff.js', root), 'utf8');
  assert.doesNotMatch(source, /require\(|\bimport\s|child_process|electron|fetch\(|window\.open|shell\.open/i);
  assert.equal(fs.readFileSync(new URL('原型/shared/handoff.js', root), 'utf8').split('\n').slice(1).join('\n'), source);
});

test('sync --check detects drift without repairing or executing the generated bridge', t => {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'nch-bridge-drift-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const relative of ['plugin-src/scripts/sync-bridge.mjs', 'plugin-src/src/bridge/handoff.js', '原型/shared/handoff.js']) {
    const target = path.join(dir, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(new URL(relative, root), target);
  }
  const run = args => spawnSync(process.execPath, [path.join(dir, 'plugin-src/scripts/sync-bridge.mjs'), ...args], { encoding: 'utf8' });
  assert.equal(run(['--check']).status, 0);
  const generated = path.join(dir, '原型/shared/handoff.js');
  fs.appendFileSync(generated, '\nthrow Error("must not execute");\n');
  assert.equal(run(['--check']).status, 1);
  assert.match(fs.readFileSync(generated, 'utf8'), /must not execute/);
  assert.equal(run([]).status, 0);
  assert.equal(run(['--check']).status, 0);
});
