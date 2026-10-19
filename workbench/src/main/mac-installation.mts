import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify, isDeepStrictEqual} from 'node:util';
import {createHash, randomUUID} from 'node:crypto';
import {snapshotPackage} from '../../../plugin-src/src/lib/package-snapshot.mjs';

const execute = promisify(execFile);
const allowedIdentifiers = new Set(['com.novaisland.nova-content-hub', 'com.novaisland.nova-content-hub.local', 'com.novaisland.nova-content-hub.testing']);
const transactionName = '.nova-content-hub-install';
const activeTransactions = new Set<string>();
const activePreviousVerifications = new Set<string>();
const fingerprint = (entries: object) => createHash('sha256').update(JSON.stringify(entries)).digest('hex');
interface Bundle {identifier: string; executable: string}
interface Identity {dev: number; ino: number; digest: string}
interface RecordData {
    format: 'nova-mac-install-v1'; ownerPid: number; target: string; bundleIdentifier: string; executable: string;
    phase: 'staging' | 'prepared' | 'published' | 'complete'; previous: Identity | null; candidate: Identity | null;
}
interface Options {
    source: string; target: string; bundleIdentifier: string; executable: string;
    running?: (target: string) => Promise<boolean>;
    verifySignature?: (app: string) => Promise<unknown>;
    readBundle?: (app: string) => Promise<Bundle>;
    copy?: (source: string, candidate: string) => Promise<unknown>;
    rename?: (from: string, to: string) => Promise<unknown>;
    archivePrevious?: (source: string, archive: string) => Promise<unknown>;
    extractPrevious?: (archive: string, destination: string) => Promise<unknown>;
}

export type BackupArchiveResult = {status: 'not-needed' | 'not-complete'} | {status: 'deferred'; reason: string} | {
    status: 'archived'; archive: string; receipt: string; archiveSha256: string; previous: Identity
};

