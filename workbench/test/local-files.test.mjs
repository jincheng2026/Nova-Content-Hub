import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import sharp from 'sharp';
import {templateFolderImages, validateLocalFiles} from '../src/main/local-files.mts';
import {localFileSelectionError} from '../src/shared/local-files.ts';
import {DesktopController} from '../src/main/controller.mts';
import {BindingStore} from '../src/main/bindings.mts';
import {execute} from '../src/main/worker.mts';
import {createLibrary} from '../../plugin-src/src/lib/file-library/index.mjs';

async function fixture(t) {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-local-files-'));
    t.after(() => fs.rm(parent, {recursive: true, force: true}));
    const image = path.join(parent, 'photo.png');
    await sharp({create: {width: 16, height: 16, channels: 3, background: '#58a'}}).png().toFile(image);
    return {parent, image};
}

test('local file boundary rejects extra fields, paths, folders, symlinks, counts, types and size before importing', async t => {
    const {parent, image} = await fixture(t);
    const link = path.join(parent, 'link.png'); await fs.symlink(image, link);
    const empty = path.join(parent, 'empty.png'); await fs.writeFile(empty, '');
    const unknown = path.join(parent, 'file.exe'); await fs.writeFile(unknown, 'hello');
    const large = path.join(parent, 'large.txt'); const handle = await fs.open(large, 'w'); await handle.truncate(1024 * 1024 + 1); await handle.close();
    for (const input of [null, {}, {kind: 'prompt', sources: [image]}, {kind: 'photo', sources: [image]}, {kind: 'material', sources: [image], arbitrary: true}, {kind: 'material', sources: [image], photo: {}}, ...[[parent], [link], [empty], [unknown], [large], ['relative.png'], ['/no/such/file.png'], ['\0.png'], [image, image], []].map(sources => ({kind: 'material', sources})), {kind: 'template', sources: Array(51).fill(image)}, {kind: 'template', sources: [image, image]}]) await assert.rejects(validateLocalFiles(input));
    assert.deepEqual(await validateLocalFiles({kind: 'template', sources: [image]}), {kind: 'template', sources: [image]});
    assert.match(localFileSelectionError('template', Array.from({length: 5}, () => ({name: 'a.png', size: 64 * 1024 * 1024}))), /256 MiB/);
    assert.equal(localFileSelectionError('material', [{name: 'UPPER.JPG', size: 10}]), null);
});

test('sandbox preload extracts File paths through webUtils only, refuses strings and non-native files', async () => {
    let exposed; const calls = [];
    const source = await fs.readFile(new URL('../src/preload/index.cts', import.meta.url), 'utf8');
    const compiled = stripTypeScriptTypes(source);
    const native = new File(['data'], 'local.png');
    vm.runInNewContext(compiled, {exports: {}, require: name => {
        assert.equal(name, 'electron');
        return {contextBridge: {exposeInMainWorld: (_, api) => {exposed = api;}}, ipcRenderer: {invoke: (...args) => {calls.push(args); return {ok: true, value: 'imported'};}}, webUtils: {getPathForFile(file) {if (!(file instanceof File)) throw new TypeError('Expected a File'); return file === native ? '/native/local.png' : '';}}};
    }});
    assert.equal((await exposed.importLocalFiles('material', ['/etc/passwd'])).ok, false);
    assert.equal((await exposed.importLocalFiles('material', [new File(['x'], 'fake.png')])).ok, false);
    assert.equal(calls.length, 0);
    assert.equal((await exposed.importLocalFiles('material', [native])).ok, true);
    assert.equal(JSON.stringify(calls), JSON.stringify([['nova:importLocalFiles', {kind: 'material', sources: ['/native/local.png']}]]));
});

test('dropped and dialog files reuse real material/template/photo import and keep explicit attachment confirmation', async t => {
    const {parent, image} = await fixture(t), root = path.join(parent, 'library');
    const library = createLibrary(root), content = library.createContent({title: 'Saved title', body: 'Saved body'});
    const controller = new DesktopController({store: new BindingStore(path.join(parent, 'binding.json')), worker: {call: (op, args) => execute(op, args, 'disabled')}, documents: parent, dialogs: {backup: async () => null, destination: async () => null, library: async () => root, material: async () => image, templateImages: async () => [image], photo: async () => image}});
    await controller.initialize(); await controller.openLibrary(); controller.authMode = 'disabled';
    const dropped = await controller.importLocalFiles({kind: 'material', sources: [image]});
    const selected = await controller.chooseContentMaterial();
    assert.equal(dropped.assetHash, selected.assetHash);
    assert.equal(library.readContent(content.id).materials.length, 0);
    await controller.mutateWorkspace({op: 'attachMaterial', id: content.id, editToken: content.editToken, assetHash: dropped.assetHash, originalName: dropped.originalName, role: 'reference'});
    assert.equal(library.readContent(content.id).materials.length, 1);
    assert.equal(library.readContent(content.id).body, 'Saved body');
    assert.equal((await controller.importLocalFiles({kind: 'template', sources: [image]}))[0].assetHash, (await controller.chooseTemplateImages())[0].assetHash);
    const photo = await controller.importLocalFiles({kind: 'photo', sources: [image], photo: {title: '本人', isOwnPhoto: true}});
    assert.equal(photo.isOwnPhoto, true); assert.equal(photo.availability, 'available'); assert.equal(controller.binding.photoPending, null);
    controller.authMode = 'required';
    await assert.rejects(controller.importLocalFiles({kind: 'material', sources: [image]}), {code: 'AUTH_NOT_CONFIGURED'});
    await assert.rejects(controller.importLocalFiles({kind: 'material', sources: [path.join(parent, 'missing.png')]}), {code: 'AUTH_NOT_CONFIGURED'}, 'authorization rejects before filesystem inspection');
});

test('template folders expand only first-level raster files and reject links and count overflow', async t => {
    const {parent, image} = await fixture(t), folder = path.join(await fs.realpath(parent), 'references');
    await fs.mkdir(folder); await fs.copyFile(image, path.join(folder, 'b.png')); await fs.copyFile(image, path.join(folder, 'a.png'));
    await fs.writeFile(path.join(folder, 'notes.md'), 'source notes'); await fs.mkdir(path.join(folder, 'nested'));
    await fs.copyFile(image, path.join(folder, 'nested', 'child.png'));
    assert.deepEqual((await templateFolderImages(folder)).map(file => path.basename(file)), ['a.png', 'b.png']);
    await fs.symlink(image, path.join(folder, 'link.png')); await assert.rejects(templateFolderImages(folder), {code: 'INVALID_FILES'});
    await fs.unlink(path.join(folder, 'link.png'));
    for (let i = 0; i < 49; i++) await fs.copyFile(image, path.join(folder, `${i}.png`));
    await assert.rejects(templateFolderImages(folder), {code: 'INVALID_FILES'});
});
