import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createLibrary, openLibrary} from '../../file-library/index.mjs';
import {installBuiltins} from '../index.mjs';
import {prepareColleagueBuiltins} from '../colleague.mjs';
import {validateImage} from '../../image-validation/index.mjs';

const project = fileURLToPath(new URL('../../../../../', import.meta.url));
const templateCatalog = JSON.parse(fs.readFileSync(path.join(project, 'plugin-src/resources/builtin-templates/catalog.json'), 'utf8'));
const promptCatalog = JSON.parse(fs.readFileSync(path.join(project, 'plugin-src/resources/builtin-prompts/catalog.json'), 'utf8'));
const colleagueCatalog = JSON.parse(fs.readFileSync(path.join(project, 'plugin-src/resources/colleague-library/catalog.json'), 'utf8'));
const sourceRoot = path.join(project, 'plugin-src/resources/colleague-library');

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
                assert.equal(hashes.length, 195, 'batch covers the complete preflight, including colleague resources');
                return lib.readAssetDescriptors(hashes);
            }
        };
    }
    const report = installBuiltins(batched(library));
    assert.equal(batchReads, 1);
    assert.equal(report.templates.length, 20);
    assert.equal(report.styleSamples, 157);
    assert.equal(report.structureSamples, 38);
    assert.equal(report.createdPrompts, 52);
    assert.equal(library.listTemplates().length, 20);
    assert.equal(library.listPrompts().length, 52);
    assert.equal(library.listPhotos().length, 0, 'style sample people are never installed as the user');
    for (const definition of templateCatalog.templates) {
        const template = library.readTemplate(definition.id, definition.version);
        assert.deepEqual(template.definition, definition);
        const style = Object.values(template.resources).filter(ref => ref.role === 'style');
        assert.equal(style.length, 2);
        for (const ref of definition.generatedReferences) {
            const bound = template.resources[ref.path];
            assert.equal(bound.role, 'style');
            const asset = library.readAsset(bound.assetHash);
            assert.equal(asset.decoded, false);
            assert.equal(asset.detectedType, 'image/png');
            assert.ok(asset.data.equals(fs.readFileSync(path.join(project, 'plugin-src/resources', ref.path))));
        }
    }
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
    const firstTemplate = library.readTemplate(templateCatalog.templates[0].id);
    const trashedTemplate = library.trashTemplate(firstTemplate.id, firstTemplate.editToken);
    const reopened = openLibrary(library.info.root);
    const again = installBuiltins({...batched(reopened), importAsset() { assert.fail('repeat installation must reuse verified immutable assets'); }});
    assert.equal(batchReads, 2);
    assert.equal(again.createdPrompts, 0);
    assert.equal(reopened.listPrompts().length, 51);
    assert.equal(reopened.listPromptTrash().length, 1);
    assert.equal(reopened.readPrompt(edited.id).body, edited.body);
    assert.equal(reopened.listTemplates().length, 19);
    assert.equal(reopened.listTemplateTrash().length, 1);
    assert.equal(reopened.readTemplate(firstTemplate.id).deletedAt, trashedTemplate.deletedAt);
});

test('an existing library receives only missing colleague resources and preserves edits, trash and historic packages', t => {
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
        library.installBuiltinTemplate({id: definition.id, name: definition.name, version: definition.version, definition, resources});
    }
    for (const prompt of promptCatalog.prompts) {
        const {title, body, category, when, summary, tags, provenance} = prompt;
        library.createPrompt({title, body, category, when, summary, tags, provenance, builtinKey: prompt.id});
    }
    const originalHashes = library.listTemplates().map(item => [item.id, library.readTemplate(item.id).packageHash]);
    const oldPrompt = library.listPrompts()[0];
    library.updatePrompt(oldPrompt.id, {body: '用户保留的旧版修改'}, oldPrompt.editToken);
    const sameBody = library.createPrompt({title: '已手工收录同一正文', body: colleagueCatalog.prompts[0].body.trim().replace(/\n/g, '\r\n')});
    const upgraded = installBuiltins(openLibrary(library.info.root));
    assert.equal(upgraded.createdPrompts, 25, 'existing exact body is not duplicated under a different title');
    assert.equal(library.listTemplates().length, 20);
    assert.equal(library.listPrompts().length, 52);
    assert.equal(library.readPrompt(oldPrompt.id).body, '用户保留的旧版修改');
    assert.equal(library.readPrompt(sameBody.id).builtinKey, null, 'custom ownership is not taken over');
    for (const [id, hash] of originalHashes) assert.equal(library.readTemplate(id).packageHash, hash);
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
    for (const relative of ['plugin-src/resources/builtin-templates/catalog.json', 'plugin-src/resources/builtin-prompts/catalog.json', 'plugin-src/resources/assets/ai-reference-prompts/generated-files.json']) {
        const target = path.join(bundle, relative);
        fs.mkdirSync(path.dirname(target), {recursive: true});
        fs.copyFileSync(path.join(project, relative), target);
    }
    const relative = path.join('plugin-src/resources', templateCatalog.templates[0].generatedReferences[0].path);
    fs.mkdirSync(path.dirname(path.join(bundle, relative)), {recursive: true});
    return {bundle, relative};
}

test('a corrupt bundled PNG stops preflight before any template or prompt is written', t => {
    const {parent, library} = fixture(t);
    const {bundle, relative} = incompleteBundle(parent);
    fs.writeFileSync(path.join(bundle, relative), 'not the registered PNG');
    assert.throws(() => installBuiltins({...library, readAssetDescriptors() { assert.fail('batch must wait for all source preflight'); }}, bundle), /图片校验失败/);
    assert.equal(library.listTemplates().length, 0);
    assert.equal(library.listPrompts().length, 0);
});

function installFirstTemplate(library) {
    const definition = templateCatalog.templates[0], resources = {};
    for (const [refs, role, purpose] of [[definition.generatedReferences, 'style', 'template-reference'], [definition.assets, 'structure', 'template-structure']]) {
        for (const ref of refs) {
            const asset = library.importAsset(path.join(project, 'plugin-src/resources', ref.path), {purpose});
            resources[ref.path] = {assetHash: asset.assetHash, bytes: asset.bytes, detectedType: asset.detectedType, role};
        }
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
