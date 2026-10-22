import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {errorInfo} from '../src/shared/contracts.ts';

// Execute the actual App action and management hooks, including its confirmed-snapshot projection.
const appSource = await fs.readFile(new URL('../src/renderer/app.tsx', import.meta.url), 'utf8');
const appActions = appSource.slice(appSource.indexOf('function App() {'), appSource.indexOf('    const currentCollection = library?.collections.find')) + '\nreturn {nativeAction, backgroundAction, refreshWorkspace, refreshEditor, refreshStatus, load, setDraft, draft, error, status, workspace, library, acting};}';
const managementSource = await fs.readFile(new URL('../src/renderer/library-panels.tsx', import.meta.url), 'utf8');
const mutation = managementSource.slice(managementSource.indexOf('export function useWorkspaceMutation'), managementSource.indexOf('const managedDrafts')).replace('export ', '');
const reload = managementSource.slice(managementSource.indexOf('async function reloadManagedWorkspace'), managementSource.indexOf('export function ManagementDialog'));
const compiled = stripTypeScriptTypes(appActions + '\n' + mutation + '\n' + reload);
function fixture() {
    const appSlots = [], hookSlots = [], calls = [];
    const entity = {createdAt: '2026-10-22T00:00:00.000Z', updatedAt: '2026-10-22T00:00:00.000Z', deletedAt: null, editToken: 'original'};
    const item = {...entity, id: 'content', title: 'saved', body: 'body', channelIds: [], materials: [], plans: [], publications: [], publicationEvents: [], candidates: [], coverVariants: [], recordedDate: null, plannedDate: null, preferredTemplateId: null, isExample: false};
    const other = {...item, id: 'unrelated', title: 'unrelated content'};
    const prompt = {...entity, id: 'prompt', title: 'prompt', body: 'prompt body', category: '', summary: '', when: '', tags: [], enabled: true, favorite: false};
    const collection = {...item, id: 'collection', title: 'collection', dateRange: {start: null, end: null}, memberIds: []};
    const initial = {contentDetails: [item, other], collections: [collection], prompts: [prompt], templates: [], photos: [], settings: {
        editToken: 'settings', profile: {name: '', intro: '', avatarAssetHash: null, marks: []}, defaults: {photoId: null, templateId: null, coverCount: 1},
        channels: [{id: 'wechat', name: '微信公众号', ink: '#000000', bg: '#ffffff', requiredRatio: null, deletedAt: null}], promptCategories: [], visiblePromptCategories: [], customRatios: [], defaultIssues: []
    }};
    const library = {...initial, collections: [{...collection, editToken: 'confirmed', memberIds: ['content']}]};
    let slots = appSlots, cursor = 0, failure, pause, acknowledged = library, disk = initial, pending = null;
    const context = vm.createContext({
        useMemo: calculate => calculate(),
        useState(initial) {const i = cursor++; if (!(i in slots)) slots[i] = initial; const target = slots; return [target[i], value => {target[i] = typeof value === 'function' ? value(target[i]) : value;}];},
        useRef(initial) {const i = cursor++; return slots[i] ??= {current: initial};},
        useEffect() {}, useLayoutEffect() {}, errorInfo, document: {hidden: false}, hasManagedDrafts: () => false,
        async invoke(method, input) {
            calls.push({method, input});
            if (pause?.method === method) await pause.wait;
            if (failure?.method === method && failure.times-- > 0) {
                if (method === 'mutateWorkspace') pending = {mutationId: 'pending', input, state: failure.code === 'CONFLICT' ? 'conflict' : 'uncertain'};
                throw Object.assign(new Error(failure.code), {code: failure.code});
            }
            if (method === 'status') return {currentName: 'fixture', busy: false, pending: null, workspacePending: pending};
            if (method === 'mutateWorkspace') {disk = acknowledged; return {library: acknowledged, objectId: input.id};}
            if (method === 'updatePromptFavorite') return {...prompt, favorite: input.favorite, editToken: 'favorite-confirmed'};
            if (method === 'readWorkspaceLibrary') return disk;
            if (method === 'readWorkspace') return {contents: [{...item, candidateCount: 0, selectedCandidateId: null}, {...other, candidateCount: 0, selectedCandidateId: null}], prompts: [prompt], channels: [{id: 'wechat', name: '微信公众号', enabled: true}]};
            if (method === 'listCoverAssets') return {templates: [], photos: []};
            if (method === 'listContents') return [item, other];
            if (method === 'readContent') return item;
            throw new Error(`Unexpected IPC: ${method}`);
        }
    });
    vm.runInContext(compiled, context);
    const render = () => {slots = appSlots; cursor = 0; return context.App();};
    const props = refresh => ({busy: false, library: render().library, run: render().nativeAction, refresh: refresh ?? render().refreshWorkspace});
    const hook = refresh => {const hookProps = props(refresh); slots = hookSlots; cursor = 0; return context.useWorkspaceMutation(hookProps);};
    return {calls, item, other, initial, library, render, hook,
        setAcknowledged(value) {acknowledged = value;}, setDisk(value) {disk = value;},
        pause(method) {let release; const wait = new Promise(resolve => {release = resolve;}); pause = {method, wait}; return () => {pause = null; release();};},
        reload: apply => context.reloadManagedWorkspace(props(), apply), fail(method, code, times = 1) {failure = {method, code, times};}, count: method => calls.filter(call => call.method === method).length};
}
const settled = () => new Promise(resolve => setImmediate(resolve));
const input = {op: 'setCollectionMembers', id: 'collection', editToken: 'original', memberIds: ['content']};
function assertScans(f, count) {for (const method of ['readWorkspace', 'listCoverAssets', 'readWorkspaceLibrary']) assert.equal(f.count(method), count, method);}
async function ready(f) {await f.render().refreshStatus(); await f.render().refreshWorkspace(); f.calls.length = 0;}

