import test from 'node:test';
import assert from 'node:assert/strict';
import { createOperationQueue } from '../src/main/operation-queue.mts';
import { Covers } from '../src/main/covers.mts';

test('desktop operations finish in FIFO order without overlap', async () => {
    const run = createOperationQueue(), events = [];
    let release, entered;
    const started = new Promise(resolve => { entered = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    const first = run(async () => { events.push('first-start'); entered(); await gate; events.push('first-end'); return 1; });
    const second = run(() => { events.push('second'); return 2; });
    const third = run(() => { events.push('third'); return 3; });
    await started;
    assert.deepEqual(events, ['first-start']);
    release();
    assert.deepEqual(await Promise.all([first, second, third]), [1, 2, 3]);
    assert.deepEqual(events, ['first-start', 'first-end', 'second', 'third']);
});

test('a failed operation rejects its caller and leaves the queue usable', async () => {
    const run = createOperationQueue(), failure = new Error('failed');
    const first = run(() => { throw failure; });
    const second = run(() => 'still runs');
    await assert.rejects(first, error => error === failure);
    assert.equal(await second, 'still runs');
});

test('foreground save and read run after the active image and before queued images without overlap', async () => {
    const run = createOperationQueue(), events = [];
    let release, entered, active = 0, saved = false;
    const started = new Promise(resolve => { entered = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    const operation = (name, action = () => name) => async () => {
        assert.equal(++active, 1, 'only one library operation can run');
        events.push(name);
        try { return await action(); } finally { active--; }
    };
    const first = run(operation('image-1', async () => { entered(); await gate; return 'image-1'; }), 'background');
    await started;
    const second = run(operation('image-2'), 'background');
    const third = run(operation('image-3'), 'background');
    const save = run(operation('save', () => { saved = true; return 'saved'; }));
    const read = run(operation('read', () => saved));
    assert.deepEqual(events, ['image-1']);
    release();
    assert.deepEqual(await Promise.all([first, second, third, save, read]), ['image-1', 'image-2', 'image-3', 'saved', true]);
    assert.deepEqual(events, ['image-1', 'save', 'read', 'image-2', 'image-3']);
    assert.equal(await run(operation('after-idle')), 'after-idle');
});

test('background failures and thenables settle their callers and preserve background FIFO', async () => {
    const run = createOperationQueue(), events = [], failure = new Error('async failure');
    const first = run(() => { events.push(1); return Promise.reject(failure); }, 'background');
    const rejected = assert.rejects(first, error => error === failure);
    const second = run(() => { events.push(2); return {then(resolve) { resolve('thenable'); }}; }, 'background');
    const third = run(() => { events.push(3); return 'last'; }, 'background');
    await rejected;
    assert.deepEqual(await Promise.all([second, third]), ['thenable', 'last']);
    assert.deepEqual(events, [1, 2, 3]);
});

test('operations may enqueue subsequent work without overlapping their own execution', async () => {
    const run = createOperationQueue(), events = [];
    let queued;
    await run(async () => {
        events.push('start');
        queued = run(() => events.push('queued'));
        await Promise.resolve();
        events.push('end');
    });
    await queued;
    assert.deepEqual(events, ['start', 'end', 'queued']);
});

test('an image grant revoked while queued is checked again before any worker read', async () => {
    const run = createOperationQueue();
    const covers = new Covers({ current: () => assert.fail('revoked grant must not inspect a binding'), worker: { call: () => assert.fail('revoked grant must not read the library') } });
    let release;
    const blocker = run(() => new Promise(resolve => { release = resolve; }));
    const url = covers.grant('a'.repeat(64));
    const image = run(() => covers.resource(url), 'background');
    await Promise.resolve();
    covers.revoke();
    release();
    await blocker;
    assert.equal(await image, null);
});
