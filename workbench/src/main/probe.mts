import {app, session, utilityProcess} from 'electron';
import {fileURLToPath} from 'node:url';
import {WorkerClient} from './worker-client.mts';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {startDesktop} from './desktop.mts';
import {openLibrary} from '../../../file-library/index.mjs';
import type {Content, DesktopMethod, DesktopResults, Reply} from '../shared/contracts.ts';

const root = process.env.NOVA_DESKTOP_PROBE_ROOT;
if (!root || !path.isAbsolute(root)) throw new Error('Run through npm run probe.');
const destination = path.join(root, 'library');
const consoleMessages: string[] = [];
const malicious = '<script>globalThis.untrustedExecuted=true</script>';
console.log(`Starting Electron probe phase: ${process.env.NOVA_DESKTOP_PROBE_PHASE}`);
startDesktop({
    onConsoleMessage: message => consoleMessages.push(message),
    show: false,
    userData: path.join(root, 'machine'),
    dialogs: {
        backup: async () => path.join(root, 'source.json'),
        destination: async () => destination,
        library: async () => path.join(root, 'initial/library')
    },
    async ready({window, controller, worker, release}) {
        const run = <T = unknown, >(script: string): Promise<T> => window.webContents.executeJavaScript(script);
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
        const preferences = (window.webContents as typeof window.webContents & {
            getLastWebPreferences(): { sandbox: boolean; contextIsolation: boolean; nodeIntegration: boolean }
        }).getLastWebPreferences();
        assert.equal(preferences.sandbox, true);
        assert.equal(preferences.contextIsolation, true);
        assert.equal(preferences.nodeIntegration, false);
        assert.deepEqual(await run('({ require: typeof require, process: typeof process, bridge: Object.keys(window.contentHub).sort() })'), {
            require: 'undefined',
            process: 'undefined',
            bridge: ['chooseBackup', 'chooseDestination', 'createContent', 'createLibrary', 'importBackup', 'listContents', 'openLibrary', 'queryPendingMutation', 'readContent', 'resolvePendingMutation', 'restoreContent', 'resumeImport', 'retryPendingMutation', 'status', 'trashContent', 'updateContent']
        });
        if (process.env.NOVA_DESKTOP_PROBE_PHASE === 'import') {
            await run('document.getElementById("open-library").click()');
            await wait(`document.querySelector('[data-busy="false"]') && document.getElementById('current-library').textContent.includes('library')`);
            await run('document.getElementById("list").click()');
            await wait(`document.querySelector('#contents details button') && document.querySelector('[data-busy="false"]')`);
            await run('document.querySelector("#contents details button").click()');
            await wait(`document.getElementById('content-body')?.value === 'Library A saved body' && document.getElementById('dirty-state').textContent === '已保存'`);
            const initialId = (await bridge('listContents'))[0]!.id;
            if (release.AUTH_MODE === 'disabled') {
                const call = worker.call.bind(worker);
                let lost = false;
                worker.call = async (op, args) => {
                    const result = await call(op, args);
                    if (op === 'import' && !lost) {
                        lost = true;
                        throw Object.assign(new Error('import response lost'), {code: 'WORKER_EXIT'});
                    }
                    return result;
                };
            }
            console.log('React business status loaded; clicking backup/destination/import');
            await run('document.getElementById("backup").click()');
            await wait(`document.querySelector('[data-busy="false"]') && document.getElementById('selection').textContent.includes('source.json')`);
            await run('document.getElementById("destination").click()');
            await wait(`document.querySelector('[data-busy="false"]') && !document.getElementById('import').disabled`);
            await run('document.getElementById("import").click()');
            if (release.AUTH_MODE === 'disabled') {
                await wait(`document.querySelector('[data-busy="false"]') && document.getElementById('status').textContent.includes('导入已完成')`, 45000);
                assert.equal(await run("document.getElementById('content-body') === null"), true);
                const resume = controller.resumeImport.bind(controller);
                const status = controller.status.bind(controller);
                let lostStatus = 0;
                controller.resumeImport = async () => {
                    await resume();
                    lostStatus = 1;
                    throw Object.assign(new Error('selection response lost after commit'), {code: 'WORKER_EXIT'});
                };
                controller.status = async () => {
                    if (lostStatus) {
                        lostStatus -= 1;
                        throw Object.assign(new Error('status read failed'), {code: 'IO_ERROR'});
                    }
                    return status();
                };
                await run('document.getElementById("resume").click()');
                await wait(`document.querySelector('[data-busy="false"][data-loaded="false"]')`);
                assert.equal(await run("document.getElementById('content-body') === null"), true);
                assert.equal(await run("document.getElementById('new-content').disabled"), true);
                controller.resumeImport = resume;
                controller.status = status;
                await run('document.getElementById("refresh").click()');
            }

            await wait(`document.querySelector('[data-busy="false"]') && document.getElementById('status').textContent.includes('导入已完成') && !document.getElementById('list').disabled`, 45000);
            assert.equal(await run('document.getElementById("error").textContent'), '');
            assert.equal((await bridge('status')).task?.status, 'committed');
            assert.equal(await run("document.getElementById('content-body') === null"), true);
            assert.equal((await bridge('listContents')).some(item => item.id === initialId), false);
            console.log('PASS saved A editor cleared before import/resume adopts B; lost selection/status cannot submit A identifiers');
            const list = await bridge('listContents');
            assert.ok(list.some(item => item.title === malicious));
            const library = openLibrary(destination);
            const content = library.listContents()[0];
            library.updateContent(content.id, {body: `edited after import ${malicious}`}, content.editToken);
            await fs.writeFile(path.join(root, 'identity.json'), JSON.stringify({
                importId: controller.binding.importId,
                libraryId: controller.binding.libraryId,
                contentId: content.id
            }));
            await fs.unlink(path.join(root, 'source.json'));
        } else {
            const identity = JSON.parse(await fs.readFile(path.join(root, 'identity.json'), 'utf8')) as {
                importId: string;
                libraryId: string;
                contentId: string
            };
            assert.equal((await bridge('status')).task?.status, 'committed');
            assert.equal(controller.binding.importId, identity.importId);
            assert.equal(controller.binding.libraryId, identity.libraryId);
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
        await assert.rejects(worker.call('list', {
            binding: {
                root: destination,
                libraryId: 'not-a-library-id',
                rootIdentity: {dev: '0', ino: '0'}
            }, view: 'active'
        }), {code: 'INVALID_INPUT'});
        const wrongWorker = new WorkerClient(() => utilityProcess.fork(fileURLToPath(new URL('./worker.mjs', import.meta.url)), ['wrong-pair'], {stdio: 'ignore'}));
        try {
            await assert.rejects(wrongWorker.call('inspect', {source: path.join(root, 'source.json')}), {code: 'RELEASE_MISMATCH'});
        } finally {
            wrongWorker.stop();
        }
        const table = JSON.parse(await fs.readFile(new URL('../renderer-resources.json', import.meta.url), 'utf8')) as {
            entries: Record<string, { mime: string }>
        };
        for (const [url, resource] of Object.entries(table.entries)) {
            const response = await session.defaultSession.fetch(`nova-content://app${url}`);
            assert.equal(response.status, 200);
            assert.equal(response.headers.get('content-type'), resource.mime);
        }
        for (const suffix of ['/index.html?mode=disabled', '/index.html#hash', '/%69ndex.html', '/assets/unregistered.js']) {
            await assert.rejects(session.defaultSession.fetch(`nova-content://app${suffix}`));
        }
        const violations = consoleMessages.filter(message => /violat|refused to (load|apply|execute)|content security policy/i.test(message));
        assert.deepEqual(violations, [], `CSP rejected the actual React/Semi page: ${JSON.stringify(violations)}`);
        console.log(`PASS Electron ${process.versions.electron}: auth-${release.AUTH_MODE}/${process.env.NOVA_DESKTOP_PROBE_PHASE}, React/Semi rendered, no CSP violation; real utility process + sharp, exact resources, text-only title/body`);
        app.quit();
    }
}).catch(error => {
    console.error(error);
    app.exit(1);
});
