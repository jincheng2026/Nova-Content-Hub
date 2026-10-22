import fs from 'node:fs';
import path from 'node:path';

// Fixed diagnostic budgets; a larger library gets an honest partial report.
const LIMITS = Object.freeze({objects: 2000, assets: 4000, transactions: 2000, requests: 2000, work: 20000, jsonDepth: 64, fileBytes: 8 * 1024 * 1024, assetBytes: 64 * 1024 * 1024, totalBytes: 512 * 1024 * 1024, milliseconds: 10000});
const HASH = /^[0-9a-f]{64}$/;
const fingerprint = stat => ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].map(key => String(stat[key])).join(':');

export function inspectHealth(selectedRoot, options, h) {
    const report = {checkedAt: new Date().toISOString(), state: 'blocked', root: 'identity-unverified', complete: false, checked: {objects: 0, assets: 0, transactions: 0, requests: 0}, issues: []};
    const started = performance.now(), touched = new Map(), assetIds = new Set(), pending = new Set(), records = new Map(), issueKeys = new Set();
    let root, libraryId, release, work = 0, bytesRead = 0, unknownPending = false;
    const add = (scope, code, availability = 'unavailable', kind, id) => {
        const issue = {scope, ...(kind ? {kind} : {}), ...(id ? {id} : {}), code, availability};
        const key = JSON.stringify(issue);
        if (!issueKeys.has(key) && report.issues.length >= 199 && code !== 'LIMIT_REACHED') {add('root', 'LIMIT_REACHED', 'unverified'); return;}
        if (!issueKeys.has(key)) {issueKeys.add(key); report.issues.push(issue);}
    };
    const stop = code => {throw Object.assign(new Error(code), {healthStop: code});};
    const guard = (cost = 1) => {if ((work += cost) > LIMITS.work || report.issues.length >= 200 || performance.now() - started > LIMITS.milliseconds) stop('LIMIT_REACHED');};
    const boundJSON = bytes => {
        let value;
        try {value = JSON.parse(bytes);} catch {return;}
        const queue = [[value, 0]];
        guard();
        while (queue.length) {
            // Nodes consume work when queued; visiting still checks the deadline.
            guard(0);
            const [next, depth] = queue.pop();
            if (depth > LIMITS.jsonDepth) stop('LIMIT_REACHED');
            if (next && typeof next === 'object') for (const item of Object.values(next)) {guard(); queue.push([item, depth + 1]);}
        }
    };
    const remember = (target, stat) => {
        // The lock is the only expected diagnostic mutation.
        if (target === path.join(root, h.SYSTEM, '库锁') || target.startsWith(path.join(root, h.SYSTEM, '库锁') + path.sep)) return;
        const value = fingerprint(stat), old = touched.get(target);
        if (old && old !== value) stop('SOURCE_CHANGED');
        touched.set(target, value);
    };
    const stat = (target, optional = false) => {
        guard();
        const value = h.safePath(target, optional);
        if (!value) return null;
        const precise = fs.lstatSync(target, {bigint: true});
        remember(target, precise);
        return precise;
    };
    const directory = target => {if (!stat(target)?.isDirectory()) h.fail('UNSAFE_PATH', 'Invalid diagnostic directory');};
    const names = target => {
        directory(target);
        const result = [], dir = fs.opendirSync(target);
        try {for (let entry; (entry = dir.readSync());) {guard(); result.push(entry.name);}} finally {dir.closeSync();}
        return result.sort();
    };
    const read = (target, optional = false) => {
        const before = stat(target, optional);
        if (!before) return null;
        if (!before.isFile()) h.fail('UNSAFE_PATH', 'Invalid diagnostic file');
        const binary = HASH.test(path.basename(target)) || /^(?:图片-[0-9]+|还原\.png)$/.test(path.basename(target));
        const size = Number(before.size);
        if (size > (binary ? LIMITS.assetBytes : LIMITS.fileBytes) || size + bytesRead > LIMITS.totalBytes) stop('LIMIT_REACHED');
        const fd = fs.openSync(target, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
        try {
            if (fingerprint(fs.fstatSync(fd, {bigint: true})) !== fingerprint(before)) stop('SOURCE_CHANGED');
            const value = Buffer.alloc(size);
            let offset = 0;
            while (offset < size) {
                guard();
                const count = fs.readSync(fd, value, offset, Math.min(size - offset, 64 * 1024), null);
                if (!count) stop('SOURCE_CHANGED');
                offset += count;
                bytesRead += count;
            }
            if (fingerprint(fs.fstatSync(fd, {bigint: true})) !== fingerprint(before)) stop('SOURCE_CHANGED');
            stat(target);
            if (target.endsWith('.json')) boundJSON(value);
            return value;
        } finally {fs.closeSync(fd);}
    };
    const terminal = error => {
        for (let current = error; current; current = current.cause) if (current.healthStop) stop(current.healthStop);
    };
    const attempt = (scope, code, kind, id, fn) => {
        try {guard(); return fn();} catch (error) {
            terminal(error);
            add(scope, error.code === 'UNSAFE_PATH' && scope === 'object' ? 'OBJECT_UNSAFE' : ['EACCES', 'EPERM', 'EIO'].includes(error.code) && scope === 'object' ? 'OBJECT_UNREADABLE' : code, 'unavailable', kind, id);
            return null;
        }
    };
    const count = key => {guard(); if (report.checked[key] >= LIMITS[key]) stop('LIMIT_REACHED'); report.checked[key]++;};
    const asset = (unusedRoot, assetHash) => {
        h.checkedHash(assetHash);
        if (!assetIds.has(assetHash)) {count('assets'); assetIds.add(assetHash);}
        return h.readAssetInternal(root, assetHash, read);
    };
    const pkg = (unusedRoot, id, version, expectedHash) => h.templatePackage(root, id, version, expectedHash, read, asset);
    const snapshot = (unusedRoot, id, kind = 'content') => h.snapshot(root, id, kind, read);
    const metadata = (bytes, id, kind) => {boundJSON(bytes); const value = h.metadata(bytes, id, kind); guard(); return value;};
    const helpers = {...h, root, read, directory, safePath: stat, snapshot, templatePackage: pkg, readAssetInternal: asset, locked: fn => fn()};
    const rootFailure = error => {
        const value = error.code === 'ENOENT' ? 'missing' : error.code === 'UNSAFE_PATH' || error.code === 'INVALID_INPUT' ? 'unsafe' : 'unreadable';
        report.root = value;
        add('root', `ROOT_${value.toUpperCase()}`);
    };
    const identity = () => {
        guard();
        let value;
        try {
            h.safePath(root);
            value = fs.lstatSync(root, {bigint: true});
            if (!value.isDirectory()) h.fail('UNSAFE_PATH', 'Invalid diagnostic root');
        } catch (error) {rootFailure(error); stop('ROOT_UNAVAILABLE');}
        if (String(value.dev) !== options.expectedRootIdentity.dev || String(value.ino) !== options.expectedRootIdentity.ino) {
            report.root = 'replaced'; add('root', 'ROOT_REPLACED'); stop('ROOT_REPLACED');
        }
        remember(root, value);
        const descriptorPath = path.join(root, '内容库.json'), before = touched.get(descriptorPath);
        touched.delete(descriptorPath);
        const info = h.parse(read(descriptorPath), 'descriptor');
        if (info?.format !== 'nova-content-library' || !h.UUID.test(info.libraryId) || !h.date(info.createdAt)) h.fail('CORRUPT', 'Invalid diagnostic descriptor');
        if (info.libraryId !== options.expectedLibraryId) {report.root = 'replaced'; add('root', 'ROOT_REPLACED'); stop('ROOT_REPLACED');}
        if (before && touched.get(descriptorPath) !== before) stop('SOURCE_CHANGED');
        if (info.schemaVersion !== 5) h.fail('FORMAT_UNSUPPORTED', 'Unsupported diagnostic schema');
        libraryId = info.libraryId;
    };
    try {
        if (!h.exact(options, ['expectedLibraryId', 'expectedRootIdentity']) || typeof options.expectedLibraryId !== 'string' || !h.UUID.test(options.expectedLibraryId) || !h.validRootIdentity(options.expectedRootIdentity)) {
            add('root', 'ROOT_IDENTITY_UNVERIFIED', 'unverified');
            return report;
        }
        try {root = h.canonicalRoot(selectedRoot); directory(root);} catch (error) {rootFailure(error); return report;}
        try {identity();} catch (error) {
            terminal(error);
            report.root = 'matched';
            add('root', error.code === 'FORMAT_UNSUPPORTED' ? 'FORMAT_UNSUPPORTED' : 'LIBRARY_DESCRIPTOR_INVALID');
            return report;
        }
        report.root = 'matched';
        try {release = h.acquire(root, read, names);} catch (error) {
            terminal(error);
            add('root', error.code === 'BUSY' ? 'LOCK_BUSY' : error.code === 'LOCK_UNCERTAIN' ? 'LOCK_UNCERTAIN' : 'STRUCTURE_INVALID', 'unverified');
            return report;
        }
        // Acquire changes only the lock's parent directory, whose baseline starts here.
        touched.delete(path.join(root, h.SYSTEM));
        identity();
        Object.assign(helpers, {root, libraryId});
        const publications = h.modelMethods(helpers);
        const required = [...Object.values(h.KINDS).map(spec => spec.directory), '资产', path.join('资产', 'sha256'), h.SYSTEM, path.join(h.SYSTEM, '事务'), path.join(h.SYSTEM, '事务', '待恢复'), path.join(h.SYSTEM, '事务', '已提交')];
        for (const value of required) attempt('structure', 'STRUCTURE_INVALID', undefined, undefined, () => directory(path.join(root, value)));
        const transactionRoot = attempt('structure', 'STRUCTURE_INVALID', undefined, undefined, () => names(path.join(root, h.SYSTEM, '事务')));
        if (!transactionRoot) unknownPending = true;
        else for (const name of transactionRoot) {
            if (name === '.DS_Store') {attempt('structure', 'STRUCTURE_INVALID', undefined, undefined, () => h.finderMetadataFile(path.join(root, h.SYSTEM, '事务'), name, stat)); continue;}
            if (!['待恢复', '已提交', '升级到3', '升级到4', '升级到5'].includes(name)) add('structure', 'STRUCTURE_INVALID');
        }
        const transactionIds = new Set();
        for (const location of ['待恢复', '已提交']) {
            const parent = path.join(root, h.SYSTEM, '事务', location);
            const entries = attempt('structure', 'STRUCTURE_INVALID', undefined, undefined, () => names(parent));
            if (!entries && location === '待恢复') unknownPending = true;
            for (const name of entries || []) {
                if (name === '.DS_Store') {attempt('structure', 'STRUCTURE_INVALID', undefined, undefined, () => h.finderMetadataFile(parent, name, stat)); continue;}
                if (h.STAGING.test(name)) {add('transaction', 'STAGING_UNVERIFIED', 'unverified'); continue;}
                if (!h.UUID.test(name)) {add('transaction', 'TRANSACTION_INVALID'); if (location === '待恢复') unknownPending = true; continue;}
                count('transactions');
                if (transactionIds.has(name)) add('transaction', 'TRANSACTION_INVALID', 'unavailable', undefined, name);
                transactionIds.add(name);
                const tx = attempt('transaction', 'TRANSACTION_INVALID', undefined, name, () => h.transaction(root, name, libraryId, path.join(parent, name), read, metadata));
                if (location === '待恢复') {
                    add('transaction', 'TRANSACTION_PENDING', 'unverified', undefined, name);
                    if (tx) pending.add(`${tx.kind}:${tx.objectId}`); else unknownPending = true;
                }
            }
        }
        for (const [kind, spec] of Object.entries(h.KINDS)) {
            const parent = path.join(root, spec.directory);
            const entries = attempt('structure', 'STRUCTURE_INVALID', kind, undefined, () => names(parent)) || [];
            if (kind === 'workspace' && !entries.includes('default')) add('object', unknownPending || pending.has('workspace:default') ? 'TRANSACTION_PENDING' : 'OBJECT_INVALID', unknownPending || pending.has('workspace:default') ? 'unverified' : 'unavailable', kind, 'default');
            for (const id of entries) {
                if (id === '.DS_Store') {
                    attempt('structure', 'STRUCTURE_INVALID', kind, undefined, () => h.finderMetadataFile(parent, id, stat));
                    continue;
                }
                if (kind === 'template' && id === '模板目录.md') {
                    attempt('structure', 'STRUCTURE_INVALID', kind, undefined, () => h.templateReportIndex(root, id, stat));
                    continue;
                }
                if (h.STAGING.test(id)) {add('object', 'STAGING_UNVERIFIED', 'unverified', kind); continue;}
                if (!attempt('structure', 'STRUCTURE_INVALID', kind, undefined, () => h.objectId(kind, id))) continue;
                count('objects');
                if (unknownPending || pending.has(`${kind}:${id}`)) {add('object', 'TRANSACTION_PENDING', 'unverified', kind, id); continue;}
                const dir = path.join(parent, id);
                if (kind === 'template') {
                    const unregistered = attempt('object', 'OBJECT_INVALID', kind, id, () => !stat(path.join(dir, spec.files[0]), true));
                    if (unregistered) {
                        attempt('object', 'OBJECT_INVALID', kind, id, () => {
                            const marker = h.unregisteredTemplate(read(path.join(dir, '未登记.json')), id);
                            pkg(root, id, marker.version, marker.packageHash);
                        });
                        add('object', 'TEMPLATE_UNREGISTERED', 'unverified', kind, id);
                        continue;
                    }
                }
                const meta = attempt('object', 'OBJECT_INVALID', kind, id, () => h.metadata(snapshot(root, id, kind)[0], id, kind));
                if (!meta) continue;
                records.set(`${kind}:${id}`, meta);
                const checkAsset = value => attempt('asset', 'ASSET_INVALID', kind, id, () => asset(root, value));
                const checkTemplate = ref => attempt('object', 'REFERENCE_INVALID', kind, id, () => pkg(root, ref.id, ref.version, ref.packageHash));
                if (kind === 'photo' && meta.availability !== 'unavailable') checkAsset(meta.assetHash);
                if (kind === 'workspace' && meta.profile.avatarAssetHash) checkAsset(meta.profile.avatarAssetHash);
                for (const entry of [...(meta.materials || []), ...(meta.candidates || []), ...(meta.unavailableReferences || [])]) {
                    guard();
                    if (entry.assetHash) checkAsset(entry.assetHash);
                    if (entry.template) checkTemplate(entry.template);
                }
                if (kind === 'template') {
                    const versionEntries = attempt('structure', 'STRUCTURE_INVALID', kind, id, () => names(path.join(dir, '版本'))) || [];
                    for (const version of meta.versions) {guard(); checkTemplate({id, ...version});}
                    for (const version of versionEntries) {
                        if (version === '.DS_Store') {attempt('object', 'OBJECT_INVALID', kind, id, () => h.finderMetadataFile(path.join(dir, '版本'), version, stat)); continue;}
                        if (!meta.versions.some(entry => String(entry.version) === version)) add('object', 'TEMPLATE_UNREGISTERED', 'unverified', kind, id);
                    }
                }
                const jobs = kind === 'template' ? meta.templateJobs || [] : kind === 'content' ? meta.coverJobs || [] : [];
                for (const job of jobs) {
                    count('requests');
                    attempt('request', 'REQUEST_INVALID', kind, id, () => kind === 'template' ? h.templateJobMethods({...helpers, validationTemplate: {...meta, templateJobs: [job]}}) : h.coverJobMethods({...helpers, validationContent: {...meta, coverJobs: [job]}}));
                }
                if (['content', 'template'].includes(kind)) {
                    const requestRoot = path.join(dir, kind === 'content' ? '封面任务' : '学习任务');
                    if (attempt('request', 'REQUEST_INVALID', kind, id, () => stat(requestRoot, true))) {
                        const requestEntries = attempt('request', 'REQUEST_INVALID', kind, id, () => names(requestRoot)) || [];
                        if (requestEntries.some(name => !jobs.some(job => job.id === name))) add('request', 'STAGING_UNVERIFIED', 'unverified', kind, id);
                    }
                }
                for (const publication of meta.publications || []) {
                    guard();
                    attempt('publication', 'PUBLICATION_INVALID', kind, id, () => (kind === 'collection' ? publications.readCollectionPublication : publications.readPublication)(id, publication.id));
                }
            }
        }
        for (const [key, meta] of records) {
            guard();
            const [kind, id] = key.split(':');
            const refs = kind === 'collection' && meta.deletedAt === null ? meta.memberIds.map(id => ['content', id]) : kind === 'workspace' ? [['photo', meta.defaults.photoId], ['template', meta.defaults.templateId]] : kind === 'content' ? [['template', meta.preferredTemplateId], ...(meta.coverVariants || []).map(v => ['template', v.preferredTemplateId])] : [];
            for (const [targetKind, targetId] of refs) if (targetId && (!records.has(`${targetKind}:${targetId}`) || records.get(`${targetKind}:${targetId}`).deletedAt !== null)) add('object', pending.has(`${targetKind}:${targetId}`) || unknownPending ? 'TRANSACTION_PENDING' : 'REFERENCE_INVALID', pending.has(`${targetKind}:${targetId}`) || unknownPending ? 'unverified' : 'unavailable', kind, id);
        }
        identity();
        for (const [target, value] of touched) {
            guard();
            try {if (fingerprint(fs.lstatSync(target, {bigint: true})) !== value) stop('SOURCE_CHANGED');} catch (error) {
                if (error.code === 'ENOENT') stop('SOURCE_CHANGED');
                throw error;
            }
        }
        identity();
        report.complete = true;
        report.state = report.issues.length ? 'issues' : 'healthy';
    } catch (error) {
        let code;
        for (let current = error; current; current = current.cause) if (current.healthStop) {code = current.healthStop; break;}
        if (code === 'ROOT_REPLACED' || code === 'ROOT_UNAVAILABLE') report.state = 'blocked';
        else if (code === 'LIMIT_REACHED' || code === 'SOURCE_CHANGED') {add('root', code, 'unverified'); report.state = 'incomplete';}
        else {add('root', 'ROOT_UNREADABLE', 'unverified'); report.state = 'incomplete';}
    } finally {
        if (release) try {release();} catch {add('root', 'LOCK_UNCERTAIN', 'unverified'); report.complete = false; report.state = 'incomplete';}
    }
    return report;
}
