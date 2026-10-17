export interface Issue { code: string; key?: string; status?: string }
export interface Counts { contents: number; collections: number; templates: number; photos: number; prompts: number; publications: number; trash: number }
export interface Inspection { source: { sha256: string }; counts: Counts; warnings: { code: string; message: string }[] }
export type TaskStatus = 'prepared' | 'running' | 'blocked' | 'ready' | 'publishing' | 'committed';
export interface TaskView { status: TaskStatus; progress: { steps: number }; issues: Issue[]; targetChanged?: boolean; descriptorChanged?: boolean }
export interface ImportTask extends TaskView { importId: string; sourceHash: string; libraryId?: string }
export interface Content { id: string; title: string; body: string }
export interface Status { busy: boolean; sourceName: string | null; destinationName: string | null; inspection: Pick<Inspection, 'counts' | 'warnings'> | null; started: boolean; task: TaskView | null }
export interface DesktopResults { status: Status; chooseBackup: void; chooseDestination: void; importBackup: void; resumeImport: void; listContents: Content[] }
export type DesktopMethod = keyof DesktopResults;
export type Reply<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string } };
export type ContentHub = { [K in DesktopMethod]: () => Promise<Reply<DesktopResults[K]>> };
export interface Binding { version: 1; source: string | null; sourceHash: string | null; destination: string | null; started: boolean; importId: string | null; libraryId: string | null }
export interface WorkerOperations {
  inspect: { args: { source: string }; result: Inspection };
  query: { args: { destination: string; importId: string | null }; result: ImportTask | null };
  import: { args: { source: string; destination: string; expectedSourceHash: string }; result: ImportTask };
  resume: { args: { destination: string; importId: string }; result: ImportTask };
  list: { args: { destination: string; libraryId: string }; result: Content[] };
}
export type WorkerOperation = keyof WorkerOperations;
export interface Worker { call<K extends WorkerOperation>(op: K, args: WorkerOperations[K]['args']): Promise<WorkerOperations[K]['result']> }
export interface Dialogs { backup(): Promise<string | null>; destination(defaultPath: string): Promise<string | null> }
export interface RendererResource { file: string; mime: string }
export interface RendererResources { format: 'nova-desktop-renderer-resources'; schemaVersion: 1; entries: Record<string, RendererResource> }
export interface BuildConfig { AUTH_MODE: 'required' | 'disabled'; appScope: 'nova-content-hub'; productId: 'nova-content-hub'; protocolVersion: 1; prototype: true; version: string }
export interface Release extends BuildConfig { format: 'nova-content-desktop-release'; schemaVersion: 1; pairId: string; experimental: true; productionReady: false; platform: 'darwin' | 'linux' | 'win32'; arch: 'arm64' | 'x64' }
export const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
export function errorInfo(error: unknown): { code: string; message: string } {
  return { code: isRecord(error) && typeof error.code === 'string' ? error.code : 'IO_ERROR', message: error instanceof Error ? error.message : '操作未完成，请查询并继续。' };
}
