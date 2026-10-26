import {PLATFORM_CATALOG_SOURCE, parsePlatformCatalog, platformCatalogSnapshot, type PlatformCatalog} from '../shared/platform-catalog.ts';
const MAX_BYTES = 8 * 1024 * 1024;
/** Fixed, unauthenticated public OpenAPI request. No service settings, keys or paid endpoints. */
export function createPlatformCatalogReader(fetchDocument: typeof fetch = fetch, now: () => number = Date.now) {
 let cached: PlatformCatalog | undefined, expiresAt = 0, pending: Promise<PlatformCatalog> | undefined;
 return async function readPlatformCatalog(): Promise<PlatformCatalog> {
  if (cached && now() < expiresAt) return structuredClone(cached);
  if (!pending) pending = (async () => {
   const abort = new AbortController(), timeout = setTimeout(() => abort.abort(), 10_000);
   try {
    const response = await fetchDocument(PLATFORM_CATALOG_SOURCE, {method: 'GET', redirect: 'error', credentials: 'omit', headers: {Accept: 'application/json'}, signal: abort.signal});
    if (!response.ok || !response.body) {await response.body?.cancel(); throw new Error('Public document unavailable');}
    if (Number(response.headers.get('content-length')) > MAX_BYTES) {await response.body.cancel(); throw new Error('Public document too large');}
    const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
    try {while (true) {const next = await reader.read(); if (next.done) break; size += next.value.byteLength; if (size > MAX_BYTES) {await reader.cancel(); throw new Error('Public document too large');} chunks.push(next.value);}}
    finally {reader.releaseLock();}
    const body = new Uint8Array(size); let offset = 0; for (const chunk of chunks) {body.set(chunk, offset); offset += chunk.byteLength;}
    cached = parsePlatformCatalog(JSON.parse(new TextDecoder().decode(body)), new Date(now()).toISOString());
    expiresAt = now() + 24 * 60 * 60 * 1000;
   } catch {
    cached = {...(cached ?? platformCatalogSnapshot()), status: 'snapshot', notice: cached?.origin === 'live' ? '官方目录暂未同步，正在使用上次成功同步的目录。平台资料仍可保存。' : '官方目录暂未同步，正在使用内置目录快照。平台资料仍可保存。'};
    expiresAt = now() + 5 * 60 * 1000;
   } finally {clearTimeout(timeout); pending = undefined;}
   return cached;
  })();
  return structuredClone(await pending);
 };
}
export const readPlatformCatalog = createPlatformCatalogReader();
