import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import electron from 'electron';
import sharp from 'sharp';
import { createLibrary } from '../../plugin-src/src/lib/file-library/index.mjs';
const workbench = fileURLToPath(new URL('../', import.meta.url)), repository = path.resolve(workbench, '..');
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-native-cover-probe-'));
try {
  for (const mode of ['disabled', 'required']) {
    const bundle = path.join(root, `auth-${mode}`), data = path.join(root, `data-${mode}`); await fs.mkdir(data);
    await fs.cp(path.join(repository, 'workbench/dist-desktop', `auth-${mode}`), bundle, { recursive: true });
    await assert.rejects(fs.stat(path.join(bundle, 'workbench/dist/main/cover-probe.mjs')), { code: 'ENOENT' });
    await fs.copyFile(path.join(workbench, '.native/main/cover-probe.mjs'), path.join(bundle, 'workbench/dist/main/cover-probe.mjs'));
    await fs.writeFile(path.join(data, 'photo.jpg'), await sharp({ create: { width: 8, height: 6, channels: 3, background: '#d5c799' } }).jpeg().withMetadata({ orientation: 6 }).toBuffer());
    if (mode === 'required') createLibrary(path.join(data, 'library'));
    await new Promise((resolve, reject) => {
      const child = spawn(electron, [path.join(bundle, 'workbench/dist/main/cover-probe.mjs')], { cwd: bundle, env: { ...process.env, NOVA_DESKTOP_PROBE_ROOT: data }, stdio: 'inherit' });
      const timeout = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Cover Electron probe exceeded 120 seconds')); }, 120000);
      child.once('error', reject); child.once('close', (code, signal) => { clearTimeout(timeout); code === 0 ? resolve() : reject(new Error(`Cover probe failed ${code}/${signal}`)); });
    });
    if (mode === 'disabled') {
      await fs.copyFile(path.join(data, 'cover.png'), path.join(repository, 'docs/verification/production/2026-10-18-content-workflow-disabled.png'));
      for (const page of ['overview', 'templates', 'calendar', 'prompts']) await fs.copyFile(path.join(data, `${page}.png`), path.join(repository, `docs/verification/production/2026-10-18-desktop-${page}.png`));
    }
  }
  await fs.writeFile(path.join(repository, 'docs/verification/production/2026-10-18-content-workflow-receipt.json'), JSON.stringify({ format: 'nova-native-cover-verification', platform: process.platform, arch: process.arch, recordedAt: new Date().toISOString(), productionReady: false, syntheticCandidates: true, realHostGeneration: false, systemDialogs: false, windows: false, passed: true }, null, 2) + '\n');
  console.log('PASS external standalone native cover packages. Synthetic candidate verification only; real host, native dialog clicks and Windows remain unverified. productionReady=false');
} finally { await fs.rm(root, { recursive: true, force: true }); }
