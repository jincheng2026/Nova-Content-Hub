import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createLibrary, openLibrary} from '../../file-library/index.mjs';
import {installBuiltins} from '../index.mjs';

const project = fileURLToPath(new URL('../../../../../', import.meta.url));
const templateCatalog = JSON.parse(fs.readFileSync(path.join(project, 'plugin-src/resources/builtin-templates/catalog.json'), 'utf8'));
const promptCatalog = JSON.parse(fs.readFileSync(path.join(project, 'plugin-src/resources/builtin-prompts/catalog.json'), 'utf8'));

function fixture(t) {
    const parent = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'nch-builtin-seed-'));
    t.after(() => fs.rmSync(parent, {recursive: true, force: true}));
    return {parent, library: createLibrary(path.join(parent, 'library'))};
}

test('real bundled groups and original prompts install, reopen and seed again without overwriting user facts', t => {
    const {library} = fixture(t);
    const report = installBuiltins(library);
    assert.equal(report.templates.length, 15);
    assert.equal(report.styleSamples, 30);
    assert.equal(report.structureSamples, 30);
    assert.equal(report.createdPrompts, 26);
    assert.equal(library.listTemplates().length, 15);
    assert.equal(library.listPrompts().length, 26);
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
    const firstPrompt = library.listPrompts().find(item => item.builtinKey === promptCatalog.prompts[0].id);
    const edited = library.updatePrompt(firstPrompt.id, {body: '用户自己的修改\n保留这份正文。'}, firstPrompt.editToken);
    const secondPrompt = library.listPrompts().find(item => item.builtinKey === promptCatalog.prompts[1].id);
    library.trashPrompt(secondPrompt.id, secondPrompt.editToken);
    const firstTemplate = library.readTemplate(templateCatalog.templates[0].id);
    const trashedTemplate = library.trashTemplate(firstTemplate.id, firstTemplate.editToken);
    const reopened = openLibrary(library.info.root);
    const again = installBuiltins(reopened);
    assert.equal(again.createdPrompts, 0);
    assert.equal(reopened.listPrompts().length, 25);
    assert.equal(reopened.listPromptTrash().length, 1);
    assert.equal(reopened.readPrompt(edited.id).body, edited.body);
    assert.equal(reopened.listTemplates().length, 14);
    assert.equal(reopened.listTemplateTrash().length, 1);
    assert.equal(reopened.readTemplate(firstTemplate.id).deletedAt, trashedTemplate.deletedAt);
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
    assert.throws(() => installBuiltins(library, bundle), /图片校验失败/);
    assert.equal(library.listTemplates().length, 0);
    assert.equal(library.listPrompts().length, 0);
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