test('successful managed save applies the acknowledged collection snapshot without global reads or a global busy lock', async () => {
    const f = fixture(); await ready(f); let saved;
    assert.equal(await f.hook().mutate(input, library => {saved = library;}), true);
    const app = f.render();
    assert.equal(app.library, f.library); assert.equal(saved, f.library);
    assert.deepEqual(app.library.collections[0].memberIds, ['content']);
    assert.equal(app.library.contentDetails[1], f.other);
    assert.equal(app.library.prompts, f.initial.prompts); assert.equal(app.library.photos, f.initial.photos); assert.equal(app.library.templates, f.initial.templates);
    assert.equal(app.workspace.contents[0].candidateCount, 0); assert.equal(app.workspace.channels[0].name, '微信公众号');
    await settled(); assertScans(f, 0); assert.equal(f.count('status'), 1);
    assert.deepEqual(f.calls.find(call => call.method === 'mutateWorkspace').input, input);
    assert.equal(app.acting, false); assert.equal(f.hook().pendingIds.size, 0);
});

test('managed save callback supplies the exact acknowledged object ID and snapshot', async () => {
    const f = fixture(); await ready(f); let saved, objectId;
    assert.equal(await f.hook().mutate(input, (library, id) => {saved = library; objectId = id;}), true);
    assert.equal(saved, f.library); assert.equal(objectId, input.id); assertScans(f, 0);
});

for (const code of ['CONFLICT', 'COMMIT_UNCERTAIN']) test(`${code} retains the editor, prior snapshot and exact pending input while refreshing status`, async () => {
    const f = fixture(); await ready(f); let closed = false;
    f.render().load(f.item); f.render().setDraft({title: 'draft', body: 'keep me'}); f.fail('mutateWorkspace', code);
    assert.equal(await f.hook().mutate(input, () => {closed = true;}), undefined);
    assert.equal(closed, false); await settled(); assertScans(f, 0); assert.equal(f.count('status'), 1);
    const app = f.render();
    assert.match(app.error, new RegExp(code)); assert.equal(app.draft.body, 'keep me'); assert.equal(app.library, f.initial);
    assert.deepEqual(app.status.workspacePending.input, input); assert.equal(app.status.workspacePending.state, code === 'CONFLICT' ? 'conflict' : 'uncertain');
    assert.equal(app.acting, false); assert.equal(f.hook().pendingIds.size, 0);
});

test('a later background read failure retains the acknowledged save and permits an explicit read retry', async () => {
    const f = fixture(); await ready(f);
    assert.equal(await f.hook().mutate(input), true); assertScans(f, 0);
    f.fail('readWorkspace', 'TEMPORARY_READ');
    await f.render().backgroundAction(async () => {});
    assertScans(f, 1); assert.equal(f.count('mutateWorkspace'), 1);
    assert.match(f.render().error, /TEMPORARY_READ/); assert.equal(f.render().library, f.library); assert.equal(f.render().acting, false);
    await f.render().refreshWorkspace(); assertScans(f, 2); assert.equal(f.render().workspace.contents[1].id, f.other.id);
    assert.equal(f.count('mutateWorkspace'), 1, 'read retry must not resubmit the confirmed write');
});

test('explicit editor reconciliation failure retains the acknowledged snapshot and retries only that editor read', async () => {
    const f = fixture(); await ready(f); f.render().load(f.item); f.fail('readContent', 'EDITOR_READ');
    const refresh = async snapshot => {await f.render().refreshWorkspace(snapshot); await f.render().refreshEditor();};
    assert.equal(await f.hook(refresh).mutate(input), undefined);
    assertScans(f, 0); assert.equal(f.count('readContent'), 1); assert.equal(f.render().library, f.library);
    assert.match(f.render().error, /EDITOR_READ/); assert.match(f.hook().notice, /已保存到本机，界面刷新未完成/);
    assert.equal(f.render().draft.body, f.item.body);
    await f.render().refreshEditor(); assert.equal(f.count('readContent'), 2); assertScans(f, 0); assert.equal(f.count('mutateWorkspace'), 1);
});

