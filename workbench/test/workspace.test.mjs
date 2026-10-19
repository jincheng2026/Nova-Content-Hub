import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {createLibrary} from '../../plugin-src/src/lib/file-library/index.mjs';
import {execute} from '../src/main/worker.mts';
import {DesktopController} from '../src/main/controller.mts';
import {BindingStore} from '../src/main/bindings.mts';
import {assertCaller, CHANNELS, PAGE} from '../src/main/boundary.mts';
import {validateInput} from '../src/shared/validation.ts';
import {createOperationQueue} from '../src/main/operation-queue.mts';

async function fixture(t) {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-workspace-'));
    t.after(() => fs.rm(parent, {recursive: true, force: true}));
    const root = path.join(parent, 'library');
    const library = createLibrary(root);
    const controller = new DesktopController({
        store: new BindingStore(path.join(parent, 'binding.json')),
        worker: {call: execute}, documents: parent,
        dialogs: {backup: async () => null, destination: async () => null, library: async () => root}
    });
    await controller.initialize();
    await controller.openLibrary();
    return {parent, root, library, controller};
}

test('required-mode workspace reads real contents, plan precision, cover counts, prompts and channels through the bounded projection', async t => {
    const f = await fixture(t);
    let c = f.library.createContent({title: '<script>story</script>', body: 'real正文'});
    const date = {precision: 'date', date: '2026-10-18'};
    const instant = {precision: 'instant', at: '2026-10-18T11:30:00.000Z', timezone: 'Asia/Shanghai'};
    const floating = {precision: 'local-minute', date: '2026-10-19', time: '09:40', timezone: null};
    const zoned = {...floating, timezone: 'America/New_York'};
    for (const schedule of [date, instant, floating, zoned]) c = f.library.savePublicationPlan(c.id, {
        channelId: 'douyin', text: 'not exposed plan metadata', schedule
    }, c.editToken);
    c = f.library.cancelPublicationPlan(c.id, c.plans[0].id, c.editToken);
    c = f.library.recordPublication(c.id, {planId: c.plans[1].id, schedule: instant}, c.editToken);
    const image = path.join(f.parent, 'asset.png');
    await sharp({create: {width: 8, height: 8, channels: 3, background: 'red'}}).png().toFile(image);
    const asset = f.library.importAsset(image, {purpose: 'generated-cover'});
    c = f.library.registerContentCandidate(c.id, {assetHash: asset.assetHash, requestId: 'manual', attemptId: 'test'}, c.editToken);
    c = f.library.selectContentCover(c.id, c.candidates[0].id, c.editToken);
    let trash = f.library.createContent({title: 'trash', body: 'retained'});
    trash = f.library.trashContent(trash.id, trash.editToken);
    let prompt = f.library.createPrompt({title: 'prompt', body: 'full prompt body', category: 'writing', summary: 'summary', when: 'when needed', tags: ['tag'], provenance: {private: 'not exposed'}});
    prompt = f.library.setPromptEnabled(prompt.id, false, prompt.editToken);
    let removed = f.library.createPrompt({title: 'removed', body: 'hidden'});
    f.library.trashPrompt(removed.id, removed.editToken);
    const settings = f.library.readLibrarySettings();
    f.library.trashChannel('bilibili', settings.editToken);
    const before = await fs.readFile(path.join(f.root, '内容', c.id, '内容.json'), 'utf8');
    const snapshot = await f.controller.readWorkspace();
    assert.deepEqual(Object.keys(snapshot).sort(), ['channels', 'contents', 'prompts']);
    const content = snapshot.contents.find(item => item.id === c.id);
    assert.deepEqual(Object.keys(content).sort(), ['id', 'title', 'body', 'editToken', 'deletedAt', 'createdAt', 'updatedAt', 'plans', 'candidateCount', 'selectedCandidateId'].sort());
    assert.equal(content.body, 'real正文');
    assert.equal(content.title, '<script>story</script>');
    assert.deepEqual(content.plans.map(item => item.schedule), [date, instant, floating, zoned]);
    assert.deepEqual(content.plans.map(item => item.status), ['cancelled', 'published', 'planned', 'planned']);
    assert.deepEqual(Object.keys(content.plans[0]).sort(), ['id', 'channelId', 'status', 'schedule'].sort());
    assert.equal(content.candidateCount, 1);
    assert.equal(content.selectedCandidateId, c.candidates[0].id);
    assert.equal(snapshot.contents.find(item => item.id === trash.id).deletedAt, trash.deletedAt);
    assert.deepEqual(snapshot.prompts, [{id: prompt.id, title: prompt.title, body: prompt.body, category: prompt.category, summary: prompt.summary, when: prompt.when, tags: prompt.tags, enabled: false, favorite: false, editToken: prompt.editToken}]);
    assert.deepEqual(snapshot.channels.find(item => item.id === 'bilibili'), {id: 'bilibili', name: 'B 站', enabled: false});
    assert.ok(snapshot.channels.some(item => item.enabled));
    assert.equal(JSON.stringify(snapshot).includes(f.root), false);
    assert.equal(JSON.stringify(snapshot).includes(asset.assetHash), false);
    assert.equal(await fs.readFile(path.join(f.root, '内容', c.id, '内容.json'), 'utf8'), before, 'read does not rewrite business records');
    await assert.rejects(f.controller.createContent({title: 'blocked', body: ''}), {code: 'AUTH_NOT_CONFIGURED'});
});

