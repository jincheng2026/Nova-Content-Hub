import test, {before} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir, stat, mkdtemp, rm, cp, writeFile, realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {spawn, spawnSync} from 'node:child_process';
import {join, resolve, dirname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build, skillNames} from '../build.mjs';
import {validateRequest, run, observeHook, HOST_EVENTS, validRelease} from '../src/content.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const releaseFor = mode => ({
    productId: 'nova-content-hub',
    version: '0.2.0',
    appScope: 'nova-content-hub',
    protocolVersion: 1,
    prototype: true,
    productionReady: false,
    AUTH_MODE: mode,
    pairId: `nova-content-hub@0.2.0:p1:${mode}`
});
const requestFor = (mode = 'disabled', kind = 'generate') => ({
    protocol: 'nova-content-hub-request',
    version: 1,
    appScope: 'nova-content-hub',
    authMode: mode,
    pairId: releaseFor(mode).pairId,
    requestId: 'request-01',
    libraryId: 'library-01',
    targetId: kind === 'generate' ? 'project-01' : 'template-01',
    templateId: 'template-01',
    templateVersion: 1,
    kind,
    skill: {
        analyze: 'nova-content-template-study',
        restore: 'nova-content-template-restore',
        generate: 'nova-content-cover'
    }[kind],
    libraryRoot: null,
    pathsResolved: false,
    paths: {template: '模板/template-01/模板.json', rules: '模板/template-01/拆解.md', target: '内容/project-01'},
    options: {title: '封面标题', count: 1, ratio: '3:4', pixels: [900, 1200]},
    rules: {fixed: ['固定规则'], varies: ['可变内容'], evidence: [{sourceIndex: 0, rule: '参考图证据'}]},
    references: [{id: 'image-01', version: 1}],
    createdAt: '2026-10-16T00:00:00.000Z',
});
let outputs;
before(async () => {
    outputs = await build('both');
});
const cli = (mode, args, input, env = {}) => spawnSync(process.execPath, [join(root, 'plugin/contract', `nova-content-hub-${mode}`, 'dist/content.mjs'), ...args], {
    input: typeof input === 'string' ? input : input === undefined ? '' : JSON.stringify(input),
    encoding: 'utf8',
    timeout: 3000,
    cwd: '/',
    env: {...process.env, ...env}
});

test('both builds carry exact release pairing and reject cross-mode requests', async () => {
    for (const {path, pairId} of outputs) {
        const release = JSON.parse(await readFile(join(path, 'contract.json'), 'utf8'));
        assert.equal(release.pairId, pairId);
        assert.equal(release.productionReady, false);
        assert.equal(release.prototype, true);
        const own = requestFor(release.AUTH_MODE);
        assert.equal(validateRequest(own, release).ok, true);
        assert.equal(validateRequest(requestFor(release.AUTH_MODE === 'required' ? 'disabled' : 'required'), release).code, 'PAIR_MISMATCH');
    }
});

test('invalid package releases fail closed in exported entrypoints', () => {
    const invalid = [null, {}, ...[
        {AUTH_MODE: 'garbage'}, {AUTH_MODE: undefined}, {pairId: 'wrong-pair'},
        {productId: 'other-product'}, {appScope: 'other-scope'}, {protocolVersion: 2},
        {prototype: false}, {productionReady: true}, {productionReady: undefined},
        {version: 'latest'}, {version: '01.2.0'},
    ].map(change => ({...releaseFor('required'), ...change}))];
    for (const release of invalid) {
        assert.equal(validRelease(release), false);
        for (const command of ['help', 'summary', 'context', 'check-request']) {
            const result = run(command, requestFor('required'), release);
            assert.equal(result.code, 'PACKAGE_INVALID');
            assert.equal(result.executable, false);
        }
        assert.equal(validateRequest(requestFor('required'), release).code, 'PACKAGE_INVALID');
    }
});

test('CLI rejects bad release.json before reading requests or reporting a disabled mode', async () => {
    const cwd = await realpath(await mkdtemp(join(tmpdir(), 'nch-invalid-release-')));
    try {
        await cp(join(root, 'plugin/contract/nova-content-hub-required/dist/content.mjs'), join(cwd, 'content.mjs'));
        await cp(join(root, 'workbench/prototype/shared/handoff.js'), join(cwd, 'handoff.js'));
        for (const change of [{AUTH_MODE: 'garbage'}, {AUTH_MODE: undefined}, {pairId: 'wrong-pair'}]) {
            await writeFile(join(cwd, 'release.json'), JSON.stringify({...releaseFor('required'), ...change}));
            for (const args of [['summary'], ['check-request', '--file', '/nonexistent-request.json']]) {
                const result = spawnSync(process.execPath, [join(cwd, 'content.mjs'), ...args], {
                    cwd,
                    encoding: 'utf8',
                    timeout: 3000
                });
                assert.equal(result.status, 1);
                assert.equal(JSON.parse(result.stdout).code, 'PACKAGE_INVALID');
                assert.doesNotMatch(result.stdout, /disabled_at_build/);
            }
        }
        assert.deepEqual((await readdir(cwd)).sort(), ['content.mjs', 'handoff.js', 'release.json']);
    } finally {
        await rm(cwd, {recursive: true, force: true});
    }
});

