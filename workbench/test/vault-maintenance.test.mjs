import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createVault, openVault} from '../../plugin-src/src/lib/vault/index.mjs';
import {createLibrary, openLibrary, backupLibrary as legacyBackup} from '../../plugin-src/src/lib/file-library/index.mjs';
import {executeMaintenance} from '../src/main/maintenance-worker.mts';
import {maintenancePending} from '../src/shared/maintenance-validation.ts';
import {DesktopController} from '../src/main/controller.mts';
import {BindingStore} from '../src/main/bindings.mts';
function fixture(t) {
    const parent = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'nova-vault-maintenance-'));
    t.after(() => fs.rmSync(parent, {recursive: true, force: true}));
    const root = path.join(parent, 'vault'); fs.mkdirSync(root);
    const binding = createVault(root), stat = fs.lstatSync(parent, {bigint: true});
    fs.writeFileSync(path.join(root, '用户笔记.md'), '全库文件');
    return {parent, root, binding, common: {operationId: randomUUID(), startedAt: new Date().toISOString(), destination: path.join(parent, 'backup'), parentIdentity: {dev: String(stat.dev), ino: String(stat.ino)}}};
}
function backup(f) {
    const inspected = executeMaintenance('inspectMaintenanceLibrary', {binding: f.binding});
    return {...f.common, kind: 'backup', binding: f.binding, ...inspected};
}
test('worker pins entire Vault and restores through the existing finite pending operations', t => {
    const f = fixture(t), pending = backup(f);
    assert.equal(pending.vault.root, f.root);
    assert.ok(maintenancePending(pending));
    assert.equal(executeMaintenance('runMaintenance', {pending}).scope, 'vault');
    const {backup: selected} = executeMaintenance('inspectLibraryBackup', {source: pending.destination});
    assert.equal(selected.format, 'nova-knowledge-vault-backup');
    const restore = {...f.common, operationId: randomUUID(), startedAt: new Date().toISOString(), destination: path.join(f.parent, 'restored'), kind: 'restore', backup: selected};
    assert.ok(maintenancePending(restore));
    executeMaintenance('runMaintenance', {pending: restore});
    assert.equal(executeMaintenance('queryMaintenance', {pending: restore}).recovered, true);
    assert.equal(fs.readFileSync(path.join(restore.destination, '用户笔记.md'), 'utf8'), '全库文件');
    assert.ok(openVault(restore.destination));
    assert.throws(() => executeMaintenance('runMaintenance', {pending: restore}), {code: 'DESTINATION_EXISTS'});
});
test('worker refuses a target in visible Vault area, and does not downgrade missing or forged full format', t => {
    const f = fixture(t), pending = backup(f);
    assert.throws(() => executeMaintenance('runMaintenance', {pending: {...pending, destination: path.join(f.root, 'backup'), parentIdentity: pending.vault.rootIdentity}}), {code: 'UNSAFE_PATH'});
    executeMaintenance('runMaintenance', {pending});
    const selected = executeMaintenance('inspectLibraryBackup', {source: pending.destination}).backup;
    assert.equal(selected.format, 'nova-knowledge-vault-backup');
    const restore = {...f.common, operationId: randomUUID(), kind: 'restore', backup: {...selected, format: undefined}, destination: path.join(f.parent, 'restored')};
    delete restore.backup.format;
    assert.throws(() => executeMaintenance('runMaintenance', {pending: restore}), {code: 'SOURCE_CHANGED'});
});
test('migration copy is selected explicitly through restore and source descriptor remains unchanged', t => {
    const f = fixture(t), source = path.join(f.parent, 'moved-vault'); fs.cpSync(f.root, source, {recursive: true});
    const original = fs.readFileSync(path.join(source, '.workbench/vault.json'));
    const selected = executeMaintenance('inspectLibraryBackup', {source}).backup;
    assert.equal(selected.format, 'nova-knowledge-vault-copy');
    const pending = {...f.common, kind: 'restore', backup: selected, destination: path.join(f.parent, 'migrated')};
    assert.equal(executeMaintenance('runMaintenance', {pending}).scope, 'vault-copy');
    assert.ok(openVault(pending.destination));
    assert.deepEqual(fs.readFileSync(path.join(source, '.workbench/vault.json')), original);
});
test('legacy library package verification and restoration stay compatible', t => {
    const f = fixture(t), root = path.join(f.parent, 'legacy'); createLibrary(root);
    openLibrary(root).createContent({title: '旧库', body: '保留旧内容'});
    const source = path.join(f.parent, 'legacy-backup'); legacyBackup(root, source);
    const backup = executeMaintenance('inspectLibraryBackup', {source}).backup;
    const pending = {...f.common, kind: 'restore', backup, destination: path.join(f.parent, 'legacy-restored')};
    executeMaintenance('runMaintenance', {pending});
    assert.equal(executeMaintenance('queryMaintenance', {pending}).kind, 'restore');
    assert.equal(openLibrary(pending.destination).listContents()[0].title, '旧库');
});
test('desktop persists fixed full Vault intent and recovers a lost response without issuing a second copy', async t => {
    const f = fixture(t), store = new BindingStore(path.join(f.parent, 'desktop.json'));
    let copyCalls = 0;
    const worker = {async call(op, args) {
        if (op === 'runMaintenance') {
            copyCalls++;
            assert.deepEqual((await store.load()).maintenancePending, args.pending);
            executeMaintenance(op, args);
            throw Object.assign(new Error('lost response'), {code: 'WORKER_EXIT'});
        }
        return executeMaintenance(op, args);
    }};
    const controller = new DesktopController({store, worker, documents: f.parent, authMode: 'disabled', dialogs: {backup: async () => null, destination: async () => null, maintenanceParent: async () => f.parent}});
    await controller.initialize();
    controller.binding.current = f.binding;
    await assert.rejects(controller.backupLibrary(), {code: 'WORKER_EXIT'});
    assert.ok((await store.load()).maintenancePending.vault);
    assert.equal((await controller.recoverMaintenance()).scope, 'vault');
    assert.equal(copyCalls, 1);
    assert.equal(controller.binding.maintenancePending, null);
});