export const macApplicationTarget = '/Applications/自媒体工作台.app';
export function isMacInstallationBackupExecutable(executable: string): boolean {
    return /^\/Applications\/\.nova-content-hub-install-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\/(?:previous\.app|candidate\.app|previous\.retiring|\.verify-previous\/payload\/previous\.app)\/Contents\/MacOS\/[^/\\\x00-\x1f]+$/.test(executable);
}
export function macApplicationSource(execPath: string): string {
    const source = path.dirname(path.dirname(path.dirname(execPath)));
    if (!source.endsWith('.app') || path.dirname(execPath) !== path.join(source, 'Contents/MacOS')) throw Error('Unsupported application executable path');
    return source;
}
export async function readMacBundle(app: string): Promise<Bundle> {
    const read = async (key: string) => (await execute('/usr/bin/plutil', ['-extract', key, 'raw', '-o', '-', path.join(app, 'Contents/Info.plist')], {timeout: 15000})).stdout.trim();
    return {identifier: await read('CFBundleIdentifier'), executable: await read('CFBundleExecutable')};
}
export async function isMacApplicationRunning(target: string): Promise<boolean> {
    if (await absent(target)) return false;
    // lsof reports kernel-backed executable mappings, including surviving helper processes.
    let stdout: string, stderr: string;
    try {
        ({stdout, stderr} = await execute('/usr/sbin/lsof', ['-nP', '-a', '-d', 'txt', '-Fpn', '+D', target], {timeout: 30000, maxBuffer: 4 * 1024 * 1024}));
    } catch (error) {
        const failure = error as {code?: number; stdout?: string; stderr?: string};
        if (failure.code !== 1 || typeof failure.stdout !== 'string' || failure.stderr !== '') throw Error('无法安全确认原工作台是否正在运行，请先退出后重试。', {cause: error});
        if (failure.stdout === '') return false;
        // A directory query may return 1 alongside matches; matches still require refusing replacement.
        stdout = failure.stdout; stderr = '';
    }
    if (stderr.trim() || !/^p\d+\n/m.test(stdout)) throw Error('Cannot safely determine whether the installed application is running');
    let processSeen = false, found = false;
    for (const line of stdout.split('\n')) {
        if (/^p\d+$/.test(line)) processSeen = true;
        else if (line === 'ftxt' && processSeen) continue;
        else if (line.startsWith('n') && processSeen) {
            const file = line.slice(1);
            if (file !== target && !file.startsWith(target + path.sep)) throw Error('Unexpected process mapping path');
            found = true;
        } else if (line !== '') throw Error('Unsupported process mapping response');
    }
    if (!found) throw Error('Missing process mapping path');
    return true;
}
const sign = (app: string) => execute('/usr/bin/codesign', ['--verify', '--deep', '--strict', app], {timeout: 120000, maxBuffer: 1024 * 1024});
const absent = async (file: string) => {
    try { await fs.lstat(file); return false; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true; throw error; }
};
async function appIdentity(file: string): Promise<Identity> {
    const before = await fs.lstat(file);
    if (!before.isDirectory() || before.isSymbolicLink() || !file.endsWith('.app')) throw Error('Unsafe application directory');
    const digest = fingerprint(await snapshotPackage(file));
    const after = await fs.lstat(file);
    if (before.dev !== after.dev || before.ino !== after.ino) throw Error('Application identity changed');
    return {dev: after.dev, ino: after.ino, digest};
}
async function matches(file: string, expected: Identity) {
    if (!isDeepStrictEqual(await appIdentity(file), expected)) throw Error('Application recovery identity mismatch');
}
async function trustedBundle(file: string, options: Options, previous = false) {
    const stat = await fs.lstat(file);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw Error('Unsafe application directory');
    const bundle = await (options.readBundle ?? readMacBundle)(file);
    if (!allowedIdentifiers.has(options.bundleIdentifier) || !allowedIdentifiers.has(bundle.identifier) || (!previous && bundle.identifier !== options.bundleIdentifier) || bundle.executable !== options.executable || !/^[^/\\\x00-\x1f]+$/.test(bundle.executable) || ['.', '..'].includes(bundle.executable)) throw Error('Unrecognized application bundle identity');
    const executable = await fs.lstat(path.join(file, 'Contents/MacOS', bundle.executable));
    if (!executable.isFile() || !(executable.mode & 0o111)) throw Error('Missing application executable');
}
async function syncDirectory(directory: string) {
    const handle = await fs.open(directory, 'r');
    try { await handle.sync(); } finally { await handle.close(); }
}
async function writeRecord(directory: string, record: RecordData) {
    const temporary = path.join(directory, `.record-${randomUUID()}`);
    const handle = await fs.open(temporary, 'wx', 0o600);
    try { await handle.writeFile(JSON.stringify(record) + '\n'); await handle.sync(); } finally { await handle.close(); }
    await fs.rename(temporary, path.join(directory, 'record.json'));
    await syncDirectory(directory);
}
function validIdentity(value: unknown): value is Identity {
    if (!value || typeof value !== 'object') return false;
    const v = value as Identity;
    return Number.isSafeInteger(v.dev) && Number.isSafeInteger(v.ino) && /^[a-f0-9]{64}$/.test(v.digest);
}
async function privateJSON(file: string) {
    const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
        const stat = await handle.stat();
        if (!stat.isFile() || stat.uid !== process.getuid?.() || stat.size > 8192 || (stat.mode & 0o077)) throw Error('Unknown installation record');
        const buffer = Buffer.alloc(8193), {bytesRead} = await handle.read(buffer, 0, buffer.length, 0);
        const after = await handle.stat();
        if (bytesRead > 8192 || bytesRead !== stat.size || stat.mtimeMs !== after.mtimeMs || stat.ctimeMs !== after.ctimeMs) throw Error('Installation record changed while reading');
        return {value: JSON.parse(buffer.subarray(0, bytesRead).toString('utf8')), stat};
    } finally { await handle.close(); }
}
async function activeTransaction(parent: string): Promise<string | null> {
    const active = path.join(parent, transactionName);
    if (await absent(active)) return null;
    const {value: claim, stat: activeStat} = await privateJSON(active);
    if (claim.format !== 'nova-mac-install-claim-v1' || typeof claim.directory !== 'string' || !/^\.nova-content-hub-install-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(claim.directory) || !Number.isSafeInteger(claim.dev) || !Number.isSafeInteger(claim.ino)) throw Error('Unknown installation claim');
    const directory = path.join(parent, claim.directory), stat = await fs.lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || (stat.mode & 0o077) || stat.dev !== claim.dev || stat.ino !== claim.ino) throw Error('Unknown installation transaction identity');
    const entry = await fs.lstat(path.join(directory, 'claim.json'));
    if (!entry.isFile() || entry.isSymbolicLink() || entry.dev !== activeStat.dev || entry.ino !== activeStat.ino) throw Error('Installation claim identity mismatch');
    return directory;
}
async function claimTransaction(directory: string) {
    const stat = await fs.lstat(directory), file = path.join(directory, 'claim.json');
    const handle = await fs.open(file, 'wx', 0o600);
    try {
        await handle.writeFile(JSON.stringify({format: 'nova-mac-install-claim-v1', directory: path.basename(directory), dev: stat.dev, ino: stat.ino}) + '\n');
        await handle.sync();
    } finally { await handle.close(); }
    await syncDirectory(directory);
    // An exclusive hard link publishes an initialized transaction without replacing any existing object.
    await fs.link(file, path.join(path.dirname(directory), transactionName));
    await syncDirectory(path.dirname(directory));
}
async function readRecord(directory: string, options: Options): Promise<RecordData> {
    const {value: record} = await privateJSON(path.join(directory, 'record.json'));
    if (record.format !== 'nova-mac-install-v1' || !Number.isSafeInteger(record.ownerPid) || record.ownerPid <= 0 || !allowedIdentifiers.has(options.bundleIdentifier) || record.target !== options.target || !allowedIdentifiers.has(record.bundleIdentifier) || record.executable !== options.executable || !['staging', 'prepared', 'published', 'complete'].includes(record.phase) || (record.previous !== null && !validIdentity(record.previous)) || (record.candidate !== null && !validIdentity(record.candidate))) throw Error('Unknown installation record');
    if (record.phase !== 'staging' && !record.candidate) throw Error('Missing installation candidate identity');
    return record;
}
function assertRecoveryOwner(record: RecordData) {
    if (record.ownerPid === process.pid) return;
    try { process.kill(record.ownerPid, 0); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') return; }
    throw Error('Another installation process may still be running; the recovery directory is preserved');
}
async function releaseTransaction(directory: string) {
    const parent = path.dirname(directory);
    if (await activeTransaction(parent) !== directory) throw Error('Installation claim changed; recovery evidence is preserved');
    await fs.unlink(path.join(parent, transactionName));
    await syncDirectory(parent);
}
async function assertParent(target: string) {
    const parent = path.dirname(target), stat = await fs.lstat(parent);
    if (!stat.isDirectory() || stat.isSymbolicLink() || await fs.realpath(parent) !== parent) throw Error('Unsafe Applications directory');
}

async function privateArchiveHash(file: string) {
    const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
        const before = await handle.stat();
        if (!before.isFile() || before.uid !== process.getuid?.() || before.nlink !== 1 || before.mode & 0o077) throw Error('Unsafe previous application archive');
        const hash = createHash('sha256'), buffer = Buffer.alloc(65536);
        for (;;) { const {bytesRead} = await handle.read(buffer); if (!bytesRead) break; hash.update(buffer.subarray(0, bytesRead)); }
        const after = await handle.stat(), named = await fs.lstat(file);
        if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || named.isSymbolicLink() || named.dev !== before.dev || named.ino !== before.ino) throw Error('Previous application archive changed');
        return hash.digest('hex');
    } finally { await handle.close(); }
}

