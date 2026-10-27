import {cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {fileURLToPath} from 'node:url';
import {isAbsolute, join, relative, sep} from 'node:path';
import {allSkillNames, integrityPaths, releaseModes, skillCapabilities} from './build.mjs';
import {archiveFor, nodeRelease} from './bundled-node.mjs';
import {assertArtifactSafe} from './artifact-safety.mjs';
import {snapshotPackage} from '../src/lib/package-snapshot.mjs';
export {snapshotPackage} from '../src/lib/package-snapshot.mjs';

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

export async function validateRuntime(input, expected) {
    const snapshot = await snapshotPackage(input);
    await assertArtifactSafe(input);
    if (!isDeepStrictEqual((await readdir(input)).sort(), packageEntries)) throw Error('Unexpected runtime package entries; rebuild from source without user files');
    if (snapshot['plugin-src/skills'] || !isDeepStrictEqual((await readdir(join(input, 'skills'))).sort(), [...allSkillNames].sort())) throw Error('Runtime Skills must use the single canonical skills directory');
    const release = await readJSON(join(input, 'plugin-src/src/release.json'));
    const requiredRelease = {...expected, format: 'nova-content-plugin-release', schemaVersion: 1, experimental: true, platform: process.platform, arch: process.arch};
    if (!isDeepStrictEqual(release, requiredRelease)) throw Error('Runtime release does not match the fixed native release configuration');
    const integrity = await readJSON(join(input, 'integrity.json'));
    const skills = skillCapabilities(release.AUTH_MODE);
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
            const description = `Nova Content Hub · ${release.AUTH_MODE === 'disabled' ? '免费体验版配套插件 · 无需登录' : '受限内部插件 · 业务未开放'} · ${process.platform}/${process.arch}`;
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
            await writeFile(join(stage, 'README.md'), `# ${description}\n\n请完整保留本目录，无需另外安装 Node。\n\n在工作台“配套插件与使用帮助”中点击“准备安装插件”，到 Codex 或 WorkBuddy 的插件页面添加本地市场，粘贴已复制的安装位置。找到 Nova Content Hub，按助手提示安装、启用并确认插件权限，然后回工作台检查连接。\n\n制作封面时，请到所选助手完成生成，再回工作台查看结果。封面可能使用已有的助手额度。TikHub、模型和语音服务的 Key 不随包提供，请在工作台服务设置中自行填写；升级会保留本机已有设置。${release.AUTH_MODE === 'required' ? '\n\n此受限版本暂不开放内容制作，请安装免费体验版。\n' : ''}`);
            if (!isDeepStrictEqual(snapshot, await snapshotPackage(input)) || !isDeepStrictEqual(snapshot, await snapshotPackage(plugin))) throw Error('Runtime package changed before marketplace manifest');
            await json(join(stage, 'package-files.json'), {
                format: 'nova-content-marketplace-package-files', schemaVersion: 1,
                release: {...release, format: 'nova-content-plugin-release', schemaVersion: 1, experimental: true, platform: process.platform, arch: process.arch},
                entries: snapshot
            });
            await assertArtifactSafe(stage);
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
