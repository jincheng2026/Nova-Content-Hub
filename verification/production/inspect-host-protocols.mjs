import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';

const require = createRequire(new URL('../../workbench/package.json', import.meta.url));
const electron = require('electron');
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-host-protocols-'));
try {
    const entry = path.join(root, 'inspect.cjs');
    await fs.writeFile(entry, `
const { app } = require('electron');
app.setPath('userData', ${JSON.stringify(path.join(root, 'machine'))});
app.whenReady().then(async () => {
  const hosts = await Promise.all(['codex', 'workbuddy'].map(async host => {
    const protocol = host + '://';
    try {
      const info = await app.getApplicationInfoForProtocol(protocol);
      return { host, protocol, registered: true, name: info.name, applicationPath: info.path };
    } catch {
      return { host, protocol, registered: false, name: app.getApplicationNameForProtocol(protocol) || null };
    }
  }));
  console.log(JSON.stringify({ platform: process.platform, arch: process.arch, electron: process.versions.electron, hosts,
    appOpened: false, draftPrefilled: false, pluginTrusted: false, generationTested: false }));
  app.quit();
}).catch(error => { console.error(error.message); app.exit(1); });
`);
    const output = await new Promise((resolve, reject) => {
        const child = spawn(electron, [entry], {stdio: ['ignore', 'pipe', 'pipe']});
        let stdout = '', stderr = '';
        const timeout = setTimeout(() => {
            child.kill('SIGKILL');
            reject(new Error('Protocol lookup timed out'));
        }, 60000);
        child.stdout.on('data', bytes => {
            stdout += bytes;
        });
        child.stderr.on('data', bytes => {
            stderr += bytes;
        });
        child.once('error', error => {
            clearTimeout(timeout);
            reject(error);
        });
        child.once('exit', code => {
            clearTimeout(timeout);
            code === 0 ? resolve(stdout) : reject(new Error(stderr || `Electron exited ${code}`));
        });
    });
    const result = JSON.parse(output.trim());
    assert.deepEqual(result.hosts.map(host => host.host), ['codex', 'workbuddy']);
    assert.ok(result.hosts.every(host => typeof host.registered === 'boolean'));
    assert.equal(result.appOpened, false);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
} finally {
    await fs.rm(root, {recursive: true, force: true});
}
