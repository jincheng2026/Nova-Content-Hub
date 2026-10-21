import {templateReports} from './template-reports.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {validateImage, validateImportedRaster} from '../image-validation/index.mjs';
import {templateContextDocuments} from './template-context-documents.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HASH = /^[a-f0-9]{64}$/;
const uuid = value => typeof value === 'string' && UUID.test(value);
const digest = value => typeof value === 'string' && HASH.test(value);
const LIVE = ['created', 'claimed'];
const HOSTS = ['codex', 'workbuddy'];
const STATES = [...LIVE, 'committed', 'failed', 'cancelled', 'superseded'];
const PROTOCOL = Object.freeze({name: 'nova-template-execution', version: 1, appScope: 'nova-content-hub', scope: 'template-study-restore'});
const exact = (v, keys) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const iso = value => {try { return typeof value === 'string' && new Date(value).toISOString() === value; } catch { return false; }};
const bounded = (v, limit) => typeof v === 'string' && v.trim().length > 0 && v.length <= limit;
const reference = v => exact(v, ['id', 'version', 'packageHash']) && typeof v.id === 'string' && (uuid(v.id) || /^builtin-[a-z0-9][a-z0-9-]*$/.test(v.id)) && Number.isSafeInteger(v.version) && v.version > 0 && digest(v.packageHash);

export function validateTemplateJobs(meta, fail) {
    const check = (ok, label) => {if (!ok) fail('CORRUPT', `Invalid template jobs: ${label}`);};
    if (meta.schemaVersion === 1) {check(!Object.hasOwn(meta, 'templateJobs'), 'v1 extension'); return;}
    check(meta.schemaVersion === 2 && Array.isArray(meta.templateJobs), 'v2 array');
    const requests = new Set(), attempts = new Set();
    let live = 0;
    for (const job of meta.templateJobs) {
        check(exact(job, ['id', 'inputHash', 'requestHash', 'createdAt', 'activeAttemptId', 'attempts', 'acceptance']) && uuid(job.id) && !requests.has(job.id) && digest(job.inputHash) && digest(job.requestHash) && iso(job.createdAt) && Array.isArray(job.attempts), 'request');
        requests.add(job.id);
        for (let i = 0; i < job.attempts.length; i++) {
            const a = job.attempts[i];
            check(exact(a, ['attemptId', 'host', 'sourceAttemptId', 'reason', 'status', 'createdAt', 'updatedAt', 'handoffHash', 'receiptHash', 'reportHash', 'resultHash', 'failure']) && uuid(a.attemptId) && !attempts.has(a.attemptId) && HOSTS.includes(a.host) && bounded(a.reason, 1000) && STATES.includes(a.status) && iso(a.createdAt) && iso(a.updatedAt) && digest(a.handoffHash), 'attempt');
            attempts.add(a.attemptId);
            check(a.sourceAttemptId === null ? i === 0 : job.attempts.slice(0, i).some(item => item.attemptId === a.sourceAttemptId), 'source attempt');
            check(a.failure === null || exact(a.failure, ['code', 'message']) && typeof a.failure.code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(a.failure.code) && bounded(a.failure.message, 2000), 'failure');
            check(a.status === 'failed' ? a.failure !== null : a.failure === null, 'failure state');
            check(a.status === 'committed' ? [a.receiptHash, a.reportHash, a.resultHash].every(v => digest(v)) : [a.receiptHash, a.reportHash, a.resultHash].every(v => v === null), 'result references');
            if (LIVE.includes(a.status)) {live++; check(job.activeAttemptId === a.attemptId, 'active ownership');}
        }
        check(job.activeAttemptId === null || job.attempts.some(a => a.attemptId === job.activeAttemptId && LIVE.includes(a.status)), 'active reference');
        if (job.acceptance !== null) {
            const a = job.acceptance;
            check(exact(a, ['requestId', 'attemptId', 'requestHash', 'resultHash', 'sourceTemplate', 'acceptedTemplate', 'acceptedAt']) && a.requestId === job.id && a.requestHash === job.requestHash && reference(a.sourceTemplate) && reference(a.acceptedTemplate) && a.sourceTemplate.id === meta.id && a.acceptedTemplate.id === meta.id && a.acceptedTemplate.version > a.sourceTemplate.version && iso(a.acceptedAt), 'acceptance');
            check(job.attempts.some(item => item.attemptId === a.attemptId && item.status === 'committed' && item.resultHash === a.resultHash) && meta.versions.some(v => v.version === a.sourceTemplate.version && v.packageHash === a.sourceTemplate.packageHash) && meta.versions.some(v => v.version === a.acceptedTemplate.version && v.packageHash === a.acceptedTemplate.packageHash) && job.activeAttemptId === null, 'acceptance ownership');
        }
    }
    check(live <= 1, 'one active attempt per template');
}

