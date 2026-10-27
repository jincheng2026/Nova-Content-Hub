import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createVault, openVault, readVaultSnapshot, readVaultDocument, resolveVaultMutation} from '../index.mjs';
import {openLibrary} from '../../file-library/index.mjs';
import {contentSources, digest} from '../core.mjs';
const modulePromise = import('../working-draft.mjs').catch(() => ({}));
const html = '<html><script>alert("never run")</script><script id="jc-doc" type="application/json">' + JSON.stringify({
    schema: 1,
    items: [{
        kind: 'segment',
        fields: {
            mine: '人工当前稿一'
        }
    }, {
        kind: 'segment',
        fields: {
            mine: '人工当前稿二'
        }
    }]
}) + '</script></html>';
function fixture(t) {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'nova-working-draft-')));
    t.after(() => fs.rmSync(root, {
        recursive: true,
        force: true
    }));
    const binding = createVault(root), folder = '05_内容草稿/T007_原篇';
    fs.mkdirSync(path.join(root, folder));
    fs.writeFileSync(path.join(root, folder, '创作页.html'), html);
    fs.writeFileSync(path.join(root, '04_选题库/T007_原篇.md'), '# 原篇\n\n状态：草稿\n');
    fs.writeFileSync(path.join(root, '05_内容草稿/00_草稿总览.md'), '| T007 | [创作页](T007_原篇/创作页.html) |\n');
    const source = contentSources(readVaultSnapshot(binding.root))[0];
    return {
        root,
        runtime: binding.root,
        source,
        input: {
            id: source.document.id,
            expectedHash: source.document.hash
        },
        folder
    };
}
test('explicit working draft keeps HTML and T identity, pins current MD across reopen and normal writes', async t => {
    const {createVaultWorkingDraft} = await modulePromise;
    assert.equal(typeof createVaultWorkingDraft, 'function', 'explicit conversion API must exist');
    const f = fixture(t), api = openLibrary(f.runtime), before = api.listContents()[0], mid = randomUUID(), result = createVaultWorkingDraft(f.runtime, f.input, {
        mutationId: mid
    });
    assert.equal(result.text, '人工当前稿一\n\n人工当前稿二');
    assert.equal(result.document.contentId, before.id);
    assert.equal(result.document.tNumber, 'T007');
    assert.equal(path.posix.dirname(result.document.relativePath), f.folder);
    assert.equal(fs.readFileSync(path.join(f.root, f.folder, '创作页.html'), 'utf8'), html);
    assert.deepEqual(createVaultWorkingDraft(f.runtime, f.input, {
        mutationId: mid
    }), result);
    assert.equal(resolveVaultMutation(f.runtime, mid).state, 'committed');
    for (const name of ['SOURCE_OF_TRUTH.md', 'README.md']) {
        const text = fs.readFileSync(path.join(f.root, name), 'utf8');
        assert.match(text, /工作台当前稿/);
        assert.ok(text.includes(result.document.relativePath));
        assert.ok(text.includes(f.source.document.relativePath));
    }
    openVault(f.root);
    const reopened = openLibrary(f.runtime), current = reopened.readContent(before.id);
    assert.equal(contentSources(readVaultSnapshot(f.runtime))[0].document.id, result.document.id);
    reopened.updateContent(current.id, {
        body: '普通编辑保存'
    }, current.editToken);
    let state = reopened.readProductionCreation(current.id);
    reopened.saveProductionDraft(current.id, {
        body: '生产稿保存',
        expectedBodyHash: state.content.bodyHash,
        expectedProductionToken: state.productionToken,
        creationPatch: {}
    }, state.content.editToken, {
        mutationId: randomUUID()
    });
    assert.equal(readVaultDocument(f.runtime, result.document.id).text, '生产稿保存');
    assert.equal(fs.readFileSync(path.join(f.root, f.folder, '创作页.html'), 'utf8'), html);
    assert.equal(contentSources(readVaultSnapshot(f.runtime))[0].document.id, result.document.id);
});
test('conversion refuses stale hash, occupied target, noncurrent source, unknown HTML and extra path', async t => {
    const {createVaultWorkingDraft} = await modulePromise;
    assert.equal(typeof createVaultWorkingDraft, 'function');
    for (const kind of ['hash', 'target', 'unknown', 'extra', 'noncurrent']) {
        const f = fixture(t);
        if (kind === 'hash') fs.appendFileSync(path.join(f.root, f.folder, '创作页.html'), 'changed');
        if (kind === 'target') fs.writeFileSync(path.join(f.root, f.folder, '工作稿.md'), 'manual existing draft');
        if (kind === 'unknown') {
            fs.writeFileSync(path.join(f.root, f.folder, '创作页.html'), '<html><script>bad</script>markup</html>');
            f.input.expectedHash = digest(fs.readFileSync(path.join(f.root, f.folder, '创作页.html')));
        }
        if (kind === 'noncurrent') {
            fs.writeFileSync(path.join(f.root, f.folder, '当前.md'), 'current');
            fs.writeFileSync(path.join(f.root, '05_内容草稿/00_草稿总览.md'), '| T007 | [工作稿](T007_原篇/当前.md) |');
        }
        assert.throws(() => createVaultWorkingDraft(f.runtime, kind === 'extra' ? {
            ...f.input,
            path: '/tmp/forbidden'
        } : f.input, {
            mutationId: randomUUID()
        }), e => ['CONFLICT', 'INVALID_INPUT'].includes(e.code));
        assert.equal(fs.readFileSync(path.join(f.root, f.folder, '创作页.html'), 'utf8'), kind === 'hash' ? html + 'changed' : kind === 'unknown' ? '<html><script>bad</script>markup</html>' : html);
    }
});
function interrupted(f, mid, result, before) {
    const receiptPath = path.join(f.root, '.workbench/mutations', `${mid}.json`), receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
    receipt.status = 'pending';
    // This fixture models an interrupted legacy journal, before the pending index migration.
    fs.rmSync(path.join(f.root, '.workbench/pending-mutations-index.json'), {force: true});
    fs.writeFileSync(receiptPath, JSON.stringify(receipt));
    for (const name of ['SOURCE_OF_TRUTH.md', 'README.md']) fs.writeFileSync(path.join(f.root, name), before[name]);
    return receipt;
}
test('partial working draft replay resumes after body creation and keeps source authority stable', async t => {
    const {createVaultWorkingDraft} = await modulePromise;
    const f = fixture(t), mid = randomUUID(), before = Object.fromEntries(['SOURCE_OF_TRUTH.md', 'README.md'].map(name => [name, fs.readFileSync(path.join(f.root, name), 'utf8')])), result = createVaultWorkingDraft(f.runtime, f.input, {
        mutationId: mid
    });
    interrupted(f, mid, result, before);
    assert.equal(resolveVaultMutation(f.runtime, mid).state, 'committed');
    assert.equal(contentSources(readVaultSnapshot(f.runtime))[0].document.id, result.document.id);
    assert.equal(fs.readFileSync(path.join(f.root, f.folder, '创作页.html'), 'utf8'), html);
});
test('interrupted conflict does not poison reopen or report a pending conversion as committed', async t => {
    const {createVaultWorkingDraft} = await modulePromise;
    const f = fixture(t), mid = randomUUID(), before = Object.fromEntries(['SOURCE_OF_TRUTH.md', 'README.md'].map(name => [name, fs.readFileSync(path.join(f.root, name), 'utf8')])), result = createVaultWorkingDraft(f.runtime, f.input, {
        mutationId: mid
    });
    interrupted(f, mid, result, before);
    fs.writeFileSync(path.join(f.root, 'README.md'), '外部人工补充，必须保留');
    assert.doesNotThrow(() => openVault(f.root));
    assert.equal(resolveVaultMutation(f.runtime, mid).state, 'uncertain');
    assert.throws(() => createVaultWorkingDraft(f.runtime, f.input, {
        mutationId: mid
    }), {
        code: 'CONFLICT'
    });
    assert.equal(fs.readFileSync(path.join(f.root, 'README.md'), 'utf8'), '外部人工补充，必须保留');
    fs.writeFileSync(path.join(f.root, 'README.md'), before['README.md']);
    assert.equal(resolveVaultMutation(f.runtime, mid).state, 'committed');
});
test('partial conversion detects a new chosen source instead of overriding it on recovery', async t => {
    const {createVaultWorkingDraft} = await modulePromise;
    const f = fixture(t), mid = randomUUID(), before = Object.fromEntries(['SOURCE_OF_TRUTH.md', 'README.md'].map(name => [name, fs.readFileSync(path.join(f.root, name), 'utf8')])), result = createVaultWorkingDraft(f.runtime, f.input, {
        mutationId: mid
    });
    interrupted(f, mid, result, before);
    fs.writeFileSync(path.join(f.root, f.folder, '外部当前.md'), '新的人工稿');
    fs.writeFileSync(path.join(f.root, '05_内容草稿/00_草稿总览.md'), '| T007 | [工作稿](T007_原篇/外部当前.md) |');
    assert.equal(resolveVaultMutation(f.runtime, mid).state, 'uncertain');
    assert.equal(contentSources(readVaultSnapshot(f.runtime))[0].body, '新的人工稿');
});
test('missing or trashed registered work draft keeps library readable and never restores old HTML as current', async t => {
    const {createVaultWorkingDraft} = await modulePromise;
    const f = fixture(t), api = openLibrary(f.runtime), content = api.listContents()[0], result = createVaultWorkingDraft(f.runtime, f.input, {
        mutationId: randomUUID()
    });
    assert.equal(api.readContent(content.id).body, result.text);
    fs.renameSync(path.join(f.root, result.document.relativePath), path.join(f.root, f.folder, '移走稿.md'));
    assert.doesNotThrow(() => api.listContents());
    assert.equal(api.readContent(content.id).body, result.text);
    assert.equal(contentSources(readVaultSnapshot(f.runtime)).length, 0);
    assert.ok(readVaultSnapshot(f.runtime).issues.some(issue => issue.code === 'SOURCE_MISSING'));
    fs.renameSync(path.join(f.root, f.folder, '移走稿.md'), path.join(f.root, result.document.relativePath));
    const current = api.readContent(content.id);
    api.trashContent(current.id, current.editToken, {
        mutationId: randomUUID()
    });
    assert.equal(api.listContents().length, 0);
    const trash = api.listTrash()[0];
    api.restoreContent(trash.id, trash.editToken, {
        mutationId: randomUUID()
    });
    assert.equal(api.readContent(content.id).body, result.text);
    assert.equal(contentSources(readVaultSnapshot(f.runtime))[0].document.id, result.document.id);
});
test('a pending source or target replaced by symlink stays rejected without bricking reopen', async t => {
    const {createVaultWorkingDraft} = await modulePromise;
    for (const replaced of ['source', 'target']) {
        const f = fixture(t), mid = randomUUID(), before = Object.fromEntries(['SOURCE_OF_TRUTH.md', 'README.md'].map(name => [name, fs.readFileSync(path.join(f.root, name), 'utf8')])), result = createVaultWorkingDraft(f.runtime, f.input, {
            mutationId: mid
        });
        interrupted(f, mid, result, before);
        const file = path.join(f.root, replaced === 'source' ? f.source.document.relativePath : result.document.relativePath);
        fs.unlinkSync(file);
        fs.symlinkSync('/etc/hosts', file);
        assert.doesNotThrow(() => openVault(f.root));
        assert.equal(resolveVaultMutation(f.runtime, mid).state, 'uncertain');
        assert.ok(fs.lstatSync(file).isSymbolicLink());
    }
});
test('without overview a staged target never becomes current before the transaction commits', async t => {
    const {createVaultWorkingDraft} = await modulePromise;
    const f = fixture(t);
    fs.writeFileSync(path.join(f.root, '05_内容草稿/00_草稿总览.md'), '');
    const api = openLibrary(f.runtime), beforeContent = api.listContents()[0], before = Object.fromEntries(['SOURCE_OF_TRUTH.md', 'README.md'].map(name => [name, fs.readFileSync(path.join(f.root, name), 'utf8')])), mid = randomUUID(), result = createVaultWorkingDraft(f.runtime, f.input, {
        mutationId: mid
    });
    interrupted(f, mid, result, before);
    // Keep the transaction pending while testing source selection; ordinary reads
    // may now finish an otherwise recoverable receipt under the Vault lock.
    fs.writeFileSync(path.join(f.root, 'README.md'), '外部编辑，待作者恢复');
    assert.equal(contentSources(readVaultSnapshot(f.runtime))[0].document.id, f.source.document.id);
    assert.equal(api.readContent(beforeContent.id).body, '人工当前稿一\n\n人工当前稿二');
    assert.equal(resolveVaultMutation(f.runtime, mid).state, 'uncertain');
    fs.writeFileSync(path.join(f.root, 'README.md'), before['README.md']);
    assert.equal(resolveVaultMutation(f.runtime, mid).state, 'committed');
    assert.equal(contentSources(readVaultSnapshot(f.runtime))[0].document.id, result.document.id);
});
test('building a work draft retains existing published facts and production stage', async t => {
    const {createVaultWorkingDraft} = await modulePromise;
    const f = fixture(t), card = path.join(f.root, '04_选题库/T007_原篇.md');
    fs.writeFileSync(card, '# 原篇\n\n状态：已发布\n');
    const api = openLibrary(f.runtime), content = api.listContents()[0];
    assert.equal(api.readProductionCreation(content.id).creation.stage, 'published');
    createVaultWorkingDraft(f.runtime, f.input, {
        mutationId: randomUUID()
    });
    assert.equal(api.readProductionCreation(content.id).creation.stage, 'published');
    assert.equal(fs.readFileSync(card, 'utf8'), '# 原篇\n\n状态：已发布\n');
});
test('navigation uses the same original bytes for managed output and CAS, preserving concurrent manual append',async t=>{const {createVaultWorkingDraft}=await modulePromise;const f=fixture(t),readme=path.join(f.root,'README.md'),original=fs.readFileSync,baseline=original(readme),marker='\n外部新增人工正文，必须保留\n';let injected=false;t.mock.method(fs,'readFileSync',function(...args){const bytes=Reflect.apply(original,fs,args);if(!injected&&Buffer.isBuffer(bytes)&&bytes.equals(baseline)&&new Error().stack.includes('at readBytes')&&new Error().stack.includes('working-draft.mjs')){injected=true;fs.appendFileSync(readme,marker);}return bytes;});assert.throws(()=>createVaultWorkingDraft(f.runtime,f.input,{mutationId:randomUUID()}),{code:'CONFLICT'});assert.equal(injected,true);assert.ok(original(readme,'utf8').includes(marker));});
test('committed current MD remains pinned but a later explicit overview switch is visible and blocks source writes',async t=>{const {createVaultWorkingDraft}=await modulePromise;const f=fixture(t),api=openLibrary(f.runtime),content=api.listContents()[0],result=createVaultWorkingDraft(f.runtime,f.input,{mutationId:randomUUID()});const beforeConflict=api.readContent(content.id);fs.writeFileSync(path.join(f.root,f.folder,'另一个明确稿.md'),'另一篇当前稿');fs.writeFileSync(path.join(f.root,'05_内容草稿/00_草稿总览.md'),'| T007 | [工作稿](T007_原篇/另一个明确稿.md) |');const snapshot=readVaultSnapshot(f.runtime),source=contentSources(snapshot)[0];assert.equal(source.document.id,result.document.id);assert.equal(source.document.writable,false);assert.ok(source.document.sourceConflict);assert.ok(snapshot.issues.some(issue=>issue.code==='CURRENT_SOURCE_CONFLICT'));assert.throws(()=>api.updateContent(content.id,{title:'不允许绕过来源冲突'},beforeConflict.editToken),{code:'CONFLICT'});const current=readVaultDocument(f.runtime,result.document.id);assert.equal(current.document.writable,false);const {saveVaultDocument}=await import('../index.mjs');assert.throws(()=>saveVaultDocument(f.runtime,{id:result.document.id,expectedHash:current.document.hash,text:'不能覆盖不一致来源'},{mutationId:randomUUID()}),{code:'CONFLICT'});assert.equal(fs.readFileSync(path.join(f.root,result.document.relativePath),'utf8'),result.text);fs.writeFileSync(path.join(f.root,'05_内容草稿/00_草稿总览.md'),'| T007 | [创作页](T007_原篇/创作页.html) |\n');assert.equal(readVaultDocument(f.runtime,result.document.id).document.writable,true);});
