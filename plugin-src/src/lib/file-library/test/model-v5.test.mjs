import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {spawn, spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import sharp from 'sharp';
import {
    createLibrary,
    openLibrary,
    upgradeLibrary,
    inspectLibraryUpgrade,
    backupLibrary,
    verifyBackup,
    restoreBackup,
    __testing
} from '../index.mjs';

process.env.NODE_ENV = 'test';
const reject = (code, fn) => assert.throws(fn, e => e.code === code),
    moduleURL = new URL('../index.mjs', import.meta.url).href;
const date = {precision: 'date', date: '2026-10-18'},
    wall = {precision: 'local-minute', date: '2026-10-18', time: '19:00', timezone: null},
    instant = {precision: 'instant', at: '2026-10-18T11:00:00.000Z', timezone: 'Asia/Shanghai'};

function fixture(t) {
    const parent = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'nova-v5-')),
        root = path.join(parent, 'library');
    t.after(() => {
        __testing.setHook(undefined);
        fs.rmSync(parent, {recursive: true, force: true});
    });
    return {parent, root, lib: createLibrary(root)};
}

async function image(f, color = 'red') {
    const filename = path.join(f.parent, `${color}.png`);
    fs.writeFileSync(filename, await sharp({
        create: {
            width: 8,
            height: 8,
            channels: 3,
            background: color
        }
    }).png().toBuffer());
    return f.lib.importAsset(filename, {purpose: 'generated-cover'});
}

function oldImplementation(f) {
    const base = path.join(f.parent, 'old');
    fs.mkdirSync(base);
    for (const dir of ['file-library', 'image-validation']) fs.mkdirSync(path.join(base, dir));
    for (const file of ['file-library/index.mjs', 'file-library/cover-jobs.mjs', 'file-library/backup.mjs', 'image-validation/index.mjs']) {
        const r = spawnSync('git', ['show', `df55c5f:${file}`], {
            cwd: new URL('../..', import.meta.url),
            encoding: 'utf8'
        });
        assert.equal(r.status, 0, r.stderr);
        fs.writeFileSync(path.join(base, file), r.stdout);
    }
    return pathToFileURL(path.join(base, 'file-library/index.mjs')).href;
}

function downgrade(f) {
    const file = path.join(f.root, '内容库.json'), info = JSON.parse(fs.readFileSync(file)),
        raw = Buffer.from(JSON.stringify({...info, schemaVersion: 4, note: 'preserve raw descriptor'}) + '\n');
    fs.writeFileSync(file, raw);
    for (const dir of ['库配置', '合集']) fs.rmSync(path.join(f.root, dir), {recursive: true});
    return raw;
}

function upgradePins(f, raw) {
    const stat = fs.lstatSync(f.root, {bigint: true});
    return {
        expectedLibraryId: f.lib.info.libraryId,
        expectedRootIdentity: {dev: String(stat.dev), ino: String(stat.ino)},
        expectedDescriptorHash: createHash('sha256').update(raw).digest('hex')
    };
}

test('pinned upgrade rejects changed original descriptor and replaced clone before recovery or model creation', t => {
    const f = fixture(t), raw = downgrade(f), pins = upgradePins(f, raw), filename = path.join(f.root, '内容库.json');
    fs.appendFileSync(filename, ' ');
    reject('CONFLICT', () => upgradeLibrary(f.root, pins));
    assert.equal(fs.existsSync(path.join(f.root, '库配置')), false);
    assert.equal(fs.existsSync(path.join(f.root, '系统（别动）', '库锁')), false);
    fs.writeFileSync(filename, raw);
    const original = path.join(f.parent, 'original');
    fs.renameSync(f.root, original);
    fs.cpSync(original, f.root, {recursive: true});
    reject('CONFLICT', () => upgradeLibrary(f.root, pins));
    reject('CONFLICT', () => inspectLibraryUpgrade(f.root, pins));
    assert.equal(fs.existsSync(path.join(f.root, '库配置')), false);
    assert.equal(fs.existsSync(path.join(f.root, '系统（别动）', '库锁')), false);
});

for (const phase of ['upgrade5AfterBackup', 'upgrade5AfterBarrier', 'upgrade5AfterDirectories', 'upgrade5BeforeDescriptorPublish', 'upgrade5AfterDescriptorPublish', 'upgrade5AfterFinalMarker']) test(`pinned upgrade resumes ${phase} and query never mistakes descriptor publication for completion`, t => {
    const f = fixture(t), raw = downgrade(f), pins = upgradePins(f, raw);
    __testing.setHook(event => {if (event.phase === phase) throw new Error('interrupted');});
    reject('IO_ERROR', () => upgradeLibrary(f.root, pins));
    __testing.setHook(undefined);
    const marker = path.join(f.root, '系统（别动）', '事务', '升级到5', '完成.json'),
        before = fs.readFileSync(path.join(f.root, '内容库.json')),
        proof = inspectLibraryUpgrade(f.root, pins);
    assert.equal(proof.upgradeComplete, phase === 'upgrade5AfterFinalMarker');
    assert.equal(proof.upgradeRequired, !proof.upgradeComplete);
    assert.deepEqual(fs.readFileSync(path.join(f.root, '内容库.json')), before);
    assert.equal(fs.existsSync(path.join(f.root, '系统（别动）', '库锁')), false);
    if (phase === 'upgrade5AfterDescriptorPublish') {
        assert.equal(proof.schemaVersion, 5);
        assert.equal(fs.existsSync(marker), false);
    }
    assert.equal(upgradeLibrary(f.root, pins).info.schemaVersion, 5);
    assert.equal(inspectLibraryUpgrade(f.root, pins).upgradeComplete, true);
    assert.deepEqual(fs.readFileSync(path.join(f.root, '系统（别动）', '内容库.schema4.bak.json')), raw);
    const backup = path.join(f.root, '系统（别动）', '内容库.schema4.bak.json');
    fs.appendFileSync(backup, ' ');
    reject('CONFLICT', () => inspectLibraryUpgrade(f.root, pins));
    reject('CONFLICT', () => upgradeLibrary(f.root, pins));
});

