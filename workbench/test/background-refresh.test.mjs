import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {errorInfo} from '../src/shared/contracts.ts';

// Run the actual App hooks and actions, stopping before UI rendering and Electron mounting.
const source = await fs.readFile(new URL('../src/renderer/app.tsx', import.meta.url), 'utf8');
const actions = source.slice(source.indexOf('function App() {'), source.indexOf('    const task = status?.task;')) + `
    return {nativeAction, refreshStatus, refreshWorkspace, load, clearEditor, setDraft,
        refresh: () => {changesPending.current = true; automaticRefresh.current();},
        error, status, workspace, contents, draft, disk, pendingRefresh: changesPending.current};
}`;
const compiled = stripTypeScriptTypes(actions);

function fixture() {
    const slots = [];
    let cursor = 0, fail = null, version = 0;
    const calls = [];
    const item = {id: 'content', title: 'saved', body: 'saved body', editToken: 'original'};
    const context = vm.createContext({
        useState(initial) {
            const index = cursor++;
            if (!(index in slots)) slots[index] = initial;
            return [slots[index], value => {slots[index] = typeof value === 'function' ? value(slots[index]) : value;}];
        },
        useRef(initial) {const index = cursor++; return slots[index] ??= {current: initial};},
        useEffect() {},
        useLayoutEffect() {},
        errorInfo,
        document: {hidden: false},
        hasManagedDrafts: () => false,
        async invoke(method) {
            calls.push(method);
            if (fail?.method === method) throw Object.assign(new Error(fail.code), {code: fail.code});
            if (method === 'status') return {currentName: 'library', busy: false, pending: null};
            if (method === 'listContents') return [{...item, version}];
            if (method === 'readContent') return item;
            return {version};
        }
    });
    vm.runInContext(compiled, context);
    const render = () => {cursor = 0; return context.App();};
    return {render, calls, item, fail(method, code = 'BUSY') {fail = method ? {method, code} : null;}, version(value) {version = value;}};
}

async function ready(f) {
    await f.render().refreshStatus();
    await f.render().refreshWorkspace();
    return f.render();
}
async function refresh(f) {
    f.render().refresh();
    await new Promise(resolve => setImmediate(resolve));
    return f.render();
}
const failure = code => Object.assign(new Error(code), {code});

test('automatic BUSY preserves old workspace and draft, then clears after a complete refresh', async () => {
    const f = fixture();
    let app = await ready(f);
    app.load(f.item);
    f.render().setDraft({title: 'unsaved', body: 'my draft'});
    await refresh(f);
    f.version(1);
    f.fail('listContents');
    app = await refresh(f);
    assert.match(app.error, /BUSY/);
    assert.equal(app.workspace.version, 1);
    assert.equal(app.contents[0].version, 0);
    assert.equal(app.draft.body, 'my draft');
    assert.equal(app.pendingRefresh, false);
    const calls = f.calls.length;
    f.render();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.calls.length, calls);
    f.fail(null);
    app = await refresh(f);
    assert.equal(app.error, '');
    assert.equal(app.contents[0].version, 1);
    assert.equal(app.draft.body, 'my draft');
});

test('background success retains foreground BUSY, conflicts and unrelated errors', async () => {
    for (const code of ['BUSY', 'CONFLICT', 'RECOVERY_CONFLICT', 'WORKER_EXIT']) {
        const f = fixture();
        await ready(f);
        await f.render().nativeAction(async () => {throw failure(code);});
        const original = f.render().error;
        f.fail('listContents');
        assert.equal((await refresh(f)).error, original);
        f.fail(null);
        assert.equal((await refresh(f)).error, original);
    }
});

test('background status/workspace failure cannot clear BUSY or erase prior status and data', async () => {
    const f = fixture();
    await ready(f);
    f.fail('status');
    let app = await refresh(f);
    assert.match(app.error, /BUSY/);
    assert.equal(app.status.currentName, 'library');
    assert.equal(app.workspace.version, 0);
    f.fail('readWorkspace');
    app = await refresh(f);
    assert.match(app.error, /BUSY/);
    assert.equal(app.workspace.version, 0);
    f.fail(null);
    assert.equal((await refresh(f)).error, '');
});

test('a later non-BUSY failure replaces background BUSY and survives success', async () => {
    const f = fixture();
    await ready(f);
    f.fail('listContents');
    await refresh(f);
    f.fail('readWorkspace', 'CONFLICT');
    assert.match((await refresh(f)).error, /CONFLICT/);
    f.fail(null);
    assert.match((await refresh(f)).error, /CONFLICT/);
});

test('success in another library epoch cannot clear an earlier library BUSY', async () => {
    const f = fixture();
    await ready(f);
    f.fail('listContents');
    const app = await refresh(f);
    const original = app.error;
    app.clearEditor();
    f.fail(null);
    await ready(f);
    assert.equal((await refresh(f)).error, original);
});
