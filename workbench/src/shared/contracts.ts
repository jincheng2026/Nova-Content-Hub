import type {LocalFileKind, LocalFileResults, PhotoImportOptions} from './local-files.ts';
import type {CoverInputs, CoverResults, CoverWorkerOperations, CoverPending, PhotoPending, CoverActionPending, Assistant} from './cover-contracts.ts';
import type {WorkspaceInputs, WorkspaceResults, WorkspaceWorkerOperations, WorkspacePending, WorkspacePendingView} from './workspace-contracts.ts';
import type {MaintenanceInputs, MaintenanceResults, MaintenanceWorkerOperations, MaintenancePending, MaintenanceStatus} from './maintenance-contracts.ts';
import type {PreferencesInputs, PreferencesResults} from './preferences-contracts.ts';
import type {TemplateInputs, TemplateResults, TemplateWorkerOperations, TemplatePending, TemplatePendingView} from './template-contracts.ts';
import type {BootstrapInputs, BootstrapResults} from './bootstrap-contracts.ts';
import type {SetupInputs, SetupResults} from './setup-contracts.ts';
export interface Issue {
    code: string;
    key?: string;
    status?: string
}

export interface Counts {
    contents: number;
    collections: number;
    templates: number;
    photos: number;
    prompts: number;
    publications: number;
    trash: number
}

export interface Inspection {
    source: { sha256: string };
    counts: Counts;
    warnings: { code: string; message: string }[]
}

export type TaskStatus = 'prepared' | 'running' | 'blocked' | 'ready' | 'publishing' | 'committed';

export interface TaskView {
    status: TaskStatus;
    progress: { steps: number };
    issues: Issue[];
    targetChanged?: boolean;
    descriptorChanged?: boolean
}

export interface ImportTask extends TaskView {
    importId: string;
    sourceHash: string;
    libraryId?: string
}

export interface Content {
    id: string;
    title: string;
    body: string;
    editToken: string;
    deletedAt: string | null
}

export interface WorkspacePlan {
    id: string;
    channelId: string;
    status: 'planned' | 'cancelled' | 'published';
    schedule: { precision: 'date'; date: string } | { precision: 'instant'; at: string; timezone: string } | { precision: 'local-minute'; date: string; time: string; timezone: string | null }
}

export interface WorkspaceContent extends Content {
    createdAt: string;
    updatedAt: string;
    plans: WorkspacePlan[];
    candidateCount: number;
    selectedCandidateId: string | null
}

export interface WorkspacePrompt {
    id: string;
    title: string;
    body: string;
    category: string;
    summary: string;
    when: string;
    tags: string[];
    enabled: boolean;
    favorite: boolean;
    editToken: string
}

export interface WorkspaceSnapshot {
    contents: WorkspaceContent[];
    prompts: WorkspacePrompt[];
    channels: { id: string; name: string; enabled: boolean }[]
}

export interface Draft {
    title: string;
    body: string
}

export interface Edit extends Draft {
    id: string;
    editToken: string
}

export interface ContentRef {
    id: string;
    editToken: string
}

export type View = 'active' | 'trash';

export interface RootIdentity {
    dev: string;
    ino: string
}

export interface LibraryBinding {
    root: string;
    libraryId: string;
    rootIdentity: RootIdentity
}

export type Mutation = { mutationId: string } & ({ op: 'createContent'; input: Draft } | {
    op: 'updateContent';
    input: Edit
} | { op: 'trashContent' | 'restoreContent'; input: ContentRef });

export interface PendingView {
    mutationId: string;
    state: 'uncertain' | 'missing' | 'conflict' | 'committed';
    op: Mutation['op'];
    draft: Draft | null;
    current: Content | null
}

export interface Status {
    busy: boolean;
    sourceName: string | null;
    destinationName: string | null;
    inspection: Pick<Inspection, 'counts' | 'warnings'> | null;
    started: boolean;
    task: TaskView | null;
    currentName: string | null;
    needsReselect: boolean;
    pending: PendingView | null;
    creating: boolean;
    creationMissing: boolean;
    assistant: Assistant;
    photoPending: boolean;
    coverActionPending: boolean;
    coverPending: boolean;
    seedPending: boolean;
    workspacePending: WorkspacePendingView | null;
    templatePending: TemplatePendingView | null;
    maintenance: MaintenanceStatus
}

export interface DesktopInputs extends CoverInputs, WorkspaceInputs, MaintenanceInputs, PreferencesInputs, SetupInputs, BootstrapInputs, TemplateInputs {
    choosePromptDocument: undefined;
    status: undefined;
    chooseBackup: undefined;
    chooseDestination: undefined;
    importBackup: undefined;
    resumeImport: undefined;
    listContents: { view: View } | undefined;
    readWorkspace: undefined;
    copyPrompt: { text: string };
    createLibrary: undefined;
    openLibrary: undefined;
    readContent: { id: string };
    createContent: Draft;
    updateContent: Edit;
    trashContent: ContentRef;
    restoreContent: ContentRef;
    queryPendingMutation: undefined;
    retryPendingMutation: undefined;
    resolvePendingMutation: { action: 'keep' | 'saveAs' | 'discard' }
}

