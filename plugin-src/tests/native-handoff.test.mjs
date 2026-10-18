import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import {randomUUID} from 'node:crypto';
import {createLibrary} from '../src/lib/file-library/index.mjs';
import {nativeHandoffDirectory, prepareNativeHandoff, readNativeHandoff} from '../src/bridge/native-handoff.mjs';

const release = {
    format: 'nova-content-desktop-release',
    schemaVersion: 1,
    productId: 'nova-content-hub',
    appScope: 'nova-content-hub',
    protocolVersion: 1,
    prototype: true,
    version: '0.2.0',
    AUTH_MODE: 'disabled',
    pairId: 'nova-content-hub@0.2.0:p1:disabled',
    experimental: true,
    productionReady: false,
    platform: process.platform,
    arch: process.arch
};
const failure = (code, callback) => assert.throws(callback, error => error.code === code);

async function fixture(t, host = 'codex') {
    const parent = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'nova native handoff '));
    t.after(() => fs.rmSync(parent, {force: true, recursive: true}));
    const library = createLibrary(path.join(parent, '内容库'));
    const picture = path.join(parent, 'sample.png');
    fs.writeFileSync(picture, await sharp({
        create: {
            width: 24,
            height: 32,
            channels: 3,
            background: '#123456'
        }
    }).png().toBuffer());
    const asset = library.importAsset(picture, {purpose: 'template-reference'});
    const template = library.createTemplate({
        name: 'Fixture',
        definition: {original: true},
        resources: {
            sample: {
                assetHash: asset.assetHash,
                bytes: asset.bytes,
                detectedType: asset.detectedType,
                role: 'style'
            }
        }
    });
    const content = library.createContent({title: 'Sensitive title not for URL', body: '# Private body\r\n'});
    const {request} = library.createCoverRequest(content.id, {
        template: {id: template.id, version: 1},
        styleAssetHashes: [asset.assetHash],
        photo: null,
        materialIds: [],
        prompt: 'Fixed generation intent',
        pixels: {width: 24, height: 32},
        ratio: '3:4',
        count: 1,
        outputFormat: 'png',
        scope: 'cover-only'
    }, content.editToken);
    const {attempt} = library.createCoverAttempt(content.id, request.requestId, {host});
    const binding = {
        root: library.info.root,
        libraryId: library.info.libraryId,
        rootIdentity: library.info.rootIdentity
    };
    const task = {
        contentId: content.id,
        requestId: request.requestId,
        attemptId: attempt.attemptId,
        requestHash: request.requestHash,
        host
    };
    const directory = nativeHandoffDirectory(parent);
    return {parent, library, content, binding, task, directory};
}

for (const host of ['codex', 'workbuddy']) test(`${host} envelope resolves exact bound attempt and URL contains only the short handoff identity`, async t => {
    const f = await fixture(t, host), prepared = await prepareNativeHandoff(f.directory, f.binding, f.task, release);
    const url = new URL(prepared.url);
    assert.equal(url.protocol, `${host}:`);
    assert.ok(prepared.url.length < 2081);
    assert.ok(url.searchParams.get('prompt').includes(prepared.id));
    assert.ok(!prepared.url.includes(encodeURIComponent(f.parent)));
    assert.ok(!url.searchParams.get('prompt').includes(f.content.title));
    const found = readNativeHandoff(f.directory, prepared.id, {...release, format: 'nova-content-plugin-release'});
    assert.deepEqual(found.binding, f.binding);
    assert.deepEqual(found.task, f.task);
    assert.equal(found.library.readContent(f.content.id).title, f.content.title);
    if (process.platform !== 'win32') {
        assert.equal(fs.statSync(path.join(f.directory, `${prepared.id}.json`)).mode & 0o777, 0o600);
        assert.equal(fs.statSync(f.directory).mode & 0o777, 0o700);
    }
});