test('desktop lost restore response retains intent and query proves existing independent copy', async t => {
    const f = fixture(t), fixedBackup = backup(f); executeMaintenance('runMaintenance', {pending: fixedBackup});
    const store = new BindingStore(path.join(f.parent, 'restore-desktop.json')); let copyCalls = 0;
    const worker = {async call(op, args) {
        if (op === 'runMaintenance') {
            copyCalls++; assert.deepEqual((await store.load()).maintenancePending, args.pending);
            executeMaintenance(op, args); throw Object.assign(new Error('lost response'), {code: 'WORKER_EXIT'});
        }
        return executeMaintenance(op, args);
    }};
    const controller = new DesktopController({store, worker, documents: f.parent, authMode: 'disabled', dialogs: {backup: async () => null, destination: async () => null, libraryBackup: async () => fixedBackup.destination, maintenanceParent: async () => f.parent}});
    await controller.initialize();
    await assert.rejects(controller.restoreLibraryBackup(), {code: 'WORKER_EXIT'});
    const pending = (await store.load()).maintenancePending;
    assert.equal(pending.backup.format, 'nova-knowledge-vault-backup');
    assert.ok(openVault(pending.destination));
    assert.equal((await controller.recoverMaintenance()).scope, 'vault');
    assert.equal(copyCalls, 1);
});

test('a missing Vault runtime marker is a repairable error, never an automatic runtime-only backup downgrade', t => {
    const f = fixture(t);
    fs.unlinkSync(path.join(f.binding.root, 'vault-binding.json'));
    assert.throws(() => executeMaintenance('inspectMaintenanceLibrary', {binding: f.binding}), {code: 'CORRUPT'});
});

for (const state of ['moved', 'missing']) test(`external backup restores when current Vault is ${state}, while saved current binding stays intact`, async t => {
    const f = fixture(t), fixed = backup(f); executeMaintenance('runMaintenance', {pending: fixed});
    const store = new BindingStore(path.join(f.parent, `detached-${state}.json`)); let copies = 0;
    const worker = {async call(op, args) { if (op === 'runMaintenance') copies++; return executeMaintenance(op, args); }};
    const controller = new DesktopController({store, worker, documents: f.parent, authMode: 'disabled', dialogs: {backup: async () => null, destination: async () => null, libraryBackup: async () => fixed.destination, maintenanceParent: async () => f.parent}});
    await controller.initialize(); controller.binding.current = f.binding;
    if (state === 'moved') fs.renameSync(f.root, path.join(f.parent, 'moved-vault'));
    else fs.rmSync(f.root, {recursive: true});
    const restored = await controller.restoreLibraryBackup();
    assert.equal(restored.scope, 'vault'); assert.equal(copies, 1);
    assert.deepEqual(controller.binding.current, f.binding);
    assert.equal(controller.binding.maintenancePending, null);
    assert.ok(openVault(path.join(f.parent, restored.destinationName)));
});

test('restore rejects target in current visible Vault and keeps original pending protections', async t => {
    const f = fixture(t), fixed = backup(f); executeMaintenance('runMaintenance', {pending: fixed});
    const store = new BindingStore(path.join(f.parent, 'inside-current.json')); let copies = 0;
    const worker = {async call(op, args) { if (op === 'runMaintenance') copies++; return executeMaintenance(op, args); }};
    let selectedParent = f.root;
    const controller = new DesktopController({store, worker, documents: f.parent, authMode: 'disabled', dialogs: {backup: async () => null, destination: async () => null, libraryBackup: async () => fixed.destination, maintenanceParent: async () => selectedParent}});
    await controller.initialize(); controller.binding.current = f.binding;
    await assert.rejects(controller.restoreLibraryBackup(), {code: 'UNSAFE_PATH'});
    assert.equal(copies, 0); assert.equal(controller.binding.maintenancePending, null);
    const alias = path.join(f.parent, 'VAULT');
    if (fs.existsSync(alias) && fs.statSync(alias).ino === fs.statSync(f.root).ino) {
        selectedParent = alias;
        await assert.rejects(controller.restoreLibraryBackup(), {code: 'UNSAFE_PATH'});
        assert.equal(copies, 0);
    }
    controller.binding.maintenancePending = fixed;
    await assert.rejects(controller.restoreLibraryBackup(), {code: 'PENDING_MUTATION'});
    assert.equal(copies, 0); assert.deepEqual(controller.binding.maintenancePending, fixed);
});