test('pinned upgrade refuses unrelated schema 5 and closed options never open legacy schemas 1 to 3', t => {
    const f = fixture(t), raw = fs.readFileSync(path.join(f.root, '内容库.json')), pins = upgradePins(f, raw);
    assert.throws(() => upgradeLibrary(f.root, pins));
    reject('INVALID_INPUT', () => inspectLibraryUpgrade(f.root, {...pins, allowSchema4: true}));
    reject('INVALID_INPUT', () => upgradeLibrary(f.root, {expectedLibraryId: pins.expectedLibraryId}));
    const legacy = Buffer.from(JSON.stringify({...JSON.parse(raw), schemaVersion: 3}));
    fs.writeFileSync(path.join(f.root, '内容库.json'), legacy);
    reject('FORMAT_UNSUPPORTED', () => upgradeLibrary(f.root, upgradePins(f, legacy)));
    assert.equal(fs.existsSync(path.join(f.root, '系统（别动）', '库锁')), false);
});

test('pinned upgrade rechecks descriptor after lock and original-backup boundary before further publication', t => {
    const f = fixture(t), raw = downgrade(f), pins = upgradePins(f, raw), filename = path.join(f.root, '内容库.json');
    __testing.setHook(event => {
        if (event.phase === 'upgrade5AfterBackup') fs.appendFileSync(filename, ' ');
    });
    reject('CONFLICT', () => upgradeLibrary(f.root, pins));
    assert.equal(fs.existsSync(path.join(f.root, '库配置')), false);
    assert.equal(fs.existsSync(path.join(f.root, '系统（别动）', '事务', '升级到5')), false);
    assert.deepEqual(fs.readFileSync(path.join(f.root, '系统（别动）', '内容库.schema4.bak.json')), raw);
});

test('pinned upgrade refuses root replacement during lock acquisition before pending recovery', t => {
    const f = fixture(t), raw = downgrade(f), pins = upgradePins(f, raw), original = path.join(f.parent, 'original');
    fs.writeFileSync(path.join(f.root, '系统（别动）', '事务', '待恢复', 'manual-note'), 'preserve pending');
    __testing.setHook(event => {
        if (event.phase !== 'afterOwnerWrite') return;
        fs.renameSync(f.root, original);
        fs.cpSync(original, f.root, {recursive: true});
    });
    assert.throws(() => upgradeLibrary(f.root, pins), error => error.code === 'LOCK_UNCERTAIN' && error.initializationError?.code === 'CONFLICT');
    for (const root of [f.root, original]) {
        assert.equal(fs.existsSync(path.join(root, '库配置')), false);
        assert.equal(fs.existsSync(path.join(root, '系统（别动）', '内容库.schema4.bak.json')), false);
        assert.equal(fs.readFileSync(path.join(root, '系统（别动）', '事务', '待恢复', 'manual-note'), 'utf8'), 'preserve pending');
        assert.deepEqual(fs.readFileSync(path.join(root, '内容库.json')), raw);
        assert.equal(fs.readdirSync(path.join(root, '系统（别动）', '库锁')).length, 1);
    }
});

function oldRun(f, url, code) {
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', `import{openLibrary,backupLibrary}from ${JSON.stringify(url)};${code}`], {
        env: {
            ...process.env,
            TASK_ROOT: f.root,
            TASK_PARENT: f.parent
        }, encoding: 'utf8', timeout: 15000
    });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout;
}

test('portable settings, normalized ratios, channel identity, prompt disable and explicit invalid defaults', async t => {
    const f = fixture(t), a = await image(f);
    let s = f.lib.readLibrarySettings();
    assert.equal(s.channels.length, 5);
    assert.equal(s.defaults.coverCount, 4);
    s = f.lib.updateProfile({
        name: '作者',
        intro: '介绍',
        avatarAssetHash: a.assetHash,
        marks: [{key: '身份', value: '设计师'}]
    }, s.editToken);
    s = f.lib.addCustomRatio('6:8', s.editToken);
    s = f.lib.addCustomRatio('3:4', s.editToken);
    assert.deepEqual(s.customRatios, ['3:4']);
    s = f.lib.setPromptCategories(['空分类', '写作'], s.editToken);
    let p = f.lib.createPrompt({title: 'private', body: 'hello', category: '新分类'});
    p = f.lib.setPromptEnabled(p.id, false, p.editToken);
    assert.equal(p.enabled, false);
    assert.equal(p.deletedAt, null);
    assert.deepEqual(f.lib.readLibrarySettings().visiblePromptCategories, ['空分类', '写作', '新分类']);
    let photo = f.lib.createPhoto({title: '我', assetHash: a.assetHash, isOwnPhoto: true});
    s = f.lib.setGenerationDefaults({photoId: photo.id}, s.editToken);
    photo = f.lib.updatePhoto(photo.id, {isOwnPhoto: false}, photo.editToken);
    assert.equal(f.lib.readLibrarySettings().defaultIssues[0].reason, 'ownership-revoked');
    photo = f.lib.trashPhoto(photo.id, photo.editToken);
    assert.equal(f.lib.readLibrarySettings().defaults.photoId, photo.id);
    assert.equal(f.lib.readLibrarySettings().defaultIssues[0].reason, 'trashed');
    s = f.lib.createChannel({name: '自定义', requiredRatio: '94:40'}, s.editToken);
    const channel = s.channels.at(-1);
    assert.match(channel.id, /^channel-/);
    assert.equal(channel.requiredRatio, '47:20');
    s = f.lib.updateChannel(channel.id, {name: '改名'}, s.editToken);
    s = f.lib.trashChannel(channel.id, s.editToken);
    let c = f.lib.createContent({title: 'x', body: ''});
    reject('INVALID_INPUT', () => f.lib.savePublicationPlan(c.id, {
        channelId: channel.id,
        text: '',
        schedule: date
    }, c.editToken));
    s = f.lib.restoreChannel(channel.id, s.editToken);
    c = f.lib.savePublicationPlan(c.id, {channelId: channel.id, text: '', schedule: date}, c.editToken);
    assert.equal(c.plans[0].text, '');
    reject('INVALID_INPUT', () => f.lib.updateProfile({host: 'codex'}, s.editToken));
});

