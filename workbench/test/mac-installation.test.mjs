import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile, spawnSync} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {snapshotPackage} from '../../plugin-src/src/lib/package-snapshot.mjs';
import {archiveCompletedMacBackup, installMacApplication, recoverMacInstallation, confirmMacInstallation, isMacApplicationRunning, isMacInstallationBackupExecutable} from '../src/main/mac-installation.mts';

const execute = promisify(execFile);
const archive = (source, destination) => execute('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', source, destination]);

function crashArchive(target, transaction, scenario) {
    return spawnSync(process.execPath, ['--input-type=module', '--eval', `
        import fs from 'node:fs/promises';
        import path from 'node:path';
        import {execFile} from 'node:child_process';
        import {promisify} from 'node:util';
        import {archiveCompletedMacBackup} from ${JSON.stringify(new URL('../src/main/mac-installation.mts', import.meta.url).href)};
        const target = process.argv[1], directory = process.argv[2], scenario = process.argv[3];
        const remove = fs.rm;
        fs.rm = async (file, options) => {
            const partial = scenario === 'retirement-rm' ? path.join(directory, 'previous.retiring') : path.join(directory, '.verify-previous/payload');
            if (scenario !== 'after-extract' && file === partial) {
                const app = scenario === 'retirement-rm' ? file : path.join(file, 'previous.app');
                await fs.unlink(path.join(app, 'Contents/MacOS/Workbench'));
                process.exit(24);
            }
            return remove(file, options);
        };
        await archiveCompletedMacBackup({source: target, target, bundleIdentifier: 'com.novaisland.nova-content-hub', executable: 'Workbench', running: async () => false,
            verifySignature: async () => {}, readBundle: async app => ({identifier: await fs.readFile(path.join(app, 'Contents/Info.plist'), 'utf8'), executable: 'Workbench'}),
            extractPrevious: async (archive, destination) => {await promisify(execFile)('/usr/bin/ditto', ['-x', '-k', archive, destination]); if (scenario === 'after-extract') process.exit(23);}
        }, directory);
        process.exit(1);
    `, target, transaction, scenario], {encoding: 'utf8', timeout: 20000});
}

async function fixture(t, identifier = 'com.novaisland.nova-content-hub') {
    const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'nova-install-')));
    t.after(() => fs.rm(root, {recursive: true, force: true}));
    const source = path.join(root, 'source.app'), target = path.join(root, 'Applications', '自媒体工作台.app');
    for (const [app, content] of [[source, 'new'], [target, 'old']]) {
        await fs.mkdir(path.join(app, 'Contents/MacOS'), {recursive: true});
        await fs.writeFile(path.join(app, 'Contents/Info.plist'), identifier);
        await fs.writeFile(path.join(app, 'Contents/MacOS/Workbench'), content, {mode: 0o755});
    }
    const calls = [];
    const options = {source, target, bundleIdentifier: identifier, executable: 'Workbench',
        running: async () => false, verifySignature: async app => calls.push(app),
        copy: (from, to) => fs.cp(from, to, {recursive: true, verbatimSymlinks: true}),
        readBundle: async app => ({identifier: await fs.readFile(path.join(app, 'Contents/Info.plist'), 'utf8'), executable: 'Workbench'})};
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

test('completed installation retires the launchable raw previous app into a recoverable archive', {skip: process.platform !== 'darwin'}, async t => {
    const f = await fixture(t);
    const installed = await installMacApplication(f.options);
    assert.equal(await confirmMacInstallation({...f.options, source: f.target}), true);
    await assert.rejects(fs.lstat(path.join(installed.transaction, 'previous.app')), {code: 'ENOENT'});
    assert.ok((await fs.stat(path.join(installed.transaction, 'previous-backup/previous.app.zip'))).isFile());
});

