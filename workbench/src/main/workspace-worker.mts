import path from 'node:path';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {LibraryError, openLibrary} from '../../../plugin-src/src/lib/file-library/index.mjs';
import {validateImportedRaster} from '../../../plugin-src/src/lib/image-validation/index.mjs';
import {sourceBytes} from './cover-worker.mts';
import {exact, libraryBinding, requireWrite, fail} from '../shared/validation.ts';
import {workspacePending, workspaceMaterialReference} from '../shared/workspace-validation.ts';
import type {LibraryBinding} from '../shared/contracts.ts';
import type {WorkspaceCoreDocument, WorkspaceCoreLibrary, WorkspaceCorePlan, WorkspaceCorePublication} from '../shared/workspace-core.d.ts';
import type {
    WorkspaceEntity, WorkspaceDocument, WorkspaceKind, WorkspaceLibrarySnapshot, WorkspaceMutation,
    WorkspaceObjectKind, WorkspacePending, WorkspaceReceipt, WorkspaceSchedule, WorkspaceWorkerOperations, WorkspaceTemplateFields, WorkspaceTemplateImage, WorkspaceMaterial, WorkspaceMaterialImport, WorkspaceMaterialReference
} from '../shared/workspace-contracts.ts';
import {TEMPLATE_IMPORT_LIMITS} from '../shared/workspace-contracts.ts';

