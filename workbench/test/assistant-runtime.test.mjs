import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {snapshotPackage} from '../../plugin-src/src/lib/package-snapshot.mjs';
import {launchWithAssistantRuntime, readWorkBuddyCacheMetadata} from '../src/main/assistant-runtime.mts';
import {Covers} from '../src/main/covers.mts';
import {TemplateController} from '../src/main/template-controller.mts';

const source = fileURLToPath(new URL('../../', import.meta.url));
const release = {format: 'nova-content-desktop-release', schemaVersion: 1, productId: 'nova-content-hub', appScope: 'nova-content-hub', protocolVersion: 1, prototype: true, version: '0.2.0', AUTH_MODE: 'disabled', pairId: 'nova-content-hub@0.2.0:p1:disabled', experimental: true, productionReady: false, platform: process.platform, arch: process.arch};
const nodeFile = process.platform === 'win32' ? 'runtime/node.exe' : 'runtime/node';
const doctor = {ok: true, authMode: 'disabled', library: 'unbound', imageGeneration: false};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const write = async (file, value) => { await fs.mkdir(path.dirname(file), {recursive: true}); await fs.writeFile(file, typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)); };

async function fixture(t, host = 'workbuddy') {
    const home = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'nova runtime preflight '));
    t.after(() => fs.rm(home, {recursive: true, force: true}));
    const config = path.join(home, host === 'codex' ? '.codex' : '.workbuddy');
    const market = `nova-content-hub-auth-disabled-${process.platform}-${process.arch}`, key = `nova-content-hub@${market}`;
    const root = path.join(config, 'plugins/cache', market, 'nova-content-hub', release.version), trusted = path.join(home, 'app-market');
    await write(path.join(config, host === 'codex' ? 'config.toml' : 'settings.json'), host === 'codex' ? `[plugins."${key}"]\nenabled = true\n` : {enabledPlugins: {[key]: true}});
    if (host === 'workbuddy') await write(path.join(config, 'plugins/installed_plugins.json'), {version: 2, plugins: {[key]: [{scope: 'user', version: release.version, installPath: root}]}});
    const skills = ['nova-content-cover-execution', 'nova-content-template-execution'];
    const plugin = {name: release.appScope, version: release.version, description: release.pairId};
    await write(path.join(root, '.codex-plugin/plugin.json'), {...plugin, skills: './skills/'});
    await write(path.join(root, '.codebuddy-plugin/plugin.json'), {...plugin, skills: skills.map(name => './skills/' + name)});
    const installedRelease = {...release, format: 'nova-content-plugin-release'};
    await write(path.join(root, 'plugin-src/src/release.json'), installedRelease);
    const hashes = {};
    for (const skill of skills) { const file = `skills/${skill}/SKILL.md`, text = `---\nname: ${skill}\n---\nFixture\n`; await write(path.join(root, file), text); hashes[file] = hash(text); }
    await write(path.join(root, 'integrity.json'), {format: 'nova-content-plugin-integrity', schemaVersion: 1, pairId: release.pairId, AUTH_MODE: 'disabled', skills: Object.fromEntries(skills.map(name => [name, {namespace: name.includes('template') ? 'template' : 'cover', executable: true}])), hashes});
    for (const file of [nodeFile, 'runtime/launch.mjs', 'plugin-src/src/cli.mjs', 'node_modules/semver/bin/semver.js', 'node_modules/other.js']) await write(path.join(root, file), 'never executed fixture ' + file);
    await fs.chmod(path.join(root, nodeFile), 0o755);
    await fs.mkdir(path.join(root, 'node_modules/.bin'));
    await fs.symlink('../semver/bin/semver.js', path.join(root, 'node_modules/.bin/semver'));
    const manifestFile = path.join(trusted, 'package-files.json');
    const seal = async () => { const manifest = {format: 'nova-content-marketplace-package-files', schemaVersion: 1, release: installedRelease, entries: await snapshotPackage(root)}; await write(manifestFile, manifest); return manifest; };
    await seal();
    const run = (_file, _args, _options, done) => { queueMicrotask(() => done(null, JSON.stringify(doctor), '')); return {stdin: {end() {}}}; };
    return {host, home, config, root, trusted, manifestFile, seal, options: {home, env: {}, run}, open: (launch = async () => {}, options = {}) => launchWithAssistantRuntime(host, release, trusted, launch, {home, env: {}, run, ...options})};
}

