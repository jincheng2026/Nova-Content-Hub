import { createHash } from 'node:crypto';
import { lstat, readFile, writeFile, mkdir, mkdtemp, rm, rename, chmod, cp } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { request } from 'node:https';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../runtime/', import.meta.url));
export const nodeRelease = JSON.parse(await readFile(join(source, 'node-release.json'), 'utf8'));
const cache = resolve(source, '../../.node-runtime-cache');
const MAX_ARCHIVE_BYTES = 150 * 1024 * 1024;
export const cleanNodeEnv = () => Object.fromEntries(Object.entries(process.env).filter(([key]) => !['NODE_OPTIONS', 'NODE_PATH', 'ELECTRON_RUN_AS_NODE'].includes(key.toUpperCase())));

export function archiveFor(platform = process.platform, arch = process.arch) {
  const sha256 = nodeRelease.archives[`${platform}-${arch}`];
  if (!sha256) throw Error(`Unsupported bundled Node platform: ${platform}/${arch}`);
  const archiveArch = arch === 'ppc64' ? 'ppc64le' : arch;
  const stem = `node-v${nodeRelease.version}-${platform === 'win32' ? 'win' : platform}-${archiveArch}`;
  const filename = `${stem}.${platform === 'win32' ? 'zip' : 'tar.gz'}`;
  return { platform, arch, stem, filename, sha256, url: nodeRelease.origin + filename };
}

export async function verifyArchive(path, sha256) {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.size > MAX_ARCHIVE_BYTES || stat.size === 0) throw Error('Unsafe Node runtime archive');
  const bytes = await readFile(path);
  if (createHash('sha256').update(bytes).digest('hex') !== sha256) throw Error('Node runtime archive SHA256 mismatch');
}

async function download(url, destination, redirects = 0) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'nodejs.org' || parsed.port || parsed.username || parsed.password || redirects > 3) throw Error('Unsafe Node runtime download URL');
  const bytes = await new Promise((accept, reject) => {
    const req = request(parsed, { timeout: 30000 }, response => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        response.resume();
        if (!response.headers.location) return reject(Error('Node runtime redirect lacks location'));
        return accept({ redirect: new URL(response.headers.location, parsed).href });
      }
      if (response.statusCode !== 200) { response.resume(); return reject(Error(`Node runtime download HTTP ${response.statusCode}`)); }
      const chunks = [];
      let size = 0;
      response.on('data', chunk => { size += chunk.length; if (size > MAX_ARCHIVE_BYTES) response.destroy(Error('Node runtime archive exceeds size limit')); else chunks.push(chunk); });
      response.on('error', reject);
      response.on('end', () => accept(Buffer.concat(chunks)));
    });
    req.on('timeout', () => req.destroy(Error('Node runtime download timed out')));
    const deadline = setTimeout(() => req.destroy(Error('Node runtime download exceeded deadline')), 120000);
    req.once('close', () => clearTimeout(deadline));
    req.on('error', reject);
    req.end();
  });
  if (bytes.redirect) return download(bytes.redirect, destination, redirects + 1);
  await writeFile(destination, bytes, { flag: 'wx' });
}

export async function cachedArchive(spec = archiveFor()) {
  await mkdir(cache, { recursive: true });
  if (!(await lstat(cache)).isDirectory()) throw Error('Unsafe Node runtime cache directory');
  const archive = join(cache, spec.filename);
  try { await lstat(archive); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const stage = await mkdtemp(join(cache, '.download-'));
    try {
      const temporary = join(stage, spec.filename);
      await download(spec.url, temporary);
      await verifyArchive(temporary, spec.sha256);
      await rename(temporary, archive);
    } finally { await rm(stage, { recursive: true, force: true }); }
  }
  await verifyArchive(archive, spec.sha256);
  return archive;
}

