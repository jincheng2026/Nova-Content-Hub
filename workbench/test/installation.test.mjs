import test from 'node:test';
import assert from 'node:assert/strict';
import {confirmInstalledApplication, offerApplicationInstall} from '../src/main/installation.mts';

function fixture({packaged = true, installed = false, identifier = 'com.novaisland.nova-content-hub', choice = 0, replacement = 1, exists = false, install = async () => ({execPath: '/Applications/自媒体工作台.app/Contents/MacOS/Workbench'}), relaunch = () => {}} = {}) {
    const prompts = [], conflicts = [], launches = [];
    let installs = 0, recoveries = 0, confirmations = 0, quits = 0, installedChecks = 0;
    const app = {isPackaged: packaged, isInApplicationsFolder() { installedChecks++; return installed; },
        relaunch(options) { launches.push(options); relaunch(options); }, quit() { quits++; }};
    const dialog = {async showMessageBox(options) { prompts.push(options); return {response: choice}; }, showMessageBoxSync(options) { conflicts.push(options); return replacement; }};
    const installer = {async bundleIdentifier() { return identifier; }, async confirm() { confirmations++; }, async recover() { recoveries++; }, async exists() { return exists; }, async install() { installs++; return install(); }};
    return {app, dialog, installer, prompts, conflicts, launches, installs: () => installs, recoveries: () => recoveries, confirmations: () => confirmations, quits: () => quits, installedChecks: () => installedChecks,
        offer: () => offerApplicationInstall(app, dialog, 'darwin', installer)};
}

test('only packaged macOS apps outside Applications offer installation', async () => {
    for (const [platform, options] of [['win32', {}], ['linux', {}], ['darwin', {packaged: false}], ['darwin', {installed: true}]]) {
        const f = fixture(options);
        assert.equal(await offerApplicationInstall(f.app, f.dialog, platform, f.installer), 'continue');
        assert.equal(f.prompts.length, 0);
        assert.equal(f.installs(), 0);
        assert.equal(f.recoveries(), 0);
        if (platform !== 'darwin' || options.packaged === false) assert.equal(f.installedChecks(), 0);
    }
});

test('development, testing and unknown source identities never recover or prompt for the formal application', async () => {
    for (const identifier of ['com.novaisland.nova-content-hub.local', 'com.novaisland.nova-content-hub.testing', 'unknown']) {
        const f = fixture({identifier});
        assert.equal(await f.offer(), 'continue');
        assert.equal(f.recoveries(), 0);
        assert.equal(f.installs(), 0);
        assert.equal(f.prompts.length, 0);
        assert.equal(f.conflicts.length, 0);
        assert.equal(f.launches.length, 0);
        assert.equal(f.quits(), 0);
    }
});

test('only the installed formal macOS app confirms its installation journal', async () => {
    for (const identifier of ['com.novaisland.nova-content-hub', 'com.novaisland.nova-content-hub.local', 'com.novaisland.nova-content-hub.testing', 'unknown']) {
        const f = fixture({identifier, installed: true});
        await confirmInstalledApplication(f.app, 'darwin', f.installer);
        assert.equal(f.confirmations(), identifier === 'com.novaisland.nova-content-hub' ? 1 : 0);
    }
    for (const [platform, options] of [['win32', {installed: true}], ['darwin', {installed: false}], ['darwin', {packaged: false, installed: true}]]) {
        const f = fixture(options);
        await confirmInstalledApplication(f.app, platform, f.installer);
        assert.equal(f.confirmations(), 0);
    }
});

test('skipping installation still recovers interrupted publication before offering install', async () => {
    const f = fixture({choice: 1});
    assert.equal(await f.offer(), 'continue');
    assert.equal(f.installs(), 0);
    assert.equal(f.recoveries(), 1);
    assert.equal(f.prompts[0].cancelId, 1);
});

test('successful verified publication explicitly relaunches installed executable with safe args', async () => {
    const f = fixture();
    assert.equal(await f.offer(), 'relaunching');
    assert.equal(f.installs(), 1);
    assert.deepEqual(f.launches, [{execPath: '/Applications/自媒体工作台.app/Contents/MacOS/Workbench', args: []}]);
    assert.equal(f.quits(), 1);
});

test('copy and relaunch failures continue without a false success', async () => {
    for (const options of [{install: async () => { throw Error('copy failed'); }}, {relaunch: () => { throw Error('relaunch failed'); }}]) {
        const f = fixture(options);
        assert.equal(await f.offer(), 'continue');
        assert.equal(f.prompts.length, 2);
        assert.match(f.prompts[1].detail, /保留/);
        assert.equal(f.quits(), 0);
    }
});

test('replacement is explicit and cancel performs no installation', async () => {
    const f = fixture({exists: true});
    assert.equal(await f.offer(), 'continue');
    assert.equal(f.conflicts.length, 1);
    assert.match(f.conflicts[0].detail, /保留/);
    assert.equal(f.conflicts[0].defaultId, 1);
    assert.equal(f.installs(), 0);
    assert.equal(f.prompts.length, 1);
});

test('confirmed replacement permits verified installation', async () => {
    const f = fixture({exists: true, replacement: 0});
    assert.equal(await f.offer(), 'relaunching');
    assert.equal(f.installs(), 1);
});

test('running app and unknown recovery records produce a native notice without installation', async () => {
    const running = fixture({install: async () => { throw Error('原工作台正在运行，请先退出'); }});
    assert.equal(await running.offer(), 'continue');
    assert.match(running.prompts[1].detail, /先退出/);
    const recovery = fixture();
    recovery.installer.recover = async () => { throw Error('unknown recovery'); };
    assert.equal(await recovery.offer(), 'continue');
    assert.match(recovery.prompts[0].detail, /unknown recovery/);
    assert.equal(recovery.installs(), 0);
});

test('an unavailable optional dialog does not prevent desktop startup', async () => {
    const f = fixture(); f.dialog.showMessageBox = async () => { throw Error('dialog unavailable'); };
    assert.equal(await f.offer(), 'continue');
    assert.equal(f.installs(), 0);
});

test('deferred completed-backup cleanup preserves the current app without offering another replacement', async () => {
    const f = fixture({exists: true, replacement: 0});
    f.installer.recover = async () => 'cleanup-pending';
    assert.equal(await f.offer(), 'continue');
    assert.equal(f.prompts.length, 1);
    assert.match(f.prompts[0].message, /旧版本备份尚未完成归档/);
    assert.equal(f.conflicts.length, 0); assert.equal(f.installs(), 0); assert.equal(f.quits(), 0);
});
