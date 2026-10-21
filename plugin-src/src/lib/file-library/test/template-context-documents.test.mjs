import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {createLibrary} from '../index.mjs';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

test('cover and template contexts expose complete fixed-package documents and named image sources without changing claims', async t => {
    const parent = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'nch-context-documents-'));
    t.after(() => fs.rmSync(parent, {recursive: true, force: true}));
    const root = path.join(parent, 'library'), library = createLibrary(root);
    const importBytes = (name, bytes, purpose) => {
        const file = path.join(parent, name);
        fs.writeFileSync(file, bytes);
        return library.importAsset(file, {purpose});
    };
    const image = importBytes('K09.png', await sharp({create: {width: 8, height: 6, channels: 3, background: 'red'}}).png().toBuffer(), 'template-reference');
    const viBytes = Buffer.from('# 完整 VI\n固定规则、可变分支与来源身份。\n');
    const vi = importBytes('VI拆解.md', viBytes, 'template-structure');
    const key = 'sources/作者/K09.png', viKey = 'sources/作者/VI拆解.md';
    const resources = {
        [key]: {assetHash: image.assetHash, bytes: image.bytes, detectedType: image.detectedType, role: 'style'},
        [viKey]: {assetHash: vi.assetHash, bytes: vi.bytes, detectedType: vi.detectedType, role: 'structure'}
    };
    const first = library.createTemplate({name: '旧版', definition: {designNotes: viBytes.toString(), referenceImages: [{path: key, sha256: image.assetHash}]}, resources});
    const template = library.readTemplate(first.id);
    const content = library.createContent({title: '新标题', body: '本次正文'});
    const cover = library.createCoverRequest(content.id, {template: {id: template.id, version: 1}, styleAssetHashes: [image.assetHash], photo: null, materialIds: [], prompt: '无人封面', pixels: {width: 8, height: 6}, ratio: '4:3', count: 1, outputFormat: 'png', scope: 'cover-only'}, content.editToken);
    const coverAttempt = library.createCoverAttempt(content.id, cover.request.requestId, {host: 'codex'});
    const study = await library.createTemplateRequest(template.id, {version: 1, notes: '学习全部'}, template.editToken);
    const studyAttempt = library.createTemplateAttempt(template.id, study.request.requestId, {host: 'codex'});
    const coverRequestFile = path.join(root, '内容', content.id, '封面任务', cover.request.requestId, '请求.json');
    const studyRequestFile = path.join(root, '模板', template.id, '学习任务', study.request.requestId, '请求.json');
    const fixedBytes = [fs.readFileSync(coverRequestFile), fs.readFileSync(studyRequestFile)];
    assert.equal(library.claimCoverAttempt(content.id, cover.request.requestId, coverAttempt.attempt.attemptId, {host: 'codex', readAssetHashes: [image.assetHash]}).attempt.status, 'claimed');
    assert.equal(library.claimTemplateAttempt(template.id, study.request.requestId, studyAttempt.attempt.attemptId, {host: 'codex', requestHash: study.request.requestHash, readAssetHashes: [image.assetHash]}).attempt.status, 'claimed');
    const newer = library.addTemplateVersion(template.id, {version: 2, definition: {designNotes: '新规则', referenceImages: [null]}, resources: {[key]: resources[key]}}, library.readTemplate(template.id).editToken);
    assert.equal(newer.currentVersion, 2);
    const contexts = [library.readCoverContext(content.id, cover.request.requestId, coverAttempt.attempt.attemptId), library.readTemplateContext(template.id, study.request.requestId, studyAttempt.attempt.attemptId)];
    for (const context of contexts) {
        assert.equal(context.request.template.version, 1);
        assert.equal(sha256(fs.readFileSync(context.templatePackagePath)), context.request.template.packageHash);
        assert.equal(JSON.parse(fs.readFileSync(context.templatePackagePath)).definition.designNotes, viBytes.toString());
        assert.deepEqual(context.templateDocuments.map(item => [item.sourceKey, item.filename, item.assetHash, item.bytes, item.detectedType]), [[viKey, 'VI拆解.md', vi.assetHash, vi.bytes, vi.detectedType]]);
        assert.deepEqual(fs.readFileSync(context.templateDocuments[0].path), viBytes);
        assert.deepEqual(context.templateImageSources, [{sourceKey: key, filename: 'K09.png', assetHash: image.assetHash, referencePath: key, referenceSha256: image.assetHash}]);
        assert.deepEqual(context.inputs.map(item => item.assetHash), [image.assetHash]);
        assert.equal(context.attempt.status, 'claimed');
    }
    assert.deepEqual([fs.readFileSync(coverRequestFile), fs.readFileSync(studyRequestFile)], fixedBytes);
    const recent = library.createContent({title: '新版本标题', body: '新内容'});
    const recentRequest = library.createCoverRequest(recent.id, {template: {id: template.id, version: 2}, styleAssetHashes: [image.assetHash], photo: null, materialIds: [], prompt: '新规则', pixels: {width: 8, height: 6}, ratio: '4:3', count: 1, outputFormat: 'png', scope: 'cover-only'}, recent.editToken);
    const recentAttempt = library.createCoverAttempt(recent.id, recentRequest.request.requestId, {host: 'codex'});
    const recentContext = library.readCoverContext(recent.id, recentRequest.request.requestId, recentAttempt.attempt.attemptId);
    assert.deepEqual(recentContext.templateDocuments, []);
    assert.deepEqual(recentContext.templateImageSources, [{sourceKey: key, filename: 'K09.png', assetHash: image.assetHash, referencePath: null, referenceSha256: null}]);
    fs.writeFileSync(path.join(root, '资产', 'sha256', vi.assetHash.slice(0, 2), vi.assetHash), 'corrupt');
    assert.throws(() => library.readCoverContext(content.id, cover.request.requestId, coverAttempt.attempt.attemptId), {code: 'CORRUPT'});
    assert.throws(() => library.readTemplateContext(template.id, study.request.requestId, studyAttempt.attempt.attemptId), {code: 'CORRUPT'});
    fs.rmSync(path.join(root, '资产', 'sha256', vi.assetHash.slice(0, 2), vi.assetHash));
    assert.throws(() => library.readCoverContext(content.id, cover.request.requestId, coverAttempt.attempt.attemptId), {code: 'CORRUPT'});
});