async function clearPreviousVerification(directory: string, options: Options) {
    const scratch = path.join(directory, '.verify-previous');
    if (activePreviousVerifications.has(scratch)) throw Error('Previous archive verification is still running');
    if (await absent(scratch)) return;
    const stat = await fs.lstat(scratch);
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || stat.mode & 0o077) throw Error('Unknown previous verification directory');
    if (await absent(path.join(scratch, 'owner.json'))) {
        if ((await fs.readdir(scratch)).length) throw Error('Unknown nonempty previous verification directory');
        await fs.rmdir(scratch); await syncDirectory(directory); return;
    }
    const {value: owner} = await privateJSON(path.join(scratch, 'owner.json'));
    if (owner.format !== 'nova-mac-previous-verification-v1' || owner.dev !== stat.dev || owner.ino !== stat.ino || !Number.isSafeInteger(owner.ownerPid) || owner.ownerPid <= 0) throw Error('Unknown previous verification directory');
    if (owner.ownerPid !== process.pid) {
        let alive = true;
        try { process.kill(owner.ownerPid, 0); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') alive = false; }
        if (alive) throw Error('Another previous archive verification owner may still be running');
    }
    if (await (options.running ?? isMacApplicationRunning)(path.join(scratch, 'payload/previous.app'))) throw Error('Previous verification application is still running');
    const after = await fs.lstat(scratch);
    if (after.dev !== owner.dev || after.ino !== owner.ino || after.isSymbolicLink()) throw Error('Previous verification directory changed');
    if ((await fs.readdir(scratch)).some(name => !['owner.json', 'payload'].includes(name))) throw Error('Unknown previous verification contents');
    const payload = path.join(scratch, 'payload');
    if (!await absent(payload)) {
        const content = await fs.lstat(payload);
        if (!content.isDirectory() || content.isSymbolicLink()) throw Error('Unknown previous verification payload');
        // Keep ownership evidence durable until all extracted application bytes are gone.
        await fs.rm(payload, {recursive: true});
        await syncDirectory(scratch);
    }
    await fs.unlink(path.join(scratch, 'owner.json'));
    await syncDirectory(scratch);
    await fs.rmdir(scratch);
    await syncDirectory(directory);
}

