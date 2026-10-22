import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createLibrary, openLibrary} from '../../file-library/index.mjs';
import {installBuiltins} from '../index.mjs';
import {prepareColleagueBuiltins} from '../colleague.mjs';
import {validateImage} from '../../image-validation/index.mjs';
import {installHistoricalBuiltin} from '../../file-library/test/legacy-template-fixture.mjs';

const project = fileURLToPath(new URL('../../../../../', import.meta.url));
const templateCatalog = JSON.parse(fs.readFileSync(path.join(project, 'plugin-src/resources/builtin-templates/catalog.json'), 'utf8'));
const promptCatalog = JSON.parse(fs.readFileSync(path.join(project, 'plugin-src/resources/builtin-prompts/catalog.json'), 'utf8'));
const colleagueCatalog = JSON.parse(fs.readFileSync(path.join(project, 'plugin-src/resources/colleague-library/catalog.json'), 'utf8'));
const sourceRoot = path.join(project, 'plugin-src/resources/colleague-library');

test('five canonical VI copies, three style copies and named source index preserve every source byte', () => {
    assert.equal(fs.existsSync(path.join(sourceRoot, 'templates/index.json')), true);
    const index = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'templates/index.json')));
    assert.equal(index.templates.length, 5);
    assert.equal(index.templates.reduce((n, item) => n + item.documents.length, 0), 8);
    for (const item of index.templates) {
        const definition = colleagueCatalog.templates.find(template => template.id === item.templateId);
        assert.ok(definition);
        for (const document of item.documents) {
            const source = fs.readFileSync(path.join(sourceRoot, document.sourcePath));
            const canonical = fs.readFileSync(path.join(sourceRoot, document.normalizedPath));
            assert.deepEqual(canonical, source);
            assert.equal(createHash('sha256').update(source).digest('hex'), document.sourceSha256);
            assert.equal(document.normalizedSha256, document.sourceSha256);
        }
        for (const image of item.images) {
            const reference = definition.referenceImages.find(ref => ref.path === image.sourcePath);
            assert.equal(image.sha256, reference.sha256);
            assert.equal(image.filename, path.basename(image.sourcePath));
        }
    }
    assert.equal(createHash('sha256').update(fs.readFileSync(path.join(sourceRoot, 'catalog.json'))).digest('hex'), 'cca95885158964de646c510fce2c78fc19adc1031f496d6fde7cd89726560f16');
    assert.equal(spawnSync(process.execPath, [path.join(project, 'plugin-src/scripts/import-colleague-resources.mjs'), path.join(sourceRoot, 'sources'), '--check'], {encoding: 'utf8'}).status, 0);
});

function fixture(t) {
    const parent = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'nch-builtin-seed-'));
    t.after(() => fs.rmSync(parent, {recursive: true, force: true}));
    return {parent, library: createLibrary(path.join(parent, 'library'))};
}

