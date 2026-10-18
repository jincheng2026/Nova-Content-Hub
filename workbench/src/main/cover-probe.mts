// Injected into external verification copies only; synthetic candidates do not prove image generation.
import { app, net, clipboard, ClipboardItem } from 'electron';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { startDesktop } from './desktop.mts';
import { createLibrary, openLibrary } from '../../../plugin-src/src/lib/file-library/index.mjs';
import type { DesktopMethod, DesktopInputs, DesktopResults, Reply } from '../shared/contracts.ts';
const root = process.env.NOVA_DESKTOP_PROBE_ROOT;
if (!root || !path.isAbsolute(root)) throw new Error('Run the cover probe launcher.');
const destination = path.join(root, 'library'), exported = path.join(root, 'exported.png');
let chosenLibrary = destination;
startDesktop({ show: false, userData: path.join(root, 'machine'), dialogs: { backup: async () => null, destination: async () => destination, library: async () => chosenLibrary, photo: async () => path.join(root, 'photo.jpg'), export: async () => exported }, async ready({ window, controller, worker, release }) {
  const run = async <T = unknown,>(source: string): Promise<T> => { const result = await window.webContents.executeJavaScript(`(async()=>{try{return await (${source})}catch(error){return {probeFailure:String(error)}}})()`); if (result && typeof result === 'object' && 'probeFailure' in result) throw new Error(`${result.probeFailure} at ${source.slice(0, 500)}`); return result; };
  const bridge = async <K extends DesktopMethod>(method: K, input?: DesktopInputs[K]): Promise<DesktopResults[K]> => { const result = await run<Reply<DesktopResults[K]>>(`window.contentHub.${method}(${input === undefined ? '' : JSON.stringify(input)})`); assert.equal(result.ok, true, JSON.stringify(result)); if (!result.ok) throw new Error('Rejected'); return result.value; };
  const wait = (condition: string) => run(`new Promise((resolve,reject)=>{const end=Date.now()+45000;const check=()=>{if(${condition})return resolve(true);if(Date.now()>end)return reject(new Error('Cover state timeout: '+document.getElementById('error')?.textContent));setTimeout(check,50)};check()})`);
  const click = async (id: string) => { await wait(`document.querySelector('[data-busy="false"]') && document.getElementById(${JSON.stringify(id)}) && !document.getElementById(${JSON.stringify(id)}).disabled`); await run(`document.getElementById(${JSON.stringify(id)}).click()`); await wait(`document.querySelector('[data-busy="false"]')`); };
  const fill = async (id: string, value: string) => { await wait(`document.getElementById(${JSON.stringify(id)}) && !document.getElementById(${JSON.stringify(id)}).disabled`); await run(`(()=>{const el=document.getElementById(${JSON.stringify(id)});Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`); };
  await wait(`document.querySelector('[data-loaded="true"]')`);
  if (release.AUTH_MODE === 'required') {
    await bridge('openLibrary'); const binding = controller.current(); const before = await fs.readdir(path.join(destination, '模板'));
    for (const [method, input] of [['retryBuiltins', undefined], ['choosePhoto', { title: 'me', isOwnPhoto: true }], ['generateCover', { contentId: randomUUID(), editToken: '0'.repeat(64), input: { template: { id: 'builtin-geometry', version: 4 }, styleAssetHashes: ['0'.repeat(64)], photo: null, materialIds: [], prompt: 'test', pixels: { width: 8, height: 6 }, ratio: '4:3', count: 1, outputFormat: 'png', scope: 'cover-only' } }], ['continueCover', { contentId: randomUUID(), requestId: randomUUID(), attemptId: randomUUID() }]] as const) {
      const result = await run<Reply<unknown>>(`window.contentHub.${method}(${input === undefined ? '' : JSON.stringify(input)})`); assert.equal(result.ok, false); if (!result.ok) assert.equal(result.error.code, 'AUTH_NOT_CONFIGURED');
    }
    await assert.rejects(worker.call('seed', { binding }), { code: 'AUTH_NOT_CONFIGURED' });

    assert.deepEqual(await fs.readdir(path.join(destination, '模板')), before); assert.equal(before.length, 0);
    console.log('PASS actual required Electron: no startup seed, main refuses cover/photo/launch, worker seed gate');
  } else {
    await click('create-library'); await click('new-content'); await fill('content-title', '原生封面合成验收'); await fill('content-body', '合成图片仅验证候选回库与导出，不代表宿主生图。'); await click('save-content');
    await fill('content-body', '脏草稿刷新封面后仍可保存'); await click('refresh-cover');
    assert.equal(await run(`document.getElementById('content-body').value`), '脏草稿刷新封面后仍可保存');
    assert.equal(await run(`document.getElementById('conflict') === null && !document.getElementById('save-content').disabled`), true); await click('save-content');
    assert.equal(await run(`document.querySelector('.library-manager').hidden`), true);
    await click('load-cover-assets'); await wait(`document.querySelectorAll('.samples img').length > 1 && [...document.querySelectorAll('.samples img')].every(img => img.complete && img.naturalWidth > 0)`);
    const assets = await bridge('listCoverAssets'); assert.ok(assets.templates.length > 1); assert.ok(assets.templates.some(t => t.samples.length > 1));
    assert.equal(await run(`document.getElementById('own-photo').checked`), false); assert.equal(await run(`document.getElementById('cover-photo').value`), '');
    const photo = await bridge('choosePhoto', { title: '未声明本人', isOwnPhoto: false }); assert.equal(photo!.isOwnPhoto, false);
    const library = openLibrary(destination), content = library.listContents()[0]!;
    const own = await bridge('choosePhoto', { title: '暂时声明本人', isOwnPhoto: true });
    await click('load-cover-assets');
    await run(`(()=>{const el=document.getElementById('cover-photo');el.value=${JSON.stringify(own!.id)};el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await wait(`document.querySelector('.photo-preview')?.complete && document.querySelector('.photo-preview').naturalWidth > 0 && document.getElementById('cover-photo').value === ${JSON.stringify(own!.id)}`);
    await controller.covers.reading;
    const currentPhoto = library.readPhoto(own!.id); library.updatePhoto(currentPhoto.id, { isOwnPhoto: false }, currentPhoto.editToken);
    await click('load-cover-assets');
    await wait(`[...document.querySelectorAll('[role="alert"]')].some(el => el.textContent.includes('所选照片已失效'))`);
    assert.equal(await run(`document.getElementById('generate-cover').disabled`), true);
    assert.equal(await run(`document.getElementById('cover-photo').value`), own!.id);
    await run(`(()=>{const el=document.getElementById('cover-photo');el.value='';el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await wait(`!document.querySelector('.photo-preview') && document.getElementById('cover-photo').value === ''`);
    assert.equal(await run(`document.getElementById('assistant') === null`), true);
    await click('open-settings'); assert.equal(await run(`document.getElementById('assistant').value`), 'codex'); await click('close-settings');
    await click('generate-cover');
    await wait(`document.querySelector('.request-summary')?.textContent.includes('不放人物')`);
    assert.equal(await run(`document.querySelector('.request-summary').textContent.includes('生成 1 张')`), true);
    assert.equal(await run(`document.querySelector('.request-summary').textContent.includes('inbox')`), false);
    let view = await bridge('readCover', { contentId: content.id });
    await bridge('retryCover', { contentId: content.id, requestId: view.jobs[0]!.id, attemptId: view.jobs[0]!.activeAttemptId! });
    await click('refresh-cover');
    assert.equal(await run(`document.querySelectorAll('#continue-cover').length`), 1);
    assert.equal(await run(`[...document.querySelectorAll('#cover-jobs button')].filter(el=>el.textContent==='明确重新生成').length`), 1);
    view = await bridge('readCover', { contentId: content.id }); const job = view.jobs[0]!, attemptId = job.activeAttemptId!;
    const context = library.readCoverContext(content.id, job.id, attemptId);
    assert.equal(context.request.photo, null);
    library.claimCoverAttempt(content.id, job.id, attemptId, { host: 'codex', readAssetHashes: [...new Set(context.inputs.map(i => i.assetHash))] });
    const bytes = await sharp({ create: { width: 900, height: 1200, channels: 3, background: '#1c4f93' } }).png().toBuffer();
    await fs.writeFile(path.join(context.inbox, 'synthetic.png'), bytes);
    await library.commitCoverAttempt(content.id, job.id, attemptId, { libraryId: controller.current().libraryId, contentId: content.id, requestId: job.id, attemptId, requestHash: job.requestHash, resultId: randomUUID(), files: [{ name: 'synthetic.png', sha256: createHash('sha256').update(bytes).digest('hex') }] });
    await run(`window.dispatchEvent(new Event('focus'))`);
    await wait(`document.querySelectorAll('#cover-candidates img').length === 1 && document.querySelector('#cover-candidates img').naturalWidth === 900`);
    await wait(`document.querySelector('[data-busy="false"]') && !document.querySelector('#cover-candidates button').disabled`);
    await run(`document.querySelector('#cover-candidates button').click()`); await wait(`document.querySelector('#cover-candidates')?.textContent.includes('当前选用封面') && document.querySelector('[data-busy="false"]')`);
    await run(`document.querySelectorAll('#cover-candidates button')[1].click()`); await wait(`document.querySelector('[data-busy="false"]')`); assert.deepEqual(await fs.readFile(exported), bytes);
    const selected = await bridge('readCover', { contentId: content.id }); assert.equal(selected.selectedCandidateId, selected.candidates[0]!.id);
    // A pending native read owns the UI action slot; switches cannot apply its result to another selection.
    const otherContent = await bridge('createContent', { title: '切换安全验收', body: '另一篇正文' });
    await click('refresh-contents');
    const originalCall = worker.call.bind(worker);
    let unblock!: () => void, entered!: () => void;
    const held = new Promise<void>(resolve => { unblock = resolve; }), started = new Promise<void>(resolve => { entered = resolve; });
    let holdRead = true;
    worker.call = async (op, args) => { if (op === 'readCover' && holdRead) { holdRead = false; entered(); await held; } return originalCall(op, args); };
    await run(`document.getElementById('refresh-cover').click()`); await started;
    await wait(`document.querySelector('[data-busy="true"]')`);
    await run(`document.querySelector('[data-content-id="${otherContent.id}"] summary').click()`);
    assert.equal(await run(`document.getElementById('content-title').value`), content.title);
    assert.equal(await run(`document.getElementById('open-library').disabled`), true);
    unblock(); await wait(`document.querySelector('[data-busy="false"]')`); worker.call = originalCall;
    await run(`document.querySelector('[data-content-id="${otherContent.id}"] summary').click()`);
    await wait(`document.getElementById('content-title')?.value === ${JSON.stringify(otherContent.title)} && document.querySelector('[data-busy="false"]') && document.querySelectorAll('#cover-candidates img').length === 0`);
    await run(`document.querySelector('[data-content-id="${content.id}"] summary').click()`);
    await wait(`document.getElementById('content-title')?.value === ${JSON.stringify(content.title)} && document.querySelectorAll('#cover-candidates img').length === 1 && document.querySelector('[data-busy="false"]')`);
    assert.equal(await run(`document.getElementById('content-body').value`), '脏草稿刷新封面后仍可保存');
    console.log('PASS actual Electron selection safety: held read blocks content/library switch; subsequent explicit selection loads only its own candidates and body');
    const granted = selected.candidates[0]!.url;
    assert.equal(await run(`new Promise(resolve=>{const img=new Image();img.onload=()=>resolve(true);img.onerror=()=>resolve(false);img.src=${JSON.stringify(granted + '?')};})`), false);
    await run("document.getElementById('cover-candidates').scrollIntoView({block:'center'})");
    await window.webContents.capturePage().then(image => fs.writeFile(path.join(root, 'cover.png'), image.toPNG()));
    const authorized = await net.fetch(granted, { cache: 'no-store' }); assert.equal(authorized.status, 200); assert.equal(authorized.headers.get('content-type'), 'image/png');
    const imageReads = Promise.all([...assets.templates.flatMap(t => t.samples), { url: granted, assetHash: selected.candidates[0]!.assetHash }].map(async image => {
      const response = await net.fetch(image.url!, { cache: 'no-store' }); assert.equal(response.status, 200);
      assert.equal(createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex'), image.assetHash);
    }));
    const concurrentEdit = (async () => {
      const created = await bridge('createContent', { title: '图片读取同时创建', body: '原始正文' });
      const saved = await bridge('updateContent', { id: created.id, editToken: created.editToken, title: created.title, body: '图片读取同时保存成功' });
      assert.equal(saved.body, '图片读取同时保存成功');
      assert.equal((await bridge('readContent', { id: saved.id })).editToken, saved.editToken);
      assert.equal((await bridge('status')).currentName !== null, true);
    })();
    await Promise.all([imageReads, concurrentEdit]);
    console.log('PASS concurrent actual Electron: all granted template/candidate reads and IPC content create/save/read/status completed without lock conflicts');
    for (const page of ['overview', 'templates', 'calendar', 'prompts']) {
      await click(`nav-${page}`); await wait(`document.querySelector('.workspace-page') && document.querySelector('[data-busy="false"]')`);
      assert.equal(await run(`document.querySelector('#nav-${page}').getAttribute('aria-current')`), 'page');
      if (page === 'overview') assert.ok((await run<number>(`document.querySelectorAll('.stat-value').length`)) >= 4);
      if (page === 'templates') await wait(`document.querySelectorAll('.gallery-preview img').length > 1 && [...document.querySelectorAll('.gallery-preview img')].every(img=>img.complete&&img.naturalWidth>0)`);
      if (page === 'calendar') assert.equal(await run(`document.querySelectorAll('.calendar-cell').length`), 42);
      if (page === 'prompts') {
        await wait(`document.querySelectorAll('.prompt-card').length > 0`);
        await run(`document.querySelector('.prompt-card').click()`); await wait(`document.querySelector('.prompt-dialog')?.open`);
        const fields = await run<number>(`document.querySelectorAll('.prompt-fields textarea').length`);
        for (let index = 0; index < fields; index++) await fill(`prompt-field-${index}`, `真实窗口填写验收 ${index + 1}`);
        if (fields) await wait(`document.querySelector('.prompt-preview').value.includes('真实窗口填写验收') && !document.querySelector('.prompt-preview').value.includes('【待填写：')`);
        const clipboardBefore = await Promise.all((await clipboard.read()).map(async item => new ClipboardItem(Object.fromEntries(await Promise.all(item.types.map(async type => [type, await item.getType(type)]))))));
        try {
          const expectedText = await run<string>(`document.querySelector('.prompt-preview').value`);
          await run(`document.querySelector('.prompt-dialog .dialog-footer button').click()`);
          await wait(`document.querySelector('.prompt-dialog [role="status"]').textContent.includes('已复制完整提示词')`);
          assert.equal(await clipboard.readText(), expectedText);
        } finally { if (clipboardBefore.length) await clipboard.write(clipboardBefore); else clipboard.clear(); }
      }
      await run(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
      await window.webContents.capturePage().then(image => fs.writeFile(path.join(root, `${page}.png`), image.toPNG()));
      if (page === 'prompts') { await run(`document.querySelector('[aria-label="关闭提示词"]').click()`); await wait(`!document.querySelector('.prompt-dialog')`); }
    }
    await click('nav-content');
    console.log('PASS actual five-page shell: real overview counts, multi-image templates decoded, calendar month grid, prompt live variable preview and content return');
    chosenLibrary = path.join(root, 'other-library'); createLibrary(chosenLibrary);
    await click('library-menu'); await click('open-library');
    await wait(`document.querySelector('[data-busy="false"]') && !document.getElementById('content-title') && document.querySelectorAll('#cover-candidates img').length === 0`);
    assert.equal(await run(`document.querySelectorAll('[data-content-id]').length`), 0);
    assert.equal(controller.covers.allows(granted), false);
    const revoked = await net.fetch(granted, { cache: 'no-store' }).then(response => response.status, () => 0); assert.ok([0, 404].includes(revoked));
    console.log(`PASS actual disabled Electron: ${assets.templates.length} seeded template groups, all sample images decoded, false photo declaration, explicit photo:null, fixed cover request, synthetic real candidate raster, selection and byte-identical export; grants revoked`);
  }
  app.quit();
} }).catch(error => { console.error(error); app.exit(1); });
