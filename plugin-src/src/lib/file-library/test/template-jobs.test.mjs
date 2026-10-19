import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {createLibrary, openLibrary, backupLibrary, verifyBackup, restoreBackup} from '../index.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const json = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const image = (width, height, color = 'green') => sharp({create: {width, height, channels: 3, background: color}}).png().toBuffer();
async function fixture(t) {
    const parent = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'nova-template-size-')), root = path.join(parent, 'library');
    t.after(() => fs.rmSync(parent, {recursive: true, force: true}));
    const lib = createLibrary(root), source = path.join(parent, 'reference.png');
    fs.writeFileSync(source, await image(1086, 1448, 'red'));
    const asset = lib.importAsset(source, {purpose: 'template-reference'});
    const createdTemplate = lib.createTemplate({name: 'reference', definition: {accepted: false, aiTested: false}, resources: {sample: {assetHash: asset.assetHash, bytes: asset.bytes, detectedType: asset.detectedType, role: 'style'}}});
    const template = lib.readTemplate(createdTemplate.id);
    const requestFile = rid => path.join(root, '模板', template.id, '学习任务', rid, '请求.json');
    const create = (sizePolicy, options) => lib.createTemplateRequest(template.id, {version: 1, notes: 'fixed', ...(sizePolicy === undefined ? {} : {sizePolicy})}, template.editToken, options);
    return {parent, root, lib, asset, template, requestFile, create};
}
function start(f, request) {
    const c = f.lib.createTemplateAttempt(f.template.id, request.requestId, {host: 'codex'});
    f.lib.claimTemplateAttempt(f.template.id, request.requestId, c.attempt.attemptId, {host: 'codex', requestHash: request.requestHash, readAssetHashes: request.styleAssetHashes});
    fs.writeFileSync(path.join(c.inbox, 'rules.json'), json({fixed: ['same composition'], variable: [], evidence: [{sourceAssetHash: f.asset.assetHash, ruleType: 'fixed', ruleIndex: 0, observation: 'reference composition'}]}));
    const receipt = {format: 'nova-template-receipt', schemaVersion: 1, libraryId: f.lib.info.libraryId, templateId: f.template.id, requestId: request.requestId, attemptId: c.attempt.attemptId, requestHash: request.requestHash, host: 'codex', mutationId: randomUUID(), rulesFile: 'rules.json', restoreFile: 'restore.png'};
    const commit = async (width, height, color) => {
        fs.writeFileSync(path.join(c.inbox, 'restore.png'), await image(width, height, color));
        return f.lib.commitTemplateAttempt(f.template.id, request.requestId, c.attempt.attemptId, receipt);
    };
    return {...c, receipt, commit};
}

test('omitted and exact preserve v1 request bytes, input digest and mutation replay', async t => {
    const f = await fixture(t), options = {mutationId: randomUUID()}, created = await f.create(undefined, options), r = created.request;
    const body = {protocol: {name: 'nova-template-execution', version: 1, appScope: 'nova-content-hub', scope: 'template-study-restore'}, libraryId: f.lib.info.libraryId, templateId: f.template.id, template: {id: f.template.id, version: 1, packageHash: f.template.packageHash}, templateDefinition: f.template.definition, templateResources: f.template.resources, styleAssetHashes: [f.asset.assetHash], inputs: [{role: 'style', assetHash: f.asset.assetHash, bytes: f.asset.bytes, detectedType: f.asset.detectedType, width: 1086, height: 1448}], restore: {sourceAssetHash: f.asset.assetHash, width: 1086, height: 1448, outputFormat: 'png'}, notes: 'fixed'};
    const expected = json({format: 'nova-template-request', schemaVersion: 1, requestId: r.requestId, createdAt: r.createdAt, inputHash: hash(json(body)), ...body});
    assert.deepEqual(fs.readFileSync(f.requestFile(r.requestId)), expected);
    assert.equal(r.requestHash, hash(expected));
    assert.deepEqual((await f.create('exact', options)).request, r);
    assert.deepEqual(fs.readFileSync(f.requestFile(r.requestId)), expected);
    await assert.rejects(f.create('ratio-minimum', options), {code: 'INVALID_INPUT'});
    const c = start(f, r);
    await assert.rejects(c.commit(1152, 1536), {code: 'IMAGE_DIMENSIONS_MISMATCH'});
    const committed = await c.commit(1086, 1448);
    assert.equal(committed.result.restore.width, 1086);
    assert.equal(f.lib.readTemplateContext(f.template.id, r.requestId, c.attempt.attemptId).request.schemaVersion, 1);
    const current = f.lib.readTemplate(f.template.id);
    f.lib.acceptTemplateResult(f.template.id, {requestId: r.requestId, attemptId: c.attempt.attemptId, requestHash: r.requestHash, resultHash: committed.result.resultHash, sourceVersion: 1, sourcePackageHash: r.template.packageHash}, current.editToken);
    const backup = path.join(f.parent, 'backup'), restored = path.join(f.parent, 'restored');
    backupLibrary(f.root, backup); verifyBackup(backup); restoreBackup(backup, restored);
    assert.equal(openLibrary(restored).readTemplateContext(f.template.id, r.requestId, c.attempt.attemptId).request.schemaVersion, 1);
    assert.deepEqual(fs.readFileSync(path.join(restored, '模板', f.template.id, '学习任务', r.requestId, '请求.json')), expected);
});

