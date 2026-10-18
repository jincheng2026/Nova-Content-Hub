import {Covers} from './covers.mts';
import {TemplateController} from './template-controller.mts';
import type {TemplateCallbacks} from './template-controller.mts';
import type {TemplateStart, TemplateReference, TemplateAccept} from '../shared/template-contracts.ts';
import {WorkspaceController} from './workspace-controller.mts';
import {Maintenance} from './maintenance-controller.mts';
import {readPromptDocument} from './document-import.mts';
import type {CoverStart, CoverReference, Assistant} from '../shared/cover-contracts.ts';
import type {WorkspaceMutation, WorkspaceMaterialReference} from '../shared/workspace-contracts.ts';
import type {LocalPreferences} from '../shared/preferences-contracts.ts';
import type {SetupInputs} from '../shared/setup-contracts.ts';
import type {Preferences} from './preferences.mts';
import type {Reminders} from './reminders.mts';
import type {Setup} from './setup.mts';
import type {BootstrapRecovery} from './bootstrap-recovery.mts';
import type {BootstrapInputs} from '../shared/bootstrap-contracts.ts';
import type {
    Binding,
    Inspection,
    ImportTask,
    Worker,
    Dialogs,
    Status,
    Mutation,
    Draft,
    Edit,
    ContentRef,
    LibraryBinding,
    PendingView,
    View
} from '../shared/contracts.ts';
import type {BindingStore} from './bindings.mts';
import path from 'node:path';
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {requireWrite, validateInput} from '../shared/validation.ts';
import {emptyBinding} from './bindings.mts';

function fail(code: string, message: string): never {
    throw Object.assign(new Error(message), {code});
}

export interface ControllerServices {
    bootstrap?: Pick<BootstrapRecovery, 'readBootstrapRecovery' | 'resetMachineBinding'>;
    preferences?: Pick<Preferences, 'readPreferences' | 'savePreferences'>;
    reminders?: Pick<Reminders, 'readReminderStatus' | 'testReminder'>;
    setup?: Pick<Setup, 'readSetup' | 'openSetupTarget' | 'copyPluginMarketLocation' | 'exportDiagnostics'>;
}

export class DesktopController {
    async choosePromptDocument() {
        return this.exclusive(async () => {
            const file = await this.dialogs.promptDocument?.();
            return file ? readPromptDocument(file) : null;
        });
    }
    covers: Covers;
    workspace: WorkspaceController;
    templates: TemplateController;
    maintenance: Maintenance;
    services: ControllerServices;
    store: BindingStore;
    worker: Worker;
    dialogs: Dialogs;
    documents: string;
    binding!: Binding;
    inspection: Inspection | null = null;
    busy = false;
    last: ImportTask | null = null;
    creationMissing = false;
    pendingView: PendingView | null = null;
    authMode: 'required' | 'disabled';
    copyText?: (text: string) => void | Promise<void>;
    querying: Promise<ImportTask | null> | null = null;

    constructor({store, worker, dialogs, documents, authMode = 'required', launch, readAssistantSetup, resourceWorker, copyText, services = {}, readTemplateAssistantSetup, launchTemplate}: {
        store: BindingStore;
        worker: Worker;
        dialogs: Dialogs;
        documents: string;
        authMode?: 'required' | 'disabled';
        launch?: Covers['launch'];
        readAssistantSetup?: Covers['setup'];
        resourceWorker?: Worker;
        copyText?: (text: string) => void | Promise<void>;
        readTemplateAssistantSetup?: TemplateCallbacks['readTemplateAssistantSetup'];
        launchTemplate?: TemplateCallbacks['launchTemplate'];
        services?: ControllerServices
    }) {
        this.store = store;
        this.worker = worker;
        this.dialogs = dialogs;
        this.documents = documents;
        this.authMode = authMode;
        this.copyText = copyText;
        this.services = services;
        this.covers = new Covers(this, launch, resourceWorker, readAssistantSetup);
        this.workspace = new WorkspaceController(this);
        this.templates = new TemplateController(this, {readTemplateAssistantSetup: readTemplateAssistantSetup ?? (async host => ({host, ready: false, skill: null, reason: 'unconfigured'})), launchTemplate: launchTemplate ?? (async () => fail('NOT_READY', '当前构建未配置模板助手交接。'))});
        this.maintenance = new Maintenance(this);
    }

