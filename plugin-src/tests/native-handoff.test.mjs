import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import {randomUUID} from 'node:crypto';
import {createLibrary, openLibrary} from '../src/lib/file-library/index.mjs';
import {nativeHandoffDirectory, prepareNativeHandoff, readNativeHandoff, openNativeHandoff} from '../src/bridge/native-handoff.mjs';

const release = {
    format: 'nova-content-desktop-release',
    schemaVersion: 1,
    productId: 'nova-content-hub',
    appScope: 'nova-content-hub',
    protocolVersion: 1,
    prototype: true,
    version: '0.2.0',
    AUTH_MODE: 'disabled',
    pairId: 'nova-content-hub@0.2.0:p1:disabled',
    experimental: true,
    productionReady: false,
    platform: process.platform,
    arch: process.arch
};
const options = {installedSkill: 'nova-content-cover-execution'};
const failure = (code, callback) => assert.throws(callback, error => error.code === code);

async function fixture(t, host = 'codex', overrides = {}, names = {}) {
    const parent = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'nova native handoff '));
    t.after(() => fs.rmSync(parent, {force: true, recursive: true}));
    const library = createLibrary(path.join(parent, '内容库'));
    const picture = path.join(parent, 'sample.png');
    fs.writeFileSync(picture, await sharp({
        create: {
            width: 24,
            height: 32,
            channels: 3,
            background: '#123456'
        }
    }).png().toBuffer());
    const asset = library.importAsset(picture, {purpose: 'template-reference'}), assets = [asset];
    for (let i = 1; i < (names.sampleCount || 1); i++) {
        const file = path.join(parent, `sample-${i}.png`);
        fs.writeFileSync(file, await sharp({create: {width: 24, height: 32, channels: 3, background: {r: i, g: 60, b: 90}}}).png().toBuffer());
        assets.push(library.importAsset(file, {purpose: 'template-reference'}));
    }
    const template = library.createTemplate({
        name: names.template || '清爽旅行模板',
        definition: {original: true},
        resources: Object.fromEntries(assets.map((item, i) => [`sample${i}`, {assetHash: item.assetHash, bytes: item.bytes, detectedType: item.detectedType, role: 'style'}]))
    });
    const content = library.createContent({title: names.title || '秋日山野徒步', body: '# Private body\r\n'});
    const configured = await names.configure?.({library, parent, asset, content}) || {};
    const {request} = library.createCoverRequest(content.id, {
        template: {id: template.id, version: 1},
        styleAssetHashes: assets.map(item => item.assetHash),
        photo: null,
        materialIds: [],
        prompt: 'Fixed generation intent',
        pixels: {width: 24, height: 32},
        ratio: '3:4',
        count: 1,
        outputFormat: 'png',
        scope: 'cover-only',
        ...overrides,
        ...configured
    }, library.readContent(content.id).editToken);
    const {attempt} = library.createCoverAttempt(content.id, request.requestId, {host});
    const binding = {
        root: library.info.root,
        libraryId: library.info.libraryId,
        rootIdentity: library.info.rootIdentity
    };
    const task = {
        contentId: content.id,
        requestId: request.requestId,
        attemptId: attempt.attemptId,
        requestHash: request.requestHash,
        host
    };
    const directory = nativeHandoffDirectory(parent);
    return {parent, library, content, binding, task, directory, template: library.readTemplate(template.id), asset, request};
}

for (const host of ['codex', 'workbuddy']) test(`${host} envelope resolves exact bound attempt and URL shows intent, names and installed Skill without private payload`, async t => {
    const f = await fixture(t, host), prepared = await prepareNativeHandoff(f.directory, f.binding, f.task, release, options);
    const url = new URL(prepared.url);
    assert.equal(url.protocol, `${host}:`);
    assert.equal(url.hostname, host === 'codex' ? 'new' : 'task');
    assert.equal(url.searchParams.get('skills'), host === 'workbuddy' ? options.installedSkill : null);
    assert.equal(url.searchParams.get(host === 'workbuddy' ? 'cwd' : 'path'), f.binding.root);
    assert.equal(url.searchParams.get('action'), host === 'workbuddy' ? 'start' : null);
    assert.deepEqual([...url.searchParams.keys()].sort(), host === 'workbuddy' ? ['action', 'cwd', 'prompt', 'skills'] : ['path', 'prompt']);
    assert.ok(prepared.url.length <= 2048);
    const prompt = prepared.prompt;
    assert.match(prompt, /请给「秋日山野徒步」制作封面/);
    assert.ok(!prompt.includes(f.request.prompt));
    assert.match(prompt, /按任务编号读取本地完整请求、正文与全部已选输入后执行/);
    for (const privateValue of [f.content.body, f.asset.assetHash, 'sample.png', f.binding.root, f.task.contentId, f.task.requestId, f.task.attemptId]) assert.ok(!prompt.includes(privateValue), privateValue);
    const envelope = JSON.parse(fs.readFileSync(path.join(f.directory, `${prepared.id}.json`)));
    assert.deepEqual(Object.keys(envelope).sort(), ['format', 'schemaVersion', 'handoffId', 'pairId', 'AUTH_MODE', 'platform', 'arch', 'binding', 'task', 'createdAt'].sort());
    const found = readNativeHandoff(f.directory, prepared.id, {...release, format: 'nova-content-plugin-release'});
    assert.deepEqual(found.binding, f.binding);
    assert.deepEqual(found.task, f.task);
    assert.equal(found.library.readContent(f.content.id).title, f.content.title);
    assert.deepEqual(found.library.readCoverContext(found.task.contentId, found.task.requestId, found.task.attemptId).request, f.request);
    if (process.platform !== 'win32') {
        assert.equal(fs.statSync(path.join(f.directory, `${prepared.id}.json`)).mode & 0o777, 0o600);
        assert.equal(fs.statSync(f.directory).mode & 0o777, 0o700);
    }
});