test('native previous-app archive round-trips the complete old tree and publishes a private hash receipt', {skip: process.platform !== 'darwin'}, async t => {
    const f = await fixture(t);
    await fs.symlink('Workbench', path.join(f.target, 'Contents/MacOS/link'));
    const expected = await snapshotPackage(f.target), installed = await installMacApplication(f.options);
    await confirmMacInstallation({...f.options, source: f.target});
    const directory = path.join(installed.transaction, 'previous-backup');
    assert.deepEqual((await fs.readdir(directory)).sort(), ['previous.app.zip', 'receipt.json']);
    const receipt = JSON.parse(await fs.readFile(path.join(directory, 'receipt.json')));
    const bytes = await fs.readFile(path.join(directory, 'previous.app.zip'));
    assert.equal(receipt.archiveSha256, createHash('sha256').update(bytes).digest('hex'));
    assert.equal(receipt.previous.digest, createHash('sha256').update(JSON.stringify(expected)).digest('hex'));
    assert.equal((await fs.stat(path.join(directory, 'receipt.json'))).mode & 0o777, 0o600);
    assert.equal((await fs.stat(path.join(directory, 'previous.app.zip'))).mode & 0o777, 0o600);
    const restored = path.join(f.root, 'manual-restore');
    await execute('/usr/bin/ditto', ['-x', '-k', path.join(directory, 'previous.app.zip'), restored]);
    assert.deepEqual(await snapshotPackage(path.join(restored, 'previous.app')), expected);
    assert.ok(f.calls.some(file => file.includes('/.verify-previous/payload/') && file.endsWith('/previous.app')));
    assert.equal(await confirmMacInstallation({...f.options, source: f.target}), false, 'released completed claim needs no further confirmation');
    assert.equal(await recoverMacInstallation(f.options), 'none');
    assert.equal((await archiveCompletedMacBackup(f.options, installed.transaction)).status, 'archived');
});

for (const failure of ['write', 'roundtrip', 'signature', 'zip', 'receipt', 'publish', 'changed-previous', 'running', 'running-after-archive']) {
    test(`completed backup ${failure} failure preserves old bytes and the retry claim without blocking confirmation`, {skip: process.platform !== 'darwin'}, async t => {
        const f = await fixture(t), installed = await installMacApplication(f.options);
        const previous = path.join(installed.transaction, 'previous.app');
        const options = {...f.options, source: f.target};
        if (failure === 'write') options.archivePrevious = async () => { throw Error('archive disk full'); };
        if (failure === 'roundtrip') options.extractPrevious = async (_archive, destination) => f.options.copy(f.source, path.join(destination, 'previous.app'));
        if (failure === 'signature') options.verifySignature = async () => { throw Error('old signature rejected'); };
        if (failure === 'zip') options.archivePrevious = async (_source, file) => fs.writeFile(file, 'corrupt zip');
        if (failure === 'receipt') await fs.mkdir(path.join(installed.transaction, 'previous-backup'), {mode: 0o700});
        if (failure === 'publish') options.rename = async () => { throw Error('archive publication failed'); };
        if (failure === 'changed-previous') options.archivePrevious = async (source, destination) => {
            await archive(source, destination);
            await fs.writeFile(path.join(source, 'Contents/MacOS/Workbench'), 'externally changed old');
        };
        if (failure === 'running') options.running = async app => app === previous;
        if (failure === 'running-after-archive') { let checks = 0; options.running = async app => app === previous && ++checks > 1; }
        assert.equal(await confirmMacInstallation(options), true);
        assert.equal((JSON.parse(await fs.readFile(path.join(installed.transaction, 'record.json')))).phase, 'complete');
        assert.equal(await f.old(), 'new');
        assert.equal(await fs.readFile(path.join(previous, 'Contents/MacOS/Workbench'), 'utf8'), failure === 'changed-previous' ? 'externally changed old' : 'old');
        assert.equal(await recoverMacInstallation(options), 'cleanup-pending');
        assert.equal((await archiveCompletedMacBackup(options, installed.transaction)).status, 'deferred');
        assert.ok((await fs.stat(path.join(path.dirname(f.target), '.nova-content-hub-install'))).isFile());
        await assert.rejects(installMacApplication({...options, source: f.source}), /尚未完成归档/);
        if (failure === 'write') {
            assert.equal(await confirmMacInstallation({...f.options, source: f.target}), true, 'later canonical startup retries cleanup');
            await assert.rejects(fs.lstat(previous), {code: 'ENOENT'});
        }
    });
}

test('a published archive interrupted before raw retirement is verified and resumed', {skip: process.platform !== 'darwin'}, async t => {
    const f = await fixture(t), installed = await installMacApplication(f.options);
    let checks = 0;
    await confirmMacInstallation({...f.options, source: f.target, running: async file => file === path.join(installed.transaction, 'previous.app') && ++checks > 1});
    assert.ok((await fs.stat(path.join(installed.transaction, 'previous-backup/receipt.json'))).isFile());
    assert.equal(await recoverMacInstallation(f.options), 'none');
    await assert.rejects(fs.lstat(path.join(installed.transaction, 'previous.app')), {code: 'ENOENT'});
    assert.equal(await recoverMacInstallation(f.options), 'none');
});