    readTemplateAssistantSetup(input?: undefined) { return this.templates.readTemplateAssistantSetup(input); }
    readTemplateWorkflow(input: {templateId: string}) { return this.templates.readTemplateWorkflow(input); }
    startTemplateStudy(input: TemplateStart) { return this.templates.startTemplateStudy(input); }
    continueTemplateStudy(input: TemplateReference) { return this.templates.continueTemplateStudy(input); }
    retryTemplateStudy(input: TemplateReference) { return this.templates.retryTemplateStudy(input); }
    cancelTemplateStudy(input: TemplateReference) { return this.templates.cancelTemplateStudy(input); }
    acceptTemplateStudy(input: TemplateAccept) { return this.templates.acceptTemplateStudy(input); }
    recoverTemplateMutation(input?: undefined) { return this.templates.recoverTemplateMutation(input); }
    retryTemplateMutation(input?: undefined) { return this.templates.retryTemplateMutation(input); }
    abandonTemplateMutation(input?: undefined) { return this.templates.abandonTemplateMutation(input); }

    chooseTemplateImages(input?: undefined) { return this.workspace.chooseTemplateImages(input); }
    chooseContentMaterial(input?: undefined) { return this.workspace.chooseContentMaterial(input); }
    readContentMaterial(input: WorkspaceMaterialReference) { return this.workspace.readContentMaterial(input); }
    exportContentMaterial(input: WorkspaceMaterialReference) { return this.workspace.exportContentMaterial(input); }
    readWorkspaceLibrary(input?: undefined) { return this.workspace.readWorkspaceLibrary(input); }
    mutateWorkspace(input: WorkspaceMutation) { return this.workspace.mutateWorkspace(input); }
    recoverWorkspaceMutation(input?: undefined) { return this.workspace.recoverWorkspaceMutation(input); }
    retryWorkspaceMutation(input?: undefined) { return this.workspace.retryWorkspaceMutation(input); }
    abandonWorkspaceMutation(input?: undefined) { return this.workspace.abandonWorkspaceMutation(input); }
    backupLibrary() { return this.maintenance.backupLibrary(); }
    verifyLibraryBackup() { return this.maintenance.verifyLibraryBackup(); }
    restoreLibraryBackup() { return this.maintenance.restoreLibraryBackup(); }
    readMaintenanceStatus() { return this.maintenance.readMaintenanceStatus(); }
    recoverMaintenance() { return this.maintenance.recoverMaintenance(); }
    abandonMaintenance() { return this.maintenance.abandonMaintenance(); }

    service<K extends keyof ControllerServices>(key: K): NonNullable<ControllerServices[K]> {
        const service = this.services[key];
        if (!service) fail('NOT_READY', '当前桌面环境尚未配置此本机服务，请使用完整桌面应用或重启后重试。');
        return service as NonNullable<ControllerServices[K]>;
    }

    readBootstrapRecovery(input?: undefined) {
        validateInput('readBootstrapRecovery', input);
        return this.exclusive(() => this.service('bootstrap').readBootstrapRecovery(input));
    }
    resetMachineBinding(input: BootstrapInputs['resetMachineBinding']) {
        validateInput('resetMachineBinding', input);
        return this.exclusive(() => this.service('bootstrap').resetMachineBinding(input));
    }

    readPreferences(input?: undefined) {
        validateInput('readPreferences', input);
        return this.service('preferences').readPreferences();
    }
    savePreferences(input: LocalPreferences) {
        validateInput('savePreferences', input);
        return this.exclusive(() => this.service('preferences').savePreferences(input));
    }
    readReminderStatus(input?: undefined) {
        validateInput('readReminderStatus', input);
        return this.service('reminders').readReminderStatus();
    }
    testReminder(input?: undefined) {
        validateInput('testReminder', input);
        return this.exclusive(() => this.service('reminders').testReminder());
    }
    readSetup(input?: undefined) {
        validateInput('readSetup', input);
        return this.exclusive(() => this.service('setup').readSetup());
    }
    openSetupTarget(input: SetupInputs['openSetupTarget']) {
        validateInput('openSetupTarget', input);
        return this.exclusive(() => this.service('setup').openSetupTarget(input));
    }
    copyPluginMarketLocation(input?: undefined) {
        validateInput('copyPluginMarketLocation', input);
        return this.exclusive(() => this.service('setup').copyPluginMarketLocation());
    }
    exportDiagnostics(input?: undefined) {
        validateInput('exportDiagnostics', input);
        return this.exclusive(() => this.service('setup').exportDiagnostics());
    }