export const isWorkspaceOperation = (op: unknown): op is keyof WorkspaceWorkerOperations => typeof op === 'string' && ['workspaceLibrary', 'workspaceMutate', 'workspaceRecover', 'workspaceImportTemplateImages', 'workspaceImportMaterial', 'workspaceReadMaterial', 'workspaceMaterialBytes'].includes(op);
const absolute = (source: unknown): source is string => typeof source === 'string' && source.length <= 32_768 && path.isAbsolute(source) && !source.includes('\0');
const rasterTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const materialExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.md', '.markdown', '.txt', '.pdf'];
function materialText(bytes: Uint8Array): string {
    if (bytes.byteLength > 1024 * 1024) fail('MATERIAL_LIMIT_EXCEEDED', '文字资料不能超过1 MiB。');
    let text;
    try { text = new TextDecoder('utf-8', {fatal: true}).decode(bytes); } catch { return fail('INVALID_DOCUMENT', '文字资料必须为完整的UTF-8文本。'); }
    if (text.includes('\0')) fail('INVALID_DOCUMENT', '文字资料不能包含二进制空字符。');
    return text;
}
async function checkedMaterial(library: WorkspaceCoreLibrary, assetHash: string) {
    const asset = library.readAsset(assetHash);
    let text: string | null = null;
    if (rasterTypes.includes(asset.detectedType)) {
        const decoded = await validateImportedRaster(Buffer.from(asset.data));
        if (decoded.assetHash !== assetHash || asset.detectedType !== `image/${decoded.format}`) fail('INVALID_IMAGE', '资料图片未通过完整解码与类型校验。');
    } else if (asset.detectedType === 'text/plain') text = materialText(asset.data);
    else if (asset.detectedType !== 'application/pdf') fail('UNSUPPORTED_MATERIAL', '仅支持PNG、JPEG、WebP、GIF、UTF-8文字及PDF资料。');
    library.readAsset(assetHash);
    return {asset, text};
}
async function importMaterial(library: WorkspaceCoreLibrary, source: string): Promise<WorkspaceMaterialImport> {
    const ext = path.extname(source).toLowerCase(), isText = ['.md', '.markdown', '.txt'].includes(ext);
    const bytes = sourceBytes(source, isText ? 1024 * 1024 : 64 * 1024 * 1024);
    let text: string | null = null, expectedType: string;
    if (isText) { text = materialText(bytes); expectedType = 'text/plain'; }
    else if (ext === '.pdf') {
        if (bytes.subarray(0, 5).toString() !== '%PDF-') fail('INVALID_DOCUMENT', '所选文件不含PDF标识。');
        expectedType = 'application/pdf';
    } else expectedType = `image/${(await validateImportedRaster(bytes)).format}`;
    const expectedHash = createHash('sha256').update(bytes).digest('hex');
    const imported = library.importAsset(source, {purpose: 'material'});
    if (imported.assetHash !== expectedHash) fail('SOURCE_CHANGED', '资料在读取后改变，请重新选择。');
    const stored = library.readAsset(expectedHash);
    if (stored.detectedType !== expectedType) fail('UNSUPPORTED_MATERIAL', '所选资料的实际类型与允许类型不符。');
    return {assetHash: expectedHash, originalName: path.basename(source), detectedType: stored.detectedType, bytes: stored.bytes, text, url: null};
}
function attachedMaterial(library: WorkspaceCoreLibrary, reference: WorkspaceMaterialReference) {
    const content = library.readContent(reference.contentId);
    const material = content.materials?.find(item => item.id === reference.materialId);
    if (!material || material.deletedAt || content.unavailableReferences?.some(item => item.kind === 'material' && (item.id === material.id || item.resolvedObjectId === material.id) && item.deletedAt)) fail('INVALID_STATE', '资料不存在、尚不可用或已被移除。');
    return material;
}
function materials(library: WorkspaceCoreLibrary, input: WorkspaceCoreDocument): WorkspaceMaterial[] {
    const available: WorkspaceMaterial[] = (input.materials ?? []).map(material => {
        const reference = input.unavailableReferences?.find(item => item.kind === 'material' && item.resolvedObjectId === material.id);
        const base = {id: material.id, originalName: material.originalName, role: material.role, deletedAt: material.deletedAt ?? reference?.deletedAt ?? null, url: null};
        try {
            const asset = library.readAsset(material.assetHash);
            return {...base, assetHash: material.assetHash, detectedType: asset.detectedType, bytes: asset.bytes, availability: 'available'};
        } catch (error) {
            // A lost historical attachment must not hide other records or block receipt recovery.
            if (!(error instanceof LibraryError) || error.code !== 'CORRUPT' && !(error.code === 'IO_ERROR' && ['ENOENT', 'EACCES', 'EPERM', 'EIO', 'ENOTDIR'].includes((error.cause as NodeJS.ErrnoException | undefined)?.code ?? ''))) throw error;
            return {...base, assetHash: null, detectedType: null, bytes: null, availability: 'unavailable'};
        }
    });
    const unavailable: WorkspaceMaterial[] = (input.unavailableReferences ?? []).filter(item => item.kind === 'material' && item.availability === 'unavailable').map(item => ({id: item.id, assetHash: null, originalName: item.originalName, role: 'material', detectedType: null, bytes: null, availability: 'unavailable', deletedAt: item.deletedAt ?? null, url: null}));
    return [...available, ...unavailable];
}
const selectedImages = (sources: unknown): sources is string[] => Array.isArray(sources) && sources.length > 0 && sources.length <= TEMPLATE_IMPORT_LIMITS.files && sources.every(source => absolute(source) && ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(path.extname(source).toLowerCase()));

async function importTemplateImages(library: WorkspaceCoreLibrary, sources: string[]): Promise<WorkspaceTemplateImage[]> {
    const total = sources.reduce((bytes, source) => {
        const stat = fs.lstatSync(source, {bigint: true});
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1n || stat.size > 64n * 1024n * 1024n) fail('INVALID_IMAGE', '请选择完整的普通图片文件，每张不超过64 MiB。');
        return bytes + stat.size;
    }, 0n);
    if (total > BigInt(TEMPLATE_IMPORT_LIMITS.encodedBytes)) fail('IMAGE_LIMIT_EXCEEDED', '这一组原图总大小不能超过256 MiB。');
    const images = new Map<string, WorkspaceTemplateImage>();
    let readBytes = 0;
    for (const source of sources) {
        const bytes = sourceBytes(source);
        readBytes += bytes.length;
        if (readBytes > TEMPLATE_IMPORT_LIMITS.encodedBytes) fail('IMAGE_LIMIT_EXCEEDED', '读取时原图总大小超过256 MiB。');
        const decoded = await validateImportedRaster(bytes);
        const asset = library.importAsset(source, {purpose: 'template-reference'});
        if (asset.assetHash !== decoded.assetHash) fail('SOURCE_CHANGED', '原图在完整解码后改变，请重新选择。');
        const stored = library.readAsset(decoded.assetHash);
        if (stored.detectedType !== `image/${decoded.format}`) fail('INVALID_IMAGE', '导入图片的类型与完整解码结果不一致。');
        if (!images.has(decoded.assetHash)) images.set(decoded.assetHash, {assetHash: decoded.assetHash, originalName: path.basename(source), width: decoded.width, height: decoded.height, url: ''});
    }
    return [...images.values()];
}

