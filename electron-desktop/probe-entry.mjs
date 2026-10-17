import { app } from 'electron';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startDesktop } from './desktop.mjs';
import { openLibrary } from '../file-library/index.mjs';

const root = process.env.NOVA_DESKTOP_PROBE_ROOT;
if (!root || !path.isAbsolute(root)) throw new Error('Run the probe through npm run probe.');
const destination = path.join(root, 'library');
console.log(`Starting Electron probe phase: ${process.env.NOVA_DESKTOP_PROBE_PHASE}`);
app.once('ready', () => console.log('Electron app ready'));
startDesktop({ show: false, userData: path.join(root, 'machine'), dialogs: { backup: async () => path.join(root, 'source.json'), destination: async () => destination }, async ready({ window, controller, worker }) {
    const run = script => window.webContents.executeJavaScript(script);
    const preferences = window.webContents.getLastWebPreferences();
    assert.equal(preferences.sandbox, true); assert.equal(preferences.contextIsolation, true); assert.equal(preferences.nodeIntegration, false);
    assert.deepEqual(await run('({ require: typeof require, process: typeof process, bridge: Object.keys(window.contentHub).sort() })'), { require: 'undefined', process: 'undefined', bridge: ['chooseBackup', 'chooseDestination', 'importBackup', 'listContents', 'resumeImport', 'status'] });
    if (process.env.NOVA_DESKTOP_PROBE_PHASE === 'import') {
      assert.equal((await run('window.contentHub.chooseBackup()')).ok, true);
      assert.equal((await run('window.contentHub.chooseDestination()')).ok, true);
      assert.equal((await run('window.contentHub.importBackup()')).ok, true);
      assert.equal((await run('window.contentHub.status()')).value.task.status, 'committed');
      const list = (await run('window.contentHub.listContents()')).value;
      assert.ok(list.some(item => item.title.includes('<script>')));
      const library = openLibrary(destination); const content = library.listContents()[0];
      library.updateContent(content.id, { body: 'edited after import <script>globalThis.untrustedExecuted=true</script>' }, content.editToken);
      await fs.writeFile(path.join(root, 'identity.json'), JSON.stringify({ importId: controller.binding.importId, libraryId: controller.binding.libraryId, contentId: content.id }));
      await fs.unlink(path.join(root, 'source.json'));
    } else {
      const identity = JSON.parse(await fs.readFile(path.join(root, 'identity.json'), 'utf8'));
      const status = await run('window.contentHub.status()'); assert.equal(status.ok, true, JSON.stringify(status)); assert.equal(status.value.task.status, 'committed');
      assert.equal(controller.binding.importId, identity.importId); assert.equal(controller.binding.libraryId, identity.libraryId);
      assert.equal((await run('window.contentHub.resumeImport()')).ok, true);
      const contents = (await run('window.contentHub.listContents()')).value;
      assert.equal(contents.find(item => item.id === identity.contentId).body, 'edited after import <script>globalThis.untrustedExecuted=true</script>');
    }
    await run('document.getElementById("refresh").click()');
    await run(`new Promise((resolve, reject) => {
      const until = Date.now() + 5000;
      const check = () => {
        if (!document.getElementById('list').disabled) return resolve(true);
        if (Date.now() > until) return reject(new Error('Committed content button did not become available'));
        setTimeout(check, 25);
      }; check();
    })`);
    await run('document.getElementById("list").click()');
    await run(`new Promise((resolve, reject) => {
      const until = Date.now() + 5000;
      const check = () => {
        if (document.querySelectorAll('#contents details').length > 0 && document.getElementById('contents').textContent.includes('<script>globalThis.untrustedExecuted=true</script>')) return resolve(true);
        if (Date.now() > until) return reject(new Error('Content did not actually render'));
        setTimeout(check, 25);
      }; check();
    })`);
    assert.equal(await run('globalThis.untrustedExecuted === true'), false);
    assert.equal(await run('document.querySelectorAll("#contents script").length'), 0);
    await assert.rejects(worker.call('list', { destination, libraryId: 'not-a-library-id' }), { code: 'INVALID_INPUT' });
    console.log(`PASS Electron ${process.versions.electron}: ${process.env.NOVA_DESKTOP_PROBE_PHASE}, real utility process + sandboxed renderer`);
    app.quit();
} }).catch(error => { console.error(error); app.exit(1); });
