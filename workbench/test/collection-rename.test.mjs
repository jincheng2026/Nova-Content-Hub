import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createLibrary} from '../../plugin-src/src/lib/file-library/index.mjs';
import {execute} from '../src/main/worker.mts';

test('collection rename preserves legacy fields and inactive channels while retaining edit and channel guards', async t => {
    const parent = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'nova-collection-rename-'));
    t.after(() => fs.rmSync(parent, {recursive: true, force: true}));
    const library = createLibrary(path.join(parent, 'library'));
    const binding = {root: library.info.root, libraryId: library.info.libraryId, rootIdentity: library.info.rootIdentity};
    let legacy = library.createCollection({title: '旧合集', body: '  旧正文\n🙂\n', channelIds: ['douyin'], dateRange: {start: '2026-10-01', end: '2026-10-31'}});
    const member = library.createContent({title: '合集成员', body: '成员正文'});
    legacy = library.setCollectionMembers(legacy.id, [member.id], legacy.editToken);
    legacy = library.saveCollectionPublicationPlan(legacy.id, {channelId: 'douyin', text: '历史发布文案', schedule: {precision: 'date', date: '2026-10-21'}}, legacy.editToken);
    library.trashChannel('douyin', library.readLibrarySettings().editToken);
    const request = (collection, fields) => ({binding, pending: {
        mutationId: randomUUID(), binding: {libraryId: binding.libraryId, rootIdentity: binding.rootIdentity},
        input: {op: 'updateCollection', id: collection.id, editToken: collection.editToken, title: collection.title, body: collection.body, channelIds: collection.channelIds, dateRange: collection.dateRange, ...fields}
    }});
    const rename = request(legacy, {title: '改名后的合集'});
    const receipt = await execute('workspaceMutate', rename, 'disabled');
    const renamed = library.readCollection(legacy.id);
    assert.equal(renamed.title, '改名后的合集');
    for (const key of ['body', 'channelIds', 'dateRange', 'memberIds', 'plans', 'publications', 'candidates', 'coverVariants']) assert.deepEqual(renamed[key], legacy[key], key);
    assert.notEqual(renamed.editToken, legacy.editToken);
    assert.deepEqual(await execute('workspaceRecover', rename, 'disabled'), {receipt, conflict: false});
    assert.deepEqual(await execute('workspaceMutate', rename, 'disabled'), receipt);
    await assert.rejects(execute('workspaceMutate', {...rename, pending: {...rename.pending, input: {...rename.pending.input, title: '篡改原请求'}}}, 'disabled'), {code: 'INVALID_INPUT'});
    await assert.rejects(execute('workspaceMutate', request(legacy, {title: '过期改名'}), 'disabled'), {code: 'CONFLICT'});
    for (const channelIds of [['missing-channel'], ['douyin', 'wechat-official']]) {
        await assert.rejects(execute('workspaceMutate', request(renamed, {channelIds}), 'disabled'), {code: 'INVALID_INPUT'});
        assert.equal(library.readCollection(legacy.id).editToken, renamed.editToken);
    }
    const edit = request(renamed, {body: '明确修改正文', dateRange: {start: null, end: '2026-11-01'}, channelIds: ['wechat-official']});
    await execute('workspaceMutate', edit, 'disabled');
    const edited = library.readCollection(legacy.id);
    assert.equal(edited.body, edit.pending.input.body);
    assert.deepEqual(edited.dateRange, edit.pending.input.dateRange);
    assert.deepEqual(edited.channelIds, ['wechat-official']);
});
