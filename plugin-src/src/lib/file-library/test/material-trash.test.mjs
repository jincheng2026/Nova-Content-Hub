import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {createLibrary, openLibrary, backupLibrary, restoreBackup} from '../index.mjs';

function fixture(t) {
    const parent = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'nova-material-trash-')),
        root = path.join(parent, 'library');
    t.after(() => fs.rmSync(parent, {recursive: true, force: true}));
    return {parent, root, lib: createLibrary(root)};
}

async function asset(f) {
    const file = path.join(f.parent, 'source.png');
    fs.writeFileSync(file, await sharp({
        create: {
            width: 8,
            height: 6,
            channels: 3,
            background: 'red'
        }
    }).png().toBuffer());
    return f.lib.importAsset(file, {purpose: 'material'});
}

const reject = (code, fn) => assert.throws(fn, e => e.code === code);
const date = {precision: 'date', date: '2026-10-18'};

test('material trash blocks a new request, preserves historical request bytes and restores the same material ID', async t => {
    const f = fixture(t), a = await asset(f), template = f.lib.createTemplate({
        name: 'Style',
        definition: {},
        resources: {sample: {assetHash: a.assetHash, bytes: a.bytes, detectedType: a.detectedType, role: 'style'}}
    });
    let c = f.lib.createContent({title: 'Content', body: 'body'});
    c = f.lib.attachContentMaterial(c.id, {assetHash: a.assetHash, originalName: 'source.png'}, c.editToken);
    const materialId = c.materials[0].id;
    const input = {
        template: {id: template.id, version: 1},
        styleAssetHashes: [a.assetHash],
        photo: null,
        materialIds: [materialId],
        prompt: 'cover',
        pixels: {width: 8, height: 6},
        ratio: '4:3',
        count: 1,
        outputFormat: 'png',
        scope: 'cover-only'
    };
    const request = f.lib.createCoverRequest(c.id, input, c.editToken),
        attempt = f.lib.createCoverAttempt(c.id, request.request.requestId, {host: 'codex'});
    const old = f.lib.readCoverContext(c.id, request.request.requestId, attempt.attempt.attemptId);
    c = f.lib.trashContentMaterial(c.id, materialId, attempt.content.editToken);
    assert.equal(c.schemaVersion, 4);
    assert.ok(c.materials[0].deletedAt);
    assert.throws(() => f.lib.createCoverRequest(c.id, input, c.editToken), e => e.code === 'INVALID_INPUT' && /trashed/i.test(e.message));
    assert.deepEqual(f.lib.readCoverContext(c.id, request.request.requestId, attempt.attempt.attemptId).request, old.request);
    c = f.lib.restoreContentMaterial(c.id, materialId, c.editToken);
    assert.equal(c.materials[0].id, materialId);
    assert.equal(c.materials[0].deletedAt, null);
    const again = f.lib.createCoverRequest(c.id, input, c.editToken);
    assert.equal(again.request.requestId, request.request.requestId);
});

for (const [prefix, create, read] of [['Content', 'createContent', 'readContent'], ['Collection', 'createCollection', 'readCollection']]) test(`${prefix} soft-deleted material and unavailable reference retain IDs, guards, history and backup`, async t => {
    const f = fixture(t), a = await asset(f);
    let item = f.lib[create]({title: prefix, body: ''});
    item = f.lib[`attach${prefix}Material`](item.id, {
        assetHash: a.assetHash,
        originalName: 'source.png'
    }, item.editToken);
    const materialId = item.materials[0].id;
    item = f.lib[`trash${prefix}Material`](item.id, materialId, item.editToken);
    reject('INVALID_STATE', () => f.lib[`trash${prefix}Material`](item.id, materialId, item.editToken));
    item = f.lib[`restore${prefix}Material`](item.id, materialId, item.editToken);
    assert.equal(item.materials[0].id, materialId);
    item = f.lib[`add${prefix}UnavailableReference`](item.id, {
        kind: 'material',
        originalId: 'missing',
        reason: 'missing-bytes'
    }, item.editToken);
    const referenceId = item.unavailableReferences[0].id;
    item = f.lib[`trash${prefix}UnavailableReference`](item.id, referenceId, item.editToken);
    assert.ok(item.unavailableReferences[0].deletedAt);
    assert.equal(item.unavailableReferences[0].availability, 'unavailable');
    item = f.lib[`restore${prefix}UnavailableReference`](item.id, referenceId, item.editToken);
    assert.equal(item.unavailableReferences[0].id, referenceId);
    assert.equal(item.unavailableReferences[0].availability, 'unavailable');
    item = f.lib[`trash${prefix}UnavailableReference`](item.id, referenceId, item.editToken);
    const deletedAt = item.unavailableReferences[0].deletedAt;
    item = f.lib[`resolve${prefix}UnavailableReference`](item.id, referenceId, {assetHash: a.assetHash}, item.editToken);
    assert.equal(item.unavailableReferences[0].deletedAt, deletedAt);
    item = f.lib[`restore${prefix}UnavailableReference`](item.id, referenceId, item.editToken);
    assert.equal(item.unavailableReferences[0].id, referenceId);
    assert.equal(item.unavailableReferences[0].deletedAt, null);
    item = f.lib[`trash${prefix}Material`](item.id, materialId, item.editToken);
    item = f.lib[`trash${prefix}UnavailableReference`](item.id, referenceId, item.editToken);
    const backup = path.join(f.parent, 'backup'), restored = path.join(f.parent, 'restored');
    backupLibrary(f.root, backup);
    restoreBackup(backup, restored);
    const actual = openLibrary(restored)[read](item.id);
    assert.deepEqual(actual.materials, item.materials);
    assert.deepEqual(actual.unavailableReferences, item.unavailableReferences);
});

