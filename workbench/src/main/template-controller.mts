import {randomUUID} from 'node:crypto';
import {fail, requireWrite} from '../shared/validation.ts';
import {templateDesktopInput} from '../shared/template-validation.ts';
import type {Binding, ImportTask, LibraryBinding} from '../shared/contracts.ts';
import type {Assistant} from '../shared/cover-contracts.ts';
import type {TemplateAccept, TemplateAssistantSetup, TemplatePending, TemplatePendingView, TemplateRecovery, TemplateReference, TemplateStart, TemplateWorker, TemplateWorkflowResult, TemplateWorkflowView} from '../shared/template-contracts.ts';
type TemplateBinding = Binding & {templatePending?: TemplatePending | null};
export interface TemplateOwner {
    binding: TemplateBinding;
    authMode: 'required' | 'disabled';
    worker: TemplateWorker;
    covers: {grant(hash: string): string};
    current(): LibraryBinding;
    noPending(): void;
    query(): Promise<ImportTask | null>;
    persist(next: TemplateBinding): Promise<void>;
    exclusive<T>(action: () => Promise<T>): Promise<T>;
}
export interface TemplateCallbacks {
    readTemplateAssistantSetup(host: Assistant): Promise<TemplateAssistantSetup>;
    launchTemplate(binding: LibraryBinding, reference: TemplateReference & {host: Assistant}): Promise<void>;
}
const templateId = (p: TemplatePending) => p.action === 'start' || p.action === 'accept' ? p.input.templateId : p.reference.templateId;
export class TemplateController {
    pendingView: TemplatePendingView | null = null;
    readonly owner: TemplateOwner;
    readonly callbacks: TemplateCallbacks;
    constructor(owner: TemplateOwner, callbacks: TemplateCallbacks) {
        this.owner = owner;
        this.callbacks = callbacks;
    }
    validate(method: string, input: unknown) {if (templateDesktopInput(method, input) !== true) fail('INVALID_INPUT', '拒绝无效、额外或超限的模板字段。');}
    view(): TemplatePendingView | null {
        const p = this.owner.binding.templatePending;
        return p ? this.pendingView?.mutationId === p.mutationId ? {...this.pendingView} : {mutationId: p.mutationId, templateId: templateId(p), action: p.action, state: 'uncertain'} : null;
    }
    decorate(view: TemplateWorkflowView): TemplateWorkflowView {
        return {...view, jobs: view.jobs.map(job => ({...job, attempts: job.attempts.map(a => ({...a, samples: a.samples.map(image => ({...image, url: this.owner.covers.grant(image.assetHash)})), result: a.result ? {...a.result, restore: {...a.result.restore, url: this.owner.covers.grant(a.result.restore.assetHash)}} : null}))}))};
    }
    async readTemplateAssistantSetup(input?: undefined) {this.validate('readTemplateAssistantSetup', input); return this.callbacks.readTemplateAssistantSetup(this.owner.binding?.assistant ?? 'codex');}
    async requireAssistant(host: Assistant) {
        const setup = await this.callbacks.readTemplateAssistantSetup(host);
        if (!setup.ready || setup.host !== host || setup.skill !== 'nova-content-template-execution') fail('NOT_READY', '模板执行能力尚未准备好。请在设置中检查全局助手与配套模板插件。');
    }
    async writable() {
        requireWrite(this.owner.authMode);
        const task = await this.owner.query();
        if (this.owner.binding.started && task?.status !== 'committed') fail('IMPORT_IN_PROGRESS', '请先完成或核验当前导入。');
        if (task?.targetChanged && this.owner.binding.current?.root === this.owner.binding.destination) fail('LIBRARY_NOT_READY', '内容库位置已改变，原学习意图保留。');
        return this.owner.current();
    }
    bound() {
        const binding = this.owner.current(), pending = this.owner.binding.templatePending;
        if (!pending) fail('NO_PENDING', '没有待核验的模板操作。');
        if (pending.binding.libraryId !== binding.libraryId || pending.binding.rootIdentity.dev !== binding.rootIdentity.dev || pending.binding.rootIdentity.ino !== binding.rootIdentity.ino) fail('CONFLICT', '待处理学习绑定的内容库已改变，请恢复原位置后核验。');
        return {binding, pending};
    }
    async readTemplateWorkflow(input: {templateId: string}) {
        this.validate('readTemplateWorkflow', input);
        return this.owner.exclusive(async () => this.decorate(await this.owner.worker.call('templateRead', {binding: this.owner.current(), ...input})));
    }
    async open(reference: TemplateReference) {
        const binding = this.owner.current(), context = await this.owner.worker.call('templateHandoff', {binding, reference});
        await this.requireAssistant(context.host);
        await this.callbacks.launchTemplate(binding, {...reference, host: context.host});
    }
    async complete(reference: TemplateReference | null, launch: boolean, reportWarnings?: string[]): Promise<TemplateWorkflowResult> {
        const {binding, pending} = this.bound();
        const view = this.decorate(await this.owner.worker.call('templateRead', {binding, templateId: templateId(pending)}));
        if (reportWarnings?.length) view.reportWarnings = reportWarnings;
        await this.owner.persist({...this.owner.binding, templatePending: null});
        this.pendingView = null;
        const live = reference && view.jobs.some(j => j.id === reference.requestId && j.activeAttemptId === reference.attemptId && j.attempts.some(a => a.attemptId === reference.attemptId && ['created', 'claimed'].includes(a.status)));
        if (launch && live) await this.open(reference!);
        return {view, launchRequested: !!(launch && live)};
    }
    async recover(): Promise<TemplateRecovery> {
        if (!this.owner.binding.templatePending) return {pending: null, result: null};
        const request = this.bound();
        this.pendingView = {mutationId: request.pending.mutationId, action: request.pending.action, templateId: templateId(request.pending), state: 'uncertain'};
        const result = await this.owner.worker.call('templateRecover', request);
        if (result.found) return {pending: null, result: await this.complete(result.reference, false, result.reportWarnings)};
        if (request.pending.action === 'start' && result.request) {
            const {requestId, requestHash, sourcePackageHash} = result.request;
            await this.owner.persist({...this.owner.binding, templatePending: {...request.pending, request: {requestId, requestHash, sourcePackageHash}}});
        }
        this.pendingView = {...this.pendingView, state: result.conflict ? 'conflict' : 'missing'};
        return {pending: this.view(), result: null};
    }
    async dispatch(): Promise<TemplateWorkflowResult> {
        try {
            let request = this.bound();
            const previous = await this.owner.worker.call('templateRecover', request);
            if (previous.found) return this.complete(previous.reference, true, previous.reportWarnings);
            if (previous.conflict) fail('CONFLICT', '固定模板版本已改变，原学习意图保留。请先核验或放弃这次操作。');
            if (request.pending.action === 'start') {
                await this.requireAssistant(request.pending.host);
                const fixed = previous.request ?? await this.owner.worker.call('templateRequest', request);
                const {requestId, requestHash, sourcePackageHash} = fixed;
                await this.owner.persist({...this.owner.binding, templatePending: {...request.pending, request: {requestId, requestHash, sourcePackageHash}}});
                request = this.bound();
            } else if (request.pending.action === 'attempt') await this.requireAssistant(request.pending.host);
            const result = await this.owner.worker.call('templateMutate', request);
            return this.complete(result.reference, true, result.reportWarnings);
        } catch (error) {
            // A failed response may follow a durable write; preserve the exact intent until receipt lookup succeeds.
            if (this.owner.binding.templatePending) try {await this.recover();} catch {}
            throw error;
        }
    }
    async save(pending: TemplatePending) {
        await this.owner.persist({...this.owner.binding, templatePending: pending});
        this.pendingView = null;
        return this.dispatch();
    }
    async startTemplateStudy(input: TemplateStart) {
        this.validate('startTemplateStudy', input); requireWrite(this.owner.authMode);
        return this.owner.exclusive(async () => {
            this.owner.noPending(); const binding = await this.writable(), host = this.owner.binding.assistant ?? 'codex';
            await this.requireAssistant(host);
            const attemptMutationId = randomUUID();
            return this.save({action: 'start', sizePolicy: 'ratio-minimum', input: structuredClone(input), host, binding: {libraryId: binding.libraryId, rootIdentity: {...binding.rootIdentity}}, mutationId: attemptMutationId, requestMutationId: randomUUID(), attemptMutationId, request: null});
        });
    }
    async newAttempt(reference: TemplateReference, reason: 'retry' | 'host-change') {
        this.owner.noPending(); const binding = await this.writable(), host = this.owner.binding.assistant ?? 'codex';
        await this.requireAssistant(host);
        return this.save({action: 'attempt', reference: structuredClone(reference), host, reason, mutationId: randomUUID(), binding: {libraryId: binding.libraryId, rootIdentity: {...binding.rootIdentity}}});
    }
    async retryTemplateStudy(input: TemplateReference) {
        this.validate('retryTemplateStudy', input); requireWrite(this.owner.authMode);
        return this.owner.exclusive(() => this.newAttempt(input, 'retry'));
    }
    async continueTemplateStudy(input: TemplateReference) {
        this.validate('continueTemplateStudy', input); requireWrite(this.owner.authMode);
        return this.owner.exclusive(async () => {
            this.owner.noPending(); const binding = await this.writable();
            const current = await this.owner.worker.call('templateHandoff', {binding, reference: input});
            if (current.host !== (this.owner.binding.assistant ?? 'codex')) return this.newAttempt(input, 'host-change');
            await this.open(input);
            return {view: this.decorate(await this.owner.worker.call('templateRead', {binding, templateId: input.templateId})), launchRequested: true};
        });
    }
    async action(action: 'cancel' | 'accept', input: TemplateReference | TemplateAccept) {
        this.owner.noPending(); const binding = await this.writable(), base = {mutationId: randomUUID(), binding: {libraryId: binding.libraryId, rootIdentity: {...binding.rootIdentity}}};
        return this.save(action === 'accept' ? {...base, action, input: structuredClone(input as TemplateAccept)} : {...base, action, reference: structuredClone(input)});
    }
    async cancelTemplateStudy(input: TemplateReference) {this.validate('cancelTemplateStudy', input); requireWrite(this.owner.authMode); return this.owner.exclusive(() => this.action('cancel', input));}
    async acceptTemplateStudy(input: TemplateAccept) {this.validate('acceptTemplateStudy', input); requireWrite(this.owner.authMode); return this.owner.exclusive(() => this.action('accept', input));}
    async recoverTemplateMutation(input?: undefined) {this.validate('recoverTemplateMutation', input); return this.owner.exclusive(() => this.recover());}
    async retryTemplateMutation(input?: undefined) {this.validate('retryTemplateMutation', input); requireWrite(this.owner.authMode); return this.owner.exclusive(async () => {if (!this.owner.binding.templatePending) return null; await this.writable(); return this.dispatch();});}
    async abandonTemplateMutation(input?: undefined) {
        this.validate('abandonTemplateMutation', input);
        return this.owner.exclusive(async () => {
            if (!this.owner.binding.templatePending) return;
            const recovered = await this.recover();
            if (recovered.result) return;
            if (!recovered.pending || !['missing', 'conflict'].includes(recovered.pending.state)) fail('PENDING_MUTATION', '结果尚未确认，请先恢复原内容库后核验。');
            await this.owner.persist({...this.owner.binding, templatePending: null}); this.pendingView = null;
        });
    }
}
