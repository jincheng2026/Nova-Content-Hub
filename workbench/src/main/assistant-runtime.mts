import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile, type ExecFileException, type ExecFileOptionsWithStringEncoding, type ChildProcess} from 'node:child_process';
import {isDeepStrictEqual} from 'node:util';
import {createHash} from 'node:crypto';
import {snapshotPackage, type PackageEntry} from '../../../plugin-src/src/lib/package-snapshot.mjs';
import {installedAssistantSkill, readAssistantFile} from './assistant-skill.mts';
import {isRecord, type Release} from '../shared/contracts.ts';
import type {Assistant} from '../shared/cover-contracts.ts';

type Runner = (file: string, args: string[], options: ExecFileOptionsWithStringEncoding, callback: (error: ExecFileException | null, stdout: string, stderr: string) => void) => ChildProcess;
type Options = {home?: string; env?: NodeJS.ProcessEnv; capability?: 'cover' | 'template' | 'research' | 'writing'; run?: Runner};
const notReady = () => Object.assign(new Error('配套插件校验或启动未完成，请在设置中检查匹配版本后重试；原尝试已保留。'), {code: 'NOT_READY'});
const identity = (stat: Awaited<ReturnType<typeof fs.lstat>>) => [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs, stat.mode];
type HostMetadata = {entries: Record<string, PackageEntry>; identities: Record<string, ReturnType<typeof identity>>};

// WorkBuddy atomically writes PID usage markers; these data files grant no execution authority.
export async function readWorkBuddyCacheMetadata(root: string): Promise<HostMetadata> {
    const result: HostMetadata = {entries: {}, identities: {}}, directory = path.join(root, '.in_use');
    if (!path.isAbsolute(root)) throw notReady();
    let before;
    try { before = await fs.lstat(directory); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return result; throw error; }
    if (!before.isDirectory()) throw notReady();
    result.entries['.in_use'] = {directory: true}; result.identities['.in_use'] = identity(before);
    let count = 0;
    for await (const entry of await fs.opendir(directory)) {
        const match = /^([1-9]\d{0,9})(?:\.tmp\.(\d{13})\.([a-z0-9]{1,16}))?$/.exec(entry.name);
        if (++count > 256 || !match || Number(match[1]) > 0xffff_ffff) throw notReady();
        const file = path.join(directory, entry.name), stat = await fs.lstat(file);
        if (!stat.isFile() || stat.nlink !== 1 || stat.size > 1024 || stat.mode & 0o111) throw notReady();
        const bytes = readAssistantFile(file, 1024);
        if (!(match[2] && bytes.length === 0)) {
            const marker: unknown = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
            const optional = process.platform === 'win32' ? 'procStartFt' : process.platform === 'linux' ? 'procStartTicks' : null;
            if (!isRecord(marker) || !Number.isSafeInteger(marker.pid) || String(marker.pid) !== match[1]) throw notReady();
            if (typeof marker.procStart !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(marker.procStart) || new Date(marker.procStart).toISOString() !== marker.procStart) throw notReady();
            if (Object.keys(marker).some(key => key !== 'pid' && key !== 'procStart' && key !== optional)) throw notReady();
            if (optional && Object.hasOwn(marker, optional) && (typeof marker[optional] !== 'string' || !/^[1-9]\d{0,19}$/.test(marker[optional]))) throw notReady();
        }
        if (!isDeepStrictEqual(identity(stat), identity(await fs.lstat(file)))) throw notReady();
        const key = `.in_use/${entry.name}`;
        result.entries[key] = {sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, executable: false};
        result.identities[key] = identity(stat);
    }
    if (!isDeepStrictEqual(identity(before), identity(await fs.lstat(directory)))) throw notReady();
    return result;
}

// Warm the exact installed inode before the host's short hook budget starts.
export async function launchWithAssistantRuntime(host: Assistant, release: Release, marketRoot: string, launch: () => Promise<void>, {home = os.homedir(), env = process.env, capability = 'cover', run = execFile}: Options = {}): Promise<void> {
    try {
        installedAssistantSkill(host, release, {home, env, capability});
        const manifest: unknown = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(readAssistantFile(path.join(marketRoot, 'package-files.json'))));
        if (!isRecord(manifest) || manifest.format !== 'nova-content-marketplace-package-files' || manifest.schemaVersion !== 1 || !isDeepStrictEqual(manifest.release, {...release, format: 'nova-content-plugin-release'}) || !isRecord(manifest.entries)) throw notReady();
        const config = host === 'codex' ? env.CODEX_HOME || path.join(home, '.codex') : env.WORKBUDDY_CONFIG_DIR || env.CODEBUDDY_CONFIG_DIR || path.join(home, '.workbuddy');
        const root = path.join(config, 'plugins/cache', `${release.appScope}-auth-${release.AUTH_MODE}-${release.platform}-${release.arch}`, release.appScope, release.version);
        if (Object.keys(manifest.entries).some(key => key === '.in_use' || key.startsWith('.in_use/'))) throw notReady();
        const metadata = host === 'workbuddy' ? await readWorkBuddyCacheMetadata(root) : null;
        const expected = {...manifest.entries, ...metadata?.entries};
        const omitted = 'node_modules/.bin/semver';
        if (host === 'codex' && isDeepStrictEqual(expected[omitted], {link: '../semver/bin/semver.js'})) {
            try { await fs.lstat(path.join(root, omitted)); }
            catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; delete expected[omitted]; }
        }
        const node = path.join(root, 'runtime', process.platform === 'win32' ? 'node.exe' : 'node'), launcher = path.join(root, 'runtime/launch.mjs');
        const before = await Promise.all([node, launcher].map(file => fs.lstat(file)));
        if (before.some(stat => !stat.isFile())) throw notReady();
        const snapshot = await snapshotPackage(root, expected as Parameters<typeof snapshotPackage>[1]);
        if (!isDeepStrictEqual(snapshot, expected)) throw notReady();
        const after = await Promise.all([node, launcher].map(file => fs.lstat(file)));
        if (after.some((stat, index) => !stat.isFile() || !isDeepStrictEqual(identity(stat), identity(before[index]!)))) throw notReady();
        if (metadata && !isDeepStrictEqual(metadata, await readWorkBuddyCacheMetadata(root))) throw notReady();
        const cleanEnv = Object.fromEntries(Object.entries(env).filter(([key]) => !/^(?:NODE_OPTIONS|NODE_PATH|ELECTRON_RUN_AS_NODE|LD_.*|DYLD_.*|_RLD.*|LDR_.*|LIBPATH|SHLIB_PATH|GCONV_PATH|GLIBC_TUNABLES)$/i.test(key)));
        await new Promise<void>((resolve, reject) => {
            const child = run(node, [launcher, 'doctor'], {cwd: root, env: cleanEnv, shell: false, encoding: 'utf8', timeout: 30_000, maxBuffer: 65_536, killSignal: 'SIGKILL', windowsHide: true}, (error, stdout, stderr) => {
                try {
                    if (error || stderr.trim() || Buffer.byteLength(stdout) > 65_536 || Buffer.byteLength(stderr) > 65_536) throw notReady();
                    const result: unknown = JSON.parse(stdout);
                    if (!isRecord(result) || result.ok !== true || result.authMode !== 'disabled' || result.library !== 'unbound' || result.imageGeneration !== false) throw notReady();
                    resolve();
                } catch { reject(notReady()); }
            });
            child.stdin?.end();
        });
    } catch { throw notReady(); }
    await launch();
}
