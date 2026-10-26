import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {createLibrary} from '../../plugin-src/src/lib/file-library/index.mjs';
import {ProductionPages} from '../src/main/production-pages.mts';
import {executeProduction} from '../src/main/production-worker.mts';

// Real source server/worker/library and Chrome. Only synthetic media/report
// content is created. External requests are guarded, never fulfilled or mocked.
const repo = fileURLToPath(new URL('../../', import.meta.url));
const evidence = path.resolve(process.env.UI_EVIDENCE_DIR || path.join(repo, 'docs/verification/production/2026-10-26-research-creation-rebuild'));
const playwrightPath = process.env.NOVA_PLAYWRIGHT_MODULE || '/tmp/llm-api-service-browser-check/node_modules/playwright/index.mjs';
const {chromium} = await import(pathToFileURL(playwrightPath).href);
const temp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'nova-media-report-probe-')));
const receipt = {startedAt: new Date().toISOString(), platform: `${process.platform}-${process.arch}`, checks: {}, screenshots: [], externalRequestAttempts: [], expectedCspConsoleErrors: [], pageErrors: []};
let pages, browser;
function wav(seconds = 8, sampleRate = 16000) {
    const bytes = Buffer.alloc(44 + seconds * sampleRate * 2);
    bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
    bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
    bytes.writeUInt32LE(sampleRate, 24); bytes.writeUInt32LE(sampleRate * 2, 28);
    bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36);
    bytes.writeUInt32LE(bytes.length - 44, 40);
    return bytes;
}
function reportHtml() {
    return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
body{font:14px/1.7 -apple-system,BlinkMacSystemFont,"Microsoft YaHei",sans-serif;color:#1D1D1F;background:#F5F5F7;margin:0;padding:28px}article{max-width:900px;background:white;border:1px solid #ddd;border-radius:18px;padding:24px;margin:auto}h1{font-size:24px}.hint{color:#6E6E73}.chart{display:grid;gap:14px;margin:24px 0}.bar{background:#E8F1FC;padding:10px;border-radius:8px}.fill{background:#0071E3;height:18px;border-radius:4px}code{overflow-wrap:anywhere}</style></head><body><article>
<h1>合成报告 · 内联图表隔离验收</h1><p class="hint">此报告只使用合成数据，测试内联脚本与宿主隔离。</p>
<div class="chart"><div class="bar">参考样本 A<div class="fill" style="width:35%"></div></div><div class="bar">参考样本 B<div id="chart-bar" class="fill" style="width:0%"></div></div></div>
<p id="chart-marker">图表尚未运行</p><p id="parent-status">宿主隔离检查中</p><p id="network-status">外部连接检查中</p><p id="bridge-status"></p>
<script>
window.probeViolations=[];document.addEventListener('securitypolicyviolation',event=>{window.probeViolations.push({directive:event.effectiveDirective,blocked:event.blockedURI});});
document.getElementById('chart-bar').style.width='72%';document.getElementById('chart-marker').textContent='内联图表已运行：样本 B = 72';
try{void parent.document.body;document.getElementById('parent-status').textContent='UNEXPECTED_PARENT_ACCESS';}catch(error){document.getElementById('parent-status').textContent=error.name;}
document.getElementById('bridge-status').textContent=JSON.stringify({require:typeof window.require,process:typeof window.process,nova:typeof window.nova,electron:typeof window.electron});
fetch('https://nova-production-probe.invalid/must-not-leave').then(()=>{document.getElementById('network-status').textContent='UNEXPECTED_NETWORK_SUCCESS';},()=>{document.getElementById('network-status').textContent='外部 fetch 已被阻断';});
const remote=document.createElement('script');remote.src='https://nova-production-probe.invalid/never-load.js';document.body.append(remote);
<\/script></article></body></html>`;
}
try {
    await fs.mkdir(evidence, {recursive: true});
    const lib = createLibrary(path.join(temp, 'library'));
    const binding = {root: lib.info.root, libraryId: lib.info.libraryId, rootIdentity: lib.info.rootIdentity};
    const mutate = (op, input) => lib.mutateProduction(op, {expectedToken: lib.readProduction().editToken, ...input}, {mutationId: randomUUID()});
    const content = lib.createContent({title: '原片播放与时间码 · 合成验收', body: '这是隔离验收稿。参考原片只含八秒静音，不包含私人录音。'});
    mutate('ensureCreation', {contentId: content.id});
    const audioFile = path.join(temp, 'synthetic.wav'), bytes = wav();
    await fs.writeFile(audioFile, bytes);
    const media = lib.importAsset(audioFile, {purpose: 'production-reference'});
    const source = lib.readProductionCreation(content.id);
    lib.saveProductionDraft(content.id, {body: source.content.body, expectedBodyHash: source.content.bodyHash, expectedProductionToken: source.productionToken, creationPatch: {references: [{id: randomUUID(), url: null, title: '八秒合成原片', platform: '', originalText: '原识别稿保持完整。', correctedText: '校对稿保持完整。', segments: [{startMs: 2500, endMs: 4000, text: '从两秒半定位播放合成原片。'}], corrections: [], analysis: '只验证播放链路，不代表真实内容分析。', mediaAssetHash: media.assetHash, subtitleAssetHash: null}]}}, source.content.editToken);
    const foreignFile = path.join(temp, 'unregistered-for-current.wav'), foreignBytes = wav(); foreignBytes.writeInt16LE(1, 44);
    await fs.writeFile(foreignFile, foreignBytes);
    const foreign = lib.importAsset(foreignFile, {purpose: 'production-reference'});
    const reportFile = path.join(temp, 'inline-chart.html');
    await fs.writeFile(reportFile, reportHtml());
    const reportAsset = lib.importAsset(reportFile, {purpose: 'production-report'});
    const report = mutate('saveReport', {title: '合成报告 · 内联图表与隔离', type: '隔离验收', accountIds: [], sourceUrl: null, collectedAt: null, pages: [{title: '内联图表', assetHash: reportAsset.assetHash}], meta: {synthetic: true}}).reports[0];
    const operations = [];
    const worker = {call: async (op, args) => {operations.push(op); return executeProduction(op, args, 'disabled');}};
    pages = new ProductionPages({worker, creationHtml: await fs.readFile(path.join(repo, 'plugin-src/resources/production-creation.html'), 'utf8'), authorize: value => assert.deepEqual(value, binding), readCreation: (value, id) => worker.call('productionCreation', {binding: value, contentId: id}), saveDraft: (value, input) => worker.call('productionMutate', {binding: value, pending: {kind: 'draft', binding: {libraryId: value.libraryId, rootIdentity: value.rootIdentity}, mutationId: randomUUID(), input}})});
    const creationUrl = await pages.openCreation(binding, content.id), origin = new URL(creationUrl).origin;
    const mediaUrl = `${creationUrl}media/${media.assetHash}`;
    const range = await fetch(mediaUrl, {headers: {Range: 'bytes=0-43'}});
    assert.equal(range.status, 206); assert.equal(range.headers.get('content-range'), `bytes 0-43/${bytes.length}`);
    assert.deepEqual(Buffer.from(await range.arrayBuffer()), bytes.subarray(0, 44));
    const suffix = await fetch(mediaUrl, {headers: {Range: 'bytes=-32'}});
    assert.equal(suffix.status, 206); assert.equal((await suffix.arrayBuffer()).byteLength, 32);
    assert.equal((await fetch(mediaUrl, {headers: {Range: 'bytes=999999-'}})).status, 416);
    assert.equal((await fetch(`${creationUrl}media/${foreign.assetHash}`)).status, 403);
    const creationHeaders = await fetch(creationUrl);
    assert.match(creationHeaders.headers.get('content-security-policy'), /media-src 'self'/);
    receipt.checks.mediaRange = {header: range.headers.get('content-range'), suffixStatus: 206, outOfBoundsStatus: 416, foreignRegisteredAssetStatus: 403, creationCspMediaSelf: true};
    browser = await chromium.launch({headless: true, ...(process.env.NOVA_CHROME_PATH ? {executablePath: process.env.NOVA_CHROME_PATH} : process.platform === 'darwin' ? {executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'} : {})});
    const context = await browser.newContext({viewport: {width: 1440, height: 1000}});
    // A regression in CSP must fail before any external traffic leaves Chrome.
    await context.route('**/*', route => {const requestUrl = new URL(route.request().url()); if (requestUrl.origin !== origin) {receipt.externalRequestAttempts.push(`${requestUrl.protocol}//${requestUrl.host}${requestUrl.pathname}`); return route.abort('blockedbyclient');} return route.continue();});
    const page = await context.newPage();
    page.on('pageerror', error => receipt.pageErrors.push(error.message));
    page.on('console', entry => {if (entry.type() === 'error' && /Content Security Policy|violates|Refused to/i.test(entry.text())) receipt.expectedCspConsoleErrors.push(entry.text());});
    await page.goto(creationUrl);
    await page.getByText('已读取当前稿件。修改后请保存。', {exact: true}).waitFor();
    const reference = page.locator('#references details').first(); await reference.locator('summary').first().click();
    const video = reference.locator('video'); await video.waitFor();
    await page.waitForFunction(() => {const video = document.querySelector('#references video'); return video?.readyState >= 1 && Number.isFinite(video.duration);});
    const metadata = await video.evaluate(el => ({duration: el.duration, readyState: el.readyState, error: el.error?.message ?? null}));
    assert(Math.abs(metadata.duration - 8) < 0.01); assert.equal(metadata.error, null);
    await reference.getByText('时间码分段', {exact: true}).click();
    await reference.getByRole('button', {name: '从 2.5 秒看原片', exact: true}).click();
    await page.waitForFunction(() => {const video = document.querySelector('#references video'); return video && !video.paused && video.readyState >= 2 && video.currentTime >= 2.7 && video.currentTime < 5;});
    const playback = await video.evaluate(el => {const result = {currentTime: el.currentTime, paused: el.paused, readyState: el.readyState}; el.pause(); return result;});
    assert.equal(await page.locator('#body').inputValue(), source.content.body);
    assert(await reference.getByText('2.5–4.0 秒  从两秒半定位播放合成原片。', {exact: true}).count());
    receipt.checks.browserPlayback = {metadata, playback, originalBodyPreserved: true, configuredByRealPages: await page.evaluate(() => typeof window.novaCreation?.basePath === 'string')};
    await video.scrollIntoViewIfNeeded(); await page.screenshot({path: path.join(evidence, 'media-real-chrome-1440x1000.png')}); receipt.screenshots.push('media-real-chrome-1440x1000.png');
    await page.setViewportSize({width: 900, height: 800}); await video.scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({path: path.join(evidence, 'media-real-chrome-900x800.png')}); receipt.screenshots.push('media-real-chrome-900x800.png');
    const reportUrl = await pages.openReport(binding, report.id);
    const rawReport = await fetch(`${reportUrl}page/${report.pages[0].id}`);
    const reportCsp = rawReport.headers.get('content-security-policy');
    assert.match(reportCsp, /sandbox allow-scripts/); assert.match(reportCsp, /script-src 'unsafe-inline'/); assert.match(reportCsp, /default-src 'none'/);
    await page.goto(reportUrl);
    const frame = page.frameLocator('iframe[title="报告完整内容"]');
    await frame.getByText('内联图表已运行：样本 B = 72', {exact: true}).waitFor();
    await frame.getByText('外部 fetch 已被阻断', {exact: true}).waitFor();
    const reportFrame = page.frames().find(value => value.url().includes('/page/'));
    assert(reportFrame);
    await reportFrame.waitForFunction(() => window.probeViolations.some(x => x.directive === 'connect-src') && window.probeViolations.some(x => x.directive === 'script-src-elem'));
    const sandbox = await reportFrame.evaluate(() => ({origin: window.origin, parentAccess: document.getElementById('parent-status').textContent, bridge: JSON.parse(document.getElementById('bridge-status').textContent), violations: window.probeViolations, chartWidth: document.getElementById('chart-bar').style.width}));
    assert.equal(sandbox.origin, 'null'); assert.equal(sandbox.parentAccess, 'SecurityError'); assert.equal(sandbox.chartWidth, '72%');
    assert.deepEqual(sandbox.bridge, {require: 'undefined', process: 'undefined', nova: 'undefined', electron: 'undefined'});
    assert.deepEqual(receipt.externalRequestAttempts, []); assert.deepEqual(receipt.pageErrors, []);
    receipt.checks.reportSandbox = {csp: reportCsp, iframeSandbox: await page.locator('iframe').getAttribute('sandbox'), ...sandbox};
    await page.setViewportSize({width: 1440, height: 1000}); await page.screenshot({path: path.join(evidence, 'report-inline-sandbox-1440x1000.png')}); receipt.screenshots.push('report-inline-sandbox-1440x1000.png');
    await page.setViewportSize({width: 900, height: 800}); await page.screenshot({path: path.join(evidence, 'report-inline-sandbox-900x800.png')}); receipt.screenshots.push('report-inline-sandbox-900x800.png');
    receipt.workerOperations = [...new Set(operations)];
    assert(receipt.workerOperations.includes('productionMedia')); assert(receipt.workerOperations.includes('productionReport'));
    receipt.status = 'passed';
} catch (error) {
    receipt.status = 'failed'; receipt.error = {name: error.name, code: error.code, message: error.message}; process.exitCode = 1;
} finally {
    if (browser) await browser.close(); if (pages) await pages.close();
    await fs.rm(temp, {recursive: true, force: true});
    receipt.finishedAt = new Date().toISOString();
    await fs.mkdir(evidence, {recursive: true});
    await fs.writeFile(path.join(evidence, 'production-media-probe.json'), JSON.stringify(receipt, null, 2) + '\n');
    console.log(JSON.stringify(receipt, null, 2));
}
