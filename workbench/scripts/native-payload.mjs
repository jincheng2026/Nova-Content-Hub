import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {isDeepStrictEqual} from 'node:util';
import {snapshotPackage} from '../../plugin-src/scripts/marketplace-builder.mjs';
import {archiveFor, nodeRelease} from '../../plugin-src/scripts/bundled-node.mjs';
import {integrityPaths} from '../../plugin-src/scripts/build.mjs';
import {assertArtifactSafe} from '../../plugin-src/scripts/artifact-safety.mjs';

const readJSON = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const same = (actual, expected, message) => {
    if (!isDeepStrictEqual(actual, expected)) throw Error(message);
};
const inside = (parent, file) => {
    const relative = path.relative(parent, file);
    return relative === '' || !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep);
};

export function assertSeparatePaths(input, output) {
    if (inside(input, output) || inside(output, input)) throw Error('Native payload source and destination must be separate, non-nested paths');
}

export function resolveDestination(output) {
    const suffix = [];
    let existing = path.resolve(output);
    for (;;) {
        try { fs.lstatSync(existing); break; } catch (error) {
            if (error.code !== 'ENOENT') throw error;
            suffix.unshift(path.basename(existing));
            existing = path.dirname(existing);
        }
    }
    return path.join(fs.realpathSync(existing), ...suffix);
}

// Capture before the fresh native build, then compare after it; old stages cannot acquire a new source identity.
export function sourceIdentity(root, npmCLI) {
    const git = args => execFileSync('git', ['-C', root, ...args], {encoding: 'utf8'}).trim();
    const clean = () => {
        if (git(['status', '--porcelain=v1', '--untracked-files=normal'])) throw Error('Native payload export/assembly requires a clean committed source checkout');
    };
    clean();
    const commit = git(['rev-parse', 'HEAD']);
    const pkg = readJSON(path.join(root, 'workbench/package.json'));
    const identity = {
        commit,
        locks: Object.fromEntries(['package-lock.json', 'workbench/package-lock.json', 'plugin-src/runtime/node-release.json'].map(file => [file, hash(path.join(root, file))])),
        config: readJSON(path.join(root, 'release.config.json')),
        toolchain: {node: process.version, npm: readJSON(path.resolve(npmCLI, '../../package.json')).version, electron: pkg.devDependencies.electron, builder: pkg.devDependencies['electron-builder'], sharp: pkg.dependencies.sharp}
    };
    if (!/^[a-f0-9]{40}$/.test(commit) || identity.config.AUTH_MODE !== 'disabled' || identity.toolchain.electron !== '44.9.0' || identity.toolchain.builder !== '26.15.3') throw Error('Invalid free-preview source identity or pinned toolchain');
    clean();
    if (git(['rev-parse', 'HEAD']) !== commit) throw Error('Source commit changed while reading identity');
    return identity;
}

export function assertSourceUnchanged(before, after) {
    same(after, before, 'Source, lockfiles, configuration or toolchain changed during native build/assembly');
}

export function assertMachO(bytes, arch) {
    const expected = {x64: 0x01000007, arm64: 0x0100000c}[arch];
    if (!expected || bytes.length < 8 || bytes.readUInt32LE(0) !== 0xfeedfacf || bytes.readUInt32LE(4) !== expected) throw Error(`Expected unchanged thin darwin-${arch} Mach-O payload`);
}

function verifySharp(root, arch, version, entries) {
    const prefix = `node_modules/@img/sharp-darwin-${arch}`;
    const sharp = readJSON(path.join(root, 'node_modules/sharp/package.json'));
    const native = readJSON(path.join(root, prefix, 'package.json'));
    if (sharp.version !== version || native.version !== version || native.name !== `@img/sharp-darwin-${arch}` || !native.cpu?.includes(arch) || !native.os?.includes('darwin')) throw Error('Native sharp package architecture/version mismatch');
    const binaries = Object.keys(entries).filter(file => file.startsWith(prefix + '/') && file.endsWith('.node'));
    const libraries = Object.keys(entries).filter(file => file.startsWith(`node_modules/@img/sharp-libvips-darwin-${arch}/`) && file.endsWith('.dylib'));
    if (!binaries.length || !libraries.length) throw Error('Missing native sharp or libvips payload');
    for (const file of [...binaries, ...libraries]) assertMachO(fs.readFileSync(path.join(root, file)), arch);
}

