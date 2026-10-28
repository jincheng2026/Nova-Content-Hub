import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {snapshotPackage} from '../../../../plugin-src/src/lib/package-snapshot.mjs';

const app = '/Applications/自媒体工作台.app';
const repo = '/Users/mac/code/dashboard/Nova-Content-Hub';
const resources = path.join(app, 'Contents/Resources');
const appRoot = path.join(resources, 'app');
const marketRoot = path.join(resources, 'plugin-marketplace');
const packageRoot = path.join(marketRoot, 'nova-content-hub');
const priorPackageFilesSha256 = 'a3e21088e99137e99b9c79157b10316f4c91833034cae6c6383e20d9646d1b3c';
const expectedFinalPackageFilesSha256 = 'b106be7b4da43ca24f2e5c835ef5c0f6428629971d0ab7f573754080a5b1d9ab';
const marketplaceName = 'nova-content-hub-auth-disabled-darwin-arm64';
const pluginId = `nova-content-hub@${marketplaceName}`;
const config = {
    codex: process.env.CODEX_HOME || path.join(os.homedir(), '.codex'),
    workbuddy: '/Users/mac/.workbuddy'
};
const capabilities = ['cover', 'template', 'research', 'writing'];
const xindaoFiles = {
    'SKILL.md': 'skills/xindao-xuanti/upstream/current/METHOD.md',
    'manifest.json': 'skills/xindao-xuanti/upstream/current/manifest.json',
    'references/candidate-menu.md': 'skills/xindao-xuanti/upstream/current/references/candidate-menu.md',
    'references/material-intake.md': 'skills/xindao-xuanti/upstream/current/references/material-intake.md',
    'references/topic-expansion.md': 'skills/xindao-xuanti/upstream/current/references/topic-expansion.md'
};
const expectedSkills = {
    cover: 'nova-content-cover-execution',
    template: 'nova-content-template-execution',
    research: 'nova-content-research-execution',
    writing: 'nova-content-writing-execution'
};
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const readJSON = async file => JSON.parse(await fs.readFile(file, 'utf8'));

function commandJSON(host) {
    const binary = host === 'codex' ? '/Users/mac/.local/bin/codex' : '/Users/mac/.local/bin/codebuddy';
    const env = host === 'workbuddy' ? {...process.env, WORKBUDDY_CONFIG_DIR: config.workbuddy, CODEBUDDY_CONFIG_DIR: config.workbuddy} : process.env;
    const result = spawnSync(binary, ['plugin', 'list', '--json'], {encoding: 'utf8', env, timeout: 60_000, maxBuffer: 8 * 1024 * 1024});
    if (result.error || result.status !== 0) throw new Error(`${host} plugin list failed (${result.error?.code ?? result.status ?? result.signal ?? 'unknown'})`);
    return JSON.parse(result.stdout);
}

function findPluginRecords(value, found = []) {
    if (Array.isArray(value)) {
        for (const item of value) findPluginRecords(item, found);
    } else if (value && typeof value === 'object') {
        const values = Object.values(value);
        if (values.some(item => typeof item === 'string' && (item === pluginId || item === marketplaceName))) found.push(value);
        else for (const item of values) findPluginRecords(item, found);
    }
    return found;
}

