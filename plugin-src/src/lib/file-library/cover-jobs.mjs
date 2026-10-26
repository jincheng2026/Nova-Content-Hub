import {attemptProgress} from './attempt-progress.mjs';
import {selectableTemplate} from './template-retirement.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {validateImage} from '../image-validation/index.mjs';
import {templateContextDocuments} from './template-context-documents.mjs';

const HOSTS = ['codex', 'workbuddy'];
const LIVE = ['created', 'claimed'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HASH = /^[a-f0-9]{64}$/;
const STATES = [...LIVE, 'committed', 'failed', 'cancelled', 'superseded'];
const PROTOCOL = Object.freeze({
    name: 'nova-cover-execution',
    version: 1,
    appScope: 'nova-content-hub',
    scope: 'cover-only'
});

export function validateCoverJobs(meta, fail) {
    const check = (ok, label) => {
        if (!ok) fail('CORRUPT', `Invalid cover jobs: ${label}`);
    };
    const exact = (value, fields) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => fields.includes(key));
    const iso = value => {
        try {
            return typeof value === 'string' && new Date(value).toISOString() === value;
        } catch {
            return false;
        }
    };
    check(Array.isArray(meta.coverJobs), 'array');
    const requests = new Set(), attempts = new Set(), candidates = new Set();
    for (const job of meta.coverJobs) {
        check(exact(job, ['id', 'requestHash', 'inputHash', 'createdAt', 'activeAttemptId', 'attempts']) && UUID.test(job.id) && !requests.has(job.id) && HASH.test(job.requestHash) && HASH.test(job.inputHash) && iso(job.createdAt) && Array.isArray(job.attempts), 'request reference');
        requests.add(job.id);
        let active = 0;
        for (const attempt of job.attempts) {
            check(exact(attempt, ['attemptId', 'host', 'reason', 'status', 'createdAt', 'updatedAt', 'handoffHash', 'receiptHash', 'reportHash', 'candidateIds', 'failure']) && UUID.test(attempt.attemptId) && !attempts.has(attempt.attemptId) && HOSTS.includes(attempt.host) && typeof attempt.reason === 'string' && STATES.includes(attempt.status) && iso(attempt.createdAt) && iso(attempt.updatedAt) && HASH.test(attempt.handoffHash) && Array.isArray(attempt.candidateIds), 'attempt');
            attempts.add(attempt.attemptId);
            check(new Set(attempt.candidateIds).size === attempt.candidateIds.length && attempt.candidateIds.every(value => UUID.test(value)), 'candidate IDs');
            if (attempt.status === 'committed') {
                check(HASH.test(attempt.receiptHash) && HASH.test(attempt.reportHash) && attempt.candidateIds.length > 0 && attempt.failure === null, 'committed evidence');
                for (const candidateId of attempt.candidateIds) {
                    const item = meta.candidates.find(candidate => candidate.id === candidateId);
                    check(item && item.requestId === job.id && item.attemptId === attempt.attemptId && !candidates.has(candidateId), 'candidate ownership');
                    candidates.add(candidateId);
                }
            } else check(attempt.receiptHash === null && attempt.reportHash === null && attempt.candidateIds.length === 0, 'unfinished references');
            check(attempt.failure === null || (exact(attempt.failure, ['code', 'message']) && typeof attempt.failure.code === 'string' && typeof attempt.failure.message === 'string'), 'failure');
            if (LIVE.includes(attempt.status)) {
                active++;
                check(job.activeAttemptId === attempt.attemptId, 'active ownership');
            }
        }
        check(active <= 1, 'one active attempt per request');
        check(job.activeAttemptId === null || job.attempts.some(attempt => attempt.attemptId === job.activeAttemptId && LIVE.includes(attempt.status)), 'active reference');
    }
    for (const candidate of meta.candidates) {
        const job = meta.coverJobs.find(item => item.id === candidate.requestId);
        if (job) check(job.attempts.some(attempt => attempt.status === 'committed' && attempt.attemptId === candidate.attemptId && attempt.candidateIds.includes(candidate.id)), 'unregistered managed candidate');
    }
}

