import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import electron from 'electron';
import { makeBackup } from '../browser-import/test/fixture.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-electron-probe-'));
try {
  const { state } = await makeBackup();
  state.data.PROJECTS.find(item => item.kind === '内容').name = '<script>globalThis.untrustedExecuted=true</script>';
  await fs.writeFile(path.join(root, 'source.json'), JSON.stringify(state));
  for (const phase of ['import', 'reopen']) {
    await new Promise((resolve, reject) => {
      const child = spawn(electron, [path.join(here, 'probe-entry.mjs')], { env: { ...process.env, NOVA_DESKTOP_PROBE_ROOT: root, NOVA_DESKTOP_PROBE_PHASE: phase }, stdio: 'inherit' });
      const timeout = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Electron probe exceeded 60 seconds; this does not prove a UI/runtime pass.')); }, 60000);
      child.once('error', error => { clearTimeout(timeout); reject(error); });
      child.once('exit', code => { clearTimeout(timeout); code === 0 ? resolve() : reject(new Error(`Electron ${phase} probe exited ${code}`)); });
    });
  }
  console.log('PASS: real Electron sandbox/preload/IPC, utility-process import + native image decoder, second-process reopen and no replay. System dialogs and human UI acceptance were not exercised.');
} finally { await fs.rm(root, { recursive: true, force: true }); }