test('trashed resolved candidate references cannot become current selections or publication covers', async t => {
    const f = fixture(t), a = await asset(f);
    let c = f.lib.createContent({title: 'Content', body: ''});
    c = f.lib.addContentUnavailableReference(c.id, {
        kind: 'candidate',
        originalId: 'old',
        reason: 'missing'
    }, c.editToken);
    const referenceId = c.unavailableReferences[0].id;
    c = f.lib.resolveContentUnavailableReference(c.id, referenceId, {assetHash: a.assetHash}, c.editToken);
    c = f.lib.selectContentCover(c.id, referenceId, c.editToken);
    c = f.lib.savePublicationPlan(c.id, {channelId: 'douyin', text: 'post', schedule: date}, c.editToken);
    c = f.lib.trashContentUnavailableReference(c.id, referenceId, c.editToken);
    reject('INVALID_INPUT', () => f.lib.selectContentCover(c.id, referenceId, c.editToken));
    reject('INVALID_INPUT', () => f.lib.saveContentCoverVariant(c.id, {
        name: 'current',
        ratio: '4:3',
        selectedCandidateId: referenceId
    }, c.editToken));
    reject('INVALID_INPUT', () => f.lib.recordPublication(c.id, {planId: c.plans[0].id, schedule: date}, c.editToken));
    c = f.lib.restoreContentUnavailableReference(c.id, referenceId, c.editToken);
    c = f.lib.recordPublication(c.id, {planId: c.plans[0].id, schedule: date}, c.editToken);
    assert.equal(f.lib.readPublication(c.id, c.publications[0].id).cover.candidateId, referenceId);
});

test('profile marks retain duplicate keys with distinct original values', t => {
    const f = fixture(t), marks = [{key: '身份', value: '摄影师'}, {key: '身份', value: '旅行者'}],
        settings = f.lib.readLibrarySettings();
    f.lib.updateProfile({marks}, settings.editToken);
    assert.deepEqual(f.lib.readLibrarySettings().profile.marks, marks);
    assert.deepEqual(openLibrary(f.root).readLibrarySettings().profile.marks, marks);
});

test('material trash explicitly upgrades legacy content metadata to schema4', async t => {
    const f = fixture(t), a = await asset(f);
    let c = f.lib.createContent({title: 'Legacy', body: ''});
    c = f.lib.attachContentMaterial(c.id, {assetHash: a.assetHash, originalName: 'source.png'}, c.editToken);
    const target = path.join(f.root, '内容', c.id, '内容.json'), meta = JSON.parse(fs.readFileSync(target));
    meta.schemaVersion = 3;
    for (const key of ['channelIds', 'recordedDate', 'plannedDate', 'preferredTemplateId', 'isExample', 'publicationEvents', 'coverVariants', 'importedCoverBatches', 'unavailableReferences']) delete meta[key];
    fs.writeFileSync(target, JSON.stringify(meta));
    c = f.lib.readContent(c.id);
    assert.equal(c.schemaVersion, 3);
    c = f.lib.trashContentMaterial(c.id, c.materials[0].id, c.editToken);
    assert.equal(c.schemaVersion, 4);
    assert.ok(c.materials[0].deletedAt);
});
