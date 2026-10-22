import {app, session, utilityProcess} from 'electron';
import {fileURLToPath} from 'node:url';
import {WorkerClient} from './worker-client.mts';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {CHANNELS} from './boundary.mts';
import {startDesktop} from './desktop.mts';
import {openLibrary} from '../../../plugin-src/src/lib/file-library/index.mjs';
import type {Content, DesktopMethod, DesktopInputs, DesktopResults, Reply} from '../shared/contracts.ts';

const root = process.env.NOVA_DESKTOP_PROBE_ROOT;
if (!root || !path.isAbsolute(root)) throw new Error('Run through npm run probe.');
const destination = path.join(root, 'library');
const consoleMessages: string[] = [];
const malicious = '<script>globalThis.untrustedExecuted=true</script>';
let selectedLibrary = path.join(root, 'initial/library');
console.log(`Starting Electron probe phase: ${process.env.NOVA_DESKTOP_PROBE_PHASE}`);
startDesktop({
    onConsoleMessage: message => consoleMessages.push(message),
    show: false,
    userData: path.join(root, 'machine'),
    dialogs: {
        destination: async () => destination,
        library: async () => selectedLibrary
    },
    async ready({window, controller, worker, release}) {
        window.webContents.setBackgroundThrottling(false);
        const timeline: {at: string; stage: string}[] = [];
        const stage = (name: string) => {
            const event = {at: new Date().toISOString(), stage: name};
            timeline.push(event);
            console.log(`PROBE ${event.at} ${release.AUTH_MODE}/${process.env.NOVA_DESKTOP_PROBE_PHASE}: ${name}`);
        };
        const run = <T = unknown, >(script: string): Promise<T> => window.webContents.executeJavaScript(script);
        const bridge = async <K extends DesktopMethod>(method: K, input?: DesktopInputs[K]): Promise<DesktopResults[K]> => {
            const reply = await run<Reply<DesktopResults[K]>>(`window.contentHub.${method}(${input === undefined ? '' : JSON.stringify(input)})`);
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
            await wait('document.querySelector(".library-manager-dialog[open] #current-library")');
        };
        const closeManager = async () => {
            await run('[...document.querySelectorAll(".library-manager-dialog[open] > .dialog-heading button")].find(button => button.textContent.trim() === "关闭").click()');
            await wait('!document.querySelector(".library-manager-dialog[open]")');
        };
        const openSavedEditor = async () => {
            await click('nav-content');
            await wait(`${idle} && document.querySelector('#contents tr[data-content-id] .content-title-link')`);
            await run('document.querySelector("#contents tr[data-content-id] .content-title-link").click()');
            await wait(`${idle} && document.querySelector('.content-detail-tabs')`);
            await run('[...document.querySelectorAll(".content-detail-tabs button")].find(button => button.textContent === "正文").click()');
            await wait(`document.getElementById('content-body')?.value === 'Library A saved body' && document.getElementById('dirty-state').textContent === '已保存'`);
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
        for (const retired of ['chooseBackup', 'chooseDestination', 'importBackup', 'resumeImport', 'queryImport']) {
            assert.equal(await run(`typeof window.contentHub[${JSON.stringify(retired)}]`), 'undefined');
        }
        if (process.env.NOVA_DESKTOP_PROBE_PHASE === 'open') {
            stage('opening native library A from welcome and checking its saved editor');
            await click('welcome-open-library');
            await wait(`${idle} && document.getElementById('library-summary').textContent === 'library'`, 45000);
            await openSavedEditor();
            const initialId = (await bridge('listContents'))[0]!.id;
            if (release.AUTH_MODE === 'disabled') {
                stage('checking durable native pending draft blocks library switching after renderer reload');
                const call = worker.call.bind(worker);
                worker.call = async (op, args) => {
                    if (op === 'mutate') throw Object.assign(new Error('native mutation not dispatched'), {code: 'WORKER_EXIT'});
                    return call(op, args);
                };
                await assert.rejects(controller.createContent({title: 'retained native draft', body: 'pending draft body'}), {code: 'WORKER_EXIT'});
                worker.call = call;
                await window.loadURL(window.webContents.getURL());
                await wait(idle, 45000);
                await openManager();
                assert.equal(await run('document.getElementById("open-library").disabled'), true);
                await click('query-pending');
                await wait(idle, 45000);
                await closeManager();
                await wait(`document.getElementById('content-body')?.value === 'pending draft body'`);
                const pending = controller.binding.pending;
                assert.ok(pending?.op === 'createContent');
                assert.equal(pending.input.body, 'pending draft body');
                await bridge('resolvePendingMutation', {action: 'discard'});
                await window.loadURL(window.webContents.getURL());
                await wait(idle, 45000);
            }
            await openSavedEditor();
            await openManager();
            selectedLibrary = destination;
            const open = controller.openLibrary.bind(controller), status = controller.status.bind(controller);
            let lostStatus = 0;
            controller.openLibrary = async () => {
                await open();
                lostStatus = 1;
                throw Object.assign(new Error('native selection response lost after commit'), {code: 'WORKER_EXIT'});
            };
            controller.status = async () => {
                if (lostStatus) {lostStatus--; throw Object.assign(new Error('status read failed'), {code: 'IO_ERROR'});}
                return status();
            };
            stage('switching to native library B with a lost selection/status response');
            await click('open-library');
            await wait(`document.querySelector('[data-busy="false"][data-loaded="false"]')`, 45000);
            assert.equal(await run("document.getElementById('content-body') === null"), true);
            assert.equal(await run("document.querySelectorAll('.content-library-page #new-content, #content-title, #content-body, #save-content').length"), 0);
            assert.equal(controller.binding.current?.root, destination);
            controller.openLibrary = open; controller.status = status;
            await closeManager();
            await click('retry-workspace');
            await wait(idle, 45000);
            assert.equal((await bridge('listContents')).some(item => item.id === initialId), false);
            assert.equal(await run('document.getElementById("error").textContent'), '');
            const library = openLibrary(destination), content = library.listContents().find(item => item.title === malicious)!;
            assert.ok(content);
            library.updateContent(content.id, {body: `edited native body ${malicious}`}, content.editToken);
            await fs.writeFile(path.join(root, 'identity.json'), JSON.stringify({
                binding: controller.binding.current, contentId: content.id
            }));
        } else {
            stage('checking reopened native binding and externally edited content');
            const identity = JSON.parse(await fs.readFile(path.join(root, 'identity.json'), 'utf8')) as {
                binding: typeof controller.binding.current; contentId: string
            };
            assert.deepEqual(controller.binding.current, identity.binding);
            const contents: Content[] = await bridge('listContents');
            assert.equal(contents.find(item => item.id === identity.contentId)?.body, `edited native body ${malicious}`);
        }
        stage('refreshing native library contents');
        await click('refresh-workspace');
        await wait(idle, 45000);
        await click('nav-content');
        await wait(`${idle} && document.querySelectorAll('#contents tr[data-content-id]').length > 0 && document.getElementById('contents').textContent.includes(${JSON.stringify(malicious)})`);
        stage('native content table rendered; checking text-only data');
        assert.equal(await run('globalThis.untrustedExecuted === true'), false);
        assert.equal(await run('document.querySelectorAll("#contents script").length'), 0);
        if (process.env.NOVA_DESKTOP_PROBE_PHASE === 'reopen') {
            const {contentId} = JSON.parse(await fs.readFile(path.join(root, 'identity.json'), 'utf8')) as {contentId: string};
            await run(`[...document.querySelectorAll('#contents tr[data-content-id]')].find(row => row.dataset.contentId === ${JSON.stringify(contentId)}).querySelector('.content-title-link').click()`);
            await wait(`${idle} && document.querySelector('.content-detail-tabs')`);
            await run('[...document.querySelectorAll(".content-detail-tabs button")].find(button => button.textContent === "正文").click()');
            await wait(`document.getElementById('content-body')?.value.includes('edited native body')`);
            assert.equal(await run('globalThis.untrustedExecuted === true'), false);
        }
        await fs.writeFile(path.join(root, 'workbench.png'), (await window.webContents.capturePage()).toPNG());
        stage('checking worker binding, release pair, static MIME, URL and CSP boundaries');
        // Renderer background reads may still occupy the app worker after its UI is idle.
        const boundaryWorker = new WorkerClient(() => utilityProcess.fork(fileURLToPath(new URL('./worker.mjs', import.meta.url)), [release.pairId], {stdio: 'ignore'}));
        try {
            await assert.rejects(boundaryWorker.call('list', {
                binding: {
                    root: destination,
                    libraryId: 'not-a-library-id',
                    rootIdentity: {dev: '0', ino: '0'}
                }, view: 'active'
            }), {code: 'INVALID_INPUT'});
        } finally {
            boundaryWorker.stop();
        }
        const wrongWorker = new WorkerClient(() => utilityProcess.fork(fileURLToPath(new URL('./worker.mjs', import.meta.url)), ['wrong-pair'], {stdio: 'ignore'}));
        try {
            await assert.rejects(wrongWorker.call('list', {binding: controller.current(), view: 'active'}), {code: 'RELEASE_MISMATCH'});
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
        stage('all native library probe assertions passed');
        console.log(`PASS Electron ${process.versions.electron}: auth-${release.AUTH_MODE}/${process.env.NOVA_DESKTOP_PROBE_PHASE}, React/Semi rendered, no CSP violation; real utility process, exact resources, text-only title/body`);
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
