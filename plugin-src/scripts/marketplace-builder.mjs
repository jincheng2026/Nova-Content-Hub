import {cp, lstat, mkdir, mkdtemp, readFile, readdir, readlink, realpath, rename, rm, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {fileURLToPath} from 'node:url';
import {dirname, isAbsolute, join, relative, resolve, sep} from 'node:path';
import {allSkillNames, integrityPaths, releaseModes, skillNames} from './build.mjs';
import {archiveFor, nodeRelease} from './bundled-node.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const packageEntries = ['.codebuddy-plugin', '.codex-plugin', 'README.md', 'bin', 'cover-runtime', 'hooks', 'integrity.json', 'node_modules', 'package-lock.json', 'package.json', 'plugin-src', 'runtime', 'skills'].sort();
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = (path, value) => writeFile(path, JSON.stringify(value, null, 2) + '\n');
const readJSON = async path => JSON.parse(await readFile(path, 'utf8'));
const inside = (parent, path) => {
    const value = relative(parent, path);
    return value === '' || (!isAbsolute(value) && value !== '..' && !value.startsWith('..' + sep));
};

async function directory(path) {
    if (!(await lstat(path)).isDirectory()) throw Error(`Unsafe marketplace directory: ${path}`);
}

// Preserve relative npm links, but never carry a link to the source checkout or outside the package.
export async function snapshotPackage(input) {
    await directory(input);
    const base = await realpath(input);
    const entries = {};
    async function walk(path) {
        for (const name of (await readdir(path)).sort()) {
            if (/[\\:\u0000-\u001f\u007f]/.test(name) || ['.', '..', '__proto__'].includes(name)) throw Error(`Unsafe package entry path: ${name}`);
            const file = join(path, name);
            const key = relative(base, file).split(sep).join('/');
            const stat = await lstat(file);
            if (stat.isSymbolicLink()) {
                const target = await readlink(file);
                if (/[\\:\u0000-\u001f\u007f]/.test(target) || isAbsolute(target) || !inside(base, resolve(dirname(file), target)) || !inside(base, await realpath(file))) throw Error(`Escaping package symlink: ${key}`);
                entries[key] = {link: target};
            } else if (stat.isDirectory()) {
                entries[key] = {directory: true};
                await walk(file);
            } else if (stat.isFile()) {
                const bytes = await readFile(file);
                entries[key] = {sha256: hash(bytes), bytes: bytes.length, executable: Boolean(stat.mode & 0o111)};
            } else throw Error(`Unsupported package entry: ${key}`);
        }
    }
    await walk(base);
    return entries;
}

export async function validateRuntime(input, expected) {
    const snapshot = await snapshotPackage(input);
    if (!isDeepStrictEqual((await readdir(input)).sort(), packageEntries)) throw Error('Unexpected runtime package entries; rebuild from source without user files');
    if (snapshot['plugin-src/skills'] || !isDeepStrictEqual((await readdir(join(input, 'skills'))).sort(), [...allSkillNames].sort())) throw Error('Runtime Skills must use the single canonical skills directory');
    const release = await readJSON(join(input, 'plugin-src/src/release.json'));
    const requiredRelease = {...expected, format: 'nova-content-plugin-release', schemaVersion: 1, experimental: true, platform: process.platform, arch: process.arch};
    if (!isDeepStrictEqual(release, requiredRelease)) throw Error('Runtime release does not match the fixed native release configuration');
    const integrity = await readJSON(join(input, 'integrity.json'));
    const skills = Object.fromEntries(allSkillNames.map(name => [name, {namespace: skillNames.includes(name) ? 'contract' : 'cover', executable: name === 'nova-content-cover-execution' && release.AUTH_MODE === 'disabled'}]));
    if (integrity.format !== 'nova-content-plugin-integrity' || integrity.schemaVersion !== 1 || integrity.pairId !== release.pairId || integrity.AUTH_MODE !== release.AUTH_MODE || !isDeepStrictEqual(integrity.skills, skills) || !isDeepStrictEqual(Object.keys(integrity.hashes ?? {}).sort(), integrityPaths().sort())) throw Error('Runtime integrity metadata or Skill capabilities mismatch');
    for (const [path, expectedHash] of Object.entries(integrity.hashes)) {
        if (!/^[a-f0-9]{64}$/.test(expectedHash) || snapshot[path]?.sha256 !== expectedHash) throw Error(`Runtime integrity mismatch: ${path}`);
    }
    const manifest = await readJSON(join(input, 'runtime/manifest.json'));
    const spec = archiveFor();
    if (manifest.format !== 'nova-bundled-node' || manifest.schemaVersion !== 1 || manifest.version !== nodeRelease.version || manifest.platform !== spec.platform || manifest.arch !== spec.arch || manifest.archive !== spec.filename || manifest.officialUrl !== spec.url || manifest.archiveSha256 !== spec.sha256 || manifest.nodeSha256 !== snapshot[`runtime/${process.platform === 'win32' ? 'node.exe' : 'node'}`]?.sha256 || manifest.licenseSha256 !== snapshot['runtime/LICENSE']?.sha256) throw Error('Bundled Node lock or integrity mismatch');
    for (const host of ['codex', 'codebuddy']) {
        const plugin = await readJSON(join(input, `.${host}-plugin/plugin.json`));
        if (plugin.name !== release.appScope || plugin.version !== release.version || !plugin.description?.includes(release.pairId) || (host === 'codex' ? plugin.skills !== './skills/' : !isDeepStrictEqual(plugin.skills, allSkillNames.map(name => `./skills/${name}`)))) throw Error(`Runtime ${host} manifest mismatch`);
    }
    return snapshot;
}

export async function buildMarketplace(mode, {runtimeRoot = join(root, 'plugin/runtime'), outputRoot = join(root, 'plugin/marketplace')} = {}) {
    const releases = await releaseModes(mode);
    await directory(runtimeRoot);
    await mkdir(outputRoot, {recursive: true});
    await directory(outputRoot);
    const original = await realpath(runtimeRoot);
    const output = await realpath(outputRoot);
    if (inside(original, output) || inside(output, original)) throw Error('Marketplace output must be separate from runtime packages');
    const outputs = [];
    for (const release of releases) {
        const input = join(original, `auth-${release.AUTH_MODE}`);
        const snapshot = await validateRuntime(input, release);
        const parent = join(output, `auth-${release.AUTH_MODE}`);
        await mkdir(parent, {recursive: true});
        await directory(parent);
        const target = join(parent, `${process.platform}-${process.arch}`);
        const stage = await mkdtemp(join(parent, '.marketplace-'));
        try {
            const plugin = join(stage, release.appScope);
            await cp(input, plugin, {recursive: true, verbatimSymlinks: true});
            if (!isDeepStrictEqual(snapshot, await validateRuntime(plugin, release)) || !isDeepStrictEqual(snapshot, await snapshotPackage(input))) throw Error('Runtime package changed during marketplace copy');
            const name = `${release.appScope}-auth-${release.AUTH_MODE}-${process.platform}-${process.arch}`;
            const description = `Nova Content Hub · 实验插件 · 鉴权未接入 · 非商用 · ${release.AUTH_MODE} · ${process.platform}/${process.arch}`;
            await mkdir(join(stage, '.agents/plugins'), {recursive: true});
            await mkdir(join(stage, '.codebuddy-plugin'), {recursive: true});
            await json(join(stage, '.agents/plugins/marketplace.json'), {
                name, interface: {displayName: description},
                plugins: [{name: release.appScope, source: {source: 'local', path: './' + release.appScope}, policy: {installation: 'AVAILABLE', authentication: 'ON_INSTALL'}, category: 'Productivity'}]
            });
            await json(join(stage, '.codebuddy-plugin/marketplace.json'), {
                name, owner: {name: 'Nova Content Hub'}, metadata: {description},
                plugins: [{name: release.appScope, source: './' + release.appScope, description, version: release.version}]
            });
            await writeFile(join(stage, 'README.md'), `# ${description}\n\n本目录是本机架构的完整本地市场，需整体保存。两个市场均指向同一个 nova-content-hub/ 完整子包。无需另外安装 Node。\n\nCodex：使用 .agents/plugins/marketplace.json 打开本地插件详情，安装、启用及 Hooks 信任由用户在宿主内确认。WorkBuddy：插件页 + 添加本目录为市场，再查看插件详情；本地路径兼容仍需当前宿主 GUI 验证。\n\nrequired 拒绝 cover 业务读写；disabled 仅供无鉴权实验。三项 contract Skill 仍不可执行，cover-execution Skill 的真实能力以原包 integrity.json 为准。打开宿主或插件详情不代表安装、接单、生图或提交成功。未接入可信授权，非商用发行。\n`);
            if (!isDeepStrictEqual(snapshot, await snapshotPackage(input)) || !isDeepStrictEqual(snapshot, await snapshotPackage(plugin))) throw Error('Runtime package changed before marketplace manifest');
            await json(join(stage, 'package-files.json'), {
                format: 'nova-content-marketplace-package-files', schemaVersion: 1,
                release: {...release, format: 'nova-content-plugin-release', schemaVersion: 1, experimental: true, platform: process.platform, arch: process.arch},
                entries: snapshot
            });
            await rm(target, {recursive: true, force: true});
            await rename(stage, target);
            outputs.push({path: target, marketplace: name, pairId: release.pairId, integritySha256: hash(await readFile(join(target, release.appScope, 'integrity.json'))), packageFilesSha256: hash(await readFile(join(target, 'package-files.json')))});
        } finally {
            await rm(stage, {recursive: true, force: true});
        }
    }
    return outputs;
}

export async function main(args) {
    if (args.length && (args.length !== 2 || args[0] !== '--auth')) throw Error('Use marketplace-builder.mjs [--auth required|disabled|both]');
    process.stdout.write(JSON.stringify(await buildMarketplace(args[1]), null, 2) + '\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
