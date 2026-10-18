import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {randomUUID, createHash} from 'node:crypto';
import sharp from 'sharp';
import {createLibrary} from '../../src/lib/file-library/index.mjs';
import {nativeHandoffDirectory, prepareNativeHandoff} from '../../src/bridge/native-handoff.mjs';

let parent, bundle, release;
before(() => {
    parent = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'nova standalone handoff '));
    bundle = path.join(parent, 'plugin with spaces');
    fs.cpSync(new URL('../../../plugin/runtime/auth-disabled/', import.meta.url), bundle, {recursive: true});
    release = JSON.parse(fs.readFileSync(path.join(bundle, 'plugin-src/src/release.json')));
});
after(() => fs.rmSync(parent, {recursive: true, force: true}));
const appDataFor = home => process.platform === 'darwin' ? path.join(home, 'Library', 'Application Support') : process.platform === 'win32' ? path.join(home, 'AppData', 'Roaming') : path.join(home, '.config');

function run(home, args, input, target = bundle) {
    const env = {
        ...process.env,
        HOME: home,
        USERPROFILE: home,
        APPDATA: appDataFor(home),
        XDG_CONFIG_HOME: appDataFor(home),
        PATH: '',
        NODE_PATH: '',
        NODE_OPTIONS: '--require nonexistent-host-module'
    };
    const executable = process.platform === 'win32' ? path.join(process.env.SystemRoot, 'System32/cmd.exe') : '/bin/sh';
    const command = process.platform === 'win32' ? ['/d', '/s', '/c', `""${path.join(target, 'bin/run-node.cmd')}" ${args.join(' ')}"`] : [path.join(target, 'bin/run-node'), ...args];
    const result = spawnSync(executable, command, {
        cwd: parent,
        env,
        input: input === undefined ? undefined : JSON.stringify(input),
        encoding: 'utf8',
        timeout: 20000
    });
    assert.equal(result.error, undefined);
    assert.equal(result.signal, null, result.stderr);
    let value;
    try {
        value = JSON.parse(result.stdout);
    } catch {
        assert.fail(`No JSON receipt: ${result.stderr} ${result.stdout}`);
    }
    assert.equal(result.status, value.ok ? 0 : 1, result.stderr);
    return value;
}

async function fixture(t) {
    const home = path.join(parent, randomUUID());
    fs.mkdirSync(home);
    t.after(() => fs.rmSync(home, {recursive: true, force: true}));
    const library = createLibrary(path.join(home, '内容库'));
    const sampleFile = path.join(home, 'sample.png');
    fs.writeFileSync(sampleFile, await sharp({
        create: {
            width: 24,
            height: 32,
            channels: 3,
            background: '#102030'
        }
    }).png().toBuffer());
    const asset = library.importAsset(sampleFile, {purpose: 'template-reference'});
    const template = library.createTemplate({
        name: 'Handoff test',
        definition: {original: true},
        resources: {
            sample: {
                assetHash: asset.assetHash,
                bytes: asset.bytes,
                detectedType: asset.detectedType,
                role: 'style'
            }
        }
    });
    const content = library.createContent({title: '本机交接测试', body: '# Private request\r\n'});
    const {request} = library.createCoverRequest(content.id, {
        template: {id: template.id, version: 1},
        styleAssetHashes: [asset.assetHash],
        photo: null,
        materialIds: [],
        prompt: 'Synthetic flow test, not provider generation',
        pixels: {width: 24, height: 32},
        ratio: '3:4',
        count: 1,
        outputFormat: 'png',
        scope: 'cover-only'
    }, content.editToken);
    const {attempt} = library.createCoverAttempt(content.id, request.requestId, {host: 'codex'});
    const binding = {
        root: library.info.root,
        libraryId: library.info.libraryId,
        rootIdentity: library.info.rootIdentity
    };
    const task = {
        contentId: content.id,
        requestId: request.requestId,
        requestHash: request.requestHash,
        attemptId: attempt.attemptId,
        host: 'codex'
    };
    const directory = nativeHandoffDirectory(appDataFor(home));
    const {id} = await prepareNativeHandoff(directory, binding, task, release, {installedSkill: 'nova-content-cover-execution'});
    return {home, library, binding, task, id, directory};
}

