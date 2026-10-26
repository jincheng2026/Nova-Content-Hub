import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {createLibrary, openLibrary} from '../../plugin-src/src/lib/file-library/index.mjs';
import {execute} from '../src/main/worker.mts';
import {isTemplateCatalogSelectable, templateCatalogFields} from '../src/main/template-catalog.mts';
import {templateStudyComplete} from '../src/main/template-study-state.mts';

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

test('workspace retains history while generation offers only usable current or custom templates; ordinary reads never write Markdown', async t => {
    const f = await fixture(t), workspace = await execute('workspaceLibrary', {binding: f.binding}), covers = await execute('coverAssets', {binding: f.binding});
    for (const templates of [workspace.templates, covers.templates]) {
        assert.equal(templates.find(item => item.id === f.builtin.id).catalogStatus, 'default');
        const working = templates.find(item => item.id === f.derived.id);
        assert.equal(working.catalogStatus, 'custom'); assert.deepEqual(working.derivedFrom, {id: f.builtin.id, version: 1});
        assert.equal(working.designNotes, '完整来源\n\n第二段');
    }
    assert.equal(workspace.templates.find(item => item.id === f.legacy.id).catalogStatus, 'legacy');
    assert.equal(covers.templates.some(item => item.id === f.legacy.id), false);
    assert.equal(covers.templates.find(item => item.id === f.builtin.id).studyComplete, true);
    assert.equal(covers.templates.find(item => item.id === f.derived.id).studyComplete, true);
    assert.equal(covers.templates.find(item => item.id === f.derived.id).accepted, false, 'source analysis does not assert human acceptance');
    assert.equal(templateCatalogFields({id: f.builtin.id, builtin: false}, {}).catalogStatus, 'custom');
    assert.equal((await execute('templateRead', {binding: f.binding, templateId: f.derived.id}, 'disabled')).studyComplete, true);
    assert.equal(fs.existsSync(path.join(f.binding.root, '模板', '模板目录.md')), false);
    assert.equal(fs.existsSync(path.join(f.binding.root, '模板', f.derived.id, '模板目录.md')), false);
});

test('analysis follows unchanged material, not inherited notes, version counters or acceptance flags', async t => {
    const f = await fixture(t), initial = f.library.readTemplate(f.derived.id);
    const ready = async () => (await execute('coverAssets', {binding: f.binding})).templates.find(item => item.id === f.derived.id).studyComplete;
    const version = (n, definition, resources = initial.resources) => f.library.addTemplateVersion(initial.id, {version: n, definition, resources}, f.library.readTemplate(initial.id).editToken);
    version(2, {...initial.definition, accepted: false, aiTested: false});
    assert.equal(await ready(), true, 'copying unchanged material to another version does not require analysis');
    version(3, {...initial.definition, rules: ['changed rule']});
    assert.equal(await ready(), false, 'inherited notes cannot cover changed rules');
    version(4, initial.definition, {});
    assert.equal(templateStudyComplete(f.library, f.library.readTemplate(initial.id)), false, 'changed references invalidate inherited analysis');
    version(5, {accepted: true, aiTested: true});
    assert.equal(await ready(), false, 'bare acceptance flags never prove analysis');
    f.library.selectTemplateVersion(initial.id, 1, f.library.readTemplate(initial.id).editToken);
    assert.equal(await ready(), true, 'switching back restores original version facts');
});