for (const host of ['codex', 'workbuddy']) for (const sizePolicy of ['exact', 'ratio-minimum']) test(`${host} ${sizePolicy} template handoff names the selected template and requests study plus restoration`, async t => {
    const f = await fixture(t, host);
    const {request} = await f.library.createTemplateRequest(f.template.id, {version: 1, notes: 'PRIVATE_TEMPLATE_NOTES', sizePolicy}, f.library.readTemplate(f.template.id).editToken);
    const {attempt} = f.library.createTemplateAttempt(f.template.id, request.requestId, {host});
    const task = {templateId: f.template.id, requestId: request.requestId, attemptId: attempt.attemptId, requestHash: request.requestHash, host};
    const prepared = await prepareNativeHandoff(f.directory, f.binding, task, release, {kind: 'template', installedSkill: 'nova-content-template-execution'});
    const url = new URL(prepared.url), prompt = prepared.prompt;
    assert.match(prompt, /学习.*整理规则并还原首张样图/);
    assert.ok(prompt.includes(f.template.name));
    assert.ok(!prompt.includes('PRIVATE_TEMPLATE_NOTES'));
    assert.match(prompt, /读取本地完整请求/);
    assert.ok(prompt.includes(`任务编号：${prepared.id}`));
    assert.equal(url.searchParams.get('skills'), host === 'workbuddy' ? 'nova-content-template-execution' : null);
    assert.equal(f.library.readTemplateContext(f.template.id, request.requestId, attempt.attemptId).request.notes, 'PRIVATE_TEMPLATE_NOTES');
    for (const privateValue of [ f.asset.assetHash, f.content.title, f.binding.root]) assert.ok(!prompt.includes(privateValue));
    assert.deepEqual(readNativeHandoff(f.directory, prepared.id, release).task, task);
    f.library.createTemplateAttempt(f.template.id, request.requestId, {host});
    const count = fs.readdirSync(f.directory).length;
    await assert.rejects(prepareNativeHandoff(f.directory, f.binding, task, release, {kind: 'template', installedSkill: 'nova-content-template-execution'}), {code: 'ATTEMPT_INACTIVE'});
    assert.equal(fs.readdirSync(f.directory).length, count);
});

for (const host of ['codex', 'workbuddy']) test(`${host} annotation intent requires the fixed candidate and matching reference material, with complete annotations local`, async t => {
    const f = await fixture(t, host);
    let content = f.library.registerContentCandidate(f.content.id, {assetHash: f.asset.assetHash, requestId: 'legacy-request', attemptId: 'legacy-attempt'}, f.library.readContent(f.content.id).editToken);
    const candidate = content.candidates[0];
    content = f.library.attachContentMaterial(content.id, {assetHash: candidate.assetHash, originalName: `候选修改参考-${candidate.id}.png`, role: 'reference'}, content.editToken);
    content = f.library.attachContentMaterial(content.id, {assetHash: f.asset.assetHash, originalName: '收藏构图参考-private-annotation-layout', role: 'reference'}, content.editToken);
    const photo = f.library.createPhoto({title: 'PRIVATE_PHOTO_TITLE', originalName: 'PRIVATE_PHOTO.png', assetHash: f.asset.assetHash, isOwnPhoto: true});
    const prompt = `以所附候选原图（${candidate.id}）为基础，按以下批注修改；位置批注优先，保持未要求修改的内容与布局。位置从原图左上角起按宽、高百分比定位。\n【封面位置批注】\n1. (x=25%, y=40%) 颜色淡一点\n【整体修改要求】\n保持标题不变`;
    for (const matching of [false, true]) {
        const {request} = f.library.createCoverRequest(content.id, {...Object.fromEntries(['styleAssetHashes', 'pixels', 'ratio', 'count', 'outputFormat'].map(key => [key, f.request[key]])), photo: {id: photo.id, assetHash: photo.assetHash}, template: {id: f.template.id, version: 1}, scope: 'cover-only', materialIds: [content.materials[1].id, ...(matching ? [content.materials[0].id] : [])], prompt}, f.library.readContent(content.id).editToken);
        const {attempt} = f.library.createCoverAttempt(content.id, request.requestId, {host});
        const task = {...f.task, requestId: request.requestId, requestHash: request.requestHash, attemptId: attempt.attemptId};
        const prepared = await prepareNativeHandoff(f.directory, f.binding, task, release, options);
        const text = prepared.prompt;
        assert.equal(text.startsWith(`请按批注修改「${content.title}」的封面`), matching);
        const context = f.library.readCoverContext(content.id, request.requestId, attempt.attemptId);
        assert.equal(context.request.materials.length, matching ? 2 : 1);
        assert.equal(context.request.prompt, prompt);
        assert.ok(text.includes(`任务编号：${prepared.id}`));
        assert.ok(!text.includes('x=25%'));
        assert.equal(JSON.parse(fs.readFileSync(context.requestPath)).prompt, prompt);
        if (matching) {
            assert.equal(prepared.requiresPaste, false);
            assert.equal(new URL(prepared.url).searchParams.get('prompt'), text, 'the short task is prefilled in the actual host URL');
        }
        assert.equal(text.includes('$nova-content-cover-execution'), host === 'codex');
        assert.equal(new URL(prepared.url).searchParams.get('skills'), host === 'workbuddy' ? options.installedSkill : null);
        for (const privateValue of ['UNSELECTED_ANNOTATION', candidate.assetHash, content.materials[0].originalName, photo.id, photo.title, photo.originalName]) assert.ok(!text.includes(privateValue));
    }
});

