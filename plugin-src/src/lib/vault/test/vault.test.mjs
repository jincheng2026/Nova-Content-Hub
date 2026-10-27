import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {
    createVault,
    openVault,
    inspectVault,
    vaultRootForRuntime,
    readVaultSnapshot,
    readVaultDocument,
    saveVaultDocument,
    createVaultDocument,
    trashVaultDocument,
    readVaultTaskContext,
    queryVaultMutation,
    resolveVaultMutation,
} from '../index.mjs';
import {
    createLibrary,
    openLibrary,
    __testing,
} from '../../file-library/index.mjs';
const fixture = (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-vault-test-'));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const binding = createVault(root);
    return {root: fs.realpathSync(root), ...binding, runtime: binding.root};
};
const create = (runtime, text = '资料先行', mid = randomUUID()) =>
    createVaultDocument(
        runtime,
        {section: 'drafts', title: '', text},
        {mutationId: mid},
    );

test('reserved empty directory creates complete skeleton and exact runtime binding', (t) => {
    const f = fixture(t);
    assert.equal(
        vaultRootForRuntime(f.runtime),
        path.dirname(path.dirname(f.runtime)),
    );
    for (const name of [
        'AGENTS.md',
        'CLAUDE.md',
        'SOURCE_OF_TRUTH.md',
        'README.md',
        '04_选题库/00_选题总览.md',
        '04_选题库/_选题卡模板.md',
        '05_内容草稿/00_草稿总览.md',
    ])
        assert.ok(
            fs.existsSync(path.join(vaultRootForRuntime(f.runtime), name)),
        );
    assert.equal(readVaultSnapshot(f.runtime).positioning.status, 'missing');
    const ordinary = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-ordinary-'));
    t.after(() => fs.rmSync(ordinary, {recursive: true, force: true}));
    fs.writeFileSync(path.join(ordinary, 'notes.md'), '普通目录');
    assert.equal(inspectVault(ordinary).recognized, false);
    assert.throws(() => openVault(ordinary), {code: 'INVALID_INPUT'});
    assert.equal(fs.existsSync(path.join(ordinary, '.workbench')), false);
});
test('blank-title content uses stable T folder, durable exact replay and never reuses trash number', (t) => {
    const f = fixture(t),
        mid = randomUUID(),
        first = create(f.runtime, '没有最终标题', mid);
    assert.match(first.document.relativePath, /T001_未定选题\/正文.md$/);
    assert.deepEqual(create(f.runtime, '没有最终标题', mid), first);
    assert.deepEqual(queryVaultMutation(f.runtime, mid).result, first);
    assert.throws(() => create(f.runtime, '不同请求', mid), {
        code: 'INVALID_INPUT',
    });
    trashVaultDocument(
        f.runtime,
        {id: first.document.id, expectedHash: first.document.hash},
        {mutationId: randomUUID()},
    );
    assert.equal(create(f.runtime).document.tNumber, 'T002');
});
test('save keeps original authority and exact receipt across subsequent external edits', (t) => {
    const f = fixture(t),
        first = create(f.runtime),
        mid = randomUUID(),
        input = {
            id: first.document.id,
            expectedHash: first.document.hash,
            text: '修改后的原文',
        },
        saved = saveVaultDocument(f.runtime, input, {mutationId: mid});
    assert.equal(
        fs.readFileSync(
            path.join(
                vaultRootForRuntime(f.runtime),
                saved.document.relativePath,
            ),
            'utf8',
        ),
        input.text,
    );
    fs.writeFileSync(
        path.join(vaultRootForRuntime(f.runtime), saved.document.relativePath),
        '外部新稿',
    );
    assert.deepEqual(
        saveVaultDocument(f.runtime, input, {mutationId: mid}),
        saved,
    );
    assert.throws(
        () =>
            saveVaultDocument(
                f.runtime,
                {
                    id: first.document.id,
                    expectedHash: saved.document.hash,
                    text: '不能覆盖',
                },
                {mutationId: randomUUID()},
            ),
        {code: 'CONFLICT'},
    );
});
test('path, root identity, symlink, hardlink, oversized and extra fields are rejected', (t) => {
    const f = fixture(t),
        first = create(f.runtime),
        root = vaultRootForRuntime(f.runtime),
        file = path.join(root, first.document.relativePath);
    assert.throws(() => readVaultDocument(f.runtime, '../../outside'), {
        code: 'INVALID_INPUT',
    });
    assert.throws(
        () =>
            createVaultDocument(
                f.runtime,
                {
                    section: 'drafts',
                    title: 'x',
                    text: 'x',
                    path: '../../outside',
                },
                {mutationId: randomUUID()},
            ),
        {code: 'INVALID_INPUT'},
    );
    fs.unlinkSync(file);
    fs.symlinkSync('/etc/hosts', file);
    assert.throws(() =>
        saveVaultDocument(
            f.runtime,
            {
                id: first.document.id,
                expectedHash: first.document.hash,
                text: 'x',
            },
            {mutationId: randomUUID()},
        ),
    );
    assert.ok(
        readVaultSnapshot(f.runtime).issues.some(
            (i) => i.code === 'SYMLINK_REJECTED',
        ),
    );
    fs.unlinkSync(file);
    const ext = path.join(root, 'external.txt');
    fs.writeFileSync(ext, 'external');
    fs.linkSync(ext, file);
    assert.throws(() => readVaultDocument(f.runtime, first.document.id));
    fs.unlinkSync(file);
    fs.writeFileSync(file, Buffer.alloc(8 * 1024 * 1024 + 1));
    assert.ok(
        readVaultSnapshot(f.runtime).issues.some(
            (i) => i.relativePath === first.document.relativePath,
        ),
    );
    const marker = path.join(f.runtime, 'vault-binding.json'),
        b = JSON.parse(fs.readFileSync(marker));
    b.rootIdentity.ino = '0';
    fs.writeFileSync(marker, JSON.stringify(b));
    assert.throws(() => readVaultSnapshot(f.runtime), {code: 'CONFLICT'});
});
test('legacy body and production draft APIs update the same T source; external edits invalidate tokens', (t) => {
    const f = fixture(t),
        api = openLibrary(f.runtime),
        c = api.createContent({title: '', body: 'first'}),
        mid = randomUUID();
    let state = api.readProductionCreation(c.id);
    const saved = api.saveProductionDraft(
        c.id,
        {
            body: 'second',
            expectedBodyHash: state.content.bodyHash,
            expectedProductionToken: state.productionToken,
            creationPatch: {},
        },
        state.content.editToken,
        {mutationId: mid},
    );
    const context = readVaultTaskContext(f.runtime, c.id);
    assert.equal(
        fs.readFileSync(
            path.join(context.vault.root, context.content.relativePath),
            'utf8',
        ),
        'second',
    );
    assert.equal(
        api.saveProductionDraft(
            c.id,
            {
                body: 'second',
                expectedBodyHash: state.content.bodyHash,
                expectedProductionToken: state.productionToken,
                creationPatch: {},
            },
            state.content.editToken,
            {mutationId: mid},
        ).mutationId,
        mid,
    );
    fs.writeFileSync(
        path.join(context.vault.root, context.content.relativePath),
        'outside',
    );
    assert.throws(
        () => api.updateContent(c.id, {body: 'stale'}, saved.editToken),
        {code: 'CONFLICT'},
    );
    assert.equal(api.readContent(c.id).body, 'outside');
});
test('source missing is explicit and does not silently trash or replace runtime body', (t) => {
    const f = fixture(t),
        api = openLibrary(f.runtime),
        c = api.createContent({title: 'old', body: 'original'}),
        context = readVaultTaskContext(f.runtime, c.id);
    fs.renameSync(
        path.join(context.vault.root, context.content.relativePath),
        path.join(context.vault.root, 'saved-outside.md'),
    );
    assert.ok(
        readVaultSnapshot(f.runtime).issues.some(
            (i) => i.code === 'SOURCE_MISSING',
        ),
    );
    assert.equal(api.readContent(c.id).body, 'original');
    assert.equal(api.readContent(c.id).deletedAt, null);
    assert.equal(
        readVaultTaskContext(f.runtime, c.id).content.sourceMissing,
        true,
    );
});
test('trash and restore bridge retains source bytes and receipts', (t) => {
    const f = fixture(t),
        api = openLibrary(f.runtime),
        c = api.createContent({title: 'content', body: 'original'}),
        trashed = api.trashContent(c.id, c.editToken);
    assert.equal(api.listContents().length, 0);
    assert.equal(api.restoreContent(c.id, trashed.editToken).body, 'original');
    assert.equal(api.listContents().length, 1);
});
test('durable runtime journal recovers source write after source commit and before runtime capture', (t) => {
    process.env.NODE_ENV = 'test';
    const f = fixture(t),
        api = openLibrary(f.runtime),
        c = api.createContent({title: 'content', body: 'before'}),
        mid = randomUUID();
    __testing.setHook((e) => {
        if (e.phase === 'beforeCapture' && e.mutationId === mid)
            throw new Error('simulated crash');
    });
    try {
        assert.throws(
            () =>
                api.updateContent(c.id, {body: 'after'}, c.editToken, {
                    mutationId: mid,
                }),
            /simulated crash/,
        );
    } finally {
        __testing.setHook(null);
    }
    const reopened = openLibrary(f.runtime);
    assert.equal(reopened.readContent(c.id).body, 'after');
    assert.equal(
        reopened.updateContent(c.id, {body: 'after'}, c.editToken, {
            mutationId: mid,
        }).mutationId,
        mid,
    );
    const context = readVaultTaskContext(f.runtime, c.id);
    assert.equal(
        fs.readFileSync(
            path.join(context.vault.root, context.content.relativePath),
            'utf8',
        ),
        'after',
    );
});
test('published facts come from explicit card status; archive folder alone does not publish', (t) => {
    const f = fixture(t),
        root = vaultRootForRuntime(f.runtime);
    fs.mkdirSync(path.join(root, '04_选题库/AI教程/已做'), {recursive: true});
    fs.writeFileSync(
        path.join(root, '04_选题库/AI教程/已做/T029_已录未发.md'),
        '# T029 已录未发\n\n- **状态**：草稿\n',
    );
    fs.writeFileSync(
        path.join(root, '04_选题库/AI教程/已做/T030_已发布.md'),
        '# T030 已发布\n\n- **状态**：已发布\n',
    );
    const p = openLibrary(f.runtime).readProduction();
    assert.equal(
        p.creations.find((c) => c.tNumber === 'T029').stage,
        'writing',
    );
    assert.equal(
        p.creations.find((c) => c.tNumber === 'T030').stage,
        'published',
    );
});
test('first body save from old topic card creates draft under its T directory and retains card', (t) => {
    const f = fixture(t),
        root = vaultRootForRuntime(f.runtime),
        card = path.join(root, '04_选题库/T017_想法.md');
    fs.writeFileSync(card, '# T017 想法\n\n原始资料');
    const api = openLibrary(f.runtime),
        c = api.listContents()[0];
    api.updateContent(c.id, {body: '新正文'}, c.editToken);
    assert.equal(fs.readFileSync(card, 'utf8'), '# T017 想法\n\n原始资料');
    const context = readVaultTaskContext(f.runtime, c.id);
    assert.match(
        context.content.relativePath,
        /05_内容草稿\/T017_.*\/正文.md$/,
    );
    assert.equal(
        fs.readFileSync(path.join(root, context.content.relativePath), 'utf8'),
        '新正文',
    );
});
test('ordinary legacy library create/read remains available and has no Vault binding', (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-legacy-'));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const api = createLibrary(root),
        c = api.createContent({title: 'legacy', body: 'legacy body'});
    assert.equal(vaultRootForRuntime(root), null);
    assert.equal(readVaultSnapshot(root), null);
    assert.equal(openLibrary(root).readContent(c.id).body, 'legacy body');
});

