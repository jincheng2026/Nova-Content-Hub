import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {emptyBinding, validateBinding} from './bindings.mts';
import type {BindingStore} from './bindings.mts';
import {createOperationQueue} from './operation-queue.mts';
import {bootstrapDesktopInput} from '../shared/bootstrap-validation.ts';
import type {BootstrapInputs, BootstrapReason, BootstrapRecoveryView, BootstrapResults} from '../shared/bootstrap-contracts.ts';
import {exact, fail, uuid} from '../shared/validation.ts';

interface Pin {dev: string; ino: string; size: string; mtimeNs: string; ctimeNs: string; hash: string}
interface Snapshot {pin: Pin; bytes: Buffer}
interface Intent {version: 1; id: string; original: Pin; backup: Pin; empty: Pin}
const LIMIT = 8_000_000;
const identityKeys = ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'] as const;
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const code = (error: unknown) => (error as NodeJS.ErrnoException)?.code;
const message = '本机连接恢复未能确认，原文件和已有备份已保留；请重新检查或导出脱敏诊断。';
const same = (a: Pin, b: Pin) => a.hash === b.hash && identityKeys.every(key => a[key] === b[key]);
const validPin = (value: unknown): value is Pin => exact(value, [...identityKeys, 'hash']) && identityKeys.every(key => { const part = value[key]; return typeof part === 'string' && /^\d+$/.test(part); }) && typeof value.hash === 'string' && /^[0-9a-f]{64}$/.test(value.hash);

