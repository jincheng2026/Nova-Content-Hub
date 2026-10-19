import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import sharp from 'sharp';
import {checkAppIcons} from '../../scripts/build-app-icons.mjs';

test('desktop icon containers preserve transparency and provide all Windows DPI sizes', async () => {
    const directory = await checkAppIcons();
    for (const [name, size] of [['icon.png', 512], ['icon@2x.png', 1024]]) {
        const {
            data,
            info
        } = await sharp(path.join(directory, name)).ensureAlpha().raw().toBuffer({resolveWithObject: true});
        assert.equal(info.width, size);
        assert.equal(info.height, size);
        assert.equal(data[3], 0);
    }
    const bytes = await fs.readFile(path.join(directory, 'icon.ico'));
    assert.equal(bytes.readUInt16LE(0), 0);
    assert.equal(bytes.readUInt16LE(2), 1);
    const sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
    assert.equal(bytes.readUInt16LE(4), sizes.length);
    let end = 6 + 16 * sizes.length;
    for (const [index, size] of sizes.entries()) {
        const start = 6 + index * 16, length = bytes.readUInt32LE(start + 8), offset = bytes.readUInt32LE(start + 12);
        assert.equal(bytes[start] || 256, size);
        assert.equal(bytes[start + 1] || 256, size);
        assert.equal(offset, end);
        const decoded = await sharp(bytes.subarray(offset, offset + length)).metadata();
        assert.equal(decoded.width, size);
        assert.equal(decoded.height, size);
        assert.equal(decoded.hasAlpha, true);
        end = offset + length;
    }
    assert.equal(end, bytes.length);
});

test('macOS keeps rounded opaque artwork inside an 824px body on a transparent 1024px canvas', async () => {
    const directory = await checkAppIcons();
    const {data, info} = await sharp(path.join(directory, 'icon-mac.png')).ensureAlpha().raw().toBuffer({resolveWithObject: true});
    assert.equal(info.width, 1024); assert.equal(info.height, 1024);
    const alpha = (x, y) => data[(y * info.width + x) * 4 + 3];
    for (let y = 0; y < 1024; y++) for (let x = 0; x < 1024; x++) {
        if (x < 100 || x >= 924 || y < 100 || y >= 924) assert.equal(alpha(x, y), 0, 'Mac grid outside the body stays transparent');
    }
    for (const [x, y] of [[100, 100], [923, 100], [100, 923], [923, 923], [130, 130], [893, 130], [130, 893], [893, 893]]) {
        assert.equal(alpha(x, y), 0, 'rounded body corners stay transparent without a system mask');
    }
    for (const [x, y] of [[512, 120], [512, 900], [115, 512], [910, 512], [512, 512], [300, 500], [700, 500]]) {
        assert.equal(alpha(x, y), 255, 'the navy body and N stay opaque');
    }
    const windows = await sharp(path.join(directory, 'icon@2x.png')).ensureAlpha().raw().toBuffer();
    assert.equal(windows[3], 0, 'Windows retains transparent rounded corners');
});

test('changing an output or the master is rejected without silently rebuilding it', async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-icon-check-'));
    t.after(() => fs.rm(root, {recursive: true, force: true}));
    const original = path.dirname(await checkAppIcons());
    await fs.copyFile(path.join(original, 'nova-content-hub-icon-master.png'), path.join(root, 'nova-content-hub-icon-master.png'));
    await fs.cp(path.join(original, 'desktop'), path.join(root, 'desktop'), {recursive: true});
    await checkAppIcons(root);
    await fs.appendFile(path.join(root, 'desktop/icon.ico'), 'changed');
    await assert.rejects(checkAppIcons(root), /mismatch/);
    await fs.copyFile(path.join(original, 'desktop/icon.ico'), path.join(root, 'desktop/icon.ico'));
    await fs.appendFile(path.join(root, 'nova-content-hub-icon-master.png'), 'changed');
    await assert.rejects(checkAppIcons(root), /stale/);
});

test('macOS iconutil can decode the committed ICNS into the complete Retina iconset', {skip: process.platform !== 'darwin'}, async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-icns-check-'));
    t.after(() => fs.rm(root, {recursive: true, force: true}));
    const output = path.join(root, 'icon.iconset');
    execFileSync('/usr/bin/iconutil', ['-c', 'iconset', '-o', output, path.join(await checkAppIcons(), 'icon.icns')]);
    for (const size of [16, 32, 128, 256, 512]) for (const scale of [1, 2]) {
        const pixels = size * scale;
        const {data, info} = await sharp(path.join(output, `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`)).ensureAlpha().raw().toBuffer({resolveWithObject: true});
        assert.equal(info.width, pixels);
        assert.equal(info.height, pixels);
        assert.equal(data[3], 0);
        assert.equal(data[((pixels / 2) * pixels + pixels / 2) * 4 + 3], 255);
        const expected = await sharp(path.join(await checkAppIcons(), 'icon-mac.png')).resize(pixels, pixels).ensureAlpha().raw().toBuffer();
        for (let i = 3; i < data.length; i += 4) assert.equal(data[i], expected[i], `ICNS ${pixels}px keeps the rounded, inset alpha geometry`);
    }
    const retina = await sharp(path.join(output, 'icon_512x512@2x.png')).ensureAlpha().raw().toBuffer();
    const mac = await sharp(path.join(await checkAppIcons(), 'icon-mac.png')).ensureAlpha().raw().toBuffer();
    assert.deepEqual(retina, mac, 'ICNS and the macOS Dock use the same transparent rounded artwork');
});

test('macOS tray artwork is a transparent monochrome glyph at normal and Retina sizes', async () => {
    const directory = await checkAppIcons();
    for (const [name, size] of [['trayTemplate.png', 18], ['trayTemplate@2x.png', 36]]) {
        const {data, info} = await sharp(path.join(directory, name)).ensureAlpha().raw().toBuffer({resolveWithObject: true});
        assert.equal(info.width, size); assert.equal(info.height, size);
        let opaque = 0, transparent = 0;
        for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] === 0) {transparent++; continue;}
            assert.equal(data[i], 255); assert.equal(data[i + 1], 255); assert.equal(data[i + 2], 255); opaque++;
        }
        assert(opaque > 0 && transparent > 0);
    }
});