async function verifyPreviousArchive(directory: string, previous: Identity, options: Options) {
    const stat = await fs.lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || stat.mode & 0o077) throw Error('Unsafe previous archive directory');
    const receipt = path.join(directory, 'receipt.json'), archive = path.join(directory, 'previous.app.zip');
    const {value} = await privateJSON(receipt);
    if (value.format !== 'nova-mac-previous-archive-v1' || !isDeepStrictEqual(value.previous, previous) || !/^[a-f0-9]{64}$/.test(value.archiveSha256) || await privateArchiveHash(archive) !== value.archiveSha256) throw Error('Previous application archive receipt mismatch');
    const transaction = path.dirname(directory), scratch = path.join(transaction, '.verify-previous'), validation = path.join(scratch, 'payload');
    await clearPreviousVerification(transaction, options);
    if (activePreviousVerifications.has(scratch)) throw Error('Previous archive verification is still running');
    activePreviousVerifications.add(scratch);
    let created = false;
    try {
        await fs.mkdir(scratch, {mode: 0o700}); created = true;
        const stat = await fs.lstat(scratch), handle = await fs.open(path.join(scratch, 'owner.json'), 'wx', 0o600);
        try { await handle.writeFile(JSON.stringify({format: 'nova-mac-previous-verification-v1', dev: stat.dev, ino: stat.ino, ownerPid: process.pid}) + '\n'); await handle.sync(); } finally { await handle.close(); }
        await syncDirectory(scratch); await syncDirectory(transaction);
        await fs.mkdir(validation, {mode: 0o700});
        await (options.extractPrevious ?? ((file, destination) => execute('/usr/bin/ditto', ['-x', '-k', file, destination], {timeout: 300000, maxBuffer: 1024 * 1024})))(archive, validation);
        const restored = path.join(validation, 'previous.app');
        if (fingerprint(await snapshotPackage(restored)) !== previous.digest) throw Error('Previous application archive round-trip mismatch');
        await trustedBundle(restored, options, true);
        await (options.verifySignature ?? sign)(restored);
        if (fingerprint(await snapshotPackage(restored)) !== previous.digest || await privateArchiveHash(archive) !== value.archiveSha256) throw Error('Previous archive changed during verification');
    } finally {
        activePreviousVerifications.delete(scratch);
        if (created) await clearPreviousVerification(transaction, options);
    }
    return {archive, receipt, archiveSha256: value.archiveSha256 as string};
}