    resumeCoverAction() {
        return this.covers.resumeCoverAction();
    }

    abandonCoverAction() {
        return this.covers.abandonCoverAction();
    }

    listCoverAssets() {
        return this.covers.listCoverAssets();
    }

    retryBuiltins() {
        requireWrite(this.authMode);
        return this.exclusive(async () => {
            this.noPending(true);
            this.current();
            const task = await this.query();
            if (this.binding.started && task?.status !== 'committed') fail('IMPORT_IN_PROGRESS', '请先完成或核验当前导入。');
            await this.covers.seed();
        });
    }

    choosePhoto(input: { title: string; isOwnPhoto: boolean }) {
        return this.covers.choosePhoto(input);
    }

    resumePhoto() {
        return this.covers.resumePhoto();
    }

    abandonPhoto() {
        return this.covers.abandonPhoto();
    }

    readCover(input: { contentId: string }) {
        return this.covers.readCover(input);
    }

    generateCover(input: CoverStart) {
        return this.covers.generateCover(input);
    }

    resumeCover() {
        return this.covers.resumeCover();
    }

    abandonCover() {
        return this.covers.abandonCover();
    }

    continueCover(input: CoverReference) {
        return this.covers.continueCover(input);
    }

    retryCover(input: CoverReference) {
        return this.covers.retryCover(input);
    }

    cancelCover(input: CoverReference) {
        return this.covers.cancelCover(input);
    }

    selectCover(input: { contentId: string; candidateId: string; editToken: string }) {
        return this.covers.selectCover(input);
    }

    exportCover(input: { contentId: string; candidateId: string }) {
        return this.covers.exportCover(input);
    }

    setAssistant(input: {host: Assistant}) {
        return this.covers.setAssistant(input);
    }

    readAssistantSetup() {
        return this.covers.readAssistantSetup();
    }

    async initialize() {
        this.binding = await this.store.load();
        if ((this.binding.libraryId || this.binding.started) && this.binding.current === undefined) this.binding.needsReselect = true;
    }

    async query(): Promise<ImportTask | null> {
        if (!this.binding.started) return null;
        if (this.querying) return this.querying;
        this.querying = this.readTask();
        try {
            return await this.querying;
        } finally {
            this.querying = null;
        }
    }

    async readTask() {
        const result = await this.worker.call('query', {
            destination: this.binding.destination!,
            importId: this.binding.importId!
        });
        if (!result) {
            if (this.binding.importId) fail('IMPORT_NOT_FOUND', '已绑定的导入任务不在原位置，已停止；请恢复原目录后查询。');
            return null;
        }
        if (result.sourceHash !== this.binding.sourceHash || (this.binding.importId && result.importId !== this.binding.importId) ||
            (this.binding.libraryId && result.libraryId && result.libraryId !== this.binding.libraryId)) fail('BINDING_CONFLICT', '磁盘任务与已选择的备份或内容库不一致，已停止。');
        const next = {
            ...this.binding,
            importId: result.importId,
            libraryId: result.libraryId ?? this.binding.libraryId
        };
        if (JSON.stringify(next) !== JSON.stringify(this.binding)) {
            await this.store.save(next);
            this.binding = next;
        }
        this.last = result;
        return result;
    }

    async status(): Promise<Status> {
        const task = this.busy ? this.last : await this.query();
        if (this.binding.source && !this.inspection && !this.binding.started) this.inspection = await this.worker.call('inspect', {source: this.binding.source});
        return {
            assistant: this.binding.assistant ?? 'codex', photoPending: !!this.binding.photoPending, coverActionPending: !!this.binding.coverActionPending, coverPending: !!this.binding.coverPending, seedPending: !!this.binding.seedPending,
            workspacePending: this.workspace.view(),
            templatePending: this.templates.view(),
            maintenance: this.maintenance.readMaintenanceStatus(),
        busy: this.busy,
            sourceName: this.binding.source ? path.basename(this.binding.source) : null,
            destinationName: this.binding.destination ? path.basename(this.binding.destination) : null,
            inspection: this.inspection ? {counts: this.inspection.counts, warnings: this.inspection.warnings} : null,
            started: this.binding.started,
            currentName: this.binding.current ? path.basename(this.binding.current.root) : null,
            needsReselect: this.binding.needsReselect === true,
            pending: this.binding.pending ? this.pendingView ?? this.uncertain() : null,
            creating: !!this.binding.creation,
            creationMissing: this.creationMissing,
            task: task ? {
                status: task.status,
                progress: task.progress,
                issues: task.issues,
                targetChanged: task.targetChanged === true,
                descriptorChanged: task.descriptorChanged === true
            } : null,
        };
    }

