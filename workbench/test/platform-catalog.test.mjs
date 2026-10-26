import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlatformCatalogReader} from '../src/main/platform-catalog.mts';
import {accountAnalysisPrompt, parsePlatformCatalog, platformCatalogSnapshot, platformCollectionCapability, PLATFORM_CATALOG_SOURCE, reportTypeOptions} from '../src/shared/platform-catalog.ts';
const spec = {openapi: '3.1.0', info: {version: 'test-v1'}, paths: {
 '/api/v1/douyin/web/profile': {get: {}}, '/api/v1/douyin/app/profile': {post: {}},
 '/api/v1/telegram/web/profile': {get: {}}, '/api/v1/new_platform/web/profile': {get: {}},
 '/api/v1/tikhub/user/me': {get: {}}, '/api/v1/health/check': {get: {}}, '/api/v1/wechat_search/v2/query': {get: {}},
 '/api/v1/demo/douyin/profile': {get: {}}, '/api/v1/empty/web/path': {parameters: []},
}};
const response = () => new Response(JSON.stringify(spec), {headers: {'content-type': 'application/json'}});
test('public directory derives unique platform roots; new platforms remain record-only and service routes are excluded', () => {
 const catalog = parsePlatformCatalog(spec, '2026-10-27T01:00:00Z');
 assert.deepEqual(catalog.platforms.map(item => item.id), ['douyin', 'telegram', 'new_platform']);
 assert.equal(catalog.platforms[0].name, '抖音'); assert.deepEqual(catalog.platforms[0].aliases, ['Douyin']);
 assert.equal(catalog.platforms[2].name, 'new_platform'); assert.equal(catalog.source, PLATFORM_CATALOG_SOURCE);
 assert.equal(catalog.origin, 'live'); assert.equal(catalog.version, 'test-v1');
 for (const invalid of [null, [], {}, {openapi: '3', paths: {}}, {openapi: '3', paths: []}]) assert.throws(() => parsePlatformCatalog(invalid, 'now'));
});
test('fallback is a dated official snapshot including FAQ platforms and Telegram present in current OpenAPI', () => {
 const catalog = platformCatalogSnapshot(); assert.equal(catalog.origin, 'builtin'); assert.equal(catalog.status, 'snapshot');
 assert.equal(catalog.version, 'V5.3.2'); assert.equal(catalog.platforms.length, 20);
 for (const name of ['TikTok', '抖音', '领英', '微信视频号', '微信公众号', '今日头条', 'Telegram']) assert.ok(catalog.platforms.some(item => item.name === name), name);
 assert.ok(!catalog.platforms.some(item => item.id === 'wechat_search'));
});
test('capability only recognizes integrated Douyin names; manual account prompt never silently maps a platform', () => {
 for (const value of ['抖音', 'Douyin', ' douyin ']) assert.equal(platformCollectionCapability(value), 'douyin');
 for (const value of ['TikTok', '小红书', '我的旧平台', 'douyin-custom', '']) {
  assert.equal(platformCollectionCapability(value), 'manual');
  const prompt = accountAnalysisPrompt({name: '账号甲', platform: value, url: ''});
  assert.match(prompt, /仅分析已保存或用户手工提供/); assert.match(prompt, /不得调用抖音/);
 }
 const oldType = '旧分类 · 不重命名'; assert.deepEqual(reportTypeOptions([oldType, '调研', oldType]).slice(0, 2), [oldType, '调研']);
 assert.ok(reportTypeOptions([]).includes('账号拆解'));
});
test('directory requests use a fixed unauthenticated URL, deduplicate concurrent reads and cache for 24 hours', async () => {
 let clock = 1000, calls = 0;
 const read = createPlatformCatalogReader(async (url, options) => {
  calls++; assert.equal(url, PLATFORM_CATALOG_SOURCE); assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error');
  assert.equal(options.credentials, 'omit'); assert.deepEqual(options.headers, {Accept: 'application/json'});
  return response();
 }, () => clock);
 const [first, second] = await Promise.all([read(), read()]); assert.equal(calls, 1); assert.deepEqual(first, second);
 first.platforms.length = 0; assert.equal((await read()).platforms.length, 3, 'callers cannot mutate the cache');
 clock += 24 * 60 * 60 * 1000 - 1; await read(); assert.equal(calls, 1);
 clock++; await read(); assert.equal(calls, 2);
});
test('offline fallback cools down retries and preserves last successful source time', async () => {
 let clock = 1000, calls = 0, online = false;
 const read = createPlatformCatalogReader(async () => {calls++; if (!online) throw new Error('offline'); return response();}, () => clock);
 const builtin = await read(); assert.equal(builtin.origin, 'builtin'); assert.equal(builtin.status, 'snapshot'); assert.match(builtin.notice, /内置/);
 await read(); assert.equal(calls, 1); clock += 5 * 60 * 1000; online = true;
 const live = await read(); assert.equal(live.origin, 'live'); assert.equal(live.status, 'live'); assert.equal(calls, 2);
 clock += 24 * 60 * 60 * 1000; online = false;
 const stale = await read(); assert.equal(stale.status, 'snapshot'); assert.equal(stale.origin, 'live'); assert.equal(stale.checkedAt, live.checkedAt); assert.deepEqual(stale.platforms, live.platforms);
 await read(); assert.equal(calls, 3);
});
test('invalid, redirected, HTTP error and oversized documents fall back instead of altering platform values', async () => {
 for (const fake of [() => new Response('{}'), () => new Response('', {status: 503}), () => new Response('', {headers: {'content-length': String(9 * 1024 * 1024)}}), () => {throw new TypeError('redirect not allowed');}]) {
  const catalog = await createPlatformCatalogReader(async () => fake())(); assert.equal(catalog.origin, 'builtin'); assert.equal(catalog.status, 'snapshot');
 }
 const catalog = await createPlatformCatalogReader(async () => new Response(new Uint8Array(8 * 1024 * 1024 + 1)))(); assert.equal(catalog.origin, 'builtin');
});

test('rejected response bodies are cancelled before falling back', async () => {
 for (const headers of [{'content-length': String(9 * 1024 * 1024)}, {}]) {
  let cancelled = false;
  const body = new ReadableStream({cancel() {cancelled = true;}});
  const read = createPlatformCatalogReader(async () => new Response(body, {status: Object.keys(headers).length ? 200 : 503, headers}));
  assert.equal((await read()).origin, 'builtin'); assert.equal(cancelled, true);
 }
});