test('declared next T number is a candidate while retired numbers remain reserved', (t) => {
    const f = fixture(t),
        root = vaultRootForRuntime(f.runtime);
    fs.writeFileSync(
        path.join(root, '04_选题库/00_选题总览.md'),
        '# 选题总览\n下一个是 T050；已作废 T003、T008、T027。\n',
    );
    fs.writeFileSync(
        path.join(root, '04_选题库/T049_旧篇.md'),
        '# T049 旧篇\n',
    );
    assert.equal(create(f.runtime).document.tNumber, 'T050');
});
test('canonical positioning names and large source receipts replay without size truncation', (t) => {
    const f = fixture(t),
        mid = randomUUID(),
        text = '长'.repeat(900000),
        input = {section: 'profile', title: '定位总览', text};
    const out = createVaultDocument(f.runtime, input, {mutationId: mid});
    assert.equal(out.document.relativePath, '00_个人背景/定位总览.md');
    assert.equal(queryVaultMutation(f.runtime, mid).result.text, text);
    assert.deepEqual(
        createVaultDocument(f.runtime, input, {mutationId: mid}),
        out,
    );
});

test('known HTML JSON is read as data and remains read-only; unknown HTML keeps a clear reason', (t) => {
    const f = fixture(t),
        root = vaultRootForRuntime(f.runtime),
        dir = path.join(root, '05_内容草稿/T005_HTML');
    fs.mkdirSync(dir, {recursive: true});
    const html =
        '<html><script>throw new Error("must never execute")</script><script id="jc-doc" type="application/json">' +
        JSON.stringify({
            schema: 1,
            items: [{kind: 'segment', fields: {mine: '当前人工稿'}}],
        }) +
        '</script></html>';
    fs.writeFileSync(path.join(dir, 'T005_创作页.html'), html);
    const api = openLibrary(f.runtime),
        c = api.listContents()[0];
    assert.equal(c.body, '当前人工稿');
    assert.throws(
        () => api.updateContent(c.id, {body: '不允许覆盖'}, c.editToken),
        {code: 'INVALID_INPUT'},
    );
    assert.equal(
        fs.readFileSync(path.join(dir, 'T005_创作页.html'), 'utf8'),
        html,
    );
    assert.equal(readVaultTaskContext(f.runtime, c.id).content.writable, false);
});
test('durable source pending receipt recovers after restart and refuses a third-state external file', (t) => {
    const f = fixture(t),
        mid = randomUUID(),
        out = create(f.runtime, '持久来源', mid),
        root = vaultRootForRuntime(f.runtime),
        receipt = path.join(root, `.workbench/mutations/${mid}.json`),
        r = JSON.parse(fs.readFileSync(receipt));
    fs.unlinkSync(path.join(root, out.document.relativePath));
    r.status = 'pending';
    fs.writeFileSync(receipt, JSON.stringify(r));
    openVault(root);
    assert.equal(
        readVaultDocument(f.runtime, out.document.id).text,
        '持久来源',
    );
    r.status = 'pending';
    fs.writeFileSync(receipt, JSON.stringify(r));
    fs.writeFileSync(
        path.join(root, out.document.relativePath),
        '外部第三状态',
    );
    assert.throws(() => openVault(root), {code: 'CONFLICT'});
    assert.equal(
        fs.readFileSync(path.join(root, out.document.relativePath), 'utf8'),
        '外部第三状态',
    );
});

