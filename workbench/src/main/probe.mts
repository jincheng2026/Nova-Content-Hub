import {app, session, utilityProcess} from 'electron';
import {fileURLToPath} from 'node:url';
import {WorkerClient} from './worker-client.mts';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {CHANNELS} from './boundary.mts';
import {startDesktop} from './desktop.mts';
import {openLibrary} from '../../../plugin-src/src/lib/file-library/index.mjs';
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
        const timeline: {at: string; stage: string}[] = [];
        const stage = (name: string) => {
            const event = {at: new Date().toISOString(), stage: name};
            timeline.push(event);
            console.log(`PROBE ${event.at} ${release.AUTH_MODE}/${process.env.NOVA_DESKTOP_PROBE_PHASE}: ${name}`);
        };
        const run = <T = unknown, >(script: string): Promise<T> => window.webContents.executeJavaScript(script);
        const bridge = async <K extends DesktopMethod>(method: K): Promise<DesktopResults[K]> => {
            const reply = await run<Reply<DesktopResults[K]>>(`window.contentHub.${method}()`);
            assert.equal(reply.ok, true, JSON.stringify(reply));
            return reply.value;
        };
        const wait = (condition: string, timeout = 10000) => run(`new Promise((resolve, reject) => { const end = Date.now() + ${timeout}; const check = () => { if (${condition}) return resolve(true); if (Date.now() > end) return reject(new Error('Renderer business state did not settle: ' + ${JSON.stringify(condition)} + ' / ' + document.getElementById('status')?.textContent + ' / ' + document.getElementById('error')?.textContent)); setTimeout(check, 25); }; check(); })`);
        const click = (id: string) => wait(`(() => { const button = document.getElementById(${JSON.stringify(id)}); const modal = document.querySelector('dialog[open]'); if (!button || button.disabled || !button.getClientRects().length || getComputedStyle(button).visibility !== 'visible' || modal && !modal.contains(button)) return false; button.click(); return true; })()`);
        const idle = 'document.querySelector(\'main[data-app="ready"][data-loaded="true"][data-busy="false"]\')';
        const openManager = async () => {
            if (!await run('!!document.querySelector(".library-manager-dialog[open]")')) {
                await click('library-menu');
                await wait('document.querySelector(".library-manager-dialog[open]")');
            }
            await run('[...document.querySelectorAll(".library-manager-dialog[open] .manager-tabs button")].find(button => button.textContent.trim() === "备份与维护").click()');
            await wait('document.querySelector(".library-manager-dialog[open] #backup")');
        };
        const closeManager = async () => {
            await run('[...document.querySelectorAll(".library-manager-dialog[open] > .dialog-heading button")].find(button => button.textContent.trim() === "关闭").click()');
            await wait('!document.querySelector(".library-manager-dialog[open]")');
        };
        try {
        stage('waiting for initial renderer idle');
        await wait(idle);
        stage('initial renderer idle; checking sandbox and exact bridge');
        const preferences = (window.webContents as typeof window.webContents & {
            getLastWebPreferences(): { sandbox: boolean; contextIsolation: boolean; nodeIntegration: boolean }
        }).getLastWebPreferences();
        assert.equal(preferences.sandbox, true);
        assert.equal(preferences.contextIsolation, true);
        assert.equal(preferences.nodeIntegration, false);
        assert.deepEqual(await run('({ require: typeof require, process: typeof process, bridge: Object.keys(window.contentHub).sort() })'), {
            require: 'undefined',
            process: 'undefined',
            bridge: [...CHANNELS, 'onWorkspaceChanged', 'importLocalFiles']
        .sort() });
        if (process.env.NOVA_DESKTOP_PROBE_PHASE === 'import') {
            stage('opening library A from welcome');
            await click('welcome-open-library');
            await wait(`${idle} && document.getElementById('library-summary').textContent === 'library'`, 45000);
            stage('library A summary loaded; navigating to content');
            await click('nav-content');
            await wait(`${idle} && document.querySelector('#contents tr[data-content-id] .content-title-link')`);
            stage('library A content row rendered; opening saved body');
            await run('document.querySelector("#contents tr[data-content-id] .content-title-link").click()');
            await wait(`${idle} && document.querySelector('.content-detail-tabs')`);
            await run('[...document.querySelectorAll(".content-detail-tabs button")].find(button => button.textContent === "正文").click()');
            await wait(`document.getElementById('content-body')?.value === 'Library A saved body' && document.getElementById('dirty-state').textContent === '已保存'`);
            const initialId = (await bridge('listContents'))[0]!.id;
            const initialRoot = controller.binding.current?.root;
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
            stage('library A body verified; opening import manager');
            await openManager();
            assert.deepEqual(await run(`(() => { const style = getComputedStyle(document.getElementById('backup')); return {background: style.backgroundColor, primary: style.getPropertyValue('--semi-color-primary').trim()}; })()`), {background: 'rgb(50, 107, 216)', primary: '#326bd8'});
            await fs.writeFile(path.join(root, 'workbench.png'), (await window.webContents.capturePage()).toPNG());
            console.log('React business status loaded; clicking backup/destination/import');
            await click('backup');
            await wait(`document.querySelector('[data-busy="false"]') && document.getElementById('selection').textContent.includes('source.json')`);
            await click('destination');
            await wait(`document.querySelector('[data-busy="false"]') && !document.getElementById('import').disabled`);
            stage('backup and destination selected; importing B');
            await click('import');
            if (release.AUTH_MODE === 'disabled') {
                await wait(`document.querySelector('[data-busy="false"]') && document.getElementById('status').textContent.includes('导入已完成')`, 45000);
                assert.equal(await run("document.getElementById('content-body') === null"), true);
                assert.equal(controller.binding.current?.root, initialRoot);
                assert.ok((await bridge('listContents')).some(item => item.id === initialId));
                stage('lost import acknowledgement kept binding A; resuming B with lost status');
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
                await click('resume');
                await wait(`document.querySelector('[data-busy="false"][data-loaded="false"]')`);
                assert.equal(await run("document.getElementById('content-body') === null"), true);
                assert.equal(await run("document.querySelector('.content-library-page #new-content')?.disabled"), true);
                controller.resumeImport = resume;
                controller.status = status;
                await click('refresh');
            }

            await wait(`document.querySelector('[data-busy="false"]') && document.getElementById('status').textContent.includes('导入已完成') && !document.getElementById('list').disabled`, 45000);
            assert.equal(await run('document.getElementById("error").textContent'), '');
            assert.equal((await bridge('status')).task?.status, 'committed');
            assert.equal(await run("document.getElementById('content-body') === null"), true);
            assert.equal((await bridge('listContents')).some(item => item.id === initialId), false);
            console.log('PASS saved A editor cleared before import/resume adopts B; lost selection/status cannot submit A identifiers');
            stage('import B adopted; editing fixture and removing source backup');
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
            stage('checking reopened binding and edited content without source backup');
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
        stage('refreshing imported content through manager');
        await openManager();
        await click('refresh');
        await wait(`${idle} && !document.getElementById('list').disabled`);
        await click('list');
        await wait(idle);
        await closeManager();
        await click('nav-content');
        await wait(`${idle} && document.querySelectorAll('#contents tr[data-content-id]').length > 0 && document.getElementById('contents').textContent.includes(${JSON.stringify(malicious)})`);
        stage('imported content table rendered; checking text-only data');
        assert.equal(await run('globalThis.untrustedExecuted === true'), false);
        assert.equal(await run('document.querySelectorAll("#contents script").length'), 0);
        if (process.env.NOVA_DESKTOP_PROBE_PHASE === 'reopen') {
            const {contentId} = JSON.parse(await fs.readFile(path.join(root, 'identity.json'), 'utf8')) as {contentId: string};
            await run(`[...document.querySelectorAll('#contents tr[data-content-id]')].find(row => row.dataset.contentId === ${JSON.stringify(contentId)}).querySelector('.content-title-link').click()`);
            await wait(`${idle} && document.querySelector('.content-detail-tabs')`);
            await run('[...document.querySelectorAll(".content-detail-tabs button")].find(button => button.textContent === "正文").click()');
            await wait(`document.getElementById('content-body')?.value.includes('edited after import')`);
            assert.equal(await run('globalThis.untrustedExecuted === true'), false);
        }
        stage('checking worker binding, release pair, static MIME, URL and CSP boundaries');
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
        stage('all import probe assertions passed');
        console.log(`PASS Electron ${process.versions.electron}: auth-${release.AUTH_MODE}/${process.env.NOVA_DESKTOP_PROBE_PHASE}, React/Semi rendered, no CSP violation; real utility process + sharp, exact resources, text-only title/body`);
        app.quit();
        } catch (failure) {
            stage('failure; capturing bounded diagnostics before exit');
            const bounded = async <T, >(action: () => Promise<T>): Promise<T> => {
                let timer: ReturnType<typeof setTimeout> | undefined;
                try {
                    return await Promise.race([action(), new Promise<never>((_, reject) => {timer = setTimeout(() => reject(new Error('Failure diagnostic timed out after 3 seconds')), 3000);})]);
                } finally { clearTimeout(timer); }
            };
            const binding = structuredClone(controller.binding);
            const backendState: Record<string, unknown> = {};
            const readDiagnostic = async (key: string, read: () => Promise<unknown>) => {
                try { backendState[key] = await read(); }
                catch (error) { backendState[key] = {error: String(error)}; }
            };
            const [renderer, backend, screenshot] = await Promise.allSettled([
                bounded(() => run(`({url: location.href, main: {...document.querySelector('main')?.dataset}, error: document.getElementById('error')?.textContent, status: document.getElementById('status')?.textContent, library: document.getElementById('library-summary')?.textContent, heading: document.querySelector('h1')?.textContent, dialogs: [...document.querySelectorAll('dialog')].map(dialog => ({open: dialog.open, label: dialog.getAttribute('aria-labelledby') || dialog.getAttribute('aria-label'), text: dialog.textContent.slice(0, 2000)})), nav: [...document.querySelectorAll('.app-navigation nav button')].map(button => ({id: button.id, current: button.getAttribute('aria-current'), disabled: button.disabled})), rowCount: document.querySelectorAll('#contents tr[data-content-id]').length, contentPage: !!document.querySelector('.content-library-page'), contentDetail: !!document.querySelector('.content-detail-page'), buttons: [...document.querySelectorAll('#welcome-open-library, #new-content, #refresh-workspace')].map(button => ({id: button.id, disabled: button.disabled})), pageText: document.body.innerText.slice(0, 12000)})`)),
                bounded(async () => {
                    await readDiagnostic('status', () => controller.status());
                    await readDiagnostic('contents', () => controller.listContents({view: 'active'}));
                    await readDiagnostic('rendererContents', () => run('window.contentHub.listContents({view: "active"})'));
                }),
                bounded(async () => fs.writeFile(path.join(root, `probe-failure-${process.env.NOVA_DESKTOP_PROBE_PHASE}.png`), (await window.webContents.capturePage()).toPNG()))
            ]);
            const result = (value: PromiseSettledResult<unknown>) => value.status === 'fulfilled' ? value.value : {error: String(value.reason)};
            await fs.writeFile(path.join(root, `probe-failure-${process.env.NOVA_DESKTOP_PROBE_PHASE}.json`), JSON.stringify({at: new Date().toISOString(), mode: release.AUTH_MODE, phase: process.env.NOVA_DESKTOP_PROBE_PHASE, failure: failure instanceof Error ? {message: failure.message, stack: failure.stack} : String(failure), timeline, consoleMessages, binding, controllerBusy: controller.busy, renderer: result(renderer), backend: {...backendState, capture: result(backend)}, screenshot: result(screenshot)}, null, 2));
            throw failure;
        }
    }
}).catch(error => {
    console.error(error);
    app.exit(1);
});
