import fs from 'node:fs';
import type {TemplateCatalogFields} from '../shared/workspace-contracts.ts';
const catalog = JSON.parse(fs.readFileSync(new URL('../../../plugin-src/resources/colleague-library/catalog.json', import.meta.url), 'utf8')) as {templates: {id: string; referenceImages: unknown[]; designNotes: string}[]};
const defaults = new Set(catalog.templates.map(template => template.id));
export function isTemplateCatalogSelectable(template: {id: string; builtin?: boolean; deletedAt?: string | null}): boolean {
    return !template.deletedAt && (template.builtin !== true || defaults.has(template.id));
}
const historicalCounts = new Map([['builtin-colleague-big-head-action', 90], ['builtin-colleague-orange-green-life', 32]]);
const sourceScopes = new Map(catalog.templates.filter(template => historicalCounts.has(template.id)).map(template => [template.designNotes, `本组实际包含 ${template.referenceImages.length} 张原图；附带来源报告研究了 ${historicalCounts.get(template.id)} 张历史样本，部分编号不属于本组。拆解以本组原图和本次回传证据为准。`]));
export function templateCatalogFields(template: {id: string; builtin?: boolean; derivedFrom?: {id: string; version: number} | null}, definition: Record<string, unknown>): TemplateCatalogFields {
    return {catalogStatus: template.builtin === true ? defaults.has(template.id) ? 'default' : 'legacy' : 'custom', derivedFrom: template.derivedFrom ? {id: template.derivedFrom.id, version: template.derivedFrom.version} : null, designNotes: typeof definition.designNotes === 'string' ? definition.designNotes : '', sourceScopeWarning: typeof definition.designNotes === 'string' ? sourceScopes.get(definition.designNotes) ?? null : null};
}