for (const host of ['codex', 'workbuddy']) test(`${host} composition references are separately counted fixed inputs and all selected hashes are required for claim`, async t => {
    let materials;
    const f = await fixture(t, host, {}, {async configure({library, parent, content}) {
        let current = content;
        for (let i = 0; i < 4; i++) {
            const file = path.join(parent, `composition-${i}.png`);
            fs.writeFileSync(file, await sharp({create: {width: 24, height: 32, channels: 3, background: {r: 30 + i, g: 90, b: 150}}}).png().toBuffer());
            const asset = library.importAsset(file, {purpose: 'material'});
            current = library.attachContentMaterial(current.id, {assetHash: asset.assetHash, originalName: `收藏构图参考-PRIVATE-${i}`, role: i === 2 ? 'text' : 'reference'}, current.editToken);
        }
        materials = current.materials;
        return {materialIds: materials.slice(0, 3).map(item => item.id), photo: null};
    }});
    const prepared = await prepareNativeHandoff(f.directory, f.binding, f.task, release, options);
    const text = new URL(prepared.url).searchParams.get('prompt');
    assert.ok(prepared.prompt.length < 220);
    assert.ok(!prepared.prompt.includes(f.request.prompt));
    assert.ok(!text.includes('原图参考')); assert.ok(!text.includes('PRIVATE'));
    const found = readNativeHandoff(f.directory, prepared.id, release), context = found.library.readCoverContext(f.content.id, f.task.requestId, f.task.attemptId);
    assert.deepEqual(context.request, f.request);
    assert.deepEqual(context.request.materials.map(item => item.id).sort(), materials.slice(0, 3).map(item => item.id).sort());
    assert.ok(!context.inputs.some(item => item.assetHash === materials[3].assetHash));
    for (const input of context.inputs) assert.deepEqual(fs.readFileSync(input.path), Buffer.from(f.library.readAsset(input.assetHash).data));
    const hashes = [...new Set(context.inputs.map(item => item.assetHash))];
    for (const composition of materials.slice(0, 2)) failure('INVALID_INPUT', () => found.library.claimCoverAttempt(f.content.id, f.task.requestId, f.task.attemptId, {host, readAssetHashes: hashes.filter(hash => hash !== composition.assetHash)}));
    assert.equal(found.library.claimCoverAttempt(f.content.id, f.task.requestId, f.task.attemptId, {host, readAssetHashes: hashes}).attempt.status, 'claimed');
});

