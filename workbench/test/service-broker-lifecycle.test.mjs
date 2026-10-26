import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {ServiceToolBroker} from '../src/main/service-broker.mts';
import {callServiceTool} from '../../plugin-src/src/lib/service-tools/client.mjs';

test('broker shutdown waits for an accepted request to settle after its client disconnects', async t => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-broker-lifecycle-'));
    t.after(() => fs.rm(dir, {recursive: true, force: true}));
    const descriptorPath = path.join(dir, 'broker.json');
    const entered = Promise.withResolvers(), release = Promise.withResolvers();
    let settled = false;
    const broker = new ServiceToolBroker({descriptorPath, execute: async () => {
        entered.resolve();
        await release.promise;
        settled = true;
        return {data: {ok: true}, requestsUsed: 0, service: 'tikhub', cacheHit: true, collectedAt: new Date().toISOString()};
    }});
    await broker.start();
    t.after(async () => {release.resolve(); await broker.stop();});
    const request = {tool: 'tikhub', operation: 'video', id: '123456', taskId: randomUUID(), attemptId: randomUUID(), claimToken: randomUUID(), workerId: 'fixture', requestId: randomUUID()};
    const client = callServiceTool(descriptorPath, request).then(() => 'completed', () => 'disconnected');
    await entered.promise;
    let stopped = false;
    const stopping = broker.stop().then(() => {stopped = true;});
    assert.equal(await client, 'disconnected');
    assert.equal(settled, false);
    assert.equal(stopped, false);
    await fs.access(descriptorPath);
    await assert.rejects(broker.start(), {code: 'BROKER_STOPPED'});
    release.resolve();
    await stopping;
    assert.equal(settled, true);
    await assert.rejects(fs.access(descriptorPath), {code: 'ENOENT'});
});