export interface DesktopResults extends CoverResults, WorkspaceResults, MaintenanceResults, PreferencesResults, SetupResults, BootstrapResults, TemplateResults {
    choosePromptDocument: {title: string; body: string} | null;
    status: Status;
    chooseBackup: void;
    chooseDestination: void;
    importBackup: void;
    resumeImport: void;
    listContents: Content[];
    readWorkspace: WorkspaceSnapshot;
    copyPrompt: void;
    createLibrary: void;
    openLibrary: void;
    readContent: Content;
    createContent: Content;
    updateContent: Content;
    trashContent: Content;
    restoreContent: Content;
    queryPendingMutation: PendingView | null;
    retryPendingMutation: Content | null;
    resolvePendingMutation: Content | null
}

export type DesktopMethod = keyof DesktopResults;
export type Reply<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string } };
export type WorkspaceChange = 'changed' | 'unavailable';
export type ContentHub = { [K in DesktopMethod]: (input?: DesktopInputs[K]) => Promise<Reply<DesktopResults[K]>> } & {
    importLocalFiles<K extends LocalFileKind>(kind: K, files: File[], photo?: PhotoImportOptions): Promise<Reply<LocalFileResults[K]>>;
    onWorkspaceChanged(listener: (change: WorkspaceChange) => void): () => void;
};

export interface Binding {
    version: 1;
    source: string | null;
    sourceHash: string | null;
    destination: string | null;
    started: boolean;
    importId: string | null;
    libraryId: string | null;
    assistant?: Assistant;
    photoPending?: PhotoPending | null;
    coverActionPending?: CoverActionPending | null;
    coverPending?: CoverPending | null;
    workspacePending?: WorkspacePending | null;
    templatePending?: TemplatePending | null;
    maintenancePending?: MaintenancePending | null;
    seedPending?: boolean;
    current?: LibraryBinding | null;
    pending?: Mutation | null;
    creation?: { root: string; rootIdentity: RootIdentity; mutationId: string } | null;
    needsReselect?: boolean
}

export interface WorkerOperations extends CoverWorkerOperations, WorkspaceWorkerOperations, MaintenanceWorkerOperations, TemplateWorkerOperations {
    inspect: { args: { source: string }; result: Inspection };
    query: { args: { destination: string; importId: string | null }; result: ImportTask | null };
    import: { args: { source: string; destination: string; expectedSourceHash: string }; result: ImportTask };
    resume: { args: { destination: string; importId: string }; result: ImportTask };
    bind: { args: { destination: string; libraryId: string | null; importId: string | null }; result: LibraryBinding };
    createLibrary: { args: { root: string; rootIdentity: RootIdentity; mutationId: string }; result: LibraryBinding };
    queryCreation: {
        args: { root: string; rootIdentity: RootIdentity; mutationId: string };
        result: LibraryBinding | null
    };
    workspace: { args: { binding: LibraryBinding }; result: WorkspaceSnapshot };
    list: { args: { binding: LibraryBinding; view: View }; result: Content[] };
    readContent: { args: { binding: LibraryBinding; id: string }; result: Content };
    mutate: { args: { binding: LibraryBinding; mutation: Mutation }; result: Content };
    queryMutation: { args: { binding: LibraryBinding; mutationId: string }; result: { objectId: string } | null };
}

export type WorkerOperation = keyof WorkerOperations;

export interface Worker {
    call<K extends WorkerOperation>(op: K, args: WorkerOperations[K]['args']): Promise<WorkerOperations[K]['result']>
}

export interface Dialogs {
    promptDocument?(): Promise<string | null>;
    templateImages?(): Promise<string[] | null>;
    material?(): Promise<string | null>;
    maintenanceParent?(): Promise<string | null>;
    legacyLibrary?(): Promise<string | null>;
    libraryBackup?(): Promise<string | null>;
    backup(): Promise<string | null>;

    destination(defaultPath: string): Promise<string | null>;

    library?(): Promise<string | null>;

    photo?(): Promise<string | null>;

    export?(defaultName: string): Promise<string | null>
}

export interface RendererResource {
    file: string;
    mime: string
}

export interface RendererResources {
    format: 'nova-desktop-renderer-resources';
    schemaVersion: 1;
    entries: Record<string, RendererResource>
}

export interface BuildConfig {
    AUTH_MODE: 'required' | 'disabled';
    appScope: 'nova-content-hub';
    productId: 'nova-content-hub';
    protocolVersion: 1;
    prototype: true;
    version: string
}

export interface Release extends BuildConfig {
    format: 'nova-content-desktop-release';
    schemaVersion: 1;
    pairId: string;
    experimental: true;
    productionReady: false;
    platform: 'darwin' | 'linux' | 'win32';
    arch: 'arm64' | 'x64'
}

export const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export function errorInfo(error: unknown): { code: string; message: string } {
    return {
        code: isRecord(error) && typeof error.code === 'string' ? error.code : 'IO_ERROR',
        message: error instanceof Error ? error.message : '操作未完成，请查询并继续。'
    };
}