test('all bundled groups and prompts install, reopen and seed again without overwriting user facts', async t => {
    const {library} = fixture(t);
    let batchReads = 0;
    function batched(lib) {
        return {...lib,
            readAsset() { assert.fail('seed must batch asset verification'); },
            readAssetDescriptors(hashes) {
                batchReads++;
                assert.equal(hashes.length, 135, 'batch covers the complete preflight, including colleague resources');
                return lib.readAssetDescriptors(hashes);
            }
        };
    }
    const report = installBuiltins(batched(library));
    assert.equal(batchReads, 1);
    assert.equal(report.templates.length, 5);
    assert.equal(report.styleSamples, 127);
    assert.deepEqual(report.templates.map(template => template.id).sort(), ['builtin-colleague-assistant-scene', 'builtin-colleague-big-head-action', 'builtin-colleague-news-collage', 'builtin-colleague-orange-green-life', 'builtin-colleague-spatial-operation']);
    assert.equal(report.structureSamples, 8);
    assert.equal(report.createdPrompts, 52);
    assert.equal(library.listTemplates().length, 5);
    assert.equal(library.listPrompts().length, 52);
    assert.equal(library.listPhotos().length, 0, 'style sample people are never installed as the user');
    for (const definition of colleagueCatalog.templates) {
        const template = library.readTemplate(definition.id, definition.version);
        assert.deepEqual(template.definition, definition);
        assert.equal(template.templateJobs.length, 0, 'source verification never manufactures an AI acceptance');
        const style = Object.values(template.resources).filter(ref => ref.role === 'style');
        assert.equal(style.length, definition.referenceImages.length);
        for (const ref of definition.referenceImages) {
            const actual = library.readAsset(template.resources[ref.path].assetHash);
            assert.ok(actual.data.equals(fs.readFileSync(path.join(sourceRoot, ref.path))));
            assert.equal((await validateImage(actual.data)).decoded, true, 'every delivered source image fully decodes');
        }
        const content = library.createContent({title: '新的标题', body: '新的资料'});
        const fixed = library.createCoverRequest(content.id, {
            template: {id: definition.id, version: definition.version}, styleAssetHashes: [...new Set(style.map(ref => ref.assetHash))],
            photo: null, materialIds: [], prompt: definition.generation.promptTemplate,
            pixels: {width: 900, height: 1200}, ratio: '3:4', count: 2, outputFormat: 'png', scope: 'cover-only'
        }, content.editToken);
        assert.equal(fixed.request.styleAssetHashes.length, style.length, 'the complete group can enter a generation request');
    }
    for (const prompt of colleagueCatalog.prompts) {
        const stored = library.listPrompts().find(item => item.builtinKey === prompt.id);
        assert.equal(library.readPrompt(stored.id).body, prompt.body, 'source body including blank lines survives installation');
    }
    const firstPrompt = library.listPrompts().find(item => item.builtinKey === promptCatalog.prompts[0].id);
    const edited = library.updatePrompt(firstPrompt.id, {body: '用户自己的修改\n保留这份正文。'}, firstPrompt.editToken);
    const secondPrompt = library.listPrompts().find(item => item.builtinKey === promptCatalog.prompts[1].id);
    library.trashPrompt(secondPrompt.id, secondPrompt.editToken);
    const firstTemplate = library.readTemplate(colleagueCatalog.templates[0].id);
    const trashedTemplate = library.trashTemplate(firstTemplate.id, firstTemplate.editToken);
    const reopened = openLibrary(library.info.root);
    const again = installBuiltins({...batched(reopened), importAsset() { assert.fail('repeat installation must reuse verified immutable assets'); }});
    assert.equal(batchReads, 2);
    assert.equal(again.createdPrompts, 0);
    assert.equal(reopened.listPrompts().length, 51);
    assert.equal(reopened.listPromptTrash().length, 1);
    assert.equal(reopened.readPrompt(edited.id).body, edited.body);
    assert.equal(reopened.listTemplates().length, 4);
    assert.equal(reopened.listTemplateTrash().length, 1);
    assert.equal(reopened.readTemplate(firstTemplate.id).deletedAt, trashedTemplate.deletedAt);
});

test('an existing library retires the fifteen obsolete builtins and preserves custom edits and historic packages', t => {
    const {library} = fixture(t);
    // Reproduce the existing release's installed objects with the unchanged original catalogs.
    for (const definition of templateCatalog.templates) {
        const resources = {};
        for (const [refs, role, purpose] of [[definition.generatedReferences, 'style', 'template-reference'], [definition.assets, 'structure', 'template-structure']]) {
            for (const ref of refs) {
                const asset = library.importAsset(path.join(project, 'plugin-src/resources', ref.path), {purpose});
                resources[ref.path] = {assetHash: asset.assetHash, bytes: asset.bytes, detectedType: asset.detectedType, role};
            }
        }
        installHistoricalBuiltin(library, {id: definition.id, name: definition.name, version: definition.version, definition, resources});
    }
    for (const prompt of promptCatalog.prompts) {
        const {title, body, category, when, summary, tags, provenance} = prompt;
        library.createPrompt({title, body, category, when, summary, tags, provenance, builtinKey: prompt.id});
    }
    const originalHashes = templateCatalog.templates.map(item => [item.id, library.readTemplate(item.id).packageHash]);
    const oldTemplateFile = path.join(library.info.root, '模板', originalHashes[0][0], '模板.json');
    const oldTemplate = JSON.parse(fs.readFileSync(oldTemplateFile)); oldTemplate.deletedAt = new Date().toISOString();
    fs.writeFileSync(oldTemplateFile, `${JSON.stringify(oldTemplate, null, 2)}\n`);
    const oldPrompt = library.listPrompts()[0];
    library.updatePrompt(oldPrompt.id, {body: '用户保留的旧版修改'}, oldPrompt.editToken);
    const sameBody = library.createPrompt({title: '已手工收录同一正文', body: colleagueCatalog.prompts[0].body.trim().replace(/\n/g, '\r\n')});
    const upgraded = installBuiltins(openLibrary(library.info.root));
    assert.equal(upgraded.createdPrompts, 25, 'existing exact body is not duplicated under a different title');
    assert.equal(upgraded.retiredTemplates.length, 15);
    assert.equal(library.listTemplates().length, 5);
    assert.equal(library.listTemplateTrash().length, 0, 'retired builtins do not move into the recycle bin');
    assert.equal(library.listPrompts().length, 52);
    assert.equal(library.readPrompt(oldPrompt.id).body, '用户保留的旧版修改');
    assert.equal(library.readPrompt(sameBody.id).builtinKey, null, 'custom ownership is not taken over');
    for (const [id, hash] of originalHashes) assert.equal(library.readTemplate(id).packageHash, hash);
    const sourceTemplate = library.readTemplate(colleagueCatalog.templates[0].id);
    const custom = library.createTemplate({name: '用户工作副本', definition: sourceTemplate.definition, resources: sourceTemplate.resources, derivedFrom: {id: sourceTemplate.id, version: sourceTemplate.currentVersion}});
    library.addTemplateVersion(custom.id, {version: 2, definition: {...sourceTemplate.definition, userRule: '保留历史'}, resources: sourceTemplate.resources}, custom.editToken);
    const beforeCustom = library.readTemplate(custom.id);
    assert.equal(installBuiltins(library).templates.length, 5);
    assert.equal(library.listTemplates().length, 6, 'five colleague groups and the custom template remain');
    assert.deepEqual(library.readTemplate(custom.id), beforeCustom, 'custom metadata, versions and exact package history remain');
    const newPrompt = library.listPrompts().find(item => item.builtinKey === colleagueCatalog.prompts[1].id);
    library.trashPrompt(newPrompt.id, newPrompt.editToken);
    const newTemplate = library.readTemplate(colleagueCatalog.templates[0].id);
    library.trashTemplate(newTemplate.id, newTemplate.editToken);
    assert.equal(installBuiltins(library).createdPrompts, 0);
    assert.equal(library.listPromptTrash().length, 1);
    assert.equal(library.listTemplateTrash().length, 1);
});