test('workspace converts a real legacy plan without changing its instant or timezone', async t => {
    const f = await fixture(t);
    const c = f.library.createContent({title: 'legacy', body: ''});
    const file = path.join(f.root, '内容', c.id, '内容.json');
    const meta = JSON.parse(await fs.readFile(file, 'utf8'));
    const {randomUUID} = await import('node:crypto');
    const plan = {id: randomUUID(), channelId: 'legacy', scheduledAt: '2026-10-18T23:30:00.000Z', timezone: 'Pacific/Honolulu', status: 'planned', createdAt: c.createdAt, updatedAt: c.updatedAt};
    meta.plans.push(plan);
    await fs.writeFile(file, JSON.stringify(meta));
    const result = await f.controller.readWorkspace();
    assert.deepEqual(result.contents[0].plans, [{id: plan.id, channelId: 'legacy', status: 'planned', schedule: {precision: 'instant', at: plan.scheduledAt, timezone: plan.timezone}}]);
    assert.equal(JSON.parse(await fs.readFile(file, 'utf8')).plans[0].schedule, undefined);
    const prompt = f.library.createPrompt({title: 'legacy prompt', body: 'body'});
    const promptFile = path.join(f.root, '提示词', prompt.id, '提示词.json');
    const promptMeta = JSON.parse(await fs.readFile(promptFile, 'utf8'));
    promptMeta.schemaVersion = 1;
    delete promptMeta.enabled;
    await fs.writeFile(promptFile, JSON.stringify(promptMeta));
    assert.equal((await f.controller.readWorkspace()).prompts[0].enabled, true);
});

test('workspace refuses an unbound, missing or swapped root and preserves accepted identity', async t => {
    const f = await fixture(t);
    const binding = structuredClone(f.controller.binding);
    f.controller.binding.current = null;
    await assert.rejects(f.controller.readWorkspace(), {code: 'LIBRARY_NOT_READY'});
    f.controller.binding = structuredClone(binding);
    await fs.rename(f.root, `${f.root}.original`);
    await assert.rejects(f.controller.readWorkspace());
    assert.deepEqual(f.controller.binding, binding);
    await fs.cp(`${f.root}.original`, f.root, {recursive: true});
    await assert.rejects(f.controller.readWorkspace(), {code: 'CONFLICT'});
    assert.deepEqual(f.controller.binding, binding);
    await fs.rm(f.root, {recursive: true});
    await fs.rename(`${f.root}.original`, f.root);
    assert.deepEqual((await f.controller.readWorkspace()).contents, []);
});

