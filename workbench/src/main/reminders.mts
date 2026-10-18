import {Notification} from 'electron';
import {publicationEntries} from '../shared/publication-view.ts';
import {exact} from '../shared/validation.ts';
import type {WorkspaceLibrarySnapshot} from '../shared/workspace-contracts.ts';
import type {LocalPreferences, ReminderStatus} from '../shared/preferences-contracts.ts';
import {readLocalRecord, writeLocalRecord} from './preferences.mts';

interface DailyReceipt { version: 1; day: string; timezone: string; phase: 'reserved' | 'sent' | 'failed' }
const localDay = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export class Reminders {
    file: string;
    preferences: () => LocalPreferences;
    snapshot: () => Promise<{libraryId: string; library: WorkspaceLibrarySnapshot} | null>;
    isCurrent: (libraryId: string) => boolean;
    showWindow: () => void;
    daily: DailyReceipt | null = null;
    state: ReminderStatus['state'] = 'disabled';
    reason: ReminderStatus['reason'] = 'none';
    initialized = false;
    disposed = false;
    timer: ReturnType<typeof setInterval> | null = null;
    running: Promise<void> | null = null;
    checked = '';
    notifications = new Set<Notification>();
    cancellations = new Set<() => void>();
    constructor({file, preferences, snapshot, isCurrent, showWindow}: {file: string; preferences: Reminders['preferences']; snapshot: Reminders['snapshot']; isCurrent: Reminders['isCurrent']; showWindow: () => void}) { this.file = file; this.preferences = preferences; this.snapshot = snapshot; this.isCurrent = isCurrent; this.showWindow = showWindow; }
    async initialize() {
        try {
            const stored = await readLocalRecord(this.file);
            if (stored !== null) {
                if (!exact(stored, ['version', 'day', 'timezone', 'phase']) || stored.version !== 1 || typeof stored.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(stored.day) || typeof stored.timezone !== 'string' || stored.timezone.length > 100 || !['reserved', 'sent', 'failed'].includes(stored.phase as string)) throw new Error('Invalid reminder receipt');
                const day = new Date(`${stored.day}T00:00:00Z`);
                if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== stored.day) throw new Error('Invalid reminder day');
                this.daily = stored as unknown as DailyReceipt;
            }
            this.initialized = true;
        } catch { this.state = 'failed'; this.reason = 'storage-unavailable'; }
    }
    readReminderStatus(): ReminderStatus {
        const supported = Notification.isSupported();
        return {supported, state: supported ? this.state : 'unsupported', reason: this.reason, lastDay: this.daily?.day ?? null};
    }
    start() {
        if (this.disposed || this.timer) return;
        this.timer = setInterval(() => { void this.refresh(); }, 60_000);
        void this.refresh();
    }
    refresh(force = false): Promise<void> {
        if (force) this.checked = '';
        if (this.disposed) return Promise.resolve();
        if (this.running) return this.running;
        const next = this.check().catch(() => { this.state = 'failed'; this.reason = 'library-unavailable'; });
        this.running = next;
        return next.finally(() => { if (this.running === next) this.running = null; });
    }
    async check() {
        if (!this.initialized) { this.state = 'failed'; this.reason = 'storage-unavailable'; return; }
        const preferences = this.preferences();
        if (!preferences.remindersEnabled) { this.state = 'disabled'; this.reason = 'none'; return; }
        if (!Notification.isSupported()) { this.state = 'unsupported'; this.reason = 'none'; return; }
        const now = new Date(), day = localDay(now), time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        if (this.daily && this.daily.day >= day) {
            this.state = this.daily.phase === 'sent' ? 'sent' : this.daily.phase === 'failed' ? 'failed' : 'unconfirmed';
            this.reason = this.daily.phase === 'sent' ? 'none' : this.daily.phase === 'failed' ? 'notification-failed' : 'delivery-unconfirmed';
            return;
        }
        if (time < preferences.reminderTime) { this.state = 'scheduled'; this.reason = 'none'; return; }
        const key = `${day}:${preferences.reminderTime}`;
        if (this.checked === key) return;
        this.checked = key;
        this.state = 'checking'; this.reason = 'none';
        let snapshot: Awaited<ReturnType<Reminders['snapshot']>>;
        try { snapshot = await this.snapshot(); }
        catch { this.state = 'waiting-for-library'; this.reason = 'library-unavailable'; return; }
        if (this.disposed || !this.preferences().remindersEnabled) { this.state = 'disabled'; return; }
        if (!snapshot || !this.isCurrent(snapshot.libraryId)) { this.state = 'waiting-for-library'; this.reason = 'library-unavailable'; return; }
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const planned = publicationEntries(snapshot.library, timezone).filter(entry => entry.plan.status === 'planned' && entry.day === day);
        const contents = new Set(planned.filter(entry => entry.kind === 'content').map(entry => entry.document.id)).size;
        const collections = new Set(planned.filter(entry => entry.kind === 'collection').map(entry => entry.document.id)).size;
        if (!contents && !collections) { this.state = 'empty'; this.reason = 'none'; return; }
        const daily: DailyReceipt = {version: 1, day, timezone, phase: 'reserved'};
        try { await writeLocalRecord(this.file, daily); }
        catch { this.state = 'failed'; this.reason = 'storage-unavailable'; return; }
        // Persist before showing: a crash may skip one reminder, but must never repeat today's notification.
        this.daily = daily;
        if (this.disposed || !this.preferences().remindersEnabled) { this.state = 'disabled'; return; }
        if (!this.isCurrent(snapshot.libraryId)) { this.state = 'waiting-for-library'; this.reason = 'library-unavailable'; return; }
        const outcome = await this.deliver('今天有待发布安排', `${day}：${contents} 篇内容、${collections} 个合集待发布。点击打开工作台查看。`);
        if (this.disposed) return;
        const phase = outcome === 'sent' ? 'sent' : outcome === 'failed' ? 'failed' : 'reserved';
        try { await writeLocalRecord(this.file, {...daily, phase}); this.daily = {...daily, phase}; }
        catch { this.state = 'failed'; this.reason = 'storage-unavailable'; }
    }
    async testReminder(): Promise<ReminderStatus> {
        if (this.disposed) return this.readReminderStatus();
        if (!this.initialized) { this.state = 'failed'; this.reason = 'storage-unavailable'; return this.readReminderStatus(); }
        if (!Notification.isSupported()) { this.state = 'unsupported'; return this.readReminderStatus(); }
        // The explicit test contains no library data and does not consume the automatic daily receipt.
        await this.deliver('工作台提醒试发', '这是一条本机通知。点击可返回工作台；不会自动发布内容。');
        return this.readReminderStatus();
    }
    deliver(title: string, body: string): Promise<'sent' | 'failed' | 'unconfirmed'> {
        this.state = 'requested'; this.reason = 'none';
        return new Promise(resolve => {
            let notification: Notification;
            let settled = false;
            const complete = (outcome: 'sent' | 'failed' | 'unconfirmed') => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                this.cancellations.delete(cancel);
                this.state = outcome;
                this.reason = outcome === 'failed' ? 'notification-failed' : outcome === 'unconfirmed' ? 'delivery-unconfirmed' : 'none';
                resolve(outcome);
            };
            const cancel = () => complete('unconfirmed');
            const timeout = setTimeout(() => complete('unconfirmed'), 10_000);
            this.cancellations.add(cancel);
            try {
                notification = new Notification({title, body, silent: false});
                this.notifications.add(notification);
                notification.once('show', () => complete('sent'));
                notification.once('failed', () => { complete('failed'); this.notifications.delete(notification); });
                notification.once('close', () => { this.notifications.delete(notification); complete('unconfirmed'); });
                notification.on('click', () => { if (!this.disposed) this.showWindow(); });
                notification.show();
            } catch { complete('failed'); }
        });
    }
    dispose() {
        this.disposed = true;
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        for (const cancel of this.cancellations) cancel();
        this.cancellations.clear();
        for (const notification of this.notifications) { notification.removeAllListeners(); notification.close(); }
        this.notifications.clear();
    }
}