    async exclusive<T>(action: () => Promise<T>): Promise<T> {
        if (this.busy) fail('BUSY', '当前操作仍在进行，请稍候或查询状态。');
        this.busy = true;
        try {
            return await action();
        } finally {
            this.busy = false;
        }
    }

    async chooseBackup() {
        return this.exclusive(async () => {
            this.noPending();
            const task = await this.query();
            if (task && task.status !== 'committed') fail('IMPORT_IN_PROGRESS', '请先继续当前导入；原目标与备份绑定会保留。');
            const source = await this.dialogs.backup();
            if (!source) return;
            const inspection = await this.worker.call('inspect', {source});
            const next = {
                ...emptyBinding(), assistant: this.binding.assistant,
                current: this.binding.current ?? null,
                source,
                sourceHash: inspection.source.sha256
            };
            await this.store.save(next);
            this.binding = next;
            this.inspection = inspection;
            this.last = null;
        });
    }

    async chooseDestination() {
        return this.exclusive(async () => {
            this.noPending();
            if (!this.binding.source) fail('NO_BACKUP', '请先选择旧备份并完成预检。');
            if (await this.query()) fail('TARGET_FIXED', '已接受的导入会继续使用原目标目录。');
            const destination = await this.dialogs.destination(path.join(this.documents, 'Nova 内容库'));
            if (!destination) return;
            const next = {...this.binding, destination, started: false};
            await this.store.save(next);
            this.binding = next;
        });
    }

    async importBackup() {
        return this.exclusive(async () => {
            this.noPending();
            if (!this.binding.source || !this.binding.destination) fail('NOT_READY', '请先选择备份与新内容库位置。');
            const previous = await this.query();
            if (previous) {
                await this.continueTask(previous);
                await this.bindImported();
                return;
            }
            const inspection = await this.worker.call('inspect', {source: this.binding.source});
            if (inspection.source.sha256 !== this.binding.sourceHash) fail('SOURCE_CHANGED', '旧备份已改变，请重新选择并预检。');
            const next = {...this.binding, started: true};
            await this.store.save(next);
            this.binding = next;
            try {
                await this.worker.call('import', {
                    source: next.source!,
                    destination: next.destination!,
                    expectedSourceHash: next.sourceHash!
                });
            } finally {
                await this.query();
            }
            await this.bindImported();
        });
    }

    async continueTask(task: ImportTask) {
        if (task.targetChanged) fail('TARGET_CHANGED', '内容库位置已被替换，请恢复原目录后继续。');
        if (task.status !== 'committed') {
            try {
                await this.worker.call('resume', {
                    destination: this.binding.destination!,
                    importId: this.binding.importId!
                });
            } finally {
                await this.query();
            }
        }
    }

    async resumeImport() {
        return this.exclusive(async () => {
            this.noPending();
            const task = await this.query();
            if (!task) fail('IMPORT_NOT_STARTED', '导入尚未接受，可以再次点击“导入并打开”。');
            await this.continueTask(task);
            await this.bindImported();
        });
    }

    async persist(next: Binding) {
        await this.store.save(next);
        if (JSON.stringify(next.current) !== JSON.stringify(this.binding.current)) this.covers.revoke(); this.binding = next;
    }

    noPending(allowSeedRetry = false) {
        if (this.binding.pending || this.binding.creation || this.binding.photoPending || this.binding.coverPending || this.binding.coverActionPending || this.binding.workspacePending || this.binding.templatePending || this.binding.maintenancePending || !allowSeedRetry && this.binding.seedPending) fail('PENDING_MUTATION', '操作结果待核实；请先核验当前操作，不能换库或开始第二笔写入。');
    }

    async maySwitch() {
        this.noPending();
        const task = await this.query();
        if (this.binding.started && (!task || task.status !== 'committed')) fail('IMPORT_IN_PROGRESS', '请先核验或完成当前导入。');
    }

    current(): LibraryBinding {
        if (!this.binding.current || this.binding.needsReselect) fail('LIBRARY_NOT_READY', '请明确打开内容库；旧绑定缺少目录身份时必须重新选择。');
        return this.binding.current;
    }

