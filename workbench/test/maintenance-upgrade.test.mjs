import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createLibrary, openLibrary, __testing} from '../../plugin-src/src/lib/file-library/index.mjs';
import {executeMaintenance, isMaintenanceOperation} from '../src/main/maintenance-worker.mts';
import {DesktopController} from '../src/main/controller.mts';
import {BindingStore, emptyBinding, validateBinding} from '../src/main/bindings.mts';
import {validateInput} from '../src/shared/validation.ts';
import {CHANNELS} from '../src/main/boundary.mts';

function fixture(t) {
    const parent = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'nova-upgrade-gui-'));
    t.after(() => fs.rmSync(parent, {recursive: true, force: true}));
    const source = path.join(parent, 'old-library');
    createLibrary(source);
    const content = {id: randomUUID()}, now = new Date().toISOString();
    const directory = path.join(source, '内容', content.id);
    fs.mkdirSync(directory);
    // Write a real legacy shape directly; current createContent also emits schema5 transaction history.
    fs.writeFileSync(path.join(directory, '内容.json'), JSON.stringify({format: 'nova-content', schemaVersion: 3, id: content.id, title: '必须保留', revision: 1, createdAt: now, updatedAt: now, deletedAt: null, materials: [], candidates: [], selectedCover: null, plans: [], publications: [], coverJobs: []}));
    fs.writeFileSync(path.join(directory, '正文.md'), '旧内容库正文');
    const descriptor = path.join(source, '内容库.json');
    const original = Buffer.from(`${JSON.stringify({...JSON.parse(fs.readFileSync(descriptor)), schemaVersion: 4})}\n`);
    fs.writeFileSync(descriptor, original);
    for (const directory of ['库配置', '合集']) fs.rmSync(path.join(source, directory), {recursive: true});
    const inspected = executeMaintenance('inspectLegacyLibrary', {source});
    const stat = fs.lstatSync(parent, {bigint: true}), operationId = randomUUID();
    const pending = {operationId, startedAt: new Date().toISOString(), destination: path.join(parent, 'copy'), parentIdentity: {dev: String(stat.dev), ino: String(stat.ino)}, kind: 'upgrade', source: inspected.binding, descriptorHash: inspected.descriptorHash, backupDestination: path.join(parent, 'backup'), stage: 'backup', backup: null, targetIdentity: null, resultHash: null};
    return {parent, source, content, original, pending};
}
const step = pending => executeMaintenance('runLibraryUpgradeStage', {pending});
const query = pending => executeMaintenance('queryLibraryUpgrade', {pending});
function throughRestore(pending) {
    pending = step(pending).pending;
    pending = step(pending).pending;
    return step(pending).pending;
}

test('upgrade pipeline keeps source business files, requires independent receipt, and opens only the pinned copy', t => {
    const f = fixture(t), body = fs.readFileSync(path.join(f.source, '内容', f.content.id, '正文.md'));
    let pending = throughRestore(f.pending);
    assert.equal(pending.stage, 'upgrade');
    assert.ok(pending.targetIdentity);
    assert.equal(query(pending).receipt, null);
    pending = step(pending).pending;
    assert.equal(pending.stage, 'receipt');
    assert.equal(query(pending).receipt, null, 'schema5 marker alone cannot complete the desktop operation');
    const result = step(pending);
    assert.equal(result.receipt.kind, 'upgrade');
    assert.equal(query(result.pending).receipt.kind, 'upgrade');
    const binding = executeMaintenance('bindUpgradedLibrary', {pending: result.pending});
    assert.equal(binding.root, f.pending.destination);
    assert.equal(openLibrary(binding.root).readContent(f.content.id).body, '旧内容库正文');
    assert.deepEqual(fs.readFileSync(path.join(f.source, '内容库.json')), f.original);
    assert.deepEqual(fs.readFileSync(path.join(f.source, '内容', f.content.id, '正文.md')), body);
    assert.equal(fs.existsSync(path.join(f.source, '系统（别动）', '内容库.schema4.bak.json')), false);
});

