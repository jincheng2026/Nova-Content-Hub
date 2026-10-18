import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createLibrary} from '../../plugin-src/src/lib/file-library/index.mjs';
import {execute} from '../src/main/worker.mts';
import {DesktopController} from '../src/main/controller.mts';
import {BindingStore} from '../src/main/bindings.mts';
import {validateInput} from '../src/shared/validation.ts';

async function fixture(t) {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-stored-links-'));
    t.after(() => fs.rm(parent, {recursive: true, force: true}));
    const root = path.join(parent, 'library'), library = createLibrary(root), opened = [], revealed = [];
    const controller = new DesktopController({store: new BindingStore(path.join(parent, 'binding.json')), worker: {call: execute}, documents: parent,
        dialogs: {backup: async () => null, destination: async () => null, library: async () => root},
        openPublicationURL: async url => {opened.push(url);}, revealFolder: root => {revealed.push(root);}});
    await controller.initialize(); await controller.openLibrary();
    let content = library.createContent({title: 'Published', body: 'Retained original'});
    content = library.savePublicationPlan(content.id, {channelId: 'douyin', text: '', schedule: {precision: 'date', date: '2026-10-18'}, coverChoice: null}, content.editToken);
    content = library.recordPublication(content.id, {planId: content.plans[0].id, schedule: {precision: 'date', date: '2026-10-18'}, url: 'https://example.com/published?a=1#post'}, content.editToken);
    return {parent, root, library, content, controller, opened, revealed, reference: {kind: 'content', id: content.id, publicationId: content.publications[0].id}};
}

test('only an owned stored publication URL is sent to the system browser', async t => {
    const f = await fixture(t);
    assert.deepEqual(await f.controller.openPublicationLink(f.reference), {opened: true});
    assert.deepEqual(f.opened, ['https://example.com/published?a=1#post']);
    await assert.rejects(f.controller.openPublicationLink({...f.reference, id: '00000000-0000-4000-8000-000000000000'}), {code: 'INVALID_PUBLICATION_LINK'});
    assert.equal(f.opened.length, 1);
    for (const extra of [{url: 'file:///tmp/anything'}, {root: f.root}, {host: 'codex'}]) assert.throws(() => validateInput('openPublicationLink', {...f.reference, ...extra}), {code: 'INVALID_INPUT'});
    assert.throws(() => validateInput('revealLibraryFolder', {root: f.root}), {code: 'INVALID_INPUT'});
});

test('invalid stored links and browser errors do not become successful opens', async t => {
    const f = await fixture(t), original = f.controller.worker.call;
    for (const url of ['javascript:alert(1)', 'file:///tmp/anything', 'codex://anything', 'https://user:password@example.com/', 'https://example.com/\nsecret', null]) {
        f.controller.worker = {call: async (method, input) => {
            const result = await original(method, input);
            if (method === 'workspaceLibrary') result.contentDetails.find(item => item.id === f.content.id).publications[0].url = url;
            return result;
        }};
        await assert.rejects(f.controller.openPublicationLink(f.reference), {code: 'INVALID_PUBLICATION_LINK'});
    }
    assert.deepEqual(f.opened, []);
    f.controller.worker = {call: original};
    f.controller.openPublicationURL = async () => {throw new Error('fixture');};
    await assert.rejects(f.controller.openPublicationLink(f.reference), {code: 'PUBLICATION_OPEN_FAILED'});
});

test('reveal requests only the original bound directory and refuses replacements', async t => {
    const f = await fixture(t);
    assert.deepEqual(await f.controller.revealLibraryFolder(), {revealed: true});
    assert.deepEqual(f.revealed, [f.root]);
    await fs.rename(f.root, path.join(f.parent, 'original'));
    await fs.mkdir(f.root);
    await assert.rejects(f.controller.revealLibraryFolder(), {code: 'LIBRARY_NOT_READY'});
    assert.deepEqual(f.revealed, [f.root]);
});
