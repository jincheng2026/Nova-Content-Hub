import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {createLibrary, openLibrary} from '../../file-library/index.mjs';

const project = fileURLToPath(new URL('../../', import.meta.url));
let parent;
before(() => {
    parent = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'nch-maintenance-'));
});
after(() => {
    fs.rmSync(parent, {recursive: true, force: true});
});

function run(entry, args) {
    const result = spawnSync(process.execPath, [entry, ...args], {
        cwd: parent,
        env: {...process.env, NODE_PATH: ''},
        encoding: 'utf8',
        timeout: 60000
    });
    assert.equal(result.error, undefined, result.stderr);
    assert.equal(result.signal, null, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(result.status, output.ok ? 0 : 1, result.stderr);
    return output;
}

test('maintenance command rejects malformed arguments before touching the chosen library', () => {
    const cli = path.join(project, 'library-maintenance/cli.mjs'), absent = path.join(parent, 'absent');
    for (const args of [['toString'], ['__proto__'], ['backup'], ['verify', '--backup', '.'], ['help', '--library', absent], ['backup', '--library', absent, '--destination', absent, '--library', absent], ['verify', '--backup', absent, '--auth', 'disabled'],
        ['import-browser', '--source', 'relative.json', '--destination', absent], ['resume-import', '--destination', absent, '--id', 'invalid'], ['import-status', '--destination', absent, '--id', randomUUID(), '--id', randomUUID()]]) {
        assert.equal(run(cli, args).code, 'INVALID_ARGUMENTS', JSON.stringify(args));
    }
    assert.equal(fs.existsSync(absent), false);
});

async function importFixture(file) {
    const bytes = await sharp({create: {width: 24, height: 32, channels: 3, background: '#26456e'}}).png().toBuffer();
    const image = `data:image/png;base64,${bytes.toString('base64')}`;
    const state = {
        format: 'nova-content-hub-browser',
        schema: 1,
        appScope: 'nova-content-hub',
        libraryId: 'legacy-library',
        updatedAt: '2026-10-17T00:00:00.000Z',
        data: {
            ACCOUNT: {
                name: '导入测试',
                intro: '',
                avatar: '',
                photos: [{id: 'own-photo', name: 'photo.png', img: image, use: true}],
                marks: []
            },
            SETTINGS: {
                host: 'codex',
                showSample: true,
                clientId: '',
                root: '',
                pluginDir: '',
                lastCheck: '',
                installed: {},
                versions: {},
                hostConfig: {}
            },
            CHANNELS: {抖音: {ink: '#000000', bg: '#ffffff', builtin: true, need: '竖版'}},
            TEMPLATES: [{
                id: 'legacy-template',
                name: '导入模板',
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
                shots: [image, '图库/AI参考/geometry-v3.png'],
                img: image,
                why: [],
                fixed: [],
                varies: [],
                evidence: [],
                colors: []
            }],
            PROJECTS: [{
                id: 'legacy-content',
                kind: '内容',
                name: '迁移后的内容',
                folder: '内容/legacy-content',
                tpl: 'legacy-template',
                channels: ['抖音'],
                dates: {record: '2026-10-16'},
                plan: '',
                materials: [],
                files: [{id: 'legacy-file', name: 'note.txt', size: '5 B', content: 'data:text/plain;base64,aGVsbG8='}],
                posts: [{
                    id: 'legacy-post',
                    date: '2026-10-18',
                    time: '',
                    channel: '抖音',
                    mat: '',
                    text: '私有渠道文案'
                }]
            }],
            PROMPTS: [{
                id: 'legacy-prompt',
                cat: '自用',
                file: 'prompt.md',
                title: '导入提示词',
                when: '',
                summary: '',
                source: '',
                body: '私有提示词正文',
                tags: [],
                mine: true,
                off: true
            }],
            TASKS: [], CUSTOM_SIZES: [], PCATS: ['自用'],
        },
        trash: []
    };
    fs.writeFileSync(file, JSON.stringify(state));
    return bytes;
}

for (const mode of ['required', 'disabled']) test(`standalone ${mode} bundle imports a browser backup, resolves bundled bytes and reuses its durable operation`, async () => {
    const dir = path.join(parent, randomUUID());
    fs.mkdirSync(dir);
    const runtime = path.join(dir, 'runtime');
    fs.cpSync(path.join(project, 'dist-cover-runtime', `auth-${mode}`), runtime, {recursive: true});
    const cli = path.join(runtime, 'library-maintenance/cli.mjs'), source = path.join(dir, '旧工作台.json'),
        destination = path.join(dir, '导入库');
    assert.equal(fs.existsSync(path.join(runtime, '原型/data.js')), false);
    const photoBytes = await importFixture(source);
    assert.equal(run(cli, ['import-status', '--destination', destination]).result, null);
    const imported = run(cli, ['import-browser', '--source', source, '--destination', destination]);
    assert.equal(imported.ok, true, imported.message);
    assert.equal(imported.result.status, 'committed');
    const importId = imported.result.importId;
    assert.equal(run(cli, ['import-status', '--destination', destination, '--id', importId]).result.importId, importId);
    const lib = openLibrary(destination), content = lib.listContents()[0], prompts = lib.listPrompts(),
        photos = lib.listPhotos();
    assert.equal(lib.listContents().length, 1);
    assert.equal(content.title, '迁移后的内容');
    assert.equal(content.plans[0].text, '私有渠道文案');
    assert.deepEqual(content.plans[0].schedule, {precision: 'date', date: '2026-10-18'});
    assert.equal(prompts.length, 1);
    assert.equal(prompts[0].enabled, false);
    assert.equal(prompts[0].body, '私有提示词正文');
    assert.equal(photos.length, 1);
    assert.deepEqual(lib.readAsset(photos[0].assetHash).data, photoBytes);
    const template = lib.readTemplate(lib.listTemplates()[0].id);
    assert.equal(Object.keys(template.resources).length, 3); // Two samples plus their separately preserved preview role.
    assert.equal(new Set(Object.values(template.resources).map(resource => resource.assetHash)).size, 2);
    const catalog = JSON.parse(fs.readFileSync(path.join(runtime, 'browser-import/builtin-resources.json')));
    assert.equal(template.resources['template/legacy-template/shot/1'].assetHash, catalog.entries['图库/AI参考/geometry-v3.png'].sha256);
    assert.equal(JSON.stringify(imported).includes('私有渠道文案'), false);
    fs.unlinkSync(source);
    const changed = lib.updateContent(content.id, {title: '导入完成后的正常编辑'}, content.editToken);
    const resumed = run(cli, ['resume-import', '--destination', destination, '--id', importId]);
    assert.equal(resumed.result.status, 'committed');
    assert.equal(resumed.result.importId, importId);
    assert.equal(lib.readContent(content.id).title, changed.title);
    assert.equal(lib.listContents().length, 1);
});

for (const mode of ['required', 'disabled']) test(`standalone ${mode} bundle backs up and restores user files without generation authorization`, () => {
    const dir = path.join(parent, randomUUID());
    fs.mkdirSync(dir);
    const runtime = path.join(dir, 'runtime');
    fs.cpSync(path.join(project, 'dist-cover-runtime', `auth-${mode}`), runtime, {recursive: true});
    const cli = path.join(runtime, 'library-maintenance/cli.mjs');
    assert.equal(fs.existsSync(path.join(runtime, 'library-maintenance/test')), false);
    assert.equal(run(cli, ['help']).imageGeneration, false);
    const root = path.join(dir, '我的 内容库'), backup = path.join(dir, '备份'), restored = path.join(dir, '恢复');
    const lib = createLibrary(root), item = lib.createContent({title: '原文保全', body: '\uFEFF# 原文\r\n不改换行'});
    const trashed = lib.trashContent(item.id, item.editToken);
    fs.mkdirSync(path.join(root, '自存附件'));
    const raw = Buffer.from([0, 255, 2, 10]);
    fs.writeFileSync(path.join(root, '自存附件', 'private.bin'), raw);
    const completed = run(cli, ['backup', '--library', root, '--destination', backup]);
    assert.equal(completed.ok, true, completed.message);
    assert.equal(run(cli, ['verify', '--backup', backup]).result.verified, true);
    const recovered = run(cli, ['restore', '--backup', backup, '--destination', restored]);
    assert.equal(recovered.ok, true, recovered.message);
    assert.deepEqual(recovered.result.interruptedAttempts, []);
    const recoveredLibrary = openLibrary(restored);
    assert.deepEqual(recoveredLibrary.listTrash()[0], lib.listTrash()[0]);
    assert.equal(recoveredLibrary.queryMutation(trashed.mutationId).status, 'committed');
    assert.deepEqual(fs.readFileSync(path.join(restored, '自存附件', 'private.bin')), raw);
    assert.equal(lib.listTrash()[0].body, item.body);
    const occupied = path.join(dir, '已有目录');
    fs.mkdirSync(occupied);
    fs.writeFileSync(path.join(occupied, 'keep.txt'), '不能覆盖');
    assert.equal(run(cli, ['restore', '--backup', backup, '--destination', occupied]).code, 'DESTINATION_EXISTS');
    assert.equal(fs.readFileSync(path.join(occupied, 'keep.txt'), 'utf8'), '不能覆盖');
    fs.appendFileSync(path.join(backup, 'data', '自存附件', 'private.bin'), 'broken');
    assert.equal(run(cli, ['verify', '--backup', backup]).code, 'CORRUPT');
    const rejected = path.join(dir, '拒绝恢复');
    assert.equal(run(cli, ['restore', '--backup', backup, '--destination', rejected]).ok, false);
    assert.equal(fs.existsSync(rejected), false);
});
