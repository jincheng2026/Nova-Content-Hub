// Compile current sources into a temporary Electron copy; never replace release outputs.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {execFileSync, spawn} from 'node:child_process';
import {build} from 'vite';
import electron from 'electron';
import sharp from 'sharp';
import {createLibrary} from '../../plugin-src/src/lib/file-library/index.mjs';

const workbench = fileURLToPath(new URL('../', import.meta.url));
const repository = path.resolve(workbench, '..');
const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'nova-file-drop-probe-')));
const bundle = path.join(root, 'bundle'), dist = path.join(bundle, 'workbench/dist');
let passed = false;
try {
    await fs.cp(path.join(workbench, 'dist-desktop/auth-disabled'), bundle, {recursive: true});
    for (const relative of ['plugin-src/src/lib', 'plugin-src/src/bridge', 'plugin-src/resources', 'plugin-src/schemas']) {
        await fs.cp(path.join(repository, relative), path.join(bundle, relative), {recursive: true});
    }
    console.log('Preparing isolated native and renderer sources.');
    execFileSync(process.execPath, [path.join(workbench, 'node_modules/typescript/bin/tsc'), '-p', path.join(workbench, 'tsconfig.native.json'), '--outDir', dist], {stdio: 'inherit'});
    await build({configFile: false, root: path.join(workbench, 'src/renderer'), base: './', logLevel: 'error', oxc: {jsx: {runtime: 'automatic'}}, build: {outDir: path.join(dist, 'renderer'), emptyOutDir: true, modulePreload: false, sourcemap: false, target: 'chrome148'}});
    const mime = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png'};
    const entries = {};
    for (const file of await fs.readdir(path.join(dist, 'renderer'), {recursive: true})) {
        if ((await fs.stat(path.join(dist, 'renderer', file))).isFile()) entries[`/${file}`] = {file, mime: mime[path.extname(file)]};
    }
    await fs.writeFile(path.join(dist, 'renderer-resources.json'), JSON.stringify({format: 'nova-desktop-renderer-resources', schemaVersion: 1, entries}));
    await fs.mkdir(path.join(root, 'machine'));
    createLibrary(path.join(root, 'library')).createContent({title: 'Saved title', body: 'Saved body'});
    for (const [filename, color] of [['first.png', 'red'], ['second.png', 'blue']]) await sharp({create: {width: 32, height: 32, channels: 3, background: color}}).png().toFile(path.join(root, filename));
    await fs.writeFile(path.join(root, 'notes.txt'), 'Local reference text');
    await fs.writeFile(path.join(root, 'invalid.exe'), 'invalid');
    await fs.mkdir(path.join(root, 'folder'));
    const entry = path.join(dist, 'main/file-drop-ui-entry.mjs');
    await fs.copyFile(fileURLToPath(new URL('./file-drop-ui-entry.mjs', import.meta.url)), entry);
    await new Promise((resolve, reject) => {
        const child = spawn(electron, [entry], {cwd: bundle, env: {...process.env, NOVA_DROP_PROBE_ROOT: root}, stdio: 'inherit'});
        const timeout = setTimeout(() => {child.kill('SIGKILL'); reject(new Error('File-drop Electron probe exceeded 180 seconds.'));}, 180000);
        child.once('error', error => {clearTimeout(timeout); reject(error);});
        child.once('close', code => {clearTimeout(timeout); code === 0 ? resolve() : reject(new Error(`File-drop Electron probe exited ${code}.`));});
    });
    const source = JSON.parse(await fs.readFile(path.join(repository, 'release.config.json'), 'utf8'));
    const base = JSON.parse(await fs.readFile(path.join(dist, 'release.json'), 'utf8'));
    const receipt = {...JSON.parse(await fs.readFile(path.join(root, 'receipt.json'), 'utf8')), sourceVersion: source.version, runtimeBaseVersion: base.version, platform: process.platform, arch: process.arch, mechanism: 'Electron CDP drag events with real native files', nativeDialogs: 'stubbed cancel', finderGesture: 'not exercised'};
    console.log(`PASS receipt: ${JSON.stringify(receipt)}`);
    passed = true;
} finally {
    if (passed) await fs.rm(root, {recursive: true, force: true});
    else console.error(`Temporary failure diagnostics retained at ${root}`);
}
