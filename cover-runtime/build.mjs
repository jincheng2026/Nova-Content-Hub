import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--auth' || !['required', 'disabled', 'both'].includes(args[1])) throw new Error('Use npm run build:cover -- --auth required|disabled|both');
const npmCLI = process.env.npm_execpath;
if (!npmCLI || !fs.statSync(npmCLI).isFile()) throw new Error('Run this builder through npm so its Node/npm runtime is explicit.');
const release = JSON.parse(fs.readFileSync(path.join(root, 'release.config.json'), 'utf8'));
const sourcePackage = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (!sourcePackage.dependencies?.sharp || !/^\d+\.\d+\.\d+$/.test(sourcePackage.dependencies.sharp)) throw new Error('Pin the shared sharp runtime before building.');
const modes = args[1] === 'both' ? ['required', 'disabled'] : [args[1]];

for (const mode of modes) {
  const target = path.join(root, 'dist-cover-runtime', `auth-${mode}`);
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(path.join(target, 'cover-runtime'), { recursive: true });
  for (const name of ['file-library', 'image-validation', 'library-maintenance', 'browser-import']) {
    fs.cpSync(path.join(root, name), path.join(target, name), { recursive: true, filter: source => path.basename(source) !== 'test' });
  }
  // Import validation executes only these trusted prototype modules, never data.js or source scripts.
  for (const relative of ['core.js', 'builtin-templates.js', 'shared/handoff.js']) {
    const destination = path.join(target, '原型', relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(root, '原型', relative), destination);
  }
  const importCatalog = JSON.parse(fs.readFileSync(path.join(root, 'browser-import/builtin-resources.json'), 'utf8'));
  if (importCatalog.format !== 'nova-browser-import-builtin-resources' || importCatalog.schemaVersion !== 1 || !importCatalog.entries) throw new Error('Unsupported import resource catalog');
  for (const [relative, entry] of Object.entries(importCatalog.entries)) {
    if (!relative.startsWith('图库/') || /[\\:\u0000-\u001f]/.test(relative) || relative.split('/').some(part => !part || part === '.' || part === '..') || entry.path !== relative || !['raster', 'structure'].includes(entry.kind)) throw new Error('Unsafe bundled import resource');
    const bytes = fs.readFileSync(path.join(root, '原型', relative));
    if (bytes.length !== entry.bytes || createHash('sha256').update(bytes).digest('hex') !== entry.sha256) throw new Error('Import resource hash mismatch');
    const destination = path.join(target, '原型', relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, bytes, { flag: 'wx' });
  }
  fs.copyFileSync(path.join(root, 'cover-runtime', 'cli.mjs'), path.join(target, 'cover-runtime', 'cli.mjs'));
  fs.cpSync(path.join(root, 'cover-runtime', 'skills'), path.join(target, 'cover-runtime', 'skills'), { recursive: true });
  fs.copyFileSync(path.join(root, 'cover-runtime', 'README.md'), path.join(target, 'cover-runtime', 'README.md'));
  fs.writeFileSync(path.join(target, 'README.md'), '# 自媒体封面执行器 · 实验包\n\n运行 `node cover-runtime/cli.mjs help`。完整说明见 [运行说明](cover-runtime/README.md)。本地数据备份、核验、恢复使用 `node library-maintenance/cli.mjs help`，见 [数据维护](library-maintenance/README.md)。本包不代表商用发行就绪。\n');
  fs.writeFileSync(path.join(target, 'cover-runtime', 'release.json'), JSON.stringify({
    format: 'nova-content-cover-runtime-release', schemaVersion: 1, appScope: release.appScope,
    version: release.version, protocolVersion: 1, AUTH_MODE: mode,
    experimental: true, productionReady: false, platform: process.platform, arch: process.arch,
  }, null, 2) + '\n');
  // Install only locked production dependencies; lifecycle scripts cannot execute in the bundle.
  fs.writeFileSync(path.join(target, 'package.json'), JSON.stringify({ ...sourcePackage, scripts: { start: 'node cover-runtime/cli.mjs help' } }, null, 2) + '\n');
  fs.copyFileSync(path.join(root, 'package-lock.json'), path.join(target, 'package-lock.json'));
  execFileSync(process.execPath, [npmCLI, 'ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: target, stdio: 'pipe', timeout: 180000 });
  execFileSync(process.execPath, ['--input-type=module', '--eval', "import sharp from 'sharp';import {validateImage} from './image-validation/index.mjs';const bytes=await sharp({create:{width:1,height:1,channels:3,background:'#ffffff'}}).png().toBuffer();await validateImage(bytes);"], { cwd: target, stdio: 'pipe', timeout: 15000 });
  execFileSync(process.execPath, [path.join(target, 'cover-runtime', 'cli.mjs'), 'doctor'], { cwd: target, stdio: 'pipe', timeout: 10000 });
  process.stdout.write(`Built experimental ${mode} runtime for ${process.platform}/${process.arch}\n`);
}
