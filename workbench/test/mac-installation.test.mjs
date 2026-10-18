import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {installMacApplication, recoverMacInstallation, confirmMacInstallation, isMacApplicationRunning} from '../src/main/mac-installation.mts';

async function fixture(t) {
    const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'nova-install-')));
    t.after(() => fs.rm(root, {recursive: true, force: true}));
    const source = path.join(root, 'source.app'), target = path.join(root, 'Applications', '自媒体工作台.app');
    for (const [app, content] of [[source, 'new'], [target, 'old']]) {
        await fs.mkdir(path.join(app, 'Contents/MacOS'), {recursive: true});
        await fs.writeFile(path.join(app, 'Contents/Info.plist'), 'plist');
        await fs.writeFile(path.join(app, 'Contents/MacOS/Workbench'), content, {mode: 0o755});
    }
    const calls = [];
    const options = {source, target, bundleIdentifier: 'com.novaisland.nova-content-hub', executable: 'Workbench',
        running: async () => false, verifySignature: async app => calls.push(app),
        copy: (from, to) => fs.cp(from, to, {recursive: true, verbatimSymlinks: true}),
        readBundle: async () => ({identifier: 'com.novaisland.nova-content-hub', executable: 'Workbench'})};
    return {root, source, target, options, calls, old: () => fs.readFile(path.join(target, 'Contents/MacOS/Workbench'), 'utf8')};
}

test('verified installation retains the complete previous app and confirms only installed startup', async t => {
    const f = await fixture(t);
    const result = await installMacApplication(f.options);
    assert.equal(await f.old(), 'new');
    assert.equal(await fs.readFile(path.join(result.transaction, 'previous.app/Contents/MacOS/Workbench'), 'utf8'), 'old');
    assert.equal(f.calls.length, 2);
    assert.equal(await confirmMacInstallation({...f.options, source: f.source}), false);
    assert.equal(await confirmMacInstallation({...f.options, source: f.target}), true);
    assert.equal((JSON.parse(await fs.readFile(path.join(result.transaction, 'record.json')))).phase, 'complete');
});

for (const failure of ['throw', 'missing', 'hash', 'mode', 'source-signature', 'candidate-signature']) {
    test(`${failure} copy or verification failure leaves old app intact`, async t => {
        const f = await fixture(t);
        const copy = async (source, candidate) => {
            if (failure === 'throw') { await fs.mkdir(candidate); throw Error('partial copy'); }
            await fs.cp(source, candidate, {recursive: true, verbatimSymlinks: true});
            const binary = path.join(candidate, 'Contents/MacOS/Workbench');
            if (failure === 'missing') await fs.rm(binary);
            if (failure === 'hash') await fs.writeFile(binary, 'bad');
            if (failure === 'mode') await fs.chmod(binary, 0o644);
        };
        await assert.rejects(installMacApplication({...f.options, copy,
            verifySignature: async app => { if ((failure === 'source-signature' && app === f.source) || (failure === 'candidate-signature' && app !== f.source)) throw Error('signature'); }}));
        assert.equal(await f.old(), 'old');
    });
}

test('internal symlinks survive copying; escaping links and unknown identities are refused', async t => {
    const f = await fixture(t);
    await fs.symlink('Workbench', path.join(f.source, 'Contents/MacOS/link'));
    await installMacApplication(f.options);
    assert.equal(await fs.readlink(path.join(f.target, 'Contents/MacOS/link')), 'Workbench');
    const g = await fixture(t);
    await fs.symlink('/tmp', path.join(g.source, 'escape'));
    await assert.rejects(installMacApplication(g.options), /symlink/);
    assert.equal(await g.old(), 'old');
    await fs.rm(path.join(g.source, 'escape'));
    await assert.rejects(installMacApplication({...g.options, readBundle: async () => ({identifier: 'unknown', executable: 'Workbench'})}));
    assert.equal(await g.old(), 'old');
});

for (const when of [1, 2]) test(`running target at check ${when} is refused before replacement`, async t => {
    const f = await fixture(t); let count = 0;
    await assert.rejects(installMacApplication({...f.options, running: async () => ++count === when}), /正在运行/);
    assert.equal(await f.old(), 'old');
});

test('running-process query failure leaves previous app intact', async t => {
    const f = await fixture(t);
    await assert.rejects(installMacApplication({...f.options, running: async () => { throw Error('query failed'); }}), /query failed/);
    assert.equal(await f.old(), 'old');
});

