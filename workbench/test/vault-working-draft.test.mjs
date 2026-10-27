import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createVault} from '../../plugin-src/src/lib/vault/index.mjs';
import {DesktopController} from '../src/main/controller.mts';
import {BindingStore, validateBinding} from '../src/main/bindings.mts';
import {execute} from '../src/main/worker.mts';
import {validateInput} from '../src/shared/validation.ts';
import {reconcileVaultEditor} from '../src/shared/vault-editor-recovery.ts';
async function fixture(t, mode = 'disabled') {
    const parent = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'nova-working-desktop-'));
    t.after(() => fs.rm(parent, {
        recursive: true,
        force: true
    }));
    const root = path.join(parent, '库');
    await fs.mkdir(root);
    const binding = createVault(root);
    await fs.mkdir(path.join(root, '05_内容草稿/T009_原篇'));
    const html = '<script id="jc-doc" type="application/json">' + JSON.stringify({
        schema: 1,
        items: [{
            kind: 'segment',
            fields: {
                mine: '原人工稿'
            }
        }]
    }) + '</script>';
    await fs.writeFile(path.join(root, '05_内容草稿/T009_原篇/创作页.html'), html);
    const store = new BindingStore(path.join(parent, 'binding.json'));
    const c = new DesktopController({
        store,
        worker: {
            call: (op, args) => execute(op, args, mode)
        },
        documents: parent,
        authMode: mode,
        dialogs: {
            destination: async () => null
        }
    });
    c.covers.seed = async () => {};
    await c.initialize();
    await c.persist({
        ...c.binding,
        current: binding
    });
    const document = (await c.readVault()).documents.find(d => d.format === 'html');
    return {
        c,
        store,
        binding,
        root,
        document,
        html
    };
}
test('finite conversion method validates exact id/hash and rejects injected renderer locations', () => {
    const input = {
        id: 'doc-' + ('a').repeat(32),
        expectedHash: ('b').repeat(64)
    };
    assert.doesNotThrow(() => validateInput('createVaultWorkingDraft', input));
    for (const field of ['path', 'root', 'runtimeRoot', 'contentId', 'text']) assert.throws(() => validateInput('createVaultWorkingDraft', {
        ...input,
        [field]: '/tmp'
    }), {
        code: 'INVALID_INPUT'
    });
});
test('conversion lost response persists exact pending and recovers editor onto current MD', async t => {
    const {c, store, document} = await fixture(t);
    assert.equal(typeof c.createVaultWorkingDraft, 'function');
    const source = await c.readVaultDocument({
        id: document.id
    });
    assert.equal(source.workingDraftAvailable, true);
    assert.equal(source.text, '原人工稿');
    const real = c.worker;
    let drop = true;
    c.worker = {
        call: async (op, args) => {
            const value = await real.call(op, args);
            if (op === 'vaultMutate' && drop) {
                drop = false;
                throw Object.assign(new Error('lost'), {
                    code: 'WORKER_EXIT'
                });
            }
            return value;
        }
    };
    const input = {
        id: document.id,
        expectedHash: document.hash
    };
    await assert.rejects(c.createVaultWorkingDraft(input), {
        code: 'WORKER_EXIT'
    });
    const pending = (await store.load()).vaultPending;
    assert.equal(pending.method, 'createVaultWorkingDraft');
    validateBinding(await store.load());
    const result = await c.recoverVaultMutation({
        action: 'retry'
    });
    const editor = reconcileVaultEditor({
        current: source,
        text: source.text,
        title: '',
        category: 'drafts',
        submission: {
            method: 'createVaultWorkingDraft',
            input
        }
    }, result);
    assert.equal(editor.current.document.format, 'markdown');
    assert.equal(editor.current.document.writable, true);
    assert.equal(editor.text, '原人工稿');
    assert.equal(c.binding.vaultPending, null);
    await c.saveVaultDocument({
        id: editor.current.document.id,
        expectedHash: editor.current.document.hash,
        text: '可以续写'
    });
    assert.equal((await c.readVaultDocument({
        id: editor.current.document.id
    })).text, '可以续写');
});
test('conversion is forbidden in required mode in both controller and worker', async t => {
    const {c, binding, document} = await fixture(t, 'required');
    assert.equal(typeof c.createVaultWorkingDraft, 'function');
    const input = {
        id: document.id,
        expectedHash: document.hash
    };
    await assert.rejects(c.createVaultWorkingDraft(input), {
        code: 'AUTH_NOT_CONFIGURED'
    });
    await assert.rejects(execute('vaultMutate', {
        binding,
        pending: {
            method: 'createVaultWorkingDraft',
            input,
            mutationId: randomUUID(),
            binding: {
                libraryId: binding.libraryId,
                rootIdentity: binding.rootIdentity
            }
        }
    }, 'required'), {
        code: 'AUTH_NOT_CONFIGURED'
    });
});
test('finite current content source read resolves only bound UUIDs, follows conversion and makes missing/conflict explicit',async t=>{const {c,root,document}=await fixture(t);assert.equal(typeof c.readVaultContentSource,'function');const content=(await c.listContents())[0],input={contentId:content.id};validateInput('readVaultContentSource',input);for(const extra of ['path','root','runtimeRoot','id'])assert.throws(()=>validateInput('readVaultContentSource',{...input,[extra]:'/tmp'}),{code:'INVALID_INPUT'});assert.throws(()=>validateInput('readVaultContentSource',{contentId:'../../README.md'}),{code:'INVALID_INPUT'});await assert.rejects(c.readVaultContentSource({contentId:randomUUID()}),{code:'NOT_FOUND'});assert.equal((await c.readVaultContentSource(input)).document.id,document.id);const result=await c.createVaultWorkingDraft({id:document.id,expectedHash:document.hash});assert.equal((await c.readVaultContentSource(input)).document.id,result.document.id);await fs.rename(path.join(root,result.document.relativePath),path.join(root,'移走工作稿.md'));await assert.rejects(c.readVaultContentSource(input),error=>['NOT_FOUND','CONFLICT'].includes(error.code));await fs.rename(path.join(root,'移走工作稿.md'),path.join(root,result.document.relativePath));await fs.writeFile(path.join(root,'05_内容草稿/T009_原篇/其他稿.md'),'其他内容');await fs.writeFile(path.join(root,'05_内容草稿/00_草稿总览.md'),'| T009 | [工作稿](T009_原篇/其他稿.md) |');await assert.rejects(c.readVaultContentSource(input),{code:'CONFLICT'});assert.ok((await c.readVault()).issues.some(issue=>issue.code==='CURRENT_SOURCE_CONFLICT'));});
test('current source read is available in required mode and returns null for a legacy content library',async t=>{const {c,binding,root}=await fixture(t,'required');assert.equal(typeof c.readVaultContentSource,'function');const content=(await c.listContents())[0];assert.equal((await c.readVaultContentSource({contentId:content.id})).document.format,'html');const {createLibrary}=await import('../../plugin-src/src/lib/file-library/index.mjs'),legacy=createLibrary(path.join(path.dirname(root),'旧库')),old=legacy.createContent({title:'旧内容',body:'旧正文'}),legacyBinding={root:legacy.info.root,libraryId:legacy.info.libraryId,rootIdentity:legacy.info.rootIdentity};assert.equal(await execute('vaultContentSource',{binding:legacyBinding,contentId:old.id},'required'),null);await assert.rejects(execute('vaultContentSource',{binding,contentId:content.id,path:'/tmp'},'required'),{code:'INVALID_INPUT'});});