async function templatePackage(library: WorkspaceCoreLibrary, input: WorkspaceTemplateFields) {
    const resources: Record<string, {assetHash: string; bytes: number; detectedType: string; role: 'style'}> = {};
    let total = 0;
    for (const [index, assetHash] of input.styleAssetHashes.entries()) {
        const asset = library.readAsset(assetHash);
        total += asset.bytes;
        if (total > TEMPLATE_IMPORT_LIMITS.encodedBytes) fail('IMAGE_LIMIT_EXCEEDED', '模板样张总大小不能超过256 MiB。');
        const decoded = await validateImportedRaster(Buffer.from(asset.data));
        library.readAsset(assetHash);
        if (decoded.assetHash !== assetHash || asset.detectedType !== `image/${decoded.format}`) fail('INVALID_IMAGE', '模板样张未通过完整解码与类型校验。');
        resources[`style-${index + 1}`] = {assetHash, bytes: asset.bytes, detectedType: asset.detectedType, role: 'style'};
    }
    return {definition: {desc: input.description, rules: [...input.rules]}, resources};
}
const entity = ({id, title, editToken, createdAt, updatedAt, deletedAt}: WorkspaceEntity): WorkspaceEntity => ({id, title, editToken, createdAt, updatedAt, deletedAt});
function schedule(input: WorkspaceCorePlan | WorkspaceCorePublication): WorkspaceSchedule {
    const timing = input.schedule;
    if (timing?.precision === 'date') return {precision: 'date', date: timing.date};
    if (timing?.precision === 'instant') return {precision: 'instant', at: timing.at, timezone: timing.timezone};
    if (timing?.precision === 'local-minute') return {precision: 'local-minute', date: timing.date, time: timing.time, timezone: timing.timezone};
    const at = 'scheduledAt' in input ? input.scheduledAt : 'publishedAt' in input ? input.publishedAt : undefined;
    if (at && input.timezone) return {precision: 'instant', at, timezone: input.timezone};
    return fail('UNSUPPORTED_SCHEDULE', '排期时间格式无法完整表示，请升级工作台。');
}
function document(library: WorkspaceCoreLibrary, input: WorkspaceCoreDocument, kind: WorkspaceKind): WorkspaceDocument {
    return {
        ...entity(input), body: input.body, channelIds: [...input.channelIds ?? []], materials: materials(library, input),
        plans: (input.plans ?? []).map(plan => ({
            id: plan.id, channelId: plan.channelId, status: plan.status, schedule: schedule(plan),
            text: plan.text ?? null, textMode: plan.textMode ?? 'body', publicationId: plan.publicationId ?? null,
            coverChoice: plan.coverChoice ? ('candidateId' in plan.coverChoice ? {candidateId: plan.coverChoice.candidateId} : {variantId: plan.coverChoice.variantId}) : null
        })),
        publications: (input.publications ?? []).map(publication => {
            const frozen = kind === 'content' ? library.readPublication(input.id, publication.id) : library.readCollectionPublication(input.id, publication.id);
            return {
                id: publication.id, planId: publication.planId, channelId: publication.channelId,
                schedule: schedule(publication), url: publication.url ?? null,
                title: frozen.snapshot.content.title, body: frozen.body,
                text: frozen.snapshot.publicationText ? frozen.snapshot.publicationText.text : frozen.body,
                channelName: frozen.snapshot.channel?.name ?? null,
                coverCandidateId: frozen.snapshot.cover?.candidateId ?? null, recordedAt: frozen.snapshot.recordedAt ?? null
            };
        }),
        publicationEvents: (input.publicationEvents ?? []).map(({id, type, targetId, replacementId, reason, recordedAt}) => ({id, type, targetId, replacementId, reason, recordedAt})),
        candidates: (input.candidates ?? []).map(candidate => ({
            id: candidate.id, assetHash: candidate.assetHash, accepted: candidate.accepted, favorite: candidate.favorite ?? false,
            displayNumber: candidate.displayNumber ?? '', note: candidate.note ?? '', variantId: candidate.variantId ?? null
        })),
        coverVariants: (input.coverVariants ?? []).map(({id, name, ratio, preferredTemplateId, selectedCandidateId}) => ({id, name, ratio, preferredTemplateId, selectedCandidateId}))
    };
}
export function workspaceLibrary(library: WorkspaceCoreLibrary): WorkspaceLibrarySnapshot {
    const settings = library.readLibrarySettings();
    return {
        prompts: [...library.listPrompts(), ...library.listPromptTrash()].map(({id}) => {
            const prompt = library.readPrompt(id);
            return {...entity(prompt), body: prompt.body, category: prompt.category, summary: prompt.summary, when: prompt.when, tags: [...prompt.tags], enabled: prompt.enabled ?? true};
        }),
        photos: [...library.listPhotos(), ...library.listPhotoTrash()].map(photo => ({
            ...entity(photo), assetHash: photo.assetHash, isOwnPhoto: photo.isOwnPhoto,
            availability: photo.availability, originalName: photo.originalName
        })),
        templates: [...library.listTemplates(), ...library.listTemplateTrash()].map(template => {
            const pkg = library.readTemplate(template.id, template.currentVersion);
            return {
                ...entity(template), builtin: template.builtin === true, currentVersion: template.currentVersion,
                versions: template.versions.map(({version, packageHash}) => ({version, packageHash})),
                description: typeof pkg.definition.desc === 'string' ? pkg.definition.desc : '',
                rules: Array.isArray(pkg.definition.rules) ? pkg.definition.rules.filter((rule): rule is string => typeof rule === 'string') : [],
                styleAssetHashes: [...new Set(Object.values(pkg.resources).filter(resource => resource.role === 'style').map(resource => resource.assetHash))]
            };
        }),
        collections: [...library.listCollections(), ...library.listCollectionTrash()].map(({id}) => {
            const collection = library.readCollection(id);
            return {...document(library, collection, 'collection'), dateRange: {start: collection.dateRange?.start ?? null, end: collection.dateRange?.end ?? null}, memberIds: [...collection.memberIds ?? []]};
        }),
        contentDetails: [...library.listContents(), ...library.listTrash()].map(({id}) => {
            const content = library.readContent(id);
            return {...document(library, content, 'content'), recordedDate: content.recordedDate ?? null, plannedDate: content.plannedDate ?? null, preferredTemplateId: content.preferredTemplateId ?? null, isExample: content.isExample ?? false};
        }),
        settings: {
            editToken: settings.editToken,
            profile: {name: settings.profile.name, intro: settings.profile.intro, avatarAssetHash: settings.profile.avatarAssetHash, marks: settings.profile.marks.map(({key, value}) => ({key, value}))},
            defaults: {photoId: settings.defaults.photoId, templateId: settings.defaults.templateId, coverCount: settings.defaults.coverCount},
            channels: settings.channels.map(({id, name, ink, bg, requiredRatio, deletedAt}) => ({id, name, ink, bg, requiredRatio, deletedAt})),
            promptCategories: [...settings.promptCategories], visiblePromptCategories: [...settings.visiblePromptCategories], customRatios: [...settings.customRatios],
            defaultIssues: settings.defaultIssues.map(({field, id, reason}) => ({field, id, reason}))
        }
    };
}

