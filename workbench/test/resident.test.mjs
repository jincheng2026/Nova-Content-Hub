import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {keepResident} from '../src/main/resident.mts';

function fixture({tray = true, dirty = true, choice = 2, saved = false} = {}) {
    const app = new EventEmitter();
    const window = new EventEmitter();
    const webContents = new EventEmitter();
    let destroyed = false, visible = true, minimized = false, prompts = 0, exits = 0, focuses = 0;
    const event = () => ({defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }});
    Object.assign(window, {
        webContents,
        isDestroyed: () => destroyed,
        isMinimized: () => minimized,
        restore() { minimized = false; },
        show() { visible = true; },
        focus() { focuses += 1; },
        hide() { visible = false; },
        close() {
            const close = event();
            window.emit('close', close);
            if (close.defaultPrevented) return;
            if (dirty) {
                const unload = event();
                webContents.emit('will-prevent-unload', unload);
                if (!unload.defaultPrevented) return;
            }
            destroyed = true;
            app.quit();
        }
    });
    app.quit = () => {
        const before = event();
        app.emit('before-quit', before);
        if (!before.defaultPrevented) exits += 1;
    };
    webContents.executeJavaScript = async () => {
        const result = await (typeof saved === 'function' ? saved() : saved);
        if (result === true) dirty = false;
        return result;
    };
    const resident = keepResident(app, window, () => tray, () => { prompts += 1; return choice; });
    return {app, window, resident, state: () => ({destroyed, visible, minimized, prompts, exits, focuses}), minimize() { minimized = true; }};
}

test('ordinary close hides the existing dirty window; reveal restores and focuses it', () => {
    const f = fixture();
    f.window.close();
    assert.equal(f.state().visible, false);
    assert.equal(f.state().destroyed, false);
    assert.equal(f.state().prompts, 0);
    f.minimize();
    f.resident.show();
    assert.equal(f.state().minimized, false);
    assert.equal(f.state().visible, true);
    assert.equal(f.state().focuses, 1);
});

test('cancelled quit resets intent so the next ordinary close hides', () => {
    const f = fixture();
    f.app.quit();
    assert.equal(f.state().prompts, 1);
    assert.equal(f.state().exits, 0);
    f.window.close();
    assert.equal(f.state().prompts, 1);
    assert.equal(f.state().visible, false);
});

test('explicit discard exits; clean quit and no-tray close can also exit', () => {
    for (const options of [{choice: 1}, {dirty: false}, {tray: false, dirty: false}]) {
        const f = fixture(options);
        if (options.tray === false) f.window.close(); else f.app.quit();
        assert.equal(f.state().destroyed, true);
        assert.equal(f.state().exits, 1);
    }
});

test('save-before-quit only retries quit for an exact true response', async () => {
    for (const saved of [true, false, undefined, 'true', {ok: true}]) {
        const f = fixture({choice: 0, saved});
        f.app.quit();
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(f.state().destroyed, saved === true);
        assert.equal(f.state().exits, saved === true ? 1 : 0);
        if (saved !== true) {
            f.window.close();
            assert.equal(f.state().visible, false);
            assert.equal(f.state().prompts, 1);
        }
    }
});

test('save failure and concurrent quit keep the draft window and clear quit intent', async () => {
    let reject;
    const f = fixture({choice: 0, saved: () => new Promise((_resolve, fail) => { reject = fail; })});
    f.app.quit();
    f.window.close();
    f.app.quit();
    assert.equal(f.state().prompts, 1);
    assert.equal(f.state().visible, true);
    reject(new Error('save failed'));
    await new Promise(resolve => setImmediate(resolve));
    f.window.close();
    assert.equal(f.state().visible, false);
    assert.equal(f.state().destroyed, false);
});

test('without a tray, dirty close still offers cancel, discard and save', async () => {
    for (const choice of [0, 1, 2]) {
        const f = fixture({tray: false, choice, saved: true});
        f.window.close();
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(f.state().destroyed, choice !== 2);
        assert.equal(f.state().visible, true);
        assert.equal(f.state().prompts, 1);
    }
});
