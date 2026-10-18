import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import electron from 'electron';
import { makeBackup } from '../../browser-import/test/fixture.mjs';
import { createLibrary } from '../../file-library/index.mjs';

const workbench = fileURLToPath(new URL('../', import.meta.url));
const repository = path.resolve(workbench, '..');
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-workbench-probe-'));
async function launch(bundle, entry, phase, data, expected = 0) {
  await new Promise((resolve, reject) => {
    const child = spawn(electron, [entry], { cwd: bundle, env: { ...process.env, NOVA_DESKTOP_PROBE_ROOT: data, NOVA_DESKTOP_PROBE_PHASE: phase }, stdio: 'inherit' });
    let failure;
    const timeout = setTimeout(() => { failure = new Error(`Electron ${phase} probe exceeded 60 seconds`); child.kill('SIGKILL'); }, 60000);
    child.once('error', error => { failure = error; if (child.pid) child.kill('SIGKILL'); });
    child.once('close', (code, signal) => { clearTimeout(timeout); if (failure) reject(failure); else code === expected ? resolve() : reject(new Error(`Electron ${phase} probe closed with code ${code}, signal ${signal}, expected ${expected}`)); });
  });
}
try {
  for (const mode of ['required', 'disabled']) {
    const bundle = path.join(root, `auth-${mode}`);
    const data = path.join(root, `data-${mode}`);
    await fs.mkdir(path.join(data, 'machine'), { recursive: true });
    await fs.cp(path.join(repository, 'dist-desktop', `auth-${mode}`), bundle, { recursive: true });
    await fs.mkdir(path.join(data, 'initial'));
    createLibrary(path.join(data, 'initial/library')).createContent({ title: 'Library A saved editor', body: 'Library A saved body' });
    const { state } = await makeBackup();
    state.data.PROJECTS.find(item => item.kind === '内容').name = '<script>globalThis.untrustedExecuted=true</script>';
    await fs.writeFile(path.join(data, 'source.json'), JSON.stringify(state));
    const native = path.join(bundle, 'workbench/dist');
    for (const filename of ['release.json', 'renderer-resources.json']) {
      const configFile = path.join(native, filename);
      const config = await fs.readFile(configFile);
      await fs.unlink(configFile);
      await launch(bundle, bundle, `missing-${filename}`, data, 1);
      await fs.writeFile(configFile, config);
      console.log(`PASS auth-${mode}: missing ${filename} refuses startup`);
    }
    // This test-only entry is injected into the external copy, never shipped in the built package.
    const entry = path.join(native, 'main/probe.mjs');
    await fs.copyFile(path.join(workbench, '.native/main/probe.mjs'), entry);
    for (const phase of ['import', 'reopen']) await launch(bundle, entry, phase, data);
    await fs.copyFile(path.join(data, 'workbench.png'), path.join(workbench, 'verification', `lifecycle-import-${mode}.png`));
  }
  console.log('PASS: both standalone auth packages copied outside the repository; real Electron sandbox/preload/IPC + React/Semi + utility-process/sharp import; second-process reopen preserves identities and later edits after source removal. System dialogs and human UI acceptance were not exercised.');
} finally { await fs.rm(root, { recursive: true, force: true }); }
