import {externalExportParent, templateFolderImages, validateLocalFiles} from './local-files.mts';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import {errorInfo} from '../shared/contracts.ts';
import {fail, requireWrite} from '../shared/validation.ts';
import {workspaceDesktopInput} from '../shared/workspace-validation.ts';
import type {Binding, LibraryBinding} from '../shared/contracts.ts';
import type {
    CoverCandidateUpdate, PromptFavoriteUpdate, WorkspaceContentDetails, WorkspaceReceipt, WorkspaceMutation, WorkspaceMutationResult, WorkspacePending, WorkspacePendingView,
    WorkspaceRecovery, WorkspaceWorker, WorkspaceLibrarySnapshot, WorkspaceMaterial, WorkspaceMaterialImport, WorkspaceMaterialReference, WorkspacePublicationReference
} from '../shared/workspace-contracts.ts';

type WorkspaceBinding = Binding & {workspacePending?: WorkspacePending | null};
export interface WorkspaceOwner {
    binding: WorkspaceBinding;
    authMode: 'required' | 'disabled';
    worker: WorkspaceWorker & Pick<import('../shared/contracts.ts').Worker,'call'>;
    dialogs: {templateFolder?(): Promise<string | null>; templateImages?(): Promise<string[] | null>; material?(): Promise<string | null>; export?(defaultName: string): Promise<string | null>};
    covers: {grant(assetHash: string): string};
    openPublicationURL?: (url: string) => Promise<void>;
    revealFolder?: (root: string) => void;
    current(): LibraryBinding;
    noPending(): void;
    persist(next: WorkspaceBinding): Promise<void>;
    exclusive<T>(action: () => Promise<T>): Promise<T>;
}

export class WorkspaceController {
    owner: WorkspaceOwner;
    pendingView: WorkspacePendingView | null = null;

    constructor(owner: WorkspaceOwner) { this.owner = owner; }

    validate(method: string, input: unknown) {
        if (workspaceDesktopInput(method, input) !== true) fail('INVALID_INPUT', '拒绝无效、额外或超限的业务字段。');
    }

    view(): WorkspacePendingView | null {
        const pending = this.owner.binding.workspacePending;
        if (!pending) return null;
        if (this.pendingView?.mutationId === pending.mutationId) return structuredClone(this.pendingView);
        return {mutationId: pending.mutationId, input: structuredClone(pending.input), state: 'uncertain'};
    }

    decorateMaterial<T extends WorkspaceMaterialImport | WorkspaceMaterial>(material: T): T {
        const usable = !('deletedAt' in material) || material.deletedAt === null;
        return {...material, url: usable && material.assetHash && material.detectedType && ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(material.detectedType) ? this.owner.covers.grant(material.assetHash) : null};
    }

    decorate(library: WorkspaceLibrarySnapshot): WorkspaceLibrarySnapshot {
        return {
            ...library,
            contentDetails: library.contentDetails.map(content => ({...content, materials: content.materials.map(material => this.decorateMaterial(material)), candidates: content.candidates.map(candidate => ({...candidate, url: this.owner.covers.grant(candidate.assetHash)}))})),
            collections: library.collections.map(collection => ({...collection, materials: collection.materials.map(material => this.decorateMaterial(material)), candidates: collection.candidates.map(candidate => ({...candidate, url: this.owner.covers.grant(candidate.assetHash)}))}))
        };
    }

    async openPublicationLink(input: WorkspacePublicationReference): Promise<{opened: true}> {
        this.validate('openPublicationLink', input);
        return this.owner.exclusive(async () => {
            if (!this.owner.openPublicationURL) fail('NOT_READY', '此安装尚未配置浏览器打开入口。');
            const library = await this.owner.worker.call('workspaceLibrary', {binding: this.owner.current()});
            const document = (input.kind === 'content' ? library.contentDetails : library.collections).find(item => item.id === input.id);
            const stored = document?.publications.find(item => item.id === input.publicationId)?.url;
            let url: URL;
            try { if (!stored || stored.length > 4096 || /[\u0000-\u0020]/.test(stored)) throw new Error(); url = new URL(stored); }
            catch { fail('INVALID_PUBLICATION_LINK', '这条发布记录没有可打开的完整网页链接。'); }
            if (!['https:', 'http:'].includes(url.protocol) || !url.hostname || url.username || url.password) fail('INVALID_PUBLICATION_LINK', '只支持不含账号密码的 HTTP 或 HTTPS 发布链接。');
            try { await this.owner.openPublicationURL(url.href); }
            catch { fail('PUBLICATION_OPEN_FAILED', '系统未能打开发布链接，请稍后重试。'); }
            return {opened: true};
        });
    }