test('collections own body/materials/plan/publication and only reference content members', async t => {
    const f = fixture(t), a = await image(f);
    let c = f.lib.createContent({title: 'member', body: 'member body', recordedDate: '2026-08-01', isExample: true});
    let g = f.lib.createCollection({
        title: '合集',
        body: 'own body',
        dateRange: {start: '2026-08-01', end: '2026-08-31'}
    });
    g = f.lib.setCollectionMembers(g.id, [c.id], g.editToken);
    reject('INVALID_STATE', () => f.lib.trashContent(c.id, c.editToken));
    reject('INVALID_INPUT', () => f.lib.setCollectionMembers(g.id, [g.id], g.editToken));
    g = f.lib.attachCollectionMaterial(g.id, {assetHash: a.assetHash, originalName: 'source.png'}, g.editToken);
    g = f.lib.registerCollectionCandidate(g.id, {
        assetHash: a.assetHash,
        requestId: 'manual',
        attemptId: 'import'
    }, g.editToken);
    g = f.lib.selectCollectionCover(g.id, g.candidates[0].id, g.editToken);
    g = f.lib.saveCollectionPublicationPlan(g.id, {
        channelId: 'wechat-official',
        text: '合集文案',
        schedule: date
    }, g.editToken);
    g = f.lib.recordCollectionPublication(g.id, {planId: g.plans[0].id, schedule: wall}, g.editToken);
    assert.equal(f.lib.readCollectionPublication(g.id, g.publications[0].id).publicationText.text, '合集文案');
    assert.equal(f.lib.readContent(c.id).candidates.length, 0);
    assert.equal(g.body, 'own body');
    g = f.lib.setCollectionMembers(g.id, [], g.editToken);
    c = f.lib.trashContent(c.id, c.editToken);
    assert.equal(c.recordedDate, '2026-08-01');
    g = f.lib.trashCollection(g.id, g.editToken);
    g = f.lib.restoreCollection(g.id, g.editToken);
    assert.equal(g.publications.length, 1);
    reject('INVALID_INPUT', () => f.lib.updateContent(c.id, {recordedDate: '2026-02-30'}, c.editToken));
});

test('variants, candidate favorites and imported unavailable references cannot fake executable assets or tasks', async t => {
    const f = fixture(t), a = await image(f);
    let c = f.lib.createContent({title: 'story', body: ''});
    c = f.lib.saveCoverVariant(c.id, {name: '竖版', ratio: '6:8'}, c.editToken);
    const variant = c.coverVariants[0];
    c = f.lib.registerContentCandidate(c.id, {
        assetHash: a.assetHash,
        requestId: 'external',
        attemptId: 'manual'
    }, c.editToken);
    const candidate = c.candidates[0];
    c = f.lib.updateContentCandidate(c.id, candidate.id, {
        variantId: variant.id,
        favorite: true,
        displayNumber: '旧图2',
        note: 'keep',
        provenance: {source: 'browser', originalId: '2'}
    }, c.editToken);
    c = f.lib.selectVariantCover(c.id, variant.id, candidate.id, c.editToken);
    assert.equal(c.selectedCover, null);
    assert.equal(c.candidates[0].favorite, true);
    c = f.lib.addContentUnavailableReference(c.id, {
        kind: 'candidate',
        originalId: 'missing',
        reason: 'bytes absent',
        provenance: {source: 'browser'}
    }, c.editToken);
    const missing = c.unavailableReferences[0];
    c = f.lib.saveContentImportedCoverBatch(c.id, {
        displayNumber: '第2批',
        date: '2026-07-01',
        templateGroupId: 'old-group',
        candidateIds: [candidate.id, missing.id],
        referenceCandidateIds: [missing.id],
        originalStatus: 'running'
    }, c.editToken);
    assert.equal(c.coverJobs.length, 0);
    c = f.lib.saveCoverVariant(c.id, {
        id: variant.id,
        name: '竖版',
        ratio: '3:4',
        selectedCandidateId: missing.id
    }, c.editToken);
    reject('INVALID_INPUT', () => f.lib.selectVariantCover(c.id, variant.id, missing.id, c.editToken));
    c = f.lib.savePublicationPlan(c.id, {
        channelId: 'douyin',
        text: 'draft',
        schedule: date,
        coverChoice: {variantId: variant.id}
    }, c.editToken);
    reject('INVALID_INPUT', () => f.lib.recordPublication(c.id, {planId: c.plans[0].id, schedule: date}, c.editToken));
    assert.equal(f.lib.readContent(c.id).publications.length, 0);
    c = f.lib.resolveContentUnavailableReference(c.id, missing.id, {assetHash: a.assetHash}, c.editToken);
    assert.equal(c.unavailableReferences[0].availability, 'available');
    assert.equal(c.candidates.at(-1).id, missing.id);
    c = f.lib.recordPublication(c.id, {planId: c.plans[0].id, schedule: date}, c.editToken);
    assert.equal(f.lib.readPublication(c.id, c.publications[0].id).cover.assetHash, a.assetHash);
});

