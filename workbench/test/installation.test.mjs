import test from 'node:test';
import assert from 'node:assert/strict';
import {offerApplicationInstall} from '../src/main/installation.mts';

function fixture({packaged = true, installed = false, choice = 0, replacement = 1, move = () => true} = {}) {
    const prompts = [];
    const conflicts = [];
    let moves = 0;
    let installedChecks = 0;
    const app = {
        isPackaged: packaged,
        isInApplicationsFolder() { installedChecks++; return installed; },
        moveToApplicationsFolder(options) { moves++; return move(options); }
    };
    const dialog = {
        async showMessageBox(options) { prompts.push(options); return {response: choice}; },
        showMessageBoxSync(options) { conflicts.push(options); return replacement; }
    };
    return {app, dialog, prompts, conflicts, moves: () => moves, installedChecks: () => installedChecks};
}

test('only packaged macOS apps outside Applications offer installation', async () => {
    for (const [platform, options] of [['win32', {}], ['linux', {}], ['darwin', {packaged: false}], ['darwin', {installed: true}]]) {
        const f = fixture(options);
        assert.equal(await offerApplicationInstall(f.app, f.dialog, platform), 'continue');
        assert.equal(f.prompts.length, 0);
        assert.equal(f.moves(), 0);
        if (platform !== 'darwin' || options.packaged === false) assert.equal(f.installedChecks(), 0);
    }
});

test('skipping installation continues without moving the application', async () => {
    const f = fixture({choice: 1});
    assert.equal(await offerApplicationInstall(f.app, f.dialog, 'darwin'), 'continue');
    assert.equal(f.moves(), 0);
    assert.equal(f.prompts[0].cancelId, 1);
});

test('successful native move stops startup for Electron relaunch', async () => {
    const f = fixture({move: options => {
        assert.equal(typeof options.conflictHandler, 'function');
        return true;
    }});
    assert.equal(await offerApplicationInstall(f.app, f.dialog, 'darwin'), 'relaunching');
    assert.equal(f.moves(), 1);
    assert.equal(f.prompts.length, 1);
});

test('native false and thrown failure offer Finder guidance and continue', async () => {
    for (const move of [() => false, () => { throw new Error('copy failed'); }]) {
        const f = fixture({move});
        assert.equal(await offerApplicationInstall(f.app, f.dialog, 'darwin'), 'continue');
        assert.equal(f.prompts.length, 2);
        assert.match(f.prompts[1].detail, /访达/);
        assert.match(f.prompts[1].detail, /继续使用/);
    }
});

test('replacement is explicit and cancel declines without a second failure notice', async () => {
    const f = fixture({move: ({conflictHandler}) => conflictHandler('exists')});
    assert.equal(await offerApplicationInstall(f.app, f.dialog, 'darwin'), 'continue');
    assert.equal(f.conflicts.length, 1);
    assert.match(f.conflicts[0].detail, /废纸篓/);
    assert.equal(f.conflicts[0].defaultId, 1);
    assert.equal(f.conflicts[0].cancelId, 1);
    assert.equal(f.prompts.length, 1);
});

test('confirmed replacement allows the native move and relaunch', async () => {
    const f = fixture({replacement: 0, move: ({conflictHandler}) => conflictHandler('exists')});
    assert.equal(await offerApplicationInstall(f.app, f.dialog, 'darwin'), 'relaunching');
    assert.equal(f.conflicts.length, 1);
});

test('a running installed app is never silently focused or replaced', async () => {
    const f = fixture({replacement: 0, move: ({conflictHandler}) => {
        assert.equal(conflictHandler('existsAndRunning'), false);
        return false;
    }});
    assert.equal(await offerApplicationInstall(f.app, f.dialog, 'darwin'), 'continue');
    assert.match(f.conflicts[0].detail, /先退出/);
    assert.equal(f.prompts.length, 1);
});


test('an unavailable optional installation dialog does not prevent desktop startup', async () => {
    const f = fixture();
    f.dialog.showMessageBox = async () => { throw new Error('native dialog unavailable'); };
    assert.equal(await offerApplicationInstall(f.app, f.dialog, 'darwin'), 'continue');
    assert.equal(f.moves(), 0);
});
