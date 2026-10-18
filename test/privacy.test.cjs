const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Core = require('../原型/core.js');
const oldCover = '图库/封面候选/封面-01.jpg';
const newCover = '图库/示例/cover-01.svg';
const userImage = 'data:image/png;base64,Y3VzdG9t';

function fingerprint(value) {
    let a = 2166136261, b = 3339675911;
    for (let i = 0; i < value.length; i++) {
        a = Math.imul(a ^ value.charCodeAt(i), 16777619);
        b = Math.imul(b ^ value.charCodeAt(i), 2246822507);
    }
    return `${value.length}:${(a >>> 0).toString(16).padStart(8, '0')}:${(b >>> 0).toString(16).padStart(8, '0')}`;
}

function data() {
    const ctx = {window: {}, localStorage: {getItem: () => null}, Date};
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync('原型/data.js', 'utf8'), ctx);
    return ctx.window.NCH;
}

const config = {prototype: true, AUTH_MODE: 'disabled', appScope: 'nova-content-hub', version: '0.2.0'};

function memory() {
    const values = new Map();
    return {getItem: k => values.get(k) || null, setItem: (k, v) => values.set(k, v)};
}

function workspace(storage = memory(), D = data()) {
    return {D, W: Core.create(D, storage, config), storage};
}

function legacy(storage = memory()) {
    const {W, D} = workspace(storage);
    W.commit();
    const saved = W.snapshot(), project = W.addProject('用户自己创建的项目');
    project.files.push({id: 'custom-file', name: '用户附件.png', size: '6 B', content: userImage});
    saved.data.PROJECTS.push(JSON.parse(JSON.stringify(project)));
    saved.data.ACCOUNT.name = '用户自定义账号';
    saved.data.ACCOUNT.photos.push({id: 'custom-photo', name: '用户图片.png', img: userImage});
    saved.data.PROJECTS[0].materials[0].batches[0].cands[0].img = oldCover;
    saved.data.PROJECTS[0].posts[0].pub = {
        at: '2026-10-16',
        link: '',
        snapshot: {candidateId: 'old-candidate', batch: 1, img: oldCover, px: [1080, 1440]}
    };
    saved.trash.push({id: 'old-shot', kind: 'shot', tid: D.TEMPLATES[0].id, value: oldCover});
    return saved;
}

