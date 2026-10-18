// Injected into external verification copies only; synthetic candidates do not prove image generation.
import { app, net } from 'electron';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { startDesktop } from './desktop.mts';
import { openLibrary } from '../../../file-library/index.mjs';
import type { DesktopMethod, DesktopInputs, DesktopResults, Reply } from '../shared/contracts.ts';
const root = process.env.NOVA_DESKTOP_PROBE_ROOT;
if (!root || !path.isAbsolute(root)) throw new Error('Run the cover probe launcher.');
const destination = path.join(root, 'library'), exported = path.join(root, 'exported.png');
startDesktop({ show: false, userData: path.join(root, 'machine'), dialogs: { backup: async () => null, destination: async () => destination, library: async () => destination, photo: async () => path.join(root, 'photo.jpg'), export: async () => exported }, async ready({ window, controller, worker, release }) {
  const run = <T = unknown,>(source: string): Promise<T> => window.webContents.executeJavaScript(source);
  const bridge = async <K extends DesktopMethod>(method: K, input?: DesktopInputs[K]): Promise<DesktopResults[K]> => { const result = await run<Reply<DesktopResults[K]>>(`window.contentHub.${method}(${input === undefined ? '' : JSON.stringify(input)})`); assert.equal(result.ok, true, JSON.stringify(result)); if (!result.ok) throw new Error('Rejected'); return result.value; };
  const wait = (condition: string) => run(`new Promise((resolve,reject)=>{const end=Date.now()+45000;const check=()=>{if(${condition})return resolve(true);if(Date.now()>end)return reject(new Error('Cover state timeout: '+document.getElementById('error')?.textContent));setTimeout(check,50)};check()})`);
  const click = async (id: string) => { await run(`document.getElementById(${JSON.stringify(id)}).click()`); await wait(`document.querySelector('[data-busy="false"]')`); };
  const fill = async (id: string, value: string) => { await run(`(()=>{const el=document.getElementById(${JSON.stringify(id)});Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`); };
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
    await click('load-cover-assets'); await wait(`document.querySelectorAll('.samples img').length > 1 && [...document.querySelectorAll('.samples img')].every(img => img.complete && img.naturalWidth > 0)`);
    const assets = await bridge('listCoverAssets'); assert.ok(assets.templates.length > 1); assert.ok(assets.templates.some(t => t.samples.length > 1));
    assert.equal(await run(`document.getElementById('own-photo').checked`), false); assert.equal(await run(`document.getElementById('cover-photo').value`), '');
    const photo = await bridge('choosePhoto', { title: '未声明本人', isOwnPhoto: false }); assert.equal(photo!.isOwnPhoto, false);
    const library = openLibrary(destination), content = library.listContents()[0]!;
    const own = await bridge('choosePhoto', { title: '暂时声明本人', isOwnPhoto: true });
    await click('load-cover-assets');
    await run(`(()=>{const el=document.getElementById('cover-photo');el.value=${JSON.stringify(own!.id)};el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    const currentPhoto = library.readPhoto(own!.id); library.updatePhoto(currentPhoto.id, { isOwnPhoto: false }, currentPhoto.editToken);
    await click('load-cover-assets');
    assert.equal(await run(`document.getElementById('generate-cover').disabled`), true);
    assert.equal(await run(`document.getElementById('cover-photo').value`), own!.id);
    await run(`(()=>{const el=document.getElementById('cover-photo');el.value='';el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    assert.equal(await run(`document.getElementById('assistant') === null`), true);
    await click('open-settings'); assert.equal(await run(`document.getElementById('assistant').value`), 'codex'); await click('close-settings');
    await click('generate-cover');
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
    await click('refresh-cover'); await wait(`document.querySelectorAll('#cover-candidates img').length === 1 && document.querySelector('#cover-candidates img').naturalWidth === 900`);
    await run(`document.querySelector('#cover-candidates button').click()`); await wait(`document.querySelector('[data-busy="false"]')`);
    await run(`document.querySelectorAll('#cover-candidates button')[1].click()`); await wait(`document.querySelector('[data-busy="false"]')`); assert.deepEqual(await fs.readFile(exported), bytes);
    const selected = await bridge('readCover', { contentId: content.id }); assert.equal(selected.selectedCandidateId, selected.candidates[0]!.id);
    const granted = selected.candidates[0]!.url;
    assert.equal(await run(`new Promise(resolve=>{const img=new Image();img.onload=()=>resolve(true);img.onerror=()=>resolve(false);img.src=${JSON.stringify(granted + '?')};})`), false);
    await run("document.getElementById('cover-candidates').scrollIntoView({block:'center'})");
    await window.webContents.capturePage().then(image => fs.writeFile(path.join(root, 'cover.png'), image.toPNG()));
    const authorized = await net.fetch(granted, { cache: 'no-store' }); assert.equal(authorized.status, 200); assert.equal(authorized.headers.get('content-type'), 'image/png');
    controller.covers.revoke(); assert.equal(controller.covers.allows(granted), false);
    const revoked = await net.fetch(granted, { cache: 'no-store' }).then(response => response.status, () => 0); assert.ok([0, 404].includes(revoked));
    console.log(`PASS actual disabled Electron: ${assets.templates.length} seeded template groups, all sample images decoded, false photo declaration, explicit photo:null, fixed cover request, synthetic real candidate raster, selection and byte-identical export; grants revoked`);
  }
  app.quit();
} }).catch(error => { console.error(error); app.exit(1); });
