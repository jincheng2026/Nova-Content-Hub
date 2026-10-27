import path from 'node:path';
import {atomic, contentSources, digest, fail, htmlBody, json, mkdir, readBytes, readVaultDocument, readVaultSnapshot, runMutation, safe, writeJSON} from './core.mjs';
const INDEX = '.workbench/current-drafts.json';
const validHash = value => typeof value === 'string' && (/^[a-f0-9]{64}$/).test(value);
function exists(root, relative) {
    try {
        safe(root, relative);
        return true;
    } catch (error) {
        if (error.code === 'ENOENT') return false;
        throw error;
    }
}
function selections(root) {
    if (!exists(root, INDEX)) return {
        format: 'nova-vault-current-drafts',
        schemaVersion: 1,
        contents: {}
    };
    const value = json(root, INDEX);
    if (value.format !== 'nova-vault-current-drafts' || value.schemaVersion !== 1 || !value.contents || Array.isArray(value.contents) || typeof value.contents !== 'object') fail('CORRUPT', '当前工作稿入口损坏');
    return value;
}
function overviewRow(snapshot, tNumber) {
    const overview = snapshot.documents.find(document => document.relativePath === '05_内容草稿/00_草稿总览.md');
    return overview ? readBytes(snapshot.root, overview.relativePath).toString('utf8').split('\n').find(line => new RegExp(`^\\|\\s*${tNumber}\\s*\\|`).test(line)) ?? '' : '';
}
function overviewSource(snapshot, item, row) {
    const docs = snapshot.documents.filter(document => document.contentId === item.contentId);
    if (/创作页\]\(http/.test(row) && /创作页[^|]*·[^|]*工作稿/.test(row)) return docs.find(document => document.format === 'html' && /创作页/.test(document.title)) ?? null;
    for (const match of row.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)) {
        if (!/稿|提词|创作页/.test(match[1])) continue;
        let relative;
        try { relative = decodeURIComponent(path.posix.normalize(`05_内容草稿/${match[2]}`)); } catch { continue; }
        const document = docs.find(document => document.relativePath === relative);
        if (document) return document;
    }
    return /创作页\]\(http/.test(row) ? docs.find(document => document.format === 'html' && /创作页/.test(document.title)) ?? null : null;
}
export function currentWorkingDraft(snapshot, contentId) {
    const item = selections(snapshot.root).contents[contentId];
    if (!item) return null;
    if (item.contentId !== contentId || typeof item.tNumber !== 'string' || typeof item.relativePath !== 'string' || typeof item.originalPath !== 'string' || !validHash(item.originalHash)) fail('CORRUPT', '当前工作稿登记无效');
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(item.mutationId ?? '')) fail('CORRUPT', '当前工作稿事务标识无效');
    const receipt = json(snapshot.root, `.workbench/mutations/${item.mutationId}.json`);
    if (receipt.format !== 'nova-vault-mutation' || receipt.mutationId !== item.mutationId || receipt.action !== 'working-draft' || !['pending', 'committed'].includes(receipt.status) || receipt.originalPath !== item.originalPath || receipt.originalHash !== item.originalHash || receipt.result?.document?.relativePath !== item.relativePath || receipt.result?.document?.contentId !== contentId || digest(JSON.stringify(receipt.request)) !== receipt.requestHash) fail('CORRUPT', '当前工作稿缺少对应有效事务');
    // Merely writing the planned target must never silently replace the old HTML.
    const currentPath = receipt.status === 'committed' ? item.relativePath : item.originalPath;
    const doc = snapshot.documents.find(d => d.relativePath === currentPath && d.contentId === contentId && d.tNumber === item.tNumber);
    if (!doc) {
        if (!snapshot.issues.some(issue => issue.code === 'SOURCE_MISSING' && issue.relativePath === currentPath)) snapshot.issues.push({
            code: 'SOURCE_MISSING',
            message: '已登记的当前工作稿缺失或不可读取；请恢复该文件，未改回旧 HTML',
            relativePath: currentPath
        });
        return undefined;
    }
    if (receipt.status === 'pending') return {...doc, pendingWorkingDraftPath: item.relativePath};
    const row = overviewRow(snapshot, item.tNumber);
    if (!validHash(item.overviewRowHash) || digest(row) !== item.overviewRowHash) {
        const declared = overviewSource(snapshot, item, row);
        if (declared && ![item.originalPath, item.relativePath].includes(declared.relativePath)) {
            const message = `${item.tNumber} 的总览已明确指向另一稿：${declared.relativePath}。已保留登记工作稿和原 HTML；请核对并恢复一致的入口后继续写入。`;
            if (!snapshot.issues.some(issue => issue.code === 'CURRENT_SOURCE_CONFLICT' && issue.relativePath === item.relativePath)) snapshot.issues.push({code: 'CURRENT_SOURCE_CONFLICT', message, relativePath: item.relativePath});
            return {...doc, writable: false, sourceConflict: message};
        }
    }
    return doc;
}
function extract(text) {
    const matches = [...text.matchAll(/<script\b(?=[^>]*\bid=["']jc-doc["'])(?=[^>]*\btype=["']application\/json["'])[^>]*>[\s\S]*?<\/script>/gi)];
    if (matches.length !== 1) return null;
    const body = htmlBody(text);
    return typeof body === 'string' && body.trim() ? body : null;
}
export function workingDraftAvailable(snapshot, document, text) {
    if (document.format !== 'html' || document.section !== 'drafts' || !document.contentId || !document.tNumber || extract(text) === null || selections(snapshot.root).contents[document.contentId]) return false;
    try {
        return contentSources(snapshot).some(source => source.contentId === document.contentId && source.document.id === document.id);
    } catch {
        return false;
    }
}
function managedText(before, entries) {
    const start = '<!-- nova-workbench:current-drafts:start -->', end = '<!-- nova-workbench:current-drafts:end -->';
    const lines = ['## 工作台当前稿', '', ...Object.values(entries).map(item => `${item.tNumber}：当前稿 [${item.relativePath}](${encodeURI(item.relativePath)})；历史原件 [${item.originalPath}](${encodeURI(item.originalPath)})。`), ''];
    const block = `${start}\n${lines.join('\n')}\n${end}`;
    const starts = [...before.matchAll(/<!-- nova-workbench:current-drafts:start -->/g)], ends = [...before.matchAll(/<!-- nova-workbench:current-drafts:end -->/g)];
    if (starts.length !== ends.length || starts.length > 1 || starts.length && starts[0].index > ends[0].index) fail('CONFLICT', '当前稿导航管理区不完整，请保留原文后修复');
    return starts.length ? before.slice(0, starts[0].index) + block + before.slice(ends[0].index + end.length) : `${before}${before.endsWith('\n') ? '' : '\n'}\n${block}\n`;
}
function plannedWrite(root, relativePath, text, before = undefined) {
    if (before === undefined) before = exists(root, relativePath) ? readBytes(root, relativePath) : null;
    return {
        relativePath,
        beforeHash: before === null ? null : digest(before),
        after: Buffer.from(text).toString('base64')
    };
}
/** Copy an identified human draft; source identities come only from the bound Vault. */
export function createVaultWorkingDraft(runtimeRoot, input, options) {
    if (!input || Object.keys(input).length !== 2 || Object.keys(input).some(k => !['id', 'expectedHash'].includes(k)) || typeof input.id !== 'string' || !(/^doc-[a-f0-9]{32}$/).test(input.id) || !validHash(input.expectedHash)) fail('INVALID_INPUT', '建立工作稿参数无效');
    const receipt = runMutation(runtimeRoot, {
        action: 'working-draft',
        input
    }, options, () => {
        const snapshot = readVaultSnapshot(runtimeRoot), {document} = readVaultDocument(runtimeRoot, input.id);
        if (document.hash !== input.expectedHash) fail('CONFLICT', '原 HTML 已变化，请重新读取后建立工作稿');
        const original = readBytes(snapshot.root, document.relativePath).toString('utf8'), body = extract(original);
        if (!workingDraftAvailable(snapshot, document, original) || body === null) fail('INVALID_INPUT', '仅支持已识别且仍为当前稿的 jc-doc 人工稿');
        const relativePath = `${path.posix.dirname(document.relativePath)}/工作稿.md`;
        if (exists(snapshot.root, relativePath)) fail('CONFLICT', '工作稿目标已有文件，未覆盖；请先核对现有稿件');
        const index = selections(snapshot.root);
        if (index.contents[document.contentId]) fail('CONFLICT', '此内容已有登记工作稿');
        index.contents[document.contentId] = {
            contentId: document.contentId,
            tNumber: document.tNumber,
            relativePath,
            originalPath: document.relativePath,
            originalHash: document.hash,
            mutationId: options.mutationId,
            overviewRowHash: digest(overviewRow(snapshot, document.tNumber))
        };
        const writes = [plannedWrite(snapshot.root, relativePath, body)];
        for (const name of ['SOURCE_OF_TRUTH.md', 'README.md']) {
            const before = exists(snapshot.root, name) ? readBytes(snapshot.root, name) : null;
            writes.push(plannedWrite(snapshot.root, name, managedText(before?.toString('utf8') ?? '', index.contents), before));
        }
        // The entry is staged first and becomes current only with a committed receipt.
        writes.push(plannedWrite(snapshot.root, INDEX, `${JSON.stringify(index, null, 2)}\n`));
        return {
            action: 'working-draft',
            originalPath: document.relativePath,
            originalHash: document.hash,
            writes,
            result: {
                document: {
                    ...document,
                    id: `doc-${digest(relativePath).slice(0, 32)}`,
                    relativePath,
                    title: document.tNumber,
                    format: 'markdown',
                    writable: true,
                    hash: digest(body),
                    bytes: Buffer.byteLength(body)
                },
                text: body
            }
        };
    });
    return receipt.result;
}
/** Replay the frozen plan under the existing Vault journal and lock. */
export function applyWorkingDraftReceipt(root, receipt) {
    if (receipt.format !== 'nova-vault-mutation' || receipt.action !== 'working-draft' || !(/^[A-Za-z0-9_-]{8,100}$/).test(receipt.mutationId ?? '') || !validHash(receipt.requestHash) || digest(JSON.stringify(receipt.request)) !== receipt.requestHash || receipt.request?.action !== 'working-draft' || !validHash(receipt.originalHash) || !Array.isArray(receipt.writes) || receipt.writes.length !== 4) fail('CORRUPT', '工作稿事务无效');
    if (receipt.request.input?.id !== `doc-${digest(receipt.originalPath).slice(0, 32)}` || receipt.request.input?.expectedHash !== receipt.originalHash || !receipt.originalPath.startsWith('05_内容草稿/') || !receipt.result?.document?.contentId) fail('CORRUPT', '工作稿事务来源无效');
    let sourceBytes;
    try {
        sourceBytes = readBytes(root, receipt.originalPath);
    } catch (error) {
        if (['ENOENT', 'INVALID_INPUT', 'EISDIR', 'ENOTDIR'].includes(error.code)) fail('CONFLICT', '原 HTML 已移动或类型变化，请恢复原件后重试');
        throw error;
    }
    if (digest(sourceBytes) !== receipt.originalHash) fail('CONFLICT', '原 HTML 在建立期间变化，已保留现有文件，请核对后重试');
    const registered = selections(root).contents[receipt.result.document.contentId];
    if (registered) {
        if (registered.mutationId !== receipt.mutationId || registered.relativePath !== receipt.result.document.relativePath || registered.originalPath !== receipt.originalPath) fail('CONFLICT', '当前稿入口已变化，未覆盖');
    }
    const snapshot = readVaultSnapshot(path.join(root, '.workbench/runtime'));
    // Ignore this intent's staged entry and target when checking today's source selection.
    snapshot.documents = snapshot.documents.filter(document => document.relativePath !== receipt.result.document.relativePath);
    const current = contentSources(snapshot, receipt.result.document.contentId).find(source => source.contentId === receipt.result.document.contentId);
    if (!current || current.document.id !== receipt.request.input.id || current.document.hash !== receipt.originalHash || current.tNumber !== receipt.result.document.tNumber) fail('CONFLICT', '内容的当前来源或 T 编号已变化，请核对后重试');
    const expectedPaths = [`${path.posix.dirname(receipt.originalPath)}/工作稿.md`, 'SOURCE_OF_TRUTH.md', 'README.md', INDEX];
    const pending = receipt.writes.map((write, index) => {
        if (write.relativePath !== expectedPaths[index] || !(write.beforeHash === null || validHash(write.beforeHash)) || typeof write.after !== 'string' || write.after.length > 12 * 1024 * 1024) fail('CORRUPT', '工作稿事务目标或内容无效');
        const bytes = Buffer.from(write.after, 'base64');
        if (bytes.toString('base64') !== write.after || bytes.length > 8 * 1024 * 1024) fail('CORRUPT', '工作稿事务编码无效');
        let current;
        try {
            current = exists(root, write.relativePath) ? digest(readBytes(root, write.relativePath)) : null;
        } catch (error) {
            if (['ENOENT', 'INVALID_INPUT', 'EISDIR', 'ENOTDIR'].includes(error.code)) fail('CONFLICT', '工作稿或导航类型已变化，未覆盖');
            throw error;
        }
        if (current !== write.beforeHash && current !== digest(bytes)) fail('CONFLICT', '工作稿或导航在建立期间被修改；已保留，未覆盖');
        return {
            write,
            bytes,
            current
        };
    });
    // Stage the known receipt identity before publishing any discoverable MD target.
    const staged = [...pending.slice(-1), ...pending.slice(0, -1)];
    for (const {write, bytes, current} of staged) if (current !== digest(bytes)) {
        mkdir(root, path.posix.dirname(write.relativePath));
        atomic(root, write.relativePath, bytes, write.beforeHash);
    }
    receipt.status = 'committed';
    writeJSON(root, `.workbench/mutations/${receipt.mutationId}.json`, receipt);
}
