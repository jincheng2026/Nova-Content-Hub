import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import electron from 'electron';
import { createLibrary, openLibrary } from '../../file-library/index.mjs';
const workbench = fileURLToPath(new URL('../', import.meta.url));
const repository = path.resolve(workbench, '..');
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-native-lifecycle-probe-'));
async function launch(bundle, data, phase, expected = 0) {
  await new Promise((resolve, reject) => {
    const child = spawn(electron, [path.join(bundle, 'workbench/dist/main/lifecycle-probe.mjs')], { cwd: bundle, env: { ...process.env, NOVA_DESKTOP_PROBE_ROOT: data, NOVA_DESKTOP_PROBE_PHASE: phase }, stdio: 'inherit' });
    let failure;
    const timeout = setTimeout(() => { failure = new Error(`Lifecycle probe ${phase} exceeded 60 seconds`); child.kill('SIGKILL'); }, 60000);
    child.once('error', error => { failure = error; if (child.pid) child.kill('SIGKILL'); });
    child.once('close', (code, signal) => { clearTimeout(timeout); if (failure) reject(failure); else code === expected ? resolve() : reject(new Error(`Lifecycle probe ${phase} closed with code ${code}, signal ${signal}, expected ${expected}`)); });
  });
}
try {
  for (const mode of ['disabled', 'required']) {
    const bundle = path.join(root, `auth-${mode}`); const data = path.join(root, `data-${mode}`);
    await fs.mkdir(data, { recursive: true }); await fs.cp(path.join(repository, 'dist-desktop', `auth-${mode}`), bundle, { recursive: true });
    for (const probe of ['probe.mjs', 'lifecycle-probe.mjs']) await assert.rejects(fs.stat(path.join(bundle, 'workbench/dist/main', probe)), { code: 'ENOENT' });
    await fs.copyFile(path.join(workbench, '.native/main/lifecycle-probe.mjs'), path.join(bundle, 'workbench/dist/main/lifecycle-probe.mjs'));
    const configFile = path.join(bundle, 'workbench/dist/release.json'); const config = await fs.readFile(configFile);
    await fs.writeFile(configFile, JSON.stringify({ AUTH_MODE: 'disabled', pairId: 'invalid-config' }));
    await launch(bundle, data, 'invalid-release', 1); await fs.writeFile(configFile, config);
    console.log(`PASS auth-${mode}: malformed release refuses startup; production package contains no probe entry`);
    const iconRoot = path.join(bundle, 'workbench/dist/brand'); const manifestFile = path.join(iconRoot, 'manifest.json'); const manifestBytes = await fs.readFile(manifestFile); const manifest = JSON.parse(manifestBytes); const originals = {};
    for (const name of ['icon.png', 'icon@2x.png']) { originals[name] = await fs.readFile(path.join(iconRoot, name)); const bad = Buffer.from('not a decodable PNG'); await fs.writeFile(path.join(iconRoot, name), bad); manifest.files[name] = createHash('sha256').update(bad).digest('hex'); }
    await fs.writeFile(manifestFile, JSON.stringify(manifest)); await launch(bundle, data, 'invalid-icon', 1);
    for (const [name, bytes] of Object.entries(originals)) await fs.writeFile(path.join(iconRoot, name), bytes);
    await fs.writeFile(manifestFile, manifestBytes); console.log(`PASS auth-${mode}: undecodable icon refuses startup without Electron default fallback`);


    if (mode === 'required') { const library = createLibrary(path.join(data, 'library')); library.createContent({ title: 'required readable', body: 'required readable' }); await launch(bundle, data, 'required'); }
    else {
      await launch(bundle, data, 'crud'); await launch(bundle, data, 'before-exit', 17); await launch(bundle, data, 'after-exit', 18);
      const saved = JSON.parse(await fs.readFile(path.join(data, 'after.json'), 'utf8')); const core = openLibrary(path.join(data, 'library')); const current = core.readContent(saved.content.id); core.updateContent(current.id, { body: 'later external version' }, current.editToken);
      await launch(bundle, data, 'reopen');
      for (const phase of ['guard-pre', 'guard-init', 'guard-final']) { const guardData = path.join(root, phase); await fs.mkdir(guardData); await launch(bundle, guardData, phase); } await fs.copyFile(path.join(data, 'lifecycle.png'), path.join(workbench, 'verification/lifecycle-disabled.png')); await fs.copyFile(path.join(data, 'conflict.png'), path.join(workbench, 'verification/lifecycle-conflict.png'));
    }
  }
  console.log('PASS external standalone native lifecycle packages: disabled CRUD/conflict/dirty guards and 7 actual disabled processes (including three guarded-creation faults); required main+worker five writes refused. Native system choosers/close-dialog clicks, Windows and production authorization remain unverified.');
} finally { await fs.rm(root, { recursive: true, force: true }); }
