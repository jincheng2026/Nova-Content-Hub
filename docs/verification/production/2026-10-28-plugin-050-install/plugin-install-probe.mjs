import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {snapshotPackage} from '../../../../plugin-src/src/lib/package-snapshot.mjs';

const app = '/Applications/自媒体工作台.app';
const resources = path.join(app, 'Contents/Resources');
const appRoot = path.join(resources, 'app');
const marketRoot = path.join(resources, 'plugin-marketplace');
const packageRoot = path.join(marketRoot, 'nova-content-hub');
const config = {
    codex: process.env.CODEX_HOME || path.join(os.homedir(), '.codex'),
    workbuddy: '/Users/mac/.workbuddy'
};
const pluginId = 'nova-content-hub@nova-content-hub-auth-disabled-darwin-arm64';
const marketplaceName = 'nova-content-hub-auth-disabled-darwin-arm64';
const capabilities = ['cover', 'template', 'research', 'writing'];
const expectedSkills = {
    cover: 'nova-content-cover-execution',
    template: 'nova-content-template-execution',
    research: 'nova-content-research-execution',
    writing: 'nova-content-writing-execution'
};
const xindaoFiles = {
    'SKILL.md': ['skills/xindao-xuanti/upstream/current/METHOD.md', '84189cd06fd9fdb4d5972380e2aecfa07d5e919ca97ec44c5748281486e6601d'],
    'manifest.json': ['skills/xindao-xuanti/upstream/current/manifest.json', '752a933eb20a75e5047f596363e2f6b05d089c2d53bfebcf2334c58f7b0f18b0'],
    'references/candidate-menu.md': ['skills/xindao-xuanti/upstream/current/references/candidate-menu.md', 'fd8c56d6326843e37edc8ec423a2c547e16353886efaa7942edb1c593d675ce3'],
    'references/material-intake.md': ['skills/xindao-xuanti/upstream/current/references/material-intake.md', 'd360a94c47b474a39d728652b938a4965f4a5eb094fb25ce912ac14860ae2995'],
    'references/topic-expansion.md': ['skills/xindao-xuanti/upstream/current/references/topic-expansion.md', '5af70b8cb10527f0ccfbe9978789a16ed1a3adbb83b37cfe93fd1b133ab2f027']
};
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const readJSON = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const report = {
    recordedAt: new Date().toISOString(),
    app,
    marketRoot,
    configRoots: {codex: process.env.CODEX_HOME ? '<CODEX_HOME>' : '<HOME>/.codex', workbuddy: config.workbuddy},
    hostEnvironment: {platform: process.platform, arch: process.arch, node: process.version, codexHomeEnvSet: Boolean(process.env.CODEX_HOME)},
    commands: [
        {host: 'codex', argv: ['/Users/mac/.local/bin/codex', 'plugin', 'marketplace', 'add', marketRoot, '--json'], exitCode: 0, result: {marketplaceName, alreadyAdded: true}},
        {host: 'codex', argv: ['/Users/mac/.local/bin/codex', 'plugin', 'add', pluginId, '--json'], exitCode: 0, result: {pluginId, version: '0.5.0', authPolicy: 'ON_INSTALL', installedPath: path.join(config.codex, 'plugins/cache', marketplaceName, 'nova-content-hub/0.5.0')}},
        {host: 'workbuddy', env: {WORKBUDDY_CONFIG_DIR: config.workbuddy, CODEBUDDY_CONFIG_DIR: config.workbuddy}, argv: ['/Users/mac/.local/bin/codebuddy', 'plugin', 'marketplace', 'add', marketRoot, '--name', marketplaceName], exitCode: 0, result: {name: marketplaceName, type: 'directory'}},
        {host: 'workbuddy', env: {WORKBUDDY_CONFIG_DIR: config.workbuddy, CODEBUDDY_CONFIG_DIR: config.workbuddy}, argv: ['/Users/mac/.local/bin/codebuddy', 'plugin', 'install', pluginId, '--scope', 'user'], exitCode: 0, result: {installed: true, note: 'CLI requests /reload-plugins or a new session to apply'}}
    ],
    registrations: {},
    runtimeChecks: [],
    completion: 'pending'
};

function commandJSON(host, args) {
    const binary = host === 'codex' ? '/Users/mac/.local/bin/codex' : '/Users/mac/.local/bin/codebuddy';
    const env = host === 'workbuddy' ? {...process.env, WORKBUDDY_CONFIG_DIR: config.workbuddy, CODEBUDDY_CONFIG_DIR: config.workbuddy} : process.env;
    const result = spawnSync(binary, args, {encoding: 'utf8', env, timeout: 60_000, maxBuffer: 8 * 1024 * 1024});
    if (result.error || result.status !== 0) throw new Error(`${host} ${args.join(' ')} failed (${result.error?.code ?? result.status ?? result.signal ?? 'unknown'})`);
    return JSON.parse(result.stdout);
}

