import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import sharp from 'sharp';

const brand = fileURLToPath(new URL('../resources/brand/', import.meta.url));
const master = 'nova-content-hub-icon-master.png';
const files = ['icon.png', 'icon@2x.png', 'icon.ico', 'icon.icns', 'trayTemplate.png', 'trayTemplate@2x.png'];
const windowsSizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

export async function checkAppIcons(directory = brand) {
    const output = path.join(directory, 'desktop');
    const manifest = JSON.parse(await fs.readFile(path.join(output, 'manifest.json'), 'utf8'));
    if (manifest.format !== 'nova-content-app-icons' || manifest.schemaVersion !== 1 ||
        manifest.source !== master || manifest.sourceHash !== hash(await fs.readFile(path.join(directory, master))) ||
        Object.keys(manifest.files ?? {}).sort().join() !== [...files].sort().join()) throw Error('Application icons are stale; regenerate on macOS with npm run icons:build.');
    for (const name of files) if (hash(await fs.readFile(path.join(output, name))) !== manifest.files[name]) throw Error(`Application icon mismatch: ${name}`);
    return output;
}

export async function buildAppIcons() {
    if (process.platform !== 'darwin') throw Error('Regenerating ICNS requires macOS iconutil. Windows builds use the committed assets and icons:check.');
    const source = await fs.readFile(path.join(brand, master));
    const metadata = await sharp(source).metadata();
    if (!metadata.hasAlpha || metadata.width !== metadata.height || metadata.width < 1024) throw Error('Use the transparent square brand master, at least 1024px.');
    const pngs = new Map();
    for (const size of new Set([...windowsSizes, 512, 1024])) pngs.set(size, await sharp(source).resize(size, size).ensureAlpha().png({compressionLevel: 9}).toBuffer());
    // ICO stores a directory followed by complete PNG images (Windows Vista and later).
    const header = Buffer.alloc(6 + 16 * windowsSizes.length);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(windowsSizes.length, 4);
    let offset = header.length;
    for (const [index, size] of windowsSizes.entries()) {
        const position = 6 + index * 16, bytes = pngs.get(size);
        header[position] = header[position + 1] = size === 256 ? 0 : size;
        header.writeUInt16LE(1, position + 4);
        header.writeUInt16LE(32, position + 6);
        header.writeUInt32LE(bytes.length, position + 8);
        header.writeUInt32LE(offset, position + 12);
        offset += bytes.length;
    }
    const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-app-icons-'));
    try {
        const iconset = path.join(temporary, 'icon.iconset');
        await fs.mkdir(iconset);
        for (const size of [16, 32, 128, 256, 512]) for (const scale of [1, 2]) await fs.writeFile(path.join(iconset, `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`), pngs.get(size * scale));
        execFileSync('/usr/bin/iconutil', ['-c', 'icns', '-o', path.join(temporary, 'icon.icns'), iconset]);
        const output = path.join(brand, 'desktop');
        const assets = {
            'icon.png': pngs.get(512),
            'icon@2x.png': pngs.get(1024),
            'icon.ico': Buffer.concat([header, ...windowsSizes.map(size => pngs.get(size))]),
            'icon.icns': await fs.readFile(path.join(temporary, 'icon.icns')),
            'trayTemplate.png': await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18"><path d="M3 15V3l12 12V3" fill="none" stroke="white" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/></svg>')).png().toBuffer(),
            'trayTemplate@2x.png': await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 18 18"><path d="M3 15V3l12 12V3" fill="none" stroke="white" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/></svg>')).png().toBuffer()
        };
        await fs.mkdir(output, {recursive: true});
        for (const [name, bytes] of Object.entries(assets)) await fs.writeFile(path.join(output, name), bytes);
        await fs.writeFile(path.join(output, 'manifest.json'), JSON.stringify({
            format: 'nova-content-app-icons',
            schemaVersion: 1,
            source: master,
            sourceHash: hash(source),
            windowsSizes,
            files: Object.fromEntries(Object.entries(assets).map(([name, bytes]) => [name, hash(bytes)]))
        }, null, 2) + '\n');
        return checkAppIcons();
    } finally {
        await fs.rm(temporary, {recursive: true, force: true});
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const args = process.argv.slice(2);
    if (args.length > 1 || args.length === 1 && args[0] !== '--check') throw Error('Use build-app-icons.mjs [--check]');
    console.log(args.length ? await checkAppIcons() : await buildAppIcons());
}