test('resolve proves missing only under a valid root and write lock; pending conflict is uncertain', (t) => {
    const f = fixture(t),
        mid = randomUUID();
    assert.deepEqual(resolveVaultMutation(f.runtime, mid), {state: 'missing'});
    const out = create(f.runtime, 'recovery', mid);
    assert.deepEqual(resolveVaultMutation(f.runtime, mid), {
        state: 'committed',
        result: out,
    });
    const root = vaultRootForRuntime(f.runtime),
        loc = path.join(root, `.workbench/mutations/${mid}.json`),
        r = JSON.parse(fs.readFileSync(loc));
    r.status = 'pending';
    fs.writeFileSync(loc, JSON.stringify(r));
    fs.writeFileSync(path.join(root, out.document.relativePath), 'outside');
    assert.deepEqual(resolveVaultMutation(f.runtime, mid), {
        state: 'uncertain',
    });
    const marker = path.join(f.runtime, 'vault-binding.json'),
        b = JSON.parse(fs.readFileSync(marker));
    b.rootIdentity.ino = '0';
    fs.writeFileSync(marker, JSON.stringify(b));
    assert.deepEqual(resolveVaultMutation(f.runtime, randomUUID()), {
        state: 'uncertain',
    });
});

test('trash with a surviving topic card preserves the original draft mapping and restores exactly that source', (t) => {
    const f = fixture(t),
        root = vaultRootForRuntime(f.runtime),
        card = path.join(root, '04_选题库/T021_卡.md'),
        dir = path.join(root, '05_内容草稿/T021_当前稿');
    fs.writeFileSync(card, '# T021 卡\n\n- **状态**：草稿\n\n卡片资料');
    fs.mkdirSync(dir, {recursive: true});
    const draft = path.join(dir, '正文.md');
    fs.writeFileSync(draft, '当前正文');
    const api = openLibrary(f.runtime),
        content = api.listContents()[0],
        before = readVaultTaskContext(f.runtime, content.id).content
            .relativePath;
    const trashed = api.trashContent(content.id, content.editToken);
    assert.equal(api.listTrash().length, 1);
    const projection = JSON.parse(
        fs.readFileSync(path.join(root, '.workbench/projection.json')),
    );
    assert.equal(projection.contents[content.id].relativePath, before);
    const restored = api.restoreContent(content.id, trashed.editToken, {
        mutationId: randomUUID(),
    });
    assert.equal(restored.body, '当前正文');
    assert.equal(fs.readFileSync(draft, 'utf8'), '当前正文');
    assert.match(fs.readFileSync(card, 'utf8'), /卡片资料/);
    assert.equal(openLibrary(f.runtime).listContents().length, 1);
});
test('existing creation follows explicit external publish and revoke facts without changing body or ID', (t) => {
    const f = fixture(t),
        root = vaultRootForRuntime(f.runtime),
        card = path.join(root, '04_选题库/T022_发布状态.md');
    const write = (status) =>
        fs.writeFileSync(
            card,
            `# T022 发布状态\n\n- **状态**：${status}\n\n固定想法`,
        );
    const dir = path.join(root, '05_内容草稿/T022_当前正文');
    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(path.join(dir, '正文.md'), '不随发布状态改变的当前稿');
    write('草稿');
    const api = openLibrary(f.runtime),
        content = api.listContents()[0],
        id = content.id;
    write('已发布');
    assert.equal(api.readProductionCreation(id).creation.stage, 'published');
    write('草稿');
    assert.equal(api.readProductionCreation(id).creation.stage, 'writing');
    write('待写');
    assert.equal(api.readProductionCreation(id).creation.stage, 'idea');
    assert.equal(api.listContents()[0].id, id);
    assert.equal(api.readContent(id).body, '不随发布状态改变的当前稿');
    assert.equal(
        api.readProduction().creations.find((c) => c.contentId === id).stage,
        'idea',
    );
});