function cliVersion(host) {
    const binary = host === 'codex' ? '/Users/mac/.local/bin/codex' : '/Users/mac/.local/bin/codebuddy';
    const result = spawnSync(binary, ['--version'], {encoding: 'utf8', env: host === 'workbuddy' ? {...process.env, WORKBUDDY_CONFIG_DIR: config.workbuddy, CODEBUDDY_CONFIG_DIR: config.workbuddy} : process.env, timeout: 30_000, maxBuffer: 64 * 1024});
    if (result.error || result.status !== 0) throw new Error(`${host} --version failed (${result.error?.code ?? result.status ?? result.signal ?? 'unknown'})`);
    return result.stdout.trim().replace(/[^\w .+()-]/g, '').slice(0, 100);
}

function findPluginObjects(value, found = []) {
    if (Array.isArray(value)) {
        for (const item of value) findPluginObjects(item, found);
        return found;
    }
    if (!value || typeof value !== 'object') return found;
    const values = Object.values(value);
    if (values.some(item => typeof item === 'string' && (item === pluginId || item === marketplaceName))) found.push(value);
    else for (const item of values) findPluginObjects(item, found);
    return found;
}

function projectPlugin(record) {
    const keys = ['id', 'name', 'plugin', 'pluginId', 'version', 'enabled', 'installed', 'installPath', 'installedPath', 'scope', 'marketplace', 'marketplaceName', 'authPolicy'];
    return Object.fromEntries(keys.filter(key => ['string', 'boolean', 'number'].includes(typeof record[key])).map(key => [key, record[key]]));
}

const release = await readJSON(path.join(appRoot, 'workbench/dist/release.json'));
if (process.platform !== 'darwin' || process.arch !== 'arm64' || release.version !== '0.5.0' || release.AUTH_MODE !== 'disabled' || release.pairId !== 'nova-content-hub@0.5.0:p1:disabled' || release.platform !== process.platform || release.arch !== process.arch) throw new Error('Installed app release does not match the fixed 0.5.0 darwin-arm64 target');
report.release = release;
report.cliVersions = {codex: cliVersion('codex'), codebuddy: cliVersion('workbuddy')};
const marketManifest = await readJSON(path.join(marketRoot, 'package-files.json'));
const snapshot = await snapshotPackage(packageRoot);
const integrity = await readJSON(path.join(packageRoot, 'integrity.json'));
const methodSources = await readJSON(path.join(packageRoot, 'plugin-src/resources/method-sources.json'));
const skillNames = (await fs.readdir(path.join(packageRoot, 'skills'), {withFileTypes: true})).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
const mismatches = Object.entries(integrity.hashes).filter(([file, hash]) => snapshot[file]?.sha256 !== hash).map(([file]) => file);
const xindao = {};
for (const [sourceName, [packedPath, expectedHash]] of Object.entries(xindaoFiles)) xindao[sourceName] = {path: packedPath, sha256: snapshot[packedPath]?.sha256 ?? null, matchesRecordedHash: snapshot[packedPath]?.sha256 === expectedHash};
const xindaoRecord = methodSources.versions?.find(version => version.versionId === 'xindao-xuanti:X:a3778c4f28b16179');
const xindaoSourceRecordMatches = Boolean(xindaoRecord && Object.entries(xindaoFiles).every(([sourceName, [packedPath]]) => {
    const entry = xindaoRecord.files?.find(file => file.sourcePath === sourceName);
    return entry?.installedPath === packedPath && entry.sha256 === snapshot[packedPath]?.sha256;
}));
report.marketplace = {
    packageFilesSha256: sha256(await fs.readFile(path.join(marketRoot, 'package-files.json'))),
    packageFilesFormat: marketManifest.format,
    packageFilesSchemaVersion: marketManifest.schemaVersion,
    packageFilesEntryCount: Object.keys(marketManifest.entries ?? {}).length,
    actualPackageEntryCount: Object.keys(snapshot).length,
    fullSnapshotMatches: isDeepStrictEqual(snapshot, marketManifest.entries),
    topLevelSkillCount: skillNames.length,
    allTopLevelSkillsHaveSkillMd: (await Promise.all(skillNames.map(async skill => fs.stat(path.join(packageRoot, 'skills', skill, 'SKILL.md')).then(stat => stat.isFile()).catch(() => false)))).every(Boolean),
    integrityFileCount: Object.keys(integrity.hashes ?? {}).length,
    integrityMismatches: mismatches,
    upstreamIntegrityFileCount: Object.keys(integrity.hashes ?? {}).filter(file => file.startsWith('skills/') && file.includes('/upstream/')).length,
    methodSourceVersionCount: methodSources.versions?.length ?? null,
    xindaoSourceRecord: {versionId: xindaoRecord?.versionId ?? null, fiveFilesMatchManifestAndPayload: xindaoSourceRecordMatches},
    xindaoOriginalFiles: xindao
};
if (report.marketplace.packageFilesFormat !== 'nova-content-marketplace-package-files' || report.marketplace.packageFilesSchemaVersion !== 1 || !report.marketplace.fullSnapshotMatches || report.marketplace.packageFilesEntryCount !== 1376 || report.marketplace.integrityFileCount !== 636 || report.marketplace.upstreamIntegrityFileCount !== 418 || report.marketplace.integrityMismatches.length || report.marketplace.topLevelSkillCount !== 28 || !report.marketplace.allTopLevelSkillsHaveSkillMd || report.marketplace.methodSourceVersionCount !== 53 || !xindaoSourceRecordMatches || Object.values(xindao).some(file => !file.matchesRecordedHash)) throw new Error('Final marketplace package validation failed');