test('retirement interruption preserves the pinned non-app directory and resumes only its unchanged tree', {skip: process.platform !== 'darwin'}, async t => {
    for (const changed of [false, true]) await t.test(String(changed), async t => {
        const f = await fixture(t), installed = await installMacApplication(f.options);
        await confirmMacInstallation({...f.options, source: f.target, running: async file => {
            if (file.endsWith('/previous.retiring')) throw Error('interrupted before removal');
            return false;
        }});
        const retiring = path.join(installed.transaction, 'previous.retiring');
        assert.equal(await fs.readFile(path.join(retiring, 'Contents/MacOS/Workbench'), 'utf8'), 'old');
        if (changed) await fs.writeFile(path.join(retiring, 'unrelated-user-file'), 'keep');
        assert.equal(await recoverMacInstallation(f.options), changed ? 'cleanup-pending' : 'none');
        if (changed) assert.equal(await fs.readFile(path.join(retiring, 'unrelated-user-file'), 'utf8'), 'keep');
        else await assert.rejects(fs.lstat(retiring), {code: 'ENOENT'});
        assert.ok((await fs.stat(path.join(installed.transaction, 'previous-backup/previous.app.zip'))).isFile());
    });
});

test('archive corruption cannot authorize removal of a retained raw backup', {skip: process.platform !== 'darwin'}, async t => {
    for (const file of ['previous.app.zip', 'receipt.json']) await t.test(file, async t => {
        const f = await fixture(t), installed = await installMacApplication(f.options);
        let checks = 0;
        await confirmMacInstallation({...f.options, source: f.target, running: async app => app === path.join(installed.transaction, 'previous.app') && ++checks > 1});
        await fs.writeFile(path.join(installed.transaction, 'previous-backup', file), 'corrupt');
        assert.equal(await recoverMacInstallation(f.options), 'cleanup-pending');
        assert.equal(await fs.readFile(path.join(installed.transaction, 'previous.app/Contents/MacOS/Workbench'), 'utf8'), 'old');
        assert.equal(await f.old(), 'new');
    });
});

test('explicit retirement refuses foreign paths and non-complete transactions without touching rollback material', async t => {
    const f = await fixture(t), installed = await installMacApplication(f.options);
    assert.equal((await archiveCompletedMacBackup(f.options, installed.transaction)).status, 'not-complete');
    assert.equal((await archiveCompletedMacBackup(f.options, f.root)).status, 'deferred');
    const claim = path.join(installed.transaction, 'claim.json'), bytes = await fs.readFile(claim);
    await fs.writeFile(claim, '{}');
    assert.equal((await archiveCompletedMacBackup(f.options, installed.transaction)).status, 'deferred');
    await fs.writeFile(claim, bytes);
    assert.equal(await fs.readFile(path.join(installed.transaction, 'previous.app/Contents/MacOS/Workbench'), 'utf8'), 'old');
});

test('a real process exit after extraction leaves a pinned scratch that the next archive call safely clears', {skip: process.platform !== 'darwin'}, async t => {
    const f = await fixture(t), installed = await installMacApplication(f.options);
    const recordFile = path.join(installed.transaction, 'record.json'), record = JSON.parse(await fs.readFile(recordFile));
    await fs.writeFile(recordFile, JSON.stringify({...record, phase: 'complete'}));
    const child = crashArchive(f.target, installed.transaction, 'after-extract');
    assert.equal(child.status, 23, child.stderr);
    const scratch = path.join(installed.transaction, '.verify-previous'), owner = JSON.parse(await fs.readFile(path.join(scratch, 'owner.json')));
    assert.equal(owner.ownerPid, child.pid);
    assert.equal(await fs.readFile(path.join(scratch, 'payload/previous.app/Contents/MacOS/Workbench'), 'utf8'), 'old');
    assert.equal((await archiveCompletedMacBackup(f.options, installed.transaction)).status, 'archived');
    await assert.rejects(fs.lstat(scratch), {code: 'ENOENT'});
    await assert.rejects(fs.lstat(path.join(installed.transaction, 'previous.app')), {code: 'ENOENT'});
    assert.equal((await fs.readdir(installed.transaction, {recursive: true})).some(file => file.endsWith('previous.app')), false);
});