for (const kind of ['content', 'collection']) test(`${kind} explicit no-cover plan does not inherit the selected cover`, async t => {
    const f = fixture(t), asset = await image(f);
    const methods = kind === 'content' ? {
        create: 'createContent', candidate: 'registerContentCandidate', select: 'selectContentCover',
        save: 'savePublicationPlan', record: 'recordPublication', read: 'readPublication'
    } : {
        create: 'createCollection', candidate: 'registerCollectionCandidate', select: 'selectCollectionCover',
        save: 'saveCollectionPublicationPlan', record: 'recordCollectionPublication', read: 'readCollectionPublication'
    };
    let document = f.lib[methods.create]({title: 'with main cover', body: 'base body'});
    document = f.lib[methods.candidate](document.id, {assetHash: asset.assetHash, requestId: 'manual', attemptId: 'manual'}, document.editToken);
    document = f.lib[methods.select](document.id, document.candidates[0].id, document.editToken);
    document = f.lib[methods.save](document.id, {channelId: 'douyin', scheduledAt: instant.at, timezone: instant.timezone}, document.editToken);
    document = f.lib[methods.record](document.id, {planId: document.plans[0].id, schedule: date}, document.editToken);
    assert.equal(f.lib[methods.read](document.id, document.publications[0].id).cover.assetHash, asset.assetHash);
    document = f.lib[methods.save](document.id, {channelId: 'douyin', schedule: date, text: '', coverChoice: null}, document.editToken);
    document = f.lib[methods.record](document.id, {planId: document.plans[1].id, schedule: instant}, document.editToken);
    const publication = f.lib[methods.read](document.id, document.publications[1].id);
    assert.equal(publication.publicationText.text, '');
    assert.equal(publication.cover, null);
    assert.equal(publication.template, null);
    assert.equal(document.selectedCover.assetHash, asset.assetHash);
});

for (const kind of ['content', 'collection']) test(`${kind} publication correction and retraction preserve intended plan`, async t => {
    const f = fixture(t), red = await image(f), blue = await image(f, 'blue');
    const methods = kind === 'content' ? {
        create: 'createContent', candidate: 'registerContentCandidate', select: 'selectContentCover', save: 'savePublicationPlan',
        record: 'recordPublication', read: 'readPublication', correct: 'correctPublication', retract: 'retractPublication', reopen: 'readContent'
    } : {
        create: 'createCollection', candidate: 'registerCollectionCandidate', select: 'selectCollectionCover', save: 'saveCollectionPublicationPlan',
        record: 'recordCollectionPublication', read: 'readCollectionPublication', correct: 'correctCollectionPublication', retract: 'retractCollectionPublication', reopen: 'readCollection'
    };
    let document = f.lib[methods.create]({title: 'planned story', body: 'base body'});
    for (const asset of [red, blue]) document = f.lib[methods.candidate](document.id, {
        assetHash: asset.assetHash, requestId: asset.assetHash, attemptId: 'manual'
    }, document.editToken);
    document = f.lib[methods.select](document.id, document.candidates[0].id, document.editToken);
    const planned = {precision: 'instant', at: '2026-10-22T18:57:06.000Z', timezone: 'Asia/Shanghai'},
        actual = {precision: 'instant', at: '2026-10-18T18:59:45.000Z', timezone: 'Asia/Shanghai'},
        corrected = {precision: 'instant', at: '2026-10-17T18:59:45.000Z', timezone: 'Asia/Shanghai'};
    document = f.lib[methods.save](document.id, {
        channelId: 'douyin', schedule: planned, text: 'intended text', coverChoice: {candidateId: document.candidates[0].id}
    }, document.editToken);
    const plan = structuredClone(document.plans[0]);
    document = f.lib[methods.record](document.id, {planId: plan.id, schedule: actual}, document.editToken);
    const original = f.lib[methods.read](document.id, document.publications[0].id);
    const originalHash = document.publications[0].snapshotHash,
        originalFile = path.join(f.root, kind === 'content' ? '内容' : '合集', document.id, '发布快照', original.snapshot.publicationId, '快照.json'),
        originalBytes = fs.readFileSync(originalFile);
    assert.deepEqual(document.plans[0].schedule, plan.schedule);
    assert.equal(document.plans[0].text, plan.text);
    assert.deepEqual(document.plans[0].coverChoice, plan.coverChoice);
    assert.deepEqual(original.snapshot.plan, plan);
    assert.deepEqual(original.snapshot.schedule, actual);
    assert.equal(original.publicationText.text, plan.text);
    assert.equal(original.cover.assetHash, red.assetHash);
    document = f.lib[methods.correct](document.id, original.snapshot.publicationId, {
        reason: 'correct actual publication', schedule: corrected, text: 'corrected actual text',
        coverChoice: {candidateId: document.candidates[1].id}
    }, document.editToken);
    const replacement = f.lib[methods.read](document.id, document.publications[1].id);
    assert.deepEqual(replacement.snapshot.schedule, corrected);
    assert.equal(replacement.publicationText.text, 'corrected actual text');
    assert.equal(replacement.cover.assetHash, blue.assetHash);
    assert.deepEqual(f.lib[methods.read](document.id, original.snapshot.publicationId), original);
    assert.deepEqual(replacement.snapshot.plan, plan);
    assert.deepEqual(document.plans[0].schedule, plan.schedule);
    assert.equal(document.plans[0].text, plan.text);
    assert.deepEqual(document.plans[0].coverChoice, plan.coverChoice);
    document = f.lib[methods.correct](document.id, replacement.snapshot.publicationId, {
        reason: 'keep actual cover', schedule: wall, text: 'same actual cover'
    }, document.editToken);
    const retained = f.lib[methods.read](document.id, document.publications[2].id);
    assert.equal(retained.cover.assetHash, blue.assetHash);
    assert.deepEqual(retained.snapshot.plan, plan);
    document = f.lib[methods.correct](document.id, retained.snapshot.publicationId, {
        reason: 'actual post had no text or cover', schedule: date, text: '', coverChoice: null
    }, document.editToken);
    const cleared = f.lib[methods.read](document.id, document.publications[3].id);
    assert.deepEqual(cleared.snapshot.plan, plan);
    assert.deepEqual(cleared.snapshot.schedule, date);
    assert.equal(cleared.publicationText.text, '');
    assert.equal(cleared.cover, null);
    document = f.lib[methods.retract](document.id, cleared.snapshot.publicationId, {reason: 'withdraw'}, document.editToken);
    document = openLibrary(f.root)[methods.reopen](document.id);
    assert.equal(document.plans[0].status, 'planned');
    assert.deepEqual(document.plans[0].schedule, plan.schedule);
    assert.equal(document.plans[0].textMode, plan.textMode);
    assert.equal(document.plans[0].text, plan.text);
    assert.deepEqual(document.plans[0].coverChoice, plan.coverChoice);
    assert.equal(document.publications[0].snapshotHash, originalHash);
    assert.deepEqual(fs.readFileSync(originalFile), originalBytes);
    assert.deepEqual(f.lib[methods.read](document.id, replacement.snapshot.publicationId), replacement);
    assert.deepEqual(f.lib[methods.read](document.id, retained.snapshot.publicationId), retained);
    assert.deepEqual(f.lib[methods.read](document.id, cleared.snapshot.publicationId), cleared);
});

