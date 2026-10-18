import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {HOST_EVENTS} from '../../plugin-src/src/content.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
let parent;
before(() => {
    parent = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'nch-unified-plugin-'));
    for (const mode of ['required', 'disabled']) fs.cpSync(path.join(root, `dist-cover-runtime/auth-${mode}`), path.join(parent, mode), {recursive: true});
});
after(() => fs.rmSync(parent, {recursive: true, force: true}));
const packagePath = (mode, relative) => path.join(parent, mode, relative);

function run(mode, args, input, extraEnv = {}, entry = 'plugin-src/src/cli.mjs') {
    const result = spawnSync(process.execPath, [packagePath(mode, entry), ...args], {
        cwd: parent,
        input: input === undefined ? '' : JSON.stringify(input),
        encoding: 'utf8',
        timeout: 4000,
        env: {...process.env, NODE_PATH: '', ...extraEnv}
    });
    assert.equal(result.error, undefined);
    const output = JSON.parse(result.stdout);
    assert.equal(result.status, output.ok === false ? 1 : 0, result.stderr);
    return {output, stderr: result.stderr};
}

function request(mode) {
    return {
        protocol: 'nova-content-hub-request',
        version: 1,
        appScope: 'nova-content-hub',
        authMode: mode,
        pairId: `nova-content-hub@0.2.0:p1:${mode}`,
        requestId: 'request-1',
        libraryId: 'library-1',
        targetId: 'content-1',
        kind: 'generate',
        templateId: 'template-1',
        templateVersion: 1,
        libraryRoot: null,
        pathsResolved: false,
        paths: {template: '模板/a', rules: '模板/b', target: '内容/c'},
        skill: 'nova-content-cover',
        options: {title: '明确命令空间', count: 1, ratio: '3:4'},
        rules: {fixed: [], varies: [], evidence: []},
        references: [],
        createdAt: '2026-10-17T00:00:00.000Z'
    };
}

test('both independent packages separate contract and cover commands and preserve the legacy wrapper', () => {
    for (const mode of ['required', 'disabled']) {
        assert.equal(run(mode, ['doctor']).output.authMode, mode);
        const summary = run(mode, ['contract', 'summary']).output;
        assert.equal(summary.release.AUTH_MODE, mode);
        assert.equal(summary.capabilities.libraryWrite, false);
        const context = run(mode, ['contract', 'context', '--stdin'], request(mode)).output;
        assert.equal(context.code, 'CONTEXT_UNAVAILABLE');
        assert.equal(context.executable, false);
        assert.equal(run(mode, ['context', '--stdin'], request(mode)).output.code, 'INVALID_ARGUMENTS');
        assert.deepEqual(run(mode, ['cover', 'doctor']).output, run(mode, ['doctor'], undefined, {}, 'cover-runtime/cli.mjs').output);
        const checked = run(mode, ['contract', 'check-request', '--stdin'], request(mode)).output;
        assert.equal(checked.code, mode === 'required' ? 'AUTH_NOT_CONFIGURED' : 'REQUEST_VALIDATED');
        assert.equal(run(mode, ['cover', 'context', '--stdin'], request(mode)).output.code, mode === 'required' ? 'AUTH_NOT_CONFIGURED' : 'INVALID_ARGUMENTS');
        for (const name of ['nova-content-cover', 'nova-content-template-restore', 'nova-content-template-study']) {
            assert.equal(run(mode, ['summary'], undefined, {}, `plugin-src/skills/${name}/scripts/content.mjs`).output.release.AUTH_MODE, mode);
        }
    }
});

test('required unified commands and legacy wrappers reject environment and argument auth overrides before IO', () => {
    const library = path.join(parent, 'must-not-create');
    const args = ['context', '--library', library, '--content', randomUUID(), '--request', randomUUID(), '--attempt', randomUUID()];
    const env = {AUTH_MODE: 'disabled', NOVA_AUTH_MODE: 'disabled', NCH_NO_AUTH: '1'};
    assert.equal(run('required', ['cover', ...args], undefined, env).output.code, 'AUTH_NOT_CONFIGURED');
    assert.equal(run('required', args, undefined, env, 'cover-runtime/cli.mjs').output.code, 'AUTH_NOT_CONFIGURED');
    assert.equal(run('required', ['cover', ...args, '--auth', 'disabled'], undefined, env).output.code, 'INVALID_ARGUMENTS');
    assert.equal(run('required', ['contract', 'check-request', '--stdin', '--auth', 'disabled'], request('required'), env).output.code, 'INVALID_ARGUMENTS');
    assert.equal(fs.existsSync(library), false);
});