test('a process exit during recursive raw removal resumes only with the pinned durable deletion authorization', {skip: process.platform !== 'darwin'}, async t => {
    for (const corrupt of [false, true]) await t.test(String(corrupt), async t => {
        const f = await fixture(t), installed = await installMacApplication(f.options);
        const recordFile = path.join(installed.transaction, 'record.json'), record = JSON.parse(await fs.readFile(recordFile));
        await fs.writeFile(recordFile, JSON.stringify({...record, phase: 'complete'}));
        const child = crashArchive(f.target, installed.transaction, 'retirement-rm');
        assert.equal(child.status, 24, child.stderr);
        const retiring = path.join(installed.transaction, 'previous.retiring');
        await assert.rejects(fs.lstat(path.join(retiring, 'Contents/MacOS/Workbench')), {code: 'ENOENT'});
        assert.equal(await fs.readFile(path.join(retiring, 'Contents/Info.plist'), 'utf8'), f.options.bundleIdentifier);
        const authorizationFile = path.join(installed.transaction, 'previous-removal.json');
        const authorization = JSON.parse(await fs.readFile(authorizationFile));
        assert.deepEqual(authorization.previous, record.previous);
        assert.equal((await fs.stat(authorizationFile)).mode & 0o777, 0o600);
        const receipt = JSON.parse(await fs.readFile(path.join(installed.transaction, 'previous-backup/receipt.json')));
        assert.equal(authorization.archiveSha256, receipt.archiveSha256);
        if (corrupt) await fs.writeFile(authorizationFile, JSON.stringify({...authorization, archiveSha256: '0'.repeat(64)}));
        assert.equal(await recoverMacInstallation(f.options), corrupt ? 'cleanup-pending' : 'none');
        if (corrupt) assert.ok((await fs.stat(retiring)).isDirectory());
        else await assert.rejects(fs.lstat(retiring), {code: 'ENOENT'});
        assert.equal(await f.old(), 'new');
        assert.ok((await fs.stat(path.join(installed.transaction, 'previous-backup/previous.app.zip'))).isFile());
    });
});

test('scratch cleanup keeps owner.json through a process exit halfway through payload removal', {skip: process.platform !== 'darwin'}, async t => {
    const f = await fixture(t), installed = await installMacApplication(f.options);
    const recordFile = path.join(installed.transaction, 'record.json'), record = JSON.parse(await fs.readFile(recordFile));
    await fs.writeFile(recordFile, JSON.stringify({...record, phase: 'complete'}));
    const child = crashArchive(f.target, installed.transaction, 'scratch-rm');
    assert.equal(child.status, 24, child.stderr);
    const scratch = path.join(installed.transaction, '.verify-previous');
    const owner = JSON.parse(await fs.readFile(path.join(scratch, 'owner.json')));
    assert.equal(owner.ownerPid, child.pid);
    await assert.rejects(fs.lstat(path.join(scratch, 'payload/previous.app/Contents/MacOS/Workbench')), {code: 'ENOENT'});
    assert.equal((await archiveCompletedMacBackup(f.options, installed.transaction)).status, 'archived');
    await assert.rejects(fs.lstat(scratch), {code: 'ENOENT'});
});

test('an empty scratch left after owner unlink is safely retired while a nonempty unknown one remains protected', {skip: process.platform !== 'darwin'}, async t => {
    const f = await fixture(t), installed = await installMacApplication(f.options);
    const recordFile = path.join(installed.transaction, 'record.json'), record = JSON.parse(await fs.readFile(recordFile));
    await fs.writeFile(recordFile, JSON.stringify({...record, phase: 'complete'}));
    const scratch = path.join(installed.transaction, '.verify-previous');
    await fs.mkdir(scratch, {mode: 0o700});
    assert.equal((await archiveCompletedMacBackup(f.options, installed.transaction)).status, 'archived');
    await assert.rejects(fs.lstat(scratch), {code: 'ENOENT'});
});