async function directory(parent: string) {
    let cursor = path.parse(parent).root;
    for (const part of path.relative(cursor, parent).split(path.sep).filter(Boolean)) {
        cursor = path.join(cursor, part);
        const info = await fs.lstat(cursor, {bigint: true});
        if (!info.isDirectory() || info.isSymbolicLink()) fail('BOOTSTRAP_UNSAFE', message);
    }
    return fs.lstat(parent, {bigint: true});
}
async function syncDirectory(parent: string) {
    let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
    try { handle = await fs.open(parent, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW); await handle.sync(); }
    catch (error) { if (process.platform !== 'win32' || !['EISDIR', 'EPERM', 'EINVAL', 'ENOTSUP', 'ENOSYS'].includes(code(error) ?? '')) throw error; }
    finally { await handle?.close(); }
}
async function snapshot(file: string, limit = LIMIT): Promise<Snapshot | null> {
    let before;
    try { before = await fs.lstat(file, {bigint: true}); }
    catch (error) { if (code(error) === 'ENOENT') return null; throw error; }
    if (!before.isFile() || before.isSymbolicLink() || before.size > BigInt(limit)) fail('BOOTSTRAP_UNSAFE', message);
    const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
        const bytes = Buffer.alloc(limit + 1);
        let size = 0;
        while (size < bytes.length) {
            const read = await handle.read(bytes, size, bytes.length - size, null);
            size += read.bytesRead;
            if (!read.bytesRead) break;
        }
        const opened = await handle.stat({bigint: true}), after = await fs.lstat(file, {bigint: true});
        if (size > limit || BigInt(size) !== after.size || identityKeys.some(key => before[key] !== opened[key] || opened[key] !== after[key])) fail('BOOTSTRAP_CHANGED', message);
        const body = bytes.subarray(0, size);
        return {bytes: body, pin: {dev: after.dev.toString(), ino: after.ino.toString(), size: after.size.toString(), mtimeNs: after.mtimeNs.toString(), ctimeNs: after.ctimeNs.toString(), hash: hash(body)}};
    } finally { await handle.close(); }
}
async function createFile(file: string, bytes: Buffer) {
    const handle = await fs.open(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try { await handle.writeFile(bytes); await handle.sync(); }
    finally { await handle.close(); }
    await syncDirectory(path.dirname(file));
    return (await snapshot(file))!;
}

/** Only the main process supplies this fixed BindingStore; no caller supplies file paths. */
export class BootstrapRecovery {
    private file: string;
    private onRecovered: () => void | Promise<void>;
    private serial = createOperationQueue();
    private selected: {token: string; snapshot: Snapshot; parent: {dev: bigint; ino: bigint}} | null = null;
    private lastBackup: string | null = null;
    constructor({store, onRecovered}: {store: BindingStore; onRecovered: () => void | Promise<void>}) {
        if (!path.isAbsolute(store.file) || path.basename(store.file) !== 'machine-binding.json') fail('BOOTSTRAP_UNSAFE', message);
        this.file = store.file;
        this.onRecovered = onRecovered;
    }
    private get parent() { return path.dirname(this.file); }
    private get intentFile() { return path.join(this.parent, 'machine-binding.recovery.json'); }
    private backupName(id: string) { return `machine-binding.${id}.backup.json`; }
    private emptyFile(id: string) { return path.join(this.parent, `machine-binding.${id}.empty.tmp`); }
    private async latestBackup() {
        let latest: {name: string; time: number} | null = null;
        for (const name of await fs.readdir(this.parent)) {
            const id = /^machine-binding\.(.+)\.backup\.json$/.exec(name)?.[1];
            if (!uuid(id)) continue;
            const info = await fs.lstat(path.join(this.parent, name));
            if (info.isFile() && !info.isSymbolicLink() && info.size <= LIMIT && (!latest || info.mtimeMs > latest.time)) latest = {name, time: info.mtimeMs};
        }
        return latest?.name ?? null;
    }
    private async assertParent(expected: {dev: bigint; ino: bigint}) {
        const current = await directory(this.parent);
        if (current.dev !== expected.dev || current.ino !== expected.ino) fail('BOOTSTRAP_CHANGED', message);
    }
    private async readIntent(): Promise<Intent | null> {
        const record = await snapshot(this.intentFile, 65_536);
        if (!record) return null;
        let value: unknown;
        try { value = JSON.parse(record.bytes.toString('utf8')); } catch { fail('BOOTSTRAP_RECOVERY_INCOMPLETE', message); }
        if (!exact(value, ['version', 'id', 'original', 'backup', 'empty']) || value.version !== 1 || !uuid(value.id) || !validPin(value.original) || !validPin(value.backup) || !validPin(value.empty)) fail('BOOTSTRAP_RECOVERY_INCOMPLETE', message);
        return value as unknown as Intent;
    }
    private async finish(intent: Intent, parent: {dev: bigint; ino: bigint}) {
        const backup = await snapshot(path.join(this.parent, this.backupName(intent.id)));
        if (!backup || !same(backup.pin, intent.backup) || backup.pin.hash !== intent.original.hash) fail('BOOTSTRAP_RECOVERY_INCOMPLETE', message);
        const emptyBytes = Buffer.from(JSON.stringify(emptyBinding()));
        const current = await snapshot(this.file);
        if (current && same(current.pin, intent.original)) {
            const staged = await snapshot(this.emptyFile(intent.id));
            if (!staged || !same(staged.pin, intent.empty) || staged.pin.hash !== hash(emptyBytes)) fail('BOOTSTRAP_RECOVERY_INCOMPLETE', message);
            await this.assertParent(parent);
            const checked = await snapshot(this.file);
            if (!checked || !same(checked.pin, intent.original)) fail('BOOTSTRAP_CHANGED', message);
            // shortcut: Node has no conditional unlink/openat; keep userData private and re-audit before supporting shared writers.
            await fs.unlink(this.file);
            await syncDirectory(this.parent);
        } else if (current && !(current.pin.dev === intent.empty.dev && current.pin.ino === intent.empty.ino && current.pin.hash === hash(emptyBytes))) {
            fail('BOOTSTRAP_CHANGED', message);
        }
        if (!await snapshot(this.file)) {
            const staged = await snapshot(this.emptyFile(intent.id));
            if (!staged || !same(staged.pin, intent.empty) || staged.pin.hash !== hash(emptyBytes)) fail('BOOTSTRAP_RECOVERY_INCOMPLETE', message);
            await this.assertParent(parent);
            // Exclusive publish never replaces a new file created by an external writer.
            await fs.link(this.emptyFile(intent.id), this.file);
            await syncDirectory(this.parent);
        }
        const committed = await snapshot(this.file);
        if (!committed || committed.pin.dev !== intent.empty.dev || committed.pin.ino !== intent.empty.ino || committed.pin.hash !== hash(emptyBytes)) fail('BOOTSTRAP_CHANGED', message);
        await this.onRecovered();
        this.lastBackup = this.backupName(intent.id);
        await this.assertParent(parent);
        await fs.unlink(this.intentFile);
        await syncDirectory(this.parent);
        await fs.unlink(this.emptyFile(intent.id)).catch(() => {});
        this.selected = null;
    }
    readBootstrapRecovery(input?: undefined): Promise<BootstrapRecoveryView> {
        if (!bootstrapDesktopInput('readBootstrapRecovery', input)) fail('INVALID_INPUT', '本机连接检查参数无效。');
        return this.serial(async () => {
            this.selected = null;
            try {
                const parent = await directory(this.parent).catch(error => { if (code(error) === 'ENOENT') return null; throw error; });
                if (!parent) return {state: 'ready', reasonCode: 'none', canReset: false, confirmationToken: null, backupName: this.lastBackup};
                this.lastBackup ??= await this.latestBackup();
                const intent = await this.readIntent();
                if (intent) await this.finish(intent, parent);
                const current = await snapshot(this.file);
                if (current) {
                    try { validateBinding(JSON.parse(current.bytes.toString('utf8'))); }
                    catch {
                        const token = randomUUID();
                        this.selected = {token, snapshot: current, parent};
                        return {state: 'binding-unavailable', reasonCode: 'binding-invalid', canReset: true, confirmationToken: token, backupName: this.lastBackup};
                    }
                }
                return {state: 'ready', reasonCode: 'none', canReset: false, confirmationToken: null, backupName: this.lastBackup};
            } catch (error) {
                const reason: BootstrapReason = code(error) === 'BOOTSTRAP_UNSAFE' ? 'binding-unsafe' : code(error) === 'BOOTSTRAP_CHANGED' ? 'binding-changed' : code(error) === 'BOOTSTRAP_RECOVERY_INCOMPLETE' ? 'recovery-incomplete' : 'binding-unreadable';
                return {state: 'binding-unavailable', reasonCode: reason, canReset: false, confirmationToken: null, backupName: this.lastBackup};
            }
        });
    }
    resetMachineBinding(input: BootstrapInputs['resetMachineBinding']): Promise<BootstrapResults['resetMachineBinding']> {
        if (!bootstrapDesktopInput('resetMachineBinding', input)) fail('INVALID_INPUT', '请明确确认重新连接本机内容库。');
        return this.serial(async () => {
            try {
                const selected = this.selected;
                this.selected = null;
                if (!selected || selected.token !== input.confirmationToken) fail('BOOTSTRAP_CHANGED', message);
                await this.assertParent(selected.parent);
                if (await this.readIntent()) fail('BOOTSTRAP_RECOVERY_INCOMPLETE', message);
                const current = await snapshot(this.file);
                if (!current || !same(current.pin, selected.snapshot.pin)) fail('BOOTSTRAP_CHANGED', message);
                const id = randomUUID();
                const backup = await createFile(path.join(this.parent, this.backupName(id)), selected.snapshot.bytes);
                const empty = await createFile(this.emptyFile(id), Buffer.from(JSON.stringify(emptyBinding())));
                const intent: Intent = {version: 1, id, original: selected.snapshot.pin, backup: backup.pin, empty: empty.pin};
                const temporary = `${this.intentFile}.${id}.tmp`;
                await createFile(temporary, Buffer.from(JSON.stringify(intent)));
                await this.assertParent(selected.parent);
                await fs.link(temporary, this.intentFile);
                await syncDirectory(this.parent);
                await fs.unlink(temporary);
                await this.finish(intent, selected.parent);
                return {reset: true, backupName: this.backupName(id)};
            } catch (error) {
                const safeCode = ['BOOTSTRAP_CHANGED', 'BOOTSTRAP_UNSAFE', 'BOOTSTRAP_RECOVERY_INCOMPLETE'].includes(code(error) ?? '') ? code(error)! : 'BOOTSTRAP_RECOVERY_INCOMPLETE';
                fail(safeCode, message);
            }
        });
    }
}
