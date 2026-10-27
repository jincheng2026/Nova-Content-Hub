import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {DesktopController} from '../src/main/controller.mts';
import {BindingStore, emptyBinding} from '../src/main/bindings.mts';
import {StartupAccessReceipt, assertStartupAccess} from '../src/main/startup-access.mts';
import {createLibrary} from '../../plugin-src/src/lib/file-library/index.mjs';
import {execute} from '../src/main/worker.mts';
import {createVault} from '../../plugin-src/src/lib/vault/index.mjs';

async function fixture(t) {
    const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'nova-startup-access-')));
    t.after(() => fs.rm(root, {recursive: true, force: true}));
    const store = new BindingStore(path.join(root, 'binding.json'));
    // These old pointers deliberately do not exist: initialization must not consult them.
    const current = {root: path.join(root, 'old-source'), libraryId: '321c7abe-530f-4ffa-8c00-1ed42d3d8015', rootIdentity: {dev: '1', ino: '2'}};
    const pending = {mutationId: '7abc7abe-530f-4ffa-8c00-1ed42d3d8015', op: 'createContent', input: {title: '保留草稿', body: '原始正文'}};
    const binding = {...emptyBinding(), current, pending, source: path.join(root, 'old.json'), sourceHash: 'a'.repeat(64), destination: current.root, started: true, assistant: 'workbuddy'};
    await store.save(binding);
    const calls = [];
    const controller = new DesktopController({store, worker: {async call(op, args) {calls.push({op, args}); return current.root;}}, dialogs: {}, documents: root});
    return {root, store, binding, current, calls, controller};
}

async function receipt(f, overrides = {}) {
    const executable = path.join(f.root, 'app-executable');
    await fs.writeFile(executable, 'test installed executable');
    const options = {file: path.join(f.root, 'installation-library-selection.json'), executable, version: '0.5.0', packaged: true, show: true, ...overrides};
    return {options, access: new StartupAccessReceipt(options)};
}

test('deferred initialization preserves every binding pointer and pending write without any source worker call', async t => {
    const f = await fixture(t), before = await fs.readFile(f.store.file);
    await f.controller.initialize({requireLibrarySelection: true});
    assert.deepEqual(f.calls, []);
    assert.deepEqual(f.controller.binding, {...f.binding, needsReselect: true});
    assert.deepEqual(await fs.readFile(f.store.file), before);
    assert.equal((await f.controller.status()).currentName, 'old-source');
    assert.equal((await f.controller.status()).pending.mutationId, f.binding.pending.mutationId);
    await assert.rejects(f.controller.listContents(), {code: 'LIBRARY_NOT_READY'});
    assert.deepEqual(f.calls, []);
});

test('new packaged install with old binding performs zero source access and cancel never records selection', async t => {
    const f = await fixture(t), {access, options} = await receipt(f), before = await fs.readFile(f.store.file);
    assert.equal(await access.requiresSelection(), true);
    await f.controller.initialize({requireLibrarySelection: await access.requiresSelection()});
    f.controller.dialogs.library = async () => null;
    await f.controller.openLibrary();
    assert.equal(await access.recordSelection('openLibrary', f.controller.binding), false);
    assert.equal(await fs.stat(options.file).then(() => true, () => false), false);
    assert.deepEqual(f.calls, []);
    assert.deepEqual(await fs.readFile(f.store.file), before);
    for (const method of ['queryPendingMutation', 'retryPendingMutation', 'recoverMaintenance', 'queryLibraryUpgrade', 'listContents', 'importLocalFiles']) assert.throws(() => assertStartupAccess(method, f.controller.binding), {code: 'LIBRARY_NOT_READY'}, method);
    for (const method of ['status', 'openLibrary', 'readServiceSettings', 'readSetup']) assert.doesNotThrow(() => assertStartupAccess(method, f.controller.binding));
});

test('explicit same-library reselection keeps pending and obsolete pointers and records only after persistence', async t => {
    const f = await fixture(t), {access, options} = await receipt(f);
    await f.controller.initialize({requireLibrarySelection: true});
    f.controller.dialogs.library = async () => f.current.root;
    f.controller.worker = {async call(op) {return op === 'bind' ? f.current : f.current.root;}};
    await f.controller.openLibrary();
    assert.deepEqual(await f.store.load(), f.binding);
    assert.equal(await access.recordSelection('openLibrary', f.controller.binding), true);
    assert.equal(await new StartupAccessReceipt(options).requiresSelection(), false);
    await f.controller.initialize({requireLibrarySelection: await access.requiresSelection()});
    assert.equal(f.controller.binding.needsReselect, false);
});

test('wrong library, failed bind and failed binding persistence cannot clear selection or create receipt', async t => {
    const f = await fixture(t), {access, options} = await receipt(f), before = await fs.readFile(f.store.file);
    await f.controller.initialize({requireLibrarySelection: true});
    f.controller.dialogs.library = async () => f.current.root;
    f.controller.worker = {async call() {return {...f.current, rootIdentity: {...f.current.rootIdentity, ino: '999'}};}};
    await assert.rejects(f.controller.openLibrary(), {code: 'SOURCE_CHANGED'});
    f.controller.worker = {async call() {throw Error('bind failed');}};
    await assert.rejects(f.controller.openLibrary(), /bind failed/);
    f.controller.worker = {async call() {return f.current;}};
    f.controller.store = {load: () => f.store.load(), save: async () => {throw Error('persist failed');}};
    await assert.rejects(f.controller.openLibrary(), /persist failed/);
    assert.equal(await access.recordSelection('openLibrary', f.controller.binding), false);
    assert.deepEqual(await fs.readFile(f.store.file), before);
    assert.equal(await fs.stat(options.file).then(() => true, () => false), false);
});

