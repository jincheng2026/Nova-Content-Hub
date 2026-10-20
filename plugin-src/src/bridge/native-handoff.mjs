import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomUUID, createHash} from 'node:crypto';
import {validRelease} from '../content.mjs';
import {openLibrary} from '../lib/file-library/index.mjs';

const MAX_BYTES = 64 * 1024;
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const hash = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const exact = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const problem = (code, message) => Object.assign(new Error(message), {code});
const refuse = (code, message) => {
    throw problem(code, message);
};
const absolute = value => typeof value === 'string' && path.isAbsolute(value) && !value.includes('\0');
const decimal = value => typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value);

function releaseFor(release) {
    if (!release || !['nova-content-plugin-release', 'nova-content-desktop-release'].includes(release.format) ||
        !validRelease({
            ...release,
            format: 'nova-content-plugin-release'
        })) refuse('PACKAGE_INVALID', '交接的随包发布配置无效。');
    if (release.AUTH_MODE !== 'disabled') refuse('AUTH_NOT_CONFIGURED', '可信权益验证尚未接入，不能开始助手交接。');
    return release;
}

function bindingFor(binding) {
    if (!exact(binding, ['root', 'libraryId', 'rootIdentity']) || !absolute(binding.root) || !uuid(binding.libraryId) ||
        !exact(binding.rootIdentity, ['dev', 'ino']) || !decimal(binding.rootIdentity.dev) || !decimal(binding.rootIdentity.ino)) refuse('INVALID_HANDOFF', '交接内容库绑定无效。');
    return binding;
}

function taskFor(task, kind = 'cover') {
    const key = kind === 'template' ? 'templateId' : 'contentId';
    if (!['cover', 'template'].includes(kind) || !exact(task, [key, 'requestId', 'attemptId', 'requestHash', 'host']) ||
        !(kind === 'template' ? typeof task[key] === 'string' && (uuid(task[key]) || /^builtin-[a-z0-9][a-z0-9-]*$/.test(task[key])) : uuid(task[key])) || ![task.requestId, task.attemptId].every(uuid) || !hash(task.requestHash) || !['codex', 'workbuddy'].includes(task.host)) refuse('INVALID_HANDOFF', '交接必须指向对应业务的固定尝试。');
    return task;
}

// The machine envelope is only a locator; request/attempt state remains in the library.
export function nativeHandoffDirectory(appData) {
    if (appData === undefined) {
        if (process.platform === 'darwin') appData = path.join(os.homedir(), 'Library', 'Application Support');
        else if (process.platform === 'win32') appData = process.env.APPDATA;
        else appData = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
    }
    if (!absolute(appData)) refuse('INVALID_HANDOFF', '系统应用数据目录不可用。');
    return path.join(appData, 'NovaIsland', 'NovaContentHub', 'handoffs');
}

function directoryStat(directory, create = false) {
    if (!absolute(directory)) refuse('UNSAFE_PATH', '交接目录必须是本机绝对位置。');
    let current = path.parse(directory).root;
    for (const segment of path.relative(current, directory).split(path.sep).filter(Boolean)) {
        current = path.join(current, segment);
        if (create) {
            try {
                fs.mkdirSync(current, {mode: 0o700});
            } catch (error) {
                if (error.code !== 'EEXIST') throw error;
            }
        }
        const stat = fs.lstatSync(current, {bigint: true});
        if (stat.isSymbolicLink() || !stat.isDirectory()) refuse('UNSAFE_PATH', '交接目录不能经过符号链接或非文件夹。');
    }
    return fs.lstatSync(directory, {bigint: true});
}

function sameEntry(a, b) {
    return a.dev === b.dev && a.ino === b.ino;
}

function contextFor(binding, task, launching = false, kind = 'cover') {
    const library = openLibrary(binding.root, {
        expectedLibraryId: binding.libraryId,
        expectedRootIdentity: binding.rootIdentity
    });
    const context = kind === 'template' ? library.readTemplateContext(task.templateId, task.requestId, task.attemptId) : library.readCoverContext(task.contentId, task.requestId, task.attemptId);
    if (context.request.requestHash !== task.requestHash || context.attempt.host !== task.host || context.handoff.host !== task.host) refuse('CONFLICT', '固定请求或助手归属与交接不一致。');
    if (launching) {
        const record = kind === 'template' ? context.template : context.content;
        const job = (kind === 'template' ? record.templateJobs : record.coverJobs).find(job => job.id === task.requestId);
        if (record.deletedAt || job.activeAttemptId !== task.attemptId || !['created', 'claimed'].includes(context.attempt.status)) refuse('ATTEMPT_INACTIVE', '这次尝试已结束，请在工作台查看或重试。');
        if (kind === 'template' && (record.currentVersion !== context.request.template.version || !record.versions.some(v => v.version === context.request.template.version && v.packageHash === context.request.template.packageHash))) refuse('STALE_INPUT', '模板版本已经变化，请回工作台准备新的学习请求。');
        if (kind === 'cover' && (context.content.title !== context.request.title || createHash('sha256').update(Buffer.from(context.content.body)).digest('hex') !== context.request.bodyHash)) refuse('STALE_INPUT', '内容已经修改，请回工作台准备新的生成请求。');
    }
    return {library, context};
}

