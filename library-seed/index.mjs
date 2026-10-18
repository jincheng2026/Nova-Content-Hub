import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const defaultBundle = fileURLToPath(new URL('../', import.meta.url));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const parse = file => JSON.parse(fs.readFileSync(file, 'utf8'));

function sourceFile(root, relative) {
    if (typeof relative !== 'string' || !relative || /[\\\u0000-\u001f]/.test(relative) ||
        path.isAbsolute(relative) || /^[a-z]:/i.test(relative) || relative.split('/').some(part => !part || part === '.' || part === '..')) {
        throw new Error('内置资源路径无效');
    }
    const full = path.join(root, ...relative.split('/'));
    const real = fs.realpathSync(full);
    const inside = path.relative(fs.realpathSync(root), real);
    if (!inside || inside === '..' || inside.startsWith(`..${path.sep}`) || path.isAbsolute(inside) || !fs.statSync(real).isFile()) {
        throw new Error('内置资源超出安装包范围');
    }
    return real;
}

// bundleRoot comes from the packaged app, never from renderer input.
export function installBuiltins(library, bundleRoot = defaultBundle) {
    const catalog = parse(sourceFile(bundleRoot, 'builtin-templates/catalog.json'));
    const prompts = parse(sourceFile(bundleRoot, 'builtin-prompts/catalog.json'));
    const registry = parse(sourceFile(bundleRoot, 'assets/ai-reference-prompts/generated-files.json'));
    if (catalog.schema !== 1 || !Array.isArray(catalog.templates) || prompts.format !== 'nova-content-prompts' ||
        prompts.schemaVersion !== 1 || !Array.isArray(prompts.prompts) || !Array.isArray(registry)) throw new Error('内置目录格式不兼容');
    const generated = new Map(registry.map(item => [item.file, item]));
    const prepared = [];
    const references = new Set();
    const structures = new Set();
    // Preflight every source before the first write so a missing/bad bundled image is clear.
    for (const definition of catalog.templates) {
        if (!/^builtin-[a-z0-9-]+$/.test(definition.id) || !Number.isSafeInteger(definition.version) || definition.version < 1 ||
            !Array.isArray(definition.generatedReferences) || !definition.generatedReferences.length) throw new Error('内置模板定义无效');
        const resources = new Map();
        for (const ref of definition.generatedReferences) {
            if (!ref.path.endsWith('.png')) throw new Error('内置风格样张必须为实际 PNG');
            const file = sourceFile(bundleRoot, `原型/${ref.path}`);
            const bytes = fs.readFileSync(file);
            const registered = generated.get(path.basename(file));
            if (!registered || registered.bytes !== bytes.length || registered.sha256 !== sha256(bytes)) throw new Error(`内置图片校验失败：${ref.id}`);
            resources.set(ref.path, {file, purpose: 'template-reference', role: 'style'});
            references.add(ref.path);
        }
        for (const asset of definition.assets || []) {
            if (typeof asset.path !== 'string' || !asset.path.endsWith('.svg')) throw new Error('内置结构图定义无效');
            const file = sourceFile(bundleRoot, `原型/${asset.path}`);
            resources.set(asset.path, {file, purpose: 'template-structure', role: 'structure'});
            structures.add(asset.path);
        }
        if (![definition.img, ...definition.shots].every(key => resources.has(key))) throw new Error('内置预览缺少对应资产');
        prepared.push({definition, resources});
    }
    const seenPrompts = new Set();
    for (const prompt of prompts.prompts) {
        if (!/^builtin-prompt-[a-z0-9-]+$/.test(prompt.id) || seenPrompts.has(prompt.id) || typeof prompt.body !== 'string' ||
            !prompt.body.trim() || prompt.provenance?.origin !== 'original' || prompt.provenance?.license !== 'project-original') throw new Error('内置提示词定义无效');
        seenPrompts.add(prompt.id);
    }
    const templates = [];
    for (const {definition, resources} of prepared) {
        const installed = {};
        for (const [key, input] of resources) {
            const asset = library.importAsset(input.file, {purpose: input.purpose});
            installed[key] = {
                assetHash: asset.assetHash,
                bytes: asset.bytes,
                detectedType: asset.detectedType,
                role: input.role
            };
        }
        const template = library.installBuiltinTemplate({
            id: definition.id,
            name: definition.name,
            version: definition.version,
            definition,
            resources: installed
        });
        templates.push({id: template.id, version: definition.version});
    }
    // A user edit or deletion remains authoritative; startup seeding never overwrites it.
    const existingKeys = new Set([...library.listPrompts(), ...library.listPromptTrash()].map(item => item.builtinKey).filter(Boolean));
    let createdPrompts = 0;
    for (const prompt of prompts.prompts) {
        if (existingKeys.has(prompt.id)) continue;
        const {title, body, category, when, summary, tags, provenance} = prompt;
        try {
            library.createPrompt({title, body, category, when, summary, tags, provenance, builtinKey: prompt.id});
            createdPrompts++;
        } catch (error) {
            if (error.code !== 'CONFLICT' || ![...library.listPrompts(), ...library.listPromptTrash()].some(item => item.builtinKey === prompt.id)) throw error;
        }
        existingKeys.add(prompt.id);
    }
    return {
        templates,
        styleSamples: references.size,
        structureSamples: structures.size,
        prompts: prompts.prompts.length,
        createdPrompts
    };
}
