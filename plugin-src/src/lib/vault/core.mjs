import {applyPublicationReceipt} from '../publication-runtime/transaction.mjs';
import fs from 'node:fs';
import {applyTopicReceipt} from './topics.mjs';
import {readSourceInventory} from './source-map.mjs';
import {
    applyWorkingDraftReceipt,
    currentWorkingDraft,
    workingDraftAvailable,
} from './working-draft.mjs';
import {LibraryError} from '../file-library/index.mjs';
import path from 'node:path';
import os from 'node:os';
import {createHash, randomUUID} from 'node:crypto';

export const SECTIONS = Object.freeze({
    profile: '00_个人背景',
    accounts: '01_对标账号',
    materials: '02_内容素材',
    patterns: '03_内容规律',
    topics: '04_选题库',
    drafts: '05_内容草稿',
    reviews: '06_发布复盘',
    prompts: '07_提示词',
});
const LIMIT = 8 * 1024 * 1024,
    MAX_FILES = 20000;
export const digest = (value) =>
    createHash('sha256').update(value).digest('hex');
export const uuidFor = (value) => {
    const h = digest(value);
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
export function fail(code, message) {
    throw new LibraryError(code, message);
}
export function rootPath(root) {
    if (typeof root !== 'string' || !path.isAbsolute(root))
        fail('INVALID_INPUT', '知识库必须使用绝对路径');
    const resolved = path.resolve(root);
    if (fs.lstatSync(resolved).isSymbolicLink())
        fail('INVALID_INPUT', '知识库根目录不能是符号链接');
    return path.join(
        fs.realpathSync(path.dirname(resolved)),
        path.basename(resolved),
    );
}
export function safe(root, relative, missing = false) {
    if (
        typeof relative !== 'string' ||
        !relative ||
        path.isAbsolute(relative) ||
        relative.split(/[\\/]/).some((p) => !p || p === '.' || p === '..') ||
        relative.includes('\0')
    )
        fail('INVALID_INPUT', '知识文件路径无效或越界');
    let target = root;
    const parts = relative.split('/');
    for (let i = 0; i < parts.length; i++) {
        target = path.join(target, parts[i]);
        let st;
        try {
            st = fs.lstatSync(target);
        } catch (error) {
            if (error.code === 'ENOENT' && missing)
                return path.join(root, ...parts);
            throw error;
        }
        if (st.isSymbolicLink())
            fail('INVALID_INPUT', `拒绝符号链接：${relative}`);
        if (i < parts.length - 1 && !st.isDirectory())
            fail('INVALID_INPUT', '知识路径祖先不是目录');
    }
    return target;
}
export function identity(root) {
    const s = fs.lstatSync(root, {bigint: true});
    if (s.isSymbolicLink() || !s.isDirectory())
        fail('INVALID_INPUT', '知识库根目录无效');
    return {dev: String(s.dev), ino: String(s.ino)};
}
export function readBytes(root, relative) {
    const target = safe(root, relative),
        st = fs.lstatSync(target),
        limit = /^\.workbench\/(?:mutations\/|pending-mutations\/|projection\.json$)/.test(relative)
            ? 128 * 1024 * 1024
            : LIMIT;
    if (!st.isFile() || st.nlink !== 1 || st.size > limit)
        fail('INVALID_INPUT', '文件类型、硬链接数量或大小不允许读取');
    const fd = fs.openSync(
        target,
        fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0),
    );
    try {
        const opened = fs.fstatSync(fd);
        if (
            opened.ino !== st.ino ||
            opened.dev !== st.dev ||
            opened.size > limit
        )
            fail('CONFLICT', '文件在读取时被替换');
        const bytes = fs.readFileSync(fd);
        if (bytes.length > limit) fail('INVALID_INPUT', '文件超过大小上限');
        return bytes;
    } finally {
        fs.closeSync(fd);
    }
}
export function json(root, relative) {
    try {
        return JSON.parse(readBytes(root, relative).toString('utf8'));
    } catch (error) {
        if (error.code) throw error;
        fail('CORRUPT', `知识库管理数据损坏：${relative}`);
    }
}
function syncDir(dir) {
    if (process.platform === 'win32') return;
    const fd = fs.openSync(dir, 'r');
    try {
        fs.fsyncSync(fd);
    } finally {
        fs.closeSync(fd);
    }
}
export function mkdir(root, relative) {
    if (relative === '.') return;
    const parts = relative.split('/');
    for (let i = 1; i <= parts.length; i++) {
        const part = parts.slice(0, i).join('/'),
            target = safe(root, part, true);
        if (!fs.existsSync(target)) {
            fs.mkdirSync(target);
            syncDir(path.dirname(target));
        }
        safe(root, part);
    }
}
export function atomic(root, relative, bytes, expectedHash = undefined) {
    const target = safe(root, relative, true),
        dir = path.dirname(target);
    if (dir !== root) safe(root, path.relative(root, dir));
    // Journal directories contain only published, validated receipt names. Keep
    // an interrupted atomic write's unpublished scratch file outside those
    // strict indexes so a killed process cannot poison their next recovery.
    const stagingDir = /^\.workbench\/(?:mutations|pending-mutations)\//.test(relative)
        ? safe(root, '.workbench') : dir;
    const temp = path.join(stagingDir, `.vault-${randomUUID()}`);
    const fd = fs.openSync(temp, 'wx', 0o600);
    try {
        fs.writeFileSync(fd, bytes);
        fs.fsyncSync(fd);
    } finally {
        fs.closeSync(fd);
    }
    try {
        safe(root, relative, true);
        if (expectedHash !== undefined) {
            const current = exists(root, relative)
                ? digest(readBytes(root, relative))
                : null;
            if (current !== expectedHash)
                fail('CONFLICT', '知识文件在发布前被外部修改，未覆盖');
        }
        fs.renameSync(temp, target);
        syncDir(dir);
        if (stagingDir !== dir) syncDir(stagingDir);
    } finally {
        if (fs.existsSync(temp)) fs.unlinkSync(temp);
    }
}
export const writeJSON = (root, relative, value) =>
    atomic(root, relative, Buffer.from(`${JSON.stringify(value, null, 2)}\n`));
const exists = (root, relative) => {
    try {
        safe(root, relative);
        return true;
    } catch (e) {
        if (e.code === 'ENOENT') return false;
        throw e;
    }
};
export function inspectVault(root) {
    root = rootPath(root);
    identity(root);
    const issues = [];
    if (exists(root, '.workbench/vault.json')) {
        const d = json(root, '.workbench/vault.json');
        if (d.format !== 'nova-knowledge-vault')
            fail('CORRUPT', '知识库管理描述无效');
        return {recognized: true, issues};
    }
    const names = Object.values(SECTIONS).filter((n) => exists(root, n));
    return {
        recognized:
            names.includes(SECTIONS.profile) &&
            names.includes(SECTIONS.topics) &&
            names.includes(SECTIONS.drafts),
        issues,
    };
}
export function bindingForRuntime(runtimeRoot) {
    runtimeRoot = rootPath(runtimeRoot);
    const marker = 'vault-binding.json';
    if (!exists(runtimeRoot, marker)) return null;
    const b = json(runtimeRoot, marker);
    if (
        b.format !== 'nova-vault-runtime' ||
        typeof b.vaultRoot !== 'string' ||
        typeof b.vaultId !== 'string' ||
        !b.rootIdentity
    )
        fail('CORRUPT', '运行库绑定无效');
    const root = rootPath(b.vaultRoot),
        current = identity(root);
    if (
        current.dev !== b.rootIdentity.dev ||
        current.ino !== b.rootIdentity.ino
    )
        fail('CONFLICT', '原知识库目录身份已变化，请重新选择');
    if (runtimeRoot !== safe(root, '.workbench/runtime'))
        fail('CONFLICT', '运行库不属于原知识库');
    const d = json(root, '.workbench/vault.json');
    if (d.vaultId !== b.vaultId) fail('CONFLICT', '知识库身份已变化');
    return {...b, vaultRoot: root};
}
export const vaultRootForRuntime = (runtimeRoot) =>
    bindingForRuntime(runtimeRoot)?.vaultRoot ?? null;
