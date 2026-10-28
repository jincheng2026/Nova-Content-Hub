import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createVault, createVaultDocument} from '../../plugin-src/src/lib/vault/index.mjs';
import {digest, json, readBytes, writeJSON} from '../../plugin-src/src/lib/vault/core.mjs';
import {PublicationController} from '../src/main/publication-controller.mts';
import {executePublication} from '../src/main/publication-worker.mts';
function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-deposition-'));
    t.after(() => fs.rmSync(root, {
        recursive: true,
        force: true
    }));
    const binding = createVault(root), d = createVaultDocument(binding.root, {
        section: 'drafts',
        title: '真实作品',
        text: '实际完整稿件'
    }, {
        mutationId: 'desktop-sink-initial'
    }), controller = new PublicationController({
        authMode: 'disabled',
        worker: {
            call: (op, args) => executePublication(op, args, 'disabled')
        },
        current: () => binding,
        noPending() {},
        exclusive: fn => fn()
    });
    return {
        root,
        binding,
        contentId: d.document.contentId,
        controller
    };
}
function base(f, facts) {
    return {
        contentId: f.contentId,
        mutationId: randomUUID(),
        expectedRevision: facts.revision,
        decisionText: '我核对已发布的实际版本',
        decisionAt: '2026-10-28T00:00:00Z'
    };
}
async function record(f, coverCopy = null) {
    const initial = await f.controller.read({
        contentId: f.contentId
    });
    return f.controller.mutate({
        ...base(f, initial),
        op: 'record',
        publication: {
            platform: 'douyin',
            title: '实际发布标题',
            description: '实际简介',
            cover: 'actual.png',
            coverCopy,
            url: 'https://www.douyin.com/video/123',
            publishedAt: '2026-10-01T00:00:00Z'
        },
        finalScript: {
            text: '实际完整稿件',
            hash: digest('实际完整稿件')
        },
        contentPackageId: null
    });
}
test('desktop author cover supplementation changes partial to complete and keeps original knowledge candidate meaning', async t => {
    const f = fixture(t), initial = await record(f);
    assert.equal(initial.deposition.state, 'partial');
    assert.deepEqual(initial.deposition.missingFields, ['douyin.coverCopy']);
    const after = await f.controller.mutate({
        ...base(f, initial),
        op: 'cover-copy',
        platform: 'douyin',
        coverCopy: ''
    });
    assert.equal(after.deposition.state, 'complete');
    assert.equal(after.archive.manifest.platforms.douyin.cover_copy, '');
    assert.deepEqual(after.knowledge, initial.knowledge);
    assert.match(readBytes(f.root, after.deposition.entryPath).toString(), /明确无字/);
    await assert.rejects(async () => f.controller.mutate({
        ...base(f, after),
        op: 'cover-copy',
        platform: 'douyin',
        coverCopy: '替换已确认文字'
    }), e => e.code === 'CONFLICT');
});
test('desktop explicit retry repairs a failed sink after source becomes writable without duplicating publication', async t => {
    const f = fixture(t), map = json(f.root, '.workbench/source-map.json');
    map.sources.find(s => s.id === 'author-evidence').writable = false;
    writeJSON(f.root, '.workbench/source-map.json', map);
    const initial = await record(f, '真正采用的封面字');
    assert.equal(initial.archive.state, 'ready');
    assert.equal(initial.deposition.state, 'incomplete');
    map.sources.find(s => s.id === 'author-evidence').writable = true;
    writeJSON(f.root, '.workbench/source-map.json', map);
    const after = await f.controller.mutate({
        ...base(f, initial),
        op: 'sync-knowledge'
    });
    assert.equal(after.deposition.state, 'complete');
    assert.equal(after.revision, initial.revision);
    assert.equal(Object.keys(after.publication.platforms).length, 1);
    assert.equal(readBytes(f.root, after.deposition.ledgerPath).toString().split('<!-- nova-publication:').length, 2);
    assert.match(readBytes(f.root, after.deposition.entryPath).toString(), /真正采用的封面字/);
});
test('desktop rejects forged author input, arbitrary destinations, stale versions and readonly writes before saving', async t => {
    const f = fixture(t), initial = await record(f, null), before = readBytes(f.root, initial.archive.directory + '/.system/manifest.json');
    for (const extra of [{
        sourceId: 'judgments'
    }, {
        path: 'elsewhere.md'
    }, {
        authorDecision: {
            actor: 'author',
            text: '模型自称确认'
        }
    }]) assert.throws(() => f.controller.mutate({
        ...base(f, initial),
        op: 'sync-knowledge',
        ...extra
    }), e => e.code === 'INVALID_INPUT');
    assert.throws(() => f.controller.mutate({
        ...base(f, initial),
        op: 'cover-copy',
        platform: 'douyin',
        coverCopy: null
    }), e => e.code === 'INVALID_INPUT');
    await assert.rejects(async () => f.controller.mutate({
        ...base(f, initial),
        expectedRevision: ('f').repeat(64),
        op: 'cover-copy',
        platform: 'douyin',
        coverCopy: '真实文字'
    }), e => e.code === 'CONFLICT');
    assert.throws(() => executePublication('publicationMutate', {
        binding: f.binding,
        input: {
            ...base(f, initial),
            op: 'cover-copy',
            platform: 'douyin',
            coverCopy: '不应写入'
        }
    }, 'required'), e => e.code === 'AUTH_NOT_CONFIGURED');
    assert.deepEqual(readBytes(f.root, initial.archive.directory + '/.system/manifest.json'), before);
});
test('desktop explicit sink retry reports its stale revision failure even when older deposition remains complete', async t => {
    const f = fixture(t), initial = await record(f, ''), entry = readBytes(f.root, initial.deposition.entryPath);
    const result = await f.controller.mutate({
        ...base(f, initial),
        expectedRevision: ('f').repeat(64),
        op: 'sync-knowledge'
    });
    assert.equal(result.deposition.state, 'incomplete');
    assert.equal(result.deposition.code, 'CONFLICT');
    assert.deepEqual(readBytes(f.root, initial.deposition.entryPath), entry);
});
