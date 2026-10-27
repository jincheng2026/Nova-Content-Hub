import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
// Immutable upstream tests are release evidence: fixtures must carry their real
// manifest and original bytes so the safety gate remains strict in these tests.
export function hydrateMethodEvidence(pluginRoot) {
 const source=fileURLToPath(new URL('../../../plugin-src/',import.meta.url));
 const name='plugin-src/resources/method-sources.json';
 const manifest=fs.readFileSync(path.join(source,'resources/method-sources.json'));
 fs.mkdirSync(path.dirname(path.join(pluginRoot,name)),{recursive:true});fs.writeFileSync(path.join(pluginRoot,name),manifest);
 for(const version of JSON.parse(manifest).versions)for(const file of version.files){const dest=path.join(pluginRoot,file.installedPath);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(source,file.installedPath),dest);}
}
