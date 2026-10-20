export interface LocalPreferences {
    remindersEnabled: boolean;
    reminderTime: string;
    startAtLogin: boolean;
}
export interface LoginStatus {
    supported: boolean;
    enabled: boolean | null;
    state: 'on' | 'off' | 'unsupported' | 'unavailable' | 'requires-approval' | 'mismatch' | 'failed';
}
export interface PreferencesView { values: LocalPreferences; login: LoginStatus }
export interface ReminderStatus {
    supported: boolean;
    state: 'disabled' | 'scheduled' | 'checking' | 'waiting-for-library' | 'empty' | 'requested' | 'sent' | 'unconfirmed' | 'failed' | 'unsupported';
    lastDay: string | null;
    reason: 'none' | 'library-unavailable' | 'notification-failed' | 'delivery-unconfirmed' | 'storage-unavailable';
}
export interface PreferencesInputs {
    readPreferences: undefined;
    savePreferences: LocalPreferences;
    readReminderStatus: undefined;
    testReminder: undefined;
}
export interface PreferencesResults {
    readPreferences: PreferencesView;
    savePreferences: PreferencesView;
    readReminderStatus: ReminderStatus;
    testReminder: ReminderStatus;
}