test('failed publish restores old app; failed rollback retains recovery record and previous app', async t => {
    for (const rollbackFails of [false, true]) {
        const f = await fixture(t);
        const rename = async (from, to) => {
            if (from.endsWith('candidate.app') || (rollbackFails && from.endsWith('previous.app'))) throw Error('rename failure');
            await fs.rename(from, to);
        };
        await assert.rejects(installMacApplication({...f.options, rename}), /rename failure/);
        if (!rollbackFails) assert.equal(await f.old(), 'old');
        else {
            const claim = JSON.parse(await fs.readFile(path.join(path.dirname(f.target), '.nova-content-hub-install')));
            const transaction = path.join(path.dirname(f.target), claim.directory);
            assert.equal(await fs.readFile(path.join(transaction, 'previous.app/Contents/MacOS/Workbench'), 'utf8'), 'old');
            assert.equal(await recoverMacInstallation(f.options), 'restored');
            assert.equal(await f.old(), 'old');
            assert.equal(await recoverMacInstallation(f.options), 'none');
        }
    }
});

test('interrupted new rename is pending; recovery refuses a replaced previous identity', async t => {
    const f = await fixture(t);
    const installed = await installMacApplication(f.options);
    const file = path.join(installed.transaction, 'record.json');
    const record = JSON.parse(await fs.readFile(file));
    await fs.writeFile(file, JSON.stringify({...record, phase: 'prepared'}));
    assert.equal(await recoverMacInstallation(f.options), 'pending');
    assert.equal(await recoverMacInstallation(f.options), 'pending');
    await fs.rename(f.target, path.join(f.root, 'published.app'));
    await fs.rename(path.join(installed.transaction, 'previous.app'), path.join(f.root, 'saved.app'));
    await fs.cp(path.join(f.root, 'saved.app'), path.join(installed.transaction, 'previous.app'), {recursive: true});
    await assert.rejects(recoverMacInstallation(f.options), /identity/);
    assert.equal(await fs.readFile(path.join(f.root, 'saved.app/Contents/MacOS/Workbench'), 'utf8'), 'old');
});

test('unknown transaction directory and target symlink are left untouched', async t => {
    const f = await fixture(t);
    const transaction = path.join(path.dirname(f.target), '.nova-content-hub-install');
    await fs.mkdir(transaction, {mode: 0o700});
    await fs.writeFile(path.join(transaction, 'unrelated'), 'keep');
    await assert.rejects(installMacApplication(f.options));
    assert.equal(await fs.readFile(path.join(transaction, 'unrelated'), 'utf8'), 'keep');
    const g = await fixture(t);
    await fs.rename(g.target, path.join(g.root, 'old.app'));
    await fs.symlink(path.join(g.root, 'old.app'), g.target);
    await assert.rejects(installMacApplication(g.options));
    assert.equal(await fs.readlink(g.target), path.join(g.root, 'old.app'));
});


test('native macOS process query distinguishes an unused app directory', {skip: process.platform !== 'darwin'}, async t => {
    const f = await fixture(t);
    assert.equal(await isMacApplicationRunning(f.target), false);
});

test('initial installation and a subsequent confirmed update preserve separate backups', async t => {
    const f = await fixture(t);
    await fs.rm(f.target, {recursive: true});
    await installMacApplication(f.options);
    assert.equal(await f.old(), 'new');
    assert.equal(await confirmMacInstallation({...f.options, source: f.target}), true);
    await fs.writeFile(path.join(f.source, 'Contents/MacOS/Workbench'), 'next');
    const result = await installMacApplication(f.options);
    assert.equal(await f.old(), 'next');
    assert.equal(await fs.readFile(path.join(result.transaction, 'previous.app/Contents/MacOS/Workbench'), 'utf8'), 'new');
});


test('another live installation owner cannot have its staging directory archived', async t => {
    const f = await fixture(t);
    const result = await installMacApplication(f.options);
    await fs.rename(f.target, path.join(result.transaction, 'candidate.app'));
    await fs.rename(path.join(result.transaction, 'previous.app'), f.target);
    const file = path.join(result.transaction, 'record.json');
    const record = JSON.parse(await fs.readFile(file));
    await fs.writeFile(file, JSON.stringify({...record, ownerPid: process.ppid, phase: 'staging', candidate: null}));
    const before = await fs.readFile(file, 'utf8');
    await assert.rejects(recoverMacInstallation(f.options), /still be running/);
    assert.equal(await fs.readFile(file, 'utf8'), before);
    assert.equal(await f.old(), 'old');
});

test('prepared journal recovers interruption between the old rename and published record', async t => {
    const f = await fixture(t);
    const result = await installMacApplication(f.options);
    await fs.rename(f.target, path.join(result.transaction, 'candidate.app'));
    const file = path.join(result.transaction, 'record.json');
    const record = JSON.parse(await fs.readFile(file));
    await fs.writeFile(file, JSON.stringify({...record, phase: 'prepared'}));
    assert.equal(await recoverMacInstallation(f.options), 'restored');
    assert.equal(await f.old(), 'old');
    assert.equal(await recoverMacInstallation(f.options), 'none');
});