test('two channels freeze different text/covers and all date precisions; correction/retraction preserve old snapshots', async t => {
    const f = fixture(t), red = await image(f), blue = await image(f, 'blue');
    let c = f.lib.createContent({title: 'original', body: 'base body'});
    for (const a of [red, blue]) c = f.lib.registerContentCandidate(c.id, {
        assetHash: a.assetHash,
        requestId: a.assetHash,
        attemptId: 'manual'
    }, c.editToken);
    c = f.lib.saveCoverVariant(c.id, {name: '竖版', ratio: '3:4'}, c.editToken);
    const variant = c.coverVariants[0];
    c = f.lib.selectVariantCover(c.id, variant.id, c.candidates[0].id, c.editToken);
    c = f.lib.savePublicationPlan(c.id, {
        channelId: 'douyin',
        text: '抖音文案',
        schedule: date,
        coverChoice: {variantId: variant.id}
    }, c.editToken);
    c = f.lib.savePublicationPlan(c.id, {
        channelId: 'xiaohongshu',
        text: '',
        schedule: wall,
        coverChoice: {candidateId: c.candidates[1].id}
    }, c.editToken);
    for (const [i, schedule] of [date, instant].entries()) c = f.lib.recordPublication(c.id, {
        planId: c.plans[i].id,
        schedule
    }, c.editToken);
    const first = f.lib.readPublication(c.id, c.publications[0].id),
        second = f.lib.readPublication(c.id, c.publications[1].id);
    assert.equal(first.publicationText.text, '抖音文案');
    assert.equal(second.publicationText.text, '');
    assert.equal(first.cover.assetHash, red.assetHash);
    assert.equal(second.cover.assetHash, blue.assetHash);
    assert.deepEqual(first.snapshot.schedule, date);
    assert.deepEqual(second.snapshot.plan.schedule, wall);
    c = f.lib.updateContent(c.id, {title: 'changed', body: 'new base'}, c.editToken);
    c = f.lib.selectVariantCover(c.id, variant.id, c.candidates[1].id, c.editToken);
    let s = f.lib.readLibrarySettings();
    s = f.lib.updateChannel('douyin', {name: '重命名'}, s.editToken);
    assert.deepEqual(f.lib.readPublication(c.id, c.publications[0].id), first);
    c = f.lib.correctPublication(c.id, c.publications[0].id, {
        reason: 'typo',
        text: '修正文案',
        schedule: wall
    }, c.editToken);
    const fixed = f.lib.readPublication(c.id, c.publications[2].id);
    assert.equal(fixed.body, 'base body');
    assert.equal(fixed.cover.assetHash, red.assetHash);
    assert.equal(fixed.snapshot.channel.name, '抖音');
    assert.equal(fixed.publicationText.text, '修正文案');
    assert.deepEqual(f.lib.readPublication(c.id, c.publications[0].id), first);
    reject('INVALID_STATE', () => f.lib.retractPublication(c.id, c.publications[0].id, {reason: 'again'}, c.editToken));
    c = f.lib.retractPublication(c.id, c.publications[2].id, {reason: 'withdraw'}, c.editToken);
    c = f.lib.recordPublication(c.id, {planId: c.plans[0].id, schedule: instant}, c.editToken);
    assert.equal(c.publications.length, 4);
    assert.equal(c.publicationEvents.length, 2);
});

test('legacy plans retain body reference and absent historical text/cover stays unknown', t => {
    const f = fixture(t);
    let c = f.lib.createContent({title: 'legacy', body: 'before'});
    c = f.lib.savePublicationPlan(c.id, {
        channelId: 'old-channel',
        scheduledAt: '2026-10-18T11:00:00Z',
        timezone: 'UTC'
    }, c.editToken);
    assert.equal(c.plans[0].textMode, 'body');
    c = f.lib.updateContent(c.id, {body: 'current body'}, c.editToken);
    c = f.lib.recordPublication(c.id, {planId: c.plans[0].id, schedule: date}, c.editToken);
    assert.equal(f.lib.readPublication(c.id, c.publications[0].id).publicationText.text, 'current body');
    assert.equal(f.lib.readPublication(c.id, c.publications[0].id).snapshot.channel.nameStatus, 'unknown');
    c = f.lib.savePublicationPlan(c.id, {
        channelId: 'douyin',
        text: 'current draft is not history',
        schedule: wall
    }, c.editToken);
    c = f.lib.recordHistoricalPublication(c.id, {
        planId: c.plans[1].id,
        schedule: date,
        publicationText: null,
        cover: null,
        source: {source: 'browser'}
    }, c.editToken);
    const historic = f.lib.readPublication(c.id, c.publications[1].id);
    assert.deepEqual(historic.publicationText, {status: 'unknown', text: null});
    assert.equal(historic.cover, null);
    assert.equal(historic.body, null);
    assert.equal(historic.snapshot.contentKnowledge, 'unknown');
    reject('INVALID_INPUT', () => f.lib.savePublicationPlan(c.id, {channelId: 'douyin', schedule: date}, c.editToken));
    reject('INVALID_INPUT', () => f.lib.savePublicationPlan(c.id, {
        channelId: 'douyin',
        text: '',
        schedule: {...wall, time: '24:00'}
    }, c.editToken));
});