export async function archiveCompletedMacBackup(options: Options, transaction?: string): Promise<BackupArchiveResult> {
    let staging: string | undefined;
    try {
        await assertParent(options.target);
        const directory = transaction ?? await activeTransaction(path.dirname(options.target));
        if (!directory) return {status: 'not-needed'};
        if (path.dirname(directory) !== path.dirname(options.target) || !/^\.nova-content-hub-install-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(path.basename(directory))) throw Error('Unknown backup transaction directory');
        if (activeTransactions.has(directory)) throw Error('Installation is still running');
        const stat = await fs.lstat(directory);
        if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || stat.mode & 0o077) throw Error('Unknown backup transaction identity');
        const {value: claim} = await privateJSON(path.join(directory, 'claim.json'));
        if (claim.format !== 'nova-mac-install-claim-v1' || claim.directory !== path.basename(directory) || claim.dev !== stat.dev || claim.ino !== stat.ino) throw Error('Unknown backup transaction identity');
        const record = await readRecord(directory, options);
        if (record.phase !== 'complete') return {status: 'not-complete'};
        if (!record.previous) return {status: 'not-needed'};
        const previous = path.join(directory, 'previous.app'), retiring = path.join(directory, 'previous.retiring');
        const archived = path.join(directory, 'previous-backup'), running = options.running ?? isMacApplicationRunning;
        if (!await absent(previous) && await running(previous)) return {status: 'deferred', reason: 'Previous application is still running'};
        if (await absent(archived)) {
            await matches(previous, record.previous);
            staging = await fs.mkdtemp(path.join(directory, '.archive-previous-'));
            const archive = path.join(staging, 'previous.app.zip');
            await (options.archivePrevious ?? ((app, file) => execute('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', app, file], {timeout: 300000, maxBuffer: 1024 * 1024})))(previous, archive);
            await fs.chmod(archive, 0o600);
            const handle = await fs.open(archive, constants.O_RDONLY | constants.O_NOFOLLOW);
            try { await handle.sync(); } finally { await handle.close(); }
            const receipt = {format: 'nova-mac-previous-archive-v1', previous: record.previous, archiveSha256: await privateArchiveHash(archive)};
            const saved = await fs.open(path.join(staging, 'receipt.json'), 'wx', 0o600);
            try { await saved.writeFile(JSON.stringify(receipt) + '\n'); await saved.sync(); } finally { await saved.close(); }
            await verifyPreviousArchive(staging, record.previous, options);
            await matches(previous, record.previous);
            await syncDirectory(staging);
            // Publish the verified archive and its receipt together; an existing backup is never replaced.
            if (!await absent(archived)) throw Error('Previous archive was published concurrently; retry verification');
            await (options.rename ?? fs.rename)(staging, archived);
            await syncDirectory(directory);
        }
        const verified = await verifyPreviousArchive(archived, record.previous, options);
        if (!await absent(previous)) {
            await matches(previous, record.previous);
            if (!await absent(retiring)) throw Error('Unknown retiring application directory');
            if (await running(previous)) return {status: 'deferred', reason: 'Previous application started while archiving'};
            await fs.rename(previous, retiring);
            await syncDirectory(directory);
        }
        if (!await absent(retiring)) {
            const current = await fs.lstat(retiring);
            if (!current.isDirectory() || current.isSymbolicLink() || current.dev !== record.previous.dev || current.ino !== record.previous.ino) throw Error('Retiring application identity changed');
            const authorization = path.join(directory, 'previous-removal.json');
            if (!await absent(authorization)) {
                const {value} = await privateJSON(authorization);
                if (value.format !== 'nova-mac-previous-removal-v1' || !isDeepStrictEqual(value.previous, record.previous) || value.archiveSha256 !== verified.archiveSha256 || value.birthtimeMs !== current.birthtimeMs) throw Error('Previous application removal authorization mismatch');
            } else if (fingerprint(await snapshotPackage(retiring)) !== record.previous.digest) throw Error('Retiring application tree changed');
            if (await running(retiring)) return {status: 'deferred', reason: 'Previous application is still running in its retirement directory'};
            if (await absent(authorization)) {
                const temporary = path.join(directory, `.previous-removal-${randomUUID()}`), handle = await fs.open(temporary, 'wx', 0o600);
                try { await handle.writeFile(JSON.stringify({format: 'nova-mac-previous-removal-v1', previous: record.previous, archiveSha256: verified.archiveSha256, birthtimeMs: current.birthtimeMs}) + '\n'); await handle.sync(); } finally { await handle.close(); }
                // An exclusive publication pins deletion authority before recursive removal can begin.
                await fs.link(temporary, authorization); await fs.unlink(temporary); await syncDirectory(directory);
            }
            // The durable verified archive protects recovery if recursive removal is interrupted.
            await fs.rm(retiring, {recursive: true});
            await syncDirectory(directory);
        }
        return {status: 'archived', ...verified, previous: record.previous};
    } catch (error) {
        return {status: 'deferred', reason: error instanceof Error ? error.message : 'Previous backup archival failed'};
    } finally {
        if (staging) await fs.rm(staging, {recursive: true, force: true}).catch(() => {});
    }
}