test('ratio-minimum checks exact integer ratio and both minimums, then rereads, accepts and restores backup unchanged', async t => {
    const f = await fixture(t), {request} = await f.create('ratio-minimum'), c = start(f, request);
    assert.equal(request.schemaVersion, 2);
    assert.equal(request.sizePolicy, 'ratio-minimum');
    assert.deepEqual([request.restore.width, request.restore.height], [1086, 1448]);
    const {requestHash, inputHash, format, schemaVersion, requestId, createdAt, ...body} = request;
    assert.equal(inputHash, hash(json(body)));
    for (const dims of [[1072, 1440], [1080, 1440], [1200, 1536]]) await assert.rejects(c.commit(...dims), {code: 'IMAGE_DIMENSIONS_MISMATCH'});
    await assert.rejects(c.commit(1086, 1448, 'red'), {code: 'REFERENCE_REUSED'});
    const committed = await c.commit(1152, 1536), raw = fs.readFileSync(f.requestFile(request.requestId));
    assert.deepEqual([committed.result.restore.width, committed.result.restore.height], [1152, 1536]);
    assert.equal((await f.lib.commitTemplateAttempt(f.template.id, request.requestId, c.attempt.attemptId, c.receipt)).result.resultHash, committed.result.resultHash);
    let lib = openLibrary(f.root), context = lib.readTemplateContext(f.template.id, request.requestId, c.attempt.attemptId);
    assert.equal(context.results[0].result.restore.width, 1152);
    const current = lib.readTemplate(f.template.id);
    const accepted = lib.acceptTemplateResult(f.template.id, {requestId: request.requestId, attemptId: c.attempt.attemptId, requestHash, resultHash: committed.result.resultHash, sourceVersion: 1, sourcePackageHash: request.template.packageHash}, current.editToken);
    assert.equal(accepted.template.currentVersion, 2);
    const backup = path.join(f.parent, 'backup'), restored = path.join(f.parent, 'restored');
    backupLibrary(f.root, backup); verifyBackup(backup); restoreBackup(backup, restored);
    lib = openLibrary(restored); context = lib.readTemplateContext(f.template.id, request.requestId, c.attempt.attemptId);
    assert.equal(context.request.sizePolicy, 'ratio-minimum');
    assert.equal(context.results[0].result.restore.width, 1152);
    assert.deepEqual(fs.readFileSync(path.join(restored, '模板', f.template.id, '学习任务', request.requestId, '请求.json')), raw);
    assert.equal(lib.readTemplate(f.template.id).templateJobs[0].acceptance.acceptedTemplate.version, 2);
});

for (const sizePolicy of ['automatic', '', null, 1]) test(`unknown template size policy ${JSON.stringify(sizePolicy)} is rejected`, async t => {
    const f = await fixture(t);
    await assert.rejects(f.create(sizePolicy), {code: 'INVALID_INPUT'});
    assert.deepEqual(f.lib.readTemplate(f.template.id).templateJobs, []);
});

for (const [schemaVersion, policy] of [[1, 'ratio-minimum'], [1, 'exact'], [2, undefined], [2, 'exact'], [3, 'ratio-minimum']]) test(`fixed request rejects unsupported version/policy ${schemaVersion}/${policy}`, async t => {
    const f = await fixture(t), {request} = await f.create(undefined), filename = f.requestFile(request.requestId), changed = JSON.parse(fs.readFileSync(filename));
    changed.schemaVersion = schemaVersion;
    if (policy !== undefined) changed.sizePolicy = policy;
    const {format, schemaVersion: schema, requestId, createdAt, inputHash, ...body} = changed;
    changed.inputHash = hash(json(body));
    const bytes = json(changed); fs.writeFileSync(filename, bytes);
    const metaFile = path.join(f.root, '模板', f.template.id, '模板.json'), meta = JSON.parse(fs.readFileSync(metaFile));
    meta.templateJobs[0].requestHash = hash(bytes); meta.templateJobs[0].inputHash = changed.inputHash;
    fs.writeFileSync(metaFile, json(meta));
    assert.throws(() => f.lib.createTemplateAttempt(f.template.id, request.requestId, {host: 'codex'}), {code: 'CORRUPT'});
});

test('evidence read rejects a resealed result below the fixed minimum', async t => {
    const f = await fixture(t), {request} = await f.create('ratio-minimum'), c = start(f, request);
    const committed = await c.commit(1152, 1536), dir = path.dirname(committed.result.restore.path);
    const resultFile = path.join(dir, '结果.json'), reportFile = path.join(dir, '校验报告.json');
    const result = JSON.parse(fs.readFileSync(resultFile)), report = JSON.parse(fs.readFileSync(reportFile));
    result.restore.width = 1080; result.restore.height = 1440;
    const bytes = json(result), resultHash = hash(bytes);
    fs.writeFileSync(resultFile, bytes);
    report.restore = result.restore; report.resultHash = resultHash;
    const reportBytes = json(report); fs.writeFileSync(reportFile, reportBytes);
    const metaFile = path.join(f.root, '模板', f.template.id, '模板.json'), meta = JSON.parse(fs.readFileSync(metaFile));
    meta.templateJobs[0].attempts[0].resultHash = resultHash; meta.templateJobs[0].attempts[0].reportHash = hash(reportBytes);
    fs.writeFileSync(metaFile, json(meta));
    assert.throws(() => f.lib.readTemplateContext(f.template.id, request.requestId, c.attempt.attemptId), {code: 'CORRUPT'});
});
