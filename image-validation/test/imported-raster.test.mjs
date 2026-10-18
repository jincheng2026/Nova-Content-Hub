import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {validateImage, validateImportedRaster, IMPORTED_RASTER_LIMITS} from '../index.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const rejects = (code, fn) => assert.rejects(fn, error => error.code === code);

async function animation(format, frames = 3) {
    const data = Buffer.alloc(frames * 3 * 2 * 4);
    for (let frame = 0; frame < frames; frame++) for (let i = frame * 24; i < (frame + 1) * 24; i += 4) {
        data[i] = frame % 256;
        data[i + 1] = frame % 2 ? 255 : 0;
        data[i + 3] = 255;
    }
    return sharp(data, {
        raw: {
            width: 3,
            height: 2 * frames,
            channels: 4,
            pageHeight: 2
        }
    })[format]({delay: Array(frames).fill(100), loop: 0}).toBuffer();
}

for (const format of ['png', 'jpeg', 'webp']) test(`import validates real static ${format} and keeps original bytes/hash`, async () => {
    const bytes = await sharp({create: {width: 8, height: 5, channels: 3, background: 'red'}})[format]().toBuffer();
    const original = Buffer.from(bytes);
    const result = await validateImportedRaster(bytes);
    assert.deepEqual({...result, frames: undefined}, {...await validateImage(bytes), frames: undefined});
    assert.equal(result.frames, 1);
    assert.equal(result.assetHash, digest(original));
    assert.deepEqual(bytes, original);
});

test('JPEG EXIF orientation changes displayed dimensions without rewriting compressed source', async () => {
    const bytes = await sharp({
        create: {
            width: 8,
            height: 5,
            channels: 3,
            background: 'blue'
        }
    }).withMetadata({orientation: 6}).jpeg().toBuffer();
    const result = await validateImportedRaster(bytes);
    assert.equal(result.width, 5);
    assert.equal(result.height, 8);
    assert.equal(result.assetHash, digest(bytes));
    assert.equal((await sharp(bytes).metadata()).orientation, 6);
});

for (const format of ['gif', 'webp']) test(`all ${format} frames are decoded and receipt protocol remains static-only`, async () => {
    const bytes = await animation(format);
    const result = await validateImportedRaster(bytes);
    assert.equal(result.frames, 3);
    assert.equal(result.width, 3);
    assert.equal(result.height, 2);
    assert.equal(result.assetHash, digest(bytes));
    await rejects('INVALID_IMAGE', () => validateImage(bytes));
    for (const cut of [1, 4, 12]) await rejects('INVALID_IMAGE', () => validateImportedRaster(bytes.subarray(0, bytes.length - cut)));
});

test('GIF framing rejects an incomplete last frame even when sharp metadata reports a valid earlier frame', async () => {
    const bytes = await animation('gif');
    const truncated = bytes.subarray(0, bytes.length - 4);
    assert.ok((await sharp(truncated, {animated: true}).metadata()).pages < 3);
    await rejects('INVALID_IMAGE', () => validateImportedRaster(truncated));
});

test('actual pixel decoding rejects a complete GIF container with damaged final-frame compressed data', async () => {
    const bytes = await animation('gif');
    const broken = Buffer.from(bytes);
    // The subblock lengths and trailer survive; only LZW data in the last image changes.
    broken[broken.length - 4] = 255;
    assert.equal((await sharp(broken, {animated: true}).metadata()).pages, 3);
    await rejects('INVALID_IMAGE', () => validateImportedRaster(broken));
});

test('APNG is explicitly unsupported and a PNG header cannot count as decoded pixels', async () => {
    const bytes = await sharp({create: {width: 1, height: 1, channels: 3, background: 'red'}}).png().toBuffer();
    const acTL = Buffer.alloc(20);
    acTL.writeUInt32BE(8);
    acTL.write('acTL', 4);
    acTL.writeUInt32BE(2, 8);
    const apng = Buffer.concat([bytes.subarray(0, 33), acTL, bytes.subarray(33)]);
    await rejects('UNSUPPORTED_IMAGE', () => validateImportedRaster(apng));
    await rejects('INVALID_IMAGE', () => validateImportedRaster(bytes.subarray(0, 24)));
});

test('encoded bytes, frames and total pixels have separate bounded rejection', async () => {
    await rejects('IMAGE_LIMIT_EXCEEDED', () => validateImportedRaster(Buffer.alloc(IMPORTED_RASTER_LIMITS.encodedBytes + 1)));
    await rejects('IMAGE_LIMIT_EXCEEDED', () => validateImportedRaster(animationBytes));
    const canvas = await animation('gif');
    canvas.writeUInt16LE(4000, 6);
    canvas.writeUInt16LE(4000, 8);
    for (let i = 13; i < canvas.length - 9; i++) if (canvas[i] === 0x2c) {
        canvas.writeUInt16LE(4000, i + 5);
        canvas.writeUInt16LE(4000, i + 7);
    }
    const metadata = await sharp(canvas, {animated: true}).metadata();
    assert.equal(metadata.pages, 3);
    assert.equal(metadata.width * metadata.pageHeight * metadata.pages, 48_000_000);
    await rejects('IMAGE_LIMIT_EXCEEDED', () => validateImportedRaster(canvas));
    const bytes = await sharp({create: {width: 8001, height: 5000, channels: 3, background: 'red'}}).png().toBuffer();
    await rejects('IMAGE_LIMIT_EXCEEDED', () => validateImportedRaster(bytes));
});
const animationBytes = await animation('gif', IMPORTED_RASTER_LIMITS.frames + 1);

test('missing packaged decoder is a distinct execution failure', t => {
    const moduleURL = new URL('../index.mjs', import.meta.url).href;
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-decoder-'));
    t.after(() => fs.rmSync(parent, {recursive: true, force: true}));
    const loader = path.join(parent, 'missing-sharp.mjs');
    fs.writeFileSync(loader, "export async function resolve(specifier,context,next){if(specifier==='sharp')throw new Error('decoder intentionally absent');return next(specifier,context)}");
    const script = `const {validateImportedRaster}=await import(${JSON.stringify(moduleURL)});try{await validateImportedRaster(Buffer.from([255,216,255,0]))}catch(error){process.stdout.write(error.code);process.exit(error.code==='DECODER_UNAVAILABLE'?0:1)}`;
    const result = spawnSync(process.execPath, ['--experimental-loader', loader, '--input-type=module', '-e', script], {encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, 'DECODER_UNAVAILABLE');
});
