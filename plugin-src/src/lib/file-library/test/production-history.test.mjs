import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createLibrary} from '../index.mjs';

function fixture(t, body = 'first draft') {
    const temp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'nova-history-test-'));
    t.after(() => fs.rmSync(temp, {recursive: true, force: true}));
    const lib = createLibrary(path.join(temp, 'library'));
    const content = lib.createContent({title: 'current content', body});
    const mutate = (op, input) => lib.mutateProduction(op, {expectedToken: lib.readProduction().editToken, ...input});
    mutate('ensureCreation', {contentId: content.id});
    const read = () => lib.readProductionCreation(content.id);
    const save = (body, creationPatch = {}, state = read()) => lib.saveProductionDraft(content.id, {body, expectedBodyHash: state.content.bodyHash, expectedProductionToken: state.productionToken, creationPatch}, state.content.editToken);
    return {temp, lib, content, mutate, read, save};
}

test('history only exposes validated committed body versions for the current content and bounded summaries to agents', t => {
    const {lib, content, mutate, read, save} = fixture(t);
    const foreign = lib.createContent({title: 'private foreign content', body: 'DO_NOT_EXPOSE_OTHER_BODY'});
    lib.updateContent(foreign.id, {body: 'DO_NOT_EXPOSE_OTHER_REVISION'}, foreign.editToken);
    save('second draft', {analysis: 'latest analysis'});
    save('second draft', {narrative: 'metadata-only change'});
    const history = read().history;
    assert.equal(history.versions.length, 2);
    assert.equal(history.versions[0].afterBody, 'second draft');
    assert.equal(history.versions[0].beforeBody, 'first draft');
    assert.equal(history.versions[0].author, null);
    assert.equal(history.versions[0].reason, null);
    assert.equal(history.versions[0].summary.removed, 'first');
    assert.equal(history.versions[0].summary.added, 'second');
    assert(!JSON.stringify(history).includes('DO_NOT_EXPOSE'));
    assert(!JSON.stringify(history).includes(lib.info.root));
    const task = mutate('createTask', {contentId: content.id, kind: 'review', title: 'review current content', prompt: 'read recent edits'}).tasks.at(-1);
    const context = lib.readProductionContext(task.id);
    assert.equal(context.history.versions.length, 2);
    assert(!Object.hasOwn(context.history.versions[0], 'beforeBody'));
    assert(!Object.hasOwn(context.history.versions[0], 'afterBody'));
    assert.equal(context.history.versions[0].summary.added, 'second');
    assert(!JSON.stringify(context.history).includes('DO_NOT_EXPOSE'));
    assert.throws(() => lib.readProductionCreation('../other'), {code: 'INVALID_INPUT'});
});

test('restoring preserves latest overlays and unrelated workspace updates; stale content and legacy production CAS reject', t => {
    const {lib, mutate, read, save} = fixture(t);
    save('second draft', {analysis: 'latest analysis', narrative: 'latest narrative'});
    const selected = read().history.versions.find(v => v.afterBody === 'first draft');
    const titleId = randomUUID();
    save('second draft', {packaging: {...read().creation.packaging, titles: [{id: titleId, text: 'keep latest title'}], selectedTitleId: titleId}});
    const staleContent = read();
    save('third draft');
    assert.throws(() => save(selected.afterBody, {confirmedBodyHash: null}, staleContent), {code: 'CONFLICT'});
    const staleProduction = read();
    mutate('recordKnowledge', {text: 'new unrelated workspace change', source: 'test'});
    // Migrated overlays are owned by the content CAS, so unrelated knowledge
    // changes are preserved without blocking the restore.
    save(selected.afterBody, {confirmedBodyHash: null}, staleProduction);
    const latest = read();
    assert.equal(latest.content.body, 'first draft');
    assert.equal(latest.creation.analysis, 'latest analysis');
    assert.equal(latest.creation.narrative, 'latest narrative');
    assert.equal(latest.creation.packaging.selectedTitleId, titleId);
    assert.equal(latest.history.versions[0].beforeBody, 'third draft');
    assert.equal(latest.history.versions[0].afterBody, 'first draft');
    assert.notEqual(latest.history.versions[0].transactionId, selected.transactionId);
    assert.equal(lib.readProduction().knowledge.length, 1);
    const legacy = fixture(t);
    const staleLegacy = legacy.read();
    legacy.mutate('recordKnowledge', {text: 'legacy workspace changed', source: 'test'});
    assert.throws(() => legacy.save('restore candidate', {}, staleLegacy), {code: 'CONFLICT'});
});

test('version and response budgets explicitly truncate and never return partial restorable bodies', t => {
    const {read, save} = fixture(t);
    for (let index = 0; index < 24; index++) save(`draft ${index}`);
    const history = read().history;
    assert.equal(history.limit, 20);
    assert.equal(history.versions.length, 20);
    assert.equal(history.truncated, true);
    assert.equal(history.versions[0].afterBody, 'draft 23');
    assert(Buffer.byteLength(JSON.stringify(history)) <= history.responseBytesLimit);
    save('large body '.repeat(110000));
    const large = read().history;
    assert(large.truncated);
    const entry = large.versions[0];
    assert.equal(entry.bodyTruncated, true);
    assert.equal(entry.afterBody, null);
    assert.equal(entry.beforeBody, null);
    assert(entry.summary.added.length <= 300);
    assert(Buffer.byteLength(JSON.stringify(large)) <= large.responseBytesLimit);
});

test('committed marker corruption is rejected before historical text is returned', t => {
    const {lib, read, save} = fixture(t);
    save('second draft');
    const mutationId = read().history.versions[0].transactionId;
    fs.writeFileSync(path.join(lib.info.root, '系统（别动）', '事务', '已提交', mutationId, 'COMMITTED'), '0'.repeat(64) + '\n');
    assert.throws(read, {code: 'CORRUPT'});
});