test('tampered colleague source is rejected during preflight', t => {
    const {parent} = fixture(t);
    const corrupt = path.join(parent, 'corrupt.jpg');
    fs.writeFileSync(corrupt, 'changed');
    const first = colleagueCatalog.files[0].path;
    assert.throws(() => prepareColleagueBuiltins(relative => relative.endsWith(first) ? corrupt : path.join(project, relative)), /资源校验失败/);
});

test('batch verification waits for the complete colleague source preflight', t => {
    const {library} = fixture(t), target = fs.realpathSync(path.join(sourceRoot, colleagueCatalog.files.at(-1).path));
    const read = fs.readFileSync;
    fs.readFileSync = function (file, ...args) {
        return file === target ? Buffer.from('tampered final source') : read.call(this, file, ...args);
    };
    try {
        assert.throws(() => installBuiltins({...library,
            readAssetDescriptors() { assert.fail('batch must wait for all colleague source files'); }
        }), /资源校验失败/);
    } finally {
        fs.readFileSync = read;
    }
    assert.equal(library.listTemplates().length, 0);
    assert.equal(library.listPrompts().length, 0);
});

function incompleteBundle(parent) {
    const bundle = path.join(parent, 'bundle');
    for (const relative of ['plugin-src/resources/builtin-prompts/catalog.json', 'plugin-src/resources/colleague-library/catalog.json']) {
        const target = path.join(bundle, relative); fs.mkdirSync(path.dirname(target), {recursive: true}); fs.copyFileSync(path.join(project, relative), target);
    }
    const relative = `plugin-src/resources/colleague-library/${colleagueCatalog.files[0].path}`;
    fs.mkdirSync(path.dirname(path.join(bundle, relative)), {recursive: true});
    return {bundle, relative};
}

test('a missing bundled colleague source stops preflight before any writes', t => {
    const {parent, library} = fixture(t), bundle = path.join(parent, 'bundle');
    for (const relative of ['plugin-src/resources/builtin-prompts/catalog.json', 'plugin-src/resources/colleague-library/catalog.json']) {
        const target = path.join(bundle, relative); fs.mkdirSync(path.dirname(target), {recursive: true}); fs.copyFileSync(path.join(project, relative), target);
    }
    assert.throws(() => installBuiltins(library, bundle));
    assert.equal(library.listTemplates().length, 0); assert.equal(library.listPrompts().length, 0);
});

