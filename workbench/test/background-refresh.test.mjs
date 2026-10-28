import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {errorInfo} from '../src/shared/contracts.ts';

// Run the actual App hooks and actions, stopping before UI rendering and Electron mounting.
const source = await fs.readFile(new URL('../src/renderer/app.tsx', import.meta.url), 'utf8');
const actions = source.slice(source.indexOf('function App() {'), source.indexOf('    const currentCollection = library?.collections.find')) + `
    return {nativeAction, localAction, refreshStatus, refreshWorkspace, load, clearEditor, setDraft,
        refresh: () => {changesPending.current = true; automaticRefresh.current();},
        select, navigate, newContent, backgroundAction, readCoverAutomatically, page, detailOpen, acting, active: active.current,
        registerDetailCloseGuard: guard => {detailCloseGuard.current = guard;},
        error, status, workspace, contents, draft, disk, base, pendingRefresh: changesPending.current};
}`;
const compiled = stripTypeScriptTypes(actions);

function fixture() {
    const slots = [];
    let cursor = 0, fail = null, version = 0, pause = null;
    const calls = [];
    const item = {id: 'content', title: 'saved', body: 'saved body', editToken: 'original'};
    const context = vm.createContext({
        useMemo: calculate => calculate(),
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
            if (pause?.method === method) {const gate = pause; pause = null; await gate.wait;}
            if (fail?.method === method) throw Object.assign(new Error(fail.code), {code: fail.code});
            if (method === 'status') return {currentName: 'library', busy: false, pending: null};
            if (method === 'listContents') return [{...item, version}];
            if (method === 'readContent') return {...item};
            if (method === 'readWorkspaceLibrary') return {version,contentDetails:[],templates:[],photos:[],prompts:[],settings:{channels:[]}};
            if (method === 'readWorkspace') return {version, contents:[{...item,selectedCandidateId:null,candidateCount:0,plans:[]}], prompts:[],channels:[]};
            return {version};
        }
    });
    vm.runInContext(compiled, context);
    const render = () => {cursor = 0; return context.App();};
    return {render, calls, item, pause(method) {let release; const wait = new Promise(resolve => {release = resolve;}); pause = {method, wait}; return release;}, fail(method, code = 'BUSY') {fail = method ? {method, code} : null;}, version(value) {version = value;}};
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

test('focus refresh keeps controls usable and queues one foreground open until reads finish', async () => {
    const f = fixture();
    await ready(f);
    const release = f.pause('listContents');
    f.render().refresh();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(f.render().acting, false, 'background reads must not disable the first click');
    const opened = f.render().select(f.item);
    assert.equal(f.render().acting, true, 'the accepted foreground action owns the write lock');
    assert.equal(f.calls.includes('readContent'), false, 'foreground waits for background reads');
    let duplicate = false;
    await f.render().nativeAction(async () => {duplicate = true;});
    assert.equal(duplicate, false, 'only one foreground operation may be queued');
    release();
    await opened;
    assert.equal(f.render().detailOpen, true);
    assert.equal(f.render().page, 'content');
    assert.equal(f.render().draft.title, 'saved');
    assert.equal(f.render().acting, false);
});

test('navigation and new draft survive a paused focus refresh', async () => {
    const f = fixture();
    await ready(f);
    const release = f.pause('listContents');
    f.render().refresh();
    await Promise.resolve();
    await Promise.resolve();
    await f.render().navigate('templates');
    assert.equal(f.render().page, 'templates');
    await f.render().newContent();
    f.render().setDraft({title: 'unsaved', body: 'typed during refresh'});
    release();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.render().detailOpen, true);
    assert.equal(f.render().draft.body, 'typed during refresh');
});

test('queued foreground write and coalesced change refresh stay mutually exclusive', async () => {
    const f = fixture();
    await ready(f);
    const release = f.pause('listContents');
    f.render().refresh();
    await Promise.resolve();
    await Promise.resolve();
    const before = f.calls.length;
    let writes = 0;
    const write = f.render().nativeAction(async () => {writes++;});
    f.render().refresh();
    f.render().refresh();
    assert.equal(writes, 0);
    assert.equal(f.calls.length, before, 'no concurrent refresh may pass the queued foreground action');
    release();
    await write;
    assert.equal(writes, 1);
    // Completion starts the one coalesced refresh immediately after releasing the write lock.
    assert.equal(f.render().pendingRefresh, false);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.render().pendingRefresh, false);
    assert.equal(f.calls.filter(method => method === 'listContents').length, 2);
});


test('paused editor read preserves a draft typed while its result was in flight', async () => {
    const f = fixture();
    await ready(f);
    f.render().load({...f.item});
    f.render();
    const release = f.pause('readContent');
    f.render().refresh();
    f.render().setDraft({title: 'typing', body: 'new unsaved body'});
    f.render();
    f.item.editToken = 'external-update';
    release();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.render().draft.body, 'new unsaved body');
    assert.equal(f.render().disk.editToken, 'external-update');
});

test('paused list read from an old library epoch cannot repopulate a cleared editor', async () => {
    const f = fixture();
    await ready(f);
    const release = f.pause('listContents');
    f.render().refresh();
    await Promise.resolve();
    await Promise.resolve();
    f.render().clearEditor();
    release();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.render().contents, null);
    assert.equal(f.render().draft, null);
});


