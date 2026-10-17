// Injected only into external verification copies; this entry is excluded from release packages.
import { app, BrowserWindow, session } from 'electron';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { startDesktop } from './desktop.mts';
import { openLibrary, createLibrary } from '../../../file-library/index.mjs';
import type { Content, DesktopMethod, DesktopResults, DesktopInputs, Reply, Mutation } from '../shared/contracts.ts';
const root = process.env.NOVA_DESKTOP_PROBE_ROOT;
const phase = process.env.NOVA_DESKTOP_PROBE_PHASE;
if (!root || !path.isAbsolute(root)) throw new Error('Run the lifecycle probe launcher.');
const destination = path.join(root, 'library');
const malicious = '<script>globalThis.untrustedExecuted=true</script>';
const messages: string[] = [];
startDesktop({ show: false, userData: path.join(root, 'machine'), dialogs: { backup: async () => null, destination: async () => destination, library: async () => destination }, onConsoleMessage: message => messages.push(message), async ready({ window, controller, worker, release }) {
  window.webContents.setBackgroundThrottling(false);
  const run = <T = unknown,>(script: string): Promise<T> => window.webContents.executeJavaScript(script);
  const bridge = async <K extends DesktopMethod>(method: K, input?: DesktopInputs[K]): Promise<DesktopResults[K]> => {
    const result = await run<Reply<DesktopResults[K]>>(`window.contentHub.${method}(${input === undefined ? '' : JSON.stringify(input)})`);
    assert.equal(result.ok, true, JSON.stringify(result)); return result.value;
  };
  const rejected = async (method: DesktopMethod, input: unknown, code: string) => {
    const result = await run<Reply<unknown>>(`window.contentHub.${method}(${input === undefined ? '' : JSON.stringify(input)})`);
    assert.equal(result.ok, false); if (!result.ok) assert.equal(result.error.code, code);
  };
  const wait = (condition: string) => run(`new Promise((resolve,reject)=>{const end=Date.now()+15000;const check=()=>{if(${condition})return resolve(true);if(Date.now()>end)return reject(new Error('State timeout: '+document.getElementById('error')?.textContent));setTimeout(check,25)};check()})`);
  const idle = () => wait(`document.querySelector('[data-busy="false"]') && !document.getElementById('refresh').disabled`);
  const click = async (id: string) => { await run(`document.getElementById(${JSON.stringify(id)}).click()`); await idle(); };
  const fill = async (id: string, value: string) => { await run(`(()=>{const el=document.getElementById(${JSON.stringify(id)});Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`); };
  await wait(`document.querySelector('[data-loaded="true"]')`); await idle();
  assert.deepEqual(await run('({require:typeof require,process:typeof process})'), { require: 'undefined', process: 'undefined' });
  if (release.AUTH_MODE === 'required') {
    await rejected('createLibrary', undefined, 'AUTH_NOT_CONFIGURED');
    await bridge('openLibrary'); const list = await bridge('listContents'); const item = list[0]!;
    const binding = controller.binding.current!;
    const requests: Mutation[] = [
      { op: 'createContent', input: { title: 'blocked', body: '' }, mutationId: randomUUID() },
      { op: 'updateContent', input: { id: item.id, editToken: item.editToken, title: 'blocked', body: '' }, mutationId: randomUUID() },
      { op: 'trashContent', input: { id: item.id, editToken: item.editToken }, mutationId: randomUUID() },
      { op: 'restoreContent', input: { id: item.id, editToken: item.editToken }, mutationId: randomUUID() },
    ];
    for (const request of requests) {
      await rejected(request.op, request.input, 'AUTH_NOT_CONFIGURED');
      await assert.rejects(worker.call('mutate', { binding, mutation: request }), { code: 'AUTH_NOT_CONFIGURED' });
    }
    await assert.rejects(worker.call('createLibrary', { root: destination, rootIdentity: binding.rootIdentity, mutationId: randomUUID() }), { code: 'AUTH_NOT_CONFIGURED' });
    assert.equal((await bridge('readContent', { id: item.id })).body, 'required readable');
    assert.equal((await bridge('listContents')).length, 1); assert.equal(controller.binding.pending, null);
  } else if (phase === 'crud') {
    await click('create-library'); assert.ok((await bridge('status')).currentName);
    await click('new-content'); await fill('content-title', malicious); await fill('content-body', `native body ${malicious}`); await click('save-content');
    await wait(`document.getElementById('dirty-state').textContent === '已保存'`);
    let list = await bridge('listContents'); assert.equal(list.length, 1); const first = list[0]!;
    await fill('content-body', 'local unsaved draft');
    await click('refresh-contents'); assert.equal(await run("document.getElementById('content-body').value"), 'local unsaved draft');
    await click('new-content'); assert.equal(await run("!!document.getElementById('leave-title')"), true); await click('leave-stay');
    await click('open-library'); assert.equal(await run("!!document.getElementById('leave-title')"), true); await click('leave-stay');
    assert.equal(await run("(()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented;})()"), true);
    const core = openLibrary(destination); core.updateContent(first.id, { body: 'disk external edit' }, first.editToken);
    await click('refresh-contents'); await wait(`document.getElementById('conflict')`);
    assert.equal(await run("document.getElementById('local-body').textContent"), 'local unsaved draft'); assert.equal(await run("document.getElementById('disk-body').textContent"), 'disk external edit');
    await run("document.getElementById('conflict').scrollIntoView({block:'center'})");
    await run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    await fs.writeFile(path.join(root, 'conflict.png'), (await window.webContents.capturePage()).toPNG());
    assert.equal(await run("document.getElementById('save-content').disabled"), true);
    await click('discard-draft'); await fill('content-body', 'local unsaved draft');
    const latest = core.readContent(first.id); core.updateContent(first.id, { body: 'disk external edit after compare' }, latest.editToken);
    await click('save-content'); assert.equal((await bridge('status')).pending?.state, 'conflict'); assert.equal(await run("document.getElementById('content-body').value"), 'local unsaved draft');
    await click('query-pending'); await click('keep-pending'); assert.ok((await bridge('status')).pending);
    await click('save-as-pending'); list = await bridge('listContents'); assert.equal(list.length, 2); const copy = list.find(item => item.id !== first.id)!; assert.equal(copy.body, 'local unsaved draft'); assert.equal(core.readContent(first.id).body, 'disk external edit after compare');
    await fill('content-body', 'saved before recycle');
    await run(`document.querySelector('[data-content-id="${copy.id}"] button:last-child').click()`); await idle();
    assert.equal(await run("!!document.getElementById('leave-title')"), true); await click('leave-save');
    await wait(`!document.getElementById('leave-title') && document.querySelector('[data-busy="false"]')`);
    let recycled = await bridge('readContent', { id: copy.id }); assert.ok(recycled.deletedAt); assert.equal(recycled.body, 'saved before recycle');
    assert.equal((await bridge('status')).pending, null);
    assert.equal((await bridge('listContents')).length, 1); assert.equal((await bridge('listContents', { view: 'trash' })).length, 1);
    recycled = await bridge('restoreContent', { id: recycled.id, editToken: recycled.editToken }); assert.equal((await bridge('listContents')).length, 2);
    const originalRoot = path.join(root, 'original-library');
    const selected = controller.binding.current!;
    await fs.rename(destination, originalRoot); await fs.cp(originalRoot, destination, { recursive: true });
    await assert.rejects(worker.call('list', { binding: selected, view: 'active' }), { code: 'CONFLICT' });
    await fs.rm(destination, { recursive: true }); createLibrary(destination);
    await assert.rejects(worker.call('list', { binding: selected, view: 'active' }), { code: 'CONFLICT' });
    await fs.rm(destination, { recursive: true }); await fs.rename(originalRoot, destination);
    await fs.writeFile(path.join(root, 'identity.json'), JSON.stringify({ binding: controller.binding.current, originalId: first.id }));
    await click('list'); assert.equal(await run('globalThis.untrustedExecuted===true'), false); assert.equal(await run("document.querySelectorAll('#contents script').length"), 0);
    await run(`document.querySelector('[data-content-id="${copy.id}"] button').click()`); await idle();
    await run("document.getElementById('content-title').scrollIntoView({block:'center'})");
    await run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    await fs.writeFile(path.join(root, 'lifecycle.png'), (await window.webContents.capturePage()).toPNG());
  } else if (phase === 'before-exit') {
    const call = worker.call.bind(worker);
    worker.call = async (op, args) => {
      if (op === 'mutate') {
        const saved = JSON.parse(await fs.readFile(path.join(root, 'machine/machine-binding.json'), 'utf8')) as { pending: unknown };
        assert.deepEqual(saved.pending, (args as { mutation: unknown }).mutation);
        await fs.writeFile(path.join(root, 'before.json'), JSON.stringify(saved.pending));
        console.log('PASS actual pre-dispatch exit after durable mutation reservation'); app.exit(17); await new Promise(() => {});
      }
      return call(op, args);
    };
    await bridge('createContent', { title: 'pre-dispatch', body: 'same mutation retry' });
    throw new Error('Expected deliberate process exit');
  } else if (phase === 'after-exit') {
    const saved = JSON.parse(await fs.readFile(path.join(root, 'before.json'), 'utf8')) as { mutationId: string };
    const result = await bridge('queryPendingMutation'); assert.equal(result?.state, 'missing'); assert.equal(result.mutationId, saved.mutationId);
    const created = await bridge('retryPendingMutation'); assert.ok(created); assert.equal(created.body, 'same mutation retry'); assert.equal(openLibrary(destination).queryMutation(saved.mutationId)?.objectId, created.id);
    const call = worker.call.bind(worker);
    worker.call = async (op, args) => {
      const value = await call(op, args);
      if (op === 'mutate') { await fs.writeFile(path.join(root, 'after.json'), JSON.stringify({ pending: controller.binding.pending, content: value })); console.log('PASS actual post-commit exit before controller acknowledges result'); app.exit(18); await new Promise(() => {}); }
      return value;
    };
    await bridge('createContent', { title: 'post-dispatch', body: 'historical receipt' });
    throw new Error('Expected deliberate process exit');
  } else if (phase === 'reopen') {
    const saved = JSON.parse(await fs.readFile(path.join(root, 'after.json'), 'utf8')) as { pending: { mutationId: string }; content: Content };
    const identity = JSON.parse(await fs.readFile(path.join(root, 'identity.json'), 'utf8')) as { binding: unknown };
    assert.deepEqual(controller.binding.current, identity.binding);
    const result = await bridge('queryPendingMutation'); assert.equal(result?.state, 'committed'); assert.equal(result.mutationId, saved.pending.mutationId); assert.equal(result.current?.body, 'later external version'); assert.equal(result.draft?.body, 'historical receipt');
    await rejected('retryPendingMutation', undefined, 'NO_PENDING'); assert.equal((await bridge('listContents')).length, 4);
    await click('list'); assert.equal(await run('globalThis.untrustedExecuted===true'), false);
  }
  await rejected('createContent', { title: 'x', body: '', path: '/tmp/injection' }, 'INVALID_INPUT');
  await rejected('readContent', { id: 'https://evil.test' }, 'INVALID_INPUT');
  const other = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, preload: fileURLToPath(new URL('../preload/index.cjs', import.meta.url)) } });
  await other.loadURL('nova-content://app/index.html');
  const reply = await other.webContents.executeJavaScript('window.contentHub.status()') as Reply<unknown>; assert.equal(reply.ok, false); if (!reply.ok) assert.equal(reply.error.code, 'FORBIDDEN'); other.destroy();
  const table = JSON.parse(await fs.readFile(new URL('../renderer-resources.json', import.meta.url), 'utf8')) as { entries: Record<string, { mime: string }> };
  for (const [url, resource] of Object.entries(table.entries)) { const response = await session.defaultSession.fetch(`nova-content://app${url}`); assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), resource.mime); }
  for (const suffix of ['/index.html?AUTH_MODE=disabled', '/%69ndex.html', '/assets/unregistered.js']) await assert.rejects(session.defaultSession.fetch(`nova-content://app${suffix}`));
  assert.deepEqual(messages.filter(message => /violat|refused to (load|apply|execute)|content security policy/i.test(message)), []);
  console.log(`PASS Electron ${process.versions.electron} auth-${release.AUTH_MODE}/${phase}: real IPC + utility process, lifecycle/identity/recovery, React text and CSP`);
  window.destroy(); app.quit();
} }).catch(error => { console.error(error); app.exit(1); });