const release = await readJSON(path.join(appRoot, 'workbench/dist/release.json'));
if (process.platform !== 'darwin' || process.arch !== 'arm64' || release.version !== '0.5.0' || release.AUTH_MODE !== 'disabled' || release.pairId !== 'nova-content-hub@0.5.0:p1:disabled' || release.platform !== process.platform || release.arch !== process.arch) throw new Error('Installed app release is not the expected 0.5.0 darwin-arm64 build');
const installation = await readJSON(path.join(repo, 'docs/verification/production/2026-10-28-final-050-arm64-v4/installation.json'));
if (installation.sourceCommit !== 'baf01944e3b662151db83ca547d8b80ee4378722' || installation.installerSha256 !== '7379e3980d7d1f895871da2dd8714fa27f17b6b45a0a93ed64149d7d965b5f3b' || installation.installerBytes !== 3200826235 || installation.installed !== true) throw new Error('Final DMG installation receipt does not match the announced 0.5.0 build');
const marketManifest = await readJSON(path.join(marketRoot, 'package-files.json'));
const packageSnapshot = await snapshotPackage(packageRoot);
const packageFilesSha256 = sha256(await fs.readFile(path.join(marketRoot, 'package-files.json')));
const marketMatchesExpected = packageFilesSha256 === expectedFinalPackageFilesSha256;
if (marketManifest.format !== 'nova-content-marketplace-package-files' || marketManifest.schemaVersion !== 1 || !isDeepStrictEqual(packageSnapshot, marketManifest.entries)) throw new Error('Final installed marketplace full snapshot does not match its manifest');
const integrity = await readJSON(path.join(packageRoot, 'integrity.json'));
const methodSources = await readJSON(path.join(packageRoot, 'plugin-src/resources/method-sources.json'));
const skillDirectories = (await fs.readdir(path.join(packageRoot, 'skills'), {withFileTypes: true})).filter(entry => entry.isDirectory()).map(entry => entry.name);
const integrityMismatches = Object.entries(integrity.hashes ?? {}).filter(([file, expectedHash]) => packageSnapshot[file]?.sha256 !== expectedHash).map(([file]) => file);
const xindaoSource = methodSources.versions?.find(version => version.versionId === 'xindao-xuanti:X:a3778c4f28b16179');
const xindaoHashes = Object.fromEntries(Object.entries(xindaoFiles).map(([sourceName, packedPath]) => {
    const sourceRecord = xindaoSource?.files?.find(file => file.sourcePath === sourceName);
    return [sourceName, {packedPath, sha256: packageSnapshot[packedPath]?.sha256 ?? null, sourceManifestMatches: sourceRecord?.installedPath === packedPath && sourceRecord?.sha256 === packageSnapshot[packedPath]?.sha256}];
}));
const xindaoMatches = Object.values(xindaoHashes).length === 5 && Object.values(xindaoHashes).every(file => file.sourceManifestMatches);
const marketplaceIntegrity = {
    topLevelSkillCount: skillDirectories.length,
    allSkillsHaveTopLevelSkillMd: (await Promise.all(skillDirectories.map(async skill => fs.stat(path.join(packageRoot, 'skills', skill, 'SKILL.md')).then(stat => stat.isFile()).catch(() => false)))).every(Boolean),
    integrityFileCount: Object.keys(integrity.hashes ?? {}).length,
    integrityMismatches,
    upstreamIntegrityFileCount: Object.keys(integrity.hashes ?? {}).filter(file => file.startsWith('skills/') && file.includes('/upstream/')).length,
    methodSourceVersionCount: methodSources.versions?.length ?? null,
    xindaoOriginalFiles: xindaoHashes
};
if (marketplaceIntegrity.topLevelSkillCount !== 28 || !marketplaceIntegrity.allSkillsHaveTopLevelSkillMd || marketplaceIntegrity.integrityFileCount !== 636 || marketplaceIntegrity.integrityMismatches.length || marketplaceIntegrity.upstreamIntegrityFileCount !== 418 || marketplaceIntegrity.methodSourceVersionCount !== 53 || !xindaoMatches) throw new Error('Final installed marketplace integrity/source checks failed');
const archiveEvidencePath = path.join(repo, 'docs/verification/production/2026-10-28-plugin-050-install/workbuddy-cache-isolation-v4.json');
const archiveEvidence = await readJSON(archiveEvidencePath);
if (!archiveEvidence.movedAsWholeDirectory || archiveEvidence.payloadEntryCount !== 1376 || archiveEvidence.payloadSnapshotSha256 !== 'f13b2946adeb54b12547de0bf37d16ded984026b4795eb2e83c38c7d586cf2c0' || !archiveEvidence.identicalToLockedPreMoveSnapshot) throw new Error('WorkBuddy old cache archive evidence is incomplete');
const report = {
    recordedAt: new Date().toISOString(),
    app,
    marketRoot,
    installation: {sourceCommit: installation.sourceCommit, dmgSha256: installation.installerSha256, dmgBytes: installation.installerBytes, receipt: 'docs/verification/production/2026-10-28-final-050-arm64-v4/installation.json'},
    release,
    comparison: {priorPackageFilesSha256, expectedFinalPackageFilesSha256, finalPackageFilesSha256: packageFilesSha256, changedFromPrevious: packageFilesSha256 !== priorPackageFilesSha256, matchesExpectedFinalMarket: marketMatchesExpected, packageEntryCount: Object.keys(packageSnapshot).length, fullSnapshotMatches: true},
    marketplaceIntegrity,
    officialRefreshCommands: [
        {host: 'codex', argv: ['/Users/mac/.local/bin/codex', 'plugin', 'add', pluginId, '--json'], exitCode: 0, result: {version: '0.5.0', authPolicy: 'ON_INSTALL', installedPath: path.join(config.codex, 'plugins/cache', marketplaceName, 'nova-content-hub/0.5.0')}},
        {host: 'workbuddy', env: {WORKBUDDY_CONFIG_DIR: config.workbuddy, CODEBUDDY_CONFIG_DIR: config.workbuddy}, argv: ['/Users/mac/.local/bin/codebuddy', 'plugin', 'update', pluginId, '--scope', 'user'], exitCode: 0, result: {updated: true, note: 'CLI requests /reload-plugins or a new session to apply'}},
        {host: 'workbuddy', env: {WORKBUDDY_CONFIG_DIR: config.workbuddy, CODEBUDDY_CONFIG_DIR: config.workbuddy}, argv: ['/Users/mac/.local/bin/codebuddy', 'plugin', 'marketplace', 'update', marketplaceName], exitCode: 0, result: {updated: true}},
        {host: 'workbuddy', env: {WORKBUDDY_CONFIG_DIR: config.workbuddy, CODEBUDDY_CONFIG_DIR: config.workbuddy}, argv: ['/Users/mac/.local/bin/codebuddy', 'plugin', 'update', pluginId, '--scope', 'user'], exitCode: 0, result: {updated: true, note: 'CLI requests /reload-plugins or a new session to apply'}},
        {host: 'workbuddy', env: {WORKBUDDY_CONFIG_DIR: config.workbuddy, CODEBUDDY_CONFIG_DIR: config.workbuddy}, argv: ['/Users/mac/.local/bin/codebuddy', 'plugin', 'install', pluginId, '--scope', 'user'], exitCode: 0, result: {installed: true, note: 'CLI requests /reload-plugins or a new session to apply'}},
        {host: 'workbuddy', env: {WORKBUDDY_CONFIG_DIR: config.workbuddy, CODEBUDDY_CONFIG_DIR: config.workbuddy}, argv: ['/Users/mac/.local/bin/codebuddy', 'plugin', 'uninstall', pluginId, '--scope', 'user', '--keep-data'], exitCode: 0, result: {uninstalled: true}},
        {host: 'workbuddy', env: {WORKBUDDY_CONFIG_DIR: config.workbuddy, CODEBUDDY_CONFIG_DIR: config.workbuddy}, argv: ['/Users/mac/.local/bin/codebuddy', 'plugin', 'install', pluginId, '--scope', 'user'], exitCode: 0, result: {installed: true, note: 'CLI requests /reload-plugins or a new session to apply'}},
        {host: 'workbuddy', env: {WORKBUDDY_CONFIG_DIR: config.workbuddy, CODEBUDDY_CONFIG_DIR: config.workbuddy}, argv: ['/Users/mac/.local/bin/codebuddy', 'plugin', 'uninstall', pluginId, '--scope', 'user'], exitCode: 0, result: {uninstalled: true}},
        {host: 'workbuddy', env: {WORKBUDDY_CONFIG_DIR: config.workbuddy, CODEBUDDY_CONFIG_DIR: config.workbuddy}, argv: ['/Users/mac/.local/bin/codebuddy', 'plugin', 'install', pluginId, '--scope', 'user'], exitCode: 0, result: {installed: true, note: 'CLI requests /reload-plugins or a new session to apply'}},
        {host: 'workbuddy', env: {WORKBUDDY_CONFIG_DIR: config.workbuddy, CODEBUDDY_CONFIG_DIR: config.workbuddy}, argv: ['/Users/mac/.local/bin/codebuddy', 'plugin', 'uninstall', pluginId, '--scope', 'user', '--keep-data'], exitCode: 0, result: {uninstalled: true, selectorAbsent: true, targetCacheOpenReferences: 0}},
        {host: 'workbuddy', env: {WORKBUDDY_CONFIG_DIR: config.workbuddy, CODEBUDDY_CONFIG_DIR: config.workbuddy}, argv: ['/Users/mac/.local/bin/codebuddy', 'plugin', 'install', pluginId, '--scope', 'user'], exitCode: 0, result: {installed: true, note: 'fresh versioned cache created from final installed app marketplace'}}
    ],
    readOnlyCommandsRun: [
        {host: 'codex', argv: ['/Users/mac/.local/bin/codex', 'plugin', 'list', '--json'], readOnly: true},
        {host: 'workbuddy', env: {WORKBUDDY_CONFIG_DIR: config.workbuddy, CODEBUDDY_CONFIG_DIR: config.workbuddy}, argv: ['/Users/mac/.local/bin/codebuddy', 'plugin', 'list', '--json'], readOnly: true}
    ],
    selectorChecks: {},
    cacheComparisons: {},
    cacheIsolation: {
        archiveEvidence: 'workbuddy-cache-isolation-v4.json',
        uninstallGuardEvidence: 'workbuddy-cache-uninstall-guard-v4.json',
        archivePath: '/Users/mac/code/dashboard/Nova-Content-Hub/.local-probes/workbuddy-nova-content-hub-cache-refresh-v4-baf01944/0.5.0',
        priorCacheSnapshotEvidence: 'workbuddy-cache-before-isolation-v4.json',
        selectorUninstalledWithKeepData: true,
        selectorAbsentAndOpenReferencesZeroBeforeMove: true,
        oldCacheSnapshotRetained: true
    },
    runtimeChecks: [],
    probePerformsPluginMutation: false,
    completion: 'pending'
};

