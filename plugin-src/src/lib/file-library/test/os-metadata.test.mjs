import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createLibrary, inspectLibraryHealth, openLibrary, upgradeLibrary, backupLibrary, restoreBackup} from '../index.mjs';

function fixture(t) {
    const parent = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'nova-os-metadata-'));
    const root = path.join(parent, 'library'), library = createLibrary(root);
    t.after(() => fs.rmSync(parent, {recursive: true, force: true}));
    return {parent, root, library, options: {expectedLibraryId: library.info.libraryId, expectedRootIdentity: library.info.rootIdentity}};
}

test('Finder metadata in object directories does not corrupt lists or health and remains unchanged', t => {
    const f = fixture(t), content = f.library.createContent({title: 'isolation fixture', body: 'original body'});
    for (const directory of ['库配置', '合集', '内容', '提示词', '我的照片', '模板']) fs.writeFileSync(path.join(f.root, directory, '.DS_Store'), 'Finder metadata fixture');
    assert.equal(f.library.listContents()[0].id, content.id);
    assert.deepEqual(f.library.listTemplates(), []);
    assert.deepEqual(f.library.listPrompts(), []);
    assert.deepEqual(f.library.listPhotos(), []);
    assert.deepEqual(f.library.listCollections(), []);
    const report = inspectLibraryHealth(f.root, f.options);
    assert.equal(report.state, 'healthy');
    assert.equal(report.checked.objects, 2);
    for (const directory of ['库配置', '合集', '内容', '提示词', '我的照片', '模板']) assert.equal(fs.readFileSync(path.join(f.root, directory, '.DS_Store'), 'utf8'), 'Finder metadata fixture');
});

test('Finder metadata also permits prompt uniqueness/settings and collection membership checks', t => {
    const f = fixture(t), content = f.library.createContent({title: 'original', body: 'body'});
    for (const directory of ['提示词', '合集']) fs.writeFileSync(path.join(f.root, directory, '.DS_Store'), 'keep');
    const prompt = f.library.createPrompt({title: 'prompt', body: 'body', category: 'new category', builtinKey: 'finder-fixture'});
    assert.ok(f.library.readLibrarySettings().visiblePromptCategories.includes('new category'));
    assert.throws(() => f.library.createPrompt({title: 'duplicate', body: 'body', builtinKey: 'finder-fixture'}), {code: 'CONFLICT'});
    assert.equal(f.library.readPrompt(prompt.id).title, 'prompt');
    assert.ok(f.library.trashContent(content.id, content.editToken).deletedAt);
});

test('template report catalog ignores only ordinary Finder metadata and leaves it unchanged', t => {
    const f = fixture(t), template = f.library.createTemplate({name: 'catalog fixture', definition: {}, resources: {}});
    const target = path.join(f.root, '模板', '.DS_Store');
    fs.writeFileSync(target, 'Finder catalog metadata');
    assert.deepEqual(f.library.rebuildTemplateReports(template.id).warnings, []);
    assert.match(fs.readFileSync(path.join(f.root, '模板', '模板目录.md'), 'utf8'), new RegExp(template.id));
    assert.equal(fs.readFileSync(target, 'utf8'), 'Finder catalog metadata');
    fs.rmSync(target);fs.symlinkSync(path.join(f.root, '内容库.json'), target);
    assert.ok(f.library.rebuildTemplateReports(template.id).warnings.some(warning => warning.includes('UNSAFE_PATH')));
    assert.ok(fs.lstatSync(target).isSymbolicLink());
});

for (const [name, type, expectedCode] of [['.DS_Store', 'directory', 'UNSAFE_PATH'], ['.DS_Store', 'symlink', 'UNSAFE_PATH'], ['.DS_Store.backup', 'file', 'CORRUPT'], ['unknown-object', 'directory', 'CORRUPT']]) {
    test(`${name} as ${type} is not silently ignored by object lists or health`, t => {
        const f = fixture(t), outside = path.join(f.parent, 'external');
        fs.writeFileSync(outside, 'untouched external bytes');
        for (const directory of ['库配置', '合集', '内容', '提示词', '我的照片', '模板']) {
            const target = path.join(f.root, directory, name);
            if (type === 'directory') fs.mkdirSync(target);
            else if (type === 'symlink') fs.symlinkSync(outside, target);
            else fs.writeFileSync(target, 'unknown bytes');
        }
        for (const method of ['listContents', 'listCollections', 'listPrompts', 'listPhotos', 'listTemplates']) assert.throws(() => f.library[method](), {code: expectedCode}, method);
        const report = inspectLibraryHealth(f.root, f.options);
        assert.notEqual(report.state, 'healthy');
        assert.ok(report.issues.some(issue => issue.code === 'STRUCTURE_INVALID'));
        assert.equal(fs.readFileSync(outside, 'utf8'), 'untouched external bytes');
    });
}

