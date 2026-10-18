import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HASH = /^[0-9a-f]{64}$/;
const CHANNEL = /^[a-z][a-z0-9._-]{0,63}$/;
const plain = value => !!value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const keys = (value, allowed) => plain(value) && Object.keys(value).every(key => allowed.includes(key));
const str = (value, empty = false) => typeof value === 'string' && (empty || !!value.trim()) && value.length <= 10000;
const iso = value => {
    try {
        return typeof value === 'string' && new Date(value).toISOString() === value;
    } catch {
        return false;
    }
};
const day = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && iso(`${value}T00:00:00.000Z`);
const zone = value => {
    try {
        return str(value) && (value === 'UTC' || /^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+$/.test(value)) && !!new Intl.DateTimeFormat('en', {timeZone: value});
    } catch {
        return false;
    }
};
const listOf = (values, check) => Array.isArray(values) && values.every(check) && new Set(values).size === values.length;
const ref = value => value === null || typeof value === 'string' && (UUID.test(value) || /^builtin-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value));
const template = value => keys(value, ['id', 'version', 'packageHash']) && value.id !== null && ref(value.id) && Number.isSafeInteger(value.version) && value.version > 0 && HASH.test(value.packageHash);
const urlOK = value => {
    if (value === null) return true;
    try {
        const u = new URL(value);
        return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password;
    } catch {
        return false;
    }
};
const uniqueObjects = values => Array.isArray(values) && values.every(value => plain(value) && UUID.test(value.id)) && new Set(values.map(value => value.id)).size === values.length;
const COMMON = ['format', 'schemaVersion', 'id', 'title', 'revision', 'createdAt', 'updatedAt', 'deletedAt'];
const BUSINESS = ['materials', 'candidates', 'selectedCover', 'plans', 'publications', 'publicationEvents', 'coverVariants', 'importedCoverBatches', 'unavailableReferences', 'channelIds'];

export function normalizeRatio(value) {
    if (typeof value !== 'string' || !/^\d{1,6}:\d{1,6}$/.test(value)) return null;
    let [a, b] = value.split(':').map(Number);
    if (!a || !b) return null;
    const gcd = (x, y) => y ? gcd(y, x % y) : x, divisor = gcd(a, b);
    return `${a / divisor}:${b / divisor}`;
}

export function validSchedule(value) {
    if (!plain(value)) return false;
    if (value.precision === 'date') return keys(value, ['precision', 'date']) && day(value.date);
    if (value.precision === 'local-minute') return keys(value, ['precision', 'date', 'time', 'timezone']) && day(value.date) && typeof value.time === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value.time) && (value.timezone === null || zone(value.timezone));
    return value.precision === 'instant' && keys(value, ['precision', 'at', 'timezone']) && iso(value.at) && zone(value.timezone);
}

function legacyInstant(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return null;
    try {
        const canonical = new Date(value).toISOString();
        return canonical.startsWith(value.slice(0, 19)) ? canonical : null;
    } catch {
        return null;
    }
}

const defaultChannels = () => [
    ['douyin', '抖音', '#16181d', '#eceef1', '3:4'],
    ['xiaohongshu', '小红书', '#d6336c', '#fce9ef', '1:1'],
    ['wechat-channels', '视频号', '#0f7b3b', '#e6f4ea', '3:4'],
    ['wechat-official', '公众号', '#a15c00', '#fbf0dd', '47:20'],
    ['bilibili', 'B 站', '#0a7ea4', '#e3f3f9', '16:9'],
].map(([id, name, ink, bg, requiredRatio]) => ({id, name, ink, bg, requiredRatio, builtinKey: id, deletedAt: null}));

export function modelDefaults(kind) {
    if (kind === 'workspace') return {
        profile: {name: '', intro: '', avatarAssetHash: null, marks: []},
        defaults: {photoId: null, templateId: null, coverCount: 4},
        channels: defaultChannels(),
        promptCategories: [],
        customRatios: []
    };
    if (kind === 'prompt') return {enabled: true};
    if (!['content', 'collection'].includes(kind)) return {};
    return {
        materials: [],
        candidates: [],
        selectedCover: null,
        plans: [],
        publications: [],
        publicationEvents: [],
        coverVariants: [],
        importedCoverBatches: [],
        unavailableReferences: [],
        channelIds: [], ...(kind === 'content' ? {
            recordedDate: null,
            plannedDate: null,
            preferredTemplateId: null,
            isExample: false,
            coverJobs: []
        } : {dateRange: {start: null, end: null}, memberIds: []})
    };
}

export function extendModel(meta, kind = 'content') {
    return {...modelDefaults(kind), ...meta, schemaVersion: kind === 'content' ? 4 : 1};
}

