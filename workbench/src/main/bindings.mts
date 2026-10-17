import { isRecord, errorInfo } from '../shared/contracts.ts';
import type { Binding } from '../shared/contracts.ts';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const absolute = (value: unknown) => typeof value === 'string' && path.isAbsolute(value) && !value.includes('\0');
export function validateBinding(value: unknown): Binding {
  if (!isRecord(value) || value.version !== 1 || Object.keys(value).some(key => !['version', 'source', 'sourceHash', 'destination', 'started', 'importId', 'libraryId'].includes(key)) ||
      !(value.source === null || absolute(value.source)) || !(value.destination === null || absolute(value.destination)) ||
      !(value.sourceHash === null || (typeof value.sourceHash === 'string' && /^[0-9a-f]{64}$/.test(value.sourceHash))) || typeof value.started !== 'boolean' ||
      !(value.importId === null || (typeof value.importId === 'string' && UUID.test(value.importId))) || !(value.libraryId === null || (typeof value.libraryId === 'string' && UUID.test(value.libraryId))) ||
      (!!value.source !== !!value.sourceHash) || (value.started && (!value.source || !value.destination)) ||
      (value.importId && !value.started) || (value.libraryId && !value.importId)) {
    throw Object.assign(new Error('机器绑定记录损坏，已保留现场；请联系维护者检查。'), { code: 'BINDING_INVALID' });
  }
  return value as unknown as Binding;
}
export const emptyBinding = (): Binding => ({ version: 1, source: null, sourceHash: null, destination: null, started: false, importId: null, libraryId: null });
export class BindingStore {
  file: string;
  constructor(file: string) { this.file = file; }
  async load() {
    try {
      const info = await fs.lstat(this.file);
      if (!info.isFile() || info.isSymbolicLink() || info.size > 16384) throw new Error('Invalid binding file');
      return validateBinding(JSON.parse(await fs.readFile(this.file, 'utf8')));
    } catch (error) {
      if (errorInfo(error).code === 'ENOENT') return emptyBinding();
      throw Object.assign(new Error('无法读取机器绑定记录，已保留现场。'), { code: 'BINDING_INVALID', cause: error });
    }
  }
  async save(binding: Binding) {
    validateBinding(binding);
    await fs.mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    const handle = await fs.open(temporary, 'wx', 0o600);
    try { await handle.writeFile(JSON.stringify(binding)); await handle.sync(); } finally { await handle.close(); }
    await fs.rename(temporary, this.file);
    // Windows does not provide directory fsync through Node; file data is still flushed.
    if (process.platform !== 'win32') {
      const parent = await fs.open(path.dirname(this.file), 'r');
      try { await parent.sync(); } finally { await parent.close(); }
    }
  }
}
