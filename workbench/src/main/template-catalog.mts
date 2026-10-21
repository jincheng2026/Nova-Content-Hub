import fs from 'node:fs';
import type {TemplateCatalogFields} from '../shared/workspace-contracts.ts';
const catalog = JSON.parse(fs.readFileSync(new URL('../../../plugin-src/resources/colleague-library/catalog.json', import.meta.url), 'utf8')) as {templates: {id: string}[]};
const defaults = new Set(catalog.templates.map(template => template.id));
export function templateCatalogFields(template: {id: string; builtin?: boolean; derivedFrom?: {id: string; version: number} | null}, definition: Record<string, unknown>): TemplateCatalogFields {
    return {catalogStatus: template.builtin === true ? defaults.has(template.id) ? 'default' : 'legacy' : 'custom', derivedFrom: template.derivedFrom ? {id: template.derivedFrom.id, version: template.derivedFrom.version} : null, designNotes: typeof definition.designNotes === 'string' ? definition.designNotes : ''};
}
