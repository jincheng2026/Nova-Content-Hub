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
        const image = await sharp(path.join(output, `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`)).metadata();
        assert.equal(image.width, size * scale);
        assert.equal(image.height, size * scale);
        assert.equal(image.hasAlpha, true);
    }
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