test('pending restore repairs an older trash mapping rebound to a surviving card before recovery', (t) => {
    process.env.NODE_ENV = 'test';
    const f = fixture(t),
        root = vaultRootForRuntime(f.runtime),
        card = path.join(root, '04_选题库/T031_保留卡.md'),
        dir = path.join(root, '05_内容草稿/T031_原文');
    fs.writeFileSync(card, '# T031 保留卡\n\n- **状态**：草稿\n\n保留资料');
    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(path.join(dir, '正文.md'), '不能丢失的原文');
    const api = openLibrary(f.runtime),
        content = api.listContents()[0],
        trashed = api.trashContent(content.id, content.editToken),
        mid = randomUUID();
    __testing.setHook((e) => {
        if (e.phase === 'afterJournal' && e.mutationId === mid)
            throw new Error('restore interrupted');
    });
    try {
        assert.throws(
            () =>
                api.restoreContent(content.id, trashed.editToken, {
                    mutationId: mid,
                }),
            /restore interrupted/,
        );
    } finally {
        __testing.setHook(null);
    }
    const doc = readVaultSnapshot(f.runtime).documents.find(
            (d) => d.relativePath === '04_选题库/T031_保留卡.md',
        ),
        loc = path.join(root, '.workbench/projection.json'),
        projection = JSON.parse(fs.readFileSync(loc));
    Object.assign(projection.contents[content.id], {
        relativePath: doc.relativePath,
        documentId: doc.id,
        hash: doc.hash,
        contentDirectory: '05_内容草稿/T031_错误目标',
    });
    fs.writeFileSync(loc, JSON.stringify(projection));
    const reopened = openLibrary(f.runtime);
    assert.equal(reopened.readContent(content.id).body, '不能丢失的原文');
    assert.equal(
        fs.readFileSync(path.join(dir, '正文.md'), 'utf8'),
        '不能丢失的原文',
    );
    assert.match(fs.readFileSync(card, 'utf8'), /保留资料/);
    assert.equal(
        reopened.restoreContent(content.id, trashed.editToken, {
            mutationId: mid,
        }).mutationId,
        mid,
    );
    assert.equal(reopened.listTrash().length, 0);
});
test('restore path conflict is rejected before publishing a runtime journal and cannot brick reopening', (t) => {
    const f = fixture(t),
        api = openLibrary(f.runtime),
        c = api.createContent({title: '恢复冲突', body: '原文'}),
        context = readVaultTaskContext(f.runtime, c.id),
        trashed = api.trashContent(c.id, c.editToken),
        mid = randomUUID();
    const target = path.join(context.vault.root, context.content.relativePath);
    fs.writeFileSync(target, '外部新文件');
    assert.throws(
        () => api.restoreContent(c.id, trashed.editToken, {mutationId: mid}),
        {code: 'CONFLICT'},
    );
    assert.equal(
        fs.existsSync(path.join(f.runtime, '系统（别动）/事务/待恢复', mid)),
        false,
    );
    assert.equal(api.listTrash().length, 1);
    assert.equal(openLibrary(f.runtime).listTrash().length, 1);
    assert.equal(fs.readFileSync(target, 'utf8'), '外部新文件');
});

