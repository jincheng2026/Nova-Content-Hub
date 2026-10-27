import path from 'node:path';
import {assertArtifactSafe} from '../../plugin-src/scripts/artifact-safety.mjs';

// electron-builder invokes this after final app/extraResources copy and before producing installers.
export default async function artifactSafetyHook(context) {
    const resources = context.electronPlatformName === 'darwin'
        ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents/Resources')
        : path.join(context.appOutDir, 'resources');
    await assertArtifactSafe(resources);
}
