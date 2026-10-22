import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

// Construct the old release's persisted template; the current API deliberately refuses new legacy installs.
export function installHistoricalBuiltin(library, {id, name, version, definition, resources, deletedAt = null}) {
    const dir = path.join(library.info.root, '模板', id), bytes = Buffer.from(`${JSON.stringify({definition, resources}, null, 2)}\n`);
    const now = new Date().toISOString(), packageHash = createHash('sha256').update(bytes).digest('hex');
    fs.mkdirSync(path.join(dir, '版本', String(version)), {recursive: true});
    fs.writeFileSync(path.join(dir, '版本', String(version), '定义.json'), bytes);
    fs.writeFileSync(path.join(dir, '模板.json'), `${JSON.stringify({format: 'nova-template', schemaVersion: 1, id, title: name, revision: 1, createdAt: now, updatedAt: now, deletedAt, builtin: true, currentVersion: version, versions: [{version, packageHash}], derivedFrom: null}, null, 2)}\n`);
    return library.readTemplate(id);
}
