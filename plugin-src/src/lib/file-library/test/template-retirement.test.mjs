import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';
import sharp from 'sharp';
import {createLibrary, openLibrary, inspectLibraryHealth, backupLibrary, restoreBackup, __testing} from '../index.mjs';
import {installHistoricalBuiltin} from './legacy-template-fixture.mjs';
import {installBuiltins} from '../../library-seed/index.mjs';
import {LEGACY_BUILTIN_TEMPLATE_IDS} from '../template-retirement.mjs';

process.env.NODE_ENV = 'test';
async function fixture(t) {
    const parent = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'nova-retirement-')), root = path.join(parent, 'library');
    t.after(() => {__testing.setHook(undefined); fs.rmSync(parent, {recursive: true, force: true});});
    const lib = createLibrary(root), filename = path.join(parent, 'reference.png');
    await sharp({create: {width: 8, height: 8, channels: 3, background: 'red'}}).png().toFile(filename);
    const asset = lib.importAsset(filename, {purpose: 'template-reference'}), resources = {reference: {assetHash: asset.assetHash, bytes: asset.bytes, detectedType: asset.detectedType, role: 'style'}};
    return {parent, root, lib, resources, asset, install: (id, deletedAt = null) => id.startsWith('builtin-colleague-') ? lib.installBuiltinTemplate({id, name: id, version: 1, definition: {}, resources}) : installHistoricalBuiltin(lib, {id, name: id, version: 1, definition: {}, resources, deletedAt})};
}
const originalPath = (f, id) => path.join(f.root, '模板', id);

async function frozenCore(f) {
    const project = fileURLToPath(new URL('../../../../../', import.meta.url)), base = path.join(f.parent, 'frozen');
    const listed = spawnSync('git', ['ls-tree', '-r', '--name-only', 'fe23cb8', 'plugin-src/src/lib/file-library', 'plugin-src/src/lib/image-validation'], {cwd: project, encoding: 'utf8'});
    assert.equal(listed.status, 0, listed.stderr);
    for (const file of listed.stdout.trim().split('\n').filter(file => /\/(?:file-library|image-validation)\/[^/]+\.mjs$/.test(file))) {
        const source = spawnSync('git', ['show', `fe23cb8:${file}`], {cwd: project, encoding: 'utf8'});
        assert.equal(source.status, 0, source.stderr);
        const target = path.join(base, file); fs.mkdirSync(path.dirname(target), {recursive: true}); fs.writeFileSync(target, source.stdout);
    }
    fs.symlinkSync(path.join(project, 'node_modules'), path.join(base, 'node_modules'));
    return import(pathToFileURL(path.join(base, 'plugin-src/src/lib/file-library/index.mjs')).href);
}

test('exact legacy builtins leave current and trash catalogs while original paths, history, custom copies, backup and health remain valid', async t => {
    const f = await fixture(t), legacy = f.install('builtin-geometry'), trashed = f.install('builtin-paper', '2026-10-22T00:00:00.000Z');
    const current = f.install('builtin-colleague-assistant-scene');
    const custom = f.lib.createTemplate({name: '旧版模板工作副本', definition: {}, resources: f.resources, derivedFrom: {id: legacy.id, version: 1}});
    const original = fs.readFileSync(path.join(f.root, '模板', legacy.id, '模板.json'));
    assert.deepEqual(f.lib.retireLegacyBuiltinTemplates(), [legacy.id, trashed.id]);
    assert.deepEqual(f.lib.listTemplates().map(t => t.id).sort(), [current.id, custom.id].sort());
    assert.deepEqual(f.lib.listTemplateTrash(), []);
    assert.deepEqual(fs.readFileSync(path.join(originalPath(f, legacy.id), '模板.json')), original);
    assert.equal(f.lib.readTemplate(legacy.id).packageHash, legacy.versions[0].packageHash);
    assert.equal(f.lib.readTemplate(custom.id).derivedFrom.id, legacy.id);
    assert.equal(fs.existsSync(path.join(f.root, '模板', legacy.id)), true);
    assert.deepEqual(f.lib.retireLegacyBuiltinTemplates(), [legacy.id, trashed.id]);
    assert.throws(() => f.lib.restoreTemplate(legacy.id, f.lib.readTemplate(legacy.id).editToken), {code: 'INVALID_STATE'});
    assert.throws(() => f.lib.installBuiltinTemplate({id: legacy.id, name: legacy.title, version: 1, definition: {}, resources: f.resources}), {code: 'INVALID_STATE'});
    const health = inspectLibraryHealth(f.root, {expectedLibraryId: f.lib.info.libraryId, expectedRootIdentity: f.lib.info.rootIdentity});
    assert.equal(health.state, 'healthy', JSON.stringify(health.issues));
    const backup = path.join(f.parent, 'backup'), destination = path.join(f.parent, 'restored');
    backupLibrary(f.root, backup); restoreBackup(backup, destination);
    const reopened = openLibrary(destination);
    assert.deepEqual(reopened.listTemplates().map(t => t.id).sort(), [current.id, custom.id].sort());
    assert.equal(reopened.readTemplate(legacy.id).packageHash, f.lib.readTemplate(legacy.id).packageHash);
});

