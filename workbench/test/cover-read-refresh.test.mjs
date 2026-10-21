import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {errorInfo} from '../src/shared/contracts.ts';

const source = await fs.readFile(new URL('../src/renderer/app.tsx', import.meta.url), 'utf8');
const actions = source.slice(source.indexOf('function App() {'), source.indexOf('    const currentCollection = library?.collections.find')) + `
    return {nativeAction, readCoverAutomatically, refreshStatus, load, draft, disk, error,
        refresh: () => {changesPending.current = true; automaticRefresh.current();}};
}`;

function fixture() {
    const slots = [], calls = [];
    let cursor = 0, failed = false;
    const item = {id: 'content', title: 'saved', body: 'saved', editToken: 'original'};
    const context = vm.createContext({
        useMemo: calculate => calculate(),
        useState(initial) {const index = cursor++; if (!(index in slots)) slots[index] = initial; return [slots[index], value => {slots[index] = typeof value === 'function' ? value(slots[index]) : value;}];},
        useRef(initial) {const index = cursor++; return slots[index] ??= {current: initial};},
        useEffect() {}, useLayoutEffect() {}, errorInfo, document: {hidden: false}, hasManagedDrafts: () => false,
        async invoke(method) {
            calls.push(method);
            if (method === 'status') return {currentName: 'library', busy: false, pending: null};
            if (method === 'readCover' && failed) throw Object.assign(new Error('Cover failed'), {code: 'CORRUPT'});
            if (method === 'readContent') return item;
            if (method === 'listContents') return [item];
            return method === 'readCover' ? {content: item} : {};
        }
    });
    vm.runInContext(stripTypeScriptTypes(actions), context);
    const render = () => {cursor = 0; return context.App();};
    return {calls, render, item, fail() {failed = true;}};
}

test('automatic cover reads keep status and cover fresh without repeating every workspace scan', async () => {
    const f = fixture();
    f.render().load(f.item);
    const result = await f.render().readCoverAutomatically(f.item.id);
    assert.equal(result.cover.content.editToken, 'original');
    assert.deepEqual(f.calls, ['listCoverAssets', 'readCover', 'status']);
    assert.equal(f.render().draft.body, 'saved');
});

test('automatic cover failures still report the error and refresh status', async () => {
    const f = fixture();
    f.render().load(f.item);
    f.fail();
    assert.equal(await f.render().readCoverAutomatically(f.item.id), undefined);
    assert.match(f.render().error, /CORRUPT/);
    assert.equal(f.calls.at(-1), 'status');
    assert.equal(f.render().draft.body, 'saved');
});

test('foreground operations and external-change refresh still scan the full workspace', async () => {
    const f = fixture();
    await f.render().refreshStatus();
    await f.render().nativeAction(async () => {});
    await new Promise(resolve => setImmediate(resolve));
    for (const method of ['status', 'readWorkspace', 'listCoverAssets', 'readWorkspaceLibrary']) assert.ok(f.calls.includes(method));
    f.calls.length = 0;
    f.render().refresh();
    await new Promise(resolve => setImmediate(resolve));
    for (const method of ['listContents', 'status', 'readWorkspace', 'listCoverAssets', 'readWorkspaceLibrary']) assert.ok(f.calls.includes(method));
});