for (const host of ['codex', 'workbuddy']) for (const capability of ['cover', 'template']) test(`${host} ${capability}: verified doctor must finish before envelope creation and external open`, async t => {
    const f = await fixture(t, host), events = [];
    let finish, started;
    const spawned = new Promise(resolve => { started = resolve; });
    const env = {PATH: '/keep/path', NODE_OPTIONS: '--import=private', node_path: '/inject', ELECTRON_RUN_AS_NODE: '1', DYLD_INSERT_LIBRARIES: '/inject', DYLD_FRAMEWORK_PATH: '/inject', LD_PRELOAD: '/inject', LD_AUDIT: '/inject', LIBPATH: '/inject', LDR_PRELOAD: '/inject', GCONV_PATH: '/inject'};
    const pending = f.open(async () => { events.push('envelope', 'external'); }, {capability, env, run: (file, args, options, done) => {
        assert.equal(file, path.join(f.root, 'runtime', process.platform === 'win32' ? 'node.exe' : 'node'));
        assert.deepEqual(args, [path.join(f.root, 'runtime/launch.mjs'), 'doctor']);
        assert.equal(options.cwd, f.root); assert.equal(options.shell, false); assert.equal(options.timeout, 30_000); assert.equal(options.maxBuffer, 65_536); assert.equal(options.killSignal, 'SIGKILL');
        assert.deepEqual(options.env, {PATH: '/keep/path'});
        events.push('doctor'); finish = done; started(); return {stdin: {end() { events.push('stdin-closed'); }}};
    }});
    await spawned;
    assert.deepEqual(events, ['doctor', 'stdin-closed']);
    finish(null, JSON.stringify(doctor), ''); await pending;
    assert.deepEqual(events, ['doctor', 'stdin-closed', 'envelope', 'external']);
});

test('tampered executable, launcher, CLI and other payload bytes refuse before spawn, even with cache self-resealing', async t => {
    const f = await fixture(t); let spawned = 0, opened = 0;
    const options = {run: () => { spawned++; throw Error('must not spawn'); }};
    for (const file of [nodeFile, 'runtime/launch.mjs', 'plugin-src/src/cli.mjs', 'node_modules/other.js']) {
        const target = path.join(f.root, file), original = await fs.readFile(target);
        await fs.writeFile(target, Buffer.alloc(original.length, 120));
        await assert.rejects(f.open(async () => { opened++; }, options), {code: 'NOT_READY'});
        const integrityFile = path.join(f.root, 'integrity.json'), integrity = await fs.readFile(integrityFile), patched = JSON.parse(integrity);
        patched.hashes[file] = hash(await fs.readFile(target)); await write(integrityFile, patched);
        await assert.rejects(f.open(async () => { opened++; }, options), {code: 'NOT_READY'});
        await fs.writeFile(target, original); await fs.writeFile(integrityFile, integrity);
    }
    assert.equal(spawned, 0); assert.equal(opened, 0);
});

test('missing files, wrong release, root/file symlinks, and extra or escaping payload entries refuse before spawn', async t => {
    const f = await fixture(t); let spawned = 0; const options = {run: () => { spawned++; throw Error('must not spawn'); }};
    const file = path.join(f.root, nodeFile), bytes = await fs.readFile(file);
    await fs.unlink(file); await assert.rejects(f.open(undefined, options), {code: 'NOT_READY'}); await write(file, bytes); await fs.chmod(file, 0o755);
    const releaseFile = path.join(f.root, 'plugin-src/src/release.json'), original = await fs.readFile(releaseFile);
    await write(releaseFile, {...release, format: 'nova-content-plugin-release', version: '9.9.9'}); await assert.rejects(f.open(undefined, options), {code: 'NOT_READY'}); await fs.writeFile(releaseFile, original);
    const target = path.join(f.home, 'node'); await fs.rename(file, target); await fs.symlink(target, file); await assert.rejects(f.open(undefined, options), {code: 'NOT_READY'}); await fs.unlink(file); await fs.rename(target, file);
    const extra = path.join(f.root, 'node_modules/extra'); await write(extra, 'extra'); await assert.rejects(f.open(undefined, options), {code: 'NOT_READY'}); await fs.unlink(extra);
    await fs.symlink(f.home, extra); await assert.rejects(f.open(undefined, options), {code: 'NOT_READY'}); await fs.unlink(extra);
    const moved = f.root + '-moved'; await fs.rename(f.root, moved); await fs.symlink(moved, f.root); await assert.rejects(f.open(undefined, options), {code: 'NOT_READY'}); assert.equal(spawned, 0);
});

