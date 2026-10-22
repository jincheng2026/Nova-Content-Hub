import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {createLibrary} from '../../plugin-src/src/lib/file-library/index.mjs';
import {execute} from '../src/main/worker.mts';
import {DesktopController} from '../src/main/controller.mts';
import {BindingStore} from '../src/main/bindings.mts';
import {LibraryWatcher} from '../src/main/library-watch.mts';

test('revealing a bound library permits Finder metadata and subsequent watched/manual reads', async t => {
    const parent = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'nova-finder-reveal-'));
    const root = path.join(parent, 'library'), library = createLibrary(root);
    const content = library.createContent({title: 'original', body: 'original body'});
    const template = library.createTemplate({name: 'original template', definition: {}, resources: {}});
    library.rebuildTemplateReports(template.id);
    const events = [], metadata = Buffer.alloc(6148);
    metadata.writeUInt32BE(1); metadata.write('Bud1', 4);
    let native;
    t.mock.method(fs, 'watch', (_root, _options, callback) => native = Object.assign(new EventEmitter(), {callback, close() {}}));
    const watcher = new LibraryWatcher({notify: event => events.push(event)});
    t.after(() => {watcher.close(); fs.rmSync(parent, {recursive: true, force: true});});
    const controller = new DesktopController({store: new BindingStore(path.join(parent, 'binding.json')), worker: {call: execute}, documents: parent,
        dialogs: {destination: async () => null, library: async () => root},
        revealFolder: selected => {
            assert.equal(selected, root);
            for (const directory of ['', '内容', '模板', `模板/${template.id}/版本`, '系统（别动）/事务', '系统（别动）/事务/待恢复', '系统（别动）/事务/已提交']) {
                fs.writeFileSync(path.join(root, directory, '.DS_Store'), metadata);
                native.callback('rename', path.join(directory, '.DS_Store'));
            }
        }});
    await controller.initialize(); await controller.openLibrary();
    const binding = structuredClone(controller.binding.current);
    watcher.bind(binding);
    assert.deepEqual(await controller.revealLibraryFolder(), {revealed: true});
    assert.deepEqual(events, ['changed']);
    assert.equal((await controller.readWorkspaceLibrary()).contentDetails[0].body, content.body);
    assert.equal((await controller.inspectLibraryHealth()).state, 'healthy');
    native.callback('change', `内容/${content.id}/正文.md`);
    await new Promise(resolve => setTimeout(resolve, 330));
    assert.deepEqual(events, ['changed', 'changed']);
    assert.equal((await controller.readWorkspaceLibrary()).contentDetails[0].body, content.body);
    assert.deepEqual(controller.binding.current, binding);
    assert.deepEqual(fs.readFileSync(path.join(root, '系统（别动）/事务/.DS_Store')), metadata);
});
