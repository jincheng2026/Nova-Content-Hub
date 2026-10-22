export function isSelectableTemplate(template: {catalogStatus?: 'default' | 'legacy' | 'custom'; deletedAt?: string | null; styleAssetHashes?: readonly string[]; samples?: readonly unknown[]}): boolean {
    return !template.deletedAt && template.catalogStatus !== 'legacy' && (template.styleAssetHashes?.length ?? template.samples?.length ?? 0) > 0;
}
