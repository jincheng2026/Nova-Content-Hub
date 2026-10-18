import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {DesktopController} from '../src/main/controller.mts';
import {BindingStore} from '../src/main/bindings.mts';
import {execute} from '../src/main/worker.mts';
import {assertCaller, PAGE} from '../src/main/boundary.mts';
import {openLibrary, createLibrary, __testing} from '../../plugin-src/src/lib/file-library/index.mjs';

process.env.NODE_ENV = 'test';

async function fixture(t, mode = 'disabled') {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-native-lifecycle-'));
    t.after(() => {
        __testing.setHook(undefined);
        return fs.rm(root, {recursive: true, force: true});
    });
    const destination = path.join(root, 'library');
    const file = path.join(root, 'machine.json');
    const worker = {call: (op, args) => execute(op, args, mode)};
    const make = () => new DesktopController({
        store: new BindingStore(file),
        worker,
        documents: root,
        authMode: mode,
        dialogs: {backup: async () => null, destination: async () => destination, library: async () => destination}
    });
    const controller = make();
    await controller.initialize();
    return {root, destination, file, controller, worker, make};
}

test('native create/edit/trash/restore/reopen uses one identity and preserves unrelated business metadata', async t => {
    const f = await fixture(t);
    await f.controller.createLibrary();
    const identity = f.controller.binding.current;
    let item = await f.controller.createContent({title: 'new', body: '<script>text only</script>'});
    const core = openLibrary(f.destination);
    item = core.savePublicationPlan(item.id, {
        channelId: 'wechat',
        scheduledAt: '2026-10-20T00:00:00Z',
        timezone: 'UTC'
    }, item.editToken);
    item = await f.controller.updateContent({
        id: item.id,
        editToken: item.editToken,
        title: 'edited',
        body: 'raw body'
    });
    assert.equal(core.readContent(item.id).plans.length, 1);
    item = await f.controller.trashContent({id: item.id, editToken: item.editToken});
    assert.equal((await f.controller.listContents()).length, 0);
    assert.equal((await f.controller.listContents({view: 'trash'})).length, 1);
    item = await f.controller.restoreContent({id: item.id, editToken: item.editToken});
    const reopened = f.make();
    await reopened.initialize();
    assert.deepEqual(reopened.binding.current, identity);
    assert.equal((await reopened.readContent({id: item.id})).title, 'edited');
    assert.equal(reopened.binding.importId, null);
    assert.equal(reopened.binding.started, false);
});
test('main persists input and mutation ID before worker; predispatch loss retries only the same ID', async t => {
    const f = await fixture(t);
    await f.controller.createLibrary();
    const original = f.worker.call;
    let lose = true;
    let saved;
    const dispatched = [];
    f.worker.call = async (op, args) => {
        if (op === 'mutate') {
            dispatched.push(args.mutation.mutationId);
            saved = (await new BindingStore(f.file).load()).pending;
            assert.deepEqual(saved, args.mutation);
            if (lose) {
                lose = false;
                throw Object.assign(new Error('exit'), {code: 'WORKER_EXIT'});
            }
        }
        return original(op, args);
    };
    await assert.rejects(f.controller.createContent({title: 'draft', body: 'preserved'}), {code: 'WORKER_EXIT'});
    await assert.rejects(f.controller.createContent({title: 'second', body: ''}), {code: 'PENDING_MUTATION'});
    await assert.rejects(f.controller.openLibrary(), {code: 'PENDING_MUTATION'});
    const reopened = f.make();
    await reopened.initialize();
    assert.equal((await reopened.queryPendingMutation()).state, 'missing');
    const item = await reopened.retryPendingMutation();
    assert.equal(item.body, 'preserved');
    assert.deepEqual(dispatched, [saved.mutationId, saved.mutationId]);
    assert.equal(openLibrary(f.destination).queryMutation(saved.mutationId).objectId, item.id);
    assert.equal((await reopened.listContents()).length, 1);
});
test('committed response loss queries current content and never replays old receipt over later edits', async t => {
    const f = await fixture(t);
    await f.controller.createLibrary();
    const original = f.worker.call;
    let pending;
    let lost = false;
    f.worker.call = async (op, args) => {
        const result = await original(op, args);
        if (op === 'mutate' && !lost) {
            pending = args.mutation;
            lost = true;
            throw Object.assign(new Error('response lost'), {code: 'WORKER_EXIT'});
        }
        return result;
    };
    await assert.rejects(f.controller.createContent({title: 'first', body: 'old receipt'}), {code: 'WORKER_EXIT'});
    const core = openLibrary(f.destination);
    const first = core.listContents()[0];
    core.updateContent(first.id, {body: 'later external edit'}, first.editToken);
    const reopened = f.make();
    await reopened.initialize();
    const result = await reopened.queryPendingMutation();
    assert.equal(result.state, 'committed');
    assert.equal(result.current.body, 'later external edit');
    assert.equal(result.draft.body, 'old receipt');
    await assert.rejects(reopened.retryPendingMutation(), {code: 'NO_PENDING'});
    assert.equal(core.listContents().length, 1);
    assert.equal(core.queryMutation(pending.mutationId).content.body, 'old receipt');
});
test('conflict retains submitted draft until explicit save-as or discard; query errors never mean missing', async t => {
    const f = await fixture(t);
    await f.controller.createLibrary();
    const item = await f.controller.createContent({title: 'first', body: 'base'});
    const core = openLibrary(f.destination);
    core.updateContent(item.id, {body: 'disk'}, item.editToken);
    await assert.rejects(f.controller.updateContent({
        id: item.id,
        editToken: item.editToken,
        title: 'draft',
        body: 'local'
    }), {code: 'CONFLICT'});
    assert.equal((await f.controller.status()).pending.draft.body, 'local');
    assert.equal((await f.controller.queryPendingMutation()).state, 'conflict');
    await f.controller.resolvePendingMutation({action: 'keep'});
    assert.ok(f.controller.binding.pending);
    const original = f.worker.call;
    f.worker.call = async (op, args) => {
        if (op === 'queryMutation') throw Object.assign(new Error('recovery blocked'), {code: 'RECOVERY_CONFLICT'});
        return original(op, args);
    };
    await assert.rejects(f.controller.queryPendingMutation(), {code: 'RECOVERY_CONFLICT'});
    assert.ok(f.controller.binding.pending);
    assert.equal((await f.controller.status()).pending.state, 'uncertain');
    f.worker.call = original;
    const saved = await f.controller.resolvePendingMutation({action: 'saveAs'});
    assert.equal(saved.body, 'local');
    assert.equal(core.readContent(item.id).body, 'disk');
    assert.equal(core.listContents().length, 2);
});
test('required build main and worker reject all five business writes before any business mutation', async t => {
    const f = await fixture(t, 'required');
    await assert.rejects(f.controller.createLibrary(), {code: 'AUTH_NOT_CONFIGURED'});
    await assert.rejects(fs.stat(f.destination), {code: 'ENOENT'});
    const core = createLibrary(f.destination);
    let item = core.createContent({title: 'readable', body: 'body'});
    await f.controller.openLibrary();
    const binding = f.controller.binding.current;
    const before = await fs.readdir(path.join(f.destination, '系统（别动）', '事务', '已提交'));
    for (const [op, input] of [['createContent', {title: 'blocked', body: ''}], ['updateContent', {
        id: item.id,
        editToken: item.editToken,
        title: 'blocked',
        body: ''
    }], ['trashContent', {id: item.id, editToken: item.editToken}], ['restoreContent', {
        id: item.id,
        editToken: item.editToken
    }]]) {
        await assert.rejects(f.controller[op](input), {code: 'AUTH_NOT_CONFIGURED'});
        await assert.rejects(execute('mutate', {
            binding,
            mutation: {mutationId: randomUUID(), op, input}
        }), {code: 'AUTH_NOT_CONFIGURED'});
    }
    await assert.rejects(execute('createLibrary', {
        root: f.destination,
        rootIdentity: binding.rootIdentity,
        mutationId: randomUUID()
    }), {code: 'AUTH_NOT_CONFIGURED'});
    assert.deepEqual(await fs.readdir(path.join(f.destination, '系统（别动）', '事务', '已提交')), before);
    assert.equal(f.controller.binding.pending, null);
    assert.equal((await f.controller.listContents()).length, 1);
});
test('bound roots reject different libraries and same-ID clones before any pending recovery', async t => {
    const f = await fixture(t);
    await f.controller.createLibrary();
    const original = f.controller.binding.current;
    const core = openLibrary(f.destination);
    const item = core.createContent({title: 'base', body: 'base'});
    __testing.setHook(event => {
        if (event.phase === 'afterJournal') throw new Error('stop before commit');
    });
    try {
        core.updateContent(item.id, {body: 'pending'}, item.editToken);
    } catch {
    } finally {
        __testing.setHook(undefined);
    }
    const saved = path.join(f.root, 'original');
    await fs.rename(f.destination, saved);
    await fs.cp(saved, f.destination, {recursive: true});
    const snapshot = async () => fs.readdir(path.join(f.destination, '系统（别动）', '事务', '待恢复'));
    const before = await snapshot();
    assert.equal(before.length, 1);
    await assert.rejects(f.controller.listContents(), {code: 'CONFLICT'});
    assert.deepEqual(await snapshot(), before);
    await fs.rm(f.destination, {recursive: true});
    createLibrary(f.destination);
    await assert.rejects(f.controller.listContents(), {code: 'CONFLICT'});
    assert.deepEqual(f.controller.binding.current, original);
});
test('creation response loss verifies fixed original inode; failure never removes its directory', async t => {
    const f = await fixture(t);
    const original = f.worker.call;
    f.worker.call = async (op, args) => {
        const result = await original(op, args);
        if (op === 'createLibrary') throw Object.assign(new Error('lost'), {code: 'WORKER_EXIT'});
        return result;
    };
    await assert.rejects(f.controller.createLibrary(), {code: 'WORKER_EXIT'});
    const reservation = f.controller.binding.creation;
    assert.ok(reservation);
    const reopened = f.make();
    await reopened.initialize();
    await assert.rejects(reopened.createLibrary(), {code: 'PENDING_MUTATION'});
    const originalRoot = path.join(f.root, 'original-created');
    await fs.rename(f.destination, originalRoot);
    await fs.cp(originalRoot, f.destination, {recursive: true});
    await assert.rejects(reopened.queryPendingMutation(), {code: 'CONFLICT'});
    assert.ok(reopened.binding.creation);
    await fs.rm(f.destination, {recursive: true});
    await fs.rename(originalRoot, f.destination);
    await reopened.queryPendingMutation();
    assert.equal(reopened.binding.current.rootIdentity.ino, reservation.rootIdentity.ino);
    assert.equal(reopened.binding.creation, null);
});
test('legacy bindings require explicit reselect; renderer and worker inputs are exact and finite', async t => {
    const f = await fixture(t);
    await f.controller.createLibrary();
    const binding = {...f.controller.binding};
    delete binding.current;
    binding.libraryId = f.controller.binding.current.libraryId;
    binding.importId = randomUUID();
    binding.source = path.join(f.root, 'old.json');
    binding.sourceHash = 'a'.repeat(64);
    binding.destination = f.destination;
    binding.started = true;
    await new BindingStore(f.file).save(binding);
    const reopened = f.make();
    await reopened.initialize();
    assert.equal(reopened.binding.needsReselect, true);
    assert.throws(() => reopened.current(), {code: 'LIBRARY_NOT_READY'});
    const original = f.worker.call;
    f.worker.call = async (op, args) => op === 'query' ? {
        importId: binding.importId,
        sourceHash: binding.sourceHash,
        libraryId: binding.libraryId,
        status: 'committed',
        issues: [],
        progress: {steps: 1}
    } : original(op, args);
    await reopened.openLibrary();
    assert.equal(reopened.binding.needsReselect, false);
    assert.equal(reopened.current().libraryId, binding.libraryId);
    const frame = {url: PAGE};
    const sender = {mainFrame: frame, isDestroyed: () => false};
    const event = {sender, senderFrame: frame};
    for (const input of [{title: 'x', body: '', path: '/tmp'}, {
        title: 'x',
        body: '',
        authMode: 'disabled'
    }, {title: 'x', body: 'x'.repeat(1_000_001)}, {
        title: ' ',
        body: ''
    }]) assert.throws(() => assertCaller(event, sender, [input], 'createContent'), {code: 'INVALID_INPUT'});
    for (const input of [{id: '../x'}, {id: 'https://evil.test'}, {
        id: randomUUID(),
        libraryId: randomUUID()
    }]) assert.throws(() => assertCaller(event, sender, [input], 'readContent'), {code: 'INVALID_INPUT'});
    await assert.rejects(execute('readContent', {
        binding: f.controller.binding.current,
        id: '../x'
    }), {code: 'INVALID_INPUT'});
    await assert.rejects(execute('mutate', {
        binding: f.controller.binding.current,
        mutation: {mutationId: randomUUID(), op: 'createContent', input: {title: 'x', body: '', arbitrary: true}}
    }, 'disabled'), {code: 'INVALID_INPUT'});
});
test('empty reserved creation can explicitly retry its original ID; partial failure can only be abandoned without deleting data', async t => {
    const f = await fixture(t);
    const original = f.worker.call;
    let stopped = false;
    f.worker.call = async (op, args) => {
        if (op === 'createLibrary' && !stopped) {
            stopped = true;
            throw Object.assign(new Error('not dispatched'), {code: 'WORKER_EXIT'});
        }
        return original(op, args);
    };
    await assert.rejects(f.controller.createLibrary(), {code: 'WORKER_EXIT'});
    const reservation = f.controller.binding.creation;
    await f.controller.queryPendingMutation();
    assert.equal((await f.controller.status()).creationMissing, true);
    assert.equal(await f.controller.retryPendingMutation(), null);
    assert.equal(f.controller.binding.current.rootIdentity.ino, reservation.rootIdentity.ino);
    const failed = path.join(f.root, 'partial');
    await fs.mkdir(failed);
    await fs.writeFile(path.join(failed, 'keep.txt'), 'preserve failed creation');
    const stat = await fs.stat(failed, {bigint: true});
    await f.controller.persist({
        ...f.controller.binding,
        creation: {
            root: failed,
            rootIdentity: {dev: stat.dev.toString(), ino: stat.ino.toString()},
            mutationId: randomUUID()
        }
    });
    await assert.rejects(f.controller.queryPendingMutation(), {code: 'ENOENT'});
    assert.ok(f.controller.binding.creation);
    await f.controller.resolvePendingMutation({action: 'discard'});
    assert.equal(f.controller.binding.creation, null);
    assert.equal(await fs.readFile(path.join(failed, 'keep.txt'), 'utf8'), 'preserve failed creation');
});
test('unsupported old/future library formats are rejected without upgrading or overwriting their descriptor', async t => {
    const f = await fixture(t);
    await f.controller.createLibrary();
    const descriptor = path.join(f.destination, '内容库.json');
    const current = JSON.parse(await fs.readFile(descriptor, 'utf8'));
    for (const schemaVersion of [1, 999]) {
        const raw = JSON.stringify({...current, schemaVersion});
        await fs.writeFile(descriptor, raw);
        await assert.rejects(f.controller.listContents(), {code: schemaVersion === 1 ? 'UPGRADE_REQUIRED' : 'FORMAT_UNSUPPORTED'});
        assert.equal(await fs.readFile(descriptor, 'utf8'), raw);
    }
});
test('pending content blocks import-result rebinding; unfinished import blocks new content and changing library', async t => {
    const f = await fixture(t);
    await f.controller.createLibrary();
    const original = f.worker.call;
    f.worker.call = async (op, args) => {
        if (op === 'mutate') throw Object.assign(new Error('lost'), {code: 'WORKER_EXIT'});
        return original(op, args);
    };
    await assert.rejects(f.controller.createContent({title: 'pending', body: 'saved input'}), {code: 'WORKER_EXIT'});
    await assert.rejects(f.controller.resumeImport(), {code: 'PENDING_MUTATION'});
    await f.controller.resolvePendingMutation({action: 'discard'});
    await f.controller.persist({
        ...f.controller.binding,
        source: path.join(f.root, 'old.json'),
        sourceHash: 'a'.repeat(64),
        destination: path.join(f.root, 'importing'),
        started: true
    });
    f.worker.call = async (op, args) => op === 'query' ? null : original(op, args);
    await assert.rejects(f.controller.createContent({title: 'during import', body: ''}), {code: 'IMPORT_IN_PROGRESS'});
    await assert.rejects(f.controller.openLibrary(), {code: 'IMPORT_IN_PROGRESS'});
    assert.equal(f.controller.binding.pending, null);
});
test('explicit save-as retains the submitted draft even when query discovers a committed operation with later disk edits', async t => {
    const f = await fixture(t);
    await f.controller.createLibrary();
    const original = f.worker.call;
    let lost = false;
    f.worker.call = async (op, args) => {
        const value = await original(op, args);
        if (op === 'mutate' && !lost) {
            lost = true;
            throw Object.assign(new Error('lost'), {code: 'WORKER_EXIT'});
        }
        return value;
    };
    await assert.rejects(f.controller.createContent({
        title: 'submitted',
        body: 'preserve original draft'
    }), {code: 'WORKER_EXIT'});
    const core = openLibrary(f.destination);
    const first = core.listContents()[0];
    core.updateContent(first.id, {body: 'later disk version'}, first.editToken);
    const copy = await f.controller.resolvePendingMutation({action: 'saveAs'});
    assert.notEqual(copy.id, first.id);
    assert.equal(copy.body, 'preserve original draft');
    assert.equal(core.readContent(first.id).body, 'later disk version');
    assert.equal(core.listContents().length, 2);
});
test('explicitly adopting another current library retires only the completed import pointer', async t => {
    const f = await fixture(t);
    await f.controller.createLibrary();
    const importedId = randomUUID();
    await f.controller.persist({
        ...f.controller.binding,
        source: path.join(f.root, 'backup.json'),
        sourceHash: 'a'.repeat(64),
        destination: path.join(f.root, 'old-import'),
        started: true,
        importId: importedId,
        libraryId: randomUUID()
    });
    const original = f.worker.call;
    f.worker.call = async (op, args) => op === 'query' ? {
        importId: importedId,
        sourceHash: f.controller.binding.sourceHash,
        libraryId: f.controller.binding.libraryId,
        status: 'committed',
        issues: [],
        progress: {steps: 1}
    } : original(op, args);
    await f.controller.openLibrary();
    assert.equal(f.controller.binding.importId, null);
    assert.equal(f.controller.binding.started, false);
    f.worker.call = async (op, args) => {
        if (op === 'query') throw new Error('Old import path is no longer available');
        return original(op, args);
    };
    assert.ok((await f.controller.status()).currentName);
    assert.equal((await f.controller.listContents()).length, 0);
});
test('save-as ENOSPC preserves the original durable committed pending until its replacement can be saved atomically', async t => {
    const f = await fixture(t);
    await f.controller.createLibrary();
    const original = f.worker.call;
    let lost = false;
    f.worker.call = async (op, args) => {
        const value = await original(op, args);
        if (op === 'mutate' && !lost) {
            lost = true;
            throw Object.assign(new Error('lost'), {code: 'WORKER_EXIT'});
        }
        return value;
    };
    await assert.rejects(f.controller.createContent({
        title: 'submitted',
        body: 'durable original draft'
    }), {code: 'WORKER_EXIT'});
    const pending = f.controller.binding.pending;
    const core = openLibrary(f.destination);
    const first = core.listContents()[0];
    core.updateContent(first.id, {body: 'later disk edit'}, first.editToken);
    const save = f.controller.store.save.bind(f.controller.store);
    const attempts = [];
    f.controller.store.save = async next => {
        attempts.push(next.pending);
        throw Object.assign(new Error('disk full'), {code: 'ENOSPC'});
    };
    await assert.rejects(f.controller.resolvePendingMutation({action: 'saveAs'}), {code: 'ENOSPC'});
    assert.equal(attempts.length, 1);
    assert.equal(attempts[0].op, 'createContent');
    assert.notEqual(attempts[0].mutationId, pending.mutationId);
    assert.deepEqual(f.controller.binding.pending, pending);
    assert.deepEqual((await new BindingStore(f.file).load()).pending, pending);
    f.controller.store.save = save;
    const reopened = f.make();
    await reopened.initialize();
    const result = await reopened.resolvePendingMutation({action: 'saveAs'});
    assert.equal(result.body, 'durable original draft');
    assert.equal(core.listContents().length, 2);
});
test('keep on a committed pending retains the submitted draft and durable record after restart', async t => {
    const f = await fixture(t);
    await f.controller.createLibrary();
    const original = f.worker.call;
    f.worker.call = async (op, args) => {
        const result = await original(op, args);
        if (op === 'mutate') throw Object.assign(new Error('lost'), {code: 'WORKER_EXIT'});
        return result;
    };
    await assert.rejects(f.controller.createContent({
        title: 'submitted',
        body: 'keep this draft'
    }), {code: 'WORKER_EXIT'});
    const core = openLibrary(f.destination);
    const item = core.listContents()[0];
    core.updateContent(item.id, {body: 'later disk'}, item.editToken);
    const reopened = f.make();
    await reopened.initialize();
    assert.equal((await reopened.resolvePendingMutation({action: 'keep'})).body, 'later disk');
    assert.equal((await reopened.status()).pending.draft.body, 'keep this draft');
    assert.equal((await new BindingStore(f.file).load()).pending.input.body, 'keep this draft');
});
test('worker consumes core expectedRootIdentity during initialization before writing a replacement directory', async t => {
    const f = await fixture(t);
    await fs.mkdir(f.destination);
    const stat = await fs.lstat(f.destination, {bigint: true});
    // Fault hooks are synchronous: replace after the core emptiness check, before its first mkdir.
    const sync = await import('node:fs');
    __testing.setHook(event => {
        if (event.phase === 'createAfterEmptyCheck') {
            sync.renameSync(f.destination, path.join(f.root, 'reserved-original'));
            sync.mkdirSync(f.destination);
        }
    });
    await assert.rejects(execute('createLibrary', {
        root: f.destination,
        rootIdentity: {dev: stat.dev.toString(), ino: stat.ino.toString()},
        mutationId: randomUUID()
    }, 'disabled'), {code: 'CONFLICT'});
    __testing.setHook(undefined);
    assert.deepEqual(await fs.readdir(f.destination), []);
});