export async function recoverMacInstallation(options: Options): Promise<'none' | 'restored' | 'pending' | 'cleanup-pending'> {
    await assertParent(options.target);
    const directory = await activeTransaction(path.dirname(options.target));
    if (!directory) return 'none';
    if (activeTransactions.has(directory)) throw Error('Another installation is still running');
    const record = await readRecord(directory, options), previous = path.join(directory, 'previous.app');
    if (record.phase === 'complete') {
        const backup = await archiveCompletedMacBackup(options, directory);
        if (backup.status === 'deferred') return 'cleanup-pending';
        await releaseTransaction(directory); return 'none';
    }
    if (await absent(options.target)) {
        assertRecoveryOwner(record);
        if (record.previous && !await absent(previous)) {
            await matches(previous, record.previous);
            await trustedBundle(previous, options, true);
            if (await (options.running ?? isMacApplicationRunning)(options.target)) throw Error('「应用程序」中的工作台正在运行，请先退出。');
            await fs.rename(previous, options.target);
            await syncDirectory(path.dirname(options.target));
            await releaseTransaction(directory);
            return 'restored';
        }
        if (!record.previous && await absent(previous)) { await releaseTransaction(directory); return 'none'; }
        throw Error('Installation recovery requires inspection; the previous application is preserved');
    }
    if (record.candidate) {
        try { await matches(options.target, record.candidate); }
        catch (error) {
            if (record.previous && await absent(previous)) {
                assertRecoveryOwner(record);
                await matches(options.target, record.previous);
                await releaseTransaction(directory);
                return 'none';
            }
            throw error;
        }
        if (record.previous) await matches(previous, record.previous);
        return 'pending';
    }
    assertRecoveryOwner(record);
    if (record.previous) await matches(options.target, record.previous);
    else throw Error('Unrecognized application appeared during installation');
    if (!await absent(previous)) throw Error('Unknown previous application in installation directory');
    await releaseTransaction(directory);
    return 'none';
}

export async function confirmMacInstallation(options: Options): Promise<boolean> {
    if (options.source !== options.target) return false;
    const directory = await activeTransaction(path.dirname(options.target));
    if (!directory) return false;
    const record = await readRecord(directory, options);
    if (!record.candidate) return false;
    await matches(options.target, record.candidate);
    if (record.phase !== 'complete') {
        if (record.previous) await matches(path.join(directory, 'previous.app'), record.previous);
        await writeRecord(directory, {...record, phase: 'complete'});
    }
    const backup = await archiveCompletedMacBackup(options, directory);
    if (backup.status === 'deferred') console.warn('Previous application backup retirement deferred:', backup.reason);
    else {
        try { await releaseTransaction(directory); }
        catch (error) { console.warn('Completed installation claim release deferred:', error instanceof Error ? error.message : error); }
    }
    return true;
}