test('a final marker followed by an actual open failure cannot publish an operation receipt', t => {
    const f = fixture(t), pending = throughRestore(f.pending);
    const previousMode = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    t.after(() => {
        __testing.setHook(undefined);
        if (previousMode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousMode;
    });
    __testing.setHook(event => {
        if (event.phase === 'upgrade5AfterFinalMarker') fs.writeFileSync(path.join(pending.destination, '内容', f.content.id, '内容.json'), '{broken metadata');
    });
    assert.throws(() => step(pending), {code: 'CORRUPT'});
    __testing.setHook(undefined);
    assert.equal(fs.existsSync(path.join(pending.destination, '系统（别动）', '事务', '升级到5', '完成.json')), true);
    const reconciled = query(pending);
    assert.equal(reconciled.pending.stage, 'receipt');
    assert.equal(reconciled.receipt, null, 'read-only marker inspection cannot label the operation complete');
    assert.throws(() => step(reconciled.pending), {code: 'CORRUPT'});
    assert.equal(fs.existsSync(path.join(f.parent, `.Nova-upgrade-${pending.operationId}.json`)), false);
    assert.equal(query(reconciled.pending).receipt, null);
});

test('query proves a lost restore response and pins the completed target before continuation', async t => {
    const f = fixture(t), file = path.join(f.parent, 'binding.json');
    let loseRestore = true, mutationCalls = 0;
    const worker = {async call(op, args) {
        assert.ok(isMaintenanceOperation(op), op);
        if (op === 'runLibraryUpgradeStage') {
            mutationCalls++;
            const saved = await new BindingStore(file).load();
            assert.equal(saved.maintenancePending.stage, args.pending.stage);
            if (args.pending.stage === 'upgrade') assert.deepEqual(saved.maintenancePending.targetIdentity, args.pending.targetIdentity);
        }
        const result = executeMaintenance(op, args);
        if (op === 'runLibraryUpgradeStage' && args.pending.stage === 'restore' && loseRestore) {
            loseRestore = false;
            throw Object.assign(new Error('lost response'), {code: 'WORKER_EXIT'});
        }
        return result;
    }};
    const make = () => new DesktopController({store: new BindingStore(file), worker, documents: f.parent, authMode: 'disabled', dialogs: {backup: async () => null, destination: async () => null, legacyLibrary: async () => f.source, maintenanceParent: async () => f.parent}});
    const controller = make();
    await controller.initialize();
    const preview = await controller.prepareLibraryUpgrade();
    assert.equal(fs.existsSync(path.join(f.parent, preview.backupName)), false, 'preview performs no copy');
    assert.equal(controller.binding.maintenancePending, null);
    await assert.rejects(controller.confirmLibraryUpgrade(), {code: 'WORKER_EXIT'});
    const restored = make();
    await restored.initialize();
    assert.equal(restored.binding.current, null, 'source need not be the current library');
    assert.equal(restored.binding.maintenancePending.stage, 'restore');
    const before = mutationCalls;
    assert.deepEqual(await restored.queryLibraryUpgrade(), {complete: false, stage: 'upgrade'});
    assert.equal(mutationCalls, before, 'query never executes a copy or upgrade');
    assert.ok((await new BindingStore(file).load()).maintenancePending.targetIdentity);
    await restored.continueLibraryUpgrade();
    assert.equal(restored.binding.current, null, 'completion never switches automatically');
    let seeded = false;
    restored.covers.seed = async () => { assert.equal(restored.binding.maintenancePending, null); seeded = true; };
    await restored.openUpgradedLibrary();
    assert.equal(seeded, true);
    assert.equal(path.basename(restored.binding.current.root), preview.destinationName);
});

test('partial backup and partial restored target are preserved and never overwritten', t => {
    const f = fixture(t);
    fs.mkdirSync(f.pending.backupDestination);
    fs.writeFileSync(path.join(f.pending.backupDestination, 'keep.txt'), 'partial');
    assert.throws(() => query(f.pending));
    assert.throws(() => step(f.pending), {code: 'TARGET_EXISTS'});
    assert.equal(fs.readFileSync(path.join(f.pending.backupDestination, 'keep.txt'), 'utf8'), 'partial');
    const g = fixture(t);
    let pending = step(g.pending).pending;
    pending = step(pending).pending;
    fs.mkdirSync(pending.destination);
    fs.writeFileSync(path.join(pending.destination, 'keep.txt'), 'partial');
    assert.throws(() => query(pending));
    assert.throws(() => step(pending), {code: 'TARGET_EXISTS'});
    assert.equal(fs.readFileSync(path.join(pending.destination, 'keep.txt'), 'utf8'), 'partial');
});

test('replacement of the pinned copy blocks upgrade and operation receipt cannot move to another intent', t => {
    const f = fixture(t), pending = throughRestore(f.pending);
    fs.renameSync(pending.destination, `${pending.destination}-preserved`);
    fs.mkdirSync(pending.destination);
    assert.throws(() => query(pending), {code: 'SOURCE_CHANGED'});
    assert.throws(() => step(pending), {code: 'SOURCE_CHANGED'});
    const g = fixture(t);
    let finished = step(throughRestore(g.pending)).pending;
    finished = step(finished).pending;
    const oldReceipt = path.join(g.parent, `.Nova-upgrade-${finished.operationId}.json`), different = {...finished, operationId: randomUUID()};
    fs.copyFileSync(oldReceipt, path.join(g.parent, `.Nova-upgrade-${different.operationId}.json`));
    assert.throws(() => query(different), {code: 'CONFLICT'});
});

test('future, already-current, and pre4 formats are rejected by read-only selection with explicit guidance codes', t => {
    const f = fixture(t), descriptor = path.join(f.source, '内容库.json'), value = JSON.parse(f.original);
    for (const [schemaVersion, code] of [[6, 'UPGRADE_FUTURE_FORMAT'], [5, 'UPGRADE_ALREADY_CURRENT'], [3, 'UPGRADE_LEGACY_FORMAT']]) {
        const bytes = Buffer.from(JSON.stringify({...value, schemaVersion}));
        fs.writeFileSync(descriptor, bytes);
        assert.throws(() => executeMaintenance('inspectLegacyLibrary', {source: f.source}), {code});
        assert.deepEqual(fs.readFileSync(descriptor), bytes);
    }
});

test('upgrade IPC refuses renderer paths and persisted upgrade intent works without a current binding', t => {
    const f = fixture(t);
    assert.doesNotThrow(() => validateBinding({...emptyBinding(), maintenancePending: f.pending}));
    for (const method of ['prepareLibraryUpgrade', 'cancelLibraryUpgrade', 'confirmLibraryUpgrade', 'queryLibraryUpgrade', 'continueLibraryUpgrade', 'openUpgradedLibrary']) {
        assert.ok(CHANNELS.includes(method));
        assert.doesNotThrow(() => validateInput(method, undefined));
        assert.throws(() => validateInput(method, {source: f.source}), {code: 'INVALID_INPUT'});
    }
});