for (const phase of ['upgrade5AfterBackup', 'upgrade5AfterBarrier', 'upgrade5AfterDirectories', 'upgrade5BeforeDescriptorPublish', 'upgrade5AfterDescriptorPublish', 'upgrade5AfterFinalMarker']) test(`SIGKILL ${phase}: schema4→5 resumes with raw history/descriptor intact`, t => {
    const f = fixture(t), oldURL = oldImplementation(f), raw = downgrade(f);
    oldRun(f, oldURL, "const l=openLibrary(process.env.TASK_ROOT);const c=l.createContent({title:'old',body:'legacy body'});l.savePublicationPlan(c.id,{channelId:'legacy',scheduledAt:'2026-10-18T11:00:00Z',timezone:'UTC'},c.editToken);");
    const history = path.join(f.root, '系统（别动）', '事务', '已提交'),
        before = fs.readdirSync(history).map(n => [n, fs.readFileSync(path.join(history, n, 'intent.json'))]);
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', `import{upgradeLibrary,__testing}from ${JSON.stringify(moduleURL)};__testing.setHook(e=>{if(e.phase===process.env.TASK_PHASE)process.kill(process.pid,'SIGKILL');});upgradeLibrary(process.env.TASK_ROOT);`], {
        env: {
            ...process.env,
            NODE_ENV: 'test',
            TASK_ROOT: f.root,
            TASK_PHASE: phase
        }, encoding: 'utf8', timeout: 15000
    });
    assert.equal(r.signal, 'SIGKILL', r.stderr);
    const lib = upgradeLibrary(f.root);
    assert.equal(lib.info.schemaVersion, 5);
    assert.deepEqual(fs.readFileSync(path.join(f.root, '系统（别动）', '内容库.schema4.bak.json')), raw);
    assert.equal(lib.readLibrarySettings().channels.length, 5);
    let c = lib.listContents()[0];
    assert.equal(c.schemaVersion, 2);
    assert.equal(c.plans[0].text, undefined);
    c = lib.recordPublication(c.id, {planId: c.plans[0].id, schedule: date}, c.editToken);
    assert.equal(c.schemaVersion, 4);
    assert.equal(lib.readPublication(c.id, c.publications[0].id).publicationText.text, 'legacy body');
    for (const [n, bytes] of before) assert.deepEqual(fs.readFileSync(path.join(history, n, 'intent.json')), bytes);
});

test('actual schema4 writer refuses schema5 and new barrier even after descriptor rollback', t => {
    const f = fixture(t), oldURL = oldImplementation(f), raw = downgrade(f);
    upgradeLibrary(f.root);
    const code = "try{openLibrary(process.env.TASK_ROOT).createContent({title:'must not write',body:''});process.exitCode=9}catch(e){console.log(e.code)}";
    assert.match(oldRun(f, oldURL, code), /FORMAT_UNSUPPORTED/);
    fs.writeFileSync(path.join(f.root, '内容库.json'), raw);
    assert.match(oldRun(f, oldURL, code), /CORRUPT/);
    assert.equal(fs.readdirSync(path.join(f.root, '内容')).length, 0);
});

test('transaction3 settings recover once, and old transaction types cannot smuggle workspace', t => {
    const f = fixture(t), s = f.lib.readLibrarySettings(), mutationId = randomUUID();
    __testing.setHook(e => {
        if (e.phase === 'afterFile') throw new Error('interrupted');
    });
    assert.throws(() => f.lib.updateProfile({name: 'once'}, s.editToken, {mutationId}), e => e.pendingRecovery === true);
    __testing.setHook(undefined);
    const lib = openLibrary(f.root);
    assert.equal(lib.readLibrarySettings().profile.name, 'once');
    assert.equal(lib.updateProfile({name: 'once'}, s.editToken, {mutationId}).revision, 2);
    const dir = path.join(f.root, '系统（别动）', '事务', '已提交', mutationId),
        intent = JSON.parse(fs.readFileSync(path.join(dir, 'intent.json')));
    assert.equal(intent.schemaVersion, 3);
    assert.equal(intent.objectKind, 'workspace');
    fs.writeFileSync(path.join(dir, 'intent.json'), JSON.stringify({...intent, schemaVersion: 2}));
    reject('CORRUPT', () => lib.queryMutation(mutationId));
});

test('schema5 backup roundtrip retains settings, collections, publication events, unavailable refs and disabled trashed prompt', async t => {
    const f = fixture(t), a = await image(f);
    let s = f.lib.readLibrarySettings();
    s = f.lib.updateProfile({name: 'portable', avatarAssetHash: a.assetHash}, s.editToken);
    s = f.lib.setPromptCategories(['empty'], s.editToken);
    let p = f.lib.createPrompt({title: 'private', body: 'secret'});
    p = f.lib.setPromptEnabled(p.id, false, p.editToken);
    p = f.lib.trashPrompt(p.id, p.editToken);
    let c = f.lib.createContent({title: 'story', body: 'body', recordedDate: '2026-01-02'});
    c = f.lib.addContentUnavailableReference(c.id, {
        kind: 'template-image',
        originalId: 'legacy.png',
        reason: 'missing'
    }, c.editToken);
    c = f.lib.savePublicationPlan(c.id, {channelId: 'douyin', text: 'post', schedule: wall}, c.editToken);
    c = f.lib.recordPublication(c.id, {planId: c.plans[0].id, schedule: date}, c.editToken);
    c = f.lib.retractPublication(c.id, c.publications[0].id, {reason: 'withdraw'}, c.editToken);
    let g = f.lib.createCollection({title: 'collection', body: 'own'});
    g = f.lib.setCollectionMembers(g.id, [c.id], g.editToken);
    g = f.lib.trashCollection(g.id, g.editToken);
    const backup = path.join(f.parent, 'backup'), restored = path.join(f.parent, 'restored');
    backupLibrary(f.root, backup);
    assert.equal(verifyBackup(backup).manifest.source.schemaVersion, 5);
    assert.equal(restoreBackup(backup, restored).upgradeRequired, false);
    const lib = openLibrary(restored);
    assert.deepEqual(lib.readLibrarySettings(), f.lib.readLibrarySettings());
    for (const [read, item] of [[lib.readContent, c], [lib.readCollection, g], [lib.readPrompt, p]]) {
        const {mutationId, ...expected} = item;
        assert.deepEqual(read(item.id), expected);
    }
    assert.equal(lib.readPublication(c.id, c.publications[0].id).publicationText.text, 'post');
});

