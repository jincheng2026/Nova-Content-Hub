import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile, type ExecFileException, type ExecFileOptionsWithStringEncoding, type ChildProcess} from 'node:child_process';
import {isDeepStrictEqual} from 'node:util';
import {snapshotPackage} from '../../../plugin-src/src/lib/package-snapshot.mjs';
import {installedAssistantSkill, readAssistantFile} from './assistant-skill.mts';
import {isRecord, type Release} from '../shared/contracts.ts';
import type {Assistant} from '../shared/cover-contracts.ts';

type Runner = (file: string, args: string[], options: ExecFileOptionsWithStringEncoding, callback: (error: ExecFileException | null, stdout: string, stderr: string) => void) => ChildProcess;
type Options = {home?: string; env?: NodeJS.ProcessEnv; capability?: 'cover' | 'template'; run?: Runner};
const notReady = () => Object.assign(new Error('配套插件校验或启动未完成，请在设置中检查匹配版本后重试；原尝试已保留。'), {code: 'NOT_READY'});
const identity = (stat: Awaited<ReturnType<typeof fs.lstat>>) => [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs, stat.mode];

// Warm the exact installed inode before the host's short hook budget starts.
export async function launchWithAssistantRuntime(host: Assistant, release: Release, marketRoot: string, launch: () => Promise<void>, {home = os.homedir(), env = process.env, capability = 'cover', run = execFile}: Options = {}): Promise<void> {
    try {
        if (capability === 'template') installedAssistantSkill(host, release, {home, env, capability});
        else installedAssistantSkill(host, release, {home, env});
        const manifest: unknown = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(readAssistantFile(path.join(marketRoot, 'package-files.json'))));
        if (!isRecord(manifest) || manifest.format !== 'nova-content-marketplace-package-files' || manifest.schemaVersion !== 1 || !isDeepStrictEqual(manifest.release, {...release, format: 'nova-content-plugin-release'}) || !isRecord(manifest.entries)) throw notReady();
        const config = host === 'codex' ? env.CODEX_HOME || path.join(home, '.codex') : env.WORKBUDDY_CONFIG_DIR || env.CODEBUDDY_CONFIG_DIR || path.join(home, '.workbuddy');
        const root = path.join(config, 'plugins/cache', `${release.appScope}-auth-${release.AUTH_MODE}-${release.platform}-${release.arch}`, release.appScope, release.version);
        const expected = {...manifest.entries};
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