test('upgrade and backup restore preserve ordinary Finder metadata and usable objects', t => {
    const f = fixture(t), content = f.library.createContent({title: 'original', body: 'original body'});
    f.library.createTemplate({name: 'restored template', definition: {}, resources: {}});
    const descriptor = path.join(f.root, '内容库.json');
    fs.writeFileSync(descriptor, JSON.stringify({...JSON.parse(fs.readFileSync(descriptor)), schemaVersion: 4}));
    for (const directory of ['库配置', '合集']) fs.rmSync(path.join(f.root, directory), {recursive: true});
    for (const directory of ['内容', '提示词', '我的照片', '模板']) fs.writeFileSync(path.join(f.root, directory, '.DS_Store'), 'unchanged Finder metadata');
    const upgraded = upgradeLibrary(f.root);
    assert.equal(upgraded.listContents()[0].id, content.id);
    assert.equal(upgraded.listTemplates().length, 1);
    const backup = path.join(f.parent, 'backup'), restored = path.join(f.parent, 'restored');
    backupLibrary(f.root, backup);restoreBackup(backup, restored);
    assert.equal(openLibrary(restored).listContents()[0].body, 'original body');
    assert.equal(openLibrary(restored).listTemplates().length, 1);
    for (const directory of ['内容', '提示词', '我的照片', '模板']) for (const root of [f.root, path.join(backup, 'data'), restored]) assert.equal(fs.readFileSync(path.join(root, directory, '.DS_Store'), 'utf8'), 'unchanged Finder metadata');
});

test('Finder metadata in transaction directories survives reads, health and backup restore', t => {
    const f = fixture(t), content = f.library.createContent({title: 'original', body: 'original body'});
    const metadata = Buffer.alloc(6148); metadata.writeUInt32BE(1); metadata.write('Bud1', 4);
    const directories = ['系统（别动）/事务', '系统（别动）/事务/待恢复', '系统（别动）/事务/已提交'];
    for (const dir of directories) fs.writeFileSync(path.join(f.root, dir, '.DS_Store'), metadata);
    assert.equal(openLibrary(f.root, f.options).listContents()[0].body, content.body);
    assert.equal(inspectLibraryHealth(f.root, f.options).state, 'healthy');
    const backup = path.join(f.parent, 'backup'), restored = path.join(f.parent, 'restored');
    backupLibrary(f.root, backup); restoreBackup(backup, restored);
    assert.equal(openLibrary(restored).listContents()[0].body, content.body);
    for (const dir of directories) for (const root of [f.root, path.join(backup, 'data'), restored]) assert.deepEqual(fs.readFileSync(path.join(root, dir, '.DS_Store')), metadata);
});

for (const directory of ['系统（别动）/事务', '系统（别动）/事务/待恢复']) for (const type of ['directory', 'symlink', 'unknown']) {
    test(`transaction layout ${directory} still rejects ${type} metadata`, t => {
        const f = fixture(t), target = path.join(f.root, directory, type === 'unknown' ? '.DS_Store.backup' : '.DS_Store');
        if (type === 'directory') fs.mkdirSync(target);
        else if (type === 'symlink') fs.symlinkSync(path.join(f.root, '内容库.json'), target);
        else fs.writeFileSync(target, 'unknown transaction');
        assert.throws(() => f.library.listContents(), {code: type === 'unknown' ? 'CORRUPT' : 'UNSAFE_PATH'});
        assert.notEqual(inspectLibraryHealth(f.root, f.options).state, 'healthy');
    });
}

test('Finder metadata exceptions do not relax nonempty initialization', t => {
    const f = fixture(t);
    const unbound = path.join(f.parent, 'unbound');fs.mkdirSync(unbound);fs.writeFileSync(path.join(unbound, '.DS_Store'), 'existing directory');
    assert.throws(() => createLibrary(unbound), {code: 'NOT_EMPTY'});
    assert.equal(fs.readFileSync(path.join(unbound, '.DS_Store'), 'utf8'), 'existing directory');
});
