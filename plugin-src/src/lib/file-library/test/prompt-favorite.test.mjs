import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {createLibrary, openLibrary, backupLibrary, restoreBackup} from '../index.mjs';

function fixture(t) {
    const parent = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'nova-prompt-favorite-'));
    t.after(() => fs.rmSync(parent, {recursive: true, force: true}));
    const root = path.join(parent, 'library');
    return {parent, root, library: createLibrary(root)};
}
const metadataPath = (f, id) => path.join(f.root, '提示词', id, '提示词.json');
const rejects = (code, fn) => assert.throws(fn, error => error.code === code);

for (const schemaVersion of [1, 2]) test(`old schema ${schemaVersion} prompts open and list without rewriting bytes or edit tokens`, t => {
    const f = fixture(t), prompt = f.library.createPrompt({title: '旧提示词', body: '  原正文\n🙂\n'});
    const file = metadataPath(f, prompt.id), meta = JSON.parse(fs.readFileSync(file));
    delete meta.favorite;
    if (schemaVersion === 1) delete meta.enabled;
    const raw = Buffer.from(`${JSON.stringify({...meta, schemaVersion}, null, 3)}\n`);
    fs.writeFileSync(file, raw);
    const bodyPath = path.join(path.dirname(file), '正文.md'), body = fs.readFileSync(bodyPath);
    const hash = bytes => createHash('sha256').update(bytes).digest();
    const editToken = createHash('sha256').update(Buffer.concat([hash(raw), hash(body)])).digest('hex');
    const descriptor = fs.readFileSync(path.join(f.root, '内容库.json'));
    const reopened = openLibrary(f.root);
    for (const read of [reopened.readPrompt(prompt.id), ...reopened.listPrompts()]) {
        assert.equal(read.favorite ?? false, false);
        assert.equal(Object.hasOwn(read, 'favorite'), false);
        assert.equal(read.editToken, editToken);
    }
    assert.deepEqual(fs.readFileSync(file), raw);
    assert.deepEqual(fs.readFileSync(bodyPath), body);
    assert.deepEqual(fs.readFileSync(path.join(f.root, '内容库.json')), descriptor);
    const favorite = reopened.setPromptFavorite(prompt.id, true, editToken);
    assert.equal(favorite.favorite, true);
    assert.equal(favorite.schemaVersion, schemaVersion);
});

test('prompt favorite persists through reopen, other edits, trash/restore and backup/restore', t => {
    const f = fixture(t);
    let prompt = f.library.createPrompt({title: '提示词', body: '原正文'});
    assert.equal(prompt.favorite, false);
    assert.equal(JSON.parse(fs.readFileSync(metadataPath(f, prompt.id))).favorite, false);
    const originalSchema = prompt.schemaVersion;
    prompt = f.library.setPromptFavorite(prompt.id, true, prompt.editToken);
    assert.equal(openLibrary(f.root).readPrompt(prompt.id).favorite, true);
    prompt = f.library.updatePrompt(prompt.id, {body: '更新正文', title: '更新标题'}, prompt.editToken);
    assert.equal(prompt.favorite, true);
    prompt = f.library.setPromptEnabled(prompt.id, false, prompt.editToken);
    assert.equal(prompt.favorite, true);
    prompt = f.library.trashPrompt(prompt.id, prompt.editToken);
    assert.equal(f.library.listPromptTrash()[0].favorite, true);
    prompt = f.library.restorePrompt(prompt.id, prompt.editToken);
    assert.equal(prompt.favorite, true);
    assert.equal(prompt.schemaVersion, originalSchema);
    const backup = path.join(f.parent, 'backup'), restored = path.join(f.parent, 'restored');
    backupLibrary(f.root, backup);
    restoreBackup(backup, restored);
    const recovered = openLibrary(restored).readPrompt(prompt.id);
    assert.equal(recovered.favorite, true);
    assert.equal(recovered.enabled, false);
    assert.equal(recovered.body, '更新正文');
    assert.equal(recovered.editToken, prompt.editToken);
    prompt = f.library.setPromptFavorite(prompt.id, false, prompt.editToken);
    assert.equal(openLibrary(f.root).readPrompt(prompt.id).favorite, false);
});

test('favorite writes require booleans, preserve CAS and replay only the identical mutation', t => {
    const f = fixture(t), prompt = f.library.createPrompt({title: '提示词', body: '原正文'});
    for (const value of [undefined, null, 0, 1, '', 'false', [], {}]) rejects('INVALID_INPUT', () => f.library.setPromptFavorite(prompt.id, value, prompt.editToken));
    assert.equal(f.library.readPrompt(prompt.id).editToken, prompt.editToken);
    const options = {mutationId: randomUUID()};
    const favorite = f.library.setPromptFavorite(prompt.id, true, prompt.editToken, options);
    assert.deepEqual(f.library.setPromptFavorite(prompt.id, true, prompt.editToken, options), favorite);
    rejects('INVALID_INPUT', () => f.library.setPromptFavorite(prompt.id, false, prompt.editToken, options));
    rejects('CONFLICT', () => f.library.setPromptFavorite(prompt.id, false, prompt.editToken));
    rejects('INVALID_INPUT', () => f.library.updatePrompt(prompt.id, {favorite: false}, favorite.editToken));
    rejects('INVALID_INPUT', () => f.library.createPrompt({title: '绕过表单', body: '', favorite: true}));
    assert.equal(f.library.readPrompt(prompt.id).favorite, true);
    const trashed = f.library.trashPrompt(prompt.id, favorite.editToken);
    rejects('INVALID_STATE', () => f.library.setPromptFavorite(prompt.id, false, trashed.editToken));
});

for (const favorite of [null, 0, 1, 'false', [], {}]) test(`present non-boolean prompt favorite ${JSON.stringify(favorite)} is corrupt`, t => {
    const f = fixture(t), prompt = f.library.createPrompt({title: '提示词', body: ''}), file = metadataPath(f, prompt.id);
    fs.writeFileSync(file, JSON.stringify({...JSON.parse(fs.readFileSync(file)), favorite}));
    rejects('CORRUPT', () => f.library.readPrompt(prompt.id));
    rejects('CORRUPT', () => f.library.listPrompts());
});
