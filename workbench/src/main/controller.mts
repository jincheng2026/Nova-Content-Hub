import type { Binding, Inspection, ImportTask, Worker, Dialogs, Status } from '../shared/contracts.ts';
import type { BindingStore } from './bindings.mts';
import path from 'node:path';
import { emptyBinding } from './bindings.mts';

function fail(code: string, message: string): never { throw Object.assign(new Error(message), { code }); }
export class DesktopController {
  store: BindingStore; worker: Worker; dialogs: Dialogs; documents: string;
  binding!: Binding; inspection: Inspection | null = null; busy = false; last: ImportTask | null = null;
  querying: Promise<ImportTask | null> | null = null;
  constructor({ store, worker, dialogs, documents }: { store: BindingStore; worker: Worker; dialogs: Dialogs; documents: string }) {
    this.store = store; this.worker = worker; this.dialogs = dialogs; this.documents = documents;
  }
  async initialize() { this.binding = await this.store.load(); }
  async query(): Promise<ImportTask | null> {
    if (!this.binding.started) return null;
    if (this.querying) return this.querying;
    this.querying = this.readTask();
    try { return await this.querying; } finally { this.querying = null; }
  }
  async readTask() {
    const result = await this.worker.call('query', { destination: this.binding.destination!, importId: this.binding.importId! });
    if (!result) {
      if (this.binding.importId) fail('IMPORT_NOT_FOUND', '已绑定的导入任务不在原位置，已停止；请恢复原目录后查询。');
      return null;
    }
    if (result.sourceHash !== this.binding.sourceHash || (this.binding.importId && result.importId !== this.binding.importId) ||
        (this.binding.libraryId && result.libraryId && result.libraryId !== this.binding.libraryId)) fail('BINDING_CONFLICT', '磁盘任务与已选择的备份或内容库不一致，已停止。');
    const next = { ...this.binding, importId: result.importId, libraryId: result.libraryId ?? this.binding.libraryId };
    if (JSON.stringify(next) !== JSON.stringify(this.binding)) { await this.store.save(next); this.binding = next; }
    this.last = result;
    return result;
  }
  async status(): Promise<Status> {
    const task = this.busy ? this.last : await this.query();
    if (this.binding.source && !this.inspection && !this.binding.started) this.inspection = await this.worker.call('inspect', { source: this.binding.source });
    return {
      busy: this.busy, sourceName: this.binding.source ? path.basename(this.binding.source) : null,
      destinationName: this.binding.destination ? path.basename(this.binding.destination) : null,
      inspection: this.inspection ? { counts: this.inspection.counts, warnings: this.inspection.warnings } : null, started: this.binding.started,
      task: task ? { status: task.status, progress: task.progress, issues: task.issues, targetChanged: task.targetChanged === true, descriptorChanged: task.descriptorChanged === true } : null,
    };
  }
  async exclusive<T>(action: () => Promise<T>): Promise<T> {
    if (this.busy) fail('BUSY', '当前操作仍在进行，请稍候或查询状态。');
    this.busy = true;
    try { return await action(); } finally { this.busy = false; }
  }
  async chooseBackup() {
    return this.exclusive(async () => {
      const task = await this.query();
      if (task && task.status !== 'committed') fail('IMPORT_IN_PROGRESS', '请先继续当前导入；原目标与备份绑定会保留。');
      const source = await this.dialogs.backup();
      if (!source) return;
      const inspection = await this.worker.call('inspect', { source });
      const next = { ...emptyBinding(), source, sourceHash: inspection.source.sha256 };
      await this.store.save(next); this.binding = next; this.inspection = inspection; this.last = null;
    });
  }
  async chooseDestination() {
    return this.exclusive(async () => {
      if (!this.binding.source) fail('NO_BACKUP', '请先选择旧备份并完成预检。');
      if (await this.query()) fail('TARGET_FIXED', '已接受的导入会继续使用原目标目录。');
      const destination = await this.dialogs.destination(path.join(this.documents, 'Nova 内容库'));
      if (!destination) return;
      const next = { ...this.binding, destination, started: false };
      await this.store.save(next); this.binding = next;
    });
  }
  async importBackup() {
    return this.exclusive(async () => {
      if (!this.binding.source || !this.binding.destination) fail('NOT_READY', '请先选择备份与新内容库位置。');
      const previous = await this.query();
      if (previous) return this.continueTask(previous);
      const inspection = await this.worker.call('inspect', { source: this.binding.source });
      if (inspection.source.sha256 !== this.binding.sourceHash) fail('SOURCE_CHANGED', '旧备份已改变，请重新选择并预检。');
      const next = { ...this.binding, started: true };
      await this.store.save(next); this.binding = next;
      try { await this.worker.call('import', { source: next.source!, destination: next.destination!, expectedSourceHash: next.sourceHash! }); }
      finally { await this.query(); }
    });
  }
  async continueTask(task: ImportTask) {
    if (task.targetChanged) fail('TARGET_CHANGED', '内容库位置已被替换，请恢复原目录后继续。');
    if (task.status !== 'committed') {
      try { await this.worker.call('resume', { destination: this.binding.destination!, importId: this.binding.importId! }); }
      finally { await this.query(); }
    }
  }
  async resumeImport() {
    return this.exclusive(async () => {
      const task = await this.query();
      if (!task) fail('IMPORT_NOT_STARTED', '导入尚未接受，可以再次点击“导入并打开”。');
      await this.continueTask(task);
    });
  }
  async listContents() {
    return this.exclusive(async () => {
      const task = await this.query();
      if (task?.status !== 'committed' || task.targetChanged) fail('LIBRARY_NOT_READY', '原内容库尚未完成导入或位置已改变。');
      return this.worker.call('list', { destination: this.binding.destination!, libraryId: this.binding.libraryId! });
    });
  }
}