// Private business integration: callers receive only the finite cover methods below.
export function coverJobMethods(h) {
    const {
        root,
        libraryId,
        assertRootIdentity,
        locked,
        mutate,
        changeCurrent,
        replayCoverRequest,
        snapshot,
        result,
        metadata,
        hash,
        jsonBytes,
        read,
        safePath,
        directory,
        ensureDirectory,
        immutableFile,
        readAssetInternal,
        assetPath,
        hook,
        inputFields,
        text,
        id,
        objectId,
        checkedHash,
        templatePackage,
        fail,
        LibraryError
    } = h;
    const requestDir = (contentId, requestId) => path.join(root, '内容', id(contentId), '封面任务', id(requestId));
    const attemptDir = (contentId, requestId, attemptId) => path.join(requestDir(contentId, requestId), '尝试', id(attemptId));
    const content = contentId => result(snapshot(root, id(contentId)), contentId);
    const extend = meta => ({
        ...meta,
        schemaVersion: Math.max(meta.schemaVersion, 3),
        materials: meta.materials || [],
        candidates: meta.candidates || [],
        selectedCover: meta.selectedCover || null,
        plans: meta.plans || [],
        publications: meta.publications || [],
        coverJobs: meta.coverJobs || []
    });
    const host = value => {
        if (!HOSTS.includes(value)) fail('INVALID_INPUT', 'Unknown cover execution host');
        return value;
    };

    const progressStore = attemptProgress(h, 'cover');
    const ownership = (oid, job, attempt) => ({libraryId, objectId: oid, requestId: job.id, attemptId: attempt.attemptId, requestHash: job.requestHash, host: attempt.host});
    function readCoverProgress(oid) {
        return locked(() => {
            const meta = content(id(oid));
            return {editToken: meta.editToken, jobs: (meta.coverJobs || []).map(job => ({id: job.id, activeAttemptId: job.activeAttemptId, attempts: job.attempts.map(attempt => ({attemptId: attempt.attemptId, status: attempt.status, ...progressStore.read(attemptDir(oid, job.id, attempt.attemptId), ownership(oid, job, attempt))}))}))};
        });
    }
    function reportCoverProgress(oid, rid, aid, input) {
        return locked(() => {
            const meta = content(id(oid)), {job, attempt} = find(meta, rid, aid);
            active(meta, job, attempt);
            const {request} = requestPackage(oid, job);
            fresh(meta, Buffer.from(meta.body), request);
            return progressStore.write(attemptDir(oid, rid, aid), ownership(oid, job, attempt), input, attempt.status === 'claimed');
        });
    }

    function find(meta, requestId, attemptId) {
        id(requestId);
        const job = (meta.coverJobs || []).find(item => item.id === requestId);
        if (!job) fail('INVALID_INPUT', 'Unknown cover request');
        if (attemptId === undefined) return {job};
        id(attemptId);
        const attempt = job.attempts.find(item => item.attemptId === attemptId);
        if (!attempt) fail('INVALID_INPUT', 'Unknown cover attempt');
        return {job, attempt};
    }

    function requestDimensions(pixels, ratio, code) {
        const {width, height} = pixels || {};
        if (!pixels || Array.isArray(pixels) || Object.keys(pixels).some(key => !['width', 'height'].includes(key)) || ![width, height].every(value => Number.isSafeInteger(value) && value > 0) || width * height > 40_000_000) fail(code, 'Positive integer display pixels within 40 million are required');
        if (typeof ratio !== 'string' || !/^\d{1,8}:\d{1,8}$/.test(ratio)) fail(code, 'Explicit width:height ratio is required');
        const [rw, rh] = ratio.split(':').map(Number);
        if (!rw || !rh || width * rh !== height * rw) fail(code, 'Ratio does not match display pixels');
    }

    function requestPackage(contentId, job) {
        const dir = requestDir(contentId, job.id);
        const raw = read(path.join(dir, '请求.json'));
        if (hash(raw) !== job.requestHash) fail('CORRUPT', 'Cover request package checksum mismatch');
        let request;
        try {
            request = JSON.parse(raw);
        } catch {
            fail('CORRUPT', 'Invalid cover request package');
        }
        const supportedSize = request.schemaVersion === 1 && !Object.hasOwn(request, 'sizePolicy') || request.schemaVersion === 2 && request.sizePolicy === 'ratio-minimum';
        if (request.format !== 'nova-cover-request' || !supportedSize || request.requestId !== job.id || request.contentId !== contentId || request.libraryId !== libraryId || request.inputHash !== job.inputHash || JSON.stringify(request.protocol) !== JSON.stringify(PROTOCOL)) fail('CORRUPT', 'Cover request package identity or size policy mismatch');
        requestDimensions(request.pixels, request.ratio, 'CORRUPT');
        const bodyBytes = read(path.join(dir, '正文.md'));
        if (hash(bodyBytes) !== request.bodyHash) fail('CORRUPT', 'Cover body snapshot checksum mismatch');
        for (const entry of request.inputs) {
            checkedHash(entry.assetHash);
            const bytes = read(path.join(dir, '输入', entry.assetHash));
            if (hash(bytes) !== entry.assetHash || bytes.length !== entry.bytes) fail('CORRUPT', 'Cover input snapshot checksum mismatch');
        }
        return {request: {...request, requestHash: job.requestHash}, bodyBytes};
    }

    function handoffPackage(contentId, job, attempt) {
        const raw = read(path.join(attemptDir(contentId, job.id, attempt.attemptId), '交接.json'));
        if (hash(raw) !== attempt.handoffHash) fail('CORRUPT', 'Cover handoff checksum mismatch');
        let handoff;
        try {
            handoff = JSON.parse(raw);
        } catch {
            fail('CORRUPT', 'Invalid cover handoff');
        }
        if (handoff.format !== 'nova-cover-handoff' || handoff.schemaVersion !== 1 || JSON.stringify(handoff.protocol) !== JSON.stringify(PROTOCOL) || handoff.libraryId !== libraryId || handoff.contentId !== contentId || handoff.requestId !== job.id || handoff.attemptId !== attempt.attemptId || handoff.requestHash !== job.requestHash || handoff.host !== attempt.host) fail('CORRUPT', 'Cover handoff identity mismatch');
        const index = job.attempts.findIndex(item => item.attemptId === attempt.attemptId);
        if (handoff.sourceAttemptId === null ? index !== 0 : !job.attempts.slice(0, index).some(item => item.attemptId === handoff.sourceAttemptId)) fail('CORRUPT', 'Cover handoff source must reference an earlier attempt in this request');
        return handoff;
    }

    function active(meta, job, attempt, claimed = false) {
        if (meta.deletedAt) fail('INVALID_STATE', 'Content is trashed');
        if (job.activeAttemptId !== attempt.attemptId || !LIVE.includes(attempt.status)) fail('ATTEMPT_INACTIVE', 'Cover attempt is cancelled, failed, superseded or already completed');
        if (claimed && attempt.status !== 'claimed') fail('ATTEMPT_NOT_CLAIMED', 'Host must claim the attempt before committing');
    }

    function fresh(meta, bodyBytes, request) {
        if (meta.title !== request.title || hash(bodyBytes) !== request.bodyHash) fail('STALE_INPUT', 'Content title or body differs from the fixed request');
    }

    function supersede(job, now) {
        for (const attempt of job.attempts) if (LIVE.includes(attempt.status)) {
            attempt.status = 'superseded';
            attempt.updatedAt = now;
        }
        job.activeAttemptId = null;
    }

    function response(updated, requestId, attemptId) {
        const {job, attempt} = find(updated, requestId, attemptId);
        return {content: updated, ...(attempt ? {attempt} : {}), ...(!attempt ? requestPackage(updated.id, job) : {})};
    }

    function normalizeRequest(meta, bodyBytes, raw) {
        const input = inputFields(raw, ['template', 'styleAssetHashes', 'photo', 'materialIds', 'prompt', 'pixels', 'ratio', 'count', 'outputFormat', 'scope', 'sizePolicy', 'coverText'], ['template', 'styleAssetHashes', 'photo', 'materialIds', 'prompt', 'pixels', 'ratio', 'count', 'outputFormat', 'scope']);
        if (input.scope !== 'cover-only') fail('INVALID_INPUT', 'Only cover-only scope is supported');
        if (Object.hasOwn(input, 'sizePolicy') && !['exact', 'ratio-minimum'].includes(input.sizePolicy)) fail('INVALID_INPUT', 'Unknown cover size policy');
        text(input.prompt, 'prompt');
        inputFields(input.pixels, ['width', 'height'], ['width', 'height']);
        requestDimensions(input.pixels, input.ratio, 'INVALID_INPUT');
        if (!Number.isSafeInteger(input.count) || input.count < 1 || input.count > 20 || !['png', 'jpeg', 'webp'].includes(input.outputFormat)) fail('INVALID_INPUT', 'Require 1 to 20 images in PNG, JPEG or WebP');
        inputFields(input.template, ['id', 'version'], ['id', 'version']);
        objectId('template', input.template.id);
        const templateMeta = metadata(snapshot(root, input.template.id, 'template')[0], input.template.id, 'template');
        if (!selectableTemplate(templateMeta)) fail('INVALID_INPUT', 'Selected template is unavailable');
        const version = templateMeta.versions.find(item => item.version === input.template.version);
        if (!version) fail('INVALID_INPUT', 'Unknown template version');
        const pkg = templatePackage(root, input.template.id, input.template.version, version.packageHash);
        if (!Array.isArray(input.styleAssetHashes) || !input.styleAssetHashes.length || new Set(input.styleAssetHashes).size !== input.styleAssetHashes.length) fail('INVALID_INPUT', 'Select a nonempty set of unique style samples');
        const styles = [...new Set(Object.values(pkg.resources).filter(entry => entry.role === 'style').map(entry => entry.assetHash))].sort();
        if (input.styleAssetHashes.some(assetHash => !styles.includes(assetHash))) fail('INVALID_INPUT', 'Selected style sample is not part of the fixed template version');
        const inputs = [];

        function include(assetHash, role, extra = {}) {
            const asset = readAssetInternal(root, checkedHash(assetHash));
            inputs.push({role, assetHash, bytes: asset.bytes, detectedType: asset.detectedType, ...extra});
        }

        input.styleAssetHashes.sort();
        for (const assetHash of input.styleAssetHashes) include(assetHash, 'style');
        let photo = null;
        if (input.photo !== null) {
            inputFields(input.photo, ['id', 'assetHash'], ['id', 'assetHash']);
            const photoMeta = metadata(snapshot(root, id(input.photo.id), 'photo')[0], input.photo.id, 'photo');
            if (photoMeta.availability === 'unavailable') fail('INVALID_INPUT', 'Selected photo is unavailable; resolve it before generation');
            if (photoMeta.deletedAt || photoMeta.isOwnPhoto !== true || photoMeta.assetHash !== input.photo.assetHash) fail('INVALID_INPUT', 'Photo must be explicitly declared as the user own photo and match the selected hash');
            photo = {id: photoMeta.id, assetHash: photoMeta.assetHash};
            include(photo.assetHash, 'own-photo', {photoId: photo.id});
        }
        if (!Array.isArray(input.materialIds) || new Set(input.materialIds).size !== input.materialIds.length) fail('INVALID_INPUT', 'materialIds must be unique selected IDs');
        const materials = input.materialIds.sort().map(materialId => {
            id(materialId);
            const item = (meta.materials || []).find(entry => entry.id === materialId);
            if (!item) fail('INVALID_INPUT', 'Unknown selected content material');
            if (item.deletedAt || (meta.unavailableReferences || []).some(entry => (entry.id === materialId || entry.resolvedObjectId === materialId) && entry.deletedAt)) fail('INVALID_INPUT', 'Selected content material is trashed');
            include(item.assetHash, 'material', {materialId});
            return {id: item.id, assetHash: item.assetHash, originalName: item.originalName, role: item.role};
        });
        if (input.coverText !== undefined) {
            if(typeof input.coverText !== 'string' || !input.coverText.trim() || input.coverText.length > 10000) fail('INVALID_INPUT','Cover text must be bounded text');
            const p=meta.productionState?.packaging;
            if(!p || !p.coverTexts.some(c=>c.id===p.selectedCoverTextId && c.text===input.coverText)) fail('STALE_INPUT','Cover text must match the saved human selection');
        }
        return {
            protocol: PROTOCOL,
            libraryId,
            contentId: meta.id,
            ...(input.coverText !== undefined ? {coverText:input.coverText} : {}),
            title: meta.title,
            bodyHash: hash(bodyBytes),
            template: {id: input.template.id, version: input.template.version, packageHash: version.packageHash},
            styleAssetHashes: input.styleAssetHashes,
            templateDefinition: pkg.definition,
            photo,
            materials,
            prompt: input.prompt,
            pixels: input.pixels,
            ...(input.sizePolicy === 'ratio-minimum' ? {sizePolicy: input.sizePolicy} : {}),
            ratio: input.ratio,
            count: input.count,
            outputFormat: input.outputFormat,
            inputs
        };
    }

    function preparedRequest(current, fingerprint) {
        const jobs = (current.coverJobs || []).filter(job => job.inputHash === fingerprint.inputHash);
        if (jobs.length > 1) fail('CORRUPT', 'Cover input has multiple fixed requests');
        if (!jobs.length) return null;
        const fixed = requestPackage(current.id, jobs[0]);
        const normalized = Object.fromEntries(Object.entries(fixed.request).filter(([key]) => !['format', 'schemaVersion', 'requestId', 'createdAt', 'inputHash', 'requestHash'].includes(key)));
        if (hash(jsonBytes(normalized)) !== fingerprint.inputHash || fixed.request.title !== fingerprint.title || fixed.request.bodyHash !== fingerprint.bodyHash) fail('CORRUPT', 'Cover request differs from the prepared input');
        return {content: current, ...fixed};
    }

    function inspectCoverInput(contentId, raw, token) {
        id(contentId);
        checkedHash(token);
        return locked(() => {
            const before = snapshot(root, contentId), current = result(before, contentId);
            if (current.editToken !== token) fail('CONFLICT', 'Content changed before inspecting cover input');
            if (current.deletedAt) fail('INVALID_STATE', 'Content is trashed');
            const normalized = normalizeRequest(current, before[1], raw);
            const fingerprint = {
                contentId,
                title: current.title,
                bodyHash: normalized.bodyHash,
                editToken: current.editToken,
                inputHash: hash(jsonBytes(normalized))
            };
            const existing = preparedRequest(current, fingerprint);
            return {
                ...fingerprint,
                existingRequest: existing ? {
                    requestId: existing.request.requestId,
                    requestHash: existing.request.requestHash
                } : null
            };
        });
    }

    function findCoverRequest(contentId, raw) {
        id(contentId);
        const fingerprint = inputFields(raw, ['inputHash', 'title', 'bodyHash'], ['inputHash', 'title', 'bodyHash']);
        checkedHash(fingerprint.inputHash);
        checkedHash(fingerprint.bodyHash);
        text(fingerprint.title, 'title');
        if (fingerprint.title.length > 500) fail('INVALID_INPUT', 'Title must contain 1–500 characters');
        return locked(() => {
            const before = snapshot(root, contentId), current = result(before, contentId);
            if (current.deletedAt) fail('INVALID_STATE', 'Content is trashed');
            fresh(current, before[1], fingerprint);
            return preparedRequest(current, fingerprint);
        });
    }

    function createCoverRequest(contentId, raw, token, options) {
        id(contentId);
        checkedHash(token);
        const requestInput = {
            action: 'createCoverRequest',
            request: inputFields(raw, ['template', 'styleAssetHashes', 'photo', 'materialIds', 'prompt', 'pixels', 'ratio', 'count', 'outputFormat', 'scope', 'sizePolicy', 'coverText'], ['template', 'styleAssetHashes', 'photo', 'materialIds', 'prompt', 'pixels', 'ratio', 'count', 'outputFormat', 'scope'])
        };
        if (requestInput.request.sizePolicy === 'exact') delete requestInput.request.sizePolicy;
        const replayed = replayCoverRequest(contentId, requestInput, token, options);
        if (replayed) {
            const job = replayed.coverJobs.at(-1);
            return response(replayed, job.id);
        }
        const initial = locked(() => {
            const before = snapshot(root, id(contentId));
            const current = result(before, contentId);
            if (current.editToken !== token) fail('CONFLICT', 'Content changed before creating cover request');
            if (current.deletedAt) fail('INVALID_STATE', 'Content is trashed');
            const normalized = normalizeRequest(current, before[1], raw);
            const inputHash = hash(jsonBytes(normalized));
            const existing = (current.coverJobs || []).find(job => job.inputHash === inputHash);
            return {normalized, inputHash, existing, current};
        });
        if (initial.existing) return {content: initial.current, ...requestPackage(contentId, initial.existing)};
        const requestId = randomUUID();
        const updated = mutate('update', contentId, requestInput, token, options, 'content', (old, before) => {
            const meta = extend(old), now = new Date().toISOString();
            const normalized = normalizeRequest(meta, before[1], raw);
            if (hash(jsonBytes(normalized)) !== initial.inputHash) fail('CONFLICT', 'Selected inputs changed before creating request');
            const request = {
                format: 'nova-cover-request',
                schemaVersion: normalized.sizePolicy === 'ratio-minimum' ? 2 : 1,
                requestId,
                createdAt: now,
                inputHash: initial.inputHash, ...normalized
            };
            const dir = requestDir(contentId, requestId);
            ensureDirectory(path.dirname(dir));
            ensureDirectory(dir);
            ensureDirectory(path.join(dir, '输入'));
            ensureDirectory(path.join(dir, '尝试'));
            immutableFile(path.join(dir, '正文.md'), before[1]);
            for (const entry of request.inputs) immutableFile(path.join(dir, '输入', entry.assetHash), readAssetInternal(root, entry.assetHash).data);
            const bytes = jsonBytes(request);
            immutableFile(path.join(dir, '请求.json'), bytes);
            meta.coverJobs.push({
                id: requestId,
                requestHash: hash(bytes),
                inputHash: initial.inputHash,
                createdAt: now,
                activeAttemptId: null,
                attempts: []
            });
            return meta;
        });
        const registered = updated.coverJobs.find(job => job.inputHash === initial.inputHash);
        return response(updated, registered.id);
    }

    function createCoverAttempt(contentId, requestId, raw, options) {
        const input = inputFields(raw, ['host', 'reason'], ['host']);
        host(input.host);
        if (input.reason !== undefined) text(input.reason, 'attempt reason');
        const attemptId = randomUUID();
        const updated = changeCurrent(id(contentId), {
            action: 'createCoverAttempt',
            requestId: id(requestId), ...input
        }, (old, before) => {
            const meta = extend(old), {job} = find(meta, requestId);
            const {request} = requestPackage(contentId, job);
            const templateMeta = metadata(snapshot(root, request.template.id, 'template')[0], request.template.id, 'template');
            if (!selectableTemplate(templateMeta)) fail('INVALID_INPUT', 'Selected template is unavailable');
            fresh(meta, before[1], request);
            const now = new Date().toISOString();
            const sourceAttemptId = job.activeAttemptId || job.attempts.at(-1)?.attemptId || null;
            supersede(job, now);
            const dir = attemptDir(contentId, requestId, attemptId);
            ensureDirectory(dir);
            ensureDirectory(path.join(dir, 'inbox'));
            ensureDirectory(path.join(dir, '收件'));
            const handoff = {
                format: 'nova-cover-handoff',
                schemaVersion: 1,
                protocol: PROTOCOL,
                libraryId,
                contentId,
                requestId,
                requestHash: job.requestHash,
                attemptId,
                sourceAttemptId,
                host: input.host,
                createdAt: now,
                inputAssetHashes: [...new Set(request.inputs.map(entry => entry.assetHash))]
            };
            const bytes = jsonBytes(handoff);
            immutableFile(path.join(dir, '交接.json'), bytes);
            job.activeAttemptId = attemptId;
            job.attempts.push({
                attemptId,
                host: input.host,
                reason: input.reason || 'initial',
                status: 'created',
                createdAt: now,
                updatedAt: now,
                handoffHash: hash(bytes),
                receiptHash: null,
                reportHash: null,
                candidateIds: [],
                failure: null
            });
            return meta;
        }, options);
        // A mutationId retry returns its historical attempt, even after later attempts exist.
        const job = find(updated, requestId).job;
        const attempt = job.attempts.find(item => item.attemptId === job.activeAttemptId);
        return {
            content: updated,
            attempt,
            handoff: handoffPackage(contentId, job, attempt),
            inbox: path.join(attemptDir(contentId, requestId, attempt.attemptId), 'inbox')
        };
    }

    function coverContext(contentId, current, job, attempt, readTemplate = (tid, version, packageHash) => templatePackage(root, tid, version, packageHash)) {
        const requestId = job.id, attemptId = attempt.attemptId;
        const {request, bodyBytes} = requestPackage(contentId, job);
        const pkg = readTemplate(request.template.id, request.template.version, request.template.packageHash);
        const handoff = handoffPackage(contentId, job, attempt);
        const dir = requestDir(contentId, requestId);
        const inbox = path.join(attemptDir(contentId, requestId, attemptId), 'inbox');
        directory(inbox);
        return {
            content: current,
            request,
            requestPath: path.join(dir, '请求.json'),
            bodyPath: path.join(dir, '正文.md'),
            ...progressStore.read(attemptDir(contentId, requestId, attemptId), ownership(contentId, job, attempt)),
            attempt,
            handoff,
            body: bodyBytes.toString('utf8'),
            bodyBytes,
            inbox,
            ...templateContextDocuments(root, request.template, pkg, {objectId, assetPath, readAssetInternal, fail, styleAssetHashes: request.styleAssetHashes}),
            inputs: request.inputs.map(entry => ({...entry, path: path.join(dir, '输入', entry.assetHash)}))
        };
    }

    function readCoverContext(contentId, requestId, attemptId) {
        return locked(() => {
            const current = content(id(contentId)), {job, attempt} = find(current, requestId, attemptId);
            return coverContext(contentId, current, job, attempt);
        });
    }

    function readCoverState(contentId) {
        return locked(() => {
            const current = content(id(contentId)), templates = new Map(), requests = new Map();
            // One locked read validates each shared immutable package in full once;
            // fixed input copies are still verified separately for every request.
            const readTemplate = (tid, version, packageHash) => {
                const key = JSON.stringify([tid, version, packageHash]);
                if (!templates.has(key)) templates.set(key, templatePackage(root, tid, version, packageHash));
                return templates.get(key);
            };
            for (const job of current.coverJobs || []) {
                const attempt = job.attempts.find(a => a.attemptId === job.activeAttemptId) || job.attempts.at(-1);
                let request = null;
                if (attempt) try { request = coverContext(contentId, current, job, attempt, readTemplate).request; }
                catch (error) {
                    const unavailable = ['ENOENT', 'EACCES', 'EPERM', 'EIO', 'ENOTDIR'];
                    const unreadable = unavailable.includes(error.code) || error instanceof LibraryError && error.code === 'IO_ERROR' && unavailable.includes(error.cause?.code);
                    if (!(error instanceof LibraryError && error.code === 'CORRUPT') && !unreadable) throw error;
                }
                requests.set(job.id, request);
            }
            const progress = {editToken: current.editToken, jobs: (current.coverJobs || []).map(job => ({id: job.id, activeAttemptId: job.activeAttemptId, attempts: job.attempts.map(attempt => ({attemptId: attempt.attemptId, status: attempt.status, ...progressStore.read(attemptDir(contentId, job.id, attempt.attemptId), ownership(contentId, job, attempt))}))}))};
            return {content: current, progress, requests};
        });
    }

    function claimCoverAttempt(contentId, requestId, attemptId, raw, options) {
        const input = inputFields(raw, ['host', 'readAssetHashes'], ['host', 'readAssetHashes']);
        host(input.host);
        if (!Array.isArray(input.readAssetHashes) || input.readAssetHashes.some(value => !HASH.test(value)) || new Set(input.readAssetHashes).size !== input.readAssetHashes.length) fail('INVALID_INPUT', 'Require unique hashes of the supplied input files');
        const updated = changeCurrent(id(contentId), {
            action: 'claimCoverAttempt',
            requestId: id(requestId),
            attemptId: id(attemptId), ...input
        }, (old, before) => {
            const meta = extend(old), {job, attempt} = find(meta, requestId, attemptId);
            active(meta, job, attempt);
            if (attempt.host !== input.host) fail('INVALID_INPUT', 'Host does not own this attempt');
            const {request} = requestPackage(contentId, job);
            handoffPackage(contentId, job, attempt);
            fresh(meta, before[1], request);
            if (JSON.stringify([...new Set(request.inputs.map(entry => entry.assetHash))].sort()) !== JSON.stringify([...input.readAssetHashes].sort())) fail('INVALID_INPUT', 'Host receipt must acknowledge every supplied input hash');
            attempt.status = 'claimed';
            attempt.updatedAt = new Date().toISOString();
            return meta;
        }, options);
        return response(updated, requestId, attemptId);
    }

    function finish(contentId, requestId, attemptId, status, failure, options) {
        const updated = changeCurrent(id(contentId), {
            action: `${status}CoverAttempt`,
            requestId: id(requestId),
            attemptId: id(attemptId),
            failure
        }, old => {
            const meta = extend(old), {job, attempt} = find(meta, requestId, attemptId);
            active(meta, job, attempt);
            attempt.status = status;
            attempt.failure = failure;
            attempt.updatedAt = new Date().toISOString();
            job.activeAttemptId = null;
            return meta;
        }, options);
        return response(updated, requestId, attemptId);
    }

    function failCoverAttempt(contentId, requestId, attemptId, raw, options) {
        const failure = inputFields(raw, ['code', 'message'], ['code', 'message']);
        text(failure.code, 'failure code');
        text(failure.message, 'failure message');
        return finish(contentId, requestId, attemptId, 'failed', failure, options);
    }

    const cancelCoverAttempt = (contentId, requestId, attemptId, options) => finish(contentId, requestId, attemptId, 'cancelled', null, options);

    function receiptInput(raw, contentId, requestId, attemptId) {
        const bytes = Buffer.isBuffer(raw) ? Buffer.from(raw) : jsonBytes(raw);
        if (bytes.length > 64 * 1024) fail('INVALID_INPUT', 'Receipt exceeds 64 KiB');
        let value;
        try {
            value = JSON.parse(bytes);
        } catch {
            fail('INVALID_INPUT', 'Invalid receipt JSON');
        }
        const receipt = inputFields(value, ['libraryId', 'contentId', 'requestId', 'attemptId', 'requestHash', 'resultId', 'files'], ['libraryId', 'contentId', 'requestId', 'attemptId', 'requestHash', 'resultId', 'files']);
        if (receipt.libraryId !== libraryId || receipt.contentId !== contentId || receipt.requestId !== requestId || receipt.attemptId !== attemptId) fail('INVALID_INPUT', 'Receipt ownership does not match the bound library and attempt');
        checkedHash(receipt.requestHash);
        id(receipt.resultId);
        if (!Array.isArray(receipt.files) || receipt.files.length > 20) fail('INVALID_INPUT', 'Receipt files must be an array of up to twenty name/hash pairs');
        const names = new Set();
        for (const file of receipt.files) {
            inputFields(file, ['name', 'sha256'], ['name', 'sha256']);
            checkedHash(file.sha256);
            const name = file.name;
            if (typeof name !== 'string' || !name.length || name.length > 255 || name === '.' || name === '..' || /[\\/:\x00-\x1f]/.test(name) || /[. ]$/.test(name) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) || names.has(name)) fail('UNSAFE_PATH', 'Receipt accepts only unique inbox basenames');
            names.add(name);
        }
        return {receipt, bytes, receiptHash: hash(bytes)};
    }

    function stableBytes(filename) {
        const stat = safePath(filename);
        if (!stat.isFile() || stat.size < 1 || stat.size > 64 * 1024 * 1024) fail('INVALID_IMAGE', 'Inbox image must be a regular file of 1 byte to 64 MiB');
        const fd = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
        try {
            const before = fs.fstatSync(fd, {bigint: true});
            const chunks = [];
            let size = 0;
            for (; ;) {
                const chunk = Buffer.alloc(64 * 1024), count = fs.readSync(fd, chunk, 0, chunk.length, null);
                if (!count) break;
                size += count;
                if (size > 64 * 1024 * 1024) fail('INVALID_IMAGE', 'Inbox image exceeds 64 MiB');
                chunks.push(chunk.subarray(0, count));
            }
            const after = fs.fstatSync(fd, {bigint: true}), current = fs.lstatSync(filename, {bigint: true});
            if (['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].some(key => before[key] !== after[key] || after[key] !== current[key]) || BigInt(size) !== after.size || current.isSymbolicLink()) fail('CONFLICT', 'Inbox file changed while copying');
            return Buffer.concat(chunks, size);
        } finally {
            fs.closeSync(fd);
        }
    }

    function verifyCommittedEvidence(contentId, meta, job, attempt, receiptHash) {
        if (attempt.receiptHash !== receiptHash) fail('RECEIPT_CONFLICT', 'Attempt was already committed with a different receipt');
        const location = path.join(attemptDir(contentId, job.id, attempt.attemptId), '收件', receiptHash);
        if (hash(read(path.join(location, '回执.json'))) !== receiptHash || hash(read(path.join(location, '校验报告.json'))) !== attempt.reportHash) fail('CORRUPT', 'Committed receipt or report checksum mismatch');
        for (const candidateId of attempt.candidateIds) readAssetInternal(root, meta.candidates.find(item => item.id === candidateId).assetHash);
    }

    async function commitCoverAttempt(contentId, requestId, attemptId, raw) {
        id(contentId);
        id(requestId);
        id(attemptId);
        const {receipt, bytes: receiptBytes, receiptHash} = receiptInput(raw, contentId, requestId, attemptId);
        const prepared = locked(() => {
            const current = content(contentId), {job, attempt} = find(current, requestId, attemptId);
            if (receipt.requestHash !== job.requestHash) fail('INVALID_INPUT', 'Receipt requestHash does not match immutable request');
            const {request} = requestPackage(contentId, job);
            handoffPackage(contentId, job, attempt);
            if (attempt.status === 'committed') {
                verifyCommittedEvidence(contentId, current, job, attempt, receiptHash);
                return {done: {content: current, attempt, candidateIds: attempt.candidateIds}};
            }
            const location = path.join(attemptDir(contentId, requestId, attemptId), '收件', receiptHash);
            ensureDirectory(location);
            immutableFile(path.join(location, '回执.json'), receiptBytes);
            return {request, location, inbox: path.join(attemptDir(contentId, requestId, attemptId), 'inbox')};
        });
        if (prepared.done) return prepared.done;
        const files = [];
        let totalBytes = 0;
        let report;
        try {
            if (receipt.files.length !== prepared.request.count) fail('IMAGE_COUNT_MISMATCH', `Expected exactly ${prepared.request.count} images, received ${receipt.files.length}`);
            // Decoding stays outside the library lock; every persistent write uses a short lock.
            for (let index = 0; index < receipt.files.length; index++) {
                assertRootIdentity();
                const {name, sha256} = receipt.files[index];
                const captured = path.join(prepared.location, `图片-${index}`);
                let bytes = safePath(captured, true) ? stableBytes(captured) : null;
                if (bytes === null) {
                    bytes = stableBytes(path.join(prepared.inbox, name));
                    locked(() => immutableFile(captured, bytes));
                }
                if (hash(bytes) !== sha256) fail('IMAGE_HASH_MISMATCH', 'Image bytes do not match receipt SHA256');
                totalBytes += bytes.length;
                if (totalBytes > 512 * 1024 * 1024) fail('INVALID_IMAGE', 'Result batch exceeds 512 MiB');
                hook('coverBeforeDecode', {contentId, requestId, attemptId, index});
                if (bytes.length > 64 * 1024 * 1024) fail('INVALID_IMAGE', 'Captured image exceeds byte limit');
                let decoded;
                try {
                    decoded = await validateImage(bytes);
                } catch (error) {
                    throw new LibraryError(error.code || 'INVALID_IMAGE', error.message, {cause: error});
                }
                hook('coverAfterDecode', {contentId, requestId, attemptId, index});
                assertRootIdentity();
                if (decoded.format !== prepared.request.outputFormat) fail('IMAGE_FORMAT_MISMATCH', 'Image format does not match request');
                const {width, height} = prepared.request.pixels;
                if (prepared.request.sizePolicy === 'ratio-minimum') {
                    if (decoded.width * height !== decoded.height * width) fail('IMAGE_DIMENSIONS_MISMATCH', `Decoded display ratio ${decoded.width}:${decoded.height} does not match required ${prepared.request.ratio}`);
                    if (decoded.width < width || decoded.height < height) fail('IMAGE_DIMENSIONS_MISMATCH', `Decoded display pixels ${decoded.width}x${decoded.height} are below minimum ${width}x${height}`);
                } else if (decoded.width !== width || decoded.height !== height) fail('IMAGE_DIMENSIONS_MISMATCH', `Decoded display pixels ${decoded.width}x${decoded.height} do not match exact ${width}x${height}`);
                if (files.some(entry => entry.decoded.assetHash === decoded.assetHash)) fail('DUPLICATE_IMAGE', 'Result batch contains identical image bytes');
                files.push({name, bytes, decoded});
            }
            hook('coverBeforeCommit', {contentId, requestId, attemptId});
            report = {
                format: 'nova-cover-validation',
                schemaVersion: 1,
                receiptHash,
                requestHash: receipt.requestHash,
                status: 'passed',
                decoded: true,
                quality: 'pending-human-review',
                files: files.map(entry => ({originalName: entry.name, ...entry.decoded}))
            };
            const reportBytes = jsonBytes(report);
            const reportHash = hash(reportBytes);
            const updated = changeCurrent(contentId, {
                action: 'commitCoverAttempt',
                requestId,
                attemptId,
                receiptHash
            }, (old, before) => {
                const meta = extend(old), {job, attempt} = find(meta, requestId, attemptId);
                if (attempt.status === 'committed') {
                    verifyCommittedEvidence(contentId, meta, job, attempt, receiptHash);
                    return meta;
                }
                const {request} = requestPackage(contentId, job);
                handoffPackage(contentId, job, attempt);
                active(meta, job, attempt, true);
                fresh(meta, before[1], request);
                if (job.requestHash !== receipt.requestHash) fail('CORRUPT', 'Request changed while validating');
                immutableFile(path.join(prepared.location, '回执.json'), receiptBytes);
                for (let index = 0; index < files.length; index++) immutableFile(path.join(prepared.location, `图片-${index}`), files[index].bytes);
                immutableFile(path.join(prepared.location, '校验报告.json'), reportBytes);
                const now = new Date().toISOString(), candidateIds = [];
                for (const file of files) {
                    const target = assetPath(root, file.decoded.assetHash);
                    ensureDirectory(path.dirname(target));
                    hook('beforeAssetInstall', {assetHash: file.decoded.assetHash});
                    immutableFile(target, file.bytes);
                    hook('afterAssetInstall', {assetHash: file.decoded.assetHash});
                    const candidateId = randomUUID();
                    candidateIds.push(candidateId);
                    meta.candidates.push({
                        id: candidateId,
                        assetHash: file.decoded.assetHash,
                        requestId,
                        attemptId,
                        template: request.template,
                        source: attempt.host,
                        originalName: file.name,
                        accepted: false,
                        createdAt: now
                    });
                }
                hook('coverAfterAssetsInstalled', {contentId, requestId, attemptId});
                attempt.status = 'committed';
                attempt.updatedAt = now;
                attempt.receiptHash = receiptHash;
                attempt.reportHash = reportHash;
                attempt.candidateIds = candidateIds;
                job.activeAttemptId = null;
                return meta;
            });
            const attempt = find(updated, requestId, attemptId).attempt;
            return {content: updated, attempt, candidateIds: attempt.candidateIds};
        } catch (error) {
            const failure = error instanceof LibraryError ? error : new LibraryError('IO_ERROR', error.message, {cause: error});
            failure.receiptHash = receiptHash;
            if (failure.outcome === 'committed') throw failure;
            // A submission/archival failure must not be labelled a failed pixel validation.
            const rejected = jsonBytes({
                format: 'nova-cover-validation',
                schemaVersion: 1,
                receiptHash,
                requestHash: receipt.requestHash,
                status: report ? 'submission-error' : 'rejected',
                code: failure.code,
                message: failure.message,
                files: files.map(entry => ({originalName: entry.name, ...entry.decoded}))
            });
            try {
                locked(() => immutableFile(path.join(prepared.location, `拒绝-${hash(rejected)}.json`), rejected));
            } catch (preservationError) {
                failure.preservationError = preservationError.message;
            }
            throw failure;
        }
    }

    if (h.validationContent) {
        const meta = h.validationContent;
        for (const job of meta.coverJobs || []) {
            const {request} = requestPackage(meta.id, job);
            const normalized = Object.fromEntries(Object.entries(request).filter(([key]) => !['format', 'schemaVersion', 'requestId', 'createdAt', 'inputHash', 'requestHash'].includes(key)));
            if (hash(jsonBytes(normalized)) !== job.inputHash) fail('CORRUPT', 'Restored request input hash mismatch');
            if (!Number.isSafeInteger(request.count) || request.count < 1 || request.count > 20 || !request.template) fail('CORRUPT', 'Invalid restored request shape');
            templatePackage(root, request.template.id, request.template.version, request.template.packageHash);
            for (const attempt of job.attempts) {
                const handoff = handoffPackage(meta.id, job, attempt);
                if (JSON.stringify(handoff.inputAssetHashes) !== JSON.stringify([...new Set(request.inputs.map(entry => entry.assetHash))])) fail('CORRUPT', 'Restored handoff input mismatch');
                directory(path.join(attemptDir(meta.id, job.id, attempt.attemptId), 'inbox'));
                if (attempt.status === 'committed') {
                    verifyCommittedEvidence(meta.id, meta, job, attempt, attempt.receiptHash);
                    const location = path.join(attemptDir(meta.id, job.id, attempt.attemptId), '收件', attempt.receiptHash);
                    const raw = read(path.join(location, '回执.json'));
                    const {receipt} = receiptInput(raw, meta.id, job.id, attempt.attemptId);
                    if (receipt.requestHash !== job.requestHash) fail('CORRUPT', 'Restored receipt request mismatch');
                    const report = JSON.parse(read(path.join(location, '校验报告.json')));
                    if (report.format !== 'nova-cover-validation' || report.schemaVersion !== 1 || report.receiptHash !== attempt.receiptHash || report.requestHash !== job.requestHash || report.status !== 'passed' || report.decoded !== true) fail('CORRUPT', 'Restored validation report ownership mismatch');
                    if (receipt.files.length !== request.count || attempt.candidateIds.length !== receipt.files.length || !Array.isArray(report.files) || report.files.length !== receipt.files.length) fail('CORRUPT', 'Restored result count mismatch');
                    for (let index = 0; index < receipt.files.length; index++) {
                        const file = receipt.files[index],
                            candidate = meta.candidates.find(item => item.id === attempt.candidateIds[index]);
                        if (hash(read(path.join(location, `图片-${index}`))) !== file.sha256 || candidate.assetHash !== file.sha256 || candidate.originalName !== file.name || report.files[index].assetHash !== file.sha256 || report.files[index].originalName !== file.name) fail('CORRUPT', 'Restored captured image or candidate mismatch');
                    }
                }
            }
        }
        return {};
    }
    return {
        inspectCoverInput,
        findCoverRequest,
        createCoverRequest,
        createCoverAttempt,
        claimCoverAttempt,
        readCoverContext,
        readCoverState,
        readCoverProgress,
        reportCoverProgress,
        commitCoverAttempt,
        failCoverAttempt,
        cancelCoverAttempt
    };
}