export async function installMacApplication(options: Options): Promise<{transaction: string; execPath: string}> {
    await assertParent(options.target);
    if (path.resolve(options.source) === path.resolve(options.target)) throw Error('Application source and installation target must differ');
    await trustedBundle(options.source, options);
    const recovery = await recoverMacInstallation(options);
    if (recovery === 'pending') throw Error('上一次安装已完成复制，请从「应用程序」打开工作台；原应用仍保留在安装恢复目录。');
    if (recovery === 'cleanup-pending') throw Error('旧版本备份尚未完成归档。请退出旧版本并确认磁盘空间后重试；原应用和恢复记录已保留。');
    const running = options.running ?? isMacApplicationRunning;
    if (await running(options.target)) throw Error('「应用程序」中的工作台正在运行，请先退出后重新安装。');
    const existed = !await absent(options.target);
    if (existed) await trustedBundle(options.target, options, true);
    const old = existed ? await appIdentity(options.target) : null;
    const source = await snapshotPackage(options.source);
    await (options.verifySignature ?? sign)(options.source);
    const directory = path.join(path.dirname(options.target), `${transactionName}-${randomUUID()}`);
    await fs.mkdir(directory, {mode: 0o700});
    let claimed = false;
    const candidate = path.join(directory, 'candidate.app'), previous = path.join(directory, 'previous.app');
    let record: RecordData = {format: 'nova-mac-install-v1', ownerPid: process.pid, target: options.target, bundleIdentifier: options.bundleIdentifier, executable: options.executable, phase: 'staging', previous: old, candidate: null};
    const rename = options.rename ?? fs.rename;
    try {
        await writeRecord(directory, record);
        await claimTransaction(directory);
        claimed = true;
        activeTransactions.add(directory);
        await (options.copy ?? ((from, to) => execute('/usr/bin/ditto', [from, to], {timeout: 300000, maxBuffer: 1024 * 1024})))(options.source, candidate);
        await trustedBundle(candidate, options);
        // Comparing both complete trees also detects entries that disappeared during copying.
        if (!isDeepStrictEqual(source, await snapshotPackage(candidate)) || !isDeepStrictEqual(source, await snapshotPackage(options.source))) throw Error('Application copy verification failed');
        await (options.verifySignature ?? sign)(candidate);
        const identity = await appIdentity(candidate);
        if (identity.digest !== fingerprint(source)) throw Error('Application changed after signature verification');
        record = {...record, phase: 'prepared', candidate: identity};
        await writeRecord(directory, record);
        if (await running(options.target)) throw Error('「应用程序」中的工作台正在运行，请先退出后重新安装。');
        if (old) await matches(options.target, old);
        else if (!await absent(options.target)) throw Error('Application target changed during installation');
        if (old) { await rename(options.target, previous); await syncDirectory(directory); await syncDirectory(path.dirname(options.target)); }
        if (!await absent(options.target)) throw Error('Application target changed before publication');
        await rename(candidate, options.target);
        await syncDirectory(directory);
        await syncDirectory(path.dirname(options.target));
        await matches(options.target, identity);
        await writeRecord(directory, {...record, phase: 'published'});
        return {transaction: directory, execPath: path.join(options.target, 'Contents/MacOS', options.executable)};
    } catch (error) {
        if (!claimed) throw error;
        if (old && await absent(options.target) && !await absent(previous)) {
            try {
                await matches(previous, old);
                await rename(previous, options.target);
                await syncDirectory(path.dirname(options.target));
            } catch { throw error; } // Leave the pinned previous app and record for recovery on the next launch.
        }
        // A published candidate stays pending when journaling/relaunch fails; recovery must retain its backup.
        if (record.candidate && !await absent(options.target)) {
            let published = false;
            try { await matches(options.target, record.candidate); published = true; } catch {}
            if (published) throw error;
        }
        await releaseTransaction(directory);
        throw error;
    } finally { activeTransactions.delete(directory); }
}
