import path from 'node:path';
import * as imports from '../browser-import/index.mjs';
import { openLibrary } from '../file-library/index.mjs';

const absolute = value => typeof value === 'string' && path.isAbsolute(value) && !value.includes('\0');
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const schemas = { inspect: ['source'], query: ['destination', 'importId'], import: ['source', 'destination', 'expectedSourceHash'], resume: ['destination', 'importId'], list: ['destination', 'libraryId'] };
export async function execute(op, args) {
  const fields = schemas[op];
  if (!fields || !args || Object.keys(args).length !== fields.length || fields.some(key => !Object.hasOwn(args, key)) ||
      fields.some(key => ['source', 'destination'].includes(key) ? !absolute(args[key]) : key === 'expectedSourceHash' ? !(typeof args[key] === 'string' && /^[0-9a-f]{64}$/.test(args[key])) : !(uuid(args[key]) || (op === 'query' && args[key] === null)))) {
    throw Object.assign(new Error('工作进程拒绝了无效的业务参数。'), { code: 'INVALID_INPUT' });
  }
  if (op === 'inspect') return imports.inspectBrowserBackup(args.source);
  if (op === 'query') return imports.getBrowserImport(args.destination, args.importId ?? undefined);
  if (op === 'import') return imports.importBrowserBackup(args.source, args.destination, { expectedSourceHash: args.expectedSourceHash });
  if (op === 'resume') return imports.resumeBrowserImport(args.destination, args.importId);
  const library = openLibrary(args.destination);
  if (library.info.libraryId !== args.libraryId) throw Object.assign(new Error('内容库身份发生改变，已停止读取。'), { code: 'LIBRARY_CHANGED' });
  return library.listContents().map(({ id, title, body }) => ({ id, title, body }));
}
if (process.parentPort) {
  let running = false;
  process.parentPort.on('message', async ({ data: message }) => {
    if (!message || !Number.isSafeInteger(message.id) || running) return;
    running = true;
    try { process.parentPort.postMessage({ id: message.id, ok: true, value: await execute(message.op, message.args) }); }
    catch (error) { process.parentPort.postMessage({ id: message.id, ok: false, error: { code: error.code || 'IO_ERROR' } }); }
    finally { running = false; }
  });
}