function target(input: WorkspaceMutation): {kind: WorkspaceObjectKind; id: string | null} {
    if ('kind' in input) return {kind: input.kind, id: input.id};
    switch (input.op) {
        case 'createPrompt': return {kind: 'prompt', id: null};
        case 'updatePrompt': case 'setPromptEnabled': case 'trashPrompt': case 'restorePrompt': return {kind: 'prompt', id: input.id};
        case 'updatePhoto': case 'trashPhoto': case 'restorePhoto': return {kind: 'photo', id: input.id};
        case 'createTemplate': return {kind: 'template', id: null};
        case 'selectTemplateVersion': case 'addTemplateVersion': case 'trashTemplate': case 'restoreTemplate': return {kind: 'template', id: input.id};
        case 'createCollection': return {kind: 'collection', id: null};
        case 'updateCollection': case 'setCollectionMembers': case 'trashCollection': case 'restoreCollection': return {kind: 'collection', id: input.id};
        case 'updateContentMetadata': case 'attachMaterial': case 'removeMaterial': return {kind: 'content', id: input.id};
        default: return {kind: 'workspace', id: 'default'};
    }
}
function currentToken(library: WorkspaceCoreLibrary, input: WorkspaceMutation): string | null {
    const t = target(input);
    if (!t.id) return null;
    switch (t.kind) {
        case 'content': return library.readContent(t.id).editToken;
        case 'collection': return library.readCollection(t.id).editToken;
        case 'prompt': return library.readPrompt(t.id).editToken;
        case 'photo': return library.readPhoto(t.id).editToken;
        case 'template': {
            const record = [...library.listTemplates(), ...library.listTemplateTrash()].find(item => item.id === t.id);
            if (!record) return fail('CORRUPT', '原模板已丢失，保留待处理记录。');
            return record.editToken;
        }
        case 'workspace': return library.readLibrarySettings().editToken;
    }
}
function receipt(library: WorkspaceCoreLibrary, pending: WorkspacePending): WorkspaceReceipt | null {
    const found = library.queryMutation(pending.mutationId);
    if (!found) return null;
    const expected = target(pending.input);
    if (found.objectKind !== expected.kind || expected.id !== null && found.objectId !== expected.id) fail('CONFLICT', '事务回执不属于原操作，待处理记录已保留。');
    return {objectKind: found.objectKind, objectId: found.objectId};
}
async function mutate(library: WorkspaceCoreLibrary, pending: WorkspacePending): Promise<WorkspaceReceipt> {
    const input = pending.input, options = {mutationId: pending.mutationId};
    const changed = await (async () => {
        switch (input.op) {
            case 'createPrompt': return library.createPrompt({title: input.title, body: input.body, category: input.category, summary: input.summary, when: input.when, tags: input.tags}, options);
            case 'updatePrompt': return library.updatePrompt(input.id, {title: input.title, body: input.body, category: input.category, summary: input.summary, when: input.when, tags: input.tags}, input.editToken, options);
            case 'setPromptEnabled': return library.setPromptEnabled(input.id, input.enabled, input.editToken, options);
            case 'trashPrompt': return library.trashPrompt(input.id, input.editToken, options);
            case 'restorePrompt': return library.restorePrompt(input.id, input.editToken, options);
            case 'updatePhoto': return library.updatePhoto(input.id, {title: input.title, isOwnPhoto: input.isOwnPhoto}, input.editToken, options);
            case 'trashPhoto': return library.trashPhoto(input.id, input.editToken, options);
            case 'restorePhoto': return library.restorePhoto(input.id, input.editToken, options);
            case 'selectTemplateVersion': return library.selectTemplateVersion(input.id, input.version, input.editToken, options);
            case 'createTemplate': return library.createTemplate({name: input.name, ...await templatePackage(library, input)}, options);
            case 'addTemplateVersion': return library.addTemplateVersion(input.id, {version: input.version, ...await templatePackage(library, input)}, input.editToken, options);
            case 'attachMaterial': {
                await checkedMaterial(library, input.assetHash);
                return library.attachContentMaterial(input.id, {assetHash: input.assetHash, originalName: input.originalName, role: input.role}, input.editToken, options);
            }
            case 'removeMaterial': {
                const content = library.readContent(input.id);
                const reference = content.unavailableReferences?.find(item => item.kind === 'material' && (item.id === input.materialId || item.resolvedObjectId === input.materialId));
                if (reference?.availability === 'unavailable') return library.trashContentUnavailableReference(input.id, reference.id, input.editToken, options);
                if (reference) return library.trashContentMaterial(input.id, input.materialId, input.editToken, options);
                return library.removeContentMaterial(input.id, input.materialId, input.editToken, options);
            }
            case 'trashTemplate': return library.trashTemplate(input.id, input.editToken, options);
            case 'restoreTemplate': return library.restoreTemplate(input.id, input.editToken, options);
            case 'createCollection': return library.createCollection({title: input.title, body: input.body, channelIds: input.channelIds, dateRange: input.dateRange}, options);
            case 'updateCollection': return library.updateCollection(input.id, {title: input.title, body: input.body, channelIds: input.channelIds, dateRange: input.dateRange}, input.editToken, options);
            case 'trashCollection': return library.trashCollection(input.id, input.editToken, options);
            case 'restoreCollection': return library.restoreCollection(input.id, input.editToken, options);
            case 'setCollectionMembers': return library.setCollectionMembers(input.id, input.memberIds, input.editToken, options);
            case 'updateContentMetadata': return library.updateContent(input.id, {recordedDate: input.recordedDate, plannedDate: input.plannedDate, preferredTemplateId: input.preferredTemplateId, channelIds: input.channelIds, isExample: input.isExample}, input.editToken, options);
            case 'savePublicationPlan': return input.kind === 'content' ? library.savePublicationPlan(input.id, input.plan, input.editToken, options) : library.saveCollectionPublicationPlan(input.id, input.plan, input.editToken, options);
            case 'cancelPublicationPlan': return input.kind === 'content' ? library.cancelPublicationPlan(input.id, input.planId, input.editToken, options) : library.cancelCollectionPublicationPlan(input.id, input.planId, input.editToken, options);
            case 'recordPublication': {
                const record = {planId: input.planId, schedule: input.schedule, url: input.url};
                return input.kind === 'content' ? library.recordPublication(input.id, record, input.editToken, options) : library.recordCollectionPublication(input.id, record, input.editToken, options);
            }
            case 'correctPublication': {
                const correction = {reason: input.reason, text: input.text, schedule: input.schedule, url: input.url, ...(Object.hasOwn(input, 'coverChoice') ? {coverChoice: input.coverChoice} : {})};
                return input.kind === 'content' ? library.correctPublication(input.id, input.publicationId, correction, input.editToken, options) : library.correctCollectionPublication(input.id, input.publicationId, correction, input.editToken, options);
            }
            case 'retractPublication': return input.kind === 'content' ? library.retractPublication(input.id, input.publicationId, {reason: input.reason}, input.editToken, options) : library.retractCollectionPublication(input.id, input.publicationId, {reason: input.reason}, input.editToken, options);
            case 'updateCandidate': {
                const annotation = {favorite: input.favorite, displayNumber: input.displayNumber, note: input.note, variantId: input.variantId};
                return input.kind === 'content' ? library.updateCandidate(input.id, input.candidateId, annotation, input.editToken, options) : library.updateCollectionCandidate(input.id, input.candidateId, annotation, input.editToken, options);
            }
            case 'createChannel': return library.createChannel({name: input.name, ink: input.ink, bg: input.bg, requiredRatio: input.requiredRatio}, input.editToken, options);
            case 'updateChannel': return library.updateChannel(input.channelId, {name: input.name, ink: input.ink, bg: input.bg, requiredRatio: input.requiredRatio}, input.editToken, options);
            case 'trashChannel': return library.trashChannel(input.channelId, input.editToken, options);
            case 'restoreChannel': return library.restoreChannel(input.channelId, input.editToken, options);
            case 'updateProfile': return library.updateProfile(input.profile, input.editToken, options);
            case 'setGenerationDefaults': return library.setGenerationDefaults(input.defaults, input.editToken, options);
            case 'setPromptCategories': return library.setPromptCategories(input.values, input.editToken, options);
            case 'addCustomRatio': return library.addCustomRatio(input.ratio, input.editToken, options);
            case 'removeCustomRatio': return library.removeCustomRatio(input.ratio, input.editToken, options);
        }
    })();
    const expected = target(input);
    if (!changed || expected.id !== null && changed.id !== expected.id) fail('CONFLICT', '变更对象与请求不一致，请核验原事务。');
    return {objectKind: expected.kind, objectId: changed.id};
}

