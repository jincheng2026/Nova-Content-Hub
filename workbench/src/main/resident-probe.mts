// Injected only into an external verification copy, never shipped with the workbench.
import {app, dialog} from 'electron';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {startDesktop} from './desktop.mts';
import {openLibrary} from '../../../plugin-src/src/lib/file-library/index.mjs';

const root = process.env.NOVA_RESIDENT_PROBE_ROOT;
const phase = process.env.NOVA_RESIDENT_PROBE_PHASE;
if (!root || !path.isAbsolute(root) || !['save', 'discard', 'secondary'].includes(phase ?? '')) throw new Error('Run the resident probe launcher.');
const destination = path.join(root, 'library');
let choice = 2;
let prompts = 0;
dialog.showMessageBoxSync = () => { prompts += 1; return choice; };

startDesktop({
    show: true,
    onConsoleMessage: message => console.error('Resident renderer:', message),
    userData: path.join(root, 'machine'),
    dialogs: {backup: async () => null, destination: async () => destination, library: async () => destination},
    async ready({window, controller, release, tray}) {
        assert.notEqual(phase, 'secondary', 'second process must not create another window');
        assert.equal(release.AUTH_MODE, 'disabled');
        assert.ok(tray && !tray.isDestroyed(), 'actual OS tray must exist');
        assert.ok(tray.getBounds().width > 0, 'actual OS tray must have a visible position');
        window.webContents.setBackgroundThrottling(false);
        let saveCompletions = 0;
        const execute = window.webContents.executeJavaScript.bind(window.webContents);
        window.webContents.executeJavaScript = async <T,>(script: string, userGesture?: boolean): Promise<T> => {
            const result: T = await execute(script, userGesture);
            if (script.includes("new CustomEvent('nova-save-close'")) { saveCompletions += 1; console.log(`Resident ${phase}: save-close completed with ${JSON.stringify(result)}`); }
            return result;
        };
        const timings: Record<string, number> = {};
        const createLibrary = controller.createLibrary.bind(controller), seed = controller.covers.seed.bind(controller.covers);
        controller.covers.seed = async () => {
            const started = Date.now();
            console.log(`Resident ${phase}: builtin seed started`);
            try { return await seed(); }
            finally { timings.seedMs = Date.now() - started; console.log(`Resident ${phase}: builtin seed finished in ${timings.seedMs} ms`); }
        };
        controller.createLibrary = async () => {
            const started = Date.now();
            console.log(`Resident ${phase}: controller.createLibrary started`);
            const progress = setInterval(() => { console.log(`Resident ${phase}: create elapsed ${Date.now() - started} ms; busy=${controller.busy}; current=${!!controller.binding.current}; seedPending=${!!controller.binding.seedPending}`); }, 5000);
            try { return await createLibrary(); }
            finally { clearInterval(progress); timings.createLibraryMs = Date.now() - started; console.log(`Resident ${phase}: controller.createLibrary finished in ${timings.createLibraryMs} ms`); }
        };
        const run = <T = unknown,>(script: string): Promise<T> => window.webContents.executeJavaScript(script);
        const wait = async (condition: () => boolean | Promise<boolean>, timeoutMs = 15000) => {
            const end = Date.now() + timeoutMs;
            while (!await condition()) {
                if (Date.now() > end) throw new Error(`Resident state timed out: ${await run<string>('document.body.innerText.slice(0, 1600)')}`);
                await new Promise(resolve => setTimeout(resolve, 25));
            }
        };
        const idle = (timeoutMs = 15000) => wait(() => run<boolean>(`!!document.querySelector('main[data-busy="false"]')`), timeoutMs);
        const click = async (id: string) => { await run(`document.getElementById(${JSON.stringify(id)}).click()`); await idle(); };
        const fill = async (id: string, value: string) => {
            await run(`(()=>{const el=document.getElementById(${JSON.stringify(id)});Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
        };
        const draft = () => run<string>(`document.getElementById('content-body').value`);
        const show = async () => { tray.emit('click'); await wait(() => window.isVisible()); };
        await wait(() => run<boolean>(`!!document.querySelector('[data-loaded="true"]')`));
        await idle();
        await run(`document.getElementById('welcome-create-library').click()`);
        // The full builtin catalog took 16 seconds to seed; keep its deadline separate from UI transitions.
        await idle(45000);
        await wait(() => run<boolean>(`!!document.querySelector('.creator-overview') && !document.querySelector('main[data-busy="true"]')`));
        await click('nav-content');
        await wait(() => run<boolean>(`!!document.getElementById('new-content')`));
        await click('new-content');
        await fill('content-title', 'resident draft');
        await fill('content-body', 'unsaved body survives hiding');
        await wait(() => run<boolean>(`document.getElementById('dirty-state').textContent === '有未保存草稿'`));
        window.close();
        assert.equal(window.isDestroyed(), false);
        assert.equal(window.isVisible(), false);
        assert.equal(prompts, 0);
        await show();
        assert.equal(await draft(), 'unsaved body survives hiding');
        window.minimize();
        await wait(() => window.isMinimized());
        app.emit('activate');
        await wait(() => window.isVisible() && !window.isMinimized());
        window.close();
        await new Promise<void>((resolve, reject) => {
            const child = spawn(process.execPath, [fileURLToPath(import.meta.url)], {
                env: {...process.env, NOVA_RESIDENT_PROBE_PHASE: 'secondary'},
                stdio: 'inherit'
            });
            child.once('error', reject);
            child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Second instance exited ${code}`)));
        });
        await wait(() => window.isVisible());
        assert.equal(await draft(), 'unsaved body survives hiding');
        console.log(`PASS actual native tray: hide preserves dirty renderer; tray click, macOS activation and second process restore the same window (${phase})`);
        if (phase === 'discard') {
            choice = 1;
            app.once('will-quit', () => {
                try {
                    assert.equal(openLibrary(destination).listContents().length, 0);
                    writeFileSync(path.join(root, 'receipt.json'), JSON.stringify({phase, discarded: true, prompts, timings}));
                    console.log('PASS explicit native quit can deliberately discard the dirty draft');
                } catch (error) { console.error(error); app.exit(1); }
            });
            app.quit();
            return;
        }
        app.quit();
        await wait(() => prompts === 1);
        assert.equal(window.isDestroyed(), false);
        assert.equal(await draft(), 'unsaved body survives hiding');
        window.close();
        assert.equal(window.isVisible(), false);
        assert.equal(prompts, 1);
        await show();
        const create = controller.createContent.bind(controller);
        controller.createContent = async () => { throw new Error('resident probe save failure'); };
        choice = 0;
        app.quit();
        await wait(() => run<boolean>(`document.getElementById('error').textContent.includes('resident probe save failure')`));
        assert.equal(window.isDestroyed(), false);
        assert.equal(await draft(), 'unsaved body survives hiding');
        await wait(() => saveCompletions === 1);
        window.close();
        assert.equal(window.isVisible(), false);
        assert.equal(prompts, 2);
        await show();
        controller.createContent = create;
        console.log('PASS actual dirty renderer: cancelled quit and failed save retain draft and reset ordinary close to hide');
        app.once('will-quit', () => {
            try {
                const contents = openLibrary(destination).listContents();
                assert.equal(contents.length, 1);
                assert.equal(openLibrary(destination).readContent(contents[0]!.id).body, 'unsaved body survives hiding');
                writeFileSync(path.join(root, 'receipt.json'), JSON.stringify({phase, saved: true, prompts, timings}));
                console.log('PASS actual save-before-quit commits the draft through the utility worker and exits');
            } catch (error) { console.error(error); app.exit(1); }
        });
        app.quit();
    }
}).catch(error => { console.error(error); app.exit(1); });
