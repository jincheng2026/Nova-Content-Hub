import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createLibrary} from '../../plugin-src/src/lib/file-library/index.mjs';
import {execute} from '../src/main/worker.mts';
import {workspaceMutation} from '../src/shared/workspace-validation.ts';

function fixture(t) {
    const parent = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'nova-native-prompt-favorite-'));
    t.after(() => fs.rmSync(parent, {recursive: true, force: true}));
    const library = createLibrary(path.join(parent, 'library'));
    const binding = {root: library.info.root, libraryId: library.info.libraryId, rootIdentity: library.info.rootIdentity};
    const request = input => ({binding, pending: {mutationId: randomUUID(), binding: {libraryId: binding.libraryId, rootIdentity: binding.rootIdentity}, input}});
    return {library, binding, request};
}

test('both worker prompt projections default old files without rewrites and expose durable favorite changes', async t => {
    const {library, binding, request} = fixture(t);
    const created = library.createPrompt({title: '旧提示词', body: '原正文'});
    const file = path.join(binding.root, '提示词', created.id, '提示词.json'), meta = JSON.parse(fs.readFileSync(file));
    delete meta.favorite;
    const raw = Buffer.from(JSON.stringify(meta));
    fs.writeFileSync(file, raw);
    const legacy = library.readPrompt(created.id);
    for (const op of ['workspace', 'workspaceLibrary']) {
        const snapshot = await execute(op, {binding});
        assert.equal(snapshot.prompts[0].favorite, false);
        assert.equal(snapshot.prompts[0].editToken, legacy.editToken);
        assert.deepEqual(fs.readFileSync(file), raw);
    }
    const command = request({op: 'setPromptFavorite', id: legacy.id, editToken: legacy.editToken, favorite: true});
    const receipt = await execute('workspaceMutate', command, 'disabled');
    assert.deepEqual(receipt, {objectKind: 'prompt', objectId: legacy.id});
    assert.deepEqual(await execute('workspaceMutate', command, 'disabled'), receipt);
    assert.deepEqual(await execute('workspaceRecover', command, 'disabled'), {receipt, conflict: false});
    for (const op of ['workspace', 'workspaceLibrary']) assert.equal((await execute(op, {binding})).prompts[0].favorite, true);
    const changed = library.readPrompt(legacy.id);
    await assert.rejects(execute('workspaceMutate', request({...command.pending.input, favorite: false}), 'disabled'), {code: 'CONFLICT'});
    const missing = request({...command.pending.input, favorite: false});
    assert.deepEqual(await execute('workspaceRecover', missing, 'disabled'), {receipt: null, conflict: true});
    const sameIdDifferentInput = {...command, pending: {...command.pending, input: {...command.pending.input, favorite: false}}};
    await assert.rejects(execute('workspaceMutate', sameIdDifferentInput, 'disabled'), {code: 'INVALID_INPUT'});
    const update = request({op: 'updatePrompt', id: changed.id, editToken: changed.editToken, title: '改标题', body: '改正文', category: '', summary: '', when: '', tags: []});
    await execute('workspaceMutate', update, 'disabled');
    assert.equal(library.readPrompt(legacy.id).favorite, true);
    const current = library.readPrompt(legacy.id);
    await execute('workspaceMutate', request({op: 'setPromptFavorite', id: current.id, editToken: current.editToken, favorite: false}), 'disabled');
    assert.equal((await execute('workspaceLibrary', {binding})).prompts[0].favorite, false);
});

test('favorite command boundary requires a present boolean and finite fields before any write', async t => {
    const {library, request} = fixture(t), prompt = library.createPrompt({title: '提示词', body: ''});
    const command = {op: 'setPromptFavorite', id: prompt.id, editToken: prompt.editToken, favorite: true};
    assert.equal(workspaceMutation(command), true);
    for (const input of [
        {op: command.op, id: command.id, editToken: command.editToken},
        ...[undefined, null, 0, 1, '', 'false', [], {}].map(favorite => ({...command, favorite})),
        {...command, body: '额外字段'}, {...command, id: '../prompt'}, {...command, editToken: 'bad'}
    ]) {
        assert.equal(workspaceMutation(input), false);
        await assert.rejects(execute('workspaceMutate', request(input), 'disabled'), {code: 'INVALID_INPUT'});
    }
    await assert.rejects(execute('workspaceMutate', request(command)), {code: 'AUTH_NOT_CONFIGURED'});
    assert.equal(library.readPrompt(prompt.id).editToken, prompt.editToken);
});
