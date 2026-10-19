import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import electron from 'electron';

const workbench = fileURLToPath(new URL('../', import.meta.url));
const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'nova-resident-probe-')));
try {
    const bundle = path.join(root, 'bundle');
    await fs.cp(path.join(workbench, 'dist-desktop/auth-disabled'), bundle, {recursive: true});
    const entry = path.join(bundle, 'workbench/dist/main/resident-probe.mjs');
    await assert.rejects(fs.stat(entry), {code: 'ENOENT'});
    await fs.copyFile(path.join(workbench, '.native/main/resident-probe.mjs'), entry);
    for (const phase of ['save', 'discard']) {
        const data = path.join(root, phase);
        await fs.mkdir(data);
        await new Promise((resolve, reject) => {
            const child = spawn(electron, [entry], {
                cwd: bundle,
                env: {...process.env, NOVA_RESIDENT_PROBE_ROOT: data, NOVA_RESIDENT_PROBE_PHASE: phase},
                stdio: 'inherit'
            });
            const timeout = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`Resident ${phase} exceeded 60 seconds`)); }, 60000);
            child.once('error', error => { clearTimeout(timeout); reject(error); });
            child.once('close', code => { clearTimeout(timeout); code === 0 ? resolve() : reject(new Error(`Resident ${phase} exited ${code}`)); });
        });
        const receipt = JSON.parse(await fs.readFile(path.join(data, 'receipt.json'), 'utf8'));
        assert.equal(receipt.phase, phase);
        assert.equal(phase === 'save' ? receipt.saved : receipt.discarded, true);
    }
    console.log('PASS standalone native resident probes; actual menu pointer clicks, Windows tray, login launch and production authorization were not tested.');
} finally {
    await fs.rm(root, {recursive: true, force: true});
}
