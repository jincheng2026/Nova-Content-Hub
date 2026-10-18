import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';
import Ajv2020 from 'ajv/dist/2020.js';
import {validateRequest, run} from '../plugin-src/src/content.mjs';
import Handoff from '../原型/shared/handoff.js';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const ajv = new Ajv2020({strict: false, allErrors: true});
ajv.addFormat('date-time', s => /^\d{4}-\d{2}-\d{2}T/.test(s) && Number.isFinite(Date.parse(s)));
for (const file of readdirSync(new URL('schemas/', root)).filter(x => x.endsWith('.schema.json'))) ajv.addSchema(JSON.parse(read('schemas/' + file)));
const schema = name => ajv.getSchema('https://nova-content-hub.local/schemas/' + name + '.schema.json');

function workspace(mode = 'disabled') {
    const storage = new Map(), context = vm.createContext({
        URL,
        crypto: webcrypto,
        localStorage: {getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value)}
    });
    context.window = context;
    for (const file of ['build-config.js', 'data.js', 'builtin-templates.js', 'shared/handoff.js', 'core.js']) vm.runInContext(read(`dist-prototype/auth-${mode}/${file}`), context);
    const {NCH: D, NCH_WORKSPACE: W} = context;
    W.setAuth('active');
    const p = D.PROJECTS.find(x => x.kind === '内容'), t = D.TEMPLATES.find(x => x.id.startsWith('builtin-'));
    const request = W.request('generate', p, {
        title: '标题包含 & ? # 中文',
        count: 1,
        ratio: '3:4',
        pixels: [900, 1200],
        templateId: t.id,
        references: []
    });
    const task = W.addTask(request);
    return {D, W, task, request, envelope: clone(task.handoff), release: {...W.config, productionReady: false}};
}

function assertSchema(name, value, expected = true) {
    const check = schema(name);
    assert.equal(check(value), expected, JSON.stringify(check.errors));
}

