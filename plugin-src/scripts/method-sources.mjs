import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

/** Original method documents are evidence, not installed adapter instructions.
 * Validate their exact immutable payload rather than treating historical HOME
 * links as live package dependencies. This never executes an upstream helper.
 */
export function validateMethodSources(sourceRoot) {
    const manifest = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'resources/method-sources.json'), 'utf8'));
    if (manifest.format !== 'nova-method-sources' || manifest.schemaVersion !== 1 || !Array.isArray(manifest.versions)) throw Error('Invalid full method source manifest');
    const recorded = new Map();
    for (const version of manifest.versions) {
        if (typeof version.versionId !== 'string' || version.executable !== false || !Array.isArray(version.files) || !version.files.length) throw Error('Invalid method source version');
        for (const entry of version.files) {
            const relative = entry.installedPath;
            if (typeof relative !== 'string' || !/^skills\/[a-z0-9-]+\/upstream\/.+/.test(relative) || relative.includes('\\') || relative.split('/').some(part => !part || part === '.' || part === '..') || !/^[a-f0-9]{64}$/.test(entry.sha256) || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0) throw Error('Invalid method source file');
            if (recorded.has(relative) && recorded.get(relative) !== entry.sha256) throw Error('Conflicting method source file: ' + relative);
            let filename = sourceRoot;
            for (const part of relative.split('/')) {
                filename = path.join(filename, part);
                if (fs.lstatSync(filename).isSymbolicLink()) throw Error('Method source cannot contain links: ' + relative);
            }
            const stat = fs.statSync(filename);
            if (!stat.isFile() || stat.size !== entry.bytes) throw Error('Method source size mismatch: ' + relative);
            const actual = createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
            if (actual !== entry.sha256) throw Error('Method source hash mismatch: ' + relative);
            recorded.set(relative, entry.sha256);
        }
    }
    for (const entry of fs.readdirSync(path.join(sourceRoot, 'skills'), {withFileTypes: true})) {
        if (!entry.isDirectory()) continue;
        const relative = `skills/${entry.name}/upstream`;
        if (!fs.existsSync(path.join(sourceRoot, relative))) continue;
        const visit = folder => {
            for (const child of fs.readdirSync(path.join(sourceRoot, folder), {withFileTypes: true})) {
                const name = `${folder}/${child.name}`;
                if (child.isDirectory()) visit(name);
                else if (!child.isFile() || !recorded.has(name)) throw Error('Unregistered method source payload: ' + name);
            }
        };
        visit(relative);
    }
    return {versions: manifest.versions.length, files: recorded.size};
}