test('current submitted evidence suppresses new analysis without implying acceptance; old jobs do not block changed packages', () => {
    const base = {id: 'template', currentVersion: 2, versions: [{version: 1, packageHash: 'old'}, {version: 2, packageHash: 'current'}], definition: {}, resources: {}, templateJobs: [{id: 'job', attempts: [{attemptId: 'attempt', status: 'committed'}], acceptance: null}]};
    const context = {request: {template: {version: 2, packageHash: 'current'}}, results: [{attemptId: 'attempt', result: {resultHash: 'result'}}]};
    const reader = {readTemplateContext: () => context};
    assert.equal(templateStudyComplete(reader, base), true);
    context.request.template.packageHash = 'old';
    assert.equal(templateStudyComplete(reader, base), false);
    base.templateJobs[0].acceptance = {acceptedTemplate: {id: 'template', version: 1, packageHash: 'old'}};
    assert.equal(templateStudyComplete(reader, base), false, 'old human acceptance does not cover current content');
    base.templateJobs[0].acceptance.acceptedTemplate = {id: 'template', version: 2, packageHash: 'current'};
    assert.equal(templateStudyComplete(reader, base), true);
    base.templateJobs[0].acceptance = null;
    for (const status of ['created', 'claimed', 'failed', 'cancelled', 'superseded']) {
        base.templateJobs[0].attempts[0].status = status;
        assert.equal(templateStudyComplete(reader, base), false, status + ' is not completed analysis');
    }
});

test('unreadable committed history does not break the current catalog or masquerade as completed analysis', async t => {
    const f = await fixture(t), source = f.library.readTemplate(f.derived.id);
    const template = f.library.createTemplate({name: 'history', definition: {}, resources: source.resources});
    const {request} = await f.library.createTemplateRequest(template.id, {version: 1}, template.editToken);
    const {attempt, inbox} = f.library.createTemplateAttempt(template.id, request.requestId, {host: 'codex'});
    f.library.claimTemplateAttempt(template.id, request.requestId, attempt.attemptId, {host: 'codex', requestHash: request.requestHash, readAssetHashes: request.styleAssetHashes});
    fs.writeFileSync(path.join(inbox, 'rules.json'), JSON.stringify({fixed: ['composition'], variable: [], evidence: [{sourceAssetHash: request.styleAssetHashes[0], ruleType: 'fixed', ruleIndex: 0, observation: 'reference'}]}));
    await sharp({create: {width: 12, height: 16, channels: 3, background: 'green'}}).png().toFile(path.join(inbox, 'restore.png'));
    await f.library.commitTemplateAttempt(template.id, request.requestId, attempt.attemptId, {format: 'nova-template-receipt', schemaVersion: 1, libraryId: f.binding.libraryId, templateId: template.id, requestId: request.requestId, attemptId: attempt.attemptId, requestHash: request.requestHash, host: 'codex', mutationId: randomUUID(), rulesFile: 'rules.json', restoreFile: 'restore.png'});
    assert.equal((await execute('coverAssets', {binding: f.binding})).templates.find(item => item.id === template.id).studyComplete, true);
    const requestFile = path.join(f.binding.root, '模板', template.id, '学习任务', request.requestId, '请求.json');
    for (const damage of [() => fs.writeFileSync(requestFile, '{}'), () => fs.unlinkSync(requestFile)]) {
        damage();
        const catalog = await execute('coverAssets', {binding: f.binding});
        assert.equal(catalog.templates.find(item => item.id === template.id).studyComplete, false);
        assert.equal(catalog.templates.find(item => item.id === f.builtin.id).studyComplete, true);
        const view = await execute('templateRead', {binding: f.binding, templateId: template.id}, 'disabled');
        assert.equal(view.jobs[0].attempts[0].unavailable, true);
    }
});

test('generation excludes deleted and empty templates without treating a custom copy as legacy', async t => {
    const f = await fixture(t);
    f.library.createTemplate({name: '尚无样张', definition: {}, resources: {}});
    const derived = f.library.readTemplate(f.derived.id);
    f.library.trashTemplate(derived.id, derived.editToken);
    const covers = await execute('coverAssets', {binding: f.binding});
    assert.deepEqual(covers.templates.map(item => item.id), [f.builtin.id]);
    assert.equal(isTemplateCatalogSelectable({id: f.builtin.id, builtin: true, deletedAt: '2026-10-22T00:00:00.000Z'}), false);
    assert.equal(isTemplateCatalogSelectable({id: f.legacy.id, builtin: true}), false);
    assert.equal(isTemplateCatalogSelectable({id: f.legacy.id, builtin: false}), true);
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