export function vaultState(runtimeRoot) {
    const binding = bindingForRuntime(runtimeRoot);
    if (!binding) fail('NOT_READY', '当前内容库不是知识库');
    return {...binding, root: binding.vaultRoot};
}
const docID = (relative) => `doc-${digest(relative).slice(0, 32)}`;
const fileCache = new Map();
export function scan(root, vaultId) {
    const documents = [],
        issues = [];
    const projection = exists(root, '.workbench/projection.json')
        ? json(root, '.workbench/projection.json')
        : null;
    const contentIDs = new Map(
        Object.entries(projection?.contents ?? {}).map(([id, s]) => [
            s.tNumber,
            id,
        ]),
    );
    let count = 0;
    function walk(relative = '', depth = 0) {
        if (depth > 24) fail('INVALID_INPUT', '知识库目录层级过深');
        const dir = relative ? safe(root, relative) : root;
        for (const entry of fs
            .readdirSync(dir, {withFileTypes: true})
            .sort((a, b) => a.name.localeCompare(b.name))) {
            if (++count > MAX_FILES)
                fail('INVALID_INPUT', '知识库文件数量超过上限');
            if (
                entry.name.startsWith('.') ||
                ['skills', 'node_modules', '.git'].includes(entry.name)
            )
                continue;
            const rel = relative ? `${relative}/${entry.name}` : entry.name;
            if (entry.isSymbolicLink()) {
                issues.push({
                    code: 'SYMLINK_REJECTED',
                    message: '已拒绝符号链接，不能读写该路径',
                    relativePath: rel,
                });
                continue;
            }
            if (entry.isDirectory()) {
                walk(rel, depth + 1);
                continue;
            }
            const ext = path.extname(entry.name).toLowerCase(),
                format =
                    {
                        '.md': 'markdown',
                        '.markdown': 'markdown',
                        '.txt': 'text',
                        '.html': 'html',
                        '.htm': 'html',
                        '.json': 'json',
                    }[ext] ?? 'other';
            let bytes;
            try {
                const target = path.join(root, ...rel.split('/')),
                    st = fs.lstatSync(target);
                if (!st.isFile() || st.nlink !== 1 || st.size > LIMIT)
                    fail(
                        'INVALID_INPUT',
                        '文件类型、硬链接数量或大小不允许读取',
                    );
                const stamp = [
                        st.dev,
                        st.ino,
                        st.size,
                        st.mtimeMs,
                        st.ctimeMs,
                    ].join(':'),
                    cached = fileCache.get(target);
                if (cached?.stamp === stamp && cached.document) {
                    const d = cached.document;
                    documents.push({
                        ...d,
                        contentId: d.tNumber
                            ? (contentIDs.get(d.tNumber) ??
                              uuidFor(`${vaultId}:${d.tNumber}`))
                            : null,
                    });
                    if (d.format === 'html' && !d.editAdapter)
                        issues.push({
                            code: 'HTML_READ_ONLY',
                            message:
                                '此 HTML 尚未识别创作协议，保留原件并提供静态读取',
                            relativePath: rel,
                        });
                    continue;
                } else {
                    const fd = fs.openSync(
                        target,
                        fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0),
                    );
                    try {
                        const after = fs.fstatSync(fd);
                        if (
                            after.ino !== st.ino ||
                            after.dev !== st.dev ||
                            after.size > LIMIT
                        )
                            fail('CONFLICT', '文件读取期间被替换');
                        bytes = fs.readFileSync(fd);
                        if (bytes.length > LIMIT)
                            fail('INVALID_INPUT', '文件超限');
                    } finally {
                        fs.closeSync(fd);
                    }
                    if (fileCache.size > 24000) fileCache.clear();
                    fileCache.set(target, {stamp, bytes});
                }
            } catch (e) {
                issues.push({
                    code: e.code ?? 'IO_ERROR',
                    message: e.message,
                    relativePath: rel,
                });
                continue;
            }
            const section =
                Object.entries(SECTIONS).find(([, name]) =>
                    rel.startsWith(`${name}/`),
                )?.[0] ?? (rel.startsWith('11_提示词/') ? 'prompts' : 'materials');
            const tNumber =
                rel
                    .match(/(?:^|\/)T(\d{3,})(?=[_ /.-]|$)/)?.[0]
                    ?.split('/')
                    .at(-1)
                    ?.match(/^T\d+/)?.[0] ?? null;
            let title = path.basename(rel, ext);
            if (format === 'markdown') {
                const heading = bytes
                    .toString('utf8')
                    .match(/^#\s+(.+)$/m)?.[1];
                if (heading) title = heading.trim();
            }
            const writable = ['markdown', 'text', 'json'].includes(format);
            const editAdapter = format === 'html' && creationData(bytes.toString('utf8')) ? 'creation-document' : undefined;
            if (format === 'html' && !editAdapter)
                issues.push({
                    code: 'HTML_READ_ONLY',
                    message:
                        '此 HTML 尚未识别创作协议，保留原件并提供静态读取',
                    relativePath: rel,
                });
            documents.push({
                id: docID(rel),
                section,
                title,
                relativePath: rel,
                hash: digest(bytes),
                format,
                writable,
                ...(editAdapter ? {editAdapter} : {}),
                contentId: tNumber
                    ? (contentIDs.get(tNumber) ??
                      uuidFor(`${vaultId}:${tNumber}`))
                    : null,
                tNumber,
                bytes: bytes.length,
            });
            const cached = fileCache.get(path.join(root, ...rel.split('/')));
            if (cached) {
                cached.document = documents.at(-1);
                delete cached.bytes;
            }
        }
    }
    walk();
    return {documents, issues};
}
function readVaultSnapshotUnlocked(runtimeRoot) {
    const binding = bindingForRuntime(runtimeRoot);
    if (!binding) return null;
    const recoveryIssues = (recoveringRoots.has(binding.vaultRoot) || applyingRoots.has(binding.vaultRoot)) ? [] : recoverVault(binding.vaultRoot);
    const {documents, issues} = scan(binding.vaultRoot, binding.vaultId);
    issues.push(...recoveryIssues);
    const projection = exists(binding.vaultRoot, '.workbench/projection.json')
        ? json(binding.vaultRoot, '.workbench/projection.json')
        : null;
    for (const item of Object.values(projection?.contents ?? {}))
        if (
            !item.trashMutationId &&
            !documents.some((d) => d.relativePath === item.relativePath)
        )
            issues.push({
                code: 'SOURCE_MISSING',
                message:
                    '当前稿件来源已移走或不可读，保留内容与映射，请恢复来源或明确重新绑定',
                relativePath: item.relativePath,
            });
    const groups = new Map();
    for (const d of documents)
        if (d.section === 'topics' && d.tNumber) {
            const group = groups.get(d.tNumber) ?? [];
            group.push(d);
            groups.set(d.tNumber, group);
        }
    for (const [t, docs] of groups)
        publicationStatus(
            {
                root: binding.vaultRoot,
                vaultId: binding.vaultId,
                documents,
                issues,
            },
            docs,
            t,
        );
    for (const contentId of new Set(documents.map(d => d.contentId).filter(Boolean))) {
        const selected = currentWorkingDraft({root: binding.vaultRoot, documents, issues}, contentId);
        if (selected?.sourceConflict) {
            const index = documents.findIndex(document => document.id === selected.id);
            documents[index] = {...documents[index], writable: false, sourceConflict: selected.sourceConflict};
        }
    }
    for (const source of contentSources({root: binding.vaultRoot, vaultId: binding.vaultId, documents, issues})) {
        if (!source.document.sourceConflict) continue;
        const ids=new Set(source.sourceCandidates.map(candidate=>candidate.documentId));
        for(let i=0;i<documents.length;i++)if(ids.has(documents[i].id))documents[i]={...documents[i],writable:false,sourceConflict:source.document.sourceConflict};
    }
    const position = documents.filter(
        (d) =>
            d.section === 'profile' &&
            /定位总览|定位报告|个人定位|账号包装|定位_v/.test(d.title),
    );
    return {
        root: binding.vaultRoot,
        name: path.basename(binding.vaultRoot),
        vaultId: binding.vaultId,
        documents,
        issues,
        positioning: {
            status: position.some((d) =>
                /定位总览|定位报告|个人定位/.test(d.title),
            )
                ? 'available'
                : position.length
                  ? 'partial'
                  : 'missing',
            documentIds: position.map((d) => d.id),
        },
        revision: digest(JSON.stringify(documents.map((d) => [d.id, d.hash]))),
    };
}
/** A finite read observes a complete Vault transaction, including recovery. Internal
 * receipt validators reuse only the lock held by this synchronous call stack. */
