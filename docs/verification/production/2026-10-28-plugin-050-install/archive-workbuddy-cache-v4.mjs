import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {isDeepStrictEqual} from 'node:util';
import {snapshotPackage} from '../../../../plugin-src/src/lib/package-snapshot.mjs';

const repo = '/Users/mac/code/dashboard/Nova-Content-Hub';
const config = '/Users/mac/.workbuddy';
const market = 'nova-content-hub-auth-disabled-darwin-arm64';
const pluginId = `nova-content-hub@${market}`;
const source = path.join(config, 'plugins/cache', market, 'nova-content-hub/0.5.0');
const marketRoot = '/Applications/自媒体工作台.app/Contents/Resources/plugin-marketplace';
const lockFile = path.join(repo, 'docs/verification/production/2026-10-28-plugin-050-install/workbuddy-cache-before-isolation-v4.json');
const guardFile = path.join(repo, 'docs/verification/production/2026-10-28-plugin-050-install/workbuddy-cache-uninstall-guard-v4.json');
const archiveRoot = path.join(repo, '.local-probes/workbuddy-nova-content-hub-cache-refresh-v4-baf01944');
const destination = path.join(archiveRoot, '0.5.0');
const reportFile = path.join(repo, 'docs/verification/production/2026-10-28-plugin-050-install/workbuddy-cache-isolation-v4.json');
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const samePayload = value => Object.fromEntries(Object.entries(value).filter(([key]) => key !== '.in_use' && !key.startsWith('.in_use/')));
const noLinkDirectory = async file => {
    const stat = await fs.lstat(file);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Refuse non-directory or symbolic link: ${file}`);
    return stat;
};

const lock = JSON.parse(await fs.readFile(lockFile, 'utf8'));
if (lock.targetSelector !== pluginId || lock.cacheRoot !== source || lock.cachePayloadEntryCount !== 1376 || !lock.entries) throw new Error('Target snapshot lock does not match the exact WorkBuddy 0.5.0 selector/path');
if (lock.marketPackageFilesSha256 !== 'b106be7b4da43ca24f2e5c835ef5c0f6428629971d0ab7f573754080a5b1d9ab') throw new Error('Locked snapshot references the wrong final marketplace');

const sourceStat = await noLinkDirectory(source);
const sourceReal = await fs.realpath(source);
if (sourceReal !== source) throw new Error('Target cache source is not its own canonical path');
for (const ancestor of [path.join(config, 'plugins'), path.join(config, 'plugins/cache'), path.join(config, 'plugins/cache', market), path.join(config, 'plugins/cache', market, 'nova-content-hub')]) {
    const stat = await noLinkDirectory(ancestor);
    if (await fs.realpath(ancestor) !== ancestor) throw new Error(`Target cache ancestor is not canonical: ${ancestor}`);
    if (stat.dev !== sourceStat.dev) throw new Error('Target cache ancestor is on a different filesystem');
}
const currentSnapshot = samePayload(await snapshotPackage(source));
if (Object.keys(currentSnapshot).length !== 1376 || !isDeepStrictEqual(currentSnapshot, lock.entries) || hash(currentSnapshot) !== lock.cacheSnapshotSha256) throw new Error('Current target cache bytes differ from the locked pre-move 1376-entry snapshot');

const env = {...process.env, WORKBUDDY_CONFIG_DIR: config, CODEBUDDY_CONFIG_DIR: config};
const list = spawnSync('/Users/mac/.local/bin/codebuddy', ['plugin', 'list', '--json'], {encoding: 'utf8', env, timeout: 60_000, maxBuffer: 8 * 1024 * 1024});
if (list.error || list.status !== 0) throw new Error(`Target-only CodeBuddy list failed (${list.error?.code ?? list.status ?? list.signal})`);
const matches = [];
function findTarget(value) {
    if (Array.isArray(value)) for (const item of value) findTarget(item);
    else if (value && typeof value === 'object') {
        if (Object.values(value).some(item => typeof item === 'string' && item === pluginId)) matches.push(value);
        else for (const item of Object.values(value)) findTarget(item);
    }
}
findTarget(JSON.parse(list.stdout));
if (matches.length !== 0) throw new Error('Target plugin remains installed in CodeBuddy CLI; refusing to move its cache');
const installed = JSON.parse(await fs.readFile(path.join(config, 'plugins/installed_plugins.json'), 'utf8'));
const leftoverRegistry = installed.plugins?.[pluginId];
const leftoverRows = Array.isArray(leftoverRegistry) ? leftoverRegistry.map(({scope, version, installPath}) => ({scope, version, installPath})) : null;
if (!Array.isArray(leftoverRows) || leftoverRows.length !== 1 || leftoverRows[0].scope !== 'user' || leftoverRows[0].version !== '0.5.0' || leftoverRows[0].installPath !== source) throw new Error('Unexpected leftover target registry metadata; refusing to move its cache');
const settings = JSON.parse(await fs.readFile(path.join(config, 'settings.json'), 'utf8'));
if (settings.enabledPlugins?.[pluginId] === true) throw new Error('Target plugin is still enabled; refusing to move its cache');
const guard = JSON.parse(await fs.readFile(guardFile, 'utf8'));
if (!guard.guardPassed || guard.targetSelector !== pluginId || guard.cacheRoot !== source || guard.settingsEnabled !== false || guard.cliTargetRecords.length !== 0 || guard.openReferencesUnderTargetCache !== 0 || !isDeepStrictEqual(guard.installedPluginsRegistryLeftoverRow, leftoverRows)) throw new Error('Post-uninstall active-reference evidence no longer matches the exact target');

const lsof = spawnSync('/usr/sbin/lsof', ['+D', source], {encoding: 'utf8', timeout: 60_000, maxBuffer: 8 * 1024 * 1024});
if (lsof.error || ![0, 1].includes(lsof.status)) throw new Error(`Unable to verify open references under target cache (${lsof.error?.code ?? lsof.status ?? lsof.signal})`);
const openFiles = (lsof.stdout ?? '').trim().split('\n').slice(1).filter(Boolean);
if (openFiles.length) throw new Error(`Target cache has ${openFiles.length} active open-file references; no session was stopped`);

const probeRoot = path.join(repo, '.local-probes');
const probeStat = await noLinkDirectory(probeRoot);
const probeReal = await fs.realpath(probeRoot);
if (probeReal !== probeRoot || probeStat.dev !== sourceStat.dev) throw new Error('Recovery parent is not a canonical directory on the source filesystem');
for (const file of [archiveRoot, destination, reportFile]) {
    try { await fs.lstat(file); throw new Error(`Refuse to overwrite existing recovery evidence or cache: ${file}`); }
    catch (error) { if (error?.code !== 'ENOENT') throw error; }
}

await fs.mkdir(archiveRoot, {mode: 0o700});
try {
    await fs.rename(source, destination);
    const archivedStat = await noLinkDirectory(destination);
    const archivedReal = await fs.realpath(destination);
    const archivedSnapshot = samePayload(await snapshotPackage(destination));
    const sourceAbsent = await fs.lstat(source).then(() => false, error => error?.code === 'ENOENT');
    if (archivedReal !== destination || archivedStat.dev !== sourceStat.dev || !sourceAbsent || !isDeepStrictEqual(archivedSnapshot, lock.entries) || hash(archivedSnapshot) !== lock.cacheSnapshotSha256) throw new Error('Archived directory failed exact post-move path or hash verification');
    const old040CacheRemains = await fs.lstat(path.join(config, 'plugins/cache', market, 'nova-content-hub/0.4.0')).then(stat => stat.isDirectory() && !stat.isSymbolicLink(), () => false);
    const report = {
        recordedAt: new Date().toISOString(),
        operation: 'officially uninstalled WorkBuddy target selector with --keep-data, verified selector absent and no open cache references, then renamed the entire exact 0.5.0 cache directory',
        targetSelector: pluginId,
        selectorAbsentBeforeMove: true,
        selectorAbsentEvidence: path.relative(repo, guardFile),
        inactiveRegistryMetadataLeftover: leftoverRows,
        openReferencesBeforeMove: 0,
        source,
        sourceCanonicalPath: sourceReal,
        sourceWasSymlink: false,
        destination,
        destinationCanonicalPath: archivedReal,
        destinationIsSymlink: false,
        movedAsWholeDirectory: true,
        payloadEntryCount: Object.keys(archivedSnapshot).length,
        payloadSnapshotSha256: hash(archivedSnapshot),
        identicalToLockedPreMoveSnapshot: isDeepStrictEqual(archivedSnapshot, lock.entries),
        onlyTargetPluginCacheMoved: true,
        old040CacheRemains,
        preMoveEvidence: path.relative(repo, lockFile)
    };
    await fs.writeFile(reportFile, JSON.stringify(report, null, 2) + '\n', {mode: 0o600, flag: 'wx'});
    console.log(JSON.stringify({status: 'ARCHIVED_AND_VERIFIED', ...report, archiveEvidence: reportFile}));
} catch (error) {
    const sourceExists = await fs.lstat(source).then(() => true, () => false);
    if (sourceExists) await fs.rmdir(archiveRoot).catch(() => {});
    throw error;
}
