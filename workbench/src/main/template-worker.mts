import path from 'node:path';
import {openLibrary, LibraryError} from '../../../plugin-src/src/lib/file-library/index.mjs';
import {exact, libraryBinding, requireWrite, fail} from '../shared/validation.ts';
import {templateDesktopInput, templatePending, templateReference} from '../shared/template-validation.ts';
import type {TemplateCoreLibrary, TemplateCoreContext, TemplateCoreDocument} from '../shared/template-core.d.ts';
import type {TemplatePending, TemplateReference, TemplateWorkerOperations, TemplateWorkflowView, TemplateRequestIdentity} from '../shared/template-contracts.ts';
const operations = ['templateRead', 'templateRequest', 'templateMutate', 'templateRecover', 'templateHandoff'] as const;
export const isTemplateOperation = (op: unknown): op is keyof TemplateWorkerOperations => typeof op === 'string' && (operations as readonly string[]).includes(op);
const idOf = (p: TemplatePending) => p.action === 'start' || p.action === 'accept' ? p.input.templateId : p.reference.templateId;
function reference(c: TemplateCoreContext): TemplateReference {
    return {templateId: c.template.id, requestId: c.request.requestId, attemptId: c.attempt.attemptId, requestHash: c.request.requestHash, sourceVersion: c.request.template.version, sourcePackageHash: c.request.template.packageHash};
}
function context(library: TemplateCoreLibrary, r: TemplateReference) {
    const c = library.readTemplateContext(r.templateId, r.requestId, r.attemptId);
    if (c.request.requestHash !== r.requestHash || c.request.template.version !== r.sourceVersion || c.request.template.packageHash !== r.sourcePackageHash) fail('CONFLICT', '学习结果与固定模板版本不一致。');
    return c;
}
function writableContext(library: TemplateCoreLibrary, r: TemplateReference, live = false) {
    const c = context(library, r), current = library.readTemplate(r.templateId);
    if (current.builtin) fail('BUILTIN_TEMPLATE', '请先派生为自己的模板，再学习并还原。');
    if (current.deletedAt || current.currentVersion !== r.sourceVersion || current.versions.find(v => v.version === r.sourceVersion)?.packageHash !== r.sourcePackageHash) fail('CONFLICT', '模板已被回收或切换版本。学习历史保留，请返回原版本后处理。');
    const job = current.templateJobs?.find(j => j.id === r.requestId);
    if (job?.acceptance) fail('ALREADY_ACCEPTED', '这次学习已验收。重新学习请创建新请求。');
    if (live && (job?.activeAttemptId !== r.attemptId || !['created', 'claimed'].includes(c.attempt.status))) fail('ATTEMPT_INACTIVE', '这次尝试已结束，请查看历史或重新学习并还原。');
    return c;
}
function view(library: TemplateCoreLibrary, templateId: string): TemplateWorkflowView {
    const t = library.readTemplate(templateId);
    return {templateId: t.id, title: t.title, editToken: t.editToken, currentVersion: t.currentVersion, builtin: t.builtin === true, deletedAt: t.deletedAt ?? null, jobs: (t.templateJobs ?? []).map(job => ({id: job.id, activeAttemptId: job.activeAttemptId, acceptance: job.acceptance, attempts: job.attempts.map(a => {
        let c: TemplateCoreContext;
        try { c = library.readTemplateContext(templateId, job.id, a.attemptId); }
        catch (error) {
            const unreadable = error instanceof LibraryError && error.code === 'IO_ERROR' && ['ENOENT', 'EACCES', 'EPERM', 'EIO', 'ENOTDIR'].includes((error.cause as NodeJS.ErrnoException | undefined)?.code ?? '');
            if (!(error instanceof LibraryError) || error.code !== 'CORRUPT' && !unreadable) throw error;
            const source = t.versions[0];
            return {attemptId: a.attemptId, host: a.host, status: a.status, reason: a.reason, failure: a.failure, reference: {templateId, requestId: job.id, attemptId: a.attemptId, requestHash: job.requestHash, sourceVersion: 0, sourcePackageHash: source?.packageHash ?? ''}, samples: [], result: null, unavailable: true};
        }
        const result = c.results.find(r => r.requestId === job.id && r.attemptId === a.attemptId)?.result;
        return {attemptId: a.attemptId, host: a.host, status: a.status, reason: a.reason, failure: a.failure, reference: reference(c), samples: c.request.styleAssetHashes.map(assetHash => ({assetHash, url: ''})), result: result ? {resultHash: result.resultHash, rules: result.rules, restore: {assetHash: result.restore.assetHash, url: ''}} : null, unavailable: false};
    })}))};
}
function receipt(library: TemplateCoreLibrary, p: TemplatePending, requestStage = false) {
    const mutationId = p.action === 'start' && requestStage ? p.requestMutationId : p.mutationId;
    const r = library.queryMutation(mutationId);
    if (r && (r.objectKind !== 'template' || r.objectId !== idOf(p))) fail('CONFLICT', '原事务回执不属于本次模板操作。');
    return r?.content ?? null;
}
function requestIdentity(t: TemplateCoreDocument, p: Extract<TemplatePending, {action: 'start'}>): TemplateRequestIdentity {
    const job = t.templateJobs?.at(-1), source = t.versions.find(v => v.version === p.input.version);
    if (!job || !source) fail('CORRUPT', '原学习请求事务缺少固定输入。');
    if (p.request && (job.id !== p.request.requestId || job.requestHash !== p.request.requestHash || source.packageHash !== p.request.sourcePackageHash)) fail('CONFLICT', '学习请求与持久化输入不同。');
    return {requestId: job.id, requestHash: job.requestHash, sourceVersion: p.input.version, sourcePackageHash: source.packageHash};
}
function attemptReference(t: TemplateCoreDocument, p: TemplatePending): TemplateReference | null {
    if (p.action === 'accept' || p.action === 'cancel') return null;
    const request = p.action === 'start' ? p.request : p.reference;
    if (!request) fail('CORRUPT', '学习尝试缺少固定请求。');
    const job = t.templateJobs?.find(j => j.id === request.requestId), attempt = job?.attempts.find(a => a.attemptId === job.activeAttemptId);
    if (!job || !attempt || job.requestHash !== request.requestHash || attempt.host !== p.host) fail('CONFLICT', '原尝试事务与固定请求或助手不一致。');
    return {templateId: t.id, requestId: job.id, attemptId: attempt.attemptId, requestHash: job.requestHash, sourceVersion: p.action === 'start' ? p.input.version : p.reference.sourceVersion, sourcePackageHash: request.sourcePackageHash};
}
async function verifyReplay(library: TemplateCoreLibrary, p: TemplatePending) {
    if (p.action === 'start') {
        if (!receipt(library, p, true)) fail('CORRUPT', '原尝试事务的请求回执丢失。');
        await library.createTemplateRequest(p.input.templateId, {version: p.input.version, notes: p.input.notes, ...(p.sizePolicy ? {sizePolicy: p.sizePolicy} : {})}, p.input.editToken, {mutationId: p.requestMutationId});
        if (!p.request) fail('CORRUPT', '原尝试事务缺少请求绑定。');
        library.createTemplateAttempt(p.input.templateId, p.request.requestId, {host: p.host, reason: 'initial'}, {mutationId: p.mutationId});
    } else if (p.action === 'attempt') {
        context(library, p.reference);
        library.createTemplateAttempt(p.reference.templateId, p.reference.requestId, {host: p.host, reason: p.reason}, {mutationId: p.mutationId});
    } else if (p.action === 'cancel') {
        context(library, p.reference);
        library.cancelTemplateAttempt(p.reference.templateId, p.reference.requestId, p.reference.attemptId, {mutationId: p.mutationId});
    } else {
        const {templateId, editToken, ...input} = p.input;
        library.acceptTemplateResult(templateId, input, editToken, {mutationId: p.mutationId});
    }
}
export async function executeTemplate(op: keyof TemplateWorkerOperations, raw: unknown, mode: 'required' | 'disabled'): Promise<TemplateWorkerOperations[keyof TemplateWorkerOperations]['result']> {
    const fields = op === 'templateRead' ? ['binding', 'templateId'] : op === 'templateHandoff' ? ['binding', 'reference'] : ['binding', 'pending'];
    if (!exact(raw, fields) || !libraryBinding(raw.binding) || !path.isAbsolute(raw.binding.root) || raw.binding.root.includes('\0') || (op === 'templateRead' ? templateDesktopInput('readTemplateWorkflow', {templateId: raw.templateId}) !== true : op === 'templateHandoff' ? !templateReference(raw.reference) : !templatePending(raw.pending))) fail('INVALID_INPUT', '工作进程拒绝无效模板输入。');
    requireWrite(mode);
    const library = openLibrary(raw.binding.root, {expectedLibraryId: raw.binding.libraryId, expectedRootIdentity: raw.binding.rootIdentity}) as unknown as TemplateCoreLibrary;
    if (op === 'templateRead') return view(library, raw.templateId as string);
    if (op === 'templateHandoff') return {host: writableContext(library, raw.reference as unknown as TemplateReference, true).attempt.host};
    const p = raw.pending as unknown as TemplatePending;
    if (op === 'templateRecover') {
        const found = receipt(library, p);
        if (found) {await verifyReplay(library, p); return {found: true, conflict: false, request: null, reference: attemptReference(found, p)};}
        const request = p.action === 'start' ? receipt(library, p, true) : null;
        if (request && p.action === 'start') await library.createTemplateRequest(p.input.templateId, {version: p.input.version, notes: p.input.notes, ...(p.sizePolicy ? {sizePolicy: p.sizePolicy} : {})}, p.input.editToken, {mutationId: p.requestMutationId});
        const current = library.readTemplate(idOf(p));
        const sourceVersion = p.action === 'start' ? p.input.version : p.action === 'accept' ? p.input.sourceVersion : p.reference.sourceVersion;
        const tokenChanged = p.action === 'accept' ? current.editToken !== p.input.editToken : p.action === 'start' && !request && current.editToken !== p.input.editToken;
        return {found: false, conflict: !!current.deletedAt || (p.action !== 'cancel' && current.currentVersion !== sourceVersion) || tokenChanged, request: request && p.action === 'start' ? requestIdentity(request, p) : null, reference: null};
    }
    if (op === 'templateRequest') {
        if (p.action !== 'start') fail('INVALID_INPUT', '仅新学习请求可创建固定输入。');
        const existing = receipt(library, p, true);
        if (existing) {
            await library.createTemplateRequest(p.input.templateId, {version: p.input.version, notes: p.input.notes, ...(p.sizePolicy ? {sizePolicy: p.sizePolicy} : {})}, p.input.editToken, {mutationId: p.requestMutationId});
            return requestIdentity(existing, p);
        }
        const current = library.readTemplate(p.input.templateId);
        if (current.builtin) fail('BUILTIN_TEMPLATE', '请先派生为自己的模板，再学习并还原。');
        const result = await library.createTemplateRequest(p.input.templateId, {version: p.input.version, notes: p.input.notes, ...(p.sizePolicy ? {sizePolicy: p.sizePolicy} : {})}, p.input.editToken, {mutationId: p.requestMutationId});
        return {requestId: result.request.requestId, requestHash: result.request.requestHash, sourceVersion: result.request.template.version, sourcePackageHash: result.request.template.packageHash};
    }
    const existing = receipt(library, p);
    if (existing) {await verifyReplay(library, p); return {reference: attemptReference(existing, p)};}
    if (p.action === 'accept') {
        const {templateId, editToken, ...input} = p.input;
        library.acceptTemplateResult(templateId, input, editToken, {mutationId: p.mutationId});
        return {reference: null};
    }
    if (p.action === 'cancel') {
        const c = context(library, p.reference);
        const current = library.readTemplate(p.reference.templateId);
        const job = current.templateJobs?.find(j => j.id === p.reference.requestId);
        if (current.deletedAt || job?.acceptance || job?.activeAttemptId !== p.reference.attemptId || !['created', 'claimed'].includes(c.attempt.status)) fail('ATTEMPT_INACTIVE', '这次尝试已结束或模板已回收。');
        library.cancelTemplateAttempt(p.reference.templateId, p.reference.requestId, p.reference.attemptId, {mutationId: p.mutationId});
        return {reference: null};
    }
    const request = p.action === 'start' ? p.request : p.reference;
    if (!request) fail('INVALID_STATE', '请先核验学习请求。');
    if (p.action === 'attempt') writableContext(library, p.reference);
    const result = library.createTemplateAttempt(idOf(p), request.requestId, {host: p.host, reason: p.action === 'start' ? 'initial' : p.reason}, {mutationId: p.mutationId});
    return {reference: reference(library.readTemplateContext(idOf(p), request.requestId, result.attempt.attemptId))};
}
