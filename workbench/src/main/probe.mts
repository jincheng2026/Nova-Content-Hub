import { app, session, utilityProcess } from 'electron';
import { fileURLToPath } from 'node:url';
import { WorkerClient } from './worker-client.mts';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startDesktop } from './desktop.mts';
import { openLibrary } from '../../../file-library/index.mjs';
import type { Content, DesktopMethod, DesktopResults, Reply } from '../shared/contracts.ts';

const root = process.env.NOVA_DESKTOP_PROBE_ROOT;
if (!root || !path.isAbsolute(root)) throw new Error('Run through npm run probe.');
const destination = path.join(root, 'library');
const consoleMessages: string[] = [];
const malicious = '<script>globalThis.untrustedExecuted=true</script>';
console.log(`Starting Electron probe phase: ${process.env.NOVA_DESKTOP_PROBE_PHASE}`);
startDesktop({ onConsoleMessage: message => consoleMessages.push(message), show: false, userData: path.join(root, 'machine'), dialogs: { backup: async () => path.join(root, 'source.json'), destination: async () => destination }, async ready({ window, controller, worker, release }) {
  const run = <T = unknown,>(script: string): Promise<T> => window.webContents.executeJavaScript(script);
  const bridge = async <K extends DesktopMethod>(method: K): Promise<DesktopResults[K]> => {
    const reply = await run<Reply<DesktopResults[K]>>(`window.contentHub.${method}()`);
    assert.equal(reply.ok, true, JSON.stringify(reply));
    return reply.value;
  };
  const wait = (condition: string, timeout = 10000) => run(`new Promise((resolve, reject) => { const end = Date.now() + ${timeout}; const check = () => { if (${condition}) return resolve(true); if (Date.now() > end) return reject(new Error('Renderer business state did not settle: ' + ${JSON.stringify(condition)} + ' / ' + document.getElementById('status')?.textContent + ' / ' + document.getElementById('error')?.textContent)); setTimeout(check, 25); }; check(); })`);
  await wait(`document.querySelector('[data-app="ready"][data-loaded="true"]') && !document.getElementById('refresh').disabled`);
  if (process.env.NOVA_DESKTOP_PROBE_PHASE === 'import') {
    assert.equal(await run("getComputedStyle(document.getElementById('backup')).backgroundColor"), 'rgb(38, 108, 219)');
    await fs.writeFile(path.join(root, 'workbench.png'), (await window.webContents.capturePage()).toPNG());
  }
  const preferences = (window.webContents as typeof window.webContents & { getLastWebPreferences(): { sandbox: boolean; contextIsolation: boolean; nodeIntegration: boolean } }).getLastWebPreferences();
  assert.equal(preferences.sandbox, true); assert.equal(preferences.contextIsolation, true); assert.equal(preferences.nodeIntegration, false);
  assert.deepEqual(await run('({ require: typeof require, process: typeof process, bridge: Object.keys(window.contentHub).sort() })'), { require: 'undefined', process: 'undefined', bridge: ['chooseBackup', 'chooseDestination', 'createContent', 'createLibrary', 'importBackup', 'listContents', 'openLibrary', 'queryPendingMutation', 'readContent', 'resolvePendingMutation', 'restoreContent', 'resumeImport', 'retryPendingMutation', 'status', 'trashContent', 'updateContent'] });
  if (process.env.NOVA_DESKTOP_PROBE_PHASE === 'import') {
    console.log('React business status loaded; clicking backup/destination/import');
    await run('document.getElementById("backup").click()');
    await wait(`document.querySelector('[data-busy="false"]') && document.getElementById('selection').textContent.includes('source.json')`);
    await run('document.getElementById("destination").click()');
    await wait(`document.querySelector('[data-busy="false"]') && !document.getElementById('import').disabled`);
    await run('document.getElementById("import").click()');
    await wait(`document.querySelector('[data-busy="false"]') && document.getElementById('status').textContent.includes('导入已完成') && !document.getElementById('list').disabled`, 45000);
    assert.equal(await run('document.getElementById("error").textContent'), '');
    assert.equal((await bridge('status')).task?.status, 'committed');
    const list = await bridge('listContents'); assert.ok(list.some(item => item.title === malicious));
    const library = openLibrary(destination); const content = library.listContents()[0];
    library.updateContent(content.id, { body: `edited after import ${malicious}` }, content.editToken);
    await fs.writeFile(path.join(root, 'identity.json'), JSON.stringify({ importId: controller.binding.importId, libraryId: controller.binding.libraryId, contentId: content.id }));
    await fs.unlink(path.join(root, 'source.json'));
  } else {
    const identity = JSON.parse(await fs.readFile(path.join(root, 'identity.json'), 'utf8')) as { importId: string; libraryId: string; contentId: string };
    assert.equal((await bridge('status')).task?.status, 'committed');
    assert.equal(controller.binding.importId, identity.importId); assert.equal(controller.binding.libraryId, identity.libraryId);
    await bridge('resumeImport');
    const contents: Content[] = await bridge('listContents');
    assert.equal(contents.find(item => item.id === identity.contentId)?.body, `edited after import ${malicious}`);
  }
  await run('document.getElementById("refresh").click()');
  await wait(`document.querySelector('[data-busy="false"]') && !document.getElementById('list').disabled`);
  await run('document.getElementById("list").click()');
  await wait(`document.querySelector('[data-busy="false"]') && document.querySelectorAll('#contents details').length > 0 && document.getElementById('contents').textContent.includes(${JSON.stringify(malicious)})`);
  assert.equal(await run('globalThis.untrustedExecuted === true'), false);
  assert.equal(await run('document.querySelectorAll("#contents script").length'), 0);
  if (process.env.NOVA_DESKTOP_PROBE_PHASE === 'reopen') assert.ok(await run<boolean>(`document.querySelector('#contents pre').textContent.includes('edited after import')`));
  await assert.rejects(worker.call('list', { binding: { root: destination, libraryId: 'not-a-library-id', rootIdentity: { dev: '0', ino: '0' } }, view: 'active' }), { code: 'INVALID_INPUT' });
  const wrongWorker = new WorkerClient(() => utilityProcess.fork(fileURLToPath(new URL('./worker.mjs', import.meta.url)), ['wrong-pair'], { stdio: 'ignore' }));
  try { await assert.rejects(wrongWorker.call('inspect', { source: path.join(root, 'source.json') }), { code: 'RELEASE_MISMATCH' }); } finally { wrongWorker.stop(); }
  const table = JSON.parse(await fs.readFile(new URL('../renderer-resources.json', import.meta.url), 'utf8')) as { entries: Record<string, { mime: string }> };
  for (const [url, resource] of Object.entries(table.entries)) {
    const response = await session.defaultSession.fetch(`nova-content://app${url}`);
    assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), resource.mime);
  }
  for (const suffix of ['/index.html?mode=disabled', '/index.html#hash', '/%69ndex.html', '/assets/unregistered.js']) {
    await assert.rejects(session.defaultSession.fetch(`nova-content://app${suffix}`));
  }
  const violations = consoleMessages.filter(message => /violat|refused to (load|apply|execute)|content security policy/i.test(message));
  assert.deepEqual(violations, [], `CSP rejected the actual React/Semi page: ${JSON.stringify(violations)}`);
  console.log(`PASS Electron ${process.versions.electron}: auth-${release.AUTH_MODE}/${process.env.NOVA_DESKTOP_PROBE_PHASE}, React/Semi rendered, no CSP violation; real utility process + sharp, exact resources, text-only title/body`);
  app.quit();
} }).catch(error => { console.error(error); app.exit(1); });
