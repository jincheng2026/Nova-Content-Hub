import {readFile, writeFile, mkdir, cp, rm, mkdtemp} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve, join, basename} from 'node:path';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {syncBridge} from './sync-bridge.mjs';
import {HOST_EVENTS, validRelease} from '../src/content.mjs';
import {bundleNode, writeLaunchers, cleanNodeEnv} from './bundled-node.mjs';

const source = fileURLToPath(new URL('../', import.meta.url));
const root = resolve(source, '..');
export const skillNames = ['nova-content-template-study', 'nova-content-template-restore', 'nova-content-cover'];
export const allSkillNames = [...skillNames, 'nova-content-cover-execution', 'nova-content-template-execution'];
const json = (path, value) => writeFile(path, JSON.stringify(value, null, 2) + '\n');

export function hooksFor(host, events) {
    return {
        hooks: Object.fromEntries(events.map(event => [event, [{
            hooks: [{
                type: 'command',
                command: `/bin/sh "\${CLAUDE_PLUGIN_ROOT}/bin/run-node" hook --host ${host} --event ${event}`,
                commandWindows: `"%SystemRoot%\\System32\\cmd.exe" /d /s /c ""%CLAUDE_PLUGIN_ROOT%\\bin\\run-node.cmd" hook --host ${host} --event ${event}"`,
                timeout: event === 'Interrupt' ? 3 : 5,
            }]
        }]]))
    };
}

export async function releaseModes(mode) {
    const config = JSON.parse(await readFile(join(root, 'release.config.json'), 'utf8'));
    if (!/^\d+\.\d+\.\d+$/.test(config.version) || config.appScope !== 'nova-content-hub' || config.productId !== config.appScope || config.protocolVersion !== 1 || config.prototype !== true || !['required', 'disabled'].includes(config.AUTH_MODE)) throw new Error('Invalid prototype release.config.json');
    const modes = mode === 'both' ? ['required', 'disabled'] : [mode ?? config.AUTH_MODE];
    if (!modes.every(value => ['required', 'disabled'].includes(value))) throw new Error('Use --auth required|disabled|both');
    return modes.map(auth => {
        const release = {
            productId: config.productId,
            version: config.version,
            appScope: config.appScope,
            protocolVersion: config.protocolVersion,
            prototype: true,
            AUTH_MODE: auth,
            pairId: `${config.appScope}@${config.version}:p${config.protocolVersion}:${auth}`,
            productionReady: false
        };
        if (!validRelease(release)) throw new Error('Invalid package release configuration');
        return release;
    });
}

export function integrityPaths(platform = process.platform) {
    return ['plugin-src/src/release.json', 'plugin-src/src/cli.mjs', 'plugin-src/src/content.mjs', 'plugin-src/src/commands/cover.mjs', 'plugin-src/src/commands/template.mjs', 'plugin-src/src/lib/file-library/template-jobs.mjs', 'plugin-src/src/bridge/handoff.js', 'plugin-src/src/bridge/native-handoff.mjs', 'cover-runtime/cli.mjs',
        ...allSkillNames.map(name => `skills/${name}/SKILL.md`), 'cover-runtime/skills/nova-content-cover-execution/SKILL.md',
        'hooks/codex.json', 'hooks/hooks.json', 'hooks/workbuddy.json', '.codex-plugin/plugin.json', '.codebuddy-plugin/plugin.json',
        'runtime/manifest.json', 'runtime/launch.mjs', 'runtime/LICENSE', `runtime/${platform === 'win32' ? 'node.exe' : 'node'}`, 'bin/run-node', 'bin/run-node.cmd'];
}

