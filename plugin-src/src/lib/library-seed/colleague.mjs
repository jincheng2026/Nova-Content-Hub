import fs from 'node:fs';
import {createHash} from 'node:crypto';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const base = 'plugin-src/resources/colleague-library/';

// Only packaged source data is read here; source documents never become agent instructions.
export function prepareColleagueBuiltins(resolve) {
    const catalog = JSON.parse(fs.readFileSync(resolve(`${base}catalog.json`), 'utf8'));
    if (catalog.format !== 'nova-colleague-library' || catalog.schemaVersion !== 1 || !Array.isArray(catalog.files) ||
        !Array.isArray(catalog.templates) || !Array.isArray(catalog.prompts)) throw Error('同事内置资源目录格式无效');
    const files = new Map();
    for (const item of catalog.files) {
        if (files.has(item.path) || item.path !== `sources/${item.sourcePath}` ||
            !/^项目\/(02_内容素材\/对标封面|06_提示词)\//.test(item.sourcePath)) throw Error('同事内置资源来源路径无效');
        const file = resolve(`${base}${item.path}`);
        const bytes = fs.readFileSync(file);
        if (bytes.length !== item.bytes || sha256(bytes) !== item.sha256) throw Error(`同事内置资源校验失败：${item.path}`);
        files.set(item.path, {file, bytes, descriptor: item});
    }
    const prepared = [];
    const templateIds = new Set();
    const references = new Set();
    const structures = new Set();
    for (const definition of catalog.templates) {
        if (!/^builtin-colleague-[a-z0-9-]+$/.test(definition.id) || templateIds.has(definition.id) || !Number.isSafeInteger(definition.version) || definition.version < 1 ||
            definition.accepted !== false || definition.aiTested !== false || definition.validation?.kind !== 'source-verified-design' ||
            !Array.isArray(definition.referenceImages) || !definition.referenceImages.length || !Array.isArray(definition.fixed) ||
            !definition.fixed.length || typeof definition.generation?.promptTemplate !== 'string') throw Error('同事内置模板设计说明无效');
        templateIds.add(definition.id);
        const resources = new Map();
        for (const ref of definition.referenceImages) {
            const source = files.get(ref.path);
            if (!source || !/\.(png|jpe?g|webp)$/i.test(ref.path) || source.descriptor.sha256 !== ref.sha256 || source.descriptor.bytes !== ref.bytes) throw Error('同事模板原图缺少来源证据');
            resources.set(ref.path, {file: source.file, assetHash: source.descriptor.sha256, purpose: 'template-reference', role: 'style'});
            references.add(ref.path);
        }
        for (const asset of definition.assets) {
            const source = files.get(asset.path);
            if (!source || !/\.(md|json)$/.test(asset.path) || source.descriptor.sha256 !== asset.sha256 || source.descriptor.bytes !== asset.bytes) throw Error('同事模板拆解缺少来源证据');
            resources.set(asset.path, {file: source.file, assetHash: source.descriptor.sha256, purpose: 'template-structure', role: 'structure'});
            structures.add(asset.path);
        }
        const ruleSource = files.get(definition.validation.ruleSource);
        if (!ruleSource || ruleSource.descriptor.sha256 !== definition.validation.ruleSourceSha256 ||
            ruleSource.bytes.toString('utf8') !== definition.designNotes || definition.rules?.length !== 1 || definition.rules[0] !== definition.designNotes ||
            ![definition.img, ...definition.shots].every(key => resources.get(key)?.role === 'style') ||
            definition.shots.length !== definition.referenceImages.length) throw Error('同事模板完整规则或样张对应关系无效');
        prepared.push({definition, resources});
    }
    const promptIds = new Set(), bodies = new Set();
    for (const prompt of catalog.prompts) {
        const provenance = prompt.provenance;
        const content = typeof prompt.body === 'string' ? prompt.body.replace(/\r\n/g, '\n').trim() : '';
        if (!/^builtin-prompt-colleague-[a-f0-9]{24}$/.test(prompt.id) || promptIds.has(prompt.id) || typeof prompt.body !== 'string' ||
            !content || bodies.has(content) || provenance?.origin !== 'authorized-colleague-handoff' ||
            provenance.license !== 'user-authorized-reuse' || sha256(Buffer.from(prompt.body)) !== provenance.bodySha256 ||
            prompt.id !== `builtin-prompt-colleague-${provenance.bodySha256.slice(0, 24)}` || !provenance.sources?.length) throw Error('同事内置提示词正文或来源无效');
        for (const [index, origin] of provenance.sources.entries()) {
            const source = files.get(origin.path);
            const raw = source?.bytes.toString('utf8');
            const front = raw && /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(raw);
            if (!front || source.descriptor.sha256 !== origin.sha256 || (index === 0 ? raw.slice(front[0].length) !== prompt.body : raw.slice(front[0].length).replace(/\r\n/g, '\n').trim() !== content)) throw Error('同事提示词未逐字保留来源正文');
        }
        promptIds.add(prompt.id);
        bodies.add(content);
    }
    return {prepared, prompts: catalog.prompts, styleSamples: references.size, structureSamples: structures.size};
}
