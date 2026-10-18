// Injected only into external verification copies; this entry is excluded from release packages.
import {app, BrowserWindow, session, nativeImage, utilityProcess} from 'electron';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {startDesktop} from './desktop.mts';
import {WorkerClient} from './worker-client.mts';
import {createHash} from 'node:crypto';
import {openLibrary, createLibrary} from '../../../plugin-src/src/lib/file-library/index.mjs';
import type {Content, DesktopMethod, DesktopResults, DesktopInputs, Reply, Mutation} from '../shared/contracts.ts';

const root = process.env.NOVA_DESKTOP_PROBE_ROOT;
const phase = process.env.NOVA_DESKTOP_PROBE_PHASE;
if (!root || !path.isAbsolute(root)) throw new Error('Run the lifecycle probe launcher.');
const destination = path.join(root, 'library');
const malicious = '<script>globalThis.untrustedExecuted=true</script>';
const messages: string[] = [];
const beganAt = Date.now();
let currentStage = 'startup';
const stage = (label: string) => {
    currentStage = label;
    console.log(`STAGE ${new Date().toISOString()} +${Date.now() - beganAt}ms ${phase}: ${label}`);
};
const preserveFailure = async (error: unknown) => {
    console.error(error);
    try {
        await fs.writeFile(path.join(root, `${phase}-failed.json`), JSON.stringify({phase, stage: currentStage, elapsedMs: Date.now() - beganAt, error: String(error)}, null, 2));
        const window = BrowserWindow.getAllWindows().find(candidate => !candidate.isDestroyed());
        if (window) await fs.writeFile(path.join(root, `${phase}-failed.png`), (await window.webContents.capturePage()).toPNG());
    } catch (captureError) { console.error('Could not preserve lifecycle failure evidence', captureError); }
};
process.once('SIGTERM', () => { void preserveFailure(new Error('Launcher phase timeout')).finally(() => app.exit(1)); });
let dockCalls = 0;
const setDockIcon = app.dock?.setIcon.bind(app.dock);
if (app.dock && setDockIcon) app.dock.setIcon = icon => {
    setDockIcon(icon);
    dockCalls += 1;
};
const tree = async (directory: string) => {
    const result: [string, string | null][] = [];
    for (const relative of (await fs.readdir(directory, {recursive: true})).sort()) {
        const file = path.join(directory, relative);
        const stat = await fs.lstat(file);
        result.push([relative, stat.isDirectory() ? null : createHash('sha256').update(await fs.readFile(file)).digest('hex')]);
    }
    return result;
};
startDesktop({
    show: false,
    userData: path.join(root, 'machine'),
    dialogs: {backup: async () => null, destination: async () => destination, library: async () => destination},
    onConsoleMessage: message => messages.push(message),
    async ready({window, controller, worker, release}) {
        window.webContents.setBackgroundThrottling(false);
        const icon = nativeImage.createFromPath(fileURLToPath(new URL('../brand/icon.png', import.meta.url)));
        assert.equal(icon.isEmpty(), false);
        assert.deepEqual(icon.getSize(), {width: 512, height: 512});
        assert.deepEqual(icon.getScaleFactors(), [1, 2]);
        if (process.platform === 'darwin') assert.equal(dockCalls, 1);
        console.log(`PASS bundled NativeImage 512px, scales 1/2, actual Dock calls ${dockCalls}`);
        const run = <T = unknown, >(script: string): Promise<T> => window.webContents.executeJavaScript(script);
        const bridge = async <K extends DesktopMethod>(method: K, input?: DesktopInputs[K]): Promise<DesktopResults[K]> => {
            const result = await run<Reply<DesktopResults[K]>>(`window.contentHub.${method}(${input === undefined ? '' : JSON.stringify(input)})`);
            assert.equal(result.ok, true, JSON.stringify(result));
            return result.value;
        };
        const rejected = async (method: DesktopMethod, input: unknown, code: string) => {
            const result = await run<Reply<unknown>>(`window.contentHub.${method}(${input === undefined ? '' : JSON.stringify(input)})`);
            assert.equal(result.ok, false);
            if (!result.ok) assert.equal(result.error.code, code);
        };
        const wait = (condition: string) => run(`new Promise((resolve,reject)=>{const end=Date.now()+15000;const check=()=>{if(${condition})return resolve(true);if(Date.now()>end)return reject(new Error('State timeout: '+document.getElementById('error')?.textContent));setTimeout(check,25)};check()})`);
        const idle = () => wait(`document.querySelector('main[data-app="ready"][data-loaded="true"][data-busy="false"]')`);
        const clickSelector = async (selector: string, text?: string) => {
            const target = `[...document.querySelectorAll(${JSON.stringify(selector)})].find(el => el.checkVisibility() && !el.disabled && ${text === undefined ? 'true' : `el.textContent.trim() === ${JSON.stringify(text)}`} && (!document.querySelector('dialog:modal') || document.querySelector('dialog:modal').contains(el)))`;
            await wait(`!!(${target})`);
            await run(`(${target}).click()`);
            await idle();
        };
        const click = (id: string) => clickSelector(`#${id}`);
        const openManager = async () => {
            await click('library-menu');
            await clickSelector('.library-manager-dialog .manager-tabs button', '备份与维护');
        };
        const closeManager = async () => {
            await clickSelector('.library-manager-dialog .dialog-heading button', '关闭');
            await wait(`!document.querySelector('.library-manager-dialog')`);
        };
        const fill = async (id: string, value: string) => {
            await run(`(()=>{const el=document.getElementById(${JSON.stringify(id)});Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
        };
        await wait(`document.querySelector('[data-loaded="true"]')`);
        await idle();
        assert.deepEqual(await run('({require:typeof require,process:typeof process})'), {
            require: 'undefined',
            process: 'undefined'
        });
        if (release.AUTH_MODE === 'required') {
            await rejected('createLibrary', undefined, 'AUTH_NOT_CONFIGURED');
            await bridge('openLibrary');
            const list = await bridge('listContents');
            const item = list[0]!;
            const binding = controller.binding.current!;
            const requests: Mutation[] = [
                {op: 'createContent', input: {title: 'blocked', body: ''}, mutationId: randomUUID()},
                {
                    op: 'updateContent',
                    input: {id: item.id, editToken: item.editToken, title: 'blocked', body: ''},
                    mutationId: randomUUID()
                },
                {op: 'trashContent', input: {id: item.id, editToken: item.editToken}, mutationId: randomUUID()},
                {op: 'restoreContent', input: {id: item.id, editToken: item.editToken}, mutationId: randomUUID()},
            ];
            for (const request of requests) {
                await rejected(request.op, request.input, 'AUTH_NOT_CONFIGURED');
                await assert.rejects(worker.call('mutate', {
                    binding,
                    mutation: request
                }), {code: 'AUTH_NOT_CONFIGURED'});
            }
            await assert.rejects(worker.call('createLibrary', {
                root: destination,
                rootIdentity: binding.rootIdentity,
                mutationId: randomUUID()
            }), {code: 'AUTH_NOT_CONFIGURED'});
            assert.equal((await bridge('readContent', {id: item.id})).body, 'required readable');
            assert.equal((await bridge('listContents')).length, 1);
            assert.equal(controller.binding.pending, null);
        } else if (phase?.startsWith('guard-')) {
            if (phase === 'guard-pre') {
                const call = worker.call.bind(worker);
                worker.call = async (op, args) => {
                    if (op === 'createLibrary') {
                        await fs.rename(destination, path.join(root, 'reserved-original'));
                        await fs.mkdir(destination);
                    }
                    return call(op, args);
                };
            } else {
                // Only this external test worker enables existing core fault hooks; release auth remains unchanged.
                const wrapper = fileURLToPath(new URL('./creation-fault-worker.mjs', import.meta.url));
                const coreURL = new URL('../../../plugin-src/src/lib/file-library/index.mjs', import.meta.url).href;
                await fs.writeFile(wrapper, `import fs from 'node:fs';import path from 'node:path';import{createHash}from'node:crypto';import{openLibrary,__testing}from ${JSON.stringify(coreURL)};
process.env.NODE_ENV='test';const root=process.argv[3],phase=process.argv[4],target=path.join(root,'library');let armed=true,seed=false;
const snapshot=()=>fs.readdirSync(target,{recursive:true}).sort().map(relative=>{const file=path.join(target,relative);return[relative,fs.lstatSync(file).isDirectory()?null:createHash('sha256').update(fs.readFileSync(file)).digest('hex')]});
__testing.setHook(event=>{
if(seed&&event.phase==='afterJournal')throw new Error('pending fixture');
if(!armed)return;
if(phase==='guard-init'&&event.phase==='createAfterEmptyCheck'){armed=false;fs.renameSync(target,path.join(root,'reserved-original'));fs.mkdirSync(target);fs.writeFileSync(path.join(root,'replacement.json'),JSON.stringify(snapshot()));}
if(phase==='guard-final'&&event.phase==='createAfterFile'&&event.relative==='内容库.json'){armed=false;const library=openLibrary(target);seed=true;try{library.createContent({title:'pending fixture',body:'must not recover in replacement'})}catch(error){if(!error.pendingRecovery)throw error}finally{seed=false}fs.renameSync(target,path.join(root,'reserved-original'));fs.cpSync(path.join(root,'reserved-original'),target,{recursive:true});fs.writeFileSync(path.join(root,'replacement.json'),JSON.stringify(snapshot()));}
});await import('./worker.mjs');`);
                const faultWorker = new WorkerClient(() => utilityProcess.fork(wrapper, [release.pairId, root, phase], {stdio: 'ignore'}));
                controller.worker = faultWorker;
            }
            await rejected('createLibrary', undefined, 'CONFLICT');
            assert.ok(controller.binding.creation);
            assert.equal(controller.binding.current, null);
            const before = phase === 'guard-pre' ? [] : JSON.parse(await fs.readFile(path.join(root, 'replacement.json'), 'utf8')) as [string, string | null][];
            assert.deepEqual(await tree(destination), before);
            if (phase === 'guard-final') assert.ok(before.some(([relative]) => relative.includes('待恢复/') && relative.endsWith('intent.json')));
            controller.worker !== worker && (controller.worker as WorkerClient).stop();
            console.log(`PASS actual utility worker ${phase}: replacement unchanged; original reservation retained; no foreign pending recovery`);
        } else if (phase === 'crud') {
            stage('create library and initial content');
            await click('welcome-create-library');
            assert.ok((await bridge('status')).currentName);
            await click('nav-content');
            await click('new-content');
            await fill('content-title', malicious);
            await fill('content-body', `native body ${malicious}`);
            await click('save-content');
            await wait(`document.getElementById('dirty-state').textContent === '已保存'`);
            let list = await bridge('listContents');
            assert.equal(list.length, 1);
            const first = list[0]!;
            assert.equal(await run("document.querySelector('.content-detail-hero h2').textContent"), malicious);
            assert.equal(await run("document.getElementById('content-body').value"), `native body ${malicious}`);
            assert.equal(await run("document.querySelectorAll('.content-detail-page script').length"), 0);
            assert.equal(await run('globalThis.untrustedExecuted===true'), false);
            await fill('content-body', 'local unsaved draft');
            stage('dirty refresh and leave-stay guards');
            await click('refresh-workspace');
            assert.equal(await run("document.getElementById('content-body').value"), 'local unsaved draft');
            await clickSelector('.back-to-contents');
            assert.equal(await run("!!document.getElementById('leave-title')"), true);
            await click('leave-stay');
            await click('library-menu');
            assert.equal(await run("!!document.getElementById('leave-title')"), true);
            await click('leave-stay');
            assert.equal(await run("document.getElementById('content-body').value"), 'local unsaved draft');
            assert.equal(await run("(()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented;})()"), true);
            const core = openLibrary(destination);
            stage('external edit comparison and conflict recovery');
            core.updateContent(first.id, {body: 'disk external edit'}, first.editToken);
            await click('refresh-workspace');
            await wait(`document.getElementById('conflict')`);
            assert.equal(await run("document.getElementById('local-body').textContent"), 'local unsaved draft');
            assert.equal(await run("document.getElementById('disk-body').textContent"), 'disk external edit');
            await run("document.getElementById('conflict').scrollIntoView({block:'center'})");
            await run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
            await fs.writeFile(path.join(root, 'conflict.png'), (await window.webContents.capturePage()).toPNG());
            assert.equal(await run("document.getElementById('save-content').disabled"), true);
            await click('discard-draft');
            await fill('content-body', 'local unsaved draft');
            const latest = core.readContent(first.id);
            core.updateContent(first.id, {body: 'disk external edit after compare'}, latest.editToken);
            await click('save-content');
            assert.equal((await bridge('status')).pending?.state, 'conflict');
            assert.equal(await run("document.getElementById('content-body').value"), 'local unsaved draft');
            await clickSelector('.recovery-notice button', '继续处理');
            await click('query-pending');
            await click('keep-pending');
            assert.ok((await bridge('status')).pending);
            await click('save-as-pending');
            await closeManager();
            list = await bridge('listContents');
            assert.equal(list.length, 2);
            const copy = list.find(item => item.id !== first.id)!;
            assert.equal(copy.body, 'local unsaved draft');
            assert.equal(core.readContent(first.id).body, 'disk external edit after compare');
            await fill('content-body', 'saved before recycle');
            stage('dirty save on return and visible recycle');
            // The editor and row menu occupy separate pages; save on return before the reachable trash action.
            await clickSelector('.back-to-contents');
            assert.equal(await run("!!document.getElementById('leave-title')"), true);
            await click('leave-save');
            await wait(`!document.getElementById('leave-title') && document.querySelector('#contents tr[data-content-id="${copy.id}"]')`);
            assert.equal((await bridge('readContent', {id: copy.id})).body, 'saved before recycle');
            await clickSelector(`#contents tr[data-content-id="${copy.id}"] .content-more`);
            await clickSelector(`#contents tr[data-content-id="${copy.id}"] .content-action-menu button`, '移入回收站');
            let recycled = await bridge('readContent', {id: copy.id});
            assert.ok(recycled.deletedAt);
            assert.equal(recycled.body, 'saved before recycle');
            assert.equal((await bridge('status')).pending, null);
            assert.equal((await bridge('listContents')).length, 1);
            assert.equal((await bridge('listContents', {view: 'trash'})).length, 1);
            console.log('PASS current UI dirty-save return to list, then visible row-menu recycle: saved body retained, no pending, active/trash counts 1/1');
            stage('restore recycled content');
            recycled = await bridge('restoreContent', {id: recycled.id, editToken: recycled.editToken});
            assert.equal((await bridge('listContents')).length, 2);
            const originalRoot = path.join(root, 'original-library');
            const selected = controller.binding.current!;
            stage('rename original and copy clone');
            await fs.rename(destination, originalRoot);
            await fs.cp(originalRoot, destination, {recursive: true});
            stage('assert clone identity rejection');
            await assert.rejects(worker.call('list', {binding: selected, view: 'active'}), {code: 'CONFLICT'});
            stage('remove clone and create replacement');
            await fs.rm(destination, {recursive: true});
            createLibrary(destination);
            stage('assert replacement identity rejection');
            await assert.rejects(worker.call('list', {binding: selected, view: 'active'}), {code: 'CONFLICT'});
            stage('remove replacement and restore original root');
            await fs.rm(destination, {recursive: true});
            await fs.rename(originalRoot, destination);
            await fs.writeFile(path.join(root, 'identity.json'), JSON.stringify({
                binding: controller.binding.current,
                originalId: first.id
            }));
            stage('open library manager storage tab');
            await openManager();
            stage('manager status refresh');
            await click('refresh');
            stage('manager list refresh');
            await click('list');
            stage('close manager');
            await closeManager();
            assert.equal(await run('globalThis.untrustedExecuted===true'), false);
            assert.equal(await run("document.querySelectorAll('#contents script').length"), 0);
            stage('open restored row detail and body');
            await clickSelector(`#contents tr[data-content-id="${copy.id}"] .content-title-link`);
            assert.equal(await run("document.querySelector('.content-detail-hero h2').textContent"), malicious);
            await clickSelector('.content-detail-tabs button', '正文');
            assert.equal(await run("document.getElementById('content-body').value"), 'saved before recycle');
            assert.equal(await run("document.querySelectorAll('.content-detail-page script').length"), 0);
            await run("document.getElementById('content-title').scrollIntoView({block:'center'})");
            await run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
            stage('capture lifecycle screenshot');
            await fs.writeFile(path.join(root, 'lifecycle.png'), (await window.webContents.capturePage()).toPNG());
            stage('lifecycle screenshot captured');
        } else if (phase === 'before-exit') {
            const call = worker.call.bind(worker);
            worker.call = async (op, args) => {
                if (op === 'mutate') {
                    const saved = JSON.parse(await fs.readFile(path.join(root, 'machine/machine-binding.json'), 'utf8')) as {
                        pending: unknown
                    };
                    assert.deepEqual(saved.pending, (args as { mutation: unknown }).mutation);
                    await fs.writeFile(path.join(root, 'before.json'), JSON.stringify(saved.pending));
                    console.log('PASS actual pre-dispatch exit after durable mutation reservation');
                    app.exit(17);
                    await new Promise(() => {
                    });
                }
                return call(op, args);
            };
            await bridge('createContent', {title: 'pre-dispatch', body: 'same mutation retry'});
            throw new Error('Expected deliberate process exit');
        } else if (phase === 'after-exit') {
            const saved = JSON.parse(await fs.readFile(path.join(root, 'before.json'), 'utf8')) as {
                mutationId: string
            };
            const result = await bridge('queryPendingMutation');
            assert.equal(result?.state, 'missing');
            assert.equal(result.mutationId, saved.mutationId);
            const created = await bridge('retryPendingMutation');
            assert.ok(created);
            assert.equal(created.body, 'same mutation retry');
            assert.equal(openLibrary(destination).queryMutation(saved.mutationId)?.objectId, created.id);
            const call = worker.call.bind(worker);
            worker.call = async (op, args) => {
                const value = await call(op, args);
                if (op === 'mutate') {
                    await fs.writeFile(path.join(root, 'after.json'), JSON.stringify({
                        pending: controller.binding.pending,
                        content: value
                    }));
                    console.log('PASS actual post-commit exit before controller acknowledges result');
                    app.exit(18);
                    await new Promise(() => {
                    });
                }
                return value;
            };
            await bridge('createContent', {title: 'post-dispatch', body: 'historical receipt'});
            throw new Error('Expected deliberate process exit');
        } else if (phase === 'reopen') {
            const saved = JSON.parse(await fs.readFile(path.join(root, 'after.json'), 'utf8')) as {
                pending: { mutationId: string };
                content: Content
            };
            const identity = JSON.parse(await fs.readFile(path.join(root, 'identity.json'), 'utf8')) as {
                binding: unknown
            };
            assert.deepEqual(controller.binding.current, identity.binding);
            assert.equal(await run("document.getElementById('content-body') === null"), true);
            await clickSelector('.recovery-notice button', '继续处理');
            await click('keep-pending');
            assert.equal(await run("document.getElementById('content-body').value"), 'historical receipt');
            assert.equal(await run("document.getElementById('disk-body').textContent"), 'later external version');
            assert.ok((await bridge('status')).pending);
            const result = await bridge('queryPendingMutation');
            assert.equal(result?.state, 'committed');
            assert.equal(result.mutationId, saved.pending.mutationId);
            assert.equal(result.current?.body, 'later external version');
            assert.equal(result.draft?.body, 'historical receipt');
            await rejected('retryPendingMutation', undefined, 'NO_PENDING');
            assert.equal((await bridge('listContents')).length, 4);
            await click('list');
            await closeManager();
            assert.equal(await run('globalThis.untrustedExecuted===true'), false);
        }
        stage('invalid-input security assertions');
        await rejected('createContent', {title: 'x', body: '', path: '/tmp/injection'}, 'INVALID_INPUT');
        await rejected('readContent', {id: 'https://evil.test'}, 'INVALID_INPUT');
        stage('foreign window IPC rejection');
        const other = new BrowserWindow({
            show: false,
            webPreferences: {
                sandbox: true,
                contextIsolation: true,
                nodeIntegration: false,
                preload: fileURLToPath(new URL('../preload/index.cjs', import.meta.url))
            }
        });
        await other.loadURL('nova-content://app/index.html');
        const reply = await other.webContents.executeJavaScript('window.contentHub.status()') as Reply<unknown>;
        assert.equal(reply.ok, false);
        if (!reply.ok) assert.equal(reply.error.code, 'FORBIDDEN');
        other.destroy();
        stage('fetch registered renderer resources');
        const table = JSON.parse(await fs.readFile(new URL('../renderer-resources.json', import.meta.url), 'utf8')) as {
            entries: Record<string, { mime: string }>
        };
        for (const [url, resource] of Object.entries(table.entries)) {
            stage(`fetch registered resource ${url}`);
            const response = await session.defaultSession.fetch(`nova-content://app${url}`);
            assert.equal(response.status, 200);
            assert.equal(response.headers.get('content-type'), resource.mime);
        }
        stage('reject unregistered resource URLs and assert CSP');
        for (const suffix of ['/index.html?AUTH_MODE=disabled', '/%69ndex.html', '/assets/unregistered.js']) await assert.rejects(session.defaultSession.fetch(`nova-content://app${suffix}`));
        assert.deepEqual(messages.filter(message => /violat|refused to (load|apply|execute)|content security policy/i.test(message)), []);
        console.log(`PASS Electron ${process.versions.electron} auth-${release.AUTH_MODE}/${phase}: real IPC + utility process, lifecycle/identity/recovery, React text and CSP`);
        window.destroy();
        app.quit();
    }
}).catch(async error => {
    await preserveFailure(error);
    app.exit(1);
});
