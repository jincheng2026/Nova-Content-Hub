// Contract integration only: no browser, real authorization, host or business library.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root = new URL('../../../', import.meta.url);
test('both prototype bundles retain the fictional examples and declared gallery directories', () => {
    for (const mode of ['required', 'disabled']) {
        const gallery = new URL(`workbench/dist-prototype/auth-${mode}/图库/`, root);
        assert.deepEqual(readdirSync(gallery).sort(), ['AI参考', '内置模板', '示例'].sort());
        const examples = new URL('示例/', gallery), names = readdirSync(examples);
        assert.equal(names.length, 13);
        for (const name of names) {
            assert.match(name, /\.svg$/);
            const image = readFileSync(new URL(name, examples), 'utf8');
            assert.match(image, /原创几何插画/);
            assert.doesNotMatch(image, /<image|<script|href=|foreignObject|data:/i);
        }
        const snapshot = JSON.stringify(workspace(mode).W.snapshot());
        assert.doesNotMatch(snapshot, /图库\/(?:照片|对标封面|头像|封面候选)\//);
    }
});

function workspace(mode) {
    const values = new Map();
    const context = vm.createContext({
        URL, crypto: webcrypto, localStorage: {
            getItem: key => values.get(key) ?? null,
            setItem: (key, value) => values.set(key, String(value)),
        }
    });
    context.window = context;
    for (const name of ['build-config.js', 'data.js', 'builtin-templates.js', 'shared/handoff.js', 'core.js']) {
        const source = readFileSync(new URL(`workbench/dist-prototype/auth-${mode}/${name}`, root), 'utf8');
        vm.runInContext(source, context, {filename: name});
    }
    return {D: context.NCH, W: context.NCH_WORKSPACE, config: context.NCH_BUILD};
}

function check(mode, request, env = {}) {
    const cli = fileURLToPath(new URL(`plugin/contract/nova-content-hub-${mode}/dist/content.mjs`, root));
    const result = spawnSync(process.execPath, [cli, 'check-request', '--stdin'], {
        input: JSON.stringify(request), encoding: 'utf8', timeout: 5000,
        env: {...process.env, ...env},
    });
    assert.ifError(result.error);
    assert.ok(result.stdout.trim(), result.stderr);
    return {...JSON.parse(result.stdout), exitStatus: result.status};
}

function requests(mode) {
    const {D, W, config} = workspace(mode);
    W.setAuth('active'); // Explicit UI simulation. The plugin must never trust this.
    const template = D.TEMPLATES.find(t => t.shots.length);
    const analyze = W.request('analyze', template);
    W.rules(template, {
        fixed: ['标题保持明确的主次层级'],
        varies: ['本次项目标题'],
        evidence: [{sourceIndex: 0, rule: '主标题占上半部'}]
    });
    const restore = W.request('restore', template);
    template.validation = {restoreImage: template.img, accepted: false};
    W.acceptTemplate(template);
    const project = D.PROJECTS.find(p => p.kind === '内容');
    const reference = W.referenceChoices(template, project)[0];
    const generate = W.request('generate', project, {
        title: '真实契约联调：标题层级', count: 20, format: '竖版', ratio: '3:4', pixels: [1080, 1440],
        templateId: template.id, references: [{id: reference.id, version: reference.version, note: reference.note}],
    });
    return {D, W, config, template, analyze, restore, generate};
}

test('three UI request kinds match the disabled plugin and remain non-executable', () => {
    const made = requests('disabled');
    for (const kind of ['analyze', 'restore', 'generate']) {
        const out = check('disabled', made[kind]);
        assert.equal(out.code, 'REQUEST_VALIDATED', JSON.stringify(out));
        assert.equal(out.exitStatus, 0);
        assert.equal(out.validated, true);
        assert.equal(out.executable, false);
    }
});

test('simulated active authorization does not authorize the required plugin', () => {
    const made = requests('required');
    for (const kind of ['analyze', 'restore', 'generate']) {
        const out = check('required', made[kind], {AUTH_MODE: 'disabled', NCH_AUTH: 'active'});
        assert.equal(out.code, 'AUTH_NOT_CONFIGURED', JSON.stringify(out));
        assert.equal(out.exitStatus, 1);
        assert.equal(out.executable, false);
    }
});

test('pairing mismatch is rejected before a cross-mode handoff', () => {
    const made = requests('disabled');
    assert.equal(check('required', made.generate).code, 'PAIR_MISMATCH');
    const release = JSON.parse(readFileSync(new URL('plugin/contract/nova-content-hub-disabled/dist/release.json', root)));
    assert.equal(release.pairId, made.config.pairId);
    assert.equal(release.appScope, made.config.appScope);
    assert.equal(release.protocolVersion, made.config.protocolVersion);
});

test('generation snapshot survives later template edits and excludes binary images', () => {
    const made = requests('disabled');
    const previousRule = made.generate.rules.fixed[0];
    const version = made.generate.templateVersion;
    made.template.fixed[0] = '之后的新规则';
    made.template.version++;
    assert.equal(made.generate.rules.fixed[0], previousRule);
    assert.equal(made.generate.templateVersion, version);
    assert.equal(JSON.stringify(made.generate).includes('data:image/'), false);
    assert.equal(made.generate.libraryRoot, null);
    assert.equal(made.generate.pathsResolved, false);
});

test('contract rejects paths and injected image/token fields rather than forwarding them', () => {
    const made = requests('disabled');
    made.generate.paths.target = '../outside';
    assert.equal(check('disabled', made.generate).code, 'INVALID_PATH_CONTRACT');
    made.generate.paths.target = '内容/project-example';
    made.generate.references[0].token = 'audit-not-a-credential';
    assert.equal(check('disabled', made.generate).code, 'INVALID_REQUEST');
});

test('preset decimal ratios normalize at the UI request exit and validate in the real CLI', () => {
    const made = requests('disabled');
    const project = made.D.PROJECTS.find(p => p.kind === '内容');
    const request = made.W.request('generate', project, {
        title: '公众号头图测试', count: 4, format: '头图', ratio: '2.35:1', pixels: null,
        templateId: made.template.id, references: [],
    });
    assert.equal(request.options.ratio, '47:20');
    assert.equal(check('disabled', request).code, 'REQUEST_VALIDATED');
});

test('UI rejects reference, pixel and serialized transport overflow before exporting a request', () => {
    const made = requests('disabled');
    const project = made.D.PROJECTS.find(p => p.kind === '内容');
    assert.throws(() => made.W.request('generate', project, {
        title: '过大像素', count: 4, format: '方图', ratio: '1:1', pixels: [17000, 17000],
        templateId: made.template.id, references: [],
    }));
    made.template.shots = Array(33).fill(made.template.img);
    assert.throws(() => made.W.request('analyze', made.template));
    made.template.shots = [made.template.img];
    made.template.fixed = Array(30).fill('图'.repeat(1000));
    assert.throws(() => made.W.request('analyze', made.template));
});

test('both delivered prototypes load the complete ZIP helper before the app', () => {
    for (const mode of ['required', 'disabled']) {
        const base = new URL(`workbench/dist-prototype/auth-${mode}/`, root),
            html = readFileSync(new URL('index.html', base), 'utf8');
        assert.ok(html.indexOf('shared/zip.js') > 0 && html.indexOf('shared/zip.js') < html.indexOf('app.js'));
        assert.equal(readFileSync(new URL('shared/zip.js', base), 'utf8'), readFileSync(new URL('workbench/prototype/shared/zip.js', root), 'utf8'));
    }
});
