import path from 'node:path';

// This is a read-only projection of the already verified, request-pinned package.
export function templateContextDocuments(root, ref, pkg, {objectId, assetPath, readAssetInternal, fail, styleAssetHashes}) {
    const templatePackagePath = path.join(root, '模板', objectId('template', ref.id), '版本', String(ref.version), '定义.json');
    const templateDocuments = Object.entries(pkg.resources).filter(([, item]) => item.role === 'structure').map(([sourceKey, item]) => {
        const asset = readAssetInternal(root, item.assetHash);
        if (asset.bytes !== item.bytes || asset.detectedType !== item.detectedType) fail('CORRUPT', 'Template structure differs from fixed package');
        return {sourceKey, filename: path.posix.basename(sourceKey), assetHash: item.assetHash, bytes: asset.bytes, detectedType: asset.detectedType, path: assetPath(root, item.assetHash)};
    });
    const references = new Map();
    for (const item of Array.isArray(pkg.definition.referenceImages) ? pkg.definition.referenceImages : []) {
        if (typeof item?.path === 'string' && typeof item.sha256 === 'string') references.set(item.path, item.sha256);
    }
    const selected = new Set(styleAssetHashes);
    const templateImageSources = Object.entries(pkg.resources).filter(([, item]) => item.role === 'style' && selected.has(item.assetHash)).map(([sourceKey, item]) => {
        const sourceHash = references.get(sourceKey);
        if (sourceHash && sourceHash !== item.assetHash) fail('CORRUPT', 'Template reference source hash differs from fixed package');
        return {sourceKey, filename: path.posix.basename(sourceKey), assetHash: item.assetHash, referencePath: sourceHash ? sourceKey : null, referenceSha256: sourceHash || null};
    });
    if (new Set(templateImageSources.map(item => item.assetHash)).size !== selected.size) fail('CORRUPT', 'Selected style image is absent from fixed package');
    return {templatePackagePath, templateDocuments, templateImageSources};
}
