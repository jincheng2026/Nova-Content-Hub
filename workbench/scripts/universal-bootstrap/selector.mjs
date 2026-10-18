import path from 'node:path';

export function nativePayloadPath(resourcesPath, platform, arch) {
    if (platform !== 'darwin' || !['x64', 'arm64'].includes(arch) || !path.isAbsolute(resourcesPath)) throw Error('Unsupported universal desktop platform/architecture');
    return path.join(resourcesPath, 'native', `darwin-${arch}`, 'payload');
}