test('release and request/host validation stop before creating an envelope', async t => {
    const f = await fixture(t);
    for (const bad of [null, {...release, pairId: 'wrong'}, {...release, platform: 'other'}, {
        ...release,
        productionReady: true
    }]) await assert.rejects(prepareNativeHandoff(f.directory, f.binding, f.task, bad), {code: 'PACKAGE_INVALID'});
    await assert.rejects(prepareNativeHandoff(f.directory, f.binding, f.task, {
        ...release,
        AUTH_MODE: 'required',
        pairId: 'nova-content-hub@0.2.0:p1:required'
    }), {code: 'AUTH_NOT_CONFIGURED'});
    await assert.rejects(prepareNativeHandoff(f.directory, f.binding, {
        ...f.task,
        host: 'workbuddy'
    }, release), {code: 'CONFLICT'});
    await assert.rejects(prepareNativeHandoff(f.directory, f.binding, {
        ...f.task,
        requestHash: '0'.repeat(64)
    }, release), {code: 'CONFLICT'});
    await assert.rejects(prepareNativeHandoff(f.directory, {
        ...f.binding,
        rootIdentity: {dev: '00', ino: '1'}
    }, f.task, release), {code: 'INVALID_HANDOFF'});
    assert.equal(fs.existsSync(f.directory), false);
});

test('launching stale or inactive attempts refuses; historical envelope still permits core status/replay checks', async t => {
    const f = await fixture(t), prepared = await prepareNativeHandoff(f.directory, f.binding, f.task, release);
    f.library.cancelCoverAttempt(f.task.contentId, f.task.requestId, f.task.attemptId);
    await assert.rejects(prepareNativeHandoff(f.directory, f.binding, f.task, release), {code: 'ATTEMPT_INACTIVE'});
    const found = readNativeHandoff(f.directory, prepared.id, release);
    assert.equal(found.library.readCoverContext(f.task.contentId, f.task.requestId, f.task.attemptId).attempt.status, 'cancelled');
    const newer = f.library.createCoverAttempt(f.task.contentId, f.task.requestId, {host: 'codex'});
    const current = f.library.readContent(f.content.id);
    f.library.updateContent(current.id, {body: '# Changed'}, current.editToken);
    await assert.rejects(prepareNativeHandoff(f.directory, f.binding, {
        ...f.task,
        attemptId: newer.attempt.attemptId
    }, release), {code: 'STALE_INPUT'});
});

test('malformed, oversized, symlink and cross-pair envelopes fail closed', async t => {
    const f = await fixture(t), prepared = await prepareNativeHandoff(f.directory, f.binding, f.task, release);
    const file = path.join(f.directory, `${prepared.id}.json`), original = fs.readFileSync(file),
        parsed = JSON.parse(original);
    failure('INVALID_HANDOFF', () => readNativeHandoff(f.directory, '../other', release));
    for (const bad of [Buffer.from([0xff]), Buffer.from('{}'), Buffer.from(JSON.stringify({
        ...parsed,
        task: {...parsed.task, root: '/injected'}
    }))]) {
        fs.writeFileSync(file, bad);
        failure('INVALID_HANDOFF', () => readNativeHandoff(f.directory, prepared.id, release));
    }
    fs.writeFileSync(file, JSON.stringify({...parsed, pairId: 'other'}));
    failure('PAIR_MISMATCH', () => readNativeHandoff(f.directory, prepared.id, release));
    fs.writeFileSync(file, Buffer.alloc(65537));
    failure('UNSAFE_PATH', () => readNativeHandoff(f.directory, prepared.id, release));
    fs.writeFileSync(file, original);
    const target = path.join(f.parent, 'linked.json');
    fs.renameSync(file, target);
    fs.symlinkSync(target, file);
    failure('UNSAFE_PATH', () => readNativeHandoff(f.directory, prepared.id, release));
    const alias = path.join(f.parent, 'alias');
    fs.symlinkSync(f.directory, alias, 'dir');
    await assert.rejects(prepareNativeHandoff(alias, f.binding, f.task, release), {code: 'UNSAFE_PATH'});
});

test('same-ID library clone cannot be recovered or mutated through a stale machine locator', async t => {
    const f = await fixture(t), prepared = await prepareNativeHandoff(f.directory, f.binding, f.task, release);
    fs.renameSync(f.binding.root, `${f.binding.root}-original`);
    fs.cpSync(`${f.binding.root}-original`, f.binding.root, {recursive: true});
    failure('CONFLICT', () => readNativeHandoff(f.directory, prepared.id, release));
    await assert.rejects(prepareNativeHandoff(f.directory, f.binding, f.task, release), {code: 'CONFLICT'});
    assert.equal(fs.readdirSync(f.directory).length, 1);
});