export async function validateNativeTree(input, source, arch) {
    if (!['x64', 'arm64'].includes(arch)) throw Error('Unsupported native payload architecture');
    const entries = await snapshotPackage(input);
    await assertArtifactSafe(input);
    const config = source.config;
    const release = {...config, format: 'nova-content-desktop-release', schemaVersion: 1, pairId: `${config.appScope}@${config.version}:p${config.protocolVersion}:disabled`, experimental: true, productionReady: false, platform: 'darwin', arch};
    if (config.AUTH_MODE !== 'disabled' || config.prototype !== true || config.appScope !== 'nova-content-hub' || config.productId !== config.appScope || config.protocolVersion !== 1) throw Error('Native payload must be the free experimental release');
    same(readJSON(path.join(input, 'workbench/dist/release.json')), release, 'Desktop native release mismatch');
    const pkg = readJSON(path.join(input, 'package.json'));
    if (pkg.version !== config.version || pkg.main !== 'workbench/dist/main/index.mjs' || pkg.dependencies?.sharp !== source.toolchain.sharp) throw Error('Desktop package/version mismatch');
    for (const file of ['workbench/dist/main/desktop.mjs', 'workbench/dist/preload/index.cjs', 'workbench/dist/renderer/index.html']) if (!entries[file]?.sha256) throw Error(`Incomplete native desktop payload: ${file}`);
    verifySharp(input, arch, source.toolchain.sharp, entries);

    const market = path.join(input, 'workbench/plugin-marketplace');
    const plugin = path.join(market, config.appScope);
    const pluginEntries = await snapshotPackage(plugin);
    const pluginRelease = {...release, format: 'nova-content-plugin-release'};
    same(readJSON(path.join(plugin, 'plugin-src/src/release.json')), pluginRelease, 'Plugin native release mismatch');
    const files = readJSON(path.join(market, 'package-files.json'));
    if (files.format !== 'nova-content-marketplace-package-files' || files.schemaVersion !== 1) throw Error('Invalid marketplace package manifest');
    same(files.release, pluginRelease, 'Marketplace native release mismatch');
    same(files.entries, pluginEntries, 'Marketplace package-files integrity mismatch');
    const integrity = readJSON(path.join(plugin, 'integrity.json'));
    if (integrity.format !== 'nova-content-plugin-integrity' || integrity.schemaVersion !== 1 || integrity.pairId !== release.pairId || integrity.AUTH_MODE !== 'disabled') throw Error('Plugin integrity pairing mismatch');
    same(Object.keys(integrity.hashes ?? {}).sort(), integrityPaths('darwin').sort(), 'Plugin integrity paths mismatch');
    for (const [file, expected] of Object.entries(integrity.hashes)) if (!/^[a-f0-9]{64}$/.test(expected) || pluginEntries[file]?.sha256 !== expected) throw Error(`Plugin integrity mismatch: ${file}`);
    const spec = archiveFor('darwin', arch);
    const manifest = readJSON(path.join(plugin, 'runtime/manifest.json'));
    same(manifest, {format: 'nova-bundled-node', schemaVersion: 1, version: nodeRelease.version, platform: 'darwin', arch, archive: spec.filename, officialUrl: spec.url, archiveSha256: spec.sha256, nodeSha256: pluginEntries['runtime/node']?.sha256, licenseSha256: pluginEntries['runtime/LICENSE']?.sha256}, 'Bundled Node lock/integrity mismatch');
    if (!pluginEntries['runtime/node']?.executable || !pluginEntries['runtime/LICENSE']?.sha256) throw Error('Incomplete bundled Node runtime');
    assertMachO(fs.readFileSync(path.join(plugin, 'runtime/node')), arch);
    verifySharp(plugin, arch, source.toolchain.sharp, pluginEntries);
    for (const [host, file] of [['codex', '.agents/plugins/marketplace.json'], ['workbuddy', '.codebuddy-plugin/marketplace.json']]) {
        const manifest = readJSON(path.join(market, file));
        const entry = manifest.plugins?.[0];
        const local = host === 'codex' ? entry?.source?.source === 'local' && entry.source.path : entry?.source;
        if (manifest.name !== `${config.appScope}-auth-disabled-darwin-${arch}` || manifest.plugins?.length !== 1 || entry?.name !== config.appScope || local !== './' + config.appScope) throw Error('Native marketplace must target its fixed local plugin');
    }
    same(await snapshotPackage(input), entries, 'Native payload changed during validation');
    return entries;
}