test('one release file controls and validates both namespaces; missing or mismatched pairing cannot fall back', () => {
    const file = packagePath('required', 'plugin-src/src/release.json');
    const original = fs.readFileSync(file);
    const release = JSON.parse(original);
    assert.equal(fs.existsSync(packagePath('required', 'cover-runtime/release.json')), false);
    try {
        for (const change of [{format: undefined}, {productId: 'other'}, {appScope: 'other'}, {protocolVersion: 2}, {pairId: 'wrong'}, {AUTH_MODE: 'disabled'}, {version: '01.2.0'}, {productionReady: true}, {experimental: false}, {schemaVersion: 2}, {platform: 'other-platform'}]) {
            fs.writeFileSync(file, JSON.stringify({...release, ...change}));
            assert.equal(run('required', ['contract', 'summary']).output.code, 'PACKAGE_INVALID');
            assert.equal(run('required', ['cover', 'doctor']).output.code, change.platform ? 'PLATFORM_MISMATCH' : 'PACKAGE_INVALID');
        }
        fs.renameSync(file, file + '.hidden');
        assert.equal(run('required', ['contract', 'summary'], undefined, {AUTH_MODE: 'disabled'}).output.code, 'PACKAGE_INVALID');
        assert.equal(run('required', ['cover', 'doctor'], undefined, {AUTH_MODE: 'disabled'}).output.code, 'PACKAGE_NOT_BUILT');
    } finally {
        fs.writeFileSync(file, original);
        fs.rmSync(file + '.hidden', {force: true});
    }
});

test('implementation, hooks, skill capabilities, mode and hashed import resources agree in both packages', () => {
    for (const mode of ['required', 'disabled']) {
        const integrity = JSON.parse(fs.readFileSync(packagePath(mode, 'integrity.json')));
        const release = JSON.parse(fs.readFileSync(packagePath(mode, 'plugin-src/src/release.json')));
        assert.equal(integrity.pairId, release.pairId);
        assert.equal(integrity.AUTH_MODE, mode);
        for (const [relative, expected] of Object.entries(integrity.hashes)) assert.equal(createHash('sha256').update(fs.readFileSync(packagePath(mode, relative))).digest('hex'), expected, relative);
        assert.equal(Object.keys(integrity.skills).length, 4);
        for (const [name, capability] of Object.entries(integrity.skills)) {
            const cover = name === 'nova-content-cover-execution';
            assert.equal(capability.namespace, cover ? 'cover' : 'contract');
            assert.equal(capability.executable, cover && mode === 'disabled');
            assert.equal(fs.readFileSync(packagePath(mode, `plugin-src/skills/${name}/SKILL.md`), 'utf8'), fs.readFileSync(path.join(root, `plugin-src/skills/${name}/SKILL.md`), 'utf8'));
            if (cover) assert.equal(fs.readFileSync(packagePath(mode, `cover-runtime/skills/${name}/SKILL.md`), 'utf8'), fs.readFileSync(packagePath(mode, `plugin-src/skills/${name}/SKILL.md`), 'utf8'));
            else assert.equal(fs.existsSync(packagePath(mode, `plugin-src/skills/${name}/scripts/release.json`)), false);
        }
        for (const [host, events] of Object.entries(HOST_EVENTS)) for (const event of events) {
            const result = run(mode, ['hook', '--host', host, '--event', event], {
                hook_event_name: event,
                cwd: '/private',
                prompt: 'PRIVATE_PROMPT'
            });
            assert.equal(result.stderr, '');
            assert.doesNotMatch(JSON.stringify(result.output), /PRIVATE_PROMPT|\/private/);
            if (event === 'SessionStart') assert.match(result.output.hookSpecificOutput.additionalContext, /contract.*executable=false.*cover/);
            else assert.deepEqual(result.output, {});
        }
        const catalog = JSON.parse(fs.readFileSync(packagePath(mode, 'browser-import/builtin-resources.json')));
        assert.equal(Object.keys(catalog.entries).length, 72);
        for (const [relative, entry] of Object.entries(catalog.entries)) {
            const bytes = fs.readFileSync(packagePath(mode, `原型/${relative}`));
            assert.equal(bytes.length, entry.bytes);
            assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256);
        }
        for (const relative of ['plugin-src/src/cli.mjs', 'plugin-src/src/commands/cover.mjs', 'plugin-src/src/bridge/handoff.js']) {
            const text = fs.readFileSync(packagePath(mode, relative), 'utf8');
            assert.doesNotMatch(text, /from ['"](?:electron|node:child_process)['"]|shell\.open|execFile\(/);
            assert.equal(text, fs.readFileSync(path.join(root, relative), 'utf8'));
        }
    }
});
