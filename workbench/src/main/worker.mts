import path from 'node:path';
import fs from 'node:fs/promises';
import { validateRelease } from './boundary.mts';
import * as imports from '../../../browser-import/index.mjs';
import { openLibrary } from '../../../file-library/index.mjs';
import { isRecord, errorInfo } from '../shared/contracts.ts';
import type { WorkerOperations, WorkerOperation } from '../shared/contracts.ts';

const absolute = (value: unknown) => typeof value === 'string' && path.isAbsolute(value) && !value.includes('\0');
const uuid = (value: unknown) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const schemas: Record<WorkerOperation, string[]> = { inspect: ['source'], query: ['destination', 'importId'], import: ['source', 'destination', 'expectedSourceHash'], resume: ['destination', 'importId'], list: ['destination', 'libraryId'] };
export async function execute(op: unknown, args: unknown): Promise<WorkerOperations[WorkerOperation]['result']> {
  const fields = typeof op === 'string' && Object.hasOwn(schemas, op) ? schemas[op as WorkerOperation] : null;
  if (!fields || !isRecord(args) || Object.keys(args).length !== fields.length || fields.some(key => !Object.hasOwn(args, key)) ||
      fields.some(key => ['source', 'destination'].includes(key) ? !absolute(args[key]) : key === 'expectedSourceHash' ? !(typeof args[key] === 'string' && /^[0-9a-f]{64}$/.test(args[key])) : !(uuid(args[key]) || (op === 'query' && args[key] === null)))) {
    throw Object.assign(new Error('工作进程拒绝了无效的业务参数。'), { code: 'INVALID_INPUT' });
  }
  // These casts follow the finite field and value validation above, before entering the shared core.
  if (op === 'inspect') return imports.inspectBrowserBackup(args.source as string);
  if (op === 'query') return imports.getBrowserImport(args.destination as string, (args.importId ?? undefined) as string | undefined);
  if (op === 'import') return imports.importBrowserBackup(args.source as string, args.destination as string, { expectedSourceHash: args.expectedSourceHash as string });
  if (op === 'resume') return imports.resumeBrowserImport(args.destination as string, args.importId as string);
  const library = openLibrary(args.destination as string);
  if (library.info.libraryId !== args.libraryId) throw Object.assign(new Error('内容库身份发生改变，已停止读取。'), { code: 'LIBRARY_CHANGED' });
  return library.listContents().map(({ id, title, body }) => ({ id, title, body }));
}
const port = process.parentPort;
if (port) {
  let running = false;
  const release = fs.readFile(new URL('../release.json', import.meta.url), 'utf8').then(bytes => {
    const config = validateRelease(JSON.parse(bytes));
    if (process.argv[2] !== config.pairId) throw Object.assign(new Error('Worker release differs from main'), { code: 'RELEASE_MISMATCH' });
  });
  // Attach the rejection immediately; the operation below reports it without entering the core.
  void release.catch(() => {});
  port.on('message', async ({ data: message }: { data: unknown }) => {
    if (!isRecord(message) || !Number.isSafeInteger(message.id) || running) return;
    running = true;
    try { await release; port.postMessage({ id: message.id, ok: true, value: await execute(message.op, message.args) }); }
    catch (error) { port.postMessage({ id: message.id, ok: false, error: { code: errorInfo(error).code } }); }
    finally { running = false; }
  });
}