test('required fails closed; disabled only validates and returns unavailable paths', () => {
    const required = run('check-request', requestFor('required'), releaseFor('required'));
    assert.equal(required.code, 'AUTH_NOT_CONFIGURED');
    assert.equal(required.validated, true);
    const disabled = run('check-request', requestFor(), releaseFor('disabled'));
    assert.equal(disabled.code, 'REQUEST_VALIDATED');
    assert.equal(disabled.executable, false);
    for (const slot of Object.values(disabled.paths)) assert.deepEqual(slot, {status: 'unavailable', path: null});
});

test('all operations validate with matched skill; analyze can use null version', () => {
    for (const kind of ['analyze', 'restore', 'generate']) assert.equal(validateRequest(requestFor('disabled', kind), releaseFor('disabled')).ok, true);
    const request = requestFor('disabled', 'analyze');
    request.templateVersion = null;
    assert.equal(validateRequest(request, releaseFor('disabled')).ok, true);
    request.kind = 'restore';
    request.skill = 'nova-content-template-restore';
    assert.equal(validateRequest(request, releaseFor('disabled')).ok, false);
});

test('UI-sized batches, long rules, evidence objects and normalized integer ratios are supported', () => {
    const req = requestFor();
    req.options.count = 20;
    req.options.ratio = '1001:1334';
    req.options.pixels = [1001, 1334];
    req.rules.fixed = ['字'.repeat(1000)];
    req.rules.evidence = [{sourceIndex: 0, sourceId: 'image-01', rule: '字'.repeat(1000)}];
    assert.equal(validateRequest(req, releaseFor('disabled')).ok, true);
    for (const refs of [[{id: 'image-01', image: 'data:secret'}], [{id: 'image-01', token: 'secret'}]]) {
        assert.equal(validateRequest({...req, references: refs}, releaseFor('disabled')).ok, false);
        assert.equal(validateRequest({
            ...req,
            options: {...req.options, references: refs}
        }, releaseFor('disabled')).ok, false);
    }
});

test('bad identifiers, missing fields, malformed options and incompatible protocol are rejected', () => {
    for (const change of [{requestId: '../escape'}, {libraryId: ''}, {targetId: null}, {version: 2}, {skill: 'arbitrary'}, {templateVersion: 0}, {
        options: {
            title: '标题',
            count: 1,
            ratio: '3:4',
            pixels: [1, -1]
        }
    }, {options: {title: '标题', count: 1, ratio: '3:4', pixels: [100, 100]}}, {
        options: {
            title: '标题',
            count: 0,
            ratio: '3:4'
        }
    }, {options: {title: '标题', count: 1}}, {authorization: 'demo-active'}]) {
        assert.equal(validateRequest({...requestFor(), ...change}, releaseFor('disabled')).ok, false, JSON.stringify(change));
    }
    for (const request of [null, [], {}, 'input']) assert.equal(validateRequest(request, releaseFor('disabled')).ok, false);
});

test('paths remain planned and reject absolute, URL, traversal and claimed binding', () => {
    for (const path of ['/tmp/file', '../escape', 'a/../../b', 'C:\\secret', '\\server\\share', 'https://example.com', 'a\\..\\b', 'a//b']) {
        const req = requestFor();
        req.paths.target = path;
        assert.equal(validateRequest(req, releaseFor('disabled')).code, 'INVALID_PATH_CONTRACT', path);
    }
    for (const change of [{libraryRoot: '/tmp/library'}, {pathsResolved: true}]) assert.equal(validateRequest({...requestFor(), ...change}, releaseFor('disabled')).code, 'INVALID_PATH_CONTRACT');
});

