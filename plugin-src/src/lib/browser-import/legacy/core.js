/* Browser-only workspace facts. No filesystem, provider, entitlement or host bridge is implied. */
(function (root, factory) {
    const api = factory(typeof module === 'object' && module.exports ? require('./shared/handoff.js') : root.NCHHandoff, typeof module === 'object' && module.exports ? require('./builtin-templates.js') : root.NCH_BUILTIN_TEMPLATES, typeof module === 'object' && module.exports ? require('./builtin-templates.js').legacy : root.NCH_BUILTIN_LEGACY);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else {
        root.NCHCore = api;
        root.NCH_WORKSPACE = api.create(root.NCH, root.localStorage, root.NCH_BUILD);
    }
})(typeof window === 'object' ? window : globalThis, function (Handoff, builtinTemplates, legacyTemplates) {
    'use strict';
    const BUILTINS = JSON.parse(JSON.stringify(builtinTemplates || [])).map(t => ({
        ...t,
        state: '可用',
        evidence: [],
        restoreTest: false,
        sample: false
    }));
    const TRUSTED_BUILTINS = [...BUILTINS, ...JSON.parse(JSON.stringify(legacyTemplates || [])).map(t => ({
        ...t,
        state: '可用',
        evidence: [],
        restoreTest: false,
        sample: false
    }))];
    const builtinSources = new Set(TRUSTED_BUILTINS.flatMap(t => [t.img, ...t.shots, ...(t.assets || []).map(a => typeof a === 'string' ? a : a.path), ...(t.generatedReferences || []).map(a => a.path)].filter(Boolean)));
    const definitionKeys = ['audience', 'scenario', 'contentType', 'useCases', 'anatomy', 'generation', 'generatedReferences', 'id', 'version', 'definitionVersion', 'fixed', 'varies', 'evidence', 'shots', 'img', 'assets', 'provenance', 'spec', 'validation', 'source', 'from', 'ratio', 'recipe', 'colors', 'samples', 'sourceTitle', 'referenceTitle'];

    function isBuiltinTemplate(t) {
        return TRUSTED_BUILTINS.some(original => original.id === t?.id && definitionKeys.every(k => JSON.stringify(t[k]) === JSON.stringify(original[k])));
    }

    const raster = src => /\.(png|jpe?g|webp|gif)$/i.test(src) || /^data:image\/(png|jpeg|webp|gif);/.test(src);

    function templateSamples(t) {
        return !t ? [] : t.generatedReferences?.length ? [...new Set([...t.generatedReferences.map(a => a.path), ...t.shots].filter(raster))] : t.shots.filter(raster);
    }

    function isTemplateUsable(t) {
        return !!t && t.state === '可用' && (isBuiltinTemplate(t) || t.validation?.kind !== 'authored-design' && t.validation?.accepted === true && !!t.validation.restoreImage && t.fixed.length > 0 && t.evidence.length > 0);
    }

    // Local fingerprints resolve archived originals without duplicating image bytes.
    function fingerprint(value) {
        let a = 2166136261, b = 3339675911;
        for (let i = 0; i < value.length; i++) {
            a = Math.imul(a ^ value.charCodeAt(i), 16777619);
            b = Math.imul(b ^ value.charCodeAt(i), 2246822507);
        }
        return value.length + ':' + (a >>> 0).toString(16).padStart(8, '0') + ':' + (b >>> 0).toString(16).padStart(8, '0');
    }

    function installBuiltins(data, upgrade = false) {
        let changed = false;
        for (const t of BUILTINS) {
            const current = data.TEMPLATES.find(x => x.id === t.id);
            if (!current) {
                data.TEMPLATES.push(clone(t));
                changed = true;
            } else if (upgrade && current.version < t.version && current.state === '可用' && isBuiltinTemplate(current)) {
                archive(current);
                const {name, used, history} = current;
                Object.keys(current).forEach(k => delete current[k]);
                Object.assign(current, clone(t), {name, used, history});
                changed = true;
            }
        }
        return changed;
    }

    function archive(t) {
        t.history ||= [];
        t.history.push({
            review: t.review ? clone(t.review) : null, ...(isBuiltinTemplate(t) || t.anatomy || t.generation ? {definition: clone(Object.fromEntries(definitionKeys.filter(k => t[k] !== undefined && (isBuiltinTemplate(t) || !['img', 'shots', 'assets', 'validation'].includes(k))).map(k => [k, t[k]])))} : {}), ...(!isBuiltinTemplate(t) ? {
                sources: t.shots.map((src, i) => ({
                    id: `source-${t.id}-${i}`,
                    key: fingerprint(src)
                }))
            } : {}),
            version: t.version,
            state: t.state,
            fixed: clone(t.fixed),
            varies: clone(t.varies),
            evidence: clone(t.evidence),
            originalCount: t.shots.length,
            validation: t.validation ? {
                kind: t.validation.kind || 'restoration',
                accepted: t.validation.accepted === true,
                restoreId: t.validation.restoreId || null,
                sha256: t.validation.sha256 || '',
                px: t.validation.px || null,
                acceptedAt: t.validation.acceptedAt || null
            } : null,
            archivedAt: new Date().toISOString(),
            note: '版本历史保存规则与验收引用；图片字节不重复复制，当前原图或回收区内查看原始文件'
        });
    }

    const KEY = 'nch-workspace-v1', BACKUP = KEY + '-previous', MAX_BYTES = 4 * 1024 * 1024;
    const KEYS = ['ACCOUNT', 'TEMPLATES', 'PROJECTS', 'TASKS', 'SETTINGS', 'CHANNELS', 'PROMPTS', 'CUSTOM_SIZES', 'PCATS'];
    const clone = x => JSON.parse(JSON.stringify(x));
    const uid = prefix => prefix + '-' + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2));
    const assert = (value, msg) => {
        if (!value) throw Error(msg);
    };
    const text = (x, max = 10000) => typeof x === 'string' && x.length <= max;

    function date(value) {
        if (value === '') return '';
        const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(value));
        if (!m) return null;
        const y = +m[1], mo = +m[2], d = +m[3], at = new Date(Date.UTC(y, mo - 1, d));
        return y >= 1991 && y <= 2199 && at.getUTCFullYear() === y && at.getUTCMonth() === mo - 1 && at.getUTCDate() === d ? `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null;
    }

    function ratio(value) {
        const m = /^(\d+(?:\.\d{1,4})?):(\d+(?:\.\d{1,4})?)$/.exec(String(value));
        if (!m || +m[1] <= 0 || +m[2] <= 0 || +m[1] > 20000 || +m[2] > 20000) return '';
        let a = Math.round(+m[1] * 10000), b = Math.round(+m[2] * 10000), x = a, y = b;
        while (y) {
            const r = x % y;
            x = y;
            y = r;
        }
        return a / x + ':' + b / x;
    }

    function url(value) {
        if (!value) return '';
        try {
            const u = new URL(value);
            return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password ? u.href : null;
        } catch {
            return null;
        }
    }

    function path(value) {
        return text(value, 500) && !!value && !/^(?:[a-z]:|[\\/~])/i.test(value) && !/[\\\u0000-\u001f]/.test(value) && !value.split('/').some(x => !x || x === '.' || x === '..');
    }

    const source = x => text(x, MAX_BYTES) && (builtinSources.has(x) || /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/.test(x) || (path(x) && /\.(png|jpe?g|webp|gif)$/i.test(x)) || /^图库\/示例\/(?:avatar|sample|selected|cover-(?:0[1-9]|10))\.svg$/.test(x));
    const isOwnPhoto = p => !!p && /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/.test(p.img);
    const id = x => text(x, 96) && /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(x);
    const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    const list = (value, limit = 10000) => Array.isArray(value) && value.length <= limit;
    const integer = (value, max = 10000, min = 0) => Number.isSafeInteger(value) && value >= min && value <= max;
    const optional = (value, check) => value === undefined || check(value);
    const hex = value => typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
    const timestamp = value => text(value, 50) && Number.isFinite(Date.parse(value));
    const pixelPair = value => list(value, 2) && value.length === 2 && value.every(x => integer(x, 20000, 1));
    const stringList = (value, max = 1000) => list(value) && value.every(x => text(x, max));
    const only = (value, keys) => object(value) && Object.keys(value).every(k => keys.includes(k));
    const utf8Bytes = value => encodeURIComponent(value).replace(/%[A-F0-9]{2}/g, 'x').length;
    const TASK_STATES = ['handoff', 'running', 'review', 'success', 'partial', 'failed', 'interrupted'];
    const TEMPLATE_STATES = ['待拆解', '待还原', '待验收', '可用', '失败', '已停用'];
    const COMMAND = 'node "<PLUGIN_ROOT>/dist/content.mjs" check-request --file REQUEST.json';

    function unique(records, key, check, label) {
        assert(list(records), label + '必须是列表');
        const seen = new Set();
        records.forEach(item => {
            assert(object(item) && check(item[key]) && !seen.has(item[key]), label + '标识无效或重复');
            seen.add(item[key]);
        });
    }

    function referenceList(value) {
        return list(value, 32) && value.every(r => only(r, ['id', 'version', 'note']) && id(r.id) && optional(r.version, x => integer(x, Number.MAX_SAFE_INTEGER, 1)) && optional(r.note, x => text(x, 1000)));
    }

    function ruleSet(rules, sourceCount = Infinity) {
        assert(only(rules, ['fixed', 'varies', 'evidence']) && stringList(rules.fixed) && stringList(rules.varies) && list(rules.evidence), '规则结构无效');
        rules.evidence.forEach(e => assert(only(e, ['sourceIndex', 'sourceId', 'rule']) && integer(e.sourceIndex) && e.sourceIndex < sourceCount && text(e.rule, 1000) && optional(e.sourceId, id), '原图证据索引或规则无效'));
    }

    function templateDesign(t) {
        if (t.generatedReferences !== undefined) assert(list(t.generatedReferences, 12) && new Set(t.generatedReferences.map(a => a.id)).size === t.generatedReferences.length && t.generatedReferences.every(a => only(a, ['id', 'path', 'role', 'origin', 'templateVersion', 'accepted', 'promptFile', 'tool', 'generatedAt', 'width', 'height']) && id(a.id) && source(a.path) && a.role === 'style' && a.origin === 'ai-generated' && integer(a.templateVersion, Number.MAX_SAFE_INTEGER, 1) && a.templateVersion <= t.version && a.accepted === false && path(a.promptFile) && /\.md$/.test(a.promptFile) && a.tool === 'imagegen' && TRUSTED_BUILTINS.some(b => b.id === t.id && (b.generatedReferences || []).some(r => JSON.stringify(r) === JSON.stringify(a))) && date(a.generatedAt) && integer(a.width, 20000, 1) && integer(a.height, 20000, 1)), 'AI 风格参考结构或模板版本无效');
        assert(optional(t.audience, x => ['general', 'ai'].includes(x)) && optional(t.scenario, x => text(x, 300)) && optional(t.contentType, x => text(x, 300)) && optional(t.useCases, x => list(x, 30) && x.every(v => text(v, 500))), '模板受众或场景无效');
        if (t.anatomy !== undefined) assert(list(t.anatomy, 30) && t.anatomy.every(a => only(a, ['region', 'role', 'rule', 'editable']) && text(a.region, 300) && text(a.role, 500) && text(a.rule, 2000) && typeof a.editable === 'boolean'), '模板区域拆解无效');
        if (t.generation !== undefined) {
            const g = t.generation;
            assert(only(g, ['intent', 'subjectPolicy', 'textPolicy', 'referencePolicy', 'promptTemplate', 'negative', 'variables', 'qualityChecks']) && ['intent', 'subjectPolicy', 'textPolicy', 'referencePolicy', 'promptTemplate'].every(k => text(g[k], 10000)) && stringList(g.negative, 2000) && list(g.variables, 30) && g.variables.every(v => only(v, ['key', 'label', 'required', 'example']) && /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(v.key) && text(v.label, 100) && typeof v.required === 'boolean' && (!v.required || ['title', 'ratio'].includes(v.key)) && text(v.example, 1000)) && list(g.qualityChecks, 30) && g.qualityChecks.every(x => text(x, 2000)), '模板生成说明无效');
        }
    }

    function validateRequest(r) {
        assert(only(r, ['protocol', 'version', 'appScope', 'authMode', 'pairId', 'requestId', 'libraryId', 'targetId', 'kind', 'templateId', 'templateVersion', 'libraryRoot', 'pathsResolved', 'paths', 'skill', 'cli', 'options', 'rules', 'references', 'createdAt']), '请求包含未知字段');
        assert(r.protocol === 'nova-content-hub-request' && r.version === 1 && r.appScope === 'nova-content-hub' && ['required', 'disabled'].includes(r.authMode), '请求协议无效');
        assert(text(r.pairId, 150) && new RegExp('^nova-content-hub@(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*):p1:' + r.authMode + '$').test(r.pairId), '请求构建配对无效');
        assert([r.requestId, r.libraryId, r.targetId, r.templateId].every(id) && integer(r.templateVersion, Number.MAX_SAFE_INTEGER, 1), '请求标识或模板版本无效');
        const skills = {
            analyze: 'nova-content-template-study',
            restore: 'nova-content-template-restore',
            generate: 'nova-content-cover'
        };
        assert(Object.hasOwn(skills, r.kind) && r.skill === skills[r.kind] && (r.kind === 'generate' || r.targetId === r.templateId), '请求类型或 Skill 无效');
        assert(r.libraryRoot === null && r.pathsResolved === false && only(r.paths, ['template', 'rules', 'target']) && ['template', 'rules', 'target'].every(k => path(r.paths[k])), '请求路径必须是未绑定的计划相对路径');
        assert(r.cli === COMMAND && timestamp(r.createdAt), '请求命令或时间无效');
        const o = r.options;
        assert(only(o, ['title', 'count', 'format', 'ratio', 'pixels', 'templateId', 'references']), '请求配置包含未知字段');
        const short = x => text(x, 300) && !/[\u0000-\u001f]/.test(x);
        assert(optional(o.title, short) && optional(o.format, short) && optional(o.count, x => integer(x, 20, 1)), '标题、格式或数量无效');
        assert(optional(o.ratio, x => /^[1-9]\d*:[1-9]\d*$/.test(x) && x.split(':').every(n => +n <= 20000)), '请求比例必须规范化且分子分母不超过 20000');
        assert(o.pixels == null || pixelPair(o.pixels) && o.pixels.every(x => x <= 16384), '请求像素必须在 1..16384 内');
        if (o.pixels) {
            assert(o.ratio, '像素必须配合明确比例');
            const [a, b] = o.ratio.split(':').map(Number);
            assert(Math.abs(o.pixels[0] / o.pixels[1] - a / b) <= 0.01, '请求像素与比例不一致');
        }
        if (r.kind === 'generate') assert(o.title?.trim() && o.count && o.ratio, '生成请求缺少标题、数量或比例');
        assert(optional(o.templateId, x => x === r.templateId) && referenceList(r.references) && optional(o.references, referenceList), '请求参考引用无效');
        ruleSet(r.rules);
        assert(utf8Bytes(JSON.stringify(r, null, 2)) <= 16384, '请求超过 16 KiB UTF-8 传输上限，请减少规则、证据或参考说明');
        return r;
    }

    function validate(s) {
        assert(object(s) && s.format === 'nova-content-hub-browser' && s.schema === 1 && s.appScope === 'nova-content-hub', '未知备份格式或版本，当前工作区未被覆盖');
        assert(id(s.libraryId) && object(s.data) && timestamp(s.updatedAt), '内容库 ID、数据或更新时间无效');
        ['ACCOUNT', 'SETTINGS', 'CHANNELS'].forEach(k => assert(object(s.data[k]), k + '必须是对象'));
        ['PROJECTS', 'TEMPLATES', 'TASKS', 'PROMPTS', 'CUSTOM_SIZES', 'PCATS'].forEach(k => assert(list(s.data[k]), k + '必须是列表'));
        assert(list(s.trash), '回收记录无效');

        function walk(value, depth = 0) {
            assert(depth <= 30, '备份嵌套层级过深');
            if (value === null) return;
            if (typeof value === 'string') {
                assert(value.length <= MAX_BYTES, '单项数据过大');
                return;
            }
            if (list(value)) {
                value.forEach(x => walk(x, depth + 1));
                return;
            }
            if (object(value)) {
                for (const [k, v] of Object.entries(value)) {
                    assert(!['__proto__', 'prototype', 'constructor', 'accessToken', 'refreshToken', 'idToken', 'authorization'].includes(k), '备份包含危险字段或授权凭据');
                    walk(v, depth + 1);
                }
                return;
            }
            assert(typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value), '备份包含无效数据类型');
        }

        walk(s);
        const account = s.data.ACCOUNT, settings = s.data.SETTINGS;
        assert(text(account.name, 200) && text(account.intro, 2000) && (!account.avatar || source(account.avatar)), '素材账号文本或头像无效');

        function photo(p) {
            assert(object(p) && id(p.id) && text(p.name, 300) && source(p.img) && optional(p.use, x => typeof x === 'boolean') && optional(p.bytes, x => integer(x, 1024 * 1024, 1)) && optional(p.px, pixelPair) && optional(p.sha256, x => x === '' || /^[a-f0-9]{64}$/.test(x)), '素材图片无效');
        }

        unique(account.photos, 'id', id, '素材图片');
        account.photos.forEach(photo);
        assert(account.photos.filter(p => isOwnPhoto(p) && p.use).length <= 1, '只能有一张默认本人照片');
        assert(list(account.marks) && account.marks.every(m => object(m) && text(m.k, 100) && text(m.v, 1000)), '素材标记无效');
        assert(['codex', 'workbuddy'].includes(settings.host) && typeof settings.showSample === 'boolean' && text(settings.clientId, 200) && text(settings.root, 500) && text(settings.pluginDir, 500) && text(settings.lastCheck, 100), '宿主设置无效');
        assert(object(settings.installed) && Object.values(settings.installed).every(x => typeof x === 'boolean') && object(settings.versions) && Object.values(settings.versions).every(x => text(x, 100)), '宿主安装记录无效');
        assert(object(settings.hostConfig) && Object.keys(settings.hostConfig).every(x => ['codex', 'workbuddy'].includes(x)), '宿主配置无效');
        Object.values(settings.hostConfig).forEach(h => assert(object(h) && ['unknown', 'installed', 'missing'].includes(h.installation) && ['unknown', 'untrusted', 'trusted'].includes(h.trust) && text(h.version, 100) && optional(h.pluginPairId, x => text(x, 150)) && optional(h.compatibility, x => text(x, 100)) && optional(h.evidence, x => text(x, 300)), '宿主配置格式无效'));
        const channelName = name => text(name, 16) && !!name.trim() && !/[\u0000-\u001f]/.test(name);
        for (const [name, ch] of Object.entries(s.data.CHANNELS)) assert(channelName(name) && object(ch) && hex(ch.ink) && hex(ch.bg) && typeof ch.builtin === 'boolean' && (ch.need === '' || ['竖版', '方图', '头图', '横版'].includes(ch.need) || !!ratio(ch.need)), '渠道名称、颜色或规格无效');
        assert(stringList(s.data.PCATS, 100), '提示词分类无效');
        assert(s.data.CUSTOM_SIZES.every(x => !!ratio(x)), '自定义比例无效');

        function asset(f) {
            assert(object(f) && id(f.id) && text(f.name, 300) && text(f.size, 100), '附件结构无效');
            assert(optional(f.bytes, x => integer(x, 1024 * 1024)) && optional(f.type, x => text(x, 200)) && optional(f.sha256, x => /^[a-f0-9]{64}$/.test(x)) && optional(f.srcPath, path), '附件元数据无效');
            if (f.content !== undefined) assert(text(f.content, MAX_BYTES) && /^data:[^\s,]*;base64,[A-Za-z0-9+/]*={0,2}$/.test(f.content), '附件字节格式无效');
        }

        function prompt(p) {
            assert(object(p) && id(p.id) && ['title', 'when', 'summary', 'source', 'body', 'cat', 'file'].every(k => text(p[k], 100000)) && stringList(p.tags, 100) && optional(p.mine, x => typeof x === 'boolean') && optional(p.off, x => typeof x === 'boolean'), '提示词结构无效');
        }

        function candidate(c) {
            assert(object(c) && id(c.id) && text(c.no, 6) && /^\d{2,6}$/.test(c.no) && source(c.img) && typeof c.use === 'boolean' && typeof c.fav === 'boolean', '候选 ID、编号、图片或选择状态无效');
            assert(optional(c.px, pixelPair) && optional(c.bytes, x => integer(x, 1024 * 1024)) && optional(c.sha256, x => x === '' || /^[a-f0-9]{64}$/.test(x)) && optional(c.from, x => text(x, 1000)) && optional(c.srcPath, path), '候选尺寸或元数据无效');
        }

        function pubSnapshot(x) {
            assert(object(x) && id(x.candidateId) && integer(x.batch, 10000, 1) && source(x.img) && (x.px == null || pixelPair(x.px)) && optional(x.sha256, v => v === '' || /^[a-f0-9]{64}$/.test(v)), '历史发布封面快照无效');
        }

        function project(p) {
            assert(object(p) && id(p.id) && ['内容', '合集'].includes(p.kind) && text(p.name, 200) && p.name.trim() && text(p.folder, 500) && text(p.tpl, 100) && (!p.tpl || id(p.tpl)), '内容标识、类型或文本无效');
            assert(list(p.channels) && p.channels.every(channelName) && object(p.dates) && Object.values(p.dates).every(d => date(d) !== null) && date(p.plan) !== null && optional(p.sample, x => typeof x === 'boolean'), '内容渠道或日期无效');
            if (p.kind === '合集') assert(list(p.members) && p.members.every(id) && new Set(p.members).size === p.members.length && p.dates.from && p.dates.to && p.dates.from <= p.dates.to && list(p.materials) && !p.materials.length, '合集成员或日期范围无效');
            unique(p.files, 'id', id, '附件');
            p.files.forEach(asset);
            unique(p.materials, 'id', id, '物料');
            p.materials.forEach(m => {
                assert(text(m.name, 200) && text(m.format, 100) && ratio(m.ratio) && id(m.tpl), '物料文本或比例无效');
                unique(m.batches, 'no', x => integer(x, 10000, 1), '批次');
                const candidateIds = new Set(), numbers = new Set();
                m.batches.forEach(b => {
                    assert(date(b.at) && id(b.tpl) && ['done', ...TASK_STATES].includes(b.state) && optional(b.requestId, id) && optional(b.sourceRequestId, id) && (!b.sourceRequestId || !b.requestId && integer(b.attempt, 10000, 1)) && optional(b.attempt, x => integer(x, 10000, 1)) && optional(b.title, x => text(x, 300)), '批次元数据无效');
                    unique(b.cands, 'id', id, '候选');
                    b.cands.forEach(c => {
                        candidate(c);
                        assert(!candidateIds.has(c.id) && !numbers.has(c.no), '同一物料候选 ID 或编号重复');
                        candidateIds.add(c.id);
                        numbers.add(c.no);
                    });
                    if (b.ref !== undefined) assert(list(b.ref) && b.ref.every(r => object(r) && id(r.m) && text(r.no, 6) && /^\d{2,6}$/.test(r.no)), '优先参考格式无效');
                });
            });
            unique(p.posts, 'id', id, '发布条目');
            p.posts.forEach(x => {
                assert(date(x.date) && text(x.text, 100000) && channelName(x.channel) && text(x.time, 5) && (!x.time || /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(x.time)) && text(x.mat, 100) && (!x.mat || p.materials.some(m => m.id === x.mat)), '发布条目格式、日期或物料引用无效');
                if (x.pub != null) {
                    assert(object(x.pub) && date(x.pub.at) && text(x.pub.link, 3000) && url(x.pub.link) !== null, '发布记录日期或链接无效');
                    if (x.pub.snapshot != null) pubSnapshot(x.pub.snapshot);
                }
            });
        }

        function template(t) {
            templateDesign(t);
            if (t.review !== undefined) assert(only(t.review, ['templateVersion', 'checks', 'reason', 'reviewedAt']) && integer(t.review.templateVersion, Number.MAX_SAFE_INTEGER, 1) && t.review.templateVersion <= t.version && only(t.review.checks, ['title', 'readability', 'boundary', 'rules', 'identity']) && ['title', 'readability', 'boundary', 'rules', 'identity'].every(k => ['pass', 'fail', 'unclear'].includes(t.review.checks[k])) && text(t.review.reason, 2000) && timestamp(t.review.reviewedAt), '模板人工评审记录无效');
            assert(object(t) && id(t.id) && text(t.name, 100) && t.name.trim() && integer(t.version, Number.MAX_SAFE_INTEGER, 1) && TEMPLATE_STATES.includes(t.state), '模板标识、名称、版本或状态无效');
            assert(['desc', 'style', 'fit', 'unfit', 'source', 'from', 'owner'].every(k => text(t[k], 10000)) && (t.ratio === '' || !!ratio(t.ratio)) && typeof t.builtin === 'boolean' && date(t.madeAt) && integer(t.used, Number.MAX_SAFE_INTEGER), '模板文本或元数据无效');
            assert(list(t.shots, 1000) && t.shots.every(source) && text(t.img, MAX_BYTES) && (!t.img || source(t.img)), '模板原图引用无效');
            assert(list(t.why) && t.why.every(w => list(w, 2) && w.length === 2 && w.every(x => text(x, 3000))), '模板分析必须是二元文本列表');
            ruleSet({fixed: t.fixed, varies: t.varies, evidence: t.evidence}, t.shots.length);
            assert(list(t.colors) && t.colors.every(c => object(c) && hex(c.v) && text(c.k, 100) && optional(c.note, x => text(x, 1000))), '配色格式无效');
            if (t.validation?.kind === 'authored-design') {
                const v = t.validation;
                assert(only(v, ['kind', 'aiTested', 'referenceImage', 'provenance']) && v.aiTested === false && source(v.referenceImage) && only(v.provenance, ['author', 'license', 'source']) && text(v.provenance.author, 200) && v.provenance.license === 'project-original' && text(v.provenance.source, 200) && v.provenance.source.startsWith('builtin:'), '原创设计声明无效');
            } else if (t.validation != null) {
                const v = t.validation;
                assert(object(v) && (!v.kind || v.kind === 'restoration') && source(v.restoreImage) && typeof v.accepted === 'boolean' && optional(v.restoreId, id) && optional(v.px, pixelPair) && optional(v.sourceIndex, x => integer(x) && x < t.shots.length) && optional(v.sha256, x => x === '' || /^[a-f0-9]{64}$/.test(x)), '还原验收结构无效');
            }
            if (t.state === '可用') assert(isTemplateUsable(t), '可用模板缺少真实还原验收证据或随包原创定义已改变');
            if (t.history !== undefined) assert(list(t.history) && t.history.every(h => object(h) && integer(h.version, Number.MAX_SAFE_INTEGER, 1) && TEMPLATE_STATES.includes(h.state) && stringList(h.fixed) && stringList(h.varies) && list(h.evidence) && optional(h.sources, rows => list(rows, 1000) && rows.every(a => only(a, ['id', 'key']) && id(a.id) && text(a.key, 100) && /^\d+:[a-f0-9]{8}:[a-f0-9]{8}$/.test(a.key))) && timestamp(h.archivedAt)), '模板历史结构无效');
        }

        unique(s.data.PROMPTS, 'id', id, '提示词');
        s.data.PROMPTS.forEach(prompt);
        unique(s.data.TEMPLATES, 'id', id, '模板');
        s.data.TEMPLATES.forEach(template);
        unique(s.data.PROJECTS, 'id', id, '内容');
        s.data.PROJECTS.forEach(project);
        const templateIds = new Set(s.data.TEMPLATES.map(t => t.id));
        s.data.PROJECTS.forEach(p => {
            assert(!p.tpl || templateIds.has(p.tpl), '内容引用的模板不存在');
            if (p.members) p.members.forEach(member => assert(s.data.PROJECTS.some(x => x.id === member && x.kind === '内容'), '合集成员引用无效'));
        });
        unique(s.data.TASKS, 'id', id, '任务');
        s.data.TASKS.forEach(t => {
            assert(text(t.name, 200) && ['codex', 'workbuddy'].includes(t.host) && TASK_STATES.includes(t.state) && integer(t.steps, 100, 1) && integer(t.step, t.steps) && stringList(t.order, 100) && text(t.conv, 200) && optional(t.pid, id) && optional(t.tid, id) && optional(t.mid, id) && optional(t.resultCount, x => integer(x, 10000)), '任务结构无效');
            if (t.request) validateRequest(t.request); else assert(t.state === 'handoff' && (t.legacyDemo === true || t.handoff?.request === null), '无请求的记录只能保留为待交接的历史演示或上下文交接');
            if (t.handoff) {
                const checked = Handoff.validate(t.handoff, {validateRequest});
                assert(checked.ok, checked.message || checked.code);
                assert(t.handoff.context.libraryId === s.libraryId && t.handoff.target.host === t.host && (t.handoff.sourceTaskId === null ? !t.sourceTaskId : t.handoff.sourceTaskId === t.sourceTaskId) && (t.handoff.target.mode !== 'resume' || t.handoff.target.sessionId === t.conv) && JSON.stringify(t.handoff.request) === JSON.stringify(t.request || null), '任务交接与原任务或内容库不一致');
            }
            assert(optional(t.sourceTaskId, id), '来源任务标识无效');
            if (['success', 'partial'].includes(t.state)) assert(t.resultCount > 0, '成功任务缺少真实结果');
        });
        unique(s.trash, 'id', id, '回收记录');
        s.trash.forEach(item => {
            if (item.kind === 'file') {
                assert(id(item.pid), '回收附件所属内容无效');
                asset(item.value);
            } else if (item.kind === 'project') project(item.value);
            else if (item.kind === 'prompt') prompt(item.value);
            else if (item.kind === 'shot') assert(id(item.tid) && source(item.value), '回收原图无效');
            else if (item.kind === 'photo') photo(item.value);
            else throw Error('未知回收记录类型');
        });
        assert(JSON.stringify(s).length * 2 <= MAX_BYTES, '浏览器工作区容量上限为 4 MiB；请先导出备份，减少图片后重试');
        return s;
    }

    function create(D, storage, config) {
        assert(config?.prototype === true && config.appScope === 'nova-content-hub' && ['required', 'disabled'].includes(config.AUTH_MODE), '构建配置无效，请重新构建');
        config = {
            ...config,
            protocolVersion: config.protocolVersion || 1,
            pairId: config.pairId || `${config.appScope}@${config.version}:p1:${config.AUTH_MODE}`
        };
        D.BRAND.version = config.version;
        let state, error = '', readonly = false, auth = 'logged-out';

        function migrateDemo(incoming, upgrade = false) {
            const replacements = D.DEMO_REPLACEMENTS || {};
            let changed = false;

            function walk(value) {
                if (!value || typeof value !== 'object') return false;
                let imageChanged = false, nestedImageChanged = false;
                for (const [key, item] of Object.entries(value)) {
                    if (typeof item !== 'string') {
                        nestedImageChanged = walk(item) || nestedImageChanged;
                        continue;
                    }
                    const replacement = replacements[fingerprint(item)];
                    if (replacement === undefined) continue;
                    changed = true;
                    const oldImage = replacement.startsWith('图库/示例/');
                    if (key === 'content' && oldImage) {
                        delete value.content;
                        imageChanged = true;
                    } else {
                        value[key] = replacement;
                        if (oldImage) imageChanged = true;
                    }
                }
                if (imageChanged) for (const key of ['sha256', 'bytes', 'px', 'type']) delete value[key];
                if ((imageChanged || nestedImageChanged) && Array.isArray(value.shots) && value.state) {
                    value.validation = null;
                    value.evidence = [];
                    value.restoreTest = false;
                    value.state = '待拆解';
                }
                return imageChanged || nestedImageChanged;
            }

            walk(incoming);
            let defaultSeen = false;
            for (const p of incoming.data.ACCOUNT.photos) if (p.use) {
                if (!isOwnPhoto(p) || defaultSeen) {
                    p.use = false;
                    changed = true;
                } else defaultSeen = true;
            }
            changed = installBuiltins(incoming.data, upgrade) || changed;
            return {value: validate(incoming), changed};
        }

        function readDemo(raw, upgrade = false) {
            return migrateDemo(validate(JSON.parse(raw)), upgrade);
        }

        function seed() {
            const data = {};
            KEYS.forEach(k => data[k] = clone(D[k] || []));
            data.SETTINGS.installed = {};
            data.SETTINGS.versions = {};
            data.SETTINGS.hostConfig = {
                codex: {installation: 'unknown', version: '', trust: 'unknown'},
                workbuddy: {installation: 'unknown', version: '', trust: 'unknown'}
            };
            data.SETTINGS.clientId = '';
            data.SETTINGS.bridge = false;
            data.SETTINGS.root = '未绑定（浏览器工作区）';
            data.SETTINGS.pluginDir = '待桌面版安装自媒体插件';
            data.TEMPLATES.forEach(t => {
                t.version = 1;
                t.sample = true;
                t.state = '待拆解';
                t.restoreTest = false;
                t.evidence = [];
                t.validation = null;
            });
            installBuiltins(data);
            data.PROJECTS.forEach(p => {
                p.files.forEach(f => f.id = uid('asset'));
                p.materials.forEach(m => m.batches.forEach(b => {
                    b.cands.forEach(c => c.id = uid('candidate'));
                    if (b.state === 'making') b.state = 'handoff';
                }));
                p.posts.forEach(x => {
                    if (x.pub) x.pub.snapshot = null;
                });
            });
            data.TASKS.forEach(t => {
                t.state = 'handoff';
                t.legacyDemo = true;
                t.step = 0;
                t.conv = '';
                t.why = '历史演示任务，未向宿主提交';
            });
            return {
                format: 'nova-content-hub-browser',
                schema: 1,
                appScope: 'nova-content-hub',
                libraryId: uid('library'),
                data,
                trash: [],
                updatedAt: new Date().toISOString()
            };
        }

        state = seed();
        try {
            const raw = storage.getItem(KEY);
            if (raw) {
                const migrated = readDemo(raw, true);
                state = migrated.value;
                if (migrated.changed) storage.setItem(KEY, JSON.stringify(state));
            }
            const previous = storage.getItem(BACKUP);
            if (previous) {
                // A malformed rollback copy is kept for explicit recovery, never silently erased.
                let migrated;
                try {
                    migrated = readDemo(previous);
                } catch {
                    migrated = null;
                }
                if (migrated?.changed) storage.setItem(BACKUP, JSON.stringify(migrated.value));
            }
        } catch (e) {
            error = '原存储已保留，读取或示例迁移失败：' + e.message;
            readonly = true;
        }

        function apply() {
            KEYS.forEach(k => {
                const v = state.data[k];
                if (Array.isArray(D[k])) D[k].splice(0, D[k].length, ...clone(v));
                else if (D[k] && typeof D[k] === 'object') {
                    Object.keys(D[k]).forEach(x => delete D[k][x]);
                    Object.assign(D[k], clone(v));
                } else D[k] = clone(v);
            });
        }

        apply();
        let committed = clone(state);

        function snapshot() {
            const out = {...state, data: {}};
            KEYS.forEach(k => out.data[k] = clone(D[k]));
            return clone(out);
        }

        function commit() {
            assert(!readonly, error || '工作区只读');
            let writing = false;
            try {
                const next = validate(snapshot());
                next.updatedAt = new Date().toISOString();
                const raw = JSON.stringify(next);
                writing = true;
                storage.setItem(KEY, raw);
                state = next;
                committed = clone(next);
                error = '';
                return next;
            } catch (e) {
                state = clone(committed);
                apply();
                if (writing) throw Error('保存失败：浏览器存储已满或被禁用。修改已回退；请导出工作区备份并减少图片。');
                throw e;
            }
        }

        let transactionDepth = 0;

        function transact(fn) {
            assert(!readonly, error || '只读工作区');
            const before = snapshot();
            transactionDepth++;
            try {
                const result = fn();
                transactionDepth--;
                if (!transactionDepth) commit();
                return result;
            } catch (e) {
                transactionDepth = Math.max(0, transactionDepth - 1);
                state = before;
                apply();
                throw e;
            }
        }

        function mutate(kind, fn) {
            authorize(kind);
            return transact(fn);
        }

        function allowed(kind) {
            if (kind === 'read' || kind === 'export') return true;
            if (readonly && kind !== 'recovery') return false;
            return config.AUTH_MODE === 'disabled' || auth === 'active' || (['grace', 'offline-valid'].includes(auth) && kind === 'write');
        }

        function authorize(kind) {
            assert(allowed(kind), readonly ? error : auth === 'grace' ? '离线宽限演示只允许本地写入，外部动作需恢复在线开通状态' : '此为鉴权交互演示，请在“更多”选择已开通状态；真实授权将在桌面版接入');
        }

        function importBackup(raw) {
            assert(text(raw, MAX_BYTES / 2), '备份文件超过容量上限');
            const incoming = readDemo(raw).value;
            let previous = storage.getItem(KEY) || JSON.stringify(snapshot());
            try {
                previous = JSON.stringify(readDemo(previous).value);
            } catch { /* Keep a damaged original for recovery. */
            }
            // Store the rollback copy first; quota failure must leave the active workspace intact.
            storage.setItem(BACKUP, previous);
            try {
                storage.setItem(KEY, JSON.stringify(incoming));
            } catch {
                throw Error('恢复失败：容量不足，当前工作区未改变');
            }
            state = incoming;
            committed = clone(incoming);
            readonly = false;
            error = '';
            apply();
            return true;
        }

        function referenceChoices(t, p) {
            const refs = [];
            for (const [i, a] of (t?.generatedReferences || []).entries()) if (a.templateVersion <= t.version) refs.push({
                id: a.id,
                version: a.templateVersion,
                img: a.path,
                note: `AI 生成组内样张 ${i + 1} · 待人工验收，只参考风格与构图`,
                kind: 'ai'
            });
            if (t) t.shots.forEach((img, i) => {
                if ((t.generatedReferences || []).some(a => a.path === img)) return;
                const n = (t.assets || []).findIndex(a => a.path === img), a = t.assets?.[n];
                refs.push({
                    id: a ? a.id || `${t.id}-${a.role || 'asset'}-${n}` : `source-${t.id}-${i}`,
                    version: t.version,
                    img,
                    note: raster(img) ? `模板组内样张 ${i + 1}：参考共同风格与构图差异，不保留原字` : 'SVG 结构示意：仅看分区，不计入真实样张',
                    kind: 'template'
                });
            });
            for (const [i, a] of (isBuiltinTemplate(t) ? t.assets || [] : []).entries()) if (!refs.some(r => r.img === a.path)) refs.push({
                id: a.id || `${t.id}-${a.role || 'asset'}-${i}`,
                version: t.version,
                img: a.path,
                note: 'SVG 结构示意：仅看分区，不计入真实样张',
                kind: 'template'
            });
            for (const m of p?.materials || []) for (const c of D.candsOf(m)) if (c.use || c.fav) refs.push({
                id: c.id,
                version: 1,
                img: c.img,
                note: `本内容已选/收藏候选 · ${m.format} ${c.no} 号`,
                kind: 'candidate'
            });
            for (const a of D.ACCOUNT.photos) if (isOwnPhoto(a)) refs.push({
                id: a.id,
                version: 1,
                img: a.img,
                note: '本人身份参考：用户本地上传；需另行导出并附给助手，保留五官、发型，用本人替换风格样图人物，不复制模板真人身份',
                kind: 'account'
            });
            return refs;
        }

        function styleReferences(t, p) {
            const samples = templateSamples(t);
            return referenceChoices(t, p).filter(a => ['ai', 'template'].includes(a.kind) && samples.includes(a.img));
        }

        function requestReferenceSources(req) {
            const current = D.tplOf(req.templateId),
                historic = current?.history?.find(h => h.version === req.templateVersion);
            const t = current?.version === req.templateVersion ? current : historic?.definition || TRUSTED_BUILTINS.find(t => t.id === req.templateId && t.version === req.templateVersion);
            const choices = referenceChoices(t ? {...t, shots: t.shots || []} : null, D.byId(req.targetId));
            if (req.kind !== 'generate' && t?.shots) choices.push(...t.shots.map((img, i) => ({
                id: `source-${t.id}-${i}`,
                version: t.version,
                img
            })));
            choices.push(...TRUSTED_BUILTINS.filter(t => t.id === req.templateId && t.version === req.templateVersion).flatMap(t => referenceChoices(t, null)));
            for (const m of D.byId(req.targetId)?.materials || []) for (const c of D.candsOf(m)) choices.push({
                id: c.id,
                version: 1,
                img: c.img
            });
            return req.references.map(r => {
                let img = choices.find(a => a.id === r.id && a.version === r.version)?.img || (r.version === 1 ? photoById(r.id)?.img : undefined);
                if (!img && historic?.sources && r.version === historic.version) {
                    const record = historic.sources.find(a => a.id === r.id);
                    if (record) img = [...(current?.shots || []), ...state.trash.filter(a => a.kind === 'shot' && a.tid === req.templateId).map(a => a.value)].find(src => fingerprint(src) === record.key);
                }
                assert(img && source(img), '参考图已不可用：' + r.id + '；请恢复原图后再导出');
                return {...r, img};
            });
        }

        function request(kind, target, options = {}) {
            authorize('external');
            assert(id(target.id), '目标 ID 无效');
            const t = kind === 'generate' ? D.tplOf(options.templateId) : target;
            assert(t && id(t.id), '模板不存在');
            if (kind === 'generate') {
                assert(D.byId(target.id) === target, '生成目标必须来自当前内容库');
                assert(isTemplateUsable(t), '请先完成模板规则和还原验收，或使用随包原创设计');
                assert(text(options.title, 200) && options.title.trim(), '标题不能为空');
                assert(Number.isInteger(options.count) && options.count >= 1 && options.count <= 20, '数量必须是 1 到 20 的整数');
                assert(ratio(options.ratio), '比例无效');
                assert(options.pixels === null || Array.isArray(options.pixels) && options.pixels.length === 2 && options.pixels.every(x => Number.isInteger(x) && x > 0 && x <= 16384), '像素必须在 1..16384 内');
                assert(Array.isArray(options.references) && options.references.length <= 32, '本次参考超过 32 张，请明确取消部分参考后重试');
                assert(referenceList(options.references) && new Set(options.references.map(x => x.id)).size === options.references.length, '参考引用必须包含唯一稳定 ID');
                assert(optional(options.brief, x => text(x, 1500) && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(x)), '内容说明请控制在 1500 字以内');
                const allowedRefs = referenceChoices(t, target);
                assert(options.references.every(r => allowedRefs.some(a => a.id === r.id && a.version === r.version)), '参考不属于当前模板版本、本内容已选候选或已授权素材');
                options = {
                    ...options, references: options.references.map(r => {
                        const a = allowedRefs.find(a => a.id === r.id);
                        return {id: a.id, version: a.version, note: a.note};
                    })
                };
            }
            const refs = kind === 'generate' ? options.references || [] : target.shots.map((s, i) => ({
                id: `source-${t.id}-${i}`,
                version: t.version,
                note: '用户须另行导出并交给宿主的原图'
            }));
            assert(refs.length <= 32, '每次请求最多引用 32 张原图或候选');
            const {brief = '', ...protocolOptions} = options, normalized = clone(protocolOptions);
            if (normalized.ratio) normalized.ratio = ratio(normalized.ratio);
            if (normalized.pixels) {
                const [a, b] = normalized.ratio.split(':').map(Number);
                assert(Math.abs(normalized.pixels[0] / normalized.pixels[1] - a / b) <= 0.01, '目标像素与比例不一致');
            }
            const req = {
                protocol: 'nova-content-hub-request',
                version: 1,
                appScope: 'nova-content-hub',
                libraryId: state.libraryId,
                targetId: target.id,
                requestId: uid('request'),
                kind,
                templateId: t.id,
                templateVersion: t.version,
                libraryRoot: null,
                pathsResolved: false,
                authMode: config.AUTH_MODE,
                pairId: config.pairId || `${config.appScope}@${config.version}:p1:${config.AUTH_MODE}`,
                paths: {
                    template: `模板/${t.id}/模板.json`,
                    rules: `模板/${t.id}/拆解.md`,
                    target: kind === 'generate' ? `内容/${target.id}` : `模板/${target.id}`
                },
                skill: kind === 'analyze' ? 'nova-content-template-study' : kind === 'restore' ? 'nova-content-template-restore' : 'nova-content-cover',
                cli: COMMAND,
                options: normalized,
                rules: kind === 'generate' ? requestRules(t, {...normalized, brief}) : clone({
                    fixed: t.fixed,
                    varies: t.varies,
                    evidence: t.evidence
                }),
                references: clone(refs),
                createdAt: new Date().toISOString()
            };
            return validateRequest(req);
        }

        function requestRules(t, o) {
            const g = t.generation;
            const hasPerson = (o.references || []).some(r => D.ACCOUNT.photos.some(p => p.id === r.id && isOwnPhoto(p)));
            // Keep composition and photographic checks; replace only the default subject policy.
            const adaptSubject = x => {
                const value = (g ? x.split(g.subjectPolicy).join('') : x).replaceAll('不采用轨道球、人物或真实设备', '不采用轨道球或真实设备');
                return hasPerson ? value : value.replaceAll('一个人物的大头近景', '本次主题物件的近景').replaceAll('半身肖像', '主题主视觉').replaceAll('肖像', '主题主视觉').replaceAll('人像', '主题主视觉').replaceAll('人物', '本次主体');
            };
            const fixed = t.fixed.map(adaptSubject).filter(Boolean),
                varies = t.varies.map(adaptSubject).filter(Boolean);
            const subject = hasPerson ? '用户选中的本人照片是唯一人物身份来源，本次人物选择优先于模板示例主体类型；保留本人五官、脸型、发型，用本人替换参考图人物。沿用主体区域，必要时调整留白让人物不遮字。模板和AI样图只参考风格，不复制其中真人身份；照片未另行附上时先索取照片，不得冒用样图人物。' : '本次不放人物；使用文字、图形或主题物件表达内容，移除模板和AI样图中的人物，不复制任何示例人脸。';
            if (g) {
                const values = {
                    title: o.title || '',
                    topic: o.title || '',
                    ratio: o.ratio || t.ratio,
                    count: o.count || '',
                    subject
                };
                const segments = adaptSubject(g.promptTemplate.split(g.subjectPolicy).join('')).split(/(?<=[。；，])/u).filter(part => !g.variables.some(v => !v.required && !values[v.key] && new RegExp('\\{\\{?' + v.key + '\\}?\\}').test(part)));
                const prompt = segments.join('').replace(/\{\{?([a-zA-Z][a-zA-Z0-9_]*)\}?\}/g, (all, k) => Object.hasOwn(values, k) ? String(values[k]) : all);
                fixed.push('生成目的：' + g.intent, '主体策略：' + subject, '文字策略：' + g.textPolicy, '参考策略：' + g.referencePolicy, '本次提示词骨架：' + prompt);
                fixed.push(...g.negative.map(x => '避坑：' + x), ...g.qualityChecks.map(adaptSubject).filter(Boolean).map(x => '人工验收：' + x));
                varies.push(`本次标题：${o.title || '未指定'}；目标比例：${o.ratio || t.ratio}。已提供的标题与比例直接使用；超长标题先按模板换行或缩短建议确认，比例变化重新排版，禁止拉伸裁字。`);
            }
            fixed.push('整组风格约束：综合本次选中组内样张的共同配色、字体与信息层级，保持同批主题与人物身份一致；学习组内不同构图、留白、镜头和元素位置，生成指定数量的不同候选。样张数量不等于成品数量，不逐张照搬原文或重复同一构图。');
            fixed.push('本次人物约束（优先于模板中的人物示意）：' + subject);
            fixed.push(hasPerson ? '同批候选保持同一人物身份、主题与风格；在不改脸、不遮字的前提下，可改变表情、镜头距离、姿态或布局形成差异，不能只换底色。' : '同批候选保持主题与风格一致；可改变镜头距离、主题物件和布局形成差异，不能只换底色。');
            if (o.brief?.trim()) {
                const brief = o.brief.trim();
                for (let i = 0; i < brief.length; i += 900) fixed.push(`本次内容说明 ${Math.floor(i / 900) + 1}：` + brief.slice(i, i + 900));
                fixed.push('事实约束：只使用用户提供的事实，不凭空补充数字、经历或结论。');
            } else fixed.push('本次未提供内容说明：仅围绕标题表达主题，不凭空补充事实、数字、经历或结论。');
            return clone({fixed, varies, evidence: t.evidence});
        }

        function addTask(req, extra = {}) {
            const task = {
                id: uid('task'),
                pid: req.kind === 'generate' ? req.targetId : undefined,
                tid: req.kind !== 'generate' ? req.targetId : undefined,
                request: req,
                name: req.kind === 'generate' ? '出封面' : req.kind === 'restore' ? '还原模板' : '拆解模板',
                host: D.SETTINGS.host,
                state: 'handoff',
                step: 0,
                steps: 3,
                order: ['交接', '导入', '验收'],
                conv: '', ...extra,
                host: D.SETTINGS.host
            };
            // JSON cannot represent undefined; keep the persisted model explicit.
            Object.keys(task).forEach(k => task[k] === undefined && delete task[k]);
            task.handoff = createHandoff(task);
            D.TASKS.push(task);
            return task;
        }

        function setHost(host) {
            assert(['codex', 'workbuddy'].includes(host), '宿主无效');
            D.SETTINGS.host = host;
        }

        function createHandoff(task = null, options = {}) {
            const host = options.host || task?.host || D.SETTINGS.host, mode = options.mode || 'new';
            assert(!task || host === task.host || options.sourceTaskId === task.id, '历史任务绑定原助手，跨助手请显式创建新交接');
            const fallback = task?.handoff?.context;
            const req = task?.request || null, p = options.project || D.byId(task?.pid),
                t = options.template || D.tplOf(req?.templateId || task?.tid);
            const envelope = {
                protocol: 'nova-content-hub-handoff',
                version: 1,
                appScope: 'nova-content-hub',
                authMode: req?.authMode || config.AUTH_MODE,
                pairId: req?.pairId || config.pairId,
                handoffId: uid('handoff'),
                createdAt: new Date().toISOString(),
                target: {host, mode, sessionId: mode === 'resume' ? task?.conv || null : null},
                sourceTaskId: options.sourceTaskId || task?.sourceTaskId || null,
                request: req ? clone(req) : null,
                context: {
                    libraryId: state.libraryId,
                    project: p ? {
                        id: p.id,
                        name: p.name,
                        summary: options.summary || `内容：${p.name}；渠道：${p.channels.join('、') || '未指定'}；附件 ${p.files.length} 个；物料 ${p.materials.length} 个${p.materials.length > 16 ? '（本次仅列前16个物料引用）' : ''}。浏览器附件与图片须另行导出。`
                    } : options.summary ? {
                        id: 'workspace-context',
                        name: '工作区交接',
                        summary: options.summary
                    } : clone(fallback?.project || null),
                    template: (t || req) ? {
                        id: req?.templateId || t.id,
                        version: req?.templateVersion || t.version,
                        fixed: clone(req?.rules.fixed || t.fixed),
                        varies: clone(req?.rules.varies || t.varies)
                    } : clone(fallback?.template || null),
                    materials: p ? p.materials.slice(0, 16).map(m => ({
                        id: m.id,
                        name: m.name
                    })) : clone(fallback?.materials || []),
                    references: req ? req.references.map(r => ({
                        id: r.id,
                        name: (r.note || r.id).slice(0, 300)
                    })) : clone(fallback?.references || [])
                }
            };
            const checked = Handoff.validate(envelope, {
                ...(envelope.pairId === config.pairId ? {release: config} : {}),
                validateRequest
            });
            assert(checked.ok, checked.message || checked.code);
            return envelope;
        }

        function transferTask(task) {
            assert(task && task.host !== D.SETTINGS.host, '请先切换当前助手');
            let next;
            if (task.request) {
                const req = clone(task.request);
                req.requestId = uid('request');
                req.createdAt = new Date().toISOString();
                req.authMode = config.AUTH_MODE;
                req.pairId = config.pairId;
                let mid;
                if (req.kind === 'generate') {
                    const p = D.byId(req.targetId);
                    assert(p, '请先从回收区恢复目标内容，再创建封面交接');
                    let m = D.matOf(p, task.mid) || D.matOfFormat(p, req.options.format);
                    if (!m) {
                        m = D.newMat(req.options.format, req.templateId);
                        p.materials.push(m);
                    }
                    mid = m.id;
                    m.batches.push({
                        no: Math.max(0, ...m.batches.map(b => b.no)) + 1,
                        at: D.TODAY,
                        tpl: req.templateId,
                        title: req.options.title,
                        cands: [],
                        state: 'handoff',
                        requestId: req.requestId,
                        ref: []
                    });
                }
                next = addTask(req, {sourceTaskId: task.id, ...(task.handoff ? {handoff: clone(task.handoff)} : {}), ...(mid ? {mid} : {}), ...(task.pid ? {pid: task.pid} : {}), ...(task.tid ? {tid: task.tid} : {})});
            } else {
                next = {
                    id: uid('task'),
                    name: '项目摘要交接',
                    host: D.SETTINGS.host,
                    state: 'handoff',
                    step: 0,
                    steps: 1,
                    order: ['交接'],
                    conv: '',
                    sourceTaskId: task.id, ...(task.handoff ? {handoff: clone(task.handoff)} : {}), ...(task.pid ? {pid: task.pid} : {}), ...(task.tid ? {tid: task.tid} : {})
                };
                next.handoff = createHandoff(next);
                D.TASKS.push(next);
            }
            return next;
        }

        function taskState(task, next) {
            const transitions = {
                handoff: ['running', 'interrupted', 'failed'],
                running: ['review', 'interrupted', 'failed'],
                review: ['success', 'partial', 'failed', 'interrupted'],
                interrupted: ['running'],
                failed: ['running'],
                success: [],
                partial: []
            };
            assert(task && transitions[task.state]?.includes(next), '不允许的任务状态转换');
            if (['success', 'partial'].includes(next)) assert(task.resultCount > 0, '没有真实产物，不能标成功');
            task.state = next;
            if (task.pid && task.mid) {
                const m = D.matOf(D.byId(task.pid), task.mid);
                const b = m?.batches.find(x => x.requestId === task.request?.requestId);
                if (b && !(next === 'running' && b.cands.length)) b.state = next;
            }
        }

        function addProject(name, kind = '内容', channels = [], members = []) {
            assert(text(name, 200) && name.trim(), '名称不能为空');
            assert(!D.PROJECTS.some(p => p.kind === kind && p.name === name.trim()), '同名记录已存在');
            assert(['内容', '合集'].includes(kind), '不支持的内容类型');
            members.forEach(member => assert(D.byId(member)?.kind === '内容', '合集成员必须是已有内容'));
            const p = {
                id: uid('project'),
                name: name.trim(),
                kind,
                folder: '内容/' + uid('entry'),
                dates: kind === '合集' ? {from: D.TODAY, to: D.TODAY} : {record: ''},
                plan: '',
                tpl: '',
                channels,
                sample: false,
                files: [],
                materials: [],
                posts: [], ...(kind === '合集' ? {members} : {})
            };
            D.PROJECTS.push(p);
            return p;
        }

        function removeFile(p, assetId) {
            const i = p.files.findIndex(f => f.id === assetId);
            assert(i >= 0, '找不到附件');
            state.trash.push({
                id: uid('trash'),
                kind: 'file',
                pid: p.id,
                value: clone(p.files[i]),
                deletedAt: new Date().toISOString()
            });
            p.files.splice(i, 1);
        }

        function addPhotos(files) {
            return mutate('write', () => {
                assert(list(files, 32), '一次最多上传 32 张照片');
                const hasDefault = D.ACCOUNT.photos.some(p => isOwnPhoto(p) && p.use);
                files.forEach((f, i) => {
                    assert(isOwnPhoto(f) && pixelPair(f.px) && integer(f.bytes, 1024 * 1024, 1) && !D.ACCOUNT.photos.some(p => p.id === f.id) && !state.trash.some(x => x.kind === 'photo' && x.value.id === f.id), '请上传已解码的 PNG / JPEG / WebP / GIF 本人照片，不能复用历史照片 ID');
                    D.ACCOUNT.photos.push({
                        id: f.id,
                        name: f.name,
                        img: f.img,
                        bytes: f.bytes,
                        px: clone(f.px),
                        sha256: f.sha256 || '',
                        use: !hasDefault && i === 0
                    });
                });
            });
        }

        function defaultPhoto() {
            return D.ACCOUNT.photos.find(p => isOwnPhoto(p) && p.use) || null;
        }

        function setDefaultPhoto(photoId) {
            return mutate('write', () => {
                assert(D.ACCOUNT.photos.some(p => p.id === photoId && isOwnPhoto(p)), '找不到本人照片');
                D.ACCOUNT.photos.forEach(p => p.use = p.id === photoId);
            });
        }

        function removePhoto(photoId) {
            return mutate('write', () => {
                const i = D.ACCOUNT.photos.findIndex(p => p.id === photoId);
                assert(i >= 0, '找不到照片');
                const p = D.ACCOUNT.photos[i];
                state.trash.push({
                    id: uid('trash'),
                    kind: 'photo',
                    value: clone(p),
                    deletedAt: new Date().toISOString()
                });
                D.ACCOUNT.photos.splice(i, 1);
                if (p.use) {
                    const next = D.ACCOUNT.photos.find(isOwnPhoto);
                    if (next) next.use = true;
                }
            });
        }

        function photoById(photoId) {
            return D.ACCOUNT.photos.find(p => p.id === photoId && isOwnPhoto(p)) || state.trash.find(x => x.kind === 'photo' && x.value.id === photoId && isOwnPhoto(x.value))?.value || null;
        }

        function restore(trashId) {
            const i = state.trash.findIndex(x => x.id === trashId), item = state.trash[i];
            assert(item, '找不到回收记录');
            if (item.kind === 'file') {
                const p = D.byId(item.pid);
                assert(p, '请先恢复所属内容');
                assert(!p.files.some(x => x.id === item.value.id), '附件已存在');
                p.files.push(clone(item.value));
            } else if (item.kind === 'project') {
                assert(!D.byId(item.value.id), '内容已存在');
                D.PROJECTS.push(clone(item.value));
            } else if (item.kind === 'prompt') {
                assert(!D.PROMPTS.some(x => x.id === item.value.id), '提示词已存在');
                D.PROMPTS.push(clone(item.value));
            } else if (item.kind === 'shot') {
                const t = D.tplOf(item.tid);
                assert(t, '模板不存在');
                archive(t);
                t.version++;
                t.shots.push(item.value);
                if (!t.img) t.img = item.value;
                t.state = '待拆解';
                t.evidence = [];
                t.restoreTest = false;
                t.validation = null;
            } else if (item.kind === 'photo') {
                authorize('write');
                assert(!D.ACCOUNT.photos.some(x => x.id === item.value.id), '照片已存在');
                D.ACCOUNT.photos.push({...clone(item.value), use: isOwnPhoto(item.value) && !defaultPhoto()});
            } else throw Error('未知回收类型');
            state.trash.splice(i, 1);
        }

        function publish(p, post, at, link) {
            assert(date(at), '发布日期无效');
            assert(url(link) !== null, '链接仅支持 HTTP(S)');
            const m = D.matOf(p, post.mat), c = m && D.usedCand(m),
                b = m && m.batches.find(x => x.cands.some(y => y.id === c?.id));
            post.pub = {
                at: date(at),
                link: url(link),
                snapshot: post.pub?.snapshot || (c ? {
                    candidateId: c.id,
                    batch: b.no,
                    img: c.img,
                    sha256: c.sha256 || '',
                    px: c.px || null
                } : null)
            };
        }

        function rules(t, input) {
            assert(only(input, ['fixed', 'varies', 'evidence', 'audience', 'scenario', 'contentType', 'useCases', 'anatomy', 'generation']), '规则必须是 JSON 对象且不能包含未知字段');
            templateDesign(input);
            ruleSet({fixed: input.fixed, varies: input.varies || [], evidence: input.evidence}, t.shots.length);
            assert(Array.isArray(input.fixed) && input.fixed.length && input.fixed.every(x => text(x, 1000) && x.trim()), '请提供 fixed 规则列表');
            assert(Array.isArray(input.evidence) && input.evidence.length && input.evidence.every(x => Number.isInteger(x.sourceIndex) && t.shots[x.sourceIndex] && text(x.rule, 1000) && x.rule.trim()), '每条证据必须引用现有原图的 sourceIndex（从 0 开始）和 rule');
            archive(t);
            t.fixed = clone(input.fixed);
            t.varies = clone(input.varies || []);
            t.evidence = clone(input.evidence);
            t.state = '待还原';
            t.version++;
            t.validation = null;
            for (const key of ['audience', 'scenario', 'contentType', 'useCases', 'anatomy', 'generation']) if (input[key] !== undefined) t[key] = clone(input[key]);
        }

        function builtinUpdate(t) {
            const latest = BUILTINS.find(x => x.id === t?.id);
            if (!latest) return null;
            const refs = t.generatedReferences || [], nextRefs = latest.generatedReferences || [];
            const addedReferences = latest.version === t.version && isBuiltinTemplate(t) && definitionKeys.filter(k => k !== 'generatedReferences').every(k => JSON.stringify(t[k]) === JSON.stringify(latest[k])) && nextRefs.length > refs.length && refs.every(a => nextRefs.some(b => JSON.stringify(a) === JSON.stringify(b)));
            return isBuiltinTemplate(t) && (latest.version > t.version || addedReferences) ? latest : null;
        }

        function updateBuiltin(t) {
            const latest = builtinUpdate(t);
            assert(latest, '没有更新的内置定义');
            archive(t);
            if (latest.version === t.version) {
                t.generatedReferences = clone(latest.generatedReferences);
                return t;
            }
            const history = t.history;
            const name = t.name, used = t.used;
            Object.keys(t).forEach(k => delete t[k]);
            Object.assign(t, clone(latest), {name, used, history});
            return t;
        }

        function acceptTemplate(t) {
            assert(t.fixed.length && t.evidence.length && source(t.validation?.restoreImage), '请先导入规则和对应还原图');
            t.validation.accepted = true;
            t.validation.acceptedAt = new Date().toISOString();
            t.restoreTest = true;
            t.state = '可用';
        }

        return {
            config,
            key: KEY,
            maxBytes: MAX_BYTES,
            D,
            uid,
            date,
            ratio,
            url,
            path,
            source,
            snapshot,
            raw: () => storage.getItem(KEY),
            commit,
            transact,
            mutate,
            allowed,
            authorize,
            importBackup,
            request,
            addTask,
            taskState,
            archive,
            addProject,
            removeFile,
            restore,
            publish,
            rules,
            acceptTemplate,
            setHost,
            createHandoff,
            transferTask,
            referenceChoices,
            templateSamples,
            styleReferences,
            requestReferenceSources,
            isOwnPhoto,
            addPhotos,
            defaultPhoto,
            setDefaultPhoto,
            removePhoto,
            photoById,
            builtinUpdate,
            updateBuiltin,
            isTemplateUsable,
            isBuiltinTemplate,
            get trash() {
                return state.trash;
            },
            get error() {
                return error;
            },
            get readonly() {
                return readonly;
            },
            get libraryId() {
                return state.libraryId;
            },
            get auth() {
                return auth;
            },
            setAuth(value) {
                assert(['logged-out', 'checking', 'network-error', 'unlicensed', 'expired', 'grace', 'offline-valid', 'offline-expired', 'invalid', 'revoked', 'active'].includes(value), '未知演示状态');
                auth = value;
            },
            previous() {
                const raw = storage.getItem(BACKUP);
                assert(raw, '还没有上一次恢复的备份');
                return importBackup(raw);
            },
            removeProject(p) {
                assert(!D.PROJECTS.some(x => x.members?.includes(p.id)), '请先从合集中移除这条内容');
                state.trash.push({
                    id: uid('trash'),
                    kind: 'project',
                    value: clone(p),
                    deletedAt: new Date().toISOString()
                });
                D.PROJECTS.splice(D.PROJECTS.indexOf(p), 1);
            },
            removeShot(t, index) {
                const old = t.shots[index];
                assert(old, '原图不存在');
                archive(t);
                t.version++;
                state.trash.push({id: uid('trash'), kind: 'shot', tid: t.id, value: old});
                t.shots.splice(index, 1);
                if (t.img === old) t.img = t.shots[0] || '';
                t.state = '待拆解';
                t.evidence = [];
                t.restoreTest = false;
                t.validation = null;
            }
        };
    }

    return {
        create,
        validate,
        validateRequest,
        isTemplateUsable,
        isBuiltinTemplate,
        utf8Bytes,
        date,
        ratio,
        url,
        path,
        source,
        KEY,
        MAX_BYTES
    };
});
