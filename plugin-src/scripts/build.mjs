import {readFile, writeFile, mkdir, cp, rm, mkdtemp} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path, {resolve, join, basename} from 'node:path';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {syncBridge} from './sync-bridge.mjs';
import {assertArtifactSafe, releaseSourceFilter} from './artifact-safety.mjs';
import {HOST_EVENTS, validRelease} from '../src/content.mjs';
import {bundleNode, writeLaunchers, cleanNodeEnv} from './bundled-node.mjs';

const source = fileURLToPath(new URL('../', import.meta.url));
const root = resolve(source, '..');
export const skillNames = ['nova-content-template-study', 'nova-content-template-restore', 'nova-content-cover'];
export const productionSkillNames = ['nova-content-research-execution', 'nova-content-writing-execution'];
export const businessSkillRegistry = JSON.parse(fs.readFileSync(join(source, 'resources/business-skills.json'), 'utf8'));
export const businessSkillNames = businessSkillRegistry.methods.map(method => method.id);
export const allSkillNames = [...skillNames, 'nova-content-cover-execution', 'nova-content-template-execution', ...productionSkillNames, ...businessSkillNames];
export function skillCapabilities(mode) {
    return Object.fromEntries(allSkillNames.map(name => [name, {
        role: skillNames.includes(name) ? 'contract' : businessSkillNames.includes(name) ? 'business-method' : 'executor',
        namespace: skillNames.includes(name) ? 'contract' : businessSkillNames.includes(name) ? 'business-method' : name.replace('nova-content-', '').replace('-execution', ''),
        executable: !skillNames.includes(name) && !businessSkillNames.includes(name) && mode === 'disabled',
        ...(businessSkillNames.includes(name) ? {executor: businessSkillRegistry.methods.find(method => method.id === name).executor} : {})
    }]));
}
const json = (path, value) => writeFile(path, JSON.stringify(value, null, 2) + '\n');

export function runtimeSourceFilter(input) {
    return releaseSourceFilter(input) && !['test', 'tests', '__tests__', '.DS_Store', 'README.md'].includes(basename(input)) && !/\.(?:test|spec)\.[cm]?[jt]s$/.test(basename(input)) && !['src/lib/browser-import', 'resources/builtin-templates', 'resources/图库'].some(relative => input === join(source, relative));
}

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
    const modules = [];
    const visit = directory => {
        for (const entry of fs.readdirSync(join(source, directory), {withFileTypes: true})) {
            const relative = `${directory}/${entry.name}`;
            if (!runtimeSourceFilter(join(source, relative))) continue;
            if (entry.isDirectory()) visit(relative);
            else if (/\.[cm]?js$/.test(entry.name)) modules.push(`plugin-src/${relative}`);
        }
    };
    visit('src');
    const methodFiles=[];
    // Hash every actual Skill resource, including helpers, schemas and nested assets.
    // A Markdown-only list silently misses dependencies when a method adds a script.
    const methods=directory=>{for(const entry of fs.readdirSync(join(source,directory),{withFileTypes:true})){const item=`${directory}/${entry.name}`;if(!releaseSourceFilter(join(source,item)))continue;if(entry.isDirectory())methods(item);else if(entry.isFile())methodFiles.push(item);else throw Error('Skill resources must be regular files: '+item);}};
    for(const name of allSkillNames)methods(`skills/${name}`);
    const generatedResources=(directory,prefix)=>{for(const entry of fs.readdirSync(join(source,directory),{withFileTypes:true})){if(!releaseSourceFilter(join(source,directory,entry.name)))continue;if(entry.isDirectory())generatedResources(`${directory}/${entry.name}`,`${prefix}/${entry.name}`);else if(entry.isFile())methodFiles.push(`${prefix}/${entry.name}`);}};
    for(const name of skillNames){generatedResources('references',`skills/${name}/references`);generatedResources('schemas',`skills/${name}/schemas`);methodFiles.push(`skills/${name}/scripts/content.mjs`);}
    const support = ['plugin-src/resources/business-skills.json', 'plugin-src/resources/business-skills-contract.md', 'plugin-src/resources/production-contract.md', 'plugin-src/resources/production-artifacts.md', 'plugin-src/resources/production/examples.json', 'plugin-src/resources/production/LICENSE.txt'];
    return [...new Set([...modules, ...support, ...methodFiles, 'plugin-src/resources/production-methods-provenance.md', 'plugin-src/resources/production-creation.html','plugin-src/src/release.json', 'plugin-src/src/cli.mjs', 'plugin-src/src/content.mjs', 'plugin-src/src/commands/cover.mjs', 'plugin-src/src/commands/template.mjs', 'plugin-src/src/lib/file-library/template-jobs.mjs', 'plugin-src/src/bridge/handoff.js', 'plugin-src/src/bridge/native-handoff.mjs', 'cover-runtime/cli.mjs',
        ...allSkillNames.map(name => `skills/${name}/SKILL.md`), 'cover-runtime/skills/nova-content-cover-execution/SKILL.md',
        'hooks/codex.json', 'hooks/hooks.json', 'hooks/workbuddy.json', '.codex-plugin/plugin.json', '.codebuddy-plugin/plugin.json',
        'runtime/manifest.json', 'runtime/launch.mjs', 'runtime/LICENSE', `runtime/${platform === 'win32' ? 'node.exe' : 'node'}`, 'bin/run-node', 'bin/run-node.cmd'])];
}

