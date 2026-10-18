import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import Core from '../legacy/core.js';
import {inspectBrowserBackup} from '../index.mjs';
import {readBrowserBackup} from '../inspect.mjs';

const image = 'data:image/png;base64,iVBORw0KGgo=';

function backup() {
    const template = {
        id: 'template',
        name: '导入样张组',
        version: 1,
        state: '待拆解',
        desc: '',
        style: '',
        fit: '',
        unfit: '',
        source: '',
        from: '',
        owner: '',
        ratio: '3:4',
        builtin: false,
        madeAt: '2026-10-16',
        used: 0,
        shots: [image, 'reference/missing.png'],
        img: image,
        why: [],
        fixed: [],
        varies: [],
        evidence: [],
        colors: []
    };
    const project = id => ({
        id,
        kind: '内容',
        name: id,
        folder: `内容/${id}`,
        tpl: 'template',
        channels: ['抖音'],
        dates: {record: '2026-10-16'},
        plan: '',
        files: [{id: 'attachment', name: 'private.txt', size: '未知', srcPath: 'private.txt'}],
        materials: [{
            id: 'portrait',
            name: '竖版',
            format: '竖版',
            ratio: '3:4',
            tpl: 'template',
            batches: [{
                no: 1,
                at: '2026-10-16',
                tpl: 'template',
                state: 'done',
                cands: [{id: 'same-old-id', no: '01', img: image, use: true, fav: false}]
            }]
        }],
        posts: [{
            id: 'post',
            date: '2026-10-18',
            time: '',
            channel: '抖音',
            mat: 'portrait',
            text: '私有渠道文案',
            pub: {at: '2026-10-18', link: '', snapshot: {candidateId: 'same-old-id', batch: 1, img: image}}
        }]
    });
    return {
        format: 'nova-content-hub-browser',
        schema: 1,
        appScope: 'nova-content-hub',
        libraryId: 'old-library',
        updatedAt: '2026-10-17T00:00:00.000Z',
        data: {
            ACCOUNT: {
                name: '私有资料名称',
                intro: '',
                avatar: '',
                photos: [{id: 'mine', name: 'photo.png', img: image, use: true}],
                marks: []
            },
            SETTINGS: {
                host: 'workbuddy',
                showSample: true,
                clientId: '',
                root: '',
                pluginDir: '',
                lastCheck: '',
                installed: {workbuddy: true},
                versions: {},
                hostConfig: {workbuddy: {installation: 'installed', trust: 'trusted', version: 'demo'}}
            },
            CHANNELS: {抖音: {ink: '#000000', bg: '#ffffff', builtin: true, need: '竖版'}},
            PROJECTS: [project('first'), project('second')],
            TEMPLATES: [template],
            TASKS: [],
            PROMPTS: [],
            CUSTOM_SIZES: [],
            PCATS: [],
        },
        trash: []
    };
}

function fixture(t, state = backup()) {
    const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'nch-browser-inspect-'));
    t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
    const file = path.join(dir, '旧工作台 备份.json');
    Core.validate(state);
    fs.writeFileSync(file, JSON.stringify(state));
    return {dir, file, state};
}

const fails = (code, fn) => assert.throws(fn, error => error.code === code);

test('inspection preserves source bytes, separates scoped candidate IDs and never claims a migration or image decode', t => {
    const f = fixture(t), raw = fs.readFileSync(f.file), before = fs.readdirSync(f.dir);
    const report = inspectBrowserBackup(f.file);
    assert.equal(report.source.sha256, createHash('sha256').update(raw).digest('hex'));
    assert.equal(report.counts.contents, 2);
    assert.equal(report.counts.publications, 2);
    assert.equal(report.imageDecodingPerformed, false);
    assert.equal(report.libraryCreated, false);
    const candidates = report.assets.filter(entry => entry.role === 'candidate');
    assert.equal(candidates.length, 2);
    assert.equal(new Set(candidates.map(entry => entry.key)).size, 2);
    assert.ok(candidates.every(entry => entry.resolution === 'embedded-unverified'));
    assert.ok(report.warnings.some(entry => entry.code === 'UNKNOWN_PUBLISHED_TEXT'));
    assert.ok(report.warnings.some(entry => entry.code === 'MACHINE_STATE_NOT_TRUSTED'));
    assert.equal(report.hostPreferenceSuggestion, 'workbuddy');
    const output = JSON.stringify(report);
    for (const secret of ['私有资料名称', '私有渠道文案', 'base64', 'trusted', 'demo']) assert.equal(output.includes(secret), false, secret);
    assert.deepEqual(fs.readFileSync(f.file), raw);
    assert.deepEqual(fs.readdirSync(f.dir), before);
});

test('attachment srcPath is inert even when a matching local file exists', t => {
    const f = fixture(t);
    fs.writeFileSync(path.join(f.dir, 'private.txt'), 'never import this without selection');
    const report = inspectBrowserBackup(f.file);
    assert.ok(report.assets.filter(entry => entry.role === 'attachment').every(entry => entry.resolution === 'missing'));
    assert.equal(JSON.stringify(report).includes('never import'), false);
});

test('malformed, invalid UTF-8, credential fields, newer format and excessive size are refused without writes', t => {
    const f = fixture(t);
    for (const raw of [Buffer.from('{bad'), Buffer.from([0x7b, 0xff, 0x7d]), Buffer.from(JSON.stringify({
        ...f.state,
        schema: 999
    })), Buffer.from(JSON.stringify({...f.state, accessToken: 'do-not-output'}))]) {
        fs.writeFileSync(f.file, raw);
        fails('INVALID_BACKUP', () => inspectBrowserBackup(f.file));
        assert.deepEqual(fs.readFileSync(f.file), raw);
    }
    fs.writeFileSync(f.file, Buffer.alloc(Core.MAX_BYTES + 1));
    fails('BACKUP_TOO_LARGE', () => inspectBrowserBackup(f.file));
});

test('only an explicitly selected ordinary absolute file is accepted', t => {
    const f = fixture(t), link = path.join(f.dir, 'link.json');
    fs.symlinkSync(f.file, link);
    fails('UNSAFE_PATH', () => inspectBrowserBackup(link));
    fails('UNSAFE_PATH', () => inspectBrowserBackup(f.dir));
    fails('INVALID_INPUT', () => inspectBrowserBackup('relative.json'));
});

test('external replacement during a selected file read is detected', t => {
    const f = fixture(t), original = fs.readSync;
    let changed = false;
    fs.readSync = function (...args) {
        const count = original.apply(this, args);
        if (!changed) {
            changed = true;
            fs.renameSync(f.file, path.join(f.dir, 'original.json'));
            fs.writeFileSync(f.file, JSON.stringify(f.state));
        }
        return count;
    };
    try {
        fails('SOURCE_CHANGED', () => readBrowserBackup(f.file));
    } finally {
        fs.readSync = original;
    }
});

test('BOM and CRLF remain intact in the private raw archive input', t => {
    const f = fixture(t), raw = Buffer.from('\uFEFF' + JSON.stringify(f.state, null, 2).replaceAll('\n', '\r\n'));
    fs.writeFileSync(f.file, raw);
    assert.deepEqual(readBrowserBackup(f.file).raw, raw);
    assert.equal(inspectBrowserBackup(f.file).source.bytes, raw.length);
});