    async bindImported() {
        if (this.last?.status !== 'committed' || this.last.targetChanged || this.binding.needsReselect || this.binding.current?.root === this.binding.destination) return;
        this.noPending();
        const current = await this.worker.call('bind', {
            destination: this.binding.destination!,
            libraryId: this.binding.libraryId!,
            importId: this.binding.importId!
        });
        await this.persist({...this.binding, current});
    if (this.authMode === 'disabled') await this.covers.seed();
    }

    async openLibrary() {
        return this.exclusive(async () => {
            await this.maySwitch();
            const destination = await this.dialogs.library?.();
            if (!destination) return;
            const current = await this.worker.call('bind', {destination, libraryId: null, importId: null});
            await this.persist({...emptyBinding(), assistant: this.binding.assistant, current});
            if (this.authMode === 'disabled') await this.covers.seed();
        });
    }

    async createLibrary() {
        requireWrite(this.authMode);
        return this.exclusive(async () => {
            await this.maySwitch();
            const root = await this.dialogs.destination(path.join(this.documents, 'Nova 新内容库'));
            if (!root) return;
            // Reserve a fresh directory before dispatch; a lost response can only inspect this inode.
            let stat;
            try {
                await fs.mkdir(root, {mode: 0o700});
                stat = await fs.lstat(root, {bigint: true});
            } catch {
                fail('CREATE_RESERVATION_FAILED', '无法预约新内容库目录；请选择尚不存在的新路径，原位置会保留。');
            }
            const creation = {
                root,
                mutationId: randomUUID(),
                rootIdentity: {dev: stat.dev.toString(), ino: stat.ino.toString()}
            };
            await this.persist({...emptyBinding(), assistant: this.binding.assistant, current: this.binding.current ?? null, creation});
            const current = await this.worker.call('createLibrary', creation);
            await this.persist({...emptyBinding(), assistant: this.binding.assistant, current});
            if (this.authMode === 'disabled') await this.covers.seed();
        });
    }

    async listContents(input?: { view: View }) {
        validateInput('listContents', input);
        return this.exclusive(async () => {
            const task = await this.query();
            if (!this.binding.current && task?.status === 'committed' && !task.targetChanged && !this.binding.needsReselect) await this.bindImported();
            if (task?.targetChanged && this.binding.current?.root === this.binding.destination) fail('LIBRARY_NOT_READY', '原内容库位置已改变。');
            return this.worker.call('list', {binding: this.current(), view: input?.view ?? 'active'});
        });
    }

    async copyPrompt(input: { text: string }) {
        validateInput('copyPrompt', input);
        if (!this.copyText) fail('CLIPBOARD_UNAVAILABLE', '当前环境无法复制，请在桌面工作台重试。');
        await this.copyText(input.text);
    }

    async readWorkspace(input?: undefined) {
        validateInput('readWorkspace', input);
        return this.exclusive(async () => {
            const task = await this.query();
            if (!this.binding.current && task?.status === 'committed' && !task.targetChanged && !this.binding.needsReselect) await this.bindImported();
            if (task?.targetChanged && this.binding.current?.root === this.binding.destination) fail('LIBRARY_NOT_READY', '原内容库位置已改变。');
            return this.worker.call('workspace', {binding: this.current()});
        });
    }

    async readContent(input: { id: string }) {
        validateInput('readContent', input);
        return this.exclusive(() => this.worker.call('readContent', {binding: this.current(), id: input.id}));
    }

    uncertain(): PendingView {
        const p = this.binding.pending!;
        return {
            mutationId: p.mutationId,
            op: p.op,
            state: 'uncertain',
            draft: 'title' in p.input ? {title: p.input.title, body: p.input.body} : null,
            current: null
        };
    }

    async write(request: Mutation) {
        requireWrite(this.authMode);
        this.noPending();
        this.current();
        const task = await this.query();
        if (this.binding.started && task?.status !== 'committed') fail('IMPORT_IN_PROGRESS', '请先完成或核验当前导入。');
        await this.persist({...this.binding, pending: request});
        this.pendingView = this.uncertain();
        return this.dispatchPending();
    }

    async dispatchPending() {
        const pending = this.binding.pending!;
        try {
            await this.worker.call('mutate', {binding: this.current(), mutation: pending});
            const result = await this.checkPending();
            if (!result?.current) fail('PENDING_MUTATION', '操作已提交，但当前内容读取未完成，请再次核验。');
            return result.current;
        } catch (error) {
            if ((error as { code?: string }).code === 'CONFLICT') this.pendingView = {
                ...this.uncertain(),
                state: 'conflict'
            };
            throw error;
        }
    }

