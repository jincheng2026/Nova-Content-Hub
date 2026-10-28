import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {verifyBoundRoot} from './bound-reader.mts';
import {bindingForRuntime, identity, safe} from '../../../plugin-src/src/lib/vault/core.mjs';
import {readBoundSourceCatalog, resolveSource, readSourceMap} from '../../../plugin-src/src/lib/vault/source-map.mjs';
import {validateImportedRaster} from '../../../plugin-src/src/lib/image-validation/index.mjs';
import type {VaultDocument} from '../shared/vault-contracts.ts';
import type {LibraryBinding} from '../shared/contracts.ts';
import {documentReferenceTokens, DOCUMENT_REFERENCE_LIMIT, DOCUMENT_EMBED_DEPTH} from '../shared/document-reading-contracts.ts';
import type {DocumentView, DocumentViewInput, DocumentReference, DocumentReferenceInput, DocumentReferenceResult} from '../shared/document-reading-contracts.ts';

/** Native-only registration. Never deserialize this context from renderer input. */
export type RegisteredDocumentSource = {vaultRoot: string; sourceId: string; relativePath: string};
type Context = RegisteredDocumentSource & {bindingKey: string; fragment: string; ancestry: string[]; depth: number};
type LocalTarget = {relativePath: string; hash: string; fragment: string};
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const fail = (code: string, message: string): never => {throw Object.assign(new Error(message), {code});};
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const exact = (value: unknown, fields: string[]) => record(value) && Object.keys(value).every(key => fields.includes(key)) && fields.filter(key => key !== 'intent').every(key => key in value);
const fingerprint = (binding: LibraryBinding) => hash(JSON.stringify([binding.root, binding.libraryId, binding.rootIdentity.dev, binding.rootIdentity.ino]));
const visible = (relative: string) => !!relative && !relative.startsWith('/') && !/[\\\u0000-\u001f\u007f:%]/.test(relative) && relative.split('/').every(part => !!part && !part.startsWith('.') && !/^(?:node_modules|skills|必要备份|备份|backups|系统（别动）)$/i.test(part));
const textTypes = new Set(['.md', '.markdown', '.txt']);
const imageTypes = new Set(['.png', '.jpeg', '.jpg', '.gif', '.webp']);
const inputOK = (input: unknown): input is DocumentViewInput => record(input) && (exact(input, ['documentId', 'expectedHash']) || exact(input, ['documentId', 'expectedHash', 'scope'])) && (input.scope === undefined || typeof input.scope === 'string' && /^[a-f0-9]{64}$/.test(input.scope)) && typeof input.documentId === 'string' && /^(?:doc-|source-|reading-)[a-f0-9]{32,64}$/.test(input.documentId) && typeof input.expectedHash === 'string' && /^[a-f0-9]{64}$/.test(input.expectedHash);
function external(value: string): string | null {
    if (!/^https?:\/\//i.test(value) || /[\u0000-\u0020\u007f]/.test(value) || value.length > 4096) return null;
    try {const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? value : null;} catch {return null;}
}
function local(from: string, value: string): {relativePath: string; fragment: string; basename: string | null} | null {
    if (!value || value !== value.trim() || value.length > 4096 || /[\\\u0000-\u001f\u007f]/.test(value) || value.startsWith('/') || /^[a-z][a-z\d+.-]*:/i.test(value) || value.includes('?')) return null;
    const at = value.indexOf('#'), original = at < 0 ? value : value.slice(0, at);
    let fragment = '', parts: string[];
    try {fragment = at < 0 ? '' : decodeURIComponent(value.slice(at + 1)); parts = original.split('/').map(segment => decodeURIComponent(segment));} catch {return null;}
    if (parts.some(part => /[/\\%:\u0000-\u001f\u007f]/.test(part)) || /[\u0000-\u001f\u007f]/.test(fragment)) return null;
    const pathname = parts.join('/'), relativePath = pathname ? path.posix.normalize(path.posix.join(path.posix.dirname(from), pathname)) : from;
    if (!visible(relativePath)) return null;
    return {relativePath, fragment, basename: pathname && !pathname.includes('/') && !pathname.startsWith('.') ? pathname : null};
}
function ancestors(directory: string) {
    const absolute = path.resolve(directory); let current = path.parse(absolute).root;
    for (const part of absolute.slice(current.length).split(path.sep).filter(Boolean)) {current = path.join(current, part); if (fs.lstatSync(current).isSymbolicLink()) fail('UNSAFE_PATH', '来源路径不能经过符号链接。');}
}
/** A bounded, stable descriptor read also detects file replacement during the read. */
function bytes(root: string, relative: string, control = false): Buffer {
    if (!visible(relative) && !(control && /^\.workbench\/(?:pending-mutations-index\.json|mutations\/[a-zA-Z0-9_-]+\.json)$/.test(relative))) return fail('UNSAFE_PATH', '引用路径无效或超出来源。');
    ancestors(root); const filename = safe(root, relative), before = fs.lstatSync(filename, {bigint: true}), limit = 8 * 1024 * 1024;
    if (!before.isFile() || before.nlink !== 1n || before.size > BigInt(limit)) fail('UNAVAILABLE', '引用不是可读普通文件、含硬链接或超过 8 MiB。');
    const fd = fs.openSync(filename, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0) | (fs.constants.O_NONBLOCK ?? 0));
    try {
        const opened = fs.fstatSync(fd, {bigint: true}), buffer = Buffer.alloc(Number(before.size) + 1); let length = 0;
        while (length < buffer.length) {const amount = fs.readSync(fd, buffer, length, buffer.length - length, null); length += amount; if (!amount) break;}
        const after = fs.lstatSync(safe(root, relative), {bigint: true}), finished = fs.fstatSync(fd, {bigint: true});
        if ([opened, finished, after].some(stat => stat.dev !== before.dev || stat.ino !== before.ino || stat.nlink !== 1n || stat.size !== before.size || stat.mtimeNs !== before.mtimeNs || stat.ctimeNs !== before.ctimeNs) || length !== Number(before.size)) fail('CONFLICT', '引用文件在读取时变化。');
        return buffer.subarray(0, length);
    } finally {fs.closeSync(fd);}
}
function utf8(data: Buffer): string {try {const text = new TextDecoder('utf-8', {fatal: true}).decode(data); if (text.includes('\0')) fail('UNSUPPORTED', '文本包含二进制字节。'); return text;} catch {return fail('UNSUPPORTED', '引用不是可读取的 UTF-8 文本。');}}
function selectFragment(text: string, fragment: string): string {
    if (!fragment) return text;
    const lines = text.split(/\r\n?|\n/), matches: {line: number; level: number}[] = []; let fence: string | null = null;
    for (let i = 0; i < lines.length; i++) {
        const marker = lines[i].match(/^ {0,3}(`{3,}|~{3,})/);
        if (marker) {if (!fence) fence = marker[1]; else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null; continue;}
        if (fence) continue;
        if (fragment.startsWith('^')) {if (lines[i].match(/(?:^|\s)\^([a-zA-Z0-9_-]+)\s*$/)?.[1] === fragment.slice(1)) matches.push({line: i, level: 0});}
        else {const heading = lines[i].match(/^ {0,3}(#{1,6})\s+(.+?)\s*$/); if (heading && heading[2].replace(/\s+#+\s*$/, '') === fragment) matches.push({line: i, level: heading[1].length});}
    }
    if (matches.length !== 1) fail(matches.length ? 'AMBIGUOUS' : 'NOT_FOUND', matches.length ? '引用标题或块标记重复，不能确定位置。' : '引用标题或块标记不存在或暂不支持。');
    const found = matches[0];
    if (found.level === 0) {let start = found.line; while (start > 0 && lines[start - 1].trim() && !/^ {0,3}#{1,6}\s/.test(lines[start - 1])) start--; return lines.slice(start, found.line + 1).join('\n');}
    let end = found.line + 1;
    fence = null;
    for (; end < lines.length; end++) {
        const marker = lines[end].match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
        if (marker) {if (!fence) fence = marker[1]; else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = null; continue;}
        if (fence) continue;
        const heading = lines[end].match(/^ {0,3}(#{1,6})\s/); if (heading && heading[1].length <= found.level) break;
    }
    return lines.slice(found.line, end).join('\n').trimEnd();
}
const NATIVE_VAULT_SOURCE = 'native:vault';
type ReadingCatalog = {files: {relativePath: string}[]; issues: {relativePath?: string; code: string; message: string}[]};
/** Native fallback for original files outside a declared source (for example profile).
 * The selected Vault is the boundary; hidden/framework/backup trees never enter it.
 * Match core doc IDs without loading its projection or recovery machinery. */
function vaultReadingCatalog(root: string, budget = {remaining: 20_000}): ReadingCatalog {
    ancestors(root); const before = JSON.stringify(identity(root)), files: ReadingCatalog['files'] = [], issues: ReadingCatalog['issues'] = [];
    function walk(relative = '', depth = 0) {
        if (depth > 24) fail('UNAVAILABLE', '原文目录层级超过阅读上限。');
        const directory = relative ? safe(root, relative) : root;
        for (const entry of fs.readdirSync(directory, {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name))) {
            if (--budget.remaining < 0) fail('UNAVAILABLE', '原文目录项目累计超过 20000 项阅读上限，部分来源尚未载入。');
            const filename = relative ? `${relative}/${entry.name}` : entry.name;
            if (!visible(filename)) continue;
            if (entry.isSymbolicLink()) {issues.push({relativePath: filename, code: 'SYMLINK_REJECTED', message: '符号链接不能进入原文阅读。'}); continue;}
            if (entry.isDirectory()) {walk(filename, depth + 1); continue;}
            if (!entry.isFile()) continue;
            const stat = fs.lstatSync(safe(root, filename));
            if (stat.nlink !== 1 || stat.size > 8 * 1024 * 1024) {issues.push({relativePath: filename, code: 'UNAVAILABLE', message: '文件含硬链接或超过 8 MiB。'}); continue;}
            files.push({relativePath: filename});
        }
    }
    walk(); if (JSON.stringify(identity(root)) !== before) fail('CONFLICT', '原文目录身份在读取时变化。');
    return {files, issues};
}
/** Opaque binding discriminator prevents an old page being interpreted in another library. */
export function documentReadingScope(binding: LibraryBinding): string {
    verifyBoundRoot(binding); const vault = bindingForRuntime(binding.root);
    if (!vault) return fail('NOT_READY', '当前库没有原位文档来源。');
    return hash(JSON.stringify([fingerprint(binding), vault.vaultId, vault.vaultRoot, vault.rootIdentity]));
}
/** Only native code calls this resolver: renderer IDs cannot register a new root/path. */
export function resolveRegisteredDocument(binding: LibraryBinding, documentId: string): RegisteredDocumentSource {
    documentReadingScope(binding); const vault = bindingForRuntime(binding.root)!;
    if (/^doc-[a-f0-9]{32}$/.test(documentId)) {
        const matches = vaultReadingCatalog(vault.vaultRoot).files.filter(file => 'doc-' + hash(file.relativePath).slice(0, 32) === documentId);
        if (matches.length !== 1) return fail('NOT_FOUND', '原文没有唯一可读的当前来源，请刷新目录或恢复原件。');
        const relativePath = matches[0].relativePath;
        const sources = readSourceMap(vault.vaultRoot).sources.filter(source => source.mode === 'internal').map(entry => resolveSource(vault.vaultRoot, entry.id)).filter(source => {
            const prefix = path.relative(vault.vaultRoot, source.root).split(path.sep).join('/');
            return !!prefix && visible(prefix) && relativePath.startsWith(prefix + '/');
        });
        if (sources.length > 1) return fail('AMBIGUOUS', '原文同时落在多个来源绑定中，请核对来源配置。');
        if (!sources.length) return {vaultRoot: vault.vaultRoot, sourceId: NATIVE_VAULT_SOURCE, relativePath};
        const source = sources[0], prefix = path.relative(vault.vaultRoot, source.root).split(path.sep).join('/');
        return {vaultRoot: vault.vaultRoot, sourceId: source.id, relativePath: relativePath.slice(prefix.length + 1)};
    }
    if (/^source-[a-f0-9]{32}$/.test(documentId)) {
        const matches: RegisteredDocumentSource[] = []; let unavailable = false; const budget = {remaining: 20_000};
        for (const entry of readSourceMap(vault.vaultRoot).sources) {
            if (--budget.remaining < 0) fail('UNAVAILABLE', '来源目录累计超过 20000 项阅读上限。');
            try {
            const source = resolveSource(vault.vaultRoot, entry.id);
            if (!source.available) {unavailable = true; continue;}
            const catalog = vaultReadingCatalog(source.root, budget);
            if (catalog.issues.some(issue => !issue.relativePath)) {unavailable = true; continue;}
            for (const file of catalog.files) if (visible(file.relativePath) && 'source-' + hash(entry.id + ':' + file.relativePath).slice(0, 32) === documentId) matches.push({vaultRoot: vault.vaultRoot, sourceId: entry.id, relativePath: file.relativePath});
            } catch {unavailable = true;}
        }
        if (matches.length === 1) return matches[0];
        if (unavailable) fail('SOURCE_NOT_AVAILABLE', '已绑定来源暂不可完整读取，请恢复后重试。');
    }
    return fail('NOT_FOUND', '当前知识库没有这个已登记的原文来源。');
}
/** Existing reveal action resolves a registered linked Markdown/text identity;
 * the absolute path stays in native code and is never a renderer capability. */
export function registeredLinkedDocumentLocation(binding: LibraryBinding, documentId: string): string {
    const context = resolveRegisteredDocument(binding, documentId), source = resolveSource(context.vaultRoot, context.sourceId);
    if (!/^source-[a-f0-9]{32}$/.test(documentId) || source.mode !== 'linked' || !source.available || !textTypes.has(path.posix.extname(context.relativePath).toLowerCase())) fail('NOT_FOUND', '没有可定位的已登记关联原文。');
    utf8(bytes(source.root, context.relativePath));
    resolveSource(context.vaultRoot, context.sourceId); documentReadingScope(binding);
    return safe(source.root, context.relativePath);
}
/** Append only already-linked UTF-8 originals to the ordinary directory. Their
 * source IDs exactly match the resource projection identity, without projecting. */
export function registeredLinkedDocuments(binding: LibraryBinding, {maxEntries = 20_000}: {maxEntries?: number} = {}): {documents: VaultDocument[]; issues: {code: string; message: string; relativePath?: string}[]} {
    documentReadingScope(binding); const vault = bindingForRuntime(binding.root)!, documents: VaultDocument[] = [], issues: {code: string; message: string; relativePath?: string}[] = [];
    if (!Number.isInteger(maxEntries) || maxEntries < 0 || maxEntries > 20_000) fail('INVALID_INPUT', '关联来源阅读数量上限无效。');
    const budget = {remaining: maxEntries};
    for (const entry of readSourceMap(vault.vaultRoot).sources.filter(source => source.mode === 'linked')) {
        const documentStart = documents.length;
        try {
            if (--budget.remaining < 0) {issues.push({code: 'SOURCE_LIMIT', message: '关联来源目录累计超过 20000 项上限，其余来源尚未载入。'}); break;}
            const source = resolveSource(vault.vaultRoot, entry.id);
            if (!source.available) {issues.push({code: 'SOURCE_NOT_AVAILABLE', message: '已绑定来源暂不可用，不代表资料为空。', relativePath: entry.id}); continue;}
            const catalog = vaultReadingCatalog(source.root, budget);
            issues.push(...catalog.issues.map(issue => ({...issue, relativePath: issue.relativePath ? `${entry.id}/${issue.relativePath}` : entry.id})));
            for (const file of catalog.files) {
                if (!visible(file.relativePath) || !textTypes.has(path.posix.extname(file.relativePath).toLowerCase())) continue;
                try {
                    const data = bytes(source.root, file.relativePath); utf8(data);
                    documents.push({id: 'source-' + hash(entry.id + ':' + file.relativePath).slice(0, 32), section: entry.role === 'benchmark-accounts' ? 'accounts' : entry.role === 'prompts' ? 'prompts' : 'materials', title: path.posix.basename(file.relativePath, path.posix.extname(file.relativePath)), relativePath: `${entry.id}/${file.relativePath}`, hash: hash(data), format: /\.(?:md|markdown)$/i.test(file.relativePath) ? 'markdown' : 'text', bytes: data.length, writable: false, contentId: null, tNumber: null});
                } catch (error) {issues.push({code: 'SOURCE_NOT_AVAILABLE', message: error instanceof Error ? error.message : '关联原文暂不可读。', relativePath: `${entry.id}/${file.relativePath}`});}
            }
            const after = resolveSource(vault.vaultRoot, entry.id);
            if (!after.available || after.root !== source.root || JSON.stringify(identity(source.root)) !== JSON.stringify(source.rootIdentity)) fail('CONFLICT', '关联来源目录身份在读取时变化。');
        } catch (error) {documents.splice(documentStart);issues.push({code: 'SOURCE_NOT_AVAILABLE', message: error instanceof Error ? error.message : '关联来源暂不可读。', relativePath: entry.id}); if (budget.remaining < 0) break;}
    }
    documentReadingScope(binding);
    return {documents, issues};
}
/** No recovery, projection, store mutation, browser launch, or arbitrary file protocol. */
export function createDocumentReadingService(options: {resolveDocument(binding: LibraryBinding, documentId: string): RegisteredDocumentSource} = {resolveDocument: resolveRegisteredDocument}) {
    const registered = new Map<string, Context>(), sourceRoots = new Map<string, string>();
    let activeReads = 0; const waitingReads: (() => void)[] = [];
    async function acquireRead() {
        if (activeReads < 2) {activeReads++; return;}
        if (waitingReads.length >= DOCUMENT_REFERENCE_LIMIT) fail('BUSY', '引用读取已达并发队列上限，请稍后重试。');
        await new Promise<void>(resolve => waitingReads.push(resolve));
    }
    function releaseRead() {const next = waitingReads.shift(); if (next) next(); else activeReads--;}
    function check(binding: LibraryBinding, context?: Context) {
        verifyBoundRoot(binding); const vault = bindingForRuntime(binding.root);
        if (!vault) return fail('NOT_READY', '当前库没有已绑定的原文来源。');
        if (context && (context.bindingKey !== fingerprint(binding) || vault.vaultRoot !== context.vaultRoot)) fail('CONFLICT', '阅读绑定已变化，请重新打开原文。');
        ancestors(vault.vaultRoot);
        if (fs.existsSync(safe(binding.root, '系统（别动）/库锁', true))) fail('PENDING', '内容库变更正在执行或待核验，请稍后重新阅读。');
        if (fs.readdirSync(safe(binding.root, '系统（别动）/事务/待恢复')).length) fail('PENDING', '内容库有待恢复的变更，请先处理后重新阅读。');
        for (const relative of ['.workbench/mutation-lock', '.workbench/pending-mutations']) {
            const filename = safe(vault.vaultRoot, relative, true);
            if (fs.existsSync(filename) && (relative.endsWith('mutation-lock') || fs.readdirSync(filename).length)) fail('PENDING', '知识库有待核验或待恢复的变更，请先处理后重新阅读。');
        }
        const marker = safe(vault.vaultRoot, '.workbench/pending-mutations-index.json', true);
        if (!fs.existsSync(marker)) {
            const legacy = safe(vault.vaultRoot, '.workbench/mutations', true);
            if (fs.existsSync(legacy)) {
                const names = fs.readdirSync(legacy);
                if (names.length > 20_000) fail('PENDING', '旧事务目录过大，请先核验后重新阅读。');
                for (const name of names) {
                    const receipt = JSON.parse(bytes(vault.vaultRoot, `.workbench/mutations/${name}`, true).toString('utf8')) as {status?: string};
                    if (receipt.status !== 'committed') fail('PENDING', '知识库有旧版待恢复事务，请先处理后重新阅读。');
                }
            }
        }
        const source = context ? context.sourceId === NATIVE_VAULT_SOURCE ? {id: NATIVE_VAULT_SOURCE, mode: 'internal' as const, root: vault.vaultRoot, available: true} : resolveSource(vault.vaultRoot, context.sourceId) : null;
        if (source) {
            if (!source.available) fail('SOURCE_NOT_AVAILABLE', '已绑定来源暂不可读，请恢复后重新打开。');
            ancestors(source.root); const key = fingerprint(binding) + ':' + context!.sourceId, stamp = JSON.stringify([source, identity(source.root)]), previous = sourceRoots.get(key);
            if (previous && previous !== stamp) fail('CONFLICT', '来源目录身份或绑定已变化，请重新打开阅读服务。');
            if (sourceRoots.size >= 256 && !sourceRoots.has(key)) fail('BUSY', '来源阅读会话已达上限，请重新打开阅读服务。');
            sourceRoots.set(key, stamp);
        }
        return source;
    }
    function contextFor(binding: LibraryBinding, documentId: string): Context {
        const cached = registered.get(documentId);
        if (cached) {check(binding, cached); return cached;}
        check(binding); const source = options.resolveDocument(binding, documentId), context: Context = {...source, bindingKey: fingerprint(binding), fragment: '', ancestry: [], depth: 0};
        if (!record(source) || !visible(source.relativePath) || typeof source.sourceId !== 'string' || typeof source.vaultRoot !== 'string') fail('INVALID_INPUT', '文档来源登记无效。');
        check(binding, context); return context;
    }
    function build(binding: LibraryBinding, context: Context, documentId: string, expectedHash: string, onlyReference?: string) {
        const source = check(binding, context)!, catalog: ReadingCatalog = context.sourceId === NATIVE_VAULT_SOURCE ? vaultReadingCatalog(context.vaultRoot) : readBoundSourceCatalog(context.vaultRoot, {sourceId: context.sourceId}), original = bytes(source.root, context.relativePath), sourceHash = hash(original);
        if (sourceHash !== expectedHash) fail('CONFLICT', '原文版本已变化，请重新读取。');
        if (!textTypes.has(path.posix.extname(context.relativePath).toLowerCase())) fail('UNSUPPORTED', '此来源不是受支持的 Markdown 或文本。');
        const text = selectFragment(utf8(original), context.fragment), tokens = documentReferenceTokens(text), targets = new Map<string, LocalTarget | string>(), contentIdentity = hash(JSON.stringify([fingerprint(binding), context.sourceId, source.root, identity(source.root), context.relativePath])), references: DocumentReference[] = [];
        for (const [index, token] of tokens.slice(0, DOCUMENT_REFERENCE_LIMIT).entries()) {
            const ref: DocumentReference = {...token, refId: hash(JSON.stringify([contentIdentity, sourceHash, context.fragment, index, token.raw])), state: 'unsupported', targetIdentity: null, issue: '此引用类型暂不支持自动阅读；原引用已保留。'};
            if (onlyReference && ref.refId !== onlyReference) continue;
            const url = external(token.destination);
            if (url && token.kind === 'link') {ref.state = 'ready'; ref.issue = ''; ref.targetIdentity = hash(JSON.stringify([ref.refId, url])); targets.set(ref.refId, url);}
            else if (!/^https?:/i.test(token.destination)) {
                const parsed = local(context.relativePath, token.destination);
                if (parsed) {
                    let paths = catalog.files.filter(file => visible(file.relativePath)).map(file => file.relativePath), candidates: string[] = [];
                    const alternatives = path.posix.extname(parsed.relativePath) ? [parsed.relativePath] : [parsed.relativePath, parsed.relativePath + '.md', parsed.relativePath + '.markdown'];
                    const wikiName = parsed.basename && ['wiki', 'embed'].includes(token.kind);
                    candidates = wikiName ? [] : paths.filter(filename => alternatives.includes(filename));
                    if (wikiName && !catalog.issues.some(issue => !issue.relativePath)) {
                        const names = path.posix.extname(parsed.basename!) ? [parsed.basename!] : [parsed.basename + '.md', parsed.basename + '.markdown'];
                        candidates = paths.filter(filename => names.includes(path.posix.basename(filename)));
                    }
                    if (candidates.length > 1) {ref.state = 'ambiguous'; ref.issue = '存在多个同名目标，请核对完整路径。'; ref.candidates = candidates;}
                    else if (!candidates.length) {ref.state = 'missing'; ref.issue = catalog.issues.some(issue => !issue.relativePath) ? '来源目录读取不完整，请恢复来源后重试。' : '当前绑定来源中没有可读目标。';}
                    else {
                        const filename = candidates[0], extension = path.posix.extname(filename).toLowerCase();
                        if (imageTypes.has(extension) && ['image', 'embed'].includes(token.kind) || textTypes.has(extension) && token.kind !== 'image') {
                            try {
                                const data = bytes(source.root, filename), targetHash = hash(data);
                                if (textTypes.has(extension)) selectFragment(utf8(data), parsed.fragment);
                                ref.state = 'ready'; ref.issue = ''; ref.targetIdentity = hash(JSON.stringify([ref.refId, filename, targetHash, parsed.fragment, identity(source.root)]));
                                targets.set(ref.refId, {relativePath: filename, hash: targetHash, fragment: parsed.fragment});
                            } catch (error) {ref.state = 'stale'; ref.issue = error instanceof Error ? error.message : '目标暂不可读。';}
                        }
                    }
                }
            }
            references.push(ref);
        }
        check(binding, context);
        const view: DocumentView = {scope: documentReadingScope(binding), documentId, hash: sourceHash, text, references, contentIdentity, truncated: tokens.length > DOCUMENT_REFERENCE_LIMIT};
        return {view, targets, context, source};
    }
    function readDocumentView(binding: LibraryBinding, input: DocumentViewInput): DocumentView {
        if (!inputOK(input)) fail('INVALID_INPUT', '阅读请求字段无效。');
        if (input.scope !== undefined && input.scope !== documentReadingScope(binding)) fail('CONFLICT', '原文绑定的内容库已变化，请重新打开。');
        return build(binding, contextFor(binding, input.documentId), input.documentId, input.expectedHash).view;
    }
    function reference(binding: LibraryBinding, input: DocumentReferenceInput) {
        if (!(exact(input, ['documentId', 'expectedHash', 'refId', 'targetIdentity', 'intent']) || exact(input, ['documentId', 'expectedHash', 'refId', 'targetIdentity', 'intent', 'scope'])) || !inputOK({documentId: input.documentId, expectedHash: input.expectedHash}) || typeof input.refId !== 'string' || !/^[a-f0-9]{64}$/.test(input.refId) || typeof input.targetIdentity !== 'string' || !/^[a-f0-9]{64}$/.test(input.targetIdentity) || input.intent !== undefined && !['embed', 'navigate'].includes(input.intent)) fail('INVALID_INPUT', '引用请求字段无效。');
        if (input.scope !== undefined && input.scope !== documentReadingScope(binding)) fail('CONFLICT', '原文绑定的内容库已变化，请重新打开。');
        const built = build(binding, contextFor(binding, input.documentId), input.documentId, input.expectedHash, input.refId), ref = built.view.references.find(item => item.refId === input.refId);
        if (!ref || ref.state !== 'ready' || ref.targetIdentity !== input.targetIdentity) return fail('CONFLICT', '引用目标已变化或授权失效，请重新读取原文。');
        return {...built, ref, target: built.targets.get(ref.refId)!};
    }
    async function readDocumentReference(binding: LibraryBinding, input: DocumentReferenceInput): Promise<DocumentReferenceResult> {
        await acquireRead();
        try {
            const current = reference(binding, input);
            if (typeof current.target === 'string') return fail('UNSUPPORTED', '外部链接仅允许显式打开。');
            const target = current.target, data = bytes(current.source.root, target.relativePath);
            if (hash(data) !== target.hash) fail('CONFLICT', '引用目标已变化。');
            if (imageTypes.has(path.posix.extname(target.relativePath).toLowerCase())) {
                const decoded = await validateImportedRaster(data);
                reference(binding, input); // Decode is asynchronous: revoke stale source/target before returning bytes.
                return {kind: 'image', data: new Uint8Array(data), identity: current.ref.targetIdentity!, mime: `image/${decoded.format}` as 'image/png', width: decoded.width, height: decoded.height};
            }
            const contentIdentity = hash(JSON.stringify([fingerprint(binding), current.context.sourceId, current.source.root, identity(current.source.root), target.relativePath]));
            if (input.intent === 'embed' && (current.context.depth >= DOCUMENT_EMBED_DEPTH || [...current.context.ancestry, current.view.contentIdentity].includes(contentIdentity))) return {kind: 'limited', message: current.context.depth >= DOCUMENT_EMBED_DEPTH ? '嵌入已达 3 层上限，可手动打开目标。' : '检测到循环嵌入，可手动打开目标。'};
            const context: Context = {...current.context, relativePath: target.relativePath, fragment: target.fragment, ancestry: input.intent === 'embed' ? [...current.context.ancestry, current.view.contentIdentity] : [], depth: input.intent === 'embed' ? current.context.depth + 1 : 0};
            const documentId = 'reading-' + hash(JSON.stringify([context, target.hash]));
            if (registered.size >= 256 && !registered.has(documentId)) registered.delete(registered.keys().next().value!);
            registered.set(documentId, context);
            return {kind: 'document', view: build(binding, context, documentId, target.hash).view};
        } finally {releaseRead();}
    }
    function resolveExternalReference(binding: LibraryBinding, input: DocumentReferenceInput): string {
        const current = reference(binding, input);
        if (typeof current.target !== 'string' || !external(current.target)) fail('UNSUPPORTED', '此引用不是可显式打开的 HTTP(S) 文本链接。');
        return current.target as string;
    }
    return {readDocumentView, readDocumentReference, resolveExternalReference, clear() {registered.clear(); sourceRoots.clear();}};
}
