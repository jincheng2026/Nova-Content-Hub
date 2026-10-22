import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {CHANNELS} from '../src/main/boundary.mts';
import {execute} from '../src/main/worker.mts';
import {DesktopController} from '../src/main/controller.mts';
import {BindingStore, emptyBinding} from '../src/main/bindings.mts';

test('desktop bridge and worker expose no prototype backup import', async () => {
    for (const method of ['chooseBackup', 'chooseDestination', 'importBackup', 'resumeImport']) {
        assert.equal(CHANNELS.includes(method), false, method);
        assert.equal(typeof DesktopController.prototype[method], 'undefined', method);
    }
    for (const op of ['inspect', 'query', 'import', 'resume']) {
        await assert.rejects(execute(op, {}, 'disabled'), {code: 'INVALID_INPUT'});
    }
});

test('obsolete import pointers do not query files or block a valid desktop binding', async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-desktop-only-'));
    t.after(() => fs.rm(root, {recursive: true, force: true}));
    const store = new BindingStore(path.join(root, 'binding.json'));
    const current = {root, libraryId: '321c7abe-530f-4ffa-8c00-1ed42d3d8015', rootIdentity: {dev: '1', ino: '2'}};
    await store.save({...emptyBinding(), current, source: path.join(root, 'old.json'), sourceHash: 'a'.repeat(64), destination: root, started: true});
    const controller = new DesktopController({store, worker: {call() {throw Error('Removed prototype path must never be queried');}}, dialogs: {}, documents: root});
    await controller.initialize();
    await controller.maySwitch();
    const status = await controller.status();
    assert.equal(status.currentName, path.basename(root));
    assert.equal(controller.current().libraryId, current.libraryId);
});