for (const host of ['codex', 'workbuddy']) {
    const records = findPluginRecords(commandJSON(host));
    if (records.length !== 1) throw new Error(`${host} CLI must return exactly one record for the selected plugin`);
    const record = records[0];
    const expectedCache = path.join(config[host], 'plugins/cache', marketplaceName, 'nova-content-hub/0.5.0');
    const selected = Object.fromEntries(['id', 'name', 'pluginId', 'version', 'enabled', 'installed', 'installPath', 'installedPath', 'scope', 'marketplaceName', 'authPolicy'].filter(key => ['string', 'boolean'].includes(typeof record[key])).map(key => [key, record[key]]));
    if (selected.version !== '0.5.0' || selected.enabled !== true) throw new Error(`${host} selected plugin is not enabled at 0.5.0`);
    if (host === 'codex' && (selected.installed !== true || selected.marketplaceName !== marketplaceName || selected.authPolicy !== 'ON_INSTALL')) throw new Error('Codex selector metadata mismatch');
    if (host === 'workbuddy' && (selected.id !== pluginId || selected.scope !== 'user' || selected.installPath !== expectedCache)) throw new Error('WorkBuddy selector path or scope mismatch');
    const cacheRelease = await readJSON(path.join(expectedCache, 'plugin-src/src/release.json'));
    if (!isDeepStrictEqual(cacheRelease, {...release, format: 'nova-content-plugin-release'})) throw new Error(`${host} cache release differs from the final app release`);
    report.selectorChecks[host] = {selectedPlugin: selected, expectedCachePath: expectedCache, cacheReleaseMatches: true};
    const expectedCacheSnapshot = {...marketManifest.entries};
    const optionalCodexSemverLink = 'node_modules/.bin/semver';
    let optionalCodexSemverOmitted = false;
    if (host === 'codex' && isDeepStrictEqual(expectedCacheSnapshot[optionalCodexSemverLink], {link: '../semver/bin/semver.js'})) {
        try { await fs.lstat(path.join(expectedCache, optionalCodexSemverLink)); }
        catch (error) {
            if (error?.code !== 'ENOENT') throw error;
            delete expectedCacheSnapshot[optionalCodexSemverLink];
            optionalCodexSemverOmitted = true;
        }
    }
    const fullCacheSnapshot = await snapshotPackage(expectedCache);
    const cacheSnapshot = Object.fromEntries(Object.entries(fullCacheSnapshot).filter(([key]) => key !== '.in_use' && !key.startsWith('.in_use/')));
    if (!isDeepStrictEqual(cacheSnapshot, expectedCacheSnapshot)) throw new Error(`${host} actual 0.5.0 cache bytes do not match final market`);
    report.cacheComparisons[host] = {
        cacheRoot: expectedCache,
        actualPayloadEntryCount: Object.keys(cacheSnapshot).filter(key => key !== '.in_use' && !key.startsWith('.in_use/')).length,
        expectedMarketPayloadEntryCount: Object.keys(marketManifest.entries).length,
        exactFinalMarketMatch: true,
        optionalCodexSemverLinkOmitted: optionalCodexSemverOmitted,
        workbuddyInUseMetadataEntries: Object.keys(fullCacheSnapshot).filter(key => key.startsWith('.in_use/')).length
    };
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
            let emptyCallbackReached = false;
            await runtimeModule.launchWithAssistantRuntime(host, release, marketRoot, async () => { emptyCallbackReached = true; }, {home: os.homedir(), env, capability});
            result.emptyCallbackReached = emptyCallbackReached;
            result.status = result.skill === result.expectedSkill && emptyCallbackReached ? 'PASS' : 'FAIL';
        } catch (error) {
            result.status = 'FAIL';
            result.errorCode = error?.code ?? null;
            result.error = String(error?.message ?? error).slice(0, 240);
        }
        result.elapsedMs = Date.now() - started;
        report.runtimeChecks.push(result);
    }
}