test('unknown, live-owned and running verification scratch directories are preserved until safely retryable', {skip: process.platform !== 'darwin'}, async t => {
    for (const reason of ['unknown', 'live-owner', 'running-copy']) await t.test(reason, async t => {
        const f = await fixture(t), installed = await installMacApplication(f.options);
        const recordFile = path.join(installed.transaction, 'record.json'), record = JSON.parse(await fs.readFile(recordFile));
        await fs.writeFile(recordFile, JSON.stringify({...record, phase: 'complete'}));
        const scratch = path.join(installed.transaction, '.verify-previous'), restored = path.join(scratch, 'payload/previous.app');
        if (reason !== 'running-copy') {
            await fs.mkdir(scratch, {mode: 0o700});
            await fs.writeFile(path.join(scratch, 'unrelated'), 'keep');
            if (reason === 'live-owner') {
                const stat = await fs.stat(scratch);
                await fs.writeFile(path.join(scratch, 'owner.json'), JSON.stringify({format: 'nova-mac-previous-verification-v1', dev: stat.dev, ino: stat.ino, ownerPid: process.ppid}), {mode: 0o600});
            }
        }
        const result = await archiveCompletedMacBackup({...f.options, running: async file => reason === 'running-copy' && file === restored}, installed.transaction);
        assert.equal(result.status, 'deferred');
        assert.equal(await fs.readFile(path.join(installed.transaction, 'previous.app/Contents/MacOS/Workbench'), 'utf8'), 'old');
        if (reason === 'running-copy') {
            assert.equal(await fs.readFile(path.join(restored, 'Contents/MacOS/Workbench'), 'utf8'), 'old');
            assert.equal((await archiveCompletedMacBackup(f.options, installed.transaction)).status, 'archived');
            await assert.rejects(fs.lstat(scratch), {code: 'ENOENT'});
        } else assert.equal(await fs.readFile(path.join(scratch, 'unrelated'), 'utf8'), 'keep');
    });
});

test('same-process overlapping archive verification cannot clear an active scratch', {skip: process.platform !== 'darwin'}, async t => {
    const f = await fixture(t), installed = await installMacApplication(f.options);
    const recordFile = path.join(installed.transaction, 'record.json'), record = JSON.parse(await fs.readFile(recordFile));
    await fs.writeFile(recordFile, JSON.stringify({...record, phase: 'complete'}));
    const result = await archiveCompletedMacBackup({...f.options, extractPrevious: async (file, destination) => {
        await execute('/usr/bin/ditto', ['-x', '-k', file, destination]);
        const overlapping = await archiveCompletedMacBackup(f.options, installed.transaction);
        assert.equal(overlapping.status, 'deferred'); assert.match(overlapping.reason, /verification is still running/);
        assert.equal(await fs.readFile(path.join(destination, 'previous.app/Contents/MacOS/Workbench'), 'utf8'), 'old');
    }}, installed.transaction);
    assert.equal(result.status, 'archived');
});

test('only strict native transaction backup executable paths are rejected before desktop locking', async () => {
    const transaction = '/Applications/.nova-content-hub-install-97266b36-93a4-46fd-9def-c6fd2db43c48';
    for (const name of ['previous.app', 'candidate.app', 'previous.retiring', '.verify-previous/payload/previous.app']) assert.equal(isMacInstallationBackupExecutable(`${transaction}/${name}/Contents/MacOS/自媒体工作台`), true);
    for (const file of ['/Applications/自媒体工作台.app/Contents/MacOS/自媒体工作台', '/Volumes/Installer/自媒体工作台.app/Contents/MacOS/自媒体工作台', '/repo/dev/previous.app/Contents/MacOS/自媒体工作台', `${transaction}-other/previous.app/Contents/MacOS/自媒体工作台`, `${transaction}/unrelated.app/Contents/MacOS/自媒体工作台`, `${transaction}/previous.app/Contents/MacOS/extra/path`]) assert.equal(isMacInstallationBackupExecutable(file), false, file);
    const desktop = await fs.readFile(new URL('../src/main/desktop.mts', import.meta.url), 'utf8');
    assert.ok(desktop.indexOf('isMacInstallationBackupExecutable(process.execPath)') < desktop.indexOf('app.requestSingleInstanceLock()'));
});

