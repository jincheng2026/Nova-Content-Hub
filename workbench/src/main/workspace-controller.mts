import {randomUUID} from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import {errorInfo} from '../shared/contracts.ts';
import {fail, requireWrite} from '../shared/validation.ts';
import {workspaceDesktopInput} from '../shared/workspace-validation.ts';
import type {Binding, ImportTask, LibraryBinding} from '../shared/contracts.ts';
import type {
    WorkspaceMutation, WorkspaceMutationResult, WorkspacePending, WorkspacePendingView,
    WorkspaceRecovery, WorkspaceWorker, WorkspaceLibrarySnapshot, WorkspaceMaterial, WorkspaceMaterialImport, WorkspaceMaterialReference
} from '../shared/workspace-contracts.ts';

type WorkspaceBinding = Binding & {workspacePending?: WorkspacePending | null};
export interface WorkspaceOwner {
    binding: WorkspaceBinding;
    authMode: 'required' | 'disabled';
    worker: WorkspaceWorker;
    dialogs: {templateImages?(): Promise<string[] | null>; material?(): Promise<string | null>; export?(defaultName: string): Promise<string | null>};
    covers: {grant(assetHash: string): string};
    current(): LibraryBinding;
    noPending(): void;
    query(): Promise<ImportTask | null>;
    bindImported(): Promise<void>;
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
            contentDetails: library.contentDetails.map(content => ({...content, materials: content.materials.map(material => this.decorateMaterial(material))})),
            collections: library.collections.map(collection => ({...collection, materials: collection.materials.map(material => this.decorateMaterial(material))}))
        };
    }

    async chooseContentMaterial(input?: undefined) {
        this.validate('chooseContentMaterial', input);
        requireWrite(this.owner.authMode);
        return this.owner.exclusive(async () => {
            this.owner.noPending();
            const binding = await this.writable();
            const source = await this.owner.dialogs.material?.();
            if (!source) return null;
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
            const material = await this.owner.worker.call('workspaceMaterialBytes', {binding: this.owner.current(), reference: input});
            const defaultName = path.basename(material.originalName).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 180) || '资料';
            const destination = await this.owner.dialogs.export?.(defaultName);
            if (!destination) return {exported: false};
            const temporary = path.join(path.dirname(destination), `.nova-material-${randomUUID()}`);
            const handle = await fs.open(temporary, 'wx', 0o600);
            try {
                try { await handle.writeFile(material.data); await handle.sync(); } finally { await handle.close(); }
                await fs.rename(temporary, destination);
                return {exported: true};
            } finally { await fs.unlink(temporary).catch(() => {}); }
        });
    }

    async chooseTemplateImages(input?: undefined) {
        this.validate('chooseTemplateImages', input);
        requireWrite(this.owner.authMode);
        return this.owner.exclusive(async () => {
            this.owner.noPending();
            const binding = await this.writable();
            const sources = await this.owner.dialogs.templateImages?.();
            if (!sources) return null;
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
            const task = await owner.query();
            if (!owner.binding.current && task?.status === 'committed' && !task.targetChanged && !owner.binding.needsReselect) await owner.bindImported();
            if (task?.targetChanged && owner.binding.current?.root === owner.binding.destination) fail('LIBRARY_NOT_READY', '原内容库位置已改变。');
            return this.decorate(await owner.worker.call('workspaceLibrary', {binding: owner.current()}));
        });
    }

    async writable() {
        requireWrite(this.owner.authMode);
        const task = await this.owner.query();
        if (this.owner.binding.started && task?.status !== 'committed') fail('IMPORT_IN_PROGRESS', '请先完成或核验当前导入。');
        if (task?.targetChanged && this.owner.binding.current?.root === this.owner.binding.destination) fail('LIBRARY_NOT_READY', '原内容库位置已改变，待处理记录已保留。');
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
            return this.dispatch();
        });
    }

    async recover(): Promise<WorkspaceRecovery> {
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
        const library = this.decorate(await this.owner.worker.call('workspaceLibrary', {binding: request.binding}));
        const result: WorkspaceMutationResult = {mutationId: request.pending.mutationId, ...recovered.receipt, library};
        await this.owner.persist({...this.owner.binding, workspacePending: null});
        this.pendingView = null;
        return {pending: null, result};
    }

    async dispatch(): Promise<WorkspaceMutationResult> {
        try {
            await this.owner.worker.call('workspaceMutate', this.boundPending());
        } catch (error) {
            // A failed response can follow a durable commit. Query that exact receipt before offering retry.
            try {
                const recovered = await this.recover();
                if (recovered.result) return recovered.result;
            } catch {
                // Keep the durable pending intent when either receipt lookup or reread remains uncertain.
            }
            throw error;
        }
        const recovered = await this.recover();
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
