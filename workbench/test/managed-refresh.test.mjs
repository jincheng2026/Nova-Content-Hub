import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {errorInfo} from '../src/shared/contracts.ts';

// Execute the actual App action and management hooks; JSX/native IPC are outside this unit test.
const appSource = await fs.readFile(new URL('../src/renderer/app.tsx', import.meta.url), 'utf8');
const appActions = appSource.slice(appSource.indexOf('function App() {'), appSource.indexOf('    const task = status?.task;')) + '\nreturn {nativeAction, backgroundAction, refreshWorkspace, refreshEditor, refreshStatus, load, setDraft, draft, error, status, workspace, library, acting};}';
const managementSource = await fs.readFile(new URL('../src/renderer/library-panels.tsx', import.meta.url), 'utf8');
const mutation = managementSource.slice(managementSource.indexOf('export function useWorkspaceMutation'), managementSource.indexOf('const managedDrafts')).replace('export ', '');
const reload = managementSource.slice(managementSource.indexOf('async function reloadManagedWorkspace'), managementSource.indexOf('export function ManagementDialog'));
const compiled = stripTypeScriptTypes(appActions + '\n' + mutation + '\n' + reload);
function fixture() {
    const appSlots = [], hookSlots = [], calls = [], item = {id: 'content', title: 'saved', body: 'body', editToken: 'original'};
    const library = {editToken: 'snapshot'};
    let slots = appSlots, cursor = 0, failure, pause;
    const context = vm.createContext({
        useMemo: calculate => calculate(),
        useState(initial) {const i = cursor++; if (!(i in slots)) slots[i] = initial; const target = slots; return [target[i], value => {target[i] = typeof value === 'function' ? value(target[i]) : value;}];},
        useRef(initial) {const i = cursor++; return slots[i] ??= {current: initial};},
        useEffect() {}, useLayoutEffect() {}, errorInfo, document: {hidden: false}, hasManagedDrafts: () => false,
        async invoke(method, input) {
            calls.push({method, input});
            if (pause?.method === method) await pause.wait;
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
    return {calls, item, library, render, hook, pause(method) {let release; const wait = new Promise(resolve => {release = resolve;}); pause = {method, wait}; return () => {pause = null; release();};}, reload: apply => context.reloadManagedWorkspace(props(), apply), fail(method, code, times = 1) {failure = {method, code, times};}, count: method => calls.filter(call => call.method === method).length};
}
const settled = () => new Promise(resolve => setImmediate(resolve));
const input = {op: 'setCollectionMembers', id: 'collection', editToken: 'original', memberIds: ['content']};
function assertScans(f, count) {for (const method of ['readWorkspace', 'listCoverAssets', 'readWorkspaceLibrary']) assert.equal(f.count(method), count, method);}

test('successful managed save applies its confirmed snapshot before one background refresh', async () => {
    const f = fixture(); await f.render().refreshStatus(); let saved;
    assert.equal(await f.hook().mutate(input, library => {saved = library;}), true);
    assert.equal(f.render().library, f.library); assert.equal(saved, f.library); await settled(); assertScans(f, 1);
    assert.deepEqual(f.calls.find(call => call.method === 'mutateWorkspace').input, input);
    assert.equal(f.render().acting, false);
});
for (const code of ['CONFLICT', 'COMMIT_UNCERTAIN']) test(`${code} preserves the editor and still refreshes status plus the workspace`, async () => {
    const f = fixture(); await f.render().refreshStatus(); let closed = false; f.render().load(f.item); f.render().setDraft({title: 'draft', body: 'keep me'}); f.fail('mutateWorkspace', code);
    assert.equal(await f.hook().mutate(input, () => {closed = true;}), undefined);
    assert.equal(closed, false); await settled(); assertScans(f, 1); assert.ok(f.count('status') >= 1);
    assert.match(f.render().error, new RegExp(code)); assert.equal(f.render().draft.body, 'keep me');
});
test('a background refresh failure retains the acknowledged save and permits an explicit refresh retry', async () => {
    const f = fixture(); await f.render().refreshStatus(); f.fail('readWorkspace', 'TEMPORARY_READ');
    assert.equal(await f.hook().mutate(input), true);
    await settled(); assertScans(f, 1); assert.equal(f.count('mutateWorkspace'), 1);
    assert.match(f.render().error, /TEMPORARY_READ/); assert.equal(f.render().library, f.library); assert.equal(f.render().acting, false);
    await f.render().refreshWorkspace(); assertScans(f, 2); assert.equal(f.render().workspace.version, 1);
});
test('editor reconciliation failure keeps one deferred full read and the committed snapshot', async () => {
    const f = fixture(); await f.render().refreshStatus(); f.render().load(f.item); f.fail('readContent', 'EDITOR_READ');
    const refresh = async () => {await f.render().refreshWorkspace(); await f.render().refreshEditor();};
    assert.equal(await f.hook(refresh).mutate(input), undefined); await settled(); assertScans(f, 1); assert.equal(f.count('readContent'), 2);
    assert.match(f.render().error, /EDITOR_READ/);
});
test('explicit management reload reuses the freshly read snapshot', async () => {
    const f = fixture(); let applied;
    await f.reload(library => {applied = library;});
    assert.equal(applied, f.library); assert.equal(f.render().library, f.library); assert.equal(f.count('readWorkspaceLibrary'), 1);
    assert.equal(f.count('readWorkspace'), 0); assert.equal(f.count('listCoverAssets'), 0); assert.equal(f.count('status'), 1);
});
test('default foreground/editor/import actions retain their workspace refresh; automatic-cover opt-out stays separate', async () => {
    const f = fixture(); await f.render().refreshStatus(); await f.render().nativeAction(async () => 'imported'); await settled(); assertScans(f, 1);
    await f.render().nativeAction(async () => 'editor'); await settled(); assertScans(f, 2);
    await f.render().nativeAction(async () => {}, {refreshWorkspaceAfter: false}); assertScans(f, 2);
    await f.render().nativeAction(async () => {throw new Error('cover read');}, {refreshWorkspaceAfter: false}); assertScans(f, 2);
    assert.ok(f.count('status') >= 4);
});

for (const code of ['BUSY', 'CONFLICT']) test(`queued managed success clears only a background BUSY marker: ${code}`, async () => {
    const f = fixture(); await f.render().refreshStatus(); let release; const gate = new Promise(resolve => {release = resolve;});
    const background = f.render().backgroundAction(async () => {await gate; throw Object.assign(new Error(code), {code});});
    await new Promise(resolve => setImmediate(resolve));
    const saving = f.hook().mutate(input); release(); await background; assert.equal(await saving, true);
    await settled(); assert.equal(f.count('mutateWorkspace'), 1); assertScans(f, 2);
    assert.equal(f.render().error, code === 'BUSY' ? '' : 'CONFLICT（CONFLICT）');
});

test('a committed management action releases its controls before a delayed full-library refresh', async () => {
    const f = fixture(); await f.render().refreshStatus();
    const release = f.pause('readWorkspace');
    let settled = false;
    const saving = f.hook().mutate(input).then(value => {settled = true; return value;});
    await new Promise(resolve => setImmediate(resolve));
    try {
        assert.equal(f.count('mutateWorkspace'), 1, 'the channel-like mutation was committed once');
        assert.equal(f.render().acting, false, 'confirmed save must not leave all controls grey during a full-library read');
        assert.equal(settled, true, 'save acknowledgement is independent of refresh completion');
    } finally {release(); await saving;}
});

test('explicit panel refresh callbacks share the nonblocking background path', async () => {
    const f = fixture(); await f.render().refreshStatus(); const release = f.pause('readWorkspace');
    const action = f.render().nativeAction(async () => {await f.render().refreshWorkspace(); return 'saved';});
    await settled();
    try {assert.equal(f.render().acting, false); assert.equal(await action, 'saved');}
    finally {release(); await settled();}
});
