import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { openLibrary, upgradeLibrary, __testing } from '../../file-library/index.mjs';

const parent = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'nch-v2-compatibility-'));
const previousEnvironment = process.env.NODE_ENV;
try {
  const project = fileURLToPath(new URL('../../', import.meta.url));
  const oldCommit = '213d3ee';
  const oldFile = path.join(parent, 'actual-v2-reader.mjs');
  fs.writeFileSync(oldFile, execFileSync('git', ['show', `${oldCommit}:file-library/index.mjs`], { cwd: project }));
  const old = await import(pathToFileURL(oldFile));
  const root = path.join(parent, '库');
  const library = old.createLibrary(root);
  const content = library.createContent({ title: 'v2 compatibility', body: '# 原始正文\r\n' });
  const descriptor = path.join(root, '内容库.json');
  const original = fs.readFileSync(descriptor);
  const oldHandle = old.openLibrary(root);
  assert.equal(oldHandle.readContent(content.id).body, content.body);
  assert.throws(() => openLibrary(root), error => error.code === 'UPGRADE_REQUIRED');
  assert.deepEqual(fs.readFileSync(descriptor), original);
  process.env.NODE_ENV = 'test';
  __testing.setHook(({ phase }) => { if (phase === 'upgrade3AfterBarrier') throw new Error('stop after v3 barrier'); });
  try { assert.throws(() => upgradeLibrary(root), /stop after v3 barrier/); }
  finally { __testing.setHook(null); }
  assert.deepEqual(fs.readFileSync(descriptor), original, 'barrier precedes the schema switch');
  assert.throws(() => oldHandle.updateContent(content.id, { body: 'must not write' }, content.editToken), error => error.code === 'CORRUPT');
  const upgraded = upgradeLibrary(root);
  assert.equal(upgraded.info.schemaVersion, 3);
  assert.equal(upgraded.info.libraryId, library.info.libraryId);
  assert.equal(upgraded.readContent(content.id).body, content.body);
  assert.throws(() => oldHandle.updateContent(content.id, { body: 'must not write' }, content.editToken), error => error.code === 'FORMAT_UNSUPPORTED');
  console.log(JSON.stringify({ oldReaderCommit: oldCommit, oldV2Read: 'passed', newV2Open: 'UPGRADE_REQUIRED',
    oldWriteDuringUpgrade: 'CORRUPT', oldWriteAfterUpgrade: 'FORMAT_UNSUPPORTED', upgradedSchema: 3,
    identityAndBodyPreserved: true }, null, 2));
} finally {
  if (previousEnvironment === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousEnvironment;
  fs.rmSync(parent, { recursive: true, force: true });
}
