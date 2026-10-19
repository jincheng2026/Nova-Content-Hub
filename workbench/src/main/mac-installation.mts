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
}

export const macApplicationTarget = '/Applications/自媒体工作台.app';
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

export async function recoverMacInstallation(options: Options): Promise<'none' | 'restored' | 'pending'> {
    await assertParent(options.target);
    const directory = await activeTransaction(path.dirname(options.target));
    if (!directory) return 'none';
    if (activeTransactions.has(directory)) throw Error('Another installation is still running');
    const record = await readRecord(directory, options), previous = path.join(directory, 'previous.app');
    if (record.phase === 'complete') { await releaseTransaction(directory); return 'none'; }
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
    if (record.previous) await matches(path.join(directory, 'previous.app'), record.previous);
    await writeRecord(directory, {...record, phase: 'complete'});
    return true;
}

export async function installMacApplication(options: Options): Promise<{transaction: string; execPath: string}> {
    await assertParent(options.target);
    if (path.resolve(options.source) === path.resolve(options.target)) throw Error('Application source and installation target must differ');
    await trustedBundle(options.source, options);
    if (await recoverMacInstallation(options) === 'pending') throw Error('上一次安装已完成复制，请从「应用程序」打开工作台；原应用仍保留在安装恢复目录。');
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