export function validateModelMetadata(meta, kind, fail, validateCoverJobs) {
    const check = (ok, label) => {
        if (!ok) fail('CORRUPT', `Invalid ${kind} ${label}`);
    };
    if (kind === 'workspace') {
        check(keys(meta, [...COMMON, 'profile', 'defaults', 'channels', 'promptCategories', 'customRatios']) && meta.id === 'default' && meta.deletedAt === null, 'shape');
        const p = meta.profile, d = meta.defaults;
        check(keys(p, ['name', 'intro', 'avatarAssetHash', 'marks']) && str(p.name, true) && str(p.intro, true) && (p.avatarAssetHash === null || HASH.test(p.avatarAssetHash)) && Array.isArray(p.marks) && p.marks.every(mark => keys(mark, ['key', 'value']) && str(mark.key) && str(mark.value, true)), 'profile');
        check(keys(d, ['photoId', 'templateId', 'coverCount']) && (d.photoId === null || UUID.test(d.photoId)) && ref(d.templateId) && Number.isSafeInteger(d.coverCount) && d.coverCount >= 1 && d.coverCount <= 20, 'defaults');
        check(Array.isArray(meta.channels) && meta.channels.every(plain) && new Set(meta.channels.map(c => c.id)).size === meta.channels.length, 'channels');
        for (const c of meta.channels) check(keys(c, ['id', 'name', 'ink', 'bg', 'requiredRatio', 'builtinKey', 'deletedAt']) && CHANNEL.test(c.id) && str(c.name) && /^#[0-9a-fA-F]{6}$/.test(c.ink) && /^#[0-9a-fA-F]{6}$/.test(c.bg) && (c.requiredRatio === null || normalizeRatio(c.requiredRatio) === c.requiredRatio) && (c.builtinKey === null || str(c.builtinKey)) && (c.deletedAt === null || iso(c.deletedAt)), 'channel');
        check(listOf(meta.promptCategories, value => str(value)) && listOf(meta.customRatios, value => normalizeRatio(value) === value), 'catalogs');
        return;
    }
    check(keys(meta, [...COMMON, ...BUSINESS, ...(kind === 'content' ? ['recordedDate', 'plannedDate', 'preferredTemplateId', 'isExample', 'coverJobs'] : ['dateRange', 'memberIds'])]), 'shape');
    if (kind === 'content') {
        check((meta.recordedDate === null || day(meta.recordedDate)) && (meta.plannedDate === null || day(meta.plannedDate)) && ref(meta.preferredTemplateId) && typeof meta.isExample === 'boolean', 'description');
        validateCoverJobs(meta, fail);
    } else check(keys(meta.dateRange, ['start', 'end']) && [meta.dateRange.start, meta.dateRange.end].every(value => value === null || day(value)) && (!meta.dateRange.start || !meta.dateRange.end || meta.dateRange.start <= meta.dateRange.end) && listOf(meta.memberIds, value => UUID.test(value)), 'members/dates');
    check(listOf(meta.channelIds, value => CHANNEL.test(value)), 'channel IDs');
    for (const key of ['materials', 'candidates', 'plans', 'publications', 'publicationEvents', 'coverVariants', 'importedCoverBatches', 'unavailableReferences']) check(uniqueObjects(meta[key]), key);
    for (const m of meta.materials) check(keys(m, ['id', 'assetHash', 'originalName', 'role', 'createdAt', 'deletedAt']) && HASH.test(m.assetHash) && str(m.originalName, true) && str(m.role) && iso(m.createdAt) && (m.deletedAt === undefined || m.deletedAt === null || iso(m.deletedAt)), 'material');
    for (const c of meta.candidates) check(keys(c, ['id', 'assetHash', 'requestId', 'attemptId', 'template', 'source', 'originalName', 'accepted', 'createdAt', 'acceptedAt', 'variantId', 'favorite', 'displayNumber', 'note', 'provenance']) && HASH.test(c.assetHash) && str(c.requestId) && str(c.attemptId) && (c.template === null || template(c.template)) && typeof c.accepted === 'boolean' && iso(c.createdAt) && (c.accepted ? iso(c.acceptedAt) : c.acceptedAt === undefined) && (c.source === undefined || str(c.source)) && (c.originalName === undefined || str(c.originalName, true)) && (c.variantId === undefined || c.variantId === null || meta.coverVariants.some(v => v.id === c.variantId)) && (c.favorite === undefined || typeof c.favorite === 'boolean') && (c.displayNumber === undefined || str(c.displayNumber, true)) && (c.note === undefined || str(c.note, true)) && (c.provenance === undefined || provenance(c.provenance)), 'candidate');
    const knownCandidate = value => meta.candidates.some(c => c.id === value) || meta.unavailableReferences.some(r => r.id === value && r.kind === 'candidate');
    for (const v of meta.coverVariants) check(keys(v, ['id', 'name', 'ratio', 'preferredTemplateId', 'selectedCandidateId']) && str(v.name) && normalizeRatio(v.ratio) === v.ratio && ref(v.preferredTemplateId) && (v.selectedCandidateId === null || knownCandidate(v.selectedCandidateId)), 'variant');
    for (const r of meta.unavailableReferences) check(keys(r, ['id', 'kind', 'originalId', 'reason', 'originalName', 'provenance', 'availability', 'assetHash', 'resolvedObjectId', 'deletedAt']) && ['material', 'candidate', 'template-image'].includes(r.kind) && str(r.originalId) && str(r.reason) && str(r.originalName, true) && provenance(r.provenance) && (r.deletedAt === undefined || r.deletedAt === null || iso(r.deletedAt)) && (r.availability === 'unavailable' ? r.assetHash === undefined && r.resolvedObjectId === undefined : r.availability === 'available' && HASH.test(r.assetHash) && (r.kind === 'template-image' ? r.resolvedObjectId === null : (r.kind === 'candidate' ? meta.candidates : meta.materials).some(v => v.id === r.resolvedObjectId && v.assetHash === r.assetHash))), 'import reference');
    for (const b of meta.importedCoverBatches) check(keys(b, ['id', 'displayNumber', 'date', 'templateGroupId', 'candidateIds', 'referenceCandidateIds', 'originalStatus', 'provenance']) && str(b.displayNumber, true) && (b.date === null || day(b.date)) && (b.templateGroupId === null || str(b.templateGroupId)) && listOf(b.candidateIds, knownCandidate) && listOf(b.referenceCandidateIds, knownCandidate) && str(b.originalStatus, true) && provenance(b.provenance), 'imported batch');
    check(meta.selectedCover === null || keys(meta.selectedCover, ['candidateId', 'assetHash', 'requestId', 'attemptId', 'template', 'selectedAt']), 'selected cover shape');
    if (meta.selectedCover) {
        const c = meta.candidates.find(c => c.id === meta.selectedCover.candidateId), s = meta.selectedCover;
        check(c && c.accepted && c.assetHash === s.assetHash && c.requestId === s.requestId && c.attemptId === s.attemptId && isDeepStrictEqual(c.template, s.template) && iso(s.selectedAt), 'selected cover');
    }
    for (const p of meta.plans) {
        const modern = Object.hasOwn(p, 'schedule');
        check(keys(p, ['id', 'channelId', 'scheduledAt', 'timezone', 'schedule', 'text', 'textMode', 'coverChoice', 'status', 'createdAt', 'updatedAt', 'publicationId']) && CHANNEL.test(p.channelId) && ['planned', 'cancelled', 'published'].includes(p.status) && iso(p.createdAt) && iso(p.updatedAt) && (p.status === 'published' ? UUID.test(p.publicationId) : p.publicationId === undefined), 'plan');
        check(modern ? validSchedule(p.schedule) && ['explicit', 'body'].includes(p.textMode) && (p.textMode === 'body' ? p.text === null : typeof p.text === 'string') && coverChoice(p.coverChoice, meta) : iso(p.scheduledAt) && zone(p.timezone), 'plan content/schedule');
    }
    for (const e of meta.publicationEvents) check(keys(e, ['id', 'type', 'targetId', 'replacementId', 'reason', 'recordedAt']) && ['corrected', 'retracted'].includes(e.type) && meta.publications.some(p => p.id === e.targetId) && (e.type === 'corrected' ? meta.publications.findIndex(p => p.id === e.replacementId) > meta.publications.findIndex(p => p.id === e.targetId) && meta.publications.some(p => p.id === e.replacementId && p.planId === meta.publications.find(p => p.id === e.targetId).planId) : e.replacementId === null) && str(e.reason) && iso(e.recordedAt), 'publication event');
    check(new Set(meta.publicationEvents.map(e => e.targetId)).size === meta.publicationEvents.length, 'one terminal publication event');
    const active = meta.publications.filter(p => !meta.publicationEvents.some(e => e.targetId === p.id));
    for (const p of meta.publications) {
        check(keys(p, ['id', 'publicationId', 'snapshotId', 'planId', 'channelId', 'publishedAt', 'timezone', 'schedule', 'url', 'snapshotHash']) && p.id === p.publicationId && p.id === p.snapshotId && UUID.test(p.planId) && CHANNEL.test(p.channelId) && HASH.test(p.snapshotHash) && urlOK(p.url) && (Object.hasOwn(p, 'schedule') ? validSchedule(p.schedule) : iso(p.publishedAt) && zone(p.timezone)), 'publication');
        const plan = meta.plans.find(plan => plan.id === p.planId);
        check(plan && plan.channelId === p.channelId, 'publication plan');
        if (active.includes(p)) check(plan.status === 'published' && plan.publicationId === p.id, 'active publication');
    }
    for (const plan of meta.plans) if (plan.status === 'published') check(active.filter(p => p.id === plan.publicationId && p.planId === plan.id).length === 1, 'plan receipt');
}

function provenance(value) {
    return value === null || keys(value, ['source', 'originalId', 'note']) && str(value.source) && (value.originalId === undefined || str(value.originalId)) && (value.note === undefined || str(value.note, true));
}

function coverChoice(value, meta) {
    return value === null || keys(value, ['variantId']) && Object.keys(value).length === 1 && meta.coverVariants.some(v => v.id === value.variantId) || keys(value, ['candidateId']) && Object.keys(value).length === 1 && meta.candidates.some(c => c.id === value.candidateId);
}

export function modelMethods(h) {
    const {
        root,
        locked,
        mutate,
        list,
        snapshot,
        result,
        metadata,
        hash,
        jsonBytes,
        read,
        safePath,
        directory,
        ensureDirectory,
        writeNew,
        syncDirectory,
        hook,
        inputFields,
        text,
        id,
        objectId,
        checkedHash,
        templatePackage,
        readAssetInternal,
        fail
    } = h;
    const readObject = (kind, value) => result(snapshot(root, objectId(kind, value), kind), value, undefined, kind);
    const settings = () => readObject('workspace', 'default');
    const invalid = (ok, label) => {
        if (!ok) fail('INVALID_INPUT', label);
    };
    const fields = (raw, allowed, required = []) => inputFields(raw, allowed, required);
    const title = value => invalid(typeof value === 'string' && !!value.trim() && value.length <= 500, 'Expected title with 1–500 characters');
    const checkedRatio = value => {
        const ratio = normalizeRatio(value);
        invalid(ratio, 'Expected a positive width:height ratio');
        return ratio;
    };
    const checkedSchedule = value => {
        invalid(validSchedule(value), 'Invalid publication schedule');
        return structuredClone(value);
    };
    const activeTemplate = value => {
        if (value === null) return;
        const t = readObject('template', value);
        invalid(t.deletedAt === null, 'Template is trashed');
    };
    const activeChannel = value => {
        const c = settings().channels.find(c => c.id === value);
        invalid(c && c.deletedAt === null, 'Channel is missing or trashed');
        return c;
    };
    const channels = values => {
        invalid(listOf(values, value => CHANNEL.test(value)), 'Expected unique channel IDs');
        values.forEach(activeChannel);
    };
    const change = (kind, value, action, input, token, options, edit) => mutate('update', value, {action, ...input}, token, options, kind, (meta, before) => edit(extendModel(meta, kind), before));
    const settingChange = (action, input, token, options, edit) => mutate('update', 'default', {action, ...input}, token, options, 'workspace', edit);

    function contentInput(raw, creating, kind = 'content') {
        const input = fields(raw, ['title', 'body', 'channelIds', ...(kind === 'content' ? ['recordedDate', 'plannedDate', 'preferredTemplateId', 'isExample'] : ['dateRange'])], creating ? ['title', 'body'] : []);
        invalid(Object.keys(input).length, 'Empty patch');
        if (Object.hasOwn(input, 'title')) title(input.title);
        if (Object.hasOwn(input, 'body')) invalid(typeof input.body === 'string', 'Body must be text');
        for (const key of ['recordedDate', 'plannedDate']) if (Object.hasOwn(input, key)) invalid(input[key] === null || day(input[key]), 'Expected YYYY-MM-DD or null');
        if (Object.hasOwn(input, 'isExample')) invalid(typeof input.isExample === 'boolean', 'isExample must be boolean');
        if (Object.hasOwn(input, 'preferredTemplateId')) {
            invalid(ref(input.preferredTemplateId), 'Invalid template ID');
        }
        if (Object.hasOwn(input, 'dateRange')) {
            const r = input.dateRange;
            invalid(keys(r, ['start', 'end']) && [r.start, r.end].every(v => v === null || day(v)) && (!r.start || !r.end || r.start <= r.end), 'Invalid date range');
        }
        return input;
    }

    function editContent(input, kind) {
        return meta => {
            if (input.channelIds) channels(input.channelIds);
            if (input.preferredTemplateId) activeTemplate(input.preferredTemplateId);
            const {body, ...rest} = input;
            return {...extendModel(meta, kind), ...rest};
        };
    }

    const createContent = (raw, options) => {
        const input = contentInput(raw, true);
        return mutate('create', null, input, null, options, 'content', editContent(input, 'content'));
    };
    const updateContent = (value, raw, token, options) => {
        const input = contentInput(raw, false);
        return mutate('update', value, input, token, options, 'content', editContent(input, 'content'));
    };

    function candidateCover(meta, candidateId) {
        const c = meta.candidates.find(c => c.id === candidateId);
        invalid(c, 'Unknown or unavailable candidate');
        invalid(!meta.unavailableReferences.some(r => (r.id === candidateId || r.resolvedObjectId === candidateId) && r.deletedAt), 'Candidate import reference is trashed');
        image(c.assetHash);
        if (c.template) templatePackage(root, c.template.id, c.template.version, c.template.packageHash);
        return {
            candidateId: c.id,
            assetHash: c.assetHash,
            requestId: c.requestId,
            attemptId: c.attemptId,
            template: c.template,
            selectedAt: new Date().toISOString()
        };
    }

    function image(assetHash) {
        const asset = readAssetInternal(root, checkedHash(assetHash));
        invalid(['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(asset.detectedType), 'A raster image is required');
        return asset;
    }

    function select(kind, value, candidateId, token, options, variantId) {
        id(candidateId);
        if (variantId) id(variantId);
        return change(kind, value, 'selectCover', {candidateId, variantId: variantId || null}, token, options, meta => {
            const selected = candidateCover(meta, candidateId);
            if (variantId) invalid(meta.coverVariants.some(v => v.id === variantId), 'Unknown variant');
            return {
                ...meta,
                candidates: meta.candidates.map(c => c.id === candidateId ? {
                    ...c,
                    accepted: true,
                    acceptedAt: selected.selectedAt
                } : c), ...(variantId ? {
                    coverVariants: meta.coverVariants.map(v => v.id === variantId ? {
                        ...v,
                        selectedCandidateId: candidateId
                    } : v)
                } : {selectedCover: selected})
            };
        });
    }

    function savePlan(kind, value, raw, token, options) {
        const input = fields(raw, ['id', 'channelId', 'text', 'schedule', 'coverChoice', 'scheduledAt', 'timezone'], ['channelId']);
        if (input.id !== undefined) id(input.id);
        invalid(CHANNEL.test(input.channelId), 'Invalid channel ID');
        const modern = Object.hasOwn(input, 'schedule');
        if (modern) {
            checkedSchedule(input.schedule);
            invalid(typeof input.text === 'string', 'A new plan requires explicit text, including empty text');
            invalid(input.scheduledAt === undefined && input.timezone === undefined, 'Use one schedule representation');
        } else {
            input.scheduledAt = legacyInstant(input.scheduledAt);
            invalid(iso(input.scheduledAt) && zone(input.timezone), 'Expected legacy instant/timezone or schedule');
            invalid(input.text === undefined || typeof input.text === 'string', 'Text must be a string');
        }
        return change(kind, value, 'savePlan', input, token, options, meta => {
            if (modern || settings().channels.some(c => c.id === input.channelId)) activeChannel(input.channelId);
            const old = input.id ? meta.plans.find(p => p.id === input.id) : null;
            if (input.id) invalid(old, 'Unknown plan');
            if (old?.status === 'published') fail('INVALID_STATE', 'Published plans require correction/retraction');
            const choice = input.coverChoice === undefined ? (old?.coverChoice ?? null) : input.coverChoice;
            invalid(coverChoice(choice, meta), 'Unknown cover choice');
            if (input.coverChoice?.candidateId) candidateCover(meta, input.coverChoice.candidateId);
            if (input.coverChoice?.variantId) {
                const v = meta.coverVariants.find(v => v.id === input.coverChoice.variantId);
                if (v.selectedCandidateId) invalid(!meta.unavailableReferences.some(r => r.id === v.selectedCandidateId && r.deletedAt), 'Variant candidate import reference is trashed');
            }
            const now = new Date().toISOString(), plan = {
                id: old?.id || randomUUID(),
                channelId: input.channelId,
                schedule: modern ? structuredClone(input.schedule) : {
                    precision: 'instant',
                    at: input.scheduledAt,
                    timezone: input.timezone
                },
                textMode: typeof input.text === 'string' ? 'explicit' : old?.textMode || 'body',
                text: typeof input.text === 'string' ? input.text : old?.text ?? null,
                coverChoice: choice,
                status: 'planned',
                createdAt: old?.createdAt || now,
                updatedAt: now
            };
            return {...meta, plans: old ? meta.plans.map(p => p.id === plan.id ? plan : p) : [...meta.plans, plan]};
        });
    }

    function publicationInput(raw, historical = false) {
        const input = fields(raw, ['planId', 'schedule', 'publishedAt', 'timezone', 'url', ...(historical ? ['publicationText', 'cover', 'source', 'channelName'] : [])], ['planId']);
        id(input.planId);
        if (input.schedule !== undefined) {
            checkedSchedule(input.schedule);
            invalid(input.publishedAt === undefined && input.timezone === undefined, 'Use one publication schedule');
        } else {
            input.publishedAt = legacyInstant(input.publishedAt);
            invalid(iso(input.publishedAt) && zone(input.timezone), 'Invalid publication instant/timezone');
        }
        if (input.url !== undefined) invalid(urlOK(input.url), 'Publication URL must be HTTP(S)');
        if (historical) {
            if (input.channelName !== undefined && input.channelName !== null) text(input.channelName, 'historical channelName');
            invalid(Object.hasOwn(input, 'publicationText') && (input.publicationText === null || typeof input.publicationText === 'string'), 'Historical text must be explicit text or null (unknown)');
            invalid(Object.hasOwn(input, 'cover') && (input.cover === null || keys(input.cover, ['candidateId']) && Object.keys(input.cover).length === 1 && UUID.test(input.cover.candidateId)), 'Historical cover requires explicit null or candidateId');
            invalid(provenance(input.source), 'Invalid historical source');
        }
        return input;
    }

    function makePublication(kind, value, meta, before, plan, input, historical = false, frozen = null) {
        const publicationId = randomUUID(), now = new Date().toISOString();
        const schedule = input.schedule || {precision: 'instant', at: input.publishedAt, timezone: input.timezone};
        let cover = historical && input.cover ? {
            ...candidateCover(meta, input.cover.candidateId),
            selectedAt: null,
            selectedAtKnowledge: 'unknown'
        } : null;
        if (!historical) {
            const choice = frozen ? input.coverChoice : plan.coverChoice;
            if (choice?.candidateId) cover = candidateCover(meta, choice.candidateId);
            else if (choice?.variantId) {
                const variant = meta.coverVariants.find(v => v.id === choice.variantId);
                invalid(variant?.selectedCandidateId, 'Variant has no selected cover');
                cover = candidateCover(meta, variant.selectedCandidateId);
            } else if (frozen || plan.textMode !== 'explicit') {
                cover = meta.selectedCover ? structuredClone(meta.selectedCover) : null;
                if (cover && !frozen) candidateCover(meta, cover.candidateId);
            }
            if (cover) image(cover.assetHash);
        }
        if (cover?.template) templatePackage(root, cover.template.id, cover.template.version, cover.template.packageHash);
        const channel = settings().channels.find(c => c.id === plan.channelId);
        const publicationText = historical ? (input.publicationText === null ? {
            status: 'unknown',
            text: null
        } : {status: 'known', text: input.publicationText}) : {
            status: 'known',
            text: frozen ? input.text : plan.textMode === 'explicit' ? plan.text : before[1].toString('utf8')
        };
        const snapshotBody = historical ? Buffer.alloc(0) : before[1];
        const record = {
            format: 'nova-publication-snapshot',
            schemaVersion: 2,
            publicationId,
            objectKind: kind,
            contentKnowledge: frozen?.contentKnowledge ?? (historical ? 'unknown' : 'known'),
            baseTextKnowledge: frozen?.baseTextKnowledge ?? (historical ? 'unknown' : 'known'),
            content: frozen?.content ?? (historical ? {
                id: value,
                title: null,
                revision: null,
                createdAt: null,
                updatedAt: null
            } : {
                id: value,
                title: meta.title,
                revision: metadata(before[0], value, kind).revision,
                createdAt: meta.createdAt,
                updatedAt: metadata(before[0], value, kind).updatedAt
            }),
            plan: structuredClone(frozen?.plan ?? plan),
            channel: frozen?.channel ?? (historical ? {
                id: plan.channelId,
                name: input.channelName ?? null,
                nameStatus: input.channelName ? 'known' : 'unknown'
            } : {id: plan.channelId, name: channel?.name ?? null, nameStatus: channel ? 'known' : 'unknown'}),
            schedule: structuredClone(schedule),
            url: input.url ?? null,
            bodyHash: hash(snapshotBody),
            publicationText,
            cover,
            template: cover?.template ?? null,
            source: historical ? input.source ?? null : null,
            recordedAt: now
        };
        const parent = path.join(root, kind === 'content' ? '内容' : '合集', value, '发布快照');
        ensureDirectory(parent);
        const stage = path.join(parent, `.staging-${randomUUID()}`);
        fs.mkdirSync(stage, {mode: 0o700});
        const raw = jsonBytes(record);
        writeNew(path.join(stage, '快照.json'), raw);
        writeNew(path.join(stage, '正文.md'), snapshotBody);
        hook('beforePublicationSnapshot', {contentId: value, publicationId});
        const target = path.join(parent, publicationId);
        if (safePath(target, true)) fail('CONFLICT', 'Publication ID collision');
        fs.renameSync(stage, target);
        syncDirectory(parent);
        hook('afterPublicationSnapshot', {contentId: value, publicationId});
        return {
            id: publicationId,
            publicationId,
            snapshotId: publicationId,
            planId: plan.id,
            channelId: plan.channelId,
            schedule: structuredClone(schedule),
            url: input.url ?? null,
            snapshotHash: hash(raw)
        };
    }

    function recordPublication(kind, value, raw, token, options, historical = false) {
        const input = publicationInput(raw, historical);
        return change(kind, value, historical ? 'recordHistoricalPublication' : 'recordPublication', input, token, options, (meta, before) => {
            const plan = meta.plans.find(p => p.id === input.planId);
            if (!plan || plan.status !== 'planned') fail('INVALID_STATE', 'Publication requires an active plan');
            const publication = makePublication(kind, value, meta, before, plan, input, historical);
            return {
                ...meta,
                plans: meta.plans.map(p => p.id === plan.id ? {
                    ...p,
                    status: 'published',
                    publicationId: publication.id,
                    updatedAt: new Date().toISOString()
                } : p),
                publications: [...meta.publications, publication]
            };
        });
    }

    function readPublication(kind, value, publicationId) {
        return locked(() => {
            id(publicationId);
            const meta = readObject(kind, value), entry = meta.publications.find(p => p.id === publicationId);
            invalid(entry, 'Unknown publication');
            if (kind === 'content' && !entry.schedule) {
                const old = readPublicationUnlocked(kind, value, entry);
                if (old.snapshot.cover) image(old.snapshot.cover.assetHash);
                if (old.snapshot.template) templatePackage(root, old.snapshot.template.id, old.snapshot.template.version, old.snapshot.template.packageHash);
                return {
                    ...old,
                    body: old.bodyBytes.toString('utf8'),
                    cover: old.snapshot.cover,
                    template: old.snapshot.template
                };
            }
            const dir = path.join(root, kind === 'content' ? '内容' : '合集', value, '发布快照', publicationId),
                raw = read(path.join(dir, '快照.json')), bodyBytes = read(path.join(dir, '正文.md'));
            let snap;
            try {
                snap = JSON.parse(raw);
            } catch {
                fail('CORRUPT', 'Invalid publication snapshot');
            }
            invalidSnapshot(snap, entry, kind, value, bodyBytes, raw);
            if (snap.cover) image(snap.cover.assetHash);
            if (snap.template) templatePackage(root, snap.template.id, snap.template.version, snap.template.packageHash);
            return {
                snapshot: snap,
                body: snap.baseTextKnowledge === 'unknown' ? null : bodyBytes.toString('utf8'),
                bodyBytes,
                publicationText: snap.publicationText,
                cover: snap.cover,
                template: snap.template
            };
        });
    }

    function invalidSnapshot(s, entry, kind, value, body, raw) {
        const c = condition => {
            if (!condition) fail('CORRUPT', 'Publication snapshot checksum, format or reference mismatch');
        };
        c(keys(s, ['format', 'schemaVersion', 'publicationId', 'objectKind', 'content', 'contentKnowledge', 'baseTextKnowledge', 'plan', 'channel', 'schedule', 'url', 'bodyHash', 'publicationText', 'cover', 'template', 'source', 'recordedAt']) && s.format === 'nova-publication-snapshot' && s.schemaVersion === 2 && s.publicationId === entry.id && s.objectKind === kind && keys(s.content, ['id', 'title', 'revision', 'createdAt', 'updatedAt']) && s.content.id === value && (s.contentKnowledge === 'known' ? str(s.content.title) && Number.isSafeInteger(s.content.revision) && s.content.revision > 0 && iso(s.content.createdAt) && iso(s.content.updatedAt) : s.contentKnowledge === 'unknown' && ['title', 'revision', 'createdAt', 'updatedAt'].every(k => s.content[k] === null)) && ['known', 'unknown'].includes(s.baseTextKnowledge) && (s.baseTextKnowledge === 'known' || body.length === 0) && hash(raw) === entry.snapshotHash && hash(body) === s.bodyHash);
        c(keys(s.publicationText, ['status', 'text']) && (s.publicationText.status === 'known' ? typeof s.publicationText.text === 'string' : s.publicationText.status === 'unknown' && s.publicationText.text === null) && validSchedule(s.schedule) && isDeepStrictEqual(s.schedule, entry.schedule) && keys(s.channel, ['id', 'name', 'nameStatus']) && s.channel.id === entry.channelId && (s.channel.nameStatus === 'known' ? str(s.channel.name) : s.channel.nameStatus === 'unknown' && s.channel.name === null) && s.plan?.id === entry.planId && s.plan.channelId === entry.channelId && s.url === entry.url && urlOK(s.url) && iso(s.recordedAt) && provenance(s.source));
        c(s.cover === null || keys(s.cover, ['candidateId', 'assetHash', 'requestId', 'attemptId', 'template', 'selectedAt', 'selectedAtKnowledge']) && UUID.test(s.cover.candidateId) && HASH.test(s.cover.assetHash) && str(s.cover.requestId) && str(s.cover.attemptId) && (iso(s.cover.selectedAt) && s.cover.selectedAtKnowledge === undefined || s.cover.selectedAt === null && s.cover.selectedAtKnowledge === 'unknown') && (s.cover.template === null || template(s.cover.template)));
        c(isDeepStrictEqual(s.template, s.cover?.template ?? null));
    }

    function terminal(kind, value, publicationId, raw, token, options, correct) {
        id(publicationId);
        const input = fields(raw, correct ? ['reason', 'text', 'schedule', 'url', 'coverChoice'] : ['reason'], correct ? ['reason', 'text', 'schedule'] : ['reason']);
        text(input.reason, 'reason');
        if (correct) {
            invalid(typeof input.text === 'string', 'Correction requires explicit text');
            checkedSchedule(input.schedule);
            if (input.url !== undefined) invalid(urlOK(input.url), 'Invalid URL');
        }
        return change(kind, value, correct ? 'correctPublication' : 'retractPublication', {publicationId, ...input}, token, options, (meta, before) => {
            const original = meta.publications.find(p => p.id === publicationId);
            invalid(original, 'Unknown publication');
            if (meta.publicationEvents.some(e => e.targetId === publicationId)) fail('INVALID_STATE', 'Publication already corrected or retracted');
            const plan = meta.plans.find(p => p.id === original.planId);
            if (plan.publicationId !== publicationId) fail('INVALID_STATE', 'Publication is no longer active');
            let replacement = null, nextPlan = {...plan, status: 'planned', updatedAt: new Date().toISOString()};
            delete nextPlan.publicationId;
            if (correct) {
                const old = readPublicationUnlocked(kind, value, original); // Corrections preserve frozen base text and cover unless explicitly replaced.
                const choice = input.coverChoice === undefined ? null : input.coverChoice;
                invalid(coverChoice(choice, meta), 'Unknown cover choice');
                const frozenBefore = [before[0], old.bodyBytes];
                const frozenMeta = {
                    ...meta,
                    title: old.snapshot.content.title,
                    selectedCover: input.coverChoice === undefined ? old.snapshot.cover : null
                };
                replacement = makePublication(kind, value, frozenMeta, frozenBefore, plan, {
                    schedule: input.schedule,
                    text: input.text,
                    coverChoice: choice,
                    url: input.url === undefined ? original.url : input.url
                }, false, {
                    plan: old.snapshot.plan,
                    content: old.snapshot.content,
                    contentKnowledge: old.snapshot.contentKnowledge ?? 'known',
                    baseTextKnowledge: old.snapshot.baseTextKnowledge ?? 'known',
                    channel: old.snapshot.channel ?? {id: plan.channelId, name: null, nameStatus: 'unknown'}
                });
                nextPlan = {
                    ...plan,
                    status: 'published',
                    publicationId: replacement.id,
                    updatedAt: new Date().toISOString()
                };
            }
            const event = {
                id: randomUUID(),
                type: correct ? 'corrected' : 'retracted',
                targetId: publicationId,
                replacementId: replacement?.id ?? null,
                reason: input.reason,
                recordedAt: new Date().toISOString()
            };
            return {
                ...meta,
                plans: meta.plans.map(p => p.id === plan.id ? nextPlan : p),
                publications: replacement ? [...meta.publications, replacement] : meta.publications,
                publicationEvents: [...meta.publicationEvents, event]
            };
        });
    }

    function readPublicationUnlocked(kind, value, entry) {
        const dir = path.join(root, kind === 'content' ? '内容' : '合集', value, '发布快照', entry.id),
            raw = read(path.join(dir, '快照.json')), bodyBytes = read(path.join(dir, '正文.md'));
        let snap;
        try {
            snap = JSON.parse(raw);
        } catch {
            fail('CORRUPT', 'Invalid snapshot');
        }
        if (snap.schemaVersion === 2) invalidSnapshot(snap, entry, kind, value, bodyBytes, raw);
        else if (snap.schemaVersion !== 1 || hash(raw) !== entry.snapshotHash || hash(bodyBytes) !== snap.bodyHash || snap.publicationId !== entry.id || snap.content?.id !== value) fail('CORRUPT', 'Invalid legacy snapshot');
        return {snapshot: snap, bodyBytes};
    }

    const api = {
        createContent, updateContent,
        readLibrarySettings: () => locked(() => {
            const s = settings(), defaultIssues = [];
            for (const [key, kind] of [['photoId', 'photo'], ['templateId', 'template']]) if (s.defaults[key]) {
                if (!safePath(path.join(root, kind === 'photo' ? '我的照片' : '模板', s.defaults[key]), true)) {
                    defaultIssues.push({field: key, id: s.defaults[key], reason: 'missing'});
                    continue;
                }
                const record = readObject(kind, s.defaults[key]);
                if (record.deletedAt !== null) defaultIssues.push({field: key, id: record.id, reason: 'trashed'});
                else if (kind === 'photo' && record.availability === 'unavailable') defaultIssues.push({
                    field: key,
                    id: record.id,
                    reason: 'unavailable'
                });
                else if (kind === 'photo' && !record.isOwnPhoto) defaultIssues.push({
                    field: key,
                    id: record.id,
                    reason: 'ownership-revoked'
                });
            }
            const categories = [...s.promptCategories];
            for (const name of fs.readdirSync(path.join(root, '提示词'))) {
                const p = readObject('prompt', name);
                if (p.deletedAt === null && p.category && !categories.includes(p.category)) categories.push(p.category);
            }
            return {...s, defaultIssues, visiblePromptCategories: categories};
        }),
        updateProfile: (raw, token, options) => {
            const input = fields(raw, ['name', 'intro', 'avatarAssetHash', 'marks']);
            invalid(Object.keys(input).length, 'Empty profile patch');
            if (input.name !== undefined) text(input.name, 'name', true);
            if (input.intro !== undefined) text(input.intro, 'intro', true);
            if (input.marks !== undefined) invalid(Array.isArray(input.marks) && input.marks.every(m => keys(m, ['key', 'value']) && str(m.key) && str(m.value, true)), 'Invalid profile marks');
            if (input.avatarAssetHash !== undefined && input.avatarAssetHash !== null) checkedHash(input.avatarAssetHash);
            return settingChange('updateProfile', input, token, options, meta => {
                if (input.avatarAssetHash) image(input.avatarAssetHash);
                return {...meta, profile: {...meta.profile, ...input}};
            });
        },
        setGenerationDefaults: (raw, token, options) => {
            const input = fields(raw, ['photoId', 'templateId', 'coverCount']);
            invalid(Object.keys(input).length, 'Empty defaults patch');
            if (input.photoId !== undefined && input.photoId !== null) id(input.photoId);
            if (input.templateId !== undefined) invalid(ref(input.templateId), 'Invalid default template');
            if (input.coverCount !== undefined) invalid(Number.isSafeInteger(input.coverCount) && input.coverCount >= 1 && input.coverCount <= 20, 'coverCount must be 1–20');
            return settingChange('setGenerationDefaults', input, token, options, meta => {
                if (input.photoId) {
                    const p = readObject('photo', input.photoId);
                    invalid(p.availability !== 'unavailable', 'Default photo is unavailable');
                    invalid(p.deletedAt === null && p.isOwnPhoto, 'Default photo requires an active own photo');
                }
                if (input.templateId) activeTemplate(input.templateId);
                return {...meta, defaults: {...meta.defaults, ...input}};
            });
        },
        restoreGenerationDefaultReferences: (raw, token, options) => {
            const input = fields(raw, ['photoId', 'templateId', 'coverCount', 'source'], ['photoId', 'templateId', 'source']);
            if (input.photoId !== null) id(input.photoId);
            invalid(ref(input.templateId), 'Invalid default template');
            invalid(input.source !== null && provenance(input.source), 'Restored references require a finite source record');
            if (input.coverCount !== undefined) invalid(Number.isSafeInteger(input.coverCount) && input.coverCount >= 1 && input.coverCount <= 20, 'coverCount must be 1–20');
            return settingChange('restoreGenerationDefaultReferences', input, token, options, meta => {
                for (const [key, kind, folder] of [['photoId', 'photo', '我的照片'], ['templateId', 'template', '模板']]) if (input[key] !== null) {
                    invalid(!!safePath(path.join(root, folder, input[key]), true), 'Restored default reference must already exist');
                    readObject(kind, input[key]);
                }
                const {source, ...defaults} = input;
                return {...meta, defaults: {...meta.defaults, ...defaults}};
            });
        },
        createChannel: (raw, token, options) => {
            const input = channelInput(raw, false);
            return settingChange('createChannel', input, token, options, meta => ({
                ...meta,
                channels: [...meta.channels, {
                    id: `channel-${randomUUID()}`,
                    name: input.name,
                    ink: input.ink ?? '#555555',
                    bg: input.bg ?? '#f0f0f0',
                    requiredRatio: input.requiredRatio ?? null,
                    builtinKey: null,
                    deletedAt: null
                }]
            }));
        },
        updateChannel: (channelId, raw, token, options) => {
            const input = channelInput(raw, true);
            invalid(CHANNEL.test(channelId), 'Invalid channel ID');
            return settingChange('updateChannel', {channelId, ...input}, token, options, meta => {
                const old = meta.channels.find(c => c.id === channelId);
                invalid(old && old.deletedAt === null, 'Unknown active channel');
                return {...meta, channels: meta.channels.map(c => c.id === channelId ? {...c, ...input} : c)};
            });
        },
        trashChannel: (channelId, token, options) => channelState(channelId, true, token, options),
        restoreChannel: (channelId, token, options) => channelState(channelId, false, token, options),
        setPromptCategories: (values, token, options) => {
            invalid(listOf(values, value => str(value)), 'Expected unique categories');
            return settingChange('setPromptCategories', {values}, token, options, meta => ({
                ...meta,
                promptCategories: [...values]
            }));
        },
        addCustomRatio: (value, token, options) => {
            const ratio = checkedRatio(value);
            return settingChange('addCustomRatio', {ratio}, token, options, meta => ({
                ...meta,
                customRatios: meta.customRatios.includes(ratio) ? meta.customRatios : [...meta.customRatios, ratio]
            }));
        },
        removeCustomRatio: (value, token, options) => {
            const ratio = checkedRatio(value);
            return settingChange('removeCustomRatio', {ratio}, token, options, meta => ({
                ...meta,
                customRatios: meta.customRatios.filter(r => r !== ratio)
            }));
        },
        setPromptEnabled: (promptId, enabled, token, options) => {
            invalid(typeof enabled === 'boolean', 'enabled must be boolean');
            return mutate('update', promptId, {
                action: 'setPromptEnabled',
                enabled
            }, token, options, 'prompt', meta => ({...meta, schemaVersion: 2, enabled}));
        },
        createCollection: (raw, options) => {
            const input = contentInput(raw, true, 'collection');
            return mutate('create', null, input, null, options, 'collection', editContent(input, 'collection'));
        },
        updateCollection: (value, raw, token, options) => {
            const input = contentInput(raw, false, 'collection');
            return mutate('update', value, input, token, options, 'collection', editContent(input, 'collection'));
        },
        readCollection: value => locked(() => readObject('collection', value)),
        listCollections: () => list(false, 'collection'), listCollectionTrash: () => list(true, 'collection'),
        trashCollection: (value, token, options) => mutate('trash', value, {}, token, options, 'collection'),
        restoreCollection: (value, token, options) => mutate('restore', value, {}, token, options, 'collection', meta => {
            for (const memberId of meta.memberIds) invalid(readObject('content', memberId).deletedAt === null, 'Restore members before restoring collection');
            return meta;
        }),
        setCollectionMembers: (value, memberIds, token, options) => {
            invalid(listOf(memberIds, value => UUID.test(value)), 'Expected unique content IDs');
            return change('collection', value, 'setMembers', {memberIds}, token, options, meta => {
                for (const memberId of memberIds) {
                    invalid(memberId !== value && !!safePath(path.join(root, '内容', memberId), true), 'Collection member must be content');
                    invalid(readObject('content', memberId).deletedAt === null, 'Collection member must be active content');
                }
                return {...meta, memberIds: [...memberIds]};
            });
        },
        selectVariantCover: (value, variantId, candidateId, token, options) => select('content', value, candidateId, token, options, variantId),
        selectContentCover: (value, candidateId, token, options) => select('content', value, candidateId, token, options),
        savePublicationPlan: (value, raw, token, options) => savePlan('content', value, raw, token, options),
        recordPublication: (value, raw, token, options) => recordPublication('content', value, raw, token, options),
        recordHistoricalPublication: (value, raw, token, options) => recordPublication('content', value, raw, token, options, true),
        readPublication: (value, publicationId) => readPublication('content', value, publicationId),
        correctPublication: (value, publicationId, raw, token, options) => terminal('content', value, publicationId, raw, token, options, true),
        retractPublication: (value, publicationId, raw, token, options) => terminal('content', value, publicationId, raw, token, options, false),
    };

    function channelInput(raw, patch) {
        const input = fields(raw, ['name', 'ink', 'bg', 'requiredRatio'], patch ? [] : ['name']);
        invalid(Object.keys(input).length, 'Empty channel patch');
        if (input.name !== undefined) text(input.name, 'channel name');
        for (const k of ['ink', 'bg']) if (input[k] !== undefined) invalid(/^#[0-9a-fA-F]{6}$/.test(input[k]), 'Expected #rrggbb color');
        if (input.requiredRatio !== undefined && input.requiredRatio !== null) input.requiredRatio = checkedRatio(input.requiredRatio);
        return input;
    }

    function channelState(channelId, trash, token, options) {
        invalid(CHANNEL.test(channelId), 'Invalid channel ID');
        return settingChange(trash ? 'trashChannel' : 'restoreChannel', {channelId}, token, options, meta => {
            const c = meta.channels.find(c => c.id === channelId);
            invalid(c, 'Unknown channel');
            if ((c.deletedAt !== null) === trash) fail('INVALID_STATE', 'Channel already in requested state');
            return {
                ...meta,
                channels: meta.channels.map(c => c.id === channelId ? {
                    ...c,
                    deletedAt: trash ? new Date().toISOString() : null
                } : c)
            };
        });
    }

    for (const [kind, prefix] of [['content', 'Content'], ['collection', 'Collection']]) {
        for (const [label, field] of [['Material', 'materials'], ['UnavailableReference', 'unavailableReferences']]) for (const trash of [true, false]) {
            const action = `${trash ? 'trash' : 'restore'}${label}`;
            api[`${trash ? 'trash' : 'restore'}${prefix}${label}`] = (value, entryId, token, options) => {
                id(entryId);
                return change(kind, value, action, {entryId}, token, options, meta => {
                    const entry = meta[field].find(item => item.id === entryId);
                    invalid(entry, `Unknown ${label}`);
                    if (!!entry.deletedAt === trash) fail('INVALID_STATE', `${label} is already in the requested state`);
                    return {
                        ...meta,
                        [field]: meta[field].map(item => item.id === entryId ? {
                            ...item,
                            deletedAt: trash ? new Date().toISOString() : null
                        } : item)
                    };
                });
            };
        }
        api[`save${prefix}CoverVariant`] = (value, raw, token, options) => {
            const input = fields(raw, ['id', 'name', 'ratio', 'preferredTemplateId', 'selectedCandidateId'], ['name', 'ratio']);
            if (input.id !== undefined) id(input.id);
            text(input.name, 'variant name');
            input.ratio = checkedRatio(input.ratio);
            if (input.preferredTemplateId !== undefined) invalid(ref(input.preferredTemplateId), 'Invalid template');
            return change(kind, value, 'saveVariant', input, token, options, meta => {
                if (input.preferredTemplateId) activeTemplate(input.preferredTemplateId);
                const old = input.id ? meta.coverVariants.find(v => v.id === input.id) : null;
                if (input.id) invalid(old, 'Unknown variant');
                const v = {
                    id: old?.id || randomUUID(),
                    name: input.name,
                    ratio: input.ratio,
                    preferredTemplateId: input.preferredTemplateId === undefined ? old?.preferredTemplateId ?? null : input.preferredTemplateId,
                    selectedCandidateId: input.selectedCandidateId === undefined ? old?.selectedCandidateId ?? null : input.selectedCandidateId
                };
                invalid(v.selectedCandidateId === null || meta.candidates.some(c => c.id === v.selectedCandidateId) || meta.unavailableReferences.some(r => r.id === v.selectedCandidateId && r.kind === 'candidate'), 'Unknown selected candidate');
                if (input.selectedCandidateId) invalid(!meta.unavailableReferences.some(r => r.id === input.selectedCandidateId && r.deletedAt), 'Selected candidate import reference is trashed');
                return {
                    ...meta,
                    coverVariants: old ? meta.coverVariants.map(item => item.id === v.id ? v : item) : [...meta.coverVariants, v]
                };
            });
        };
        api[`remove${prefix}CoverVariant`] = (value, variantId, token, options) => {
            id(variantId);
            return change(kind, value, 'removeVariant', {variantId}, token, options, meta => {
                invalid(meta.coverVariants.some(v => v.id === variantId), 'Unknown variant');
                if (meta.plans.some(p => p.coverChoice?.variantId === variantId)) fail('INVALID_STATE', 'Variant is referenced by a plan');
                return {
                    ...meta,
                    coverVariants: meta.coverVariants.filter(v => v.id !== variantId),
                    candidates: meta.candidates.map(c => c.variantId === variantId ? {...c, variantId: null} : c)
                };
            });
        };
        api[`update${prefix}Candidate`] = (value, candidateId, raw, token, options) => {
            id(candidateId);
            const input = fields(raw, ['variantId', 'favorite', 'displayNumber', 'note', 'provenance']);
            invalid(Object.keys(input).length, 'Empty candidate patch');
            if (input.variantId !== undefined && input.variantId !== null) id(input.variantId);
            if (input.favorite !== undefined) invalid(typeof input.favorite === 'boolean', 'favorite must be boolean');
            for (const k of ['displayNumber', 'note']) if (input[k] !== undefined) text(input[k], k, true);
            if (input.provenance !== undefined) invalid(provenance(input.provenance), 'Invalid source');
            return change(kind, value, 'updateCandidate', {candidateId, ...input}, token, options, meta => {
                invalid(meta.candidates.some(c => c.id === candidateId), 'Unknown candidate');
                if (input.variantId) invalid(meta.coverVariants.some(v => v.id === input.variantId), 'Unknown variant');
                return {...meta, candidates: meta.candidates.map(c => c.id === candidateId ? {...c, ...input} : c)};
            });
        };
        api[`add${prefix}UnavailableReference`] = (value, raw, token, options) => {
            const input = fields(raw, ['kind', 'originalId', 'reason', 'originalName', 'provenance'], ['kind', 'originalId', 'reason']);
            invalid(['material', 'candidate', 'template-image'].includes(input.kind), 'Unknown unavailable reference kind');
            text(input.originalId, 'originalId');
            text(input.reason, 'reason');
            if (input.originalName !== undefined) text(input.originalName, 'originalName', true);
            if (input.provenance !== undefined) invalid(provenance(input.provenance), 'Invalid source');
            return change(kind, value, 'addUnavailableReference', input, token, options, meta => ({
                ...meta,
                unavailableReferences: [...meta.unavailableReferences, {
                    id: randomUUID(), ...input,
                    originalName: input.originalName ?? '',
                    provenance: input.provenance ?? null,
                    availability: 'unavailable'
                }]
            }));
        };
        api[`resolve${prefix}UnavailableReference`] = (value, referenceId, raw, token, options) => {
            id(referenceId);
            const input = fields(raw, ['assetHash', 'template'], ['assetHash']);
            checkedHash(input.assetHash);
            return change(kind, value, 'resolveUnavailableReference', {referenceId, ...input}, token, options, meta => {
                const reference = meta.unavailableReferences.find(r => r.id === referenceId);
                invalid(reference && reference.availability === 'unavailable', 'Unknown unavailable reference');
                readAssetInternal(root, input.assetHash);
                let next = {...meta}, resolvedObjectId = null;
                if (reference.kind === 'candidate') {
                    image(input.assetHash);
                    let t = null;
                    if (input.template) {
                        const r = fields(input.template, ['id', 'version'], ['id', 'version']),
                            record = readObject('template', r.id),
                            v = record.versions.find(v => v.version === r.version);
                        invalid(v, 'Unknown template version');
                        templatePackage(root, r.id, r.version, v.packageHash);
                        t = {id: r.id, version: r.version, packageHash: v.packageHash};
                    }
                    resolvedObjectId = reference.id;
                    next.candidates = [...meta.candidates, {
                        id: reference.id,
                        assetHash: input.assetHash,
                        requestId: `import-${reference.id}`,
                        attemptId: `import-${reference.id}`,
                        template: t,
                        source: 'resolved-import',
                        originalName: reference.originalName,
                        provenance: reference.provenance,
                        accepted: false,
                        createdAt: new Date().toISOString()
                    }];
                } else if (reference.kind === 'material') {
                    invalid(input.template === undefined, 'Material cannot carry a template');
                    resolvedObjectId = reference.id;
                    next.materials = [...meta.materials, {
                        id: reference.id,
                        assetHash: input.assetHash,
                        originalName: reference.originalName,
                        role: 'material',
                        createdAt: new Date().toISOString()
                    }];
                } else {
                    invalid(input.template === undefined, 'Template image bytes must be installed into an explicit template version separately');
                    image(input.assetHash);
                }
                return {
                    ...next,
                    unavailableReferences: meta.unavailableReferences.map(r => r.id === referenceId ? {
                        ...r,
                        availability: 'available',
                        assetHash: input.assetHash,
                        resolvedObjectId
                    } : r)
                };
            });
        };
        api[`save${prefix}ImportedCoverBatch`] = (value, raw, token, options) => {
            const input = fields(raw, ['displayNumber', 'date', 'templateGroupId', 'candidateIds', 'referenceCandidateIds', 'originalStatus', 'provenance'], ['candidateIds']);
            invalid(listOf(input.candidateIds, v => UUID.test(v)) && (input.referenceCandidateIds === undefined || listOf(input.referenceCandidateIds, v => UUID.test(v))), 'Expected candidate IDs');
            if (input.date !== undefined) invalid(input.date === null || day(input.date), 'Invalid batch date');
            for (const k of ['displayNumber', 'originalStatus']) if (input[k] !== undefined) text(input[k], k, true);
            if (input.templateGroupId !== undefined && input.templateGroupId !== null) text(input.templateGroupId, 'template group');
            if (input.provenance !== undefined) invalid(provenance(input.provenance), 'Invalid source');
            return change(kind, value, 'saveImportedCoverBatch', input, token, options, meta => {
                const known = v => meta.candidates.some(c => c.id === v) || meta.unavailableReferences.some(r => r.id === v && r.kind === 'candidate');
                invalid([...input.candidateIds, ...input.referenceCandidateIds ?? []].every(known), 'Batch references unknown candidate');
                const batch = {
                    id: randomUUID(),
                    displayNumber: input.displayNumber ?? '',
                    date: input.date ?? null,
                    templateGroupId: input.templateGroupId ?? null,
                    candidateIds: [...input.candidateIds],
                    referenceCandidateIds: [...input.referenceCandidateIds ?? []],
                    originalStatus: input.originalStatus ?? '',
                    provenance: input.provenance ?? null
                };
                return {...meta, importedCoverBatches: [...meta.importedCoverBatches, batch]};
            });
        };
        api[`cancel${prefix}PublicationPlan`] = (value, planId, token, options) => {
            id(planId);
            return change(kind, value, 'cancelPlan', {planId}, token, options, meta => {
                const plan = meta.plans.find(p => p.id === planId);
                invalid(plan, 'Unknown plan');
                if (plan.status !== 'planned') fail('INVALID_STATE', 'Only planned publications can be cancelled');
                return {
                    ...meta,
                    plans: meta.plans.map(p => p.id === planId ? {
                        ...p,
                        status: 'cancelled',
                        updatedAt: new Date().toISOString()
                    } : p)
                };
            });
        };
    }
    api.cancelPublicationPlan = api.cancelContentPublicationPlan;
    api.saveCoverVariant = api.saveContentCoverVariant;
    api.updateCandidate = api.updateContentCandidate;
    api.setCandidateFavorite = (value, candidateId, favorite, token, options) => api.updateContentCandidate(value, candidateId, {favorite}, token, options);
    api.selectCollectionCover = (value, candidateId, token, options) => select('collection', value, candidateId, token, options);
    api.selectCollectionVariantCover = (value, variantId, candidateId, token, options) => select('collection', value, candidateId, token, options, variantId);
    api.saveCollectionPublicationPlan = (value, raw, token, options) => savePlan('collection', value, raw, token, options);
    api.recordCollectionPublication = (value, raw, token, options) => recordPublication('collection', value, raw, token, options);
    api.recordHistoricalCollectionPublication = (value, raw, token, options) => recordPublication('collection', value, raw, token, options, true);
    api.readCollectionPublication = (value, publicationId) => readPublication('collection', value, publicationId);
    api.correctCollectionPublication = (value, publicationId, raw, token, options) => terminal('collection', value, publicationId, raw, token, options, true);
    api.retractCollectionPublication = (value, publicationId, raw, token, options) => terminal('collection', value, publicationId, raw, token, options, false);
    api.attachCollectionMaterial = (value, raw, token, options) => {
        const input = fields(raw, ['assetHash', 'originalName', 'role'], ['assetHash', 'originalName']);
        checkedHash(input.assetHash);
        text(input.originalName, 'originalName', true);
        if (input.role !== undefined) text(input.role, 'role');
        return change('collection', value, 'attachMaterial', input, token, options, meta => {
            readAssetInternal(root, input.assetHash);
            return {
                ...meta,
                materials: [...meta.materials, {
                    id: randomUUID(),
                    assetHash: input.assetHash,
                    originalName: input.originalName,
                    role: input.role ?? 'material',
                    createdAt: new Date().toISOString()
                }]
            };
        });
    };
    api.removeCollectionMaterial = (value, materialId, token, options) => {
        id(materialId);
        return change('collection', value, 'removeMaterial', {materialId}, token, options, meta => {
            invalid(meta.materials.some(m => m.id === materialId), 'Unknown material');
            return {...meta, materials: meta.materials.filter(m => m.id !== materialId)};
        });
    };
    api.registerCollectionCandidate = (value, raw, token, options) => {
        const input = fields(raw, ['assetHash', 'requestId', 'attemptId', 'template', 'source', 'originalName'], ['assetHash', 'requestId', 'attemptId']);
        checkedHash(input.assetHash);
        text(input.requestId, 'requestId');
        text(input.attemptId, 'attemptId');
        if (input.source !== undefined) text(input.source, 'source');
        if (input.originalName !== undefined) text(input.originalName, 'originalName', true);
        return change('collection', value, 'registerCandidate', input, token, options, meta => {
            image(input.assetHash);
            let t = null;
            if (input.template) {
                const r = fields(input.template, ['id', 'version'], ['id', 'version']),
                    record = readObject('template', r.id), version = record.versions.find(v => v.version === r.version);
                invalid(version, 'Unknown template version');
                templatePackage(root, r.id, r.version, version.packageHash);
                t = {id: r.id, version: r.version, packageHash: version.packageHash};
            }
            return {
                ...meta,
                candidates: [...meta.candidates, {
                    id: randomUUID(), ...input,
                    template: t,
                    accepted: false,
                    createdAt: new Date().toISOString()
                }]
            };
        });
    };
    return api;
}