test('real schema4 backup verifies/restores original schema and requires explicit upgrade', t => {
    const f = fixture(t), oldURL = oldImplementation(f);
    downgrade(f);
    oldRun(f, oldURL, "const l=openLibrary(process.env.TASK_ROOT);let c=l.createContent({title:'old',body:'old body'});c=l.savePublicationPlan(c.id,{channelId:'legacy',scheduledAt:'2026-10-18T11:00:00Z',timezone:'UTC'},c.editToken);c=l.recordPublication(c.id,{planId:c.plans[0].id,publishedAt:'2026-10-18T11:00:00Z',timezone:'UTC'},c.editToken);backupLibrary(process.env.TASK_ROOT,process.env.TASK_PARENT+'/backup4');");
    const backup = path.join(f.parent, 'backup4'), target = path.join(f.parent, 'restore4');
    assert.equal(verifyBackup(backup).manifest.source.schemaVersion, 4);
    const restored = restoreBackup(backup, target);
    assert.equal(restored.schemaVersion, 4);
    assert.equal(restored.upgradeRequired, true);
    reject('UPGRADE_REQUIRED', () => openLibrary(target));
    assert.equal(fs.existsSync(path.join(target, '库配置')), false);
    const lib = upgradeLibrary(target), c = lib.listContents()[0];
    assert.equal(lib.readPublication(c.id, c.publications[0].id).body, 'old body');
});

for (const phase of ['afterCapture', 'afterFile']) test(`workspace SIGKILL ${phase} recovers before reading fixed config`, t => {
    const f = fixture(t), s = f.lib.readLibrarySettings();
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', `import{openLibrary,__testing}from ${JSON.stringify(moduleURL)};const lib=openLibrary(process.env.TASK_ROOT);__testing.setHook(e=>{if(e.phase===process.env.TASK_PHASE)process.kill(process.pid,'SIGKILL');});lib.updateProfile({name:'recovered'},process.env.TASK_TOKEN);`], {
        env: {
            ...process.env,
            NODE_ENV: 'test',
            TASK_ROOT: f.root,
            TASK_PHASE: phase,
            TASK_TOKEN: s.editToken
        }, encoding: 'utf8', timeout: 15000
    });
    assert.equal(r.signal, 'SIGKILL', r.stderr);
    assert.equal(openLibrary(f.root).readLibrarySettings().profile.name, 'recovered');
});

test('two independent settings writers serialize and stale token loses without lost updates', async t => {
    const f = fixture(t), s = f.lib.readLibrarySettings();
    const run = name => new Promise((resolve, reject) => {
        let stdout = '', stderr = '', spawnError;
        const child = spawn(process.execPath, ['--input-type=module', '-e', `import{openLibrary}from ${JSON.stringify(moduleURL)};let outcome;const deadline=Date.now()+30000;while(Date.now()<deadline){try{openLibrary(process.env.TASK_ROOT).updateProfile({name:process.env.TASK_NAME},process.env.TASK_TOKEN);outcome='committed';break;}catch(e){if(e.code==='CONFLICT'){outcome='CONFLICT';break;}if(!['BUSY','LOCK_UNCERTAIN'].includes(e.code))throw e;await new Promise(r=>setTimeout(r,10));}}if(!outcome)throw Error('settings writer timed out waiting for library lock after 30000ms');console.log(outcome);`], {
            env: {
                ...process.env,
                TASK_ROOT: f.root,
                TASK_TOKEN: s.editToken,
                TASK_NAME: name
            }, timeout: 45000, killSignal: 'SIGKILL'
        });
        child.stdout.on('data', b => stdout += b);
        child.stderr.on('data', b => stderr += b);
        child.on('error', error => {
            spawnError = error
        });
        child.on('close', (code, signal) => spawnError ? reject(spawnError) : code === 0 ? resolve(stdout.trim()) : reject(Error(`settings child failed (${code ?? signal}): ${stderr}`)));
    });
    const settled = await Promise.allSettled([run('one'), run('two')]);
    for (const result of settled) assert.equal(result.status, 'fulfilled', String(result.reason));
    assert.deepEqual(settled.map(result => result.value).sort(), ['CONFLICT', 'committed']);
    assert.equal(f.lib.readLibrarySettings().revision, 2);
});

for (const kind of ['workspace', 'collection']) test(`new ${kind} rejects malformed finite fields before read or restore publication`, t => {
    const f = fixture(t);
    let target;
    if (kind === 'workspace') target = path.join(f.root, '库配置', 'default', '配置.json'); else {
        const g = f.lib.createCollection({title: 'collection', body: 'own'});
        target = path.join(f.root, '合集', g.id, '合集.json');
    }
    const meta = JSON.parse(fs.readFileSync(target));
    if (kind === 'workspace') meta.profile.host = 'codex'; else meta.memberIds = [randomUUID(), randomUUID(), null];
    fs.writeFileSync(target, JSON.stringify(meta));
    const original = fs.readFileSync(target);
    reject('CORRUPT', () => kind === 'workspace' ? f.lib.readLibrarySettings() : f.lib.readCollection(meta.id));
    const backup = path.join(f.parent, 'bad-backup'), restored = path.join(f.parent, 'bad-restore');
    backupLibrary(f.root, backup);
    reject('CORRUPT', () => restoreBackup(backup, restored));
    assert.equal(fs.existsSync(path.join(restored, '内容库.json')), false);
    assert.deepEqual(fs.readFileSync(target), original);
});

