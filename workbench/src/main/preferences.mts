import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import type {App} from 'electron';
import {defaultPreferences, localPreferences} from '../shared/preferences-validation.ts';
import {exact, fail} from '../shared/validation.ts';
import type {LocalPreferences, LoginStatus, PreferencesView} from '../shared/preferences-contracts.ts';

async function safeDirectory(directory: string, create = false) {
    const resolved = path.resolve(directory);
    let cursor = path.parse(resolved).root;
    for (const part of resolved.slice(cursor.length).split(path.sep).filter(Boolean)) {
        cursor = path.join(cursor, part);
        if (create) {
            try { await fs.mkdir(cursor, {mode: 0o700}); }
            catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
        }
        const info = await fs.lstat(cursor, {bigint: true});
        if (!info.isDirectory() || info.isSymbolicLink()) fail('PREFERENCES_UNAVAILABLE', '本机设置位置无法安全读取，原文件已保留。');
    }
    return fs.lstat(resolved, {bigint: true});
}
export async function readLocalRecord(file: string): Promise<unknown | null> {
    try {
        await safeDirectory(path.dirname(file));
        const before = await fs.lstat(file, {bigint: true});
        if (!before.isFile() || before.isSymbolicLink() || before.size > 65_536n) fail('PREFERENCES_UNAVAILABLE', '本机设置文件无效或超过大小限制，原文件已保留。');
        const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
        try {
            const bytes = Buffer.alloc(65_537);
            let size = 0;
            for (;;) {
                const {bytesRead} = await handle.read(bytes, size, bytes.length - size, null);
                size += bytesRead;
                if (size > 65_536) fail('PREFERENCES_UNAVAILABLE', '本机设置文件超过大小限制。');
                if (!bytesRead) break;
            }
            const opened = await handle.stat({bigint: true}), after = await fs.lstat(file, {bigint: true});
            if (['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].some(key => before[key as keyof typeof before] !== opened[key as keyof typeof opened] || opened[key as keyof typeof opened] !== after[key as keyof typeof after]) || BigInt(size) !== after.size) fail('PREFERENCES_UNAVAILABLE', '本机设置文件在读取时改变。');
            return JSON.parse(bytes.subarray(0, size).toString('utf8'));
        } finally { await handle.close(); }
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        fail('PREFERENCES_UNAVAILABLE', '无法读取本机设置，原文件已保留。');
    }
}
export async function writeLocalRecord(file: string, value: unknown) {
    let temporary: string | null = null;
    try {
        const parent = path.dirname(file);
        const identity = await safeDirectory(parent, true);
        try {
            const old = await fs.lstat(file);
            if (!old.isFile() || old.isSymbolicLink()) fail('PREFERENCES_UNAVAILABLE', '本机设置文件无效，原文件已保留。');
        } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
        const bytes = Buffer.from(JSON.stringify(value));
        if (bytes.length > 65_536) fail('PREFERENCES_UNAVAILABLE', '本机设置内容超过大小限制。');
        temporary = `${file}.${randomUUID()}.tmp`;
        const handle = await fs.open(temporary, 'wx', 0o600);
        try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
        const current = await safeDirectory(parent);
        if (identity.dev !== current.dev || identity.ino !== current.ino) fail('PREFERENCES_UNAVAILABLE', '本机设置位置已改变。');
        await fs.rename(temporary, file);
        temporary = null;
        if (process.platform !== 'win32') {
            const directory = await fs.open(parent, 'r');
            try { await directory.sync(); } finally { await directory.close(); }
        }
    } catch { fail('PREFERENCES_UNAVAILABLE', '本机设置保存未确认，请重新读取设置；已有文件会保留。'); }
    finally { if (temporary) await fs.unlink(temporary).catch(() => {}); }
}

export class Preferences {
    file: string;
    login: Pick<App, 'getLoginItemSettings' | 'setLoginItemSettings' | 'isPackaged'>;
    platform: string;
    values: LocalPreferences = defaultPreferences();
    initialized = false;
    onSaved?: () => void;
    loginFailed = false;
    constructor({file, login, platform = process.platform}: {file: string; login: Preferences['login']; platform?: string}) { this.file = file; this.login = login; this.platform = platform; }
    async initialize() {
        const stored = await readLocalRecord(this.file);
        if (stored !== null) {
            if (!exact(stored, ['version', 'values']) || stored.version !== 1) fail('PREFERENCES_UNAVAILABLE', '本机偏好记录损坏，原文件已保留。');
            // Read the retired field only for compatibility; opening settings never rewrites the file.
            const values = exact(stored.values, ['reducedMotion', 'remindersEnabled', 'reminderTime', 'startAtLogin']) && typeof stored.values.reducedMotion === 'boolean'
                ? {remindersEnabled: stored.values.remindersEnabled, reminderTime: stored.values.reminderTime, startAtLogin: stored.values.startAtLogin}
                : stored.values;
            if (!localPreferences(values)) fail('PREFERENCES_UNAVAILABLE', '本机偏好记录损坏，原文件已保留。');
            this.values = {...values};
        }
        this.initialized = true;
    }
    loginStatus(): LoginStatus {
        if (!['darwin', 'win32'].includes(this.platform)) return {supported: false, enabled: null, state: 'unsupported'};
        if (!this.login.isPackaged) return {supported: false, enabled: null, state: 'unavailable'};
        try {
            const settings = this.login.getLoginItemSettings();
            if (this.platform === 'darwin' && settings.status === 'requires-approval') return {supported: true, enabled: false, state: 'requires-approval'};
            const enabled = settings.openAtLogin && (this.platform !== 'win32' || settings.executableWillLaunchAtLogin);
            return {supported: true, enabled, state: this.loginFailed ? 'failed' : enabled !== this.values.startAtLogin ? 'mismatch' : enabled ? 'on' : 'off'};
        } catch { return {supported: true, enabled: null, state: 'failed'}; }
    }
    readPreferences(): PreferencesView {
        if (!this.initialized) fail('PREFERENCES_UNAVAILABLE', '本机偏好尚未成功读取，请保留文件并重启后查看。');
        return {values: {...this.values}, login: this.loginStatus()};
    }
    async savePreferences(input: LocalPreferences): Promise<PreferencesView> {
        this.readPreferences();
        if (!localPreferences(input)) fail('INVALID_INPUT', '本机偏好字段无效。');
        await writeLocalRecord(this.file, {version: 1, values: input});
        this.values = {...input};
        this.loginFailed = false;
        if (['darwin', 'win32'].includes(this.platform) && this.login.isPackaged) {
            try { this.login.setLoginItemSettings({openAtLogin: input.startAtLogin}); }
            catch { this.loginFailed = true; }
        }
        this.onSaved?.();
        return this.readPreferences();
    }
}