async function validateSkills() {
    for (const name of allSkillNames) {
        const text = await readFile(join(source, 'skills', name, 'SKILL.md'), 'utf8');
        const frontmatter = /^---\nname: ([^\n]+)\ndescription: ([^\n]+)\n---\n/.exec(text);
        if (!frontmatter || frontmatter[1] !== name || frontmatter[2].length < 10 || /TODO|\[INSERT/.test(text)) throw Error('Invalid Skill identity: ' + name);
        if (skillNames.includes(name) ? !text.includes('executable:false') : !text.includes('AUTH_NOT_CONFIGURED') || !text.includes('contract check-request') || !text.includes('submit')) throw Error('Invalid Skill capability: ' + name);
    }
}

async function manifests(dest, release, names, prefix = './skills') {
    const description = `自媒体${names.length === 3 ? '不可执行预接入契约' : '封面实验执行与独立契约'}插件；prototype，productionReady=false；${release.pairId}`;
    const base = {name: release.appScope, version: release.version, description, author: {name: 'Nova Content Hub'}};
    for (const directory of ['bin', 'hooks', '.codex-plugin', '.codebuddy-plugin']) await mkdir(join(dest, directory), {recursive: true});
    await json(join(dest, '.codex-plugin/plugin.json'), {...base, skills: prefix + '/', hooks: './hooks/codex.json'});
    await json(join(dest, '.codebuddy-plugin/plugin.json'), {
        ...base,
        skills: names.map(name => `${prefix}/${name}`),
        hooks: ['./hooks/hooks.json', './hooks/workbuddy.json']
    });
    await json(join(dest, 'hooks/codex.json'), hooksFor('codex', HOST_EVENTS.codex));
    await json(join(dest, 'hooks/hooks.json'), hooksFor('workbuddy', ['SessionStart', 'UserPromptSubmit', 'Stop']));
    await json(join(dest, 'hooks/workbuddy.json'), hooksFor('workbuddy', ['StopFailure']));
}

export async function build(mode) {
    await syncBridge(true);
    await validateSkills();
    const outputs = [];
    for (const release of await releaseModes(mode)) {
        const dest = join(root, 'plugin/contract', `${release.appScope}-${release.AUTH_MODE}`);
        await rm(dest, {recursive: true, force: true});
        for (const directory of ['dist', 'bin', 'hooks', '.codex-plugin', '.codebuddy-plugin', 'references']) await mkdir(join(dest, directory), {recursive: true});
        const cliSource = (await readFile(join(source, 'src/content.mjs'), 'utf8'))
            .replace("from './bridge/handoff.js'", "from './handoff.js'")
            .replace("const PACKAGE_KIND = 'execution';", "const PACKAGE_KIND = 'contract';");
        await writeFile(join(dest, 'dist/content.mjs'), cliSource);
        await cp(join(source, 'src/bridge/handoff.js'), join(dest, 'dist/handoff.js'));
        await cp(join(source, 'schemas'), join(dest, 'schemas'), {recursive: true});
        await json(join(dest, 'dist/release.json'), release);
        await json(join(dest, 'contract.json'), {
            ...release,
            status: 'preintegration',
            requestProtocol: 'nova-content-hub-request',
            handoffProtocol: 'nova-content-hub-handoff',
            schemaDirectory: './schemas/',
            requestEntrypoint: './dist/content.mjs',
            realAuthorization: 'not_configured',
            libraryBinding: 'unavailable',
            hosts: {codex: 'compatibility_unverified', workbuddy: 'compatibility_unverified'}
        });
        await cp(join(source, 'README.md'), join(dest, 'README.md'));
        await writeFile(join(dest, 'PACKAGE-KIND.txt'), 'Contract-only preintegration package. Not an executable plugin distribution; bin/run-node requires separately installed Node. Use the cover package for a bundled runtime.\n');
        await cp(join(source, 'references'), join(dest, 'references'), {recursive: true});
        await writeFile(join(dest, 'bin/run-node'), '#!/bin/sh\nset -eu\nROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)\nexec node "$ROOT/dist/content.mjs" "$@"\n', {mode: 0o755});
        await writeFile(join(dest, 'bin/run-node.cmd'), '@echo off\r\nnode "%~dp0..\\dist\\content.mjs" %*\r\n');
        for (const name of skillNames) {
            const skill = join(dest, 'skills', name);
            await cp(join(source, 'skills', name), skill, {recursive: true});
            await mkdir(join(skill, 'scripts'), {recursive: true});
            await mkdir(join(skill, 'references'), {recursive: true});
            await writeFile(join(skill, 'scripts/content.mjs'), cliSource);
            await cp(join(source, 'src/bridge/handoff.js'), join(skill, 'scripts/handoff.js'));
            await cp(join(source, 'schemas'), join(skill, 'schemas'), {recursive: true});
            await json(join(skill, 'scripts/release.json'), release);
            await cp(join(source, 'references'), join(skill, 'references'), {recursive: true});
        }
        await manifests(dest, release, skillNames);
        outputs.push({path: dest, pairId: release.pairId});
    }
    return outputs;
}

export async function buildCover(mode) {
    await syncBridge(true);
    await validateSkills();
    const releases = await releaseModes(mode);
    const npmCLI = process.env.npm_execpath;
    if (!npmCLI || !fs.statSync(npmCLI).isFile()) throw new Error('Run this builder through npm so its Node/npm runtime is explicit.');
    const sourcePackage = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    if (!sourcePackage.dependencies?.sharp || !/^\d+\.\d+\.\d+$/.test(sourcePackage.dependencies.sharp)) throw new Error('Pin the shared sharp runtime before building.');
    const outputs = [];
    for (const base of releases) {
        const release = {
            ...base, format: 'nova-content-plugin-release', schemaVersion: 1,
            experimental: true, platform: process.platform, arch: process.arch
        };
        const target = join(root, 'plugin/runtime', `auth-${release.AUTH_MODE}`);
        await rm(target, {recursive: true, force: true});
        await mkdir(join(target, 'cover-runtime'), {recursive: true});
        const bundled = await bundleNode(target);
        await cp(join(source, 'src'), join(target, 'plugin-src/src'), {recursive: true, filter: input => !['test', '.DS_Store'].includes(basename(input))});
        // One release file serves both command spaces; compatibility paths never carry their own auth mode.
        await json(join(target, 'plugin-src/src/release.json'), release);
        await cp(join(source, 'schemas'), join(target, 'plugin-src/schemas'), {recursive: true});
        // WorkBuddy's global Skill scanner uses this root even when manifests specify a custom path.
        await cp(join(source, 'skills'), join(target, 'skills'), {recursive: true});
        await cp(join(source, 'references'), join(target, 'plugin-src/references'), {recursive: true});
        for (const name of skillNames) {
            const skill = join(target, 'skills', name);
            await mkdir(join(skill, 'scripts'), {recursive: true});
            await writeFile(join(skill, 'scripts/content.mjs'), "import { main } from '../../../plugin-src/src/content.mjs';\nprocess.exitCode = await main(process.argv.slice(2));\n");
            await cp(join(source, 'references'), join(skill, 'references'), {recursive: true});
            await cp(join(source, 'schemas'), join(skill, 'schemas'), {recursive: true});
        }
        // Resource paths match the source tree; no dependency on the browser workbench.
        const importCatalog = JSON.parse(await readFile(join(source, 'src/lib/browser-import/builtin-resources.json'), 'utf8'));
        if (importCatalog.format !== 'nova-browser-import-builtin-resources' || importCatalog.schemaVersion !== 1 || !importCatalog.entries || Object.keys(importCatalog.entries).length !== 72) throw new Error('Unsupported import resource catalog');
        for (const [relative, entry] of Object.entries(importCatalog.entries)) {
            if (!relative.startsWith('图库/') || /[\\:\u0000-\u001f]/.test(relative) || relative.split('/').some(part => !part || part === '.' || part === '..') || entry.path !== relative || !['raster', 'structure'].includes(entry.kind)) throw new Error('Unsafe bundled import resource');
            const bytes = await readFile(join(source, 'resources', relative));
            if (bytes.length !== entry.bytes || createHash('sha256').update(bytes).digest('hex') !== entry.sha256) throw new Error('Import resource hash mismatch');
        }
        await cp(join(source, 'resources'), join(target, 'plugin-src/resources'), {recursive: true, filter: input => !['test', '.DS_Store'].includes(basename(input))});
        await cp(join(source, 'compat/cover-runtime'), join(target, 'plugin-src/compat/cover-runtime'), {recursive: true, filter: input => basename(input) !== 'build.mjs'});
        await writeFile(join(target, 'cover-runtime/cli.mjs'), "import {main} from '../plugin-src/src/commands/cover.mjs';\nprocess.exitCode = await main(process.argv.slice(2));\n");
        await cp(join(source, 'skills/nova-content-cover-execution'), join(target, 'cover-runtime/skills/nova-content-cover-execution'), {recursive: true});
        const legacySkill = join(target, 'cover-runtime/skills/nova-content-cover-execution/SKILL.md');
        await writeFile(legacySkill, (await readFile(legacySkill, 'utf8')).replaceAll('../../bin/', '../../../bin/').replaceAll('..\\..\\bin\\', '..\\..\\..\\bin\\'));
        await writeFile(join(target, 'cover-runtime/README.md'), '# 兼容封面入口\n\n`node cover-runtime/cli.mjs` 转发到唯一封面命令。[完整说明](../plugin-src/compat/cover-runtime/README.md)。\n');
        await cp(join(source, 'README.md'), join(target, 'plugin-src/README.md'));
        await writeFile(join(target, 'README.md'), '# 自媒体插件 · 实验包\n\n统一入口：macOS/Linux 使用 `bin/run-node doctor`，Windows 使用 `bin\\run-node.cmd doctor`。随包包含锁定 Node.js 24.20.0，无需安装 Node。包仅适用于 runtime/manifest.json 标记的系统和架构。契约校验使用 `contract`，真实文件执行使用 `cover` 和 `template`；required 模式停止业务读写。见 [运行时说明](runtime/README.md)、[插件说明](plugin-src/README.md)、[封面执行](cover-runtime/README.md) 和 [数据维护](plugin-src/src/lib/library-maintenance/README.md)。本包不代表商用发行就绪。\n');
        await cp(join(source, 'runtime/README.md'), join(target, 'runtime/README.md'));
        await manifests(target, release, allSkillNames);
        await writeLaunchers(target);
        await json(join(target, 'package.json'), {
            ...sourcePackage,
            scripts: {start: process.platform === 'win32' ? 'bin\\run-node.cmd doctor' : './bin/run-node doctor'}
        });
        await cp(join(root, 'package-lock.json'), join(target, 'package-lock.json'));
        execFileSync(process.execPath, [npmCLI, 'ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], {
            cwd: target,
            stdio: 'pipe',
            timeout: 180000
        });
        const standalone = await mkdtemp(join(tmpdir(), 'nova standalone plugin '));
        try {
            await cp(target, standalone, {recursive: true});
            const standaloneEnv = {...cleanNodeEnv(), PATH: '', NODE_PATH: ''};
            const fixedNode = join(standalone, 'runtime', basename(bundled.node));
            execFileSync(fixedNode, ['--input-type=module', '--eval', "import sharp from 'sharp';import {validateImage} from './plugin-src/src/lib/image-validation/index.mjs';const bytes=await sharp({create:{width:1,height:1,channels:3,background:'#ffffff'}}).png().toBuffer();await validateImage(bytes);"], {
                cwd: standalone,
                env: standaloneEnv,
                stdio: 'pipe',
                timeout: 15000
            });
            const launcher = process.platform === 'win32' ? join(process.env.SystemRoot || 'C:\\Windows', 'System32/cmd.exe') : '/bin/sh';
            const launcherArgs = process.platform === 'win32' ? ['/d', '/s', '/c', `""${join(standalone, 'bin/run-node.cmd')}" doctor"`] : [join(standalone, 'bin/run-node'), 'doctor'];
            execFileSync(launcher, launcherArgs, {cwd: tmpdir(), env: standaloneEnv, stdio: 'pipe', timeout: 15000});
        } finally {
            await rm(standalone, {recursive: true, force: true});
        }
        const hashes = Object.fromEntries(await Promise.all(integrityPaths().map(async relative => [relative, createHash('sha256').update(await readFile(join(target, relative))).digest('hex')])));
        await json(join(target, 'integrity.json'), {
            format: 'nova-content-plugin-integrity',
            schemaVersion: 1,
            pairId: release.pairId,
            AUTH_MODE: release.AUTH_MODE,
            hashes,
            skills: Object.fromEntries(allSkillNames.map(name => [name, {
                namespace: skillNames.includes(name) ? 'contract' : name === 'nova-content-template-execution' ? 'template' : 'cover',
                executable: ['nova-content-cover-execution', 'nova-content-template-execution'].includes(name) && release.AUTH_MODE === 'disabled'
            }]))
        });
        outputs.push({path: target, pairId: release.pairId});
        process.stderr.write(`Built experimental ${release.AUTH_MODE} plugin for ${process.platform}/${process.arch}\n`);
    }
    return outputs;
}

export async function main(args) {
    let target = 'contract', mode;
    const seen = new Set();
    for (let i = 0; i < args.length; i += 2) {
        const flag = args[i], value = args[i + 1];
        if (!['--target', '--auth'].includes(flag) || seen.has(flag) || !value) throw Error('Use build.mjs [--target contract|cover|all] [--auth required|disabled|both]');
        seen.add(flag);
        if (flag === '--target') target = value;
        else mode = value;
    }
    if (!['contract', 'cover', 'all'].includes(target)) throw Error('Unknown build target');
    const outputs = [];
    if (target !== 'cover') outputs.push(...await build(mode));
    if (target !== 'contract') outputs.push(...await buildCover(mode));
    process.stdout.write(JSON.stringify(outputs, null, 2) + '\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
