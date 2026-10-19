// Compile current native sources into an isolated stage; never launch or modify the installed app.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn, execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import electron from 'electron';
import sharp from 'sharp';
import {createLibrary, openLibrary} from '../../plugin-src/src/lib/file-library/index.mjs';

const workbench = fileURLToPath(new URL('../', import.meta.url));
const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'nova-foreground-priority-')));
const bundle = path.join(root, 'stage'), dist = path.join(bundle, 'workbench/dist');
try {
  await fs.cp(path.join(workbench, 'dist-desktop/auth-disabled'), bundle, {recursive: true});
  execFileSync(process.execPath, [path.join(workbench, 'node_modules/typescript/bin/tsc'), '-p', path.join(workbench, 'tsconfig.native.json'), '--outDir', dist], {stdio: 'inherit'});
  await fs.copyFile(path.join(workbench, 'scripts/foreground-priority-entry.mjs'), path.join(dist, 'main/foreground-priority-entry.mjs'));
  await fs.cp(path.join(workbench, '../plugin-src/src/lib'), path.join(bundle, 'plugin-src/src/lib'), {recursive: true});
  const library = createLibrary(path.join(root, 'library')), assets = {};
  for (let index = 0; index < 4; index++) {
    const source = path.join(root, `photo-${index}.png`);
    await fs.writeFile(source, await sharp({create: {width: 32, height: 24, channels: 3, background: {r: 30 + index * 40, g: 80, b: 120}}}).png().toBuffer());
    const asset = library.importAsset(source, {purpose: 'photo'});
    library.createPhoto({title: `Fixture ${index}`, assetHash: asset.assetHash, isOwnPhoto: false});
    assets[asset.assetHash] = asset.assetHash;
  }
  await fs.writeFile(path.join(root, 'assets.json'), JSON.stringify(assets));
  await new Promise((resolve, reject) => {
    const child = spawn(electron, [path.join(dist, 'main/foreground-priority-entry.mjs')], {cwd: bundle, env: {...process.env, ELECTRON_RUN_AS_NODE: '', NOVA_FOREGROUND_PRIORITY_ROOT: root}, stdio: 'inherit'});
    const timeout = setTimeout(() => {child.kill('SIGKILL'); reject(new Error('Foreground priority Electron probe exceeded 90 seconds'));}, 90000);
    child.once('error', error => {clearTimeout(timeout); reject(error);});
    child.once('close', (code, signal) => {clearTimeout(timeout); code === 0 ? resolve() : reject(new Error(`Foreground priority probe failed ${code}/${signal}`));});
  });
  const receipt = JSON.parse(await fs.readFile(path.join(root, 'receipt.json'), 'utf8'));
  assert.equal(receipt.passed, true);
  const persisted = openLibrary(path.join(root, 'library')).listContents().find(content => content.title === 'Foreground priority fixture');
  assert.equal(persisted.body, 'saved before pending images', 'save remains on disk after Electron exits');
  console.log('PASS fresh native source Electron: foreground save/read precede three queued original-image reads, all hashes verified, save persisted, no BUSY or pending operation.');
} finally {
  console.log('Isolated probe fixture and receipt:', root);
}
