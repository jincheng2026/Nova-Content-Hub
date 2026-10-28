import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {execute} from '../src/main/worker.mts';
import {createLibrary, openLibrary, __testing} from '../../plugin-src/src/lib/file-library/index.mjs';
process.env.NODE_ENV = 'test';

async function fixture(t, background = '#53acde') {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nch-raster-reader-'));
    t.after(async () => {__testing.setHook(undefined); await fs.rm(root, {recursive: true, force: true});});
    const libraryRoot = path.join(root, 'library'), library = createLibrary(libraryRoot);
    const bytes = await sharp({create: {width: 32, height: 24, channels: 3, background}}).png().toBuffer();
    const source = path.join(root, 'original.png'); await fs.writeFile(source, bytes);
    const asset = library.importAsset(source, {purpose: 'generated-cover'});
    const binding = {root: library.info.root, libraryId: library.info.libraryId, rootIdentity: library.info.rootIdentity};
    const read = (bound = binding) => execute('raster', {binding: bound, assetHash: asset.assetHash}, 'disabled');
    return {root, libraryRoot, library, bytes, asset, binding, read};
}

test('successive raster reads reuse one bound library opening while returning the original bytes', async t => {
    const f = await fixture(t); let openings = 0;
    __testing.setHook(({phase, root}) => {if (phase === 'afterOpenValidation' && root === f.binding.root) openings++;});
    for (let n = 0; n < 3; n++) assert.deepEqual(Buffer.from((await f.read()).data), f.bytes);
    assert.equal(openings, 1, 'repeated image display must not reopen and rescan all content');
});

test('a warm raster read rejects same-size bytes with restored mtime', async t => {
    const f = await fixture(t); await f.read();
    const file = path.join(f.libraryRoot, '资产', 'sha256', f.asset.assetHash.slice(0, 2), f.asset.assetHash), stat = await fs.stat(file);
    const altered = Buffer.from(f.bytes); altered[altered.length - 1] ^= 1;
    await fs.writeFile(file, altered); await fs.utimes(file, stat.atime, stat.mtime);
    assert.equal((await fs.stat(file)).size, stat.size);
    await assert.rejects(f.read(), {code: 'CORRUPT'});
    await fs.writeFile(file, f.bytes); assert.deepEqual(Buffer.from((await f.read()).data), f.bytes);
});

test('validated MIME hits skip sharp metadata while current-byte tampering is still refused', async t => {
    const decoder = (await import('../../node_modules/sharp/dist/index.mjs')).default;
    const f = await fixture(t, '#c0ffee'), metadata = decoder.prototype.metadata; let calls = 0;
    t.mock.method(decoder.prototype, 'metadata', function (...args) {calls++; return Reflect.apply(metadata, this, args);});
    assert.deepEqual(Buffer.from((await f.read()).data), f.bytes); assert.ok(calls > 0);
    const coldCalls = calls;
    assert.deepEqual(Buffer.from((await f.read()).data), f.bytes); assert.equal(calls, coldCalls);
    const file = path.join(f.libraryRoot, '资产', 'sha256', f.asset.assetHash.slice(0, 2), f.asset.assetHash), stat = await fs.stat(file);
    const altered = Buffer.from(f.bytes); altered[altered.length - 1] ^= 1;
    await fs.writeFile(file, altered); await fs.utimes(file, stat.atime, stat.mtime);
    await assert.rejects(f.read(), {code: 'CORRUPT'}); assert.equal(calls, coldCalls);
});

test('a warm reader rejects a cloned root at the same path and accepts its explicit new binding', async t => {
    const f = await fixture(t); await f.read();
    const old = path.join(f.root, 'old'); await fs.rename(f.libraryRoot, old); await fs.cp(old, f.libraryRoot, {recursive: true});
    await assert.rejects(f.read(), {code: 'CONFLICT'});
    const clone = openLibrary(f.libraryRoot), binding = {...f.binding, rootIdentity: clone.info.rootIdentity};
    assert.notDeepEqual(binding.rootIdentity, f.binding.rootIdentity);
    assert.deepEqual(Buffer.from((await f.read(binding)).data), f.bytes);
    await assert.rejects(f.read(), {code: 'CONFLICT'});
});