test('logical retirement never changes metadata, paths or the schema and remains idempotent', async t => {
    const f = await fixture(t), first = f.install('builtin-geometry'), second = f.install('builtin-paper');
    const files = [path.join(f.root, '内容库.json'), ...[first, second].map(item => path.join(originalPath(f, item.id), '模板.json'))];
    const before = files.map(file => fs.readFileSync(file));
    assert.deepEqual(f.lib.retireLegacyBuiltinTemplates(), [first.id, second.id]);
    assert.deepEqual(openLibrary(f.root).retireLegacyBuiltinTemplates(), [first.id, second.id]);
    files.forEach((file, index) => assert.deepEqual(fs.readFileSync(file), before[index]));
    assert.equal(fs.existsSync(path.join(f.root, '系统（别动）', '已退役模板')), false);
    assert.deepEqual(f.lib.listTemplateTrash(), []);
});

test('a corrupt later package or an invalid ownership marker stops retirement without changing historical files', async t => {
    const f = await fixture(t), first = f.install('builtin-geometry'), second = f.install('builtin-paper');
    const packageFile = path.join(f.root, '模板', second.id, '版本', '1', '定义.json');
    const bytes = fs.readFileSync(packageFile);
    fs.writeFileSync(packageFile, '{}');
    assert.throws(() => f.lib.retireLegacyBuiltinTemplates(), {code: 'CORRUPT'});
    assert.equal(fs.existsSync(originalPath(f, first.id)), true);
    fs.writeFileSync(packageFile, bytes);
    const metadataFile = path.join(f.root, '模板', first.id, '模板.json');
    const metadata = JSON.parse(fs.readFileSync(metadataFile)); metadata.builtin = false;
    fs.writeFileSync(metadataFile, `${JSON.stringify(metadata, null, 2)}\n`);
    assert.throws(() => f.lib.retireLegacyBuiltinTemplates(), {code: 'CORRUPT'});
    assert.equal(fs.existsSync(originalPath(f, first.id)), true);
});

test('frozen schema5 readers and historical handoffs keep original paths after the current seed; legacy retry and reselection stay blocked', async t => {
    const f = await fixture(t), frozen = await frozenCore(f), old = frozen.openLibrary(f.root);
    const legacy = old.installBuiltinTemplate({id: 'builtin-geometry', name: '历史模板', version: 1, definition: {}, resources: f.resources});
    const content = old.createContent({title: '历史内容', body: '', preferredTemplateId: legacy.id});
    old.setGenerationDefaults({templateId: legacy.id}, old.readLibrarySettings().editToken);
    const request = old.createCoverRequest(content.id, {template: {id: legacy.id, version: 1}, styleAssetHashes: [f.asset.assetHash], photo: null, materialIds: [], prompt: '封面', pixels: {width: 900, height: 1200}, ratio: '3:4', count: 1, outputFormat: 'png', scope: 'cover-only'}, content.editToken);
    const attempt = old.createCoverAttempt(content.id, request.request.requestId, {host: 'codex'});
    const original = fs.readFileSync(path.join(originalPath(f, legacy.id), '模板.json'));
    installBuiltins(f.lib);
    assert.equal(f.lib.readLibrarySettings().defaults.templateId, null);
    assert.equal(f.lib.listTemplates().length, 5);
    const context = f.lib.readCoverContext(content.id, request.request.requestId, attempt.attempt.attemptId);
    assert.equal(context.request.template.id, legacy.id);
    assert.equal(context.templatePackagePath, path.join(originalPath(f, legacy.id), '版本', '1', '定义.json'));
    assert.equal(createHash('sha256').update(fs.readFileSync(context.templatePackagePath)).digest('hex'), context.request.template.packageHash);
    assert.equal(frozen.openLibrary(f.root).readTemplate(legacy.id).packageHash, legacy.versions[0].packageHash);
    old.installBuiltinTemplate({id: legacy.id, name: '历史模板', version: 1, definition: {}, resources: f.resources});
    assert.deepEqual(fs.readFileSync(path.join(originalPath(f, legacy.id), '模板.json')), original);
    assert.equal(f.lib.listTemplates().some(item => item.id === legacy.id), false);
    assert.throws(() => f.lib.createCoverAttempt(content.id, request.request.requestId, {host: 'codex'}), {code: 'INVALID_INPUT'});
    const backup = path.join(f.parent, 'backup'), destination = path.join(f.parent, 'restored');
    backupLibrary(f.root, backup); restoreBackup(backup, destination);
    const restored = openLibrary(destination).readCoverContext(content.id, request.request.requestId, attempt.attempt.attemptId);
    assert.equal(createHash('sha256').update(fs.readFileSync(restored.templatePackagePath)).digest('hex'), context.request.template.packageHash);
});

