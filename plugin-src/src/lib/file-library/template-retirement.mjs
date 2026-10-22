import path from 'node:path';

export const LEGACY_BUILTIN_TEMPLATE_IDS = Object.freeze(['geometry', 'paper', 'notes', 'comparison', 'neon', 'magazine', 'interview', 'lifestyle', 'product', 'news', 'ai-tool', 'agent', 'tech-collage', 'big-head', 'life-story'].map(id => `builtin-${id}`));
const current = new Set(['assistant-scene', 'big-head-action', 'news-collage', 'orange-green-life', 'spatial-operation'].map(id => `builtin-colleague-${id}`));
export const retiredBuiltinTemplate = meta => meta.builtin === true && LEGACY_BUILTIN_TEMPLATE_IDS.includes(meta.id);
export const selectableTemplate = meta => meta.deletedAt === null && (!meta.builtin || current.has(meta.id));

// Retirement removes catalog capabilities; original paths remain authoritative for history and older readers.
export function templateRetirementMethods({root, locked, snapshot, metadata, templatePackage, safePath}) {
    return {retireLegacyBuiltinTemplates: () => locked(() => {
        const retired = [];
        for (const id of LEGACY_BUILTIN_TEMPLATE_IDS) {
            if (!safePath(path.join(root, '模板', id), true)) continue;
            const meta = metadata(snapshot(root, id, 'template')[0], id, 'template');
            if (!retiredBuiltinTemplate(meta)) continue;
            for (const entry of meta.versions) templatePackage(root, id, entry.version, entry.packageHash);
            retired.push(id);
        }
        return retired;
    })};
}
