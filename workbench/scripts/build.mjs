import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { build } from 'vite';
import { syncBridge } from '../../plugin-src/scripts/sync-bridge.mjs';
import { validateBuildConfig, validateResources, validateRelease } from '../src/main/boundary.mts';

const workbench = fileURLToPath(new URL('../', import.meta.url));
const root = path.resolve(workbench, '..');
await syncBridge(true);
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--auth' || !['required', 'disabled', 'both'].includes(args[1])) throw new Error('Use npm run build -- --auth required|disabled|both');
const npmCLI = process.env.npm_execpath;
if (!npmCLI || !fs.statSync(npmCLI).isFile()) throw new Error('Run this builder through npm so its Node/npm runtime is explicit.');
const packageJSON = JSON.parse(fs.readFileSync(path.join(workbench, 'package.json'), 'utf8'));
const release = validateBuildConfig(JSON.parse(fs.readFileSync(path.join(root, 'release.config.json'), 'utf8')));
if (!/^\d+\.\d+\.\d+$/.test(packageJSON.dependencies.sharp)) throw new Error('Pin the shared sharp runtime before building.');
const tsc = path.join(workbench, 'node_modules/typescript/bin/tsc');
for (const config of ['tsconfig.native.json', 'tsconfig.renderer.json']) execFileSync(process.execPath, [tsc, '-p', path.join(workbench, config), '--noEmit'], { stdio: 'inherit' });
fs.rmSync(path.join(workbench, '.native'), { recursive: true, force: true });
execFileSync(process.execPath, [tsc, '-p', path.join(workbench, 'tsconfig.native.json')], { stdio: 'inherit' });
const modes = args[1] === 'both' ? ['required', 'disabled'] : [args[1]];
const mimes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
for (const mode of modes) {
  const target = path.join(root, 'dist-desktop', `auth-${mode}`);
  fs.rmSync(target, { recursive: true, force: true });
  const dist = path.join(target, 'workbench/dist');
  fs.mkdirSync(dist, { recursive: true });
  fs.cpSync(path.join(workbench, '.native'), dist, { recursive: true, filter: source => path.basename(source) !== 'probe.mjs' });
  fs.writeFileSync(path.join(target, 'workbench/package.json'), JSON.stringify({ type: 'module', main: 'dist/main/index.mjs' }) + '\n');
  const preload = fs.readFileSync(path.join(dist, 'preload/index.cjs'), 'utf8');
  if ([...preload.matchAll(/require\(['"]([^'"]+)['"]\)/g)].map(match => match[1]).join() !== 'electron') throw new Error('Sandbox preload must require only electron');
  await build({ configFile: false, root: path.join(workbench, 'src/renderer'), base: './', oxc: { jsx: { runtime: 'automatic' } }, build: { outDir: path.join(dist, 'renderer'), emptyOutDir: true, modulePreload: false, sourcemap: false, target: 'chrome148' } });
  const entries = {};
  for (const file of fs.readdirSync(path.join(dist, 'renderer'), { recursive: true }).sort()) {
    const absolute = path.join(dist, 'renderer', file);
    if (fs.statSync(absolute).isDirectory()) continue;
    const mime = mimes[path.extname(file)];
    if (!mime || file.includes('..') || /[\\%?#]/.test(file)) throw new Error('Unexpected renderer resource');
    entries[`/${file}`] = { file, mime };
  }
  fs.writeFileSync(path.join(dist, 'renderer-resources.json'), JSON.stringify(validateResources({ format: 'nova-desktop-renderer-resources', schemaVersion: 1, entries }), null, 2) + '\n');
  fs.writeFileSync(path.join(dist, 'release.json'), JSON.stringify(validateRelease({ ...release, format: 'nova-content-desktop-release', schemaVersion: 1, AUTH_MODE: mode, pairId: `${release.appScope}@${release.version}:p${release.protocolVersion}:${mode}`, experimental: true, productionReady: false, platform: process.platform, arch: process.arch }), null, 2) + '\n');
  for (const name of ['file-library', 'image-validation', 'browser-import']) fs.cpSync(path.join(root, name), path.join(target, name), { recursive: true, filter: source => path.basename(source) !== 'test' });
  for (const relative of ['core.js', 'builtin-templates.js', 'shared/handoff.js']) {
    const destination = path.join(target, '原型', relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(root, '原型', relative), destination);
  }
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'browser-import/builtin-resources.json'), 'utf8'));
  if (catalog.format !== 'nova-browser-import-builtin-resources' || catalog.schemaVersion !== 1 || !catalog.entries || Object.keys(catalog.entries).length !== 72) throw new Error('Unsupported import resource catalog');
  for (const [relative, entry] of Object.entries(catalog.entries)) {
    if (!relative.startsWith('图库/') || /[\\:\u0000-\u001f]/.test(relative) || relative.split('/').some(part => !part || part === '.' || part === '..') || entry.path !== relative || !['raster', 'structure'].includes(entry.kind)) throw new Error('Unsafe bundled import resource');
    const bytes = fs.readFileSync(path.join(root, '原型', relative));
    if (bytes.length !== entry.bytes || createHash('sha256').update(bytes).digest('hex') !== entry.sha256) throw new Error('Import resource hash mismatch');
    const destination = path.join(target, '原型', relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, bytes, { flag: 'wx' });
  }
  const { type: _type, ...runtimePackage } = packageJSON;
  fs.writeFileSync(path.join(target, 'package.json'), JSON.stringify({ ...runtimePackage, main: 'workbench/dist/main/index.mjs', scripts: { start: 'electron .' } }, null, 2) + '\n');
  fs.copyFileSync(path.join(workbench, 'package-lock.json'), path.join(target, 'package-lock.json'));
  execFileSync(process.execPath, [npmCLI, 'ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: target, stdio: 'pipe', timeout: 180000 });
  execFileSync(process.execPath, ['--input-type=module', '--eval', "import sharp from 'sharp';import {validateImage} from './image-validation/index.mjs';const bytes=await sharp({create:{width:1,height:1,channels:3,background:'#fff'}}).png().toBuffer();await validateImage(bytes);"], { cwd: target, stdio: 'pipe', timeout: 15000 });
  console.log(`Built experimental desktop auth-${mode} for ${process.platform}/${process.arch}; productionReady=false`);
}