test('completed installation never restores an old backup after the user removes, moves or replaces the installed app', async t => {
    for (const action of ['remove', 'move', 'replace']) await t.test(action, async t => {
        const f = await fixture(t), result = await installMacApplication(f.options);
        assert.equal(await confirmMacInstallation({...f.options, source: f.target}), true);
        const previous = path.join(result.transaction, 'previous-backup/previous.app.zip');
        const archivedBytes = await fs.readFile(previous);
        const recordFile = path.join(result.transaction, 'record.json'), record = await fs.readFile(recordFile);
        const moved = path.join(f.root, 'moved.app');
        if (action === 'remove') await fs.rm(f.target, {recursive: true});
        else await fs.rename(f.target, moved);
        if (action === 'replace') await fs.cp(f.source, f.target, {recursive: true});
        assert.equal(await recoverMacInstallation(f.options), 'none');
        if (action === 'replace') assert.equal(await f.old(), 'new');
        else await assert.rejects(fs.lstat(f.target), {code: 'ENOENT'});
        if (action !== 'remove') assert.equal(await fs.readFile(path.join(moved, 'Contents/MacOS/Workbench'), 'utf8'), 'new');
        assert.deepEqual(await fs.readFile(previous), archivedBytes);
        assert.deepEqual(await fs.readFile(recordFile), record);
        await assert.rejects(fs.lstat(path.join(path.dirname(f.target), '.nova-content-hub-install')), {code: 'ENOENT'});
        assert.equal(await recoverMacInstallation(f.options), 'none');
    });
});

test('a completed local-channel journal can recover before an official-channel update', async t => {
    const f = await fixture(t, 'com.novaisland.nova-content-hub.local');
    const first = await installMacApplication(f.options);
    assert.equal(await confirmMacInstallation({...f.options, source: f.target}), true);
    const incoming = {...f.options, bundleIdentifier: 'com.novaisland.nova-content-hub'};
    await fs.writeFile(path.join(f.source, 'Contents/Info.plist'), incoming.bundleIdentifier);
    assert.equal(await recoverMacInstallation(incoming), 'none');
    assert.equal(await f.old(), 'new');
    const next = await installMacApplication(incoming);
    assert.notEqual(next.transaction, first.transaction);
    assert.equal((await incoming.readBundle(f.target)).identifier, incoming.bundleIdentifier);
    assert.equal((await incoming.readBundle(path.join(next.transaction, 'previous.app'))).identifier, f.options.bundleIdentifier);
});

test('allowed product channels replace and restore each other with the same executable', async t => {
    const f = await fixture(t, 'com.novaisland.nova-content-hub.testing');
    const incoming = {...f.options, bundleIdentifier: 'com.novaisland.nova-content-hub'};
    await fs.writeFile(path.join(f.source, 'Contents/Info.plist'), incoming.bundleIdentifier);
    const result = await installMacApplication(incoming);
    assert.equal(await f.old(), 'new');
    await fs.rename(f.target, path.join(result.transaction, 'candidate.app'));
    assert.equal(await recoverMacInstallation(incoming), 'restored');
    assert.equal(await f.old(), 'old');
    assert.equal((await incoming.readBundle(f.target)).identifier, f.options.bundleIdentifier);
});

test('unknown journal channels and incompatible executables preserve recovery evidence', async t => {
    for (const invalid of [{bundleIdentifier: 'unknown'}, {executable: 'Other'}]) {
        const f = await fixture(t);
        const result = await installMacApplication(f.options);
        const file = path.join(result.transaction, 'record.json');
        const record = JSON.parse(await fs.readFile(file));
        await fs.writeFile(file, JSON.stringify({...record, ...invalid, phase: 'complete'}));
        await assert.rejects(recoverMacInstallation(f.options), /Unknown installation record/);
        assert.equal(await f.old(), 'new');
        assert.equal(await fs.readFile(path.join(result.transaction, 'previous.app/Contents/MacOS/Workbench'), 'utf8'), 'old');
        assert.ok((await fs.lstat(path.join(path.dirname(f.target), '.nova-content-hub-install'))).isFile());
    }
});

test('unknown installed channels and mismatched incoming source or candidate channels are refused', async t => {
    for (const mismatch of ['installed', 'source', 'candidate']) {
        const f = await fixture(t);
        if (mismatch !== 'candidate') await fs.writeFile(path.join(mismatch === 'installed' ? f.target : f.source, 'Contents/Info.plist'), mismatch === 'installed' ? 'unknown' : 'com.novaisland.nova-content-hub.local');
        const copy = async (source, candidate) => {
            await f.options.copy(source, candidate);
            await fs.writeFile(path.join(candidate, 'Contents/Info.plist'), 'com.novaisland.nova-content-hub.local');
        };
        await assert.rejects(installMacApplication({...f.options, copy: mismatch === 'candidate' ? copy : f.options.copy}), /Unrecognized application bundle identity/);
        assert.equal(await f.old(), 'old');
    }
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
