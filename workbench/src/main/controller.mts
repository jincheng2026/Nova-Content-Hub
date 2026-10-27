import {PublicationController} from './publication-controller.mts';
import type {PublicationMutation} from '../shared/publication-runtime-contracts.ts';
import {StageController} from './stage-controller.mts';
import type {StageInputs} from '../shared/stage-contracts.ts';
import {VaultController} from './vault-controller.mts';
import {CreationController} from './creation-controller.mts';
import type {CreationInputs} from '../shared/creation-contracts.ts';
import type {VaultInputs} from '../shared/vault-contracts.ts';
import type {ServiceSettingsView, ServiceSettingsPatch, ServiceReadiness,ServiceCredentialRequest,ServiceCredentialDisclosure} from '../shared/service-contracts.ts';
import {readPlatformCatalog} from './platform-catalog.mts';
import {ProductionController} from './production-controller.mts';
import type {ProductionCallbacks} from './production-controller.mts';
import type {ProductionInputs} from '../shared/production-contracts.ts';
import {validateLocalFiles} from './local-files.mts';
import {Covers} from './covers.mts';
import {TemplateController} from './template-controller.mts';
import type {TemplateCallbacks} from './template-controller.mts';
import type {TemplateStart, TemplateReference, TemplateAccept} from '../shared/template-contracts.ts';
import {WorkspaceController} from './workspace-controller.mts';
import {Maintenance} from './maintenance-controller.mts';
import {readPromptDocument} from './document-import.mts';
import type {CoverStart, CoverReference, Assistant} from '../shared/cover-contracts.ts';
import type {WorkspaceMutation, CoverCandidateUpdate, PromptFavoriteUpdate, WorkspaceMaterialReference, WorkspacePublicationReference} from '../shared/workspace-contracts.ts';
import type {LocalPreferences} from '../shared/preferences-contracts.ts';
import type {SetupInputs} from '../shared/setup-contracts.ts';
import type {Preferences} from './preferences.mts';
import type {Reminders} from './reminders.mts';
import type {Setup} from './setup.mts';
import type {BootstrapRecovery} from './bootstrap-recovery.mts';
import type {BootstrapInputs} from '../shared/bootstrap-contracts.ts';
import type {
    Binding,
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
    productionServices?: {readServiceSettings(): ServiceSettingsView | Promise<ServiceSettingsView>; saveServiceSettings(input: ServiceSettingsPatch): Promise<ServiceSettingsView>; revealServiceCredential(input:ServiceCredentialRequest):ServiceCredentialDisclosure|Promise<ServiceCredentialDisclosure>; checkServiceReadiness(): Promise<ServiceReadiness>};
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
    async importLocalFiles(input: unknown) {
        requireWrite(this.authMode);
        const selection = await validateLocalFiles(input);
        if (selection.kind === 'template') return this.workspace.chooseTemplateImages(undefined, selection.sources);
        if (selection.kind === 'material') return this.workspace.chooseContentMaterial(undefined, selection.sources[0]);
        return this.covers.choosePhoto(selection.photo!, selection.sources[0]);
    }
    production: ProductionController;
    publicationRuntime: PublicationController;
    stages: StageController;
    covers: Covers;
    workspace: WorkspaceController;
    vault: VaultController;
    creation: CreationController;
    displayRoot: {bindingRoot:string;root:string}|null = null;
    templates: TemplateController;
    maintenance: Maintenance;
    services: ControllerServices;
    store: BindingStore;
    worker: Worker;
    dialogs: Dialogs;
    documents: string;
    binding!: Binding;
    busy = false;
    creationMissing = false;
    pendingView: PendingView | null = null;
    authMode: 'required' | 'disabled';
    copyText?: (text: string) => void | Promise<void>;
    openPublicationURL?: (url: string) => Promise<void>;
    revealFolder?: (root: string) => void;

    constructor({store, worker, dialogs, documents, authMode = 'required', launch, readAssistantSetup, resourceWorker, copyText, openPublicationURL, revealFolder, services = {}, readTemplateAssistantSetup, launchTemplate, productionCallbacks}: {
        productionCallbacks?: ProductionCallbacks;
        store: BindingStore;
        worker: Worker;
        dialogs: Dialogs;
        documents: string;
        authMode?: 'required' | 'disabled';
        launch?: Covers['launch'];
        readAssistantSetup?: Covers['setup'];
        resourceWorker?: Worker;
        copyText?: (text: string) => void | Promise<void>;
        openPublicationURL?: (url: string) => Promise<void>;
        revealFolder?: (root: string) => void;
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
        this.openPublicationURL = openPublicationURL;
        this.revealFolder = revealFolder;
        this.services = services;
        this.production = new ProductionController(this, productionCallbacks ?? {launch: async () => fail('NOT_READY', '助手尚未配置。'), open: async () => fail('NOT_READY', '本地创作页尚未配置。'), serviceSettings: async () => fail('NOT_READY', '服务尚未配置。')});
        this.covers = new Covers(this, launch, resourceWorker, readAssistantSetup);
        this.workspace = new WorkspaceController(this);
        this.vault = new VaultController(this);
        this.publicationRuntime = new PublicationController(this);
        this.stages = new StageController(this);
        this.creation = new CreationController(this);
        this.templates = new TemplateController(this, {readTemplateAssistantSetup: readTemplateAssistantSetup ?? (async host => ({host, ready: false, skill: null, reason: 'unconfigured'})), launchTemplate: launchTemplate ?? (async () => fail('NOT_READY', '当前构建未配置模板助手交接。'))});
        this.maintenance = new Maintenance(this);
    }

    readJinchengPublication(input:{contentId:string}){return this.publicationRuntime.read(input);}
    mutateJinchengPublication(input:PublicationMutation){return this.publicationRuntime.mutate(input);}
    confirmJinchengCheckpoint(input:StageInputs['confirmJinchengCheckpoint']){return this.stages.run('confirmJinchengCheckpoint',input);}
    saveJinchengAuthorAnalysis(input:StageInputs['saveJinchengAuthorAnalysis']){return this.stages.run('saveJinchengAuthorAnalysis',input);}
    readVault(input?:undefined){return this.vault.readVault(input);}
    openCreationPage(input:CreationInputs['openCreationPage']){return this.creation.openCreationPage(input);}
    creationPageRequest(input:CreationInputs['creationPageRequest']){return this.creation.creationPageRequest(input);}
    closeCreationPage(input:CreationInputs['closeCreationPage']){return this.creation.closeCreationPage(input);}
    readVaultContentSource(input:VaultInputs['readVaultContentSource']){return this.vault.readVaultContentSource(input);}
    readVaultWorkContext(input:VaultInputs['readVaultWorkContext']){return this.vault.readVaultWorkContext(input);}
    readVaultWorkDirectory(input?:undefined){return this.vault.readVaultWorkDirectory(input);}
    readVaultTopicMenus(input?:undefined){return this.vault.readVaultTopicMenus(input);}
    readVaultSources(input?:undefined){return this.vault.readVaultSources(input);}
    chooseVaultSource(input:VaultInputs['chooseVaultSource']){return this.vault.chooseVaultSource(input);}
    openVaultSourcePage(input:VaultInputs['openVaultSourcePage']){return this.vault.openVaultSourcePage(input);}
    adoptVaultTopic(input:VaultInputs['adoptVaultTopic']){return this.vault.adoptVaultTopic(input);}
    selectVaultCurrentWork(input:VaultInputs['selectVaultCurrentWork']){return this.vault.selectVaultCurrentWork(input);}
    revealVaultContentDirectory(input:VaultInputs['revealVaultContentDirectory']){return this.vault.revealVaultContentDirectory(input);}
    readVaultDocument(input:VaultInputs['readVaultDocument']){return this.vault.readVaultDocument(input);}
    saveVaultDocument(input:VaultInputs['saveVaultDocument']){return this.vault.saveVaultDocument(input);}
    createVaultWorkingDraft(input:VaultInputs['createVaultWorkingDraft']){return this.vault.createVaultWorkingDraft(input);}
    createVaultDocument(input:VaultInputs['createVaultDocument']){return this.vault.createVaultDocument(input);}
    trashVaultDocument(input:VaultInputs['trashVaultDocument']){return this.vault.trashVaultDocument(input);}
    revealVaultDocument(input:VaultInputs['revealVaultDocument']){return this.vault.revealVaultDocument(input);}
    recoverVaultMutation(input:VaultInputs['recoverVaultMutation']){return this.vault.recoverVaultMutation(input);}

    readServiceSettings(input?: undefined) { validateInput('readServiceSettings', input); return this.service('productionServices').readServiceSettings(); }
    revealServiceCredential(input:ServiceCredentialRequest) {validateInput('revealServiceCredential',input);return this.exclusive(()=>Promise.resolve(this.service('productionServices').revealServiceCredential(input)));}
    saveServiceSettings(input: ServiceSettingsPatch) { validateInput('saveServiceSettings', input); return this.exclusive(() => this.service('productionServices').saveServiceSettings(input)); }
    checkServiceReadiness(input?: undefined) { validateInput('checkServiceReadiness', input); return this.exclusive(() => this.service('productionServices').checkServiceReadiness()); }
    readPlatformCatalog(input?: undefined) { this.production.validate('readPlatformCatalog', input); return readPlatformCatalog(); }
    createRadarTask(input: ProductionInputs['createRadarTask']) { return this.production.createRadarTask(input); }
    adoptRadarResult(input: ProductionInputs['adoptRadarResult']) { return this.production.adoptRadarResult(input); }
    decideRadarCandidate(input: ProductionInputs['decideRadarCandidate']) { return this.production.decideRadarCandidate(input); }
    openRadarSource(input: ProductionInputs['openRadarSource']) { return this.production.openRadarSource(input); }
    readProduction(input?: undefined) { return this.production.readProduction(input); }
    mutateProduction(input: ProductionInputs['mutateProduction']) { return this.production.mutateProduction(input); }
    startProductionTask(input: ProductionInputs['startProductionTask']) { return this.production.startProductionTask(input); }
    openProductionTask(input: ProductionInputs['openProductionTask']) { return this.production.openProductionTask(input); }
    actProductionTask(input: ProductionInputs['actProductionTask']) { return this.production.actProductionTask(input); }
    openProductionLink(input: ProductionInputs['openProductionLink']) { return this.production.openProductionLink(input); }
    chooseProductionFiles(input: ProductionInputs['chooseProductionFiles']) { return this.production.chooseProductionFiles(input); }
    readProductionCreation(input: ProductionInputs['readProductionCreation']) { return this.production.readProductionCreation(input); }
    saveProductionDraft(input: ProductionInputs['saveProductionDraft']) { return this.production.saveProductionDraft(input); }
    readProductionPending(input?: undefined) { return this.production.readProductionPending(input); }
    recoverProductionPending(input: ProductionInputs['recoverProductionPending']) { return this.production.recoverProductionPending(input); }

    readTemplateAssistantSetup(input?: undefined) { return this.templates.readTemplateAssistantSetup(input); }
    readTemplateProgress(input: {templateId: string}) { return this.templates.readTemplateProgress(input); }
    continueBoundTemplate(input: TemplateReference) { return this.templates.continueBoundTemplate(input); }
    readTemplateWorkflow(input: {templateId: string}) { return this.templates.readTemplateWorkflow(input); }
    startTemplateStudy(input: TemplateStart) { return this.templates.startTemplateStudy(input); }
    continueTemplateStudy(input: TemplateReference) { return this.templates.continueTemplateStudy(input); }
    retryTemplateStudy(input: TemplateReference) { return this.templates.retryTemplateStudy(input); }
    cancelTemplateStudy(input: TemplateReference) { return this.templates.cancelTemplateStudy(input); }
    acceptTemplateStudy(input: TemplateAccept) { return this.templates.acceptTemplateStudy(input); }
    recoverTemplateMutation(input?: undefined) { return this.templates.recoverTemplateMutation(input); }
    retryTemplateMutation(input?: undefined) { return this.templates.retryTemplateMutation(input); }
    abandonTemplateMutation(input?: undefined) { return this.templates.abandonTemplateMutation(input); }

    chooseTemplateFolder(input?: undefined) { return this.workspace.chooseTemplateFolder(input); }
    revealTemplateFolder(input: {templateId: string}) { return this.workspace.revealTemplateFolder(input); }
    chooseTemplateImages(input?: undefined) { return this.workspace.chooseTemplateImages(input); }
    chooseContentMaterial(input?: undefined) { return this.workspace.chooseContentMaterial(input); }
    readContentMaterial(input: WorkspaceMaterialReference) { return this.workspace.readContentMaterial(input); }
    exportContentMaterial(input: WorkspaceMaterialReference) { return this.workspace.exportContentMaterial(input); }
    readWorkspaceContent(input: {id: string}) { return this.workspace.readWorkspaceContent(input); }
    readWorkspaceLibrary(input?: undefined) { return this.workspace.readWorkspaceLibrary(input); }
    openPublicationLink(input: WorkspacePublicationReference) { return this.workspace.openPublicationLink(input); }
    revealLibraryFolder(input?: undefined) { return this.workspace.revealLibraryFolder(input); }
    updateCoverCandidate(input: CoverCandidateUpdate) { return this.workspace.updateCoverCandidate(input); }
    updatePromptFavorite(input: PromptFavoriteUpdate) { return this.workspace.updatePromptFavorite(input); }
    mutateWorkspace(input: WorkspaceMutation) { return this.workspace.mutateWorkspace(input); }
    recoverWorkspaceMutation(input?: undefined) { return this.workspace.recoverWorkspaceMutation(input); }
    retryWorkspaceMutation(input?: undefined) { return this.workspace.retryWorkspaceMutation(input); }
    abandonWorkspaceMutation(input?: undefined) { return this.workspace.abandonWorkspaceMutation(input); }
    backupLibrary() { return this.maintenance.backupLibrary(); }
    verifyLibraryBackup() { return this.maintenance.verifyLibraryBackup(); }
    restoreLibraryBackup() { return this.maintenance.restoreLibraryBackup(); }
    inspectLibraryHealth(input?: undefined) { validateInput('inspectLibraryHealth', input); return this.maintenance.inspectLibraryHealth(); }
    readMaintenanceStatus() { return this.maintenance.readMaintenanceStatus(); }
    recoverMaintenance() { return this.maintenance.recoverMaintenance(); }
    abandonMaintenance() { return this.maintenance.abandonMaintenance(); }
    prepareLibraryUpgrade() { return this.maintenance.prepareLibraryUpgrade(); }
    cancelLibraryUpgrade() { return this.maintenance.cancelLibraryUpgrade(); }
    confirmLibraryUpgrade() { return this.maintenance.confirmLibraryUpgrade(); }
    queryLibraryUpgrade() { return this.maintenance.queryLibraryUpgrade(); }
    continueLibraryUpgrade() { return this.maintenance.continueLibraryUpgrade(); }
    openUpgradedLibrary() { return this.maintenance.openUpgradedLibrary(); }

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

    readCoverProgress(input: {contentId: string}) { return this.covers.readCoverProgress(input); }
    continueBoundCover(input: CoverReference) { return this.covers.continueBoundCover(input); }
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

    revealCoverFolder(input: {contentId: string}) { return this.covers.revealCoverFolder(input); }
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
        if(this.binding.current){try{const root=await this.worker.call('vaultLocation',{binding:this.binding.current});this.displayRoot={bindingRoot:this.binding.current.root,root};}catch{/* Existing recovery paths remain available when the source is unavailable. */}}
        if ((this.binding.libraryId || this.binding.started) && this.binding.current === undefined) this.binding.needsReselect = true;
    }

    async refreshDisplayRoot(binding:LibraryBinding){const root=await this.worker.call('vaultLocation',{binding});this.displayRoot={bindingRoot:binding.root,root};}

    async status(): Promise<Status> {
        return {
            vaultPending: !!this.binding.vaultPending,
            productionPending: !!this.binding.productionPending,
            assistant: this.binding.assistant ?? 'codex', photoPending: !!this.binding.photoPending, coverActionPending: !!this.binding.coverActionPending, coverPending: !!this.binding.coverPending, seedPending: !!this.binding.seedPending,
            workspacePending: this.workspace.view(),
            templatePending: this.templates.view(),
            maintenance: this.maintenance.readMaintenanceStatus(),
        busy: this.busy,
            currentName: this.binding.current ? path.basename(this.displayRoot?.bindingRoot===this.binding.current.root?this.displayRoot.root:this.binding.current.root) : null,
            needsReselect: this.binding.needsReselect === true,
            pending: this.binding.pending ? this.pendingView ?? this.uncertain() : null,
            creating: !!this.binding.creation,
            creationMissing: this.creationMissing,
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

    async persist(next: Binding) {
        await this.store.save(next);
        if (JSON.stringify(next.current) !== JSON.stringify(this.binding.current)) this.covers.revoke(); this.binding = next;
    }

    noPending(allowSeedRetry = false) {
        if (this.binding.vaultPending || this.binding.pending || this.binding.creation || this.binding.photoPending || this.binding.coverPending || this.binding.coverActionPending || this.binding.workspacePending || this.binding.templatePending || this.binding.maintenancePending || this.binding.productionPending || !allowSeedRetry && this.binding.seedPending) fail('PENDING_MUTATION', '操作结果待核实；请先核验当前操作，不能换库或开始第二笔写入。');
    }

    async maySwitch() {
        this.noPending();
    }

    current(): LibraryBinding {
        if (!this.binding.current || this.binding.needsReselect) fail('LIBRARY_NOT_READY', '请明确打开内容库；旧绑定缺少目录身份时必须重新选择。');
        return this.binding.current;
    }

    async openLibrary() {
        return this.exclusive(async () => {
            await this.maySwitch();
            const destination = await this.dialogs.library?.();
            if (!destination) return;
            const current = await this.worker.call('bind', {destination});
            await this.persist({...emptyBinding(), assistant: this.binding.assistant, current});
            await this.refreshDisplayRoot(current);
            if (this.authMode === 'disabled') await this.covers.seed();
        });
    }

    async createLibrary() {
        requireWrite(this.authMode);
        return this.exclusive(async () => {
            await this.maySwitch();
            const root = await this.dialogs.destination(path.join(this.documents, '我的知识库'));
            if (!root) return;
            // Reserve a fresh directory before dispatch; a lost response can only inspect this inode.
            let stat;
            try {
                await fs.mkdir(root, {mode: 0o700});
                stat = await fs.lstat(root, {bigint: true});
            } catch {
                fail('CREATE_RESERVATION_FAILED', '内容库未创建。请使用新的文件夹名称；工作台不会覆盖已有文件夹。');
            }
            const creation = {
                root,
                mutationId: randomUUID(),
                rootIdentity: {dev: stat.dev.toString(), ino: stat.ino.toString()}
            };
            await this.persist({...emptyBinding(), assistant: this.binding.assistant, current: this.binding.current ?? null, creation});
            const current = await this.worker.call('createLibrary', creation);
            await this.persist({...emptyBinding(), assistant: this.binding.assistant, current});
            await this.refreshDisplayRoot(current);
            if (this.authMode === 'disabled') await this.covers.seed();
        });
    }

    async listContents(input?: { view: View }) {
        validateInput('listContents', input);
        return this.exclusive(async () => {
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
                await this.refreshDisplayRoot(current);
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
                await this.refreshDisplayRoot(current);
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