test('context is read only and never echoes title, rules, references or paths', () => {
    const req = requestFor('required');
    req.options.title = 'PRIVATE_TITLE';
    req.rules.fixed = ['PRIVATE_RULE'];
    req.references[0].note = 'PRIVATE_REFERENCE';
    const context = run('context', req, releaseFor('required'));
    assert.equal(context.code, 'CONTEXT_UNAVAILABLE');
    assert.equal(typeof context.readableContext, 'string');
    assert.equal(context.structuredContext.kind, 'generate');
    assert.doesNotMatch(JSON.stringify(context), /PRIVATE_|模板\/|内容\//);
});

test('runtime flags and environment cannot disable required auth', () => {
    const env = {AUTH_MODE: 'disabled', NCH_NO_AUTH: '1', NOVA_AUTH_TOKEN: 'fake-client-token'};
    const result = cli('required', ['check-request', '--stdin'], requestFor('required'), env);
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stdout).code, 'AUTH_NOT_CONFIGURED');
    const bypass = cli('required', ['check-request', '--stdin', '--no-auth'], requestFor('required'), env);
    assert.equal(JSON.parse(bypass.stdout).code, 'INVALID_ARGUMENTS');
    assert.doesNotMatch(result.stdout, /fake-client-token/);
});

test('malformed and oversized JSON fail without executing', () => {
    for (const [input, code] of [['', 'INVALID_JSON'], ['{bad', 'INVALID_JSON'], [' '.repeat(17000), 'INPUT_TOO_LARGE']]) {
        const result = cli('disabled', ['check-request', '--stdin'], input);
        assert.equal(result.status, 1);
        assert.equal(JSON.parse(result.stdout).code, code);
    }
});

test('unimplemented task and commit stay explicit and create no files', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'nch-no-mutation-'));
    try {
        for (const command of ['task', 'taskstart', 'commit', 'import', 'generate', 'register']) {
            const result = spawnSync(process.execPath, [join(root, 'plugin/contract/nova-content-hub-required/dist/content.mjs'), command, 'start'], {
                cwd,
                encoding: 'utf8'
            });
            assert.equal(result.status, 1);
            assert.equal(JSON.parse(result.stdout).code, 'NOT_IMPLEMENTED');
        }
        assert.deepEqual(await readdir(cwd), []);
    } finally {
        await rm(cwd, {recursive: true, force: true});
    }
});

test('all hook events safely return JSON without project context or business completion', () => {
    for (const [host, events] of Object.entries(HOST_EVENTS)) for (const event of events) {
        assert.deepEqual(observeHook(host, event, {
            hook_event_name: event,
            prompt: 'PRIVATE_PROMPT',
            cwd: '/secret/library'
        }).output, {});
        const result = cli('required', ['hook', '--host', host, '--event', event], {
            hook_event_name: event,
            prompt: 'PRIVATE_PROMPT'
        });
        assert.equal(result.status, 0);
        const output = JSON.parse(result.stdout);
        assert.equal(result.stderr, '');
        assert.doesNotMatch(result.stdout, /PRIVATE_PROMPT|secret\/library|access_token|running|success/);
        if (event === 'SessionStart') {
            assert.equal(output.hookSpecificOutput.hookEventName, 'SessionStart');
            assert.match(output.hookSpecificOutput.additionalContext, /executable=false/);
        } else assert.deepEqual(output, {});
    }
});

test('empty, bad and unknown hook inputs are bounded safe JSON', () => {
    for (const [event, input, code] of [['Stop', '', 'INVALID_JSON'], ['Stop', '{bad', 'INVALID_JSON'], ['Stop', ' '.repeat(17000), 'INPUT_TOO_LARGE'], ['Unknown', '{}', 'UNKNOWN_HOOK_EVENT'], ['Stop', '{}', 'INVALID_HOOK_INPUT']]) {
        const result = cli('required', ['hook', '--host', 'codex', '--event', event], input);
        assert.equal(result.status, 0);
        assert.deepEqual(JSON.parse(result.stdout), {});
        assert.equal(JSON.parse(result.stderr).code, code);
    }
});

test('a host leaving stdin open cannot hold a hook past the short input budget', async () => {
    const started = performance.now();
    const child = spawn(process.execPath, [join(root, 'plugin/contract/nova-content-hub-required/dist/content.mjs'), 'hook', '--host', 'codex', '--event', 'Interrupt'], {stdio: ['pipe', 'pipe', 'pipe']});
    let stdout = '', stderr = '';
    child.stdout.on('data', value => {
        stdout += value;
    });
    child.stderr.on('data', value => {
        stderr += value;
    });
    const code = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            child.kill();
            reject(new Error('Hook exceeded two-second check budget'));
        }, 2000);
        child.on('error', reject);
        child.on('close', value => {
            clearTimeout(timer);
            resolve(value);
        });
    });
    assert.equal(code, 0);
    assert.deepEqual(JSON.parse(stdout), {});
    assert.equal(JSON.parse(stderr).code, 'INPUT_TIMEOUT');
    assert.ok(performance.now() - started < 2000);
});

