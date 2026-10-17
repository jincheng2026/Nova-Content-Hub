import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import electron from 'electron';
import { createLibrary, openLibrary } from '../../file-library/index.mjs';
const workbench = fileURLToPath(new URL('../', import.meta.url));
const repository = path.resolve(workbench, '..');
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-native-lifecycle-probe-'));
async function launch(bundle, data, phase, expected = 0) {
  await new Promise((resolve, reject) => {
    const child = spawn(electron, [path.join(bundle, 'workbench/dist/main/lifecycle-probe.mjs')], { cwd: bundle, env: { ...process.env, NOVA_DESKTOP_PROBE_ROOT: data, NOVA_DESKTOP_PROBE_PHASE: phase }, stdio: 'inherit' });
    const timeout = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`Lifecycle probe ${phase} timed out; no runtime success claimed`)); }, 60000);
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', code => { clearTimeout(timeout); code === expected ? resolve() : reject(new Error(`Lifecycle probe ${phase} exited ${code}, expected ${expected}`)); });
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

    if (mode === 'required') { const library = createLibrary(path.join(data, 'library')); library.createContent({ title: 'required readable', body: 'required readable' }); await launch(bundle, data, 'required'); }
    else {
      await launch(bundle, data, 'crud'); await launch(bundle, data, 'before-exit', 17); await launch(bundle, data, 'after-exit', 18);
      const saved = JSON.parse(await fs.readFile(path.join(data, 'after.json'), 'utf8')); const core = openLibrary(path.join(data, 'library')); const current = core.readContent(saved.content.id); core.updateContent(current.id, { body: 'later external version' }, current.editToken);
      await launch(bundle, data, 'reopen'); await fs.copyFile(path.join(data, 'lifecycle.png'), path.join(workbench, 'verification/lifecycle-disabled.png')); await fs.copyFile(path.join(data, 'conflict.png'), path.join(workbench, 'verification/lifecycle-conflict.png'));
    }
  }
  console.log('PASS external standalone native lifecycle packages: disabled CRUD/conflict/dirty guards and 4 actual processes; required main+worker five writes refused. Native system choosers/close-dialog clicks, Windows and production authorization remain unverified.');
} finally { await fs.rm(root, { recursive: true, force: true }); }
