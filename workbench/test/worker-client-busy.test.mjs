import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {WorkerClient} from '../src/main/worker-client.mts';

function fixture(t, replies) {
    t.mock.timers.enable({apis: ['setTimeout']});
    const child = new EventEmitter(), requests = [];
    let spawned = 0;
    child.postMessage = request => {
        requests.push(structuredClone(request));
        const reply = replies(request, requests.length);
        child.emit('message', {id: request.id, ...reply});
    };
    child.kill = () => child.emit('exit');
    const client = new WorkerClient(() => {spawned += 1; return child;});
    t.after(() => client.stop());
    return {client, requests, spawned: () => spawned};
}

const busy = {ok: false, error: {code: 'BUSY'}};
const args = {binding: {root: '/original', libraryId: 'original', rootIdentity: {dev: '1', ino: '2'}}, view: 'active'};

test('a readonly BUSY retries the pinned request, occupying the single pending slot', async t => {
    const f = fixture(t, (_request, count) => count === 1 ? busy : {ok: true, value: ['current']});
    const input = structuredClone(args);
    const result = f.client.call('list', input);
    input.binding.root = '/changed';
    await assert.rejects(f.client.call('list', args), {code: 'BUSY'});
    t.mock.timers.tick(80);
    assert.deepEqual(await result, ['current']);
    assert.equal(f.requests.length, 2);
    assert.deepEqual(f.requests[0], f.requests[1]);
    assert.equal(f.requests[1].args.binding.root, '/original');
});

test('every allowed readonly operation stops after three extra attempts and explains temporary contention', async t => {
    const f = fixture(t, () => busy);
    for (const op of ['workspace', 'list', 'readContent', 'workspaceLibrary', 'coverAssets', 'readCover', 'raster']) {
        const before = f.requests.length;
        const rejected = assert.rejects(f.client.call(op, args), error => error.code === 'BUSY' && /暂时.*占用/.test(error.message));
        t.mock.timers.tick(79);
        assert.equal(f.requests.length - before, 1);
        t.mock.timers.tick(1);
        t.mock.timers.tick(240);
        t.mock.timers.tick(600);
        await rejected;
        t.mock.timers.tick(60_000);
        assert.equal(f.requests.length - before, 4);
    }
});

test('writes, imports, submissions and recovery/query operations are never replayed on BUSY', async t => {
    const f = fixture(t, () => busy);
    for (const op of ['mutate', 'workspaceMutate', 'import', 'resume', 'templateRecover', 'query', 'queryMutation', 'submitCover', 'selectCover']) {
        const before = f.requests.length;
        await assert.rejects(f.client.call(op, args), {code: 'BUSY'});
        t.mock.timers.tick(60_000);
        assert.equal(f.requests.length - before, 1);
    }
});

test('readonly non-BUSY failures are returned once', async t => {
    const f = fixture(t, () => ({ok: false, error: {code: 'RECOVERY_CONFLICT'}}));
    await assert.rejects(f.client.call('list', args), {code: 'RECOVERY_CONFLICT'});
    t.mock.timers.tick(60_000);
    assert.equal(f.requests.length, 1);
});

test('stop cancels a scheduled retry, rejects its caller and never respawns', async t => {
    const f = fixture(t, () => busy);
    const result = f.client.call('list', args);
    const rejected = assert.rejects(result, {code: 'WORKER_STOPPED'});
    f.client.stop();
    await rejected;
    t.mock.timers.tick(60_000);
    await assert.rejects(f.client.call('list', args), {code: 'WORKER_STOPPED'});
    assert.equal(f.requests.length, 1);
    assert.equal(f.spawned(), 1);
});