export async function exportNativePayload(input, output, source, arch) {
    if (!fs.lstatSync(input).isDirectory()) throw Error('Native stage must be a directory, not a symlink');
    input = fs.realpathSync(input);
    output = resolveDestination(output);
    assertSeparatePaths(input, output);
    const entries = await validateNativeTree(input, source, arch);
    fs.mkdirSync(output); // Refuse overwriting an artifact, including a symlink destination.
    try {
        fs.cpSync(input, path.join(output, 'payload'), {recursive: true, verbatimSymlinks: true, force: false, errorOnExist: true});
        same(await validateNativeTree(path.join(output, 'payload'), source, arch), entries, 'Native payload changed during export');
        same(await snapshotPackage(input), entries, 'Native source payload changed during export');
        fs.writeFileSync(path.join(output, 'artifact.json'), JSON.stringify({format: 'nova-native-desktop-payload', schemaVersion: 1, channel: 'preview', platform: 'darwin', arch, source, entries}, null, 2) + '\n', {flag: 'wx'});
        return output;
    } catch (error) {
        fs.rmSync(output, {recursive: true, force: true});
        throw error;
    }
}

export async function validateNativeArtifact(input, source, arch) {
    if (!path.isAbsolute(input) || !fs.lstatSync(input).isDirectory()) throw Error('Use an absolute native artifact directory, not a symlink');
    input = fs.realpathSync(input);
    same(fs.readdirSync(input).sort(), ['artifact.json', 'payload'], 'Unexpected native artifact contents');
    if (!fs.lstatSync(path.join(input, 'artifact.json')).isFile()) throw Error('Invalid native artifact metadata');
    const metadata = readJSON(path.join(input, 'artifact.json'));
    if (metadata.format !== 'nova-native-desktop-payload' || metadata.schemaVersion !== 1 || metadata.channel !== 'preview' || metadata.platform !== 'darwin' || metadata.arch !== arch) throw Error('Native artifact platform/architecture/channel mismatch');
    same(metadata.source, source, 'Native artifacts must match the current clean source commit, locks, configuration and toolchain');
    same(await validateNativeTree(path.join(input, 'payload'), source, arch), metadata.entries, 'Native artifact tree integrity mismatch');
    return {...metadata, path: input};
}

export async function copyNativeArtifact(artifact, output, source) {
    const verified = await validateNativeArtifact(artifact.path, source, artifact.arch);
    output = resolveDestination(output);
    assertSeparatePaths(verified.path, output);
    if (fs.existsSync(output) || fs.lstatSync(path.dirname(output)).isSymbolicLink()) throw Error('Native payload destination must be new');
    fs.cpSync(verified.path, output, {recursive: true, verbatimSymlinks: true, force: false, errorOnExist: true});
    await validateNativeArtifact(output, source, artifact.arch);
    await validateNativeArtifact(verified.path, source, artifact.arch);
}