test('unusable templates cannot become defaults, new content preferences, variants or new cover requests', async t => {
    const f = await fixture(t), legacy = f.install('builtin-geometry');
    const blank = f.lib.createTemplate({name: '无样张', definition: {}, resources: {}});
    for (const template of [legacy, blank]) {
        assert.throws(() => f.lib.setGenerationDefaults({templateId: template.id}, f.lib.readLibrarySettings().editToken), {code: 'INVALID_INPUT'});
        assert.throws(() => f.lib.createContent({title: '内容', body: '', preferredTemplateId: template.id}), {code: 'INVALID_INPUT'});
    }
    let content = f.lib.createContent({title: '内容', body: ''});
    assert.throws(() => f.lib.saveContentCoverVariant(content.id, {name: '封面', ratio: '3:4', preferredTemplateId: legacy.id}, content.editToken), {code: 'INVALID_INPUT'});
    const input = {template: {id: legacy.id, version: 1}, styleAssetHashes: [f.asset.assetHash], photo: null, materialIds: [], prompt: '封面', pixels: {width: 900, height: 1200}, ratio: '3:4', count: 1, outputFormat: 'png', scope: 'cover-only'};
    assert.throws(() => f.lib.createCoverRequest(content.id, input, content.editToken), {code: 'INVALID_INPUT'});
    // A previous release saved this reference; unrelated edits must not erase or strand it.
    const metaFile = path.join(f.root, '内容', content.id, '内容.json');
    const meta = JSON.parse(fs.readFileSync(metaFile)); meta.preferredTemplateId = legacy.id;
    fs.writeFileSync(metaFile, `${JSON.stringify(meta, null, 2)}\n`);
    content = f.lib.readContent(content.id);
    f.lib.retireLegacyBuiltinTemplates();
    const updated = f.lib.updateContent(content.id, {title: '修改正文标题', preferredTemplateId: legacy.id}, content.editToken);
    assert.equal(updated.preferredTemplateId, legacy.id);
});

test('canonical channel migration preserves IDs, user changes, removed channels and custom channels', async t => {
    const f = await fixture(t), filename = path.join(f.root, '库配置', 'default', '配置.json');
    const settings = JSON.parse(fs.readFileSync(filename));
    settings.channels.find(c => c.id === 'wechat-official').name = '公众号';
    settings.channels.find(c => c.id === 'bilibili').name = 'B 站';
    settings.channels.find(c => c.id === 'bilibili').deletedAt = '2026-10-22T00:00:00.000Z';
    fs.writeFileSync(filename, `${JSON.stringify(settings, null, 2)}\n`);
    f.lib.migrateBuiltinSettings();
    const migrated = f.lib.readLibrarySettings();
    assert.deepEqual(migrated.channels.map(c => c.name), ['抖音', '小红书', '视频号', '微信公众号', 'B站']);
    assert.equal(migrated.channels.at(-1).deletedAt, settings.channels.at(-1).deletedAt);
    const official = migrated.channels.find(c => c.id === 'wechat-official');
    const edited = f.lib.updateChannel(official.id, {name: '我的公众号'}, migrated.editToken);
    f.lib.createChannel({name: '公众号', ink: '#000000', bg: '#ffffff', requiredRatio: null}, edited.editToken);
    const before = f.lib.readLibrarySettings();
    f.lib.migrateBuiltinSettings();
    assert.deepEqual(f.lib.readLibrarySettings(), before);
    assert.equal(LEGACY_BUILTIN_TEMPLATE_IDS.length, 15);
});
