import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createLibrary} from '../../plugin-src/src/lib/file-library/index.mjs';
import {execute} from '../src/main/worker.mts';

function fixture(t) {
    const parent = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'nova-workspace-capacity-'));
    t.after(() => fs.rmSync(parent, {recursive: true, force: true}));
    const library = createLibrary(path.join(parent, 'library'));
    const content = library.createContent({title: 'Content', body: '  正文\n🙂\n'});
    const prompt = library.createPrompt({title: 'Prompt', body: '  规则\n🙂\n'});
    const collection = library.createCollection({title: 'Collection', body: '  合集\n🙂\n'});
    return {library, content, prompt, collection};
}

test('full list records retain the same validated bytes and edit tokens as individual reads, including trash', t => {
    const {library, content, prompt, collection} = fixture(t);
    for (const [list, trashList, read, trash, item] of [
        ['listContents', 'listTrash', 'readContent', 'trashContent', content],
        ['listPrompts', 'listPromptTrash', 'readPrompt', 'trashPrompt', prompt],
        ['listCollections', 'listCollectionTrash', 'readCollection', 'trashCollection', collection]
    ]) {
        assert.deepEqual(library[list]()[0], library[read](item.id));
        library[trash](item.id, item.editToken);
        assert.deepEqual(library[trashList]()[0], library[read](item.id));
    }
});

test('workspace projections do not reopen each already validated full record', async t => {
    const {library, content, prompt, collection} = fixture(t);
    const binding = {root: library.info.root, libraryId: library.info.libraryId, rootIdentity: library.info.rootIdentity};
    const originals = {openSync: fs.openSync, closeSync: fs.closeSync, readFileSync: fs.readFileSync};
    const descriptors = new Map(), reads = new Map();
    fs.openSync = (...args) => {const fd = originals.openSync(...args); descriptors.set(fd, String(args[0])); return fd;};
    fs.closeSync = fd => {descriptors.delete(fd); return originals.closeSync(fd);};
    fs.readFileSync = (...args) => {
        const result = originals.readFileSync(...args);
        const file = typeof args[0] === 'number' ? descriptors.get(args[0]) : String(args[0]);
        reads.set(file, (reads.get(file) ?? 0) + 1);
        return result;
    };
    try {
        for (const op of ['workspace', 'workspaceLibrary']) {
            reads.clear();
            const result = await execute(op, {binding});
            const projected = (op === 'workspace' ? result.contents : result.contentDetails)[0];
            assert.equal(projected.body, content.body);
            assert.equal(projected.editToken, content.editToken);
            // Opening validates content once; active and trash each scan once. No fourth per-record read.
            assert.equal(reads.get(path.join(binding.root, '内容', content.id, '内容.json')), 3, op);
            // Open and projection settings each validate prompt categories; the remaining reads are list scans.
            assert.equal(reads.get(path.join(binding.root, '提示词', prompt.id, '提示词.json')), op === 'workspace' ? 3 : 4, op);
            if (op === 'workspaceLibrary') assert.equal(reads.get(path.join(binding.root, '合集', collection.id, '合集.json')), 2, op);
        }
    } finally {Object.assign(fs, originals);}
    const updated = library.updateContent(content.id, {body: '后来保存的新正文'}, content.editToken);
    for (const op of ['workspace', 'workspaceLibrary']) {
        const result = await execute(op, {binding});
        assert.equal((op === 'workspace' ? result.contents : result.contentDetails)[0].body, updated.body, 'each new call must observe later committed edits');
    }
});
