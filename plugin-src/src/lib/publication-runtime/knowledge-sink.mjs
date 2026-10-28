import path from 'node:path';
import {digest, fail, identity, json, readBytes, readVaultSnapshot, runMutation, safe, vaultState} from '../vault/core.mjs';
import {workContext} from '../vault/workflow.mjs';
import {readSourceMap, resolveSource} from '../vault/source-map.mjs';
import {optional, planned} from './transaction.mjs';
const LIMIT = 8 * 1024 * 1024;
const validId = v => typeof v === 'string' && (/^[A-Za-z0-9_-]{1,100}$/).test(v);
const relative = v => typeof v === 'string' && !v.includes('\\') && !path.posix.isAbsolute(v) && v.split('/').every(p => p && p !== '.' && p !== '..');
const canonical = v => JSON.stringify(v, (_, value) => value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value);
function script(value) {
    if (!value || typeof value.text !== 'string' || !value.text.trim() || Buffer.byteLength(value.text) > LIMIT || digest(value.text) !== value.hash) fail('SOURCE_HASH_MISMATCH', '正式逐字稿正文与hash不一致');
    return {
        text: value.text,
        hash: value.hash
    };
}
function source(runtimeRoot, work) {
    const {root} = vaultState(runtimeRoot), context = workContext(root, work), pointer = json(root, context.source.contentDirectory + '/正式发布档案.json');
    if (pointer.format !== 'nova-publication-reference' || pointer.schemaVersion !== 1 || pointer.work?.vaultId !== work.vaultId || pointer.work?.workId !== work.workId || !validId(pointer.videoId) || !relative(pointer.archiveDirectory)) fail('CORRUPT', '正式档案引用身份或路径无效');
    const official = resolveSource(root, 'official-archives'), officialRoot = path.relative(root, official.root).split(path.sep).join('/');
    if (official.mode !== 'internal' || official.role !== 'official-archives' || official.authority !== 'official' || !pointer.archiveDirectory.startsWith(officialRoot + '/')) fail('OFFICIAL_SOURCE_REQUIRED', '沉淀只接受当前知识库指针的正式档案');
    const manifestPath = pointer.archiveDirectory + '/.system/manifest.json', manifestBytes = readBytes(root, manifestPath), m = JSON.parse(manifestBytes);
    if (m.schema_version !== 2 || m.video_id !== pointer.videoId || m.work_id !== work.workId || m.nova?.vault_id !== work.vaultId) fail('CORRUPT', '正式档案身份不匹配');
    readBytes(root, pointer.archiveDirectory + '/内容.md');
    const commonScript = script(m.nova.final_script), missingFields = [], platforms = Object.entries(m.platforms ?? ({})).sort(([a], [b]) => a.localeCompare(b)).map(([platform, p]) => {
        if (!validId(platform) || typeof p.title !== 'string' || !p.title.trim() || typeof p.description !== 'string' || typeof p.cover !== 'string' || typeof p.url !== 'string' || !(/^https?:\/\//).test(p.url) || !Number.isFinite(Date.parse(p.published_at))) fail('SOURCE_FACTS_REQUIRED', '正式平台包装信息不完整');
        const coverCopy = p.cover_copy ?? null;
        if (coverCopy === null) missingFields.push(platform + '.coverCopy'); else if (typeof coverCopy !== 'string' || coverCopy.includes('\0') || coverCopy.length > 20000) fail('CORRUPT', '正式封面文字无效');
        return {
            platform,
            title: p.title,
            description: p.description,
            cover: p.cover,
            coverCopy,
            url: p.url,
            publishedAt: p.published_at,
            script: script(p.nova?.final_script)
        };
    });
    if (!platforms.length) fail('SOURCE_FACTS_REQUIRED', '缺少实际发布平台');
    const rows = (optional(root, pointer.archiveDirectory + '/.system/snapshots.jsonl')?.toString('utf8') ?? '').split('\n').filter(Boolean).map(line => JSON.parse(line));
    const snapshots = platforms.map(p => {
        const platform = m.platforms[p.platform], checkpoint = ['7d', '12h'].find(label => platform.checkpoints?.[label]?.snapshot_id);
        if (!checkpoint) return null;
        const c = platform.checkpoints[checkpoint], matches = rows.filter(r => r.snapshot_id === c.snapshot_id);
        if (matches.length !== 1) fail('SOURCE_HASH_MISMATCH', '观测快照缺失或身份重复');
        const r = matches[0];
        if (r.video_id !== m.video_id || r.platform !== p.platform || r.checkpoint !== checkpoint || r.target_at !== c.target_at || !relative(r.evidence_path) || digest(readBytes(root, pointer.archiveDirectory + '/' + r.evidence_path)) !== r.raw_evidence_sha256 || !r.metrics || typeof r.metrics !== 'object' || Array.isArray(r.metrics) || Object.values(r.metrics).some(v => v !== null && !(typeof v === 'number' && Number.isFinite(v) && v >= 0))) fail('SOURCE_HASH_MISMATCH', '观测证据或快照身份不匹配');
        return {
            platform: p.platform,
            id: r.snapshot_id,
            checkpoint,
            collectedAt: r.collected_at,
            metrics: r.metrics,
            evidenceHash: r.raw_evidence_sha256,
            snapshotHash: digest(canonical(r))
        };
    }).filter(Boolean);
    const assets = {
        archiveDirectory: pointer.archiveDirectory,
        work,
        videoId: m.video_id,
        title: m.title,
        commonScript,
        platforms,
        snapshots
    };
    return {
        root,
        work,
        videoId: m.video_id,
        manifestPath,
        archiveDirectory: pointer.archiveDirectory,
        revision: digest(manifestBytes),
        assetsHash: digest(canonical(assets)),
        ...assets,
        missingFields
    };
}
function target(s, previous) {
    const entry = readSourceMap(s.root).sources.find(x => x.id === 'author-evidence');
    if (!entry || entry.role !== 'author-evidence' || entry.mode !== 'internal' || entry.authority !== 'official' || entry.writable !== true || !relative(entry.root)) fail('TARGET_UNAVAILABLE', '需要当前知识库内明确可写的本人材料来源 author-evidence');
    if (previous && previous.sourceRoot !== entry.root) fail('TARGET_CHANGED', '沉淀目标绑定已变化，请核对原沉淀记录；未迁移或覆盖');
    if (previous && (!previous.entryPath.startsWith(entry.root + '/原始资料/口播视频/') || previous.ledgerPath !== entry.root + '/发布数据复盘.md')) fail('CORRUPT', '沉淀回执路径不属于固定本人材料目标');
    const resolved = resolveSource(s.root, 'author-evidence');
    if (!resolved.available || !resolved.writable) fail('TARGET_UNAVAILABLE', '本人材料来源不可用');
    safe(s.root, entry.root);
    const rootIdentity = identity(resolved.root);
    if (previous && (previous.vaultId !== s.work.vaultId || previous.videoId !== s.videoId || previous.workId !== s.work.workId || previous.sourceId !== entry.id || previous.sourceRoot !== entry.root || canonical(previous.sourceIdentity) !== canonical(rootIdentity))) fail('TARGET_CHANGED', '沉淀目标绑定已变化，请核对原沉淀记录；未迁移或覆盖');
    return {
        sourceId: entry.id,
        sourceRoot: entry.root,
        sourceIdentity: rootIdentity
    };
}
const statePath = s => '.workbench/publication-sink/' + s.videoId + '.json';
function saved(s) {
    const bytes = optional(s.root, statePath(s));
    if (!bytes) return null;
    const v = JSON.parse(bytes);
    if (v.format !== 'nova-publication-sink' || v.schemaVersion !== 1 || !relative(v.entryPath) || !relative(v.ledgerPath) || !(/^[a-f0-9]{64}$/).test(v.entryHash ?? '') || !(/^[a-f0-9]{64}$/).test(v.rowHash ?? '')) fail('CORRUPT', '沉淀回执无效');
    return v;
}
const marker = s => '<!-- nova-publication:' + s.work.vaultId + ':' + s.videoId + ' -->';
function ledger(s, previous, ledgerPath) {
    const before = optional(s.root, ledgerPath)?.toString('utf8') ?? '# 发布数据复盘\n\n## 已发布视频台账\n\n| 日期 | 真实标题 | 封面文字 | 逐字稿条目 | 抖音 | 视频号 | 小红书 |\n| --- | --- | --- | --- | --- | --- | --- |\n', lines = before.split('\n'), matches = lines.map((line, index) => ({
        line,
        index
    })).filter(x => x.line.includes(marker(s)));
    if (matches.length > 1) fail('CONFLICT', '发布台账有重复视频身份标记，未任选覆盖');
    if (previous) {
        if (matches.length !== 1 || digest(matches[0].line) !== previous.rowHash) fail('CONFLICT', '发布台账原行已被修改或删除，未覆盖');
        const bytes = optional(s.root, previous.entryPath);
        if (bytes === null || digest(bytes) !== previous.entryHash) fail('CONFLICT', '沉淀原文已被修改或删除，未覆盖');
    } else if (matches.length) fail('CONFLICT', '发布台账已有同身份条目但缺少可验证回执');
    return {
        before,
        lines,
        match: matches[0]
    };
}
function status(s, p) {
    return {
        state: p.sourceAssetsHash === s.assetsHash ? p.missingFields.length ? 'partial' : 'complete' : 'stale',
        message: p.sourceAssetsHash === s.assetsHash ? p.missingFields.length ? '原文已沉淀，部分实际封面文字尚未登记' : '发布原文已沉淀' : '正式发布文本或观测已更新，可重试沉淀',
        sourceManifestHash: p.sourceManifestHash,
        sourceAssetsHash: p.sourceAssetsHash,
        entryPath: p.entryPath,
        ledgerPath: p.ledgerPath,
        missingFields: p.missingFields
    };
}
function failure(error, s) {
    return {
        state: 'incomplete',
        message: '沉淀未完成，可重试，档案已保留：' + error.message,
        sourceManifestHash: s?.revision ?? null,
        code: error.code ?? 'IO_ERROR'
    };
}
function checked(s) {
    const p = saved(s);
    target(s, p);
    if (!p) return {
        state: 'incomplete',
        message: '沉淀未完成，可重试，档案已保留',
        sourceManifestHash: s.revision,
        code: 'RECEIPT_MISSING'
    };
    ledger(s, p, p.ledgerPath);
    return status(s, p);
}
export function readPublicationKnowledgeStatus(runtimeRoot, work) {
    let s;
    try {
        s = source(runtimeRoot, work);
        return checked(s);
    } catch (error) {
        return failure(error, s);
    }
}
function filename(value) {
    let name = String(value ?? '已发布内容').normalize('NFC').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '_').replace(/[. ]+$/g, '').trim();
    if ((/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i).test(name)) name = '_' + name;
    return Array.from(name || '已发布内容').slice(0, 64).join('');
}
const cell = v => String(v).replaceAll('|', '\\|').replace(/[\r\n]+/g, '<br>');
function entryText(s, entryPath) {
    return '# ' + s.title + '\n\n> 发布原文参考，以档案为准。只复制文本资产；未知信息不推断。\n\n## 完整逐字稿\n\n' + s.commonScript.text + '\n\nSHA256：' + s.commonScript.hash + '\n\n' + s.platforms.map(p => '## ' + p.platform + ' 实际发布版本\n\n标题：' + p.title + '\n\n简介：' + (p.description === '' ? '（明确为空）' : p.description) + '\n\n封面文字：' + (p.coverCopy === null ? '（未登记）' : p.coverCopy === '' ? '（明确无字）' : p.coverCopy) + '\n\n封面文件／链接标识：' + p.cover + '\n\n实际发布链接：' + p.url + '\n\n实际发布时间：' + p.publishedAt + '\n\n### 本平台完整逐字稿\n\n' + p.script.text + '\n\nSHA256：' + p.script.hash).join('\n\n') + '\n\n## 📌来源\n\n- 正式内容：[' + s.videoId + '](' + path.posix.relative(path.posix.dirname(entryPath), s.archiveDirectory + '/内容.md') + ')\n- manifest：[' + s.videoId + '](' + path.posix.relative(path.posix.dirname(entryPath), s.manifestPath) + ')\n- vaultId：' + s.work.vaultId + '\n- workId：' + s.work.workId + '\n- videoId：' + s.videoId + '\n- manifest SHA256（复制时）：' + s.revision + '\n- 发布文本资产 SHA256：' + s.assetsHash + '\n\n## 🎯应用\n\n用于后续写稿参考本人已发布原文；复盘和方法判断须另经作者确认。\n';
}
function ledgerRow(s, entryPath) {
    const metrics = platform => {
        const snap = s.snapshots.find(x => x.platform === platform);
        return snap ? cell(Object.entries(snap.metrics).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => key + '=' + (value ?? '—')).join('；') + ' · ' + snap.checkpoint + ' · ' + snap.collectedAt + ' · ' + snap.id) : '—';
    };
    return '| ' + [s.platforms.map(p => p.publishedAt.slice(0, 10)).sort()[0], s.platforms.map(p => p.platform + '：' + p.title).join('；'), s.platforms.map(p => p.platform + '：' + (p.coverCopy === null ? '未登记' : p.coverCopy === '' ? '明确无字' : p.coverCopy)).join('；'), '[[' + entryPath + ']]'].map(cell).join(' | ') + ' | ' + ['douyin', 'wechat_channels', 'xiaohongshu'].map(metrics).join(' | ') + ' | ' + marker(s);
}
/** Fixed-work transaction; destinations and text are always derived from verified official sources. */
export function syncPublicationKnowledge(runtimeRoot, input) {
    let initial;
    try {
        if (!input || Object.keys(input).some(k => !['work', 'expectedRevision'].includes(k))) fail('INVALID_INPUT', '沉淀只接受固定内容与版本');
        readVaultSnapshot(runtimeRoot);
        initial = source(runtimeRoot, input.work);
        if (initial.revision !== input.expectedRevision) fail('CONFLICT', '正式档案版本已变化，请重新读取');
        const previous = saved(initial), dest = target(initial, previous);
        if (previous) {
            ledger(initial, previous, previous.ledgerPath);
            if (previous.sourceAssetsHash === initial.assetsHash) return status(initial, previous);
        }
        const request = {
            action: 'publication-runtime',
            input: {
                operation: 'sync-publication-knowledge',
                work: input.work,
                sourceAssetsHash: initial.assetsHash,
                target: dest
            }
        }, mutationId = 'publication-sink-' + digest(canonical(request)).slice(0, 48);
        runMutation(runtimeRoot, request, {
            mutationId
        }, () => {
            const s = source(runtimeRoot, input.work);
            if (s.revision !== input.expectedRevision || s.assetsHash !== initial.assetsHash) fail('CONFLICT', '沉淀准备时正式资产已变化');
            const old = saved(s), destination = target(s, old);
            if (canonical(destination) !== canonical(dest)) fail('TARGET_CHANGED', '沉淀准备时目标变化');
            const entryPath = old?.entryPath ?? dest.sourceRoot + '/原始资料/口播视频/' + s.platforms.map(p => p.publishedAt.slice(0, 10)).sort()[0] + '-' + filename(s.title) + '--' + s.videoId + '.md', ledgerPath = old?.ledgerPath ?? dest.sourceRoot + '/发布数据复盘.md';
            if (!entryPath.startsWith(dest.sourceRoot + '/') || !ledgerPath.startsWith(dest.sourceRoot + '/')) fail('CORRUPT', '沉淀回执路径不属于本人材料来源');
            const current = ledger(s, old, ledgerPath);
            if (!old && optional(s.root, entryPath) !== null) fail('CONFLICT', '沉淀原文目标已存在且无回执');
            const entry = entryText(s, entryPath), row = ledgerRow(s, entryPath);
            if (Buffer.byteLength(entry) > LIMIT) fail('INVALID_INPUT', '沉淀文本超过8MiB');
            const nextLedger = current.match ? (current.lines[current.match.index] = row, current.lines.join('\n')) : current.before + (current.before.endsWith('\n') ? '' : '\n') + row + '\n';
            if (Buffer.byteLength(nextLedger) > LIMIT) fail('INVALID_INPUT', '沉淀台账超过8MiB；正式档案已保留');
            const receipt = {
                format: 'nova-publication-sink',
                schemaVersion: 1,
                vaultId: s.work.vaultId,
                workId: s.work.workId,
                videoId: s.videoId,
                ...dest,
                entryPath,
                ledgerPath,
                entryHash: digest(entry),
                rowHash: digest(row),
                sourceManifestHash: s.revision,
                sourceAssetsHash: s.assetsHash,
                missingFields: s.missingFields
            };
            const writes = [planned(s.root, entryPath, entry), planned(s.root, ledgerPath, nextLedger), planned(s.root, statePath(s), receipt)], readme = dest.sourceRoot + '/原始资料/口播视频/README.md';
            if (optional(s.root, readme) === null) writes.push(planned(s.root, readme, '# 本人口播视频原始资料\n\n发布原文参考，以正式发布档案为准。条目保存完整逐字稿与各平台实际包装；媒体文件不复制。来源见每条的 📌来源，写稿用途见 🎯应用。发布数据复盘.md 按 vaultId 与 videoId 一条视频一行，未知指标记 —。\n'));
            return {
                action: 'publication-runtime',
                writes,
                result: status(s, receipt)
            };
        });
        return checked(source(runtimeRoot, input.work));
    } catch (error) {
        return failure(error, initial);
    }
}