test('trusted app inventory must be an ordinary bounded file with exact release and schema', async t => {
    const f = await fixture(t), original = await fs.readFile(f.manifestFile), manifest = JSON.parse(original);
    for (const patch of [{format: 'other'}, {schemaVersion: 2}, {release: {...manifest.release, version: '9.9.9'}}, {entries: {}}]) {
        await write(f.manifestFile, {...manifest, ...patch}); await assert.rejects(f.open(), {code: 'NOT_READY'});
    }
    await write(f.manifestFile, ' '.repeat(2 * 1024 * 1024 + 1)); await assert.rejects(f.open(), {code: 'NOT_READY'});
    const target = path.join(f.home, 'manifest'); await fs.writeFile(target, original); await fs.unlink(f.manifestFile); await fs.symlink(target, f.manifestFile); await assert.rejects(f.open(), {code: 'NOT_READY'});
});

test('only Codex may omit the exact trusted semver link; present changes never qualify', async t => {
    for (const host of ['codex', 'workbuddy']) {
        const f = await fixture(t, host), link = path.join(f.root, 'node_modules/.bin/semver');
        await fs.unlink(link);
        if (host === 'codex') await f.open(); else await assert.rejects(f.open(), {code: 'NOT_READY'});
        await fs.symlink('../other.js', link); await assert.rejects(f.open(), {code: 'NOT_READY'});
        await fs.unlink(link);
        const manifest = JSON.parse(await fs.readFile(f.manifestFile)); manifest.entries['node_modules/.bin/semver'] = {link: '../other.js'}; await write(f.manifestFile, manifest);
        await assert.rejects(f.open(), {code: 'NOT_READY'});
    }
});

test('runtime error, timeout, malformed/oversized or business-bound output never creates an envelope or opens the host', async t => {
    const f = await fixture(t); let opened = 0;
    for (const [error, stdout, stderr] of [[Error('ETIMEDOUT'), '', ''], [Error('exit 1'), '', ''], [null, '{bad', ''], [null, ' '.repeat(65_537), ''], [null, JSON.stringify({...doctor, ok: false}), ''], [null, JSON.stringify({...doctor, library: 'bound'}), ''], [null, JSON.stringify({...doctor, imageGeneration: true}), ''], [null, JSON.stringify({...doctor, authMode: 'required'}), ''], [null, JSON.stringify(doctor), 'warning']]) {
        await assert.rejects(f.open(async () => { opened++; }, {run: (_file, _args, _options, done) => { queueMicrotask(() => done(error, stdout, stderr)); return {stdin: {end() {}}}; }}), {code: 'NOT_READY'});
    }
    assert.equal(opened, 0);
});

test('required mode never executes and successful launches do not cache verification across replacements', async t => {
    const f = await fixture(t); let calls = 0;
    await assert.rejects(launchWithAssistantRuntime(f.host, {...release, AUTH_MODE: 'required', pairId: release.pairId.replace('disabled', 'required')}, f.trusted, async () => {}, {...f.options, run: () => { calls++; throw Error('must not spawn'); }}), {code: 'NOT_READY'});
    await f.open(); await fs.writeFile(path.join(f.root, 'runtime/launch.mjs'), 'replacement'); await assert.rejects(f.open(), {code: 'NOT_READY'}); assert.equal(calls, 0);
});

test('WorkBuddy allows bounded non-executable in-use markers across live and ended host stages', async t => {
    const f = await fixture(t), directory = path.join(f.root, '.in_use'), marker = path.join(directory, String(process.pid));
    await f.open();
    await fs.mkdir(directory); await f.open();
    await write(marker, {pid: process.pid, procStart: '2026-10-18T17:23:47.089Z'}); await f.open();
    await fs.unlink(marker); await f.open();
    await fs.rmdir(directory); await f.open();
});

test('only WorkBuddy permits validated host markers; trusted inventories cannot declare them', async t => {
    const codex = await fixture(t, 'codex'); await fs.mkdir(path.join(codex.root, '.in_use'));
    await assert.rejects(codex.open(), {code: 'NOT_READY'});
    const f = await fixture(t); await fs.mkdir(path.join(f.root, '.in_use')); await f.seal();
    await assert.rejects(f.open(), {code: 'NOT_READY'});
});

