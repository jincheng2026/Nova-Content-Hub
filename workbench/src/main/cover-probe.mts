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
const consoleMessages: string[] = [];
let stage = 'startup', lastSource = '';
let captureFailure: ((error: unknown) => Promise<void>) | undefined;
const mark = (name: string) => { stage = name; console.log(`${new Date().toISOString()} cover probe: ${name}`); };
startDesktop({ onConsoleMessage: message => { consoleMessages.push(message); if (consoleMessages.length > 30) consoleMessages.shift(); }, show: false, userData: path.join(root, 'machine'), dialogs: { destination: async () => destination, library: async () => chosenLibrary, photo: async () => path.join(root, 'photo.jpg'), export: async () => exported }, async ready({ window, controller, worker, release }) {
  captureFailure = async error => {
    const diagnostic = { recordedAt: new Date().toISOString(), stage, source: lastSource, error: String(error), stack: error instanceof Error ? error.stack : null, consoleMessages };
    await fs.writeFile(path.join(root, 'failure.json'), JSON.stringify(diagnostic, null, 2) + '\n');
    const bounded = <T,>(operation: Promise<T>) => Promise.race([operation, new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error('Failure capture timed out')), 5000))]);
    const results = await Promise.allSettled([
      bounded(window.webContents.capturePage()).then(image => fs.writeFile(path.join(root, 'failure.png'), image.toPNG())),
      bounded(window.webContents.executeJavaScript(`({url:location.href,main:document.querySelector('main')?.dataset,dialogs:[...document.querySelectorAll('dialog')].map(el=>({className:el.className,open:el.open})),alerts:[...document.querySelectorAll('[role="alert"]')].map(el=>el.textContent),body:document.body.innerText})`)).then(ui => fs.writeFile(path.join(root, 'failure.json'), JSON.stringify({ ...diagnostic, ui }, null, 2) + '\n'))
    ]);
    for (const result of results) if (result.status === 'rejected') console.error('Failure diagnostic capture:', result.reason);
  };
  const run = async <T = unknown,>(source: string): Promise<T> => {
    lastSource = source;
    let result;
    try { result = await window.webContents.executeJavaScript(`(async()=>{try{return await (${source})}catch(error){return {probeFailure:String(error)}}})()`); }
    catch (error) { throw new Error(`Renderer evaluation failed during ${stage}: ${String(error)}\nSource: ${source.slice(0, 3000)}\nRecent console: ${consoleMessages.join('\n')}`, { cause: error }); }
    if (result && typeof result === 'object' && 'probeFailure' in result) throw new Error(`${result.probeFailure} during ${stage} at ${source.slice(0, 3000)}`);
    return result;
  };
  const bridge = async <K extends DesktopMethod>(method: K, input?: DesktopInputs[K]): Promise<DesktopResults[K]> => { const result = await run<Reply<DesktopResults[K]>>(`window.contentHub.${method}(${input === undefined ? '' : JSON.stringify(input)})`); assert.equal(result.ok, true, JSON.stringify(result)); if (!result.ok) throw new Error('Rejected'); return result.value; };
  const wait = (condition: string) => run(`new Promise((resolve,reject)=>{const end=Date.now()+45000;const check=()=>{if(${condition})return resolve(true);if(Date.now()>end)return reject(new Error('Cover state timeout: '+${JSON.stringify(condition)}+' / '+document.getElementById('error')?.textContent));setTimeout(check,50)};check()})`);
  const idle = `document.querySelector('main[data-app="ready"][data-loaded="true"][data-busy="false"]')`;
  const clickElement = async (element: string) => {
    await run(`new Promise((resolve,reject)=>{const end=Date.now()+45000;const check=()=>{const el=(${element});if(${idle} && el && !el.disabled){el.click();return resolve(true);}if(Date.now()>end)return reject(new Error('Clickable control timeout: '+${JSON.stringify(element)}));setTimeout(check,50)};check()})`);
    await wait(idle);
  };
  const click = (id: string) => clickElement(`document.getElementById(${JSON.stringify(id)})`);
  const button = (selector: string, text: string) => clickElement(`[...document.querySelectorAll(${JSON.stringify(selector)})].find(el => el.textContent.trim() === ${JSON.stringify(text)})`);
  const tab = (text: string) => button('.content-detail-tabs button', text);
  const fill = async (id: string, value: string) => { await wait(`document.getElementById(${JSON.stringify(id)}) && !document.getElementById(${JSON.stringify(id)}).disabled`); await run(`(()=>{const el=document.getElementById(${JSON.stringify(id)});Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`); };
  mark('renderer and sandbox');
  await wait(idle);
  const preferences = (window.webContents as typeof window.webContents & { getLastWebPreferences(): { sandbox: boolean; contextIsolation: boolean; nodeIntegration: boolean } }).getLastWebPreferences();
  assert.equal(preferences.sandbox, true); assert.equal(preferences.contextIsolation, true); assert.equal(preferences.nodeIntegration, false);
  assert.deepEqual(await run(`({require: typeof require, process: typeof process})`), {require: 'undefined', process: 'undefined'});
  if (release.AUTH_MODE === 'required') {
    mark('required authentication gate');
    await bridge('openLibrary'); const binding = controller.current(); const before = await fs.readdir(path.join(destination, '模板'));
    for (const [method, input] of [['retryBuiltins', undefined], ['choosePhoto', { title: 'me', isOwnPhoto: true }], ['generateCover', { contentId: randomUUID(), editToken: '0'.repeat(64), input: { template: { id: 'builtin-geometry', version: 4 }, styleAssetHashes: ['0'.repeat(64)], photo: null, materialIds: [], prompt: 'test', pixels: { width: 8, height: 6 }, ratio: '4:3', count: 1, outputFormat: 'png', scope: 'cover-only' } }], ['continueCover', { contentId: randomUUID(), requestId: randomUUID(), attemptId: randomUUID() }]] as const) {
      const result = await run<Reply<unknown>>(`window.contentHub.${method}(${input === undefined ? '' : JSON.stringify(input)})`); assert.equal(result.ok, false); if (!result.ok) assert.equal(result.error.code, 'AUTH_NOT_CONFIGURED');
    }
    await assert.rejects(worker.call('seed', { binding }), { code: 'AUTH_NOT_CONFIGURED' });

    assert.deepEqual(await fs.readdir(path.join(destination, '模板')), before); assert.equal(before.length, 0);
    console.log('PASS actual required Electron: no startup seed, main refuses cover/photo/launch, worker seed gate');
  } else {
    // This external test copy records handoffs; it never launches a real assistant.
    const launches: Parameters<NonNullable<typeof controller.covers.launch>>[1][] = [];
    controller.covers.setup = async host => ({ host, ready: true, skill: 'nova-content-cover-execution', reason: 'available' });
    controller.covers.launch = async (_binding, reference) => { launches.push(reference); };
    mark('create library and content');
    await click('welcome-create-library'); await click('nav-content'); await click('new-content'); await fill('content-title', '原生封面合成验收'); await fill('content-body', '合成图片仅验证候选回库与导出，不代表宿主生图。'); await click('save-content');
    await fill('content-body', '脏草稿刷新封面后仍可保存'); await click('refresh-workspace');
    assert.equal(await run(`document.getElementById('content-body').value`), '脏草稿刷新封面后仍可保存');
    assert.equal(await run(`document.getElementById('conflict') === null && !document.getElementById('save-content').disabled`), true); await click('save-content');
    assert.equal(await run(`document.querySelector('.library-manager-dialog') === null`), true);
    assert.equal(await run(`document.getElementById('assistant') === null`), true);
    await click('open-settings'); assert.equal(await run(`document.getElementById('assistant').value`), 'codex'); await click('close-settings');
    mark('composer assets and photo invalidation');
    await tab('封面'); await button('.cover-toolbar button', '制作封面'); await wait(`document.querySelector('.cover-create-dialog[open]')`);
    await clickElement(`document.querySelector('.cover-style-details summary')`);
    await wait(`document.querySelectorAll('.cover-sample-grid img').length > 1 && [...document.querySelectorAll('.cover-sample-grid img')].every(img => img.complete && img.naturalWidth > 0)`);
    const assets = await bridge('listCoverAssets'); assert.ok(assets.templates.length > 1); assert.ok(assets.templates.some(t => t.samples.length > 1));
    assert.equal(await run(`document.getElementById('own-photo').checked`), false); assert.equal(await run(`document.getElementById('cover-photo').value`), '');
    const photo = await bridge('choosePhoto', { title: '未声明本人', isOwnPhoto: false }); assert.equal(photo!.isOwnPhoto, false);
    const library = openLibrary(destination), content = library.listContents()[0]!;
    const own = await bridge('choosePhoto', { title: '暂时声明本人', isOwnPhoto: true });
    await button('.cover-field-heading button', '刷新');
    await run(`(()=>{const el=document.getElementById('cover-photo');el.value=${JSON.stringify(own!.id)};el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await wait(`document.querySelector('.cover-person-summary img')?.complete && document.querySelector('.cover-person-summary img').naturalWidth > 0 && document.getElementById('cover-photo').value === ${JSON.stringify(own!.id)}`);
    await controller.covers.reading;
    const currentPhoto = library.readPhoto(own!.id); library.updatePhoto(currentPhoto.id, { isOwnPhoto: false }, currentPhoto.editToken);
    await button('.cover-field-heading button', '刷新');
    await wait(`[...document.querySelectorAll('[role="alert"]')].some(el => el.textContent.includes('原照片已失效'))`);
    assert.equal(await run(`document.getElementById('generate-cover').disabled`), true);
    assert.equal(await run(`document.getElementById('cover-photo').value`), own!.id);
    await click('no-person');
    await wait(`!document.querySelector('.cover-person-summary img') && document.getElementById('cover-photo').value === ''`);
    for (const [ratio, minimum] of [['1:1', '768×768'], ['16:9', '1376×774'], ['3:4', '768×1024']]) {
      await run(`(()=>{const el=document.getElementById('cover-ratio');el.value=${JSON.stringify(ratio)};el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await wait(`document.querySelector('.cover-size-hint').textContent === ${JSON.stringify(`${ratio} · 至少${minimum} · PNG原图；实际尺寸以生成结果为准`)}`);
    }
    await fill('cover-count', '1');
    await wait(`document.getElementById('cover-count').value === '1'`);
    mark('generate synthetic handoff');
    await click('generate-cover');
    await wait(`!document.querySelector('.cover-create-dialog') && document.getElementById('continue-cover')`);
    mark('history summary');
    await clickElement(`document.querySelector('.cover-history > summary')`);
    await wait(`document.querySelector('.cover-history-row')?.textContent.includes('不放人物')`);
    assert.equal(await run(`document.querySelector('.cover-history-row').textContent.includes('1 张 · 3:4 · 至少768×1024；实际尺寸以生成结果为准')`), true);
    assert.equal(await run(`document.querySelector('.cover-history-row').textContent.includes('inbox')`), false);
    let view = await bridge('readCover', { contentId: content.id });
    const firstJob = view.jobs[0]!, firstAttempt = firstJob.activeAttemptId!;
    assert.equal(launches.length, 1); assert.equal(launches[0]!.attemptId, firstAttempt);
    mark('continue same attempt');
    await click('continue-cover');
    view = await bridge('readCover', { contentId: content.id });
    assert.equal(view.jobs.length, 1); assert.equal(view.jobs[0]!.attempts.length, 1); assert.equal(view.jobs[0]!.activeAttemptId, firstAttempt);
    assert.equal(launches.length, 2); assert.equal(launches[1]!.attemptId, firstAttempt);
    mark('cancel live attempt');
    await button('#cover-jobs button', '取消这次生成');
    await wait(`!document.getElementById('continue-cover')`);
    mark('retry same job');
    await button('.cover-history-row button', '按这组设置重做');
    assert.equal(await run(`document.querySelectorAll('#continue-cover').length`), 1);
    view = await bridge('readCover', { contentId: content.id }); const job = view.jobs[0]!, attemptId = job.activeAttemptId!;
    assert.equal(view.jobs.length, 1); assert.equal(job.id, firstJob.id); assert.equal(job.attempts.length, 2); assert.notEqual(attemptId, firstAttempt);
    assert.equal(job.attempts.find(attempt => attempt.attemptId === firstAttempt)!.status, 'cancelled');
    assert.equal(launches.length, 3); assert.equal(launches[2]!.attemptId, attemptId);
    mark('claim and synthetic commit');
    const context = library.readCoverContext(content.id, job.id, attemptId);
    assert.equal(context.request.photo, null);
    assert.equal(context.request.sizePolicy, 'ratio-minimum');
    assert.deepEqual(context.request.pixels, { width: 768, height: 1024 });
    library.claimCoverAttempt(content.id, job.id, attemptId, { host: 'codex', readAssetHashes: [...new Set(context.inputs.map(i => i.assetHash))] });
    const bytes = await sharp({ create: { width: 900, height: 1200, channels: 3, background: '#1c4f93' } }).png().toBuffer();
    await fs.writeFile(path.join(context.inbox, 'synthetic.png'), bytes);
    await library.commitCoverAttempt(content.id, job.id, attemptId, { libraryId: controller.current().libraryId, contentId: content.id, requestId: job.id, attemptId, requestHash: job.requestHash, resultId: randomUUID(), files: [{ name: 'synthetic.png', sha256: createHash('sha256').update(bytes).digest('hex') }] });
    mark('focus refresh');
    await run(`window.dispatchEvent(new Event('focus'))`);
    await wait(`document.querySelectorAll('#cover-candidates img').length === 1 && document.querySelector('#cover-candidates img').naturalWidth === 900`);
    assert.equal(await run(`document.querySelectorAll('.cover-result-card').length`), 1);
    mark('candidate selection and byte export');
    await button('.cover-result-actions button', '选为封面'); await wait(`document.querySelector('.cover-selected') && ${idle}`);
    await button('.cover-result-actions button', '下载'); assert.deepEqual(await fs.readFile(exported), bytes);
    const selected = await bridge('readCover', { contentId: content.id }); assert.equal(selected.selectedCandidateId, selected.candidates[0]!.id);
    // A pending native read owns the UI action slot; switches cannot apply its result to another selection.
    mark('held read prevents selection and library switches');
    const otherContent = await bridge('createContent', { title: '切换安全验收', body: '另一篇正文' });
    await click('refresh-workspace');
    const originalCall = worker.call.bind(worker);
    let unblock!: () => void, entered!: () => void;
    const held = new Promise<void>(resolve => { unblock = resolve; }), started = new Promise<void>(resolve => { entered = resolve; });
    let holdRead = true;
    worker.call = async (op, args) => { if (op === 'readCover' && holdRead) { holdRead = false; entered(); await held; } return originalCall(op, args); };
    await run(`document.getElementById('refresh-cover').click()`); await started;
    await wait(`document.querySelector('main[data-busy="true"]')`);
    assert.equal(await run(`document.querySelector('[data-content-id]') === null && document.querySelector('.back-to-contents').disabled && [...document.querySelectorAll('.app-navigation nav button')].every(el => el.disabled)`), true);
    await run(`(()=>{document.querySelector('.back-to-contents').click();document.getElementById('nav-content').click();})()`);
    assert.equal(await run(`document.querySelector('.content-detail-hero h2').textContent`), content.title);
    assert.equal(await run(`document.querySelector('.cover-selected h4').textContent`), content.title);
    await run(`document.getElementById('library-menu').click()`);
    await wait(`document.querySelector('.library-manager-dialog[open]')`);
    await run(`[...document.querySelectorAll('.manager-tabs button')].find(el=>el.textContent==='备份与维护').click()`);
    await wait(`document.getElementById('open-library')`);
    assert.equal(await run(`document.getElementById('open-library').disabled`), true);
    mark('release read and explicitly switch contents');
    unblock(); await wait(idle); worker.call = originalCall;
    await button('.library-manager-dialog > .dialog-heading button', '关闭');
    await clickElement(`document.querySelector('.back-to-contents')`);
    await clickElement(`document.querySelector('[data-content-id="${otherContent.id}"] .content-title-link')`);
    await wait(`document.querySelector('.content-detail-hero h2')?.textContent === ${JSON.stringify(otherContent.title)} && ${idle} && document.querySelectorAll('#cover-candidates img').length === 0`);
    await clickElement(`document.querySelector('.back-to-contents')`);
    await clickElement(`document.querySelector('[data-content-id="${content.id}"] .content-title-link')`);
    await tab('封面');
    await wait(`document.querySelector('.content-detail-hero h2')?.textContent === ${JSON.stringify(content.title)} && document.querySelectorAll('#cover-candidates img').length === 1 && ${idle}`);
    await tab('正文'); assert.equal(await run(`document.getElementById('content-body').value`), '脏草稿刷新封面后仍可保存'); await tab('封面');
    console.log('PASS actual Electron selection safety: held read blocks content/library switch; subsequent explicit selection loads only its own candidates and body');
    const granted = selected.candidates[0]!.url;
    assert.equal(await run(`new Promise(resolve=>{const img=new Image();img.onload=()=>resolve(true);img.onerror=()=>resolve(false);img.src=${JSON.stringify(granted + '?')};})`), false);
    await run("document.getElementById('cover-candidates').scrollIntoView({block:'center'})");
    await window.webContents.capturePage().then(image => fs.writeFile(path.join(root, 'cover.png'), image.toPNG()));
    const authorized = await net.fetch(granted, { cache: 'no-store' }); assert.equal(authorized.status, 200); assert.equal(authorized.headers.get('content-type'), 'image/png');
    mark('concurrent granted image reads and content writes');
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
      mark(`five pages: ${page}`);
      await click(`nav-${page}`); await wait(`document.querySelector('.workspace-page') && document.querySelector('[data-busy="false"]')`);
      assert.equal(await run(`document.querySelector('#nav-${page}').getAttribute('aria-current')`), 'page');
      if (page === 'overview') assert.ok((await run<number>(`document.querySelectorAll('.creator-stat strong').length`)) >= 4);
      if (page === 'templates') {
        await run(`(async()=>{for(const img of document.querySelectorAll('.creator-reference-stack img')){img.scrollIntoView({block:'center'});await img.decode();}window.scrollTo(0,0);})()`);
        await wait(`document.querySelectorAll('.creator-reference-stack img').length > 1 && [...document.querySelectorAll('.creator-reference-stack img')].every(img=>img.complete&&img.naturalWidth>0)`);
        const contentIds = library.listContents().map(item => item.id).sort();
        await button('.creator-style-actions button', '使用这个风格');
        await wait(`document.querySelector('.template-content-dialog[open]') && document.querySelectorAll('.template-content-list button').length > 0`);
        assert.equal(await run(`document.querySelector('.cover-create-dialog') === null`), true);
        await button('.template-content-dialog > .dialog-heading button', '关闭');
        await wait(`!document.querySelector('.template-content-dialog') && document.getElementById('nav-templates').getAttribute('aria-current') === 'page'`);
        assert.deepEqual(library.listContents().map(item => item.id).sort(), contentIds);
      }
      if (page === 'calendar') assert.equal(await run(`document.querySelectorAll('.calendar-cell').length`), 42);
      if (page === 'prompts') {
        await wait(`document.querySelectorAll('.prompt-library-use').length > 0`);
        await run(`document.querySelector('.prompt-library-use').click()`); await wait(`document.querySelector('.prompt-dialog')?.open`);
        const fields = await run<number>(`document.querySelectorAll('.prompt-fields textarea').length`);
        for (let index = 0; index < fields; index++) await fill(`prompt-field-${index}`, `真实窗口填写验收 ${index + 1}`);
        if (fields) await wait(`document.querySelector('.prompt-preview').value.includes('真实窗口填写验收') && !document.querySelector('.prompt-preview').value.includes('【待填写：')`);
        // Empty pasteboard entries carry no formats and cannot construct a ClipboardItem.
        const clipboardBefore = await Promise.all((await clipboard.read()).filter(item => item.types.length > 0).map(async item => new ClipboardItem(Object.fromEntries(await Promise.all(item.types.map(async type => [type, await item.getType(type)]))))));
        try {
          const expectedText = await run<string>(`document.querySelector('.prompt-preview').value`);
          await run(`document.querySelector('.prompt-dialog .dialog-footer button').click()`);
          await wait(`document.querySelector('.prompt-dialog [role="status"]').textContent.includes('已复制完整提示词')`);
          assert.equal(await clipboard.readText(), expectedText);
        } finally { if (clipboardBefore.length) await clipboard.write(clipboardBefore); else clipboard.clear(); }
      }
      await run(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
      await window.webContents.capturePage().then(image => fs.writeFile(path.join(root, `${page}.png`), image.toPNG()));
      if (page === 'prompts') {
        await clickElement(`document.querySelector('[aria-label="关闭提示词"]')`);
        if (await run(`!!document.querySelector('.prompt-discard')`)) await button('.prompt-discard button', '放弃本次填写并关闭');
        await wait(`!document.querySelector('.prompt-dialog')`);
      }
    }
    await click('nav-content');
    console.log('PASS actual five-page shell: real overview counts, multi-image templates decoded, calendar month grid, prompt live variable preview and content return');
    mark('switch library and revoke grants');
    chosenLibrary = path.join(root, 'other-library'); createLibrary(chosenLibrary);
    await click('library-menu'); await button('.manager-tabs button', '备份与维护'); await click('open-library');
    await wait(`document.querySelector('[data-busy="false"]') && !document.getElementById('content-title') && document.querySelectorAll('#cover-candidates img').length === 0`);
    assert.equal(await run(`document.querySelectorAll('[data-content-id]').length`), 0);
    assert.equal(controller.covers.allows(granted), false);
    const revoked = await net.fetch(granted, { cache: 'no-store' }).then(response => response.status, () => 0); assert.ok([0, 404].includes(revoked));
    console.log(`PASS actual disabled Electron: ${assets.templates.length} seeded template groups, all sample images decoded, false photo declaration, explicit photo:null, ratio-minimum 768×1024 request accepts a synthetic 900×1200 raster, recorded handoffs (no real host generation), selection and byte-identical export; grants revoked`);
  }
  mark('complete');
  app.quit();
} }).catch(async error => { console.error(error); try { await captureFailure?.(error); } catch (captureError) { console.error('Failure diagnostic capture:', captureError); } app.exit(1); });