test('a surviving assistant archive cannot replace a trashed current source', (t) => {
    const f = fixture(t),
        root = vaultRootForRuntime(f.runtime),
        api = openLibrary(f.runtime),
        c = api.createContent({title: '归档共存', body: '当前稿'}),
        context = readVaultTaskContext(f.runtime, c.id),
        archive = path.join(root, context.contentDirectory, '助手归档.md');
    fs.writeFileSync(archive, '历史候选不得变为当前稿');
    const current = api.readContent(c.id),
        trashed = api.trashContent(c.id, current.editToken);
    api.listTrash();
    const restored = api.restoreContent(c.id, trashed.editToken);
    assert.equal(restored.body, '当前稿');
    assert.equal(fs.readFileSync(archive, 'utf8'), '历史候选不得变为当前稿');
    assert.equal(openLibrary(f.runtime).readContent(c.id).body, '当前稿');
});
test('conflicting source publication facts revoke published display and clear once facts agree', (t) => {
    const f = fixture(t),
        root = vaultRootForRuntime(f.runtime),
        card = path.join(root, '04_选题库/T033_状态冲突.md'),
        overview = path.join(root, '04_选题库/00_选题总览.md');
    fs.writeFileSync(card, '# T033 状态冲突\n\n- **状态**：已发布\n');
    const api = openLibrary(f.runtime),
        c = api.listContents()[0];
    assert.equal(api.readProductionCreation(c.id).creation.stage, 'published');
    fs.writeFileSync(overview, '# 选题总览\n| T033 | 状态冲突 | 草稿 |\n');
    assert.ok(
        readVaultSnapshot(f.runtime).issues.some(
            (i) => i.code === 'PUBLICATION_STATUS_CONFLICT',
        ),
    );
    assert.equal(api.readProductionCreation(c.id).creation.stage, 'writing');
    fs.writeFileSync(overview, '# 选题总览\n| T033 | 状态冲突 | 已发布 |\n');
    assert.equal(api.readProductionCreation(c.id).creation.stage, 'published');
    assert.equal(
        readVaultSnapshot(f.runtime).issues.some(
            (i) => i.code === 'PUBLICATION_STATUS_CONFLICT',
        ),
        false,
    );
});
