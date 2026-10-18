import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {createLibrary} from '../../src/lib/file-library/index.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const built = path.join(root, 'plugin/runtime');
let parent, bundle, cli;
before(() => {
    parent = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'nch-runtime-cli-'));
    bundle = path.join(parent, 'independent-runtime');
    fs.cpSync(path.join(built, 'auth-disabled'), bundle, {recursive: true});
    cli = path.join(bundle, 'cover-runtime/cli.mjs');
});
after(() => {
    if (parent) fs.rmSync(parent, {recursive: true, force: true});
});

function run(args, input, entry = cli, extraEnv = {}) {
    const command = spawnSync(process.execPath, [entry, ...args], {
        cwd: parent,
        env: {...process.env, NODE_PATH: '', ...extraEnv},
        input: input === undefined ? undefined : typeof input === 'string' ? input : JSON.stringify(input),
        encoding: 'utf8',
        timeout: 15000,
    });
    assert.equal(command.error, undefined, command.stderr);
    assert.equal(command.signal, null, command.stderr);
    let value;
    try {
        value = JSON.parse(command.stdout);
    } catch {
        assert.fail(`CLI did not return JSON: ${command.stderr} ${command.stdout}`);
    }
    assert.equal(command.status, value.ok ? 0 : 1, command.stderr);
    return value;
}

async function fixture(t) {
    const dir = path.join(parent, randomUUID());
    fs.mkdirSync(dir);
    t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
    const library = createLibrary(path.join(dir, '内容库'));
    const samples = [];
    for (const color of ['#173e60', '#e1aa32']) {
        const bytes = await sharp({create: {width: 24, height: 32, channels: 3, background: color}}).png().toBuffer();
        const file = path.join(dir, `${samples.length}.png`);
        fs.writeFileSync(file, bytes);
        samples.push(library.importAsset(file, {purpose: 'template-reference'}));
    }
    const template = library.createTemplate({
        name: 'CLI integration fixture',
        definition: {original: true},
        resources: Object.fromEntries(samples.map((asset, i) => [String(i), {
            assetHash: asset.assetHash,
            bytes: asset.bytes,
            detectedType: asset.detectedType,
            role: 'style'
        }]))
    });
    const content = library.createContent({title: 'CLI 测试内容', body: '# 原始正文\r\n'});
    const base = ['--library', library.info.root, '--content', content.id];
    const request = {
        template: {id: template.id, version: 1},
        styleAssetHashes: samples.map(asset => asset.assetHash),
        photo: null,
        materialIds: [],
        prompt: '生成用于文件链路验收的测试图',
        pixels: {width: 24, height: 32},
        ratio: '3:4',
        count: 2,
        outputFormat: 'png',
        scope: 'cover-only'
    };
    return {dir, library, content, base, request};
}

test('both builds identify themselves and required mode refuses business IO before reading input or library', () => {
    const required = path.join(built, 'auth-required/cover-runtime/cli.mjs');
    for (const entry of [required, cli]) {
        for (const command of ['help', 'doctor']) {
            const output = run([command], undefined, entry);
            assert.equal(output.ok, true);
            assert.equal(output.experimental, true);
            assert.equal(output.productionReady, false);
            assert.equal(output.imageGeneration, false);
        }
    }
    const output = run(['create', '--library', path.join(parent, 'does-not-exist'), '--content', randomUUID(), '--file', path.join(parent, 'missing.json')], undefined, required, {
        AUTH_MODE: 'disabled',
        NOVA_AUTH_MODE: 'disabled'
    });
    assert.equal(output.code, 'AUTH_NOT_CONFIGURED');
    assert.equal(fs.existsSync(path.join(parent, 'does-not-exist')), false);
    assert.equal(run(['status', '--auth', 'disabled'], undefined, required).code, 'INVALID_ARGUMENTS');
});