function installFirstTemplate(library) {
    const prepared = prepareColleagueBuiltins(relative => path.join(project, relative)).prepared[0];
    const {definition} = prepared, resources = {};
    for (const [key, input] of prepared.resources) {
        const asset = library.importAsset(input.file, {purpose: input.purpose});
        resources[key] = {assetHash: asset.assetHash, bytes: asset.bytes, detectedType: asset.detectedType, role: input.role};
    }
    library.installBuiltinTemplate({id: definition.id, name: definition.name, version: definition.version, definition, resources});
    return {definition, resources};
}

const assetPath = (root, hash) => path.join(root, '资产', 'sha256', hash.slice(0, 2), hash);

test('a missing asset is imported, but a tampered same-hash asset is never overwritten', t => {
    const {library} = fixture(t), {resources} = installFirstTemplate(library);
    const hashes = Object.values(resources).map(resource => resource.assetHash);
    const missing = assetPath(library.info.root, hashes[0]), tampered = assetPath(library.info.root, hashes[1]);
    fs.unlinkSync(missing);
    fs.writeFileSync(tampered, 'keep corrupt evidence');
    const imported = [];
    assert.throws(() => installBuiltins({...library,
        importAsset(file, options) {
            imported.push(file);
            return library.importAsset(file, options);
        }
    }), error => error.code === 'CORRUPT');
    assert.equal(imported.length, 2);
    assert.ok(fs.existsSync(missing));
    assert.equal(fs.readFileSync(tampered, 'utf8'), 'keep corrupt evidence');
});

test('stored assets changed after the batch are revalidated by template installation', t => {
    const {library} = fixture(t), {resources} = installFirstTemplate(library);
    const target = assetPath(library.info.root, Object.values(resources)[0].assetHash);
    assert.throws(() => installBuiltins({...library,
        readAssetDescriptors(hashes) {
            const descriptors = library.readAssetDescriptors(hashes);
            fs.writeFileSync(target, 'changed after batch');
            return descriptors;
        }
    }), error => error.code === 'CORRUPT');
    assert.equal(library.listTemplates().length, 1);
    assert.equal(library.listPrompts().length, 0);
    assert.equal(fs.readFileSync(target, 'utf8'), 'changed after batch');
});

test('root replacement after the batch stops installation before any write to the clone', t => {
    const {parent, library} = fixture(t);
    installFirstTemplate(library);
    const root = library.info.root, original = path.join(parent, 'original');
    assert.throws(() => installBuiltins({...library,
        readAssetDescriptors(hashes) {
            const descriptors = library.readAssetDescriptors(hashes);
            fs.renameSync(root, original);
            fs.cpSync(original, root, {recursive: true});
            return descriptors;
        }
    }), error => error.code === 'CONFLICT');
    assert.equal(fs.existsSync(path.join(root, '系统（别动）', '库锁')), false);
    const reopened = openLibrary(root);
    assert.equal(reopened.listTemplates().length, 1);
    assert.equal(reopened.listPrompts().length, 0);
    assert.equal(fs.readdirSync(path.join(root, '系统（别动）', '事务', '已提交')).length,
        fs.readdirSync(path.join(original, '系统（别动）', '事务', '已提交')).length);
});

test('source bytes changing after preflight still fail the import hash comparison', t => {
    const {parent, library} = fixture(t), changed = path.join(parent, 'changed.txt');
    fs.writeFileSync(changed, 'different source bytes');
    assert.throws(() => installBuiltins({...library,
        importAsset() { return library.importAsset(changed, {purpose: 'template-structure'}); }
    }), /预检后发生变化/);
    assert.equal(library.listTemplates().length, 0);
    assert.equal(library.listPrompts().length, 0);
});

test('same-version package conflicts are still rejected after batch verification', t => {
    const {library} = fixture(t), {definition} = installFirstTemplate(library);
    // Exercise a conflicting input at the real installer boundary without changing bundled sources.
    assert.throws(() => installBuiltins({...library,
        installBuiltinTemplate(input) {
            return library.installBuiltinTemplate({...input, definition: {...input.definition, conflicting: true}});
        }
    }), error => error.code === 'CONFLICT');
    assert.deepEqual(library.readTemplate(definition.id).definition, definition);
});

test('bundle resource links cannot read a file outside the packaged resource root', t => {
    const {parent, library} = fixture(t);
    const {bundle, relative} = incompleteBundle(parent);
    const outside = path.join(parent, 'outside.png');
    fs.copyFileSync(path.join(project, relative), outside);
    fs.symlinkSync(outside, path.join(bundle, relative));
    assert.throws(() => installBuiltins(library, bundle), /超出安装包范围/);
    assert.equal(library.listTemplates().length, 0);
    assert.equal(library.listPrompts().length, 0);
});