const runtimePassed = report.runtimeChecks.length === 8 && report.runtimeChecks.every(check => check.status === 'PASS' && check.emptyCallbackReached === true);
const selectorsPassed = Object.keys(report.selectorChecks).length === 2;
const cachesPassed = Object.keys(report.cacheComparisons).length === 2 && Object.values(report.cacheComparisons).every(result => result.exactFinalMarketMatch);
report.completion = marketMatchesExpected && runtimePassed && selectorsPassed && cachesPassed ? 'PASS' : 'FAIL';
report.limits = ['This evidence probe ran no install/update command; prior official CLI operations are listed separately above and the final cache was checked read-only.', 'No model invocation, image generation, paid provider, external service, real content library or real task submission.', 'The current assistant conversation was not reloaded; verified only on this Apple Silicon Mac.'];
const evidencePath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'post-final-market-evidence.json');
await fs.writeFile(evidencePath, JSON.stringify(report, null, 2) + '\n', {mode: 0o600});
console.log(JSON.stringify({completion: report.completion, evidence: evidencePath, comparison: report.comparison, selectorChecks: report.selectorChecks, cacheComparisons: report.cacheComparisons, runtimeChecks: report.runtimeChecks.map(({host, capability, status, skill, emptyCallbackReached}) => ({host, capability, status, skill, emptyCallbackReached}))}, null, 2));
if (report.completion !== 'PASS') process.exitCode = 1;