test('workspace IPC and worker reject paths, additional fields and malformed bindings', async t => {
    const f = await fixture(t);
    assert.ok(CHANNELS.includes('readWorkspace'));
    const frame = {url: PAGE};
    const sender = {mainFrame: frame, isDestroyed: () => false};
    const event = {sender, senderFrame: frame};
    assert.doesNotThrow(() => assertCaller(event, sender, [], 'readWorkspace'));
    for (const input of [{}, {root: f.root}, null, [], 'workspace']) {
        assert.throws(() => validateInput('readWorkspace', input), {code: 'INVALID_INPUT'});
        await assert.rejects(f.controller.readWorkspace(input), {code: 'INVALID_INPUT'});
        assert.throws(() => assertCaller(event, sender, [input], 'readWorkspace'), {code: 'INVALID_INPUT'});
    }
    for (const args of [{}, {binding: f.controller.binding.current, root: f.root}, {binding: {...f.controller.binding.current, libraryId: 'bad'}}, {binding: {...f.controller.binding.current, root: 'relative'}}]) {
        await assert.rejects(execute('workspace', args), {code: 'INVALID_INPUT'});
    }
});

test('workspace reads use the existing serial operation queue and do not collide with worker calls', async t => {
    const f = await fixture(t);
    let concurrent = 0;
    const actual = f.controller.worker.call;
    f.controller.worker.call = async (...args) => {
        concurrent++;
        assert.equal(concurrent, 1);
        await Promise.resolve();
        try { return await actual(...args); } finally { concurrent--; }
    };
    const run = createOperationQueue();
    const results = await Promise.all([run(() => f.controller.readWorkspace()), run(() => f.controller.listContents()), run(() => f.controller.readWorkspace())]);
    assert.deepEqual(results.map(value => Array.isArray(value) ? value : value.contents), [[], [], []]);
    assert.equal(f.controller.busy, false);
});

test('prompt copy is explicit, preserves text, permits required mode and never touches the library', async () => {
    const copied = [];
    const controller = new DesktopController({
        store: {load() { throw new Error('must not load library'); }},
        worker: {call() { throw new Error('must not call worker'); }},
        documents: '/unused', dialogs: {},
        copyText: async text => { await Promise.resolve(); copied.push(text); }
    });
    assert.deepEqual(copied, [], 'constructing the controller cannot copy implicitly');
    const text = '  提示词\n<script>literal</script>\n🙂';
    await controller.copyPrompt({text});
    assert.deepEqual(copied, [text]);
    const maximum = 'x'.repeat(256 * 1024);
    await controller.copyPrompt({text: maximum});
    assert.equal(copied[1], maximum);
    controller.copyText = text => { copied.push(text); };
    await controller.copyPrompt({text: 'sync sink'});
    assert.equal(copied[2], 'sync sink');
    controller.copyText = undefined;
    await assert.rejects(controller.copyPrompt({text: 'valid'}), {code: 'CLIPBOARD_UNAVAILABLE'});
    controller.copyText = () => { throw Object.assign(new Error('failed'), {code: 'COPY_FAILED'}); };
    await assert.rejects(controller.copyPrompt({text: 'valid'}), {code: 'COPY_FAILED'});
});

test('prompt copy rejects malformed, oversized and NUL input before reaching clipboard sink', async () => {
    let copies = 0;
    const controller = new DesktopController({store: {}, worker: {}, documents: '/unused', dialogs: {}, copyText: () => { copies++; }});
    const frame = {url: PAGE};
    const sender = {mainFrame: frame, isDestroyed: () => false};
    const event = {sender, senderFrame: frame};
    assert.ok(CHANNELS.includes('copyPrompt'));
    assert.doesNotThrow(() => assertCaller(event, sender, [{text: 'valid'}], 'copyPrompt'));
    for (const input of [undefined, null, {}, [], {text: ''}, {text: 123}, {text: 'bad\0text'}, {text: 'x'.repeat(256 * 1024 + 1)}, {text: '中'.repeat(90_000)}, {text: 'ok', path: '/tmp/private'}]) {
        assert.throws(() => assertCaller(event, sender, [input], 'copyPrompt'), {code: 'INVALID_INPUT'});
        await assert.rejects(controller.copyPrompt(input), {code: 'INVALID_INPUT'});
    }
    assert.equal(copies, 0);
    assert.throws(() => assertCaller({...event, senderFrame: {url: 'https://external.test'}}, sender, [{text: 'valid'}], 'copyPrompt'), {code: 'FORBIDDEN'});
});