test('historical publication with explicit candidate freezes original image but keeps unknown selection time and base body', async t => {
    const f = fixture(t), a = await image(f);
    let c = f.lib.createContent({title: 'current title is not historic', body: 'current body is not historic'});
    c = f.lib.registerContentCandidate(c.id, {
        assetHash: a.assetHash,
        requestId: 'imported',
        attemptId: 'original'
    }, c.editToken);
    const candidateId = c.candidates[0].id;
    c = f.lib.savePublicationPlan(c.id, {channelId: 'douyin', text: 'current draft', schedule: date}, c.editToken);
    c = f.lib.recordHistoricalPublication(c.id, {
        planId: c.plans[0].id,
        schedule: wall,
        publicationText: null,
        cover: {candidateId},
        channelName: '旧渠道名',
        source: {source: 'browser'}
    }, c.editToken);
    const p = f.lib.readPublication(c.id, c.publications[0].id);
    assert.equal(p.body, null);
    assert.equal(p.snapshot.content.title, null);
    assert.equal(p.snapshot.channel.name, '旧渠道名');
    assert.equal(p.cover.assetHash, a.assetHash);
    assert.equal(p.cover.selectedAt, null);
    assert.equal(p.cover.selectedAtKnowledge, 'unknown');
});

test('publication correction facts cannot refer backward or to themselves', t => {
    const f = fixture(t);
    let c = f.lib.createContent({title: 'story', body: 'body'});
    c = f.lib.savePublicationPlan(c.id, {channelId: 'douyin', text: 'post', schedule: date}, c.editToken);
    c = f.lib.recordPublication(c.id, {planId: c.plans[0].id, schedule: date}, c.editToken);
    c = f.lib.retractPublication(c.id, c.publications[0].id, {reason: 'withdraw'}, c.editToken);
    const target = path.join(f.root, '内容', c.id, '内容.json'), meta = JSON.parse(fs.readFileSync(target));
    meta.publicationEvents[0] = {
        ...meta.publicationEvents[0],
        type: 'corrected',
        replacementId: meta.publications[0].id
    };
    fs.writeFileSync(target, JSON.stringify(meta));
    reject('CORRUPT', () => f.lib.readContent(c.id));
});

for (const subject of ['content', 'collection']) test(`legacy ${subject} plan accepts unregistered history but rejects a registered trashed channel`, t => {
    const f = fixture(t);
    const create = subject === 'content' ? f.lib.createContent : f.lib.createCollection,
        save = subject === 'content' ? f.lib.savePublicationPlan : f.lib.saveCollectionPublicationPlan;
    let item = create({title: subject, body: ''});
    item = save(item.id, {
        channelId: 'never-registered',
        scheduledAt: '2026-10-18T11:00:00Z',
        timezone: 'UTC'
    }, item.editToken);
    assert.equal(item.plans[0].channelId, 'never-registered');
    let settings = f.lib.readLibrarySettings();
    settings = f.lib.trashChannel('douyin', settings.editToken);
    reject('INVALID_INPUT', () => save(item.id, {
        channelId: 'douyin',
        scheduledAt: '2026-10-18T11:00:00Z',
        timezone: 'UTC'
    }, item.editToken));
});

test('schema4 restore refuses newer metadata instead of installing a disguised downgraded library', t => {
    const f = fixture(t), oldURL = oldImplementation(f);
    f.lib.createContent({title: 'v5 content', body: 'body'});
    downgrade(f);
    oldRun(f, oldURL, "backupLibrary(process.env.TASK_ROOT,process.env.TASK_PARENT+'/downgraded-backup');");
    const restored = path.join(f.parent, 'restore-downgraded');
    reject('FORMAT_UNSUPPORTED', () => restoreBackup(path.join(f.parent, 'downgraded-backup'), restored));
    assert.equal(fs.existsSync(path.join(restored, '内容库.json')), false);
});

test('restoring invalid default references preserves IDs and source digest without reviving or authorizing generation', async t => {
    const f = fixture(t), a = await image(f);
    let photo = f.lib.createPhoto({title: '旧照片', assetHash: a.assetHash, isOwnPhoto: false});
    photo = f.lib.trashPhoto(photo.id, photo.editToken);
    const resources = {sample: {assetHash: a.assetHash, bytes: a.bytes, detectedType: a.detectedType, role: 'style'}};
    let template = f.lib.createTemplate({name: '旧模板', definition: {}, resources});
    template = f.lib.trashTemplate(template.id, template.editToken);
    let settings = f.lib.readLibrarySettings();
    const beforeToken = settings.editToken, mutationId = randomUUID(),
        input = {photoId: photo.id, templateId: template.id, source: {source: 'browser', originalId: 'old-settings'}};
    settings = f.lib.restoreGenerationDefaultReferences(input, beforeToken, {mutationId});
    assert.deepEqual(settings.defaults, {photoId: photo.id, templateId: template.id, coverCount: 4});
    assert.deepEqual(f.lib.readLibrarySettings().defaultIssues.map(v => v.reason), ['trashed', 'trashed']);
    assert.equal(f.lib.readPhoto(photo.id).isOwnPhoto, false);
    assert.notEqual(f.lib.readPhoto(photo.id).deletedAt, null);
    assert.notEqual(f.lib.readTemplate(template.id).deletedAt, null);
    reject('INVALID_INPUT', () => f.lib.restoreGenerationDefaultReferences({
        ...input,
        source: {source: 'different'}
    }, beforeToken, {mutationId}));
    reject('INVALID_INPUT', () => f.lib.restoreGenerationDefaultReferences({
        ...input,
        photoId: randomUUID()
    }, settings.editToken));
    photo = f.lib.restorePhoto(photo.id, photo.editToken);
    assert.equal(f.lib.readLibrarySettings().defaultIssues[0].reason, 'ownership-revoked');
    reject('INVALID_INPUT', () => f.lib.setGenerationDefaults({photoId: photo.id}, settings.editToken));
    const active = f.lib.createTemplate({name: '生成模板', definition: {}, resources}),
        c = f.lib.createContent({title: 'story', body: 'body'});
    reject('INVALID_INPUT', () => f.lib.createCoverRequest(c.id, {
        template: {id: active.id, version: 1},
        styleAssetHashes: [a.assetHash],
        photo: {id: photo.id, assetHash: a.assetHash},
        materialIds: [],
        prompt: 'test',
        pixels: {width: 8, height: 8},
        ratio: '1:1',
        count: 1,
        outputFormat: 'png',
        scope: 'cover-only'
    }, c.editToken));
});
