import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createLibrary} from '../../plugin-src/src/lib/file-library/index.mjs';
import {execute} from '../src/main/worker.mts';
import {BindingStore} from '../src/main/bindings.mts';
import {DesktopController} from '../src/main/controller.mts';

test('worker rejects retired browser operations, unknown operations and malformed native inputs', async () => {
    for (const op of ['inspect', 'query', 'import', 'resume', 'shell']) await assert.rejects(execute(op, {}), {code: 'INVALID_INPUT'});
    for (const [op, args] of [['bind', {destination: '/tmp/library', arbitrary: true}], ['list', {destination: '/tmp/library', libraryId: 'arbitrary'}], ['readContent', {binding: {}, id: '../outside'}]]) {
        await assert.rejects(execute(op, args), {code: 'INVALID_INPUT'});
    }
});

test('native library open through controller and worker preserves identity, untrusted text and later external edits after restart', async t => {
    const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'nova-electron-native-roundtrip-')));
    t.after(() => fs.rm(root, {recursive: true, force: true}));
    const destination = path.join(root, 'library'), library = createLibrary(destination);
    const content = library.createContent({title: '<script>untrusted()</script>', body: 'native body'});
    const create = () => new DesktopController({
        store: new BindingStore(path.join(root, 'machine.json')),
        worker: {call: execute},
        documents: root,
        dialogs: {destination: async () => null, library: async () => destination}
    });
    const first = create();
    await first.initialize(); await first.openLibrary();
    assert.equal((await first.listContents())[0].title, content.title);
    const identity = structuredClone(first.binding.current);
    library.updateContent(content.id, {body: 'later external edit'}, content.editToken);
    const reopened = create();
    await reopened.initialize();
    assert.deepEqual(reopened.binding.current, identity);
    assert.equal((await reopened.readContent({id: content.id})).body, 'later external edit');
    assert.equal((await reopened.listContents()).length, 1);
    assert.equal((await reopened.status()).currentName, 'library');
});
