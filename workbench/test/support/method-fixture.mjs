import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {deriveRuntimeMethodSources} from '../../../plugin-src/scripts/method-runtime-distribution.mjs';
// Runtime fixtures use the fixed distribution subset while retaining each included
// upstream file's original bytes, including immutable test evidence.
export function hydrateMethodEvidence(pluginRoot) {
 const source=fileURLToPath(new URL('../../../plugin-src/',import.meta.url));
 const name='plugin-src/resources/method-sources.json';
 const manifest=deriveRuntimeMethodSources(source);
 fs.mkdirSync(path.dirname(path.join(pluginRoot,name)),{recursive:true});fs.writeFileSync(path.join(pluginRoot,name),JSON.stringify(manifest,null,2)+'\n');
 for(const resource of ['method-runtime-distribution.json','method-runtime-context.json','method-runtime-context.mjs'])fs.copyFileSync(path.join(source,'resources',resource),path.join(pluginRoot,'plugin-src/resources',resource));
 for(const version of manifest.versions)for(const file of version.files){const dest=path.join(pluginRoot,file.installedPath);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(source,file.installedPath),dest);}
}