test('standalone bundled launcher resolves handoff and completes context/claim/submit/status/replay with empty Node PATH', async t => {
    const f = await fixture(t), args = ['--handoff', f.id];
    const context = run(f.home, ['cover', 'context', ...args]);
    assert.equal(context.ok, true, context.message);
    assert.equal(context.result.request.requestId, f.task.requestId);
    assert.equal(context.result.body, '# Private request\r\n');
    assert.equal(run(f.home, ['cover', 'claim', ...args, '--stdin'], {
        host: 'workbuddy',
        readAssetHashes: []
    }).ok, false);
    const claimed = run(f.home, ['cover', 'claim', ...args, '--stdin'], {
        host: 'codex',
        readAssetHashes: [...new Set(context.result.inputs.map(item => item.assetHash))]
    });
    assert.equal(claimed.ok, true, claimed.message);
    const image = await sharp({create: {width: 24, height: 32, channels: 3, background: '#abcdef'}}).png().toBuffer();
    fs.writeFileSync(path.join(context.result.inbox, 'result.png'), image);
    const receipt = {
        libraryId: f.binding.libraryId, ...Object.fromEntries(['contentId', 'requestId', 'attemptId', 'requestHash'].map(key => [key, f.task[key]])),
        resultId: randomUUID(),
        files: [{name: 'result.png', sha256: createHash('sha256').update(image).digest('hex')}]
    };
    const committed = run(f.home, ['cover', 'submit', ...args, '--stdin'], receipt);
    assert.equal(committed.ok, true, committed.message);
    assert.equal(committed.result.candidateIds.length, 1);
    fs.unlinkSync(path.join(context.result.inbox, 'result.png'));
    const replay = run(f.home, ['cover', 'submit', ...args, '--stdin'], receipt);
    assert.equal(replay.ok, true, replay.message);
    assert.deepEqual(replay.result.candidateIds, committed.result.candidateIds);
    const status = run(f.home, ['cover', 'status', ...args]);
    assert.equal(status.result.coverJobs[0].attempts[0].status, 'committed');
    assert.equal(f.library.readContent(f.task.contentId).selectedCover, null);
});

test('handoff cannot be mixed with roots/IDs or used to create another request/attempt', async t => {
    const f = await fixture(t);
    for (const args of [['cover', 'context', '--handoff', f.id, '--content', f.task.contentId], ['cover', 'attempt', '--handoff', f.id, '--stdin'], ['cover', 'create', '--handoff', f.id, '--stdin']]) assert.equal(run(f.home, args, {}).code, 'INVALID_ARGUMENTS');
    assert.equal(f.library.readContent(f.task.contentId).coverJobs[0].attempts.length, 1);
    assert.equal(run(f.home, ['cover', 'context', '--handoff', randomUUID()]).ok, false);
});

test('required package stops before envelope resolution; stale same-ID root clone is rejected', async t => {
    const f = await fixture(t), required = new URL('../../../plugin/runtime/auth-required/', import.meta.url);
    const target = (await import('node:url')).fileURLToPath(required);
    assert.equal(run(f.home, ['cover', 'context', '--handoff', randomUUID()], undefined, target).code, 'AUTH_NOT_CONFIGURED');
    fs.renameSync(f.binding.root, `${f.binding.root}-original`);
    fs.cpSync(`${f.binding.root}-original`, f.binding.root, {recursive: true});
    assert.equal(run(f.home, ['cover', 'context', '--handoff', f.id]).code, 'CONFLICT');
});

test('cancel and fail use the same fixed handoff; inactive claim does not create a new attempt', async t => {
    const f = await fixture(t), args = ['--handoff', f.id];
    assert.equal(run(f.home, ['cover', 'fail', ...args, '--stdin'], {
        code: 'TEST_PROVIDER_UNAVAILABLE',
        message: 'Synthetic failure path'
    }).ok, true);
    assert.equal(run(f.home, ['cover', 'claim', ...args, '--stdin'], {
        host: 'codex',
        readAssetHashes: []
    }).code, 'ATTEMPT_INACTIVE');
    const next = f.library.createCoverAttempt(f.task.contentId, f.task.requestId, {host: 'codex'});
    const {id} = await prepareNativeHandoff(f.directory, f.binding, {
        ...f.task,
        attemptId: next.attempt.attemptId
    }, release, {installedSkill: 'nova-content-cover-execution'});
    assert.equal(run(f.home, ['cover', 'cancel', '--handoff', id]).ok, true);
    assert.equal(f.library.readContent(f.task.contentId).coverJobs[0].attempts.length, 2);
});