test('independent packaged runtime fully decodes, submits, replays and exposes status through actual CLI commands', async t => {
    const resolved = createRequire(path.join(bundle, 'plugin-src/src/lib/image-validation/index.mjs')).resolve('sharp');
    assert.ok(resolved.startsWith(path.join(bundle, 'node_modules') + path.sep));
    const unified = (args, input) => run(['cover', ...args], input, path.join(bundle, 'plugin-src/src/cli.mjs'));
    const f = await fixture(t);
    const created = unified(['create', ...f.base, '--stdin'], {
        request: f.request,
        editToken: f.content.editToken,
        mutationId: randomUUID()
    });
    assert.equal(created.ok, true, created.message);
    assert.equal(Object.hasOwn(created.result, 'bodyBytes'), false);
    const req = created.result.request;
    const started = unified(['attempt', ...f.base, '--request', req.requestId, '--stdin'], {host: 'codex'});
    assert.equal(started.ok, true, started.message);
    const attemptId = started.result.attempt.attemptId;
    const args = [...f.base, '--request', req.requestId, '--attempt', attemptId];
    const context = unified(['context', ...args]);
    assert.equal(context.ok, true, context.message);
    assert.deepEqual(context, run(['context', ...args]));
    assert.equal(context.result.body, f.content.body);
    assert.equal(Object.hasOwn(context.result, 'bodyBytes'), false);
    assert.equal(unified(['claim', ...args, '--stdin'], {
        host: 'codex',
        readAssetHashes: [...new Set(context.result.inputs.map(input => input.assetHash))]
    }).ok, true);
    const files = [];
    for (const color of ['#506d45', '#bb384e']) {
        const bytes = await sharp({create: {width: 24, height: 32, channels: 3, background: color}}).png().toBuffer();
        const name = `result-${files.length}.png`;
        fs.writeFileSync(path.join(context.result.inbox, name), bytes);
        files.push({name, sha256: createHash('sha256').update(bytes).digest('hex')});
    }
    const receipt = {
        libraryId: f.library.info.libraryId,
        contentId: f.content.id,
        requestId: req.requestId,
        attemptId,
        requestHash: req.requestHash,
        resultId: randomUUID(),
        files
    };
    const receiptFile = path.join(f.dir, 'original-receipt.json');
    const raw = JSON.stringify(receipt, null, 2) + '\n';
    fs.writeFileSync(receiptFile, raw);
    const committed = unified(['submit', ...args, '--file', receiptFile]);
    assert.equal(committed.ok, true, committed.message);
    assert.equal(committed.result.candidateIds.length, 2);
    const content = f.library.readContent(f.content.id);
    assert.equal(content.candidates.length, 2);
    assert.ok(content.candidates.every(candidate => candidate.accepted === false));
    assert.equal(content.selectedCover, null);
    for (const file of files) fs.unlinkSync(path.join(context.result.inbox, file.name));
    const replayed = run(['submit', ...args, '--stdin'], raw);
    assert.equal(replayed.ok, true, replayed.message);
    assert.deepEqual(replayed.result.candidateIds, committed.result.candidateIds);
    assert.equal(unified(['status', ...f.base]).result.coverJobs.length, 1);
    assert.deepEqual(unified(['status', ...f.base]), run(['status', ...f.base]));
    const cancelled = unified(['attempt', ...f.base, '--request', req.requestId, '--stdin'], {
        host: 'workbuddy',
        reason: 'cancel test'
    });
    const nextArgs = [...f.base, '--request', req.requestId, '--attempt', cancelled.result.attempt.attemptId];
    assert.equal(unified(['cancel', ...nextArgs]).result.attempt.status, 'cancelled');
    const failed = unified(['attempt', ...f.base, '--request', req.requestId, '--stdin'], {
        host: 'workbuddy',
        reason: 'failure test'
    });
    assert.equal(unified(['fail', ...f.base, '--request', req.requestId, '--attempt', failed.result.attempt.attemptId, '--stdin'], {
        code: 'TOOL_UNAVAILABLE',
        message: '测试：未调用外部模型'
    }).result.attempt.status, 'failed');
    assert.equal(f.library.readContent(f.content.id).candidates.length, 2);
});

test('CLI bounds input, rejects malformed commands and never writes on transport failures', async t => {
    const f = await fixture(t);
    assert.equal(run(['create', ...f.base, '--stdin'], '{invalid').code, 'INVALID_JSON');
    assert.equal(run(['create', ...f.base, '--stdin'], ' '.repeat(65537)).code, 'INPUT_TOO_LARGE');
    const oversized = path.join(f.dir, 'oversized.json');
    fs.writeFileSync(oversized, ' '.repeat(65537));
    assert.equal(run(['create', ...f.base, '--file', oversized]).code, 'INPUT_TOO_LARGE');
    assert.equal(run(['create', ...f.base, '--stdin', '--file', oversized], '{}').code, 'INVALID_ARGUMENTS');
    assert.equal(run(['status', ...f.base, '--content', f.content.id]).code, 'INVALID_ARGUMENTS');
    assert.equal(run(['status', '--library', '.', '--content', f.content.id]).code, 'INVALID_ARGUMENTS');
    assert.equal(run(['status', ...f.base, '--stdin'], '{}').code, 'INVALID_ARGUMENTS');
    assert.equal(f.library.readContent(f.content.id).revision, 1);
});

test('the bundled Skill references the real CLI and contains no template or user library scripts', () => {
    const skillDir = path.join(bundle, 'skills/nova-content-cover-execution');
    const skill = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8');
    assert.match(skill, /^---\nname: nova-content-cover-execution\ndescription: .+\n---/);
    assert.ok(fs.existsSync(path.resolve(skillDir, '../../bin/run-node')));
    assert.match(skill, /\.\.\/\.\.\/bin\/run-node/);
    assert.match(skill, /submit/);
    assert.match(skill, /AUTH_NOT_CONFIGURED/);
});
