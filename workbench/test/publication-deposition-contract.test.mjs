import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {publicationRuntimeInput} from '../src/shared/publication-runtime-validation.ts';
const base = {
    contentId: randomUUID(),
    mutationId: randomUUID(),
    expectedRevision: ('a').repeat(64),
    decisionText: '核对真实封面文字',
    decisionAt: '2026-10-28T00:00:00Z'
};
test('deposition retry and cover supplement accept only fixed content operations', () => {
    assert.equal(publicationRuntimeInput('mutateJinchengPublication', {
        ...base,
        op: 'sync-knowledge'
    }), true);
    assert.equal(publicationRuntimeInput('mutateJinchengPublication', {
        ...base,
        op: 'sync-knowledge',
        sourceId: 'judgments'
    }), false);
    assert.equal(publicationRuntimeInput('mutateJinchengPublication', {
        ...base,
        op: 'cover-copy',
        platform: 'douyin',
        coverCopy: ''
    }), true);
    assert.equal(publicationRuntimeInput('mutateJinchengPublication', {
        ...base,
        op: 'cover-copy',
        platform: 'douyin',
        coverCopy: null
    }), false);
});
test('actual publication accepts explicit unknown, no lettering, or real cover lettering while preserving old callers', () => {
    const record = {
        ...base,
        op: 'record',
        publication: {
            platform: 'douyin',
            title: '实际标题',
            description: '',
            cover: 'cover.png',
            url: 'https://www.douyin.com/video/123',
            publishedAt: base.decisionAt
        },
        finalScript: {
            text: '实录全文',
            hash: ('b').repeat(64)
        },
        contentPackageId: null
    };
    for (const coverCopy of [null, '', '实际封面文字']) assert.equal(publicationRuntimeInput('mutateJinchengPublication', {
        ...record,
        publication: {
            ...record.publication,
            coverCopy
        }
    }), true);
    assert.equal(publicationRuntimeInput('mutateJinchengPublication', record), true);
    assert.equal(publicationRuntimeInput('mutateJinchengPublication', {
        ...record,
        publication: {
            ...record.publication,
            coverCopy: 45
        }
    }), false);
});