test('Skill entrypoints have the required frontmatter and no scaffold placeholders', async () => {
    for (const name of skillNames) {
        const content = await readFile(join(root, 'plugin-src/skills', name, 'SKILL.md'), 'utf8');
        const frontmatter = /^---\nname: ([^\n]+)\ndescription: ([^\n]+)\n---\n/.exec(content);
        assert.ok(frontmatter, name);
        assert.equal(frontmatter[1], name);
        assert.ok(frontmatter[2].length > 10);
        assert.ok(name.length < 64 && /^[a-z0-9-]+$/.test(name));
        assert.doesNotMatch(content, /TODO|\[INSERT|\[TODO/);
    }
});

test('manifest and skill references exist inside each package; host event subscriptions do not duplicate', async () => {
    for (const {path, pairId} of outputs) {
        for (const [host, file] of [['codex', '.codex-plugin/plugin.json'], ['workbuddy', '.codebuddy-plugin/plugin.json']]) {
            const manifest = JSON.parse(await readFile(join(path, file), 'utf8'));
            assert.ok(manifest.description.includes(pairId));
            const hookPaths = [].concat(manifest.hooks);
            const skillPaths = [].concat(manifest.skills);
            for (const target of [...hookPaths, ...skillPaths]) {
                assert.ok(target.startsWith('./'));
                assert.ok(!target.includes('..'));
                await stat(join(path, target));
            }
            const events = [];
            for (const hookPath of hookPaths) {
                const hookFile = JSON.parse(await readFile(join(path, hookPath), 'utf8'));
                events.push(...Object.keys(hookFile.hooks));
                for (const [event, entries] of Object.entries(hookFile.hooks)) for (const entry of entries) for (const hook of entry.hooks) {
                    assert.equal(hook.type, 'command');
                    assert.ok(hook.command.includes('CLAUDE_PLUGIN_ROOT'));
                    if (event === 'Interrupt') assert.ok(hook.timeout <= 3);
                }
            }
            assert.equal(new Set(events).size, events.length);
            assert.deepEqual(events.sort(), [...HOST_EVENTS[host]].sort());
        }
        for (const name of skillNames) {
            await stat(join(path, 'skills', name, 'references/contract.md'));
            const result = spawnSync(process.execPath, [join(path, 'skills', name, 'scripts/content.mjs'), 'summary'], {
                cwd: '/',
                encoding: 'utf8'
            });
            assert.equal(result.status, 0);
            assert.equal(JSON.parse(result.stdout).release.pairId, pairId);
        }
    }
});

async function filesBelow(path) {
    const entries = await readdir(path, {withFileTypes: true});
    return (await Promise.all(entries.map(entry => entry.isDirectory() ? filesBelow(join(path, entry.name)) : [join(path, entry.name)]))).flat();
}

test('each standalone Skill contains its entire reference and license link graph', async () => {
    for (const {path} of outputs) for (const name of skillNames) {
        const base = await realpath(join(path, 'skills', name)), seen = new Set();
        const pending = [join(base, 'SKILL.md')];
        while (pending.length) {
            const file = pending.pop();
            if (seen.has(file)) continue;
            seen.add(file);
            const content = await readFile(file, 'utf8');
            for (const match of content.matchAll(/\[[^\]]+\]\(([^)\s]+)\)/g)) {
                const target = match[1].split('#')[0];
                if (!target || /^https?:\/\//.test(target)) continue;
                const actual = await realpath(resolve(dirname(file), decodeURIComponent(target)));
                assert.ok(actual.startsWith(base + sep), `Reference escapes standalone Skill: ${target}`);
                assert.ok((await stat(actual)).isFile());
                if (actual.endsWith('.md')) pending.push(actual);
            }
        }
        for (const file of ['references/contract.md', 'references/visual-workflow.md', 'references/upstream-notices.md']) assert.ok(seen.has(join(base, file)), file);
        for (const file of ['baoyu-MIT.txt', 'openai-Apache-2.0.txt', 'anthropic-Apache-2.0.txt']) {
            const license = await readFile(join(base, 'references/licenses', file), 'utf8');
            assert.match(license, /MIT License|Apache License/);
        }
    }
});
test('packages include no private keys, token files, external absolute source paths or dependencies', async () => {
    for (const {path} of outputs) for (const file of await filesBelow(path)) {
        assert.doesNotMatch(file.slice(path.length), /\.(pem|key|env)$|node_modules|entitlement/i);
        assert.doesNotMatch(await readFile(file, 'utf8'), /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|\/Users\/mac\/|access_token\s*[:=]/i);
    }
});

test('portable sh launcher resolves only its package location', () => {
    const result = spawnSync('sh', [join(root, 'plugin/contract/nova-content-hub-required/bin/run-node'), 'summary'], {
        encoding: 'utf8',
        cwd: '/'
    });
    assert.equal(result.status, 0);
    assert.equal(JSON.parse(result.stdout).release.AUTH_MODE, 'required');
});
