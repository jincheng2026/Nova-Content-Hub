import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {appIconPaths} from '../src/main/branding.mts';

const source = fileURLToPath(new URL('../resources/brand/desktop/', import.meta.url));
test('app icons use fixed bundled PNG/ICO paths and reject missing or damaged bytes', async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-brand-icons-'));
    t.after(() => fs.rm(root, {recursive: true, force: true}));
    await fs.cp(source, root, {recursive: true});
    assert.deepEqual(appIconPaths(root, 'darwin'), {
        png: path.join(root, 'icon.png'),
        tray: path.join(root, 'trayTemplate.png'),
        trayRetina: path.join(root, 'trayTemplate@2x.png'),
        window: path.join(root, 'icon.png')
    });
    assert.equal(appIconPaths(root, 'win32').window, path.join(root, 'icon.ico'));
    await fs.writeFile(path.join(root, 'icon.png'), 'damaged');
    assert.throws(() => appIconPaths(root), /damaged/);
    await fs.copyFile(path.join(source, 'icon.png'), path.join(root, 'icon.png'));
    await fs.unlink(path.join(root, 'icon.ico'));
    assert.throws(() => appIconPaths(root), {code: 'ENOENT'});
});