test('cover automatic reads share the background promise and finish before the foreground write', async () => {
    const f = fixture();
    await ready(f);
    const release = f.pause('listContents');
    f.render().refresh();
    await Promise.resolve();
    await Promise.resolve();
    const events = [];
    const cover = f.render().backgroundAction(async () => {events.push('cover-read');});
    assert.equal(f.render().acting, false);
    const write = f.render().nativeAction(async () => {events.push('write');});
    assert.deepEqual(events, []);
    release();
    await Promise.all([cover, write]);
    assert.deepEqual(events, ['cover-read', 'write']);
    assert.equal(f.render().acting, false);
});

test('automatic cover reads cannot cross the selected content or library epoch', async () => {
    const f = fixture();
    await ready(f);
    f.render().load({...f.item});
    f.render();
    const release = f.pause('listContents');
    f.render().refresh();
    await Promise.resolve();
    await Promise.resolve();
    const before = f.calls.filter(method => method === 'readCover').length;
    const cover = f.render().readCoverAutomatically(f.item.id);
    f.render().clearEditor();
    release();
    await cover;
    assert.equal(f.calls.filter(method => method === 'readCover').length, before);
    assert.equal(f.render().draft, null);
});


test('local/global/local dispatches keep enqueue order, and a library switch invalidates queued old-epoch work', async () => {
    const f = fixture(); await ready(f);
    let release; const gate = new Promise(resolve => {release = resolve;}), events = [];
    const first = f.render().localAction(async () => {events.push('local-1'); await gate;});
    const next = f.render().nativeAction(async () => {events.push('switch'); f.render().clearEditor();}, {refreshWorkspaceAfter:false});
    const stale = f.render().localAction(async () => {events.push('stale-local-2');});
    await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(events, ['local-1']);
    release(); await Promise.all([first,next,stale]);
    assert.deepEqual(events, ['local-1','switch']); assert.equal(f.render().acting,false);
});

test('local writes and cover background reads share one dispatch order without global busy', async () => {
    const f = fixture(); const app = await ready(f); app.load(f.item);
    let release; const gate = new Promise(resolve => {release = resolve;}), events = [];
    const first = f.render().localAction(async () => {events.push('favorite'); await gate;});
    const read = f.render().backgroundAction(async () => {events.push('cover-read');}, false);
    const second = f.render().localAction(async () => {events.push('favorite-2');});
    await new Promise(resolve => setImmediate(resolve)); assert.equal(f.render().acting,false); assert.deepEqual(events,['favorite']);
    release(); await Promise.all([first,read,second]); assert.deepEqual(events,['favorite','cover-read','favorite-2']);
});


test('confirmed entity snapshots advance the current content CAS without losing unsaved text', async () => {
    const f = fixture(); await ready(f); f.render().load(f.item);
    const snapshot = item => ({contentDetails:[{...item,candidates:[]}],prompts:[],settings:{channels:[]}});
    await f.render().refreshWorkspace(snapshot({...f.item,editToken:'plan-token'}));
    assert.equal(f.render().draft.body, f.item.body); assert.equal(f.render().base.editToken,'plan-token');
    let selected; await f.render().localAction(async()=>{selected=f.render().draft;}); assert.equal(selected.body,f.item.body);
    f.render().setDraft({title:'Unsaved title',body:'My complete unsaved body'}); f.render();
    await f.render().refreshWorkspace(snapshot({...f.item,editToken:'material-token'}));
    assert.equal(f.render().draft.body,'My complete unsaved body'); assert.equal(f.render().base.editToken,'material-token'); assert.equal(f.render().disk,null);
    await f.render().refreshWorkspace(snapshot({...f.item,editToken:'external-token',body:'External body'}));
    assert.equal(f.render().draft.body,'My complete unsaved body'); assert.equal(f.render().disk.body,'External body');
    const unchangedLibrary = snapshot({...f.item,editToken:'old-metadata'});
    f.render().load(f.item); await f.render().refreshWorkspace(unchangedLibrary);
    f.render().load({...f.item,editToken:'new-progress-token',body:'New body from progress'});
    await f.render().refreshWorkspace({...unchangedLibrary,prompts:[]});
    assert.equal(f.render().base.editToken,'new-progress-token');
    assert.equal(f.render().draft.body,'New body from progress','prompt-only snapshot must not roll current content back');
});


test('without a detail close guard navigation starts in the click stack',async()=>{
 const f=fixture();await ready(f);const navigation=f.render().navigate('templates');
 assert.equal(f.render().page,'templates','an absent guard must not delay dispatch into another microtask');await navigation;
});
test('a detail close guard waits for acknowledged source saving before opening content',async()=>{
 const f=fixture();await ready(f);let release;const gate=new Promise(resolve=>{release=resolve;});let saving=false;
 f.render().registerDetailCloseGuard(async()=>{saving=true;await gate;});const opening=f.render().select(f.item);
 assert.equal(saving,true);assert.equal(f.calls.includes('readContent'),false);assert.equal(f.render().detailOpen,false);
 release();await opening;assert.equal(f.calls.filter(method=>method==='readContent').length,1);assert.equal(f.render().detailOpen,true);
});
test('a failed detail close guard retains the selected content and refuses navigation',async()=>{
 const f=fixture();await ready(f);f.render().load(f.item);f.render().registerDetailCloseGuard(async()=>{throw failure('CONFLICT');});
 const before=f.render().page;await f.render().navigate('templates');assert.equal(f.render().page,before);assert.match(f.render().error,/CONFLICT/);assert.equal(f.render().draft.body,f.item.body);
 f.render().registerDetailCloseGuard(null);await f.render().navigate('templates');assert.equal(f.render().page,'templates');
});
