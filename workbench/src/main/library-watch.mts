import fs from 'node:fs';
import path from 'node:path';
import type {LibraryBinding} from '../shared/contracts.ts';

const DEBOUNCE_MS = 300;
const MAX_WAIT_MS = 2_000;
const IDENTITY_CHECK_MS = 5_000;
const DESCRIPTOR_LIMIT = 65_536;
const sameBinding = (a: LibraryBinding | null, b: LibraryBinding | null) => a === b || !!a && !!b && a.root === b.root && a.libraryId === b.libraryId && a.rootIdentity.dev === b.rootIdentity.dev && a.rootIdentity.ino === b.rootIdentity.ino;

function safeStat(filename: string) {
    const resolved = path.resolve(filename);
    let cursor = path.parse(resolved).root;
    for (const part of resolved.slice(cursor.length).split(path.sep).filter(Boolean)) {
        cursor = path.join(cursor, part);
        if (fs.lstatSync(cursor).isSymbolicLink()) throw new Error('Linked library path');
    }
    return fs.lstatSync(resolved, {bigint: true});
}

function checkBinding(binding: LibraryBinding) {
    const checkRoot = () => {
        const stat = safeStat(binding.root);
        if (!stat.isDirectory() || stat.dev.toString() !== binding.rootIdentity.dev || stat.ino.toString() !== binding.rootIdentity.ino) throw new Error('Library root changed');
        fs.accessSync(binding.root, fs.constants.R_OK);
    };
    checkRoot();
    const filename = path.join(binding.root, '内容库.json'), before = safeStat(filename);
    if (!before.isFile() || before.size > BigInt(DESCRIPTOR_LIMIT)) throw new Error('Invalid library descriptor');
    const fd = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    try {
        const opened = fs.fstatSync(fd, {bigint: true});
        if (!opened.isFile() || opened.size > BigInt(DESCRIPTOR_LIMIT)) throw new Error('Invalid opened descriptor');
        const data = Buffer.alloc(DESCRIPTOR_LIMIT + 1);
        let size = 0;
        for (;;) {
            const count = fs.readSync(fd, data, size, data.length - size, null);
            size += count;
            if (size > DESCRIPTOR_LIMIT) throw new Error('Oversized library descriptor');
            if (!count) break;
        }
        const finished = fs.fstatSync(fd, {bigint: true}), after = safeStat(filename);
        const stats = [before, opened, finished, after];
        if (stats.some(stat => stat.dev !== before.dev || stat.ino !== before.ino || stat.size !== before.size || stat.mtimeNs !== before.mtimeNs || stat.ctimeNs !== before.ctimeNs) || BigInt(size) !== before.size) throw new Error('Library descriptor changed during read');
        const value: unknown = JSON.parse(data.subarray(0, size).toString('utf8'));
        if (!value || typeof value !== 'object' || !('format' in value) || value.format !== 'nova-content-library' || !('libraryId' in value) || value.libraryId !== binding.libraryId || !('schemaVersion' in value) || ![4, 5].includes(value.schemaVersion as number)) throw new Error('Library identity changed');
        checkRoot();
    } finally { fs.closeSync(fd); }
}

function businessChange(filename: string | Buffer | null) {
    if (filename === null) return true;
    const relative = filename.toString();
    if (!relative || path.isAbsolute(relative)) return false;
    const segments = relative.split(process.platform === 'win32' ? /[\\/]/ : /\//).map(segment => segment.normalize('NFC'));
    if (segments.some(segment => !segment || segment.startsWith('.') || /(?:\.tmp(?:-|\.|$)|\.temp$|\.sw[op]$|~$)/i.test(segment))) return false;
    // System files are transaction receipts, locks and recovery scratch; business commits also change their final files.
    return segments[0] !== '系统（别动）';
}

export class LibraryWatcher {
    private binding: LibraryBinding | null = null;
    private generation = 0;
    private stop: (() => void) | null = null;
    private notify: (change: 'changed' | 'progress' | 'unavailable') => void;

    constructor({notify}: {notify: (change: 'changed' | 'progress' | 'unavailable') => void}) {
        this.notify = change => {
            // A closing renderer must not turn an advisory refresh into a failed library operation.
            try { notify(change); } catch {}
        };
    }

    bind(binding: LibraryBinding | null): void {
        if (sameBinding(this.binding, binding)) return;
        this.close();
        if (!binding) return;
        const pinned = {...binding, rootIdentity: {...binding.rootIdentity}}, generation = this.generation;
        this.binding = pinned;
        const current = () => this.generation === generation;
        let watcher: fs.FSWatcher | null = null, unavailable = false, watchGeneration = 0;
        let debounce: ReturnType<typeof setTimeout> | null = null, maximum: ReturnType<typeof setTimeout> | null = null;
        const clearPending = () => {
            if (debounce) clearTimeout(debounce);
            if (maximum) clearTimeout(maximum);
            debounce = maximum = null;
        };
        const closeWatcher = () => {
            watchGeneration += 1;
            const retired = watcher;
            watcher = null;
            if (!retired) return;
            retired.removeAllListeners();
            // A queued native error may arrive after close; never leave a retired emitter unhandled.
            retired.on('error', () => {});
            try { retired.close(); } catch { retired.unref?.(); }
        };
        const lost = () => {
            if (!current()) return;
            clearPending();
            closeWatcher();
            if (!unavailable) { unavailable = true; this.notify('unavailable'); }
        };
        const flush = () => {
            if (!current()) return;
            clearPending();
            try { checkBinding(pinned); } catch { lost(); return; }
            this.notify('changed');
        };
        const changed = (_event: string, filename: string | Buffer | null) => {
            if (!current() || unavailable || !businessChange(filename)) return;
            if (/^(?:内容[\\/][^\\/]+[\\/]封面任务|模板[\\/][^\\/]+[\\/]学习任务)[\\/][0-9a-f-]{36}[\\/]尝试[\\/][0-9a-f-]{36}[\\/]进度\.json$/.test(filename?.toString().normalize('NFC') ?? '')) {this.notify('progress'); return;}
            if (debounce) clearTimeout(debounce);
            debounce = setTimeout(flush, DEBOUNCE_MS);
            if (!maximum) maximum = setTimeout(flush, MAX_WAIT_MS);
        };
        const arm = () => {
            if (!current()) return;
            try {
                checkBinding(pinned);
                const activeWatch = watchGeneration;
                watcher = fs.watch(pinned.root, {recursive: true}, (event, filename) => { if (activeWatch === watchGeneration) changed(event, filename); });
                const failed = () => { if (activeWatch === watchGeneration) lost(); };
                watcher.on('error', failed);
                watcher.on('close', failed);
                checkBinding(pinned);
            } catch { lost(); return; }
            unavailable = false;
            this.notify('changed');
        };
        // shortcut: fs.watch can omit business events; polling checks identity only, focus/manual refresh remains the fallback.
        const probe = setInterval(() => {
            if (!current()) return;
            if (!watcher) { arm(); return; }
            try { checkBinding(pinned); } catch { lost(); }
        }, IDENTITY_CHECK_MS);
        probe.unref?.();
        this.stop = () => { clearInterval(probe); clearPending(); closeWatcher(); };
        arm();
    }

    close(): void {
        this.generation += 1;
        this.stop?.();
        this.stop = null;
        this.binding = null;
    }
}