    async createContent(input: Draft) {
        validateInput('createContent', input);
        return this.exclusive(() => this.write({op: 'createContent', input, mutationId: randomUUID()}));
    }

    async updateContent(input: Edit) {
        validateInput('updateContent', input);
        return this.exclusive(() => this.write({op: 'updateContent', input, mutationId: randomUUID()}));
    }

    async trashContent(input: ContentRef) {
        validateInput('trashContent', input);
        return this.exclusive(() => this.write({op: 'trashContent', input, mutationId: randomUUID()}));
    }

    async restoreContent(input: ContentRef) {
        validateInput('restoreContent', input);
        return this.exclusive(() => this.write({op: 'restoreContent', input, mutationId: randomUUID()}));
    }

    async checkPending(clearCommitted = true): Promise<PendingView | null> {
        const pending = this.binding.pending;
        if (!pending) return null;
        this.pendingView = this.uncertain();
        const found = await this.worker.call('queryMutation', {
            binding: this.current(),
            mutationId: pending.mutationId
        });
        if (!found) {
            let current = null;
            if ('id' in pending.input) current = await this.worker.call('readContent', {
                binding: this.current(),
                id: pending.input.id
            });
            const state = current && 'editToken' in pending.input && current.editToken !== pending.input.editToken ? 'conflict' : 'missing';
            return this.pendingView = {...this.uncertain(), state, current};
        }
        // Historical receipts identify the object only; always reread today's version.
        const current = await this.worker.call('readContent', {binding: this.current(), id: found.objectId});
        const result: PendingView = {...this.uncertain(), state: 'committed', current};
        if (clearCommitted) {
            await this.persist({...this.binding, pending: null});
            this.pendingView = null;
        } else this.pendingView = result;
        return result;
    }

    async queryPendingMutation() {
        return this.exclusive(async () => {
            if (this.binding.creation) {
                this.creationMissing = false;
                const current = await this.worker.call('queryCreation', this.binding.creation);
                if (!current) {
                    this.creationMissing = true;
                    return null;
                }
                await this.persist({...emptyBinding(), assistant: this.binding.assistant, current});
                if (this.authMode === 'disabled') await this.covers.seed();
                this.creationMissing = false;
            }
            return this.checkPending();
        });
    }

    async retryPendingMutation() {
        requireWrite(this.authMode);
        return this.exclusive(async () => {
            if (this.binding.creation) {
                this.creationMissing = false;
                const reservation = this.binding.creation;
                const found = await this.worker.call('queryCreation', reservation);
                const current = found ?? await this.worker.call('createLibrary', reservation);
                await this.persist({...emptyBinding(), assistant: this.binding.assistant, current});
                if (this.authMode === 'disabled') await this.covers.seed();
                this.creationMissing = false;
                return null;
            }
            if (!this.binding.pending) fail('NO_PENDING', '没有待核验的内容操作。');
            const result = await this.checkPending();
            if (result?.state === 'committed' && result.current) return result.current;
            if (result?.state !== 'missing') fail('CONFLICT', '磁盘内容已变化，请比较并保留草稿。');
            return this.dispatchPending();
        });
    }

    async resolvePendingMutation(input: { action: 'keep' | 'saveAs' | 'discard' }) {
        validateInput('resolvePendingMutation', input);
        if (input.action === 'saveAs') requireWrite(this.authMode);
        return this.exclusive(async () => {
            if (this.binding.creation) {
                if (input.action !== 'discard') fail('INVALID_STATE', '请核验固定的新库位置，或明确放弃这次创建并保留目录。');
                await this.persist({...this.binding, creation: null});
                this.creationMissing = false;
                return null;
            }
            const result = await this.checkPending(input.action === 'discard');
            if (!result) return null;
            if (result.state === 'committed' && input.action !== 'saveAs') return result.current;
            if (input.action === 'keep') return result.current;
            const draft = result.draft;
            if (input.action === 'saveAs') {
                if (!draft) fail('INVALID_STATE', '此操作没有可另存的正文草稿。');
                // Replace the old pending record atomically before dispatching the explicit save-as.
                await this.persist({
                    ...this.binding,
                    pending: {op: 'createContent', input: draft, mutationId: randomUUID()}
                });
                this.pendingView = this.uncertain();
                return this.dispatchPending();
            }
            await this.persist({...this.binding, pending: null});
            this.pendingView = null;
            return result.current;
        });
    }
}