test('WorkBuddy permits only bounded atomic-write temporary names and exact platform identity data', async t => {
    const f = await fixture(t), directory = path.join(f.root, '.in_use'); await fs.mkdir(directory);
    const name = `${process.pid}.tmp.1792344227089.abc123`, file = path.join(directory, name);
    await write(file, ''); await f.open();
    const marker = {pid: process.pid, procStart: '2026-10-18T17:23:47.089Z', ...(process.platform === 'win32' ? {procStartFt: '134052530270890000'} : process.platform === 'linux' ? {procStartTicks: '123456'} : {})};
    await write(file, marker); await f.open();
    const metadata = await readWorkBuddyCacheMetadata(f.root);
    assert.deepEqual(Object.keys(metadata.entries).sort(), ['.in_use', `.in_use/${name}`]);
    await fs.rename(file, path.join(directory, String(process.pid))); await f.open();
    await write(path.join(f.root, '.orphaned_at'), '1792344227089'); await assert.rejects(f.open(), {code: 'NOT_READY'});
});

test('invalid names, marker schemas and excessive host metadata refuse before spawn', async t => {
    const f = await fixture(t), directory = path.join(f.root, '.in_use'); await fs.mkdir(directory);
    let spawns = 0;
    const options = {run: () => { spawns++; throw Error('must not spawn'); }};
    const valid = {pid: 65238, procStart: '2026-10-18T17:23:47.089Z'};
    for (const name of ['0', '-1', '065238', '4294967296', '65238.mjs', '65238.tmp.123.abc', '65238.tmp.1792344227089.ABC', '65238.tmp.1792344227089.abcdefghijklmnopq', '65238.tmp.1792344227089.']) {
        const file = path.join(directory, name); await write(file, valid); await assert.rejects(f.open(undefined, options), {code: 'NOT_READY'}); await fs.unlink(file);
    }
    for (const value of ['', '{"pid":', ' '.repeat(1025), {...valid, pid: '65238'}, {...valid, pid: 1}, {pid: 65238}, {...valid, procStart: '2026-02-30T17:23:47.089Z'}, {...valid, procStart: '2026-10-18T17:23:47Z'}, {...valid, script: 'evil'}, {...valid, processStart: valid.procStart}, {...valid, procStartFt: 'not-decimal'}, {...valid, procStartTicks: 1}]) {
        const file = path.join(directory, '65238'); await write(file, value); await assert.rejects(f.open(undefined, options), {code: 'NOT_READY'}); await fs.unlink(file);
    }
    await write(path.join(directory, '65238.tmp.1792344227089.abc'), '{"pid":'); await assert.rejects(f.open(undefined, options), {code: 'NOT_READY'}); await fs.rm(directory, {recursive: true}); await fs.mkdir(directory);
    for (let pid = 1; pid <= 257; pid++) await write(path.join(directory, String(pid)), {...valid, pid});
    await assert.rejects(f.open(undefined, options), {code: 'NOT_READY'}); assert.equal(spawns, 0);
});

test('host metadata cannot hide executable files, symlinks, hardlinks, subdirectories, or changed payload', async t => {
    const f = await fixture(t), directory = path.join(f.root, '.in_use'), marker = path.join(directory, '65238'); await fs.mkdir(directory);
    let spawns = 0; const options = {run: () => { spawns++; throw Error('must not spawn'); }};
    const valid = {pid: 65238, procStart: '2026-10-18T17:23:47.089Z'};
    await write(marker, valid); await fs.chmod(marker, 0o755); await assert.rejects(f.open(undefined, options), {code: 'NOT_READY'}); await fs.unlink(marker);
    const target = path.join(f.home, 'marker'); await write(target, valid);
    await fs.symlink(target, marker); await assert.rejects(f.open(undefined, options), {code: 'NOT_READY'}); await fs.unlink(marker);
    await fs.link(target, marker); await assert.rejects(f.open(undefined, options), {code: 'NOT_READY'}); await fs.unlink(marker);
    await fs.mkdir(marker); await assert.rejects(f.open(undefined, options), {code: 'NOT_READY'}); await fs.rmdir(marker);
    await fs.rmdir(directory); await fs.symlink(f.home, directory); await assert.rejects(f.open(undefined, options), {code: 'NOT_READY'}); await fs.unlink(directory); await fs.mkdir(directory);
    await write(marker, valid); await fs.writeFile(path.join(f.root, 'plugin-src/src/cli.mjs'), 'tampered payload');
    await assert.rejects(f.open(undefined, options), {code: 'NOT_READY'}); assert.equal(spawns, 0);
});