// Package links always use POSIX semantics; only the final lookup uses the
// target filesystem. Keep this boundary explicit for native Windows builders.
export function resolveSkillReference(file, target, name, {sourceRoot = source, repoRoot = root, paths = path} = {}) {
    const installed = paths.relative(sourceRoot, file).split(paths.sep).join('/');
    const normalized = path.posix.resolve('/', path.posix.dirname(installed), target);
    const local = paths.join(normalized.startsWith('/plugin-src/') ? repoRoot : sourceRoot, ...normalized.slice(1).split('/'));
    const generatedRoot = ['references', 'schemas'].find(value => normalized.startsWith(`/skills/${name}/${value}/`));
    const generated = skillNames.includes(name) && generatedRoot
        ? paths.join(sourceRoot, generatedRoot, ...normalized.slice(`/skills/${name}/${generatedRoot}/`.length).split('/'))
        : null;
    return {installed, local, generated};
}

export async function validateSkills() {
    if (businessSkillRegistry.format !== 'nova-business-skill-registry' || businessSkillRegistry.schemaVersion !== 1 || businessSkillRegistry.version !== 1 || new Set(allSkillNames).size !== allSkillNames.length) throw Error('Invalid business Skill registry');
    if (!businessSkillNames.includes(businessSkillRegistry.defaultPositioningSkill)) throw Error('Missing default positioning Skill');
    const discovered = fs.readdirSync(join(source, 'skills'), {withFileTypes:true}).filter(entry=>entry.isDirectory()).map(entry=>entry.name).sort();
    if (JSON.stringify(discovered) !== JSON.stringify([...allSkillNames].sort())) throw Error('Skill directory and registry mismatch');
    const resourcePath = dependency => {
        if (typeof dependency !== 'string' || !/^(?:skills\/|plugin-src\/resources\/)/.test(dependency) || dependency.split('/').some(part => ['', '.', '..'].includes(part)) || dependency.includes('\\')) throw Error('Invalid business Skill dependency: '+dependency);
        return join(dependency.startsWith('skills/') ? source : root, dependency);
    };
    for (const method of businessSkillRegistry.methods) {
        if (method.role !== 'business-method' || !['adapted','adapted-from-history'].includes(method.status) || method.version !== 1 || !productionSkillNames.includes(method.executor) || !Array.isArray(method.workflows) || method.workflows.some(value=>typeof value!=='string'||!value)) throw Error('Invalid business Skill role: '+method.id);
        if (!method.source?.files?.length || method.source.files.some(file=>!file.path || !/^[a-f0-9]{64}$/.test(file.sha256)) || !method.dependencies.includes(`skills/${method.id}/SKILL.md`)) throw Error('Missing business Skill provenance: '+method.id);
        for (const dependency of method.dependencies) if (!fs.statSync(resourcePath(dependency)).isFile()) throw Error('Missing business Skill dependency: '+dependency);
        if (method.source.kind === 'workspace-source') for (const file of method.source.files) {
            const input=resourcePath(`skills/${file.path}`);
            if(createHash('sha256').update(await readFile(input)).digest('hex')!==file.sha256) throw Error('Workspace Skill source changed; refresh registry provenance: '+file.path);
        }
    }
    for (const name of allSkillNames) {
        const text = await readFile(join(source, 'skills', name, 'SKILL.md'), 'utf8');
        const frontmatter = /^---\nname: ([^\n]+)\ndescription: ([^\n]+)\n---\n/.exec(text);
        if (!frontmatter || frontmatter[1] !== name || frontmatter[2].length < 10 || /TODO|\[INSERT/.test(text)) throw Error('Invalid Skill identity: ' + name);
        const method = businessSkillRegistry.methods.find(value=>value.id===name);
        if (skillNames.includes(name) ? !text.includes('executable:false') : productionSkillNames.includes(name) ? !text.includes('production-contract.md') || !text.includes('production-artifacts.md') : method ? method.source.kind === 'workspace-source' ? !text.includes('production-contract.md') || !text.includes('production-artifacts.md') : !text.includes('business-method') || !text.includes('business-skills-contract.md') : !text.includes('AUTH_NOT_CONFIGURED') || !text.includes('contract check-request') || !text.includes('submit')) throw Error('Invalid Skill capability: ' + name);
        const inspect = async directory => {
            for (const entry of fs.readdirSync(directory,{withFileTypes:true})) {
                const file=join(directory,entry.name);
                if (entry.isDirectory()) {await inspect(file);continue;}
                if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
                const markdown=await readFile(file,'utf8');
                for (const match of markdown.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
                    const target=match[1].split('#')[0];
                    if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
                    // Installed Skills live in package/skills, while shared resources
                    // live in package/plugin-src/resources. Validate that real layout.
                    const {installed, local, generated} = resolveSkillReference(file, target, name);
                    if (!fs.existsSync(local) && !(generated&&fs.existsSync(generated))) throw Error(`Broken Skill reference: ${installed} -> ${target}`);
                }
            }
        };
        await inspect(join(source,'skills',name));
    }
}

async function manifests(dest, release, names, prefix = './skills') {
    const description = `${names.length === 3 ? '自媒体模板契约插件' : '自媒体工作台配套插件 · 调研、内容创作、封面与模板'}；${release.pairId}`;
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
        await cp(join(source, 'schemas'), join(dest, 'schemas'), {recursive: true, filter: releaseSourceFilter});
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
        await cp(join(source, 'references'), join(dest, 'references'), {recursive: true, filter: releaseSourceFilter});
        await writeFile(join(dest, 'bin/run-node'), '#!/bin/sh\nset -eu\nROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)\nexec node "$ROOT/dist/content.mjs" "$@"\n', {mode: 0o755});
        await writeFile(join(dest, 'bin/run-node.cmd'), '@echo off\r\nnode "%~dp0..\\dist\\content.mjs" %*\r\n');
        for (const name of skillNames) {
            const skill = join(dest, 'skills', name);
            await cp(join(source, 'skills', name), skill, {recursive: true, filter: releaseSourceFilter});
            await mkdir(join(skill, 'scripts'), {recursive: true});
            await mkdir(join(skill, 'references'), {recursive: true});
            await writeFile(join(skill, 'scripts/content.mjs'), cliSource);
            await cp(join(source, 'src/bridge/handoff.js'), join(skill, 'scripts/handoff.js'));
            await cp(join(source, 'schemas'), join(skill, 'schemas'), {recursive: true, filter: releaseSourceFilter});
            await json(join(skill, 'scripts/release.json'), release);
            await cp(join(source, 'references'), join(skill, 'references'), {recursive: true, filter: releaseSourceFilter});
        }
        await manifests(dest, release, skillNames);
        await assertArtifactSafe(dest);
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
    const {devDependencies: _devDependencies, ...runtimePackage} = sourcePackage;
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
        await cp(join(source, 'src'), join(target, 'plugin-src/src'), {recursive: true, filter: runtimeSourceFilter});
        // One release file serves both command spaces; compatibility paths never carry their own auth mode.
        await json(join(target, 'plugin-src/src/release.json'), release);
        await cp(join(source, 'schemas'), join(target, 'plugin-src/schemas'), {recursive: true, filter: releaseSourceFilter});
        // WorkBuddy's global Skill scanner uses this root even when manifests specify a custom path.
        await cp(join(source, 'skills'), join(target, 'skills'), {recursive: true, filter: releaseSourceFilter});
        await cp(join(source, 'references'), join(target, 'plugin-src/references'), {recursive: true, filter: releaseSourceFilter});
        for (const name of skillNames) {
            const skill = join(target, 'skills', name);
            await mkdir(join(skill, 'scripts'), {recursive: true});
            await writeFile(join(skill, 'scripts/content.mjs'), "import { main } from '../../../plugin-src/src/content.mjs';\nprocess.exitCode = await main(process.argv.slice(2));\n");
            await cp(join(source, 'references'), join(skill, 'references'), {recursive: true, filter: releaseSourceFilter});
            await cp(join(source, 'schemas'), join(skill, 'schemas'), {recursive: true, filter: releaseSourceFilter});
        }
        // Resource paths match the source tree; no dependency on the browser workbench.
        await cp(join(source, 'resources'), join(target, 'plugin-src/resources'), {recursive: true, filter: runtimeSourceFilter});
        await cp(join(source, 'compat/cover-runtime'), join(target, 'plugin-src/compat/cover-runtime'), {recursive: true, filter: input => basename(input) !== 'build.mjs' && runtimeSourceFilter(input)});
        await writeFile(join(target, 'cover-runtime/cli.mjs'), "import {main} from '../plugin-src/src/commands/cover.mjs';\nprocess.exitCode = await main(process.argv.slice(2));\n");
        await cp(join(source, 'skills/nova-content-cover-execution'), join(target, 'cover-runtime/skills/nova-content-cover-execution'), {recursive: true, filter: releaseSourceFilter});
        const legacySkill = join(target, 'cover-runtime/skills/nova-content-cover-execution/SKILL.md');
        await writeFile(legacySkill, (await readFile(legacySkill, 'utf8')).replaceAll('../../bin/', '../../../bin/').replaceAll('..\\..\\bin\\', '..\\..\\..\\bin\\'));
        await writeFile(join(target, 'cover-runtime/README.md'), '# 封面制作\n\n请从工作台发起制作，再到所选助手完成生成，回工作台查看和选择结果。此目录是配套插件所需的兼容入口，请完整保留。\n');
        await writeFile(join(target, 'README.md'), '# 自媒体工作台配套插件\n\n在工作台“配套插件与使用帮助”中点击“准备安装插件”，到 Codex 或 WorkBuddy 的插件页面添加本地市场，再安装、启用并确认插件权限。回工作台检查连接后，即可发起封面制作或模板学习。\n\n无需另外安装 Node。请完整保留此目录；升级应用后，如提示版本不匹配，请同时更新配套插件。封面由所选助手生成，可能使用已有的助手额度。\n');
        await writeFile(join(target, 'runtime/README.md'), '# 配套运行时\n\n本目录包含插件所需的 Node.js 及其许可证，无需单独安装。请完整保留目录内容；如提示文件损坏或系统、芯片不匹配，请重新获取对应安装包。\n');
        await manifests(target, release, allSkillNames);
        await writeLaunchers(target);
        await json(join(target, 'package.json'), {
            ...runtimePackage,
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
            skills: skillCapabilities(release.AUTH_MODE)
        });
        await assertArtifactSafe(target);
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