function hostURL(host, id, root, options, kind, library, context) {
    const skill = kind === 'template' ? 'nova-content-template-execution' : 'nova-content-cover-execution';
    if (!exact(options, ['installedSkill', ...(options && Object.hasOwn(options, 'kind') ? ['kind'] : [])]) || options.installedSkill !== skill) refuse('NOT_READY', '请先在所选助手安装并启用配套的执行 Skill。');
    const {request} = context;
    const template = kind === 'template' ? context.template : library.readTemplate(request.template.id, request.template.version);
    if (template.packageHash !== request.template.packageHash) refuse('CONFLICT', '模板与固定请求不一致。');
    const candidateId = kind === 'cover' && /^以所附候选原图（([0-9a-f-]{36})）为基础，按以下批注修改；/.exec(request.prompt)?.[1];
    const candidate = candidateId && context.content.candidates.find(item => item.id === candidateId);
    const refinement = candidate && request.materials.some(item => item.role === 'reference' && item.assetHash === candidate.assetHash && item.originalName === `候选修改参考-${candidateId}.png`);
    const summary = value => Array.from(value.replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/gu, ' ').replace(/\$/g, '＄').replace(/`/g, '｀').trim()).slice(0, 48);
    const title = kind === 'cover' ? summary(request.title) : [];
    const name = template.deletedAt ? [] : summary(template.name);
    const requirements = kind === 'template'
        ? `要求：参考图${request.styleAssetHashes.length}张；首张还原1张；${request.sizePolicy === 'ratio-minimum' ? '至少' : '精确'}${request.restore.width}×${request.restore.height}；${request.restore.outputFormat}；补充说明${request.notes.trim() ? '有' : '无'}。`
        : `要求：${request.count}张；${request.ratio}；${request.sizePolicy === 'ratio-minimum' ? '至少' : '精确'}${request.pixels.width}×${request.pixels.height}；${request.outputFormat}；${request.photo ? '本人照已选' : '不放人物'}；样张${request.styleAssetHashes.length}；资料${request.materials.length - (refinement ? 1 : 0)}；${refinement ? '原图参考1；' : ''}生成要求${request.prompt.trim() ? '已保存' : '无'}。`;
    const readFirst = '先按任务编号读取完整请求、正文及全部已选图片和资料，核对后生成；完整请求为准。';
    const prompt = () => {
        const intent = kind === 'template'
            ? `学习${name.length ? `「${name.join('')}」模板的整组参考图` : '这组模板参考图'}，整理规则并还原首张样图，交回工作台验收。`
            : refinement
                ? `按已保存的位置批注修改${title.length ? `「${title.join('')}」的封面` : '原封面'}，生成新候选并交回工作台。`
                : `照${name.length ? `「${name.join('')}」模板` : '已选模板'}，给${title.length ? `「${title.join('')}」` : '这篇内容'}生成封面候选，并交回工作台。`;
        return [intent, requirements, readFirst, `任务编号：${id}`, ...(host === 'codex' ? ['$' + skill] : [])].join('\n');
    };
    const url = host === 'codex' ? new URL('codex://new') : new URL('workbuddy://task');
    if (host === 'workbuddy') {
        url.searchParams.set('action', 'start');
        url.searchParams.set('skills', options.installedSkill);
    }
    url.searchParams.set(host === 'workbuddy' ? 'cwd' : 'path', root);
    url.searchParams.set('prompt', prompt());
    // Names are optional display hints; the fixed handoff and Skill must remain complete.
    while (url.href.length > 2048 && (title.length || name.length)) {
        (title.length >= name.length ? title : name).pop();
        url.searchParams.set('prompt', prompt());
    }
    if (url.href.length > 2048) refuse('INVALID_HANDOFF', '助手交接链接超过系统长度限制，请使用路径较短的内容库。');
    return url.href;
}

export async function prepareNativeHandoff(directory, binding, task, release, options) {
    releaseFor(release);
    bindingFor(binding);
    const kind = options?.kind === undefined ? 'cover' : options.kind;
    taskFor(task, kind);
    const {library, context} = contextFor(binding, task, true, kind);
    const id = randomUUID(), url = hostURL(task.host, id, binding.root, options, kind, library, context);
    const before = directoryStat(directory, true);
    const envelope = {
        format: 'nova-content-native-handoff',
        schemaVersion: kind === 'template' ? 2 : 1,
        ...(kind === 'template' ? {kind: 'template'} : {}),
        handoffId: id,
        pairId: release.pairId,
        AUTH_MODE: release.AUTH_MODE,
        platform: release.platform,
        arch: release.arch,
        binding,
        task,
        createdAt: new Date().toISOString()
    };
    const bytes = Buffer.from(JSON.stringify(envelope) + '\n');
    if (bytes.length > MAX_BYTES) refuse('INVALID_HANDOFF', '本机交接超过大小限制。');
    const file = path.join(directory, `${id}.json`);
    const fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
    try {
        fs.writeFileSync(fd, bytes);
        fs.fsyncSync(fd);
    } finally {
        fs.closeSync(fd);
    }
    if (!sameEntry(before, directoryStat(directory))) refuse('CONFLICT', '本机交接目录已经被替换。');
    contextFor(binding, task, true, kind);
    // shortcut: path checks do not provide atomic openat semantics; re-audit before supporting shared/untrusted appData.
    return {id, url};
}

export function readNativeHandoff(directory, id, release) {
    releaseFor(release);
    if (!uuid(id)) refuse('INVALID_HANDOFF', '交接 ID 无效。');
    const before = directoryStat(directory), file = path.join(directory, `${id}.json`);
    const named = fs.lstatSync(file, {bigint: true});
    if (named.isSymbolicLink() || !named.isFile() || named.size > BigInt(MAX_BYTES)) refuse('UNSAFE_PATH', '本机交接必须是受限的普通文件。');
    const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    let bytes;
    try {
        const opened = fs.fstatSync(fd, {bigint: true});
        if (!sameEntry(named, opened) || !opened.isFile()) refuse('CONFLICT', '本机交接已经被替换。');
        const buffer = Buffer.alloc(MAX_BYTES + 1);
        let size = 0;
        while (size < buffer.length) {
            const count = fs.readSync(fd, buffer, size, buffer.length - size, null);
            if (!count) break;
            size += count;
        }
        const after = fs.fstatSync(fd, {bigint: true});
        if (size > MAX_BYTES || opened.size !== after.size || opened.mtimeNs !== after.mtimeNs || opened.ctimeNs !== after.ctimeNs) refuse('CONFLICT', '读取期间本机交接发生变化。');
        bytes = buffer.subarray(0, size);
    } finally {
        fs.closeSync(fd);
    }
    if (!sameEntry(named, fs.lstatSync(file, {bigint: true})) || !sameEntry(before, directoryStat(directory))) refuse('CONFLICT', '本机交接位置已经被替换。');
    let envelope;
    try {
        envelope = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
    } catch {
        refuse('INVALID_HANDOFF', '本机交接不是有效 UTF-8 JSON。');
    }
    const kind = envelope?.schemaVersion === 2 && envelope?.kind === 'template' ? 'template' : 'cover';
    if (!exact(envelope, ['format', 'schemaVersion', ...(kind === 'template' ? ['kind'] : []), 'handoffId', 'pairId', 'AUTH_MODE', 'platform', 'arch', 'binding', 'task', 'createdAt']) || envelope.format !== 'nova-content-native-handoff' || envelope.schemaVersion !== (kind === 'template' ? 2 : 1) || envelope.handoffId !== id || typeof envelope.createdAt !== 'string' || !Number.isFinite(Date.parse(envelope.createdAt))) refuse('INVALID_HANDOFF', '本机交接字段无效。');
    if (['pairId', 'AUTH_MODE', 'platform', 'arch'].some(key => envelope[key] !== release[key])) refuse('PAIR_MISMATCH', '工作台交接与插件构建不配套。');
    const binding = bindingFor(envelope.binding), task = taskFor(envelope.task, kind);
    const {library} = contextFor(binding, task, false, kind);
    return {binding, task, library, kind};
}