test('published workspace entries use actual publication time and retain the original planned schedule', async t => {
    const f = await fixture(t);
    let c = f.library.createContent({title: 'late publication', body: 'body'});
    const planned = {precision: 'date', date: '2026-10-18'};
    const actual = [
        {precision: 'date', date: '2026-10-20'},
        {precision: 'local-minute', date: '2026-10-20', time: '19:20', timezone: null},
        {precision: 'instant', at: '2026-10-20T23:30:00.000Z', timezone: 'Pacific/Honolulu'},
        {precision: 'instant', at: '2026-10-21T02:30:00.000Z', timezone: 'Asia/Shanghai'}
    ];
    for (const schedule of actual) {
        c = f.library.savePublicationPlan(c.id, {channelId: 'douyin', text: 'publish', schedule: planned}, c.editToken);
        c = f.library.recordPublication(c.id, {planId: c.plans.at(-1).id, schedule}, c.editToken);
    }
    const file = path.join(f.root, '内容', c.id, '内容.json');
    const meta = JSON.parse(await fs.readFile(file, 'utf8'));
    const legacy = meta.publications.at(-1);
    legacy.publishedAt = legacy.schedule.at;
    legacy.timezone = legacy.schedule.timezone;
    delete legacy.schedule;
    await fs.writeFile(file, JSON.stringify(meta));
    const before = await fs.readFile(file, 'utf8');
    const snapshot = await f.controller.readWorkspace();
    assert.deepEqual(snapshot.contents[0].plans.map(item => item.schedule), actual);
    assert.ok(snapshot.contents[0].plans.every(item => item.status === 'published'));
    assert.deepEqual(f.library.readContent(c.id).plans.map(item => item.schedule), actual.map(() => planned));
    assert.equal(await fs.readFile(file, 'utf8'), before, 'projection must not replace the planned schedule');
    meta.plans[0].publicationId = meta.publications[1].id;
    await fs.writeFile(file, JSON.stringify(meta));
    await assert.rejects(f.controller.readWorkspace(), {code: 'CORRUPT'});
});

test('library thumbnails use scoped candidate URLs and revoke them when the library epoch changes', async t => {
    const f = await fixture(t);
    let content = f.library.createContent({title: 'Thumbnail content', body: 'Keep source bytes'});
    const image = path.join(f.parent, 'thumbnail.png');
    await sharp({create: {width: 8, height: 8, channels: 3, background: 'blue'}}).png().toFile(image);
    const asset = f.library.importAsset(image, {purpose: 'generated-cover'});
    content = f.library.registerContentCandidate(content.id, {assetHash: asset.assetHash, requestId: 'manual', attemptId: 'thumbnail'}, content.editToken);
    const file = path.join(f.root, '内容', content.id, '内容.json');
    const before = await fs.readFile(file, 'utf8');
    const snapshot = await f.controller.readWorkspaceLibrary();
    const candidate = snapshot.contentDetails.find(item => item.id === content.id).candidates[0];
    assert.match(candidate.url, /^nova-content:\/\/assets\/[0-9a-f-]+\/[0-9a-f]{64}$/);
    assert.equal(f.controller.covers.allows(candidate.url), true);
    assert.equal(JSON.stringify(snapshot).includes(f.root), false);
    assert.equal(await fs.readFile(file, 'utf8'), before);
    const raster = await f.controller.covers.resource(candidate.url);
    assert.equal(raster.mime, 'image/png');
    f.controller.covers.revoke();
    assert.equal(f.controller.covers.allows(candidate.url), false);
    assert.equal(await f.controller.covers.resource(candidate.url), null);
    assert.notEqual((await f.controller.readWorkspaceLibrary()).contentDetails.find(item => item.id === content.id).candidates[0].url, candidate.url);
});