test('real built workspace, request, handoff and authored catalog satisfy independent JSON Schema 2020-12', () => {
    for (const mode of ['disabled', 'required']) {
        const made = workspace(mode);
        assertSchema('workspace', clone(made.W.snapshot()));
        assertSchema('request', clone(made.request));
        assertSchema('handoff', made.envelope);
        assert.equal(Handoff.validate(made.envelope, {
            release: made.release,
            validateRequest: q => validateRequest(q, made.release)
        }).ok, true);
    }
    assertSchema('template-catalog', JSON.parse(read('builtin-templates/catalog.json')));
});
test('independent schemas and runtime reject malformed envelopes and nested requests', () => {
    const made = workspace();
    const mutations = [
        x => {
            x.target.host = 'https://evil.test';
        }, x => {
            x.target.mode = 'resume';
            x.target.sessionId = '../escape';
        },
        x => {
            x.context.project.token = 'secret';
        }, x => {
            x.context.references = [{id: 'asset-1', name: 'image', path: '/secret'}];
        },
        x => {
            x.request.options.count = 0;
        }, x => {
            x.request.paths.target = '../escape';
        }, x => {
            x.request.paths.extra = '内容/other';
        },
        x => {
            x.context.materials = new Array(17).fill({id: 'same', name: 'too many'});
        }, x => {
            x.context.project.summary = 'x'.repeat(2001);
        },
    ];
    for (const mutate of mutations) {
        const e = clone(made.envelope);
        mutate(e);
        assertSchema('handoff', e, false);
        assert.equal(Handoff.validate(e, {
            release: made.release,
            validateRequest: q => validateRequest(q, made.release)
        }).ok, false);
    }
});
test('runtime adds cross-field binding and UTF8 limits that structural schemas cannot express', () => {
    const made = workspace();
    for (const mutate of [x => {
        x.context.libraryId = 'another-library';
    }, x => {
        x.context.template.version++;
    }, x => {
        x.context.project.id = 'another-project';
    }, x => {
        x.context.template.fixed = ['changed'];
    }]) {
        const e = clone(made.envelope);
        mutate(e);
        assertSchema('handoff', e);
        assert.equal(Handoff.validate(e, {release: made.release}).code, 'CONTEXT_MISMATCH');
    }
    const huge = clone(made.envelope);
    huge.request = null;
    huge.context.template.fixed = Array(32).fill('字'.repeat(1000));
    assertSchema('handoff', huge);
    assert.equal(Handoff.validate(huge).code, 'INPUT_TOO_LARGE');
});
test('host URLs encode content, require explicit resume targets and fall back to an attached JSON for long content', () => {
    const made = workspace(), e = made.envelope;
    const template = clone(e.context.template);
    e.request = null;
    e.context.template = null;
    e.context.materials = [];
    e.context.references = [];
    e.context.project.name = '标题包含 & ? # 中文';
    e.context.project.summary = '';
    for (const host of ['codex', 'workbuddy']) {
        e.target = {host, mode: 'new', sessionId: null};
        const output = Handoff.url(e, {release: made.release});
        assert.equal(output.ok, true);
        const u = new URL(output.url);
        assert.equal(u.protocol, host + ':');
        assert.ok(u.searchParams.get('prompt').includes('标题包含 & ? # 中文'));
        assert.equal(u.searchParams.get('cwd'), null);
        assert.equal(u.searchParams.get('path'), null);
        assert.equal(made.task.state, 'handoff');
    }
    e.target = {host: 'codex', mode: 'resume', sessionId: 'session-original'};
    assert.equal(new URL(Handoff.url(e).url).pathname, '/session-original');
    e.target.host = 'workbuddy';
    assert.equal(Handoff.url(e).code, 'RESUME_UNAVAILABLE');
    e.target = {host: 'codex', mode: 'new', sessionId: null};
    e.context.template = template;
    e.context.template.fixed = Array(10).fill('风格约束'.repeat(100));
    const long = Handoff.url(e);
    assert.equal(long.requiresAttachment, true);
    assert.ok(Handoff.utf8Bytes(long.url) < 6000);
    assert.match(long.prompt, /附上交接 JSON/);
    assert.doesNotMatch(long.prompt, /风格约束/);
});
test('required browser simulation and runtime flags never authorize a real content-bearing launch', () => {
    const made = workspace('required');
    assert.equal(made.W.auth, 'active');
    assert.equal(Handoff.url(made.envelope, {release: made.release}).code, 'AUTH_NOT_CONFIGURED');
    const changed = clone(made.envelope);
    changed.authMode = 'disabled';
    assert.equal(Handoff.url(changed, {release: made.release}).code, 'PAIR_MISMATCH');
    assert.equal(Handoff.homeUrl('codex'), 'codex://threads/new');
    assert.throws(() => Handoff.homeUrl('javascript'), /INVALID_TARGET/);
});
test('actual packaged check-handoff validates both modes without echoing project content or executing', () => {
    for (const mode of ['required', 'disabled']) {
        const made = workspace(mode),
            file = new URL(`dist-plugin-contract/nova-content-hub-${mode}/dist/content.mjs`, root);
        const result = spawnSync(process.execPath, [file.pathname, 'check-handoff', '--stdin'], {
            input: JSON.stringify(made.envelope),
            encoding: 'utf8',
            timeout: 5000,
            cwd: '/',
            env: {...process.env, AUTH_MODE: 'disabled'}
        });
        const output = JSON.parse(result.stdout);
        assert.equal(output.code, mode === 'required' ? 'AUTH_NOT_CONFIGURED' : 'HANDOFF_VALIDATED');
        assert.equal(output.executable, false);
        assert.equal(output.handoffId, made.envelope.handoffId);
        assert.doesNotMatch(result.stdout, /标题包含|风格约束|data:image/);
        assert.equal(run('check-handoff', made.envelope, made.release).code, output.code);
    }
});
test('bundled native hook context is minimal guidance and cannot acknowledge business success', () => {
    const made = workspace();
    assert.equal(run('doctor', null, made.release).capabilities.handoffValidation, true);
    for (const mode of ['required', 'disabled']) {
        const file = new URL(`dist-plugin-contract/nova-content-hub-${mode}/dist/content.mjs`, root);
        const result = spawnSync(process.execPath, [file.pathname, 'hook', '--host', 'codex', '--event', 'SessionStart'], {
            input: JSON.stringify({
                hook_event_name: 'SessionStart',
                cwd: '/private-library',
                prompt: 'PRIVATE_CONTENT',
                session_id: 'PRIVATE_SESSION'
            }), encoding: 'utf8', timeout: 3000
        });
        const output = JSON.parse(result.stdout);
        assert.match(output.hookSpecificOutput.additionalContext, /executable=false/);
        assert.doesNotMatch(result.stdout, /PRIVATE_CONTENT|PRIVATE_SESSION|private-library/);
    }
});
test('all fifteen self-media designs build bounded requests accepted by the packaged CLI', () => {
    const made = workspace(), templates = made.D.TEMPLATES.filter(t => made.W.isBuiltinTemplate(t)),
        p = made.D.PROJECTS.find(x => x.kind === '内容');
    assert.equal(templates.length, 15);
    assert.equal(templates.filter(t => t.audience === 'general').length, 11);
    assert.equal(templates.filter(t => t.audience === 'ai').length, 4);
    for (const t of templates) {
        const chosen = made.W.referenceChoices(t, p).find(a => a.kind === 'ai');
        const refs = chosen ? [{id: chosen.id, version: chosen.version, note: chosen.note}] : [];
        const req = made.W.request('generate', p, {
            title: '新主题：从观察到实践',
            count: 1,
            ratio: '3:4',
            pixels: [900, 1200],
            templateId: t.id,
            references: refs
        });
        assertSchema('request', clone(req));
        assert.ok(Buffer.byteLength(JSON.stringify(req, null, 2)) <= 16384, t.id);
        assert.doesNotMatch(JSON.stringify(req), /\{(?:title|ratio|subject|topic|facts|supportingText)\}|data:image|图库\//);
        assert.ok(req.rules.fixed.some(x => x.startsWith('本次提示词骨架：')));
        const result = spawnSync(process.execPath, [new URL('dist-plugin-contract/nova-content-hub-disabled/dist/content.mjs', root).pathname, 'check-request', '--stdin'], {
            input: JSON.stringify(req),
            encoding: 'utf8',
            timeout: 5000
        });
        assert.ifError(result.error);
        const output = JSON.parse(result.stdout);
        assert.equal(output.code, 'REQUEST_VALIDATED', t.id);
        assert.equal(output.executable, false);
    }
});
test('both delivered bundles include actual AI reference bytes and their reproducible prompts', () => {
    const catalog = JSON.parse(read('builtin-templates/catalog.json'));
    const refs = catalog.templates.flatMap(t => t.generatedReferences);
    assert.equal(refs.length, 30);
    for (const mode of ['disabled', 'required']) for (const ref of refs) {
        const png = readFileSync(new URL(`dist-prototype/auth-${mode}/${ref.path}`, root));
        assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
        assert.equal(png.readUInt32BE(16), ref.width);
        assert.equal(png.readUInt32BE(20), ref.height);
        assert.deepEqual(png, readFileSync(new URL('原型/' + ref.path, root)));
        assert.equal(read(`dist-prototype/auth-${mode}/${ref.promptFile}`), read(ref.promptFile));
        assert.equal(ref.accepted, false);
        assert.equal(ref.role, 'style');
    }
});
test('independent design schema rejects invalid nested design, reference and review records', () => {
    const template = JSON.parse(read('builtin-templates/catalog.json')).templates.find(t => t.generatedReferences.length);
    assertSchema('template-design', template);
    for (const mutate of [
        x => {
            x.audience = 'travel';
        }, x => {
            x.anatomy[0].editable = 'yes';
        },
        x => {
            x.generation.variables[0].key = '../title';
        }, x => {
            x.generation.extra = 'unrecognized';
        },
        x => {
            x.generatedReferences[0].accepted = true;
        }, x => {
            x.generatedReferences[0].path = '../private.png';
        },
        x => {
            x.review = {templateVersion: 2, checks: {title: 'pass'}, reason: '', reviewedAt: 'not-a-date'};
        },
    ]) {
        const changed = clone(template);
        mutate(changed);
        assertSchema('template-design', changed, false);
    }
});