    async revealLibraryFolder(input?: undefined): Promise<{revealed: true}> {
        this.validate('revealLibraryFolder', input);
        return this.owner.exclusive(async () => {
            if (!this.owner.revealFolder) fail('NOT_READY', '此安装尚未配置文件管理器入口。');
            const binding = this.owner.current();
            const root=await this.owner.worker.call('vaultLocation',{binding});
            try { this.owner.revealFolder(root); }
            catch { fail('FOLDER_OPEN_FAILED', '系统未能显示内容库文件夹，请稍后重试。'); }
            return {revealed: true};
        });
    }

    async chooseContentMaterial(input?: undefined, selectedSource?: string) {
        this.validate('chooseContentMaterial', input);
        requireWrite(this.owner.authMode);
        return this.owner.exclusive(async () => {
            this.owner.noPending();
            const binding = await this.writable();
            const source = selectedSource ?? await this.owner.dialogs.material?.();
            if (!source) return null;
            await validateLocalFiles({kind: 'material', sources: [source]});
            try { return this.decorateMaterial(await this.owner.worker.call('workspaceImportMaterial', {binding, source})); }
            catch (error) {
                throw Object.assign(new Error('资料导入未完成。请选择64 MiB以内的PNG、JPEG、WebP、GIF或PDF；UTF-8 Markdown/文本限1 MiB。未建立内容附件，已导入原件可能作为未引用资产保留。'), {code: errorInfo(error).code});
            }
        });
    }

    async readContentMaterial(input: WorkspaceMaterialReference) {
        this.validate('readContentMaterial', input);
        return this.owner.exclusive(async () => this.decorateMaterial(await this.owner.worker.call('workspaceReadMaterial', {binding: this.owner.current(), reference: input})));
    }

