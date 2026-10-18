import {constants} from 'node:fs';
import {lstat, open, readdir, readlink, realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname, isAbsolute, join, relative, resolve, sep} from 'node:path';

const inside = (parent, path) => {
    const value = relative(parent, path);
    return value === '' || (!isAbsolute(value) && value !== '..' && !value.startsWith('..' + sep));
};
const same = (before, after) => ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs', 'mode'].every(key => before[key] === after[key]);

// Preserve internal npm links; reject changing files and links outside the package.
export async function snapshotPackage(input, expected) {
    const root = await lstat(input);
    if (!root.isDirectory()) throw Error(`Unsafe marketplace directory: ${input}`);
    const base = await realpath(input), entries = {};
    async function walk(path) {
        const directory = await lstat(path);
        if (!directory.isDirectory()) throw Error(`Unsafe package directory: ${path}`);
        for (const name of (await readdir(path)).sort()) {
            if (/[\\:\u0000-\u001f\u007f]/.test(name) || ['.', '..', '__proto__'].includes(name)) throw Error(`Unsafe package entry path: ${name}`);
            const file = join(path, name), key = relative(base, file).split(sep).join('/');
            const stat = await lstat(file), trusted = expected?.[key];
            if (expected && !Object.hasOwn(expected, key)) throw Error(`Unexpected package entry: ${key}`);
            if (stat.isSymbolicLink()) {
                const target = await readlink(file);
                if (/[\\:\u0000-\u001f\u007f]/.test(target) || isAbsolute(target) || !inside(base, resolve(dirname(file), target)) || !inside(base, await realpath(file))) throw Error(`Escaping package symlink: ${key}`);
                if (expected && trusted.link !== target) throw Error(`Package link mismatch: ${key}`);
                if (!same(stat, await lstat(file)) || target !== await readlink(file)) throw Error(`Package changed while reading: ${key}`);
                entries[key] = {link: target};
            } else if (stat.isDirectory()) {
                if (expected && trusted.directory !== true) throw Error(`Package type mismatch: ${key}`);
                entries[key] = {directory: true};
                await walk(file);
            } else if (stat.isFile()) {
                if (expected && (trusted.bytes !== stat.size || trusted.executable !== Boolean(stat.mode & 0o111))) throw Error(`Package file mismatch: ${key}`);
                const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
                try {
                    if (!same(stat, await handle.stat())) throw Error(`Package changed while reading: ${key}`);
                    const digest = createHash('sha256'), buffer = Buffer.alloc(64 * 1024);
                    let bytes = 0;
                    for (;;) {
                        const {bytesRead} = await handle.read(buffer, 0, Math.min(buffer.length, stat.size - bytes + 1), null);
                        if (!bytesRead) break;
                        bytes += bytesRead;
                        if (bytes > stat.size) throw Error(`Package changed while reading: ${key}`);
                        digest.update(buffer.subarray(0, bytesRead));
                    }
                    if (bytes !== stat.size || !same(stat, await handle.stat()) || !same(stat, await lstat(file))) throw Error(`Package changed while reading: ${key}`);
                    const sha256 = digest.digest('hex');
                    if (expected && trusted.sha256 !== sha256) throw Error(`Package hash mismatch: ${key}`);
                    entries[key] = {sha256, bytes, executable: Boolean(stat.mode & 0o111)};
                } finally { await handle.close(); }
            } else throw Error(`Unsupported package entry: ${key}`);
        }
        if (!same(directory, await lstat(path))) throw Error(`Package directory changed while reading: ${path}`);
    }
    await walk(base);
    if (!same(root, await lstat(input))) throw Error('Package root changed while reading');
    return entries;
}
