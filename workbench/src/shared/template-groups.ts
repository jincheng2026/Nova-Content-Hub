import {isSelectableTemplate} from './template-availability.ts';
import type {TemplateGroup} from './cover-contracts.ts';

type TemplateFact = Pick<TemplateGroup, 'id' | 'builtin' | 'derivedFrom'>;
export type TemplateOrigin = 'builtin' | 'mine' | 'unknown';
export const templateOriginLabel = (origin: TemplateOrigin) => origin === 'builtin' ? '内置' : origin === 'mine' ? '我的模板' : '来源待核实';

// A working copy is a version of its source style, not a new style origin.
// Metadata includes deleted/legacy roots which are absent from selectable assets.
export function groupTemplates(templates: readonly TemplateGroup[], facts: readonly TemplateFact[] = []) {
    const byId = new Map<string, TemplateFact>([...templates, ...facts].map(item => [item.id, item]));
    const groups = new Map<string, {sourceId: string; origin: TemplateOrigin; source: TemplateGroup; members: TemplateGroup[]}>();
    for (const template of templates) {
        if (!isSelectableTemplate(template)) continue;
        let root = byId.get(template.id)!, sourceId = root.id, unresolved = false;
        const seen = new Set([sourceId]);
        while (root.derivedFrom) {
            const parentId = root.derivedFrom.id;
            if (seen.has(parentId)) {sourceId = [...seen].sort()[0]; unresolved = true; break;}
            seen.add(parentId); sourceId = parentId;
            const parent = byId.get(parentId);
            if (!parent) {unresolved = true; break;}
            root = parent;
        }
        const origin: TemplateOrigin = unresolved ? 'unknown' : root.builtin ? 'builtin' : 'mine';
        const group = groups.get(sourceId);
        if (group) {
            group.members.push(template);
            if (template.id === sourceId) group.source = template;
        } else groups.set(sourceId, {sourceId, origin, source: template, members: [template]});
    }
    return [...groups.values()];
}
