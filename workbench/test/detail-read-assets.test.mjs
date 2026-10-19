import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {errorInfo} from '../src/shared/contracts.ts';

const source = await fs.readFile(new URL('../src/renderer/app.tsx', import.meta.url), 'utf8');
const actions = source.slice(source.indexOf('function App() {'), source.indexOf('    const task = status?.task;')) + `
    return {readCoverAutomatically, refreshWorkspace, clearEditor, load, draft, error};
}`;
function fixture() {
    const slots = [], calls = [];
    let cursor = 0, version = 1, failAssets = false, releaseCover;
    const item = {id: 'content', title: 'saved', body: 'saved', editToken: 'original'};
    const context = vm.createContext({
        useMemo: calculate => calculate(),
        useState(initial) {const index = cursor++; if (!(index in slots)) slots[index] = initial; return [slots[index], value => {slots[index] = typeof value === 'function' ? value(slots[index]) : value;}];},
        useRef(initial) {const index = cursor++; return slots[index] ??= {current: initial};},
        useEffect() {}, useLayoutEffect() {}, errorInfo, document: {hidden: false}, hasManagedDrafts: () => false,
        async invoke(method) {
            calls.push(method);
            if (method === 'status') return {currentName: 'library', busy: false, pending: null};
            if (method === 'listCoverAssets') {if (failAssets) throw Object.assign(new Error('Assets failed'), {code: 'CORRUPT'}); return {templates: [{id: `template-${version}`}], photos: [{id: `photo-${version}`}]};}
            if (method === 'readCover') {if (releaseCover) await releaseCover; return {content: item};}
            return {};
        }
    });
    vm.runInContext(stripTypeScriptTypes(actions), context);
    const render = () => {cursor = 0; return context.App();};
    return {calls, render, item, version(next) {version = next;}, fail() {failAssets = true;}, pause(promise) {releaseCover = promise;}};
}
test('detail reads reuse the successful workspace assets without a duplicate asset scan', async () => {
    const f = fixture(); f.render().load(f.item); await f.render().refreshWorkspace();
    const result = await f.render().readCoverAutomatically(f.item.id);
    assert.equal(result.cover.content.id, f.item.id);
    assert.equal(f.calls.filter(method => method === 'listCoverAssets').length, 1);
    assert.equal(result.assets.photos[0].id, 'photo-1');
});
test('explicit workspace refresh and library switch replace the shared assets', async () => {
    const f = fixture(); f.render().load(f.item); await f.render().refreshWorkspace();
    f.version(2); await f.render().refreshWorkspace();
    assert.equal((await f.render().readCoverAutomatically(f.item.id)).assets.templates[0].id, 'template-2');
    f.render().clearEditor(); f.version(3); f.render().load(f.item); await f.render().refreshWorkspace();
    assert.equal((await f.render().readCoverAutomatically(f.item.id)).assets.photos[0].id, 'photo-3');
    assert.equal(f.calls.filter(method => method === 'listCoverAssets').length, 3);
});
test('a failed workspace asset refresh cannot publish a retained stale snapshot', async () => {
    const f = fixture(); f.render().load(f.item); await f.render().refreshWorkspace(); f.fail();
    await assert.rejects(f.render().refreshWorkspace(), /Assets failed/);
    assert.equal(await f.render().readCoverAutomatically(f.item.id), undefined);
    assert.match(f.render().error, /CORRUPT/);
});
test('late cover results are discarded after changing content or switching library', async () => {
    for (const switchLibrary of [false, true]) {
        const f = fixture(); f.render().load(f.item); await f.render().refreshWorkspace();
        let release; f.pause(new Promise(resolve => {release = resolve;}));
        const result = f.render().readCoverAutomatically(f.item.id);
        await new Promise(resolve => setImmediate(resolve));
        if (switchLibrary) f.render().clearEditor();
        f.render().load({...f.item, id: switchLibrary ? f.item.id : 'other'}); f.render(); release();
        assert.equal(await result, undefined);
        assert.equal(f.render().draft.body, 'saved');
    }
});