test('a warm reader checks the descriptor identity and current lock on every access', async t => {
    const f = await fixture(t); await f.read();
    const file = path.join(f.libraryRoot, '内容库.json'), bytes = await fs.readFile(file), changed = JSON.parse(bytes);
    changed.libraryId = randomUUID(); await fs.writeFile(file, JSON.stringify(changed));
    await assert.rejects(f.read(), error => ['CORRUPT', 'CONFLICT'].includes(error.code));
    await fs.writeFile(file, bytes); await f.read();
    const lock = path.join(f.libraryRoot, '系统（别动）', '库锁'), token = randomUUID(); await fs.mkdir(lock);
    await fs.writeFile(path.join(lock, `${token}.json`), JSON.stringify({token, host: os.hostname(), pid: process.pid}));
    await assert.rejects(f.read(), {code: 'BUSY'});
    await fs.rm(lock, {recursive: true}); assert.deepEqual(Buffer.from((await f.read()).data), f.bytes);
});

test('a warm raster read still recovers a durable pending content transaction', async t => {
    const f = await fixture(t), content = f.library.createContent({title: 'before', body: 'body'}); await f.read();
    __testing.setHook(({phase}) => {if (phase === 'afterJournal') throw Error('synthetic exit before apply');});
    assert.throws(() => f.library.updateContent(content.id, {title: 'after'}, content.editToken));
    __testing.setHook(undefined);
    assert.deepEqual(Buffer.from((await f.read()).data), f.bytes);
    const recovered = JSON.parse(await fs.readFile(path.join(f.libraryRoot, '内容', content.id, '内容.json'), 'utf8'));
    assert.equal(recovered.title, 'after', 'the raster access itself must recover before any later document read');
});

test('root replacement during asynchronous raster decode is rejected by the second asset read', async t => {
    const f = await fixture(t, '#45b68e');
    const reading = f.read();
    // This independent hash has never been decoded: the cold path must still recheck the root.
    // execute(raster) synchronously obtains original bytes before awaiting sharp decode.
    // Replacement happens while decode is pending, so only the post-decode reread catches it.
    const old = path.join(f.root, 'old'); fsSync.renameSync(f.libraryRoot, old); fsSync.cpSync(old, f.libraryRoot, {recursive: true});
    await assert.rejects(reading, {code: 'CONFLICT'});
});

test('two-image batches isolate bad images and reject an unbounded batch', async t => {
    const f = await fixture(t), source = path.join(f.root, 'structure.svg');
    await fs.writeFile(source, '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="24"/>');
    const bad = f.library.importAsset(source, {purpose: 'template-structure'});
    const replies = await execute('rasterBatch', {binding: f.binding, assetHashes: [bad.assetHash, f.asset.assetHash]}, 'disabled');
    assert.equal(replies[0].ok, false); assert.equal(replies[1].ok, true);
    assert.deepEqual(Buffer.from(replies[1].value.data), f.bytes, 'the good image has fully settled when the batch returns');
    await assert.rejects(execute('rasterBatch', {binding: f.binding, assetHashes: Array.from({length: 13}, (_, i) => i.toString(16).padStart(64, '0'))}), {code: 'INVALID_INPUT'});
    await assert.rejects(execute('rasterBatch', {binding: f.binding, assetHashes: [f.asset.assetHash, f.asset.assetHash]}), {code: 'INVALID_INPUT'});
});

test('image requests merge in flight, cap batches at two, drain before writers, and discard revoked work', async t => {
    const {Covers} = await import('../src/main/covers.mts');
    const {createOperationQueue} = await import('../src/main/operation-queue.mts');
    const {createHash} = await import('node:crypto');
    const f = await fixture(t), run = createOperationQueue(), calls = []; let release, writerStarted = false;
    const held = new Promise(resolve => {release = resolve;});
    const worker = {call: async (op, args) => {calls.push({op, args}); await held; return args.assetHashes.map(() => ({ok: true, value: {data: f.bytes, mime: 'image/png'}}));}};
    const covers = new Covers({current: () => f.binding, worker}, undefined, {call: (op, args) => run(() => worker.call(op, args), 'background')});
    const urls = ['one', 'two', 'three'].map(text => covers.grant(createHash('sha256').update(text).digest('hex')));
    const first = covers.resource(urls[0]); assert.equal(covers.resource(urls[0]), first);
    const second = covers.resource(urls[1]), third = covers.resource(urls[2]);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls.length, 1); assert.equal(calls[0].op, 'rasterBatch'); assert.equal(calls[0].args.assetHashes.length, 3);
    const writer = run(() => {writerStarted = true;}); await new Promise(resolve => setImmediate(resolve));
    assert.equal(writerStarted, false);
    covers.revoke(); release();
    assert.deepEqual(await Promise.all([first, second, third]), [null, null, null]); await writer;
    assert.equal(writerStarted, true); assert.equal(calls.length, 1, 'revoked queued images never reach the worker');
    await run.close();
});
