import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { exact } from '../shared/validation.ts';
const files = ['icon.png', 'icon@2x.png', 'icon.ico', 'icon.icns'];
export function appIconPaths(directory: string, platform: NodeJS.Platform = process.platform) {
  const manifest: unknown = JSON.parse(readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
  if (!exact(manifest, ['format', 'schemaVersion', 'source', 'sourceHash', 'windowsSizes', 'files']) || manifest.format !== 'nova-content-app-icons' || manifest.schemaVersion !== 1 || !exact(manifest.files, files)) throw new Error('Missing or invalid bundled application icon manifest');
  for (const name of files) {
    const expected = manifest.files[name];
    if (typeof expected !== 'string' || !/^[0-9a-f]{64}$/.test(expected) || createHash('sha256').update(readFileSync(path.join(directory, name))).digest('hex') !== expected) throw new Error(`Bundled application icon is missing or damaged: ${name}`);
  }
  return { png: path.join(directory, 'icon.png'), window: path.join(directory, platform === 'win32' ? 'icon.ico' : 'icon.png') };
}