export function templateJobMethods(h) {
    const {root, libraryId, locked, mutate, replayTemplateMutation, snapshot, result, metadata, hash, jsonBytes, read, safePath, directory, ensureDirectory, immutableFile, readAssetInternal, assetPath, hook, inputFields, objectId, id, checkedHash, templatePackage, normalizePackage, installTemplatePackage, assertRootIdentity, fail} = h;
    const requestDir = (tid, rid) => path.join(root, '模板', objectId('template', tid), '学习任务', id(rid));
    const attemptDir = (tid, rid, aid) => path.join(requestDir(tid, rid), '尝试', id(aid));
    const current = tid => result(snapshot(root, objectId('template', tid), 'template'), tid, undefined, 'template');
    const projection = meta => ({...meta, name: meta.title, templateJobs: meta.templateJobs || [], ...templatePackage(root, meta.id, meta.currentVersion, meta.versions.find(v => v.version === meta.currentVersion).packageHash)});
    const change = (tid, input, edit, options, token) => mutate('update', objectId('template', tid), input, token, options, 'template', edit, undefined, token === undefined);
    const host = value => {if (!HOSTS.includes(value)) fail('INVALID_INPUT', 'Unknown template execution host'); return value;};
    const requireText = (value, label, max) => {if (!bounded(value, max)) fail('INVALID_INPUT', `${label} is empty or exceeds ${max} characters`); return value;};
    function find(meta, rid, aid) {
        id(rid);
        const job = (meta.templateJobs || []).find(j => j.id === rid);
        if (!job) fail('INVALID_INPUT', 'Unknown template request');
        if (aid === undefined) return {job};
        id(aid);
        const attempt = job.attempts.find(a => a.attemptId === aid);
        if (!attempt) fail('INVALID_INPUT', 'Unknown template attempt');
        return {job, attempt};
    }
    function active(meta, job, attempt, claimed = false) {
        if (meta.deletedAt) fail('INVALID_STATE', 'Template is trashed');
        if (job.acceptance || job.activeAttemptId !== attempt.attemptId || !LIVE.includes(attempt.status)) fail('ATTEMPT_INACTIVE', 'Template attempt has ended');
        if (claimed && attempt.status !== 'claimed') fail('ATTEMPT_NOT_CLAIMED', 'Claim the attempt before submitting');
    }
    const payloadFields = ['protocol', 'libraryId', 'templateId', 'template', 'templateDefinition', 'templateResources', 'styleAssetHashes', 'inputs', 'restore', 'notes'];
    function requestPackage(tid, job, includePackage = false) {
        const raw = read(path.join(requestDir(tid, job.id), '请求.json'));
        if (hash(raw) !== job.requestHash) fail('CORRUPT', 'Template request checksum mismatch');
        let request;
        try {request = JSON.parse(raw);} catch {fail('CORRUPT', 'Invalid template request JSON');}
        const ratioMinimum = request?.schemaVersion === 2 && request.sizePolicy === 'ratio-minimum';
        const fields = [...payloadFields, ...(ratioMinimum ? ['sizePolicy'] : [])];
        const supportedSize = request?.schemaVersion === 1 && !Object.hasOwn(request, 'sizePolicy') || ratioMinimum;
        if (!exact(request, ['format', 'schemaVersion', 'requestId', 'createdAt', 'inputHash', ...fields]) || request.format !== 'nova-template-request' || !supportedSize || request.libraryId !== libraryId || request.templateId !== tid || request.requestId !== job.id || request.createdAt !== job.createdAt || request.inputHash !== job.inputHash || !isDeepStrictEqual(request.protocol, PROTOCOL) || !reference(request.template) || request.template.id !== tid || typeof request.notes !== 'string' || request.notes.length > 10000) fail('CORRUPT', 'Template request identity mismatch');
        const normalized = Object.fromEntries(fields.map(k => [k, request[k]]));
        if (hash(jsonBytes(normalized)) !== job.inputHash) fail('CORRUPT', 'Template input checksum mismatch');
        const pkg = templatePackage(root, tid, request.template.version, request.template.packageHash);
        if (!isDeepStrictEqual(pkg.definition, request.templateDefinition) || !isDeepStrictEqual(pkg.resources, request.templateResources)) fail('CORRUPT', 'Fixed template package differs');
        const styles = [...new Set(Object.values(pkg.resources).filter(r => r.role === 'style').map(r => r.assetHash))];
        if (!Array.isArray(request.styleAssetHashes) || !styles.length || styles.length > 50 || !isDeepStrictEqual(styles, request.styleAssetHashes) || !Array.isArray(request.inputs) || request.inputs.length !== styles.length) fail('CORRUPT', 'Template request must contain the entire ordered reference group');
        for (let i = 0; i < styles.length; i++) {
            const entry = request.inputs[i];
            if (!exact(entry, ['role', 'assetHash', 'bytes', 'detectedType', 'width', 'height']) || entry.role !== 'style' || entry.assetHash !== styles[i] || !Number.isSafeInteger(entry.bytes) || entry.bytes < 1 || entry.bytes > 64 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(entry.detectedType) || ![entry.width, entry.height].every(v => Number.isSafeInteger(v) && v > 0) || entry.width * entry.height > 40_000_000) fail('CORRUPT', 'Invalid template input');
            const bytes = read(path.join(requestDir(tid, job.id), '输入', checkedHash(entry.assetHash)));
            if (hash(bytes) !== entry.assetHash || bytes.length !== entry.bytes) fail('CORRUPT', 'Template input snapshot checksum mismatch');
            const asset = readAssetInternal(root, entry.assetHash);
            if (asset.bytes !== entry.bytes || asset.detectedType !== entry.detectedType) fail('CORRUPT', 'Template input asset mismatch');
        }
        const first = request.inputs[0];
        if (!exact(request.restore, ['sourceAssetHash', 'width', 'height', 'outputFormat']) || request.restore.sourceAssetHash !== first.assetHash || request.restore.width !== first.width || request.restore.height !== first.height || request.restore.outputFormat !== 'png') fail('CORRUPT', 'Invalid first-reference restore target');
        const fixed = {...request, requestHash: job.requestHash};
        return includePackage ? {request: fixed, pkg} : fixed;
    }
    function handoffPackage(tid, job, attempt) {
        const raw = read(path.join(attemptDir(tid, job.id, attempt.attemptId), '交接.json'));
        if (hash(raw) !== attempt.handoffHash) fail('CORRUPT', 'Template handoff checksum mismatch');
        let handoff;
        try {handoff = JSON.parse(raw);} catch {fail('CORRUPT', 'Invalid template handoff JSON');}
        const expected = {format: 'nova-template-handoff', schemaVersion: 1, protocol: PROTOCOL, libraryId, templateId: tid, requestId: job.id, attemptId: attempt.attemptId, sourceAttemptId: attempt.sourceAttemptId, requestHash: job.requestHash, host: attempt.host, createdAt: attempt.createdAt, inputAssetHashes: requestPackage(tid, job).styleAssetHashes};
        if (!isDeepStrictEqual(handoff, expected)) fail('CORRUPT', 'Template handoff identity mismatch');
        directory(path.join(attemptDir(tid, job.id, attempt.attemptId), 'inbox'));
        return handoff;
    }
    function fresh(meta, request) {
        if (meta.deletedAt) fail('INVALID_STATE', 'Template is trashed');
        if (meta.currentVersion !== request.template.version || !meta.versions.some(v => v.version === request.template.version && v.packageHash === request.template.packageHash)) fail('STALE_INPUT', 'Template version differs from the fixed request');
        requestPackage(meta.id, find(meta, request.requestId).job);
    }
    function response(meta, rid, aid) {
        const {job, attempt} = find(meta, rid, aid);
        return {template: projection(meta), request: requestPackage(meta.id, job), ...(attempt ? {attempt} : {})};
    }
    function replay(tid, input, token, options) {return replayTemplateMutation?.(tid, input, token, options);}

    async function createTemplateRequest(tid, raw, token, options = {}) {
        objectId('template', tid);
        const input = inputFields(raw, ['version', 'notes', 'sizePolicy'], ['version']);
        if (Object.hasOwn(input, 'sizePolicy') && !['exact', 'ratio-minimum'].includes(input.sizePolicy)) fail('INVALID_INPUT', 'Unknown template size policy');
        if (input.sizePolicy === 'exact') delete input.sizePolicy;
        if (!Number.isSafeInteger(input.version) || input.version < 1 || input.notes !== undefined && (typeof input.notes !== 'string' || input.notes.length > 10000)) fail('INVALID_INPUT', 'Require a positive version and notes within 10000 characters');
        const mutation = {action: 'createTemplateRequest', ...input};
        const previous = replay(tid, mutation, token, options);
        if (previous) return response(previous, previous.templateJobs.at(-1).id);
        const fixed = locked(() => {
            const meta = current(tid);
            if (meta.editToken !== checkedHash(token)) fail('CONFLICT', 'Template changed before preparing the request');
            if (meta.deletedAt || meta.builtin) fail('INVALID_STATE', 'Use an active derived template for learning');
            if (meta.currentVersion !== input.version) fail('CONFLICT', 'Select the source version before learning');
            const entry = meta.versions.find(v => v.version === input.version);
            const pkg = templatePackage(root, tid, input.version, entry.packageHash);
            const styles = [...new Set(Object.values(pkg.resources).filter(r => r.role === 'style').map(r => r.assetHash))];
            if (!styles.length || styles.length > 50) fail('INVALID_INPUT', 'Learning requires 1 to 50 reference images');
            return {pkg, styles, assets: styles.map(assetHash => readAssetInternal(root, assetHash))};
        });
        const inputs = [];
        for (let i = 0; i < fixed.styles.length; i++) {
            assertRootIdentity();
            const bytes = read(assetPath(root, fixed.styles[i]));
            const decoded = await validateImportedRaster(bytes);
            if (decoded.assetHash !== fixed.styles[i]) fail('CORRUPT', 'Template input changed during decoding');
            inputs.push({role: 'style', assetHash: decoded.assetHash, bytes: decoded.bytes, detectedType: fixed.assets[i].detectedType, width: decoded.width, height: decoded.height});
        }
        const updated = change(tid, mutation, (meta) => {
            const pkg = templatePackage(root, tid, input.version, fixed.pkg.packageHash);
            if (!isDeepStrictEqual(pkg, fixed.pkg) || meta.currentVersion !== input.version) fail('CONFLICT', 'Template package changed during decoding');
            const rid = randomUUID(), createdAt = new Date().toISOString();
            const body = {protocol: PROTOCOL, libraryId, templateId: tid, template: {id: tid, version: input.version, packageHash: fixed.pkg.packageHash}, templateDefinition: pkg.definition, templateResources: pkg.resources, styleAssetHashes: fixed.styles, inputs, restore: {sourceAssetHash: inputs[0].assetHash, width: inputs[0].width, height: inputs[0].height, outputFormat: 'png'}, notes: input.notes || '', ...(input.sizePolicy === 'ratio-minimum' ? {sizePolicy: input.sizePolicy} : {})};
            const inputHash = hash(jsonBytes(body));
            const request = {format: 'nova-template-request', schemaVersion: input.sizePolicy === 'ratio-minimum' ? 2 : 1, requestId: rid, createdAt, inputHash, ...body};
            const bytes = jsonBytes(request), dir = requestDir(tid, rid);
            ensureDirectory(path.dirname(dir));
            ensureDirectory(dir);
            ensureDirectory(path.join(dir, '输入'));
            ensureDirectory(path.join(dir, '尝试'));
            for (const entry of inputs) {
                const asset = read(assetPath(root, entry.assetHash));
                if (hash(asset) !== entry.assetHash || asset.length !== entry.bytes) fail('CORRUPT', 'Input bytes changed before registration');
                immutableFile(path.join(dir, '输入', entry.assetHash), asset);
            }
            immutableFile(path.join(dir, '请求.json'), bytes);
            return {...meta, schemaVersion: 2, templateJobs: [...(meta.templateJobs || []), {id: rid, inputHash, requestHash: hash(bytes), createdAt, activeAttemptId: null, attempts: [], acceptance: null}]};
        }, options, token);
        return response(updated, updated.templateJobs.at(-1).id);
    }

    function createTemplateAttempt(tid, rid, raw, options) {
        const input = inputFields(raw, ['host', 'reason'], ['host']);
        host(input.host);
        if (input.reason !== undefined) requireText(input.reason, 'reason', 1000);
        const updated = change(tid, {action: 'createTemplateAttempt', requestId: id(rid), ...input}, meta => {
            const {job} = find(meta, rid), request = requestPackage(tid, job);
            if (job.acceptance) fail('INVALID_STATE', 'Accepted requests require a new learning request');
            fresh(meta, request);
            const now = new Date().toISOString(), aid = randomUUID(), sourceAttemptId = job.attempts.at(-1)?.attemptId || null;
            for (const old of meta.templateJobs) {
                for (const a of old.attempts) if (LIVE.includes(a.status)) {a.status = 'superseded'; a.updatedAt = now;}
                old.activeAttemptId = null;
            }
            const handoff = {format: 'nova-template-handoff', schemaVersion: 1, protocol: PROTOCOL, libraryId, templateId: tid, requestId: rid, attemptId: aid, sourceAttemptId, requestHash: job.requestHash, host: input.host, createdAt: now, inputAssetHashes: request.styleAssetHashes};
            const bytes = jsonBytes(handoff);
            ensureDirectory(attemptDir(tid, rid, aid));
            ensureDirectory(path.join(attemptDir(tid, rid, aid), 'inbox'));
            ensureDirectory(path.join(attemptDir(tid, rid, aid), '收件'));
            immutableFile(path.join(attemptDir(tid, rid, aid), '交接.json'), bytes);
            job.attempts.push({attemptId: aid, host: input.host, sourceAttemptId, reason: input.reason || 'initial', status: 'created', createdAt: now, updatedAt: now, handoffHash: hash(bytes), receiptHash: null, reportHash: null, resultHash: null, failure: null});
            job.activeAttemptId = aid;
            return meta;
        }, options);
        const {job} = find(updated, rid), attempt = job.attempts.find(a => a.attemptId === job.activeAttemptId);
        return {...response(updated, rid, attempt.attemptId), handoff: handoffPackage(tid, job, attempt), inbox: path.join(attemptDir(tid, rid, attempt.attemptId), 'inbox')};
    }

    function readTemplateContext(tid, rid, aid) {
        return locked(() => {
            const meta = current(tid), {job, attempt} = find(meta, rid, aid), {request, pkg} = requestPackage(tid, job, true);
            const results = [];
            for (const j of meta.templateJobs || []) for (const a of j.attempts) if (a.status === 'committed') {
                try {
                    results.push({requestId: j.id, attemptId: a.attemptId, ...verifyEvidence(tid, j, a)});
                } catch (error) {
                    if (j.id === rid && a.attemptId === aid) throw error;
                    results.push({requestId: j.id, attemptId: a.attemptId, unavailable: true, failure: {code: error.code || 'IO_ERROR', message: error.message}, result: null, report: null});
                }
            }
            return {...response(meta, rid, aid), handoff: handoffPackage(tid, job, attempt), inbox: path.join(attemptDir(tid, rid, aid), 'inbox'), ...templateContextDocuments(root, request.template, pkg, {objectId, assetPath, readAssetInternal, fail, styleAssetHashes: request.styleAssetHashes}), inputs: request.inputs.map(entry => ({...entry, path: path.join(requestDir(tid, rid), '输入', entry.assetHash)})), results};
        });
    }

    function claimTemplateAttempt(tid, rid, aid, raw, options) {
        const input = inputFields(raw, ['host', 'requestHash', 'readAssetHashes'], ['host', 'requestHash', 'readAssetHashes']);
        host(input.host); checkedHash(input.requestHash);
        if (!Array.isArray(input.readAssetHashes) || input.readAssetHashes.some(v => !digest(v)) || new Set(input.readAssetHashes).size !== input.readAssetHashes.length) fail('INVALID_INPUT', 'Require unique hashes of all reference images');
        const updated = change(tid, {action: 'claimTemplateAttempt', requestId: id(rid), attemptId: id(aid), ...input}, meta => {
            const {job, attempt} = find(meta, rid, aid);
            active(meta, job, attempt);
            if (attempt.status !== 'created') fail('INVALID_STATE', 'This attempt was already claimed; replay its original mutation to recover');
            if (attempt.host !== input.host || job.requestHash !== input.requestHash) fail('INVALID_INPUT', 'Host or request does not match this attempt');
            const request = requestPackage(tid, job);
            handoffPackage(tid, job, attempt); fresh(meta, request);
            if (!isDeepStrictEqual([...input.readAssetHashes].sort(), [...request.styleAssetHashes].sort())) fail('INVALID_INPUT', 'Acknowledge the entire reference group before claiming');
            attempt.status = 'claimed'; attempt.updatedAt = new Date().toISOString();
            return meta;
        }, options);
        return response(updated, rid, aid);
    }

    function finish(tid, rid, aid, status, failure, options) {
        const updated = change(tid, {action: `${status}TemplateAttempt`, requestId: id(rid), attemptId: id(aid), failure}, meta => {
            const {job, attempt} = find(meta, rid, aid); active(meta, job, attempt);
            attempt.status = status; attempt.failure = failure; attempt.updatedAt = new Date().toISOString(); job.activeAttemptId = null;
            return meta;
        }, options);
        return response(updated, rid, aid);
    }
    function failTemplateAttempt(tid, rid, aid, raw, options) {
        const input = inputFields(raw, ['code', 'message'], ['code', 'message']);
        if (typeof input.code !== 'string' || !/^[A-Z][A-Z0-9_]{0,63}$/.test(input.code)) fail('INVALID_INPUT', 'Require a bounded uppercase failure code');
        requireText(input.message, 'failure message', 2000);
        return finish(tid, rid, aid, 'failed', input, options);
    }
    const cancelTemplateAttempt = (tid, rid, aid, options) => finish(tid, rid, aid, 'cancelled', null, options);

    function receiptInput(raw, tid, rid, aid) {
        const bytes = Buffer.isBuffer(raw) ? Buffer.from(raw) : jsonBytes(raw);
        if (!bytes.length || bytes.length > 64 * 1024) fail('INVALID_INPUT', 'Receipt exceeds 64 KiB');
        let receipt;
        try {receipt = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));} catch {fail('INVALID_INPUT', 'Invalid UTF-8 receipt JSON');}
        if (!exact(receipt, ['format', 'schemaVersion', 'libraryId', 'templateId', 'requestId', 'attemptId', 'requestHash', 'host', 'mutationId', 'rulesFile', 'restoreFile']) || receipt.format !== 'nova-template-receipt' || receipt.schemaVersion !== 1 || receipt.libraryId !== libraryId || receipt.templateId !== tid || receipt.requestId !== rid || receipt.attemptId !== aid) fail('INVALID_INPUT', 'Receipt ownership does not match this template attempt');
        checkedHash(receipt.requestHash); host(receipt.host); id(receipt.mutationId);
        for (const name of [receipt.rulesFile, receipt.restoreFile]) if (typeof name !== 'string' || !name.length || name.length > 255 || ['.', '..'].includes(name) || /[\\/:\x00-\x1f]/.test(name) || /[. ]$/.test(name) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) fail('UNSAFE_PATH', 'Result files must be single safe inbox names');
        if (receipt.rulesFile === receipt.restoreFile) fail('INVALID_INPUT', 'Rules and restoration require different files');
        return {receipt, bytes, receiptHash: hash(bytes)};
    }
    function stableBytes(file, limit) {
        const named = safePath(file);
        if (!named.isFile() || !named.size || named.size > limit) fail('INVALID_INPUT', 'Inbox file must be a bounded regular file');
        const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
        try {
            const before = fs.fstatSync(fd, {bigint: true}), buffer = Buffer.alloc(Math.min(Number(before.size), limit) + 1);
            let size = 0;
            while (size < buffer.length) {const count = fs.readSync(fd, buffer, size, buffer.length - size, null); if (!count) break; size += count;}
            const after = fs.fstatSync(fd, {bigint: true}), current = fs.lstatSync(file, {bigint: true});
            if (size > limit || current.isSymbolicLink() || ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].some(k => before[k] !== after[k] || after[k] !== current[k]) || BigInt(size) !== after.size) fail('CONFLICT', 'Inbox file changed while being captured');
            return buffer.subarray(0, size);
        } finally {fs.closeSync(fd);}
    }
    function rulesInput(bytes, request) {
        if (bytes.length > 256 * 1024) fail('INVALID_INPUT', 'Rules exceed 256 KiB');
        let rules;
        try {rules = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));} catch {fail('INVALID_INPUT', 'Invalid rules JSON');}
        if (!exact(rules, ['fixed', 'variable', 'evidence']) || !Array.isArray(rules.fixed) || !rules.fixed.length || rules.fixed.length > 100 || !Array.isArray(rules.variable) || rules.variable.length > 100 || !Array.isArray(rules.evidence) || rules.evidence.length > 1000 || [...rules.fixed, ...rules.variable].some(v => !bounded(v, 2000))) fail('INVALID_INPUT', 'Require bounded fixed/variable rules and evidence');
        for (const evidence of rules.evidence) if (!exact(evidence, ['sourceAssetHash', 'ruleType', 'ruleIndex', 'observation']) || !request.styleAssetHashes.includes(evidence.sourceAssetHash) || !['fixed', 'variable'].includes(evidence.ruleType) || !Number.isSafeInteger(evidence.ruleIndex) || evidence.ruleIndex < 0 || evidence.ruleIndex >= rules[evidence.ruleType].length || !bounded(evidence.observation, 2000)) fail('INVALID_INPUT', 'Evidence must reference a fixed input and valid rule');
        for (const type of ['fixed', 'variable']) for (let i = 0; i < rules[type].length; i++) if (!rules.evidence.some(e => e.ruleType === type && e.ruleIndex === i)) fail('INVALID_INPUT', 'Every rule requires source evidence');
        return rules;
    }
    function restoreDimensionsMatch(request, {width, height}) {
        if (![width, height].every(v => Number.isSafeInteger(v) && v > 0) || width * height > 40_000_000) return false;
        const target = request.restore;
        return request.sizePolicy === 'ratio-minimum'
            ? width >= target.width && height >= target.height && width * target.height === height * target.width
            : width === target.width && height === target.height;
    }
    const receiptDir = (tid, job, attempt) => path.join(attemptDir(tid, job.id, attempt.attemptId), '收件', attempt.receiptHash);
    function verifyEvidence(tid, job, attempt, expectedReceipt = attempt.receiptHash) {
        if (attempt.receiptHash !== expectedReceipt) fail('RECEIPT_CONFLICT', 'This attempt already has a different result');
        const dir = receiptDir(tid, job, attempt), request = requestPackage(tid, job);
        const receiptRaw = read(path.join(dir, '回执.json')), reportRaw = read(path.join(dir, '校验报告.json')), resultRaw = read(path.join(dir, '结果.json')), rulesRaw = read(path.join(dir, '规则证据.json')), image = read(path.join(dir, '还原.png'));
        if (hash(receiptRaw) !== attempt.receiptHash || hash(reportRaw) !== attempt.reportHash || hash(resultRaw) !== attempt.resultHash) fail('CORRUPT', 'Result evidence checksum mismatch');
        const {receipt} = receiptInput(receiptRaw, tid, job.id, attempt.attemptId);
        const rules = rulesInput(rulesRaw, request);
        let resultValue, report;
        try {resultValue = JSON.parse(resultRaw); report = JSON.parse(reportRaw);} catch {fail('CORRUPT', 'Invalid result or validation report');}
        if (!exact(resultValue, ['format', 'schemaVersion', 'libraryId', 'templateId', 'requestId', 'attemptId', 'requestHash', 'receiptHash', 'host', 'rulesHash', 'restore']) || resultValue.format !== 'nova-template-result' || resultValue.schemaVersion !== 1 || resultValue.libraryId !== libraryId || resultValue.templateId !== tid || resultValue.requestId !== job.id || resultValue.attemptId !== attempt.attemptId || resultValue.requestHash !== job.requestHash || resultValue.receiptHash !== attempt.receiptHash || resultValue.host !== attempt.host || resultValue.rulesHash !== hash(rulesRaw) || receipt.requestHash !== job.requestHash || receipt.host !== attempt.host) fail('CORRUPT', 'Result ownership mismatch');
        const imageHash = hash(image), restore = resultValue.restore;
        if (!exact(restore, ['assetHash', 'bytes', 'format', 'width', 'height']) || restore.assetHash !== imageHash || restore.bytes !== image.length || restore.format !== 'png' || !restoreDimensionsMatch(request, restore) || request.styleAssetHashes.includes(imageHash)) fail('CORRUPT', 'Restored image differs from the fixed target');
        const asset = readAssetInternal(root, imageHash);
        if (asset.bytes !== image.length || asset.detectedType !== 'image/png') fail('CORRUPT', 'Restoration asset mismatch');
        if (!exact(report, ['format', 'schemaVersion', 'requestHash', 'receiptHash', 'resultHash', 'status', 'decoded', 'quality', 'restore']) || report.format !== 'nova-template-validation' || report.schemaVersion !== 1 || report.requestHash !== job.requestHash || report.receiptHash !== attempt.receiptHash || report.resultHash !== attempt.resultHash || report.status !== 'passed' || report.decoded !== true || report.quality !== 'pending-human-review' || !isDeepStrictEqual(report.restore, restore)) fail('CORRUPT', 'Validation report binding mismatch');
        return {result: {...resultValue, resultHash: attempt.resultHash, rules, restore: {...restore, path: path.join(dir, '还原.png')}}, report};
    }

    function rebuildTemplateReports(tid) {
        return locked(() => {
            const meta = current(tid);
            return templateReports({root, template: meta,
                packageFor: entry => templatePackage(root, tid, entry.version, entry.packageHash),
                evidenceFor: (job, attempt) => verifyEvidence(tid, job, attempt),
                requestFor: job => requestPackage(tid, job), receiptDirectory: (job, attempt) => receiptDir(tid, job, attempt),
                safePath, directory, assertRootIdentity, hook, catalogEntries: () => fs.readdirSync(path.join(root, '模板')).filter(name => {
                    if (name === '模板目录.md' || /^\.staging-/.test(name)) return false;
                    objectId('template', name);
                    return !!safePath(path.join(root, '模板', name, '模板.json'), true);
                }).map(name => current(name))});
        });
    }
    function withReports(tid, value) {
        try {return {...value, reportWarnings: rebuildTemplateReports(tid).warnings};}
        catch (error) {return {...value, reportWarnings: [`Markdown报告待重建（${error.code || 'IO_ERROR'}）`]};}
    }

    async function commitTemplateAttempt(tid, rid, aid, raw, options = {}) {
        objectId('template', tid); id(rid); id(aid);
        const {receipt, bytes: receiptBytes, receiptHash} = receiptInput(raw, tid, rid, aid);
        if (!options || typeof options !== 'object' || Array.isArray(options) || options.mutationId !== undefined && options.mutationId !== receipt.mutationId || Object.keys(options).some(k => k !== 'mutationId')) fail('INVALID_INPUT', 'Submission mutationId must match the immutable receipt');
        options = {mutationId: receipt.mutationId};
        const mutation = {action: 'commitTemplateAttempt', requestId: rid, attemptId: aid, receiptHash};
        const previous = replay(tid, mutation, undefined, options);
        if (previous) {const {job, attempt} = find(previous, rid, aid); return withReports(tid, {template: projection(previous), requestId: rid, attemptId: aid, ...verifyEvidence(tid, job, attempt, receiptHash)});}
        const prepared = locked(() => {
            const meta = current(tid), {job, attempt} = find(meta, rid, aid);
            if (receipt.host !== attempt.host || receipt.requestHash !== job.requestHash) fail('INVALID_INPUT', 'Submission host or request mismatch');
            if (attempt.status === 'committed') return {done: {template: projection(meta), requestId: rid, attemptId: aid, ...verifyEvidence(tid, job, attempt, receiptHash)}};
            active(meta, job, attempt, true);
            const request = requestPackage(tid, job); handoffPackage(tid, job, attempt); fresh(meta, request);
            const inbox = path.join(attemptDir(tid, rid, aid), 'inbox');
            return {request, rulesBytes: stableBytes(path.join(inbox, receipt.rulesFile), 256 * 1024), imageBytes: stableBytes(path.join(inbox, receipt.restoreFile), 64 * 1024 * 1024)};
        });
        if (prepared.done) return withReports(tid, prepared.done);
        rulesInput(prepared.rulesBytes, prepared.request);
        if (prepared.request.styleAssetHashes.includes(hash(prepared.imageBytes))) fail('REFERENCE_REUSED', 'A reference image cannot be submitted as a generated restoration');
        hook('templateBeforeDecode', {templateId: tid, requestId: rid, attemptId: aid});
        const decoded = await validateImage(prepared.imageBytes);
        hook('templateAfterDecode', {templateId: tid, requestId: rid, attemptId: aid});
        assertRootIdentity();
        if (decoded.format !== 'png') fail('IMAGE_FORMAT_MISMATCH', 'Restoration must be a decoded PNG');
        if (!restoreDimensionsMatch(prepared.request, decoded)) fail('IMAGE_DIMENSIONS_MISMATCH', prepared.request.sizePolicy === 'ratio-minimum' ? 'Restoration must preserve the exact first-reference ratio and meet both minimum display dimensions' : 'Restoration must preserve exact first-reference display pixels');
        const restore = {assetHash: decoded.assetHash, bytes: decoded.bytes, format: decoded.format, width: decoded.width, height: decoded.height};
        const resultValue = {format: 'nova-template-result', schemaVersion: 1, libraryId, templateId: tid, requestId: rid, attemptId: aid, requestHash: receipt.requestHash, receiptHash, host: receipt.host, rulesHash: hash(prepared.rulesBytes), restore};
        const resultBytes = jsonBytes(resultValue), resultHash = hash(resultBytes);
        const report = {format: 'nova-template-validation', schemaVersion: 1, requestHash: receipt.requestHash, receiptHash, resultHash, status: 'passed', decoded: true, quality: 'pending-human-review', restore};
        const reportBytes = jsonBytes(report);
        const updated = change(tid, mutation, meta => {
            const {job, attempt} = find(meta, rid, aid); active(meta, job, attempt, true);
            const request = requestPackage(tid, job); handoffPackage(tid, job, attempt); fresh(meta, request);
            if (!isDeepStrictEqual(request, prepared.request) || receipt.host !== attempt.host || receipt.requestHash !== job.requestHash) fail('CONFLICT', 'Template request changed while decoding');
            const location = path.join(attemptDir(tid, rid, aid), '收件', receiptHash);
            ensureDirectory(location);
            immutableFile(path.join(location, '回执.json'), receiptBytes);
            immutableFile(path.join(location, '规则证据.json'), prepared.rulesBytes);
            immutableFile(path.join(location, '还原.png'), prepared.imageBytes);
            immutableFile(path.join(location, '结果.json'), resultBytes);
            immutableFile(path.join(location, '校验报告.json'), reportBytes);
            const target = assetPath(root, decoded.assetHash); ensureDirectory(path.dirname(target));
            immutableFile(target, prepared.imageBytes);
            hook('templateAfterAssetsInstalled', {templateId: tid, requestId: rid, attemptId: aid});
            attempt.status = 'committed'; attempt.updatedAt = new Date().toISOString(); attempt.receiptHash = receiptHash; attempt.reportHash = hash(reportBytes); attempt.resultHash = resultHash; job.activeAttemptId = null;
            return meta;
        }, options);
        const {job, attempt} = find(updated, rid, aid);
        return withReports(tid, {template: projection(updated), requestId: rid, attemptId: aid, ...verifyEvidence(tid, job, attempt, receiptHash)});
    }

    function acceptTemplateResult(tid, raw, token, options) {
        const input = inputFields(raw, ['requestId', 'attemptId', 'requestHash', 'resultHash', 'sourceVersion', 'sourcePackageHash'], ['requestId', 'attemptId', 'requestHash', 'resultHash', 'sourceVersion', 'sourcePackageHash']);
        id(input.requestId); id(input.attemptId); checkedHash(input.requestHash); checkedHash(input.resultHash); checkedHash(input.sourcePackageHash);
        if (!Number.isSafeInteger(input.sourceVersion) || input.sourceVersion < 1) fail('INVALID_INPUT', 'Require a source template version');
        const updated = change(tid, {action: 'acceptTemplateResult', ...input}, (meta, before, context) => {
            if (meta.builtin) fail('INVALID_STATE', 'Create a derived template before learning');
            const {job, attempt} = find(meta, input.requestId, input.attemptId);
            if (job.acceptance) fail('INVALID_STATE', 'This request has already been accepted');
            if (attempt.status !== 'committed' || job.activeAttemptId !== null || meta.templateJobs.some(j => j.activeAttemptId !== null) || job.requestHash !== input.requestHash || attempt.resultHash !== input.resultHash) fail('CONFLICT', 'Only the displayed committed result can be accepted');
            const request = requestPackage(tid, job); handoffPackage(tid, job, attempt); fresh(meta, request);
            if (input.sourceVersion !== request.template.version || input.sourcePackageHash !== request.template.packageHash) fail('CONFLICT', 'Source version differs from the reviewed result');
            const {result: evidence} = verifyEvidence(tid, job, attempt);
            const pkg = templatePackage(root, tid, input.sourceVersion, input.sourcePackageHash);
            const definition = {...pkg.definition, rules: evidence.rules.fixed, variableRules: evidence.rules.variable, ruleEvidence: evidence.rules.evidence, accepted: true, aiTested: true};
            const normalized = normalizePackage(root, definition, pkg.resources);
            const packageBytes = jsonBytes(normalized);
            let version = Math.max(...meta.versions.map(v => v.version)) + 1;
            for (;;) {
                if (!Number.isSafeInteger(version)) fail('INVALID_STATE', 'No safe template version remains');
                const versionDir = path.join(root, '模板', tid, '版本', String(version));
                const existingDir = safePath(versionDir, true);
                if (!existingDir) break;
                if (existingDir.isDirectory()) {
                    const existingFile = safePath(path.join(versionDir, '定义.json'), true);
                    if (!existingFile || existingFile.isFile() && read(path.join(versionDir, '定义.json')).equals(packageBytes)) break;
                }
                // A pre-journal crash may leave an unregistered package; preserve different bytes.
                version++;
            }
            const entry = installTemplatePackage(root, tid, version, normalized, context.mutationId, false);
            job.acceptance = {requestId: job.id, attemptId: attempt.attemptId, requestHash: job.requestHash, resultHash: attempt.resultHash, sourceTemplate: request.template, acceptedTemplate: {id: tid, ...entry}, acceptedAt: new Date().toISOString()};
            return {...meta, versions: [...meta.versions, entry], currentVersion: version};
        }, options, token);
        const {job} = find(updated, input.requestId);
        return withReports(tid, {template: projection(updated), acceptance: job.acceptance});
    }

    if (h.validationTemplate) {
        const meta = h.validationTemplate;
        for (const job of meta.templateJobs || []) {
            const request = requestPackage(meta.id, job);
            for (const attempt of job.attempts) {
                handoffPackage(meta.id, job, attempt);
                if (attempt.status === 'committed') verifyEvidence(meta.id, job, attempt);
            }
            if (job.acceptance) {
                const a = job.acceptance, attempt = job.attempts.find(item => item.attemptId === a.attemptId);
                if (!isDeepStrictEqual(a.sourceTemplate, request.template) || a.requestHash !== job.requestHash || a.resultHash !== attempt.resultHash) fail('CORRUPT', 'Acceptance source binding mismatch');
                const source = templatePackage(root, a.sourceTemplate.id, a.sourceTemplate.version, a.sourceTemplate.packageHash);
                const accepted = templatePackage(root, a.acceptedTemplate.id, a.acceptedTemplate.version, a.acceptedTemplate.packageHash);
                const {result: evidence} = verifyEvidence(meta.id, job, attempt);
                const definition = {...source.definition, rules: evidence.rules.fixed, variableRules: evidence.rules.variable, ruleEvidence: evidence.rules.evidence, accepted: true, aiTested: true};
                if (!isDeepStrictEqual(accepted.definition, definition) || !isDeepStrictEqual(accepted.resources, source.resources)) fail('CORRUPT', 'Accepted package differs from reviewed rules');
            }
        }
        return {};
    }
    return {createTemplateRequest, createTemplateAttempt, readTemplateContext, claimTemplateAttempt, commitTemplateAttempt, failTemplateAttempt, cancelTemplateAttempt, acceptTemplateResult, rebuildTemplateReports};
}