test('installing from the target itself is refused without touching it', async t => {
    const f = await fixture(t);
    await assert.rejects(installMacApplication({...f.options, source: f.target}), /must differ/);
    assert.equal(await f.old(), 'old');
});


test('native ditto copy retains framework-style symlinks and executable bits', {skip: process.platform !== 'darwin'}, async t => {
    const f = await fixture(t);
    await fs.symlink('Workbench', path.join(f.source, 'Contents/MacOS/link'));
    await installMacApplication({...f.options, copy: undefined});
    assert.equal(await f.old(), 'new');
    assert.equal(await fs.readlink(path.join(f.target, 'Contents/MacOS/link')), 'Workbench');
    assert.ok((await fs.stat(path.join(f.target, 'Contents/MacOS/Workbench'))).mode & 0o111);
});

test('same-process concurrent recovery cannot archive an active copy', async t => {
    const f = await fixture(t);
    await installMacApplication({...f.options, copy: async (source, candidate) => {
        await assert.rejects(recoverMacInstallation(f.options), /still running/);
        assert.equal(await f.old(), 'old');
        await f.options.copy(source, candidate);
    }});
    assert.equal(await f.old(), 'new');
});

test('an initialized private orphan before active publication does not block a later install', async t => {
    const f = await fixture(t);
    const first = await installMacApplication(f.options);
    await fs.rename(f.target, path.join(first.transaction, 'candidate.app'));
    await fs.rename(path.join(first.transaction, 'previous.app'), f.target);
    const recordFile = path.join(first.transaction, 'record.json');
    const record = JSON.parse(await fs.readFile(recordFile));
    await fs.writeFile(recordFile, JSON.stringify({...record, phase: 'staging', candidate: null}));
    await fs.unlink(path.join(path.dirname(f.target), '.nova-content-hub-install'));
    const before = await fs.readFile(recordFile, 'utf8');
    const next = await installMacApplication(f.options);
    assert.notEqual(next.transaction, first.transaction);
    assert.equal(await fs.readFile(recordFile, 'utf8'), before);
    assert.equal(await f.old(), 'new');
});

test('published initialized staging claim recovers without deleting its private directory', async t => {
    const f = await fixture(t);
    const first = await installMacApplication(f.options);
    await fs.rename(f.target, path.join(first.transaction, 'candidate.app'));
    await fs.rename(path.join(first.transaction, 'previous.app'), f.target);
    const recordFile = path.join(first.transaction, 'record.json');
    const record = JSON.parse(await fs.readFile(recordFile));
    await fs.writeFile(recordFile, JSON.stringify({...record, phase: 'staging', candidate: null}));
    assert.equal(await recoverMacInstallation(f.options), 'none');
    assert.equal(await f.old(), 'old');
    assert.ok((await fs.stat(recordFile)).isFile());
    await assert.rejects(fs.lstat(path.join(path.dirname(f.target), '.nova-content-hub-install')), {code: 'ENOENT'});
    assert.equal(await recoverMacInstallation(f.options), 'none');
});

test('unknown active regular file and symlink are preserved without following them', async t => {
    for (const symbolic of [false, true]) {
        const f = await fixture(t);
        const active = path.join(path.dirname(f.target), '.nova-content-hub-install');
        const sentinel = path.join(f.root, 'unrelated');
        await fs.writeFile(sentinel, 'keep');
        if (symbolic) await fs.symlink(sentinel, active);
        else await fs.writeFile(active, 'unknown', {mode: 0o600});
        await assert.rejects(installMacApplication(f.options));
        assert.equal(await fs.readFile(sentinel, 'utf8'), 'keep');
        if (symbolic) assert.equal(await fs.readlink(active), sentinel);
        else assert.equal(await fs.readFile(active, 'utf8'), 'unknown');
        assert.equal(await f.old(), 'old');
    }
});

test('exclusive claim publication refuses a concurrently created unknown empty directory', async t => {
    const f = await fixture(t);
    const active = path.join(path.dirname(f.target), '.nova-content-hub-install');
    await assert.rejects(installMacApplication({...f.options, verifySignature: async app => {
        if (app === f.source) await fs.mkdir(active, {mode: 0o700});
    }}), {code: 'EEXIST'});
    assert.ok((await fs.lstat(active)).isDirectory());
    assert.deepEqual(await fs.readdir(active), []);
    assert.equal(await f.old(), 'old');
});
