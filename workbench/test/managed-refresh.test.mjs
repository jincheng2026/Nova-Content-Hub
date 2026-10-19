import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {errorInfo} from '../src/shared/contracts.ts';

// Execute the actual App action and management hooks; JSX/native IPC are outside this unit test.
const appSource = await fs.readFile(new URL('../src/renderer/app.tsx', import.meta.url), 'utf8');
const appActions = appSource.slice(appSource.indexOf('function App() {'), appSource.indexOf('    const task = status?.task;')) + '\nreturn {nativeAction, backgroundAction, refreshWorkspace, refreshEditor, refreshStatus, load, setDraft, draft, error, status, workspace, acting};}';
const managementSource = await fs.readFile(new URL('../src/renderer/library-panels.tsx', import.meta.url), 'utf8');
const mutation = managementSource.slice(managementSource.indexOf('export function useWorkspaceMutation'), managementSource.indexOf('const managedDrafts')).replace('export ', '');
const reload = managementSource.slice(managementSource.indexOf('async function reloadManagedWorkspace'), managementSource.indexOf('export function ManagementDialog'));
const compiled = stripTypeScriptTypes(appActions + '\n' + mutation + '\n' + reload);
function fixture() {
    const appSlots = [], hookSlots = [], calls = [], item = {id: 'content', title: 'saved', body: 'body', editToken: 'original'};
    const library = {editToken: 'snapshot'};
    let slots = appSlots, cursor = 0, failure;
    const context = vm.createContext({
        useState(initial) {const i = cursor++; if (!(i in slots)) slots[i] = initial; const target = slots; return [target[i], value => {target[i] = typeof value === 'function' ? value(target[i]) : value;}];},
        useRef(initial) {const i = cursor++; return slots[i] ??= {current: initial};},
        useEffect() {}, useLayoutEffect() {}, errorInfo, document: {hidden: false}, hasManagedDrafts: () => false,
        async invoke(method, input) {
            calls.push({method, input});
            if (failure?.method === method && failure.times-- > 0) throw Object.assign(new Error(failure.code), {code: failure.code});
            if (method === 'status') return {currentName: 'fixture', busy: false, pending: null};
            if (method === 'mutateWorkspace') return {library};
            if (method === 'readWorkspaceLibrary') return library;
            if (method === 'readContent') return item;
            return {version: 1};
        }
    });
    vm.runInContext(compiled, context);
    const render = () => {slots = appSlots; cursor = 0; return context.App();};
    const props = refresh => ({busy: false, run: render().nativeAction, refresh: refresh ?? render().refreshWorkspace});
    const hook = refresh => {slots = hookSlots; cursor = 0; const hookProps = props(refresh); slots = hookSlots; cursor = 0; return context.useWorkspaceMutation(hookProps);};
    return {calls, item, library, render, hook, reload: apply => context.reloadManagedWorkspace(props(), apply), fail(method, code, times = 1) {failure = {method, code, times};}, count: method => calls.filter(call => call.method === method).length};
}
const input = {op: 'setCollectionMembers', id: 'collection', editToken: 'original', memberIds: ['content']};
function assertScans(f, count) {for (const method of ['readWorkspace', 'listCoverAssets', 'readWorkspaceLibrary']) assert.equal(f.count(method), count, method);}

test('successful managed save performs its explicit workspace refresh exactly once, and refreshes status', async () => {
    const f = fixture(); let saved;
    assert.equal(await f.hook().mutate(input, library => {saved = library;}), true);
    assertScans(f, 1); assert.equal(f.count('status'), 1); assert.equal(saved, f.library);
    assert.deepEqual(f.calls.find(call => call.method === 'mutateWorkspace').input, input);
    assert.equal(f.render().acting, false);
});
for (const code of ['CONFLICT', 'COMMIT_UNCERTAIN']) test(`${code} preserves the editor and still refreshes status plus the workspace`, async () => {
    const f = fixture(); let closed = false; f.render().load(f.item); f.render().setDraft({title: 'draft', body: 'keep me'}); f.fail('mutateWorkspace', code);
    assert.equal(await f.hook().mutate(input, () => {closed = true;}), undefined);
    assert.equal(closed, false); assertScans(f, 1); assert.equal(f.count('status'), 1);
    assert.match(f.render().error, new RegExp(code)); assert.equal(f.render().draft.body, 'keep me');
});
test('an explicit refresh failure triggers the finally retry instead of suppressing reconciliation', async () => {
    const f = fixture(); f.fail('readWorkspace', 'TEMPORARY_READ');
    assert.equal(await f.hook().mutate(input), undefined);
    assertScans(f, 2); assert.equal(f.count('mutateWorkspace'), 1); assert.equal(f.count('status'), 1);
    assert.match(f.render().error, /TEMPORARY_READ/); assert.equal(f.render().workspace.version, 1);
});
test('editor reconciliation failure also keeps the fallback full read', async () => {
    const f = fixture(); f.render().load(f.item); f.fail('readContent', 'EDITOR_READ');
    const refresh = async () => {await f.render().refreshWorkspace(); await f.render().refreshEditor();};
    assert.equal(await f.hook(refresh).mutate(input), undefined); assertScans(f, 2); assert.equal(f.count('readContent'), 1);
    assert.match(f.render().error, /EDITOR_READ/);
});
test('explicit management reload reads the selected object and performs only one full refresh', async () => {
    const f = fixture(); let applied;
    await f.reload(library => {applied = library;});
    assert.equal(applied, f.library); assert.equal(f.count('readWorkspaceLibrary'), 2);
    assert.equal(f.count('readWorkspace'), 1); assert.equal(f.count('listCoverAssets'), 1); assert.equal(f.count('status'), 1);
});
test('default foreground/editor/import actions retain their workspace refresh; automatic-cover opt-out stays separate', async () => {
    const f = fixture(); await f.render().nativeAction(async () => 'imported'); assertScans(f, 1);
    await f.render().nativeAction(async () => 'editor'); assertScans(f, 2);
    await f.render().nativeAction(async () => {}, {refreshWorkspaceAfter: false}); assertScans(f, 2);
    await f.render().nativeAction(async () => {throw new Error('cover read');}, {refreshWorkspaceAfter: false}); assertScans(f, 2);
    assert.equal(f.count('status'), 4);
});

for (const code of ['BUSY', 'CONFLICT']) test(`queued managed success clears only a background BUSY marker: ${code}`, async () => {
    const f = fixture(); let release; const gate = new Promise(resolve => {release = resolve;});
    const background = f.render().backgroundAction(async () => {await gate; throw Object.assign(new Error(code), {code});});
    await new Promise(resolve => setImmediate(resolve));
    const saving = f.hook().mutate(input); release(); await background; assert.equal(await saving, true);
    assert.equal(f.count('mutateWorkspace'), 1); assertScans(f, 2);
    assert.equal(f.render().error, code === 'BUSY' ? '' : 'CONFLICT（CONFLICT）');
});
