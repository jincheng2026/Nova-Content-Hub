// Test entry copied into a temporary stage; all wrappers delegate to the real desktop boundaries.
import {app, ipcMain, net} from 'electron';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {startDesktop} from './desktop.mjs';

const root = process.env.NOVA_FOREGROUND_PRIORITY_ROOT;
assert.ok(root && path.isAbsolute(root));
const events = [], foregroundRequests = [];
const handle = ipcMain.handle;
ipcMain.handle = function(channel, listener) {
  return Reflect.apply(handle, this, [channel, (...args) => {
    if (['nova:updateContent', 'nova:readContent'].includes(channel)) foregroundRequests.push(channel);
    return listener(...args);
  }]);
};
const wait = async condition => {
  const deadline = Date.now() + 15000;
  while (!condition()) {
    assert.ok(Date.now() < deadline, 'Timed out waiting for queued requests');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
};
startDesktop({show: false, userData: path.join(root, 'machine'), dialogs: {library: async () => path.join(root, 'library'), backup: async () => null, destination: async () => null}, async ready({window, worker, controller}) {
  const run = source => window.webContents.executeJavaScript(source);
  const bridge = async (method, input) => {
    const result = await run(`window.contentHub.${method}(${input === undefined ? '' : JSON.stringify(input)})`);
    assert.equal(result.ok, true, JSON.stringify(result));
    return result.value;
  };
  try {
    await run(`new Promise((resolve,reject)=>{const deadline=Date.now()+15000;function poll(){if(document.querySelector('main[data-loaded="true"][data-busy="false"]'))return resolve();if(Date.now()>deadline)return reject(new Error('Renderer not ready'));setTimeout(poll,20)}poll()})`);
    await bridge('openLibrary');
    const content = await bridge('createContent', {title: 'Foreground priority fixture', body: 'before'});
    const photos = (await bridge('listCoverAssets')).photos;
    assert.equal(photos.length, 4);
    const expected = JSON.parse(await fs.readFile(path.join(root, 'assets.json'), 'utf8'));
    const urls = photos.map(photo => photo.url);
    const admitted = new Map();
    const allows = controller.covers.allows;
    controller.covers.allows = function(url) {
      const allowed = Reflect.apply(allows, this, [url]);
      if (allowed && urls.includes(url)) admitted.set(url, (admitted.get(url) ?? 0) + 1);
      return allowed;
    };
    let release, active = 0, rasterCalls = 0;
    const gate = new Promise(resolve => { release = resolve; });
    for (const [label, client] of [['main', worker], ['resource', controller.covers.reader]]) {
      const call = client.call;
      client.call = async function(op, ...args) {
        assert.equal(++active, 1, 'main and resource workers must not overlap library ownership');
        const name = op === 'raster' ? `image-${++rasterCalls}` : op;
        events.push(`start:${name}`);
        try {
          if (label === 'resource' && rasterCalls === 1) await gate;
          return await Reflect.apply(call, this, [op, ...args]);
        } finally { events.push(`end:${name}`); active--; }
      };
    }
    const request = async photo => {
      const response = await net.fetch(photo.url, {cache: 'no-store'});
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), 'image/png');
      assert.equal(createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex'), expected[photo.assetHash]);
    };
    const first = request(photos[0]);
    await wait(() => rasterCalls === 1);
    const queued = photos.slice(1).map(request);
    // Each URL passes both webRequest and the protocol handler before its queue wait.
    await wait(() => urls.every(url => admitted.get(url) >= 2));
    const input = {id: content.id, editToken: content.editToken, title: content.title, body: 'saved before pending images'};
    await run(`(()=>{window.priorityForeground=Promise.all([window.contentHub.updateContent(${JSON.stringify(input)}),window.contentHub.readContent(${JSON.stringify({id: content.id})})]);return true})()`);
    await wait(() => foregroundRequests.length === 2);
    assert.equal(rasterCalls, 1, 'the first image holds the queue while three images and two IPC calls wait');
    release();
    const [saved, read] = await run('window.priorityForeground');
    assert.equal(saved.ok, true, JSON.stringify(saved));
    assert.equal(read.ok, true, JSON.stringify(read));
    assert.equal(read.value.body, input.body);
    assert.equal(read.value.editToken, saved.value.editToken);
    await Promise.all([first, ...queued]);
    assert.equal(rasterCalls, 4);
    const firstEnd = events.indexOf('end:image-1'), secondStart = events.indexOf('start:image-2');
    assert.ok(events.indexOf('start:mutate') > firstEnd);
    assert.ok(events.indexOf('end:mutate') < events.indexOf('start:readContent'));
    assert.ok(events.indexOf('end:readContent') < secondStart, JSON.stringify(events));
    assert.equal((await bridge('readContent', {id: content.id})).body, input.body);
    assert.equal(worker.pending, null);
    assert.equal(controller.covers.reader.pending, null);
    assert.equal(controller.binding.pending, null);
    assert.equal(controller.busy, false);
    const receipt = {passed: true, scope: 'isolated fresh-source Electron main with staged renderer; gated first raster and three real queued image reads; foreground save/read through sandbox bridge', events, images: 4, foregroundIPC: foregroundRequests, pending: false, electron: process.versions.electron};
    await fs.writeFile(path.join(root, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
    console.log(JSON.stringify(receipt));
    app.exit(0);
  } catch (error) {
    console.error(error);
    await fs.writeFile(path.join(root, 'receipt.json'), JSON.stringify({passed: false, error: String(error), events}, null, 2) + '\n');
    app.exit(1);
  }
}}).catch(error => {console.error(error); app.exit(1);});