test('fictional seeds retain 13 original SVGs and only manifest-declared AI PNG assets', () => {
    const D = data(), {W} = workspace(memory(), D), snapshot = W.snapshot();
    const names = fs.readdirSync('原型/图库/示例');
    assert.equal(names.length, 13);
    assert.deepEqual(fs.readdirSync('原型/图库').sort(), ['AI参考', '内置模板', '示例'].sort());
    const refs = require('../原型/builtin-templates.js').flatMap(t => t.generatedReferences || []);
    assert.equal(refs.length, 30);
    assert.deepEqual(fs.readdirSync('原型/图库/AI参考').sort(), refs.map(a => a.path.split('/').at(-1)).sort());
    for (const ref of refs) assert.equal(fs.readFileSync('原型/' + ref.path).subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    for (const name of names) {
        assert.match(name, /\.svg$/);
        const svg = fs.readFileSync('原型/图库/示例/' + name, 'utf8');
        assert.match(svg, /原创几何插画/);
        assert.doesNotMatch(svg, /<image|<script|href=|foreignObject|data:/i);
    }
    const serialized = JSON.stringify(snapshot);
    assert.doesNotMatch(serialized, /图库\/(?:照片|对标封面|头像|封面候选)\//);
    for (const path of new Set(serialized.match(/图库\/[^"\\]+/g))) assert.ok(fs.existsSync('原型/' + path));
    assert.equal(Core.source(newCover), true);
    assert.equal(Core.source('用户/任意.svg'), false);
    assert.equal(Core.source('data:image/svg+xml;base64,PHN2Zz4='), false);
    assert.equal(D.DEMO_REPLACEMENTS[fingerprint(oldCover)], newCover);
});
test('startup and rollback migrate known demo paths while preserving custom projects, account and bytes', () => {
    const storage = memory(), saved = legacy();
    storage.setItem(Core.KEY, JSON.stringify(saved));
    storage.setItem(Core.KEY + '-previous', JSON.stringify(saved));
    const {W, D} = workspace(storage);
    assert.equal(W.readonly, false);
    assert.equal(D.ACCOUNT.name, '用户自定义账号');
    assert.equal(D.ACCOUNT.photos.at(-1).img, userImage);
    assert.equal(D.PROJECTS.at(-1).files[0].content, userImage);
    for (const key of [Core.KEY, Core.KEY + '-previous']) {
        const raw = storage.getItem(key);
        assert.equal(raw.includes(oldCover), false);
        assert.ok(raw.includes(newCover));
        assert.equal(JSON.parse(raw).data.PROJECTS[0].posts[0].pub.snapshot.px, undefined);
    }
    W.previous();
    assert.equal(D.PROJECTS.at(-1).name, '用户自己创建的项目');
});
test('known embedded demo bytes and default identity migrate on import without guessing other images', () => {
    const D = data(), oldBytes = 'data:image/png;base64,c3ludGhldGljLW9sZC1kZW1v', oldName = '旧演示身份测试夹具';
    D.DEMO_REPLACEMENTS[fingerprint(oldBytes)] = newCover;
    D.DEMO_REPLACEMENTS[fingerprint(oldName)] = '星河 · 创作实验室';
    const {W, storage} = workspace(memory(), D);
    W.commit();
    const saved = legacy();
    saved.data.ACCOUNT.name = oldName;
    saved.data.ACCOUNT.avatar = oldBytes;
    saved.data.PROJECTS[0].files.push({
        id: 'known-demo-bytes',
        name: '演示图片.png',
        size: '24 B',
        content: oldBytes,
        bytes: 24,
        type: 'image/png'
    });
    const t = saved.data.TEMPLATES[0];
    t.shots[0] = oldBytes;
    t.state = '可用';
    t.evidence = [{sourceIndex: 0, rule: '旧演示证据'}];
    t.validation = {restoreImage: oldBytes, accepted: true};
    W.importBackup(JSON.stringify(saved));
    const migrated = W.snapshot();
    assert.equal(migrated.data.ACCOUNT.name, '星河 · 创作实验室');
    assert.equal(migrated.data.ACCOUNT.avatar, newCover);
    assert.equal(migrated.data.TEMPLATES[0].state, '待拆解');
    assert.equal(migrated.data.TEMPLATES[0].validation, null);
    const file = migrated.data.PROJECTS[0].files.find(f => f.id === 'known-demo-bytes');
    assert.equal(file.content, undefined);
    assert.equal(file.bytes, undefined);
    assert.equal(file.type, undefined);
    assert.equal(migrated.data.PROJECTS.at(-1).files[0].content, userImage);
    assert.equal(storage.getItem(Core.KEY).includes(oldBytes), false);
});
test('migration storage failure leaves original storage intact and blocks later writes', () => {
    const storage = memory(), raw = JSON.stringify(legacy());
    storage.setItem(Core.KEY, raw);
    storage.setItem = () => {
        throw Error('quota');
    };
    const {W} = workspace(storage);
    assert.equal(W.readonly, true);
    assert.equal(storage.getItem(Core.KEY), raw);
    assert.match(W.error, /迁移失败/);
    assert.throws(() => W.commit());
});

test('new creator samples expose no third-party private identity or source file', () => {
    const creators = require('../原型/builtin-templates.js').filter(t => ['builtin-tech-collage', 'builtin-big-head', 'builtin-life-story'].includes(t.id));
    assert.equal(creators.length, 3);
    for (const t of creators) {
        assert.equal(t.provenance.privacy, 'fictional');
        assert.equal(t.source, 'Nova Content Hub 原创设计');
        assert.doesNotMatch(JSON.stringify(t), /科技姐|同事|\/Users\/|file:\/\/|data:image/);
        assert.match(t.generation.referencePolicy, /样图中人物为虚构/);
    }
});
