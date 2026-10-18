import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash, randomUUID} from 'node:crypto';

const FORMAT = 'nova-content-library-backup';
const EXCLUDED = '系统（别动）/库锁';
const HASH = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const MAX_LINE = 65536;
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const fingerprint = stat => ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].map(key => String(stat[key])).join(':');
const identity = stat => `${stat.dev}:${stat.ino}`;

// Internal integration only: the public index exports the three finite business operations.
export function backupMethods(h) {
    const {
        fail,
        LibraryError,
        safePath,
        directory,
        descriptor,
        acquire,
        read,
        writeNew,
        syncDirectory,
        jsonBytes,
        hash,
        hook,
        libraryPin,
        prepareRestoredLibrary
    } = h;
    const stat = target => {
        safePath(target);
        return fs.lstatSync(target, {bigint: true});
    };

    function portable(relative) {
        if (typeof relative !== 'string' || !relative || relative.length > 8192 || relative.startsWith('/') || /[\\:<>"|?*\x00-\x1f\x7f]/.test(relative)) fail('UNSAFE_PATH', 'Unsafe backup relative path');
        for (const part of relative.split('/')) if (!part || part === '.' || part === '..' || /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(part)) fail('UNSAFE_PATH', 'Path cannot be represented safely on Windows and macOS');
        return relative;
    }

    const targetPath = (root, relative) => path.join(root, ...portable(relative).split('/'));

    function scan(root, excluded = false, assertIdentity = () => {}) {
        assertIdentity();
        directory(root);
        const entries = [], collisions = new Set();

        function walk(base, prefix = '') {
            assertIdentity();
            const before = stat(base);
            const names = fs.readdirSync(base).sort(compare);
            for (const name of names) {
                assertIdentity();
                const relative = prefix ? `${prefix}/${name}` : name;
                if (excluded && relative === EXCLUDED) continue;
                portable(relative);
                const key = relative.normalize('NFC').toLocaleLowerCase('en-US');
                if (collisions.has(key)) fail('UNSAFE_PATH', 'Case or Unicode normalization path collision');
                collisions.add(key);
                const filename = targetPath(root, relative), info = stat(filename);
                if (!info.isFile() && !info.isDirectory()) fail('UNSAFE_PATH', 'Backup accepts regular files and directories only');
                entries.push({
                    path: relative,
                    type: info.isDirectory() ? 'directory' : 'file',
                    fingerprint: fingerprint(info), ...(info.isFile() ? {bytes: Number(info.size)} : {})
                });
                if (info.isFile() && !Number.isSafeInteger(Number(info.size))) fail('CORRUPT', 'File size exceeds supported integer range');
                if (info.isDirectory()) walk(filename, relative);
            }
            if (fingerprint(before) !== fingerprint(stat(base))) fail('SOURCE_CHANGED', 'Directory changed while enumerating backup');
        }

        walk(root);
        return entries.sort((a, b) => compare(a.path, b.path));
    }

    function stableFile(filename, expected, destination, assertIdentity = () => {}) {
        assertIdentity();
        const before = stat(filename);
        if (!before.isFile() || fingerprint(before) !== expected.fingerprint) fail('SOURCE_CHANGED', `File changed before read: ${expected.path}`);
        const fd = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
        let out;
        try {
            if (fingerprint(fs.fstatSync(fd, {bigint: true})) !== fingerprint(before)) fail('SOURCE_CHANGED', 'File replaced during open');
            if (destination) {
                directory(path.dirname(destination));
                out = fs.openSync(destination, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
            }
            const digest = createHash('sha256'), chunk = Buffer.alloc(128 * 1024);
            let bytes = 0;
            for (; ;) {
                assertIdentity();
                const count = fs.readSync(fd, chunk, 0, chunk.length, null);
                if (!count) break;
                digest.update(chunk.subarray(0, count));
                bytes += count;
                if (bytes > expected.bytes) fail('SOURCE_CHANGED', `File grew while read: ${expected.path}`);
                if (out !== undefined) {
                    let offset = 0;
                    while (offset < count) {
                        const written = fs.writeSync(out, chunk, offset, count - offset);
                        if (!written) fail('IO_ERROR', 'Zero-byte write');
                        offset += written;
                    }
                }
            }
            if (out !== undefined) {
                hook('backupBeforeFileSync', {path: expected.path});
                assertIdentity();
                fs.fsyncSync(out);
            }
            const after = fs.fstatSync(fd, {bigint: true}), current = stat(filename);
            assertIdentity();
            if (fingerprint(before) !== fingerprint(after) || fingerprint(after) !== fingerprint(current) || BigInt(bytes) !== after.size) fail('SOURCE_CHANGED', `File changed while read: ${expected.path}`);
            return {bytes, sha256: digest.digest('hex')};
        } finally {
            if (out !== undefined) fs.closeSync(out);
            fs.closeSync(fd);
        }
    }

    function sameInventory(before, after) {
        if (before.length !== after.length || before.some((entry, index) => entry.path !== after[index].path || entry.type !== after[index].type || entry.fingerprint !== after[index].fingerprint)) fail('SOURCE_CHANGED', 'Tree changed during stable copy');
    }

    function copyTree(source, destination, entries, omitDescriptor = false, assertIdentity = () => {}) {
        for (const entry of entries.filter(item => item.type === 'directory').sort((a, b) => a.path.split('/').length - b.path.split('/').length || compare(a.path, b.path))) {
            assertIdentity();
            fs.mkdirSync(targetPath(destination, entry.path), {mode: 0o700});
        }
        const copied = [];
        for (const entry of entries) {
            assertIdentity();
            if (entry.type === 'directory') {
                copied.push({path: entry.path, type: entry.type});
                continue;
            }
            const digest = stableFile(targetPath(source, entry.path), entry, omitDescriptor && entry.path === '内容库.json' ? undefined : targetPath(destination, entry.path), assertIdentity);
            copied.push({path: entry.path, type: entry.type, ...digest});
            hook('backupAfterFile', {path: entry.path, source, destination});
            assertIdentity();
        }
        for (const entry of [...entries].filter(item => item.type === 'directory').reverse()) syncDirectory(targetPath(destination, entry.path));
        syncDirectory(destination);
        return copied;
    }

    function assertHashes(root, entries, expected) {
        if (entries.length !== expected.length) fail('SOURCE_CHANGED', 'Copied tree member count mismatch');
        if (entries.some((entry, index) => entry.path !== expected[index].path || entry.type !== expected[index].type)) fail('SOURCE_CHANGED', 'Copied tree member mismatch');
        sameInventory(entries, scan(root, false));
        for (let i = 0; i < entries.length; i++) if (entries[i].type === 'file') {
            const actual = stableFile(targetPath(root, entries[i].path), entries[i]);
            if (actual.sha256 !== expected[i].sha256 || actual.bytes !== expected[i].bytes) fail('SOURCE_CHANGED', 'File digest changed after copy');
        }
        sameInventory(entries, scan(root, false));
    }

    function parentBinding(destination, source) {
        if (typeof destination !== 'string' || !destination.trim()) fail('INVALID_INPUT', 'Exact new destination directory is required');
        const target = path.resolve(destination), parent = path.dirname(target);
        portable(path.basename(target));
        if (source && (target === source || target.startsWith(`${source}${path.sep}`))) fail('UNSAFE_PATH', 'Destination must be outside the source tree');
        directory(parent);
        if (safePath(target, true)) fail('DESTINATION_EXISTS', 'Destination must not exist, including an empty directory');
        const before = stat(parent);
        return {
            target, check() {
                if (identity(stat(parent)) !== identity(before)) fail('SOURCE_CHANGED', 'Destination parent was replaced');
            }
        };
    }

    function createTarget(binding) {
        binding.check();
        try {
            fs.mkdirSync(binding.target, {mode: 0o700});
        } catch (error) {
            if (error.code === 'EEXIST') fail('DESTINATION_EXISTS', 'Destination appeared concurrently');
            throw error;
        }
        binding.check();
        syncDirectory(path.dirname(binding.target));
    }

    function publish(target, bytes, phase, onPublished, beforePublish = () => {
    }) {
        const publishingParent = identity(stat(path.dirname(target)));
        const staged = path.join(path.dirname(path.dirname(target)), `.publish-${randomUUID()}`);
        writeNew(staged, bytes);
        const stagedInfo = {path: path.basename(staged), fingerprint: fingerprint(stat(staged)), bytes: bytes.length};
        hook(`${phase}BeforePublish`, {target});
        beforePublish();
        if (stableFile(staged, stagedInfo).sha256 !== hash(bytes)) fail('SOURCE_CHANGED', 'Publication bytes changed');
        if (identity(stat(path.dirname(target))) !== publishingParent) fail('SOURCE_CHANGED', 'Publication directory was replaced');
        fs.linkSync(staged, target);
        onPublished();
        hook(`${phase}AfterPublish`, {target});
        fs.unlinkSync(staged);
        syncDirectory(path.dirname(target));
    }

    const wrap = error => error instanceof LibraryError ? error : new LibraryError('IO_ERROR', error.message, {cause: error});

    function backupLibrary(root, destination, options) {
        let release, committed = false, primary;
        const backupId = randomUUID(), startedAt = new Date().toISOString();
        let binding;
        try {
            root = path.resolve(root);
            directory(root);
            let pin;
            if (options !== undefined) {
                const keys = ['allowSchema4', 'expectedLibraryId', 'expectedRootIdentity', 'expectedDescriptorHash'];
                if (!options || typeof options !== 'object' || Array.isArray(options) || Reflect.ownKeys(options).length !== keys.length || keys.some(key => !Object.hasOwn(options, key)) || options.allowSchema4 !== true) fail('INVALID_INPUT', 'Schema 4 backup requires the exact explicit pinned options');
                pin = libraryPin(root, {expectedLibraryId: options.expectedLibraryId, expectedRootIdentity: options.expectedRootIdentity, expectedDescriptorHash: options.expectedDescriptorHash});
                const selected = pin.snapshot();
                if (![4, 5].includes(selected.info.schemaVersion)) fail('FORMAT_UNSUPPORTED', 'Pinned backup accepts schema 4 or 5 only');
                if (hash(selected.bytes) !== pin.expectedDescriptorHash) fail('CONFLICT', 'Approved backup descriptor changed');
            }
            const rootIdentity = identity(stat(root)), original = read(path.join(root, '内容库.json')),
                initial = descriptor(root, !!pin);
            const check = () => {
                if (pin) {
                    const current = pin.snapshot();
                    if (![4, 5].includes(current.info.schemaVersion) || hash(current.bytes) !== pin.expectedDescriptorHash) fail('CONFLICT', 'Approved backup descriptor changed');
                }
                if (identity(stat(root)) !== rootIdentity || !read(path.join(root, '内容库.json')).equals(original) || descriptor(root, !!pin).libraryId !== initial.libraryId) fail('SOURCE_CHANGED', 'Library identity changed during backup');
            };
            check();
            binding = parentBinding(destination, root);
            release = acquire(root, read, fs.readdirSync, check);
            check();
            createTarget(binding);
            fs.mkdirSync(path.join(binding.target, 'data'), {mode: 0o700});
            hook('backupLocked', {root, destination: binding.target});
            check();
            const entries = scan(root, true, check), copied = copyTree(root, path.join(binding.target, 'data'), entries, false, check);
            const copiedInventory = scan(path.join(binding.target, 'data'));
            assertHashes(path.join(binding.target, 'data'), copiedInventory, copied);
            sameInventory(entries, scan(root, true, check));
            for (let i = 0; i < entries.length; i++) if (entries[i].type === 'file' && stableFile(targetPath(root, entries[i].path), entries[i], undefined, check).sha256 !== copied[i].sha256) fail('SOURCE_CHANGED', 'Source digest changed after copy');
            sameInventory(entries, scan(root, true, check));
            check();
            if (identity(stat(root)) !== rootIdentity || !read(path.join(root, '内容库.json')).equals(original)) fail('SOURCE_CHANGED', 'Library changed at backup boundary');
            const entriesPath = path.join(binding.target, 'entries.ndjson');
            const fd = fs.openSync(entriesPath, 'wx', 0o600), entriesDigest = createHash('sha256');
            try {
                for (const entry of copied) {
                    const line = Buffer.from(`${JSON.stringify(entry)}\n`);
                    entriesDigest.update(line);
                    fs.writeFileSync(fd, line);
                }
                fs.fsyncSync(fd);
            } finally {
                fs.closeSync(fd);
            }
            const entriesHash = entriesDigest.digest('hex'), counts = {
                files: copied.filter(item => item.type === 'file').length,
                directories: copied.filter(item => item.type === 'directory').length,
                bytes: copied.reduce((sum, item) => sum + (item.bytes || 0), 0)
            };
            if (!Number.isSafeInteger(counts.bytes)) fail('CORRUPT', 'Backup total byte count exceeds supported integer range');
            const manifest = {
                format: FORMAT,
                schemaVersion: 1,
                backupId,
                source: {libraryId: initial.libraryId, schemaVersion: initial.schemaVersion},
                startedAt,
                completedAt: new Date().toISOString(),
                toolVersion: '0.3.6',
                platform: os.platform(),
                consistency: 'stable-verified-copy',
                excludedPaths: [EXCLUDED],
                entriesHash,
                counts
            };
            const manifestBytes = jsonBytes(manifest);
            writeNew(path.join(binding.target, 'manifest.json'), manifestBytes);
            binding.check();
            const packageReady = scan(binding.target);
            publish(path.join(binding.target, 'COMPLETE.json'), jsonBytes({
                format: 'nova-content-library-backup-complete',
                schemaVersion: 1,
                backupId,
                manifestHash: hash(manifestBytes),
                entriesHash
            }), 'backupComplete', () => {
                committed = true;
            }, () => {
                check();
                binding.check();
                sameInventory(entries, scan(root, true));
                if (identity(stat(root)) !== rootIdentity || !read(path.join(root, '内容库.json')).equals(original)) fail('SOURCE_CHANGED', 'Library changed at completion boundary');
                sameInventory(packageReady, scan(binding.target));
                assertHashes(path.join(binding.target, 'data'), copiedInventory, copied);
                for (const [name, expectedHash] of [['entries.ndjson', entriesHash], ['manifest.json', hash(manifestBytes)]]) {
                    if (stableFile(path.join(binding.target, name), packageReady.find(entry => entry.path === name)).sha256 !== expectedHash) fail('SOURCE_CHANGED', 'Backup metadata changed before completion');
                }
                sameInventory(packageReady, scan(binding.target));
                check();
            });
            check();
            return {
                backupId,
                backupDir: binding.target,
                libraryId: initial.libraryId,
                manifest,
                counts,
                outcome: 'committed'
            };
        } catch (error) {
            primary = wrap(error);
            if (committed) primary.outcome = 'committed';
            if (binding) primary.backupDir = binding.target;
            throw primary;
        } finally {
            if (release) try {
                release();
            } catch (error) {
                if (!primary) throw Object.assign(wrap(error), committed ? {outcome: 'committed', backupId} : {});
            }
        }
    }

    function lines(filename, callback) {
        const expected = {path: 'entries.ndjson', fingerprint: fingerprint(stat(filename))};
        const fd = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW),
            digest = createHash('sha256'), chunk = Buffer.alloc(65536);
        let pending = Buffer.alloc(0);
        try {
            if (fingerprint(fs.fstatSync(fd, {bigint: true})) !== expected.fingerprint) fail('SOURCE_CHANGED', 'Entries replaced during open');
            for (; ;) {
                const count = fs.readSync(fd, chunk, 0, chunk.length, null);
                if (!count) break;
                digest.update(chunk.subarray(0, count));
                pending = Buffer.concat([pending, chunk.subarray(0, count)]);
                let newline;
                while ((newline = pending.indexOf(10)) !== -1) {
                    if (!newline || newline > MAX_LINE) fail('CORRUPT', 'Invalid or oversized entries line');
                    const raw = pending.subarray(0, newline);
                    let entry;
                    try {
                        entry = JSON.parse(raw);
                    } catch {
                        fail('CORRUPT', 'Invalid entries JSON');
                    }
                    if (!raw.equals(Buffer.from(JSON.stringify(entry)))) fail('CORRUPT', 'Noncanonical entries line');
                    callback(entry);
                    pending = pending.subarray(newline + 1);
                }
                if (pending.length > MAX_LINE) fail('CORRUPT', 'Oversized entries line');
            }
            if (pending.length) fail('CORRUPT', 'Entries must end in newline');
            if (fingerprint(fs.fstatSync(fd, {bigint: true})) !== expected.fingerprint || fingerprint(stat(filename)) !== expected.fingerprint) fail('SOURCE_CHANGED', 'Entries changed while reading');
            return digest.digest('hex');
        } finally {
            fs.closeSync(fd);
        }
    }

    function smallJSON(filename) {
        if (stat(filename).size > 65536n) fail('CORRUPT', 'Metadata exceeds size limit');
        try {
            const bytes = read(filename);
            return {value: JSON.parse(bytes), bytes};
        } catch (error) {
            if (error instanceof SyntaxError) fail('CORRUPT', 'Invalid package JSON');
            throw error;
        }
    }

    function verifyBackup(backupDir) {
        try {
            backupDir = path.resolve(backupDir);
            directory(backupDir);
            const packageBefore = scan(backupDir);
            const names = fs.readdirSync(backupDir).sort(compare);
            if (JSON.stringify(names) !== JSON.stringify(['COMPLETE.json', 'data', 'entries.ndjson', 'manifest.json'])) fail('BACKUP_INCOMPLETE', 'Backup requires exactly manifest, entries, data and COMPLETE');
            const {
                value: manifest,
                bytes: manifestBytes
            } = smallJSON(path.join(backupDir, 'manifest.json')), {value: seal} = smallJSON(path.join(backupDir, 'COMPLETE.json'));
            if (!manifest || Object.keys(manifest).sort().join(',') !== ['format', 'schemaVersion', 'backupId', 'source', 'startedAt', 'completedAt', 'toolVersion', 'platform', 'consistency', 'excludedPaths', 'entriesHash', 'counts'].sort().join(',') || Object.keys(manifest.source || {}).sort().join(',') !== 'libraryId,schemaVersion' || !manifest.counts || Object.keys(manifest.counts).sort().join(',') !== 'bytes,directories,files' || typeof manifest.toolVersion !== 'string' || typeof manifest.platform !== 'string' || manifest?.format !== FORMAT || manifest.schemaVersion !== 1 || !UUID.test(manifest.backupId) || manifest.consistency !== 'stable-verified-copy' || !UUID.test(manifest.source?.libraryId) || ![4, 5].includes(manifest.source.schemaVersion) || JSON.stringify(manifest.excludedPaths) !== JSON.stringify([EXCLUDED]) || !HASH.test(manifest.entriesHash)) fail('FORMAT_UNSUPPORTED', 'Unsupported backup manifest');
            for (const field of ['startedAt', 'completedAt']) {
                let valid;
                try {
                    valid = new Date(manifest[field]).toISOString() === manifest[field];
                } catch {
                }
                if (!valid) fail('CORRUPT', 'Invalid backup timestamp');
            }
            if (Date.parse(manifest.completedAt) < Date.parse(manifest.startedAt)) fail('CORRUPT', 'Backup completion precedes start');
            if (!seal || Object.keys(seal).sort().join(',') !== ['format', 'schemaVersion', 'backupId', 'manifestHash', 'entriesHash'].sort().join(',') || seal?.format !== 'nova-content-library-backup-complete' || seal.schemaVersion !== 1 || seal.backupId !== manifest.backupId || seal.manifestHash !== hash(manifestBytes) || seal.entriesHash !== manifest.entriesHash) fail('CORRUPT', 'Completion seal mismatch');
            const data = path.join(backupDir, 'data'), actual = scan(data), entries = [], normalized = new Set();
            let previous = '';
            const entriesHash = lines(path.join(backupDir, 'entries.ndjson'), entry => {
                portable(entry?.path);
                const normalizedPath = entry.path.normalize('NFC').toLocaleLowerCase('en-US');
                if (normalized.has(normalizedPath)) fail('UNSAFE_PATH', 'Case or Unicode normalization entry collision');
                normalized.add(normalizedPath);
                if (entry.path <= previous || !['file', 'directory'].includes(entry.type) || JSON.stringify(Object.keys(entry).sort()) !== JSON.stringify((entry.type === 'file' ? ['bytes', 'path', 'sha256', 'type'] : ['path', 'type']).sort()) || entry.type === 'file' && (!Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || !HASH.test(entry.sha256))) fail('CORRUPT', 'Invalid, duplicate or unordered backup entry');
                if (entry.path === EXCLUDED || entry.path.startsWith(`${EXCLUDED}/`)) fail('CORRUPT', 'Backup contains excluded lock');
                previous = entry.path;
                entries.push(entry);
            });
            if (entriesHash !== manifest.entriesHash || actual.length !== entries.length) fail('CORRUPT', 'Entries digest or member count mismatch');
            const counts = {files: 0, directories: 0, bytes: 0};
            for (let i = 0; i < entries.length; i++) {
                const entry = entries[i], found = actual[i];
                if (entry.path !== found.path || entry.type !== found.type) fail('CORRUPT', 'Backup has missing or extra members');
                if (entry.type === 'directory') {
                    counts.directories++;
                    continue;
                }
                const digest = stableFile(targetPath(data, entry.path), found);
                if (digest.sha256 !== entry.sha256 || digest.bytes !== entry.bytes) fail('CORRUPT', 'Backup file checksum mismatch');
                counts.files++;
                counts.bytes += entry.bytes;
            }
            if (JSON.stringify(counts) !== JSON.stringify(manifest.counts)) fail('CORRUPT', 'Manifest counts mismatch');
            const info = descriptor(data, true);
            if (info.libraryId !== manifest.source.libraryId || info.schemaVersion !== manifest.source.schemaVersion) fail('CORRUPT', 'Descriptor identity differs from manifest');
            sameInventory(packageBefore, scan(backupDir));
            return {
                backupId: manifest.backupId,
                backupDir,
                libraryId: info.libraryId,
                manifest,
                counts,
                verified: true,
                treeHash: manifest.entriesHash
            };
        } catch (error) {
            throw wrap(error);
        }
    }

    function restoreBackup(backupDir, destination) {
        let committed = false, binding, stage;
        try {
            const verified = verifyBackup(backupDir);
            backupDir = verified.backupDir;
            binding = parentBinding(destination, backupDir);
            stage = path.join(path.dirname(binding.target), `.restore-${randomUUID()}`);
            fs.mkdirSync(stage, {mode: 0o700});
            const source = path.join(backupDir, 'data'), inventory = scan(source),
                copied = copyTree(source, stage, inventory);
            assertHashes(source, inventory, copied);
            const staged = scan(stage);
            assertHashes(stage, staged, copied);
            const checkedAgain = verifyBackup(backupDir);
            if (checkedAgain.treeHash !== verified.treeHash || checkedAgain.backupId !== verified.backupId) fail('SOURCE_CHANGED', 'Backup changed during restoration');
            const processing = prepareRestoredLibrary(stage, verified);
            const ready = scan(stage), finalEntries = ready.map(entry => entry.type === 'directory' ? {
                path: entry.path,
                type: entry.type
            } : {path: entry.path, type: entry.type, ...stableFile(targetPath(stage, entry.path), entry)});
            binding.check();
            createTarget(binding);
            copyTree(stage, binding.target, ready, true);
            assertHashes(stage, ready, finalEntries);
            const expectedWithoutDescriptor = finalEntries.filter(entry => entry.path !== '内容库.json'),
                actual = scan(binding.target);
            assertHashes(binding.target, actual, expectedWithoutDescriptor);
            const descriptorBytes = read(path.join(stage, '内容库.json'));
            if (hash(descriptorBytes) !== finalEntries.find(entry => entry.path === '内容库.json').sha256) fail('SOURCE_CHANGED', 'Staged descriptor changed before publication');
            binding.check();
            publish(path.join(binding.target, '内容库.json'), descriptorBytes, 'restoreDescriptor', () => {
                committed = true;
            }, () => {
                binding.check();
                assertHashes(binding.target, actual, expectedWithoutDescriptor);
            });
            hook('restoreAfterDescriptorSync', {root: binding.target});
            fs.rmSync(stage, {recursive: true});
            syncDirectory(path.dirname(stage));
            return {
                backupId: verified.backupId,
                root: binding.target,
                libraryId: verified.libraryId, ...processing,
                outcome: 'committed'
            };
        } catch (error) {
            const failure = wrap(error);
            if (committed) failure.outcome = 'committed';
            if (binding) failure.root = binding.target;
            if (stage) failure.stage = stage;
            throw failure;
        }
    }

    return {backupLibrary, verifyBackup, restoreBackup};
}