export async function bundleNode(target) {
  const spec = archiveFor();
  const archive = await cachedArchive(spec);
  const stage = await mkdtemp(join(cache, '.extract-'));
  const runtime = join(target, 'runtime');
  try {
    const executable = process.platform === 'win32' ? 'node.exe' : 'bin/node';
    if (process.platform === 'win32') {
      const powershell = join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
      const quote = value => "'" + value.replaceAll("'", "''") + "'";
      execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-Command', `Expand-Archive -LiteralPath ${quote(archive)} -DestinationPath ${quote(stage)}`], { timeout: 120000, stdio: 'pipe' });
    } else {
      execFileSync('/usr/bin/tar', ['-xzf', archive, '-C', stage, `${spec.stem}/${executable}`, `${spec.stem}/LICENSE`], { timeout: 120000, stdio: 'pipe' });
    }
    await mkdir(runtime, { recursive: true });
    if (!(await lstat(runtime)).isDirectory()) throw Error('Unsafe bundled runtime directory');
    const node = join(runtime, process.platform === 'win32' ? 'node.exe' : 'node');
    for (const [from, to] of [[executable, node], ['LICENSE', join(runtime, 'LICENSE')]]) {
      const input = join(stage, spec.stem, from);
      if (!(await lstat(input)).isFile()) throw Error('Unsafe extracted Node runtime file');
      await writeFile(to, await readFile(input), { flag: 'wx', mode: from === executable ? 0o755 : 0o644 });
    }
    await chmod(node, 0o755);
    const actual = JSON.parse(execFileSync(node, ['-p', 'JSON.stringify({version:process.version,platform:process.platform,arch:process.arch})'], { encoding: 'utf8', timeout: 15000, env: cleanNodeEnv() }));
    if (actual.version !== `v${nodeRelease.version}` || actual.platform !== spec.platform || actual.arch !== spec.arch) throw Error('Bundled Node version/platform/architecture mismatch');
    const hash = async path => createHash('sha256').update(await readFile(path)).digest('hex');
    const manifest = { format: 'nova-bundled-node', schemaVersion: 1, version: nodeRelease.version, platform: spec.platform, arch: spec.arch, archive: spec.filename, officialUrl: spec.url, archiveSha256: spec.sha256, nodeSha256: await hash(node), licenseSha256: await hash(join(runtime, 'LICENSE')) };
    await writeFile(join(runtime, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
    await cp(join(source, 'launch.mjs'), join(runtime, 'launch.mjs'), { force: false, errorOnExist: true });
    return { node, manifest };
  } catch (error) {
    await rm(runtime, { recursive: true, force: true });
    throw error;
  } finally { await rm(stage, { recursive: true, force: true }); }
}

export async function writeLaunchers(target) {
  await mkdir(join(target, 'bin'), { recursive: true });
  await writeFile(join(target, 'bin/run-node'), '#!/bin/sh\nset -eu\ncase "$0" in */*) BIN=${0%/*} ;; *) BIN=. ;; esac\nROOT=$(CDPATH= cd -- "$BIN/.." && pwd -P)\nunset NODE_OPTIONS NODE_PATH ELECTRON_RUN_AS_NODE\nif [ -L "$ROOT/runtime" ] || [ -L "$ROOT/runtime/node" ] || [ ! -x "$ROOT/runtime/node" ]; then\n  echo "BUNDLED_RUNTIME_INVALID: fixed runtime/node is missing or unsafe" >&2\n  exit 1\nfi\nexec "$ROOT/runtime/node" "$ROOT/runtime/launch.mjs" "$@"\n', { mode: 0o755 });
  await writeFile(join(target, 'bin/run-node.cmd'), '@echo off\r\nsetlocal DisableDelayedExpansion\r\nset "NODE_OPTIONS="\r\nset "NODE_PATH="\r\nset "ELECTRON_RUN_AS_NODE="\r\nif not exist "%~dp0..\\runtime\\node.exe" (\r\n  echo BUNDLED_RUNTIME_INVALID: fixed runtime\\node.exe is missing 1>&2\r\n  exit /b 1\r\n)\r\n"%~dp0..\\runtime\\node.exe" "%~dp0..\\runtime\\launch.mjs" %*\r\nexit /b %errorlevel%\r\n');
}
