import {exact, uuid, token, identity} from './validation.ts';
import type {TemplatePending, TemplateReference, TemplateStart, TemplateAccept} from './template-contracts.ts';
const templateId = (v: unknown): v is string => typeof v === 'string' && (uuid(v) || /^builtin-[a-z0-9][a-z0-9-]{0,127}$/.test(v));
const version = (v: unknown) => Number.isSafeInteger(v) && (v as number) >= 1 && (v as number) <= 1_000_000;
const referenceFields = ['templateId', 'requestId', 'attemptId', 'requestHash', 'sourceVersion', 'sourcePackageHash'];
const referenceValues = (v: Record<string, unknown>) => templateId(v.templateId) && uuid(v.requestId) && uuid(v.attemptId) && token(v.requestHash) && version(v.sourceVersion) && token(v.sourcePackageHash);
export const templateReference = (v: unknown): v is TemplateReference => exact(v, referenceFields) && referenceValues(v);
export const templateStart = (v: unknown): v is TemplateStart => exact(v, ['templateId', 'version', 'editToken', 'notes']) && templateId(v.templateId) && version(v.version) && token(v.editToken) && typeof v.notes === 'string' && v.notes.length <= 10_000 && !v.notes.includes('\0');
export const templateAccept = (v: unknown): v is TemplateAccept => exact(v, [...referenceFields, 'resultHash', 'editToken']) && referenceValues(v) && token(v.resultHash) && token(v.editToken);
export function templatePending(v: unknown): v is TemplatePending {
    if (!v || typeof v !== 'object') return false;
    const p = v as Record<string, unknown>, common = ['binding', 'mutationId', 'action'];
    if (!uuid(p.mutationId) || !exact(p.binding, ['libraryId', 'rootIdentity']) || !uuid(p.binding.libraryId) || !identity(p.binding.rootIdentity)) return false;
    if (p.action === 'start') return exact(p, [...common, 'input', 'host', 'requestMutationId', 'attemptMutationId', 'request', ...(Object.hasOwn(p, 'sizePolicy') ? ['sizePolicy'] : [])]) && (!Object.hasOwn(p, 'sizePolicy') || ['exact', 'ratio-minimum'].includes(p.sizePolicy as string)) && templateStart(p.input) && ['codex', 'workbuddy'].includes(p.host as string) && uuid(p.requestMutationId) && uuid(p.attemptMutationId) && p.mutationId === p.attemptMutationId && p.requestMutationId !== p.attemptMutationId && (p.request === null || exact(p.request, ['requestId', 'requestHash', 'sourcePackageHash']) && uuid(p.request.requestId) && token(p.request.requestHash) && token(p.request.sourcePackageHash));
    if (p.action === 'attempt') return exact(p, [...common, 'reference', 'host', 'reason']) && templateReference(p.reference) && ['codex', 'workbuddy'].includes(p.host as string) && ['retry', 'host-change'].includes(p.reason as string);
    if (p.action === 'cancel') return exact(p, [...common, 'reference']) && templateReference(p.reference);
    return p.action === 'accept' && exact(p, [...common, 'input']) && templateAccept(p.input);
}
export function templateDesktopInput(method: string, input: unknown): boolean | undefined {
    if (method === 'readTemplateWorkflow') return exact(input, ['templateId']) && templateId(input.templateId);
    if (method === 'startTemplateStudy') return templateStart(input);
    if (['continueTemplateStudy', 'retryTemplateStudy', 'cancelTemplateStudy'].includes(method)) return templateReference(input);
    if (method === 'acceptTemplateStudy') return templateAccept(input);
    if (['readTemplateAssistantSetup', 'recoverTemplateMutation', 'retryTemplateMutation', 'abandonTemplateMutation'].includes(method)) return input === undefined;
    return undefined;
}
