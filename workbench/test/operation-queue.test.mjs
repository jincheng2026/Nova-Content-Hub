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

test('an image grant revoked while queued is checked again before any worker read', async () => {
    const run = createOperationQueue();
    const covers = new Covers({ current: () => assert.fail('revoked grant must not inspect a binding'), worker: { call: () => assert.fail('revoked grant must not read the library') } });
    let release;
    const blocker = run(() => new Promise(resolve => { release = resolve; }));
    const url = covers.grant('a'.repeat(64));
    const image = run(() => covers.resource(url));
    await Promise.resolve();
    covers.revoke();
    release();
    await blocker;
    assert.equal(await image, null);
});