test('explicit management reload reuses its freshly read snapshot without other library scans', async () => {
    const f = fixture(); await ready(f); f.setDisk(f.library); let applied;
    await f.reload(library => {applied = library;});
    assert.equal(applied, f.library); assert.equal(f.render().library, f.library); assert.equal(f.count('readWorkspaceLibrary'), 1);
    assert.equal(f.count('readWorkspace'), 0); assert.equal(f.count('listCoverAssets'), 0); assert.equal(f.count('status'), 1);
});

test('default foreground actions retain full refresh and automatic-cover opt-out remains separate', async () => {
    const f = fixture(); await ready(f); await f.render().nativeAction(async () => 'native action'); await settled(); assertScans(f, 1);
    await f.render().nativeAction(async () => 'editor'); await settled(); assertScans(f, 2);
    await f.render().nativeAction(async () => {}, {refreshWorkspaceAfter: false}); assertScans(f, 2);
    await f.render().nativeAction(async () => {throw new Error('cover read');}, {refreshWorkspaceAfter: false}); assertScans(f, 2);
    assert.ok(f.count('status') >= 4);
});

for (const code of ['BUSY', 'CONFLICT']) test(`queued managed save starts after background ${code} and retains its own acknowledgement`, async () => {
    const f = fixture(); await ready(f); let release; const gate = new Promise(resolve => {release = resolve;});
    const background = f.render().backgroundAction(async () => {await gate; throw Object.assign(new Error(code), {code});});
    await settled(); const saving = f.hook().mutate(input);
    assert.equal(f.render().acting, false); assert.equal(f.count('mutateWorkspace'), 0);
    release(); await background; assert.equal(await saving, true);
    await settled(); assert.equal(f.count('mutateWorkspace'), 1); assertScans(f, 1);
    assert.equal(f.render().error, ''); assert.equal(f.render().library, f.library); assert.equal(f.render().status.workspacePending, null);
});

test('only the affected management row is pending while its mutation awaits acknowledgement', async () => {
    const f = fixture(); await ready(f); const release = f.pause('mutateWorkspace');
    const saving = f.hook().mutate(input); await settled();
    try {
        assert.equal(f.count('mutateWorkspace'), 1);
        assert.equal(f.hook().pendingIds.has('collection'), true); assert.equal(f.hook().pendingIds.has('unrelated'), false);
        assert.equal(f.render().acting, false);
        assert.equal(await f.hook().mutate(input), undefined, 'the same row cannot submit twice');
        assert.equal(f.count('mutateWorkspace'), 1);
    } finally {release(); assert.equal(await saving, true);}
    assertScans(f, 0); assert.equal(f.hook().pendingIds.size, 0);
});

test('an acknowledged asset change refreshes only cover assets, once', async () => {
    const f = fixture(); await ready(f);
    f.setAcknowledged({...f.library, photos: [{...f.item, id: 'photo', assetHash: 'a'.repeat(64), isOwnPhoto: true, availability: 'available', originalName: 'photo.png'}]});
    assert.equal(await f.hook().mutate(input), true);
    assert.equal(f.count('listCoverAssets'), 1); assert.equal(f.count('readWorkspace'), 0); assert.equal(f.count('readWorkspaceLibrary'), 0);
    assert.equal(await f.hook().mutate(input), true); assert.equal(f.count('listCoverAssets'), 1);
    assert.equal(f.render().acting, false);
});

test('prompt favorite acknowledgement replaces only that prompt without unrelated scans', async () => {
    const f = fixture(); await ready(f);
    assert.equal(await f.hook().mutate({op: 'setPromptFavorite', id: 'prompt', editToken: 'original', favorite: true}), true);
    const app = f.render();
    assert.equal(app.library.prompts[0].favorite, true); assert.equal(app.library.prompts[0].editToken, 'favorite-confirmed');
    assert.equal(app.library.contentDetails, f.initial.contentDetails); assert.equal(app.library.collections, f.initial.collections);
    assert.equal(app.workspace.prompts[0].favorite, true); assert.equal(f.count('updatePromptFavorite'), 1); assert.equal(f.count('mutateWorkspace'), 0);
    assertScans(f, 0); assert.equal(app.acting, false);
});

test('explicit panel refresh callbacks share the nonblocking background path', async () => {
    const f = fixture(); await ready(f); const release = f.pause('readWorkspace');
    const action = f.render().nativeAction(async () => {await f.render().refreshWorkspace(); return 'saved';});
    await settled();
    try {assert.equal(f.render().acting, false); assert.equal(await action, 'saved');}
    finally {release(); await settled();}
});