export function withVaultReadLock(root, callback) {
    return ownedLocks.has(root) ? callback() : withVaultLock(root, callback);
}
export function readVaultSnapshot(runtimeRoot) {
    const binding = bindingForRuntime(runtimeRoot);
    if (!binding) return null;
    return withVaultReadLock(binding.vaultRoot, () => readVaultSnapshotUnlocked(runtimeRoot));
}
function readVaultDocumentUnlocked(runtimeRoot, id) {
    if (typeof id !== 'string' || !/^doc-[a-f0-9]{32}$/.test(id))
        fail('INVALID_INPUT', '知识文档标识无效');
    const s = readVaultSnapshot(runtimeRoot);
    if (!s) fail('NOT_READY', '当前库没有知识文件');
    const document = s.documents.find((d) => d.id === id);
    if (!document) fail('INVALID_INPUT', '知识文件不存在或已移动');
    const bytes = readBytes(s.root, document.relativePath);
    if (digest(bytes) !== document.hash)
        fail('CONFLICT', '知识文件在读取时变化');
    const text = bytes.toString('utf8');
    return {
        document,
        text: document.format === 'html' ? (htmlBody(text) ?? text) : text,
        ...(document.format === 'html' ? {summaryOnly: true, originalDocumentId: document.id} : {}),
        ...(document.format === 'html'
            ? {workingDraftAvailable: workingDraftAvailable(s, document, text)}
            : {}),
    };
}
export function readVaultDocument(runtimeRoot, id) {
    const binding = vaultState(runtimeRoot);
    return withVaultReadLock(binding.root, () => readVaultDocumentUnlocked(runtimeRoot, id));
}
function mutationID(options) {
    if (
        !options ||
        Object.keys(options).some((k) => k !== 'mutationId') ||
        typeof options.mutationId !== 'string' ||
        !/^[a-zA-Z0-9_-]{8,100}$/.test(options.mutationId)
    )
        fail('INVALID_INPUT', '请提供稳定且安全的 mutationId');
    return options.mutationId;
}
function applyReceiptUnlocked(root, r) {
    if (r.action === 'publication-runtime') return applyPublicationReceipt(root, r);
    if (r.action === 'topic-adoption') return applyTopicReceipt(root, r);
    if (r.action === 'working-draft') return applyWorkingDraftReceipt(root, r);
    if (
        r.format !== 'nova-vault-mutation' ||
        !['save', 'create', 'trash'].includes(r.action) ||
        typeof r.path !== 'string' ||
        !r.requestHash ||
        !Object.hasOwn(r, 'beforeHash')
    )
        fail('CORRUPT', '知识文件事务损坏');
    if (
        !/^[a-zA-Z0-9_-]{8,100}$/.test(r.mutationId ?? '') ||
        !/^[a-f0-9]{64}$/.test(r.requestHash) ||
        !(r.beforeHash === null || /^[a-f0-9]{64}$/.test(r.beforeHash)) ||
        !r.request ||
        digest(JSON.stringify(r.request)) !== r.requestHash ||
        !(
            r.after === null ||
            (typeof r.after === 'string' &&
                r.after.length <= Math.ceil(LIMIT / 3) * 4)
        )
    )
        fail('CORRUPT', '知识事务校验和或大小无效');
    const bytes = r.after === null ? null : Buffer.from(r.after, 'base64');
    if (bytes && (bytes.toString('base64') !== r.after || bytes.length > LIMIT))
        fail('CORRUPT', '知识事务正文编码无效');
    const target = safe(root, r.path, true);
    const before = exists(root, r.path) ? readBytes(root, r.path) : null;
    const current = before === null ? null : digest(before),
        afterHash = bytes === null ? null : digest(bytes);
    if (r.action === 'trash') {
        const dest = `.workbench/trash/${r.mutationId}/source`;
        mkdir(root, `.workbench/trash/${r.mutationId}`);
        if (current === r.beforeHash) {
            if (exists(root, dest)) fail('CONFLICT', '回收站目标已存在');
            fs.renameSync(target, safe(root, dest, true));
            syncDir(path.dirname(target));
            syncDir(path.dirname(safe(root, dest)));
        } else if (
            current !== null ||
            !exists(root, dest) ||
            digest(readBytes(root, dest)) !== r.beforeHash
        )
            fail('CONFLICT', '回收中的源文件发生外部修改');
    } else if (current !== afterHash) {
        if (current !== r.beforeHash)
            fail('CONFLICT', '知识文件已被外部修改，事务未覆盖');
        mkdir(root, path.posix.dirname(r.path));
        atomic(root, r.path, bytes, r.beforeHash);
    }
    r.status = 'committed';
    writeJSON(root, `.workbench/mutations/${r.mutationId}.json`, r);
}
function applyReceipt(root, receipt) {
    const alreadyApplying = applyingRoots.has(root);
    applyingRoots.add(root);
    try { return applyReceiptUnlocked(root, receipt); }
    finally { if (!alreadyApplying) applyingRoots.delete(root); }
}
const PENDING_DIRECTORY = '.workbench/pending-mutations';
const PENDING_INDEX = '.workbench/pending-mutations-index.json';
const ownedLocks = new Set();
const recoveringRoots = new Set();
const applyingRoots = new Set();
const receiptName = /^[a-zA-Z0-9_-]{8,100}\.json$/;
function validateReceipt(receipt, mid) {
    if (!receipt || receipt.format !== 'nova-vault-mutation' ||
        receipt.mutationId !== mid || !['pending', 'committed'].includes(receipt.status) ||
        !/^[a-zA-Z0-9_-]{8,100}$/.test(mid ?? '') ||
        !/^[a-f0-9]{64}$/.test(receipt.requestHash ?? '') || !receipt.request ||
        digest(JSON.stringify(receipt.request)) !== receipt.requestHash)
        fail('CORRUPT', '知识事务回执校验失败');
    return receipt;
}
const planHash = receipt => digest(JSON.stringify({...receipt, status: 'pending'}));
function pendingIdentity(root) {
    const descriptor = json(root, '.workbench/vault.json'), actual = identity(root);
    if (descriptor.format !== 'nova-knowledge-vault' || !descriptor.vaultId ||
        descriptor.rootIdentity?.dev !== actual.dev || descriptor.rootIdentity?.ino !== actual.ino)
        fail('CONFLICT', '知识库身份已变化，不能恢复事务');
    return descriptor.vaultId;
}
function readPending(root, name, vaultId) {
    const value = json(root, `${PENDING_DIRECTORY}/${name}`);
    if (value?.format !== 'nova-vault-pending-mutation' || value.schemaVersion !== 1 ||
        value.vaultId !== vaultId || value.receiptHash !== digest(JSON.stringify(value.receipt)))
        fail('CORRUPT', '待恢复事务索引身份或校验和无效');
    const receipt = validateReceipt(value.receipt, name.slice(0, -5));
    if (receipt.status !== 'pending') fail('CORRUPT', '待恢复事务必须保留原始待处理计划');
    return receipt;
}
function stagePending(root, receipt, vaultId = pendingIdentity(root)) {
    const name = `${receipt.mutationId}.json`, location = `${PENDING_DIRECTORY}/${name}`;
    validateReceipt(receipt, receipt.mutationId);
    mkdir(root, PENDING_DIRECTORY);
    if (exists(root, location)) {
        if (planHash(readPending(root, name, vaultId)) !== planHash(receipt))
            fail('CORRUPT', '待恢复事务与历史日志计划不一致');
        return;
    }
    // Logical Vault ID survives verified backup/restore; current physical identity
    // is checked independently against vault.json on every recovery.
    writeJSON(root, location, {format: 'nova-vault-pending-mutation', schemaVersion: 1,
        vaultId, receiptHash: digest(JSON.stringify(receipt)), receipt});
}
function clearPending(root, mid) {
    const location = `${PENDING_DIRECTORY}/${mid}.json`;
    if (!exists(root, location)) return;
    fs.unlinkSync(safe(root, location));
    syncDir(safe(root, PENDING_DIRECTORY));
}
function migratePendingIndex(root, vaultId) {
    if (exists(root, PENDING_INDEX)) {
        const marker = json(root, PENDING_INDEX);
        if (marker.format !== 'nova-vault-pending-index' || marker.schemaVersion !== 1 || marker.vaultId !== vaultId)
            fail('CORRUPT', '待恢复事务迁移标识无效');
        return;
    }
    mkdir(root, PENDING_DIRECTORY);
    if (exists(root, '.workbench/mutations'))
        for (const name of fs.readdirSync(safe(root, '.workbench/mutations'))) {
            if (!receiptName.test(name)) fail('CORRUPT', '知识事务目录包含未知文件');
            const receipt = validateReceipt(json(root, `.workbench/mutations/${name}`), name.slice(0, -5));
            if (receipt.status === 'pending') stagePending(root, receipt, vaultId);
        }
    // Never publish the marker before EVERY legacy pending plan is durable.
    writeJSON(root, PENDING_INDEX, {format: 'nova-vault-pending-index', schemaVersion: 1, vaultId});
}
function recoverVaultUnlocked(root) {
    if (recoveringRoots.has(root)) return [];
    recoveringRoots.add(root);
    try {
        const vaultId = pendingIdentity(root), issues = [];
        migratePendingIndex(root, vaultId);
        for (const name of fs.readdirSync(safe(root, PENDING_DIRECTORY))) {
            if (!receiptName.test(name)) fail('CORRUPT', '待恢复事务目录包含未知文件');
            const receipt = readPending(root, name, vaultId), location = `.workbench/mutations/${name}`;
            if (exists(root, location)) {
                const recorded = validateReceipt(json(root, location), receipt.mutationId);
                if (planHash(recorded) !== planHash(receipt))
                    fail('CORRUPT', '待恢复事务与历史日志计划不一致');
                if (recorded.status === 'committed') {
                    // A crash after commit must never replay over later human edits.
                    clearPending(root, receipt.mutationId);
                    continue;
                }
            } else writeJSON(root, location, receipt);
            try {
                applyReceipt(root, receipt);
                clearPending(root, receipt.mutationId);
            } catch (error) {
                if (!['working-draft', 'publication-runtime'].includes(receipt.action) || error.code !== 'CONFLICT') throw error;
                issues.push({code: 'PENDING_MUTATION_CONFLICT', message: error.message,
                    mutationId: receipt.mutationId, action: receipt.action,
                    relativePath: receipt.originalPath ?? receipt.writes?.[0]?.relativePath});
            }
        }
        return issues;
    } finally { recoveringRoots.delete(root); }
}
export function recoverVault(root) {
    return withVaultReadLock(root, () => recoverVaultUnlocked(root));
}
function runMutationUnlocked(runtimeRoot, request, options, prepare) {
    const b = vaultState(runtimeRoot),
        mid = mutationID(options),
        loc = `.workbench/mutations/${mid}.json`,
        requestHash = digest(JSON.stringify(request));
    recoverVault(b.root);
    if (exists(b.root, loc)) {
        const old = json(b.root, loc);
        queryVaultMutation(runtimeRoot, mid);
        if (old.requestHash !== requestHash)
            fail('INVALID_INPUT', 'mutationId 已用于另一项请求');
        if (old.status === 'pending') {
            applyReceipt(b.root, old);
            clearPending(b.root, mid);
        }
        return old;
    }
    const r = {
        format: 'nova-vault-mutation',
        mutationId: mid,
        requestHash,
        request,
        status: 'pending',
        ...prepare(b),
    };
    stagePending(b.root, r);
    writeJSON(b.root, loc, r);
    applyReceipt(b.root, r);
    clearPending(b.root, mid);
    return r;
}
export function withVaultLock(root, fn) {
    const lock = safe(root, '.workbench/mutation-lock', true);
    try {
        fs.mkdirSync(lock);
    } catch (e) {
        if (e.code === 'EEXIST') {
            const owner = exists(root, '.workbench/mutation-lock/owner.json')
                ? json(root, '.workbench/mutation-lock/owner.json')
                : null;
            let alive = true;
            if (owner?.pid && (!owner.host || owner.host === os.hostname())) {
                try {
                    process.kill(owner.pid, 0);
                } catch (err) {
                    alive = err.code !== 'ESRCH';
                }
            }
            if (!alive) {
                fs.unlinkSync(
                    safe(root, '.workbench/mutation-lock/owner.json'),
                );
                fs.rmdirSync(lock);
                return withVaultLock(root, fn);
            }
            fail('NOT_READY', '知识库正由另一项写入操作使用，请稍后重试');
        }
        throw e;
    }
    try {
        writeJSON(root, '.workbench/mutation-lock/owner.json', {
            pid: process.pid,
            host: os.hostname(),
        });
        ownedLocks.add(root);
        return fn();
    } finally {
        ownedLocks.delete(root);
        fs.unlinkSync(safe(root, '.workbench/mutation-lock/owner.json'));
        fs.rmdirSync(lock);
    }
}
export function runMutation(runtimeRoot, request, options, prepare) {
    return withVaultLock(vaultState(runtimeRoot).root, () =>
        runMutationUnlocked(runtimeRoot, request, options, prepare),
    );
}
export function saveVaultDocument(runtimeRoot, input, options) {
    if (
        !input ||
        Object.keys(input).some(
            (k) => !['id', 'expectedHash', 'text'].includes(k),
        ) ||
        typeof input.text !== 'string' ||
        Buffer.byteLength(input.text) > LIMIT ||
        !/^[a-f0-9]{64}$/.test(input.expectedHash ?? '')
    )
        fail('INVALID_INPUT', '知识文件保存参数无效或内容超限');
    const r = runMutation(runtimeRoot, {action: 'save', input}, options, () => {
        const {document} = readVaultDocument(runtimeRoot, input.id);
        if (document.sourceConflict) fail('CONFLICT', document.sourceConflict);
        if (!document.writable)
            fail('INVALID_INPUT', '该格式仅支持只读，原文件已保留');
        if (document.hash !== input.expectedHash)
            fail('CONFLICT', '知识文件已在外部修改，请重新读取');
        return {
            action: 'save',
            path: document.relativePath,
            beforeHash: document.hash,
            after: Buffer.from(input.text).toString('base64'),
            result: {
                document: {
                    ...document,
                    title:
                        document.format === 'markdown'
                            ? (input.text.match(/^#\s+(.+)$/m)?.[1]?.trim() ??
                              document.title)
                            : document.title,
                    hash: digest(input.text),
                    bytes: Buffer.byteLength(input.text),
                },
                text: input.text,
            },
        };
    });
    return r.result;
}
export function nextTNumber(snapshot) {
    let max = exists(snapshot.root, '.workbench/numbering.json')
            ? Number(
                  json(snapshot.root, '.workbench/numbering.json').lastNumber,
              ) || 0
            : 0,
        declaredNext = 1;
    const projection = exists(snapshot.root, '.workbench/projection.json')
        ? json(snapshot.root, '.workbench/projection.json')
        : null;
    for (const entry of Object.values(projection?.contents ?? {}))
        max = Math.max(max, Number(entry.tNumber?.slice(1)) || 0);
    for (const d of snapshot.documents) {
        if (d.tNumber) max = Math.max(max, Number(d.tNumber.slice(1)));
        if (
            ['topics', 'drafts'].includes(d.section) &&
            d.format === 'markdown'
        ) {
            const text = readBytes(snapshot.root, d.relativePath).toString(
                'utf8',
            );
            for (const line of text.split('\n')) {
                for (const hint of line.matchAll(
                    /下一个[^T\n]{0,20}T(\d{3,})/g,
                ))
                    declaredNext = Math.max(declaredNext, Number(hint[1]));
                for (const retired of line.matchAll(
                    /(?:作废|废弃|不复用)[^\n。；;]{0,150}/g,
                ))
                    for (const m of retired[0].matchAll(/T(\d{3,})/g))
                        max = Math.max(max, Number(m[1]));
            }
        }
    }
    return Math.max(max + 1, declaredNext);
}
export function createVaultDocument(runtimeRoot, input, options) {
    if (
        !input ||
        Object.keys(input).some(
            (k) => !['section', 'title', 'text'].includes(k),
        ) ||
        !Object.hasOwn(SECTIONS, input.section) ||
        typeof input.title !== 'string' ||
        input.title.length > 500 ||
        typeof input.text !== 'string' ||
        Buffer.byteLength(input.text) > LIMIT
    )
        fail('INVALID_INPUT', '新建知识文件参数无效');
    const r = runMutation(
        runtimeRoot,
        {action: 'create', input},
        options,
        (binding) => {
            const allocatesNumber = ['topics', 'drafts'].includes(input.section);
            const s = allocatesNumber ? readVaultSnapshot(runtimeRoot) : binding,
                number = allocatesNumber ? `T${String(nextTNumber(s)).padStart(3, '0')}` : null,
                title = input.title
                    .trim()
                    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
                    .slice(0, 60),
                folder = ['topics', 'drafts'].includes(input.section)
                    ? `${SECTIONS.drafts}/${number}_${title || '未定选题'}`
                    : input.section === 'prompts' ? '11_提示词' : SECTIONS[input.section];
            if (['topics', 'drafts'].includes(input.section))
                writeJSON(s.root, '.workbench/numbering.json', {
                    lastNumber: Number(number.slice(1)),
                });
            const rel = ['topics', 'drafts'].includes(input.section)
                ? `${folder}/正文.md`
                : `${folder}/${title || '未命名资料'}${input.section === 'profile' && ['定位总览', '账号包装'].includes(title) ? '' : `_${digest(options.mutationId).slice(0, 8)}`}.md`;
            if (exists(s.root, rel)) fail('CONFLICT', '新建目标已存在');
            return {
                action: 'create',
                path: rel,
                beforeHash: null,
                after: Buffer.from(input.text).toString('base64'),
                result: {
                    document: {
                        id: docID(rel),
                        section: ['topics', 'drafts'].includes(input.section)
                            ? 'drafts'
                            : input.section,
                        title:
                            input.title.trim() ||
                            (['topics', 'drafts'].includes(input.section)
                                ? `${number} 未定选题`
                                : '未命名资料'),
                        relativePath: rel,
                        hash: digest(input.text),
                        format: 'markdown',
                        writable: true,
                        contentId: ['topics', 'drafts'].includes(input.section)
                            ? uuidFor(`${s.vaultId}:${number}`)
                            : null,
                        tNumber: ['topics', 'drafts'].includes(input.section)
                            ? number
                            : null,
                        bytes: Buffer.byteLength(input.text),
                    },
                    text: input.text,
                },
            };
        },
    );
    return r.result;
}
export function trashVaultDocument(runtimeRoot, input, options) {
    if (
        !input ||
        Object.keys(input).some((k) => !['id', 'expectedHash'].includes(k)) ||
        typeof input.expectedHash !== 'string'
    )
        fail('INVALID_INPUT', '回收知识文件参数无效');
    runMutation(runtimeRoot, {action: 'trash', input}, options, () => {
        const {document} = readVaultDocument(runtimeRoot, input.id);
        if (document.hash !== input.expectedHash)
            fail('CONFLICT', '知识文件已被外部修改，不能回收');
        return {
            action: 'trash',
            path: document.relativePath,
            beforeHash: document.hash,
            after: null,
        };
    });
    return {trashed: true};
}
export function materializeVaultBody(
    runtimeRoot,
    contentId,
    source,
    text,
    options,
) {
    const r = runMutation(
        runtimeRoot,
        {
            action: 'materialize-body',
            contentId,
            sourcePath: source.relativePath,
            expectedHash: source.hash,
            text,
        },
        options,
        (b) => {
            if (digest(readBytes(b.root, source.relativePath)) !== source.hash)
                fail('CONFLICT', '选题卡已在外部修改，不能创建正文');
            const relativePath = `${source.contentDirectory}/正文.md`;
            if (exists(b.root, relativePath))
                fail('CONFLICT', '此篇已存在正文，请重新读取');
            return {
                action: 'create',
                path: relativePath,
                beforeHash: null,
                after: Buffer.from(text).toString('base64'),
                result: {
                    document: {
                        id: docID(relativePath),
                        section: 'drafts',
                        title: source.tNumber,
                        relativePath,
                        hash: digest(text),
                        format: 'markdown',
                        writable: true,
                        contentId,
                        tNumber: source.tNumber,
                        bytes: Buffer.byteLength(text),
                    },
                    text,
                },
            };
        },
    );
    return r.result;
}
export function validateVaultRestoreSource(runtimeRoot, source) {
    const binding = vaultState(runtimeRoot);
    if (!source.trashMutationId)
        fail('INVALID_INPUT', '此内容没有原位回收记录');
    if (exists(binding.root, source.relativePath))
        fail('CONFLICT', '恢复路径已有文件，拒绝覆盖');
    const bytes = readBytes(
        binding.root,
        `.workbench/trash/${source.trashMutationId}/source`,
    );
    if (digest(bytes) !== source.hash)
        fail('CONFLICT', '回收原文件已变化，不能恢复');
}

export function restoreVaultSource(runtimeRoot, source, options) {
    runMutation(
        runtimeRoot,
        {
            action: 'restore',
            path: source.relativePath,
            trashMutationId: source.trashMutationId,
        },
        options,
        (b) => {
            if (!source.trashMutationId)
                fail('INVALID_INPUT', '此内容没有原位回收记录');
            if (exists(b.root, source.relativePath))
                fail('CONFLICT', '恢复路径已有文件，拒绝覆盖');
            const bytes = readBytes(
                b.root,
                `.workbench/trash/${source.trashMutationId}/source`,
            );
            return {
                action: 'create',
                path: source.relativePath,
                beforeHash: null,
                after: bytes.toString('base64'),
            };
        },
    );
}
/** Data-only preview. Full editing uses creation-document; no source HTML scripts execute. */
export function creationData(text) {
    const matches = [...text.matchAll(/<script\b(?=[^>]*\bid=["']jc-doc["'])(?=[^>]*\btype=["']application\/json["'])[^>]*>([\s\S]*?)<\/script>/gi)];
    if (matches.length !== 1) return null;
    try { const data = JSON.parse(matches[0][1]); return data.schema === 1 && Array.isArray(data.items) ? data : null; } catch { return null; }
}
export function htmlBody(text) {
    const data = creationData(text);
    if (!data) return null;
    const segments = data.items.filter(i => i.kind === 'segment');
    if (!segments.length || !segments.every(i => typeof i.fields?.mine === 'string')) return null;
    return segments.map((item,index)=>({item,index})).sort((a,b)=>{
        const x=a.item.locked?.order,y=b.item.locked?.order;
        return (Number.isFinite(x)?x:Infinity)-(Number.isFinite(y)?y:Infinity)||a.index-b.index;
    }).map(({item})=>item.fields.mine).join('\n\n');
}
/** Read only explicit metadata status lines, never quotations or instructions in the body. */
export function topicCardStatus(snapshot, docs) {
    const evidence=[];
    for(const document of docs.filter(d=>d.section==='topics'&&d.format==='markdown')) {
        const bytes=readBytes(snapshot.root,document.relativePath);
        if(digest(bytes)!==document.hash)fail('CONFLICT','选题卡在状态读取时已变化，请重新读取：'+document.relativePath);
        let fence=null;
        for(const [index,line] of bytes.toString('utf8').split(/\r?\n/).entries()) {
            const marker=line.trim().match(/^(`{3,}|~{3,})/);
            if(marker){const kind=marker[1][0];if(fence===null)fence=kind;else if(fence===kind)fence=null;continue;}
            if(fence!==null)continue;
            if(/^\s*#{2,6}\s/.test(line))break;
            const match=line.match(/^\s*(?:[-*]\s+)?(?:\*\*)?状态(?:\*\*)?\s*[：:](?:\*\*)?\s*(\S.*?)\s*$/);
            if(!match)continue;
            const status=match[1],pause=[...status.matchAll(/暂不做|暂缓|暂停|搁置|延期|顺延|推迟/g)].find(found=>{
                const before=status.slice(0,found.index),after=status.slice(found.index+found[0].length);
                return !/(?:不要|不用|无需|不必|不再|不应|不得|并不|没有|未|不|取消了?|解除)\s*$/.test(before)&&!/^\s*(?:已)?(?:取消|解除|结束)/.test(after);
            });
            const reason=pause?status.slice(pause.index).replace(/[）)\]】]+\s*$/g,'').trim():null;
            evidence.push({origin:'topic-card-status',documentId:document.id,relativePath:document.relativePath,hash:document.hash,line:index+1,text:line,status,paused:!!pause,reason});
        }
    }
    const selected=evidence.find(item=>item.paused)??evidence[0];
    return {paused:evidence.some(item=>item.paused),status:selected?.status??null,reason:selected?.reason??null,evidence};
}
function publicationStatus(snapshot, docs, tNumber) {
    // Formal author-confirmed publication remains independent of recorded/已做 markers.
    for (const d of docs.filter(d => d.section === 'drafts')) {
        const directory=d.relativePath.match(/^(05_内容草稿\/(?:已做\/)?T\d{3,}_[^/]+)\//)?.[1];
        if (!directory) continue;
        try {
            const pointer=json(snapshot.root,directory+'/正式发布档案.json');
            if(pointer.format!=='nova-publication-reference'||pointer.work?.vaultId!==snapshot.vaultId||pointer.work?.workId!==tNumber)continue;
            const manifest=json(snapshot.root,pointer.archiveDirectory+'/.system/manifest.json');
            if(manifest.schema_version===2&&manifest.video_id===pointer.videoId&&manifest.work_id===tNumber&&manifest.nova?.vault_id===snapshot.vaultId&&manifest.nova?.decisions?.some(x=>x.actor==='author')&&Object.values(manifest.platforms??{}).some(p=>typeof p.url==='string'&&/^https?:\/\//.test(p.url)&&Number.isFinite(Date.parse(p.published_at))))return '已发布';
        } catch (error) {if(error.code!=='ENOENT')snapshot.issues.push({code:'PUBLICATION_ARCHIVE_UNREADABLE',message:error.message,relativePath:directory+'/正式发布档案.json'});}
    }
    const statuses = [];
    for (const d of docs.filter(
        (d) => d.section === 'topics' && d.format === 'markdown',
    )) {
        const text = readBytes(snapshot.root, d.relativePath).toString('utf8'),
            status = text.match(
                /(?:\*\*状态\*\*|状态)\s*[：:]\s*(已发布|草稿|待写)/,
            )?.[1];
        if (status) statuses.push(status);
    }
    const overview = snapshot.documents.find(
        (d) => d.relativePath === `${SECTIONS.topics}/00_选题总览.md`,
    );
    if (overview) {
        const row = readBytes(snapshot.root, overview.relativePath)
                .toString('utf8')
                .split('\n')
                .find(
                    (line) =>
                        line.startsWith('|') &&
                        new RegExp(`\\b${tNumber}\\b`).test(line),
                ),
            status = row?.match(/\|\s*(已发布|草稿|待写)\s*\|/)?.[1];
        if (status) statuses.push(status);
    }
    const unique = [...new Set(statuses)];
    if (unique.length > 1) {
        snapshot.issues.push({
            code: 'PUBLICATION_STATUS_CONFLICT',
            message: `${tNumber} 的选题卡与总览发布状态不一致，未推断为已发布`,
            relativePath: docs.find((d) => d.section === 'topics')
                ?.relativePath,
        });
        return 'conflict';
    }
    return unique[0] ?? null;
}
function candidateRole(document,label='') {
    if(document.section==='topics')return 'topic-card';
    if(document.format==='html')return document.editAdapter==='creation-document'&&/创作页/.test(document.title)?'creation-page':/对照/.test(document.title)?'legacy-compare':'supporting';
    if(/定稿|最终稿|录制稿|提词/.test(label||path.posix.basename(document.relativePath)))return 'final-script';
    if(/工作稿|逐字稿|正文|初稿/.test(label+' '+path.posix.basename(document.relativePath)))return 'working-draft';
    return 'supporting';
}
function sourceEvidence(snapshot,docs,line) {
    const candidates=new Map(), declarations=[];
    const add=(document,evidence,current=false)=>{
        if(!document)return;
        const candidate=candidates.get(document.id)??{sourceId:document.section==='topics'?'topics':'drafts',documentId:document.id,relativePath:document.relativePath,hash:document.hash,format:document.format,role:candidateRole(document,evidence.label),evidence:[]};
        candidate.evidence.push(evidence); candidates.set(document.id,candidate);
        if(current)declarations.push(document);
    };
    const pageDoc=(id)=>docs.find(d=>d.format==='html'&&(()=>{const data=creationData(readBytes(snapshot.root,d.relativePath).toString('utf8'));return data&&(data.page_id===id||data.pageId===id||data.id===id);})());
    const links=(text,base,origin,explicitOnly=false)=>{
        for(const match of text.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)){
            const [whole,label,url]=match;
            if(!/稿|提词|创作页|正文/.test(label))continue;
            const surrounding=text.slice(Math.max(0,match.index-40),match.index+whole.length+45);
            if(explicitOnly&&!/当前|最新|继续|接着/.test(surrounding))continue;
            let document;
            const page=url.match(/^http:\/\/127\.0\.0\.1:\d+\/p\/([a-zA-Z0-9_-]+)$/);
            if(page)document=pageDoc(page[1]);
            else if(!/^[a-z]+:/i.test(url)&&!url.startsWith('/')){
                let relative;try{relative=decodeURIComponent(path.posix.normalize(path.posix.join(base,url)));}catch{continue;}
                document=docs.find(d=>d.relativePath===relative);
            }
            if(!document)continue;
            const after=text.slice(match.index+whole.length,match.index+whole.length+28);
            const historical=/^\s*[（(][^）)]*(?:那版|旧版|历史|已发版|底稿)/.test(after)||/旧|历史|存档/.test(label);
            const pageCurrent=/等你在创作页上改|在创作页.*(?:继续|修改)|创作页[^|]*·[^|]*工作稿/.test(text);
            const role=candidateRole(document,label);
            const current=!historical&&role!=='final-script'&&(!pageCurrent||document.format==='html');
            add(document,{origin,label,reference:url,historical,role},current);
        }
    };
    if(line)links(line,SECTIONS.drafts,'draft-overview');
    for(const d of docs.filter(d=>d.section==='topics'&&d.format==='markdown')){
        const text=readBytes(snapshot.root,d.relativePath).toString('utf8');
        for(const row of text.split('\n').filter(row=>/当前稿|当前创作页|最新工作稿|继续改/.test(row)))links(row,path.posix.dirname(d.relativePath),'topic-card',true);
        for(const row of text.split('\n').filter(row=>/写稿以创作页为准|当前(?:稿|原件).*创作页/.test(row))){
            for(const page of docs.filter(item=>item.format==='html'&&/创作页/.test(item.title)))add(page,{origin:'topic-card',label:'卡片声明以创作页为准',text:row},true);
        }
    }
    return {candidates,declarations,add};
}
export function resolveCurrentSource(snapshot,docs,pinned=null) {
    const overview=snapshot.documents.find(d=>d.relativePath===SECTIONS.drafts+'/00_草稿总览.md');
    const tNumber=docs[0]?.tNumber;
    const overviewLines=overview?readBytes(snapshot.root,overview.relativePath).toString('utf8').split('\n'):[];
    const overviewIndex=overviewLines.findIndex(l=>new RegExp('^\\|\\s*'+tNumber+'\\s*\\|').test(l));
    const line=overviewIndex>=0?overviewLines[overviewIndex]:'';
    const overviewSection=overviewIndex<0?'':overviewLines.slice(0,overviewIndex).reverse().find(l=>/^#{1,6}\s/.test(l))?.replace(/^#{1,6}\s+/,'')??'';
    const state=sourceEvidence(snapshot,docs,line);
    const bodyDocs=docs.filter(d=>d.section==='drafts'&&!/(?:^|\/)(?:参考|素材|助手任务|任务归档|发布存档|历史|版本)(?:\/|_)/.test(d.relativePath)&&(
        /(?:^|[\/_])(?:定稿|最终稿|录制定稿|逐字稿|工作稿|正文|提词|创作页)/.test(d.relativePath)||d.format==='html'&&!!d.editAdapter));
    for(const d of bodyDocs)state.add(d,{origin:'document',label:d.title});
    if(pinned)state.add(pinned,{origin:'working-draft-receipt',label:'已确认工作稿'});
    const selected=[];
    let missingSelection=null;
    for(const d of docs.filter(d=>path.posix.basename(d.relativePath)==='创作过程.json')){
        const flow=json(snapshot.root,d.relativePath);
        if(flow.format==='nova-work-flow'&&flow.work?.vaultId===snapshot.vaultId&&flow.work?.workId===tNumber&&flow.currentSource){
            const current=docs.find(item=>item.id===flow.currentSource.documentId&&item.relativePath===flow.currentSource.relativePath);
            if(current){selected.push(current);state.add(current,{origin:'author-source-selection',evidence:flow.currentSource.evidence});}
            else {missingSelection=flow.currentSource;state.candidates.set(flow.currentSource.documentId,{...flow.currentSource,format:'other',role:'supporting',evidence:[{origin:'author-source-selection',missing:true,evidence:flow.currentSource.evidence}]});}
        }
    }
    const declared=[...new Map((selected.length?selected:state.declarations).map(d=>[d.id,d])).values()];
    // A recording/final delivery document is a different role from the live creation editor.
    // When both are linked, resume the editor and retain the final script independently.
    const primaryBodies=bodyDocs.filter(d=>candidateRole(d)==='creation-page');
    const fallbackBodies=primaryBodies.length?primaryBodies:bodyDocs.filter(d=>candidateRole(d)!=='final-script');
    const editableBodies=fallbackBodies.length?fallbackBodies:bodyDocs;
    const effectivePinned=selected.length||missingSelection?null:pinned;
    let chosen=effectivePinned??declared[0]??editableBodies[0]??docs.find(d=>d.section==='topics')??docs[0];
    const conflict=(missingSelection?tNumber+' 的已选当前原件缺失，请恢复或明确重新选择：'+missingSelection.relativePath:null)??effectivePinned?.sourceConflict??(!effectivePinned&&declared.length>1? tNumber+' 的明确当前入口指向多个原件，请选择继续的来源':!effectivePinned&&!declared.length&&editableBodies.length>1?tNumber+' 有多个稿件而没有唯一当前入口，请选择继续的来源':null);
    if(!state.candidates.has(chosen.id))state.add(chosen,{origin:'topic-or-supporting-document',label:chosen.title});
    if(conflict){chosen={...chosen,writable:false,sourceConflict:conflict};if(!snapshot.issues.some(i=>i.code==='CURRENT_SOURCE_CONFLICT'&&i.relativePath===chosen.relativePath))snapshot.issues.push({code:'CURRENT_SOURCE_CONFLICT',message:conflict,relativePath:chosen.relativePath});}
    return {document:chosen,sourceCandidates:[...state.candidates.values()],sourceResolution:missingSelection?'missing':conflict?'conflict':'resolved',sourceMissing:!!missingSelection,evidence:line?[{origin:'draft-overview',documentId:overview.id,relativePath:overview.relativePath,hash:overview.hash,section:overviewSection,text:line}]:[]};
}
export function contentSources(snapshot, ignoredWorkingDraftId = null) {
    const groups = new Map();
    for (const d of snapshot.documents) if (d.contentId && ['topics', 'drafts'].includes(d.section)) {
        const group=groups.get(d.contentId)??[];group.push(d);groups.set(d.contentId,group);
    }
    return [...groups].map(([contentId,docs])=>{
        let pinned=contentId===ignoredWorkingDraftId?null:currentWorkingDraft(snapshot,contentId);
        if(pinned===undefined)return null;
        if(pinned?.pendingWorkingDraftPath){docs=docs.filter(d=>d.relativePath!==pinned.pendingWorkingDraftPath);pinned=null;}
        const resolved=resolveCurrentSource(snapshot,docs,pinned),chosen=resolved.document,tNumber=docs[0].tNumber;
        const text=readBytes(snapshot.root,chosen.relativePath).toString('utf8');
        const body=chosen.format==='html'?(htmlBody(text)??'此 HTML 无可识别人工正文摘要，请打开完整原件：'+chosen.relativePath):text;
        const publicationState=publicationStatus(snapshot,docs,tNumber),topicStatus=topicCardStatus(snapshot,docs);
        const creationDocs=docs.filter(d=>d.format==='html').map(d=>({documentId:d.id,relativePath:d.relativePath,hash:d.hash,data:creationData(readBytes(snapshot.root,d.relativePath).toString('utf8'))})).filter(d=>d.data);
        const recorded=creationDocs.some(d=>d.data.items.some(i=>i.kind==='info'&&!!i.fields?.recorded?.trim()))||resolved.evidence.some(e=>/(?:录完|已录|录制完成)/.test(e.text)&&!/(?:未录|没录|未完成录制)/.test(e.text));
        return {contentId,tNumber,...resolved,topicStatus,evidence:[...resolved.evidence,...topicStatus.evidence],body,summaryOnly:chosen.format==='html',documents:docs,creationDocuments:creationDocs.map(({data,...d})=>d),recorded,
            title:docs.find(d=>d.section==='topics')?.title??(path.basename(chosen.relativePath)==='正文.md'?path.basename(path.dirname(chosen.relativePath)).replace('_',' '):chosen.title),
            contentDirectory:chosen.section==='drafts'?(chosen.relativePath.match(/^(05_内容草稿\/(?:已做\/)?T\d{3,}_[^/]+)\//)?.[1]??path.posix.dirname(chosen.relativePath)):SECTIONS.drafts+'/'+tNumber+'_'+chosen.title.replace(/[<>:"/\\|?*]/g,'_').slice(0,80),
            published:publicationState==='已发布',publicationState};
    }).filter(Boolean);
}
function readVaultTaskContextUnlocked(runtimeRoot, contentId = null) {
    const binding = bindingForRuntime(runtimeRoot);
    if (!binding) return null;
    const recoveryIssues = (recoveringRoots.has(binding.vaultRoot) || applyingRoots.has(binding.vaultRoot)) ? [] : recoverVault(binding.vaultRoot);
    const raw = scan(binding.vaultRoot, binding.vaultId);
    raw.issues.push(...recoveryIssues);
    const s = {
            root: binding.vaultRoot,
            vaultId: binding.vaultId,
            ...raw,
            positioning: {
                documentIds: raw.documents
                    .filter(
                        (d) =>
                            d.section === 'profile' &&
                            /定位总览|定位报告|个人定位|账号包装|定位_v/.test(
                                d.title,
                            ),
                    )
                    .map((d) => d.id),
            },
            revision: digest(
                JSON.stringify(raw.documents.map((d) => [d.id, d.hash])),
            ),
        };
    const sources = contentSources(s);
    let source = contentId
        ? sources.find((c) => c.contentId === contentId)
        : null;
    const saved =
        contentId && exists(s.root, '.workbench/projection.json')
            ? json(s.root, '.workbench/projection.json').contents?.[contentId]
            : null;
    if (
        saved &&
        !raw.documents.some((d) => d.relativePath === saved.relativePath)
    )
        source = {
            ...(source ?? {}),
            tNumber: saved.tNumber,
            contentDirectory: saved.contentDirectory,
            document: {
                id: saved.documentId,
                relativePath: saved.relativePath,
                hash: saved.hash,
                writable: false,
            },
            documents: source?.documents ?? [],
            sourceMissing: true,
        };
    const inventory=exists(s.root,'.workbench/source-map.json')?readSourceInventory(s.root):{sources:[],issues:[]};
    return {
        sources:inventory.sources,
        sourceIssues:inventory.issues,
        vault: {root: s.root, vaultId: s.vaultId},
        vaultRoot: s.root,
        vaultId: s.vaultId,
        revision: s.revision,
        positioning: s.documents
            .filter((d) => s.positioning.documentIds.includes(d.id))
            .map((d) => ({
                documentId: d.id,
                relativePath: d.relativePath,
                hash: d.hash,
                text: readBytes(s.root, d.relativePath).toString('utf8'),
            })),
        contentDirectory: source ? source.contentDirectory : null,
        content: source
            ? {
                  contentId,
                  tNumber: source.tNumber,
                  sourceDocumentId: source.document.id,
                  relativePath: source.document.relativePath,
                  hash: source.document.hash,
                  writable: source.document.writable,
                  sourceConflict: source.document.sourceConflict ?? null,
                  sourceResolution: source.sourceMissing ? 'missing' : source.sourceResolution,
                  source: {sourceId: source.document.section === 'topics' ? 'topics' : 'drafts', documentId: source.document.id, relativePath: source.document.relativePath, hash: source.document.hash},
                  sourceCandidates: source.sourceCandidates ?? [],
                  evidence: source.evidence ?? [],
                  creationDocuments: source.creationDocuments ?? [],
                  summaryOnly: !!source.summaryOnly,
                  recorded: !!source.recorded,
                  published: !!source.published,
                  readOnlyReason: source.document.sourceConflict ?? (source.sourceMissing
                      ? '原位来源缺失，等待恢复'
                      : source.document.writable
                        ? null
                        : source.document.editAdapter === 'creation-document' ? '完整创作页通过受控字段编辑，正文仅为摘要' : '当前来源格式暂只读'),
                  sourceMissing: !!source.sourceMissing,
                  relatedDocuments: source.documents.map((d) => ({
                      documentId: d.id,
                      relativePath: d.relativePath,
                      hash: d.hash,
                  })),
              }
            : null,
        privacy: '定位仅用于当前助手任务上下文；不得自动转发给外部采集服务',
    };
}

export function readVaultTaskContext(runtimeRoot, contentId = null) {
    const binding = bindingForRuntime(runtimeRoot);
    if (!binding) return null;
    return withVaultReadLock(binding.vaultRoot, () => readVaultTaskContextUnlocked(runtimeRoot, contentId));
}

export function queryVaultMutation(runtimeRoot, mutationId) {
    const b = vaultState(runtimeRoot),
        mid = mutationID({mutationId}),
        relative = `.workbench/mutations/${mid}.json`;
    const indexed = `${PENDING_DIRECTORY}/${mid}.json`;
    if (!exists(b.root, relative) && !exists(b.root, indexed)) return null;
    const r = exists(b.root, relative) ? json(b.root, relative) : readPending(b.root, `${mid}.json`, pendingIdentity(b.root));
    if (
        r.format !== 'nova-vault-mutation' ||
        r.mutationId !== mid ||
        !['pending', 'committed'].includes(r.status) ||
        !r.request ||
        digest(JSON.stringify(r.request)) !== r.requestHash
    )
        fail('CORRUPT', '知识事务回执校验失败');
    return {
        result: r.result ?? (r.action === 'trash' ? {trashed: true} : null),
        requestHash: r.requestHash,
        request: r.request,
        status: r.status,
    };
}

export function resumeVaultMutation(runtimeRoot, mutationId) {
    const b = vaultState(runtimeRoot);
    mutationID({mutationId});
    withVaultLock(b.root, () => recoverVault(b.root));
    return queryVaultMutation(runtimeRoot, mutationId);
}

/** Only a lock-protected absence is proof that this source mutation never wrote. */
export function resolveVaultMutation(runtimeRoot, mutationId) {
    const mid = mutationID({mutationId});
    try {
        const binding = vaultState(runtimeRoot);
        return withVaultLock(binding.root, () => {
            vaultState(runtimeRoot);
            recoverVault(binding.root);
            const location = `.workbench/mutations/${mid}.json`;
            if (!exists(binding.root, location)) {
                vaultState(runtimeRoot);
                return {state: 'missing'};
            }
            const receipt = queryVaultMutation(runtimeRoot, mid);
            if (receipt.status === 'pending') {
                applyReceipt(binding.root, json(binding.root, location));
                clearPending(binding.root, mid);
            }
            const completed = queryVaultMutation(runtimeRoot, mid);
            vaultState(runtimeRoot);
            return completed?.status === 'committed'
                ? {state: 'committed', result: completed.result}
                : {state: 'uncertain'};
        });
    } catch {
        return {state: 'uncertain'};
    }
}
