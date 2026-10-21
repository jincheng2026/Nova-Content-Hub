import {isRecord} from './contracts.ts';
import {exact, identity, token, uuid} from './validation.ts';
import type {WorkspaceMutation, WorkspacePending} from './workspace-contracts.ts';

const fields = (v: unknown, required: string[], optional: string[] = []): v is Record<string, unknown> => isRecord(v) && [Object.prototype, null].includes(Object.getPrototypeOf(v)) && required.every(k => Object.hasOwn(v, k)) && Object.keys(v).every(k => required.includes(k) || optional.includes(k));
const text = (v: unknown, max = 10_000, empty = false): v is string => typeof v === 'string' && v.length <= max && (empty || !!v.trim()) && !v.includes('\0');
const bool = (v: unknown): v is boolean => typeof v === 'boolean';
const channel = (v: unknown): v is string => typeof v === 'string' && /^[a-z][a-z0-9._-]{0,63}$/.test(v);
const template = (v: unknown): v is string => uuid(v) || typeof v === 'string' && /^builtin-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v) && v.length <= 160;
const nullable = (v: unknown, check: (value: unknown) => boolean) => v === null || check(v);
const list = (v: unknown, check: (value: unknown) => boolean, max = 100): v is unknown[] => Array.isArray(v) && v.length <= max && v.every(check) && new Set(v).size === v.length;
const day = (v: unknown): v is string => {
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    const date = new Date(`${v}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === v;
};
const instant = (v: unknown): v is string => {
    if (typeof v !== 'string' || v.length > 30) return false;
    const date = new Date(v);
    return Number.isFinite(date.getTime()) && date.toISOString() === v;
};
const zone = (v: unknown): v is string => {
    if (!text(v, 100) || !(v === 'UTC' || /^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+$/.test(v))) return false;
    try { new Intl.DateTimeFormat('en', {timeZone: v}); return true; } catch { return false; }
};
const ratio = (v: unknown): v is string => typeof v === 'string' && /^\d{1,6}:\d{1,6}$/.test(v) && v.split(':').every(n => Number(n) > 0);
const url = (v: unknown) => {
    if (v === null) return true;
    if (!text(v, 4096)) return false;
    try { const parsed = new URL(v); return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password; } catch { return false; }
};
export function workspaceSchedule(v: unknown): boolean {
    if (!isRecord(v)) return false;
    if (v.precision === 'date') return exact(v, ['precision', 'date']) && day(v.date);
    if (v.precision === 'instant') return exact(v, ['precision', 'at', 'timezone']) && instant(v.at) && zone(v.timezone);
    return exact(v, ['precision', 'date', 'time', 'timezone']) && v.precision === 'local-minute' && day(v.date) && typeof v.time === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v.time) && nullable(v.timezone, zone);
}
const coverChoice = (v: unknown) => v === null || exact(v, ['candidateId']) && uuid(v.candidateId) || exact(v, ['variantId']) && uuid(v.variantId);
const promptFields = ['title', 'body', 'category', 'summary', 'when', 'tags'];
const prompt = (v: Record<string, unknown>) => text(v.title, 500) && text(v.body, 1_000_000, true) && ['category', 'summary', 'when'].every(k => text(v[k], 10_000, true)) && list(v.tags, t => text(t, 500));
const channels = (v: unknown) => list(v, channel);
const dateRange = (v: unknown) => exact(v, ['start', 'end']) && nullable(v.start, day) && nullable(v.end, day) && (!v.start || !v.end || (v.start as string) <= (v.end as string));
const collectionFields = ['title', 'body', 'channelIds', 'dateRange'];
const collection = (v: Record<string, unknown>) => text(v.title, 500) && text(v.body, 1_000_000, true) && channels(v.channelIds) && dateRange(v.dateRange);
const channelFields = ['name', 'ink', 'bg', 'requiredRatio'];
const channelData = (v: Record<string, unknown>) => text(v.name, 500) && [v.ink, v.bg].every(c => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c)) && nullable(v.requiredRatio, ratio);
const ref = (v: Record<string, unknown>) => uuid(v.id) && token(v.editToken);
const owner = (v: Record<string, unknown>) => ref(v) && ['content', 'collection'].includes(v.kind as string);
const templateFields = ['description', 'rules', 'styleAssetHashes'];
const templateData = (v: Record<string, unknown>) => text(v.description, 10_000, true) && list(v.rules, rule => text(rule, 2000)) && list(v.styleAssetHashes, token, 50) && v.styleAssetHashes.length > 0;

export function workspaceMutation(v: unknown): v is WorkspaceMutation {
    if (!isRecord(v) || typeof v.op !== 'string') return false;
    switch (v.op) {
        case 'createPrompt': return fields(v, ['op', ...promptFields]) && prompt(v);
        case 'updatePrompt': return fields(v, ['op', 'id', 'editToken', ...promptFields]) && ref(v) && prompt(v);
        case 'setPromptEnabled': return fields(v, ['op', 'id', 'editToken', 'enabled']) && ref(v) && bool(v.enabled);
        case 'setPromptFavorite': return fields(v, ['op', 'id', 'editToken', 'favorite']) && ref(v) && bool(v.favorite);
        case 'trashPrompt': case 'restorePrompt': case 'trashPhoto': case 'restorePhoto': case 'trashCollection': case 'restoreCollection':
            return fields(v, ['op', 'id', 'editToken']) && ref(v);
        case 'trashTemplate': case 'restoreTemplate':
            return fields(v, ['op', 'id', 'editToken']) && template(v.id) && token(v.editToken);
        case 'updatePhoto': return fields(v, ['op', 'id', 'editToken', 'title', 'isOwnPhoto']) && ref(v) && text(v.title, 500) && bool(v.isOwnPhoto);
        case 'selectTemplateVersion': return fields(v, ['op', 'id', 'editToken', 'version']) && template(v.id) && token(v.editToken) && Number.isSafeInteger(v.version) && (v.version as number) > 0 && (v.version as number) <= 1_000_000;
        case 'deriveTemplate': return fields(v, ['op', 'sourceTemplateId', 'sourceVersion', 'sourcePackageHash', 'name']) && template(v.sourceTemplateId) && Number.isSafeInteger(v.sourceVersion) && (v.sourceVersion as number) > 0 && (v.sourceVersion as number) <= 1_000_000 && token(v.sourcePackageHash) && text(v.name, 500);
        case 'createTemplate': return fields(v, ['op', 'name', ...templateFields]) && text(v.name, 500) && templateData(v);
        case 'addTemplateVersion': return fields(v, ['op', 'id', 'editToken', 'version', ...templateFields]) && ref(v) && Number.isSafeInteger(v.version) && (v.version as number) > 0 && (v.version as number) <= 1_000_000 && templateData(v);
        case 'attachMaterial': return fields(v, ['op', 'id', 'editToken', 'assetHash', 'originalName', 'role']) && ref(v) && token(v.assetHash) && text(v.originalName, 255) && !/[\\/\u0000-\u001f]/.test(v.originalName) && ['material', 'reference'].includes(v.role as string);
        case 'removeMaterial': return fields(v, ['op', 'id', 'editToken', 'materialId']) && ref(v) && uuid(v.materialId);
        case 'createCollection': return fields(v, ['op', ...collectionFields]) && collection(v);
        case 'updateCollection': return fields(v, ['op', 'id', 'editToken', ...collectionFields]) && ref(v) && collection(v);
        case 'setCollectionMembers': return fields(v, ['op', 'id', 'editToken', 'memberIds']) && ref(v) && list(v.memberIds, uuid, 10_000);
        case 'updateContentMetadata': return fields(v, ['op', 'id', 'editToken', 'recordedDate', 'plannedDate', 'preferredTemplateId', 'channelIds', 'isExample']) && ref(v) && nullable(v.recordedDate, day) && nullable(v.plannedDate, day) && nullable(v.preferredTemplateId, template) && channels(v.channelIds) && bool(v.isExample);
        case 'savePublicationPlan': return fields(v, ['op', 'id', 'editToken', 'kind', 'plan']) && owner(v) && fields(v.plan, ['channelId', 'text', 'schedule', 'coverChoice'], ['id']) && (!Object.hasOwn(v.plan, 'id') || uuid(v.plan.id)) && channel(v.plan.channelId) && text(v.plan.text, 1_000_000, true) && workspaceSchedule(v.plan.schedule) && coverChoice(v.plan.coverChoice);
        case 'cancelPublicationPlan': return fields(v, ['op', 'id', 'editToken', 'kind', 'planId']) && owner(v) && uuid(v.planId);
        case 'recordPublication': return fields(v, ['op', 'id', 'editToken', 'kind', 'planId', 'schedule', 'url']) && owner(v) && uuid(v.planId) && workspaceSchedule(v.schedule) && url(v.url);
        case 'correctPublication': return fields(v, ['op', 'id', 'editToken', 'kind', 'publicationId', 'reason', 'text', 'schedule', 'url'], ['coverChoice']) && owner(v) && uuid(v.publicationId) && text(v.reason) && text(v.text, 1_000_000, true) && workspaceSchedule(v.schedule) && url(v.url) && (!Object.hasOwn(v, 'coverChoice') || coverChoice(v.coverChoice));
        case 'retractPublication': return fields(v, ['op', 'id', 'editToken', 'kind', 'publicationId', 'reason']) && owner(v) && uuid(v.publicationId) && text(v.reason);
        case 'updateCandidate': return fields(v, ['op', 'id', 'editToken', 'kind', 'candidateId', 'favorite', 'displayNumber', 'note', 'variantId']) && owner(v) && uuid(v.candidateId) && bool(v.favorite) && text(v.displayNumber, 500, true) && text(v.note, 10_000, true) && nullable(v.variantId, uuid);
        case 'createChannel': return fields(v, ['op', 'editToken', ...channelFields]) && token(v.editToken) && channelData(v);
        case 'updateChannel': return fields(v, ['op', 'channelId', 'editToken', ...channelFields]) && token(v.editToken) && channel(v.channelId) && channelData(v);
        case 'trashChannel': case 'restoreChannel': return fields(v, ['op', 'channelId', 'editToken']) && token(v.editToken) && channel(v.channelId);
        case 'updateProfile': return fields(v, ['op', 'editToken', 'profile']) && token(v.editToken) && fields(v.profile, ['name', 'intro', 'avatarAssetHash', 'marks']) && text(v.profile.name, 10_000, true) && text(v.profile.intro, 10_000, true) && nullable(v.profile.avatarAssetHash, token) && Array.isArray(v.profile.marks) && v.profile.marks.length <= 100 && v.profile.marks.every(m => fields(m, ['key', 'value']) && text(m.key, 500) && text(m.value, 10_000, true));
        case 'setGenerationDefaults': return fields(v, ['op', 'editToken', 'defaults']) && token(v.editToken) && fields(v.defaults, ['photoId', 'templateId', 'coverCount']) && nullable(v.defaults.photoId, uuid) && nullable(v.defaults.templateId, template) && Number.isSafeInteger(v.defaults.coverCount) && (v.defaults.coverCount as number) >= 1 && (v.defaults.coverCount as number) <= 20;
        case 'setPromptCategories': return fields(v, ['op', 'editToken', 'values']) && token(v.editToken) && list(v.values, value => text(value, 500));
        case 'addCustomRatio': case 'removeCustomRatio': return fields(v, ['op', 'editToken', 'ratio']) && token(v.editToken) && ratio(v.ratio);
        default: return false;
    }
}

export function workspacePending(v: unknown): v is WorkspacePending {
    return exact(v, ['mutationId', 'input', 'binding']) && uuid(v.mutationId) && workspaceMutation(v.input) && exact(v.binding, ['libraryId', 'rootIdentity']) && uuid(v.binding.libraryId) && identity(v.binding.rootIdentity);
}
export function workspaceDesktopInput(method: string, input: unknown): boolean | undefined {
    if (method === 'openPublicationLink') return exact(input, ['kind', 'id', 'publicationId']) && ['content', 'collection'].includes(input.kind as string) && uuid(input.id) && uuid(input.publicationId);
    if (method === 'mutateWorkspace') return workspaceMutation(input);
    if (method === 'readContentMaterial' || method === 'exportContentMaterial') return workspaceMaterialReference(input);
    if (method === 'revealTemplateFolder') return fields(input, ['templateId']) && template(input.templateId);
    if (['revealLibraryFolder', 'chooseTemplateFolder', 'chooseTemplateImages', 'chooseContentMaterial', 'readWorkspaceLibrary', 'recoverWorkspaceMutation', 'retryWorkspaceMutation', 'abandonWorkspaceMutation'].includes(method)) return input === undefined;
    return undefined;
}
export function workspaceMaterialReference(input: unknown): input is import('./workspace-contracts.ts').WorkspaceMaterialReference {
    return exact(input, ['contentId', 'materialId']) && uuid(input.contentId) && uuid(input.materialId);
}