export async function executeWorkspace(op: keyof WorkspaceWorkerOperations, args: unknown, mode: 'required' | 'disabled' = 'required'): Promise<WorkspaceWorkerOperations[keyof WorkspaceWorkerOperations]['result']> {
    if (op === 'workspaceImportMaterial' || op === 'workspaceReadMaterial' || op === 'workspaceMaterialBytes') {
        const importing = op === 'workspaceImportMaterial';
        if (!exact(args, importing ? ['binding', 'source'] : ['binding', 'reference']) || !libraryBinding(args.binding) || !absolute(args.binding.root) || (importing ? !absolute(args.source) || !materialExtensions.includes(path.extname(args.source as string).toLowerCase()) : !workspaceMaterialReference(args.reference))) fail('INVALID_INPUT', '资料操作拒绝额外、路径或无效字段。');
        if (importing) requireWrite(mode);
        const binding = args.binding;
        const library = openLibrary(binding.root, {expectedLibraryId: binding.libraryId, expectedRootIdentity: binding.rootIdentity}) as unknown as WorkspaceCoreLibrary;
        if (importing) return importMaterial(library, args.source as string);
        const material = attachedMaterial(library, args.reference as WorkspaceMaterialReference);
        const {asset, text} = await checkedMaterial(library, material.assetHash);
        if (op === 'workspaceMaterialBytes') return {data: asset.data, detectedType: asset.detectedType, originalName: material.originalName};
        return {assetHash: material.assetHash, originalName: material.originalName, detectedType: asset.detectedType, bytes: asset.bytes, text, url: null};
    }
    if (op === 'workspaceImportTemplateImages') {
        requireWrite(mode);
        if (!exact(args, ['binding', 'sources']) || !libraryBinding(args.binding) || !absolute(args.binding.root) || !selectedImages(args.sources)) fail('INVALID_INPUT', '请选择1至50张PNG、JPEG、WebP或GIF原图。');
        const binding = args.binding;
        const library = openLibrary(binding.root, {expectedLibraryId: binding.libraryId, expectedRootIdentity: binding.rootIdentity}) as unknown as WorkspaceCoreLibrary;
        return importTemplateImages(library, args.sources);
    }
    if (!isWorkspaceOperation(op) || !exact(args, op === 'workspaceLibrary' ? ['binding'] : ['binding', 'pending']) || !libraryBinding(args.binding) || !path.isAbsolute(args.binding.root) || args.binding.root.includes('\0') || op !== 'workspaceLibrary' && !workspacePending(args.pending)) fail('INVALID_INPUT', '工作进程拒绝额外、路径或无效业务字段。');
    const binding = args.binding as LibraryBinding;
    if (op === 'workspaceMutate') requireWrite(mode);
    const pending = op === 'workspaceLibrary' ? null : args.pending as WorkspacePending;
    if (pending && (pending.binding.libraryId !== binding.libraryId || pending.binding.rootIdentity.dev !== binding.rootIdentity.dev || pending.binding.rootIdentity.ino !== binding.rootIdentity.ino)) fail('CONFLICT', '待处理操作绑定的内容库已改变，已保留原记录。');
    const library = openLibrary(binding.root, {expectedLibraryId: binding.libraryId, expectedRootIdentity: binding.rootIdentity}) as unknown as WorkspaceCoreLibrary;
    if (op === 'workspaceLibrary') return workspaceLibrary(library);
    if (op === 'workspaceMutate') return mutate(library, pending!);
    const found = receipt(library, pending!);
    const current = found ? null : currentToken(library, pending!.input);
    return {receipt: found, conflict: !found && current !== null && 'editToken' in pending!.input && current !== pending!.input.editToken};
}