test('host marker changes during verification fail closed without retrying doctor or launch', async t => {
    const f = await fixture(t), directory = path.join(f.root, '.in_use'), marker = path.join(directory, '65238');
    const valid = {pid: 65238, procStart: '2026-10-18T17:23:47.089Z'}, originalStat = fs.lstat;
    let spawns = 0, launches = 0;
    for (const change of [() => fs.unlink(marker), () => write(marker, {...valid, procStart: '2026-10-18T17:23:48.089Z'}), () => write(path.join(directory, '65239'), {...valid, pid: 65239}), () => fs.rm(directory, {recursive: true})]) {
        await fs.mkdir(directory, {recursive: true}); await write(marker, valid); let nodeReads = 0;
        const patched = t.mock.method(fs, 'lstat', async (file, ...args) => { if (file === path.join(f.root, nodeFile) && ++nodeReads === 2) await change(); return originalStat(file, ...args); });
        try { await assert.rejects(f.open(async () => { launches++; }, {run: () => { spawns++; throw Error('must not spawn'); }}), {code: 'NOT_READY'}); }
        finally { patched.mock.restore(); await fs.rm(directory, {recursive: true, force: true}); }
    }
    assert.equal(spawns, 0); assert.equal(launches, 0);
    await f.open();
});

for (const capability of ['cover', 'template']) test(`${capability}: failed preflight can continue the same fixed attempt without business writes`, async t => {
    const f = await fixture(t), calls = [], envelopes = [];
    const reference = {requestId: 'fixed-request', attemptId: 'fixed-attempt', requestHash: 'a'.repeat(64), ...(capability === 'cover' ? {contentId: 'fixed-content'} : {templateId: 'fixed-template'})};
    const binding = {root: path.join(f.home, 'library'), libraryId: 'fixed-library', rootIdentity: {dev: '1', ino: '2'}};
    const owner = {binding: {assistant: f.host}, current: () => binding, worker: {call: async (op, args) => { calls.push({op, args}); return {host: f.host, attempt: {host: f.host}, request: {requestHash: reference.requestHash}}; }}};
    let failed = true;
    const launch = async (_binding, fixed) => f.open(async () => { envelopes.push(fixed); }, {capability, run: (file, args, options, done) => f.options.run(file, args, options, (...result) => done(...(failed ? [Error('ETIMEDOUT'), '', ''] : result)))});
    const ready = async host => ({host, ready: true, skill: `nova-content-${capability}-execution`, reason: 'available'});
    const controller = capability === 'cover' ? new Covers(owner, launch, owner.worker, ready) : new TemplateController(owner, {launchTemplate: launch, readTemplateAssistantSetup: ready});
    const open = () => capability === 'cover' ? controller.openAttempt(reference) : controller.open(reference);
    await assert.rejects(open(), {code: 'NOT_READY'}); assert.deepEqual(envelopes, []);
    failed = false; await open();
    assert.equal(envelopes.length, 1); assert.equal(envelopes[0].attemptId, reference.attemptId); assert.equal(envelopes[0].requestId, reference.requestId);
    assert.deepEqual(calls.map(call => call.op), [capability === 'cover' ? 'handoffContext' : 'templateHandoff', capability === 'cover' ? 'handoffContext' : 'templateHandoff']);
    assert.deepEqual(calls[0].args.reference, calls[1].args.reference);
});

test('real fixed Node and shipped launcher doctor are read-only and complete before launch', async t => {
    const f = await fixture(t);
    await fs.cp(path.join(source, 'plugin-src/src'), path.join(f.root, 'plugin-src/src'), {recursive: true, filter: file => path.basename(file) !== 'test'});
    await write(path.join(f.root, 'plugin-src/src/release.json'), {...release, format: 'nova-content-plugin-release'});
    const node = path.join(f.root, 'runtime', process.platform === 'win32' ? 'node.exe' : 'node');
    await fs.copyFile(process.execPath, node); await fs.chmod(node, 0o755);
    await fs.copyFile(path.join(source, 'plugin-src/runtime/launch.mjs'), path.join(f.root, 'runtime/launch.mjs'));
    await write(path.join(f.root, 'runtime/LICENSE'), 'fixture license');
    await write(path.join(f.root, 'runtime/manifest.json'), {format: 'nova-bundled-node', schemaVersion: 1, version: '24.20.0', platform: process.platform, arch: process.arch, nodeSha256: hash(await fs.readFile(node)), licenseSha256: hash('fixture license')});
    await f.seal();
    const before = await snapshotPackage(f.root); let launched = false;
    await f.open(async () => { launched = true; }, {run: undefined});
    assert.equal(launched, true); assert.deepEqual(await snapshotPackage(f.root), before);
});
