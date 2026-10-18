import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { archiveFor, nodeRelease, verifyArchive, bundleNode, writeLaunchers } from '../scripts/bundled-node.mjs';

const temporary = async t => {
  const path = await mkdtemp(join(tmpdir(), 'nova bundled node '));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
};
const shell = process.platform === 'win32' ? join(process.env.SystemRoot || 'C:\\Windows', 'System32/cmd.exe') : '/bin/sh';
const run = (path, args = ['doctor']) => spawnSync(shell, process.platform === 'win32' ? ['/d', '/s', '/c', `""${join(path, 'bin/run-node.cmd')}" ${args.join(' ')}"`] : [join(path, 'bin/run-node'), ...args], { cwd: tmpdir(), env: { ...process.env, PATH: '', NODE_PATH: '', NODE_OPTIONS: '--require missing-host-module' }, encoding: 'utf8' });

test('official platform locks agree with recorded Node SHASUMS; unsupported targets fail', async () => {
  const evidence = await readFile(new URL('../runtime/SHASUMS256.txt', import.meta.url), 'utf8');
  for (const key of Object.keys(nodeRelease.archives)) {
    const at = key.indexOf('-');
    const spec = archiveFor(key.slice(0, at), key.slice(at + 1));
    assert.ok(evidence.includes(`${spec.sha256}  ${spec.filename}\n`), spec.filename);
    assert.equal(new URL(spec.url).origin, 'https://nodejs.org');
  }
  assert.throws(() => archiveFor('darwin', 'ia32'), /Unsupported/);
});

test('archive validation rejects changed bytes, directories and symlinks', async t => {
  const path = await temporary(t);
  const archive = join(path, 'archive');
  const bytes = Buffer.from('pinned official archive fixture');
  const hash = createHash('sha256').update(bytes).digest('hex');
  await writeFile(archive, bytes);
  await verifyArchive(archive, hash);
  await writeFile(archive, 'corrupted');
  await assert.rejects(verifyArchive(archive, hash), /SHA256/);
  await assert.rejects(verifyArchive(path, hash), /Unsafe/);
  if (process.platform !== 'win32') {
    const link = join(path, 'link');
    await symlink(archive, link);
    await assert.rejects(verifyArchive(link, hash), /Unsafe/);
  }
});

test('launchers use only fixed bundled runtime and fail closed with an empty PATH', async t => {
  const path = await temporary(t);
  await writeLaunchers(path);
  const posix = await readFile(join(path, 'bin/run-node'), 'utf8');
  const windows = await readFile(join(path, 'bin/run-node.cmd'), 'utf8');
  assert.doesNotMatch(posix + windows, /exec node|\r\nnode |which |command -v|ELECTRON_RUN_AS_NODE=1/);
  assert.match(posix, /exec "\$ROOT\/runtime\/node" "\$ROOT\/runtime\/launch.mjs"/);
  assert.match(windows, /"%~dp0\.\.\\runtime\\node.exe" "%~dp0\.\.\\runtime\\launch.mjs" %\*/);
  assert.notEqual(run(path).status, 0);
  assert.match(run(path).stderr, /BUNDLED_RUNTIME_INVALID/);
  if (process.platform !== 'win32') {
    await mkdir(join(path, 'runtime'));
    await symlink(process.execPath, join(path, 'runtime/node'));
    assert.match(run(path).stderr, /BUNDLED_RUNTIME_INVALID/);
  }
});

test('real pinned Node runs outside the repo without PATH, rejects damage, and cleans failed extraction', { skip: process.env.NOVA_BUNDLED_NODE_INTEGRATION !== '1' }, async t => {
  const path = await temporary(t);
  const { node, manifest } = await bundleNode(path);
  assert.equal(manifest.version, '24.20.0');
  assert.equal(manifest.platform, process.platform);
  assert.equal(manifest.arch, process.arch);
  const cli = join(path, 'plugin-src/src');
  await mkdir(cli, { recursive: true });
  await writeFile(join(cli, 'cli.mjs'), 'export async function main(args) { console.log(JSON.stringify({version:process.version,arg:args[0]})); return 0; }\n');
  await writeLaunchers(path);
  const result = run(path);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { version: 'v24.20.0', arg: 'doctor' });
  const manifestPath = join(path, 'runtime/manifest.json');
  await writeFile(manifestPath, JSON.stringify({ ...manifest, arch: 'wrong' }));
  assert.match(run(path).stderr, /architecture mismatch/);
  await writeFile(manifestPath, JSON.stringify(manifest));
  await rm(join(cli, 'cli.mjs'));
  assert.match(run(path).stderr, /BUNDLED_RUNTIME_INVALID/);
  await writeFile(join(cli, 'cli.mjs'), 'export async function main() { console.log("doctor"); return 0; }\n');
  const license = join(path, 'runtime/LICENSE');
  await writeFile(license, 'damaged license');
  assert.notEqual(run(path).status, 0);
  assert.match(run(path).stderr, /integrity mismatch/);
  const failing = join(path, 'failed destination');
  await mkdir(join(failing, 'runtime'), { recursive: true });
  await writeFile(join(failing, 'runtime', process.platform === 'win32' ? 'node.exe' : 'node'), 'existing unsafe runtime');
  await assert.rejects(bundleNode(failing), /EEXIST/);
  await assert.rejects(readFile(join(failing, 'runtime/manifest.json')), /ENOENT/);
  const cache = new URL('../../.node-runtime-cache/', import.meta.url);
  assert.ok((await readdir(cache)).every(name => !name.startsWith('.download-') && !name.startsWith('.extract-')));
  assert.equal(spawnSync(node, ['-p', 'process.version'], { encoding: 'utf8' }).stdout.trim(), 'v24.20.0');
});
