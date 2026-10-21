import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import {createLibrary, openLibrary} from '../../plugin-src/src/lib/file-library/index.mjs';
import {execute} from '../src/main/worker.mts';
import {templateCatalogFields} from '../src/main/template-catalog.mts';

async function fixture(t) {
    const parent = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'nch-template-catalog-'));
    t.after(() => fs.rmSync(parent, {recursive: true, force: true}));
    const library = createLibrary(path.join(parent, 'library')), source = path.join(parent, 'reference.png');
    await sharp({create: {width: 12, height: 16, channels: 3, background: 'red'}}).png().toFile(source);
    const asset = library.importAsset(source, {purpose: 'template-reference'});
    const resources = {reference: {assetHash: asset.assetHash, bytes: asset.bytes, detectedType: asset.detectedType, role: 'style'}};
    const definition = {desc: 'source description', designNotes: '完整来源\n\n第二段', rules: ['原始规则']};
    const builtin = library.installBuiltinTemplate({id: 'builtin-colleague-assistant-scene', name: 'source', version: 1, definition, resources});
    const legacy = library.installBuiltinTemplate({id: 'builtin-original-retained', name: 'legacy', version: 1, definition, resources});
    const derived = library.createTemplate({name: 'working', definition, resources, derivedFrom: {id: builtin.id, version: 1}});
    return {parent, library, builtin, legacy, derived, binding: {root: library.info.root, libraryId: library.info.libraryId, rootIdentity: library.info.rootIdentity}};
}

test('both catalogs retain default, legacy and derived custom facts; ordinary reads never write Markdown', async t => {
    const f = await fixture(t), workspace = await execute('workspaceLibrary', {binding: f.binding}), covers = await execute('coverAssets', {binding: f.binding});
    for (const templates of [workspace.templates, covers.templates]) {
        assert.equal(templates.find(item => item.id === f.builtin.id).catalogStatus, 'default');
        assert.equal(templates.find(item => item.id === f.legacy.id).catalogStatus, 'legacy');
        const working = templates.find(item => item.id === f.derived.id);
        assert.equal(working.catalogStatus, 'custom'); assert.deepEqual(working.derivedFrom, {id: f.builtin.id, version: 1});
        assert.equal(working.designNotes, '完整来源\n\n第二段');
    }
    assert.equal(templateCatalogFields({id: f.builtin.id, builtin: false}, {}).catalogStatus, 'custom');
    await execute('templateRead', {binding: f.binding, templateId: f.derived.id}, 'disabled');
    assert.equal(fs.existsSync(path.join(f.binding.root, '模板', '模板目录.md')), false);
    assert.equal(fs.existsSync(path.join(f.binding.root, '模板', f.derived.id, '模板目录.md')), false);
});

test('explicit folder reveal rebuilds safe readable reports and rejects renderer paths or replaced template directories', async t => {
    const f = await fixture(t), {folder, reportWarnings} = await execute('workspaceTemplateFolder', {binding: f.binding, templateId: f.derived.id});
    assert.deepEqual(reportWarnings, []);
    assert.equal(folder, path.join(f.binding.root, '模板', f.derived.id));
    assert.match(fs.readFileSync(path.join(f.binding.root, '模板', '模板目录.md'), 'utf8'), new RegExp(f.legacy.id));
    const report = fs.readFileSync(path.join(folder, '版本', '1', '拆解说明.md'), 'utf8');
    assert.match(report, /来源拆解资料，非本次AI验收/); assert.match(report, /完整来源\n\n第二段/); assert.match(report, /原图 1/); assert.doesNotMatch(report, /undefined/);
    assert.equal(openLibrary(f.binding.root).listTemplates().length, 3);
    await assert.rejects(execute('workspaceTemplateFolder', {binding: f.binding, templateId: '../outside'}));
    await assert.rejects(execute('workspaceTemplateFolder', {binding: f.binding, templateId: f.derived.id, path: f.parent}));
    fs.renameSync(folder, `${folder}-saved`); fs.symlinkSync(`${folder}-saved`, folder);
    await assert.rejects(execute('workspaceTemplateFolder', {binding: f.binding, templateId: f.derived.id}));
});

// Imported source reports are preserved verbatim; their old sample totals are not current-group counts.
test('historical report scope is labelled without changing notes or splitting colleague groups', () => {
    const catalog = JSON.parse(fs.readFileSync(new URL('../../plugin-src/resources/colleague-library/catalog.json', import.meta.url), 'utf8'));
    assert.equal(catalog.templates.length, 5);
    const expected = [19, 30, 25, 30, 23];
    for (const [index, template] of catalog.templates.entries()) {
        const fields = templateCatalogFields({id: template.id, builtin: true}, template);
        assert.equal(template.referenceImages.length, expected[index]);
        assert.equal(new Set(template.referenceImages.map(image => image.sha256)).size, expected[index]);
        assert.equal(fields.designNotes, template.designNotes);
        if ([1, 3].includes(index)) {
            assert.match(fields.sourceScopeWarning, /本组实际包含 30 张原图/);
            assert.match(fields.sourceScopeWarning, index === 1 ? /90 张历史样本/ : /32 张历史样本/);
            assert.equal(templateCatalogFields({id: 'working-copy'}, template).sourceScopeWarning, fields.sourceScopeWarning);
        } else assert.equal(fields.sourceScopeWarning, null);
    }
    assert.equal(catalog.templates.filter(template => template.id === 'builtin-colleague-spatial-operation').length, 1);
});
