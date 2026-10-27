import fs from 'node:fs';
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
        limit = /^\.workbench\/(?:mutations\/|projection\.json$)/.test(relative)
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
    const temp = path.join(dir, `.vault-${randomUUID()}`);
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
                    if (d.format === 'html')
                        issues.push({
                            code: 'HTML_READ_ONLY',
                            message:
                                'HTML 保留原文件；复杂创作页暂只读，不能将旧 Markdown 当作当前稿覆盖',
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
                )?.[0] ?? 'materials';
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
            if (format === 'html')
                issues.push({
                    code: 'HTML_READ_ONLY',
                    message:
                        'HTML 保留原文件；复杂创作页暂只读，不能将旧 Markdown 当作当前稿覆盖',
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
export function readVaultSnapshot(runtimeRoot) {
    const binding = bindingForRuntime(runtimeRoot);
    if (!binding) return null;
    const {documents, issues} = scan(binding.vaultRoot, binding.vaultId);
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
export function readVaultDocument(runtimeRoot, id) {
    if (typeof id !== 'string' || !/^doc-[a-f0-9]{32}$/.test(id))
        fail('INVALID_INPUT', '知识文档标识无效');
    const s = readVaultSnapshot(runtimeRoot);
    if (!s) fail('NOT_READY', '当前库没有知识文件');
    const document = s.documents.find((d) => d.id === id);
    if (!document) fail('INVALID_INPUT', '知识文件不存在或已移动');
    const bytes = readBytes(s.root, document.relativePath);
    if (digest(bytes) !== document.hash)
        fail('CONFLICT', '知识文件在读取时变化');
    return {document, text: bytes.toString('utf8')};
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
function applyReceipt(root, r) {
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
export function recoverVault(root) {
    if (!exists(root, '.workbench/mutations')) return;
    for (const name of fs.readdirSync(safe(root, '.workbench/mutations'))) {
        if (!/^[a-zA-Z0-9_-]{8,100}\.json$/.test(name))
            fail('CORRUPT', '知识事务目录包含未知文件');
        const r = json(root, `.workbench/mutations/${name}`);
        if (r.status === 'pending') applyReceipt(root, r);
    }
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
    writeJSON(b.root, loc, r);
    applyReceipt(b.root, r);
    return r;
}
function withVaultLock(root, fn) {
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
        return fn();
    } finally {
        fs.unlinkSync(safe(root, '.workbench/mutation-lock/owner.json'));
        fs.rmdirSync(lock);
    }
}
function runMutation(runtimeRoot, request, options, prepare) {
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
        () => {
            const s = readVaultSnapshot(runtimeRoot),
                number = `T${String(nextTNumber(s)).padStart(3, '0')}`,
                title = input.title
                    .trim()
                    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
                    .slice(0, 60),
                folder = ['topics', 'drafts'].includes(input.section)
                    ? `${SECTIONS.drafts}/${number}_${title || '未定选题'}`
                    : SECTIONS[input.section];
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
export function htmlBody(text) {
    const match = text.match(
        /<script\b(?=[^>]*\bid=["']jc-doc["'])(?=[^>]*\btype=["']application\/json["'])[^>]*>([\s\S]*?)<\/script>/i,
    );
    if (!match) return null;
    try {
        const data = JSON.parse(match[1]);
        if (data.schema !== 1 || !Array.isArray(data.items)) return null;
        const segments = data.items.filter((i) => i.kind === 'segment');
        if (
            !segments.length ||
            !segments.every((i) => typeof i.fields?.mine === 'string')
        )
            return null;
        return segments.map((i) => i.fields.mine).join('\n\n');
    } catch {
        return null;
    }
}
function publicationStatus(snapshot, docs, tNumber) {
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
        return false;
    }
    return unique[0] === '已发布';
}
export function contentSources(snapshot) {
    const groups = new Map();
    for (const d of snapshot.documents)
        if (d.contentId && ['topics', 'drafts'].includes(d.section)) {
            const group = groups.get(d.contentId) ?? [];
            group.push(d);
            groups.set(d.contentId, group);
        }
    const overview = snapshot.documents.find(
            (d) => d.relativePath === `${SECTIONS.drafts}/00_草稿总览.md`,
        ),
        lines = overview
            ? readBytes(snapshot.root, overview.relativePath)
                  .toString('utf8')
                  .split('\n')
            : [];
    return [...groups].map(([contentId, docs]) => {
        const tNumber = docs[0].tNumber,
            line = lines.find((l) =>
                new RegExp(`^\\|\\s*${tNumber}\\s*\\|`).test(l),
            );
        let chosen = null;
        if (line) {
            if (
                /创作页\]\(http/.test(line) &&
                /创作页[^|]*·[^|]*工作稿/.test(line)
            )
                chosen = docs.find(
                    (d) => d.format === 'html' && /创作页/.test(d.title),
                );
            for (const match of line.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)) {
                let relative;
                try {
                    relative = decodeURIComponent(
                        path.posix.normalize(`${SECTIONS.drafts}/${match[2]}`),
                    );
                } catch {
                    continue;
                }
                const d = docs.find((x) => x.relativePath === relative);
                if (!chosen && d && /稿|提词|创作页/.test(match[1])) {
                    chosen = d;
                    break;
                }
            }
            if (!chosen && /创作页\]\(http/.test(line))
                chosen = docs.find(
                    (d) => d.format === 'html' && /创作页/.test(d.title),
                );
        }
        chosen ??=
            docs.find(
                (d) =>
                    d.section === 'drafts' &&
                    /^(?:定稿|最终稿|录制定稿|逐字稿|工作稿|正文|提词)/.test(
                        path.basename(d.relativePath),
                    ),
            ) ??
            docs.find(
                (d) =>
                    d.section === 'drafts' &&
                    d.format === 'html' &&
                    /创作页/.test(d.title),
            ) ??
            docs.find((d) => d.section === 'topics') ??
            docs[0];
        const text = readBytes(snapshot.root, chosen.relativePath).toString(
                'utf8',
            ),
            body =
                chosen.format === 'html'
                    ? (htmlBody(text) ??
                      `此 HTML 当前稿暂只读，请查看源文件：${chosen.relativePath}`)
                    : text;
        return {
            contentId,
            tNumber,
            document: chosen,
            body,
            documents: docs,
            title:
                docs.find((d) => d.section === 'topics')?.title ??
                (path.basename(chosen.relativePath) === '正文.md'
                    ? path
                          .basename(path.dirname(chosen.relativePath))
                          .replace('_', ' ')
                    : chosen.title),
            contentDirectory:
                chosen.section === 'drafts'
                    ? path.posix.dirname(chosen.relativePath)
                    : `${SECTIONS.drafts}/${tNumber}_${chosen.title.replace(/[<>:"/\\|?*]/g, '_').slice(0, 80)}`,
            published: publicationStatus(snapshot, docs, tNumber),
        };
    });
}
export function readVaultTaskContext(runtimeRoot, contentId = null) {
    const binding = bindingForRuntime(runtimeRoot);
    if (!binding) return null;
    const raw = scan(binding.vaultRoot, binding.vaultId),
        s = {
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
    return {
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
                  readOnlyReason: source.sourceMissing
                      ? '原位来源缺失，等待恢复'
                      : source.document.writable
                        ? null
                        : '当前来源格式暂只读',
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

export function queryVaultMutation(runtimeRoot, mutationId) {
    const b = vaultState(runtimeRoot),
        mid = mutationID({mutationId}),
        relative = `.workbench/mutations/${mid}.json`;
    if (!exists(b.root, relative)) return null;
    const r = json(b.root, relative);
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
            const location = `.workbench/mutations/${mid}.json`;
            if (!exists(binding.root, location)) {
                vaultState(runtimeRoot);
                return {state: 'missing'};
            }
            const receipt = queryVaultMutation(runtimeRoot, mid);
            if (receipt.status === 'pending') {
                applyReceipt(binding.root, json(binding.root, location));
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
