import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {
    assertCaller,
    staticResource,
    PAGE,
    CHANNELS,
    CSP,
    validateResources,
    validateRelease,
    validateBuildConfig
} from '../src/main/boundary.mts';
import {BindingStore, emptyBinding, validateBinding} from '../src/main/bindings.mts';
import {WorkerClient} from '../src/main/worker-client.mts';

test('only exact top-level sender with no renderer arguments can invoke business', () => {
    const frame = {url: PAGE};
    const sender = {mainFrame: frame, isDestroyed: () => false};
    const event = {sender, senderFrame: frame};
    assert.doesNotThrow(() => assertCaller(event, sender, []));
    for (const attack of [{...event, sender: {}}, {...event, senderFrame: {url: PAGE}}, {
        ...event,
        senderFrame: null
    }]) assert.throws(() => assertCaller(attack, sender, []), {code: 'FORBIDDEN'});
    assert.throws(() => assertCaller(event, sender, ['/arbitrary/path']), {code: 'FORBIDDEN'});
    frame.url = 'https://app/index.html';
    assert.throws(() => assertCaller(event, sender, []), {code: 'FORBIDDEN'});
    assert.equal(new Set(CHANNELS).size, CHANNELS.length); assert.ok(CHANNELS.includes('generateCover')); assert.ok(CHANNELS.includes('exportCover')); assert.ok(CHANNELS.includes('revealCoverFolder'));
});
test('static protocol maps only exact manifest resources and refuses URL normalization', () => {
    const resources = validateResources({
        format: 'nova-desktop-renderer-resources',
        schemaVersion: 1,
        entries: {
            '/index.html': {file: 'index.html', mime: 'text/html; charset=utf-8'},
            '/assets/app-123.js': {file: 'assets/app-123.js', mime: 'text/javascript; charset=utf-8'}
        }
    });
    assert.deepEqual(staticResource(PAGE, resources), ['index.html', 'text/html; charset=utf-8']);
    for (const url of ['file:///etc/passwd', 'nova-content://other/app.js', 'nova-content://app/%2e%2e/%2fetc/passwd', 'nova-content://app/app.js?file=/etc/passwd', 'nova-content://app/private.json', 'nova-content://user@app/app.js', 'nova-content://app/index.html?', 'nova-content://app/index.html#', 'nova-content://app/%69ndex.html', 'nova-content://app/./index.html', 'nova-content://app/other/../index.html', 'nova-content://app/assets/private.js', 'nova-content://app/__proto__']) assert.equal(staticResource(url, resources), null);
});
test('release/resource configuration fails closed and scripts retain strict CSP', () => {
    for (const value of [null, {}, {AUTH_MODE: 'required'}]) assert.throws(() => validateRelease(value));
    const release = {
        format: 'nova-content-desktop-release',
        schemaVersion: 1,
        AUTH_MODE: 'required',
        version: '0.2.0',
        appScope: 'nova-content-hub',
        productId: 'nova-content-hub',
        protocolVersion: 1,
        prototype: true,
        pairId: 'nova-content-hub@0.2.0:p1:required',
        platform: process.platform,
        arch: process.arch,
        experimental: true,
        productionReady: false
    };
    assert.equal(validateRelease(release).AUTH_MODE, 'required');
    for (const change of [{AUTH_MODE: 'from-env'}, {AUTH_MODE: ['disabled']}, {version: '01.2.0'}, {version: ['0.2.0']}, {appScope: 'other'}, {productId: 'other'}, {protocolVersion: 2}, {pairId: 'nova-content-hub@0.2.0:p1:disabled'}, {platform: process.platform === 'darwin' ? 'win32' : 'darwin'}, {platform: [process.platform]}, {arch: process.arch === 'arm64' ? 'x64' : 'arm64'}, {arch: [process.arch]}, {prototype: false}]) assert.throws(() => validateRelease({...release, ...change}));
    assert.equal(validateBuildConfig(release).version, '0.2.0');
    assert.throws(() => validateBuildConfig({...release, appScope: 'unrelated-product'}));
    assert.throws(() => validateRelease({...release, productionReady: true}));
    assert.throws(() => validateResources(null));
    for (const [url, file, mime] of [['/assets/../secret.js', 'assets/../secret.js', 'text/javascript; charset=utf-8'], ['/bad.js', '../bad.js', 'text/javascript; charset=utf-8'], ['/bad.js', 'bad.js', 'text/html; charset=utf-8']]) {
        assert.throws(() => validateResources({
            format: 'nova-desktop-renderer-resources',
            schemaVersion: 1,
            entries: {'/index.html': {file: 'index.html', mime: 'text/html; charset=utf-8'}, [url]: {file, mime}}
        }));
    }
    assert.match(CSP, /script-src 'self';/);
    assert.doesNotMatch(CSP, /unsafe-eval|style-src 'self' 'unsafe-inline'/);
});
test('machine binding survives fresh store and refuses malformed or symlink state', async t => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-desktop-binding-'));
    t.after(() => fs.rm(dir, {recursive: true, force: true}));
    const file = path.join(dir, 'machine.json');
    const store = new BindingStore(file);
    assert.deepEqual(await store.load(), emptyBinding());
    const binding = {
        ...emptyBinding(),
        source: path.join(dir, 'old.json'),
        sourceHash: 'a'.repeat(64),
        destination: path.join(dir, 'library'),
        started: true
    };
    await store.save(binding);
    assert.deepEqual(await new BindingStore(file).load(), binding);
    assert.throws(() => validateBinding({...binding, arbitrary: '/etc/passwd'}), {code: 'BINDING_INVALID'});
    assert.throws(() => validateBinding({
        ...emptyBinding(),
        importId: '60063774-3b67-46be-a089-5ac3cc625d89'
    }), {code: 'BINDING_INVALID'});
    await fs.rename(file, `${file}.original`);
    await fs.symlink(`${file}.original`, file);
    await assert.rejects(store.load(), {code: 'BINDING_INVALID'});
});
test('worker exit rejects operation, next query starts fresh worker, shutdown cannot respawn', async () => {
    const children = [];
    const client = new WorkerClient(() => {
        const child = new EventEmitter();
        child.postMessage = message => {
            child.sent = message;
        };
        child.kill = () => child.emit('exit', 0);
        children.push(child);
        return child;
    });
    const first = client.call('import', {});
    children[0].emit('exit', 9);
    await assert.rejects(first, {code: 'WORKER_EXIT'});
    const query = client.call('query', {});
    children[1].emit('message', {id: children[1].sent.id, ok: true, value: {status: 'prepared'}});
    assert.deepEqual(await query, {status: 'prepared'});
    client.stop();
    await assert.rejects(client.call('query', {}), {code: 'WORKER_STOPPED'});
});