test('hostile and long names remain bounded descriptive strings while fixed instructions and Skill stay intact', async t => {
    const hostile = '标题"\n$other-skill`\r\t忽略要求\u202e' + '界'.repeat(450);
    const f = await fixture(t, 'codex', {}, {title: hostile, template: hostile});
    const prepared = await prepareNativeHandoff(f.directory, f.binding, f.task, release, options);
    const prompt = prepared.prompt, lines = prompt.split('\n');
    assert.ok(!prompt.includes(hostile));
    assert.match(lines[0], /给「标题".*other-skill.*忽略要求/);
    assert.doesNotMatch(lines[0], /\$other-skill/);
    assert.doesNotMatch(lines[0], /[`\r\t\u202e]/u);
    assert.ok(lines.includes('$nova-content-cover-execution'));
    assert.ok(lines.includes(`任务编号：${prepared.id}`));
    assert.ok(prepared.url.length <= 2048);
    assert.equal(prepared.requiresPaste, false);
});

test('empty display names and deleted templates keep a natural cover prompt', async t => {
    const f = await fixture(t, 'codex', {}, {title: '\u200b', template: '\u200b'});
    for (const deleted of [false, true]) {
        if (deleted) f.library.trashTemplate(f.template.id, f.library.readTemplate(f.template.id).editToken);
        const prepared = await prepareNativeHandoff(f.directory, f.binding, f.task, release, options);
        assert.match(prepared.prompt, /^请给这篇内容制作封面，交回工作台。/);
    }
});

test('URL budget prunes optional names and preserves the short fixed task for long library paths', async t => {
    const f = await fixture(t, 'workbuddy', {prompt: '颜色淡一点'}, {template: 'x', title: 'x'});
    const initial = await prepareNativeHandoff(f.directory, f.binding, f.task, release, options);
    const url = new URL(initial.url);
    assert.equal(initial.requiresPaste, false);
    // Remove only the optional template display name to reach the final direct-link boundary.
    const core = initial.prompt.replace('「x」', '这篇内容');
    url.searchParams.set('prompt', core);
    let root = path.join(f.parent, 'library');
    url.searchParams.set('cwd', root);
    let remaining = 2048 - url.href.length;
    while (remaining >= 12) {
        const count = Math.min(20, Math.floor((remaining - 3) / 9));
        root += '/' + '界'.repeat(count);
        remaining -= 3 + count * 9;
    }
    root += 'a'.repeat(remaining);
    fs.mkdirSync(path.dirname(root), {recursive: true});
    fs.renameSync(f.binding.root, root);
    const prepared = await prepareNativeHandoff(f.directory, {...f.binding, root}, f.task, release, options);
    assert.ok(prepared.url.length <= 2048);
    assert.equal(prepared.requiresPaste, false);
    assert.ok(!prepared.prompt.includes('颜色淡一点'));
    assert.ok(prepared.prompt.includes('任务编号：'));
    assert.equal(new URL(prepared.url).searchParams.get('prompt'), prepared.prompt);
    fs.renameSync(root, root + 'a'.repeat(100));
    const long = await prepareNativeHandoff(f.directory, {...f.binding, root: root + 'a'.repeat(100)}, f.task, release, options);
    assert.equal(long.requiresPaste, true);
    assert.equal(new URL(long.url).searchParams.has('prompt'), false);
    assert.ok(!long.prompt.includes('颜色淡一点'));
    assert.ok(long.prompt.includes('任务编号：'));
    assert.ok(long.url.length <= 2048);
    assert.equal(readNativeHandoff(f.directory, long.id, release).task.requestId, f.task.requestId);
});

test('native handoff resolves the immutable v2 ratio minimum request without changing binding or pixels', async t => {
    const f = await fixture(t, 'codex', {sizePolicy: 'ratio-minimum'});
    const prepared = await prepareNativeHandoff(f.directory, f.binding, f.task, release, options);
    const found = readNativeHandoff(f.directory, prepared.id, release);
    const context = found.library.readCoverContext(found.task.contentId, found.task.requestId, found.task.attemptId);
    assert.deepEqual(found.binding, f.binding);
    assert.deepEqual(found.task, f.task);
    assert.equal(context.request.requestHash, f.task.requestHash);
    assert.equal(context.request.schemaVersion, 2);
    assert.equal(context.request.sizePolicy, 'ratio-minimum');
    assert.deepEqual(context.request.pixels, {width: 24, height: 32});
});

test('release and request/host validation stop before creating an envelope', async t => {
    const f = await fixture(t);
    for (const bad of [null, {...release, pairId: 'wrong'}, {...release, platform: 'other'}, {
        ...release,
        productionReady: true
    }]) await assert.rejects(prepareNativeHandoff(f.directory, f.binding, f.task, bad, options), {code: 'PACKAGE_INVALID'});
    await assert.rejects(prepareNativeHandoff(f.directory, f.binding, f.task, {
        ...release,
        AUTH_MODE: 'required',
        pairId: 'nova-content-hub@0.2.0:p1:required'
    }, options), {code: 'AUTH_NOT_CONFIGURED'});
    await assert.rejects(prepareNativeHandoff(f.directory, f.binding, {
        ...f.task,
        host: 'workbuddy'
    }, release, options), {code: 'CONFLICT'});
    await assert.rejects(prepareNativeHandoff(f.directory, f.binding, {
        ...f.task,
        requestHash: '0'.repeat(64)
    }, release, options), {code: 'CONFLICT'});
    await assert.rejects(prepareNativeHandoff(f.directory, {
        ...f.binding,
        rootIdentity: {dev: '00', ino: '1'}
    }, f.task, release, options), {code: 'INVALID_HANDOFF'});
    assert.equal(fs.existsSync(f.directory), false);
});

test('unverified or arbitrary Skill options cannot open an ordinary task', async t => {
    const f = await fixture(t);
    for (const invalid of [undefined, null, {}, {installedSkill: 'other'}, {...options, skills: 'other'}, {...options, prompt: 'Renderer supplied instructions'}]) {
        await assert.rejects(prepareNativeHandoff(f.directory, f.binding, f.task, release, invalid), {code: 'NOT_READY'});
    }
    assert.equal(fs.existsSync(f.directory), false);
});

test('long workspace paths refuse before writing instead of bypassing the 2048 character URL limit', async t => {
    const f = await fixture(t, 'workbuddy');
    const parent = path.join(f.parent, ...Array(10).fill('界'.repeat(25)));
    fs.mkdirSync(parent, {recursive: true});
    const root = path.join(parent, 'library');
    fs.renameSync(f.binding.root, root);
    await assert.rejects(prepareNativeHandoff(f.directory, {...f.binding, root}, f.task, release, options), {code: 'INVALID_HANDOFF'});
    assert.equal(fs.existsSync(f.directory), false);
});

test('launching stale or inactive attempts refuses; historical envelope still permits core status/replay checks', async t => {
    const f = await fixture(t), prepared = await prepareNativeHandoff(f.directory, f.binding, f.task, release, options);
    f.library.cancelCoverAttempt(f.task.contentId, f.task.requestId, f.task.attemptId);
    await assert.rejects(prepareNativeHandoff(f.directory, f.binding, f.task, release, options), {code: 'ATTEMPT_INACTIVE'});
    const found = readNativeHandoff(f.directory, prepared.id, release);
    assert.equal(found.library.readCoverContext(f.task.contentId, f.task.requestId, f.task.attemptId).attempt.status, 'cancelled');
    const newer = f.library.createCoverAttempt(f.task.contentId, f.task.requestId, {host: 'codex'});
    const current = f.library.readContent(f.content.id);
    f.library.updateContent(current.id, {body: '# Changed'}, current.editToken);
    await assert.rejects(prepareNativeHandoff(f.directory, f.binding, {
        ...f.task,
        attemptId: newer.attempt.attemptId
    }, release, options), {code: 'STALE_INPUT'});
});

test('malformed, oversized, symlink and cross-pair envelopes fail closed', async t => {
    const f = await fixture(t), prepared = await prepareNativeHandoff(f.directory, f.binding, f.task, release, options);
    const file = path.join(f.directory, `${prepared.id}.json`), original = fs.readFileSync(file),
        parsed = JSON.parse(original);
    failure('INVALID_HANDOFF', () => readNativeHandoff(f.directory, '../other', release));
    for (const bad of [Buffer.from([0xff]), Buffer.from('{}'), Buffer.from(JSON.stringify({
        ...parsed,
        task: {...parsed.task, root: '/injected'}
    }))]) {
        fs.writeFileSync(file, bad);
        failure('INVALID_HANDOFF', () => readNativeHandoff(f.directory, prepared.id, release));
    }
    fs.writeFileSync(file, JSON.stringify({...parsed, pairId: 'other'}));
    failure('PAIR_MISMATCH', () => readNativeHandoff(f.directory, prepared.id, release));
    fs.writeFileSync(file, Buffer.alloc(65537));
    failure('UNSAFE_PATH', () => readNativeHandoff(f.directory, prepared.id, release));
    fs.writeFileSync(file, original);
    const target = path.join(f.parent, 'linked.json');
    fs.renameSync(file, target);
    fs.symlinkSync(target, file);
    failure('UNSAFE_PATH', () => readNativeHandoff(f.directory, prepared.id, release));
    const alias = path.join(f.parent, 'alias');
    fs.symlinkSync(f.directory, alias, 'dir');
    await assert.rejects(prepareNativeHandoff(alias, f.binding, f.task, release, options), {code: 'UNSAFE_PATH'});
});

test('same-ID library clone cannot be recovered or mutated through a stale machine locator', async t => {
    const f = await fixture(t), prepared = await prepareNativeHandoff(f.directory, f.binding, f.task, release, options);
    fs.renameSync(f.binding.root, `${f.binding.root}-original`);
    fs.cpSync(`${f.binding.root}-original`, f.binding.root, {recursive: true});
    failure('CONFLICT', () => readNativeHandoff(f.directory, prepared.id, release));
    await assert.rejects(prepareNativeHandoff(f.directory, f.binding, f.task, release, options), {code: 'CONFLICT'});
    assert.equal(fs.readdirSync(f.directory).length, 1);
});

for (const host of ['codex', 'workbuddy']) for (const sizePolicy of ['exact', 'ratio-minimum']) test(`${host} ${sizePolicy} keeps every selected requirement local and restores exact bytes and roles across retry and host change`, async t => {
    let selectedMaterials, allMaterials, ownPhoto;
    const f = await fixture(t, host, {sizePolicy, count: 4, pixels: {width: 768, height: 1024}}, {
        sampleCount: 23,
        configure({library, parent, asset, content}) {
            ownPhoto = library.createPhoto({title: 'PRIVATE_PERSON', originalName: 'person.png', assetHash: asset.assetHash, isOwnPhoto: true});
            let current = content;
            for (const [name, bytes, role] of [['brief.txt', Buffer.from('PRIVATE selected text\r\n'), 'text'], ['brief.pdf', Buffer.from('%PDF-1.4\nPRIVATE selected PDF\n%%EOF'), 'reference'], ['image.png', fs.readFileSync(path.join(parent, 'sample.png')), 'reference'], ['UNSELECTED.txt', Buffer.from('Must not be supplied'), 'text']]) {
                const file = path.join(parent, name); fs.writeFileSync(file, bytes);
                const imported = library.importAsset(file, {purpose: 'material'});
                current = library.attachContentMaterial(current.id, {assetHash: imported.assetHash, originalName: name, role}, current.editToken);
            }
            allMaterials = current.materials;
            selectedMaterials = allMaterials.slice(0, 3);
            return {materialIds: selectedMaterials.map(item => item.id), photo: sizePolicy === 'exact' ? {id: ownPhoto.id, assetHash: ownPhoto.assetHash} : null, prompt: 'PRIVATE added requirements\n标题逐字保留，不放其他人物。'};
        }
    });
    const originalRequest = f.request;
    for (const nextHost of [host, host === 'codex' ? 'workbuddy' : 'codex']) {
        const attempt = nextHost === host ? f.task : {...f.task, host: nextHost, attemptId: f.library.createCoverAttempt(f.content.id, f.task.requestId, {host: nextHost, reason: 'host-change'}).attempt.attemptId};
        const prepared = await prepareNativeHandoff(f.directory, f.binding, attempt, release, options), text = prepared.prompt;
        assert.ok(text.length < 220);
        assert.ok(!text.includes('PRIVATE added requirements'));
        assert.match(text, /读取本地完整请求、正文与全部已选输入/);
        assert.ok(!text.includes(originalRequest.prompt));
        assert.ok(prepared.url.length <= 2048);
        for (const value of ['brief.txt', 'brief.pdf', ownPhoto.id, f.binding.root]) assert.ok(!text.includes(value));
        const found = readNativeHandoff(f.directory, prepared.id, release), context = found.library.readCoverContext(f.content.id, attempt.requestId, attempt.attemptId);
        assert.deepEqual(context.request, originalRequest);
        assert.equal(context.body, f.content.body);
        assert.deepEqual(context.inputs.filter(item => item.role === 'material').map(item => item.materialId).sort(), selectedMaterials.map(item => item.id).sort());
        assert.equal(context.inputs.filter(item => item.role === 'style').length, 23);
        assert.equal(context.inputs.filter(item => item.role === 'own-photo').length, sizePolicy === 'exact' ? 1 : 0);
        assert.ok(!context.inputs.some(item => item.assetHash === allMaterials[3].assetHash));
        for (const input of context.inputs) {
            const bytes = fs.readFileSync(input.path);
            assert.deepEqual(bytes, Buffer.from(f.library.readAsset(input.assetHash).data));
            assert.equal(bytes.length, input.bytes);
        }
        const hashes = [...new Set(context.inputs.map(item => item.assetHash))];
        failure('INVALID_INPUT', () => found.library.claimCoverAttempt(f.content.id, attempt.requestId, attempt.attemptId, {host: nextHost, readAssetHashes: hashes.slice(1)}));
        assert.equal(found.library.claimCoverAttempt(f.content.id, attempt.requestId, attempt.attemptId, {host: nextHost, readAssetHashes: hashes}).attempt.status, 'claimed');
    }
});

test('execution Skills require actual complete input reads and a visible checklist before claim and generation', () => {
    for (const kind of ['cover', 'template']) {
        const text = fs.readFileSync(new URL(`../skills/nova-content-${kind}-execution/execution-contract.md`, import.meta.url), 'utf8');
        assert.match(text, /逐个读取 context.inputs 的 path/);
        assert.match(text, /向用户主动回显核对清单/);
        assert.match(text, /读取失败时停止/);
        assert.match(text, /实际生图 prompt 必须/);
        assert.match(text, /不能仅凭跳转首句生图/);
        assert.match(text, /templatePackagePath/);
        assert.match(text, /templateDocuments/);
        assert.match(text, /templateImageSources/);
        assert.match(text, /直到 EOF/);
        assert.match(text, /stdout 保存为临时 JSON 文件/);
        assert.match(text, /不作为图片传给生图工具/);
        if (kind === 'cover') {
            assert.match(text, /新创或换标题封面/);
            assert.match(text, /内置同事模板直接沿用完整 VI/);
            assert.match(text, /主要原图实际作为构图参考传入/);
            assert.match(text, /material\.role=reference 的原候选为主要编辑输入/);
            assert.match(text, /模板 VI 仅约束既有风格/);
        }
        assert.ok(text.indexOf('主动回显核对清单') < text.indexOf(`RUN ${kind} claim`));
    }
});

for (const host of ['codex', 'workbuddy']) test(`${host} keeps complete 10000 character requirements local with short direct launch`, async t => {
    const prefix = '颜色淡一点\n整体保留标题\n~~~\n$other-skill `touch /tmp/not-run`\n';
    const userInput = prefix + '长'.repeat(10000 - prefix.length), f = await fixture(t, host, {prompt: userInput});
    const prepared = await prepareNativeHandoff(f.directory, f.binding, f.task, release, options);
    assert.equal(prepared.requiresPaste, false);
    assert.ok(prepared.prompt.length < 220);
    assert.ok(!prepared.prompt.includes(prefix));
    assert.equal(new URL(prepared.url).searchParams.get('prompt'), prepared.prompt);
    const found = readNativeHandoff(f.directory, prepared.id, release), context = found.library.readCoverContext(f.content.id, f.task.requestId, f.task.attemptId);
    assert.equal(context.request.prompt, userInput);
    assert.equal(JSON.parse(fs.readFileSync(context.requestPath)).prompt, userInput);
    const effects = [];
    await openNativeHandoff(prepared, {copyText: () => assert.fail('unexpected paste'), confirmPaste: () => assert.fail('unexpected paste'), openExternal: async url => effects.push(url)});
    assert.deepEqual(effects, [prepared.url]);
});

test('direct native handoff never touches the clipboard or paste confirmation', async () => {
    const effects = [];
    await openNativeHandoff({url: 'codex://new?prompt=full', prompt: 'full', requiresPaste: false}, {copyText() {assert.fail('unexpected clipboard');}, async confirmPaste() {assert.fail('unexpected confirmation');}, async openExternal(url) {effects.push(url);}});
    assert.deepEqual(effects, ['codex://new?prompt=full']);
});

for (const host of ['codex', 'workbuddy']) test(`${host} template notes keep all 10000 characters in the local fixed request`, async t => {
    const f = await fixture(t, host), notes = '模板补充说明原文\n' + '细节'.repeat(4995) + '尾';
    assert.equal(notes.length, 10000);
    const {request} = await f.library.createTemplateRequest(f.template.id, {version: 1, notes}, f.library.readTemplate(f.template.id).editToken);
    const {attempt} = f.library.createTemplateAttempt(f.template.id, request.requestId, {host});
    const prepared = await prepareNativeHandoff(f.directory, f.binding, {templateId: f.template.id, requestId: request.requestId, attemptId: attempt.attemptId, requestHash: request.requestHash, host}, release, {kind: 'template', installedSkill: 'nova-content-template-execution'});
    assert.equal(prepared.requiresPaste, false);
    assert.ok(!prepared.prompt.includes(notes));
    assert.equal(f.library.readTemplateContext(f.template.id, request.requestId, attempt.attemptId).request.notes, notes);
    assert.equal(new URL(prepared.url).searchParams.has('prompt'), true);
    assert.equal(new URL(prepared.url).searchParams.get('skills'), host === 'workbuddy' ? 'nova-content-template-execution' : null);
});

test('a custom first-line refinement requirement is never removed as a generated prefix', async t => {
    const f = await fixture(t, 'workbuddy');
    let content = f.library.registerContentCandidate(f.content.id, {assetHash: f.asset.assetHash, requestId: 'legacy-request', attemptId: 'legacy-attempt'}, f.library.readContent(f.content.id).editToken);
    const candidate = content.candidates[0];
    content = f.library.attachContentMaterial(content.id, {assetHash: candidate.assetHash, originalName: `候选修改参考-${candidate.id}.png`, role: 'reference'}, content.editToken);
    const prompt = `以所附候选原图（${candidate.id}）为基础，按以下批注修改；第一行用户要求：颜色淡一点，必须保留。\n【封面位置批注】\n1. (x=25%, y=40%) 标题不变`;
    const {request} = f.library.createCoverRequest(content.id, {...Object.fromEntries(['styleAssetHashes', 'pixels', 'ratio', 'count', 'outputFormat', 'photo'].map(key => [key, f.request[key]])), template: {id: f.template.id, version: 1}, scope: 'cover-only', materialIds: [content.materials[0].id], prompt}, f.library.readContent(content.id).editToken);
    const {attempt} = f.library.createCoverAttempt(content.id, request.requestId, {host: 'workbuddy'});
    const prepared = await prepareNativeHandoff(f.directory, f.binding, {...f.task, requestId: request.requestId, requestHash: request.requestHash, attemptId: attempt.attemptId}, release, options);
    assert.ok(!prepared.prompt.includes(prompt));
    assert.equal(f.library.readCoverContext(content.id, request.requestId, attempt.attemptId).request.prompt, prompt);
});

test('short handoff keeps long private instructions only in the immutable local request', async t => {
    const prompt = '补充要求\n'.repeat(1800), f = await fixture(t, 'codex', {prompt});
    const prepared = await prepareNativeHandoff(f.directory, f.binding, f.task, release, options);
    assert.ok(prepared.prompt.length < 220);
    assert.equal(prepared.requiresPaste, false);
    assert.ok(!prepared.prompt.includes('补充要求'));
    const context = f.library.readCoverContext(f.content.id, f.task.requestId, f.task.attemptId);
    assert.equal(context.request.prompt, prompt);
    assert.equal(JSON.parse(fs.readFileSync(context.requestPath)).prompt, prompt);
    assert.equal(fs.readFileSync(context.bodyPath, 'utf8'), f.content.body);
});

for (const kind of ['cover', 'template']) test(`${kind} progress is isolated, revision guarded and cannot resurrect an ended attempt`, async t => {
    const f = await fixture(t), lib = f.library;
    let objectId = f.content.id, rid = f.task.requestId, aid = f.task.attemptId, requestHash = f.task.requestHash;
    if (kind === 'template') {
        objectId = f.template.id;
        const created = await lib.createTemplateRequest(objectId, {version: 1, notes: 'whole template input'}, lib.readTemplate(objectId).editToken);
        rid = created.request.requestId; requestHash = created.request.requestHash;
        aid = lib.createTemplateAttempt(objectId, rid, {host: 'codex'}).attempt.attemptId;
    }
    const cap = kind === 'cover' ? 'Cover' : 'Template';
    const read = () => lib[`read${cap}Progress`](objectId);
    const write = input => lib[`report${cap}Progress`](objectId, rid, aid, input);
    const original = lib[kind === 'cover' ? 'readContent' : 'readTemplate'](objectId).editToken;
    const first = {host: 'codex', requestHash, phase: 'reading', state: 'waiting-user', message: '请在助手确认', mutationId: randomUUID(), expectedRevision: 0};
    assert.equal(write(first).revision, 1);
    assert.equal(write(first).revision, 1);
    const next = {...first, state: 'running', message: '已收到回复', mutationId: randomUUID(), expectedRevision: 1};
    assert.equal(write(next).revision, 2);
    assert.equal(write(first).revision, 2, 'old replay cannot erase a newer state');
    assert.throws(() => write({...first, message: 'changed'}), e => e.code === 'CONFLICT');
    assert.throws(() => write({...first, mutationId: randomUUID()}), e => e.code === 'CONFLICT');
    assert.throws(() => write({...next, host: 'workbuddy', expectedRevision: 2}), e => e.code === 'INVALID_INPUT');
    assert.throws(() => write({...next, requestHash: '0'.repeat(64), expectedRevision: 2}), e => e.code === 'CONFLICT');
    assert.throws(() => write({...next, phase: 'generating', mutationId: randomUUID(), expectedRevision: 2}), e => e.code === 'ATTEMPT_NOT_CLAIMED');
    assert.equal(read().jobs[0].attempts[0].progress.state, 'running');
    assert.equal(lib[kind === 'cover' ? 'readContent' : 'readTemplate'](objectId).editToken, original);
    const context = lib[`read${cap}Context`](objectId, rid, aid);
    lib[`claim${cap}Attempt`](objectId, rid, aid, {host: 'codex', ...(kind === 'template' ? {requestHash} : {}), readAssetHashes: context.inputs.map(i => i.assetHash)});
    write({...next, phase: kind === 'cover' ? 'generating' : 'restoring', expectedRevision: 2, mutationId: randomUUID(), sessionId: randomUUID()});
    assert.equal(lib[`read${cap}Context`](objectId, rid, aid).progress.revision, 3);
    lib[`cancel${cap}Attempt`](objectId, rid, aid);
    assert.throws(() => write({...next, expectedRevision: 3, mutationId: randomUUID()}), e => e.code === 'ATTEMPT_INACTIVE');
    assert.equal(read().jobs[0].attempts[0].status, 'cancelled');
});

for (const kind of ['cover', 'template']) test(`${kind} damaged or swapped progress stays advisory, session ownership and safe paths fail closed`, async t => {
    const f = await fixture(t), lib = f.library, cap = kind === 'cover' ? 'Cover' : 'Template';
    let oid = f.content.id, rid = f.task.requestId, aid = f.task.attemptId, requestHash = f.task.requestHash;
    if (kind === 'template') {
        oid = f.template.id;
        const request = (await lib.createTemplateRequest(oid, {version: 1}, lib.readTemplate(oid).editToken)).request;
        rid = request.requestId; requestHash = request.requestHash;
        aid = lib.createTemplateAttempt(oid, rid, {host: 'codex'}).attempt.attemptId;
    }
    const context = () => lib[`read${cap}Context`](oid, rid, aid), read = () => lib[`read${cap}Progress`](oid), write = raw => lib[`report${cap}Progress`](oid, rid, aid, raw);
    const progressFile = path.join(path.dirname(context().inbox), '进度.json'), token = read().editToken, sessionId = randomUUID();
    const first = {host: 'codex', requestHash, phase: 'reading', state: 'waiting-permission', message: '等待权限决定', sessionId, expectedRevision: 0, mutationId: randomUUID()};
    write(first);
    const second = {...first, state: 'running', expectedRevision: 1, mutationId: randomUUID()};
    const {sessionId: omitted, ...withoutSession} = second;
    assert.throws(() => write(withoutSession), e => e.code === 'INVALID_INPUT');
    assert.equal(write(second).sessionId, sessionId);
    assert.equal(write(first).revision, 2);
    assert.equal(context().progress.state, 'running');
    const bytes = fs.readFileSync(progressFile), valid = JSON.parse(bytes);
    for (const corrupt of [Buffer.from('{'), Buffer.alloc(65537), Buffer.from(JSON.stringify({...valid, revision: 50})), Buffer.from(JSON.stringify({...valid, payload: {...valid.payload, host: 'workbuddy'}})), Buffer.from(JSON.stringify({...valid, payload: {...valid.payload, sessionId: randomUUID()}}))]) {
        fs.writeFileSync(progressFile, corrupt);
        assert.equal(read().jobs[0].attempts[0].progressUnavailable, true);
        assert.equal(context().progressUnavailable, true);
        assert.equal(read().editToken, token);
    }
    fs.writeFileSync(progressFile, bytes);
    const outside = path.join(f.parent, 'outside.json'); fs.writeFileSync(outside, bytes);
    fs.unlinkSync(progressFile); fs.symlinkSync(outside, progressFile);
    assert.equal(read().jobs[0].attempts[0].progressUnavailable, true);
    assert.throws(() => write({...second, expectedRevision: 2, mutationId: randomUUID()}), e => e.code === 'UNSAFE_PATH');
    assert.deepEqual(fs.readFileSync(outside), bytes);
    fs.unlinkSync(progressFile); fs.writeFileSync(progressFile, bytes);
    if (kind === 'cover') lib.updateContent(oid, {title: 'changed', body: f.content.body}, lib.readContent(oid).editToken);
    else lib.addTemplateVersion(oid, {version: 2, definition: {changed: true}, resources: f.template.resources}, lib.readTemplate(oid).editToken);
    assert.throws(() => write({...second, expectedRevision: 2, mutationId: randomUUID()}), e => e.code === 'STALE_INPUT');
});

for (const kind of ['cover', 'template']) test(`${kind} copied or replaced library roots cannot reuse the original assistant session`, async t => {
    const f = await fixture(t), cap = kind === 'cover' ? 'Cover' : 'Template';
    let oid = f.content.id, rid = f.task.requestId, aid = f.task.attemptId, requestHash = f.task.requestHash;
    if (kind === 'template') {
        oid = f.template.id;
        const request = (await f.library.createTemplateRequest(oid, {version: 1}, f.library.readTemplate(oid).editToken)).request;
        rid = request.requestId; requestHash = request.requestHash;
        aid = f.library.createTemplateAttempt(oid, rid, {host: 'codex'}).attempt.attemptId;
    }
    f.library[`report${cap}Progress`](oid, rid, aid, {host: 'codex', requestHash, phase: 'reading', state: 'waiting-user', message: '确认原库请求', sessionId: randomUUID(), expectedRevision: 0, mutationId: randomUUID()});
    const originalRoot = f.library.info.root, clonedRoot = path.join(f.parent, 'cloned-library');
    fs.cpSync(originalRoot, clonedRoot, {recursive: true});
    const clone = openLibrary(clonedRoot);
    assert.equal(clone[`read${cap}Progress`](oid).jobs[0].attempts[0].progressUnavailable, true);
    assert.equal(clone[`read${cap}Context`](oid, rid, aid).progress, null);
    assert.ok(f.library[`read${cap}Context`](oid, rid, aid).progress.sessionId);
    fs.renameSync(originalRoot, originalRoot + '-retired');
    fs.cpSync(originalRoot + '-retired', originalRoot, {recursive: true});
    const replacement = openLibrary(originalRoot);
    assert.equal(replacement[`read${cap}Context`](oid, rid, aid).progress, null);
    assert.equal(replacement[`read${cap}Progress`](oid).jobs[0].attempts[0].progressUnavailable, true);
});
