import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareColleagueBuiltins} from './colleague.mjs';

const defaultBundle = fileURLToPath(new URL('../../../../', import.meta.url));
const parse = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const promptContent = body => body.replace(/\r\n/g, '\n').trim();

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
    const prompts = parse(sourceFile(bundleRoot, 'plugin-src/resources/builtin-prompts/catalog.json'));
    if (prompts.format !== 'nova-content-prompts' ||
        prompts.schemaVersion !== 1 || !Array.isArray(prompts.prompts)) throw new Error('内置目录格式不兼容');
    const seenPrompts = new Set();
    for (const prompt of prompts.prompts) {
        if (!/^builtin-prompt-[a-z0-9-]+$/.test(prompt.id) || seenPrompts.has(prompt.id) || typeof prompt.body !== 'string' ||
            !prompt.body.trim() || prompt.provenance?.origin !== 'original' || prompt.provenance?.license !== 'project-original') throw new Error('内置提示词定义无效');
        seenPrompts.add(prompt.id);
    }
    const colleague = prepareColleagueBuiltins(relative => sourceFile(bundleRoot, relative));
    const prepared = colleague.prepared;
    const allPrompts = [...prompts.prompts, ...colleague.prompts];
    const assetDescriptors = library.readAssetDescriptors(prepared.flatMap(({resources}) => [...resources.values()].map(input => input.assetHash)));
    const retiredTemplates = library.retireLegacyBuiltinTemplates();
    library.migrateBuiltinSettings();
    const templates = [];
    for (const {definition, resources} of prepared) {
        const installed = {};
        for (const [key, input] of resources) {
            const asset = assetDescriptors.get(input.assetHash) ?? library.importAsset(input.file, {purpose: input.purpose});
            if (asset.assetHash !== input.assetHash) throw Error('内置资源在预检后发生变化');
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
    const existingPrompts = [...library.listPrompts(), ...library.listPromptTrash()];
    const existingKeys = new Set(existingPrompts.map(item => item.builtinKey).filter(Boolean));
    const existingBodies = new Set(existingPrompts.map(item => promptContent(library.readPrompt(item.id).body)));
    let createdPrompts = 0;
    for (const prompt of allPrompts) {
        if (existingKeys.has(prompt.id) || existingBodies.has(promptContent(prompt.body))) continue;
        const {title, body, category, when, summary, tags, provenance} = prompt;
        try {
            library.createPrompt({title, body, category, when, summary, tags, provenance, builtinKey: prompt.id});
            createdPrompts++;
        } catch (error) {
            if (error.code !== 'CONFLICT' || ![...library.listPrompts(), ...library.listPromptTrash()].some(item => item.builtinKey === prompt.id)) throw error;
        }
        existingKeys.add(prompt.id);
        existingBodies.add(promptContent(prompt.body));
    }
    return {
        templates,
        retiredTemplates,
        styleSamples: colleague.styleSamples,
        structureSamples: colleague.structureSamples,
        prompts: allPrompts.length,
        createdPrompts
    };
}
