import fs from 'node:fs';
import path from 'node:path';
import {cp} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {releaseSourceFilter} from './artifact-safety.mjs';
import {validateMethodSources} from './method-sources.mjs';
import {snapshotPackage} from '../src/lib/package-snapshot.mjs';

const source = fileURLToPath(new URL('../', import.meta.url));
const policyResource = 'method-runtime-distribution.json';
const contextResources = ['method-runtime-context.json', 'method-runtime-context.mjs'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const read = (root, name) => fs.readFileSync(path.join(root, 'resources', name));
const safePath = value => typeof value === 'string' && /^skills\/[a-z0-9-]+\/upstream\/.+/.test(value) && !/[\\:\u0000-\u001f\u007f]/.test(value) && value.split('/').every(part => part && part !== '.' && part !== '..');
const fail = detail => {throw Object.assign(Error('Runtime method distribution: ' + detail), {code:'METHOD_RUNTIME_DISTRIBUTION'});};
function policyFor(root) {
    const bytes = read(root, policyResource), policy = JSON.parse(bytes);
    if (policy.format !== 'nova-method-runtime-distribution-policy' || policy.schemaVersion !== 1 || typeof policy.id !== 'string' || !Array.isArray(policy.omitted) || !policy.omitted.length) fail('invalid policy');
    const paths = new Set();
    for (const item of policy.omitted) {
        if (!safePath(item.installedPath) || paths.has(item.installedPath) || !/^[a-f0-9]{64}$/.test(item.sha256) || typeof item.reason !== 'string' || !item.reason) fail('invalid policy omission');
        paths.add(item.installedPath);
    }
    return {policy, bytes, paths};
}

/** The same exact-path selection is used for skill copy and integrity enumeration.
 * It does not infer rights or privacy from names, images, or author references.
 */
export function runtimeMethodSourceFilter(input, sourceRoot = source) {
    if (!releaseSourceFilter(input)) return false;
    const relative = path.relative(sourceRoot, input).split(path.sep).join('/');
    return !policyFor(sourceRoot).paths.has(relative);
}

/** Retain nova-method-sources compatibility for the immutable test-evidence gate.
 * files describes only bytes actually distributed. treeSha256/versionId retain
 * their original SOURCE meaning, expressly identified in distribution metadata.
 */
export function deriveRuntimeMethodSources(sourceRoot = source) {
    validateMethodSources(sourceRoot);
    const sourceBytes = read(sourceRoot, 'method-sources.json');
    const manifest = JSON.parse(sourceBytes), {policy, bytes, paths} = policyFor(sourceRoot);
    if (manifest.distribution) fail('full source manifest must not be a runtime subset');
    const entries = new Map(manifest.versions.flatMap(version => version.files.map(file => [file.installedPath, file])));
    const omitted = policy.omitted.map(item => {
        const entry = entries.get(item.installedPath);
        if (!entry || entry.sha256 !== item.sha256) fail('policy no longer matches original source: ' + item.installedPath);
        return {...item, bytes:entry.bytes};
    });
    const versions = manifest.versions.map(version => ({...version, files:version.files.filter(file => !paths.has(file.installedPath))}));
    return {...manifest, versions, distribution:{
        format:'nova-method-runtime-distribution', schemaVersion:1,
        policy:{id:policy.id, resource:'plugin-src/resources/' + policyResource, sha256:hash(bytes)},
        sourceManifest:{sha256:hash(sourceBytes), versions:manifest.versions.length, files:entries.size},
        treeSha256Scope:'original-source-tree',
        runtimeFiles:versions.reduce((count, version) => count + version.files.length, 0),
        contextResources:contextResources.map(name => ({installedPath:'plugin-src/resources/' + name, sha256:hash(read(sourceRoot, name))})),
        omitted
    }};
}

export async function copyRuntimeMethodSkills(sourceRoot, targetRoot) {
    // Validate before copying: no unregistered original payload gets an implicit pass.
    const manifest = deriveRuntimeMethodSources(sourceRoot);
    await cp(path.join(sourceRoot, 'skills'), path.join(targetRoot, 'skills'), {recursive:true, filter:input => runtimeMethodSourceFilter(input, sourceRoot)});
    return manifest;
}

/** Build/marketplace/desktop validation requires the NEW policy, including for
 * old packages. A legacy package is not credited with the new privacy policy.
 * Existing snapshot and credential gates remain separate and mandatory.
 */
export async function validateRuntimeDistribution(root, {snapshot, sourceRoot = source} = {}) {
    try {
        const expected = deriveRuntimeMethodSources(sourceRoot);
        const manifestPath = 'plugin-src/resources/method-sources.json';
        const manifestBytes = fs.readFileSync(path.join(root, manifestPath));
        const actual = JSON.parse(manifestBytes);
        if (!isDeepStrictEqual(actual, expected)) fail('manifest differs from the fixed source subset and policy');
        const files = snapshot ?? await snapshotPackage(root);
        if (files[manifestPath]?.sha256 !== hash(manifestBytes)) fail('manifest must be a regular snapshot-bound file');
        const deniedPaths = new Set(expected.distribution.omitted.map(item => item.installedPath));
        const deniedHashes = new Set(expected.distribution.omitted.map(item => item.sha256));
        const included = new Map(expected.versions.flatMap(version => version.files.map(file => [file.installedPath, file])));
        for (const [relative, entry] of Object.entries(files)) {
            if ([...deniedPaths].some(denied => relative === denied || relative.endsWith('/' + denied)) || deniedHashes.has(entry.sha256)) fail('private original payload is present: ' + relative);
            if (/^skills\/[^/]+\/upstream\//.test(relative) && !entry.directory && !included.has(relative)) fail('unregistered upstream runtime payload: ' + relative);
        }
        for (const [relative, entry] of included) {
            const actual = files[relative];
            if (!actual || actual.link || actual.sha256 !== entry.sha256 || actual.bytes !== entry.bytes) fail('included payload missing or changed: ' + relative);
        }
        for (const name of [policyResource, ...contextResources]) {
            const relative = 'plugin-src/resources/' + name;
            if (files[relative]?.sha256 !== hash(read(sourceRoot, name))) fail('policy/context resource missing or changed: ' + relative);
        }
        return {versions:expected.versions.length, files:included.size, omitted:deniedPaths.size};
    } catch (error) {
        if (error.code === 'METHOD_RUNTIME_DISTRIBUTION') throw error;
        fail('validation could not complete');
    }
}