test('same installation restores normally; replacement, version, path, corrupt and unsafe receipts require selection', async t => {
    const f = await fixture(t), {access, options} = await receipt(f);
    assert.equal(await access.recordSelection('status', f.binding), false);
    assert.equal(await access.recordSelection('openLibrary', f.binding), true);
    await f.controller.initialize({requireLibrarySelection: await new StartupAccessReceipt(options).requiresSelection()});
    assert.equal(f.calls[0].op, 'vaultLocation');
    for (const change of [{version: '0.5.1'}, {platform: 'another-platform'}, {arch: 'another-arch'}, {executable: path.join(f.root, 'another-exe')}]) assert.equal(await new StartupAccessReceipt({...options, ...change}).requiresSelection(), true);
    await fs.rename(options.executable, `${options.executable}.old`);
    await fs.copyFile(`${options.executable}.old`, options.executable);
    assert.equal(await new StartupAccessReceipt(options).requiresSelection(), true);
    await fs.writeFile(options.file, '{broken');
    assert.equal(await new StartupAccessReceipt(options).requiresSelection(), true);
    await fs.unlink(options.file);
    await fs.symlink(options.executable, options.file);
    assert.equal(await new StartupAccessReceipt(options).requiresSelection(), true);
    assert.equal(await new StartupAccessReceipt(options).recordSelection('openLibrary', f.binding), false);
    assert.equal((await fs.lstat(options.file)).isSymbolicLink(), true);
});

test('empty packaged first launch has no source reads; explicit fresh open records current installation', async t => {
    const f = await fixture(t), {access, options} = await receipt(f);
    await f.store.save(emptyBinding());
    await f.controller.initialize({requireLibrarySelection: await access.requiresSelection()});
    assert.equal(f.controller.binding.needsReselect, false);
    assert.deepEqual(f.calls, []);
    const library = createLibrary(path.join(f.root, 'fresh-library'));
    f.controller.dialogs.library = async () => library.info.root;
    f.controller.authMode = 'required'; // Binding needs no write entitlement or seed side effects.
    f.controller.worker = {call: (op, args) => execute(op, args, 'required')};
    await f.controller.openLibrary();
    assert.equal(await access.recordSelection('openLibrary', f.controller.binding), true);
    assert.equal(await new StartupAccessReceipt(options).requiresSelection(), false);
});

test('development and show:false harnesses keep automatic recovery and never write installation receipt', async t => {
    const f = await fixture(t);
    for (const overrides of [{packaged: false}, {show: false}]) {
        const {access, options} = await receipt(f, overrides);
        assert.equal(await access.requiresSelection(), false);
        await f.controller.initialize({requireLibrarySelection: await access.requiresSelection()});
        assert.equal(f.calls.at(-1).op, 'vaultLocation');
        assert.equal(await access.recordSelection('openLibrary', f.binding), false);
        assert.equal(await fs.stat(options.file).then(() => true, () => false), false);
    }
});

test('selecting the visible Vault folder resolves to the same hidden runtime and preserves pending work', async t => {
    const f = await fixture(t), vault = path.join(f.root, 'visible-second-brain'), {access} = await receipt(f);
    await fs.mkdir(vault);
    const current = createVault(vault);
    const binding = {...f.binding, current};
    await f.store.save(binding);
    await f.controller.initialize({requireLibrarySelection: true});
    f.controller.dialogs.library = async () => vault;
    f.controller.worker = {call: (op, args) => execute(op, args, 'disabled')};
    await f.controller.openLibrary();
    assert.deepEqual(await f.store.load(), binding);
    assert.equal(f.controller.displayRoot.root, vault);
    assert.equal(await access.recordSelection('openLibrary', f.controller.binding), true);
});

test('without pending work, explicit selection may replace an inaccessible old current with a different Vault', async t => {
    const f = await fixture(t), {access} = await receipt(f), vault = path.join(f.root, 'new-visible-vault');
    await fs.mkdir(vault);
    const current = createVault(vault);
    await f.store.save({...f.binding, pending: null});
    const before = await fs.readFile(f.store.file);
    await f.controller.initialize({requireLibrarySelection: true});
    f.controller.dialogs.library = async () => null;
    await f.controller.openLibrary();
    assert.deepEqual(await fs.readFile(f.store.file), before);
    assert.equal(await access.recordSelection('openLibrary', f.controller.binding), false);
    const calls = [];
    f.controller.dialogs.library = async () => vault;
    f.controller.authMode = 'required';
    f.controller.worker = {call: async (op, args) => { calls.push({op, args}); return execute(op, args, 'required'); }};
    await f.controller.openLibrary();
    assert.deepEqual(f.controller.binding, {...emptyBinding(), assistant: 'workbuddy', current});
    assert.equal(calls.some(call => JSON.stringify(call.args).includes(f.current.root)), false);
    assert.equal(await access.recordSelection('openLibrary', f.controller.binding), true);
});

test('creation reservation without an old current has no automatic source access and keeps explicit recovery available', async t => {
    const f = await fixture(t), creation = {root: path.join(f.root, 'new-reservation'), mutationId: f.binding.pending.mutationId, rootIdentity: {dev: '1', ino: '3'}};
    await f.store.save({...emptyBinding(), creation});
    const before = await fs.readFile(f.store.file);
    await f.controller.initialize({requireLibrarySelection: true});
    assert.equal(f.controller.binding.needsReselect, false);
    assert.deepEqual(f.controller.binding.creation, creation);
    assert.deepEqual(f.calls, []);
    assert.doesNotThrow(() => assertStartupAccess('queryPendingMutation', f.controller.binding));
    assert.deepEqual(await fs.readFile(f.store.file), before);
});