    async exportContentMaterial(input: WorkspaceMaterialReference) {
        this.validate('exportContentMaterial', input);
        return this.owner.exclusive(async () => {
            const binding = this.owner.current(), material = await this.owner.worker.call('workspaceMaterialBytes', {binding, reference: input});
            const defaultName = path.basename(material.originalName).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 180) || '资料';
            const destination = await this.owner.dialogs.export?.(defaultName);
            if (!destination) return {exported: false};
            const parent = await externalExportParent(path.dirname(destination), binding.root);
            const temporary = path.join(parent, `.nova-material-${randomUUID()}`);
            const handle = await fs.open(temporary, 'wx', 0o600);
            try {
                try { await handle.writeFile(material.data); await handle.sync(); } finally { await handle.close(); }
                await fs.rename(temporary, path.join(parent, path.basename(destination)));
                return {exported: true};
            } finally { await fs.unlink(temporary).catch(() => {}); }
        });
    }

    async chooseTemplateFolder(input?: undefined) {
        this.validate('chooseTemplateFolder', input); requireWrite(this.owner.authMode);
        return this.chooseTemplateImages(undefined, undefined, true);
    }

    async revealTemplateFolder(input: {templateId: string}): Promise<{revealed: true; reportWarnings?: string[]}> {
        this.validate('revealTemplateFolder', input);
        return this.owner.exclusive(async () => {
            if (!this.owner.revealFolder) fail('NOT_READY', '此安装尚未配置文件管理器入口。');
            const binding = this.owner.current();
            const {folder, reportWarnings} = await this.owner.worker.call('workspaceTemplateFolder', {binding, templateId: input.templateId});
            const info = await fs.lstat(binding.root, {bigint: true});
            if (await fs.realpath(binding.root) !== binding.root || !info.isDirectory() || info.isSymbolicLink() || String(info.dev) !== binding.rootIdentity.dev || String(info.ino) !== binding.rootIdentity.ino) fail('LIBRARY_NOT_READY', '内容库原目录已改变，请重新连接后再查看。');
            for (const part of [path.join(binding.root, '模板'), folder]) {
                const stat = await fs.lstat(part);
                if (!stat.isDirectory() || stat.isSymbolicLink()) fail('UNSAFE_PATH', '模板文件夹位置已改变。');
            }
            try {this.owner.revealFolder(folder);} catch {fail('FOLDER_OPEN_FAILED', '系统未能显示模板文件夹，请稍后重试。');}
            return {revealed: true, reportWarnings};
        });
    }

    async chooseTemplateImages(input?: undefined, selectedSources?: string[], folderSelection = false) {
        this.validate('chooseTemplateImages', input);
        requireWrite(this.owner.authMode);
        return this.owner.exclusive(async () => {
            this.owner.noPending();
            const binding = await this.writable();
            const folder = folderSelection ? await this.owner.dialogs.templateFolder?.() : null;
            const sources = folderSelection ? folder ? await templateFolderImages(folder) : null : selectedSources ?? await this.owner.dialogs.templateImages?.();
            if (!sources) return null;
            await validateLocalFiles({kind: 'template', sources});
            try {
                const images = await this.owner.worker.call('workspaceImportTemplateImages', {binding, sources});
                return images.map(image => ({...image, url: this.owner.covers.grant(image.assetHash)}));
            } catch (error) {
                throw Object.assign(new Error('样张导入未完成，请检查图片格式与大小后重新选择。此次没有创建模板，已导入的原图可能作为未引用资产保留，重新选择会按摘要复用。'), {code: errorInfo(error).code});
            }
        });
    }

    async readWorkspaceLibrary(input?: undefined) {
        this.validate('readWorkspaceLibrary', input);
        const owner = this.owner;
        return owner.exclusive(async () => {
            return this.decorate(await owner.worker.call('workspaceLibrary', {binding: owner.current()}));
        });
    }

    async readWorkspaceContent(input: {id: string}) {
        this.validate('readWorkspaceContent', input);
        return this.owner.exclusive(async () => this.decorateContent(await this.owner.worker.call('workspaceContent', {binding: this.owner.current(), id: input.id})));
    }

    decorateContent(content: WorkspaceContentDetails) {
        return {...content, materials: content.materials.map(material => this.decorateMaterial(material)), candidates: content.candidates.map(candidate => ({...candidate, url: this.owner.covers.grant(candidate.assetHash)}))};
    }

    async writable() {
        requireWrite(this.owner.authMode);
        return this.owner.current();
    }

    boundPending(): {binding: LibraryBinding; pending: WorkspacePending} {
        const binding = this.owner.current(), pending = this.owner.binding.workspacePending;
        if (!pending) fail('NO_PENDING', '没有待核验的工作台操作。');
        if (pending.binding.libraryId !== binding.libraryId || pending.binding.rootIdentity.dev !== binding.rootIdentity.dev || pending.binding.rootIdentity.ino !== binding.rootIdentity.ino) fail('CONFLICT', '待处理操作绑定的内容库已改变，请恢复原位置后核验。');
        return {binding, pending};
    }

    async mutateWorkspace(input: WorkspaceMutation) {
        this.validate('mutateWorkspace', input);
        return this.startMutation(input, (binding, pending, receipt) => this.fullResult(binding, pending, receipt));
    }

    async updateCoverCandidate(input: CoverCandidateUpdate) {
        this.validate('updateCoverCandidate', input);
        return this.startMutation(input, async (binding, pending, receipt) => {
            if (receipt.objectKind !== 'content' || receipt.objectId !== input.id) fail('CONFLICT', '候选操作回执不属于当前内容。');
            const content = await this.owner.worker.call('workspaceContent', {binding, id: receipt.objectId});
            return this.decorateContent(content);
        });
    }

    async updatePromptFavorite(input: PromptFavoriteUpdate) {
        this.validate('updatePromptFavorite', input);
        return this.startMutation(input, async (binding, pending, receipt) => {
            if (receipt.objectKind !== 'prompt' || receipt.objectId !== input.id) fail('CONFLICT', '收藏操作回执不属于当前提示词。');
            return this.owner.worker.call('workspacePrompt', {binding, id: receipt.objectId});
        });
    }

    async startMutation<T>(input: WorkspaceMutation, project: (binding: LibraryBinding, pending: WorkspacePending, receipt: WorkspaceReceipt) => Promise<T>) {
        requireWrite(this.owner.authMode);
        return this.owner.exclusive(async () => {
            this.owner.noPending();
            if (this.owner.binding.workspacePending) fail('PENDING_MUTATION', '请先核验原工作台操作。');
            const binding = await this.writable();
            const pending: WorkspacePending = {
                mutationId: randomUUID(), input: structuredClone(input),
                binding: {libraryId: binding.libraryId, rootIdentity: {...binding.rootIdentity}}
            };
            // Save the exact intent before dispatch so a worker exit cannot turn retry into a second write.
            await this.owner.persist({...this.owner.binding, workspacePending: pending});
            this.pendingView = null;
            return this.dispatchProjection(project);
        });
    }

    async fullResult(binding: LibraryBinding, pending: WorkspacePending, receipt: WorkspaceReceipt): Promise<WorkspaceMutationResult> {
        const library = this.decorate(await this.owner.worker.call('workspaceLibrary', {binding}));
        return {mutationId: pending.mutationId, ...receipt, library};
    }

    async recover(): Promise<WorkspaceRecovery> {
        return this.recoverProjection((binding, pending, receipt) => this.fullResult(binding, pending, receipt));
    }

    async recoverProjection<T>(project: (binding: LibraryBinding, pending: WorkspacePending, receipt: WorkspaceReceipt) => Promise<T>): Promise<{pending: WorkspacePendingView | null; result: T | null}> {
        if (!this.owner.binding.workspacePending) return {pending: null, result: null};
        const request = this.boundPending();
        this.pendingView = {mutationId: request.pending.mutationId, input: structuredClone(request.pending.input), state: 'uncertain'};
        const recovered = await this.owner.worker.call('workspaceRecover', request);
        if (!recovered.receipt) {
            this.pendingView = {...this.pendingView, state: recovered.conflict ? 'conflict' : 'missing'};
            return {pending: this.view(), result: null};
        }
        this.pendingView = {...this.pendingView, state: 'committed'};
        // Receipts describe the historical write; expose only a freshly reread, safe library projection.
        const result = await project(request.binding, request.pending, recovered.receipt);
        await this.owner.persist({...this.owner.binding, workspacePending: null});
        this.pendingView = null;
        return {pending: null, result};
    }

    async dispatch(): Promise<WorkspaceMutationResult> {
        return this.dispatchProjection((binding, pending, receipt) => this.fullResult(binding, pending, receipt));
    }

    async dispatchProjection<T>(project: (binding: LibraryBinding, pending: WorkspacePending, receipt: WorkspaceReceipt) => Promise<T>): Promise<T> {
        try {
            await this.owner.worker.call('workspaceMutate', this.boundPending());
        } catch (error) {
            // A failed response can follow a durable commit. Query that exact receipt before offering retry.
            try {
                const recovered = await this.recoverProjection(project);
                if (recovered.result) return recovered.result;
            } catch {
                // Keep the durable pending intent when either receipt lookup or reread remains uncertain.
            }
            throw error;
        }
        const recovered = await this.recoverProjection(project);
        if (!recovered.result) fail('PENDING_MUTATION', '操作结果尚待核验，原事务和输入已保留。');
        return recovered.result;
    }

    async recoverWorkspaceMutation(input?: undefined) {
        this.validate('recoverWorkspaceMutation', input);
        return this.owner.exclusive(() => this.recover());
    }

    async retryWorkspaceMutation(input?: undefined) {
        this.validate('retryWorkspaceMutation', input);
        requireWrite(this.owner.authMode);
        return this.owner.exclusive(async () => {
            if (!this.owner.binding.workspacePending) return null;
            await this.writable();
            const recovered = await this.recover();
            if (recovered.result) return recovered.result;
            if (recovered.pending?.state === 'conflict') fail('CONFLICT', '原对象已改变，请保留输入并放弃原意图后重新编辑。');
            return this.dispatch();
        });
    }

    async abandonWorkspaceMutation(input?: undefined) {
        this.validate('abandonWorkspaceMutation', input);
        return this.owner.exclusive(async () => {
            if (!this.owner.binding.workspacePending) return;
            const recovered = await this.recover();
            if (recovered.result) return;
            // Unknown outcomes cannot be abandoned; recovery must first prove that no receipt exists.
            if (!recovered.pending || !['missing', 'conflict'].includes(recovered.pending.state)) fail('PENDING_MUTATION', '原操作结果尚未确认，请先恢复原内容库后核验。');
            await this.owner.persist({...this.owner.binding, workspacePending: null});
            this.pendingView = null;
        });
    }
}