for (const host of ['codex', 'workbuddy']) {
    const records = findPluginObjects(commandJSON(host, ['plugin', 'list', '--json']));
    if (records.length !== 1) throw new Error(`${host} must report exactly one registration for the target plugin`);
    const selected = projectPlugin(records[0]);
    const expectedCache = path.join(config[host], 'plugins/cache', marketplaceName, 'nova-content-hub/0.5.0');
    if (selected.version !== '0.5.0' || selected.enabled !== true) throw new Error(`${host} registration is not enabled at version 0.5.0`);
    if (host === 'codex' && (selected.installed !== true || selected.marketplaceName !== marketplaceName || selected.authPolicy !== 'ON_INSTALL')) throw new Error('Codex registration metadata mismatch');
    if (host === 'workbuddy' && (selected.id !== pluginId || selected.scope !== 'user' || selected.installPath !== expectedCache)) throw new Error('WorkBuddy registration path or scope mismatch');
    const cacheRelease = await readJSON(path.join(expectedCache, 'plugin-src/src/release.json'));
    const expectedPluginRelease = {...release, format: 'nova-content-plugin-release'};
    if (!isDeepStrictEqual(cacheRelease, expectedPluginRelease)) throw new Error(`${host} cache release does not match installed app release`);
    const oldCache = path.join(config[host], 'plugins/cache', marketplaceName, 'nova-content-hub/0.4.0');
    const old040CachePostInstall = await fs.lstat(oldCache).then(stat => stat.isDirectory()).catch(() => false);
    report.registrations[host] = {cli: '/Users/mac/.local/bin/' + (host === 'codex' ? 'codex' : 'codebuddy'), selectedPlugin: selected, expectedCachePath: expectedCache, cacheReleaseMatches: true, old040CachePreinstallStatus: 'not checked', old040CachePostInstall};
}

const skillModule = await import(pathToFileURL(path.join(appRoot, 'workbench/dist/main/assistant-skill.mjs')).href);
const runtimeModule = await import(pathToFileURL(path.join(appRoot, 'workbench/dist/main/assistant-runtime.mjs')).href);
for (const host of ['codex', 'workbuddy']) {
    const env = host === 'workbuddy' ? {...process.env, WORKBUDDY_CONFIG_DIR: config.workbuddy, CODEBUDDY_CONFIG_DIR: config.workbuddy} : process.env;
    for (const capability of capabilities) {
        const result = {host, capability, expectedSkill: expectedSkills[capability]};
        const started = Date.now();
        try {
            result.skill = skillModule.installedAssistantSkill(host, release, {home: os.homedir(), env, capability});
            let callbackCalled = false;
            await runtimeModule.launchWithAssistantRuntime(host, release, marketRoot, async () => { callbackCalled = true; }, {home: os.homedir(), env, capability});
            result.emptyCallbackReached = callbackCalled;
            result.status = result.skill === result.expectedSkill && callbackCalled ? 'PASS' : 'FAIL';
            if (result.status !== 'PASS') throw new Error('Installed Skill or empty callback mismatch');
        } catch (error) {
            result.status = 'FAIL';
            result.errorCode = error?.code ?? null;
            result.error = String(error?.message ?? error).slice(0, 240);
        }
        result.elapsedMs = Date.now() - started;
        report.runtimeChecks.push(result);
    }
}

const allPassed = report.runtimeChecks.length === 8 && report.runtimeChecks.every(check => check.status === 'PASS' && check.emptyCallbackReached === true);
const registrationsPassed = Object.keys(report.registrations).length === 2 && Object.values(report.registrations).every(entry => entry.selectedPlugin.version === '0.5.0' && entry.selectedPlugin.enabled && entry.cacheReleaseMatches);
report.completion = allPassed && registrationsPassed ? 'PASS' : 'FAIL';
report.limits = ['No model invocation, image generation, paid provider, external business service, real content library, or real task submission.', 'The current assistant conversation was not hot-reloaded; WorkBuddy CLI recommends /reload-plugins or a new session.', 'Verified only on this Apple Silicon macOS installation.'];
const output = path.join(path.dirname(fileURLToPath(import.meta.url)), 'plugin-install-evidence.json');
await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n', {mode: 0o600});
console.log(JSON.stringify({completion: report.completion, evidence: output, packageFilesSha256: report.marketplace.packageFilesSha256, registrations: Object.fromEntries(Object.entries(report.registrations).map(([host, value]) => [host, value.selectedPlugin])), runtimeChecks: report.runtimeChecks.map(({host, capability, status, skill, emptyCallbackReached, elapsedMs}) => ({host, capability, status, skill, emptyCallbackReached, elapsedMs}))}, null, 2));
if (report.completion !== 'PASS') process.exitCode = 1;
