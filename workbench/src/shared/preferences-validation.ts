import {exact} from './validation.ts';
import type {LocalPreferences} from './preferences-contracts.ts';

export const defaultPreferences = (): LocalPreferences => ({remindersEnabled: false, reminderTime: '09:00', startAtLogin: false});
export function localPreferences(value: unknown): value is LocalPreferences {
    return exact(value, ['remindersEnabled', 'reminderTime', 'startAtLogin']) && typeof value.remindersEnabled === 'boolean' && typeof value.startAtLogin === 'boolean' && typeof value.reminderTime === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value.reminderTime);
}
export function preferencesDesktopInput(method: string, input: unknown): boolean | undefined {
    if (method === 'savePreferences') return localPreferences(input);
    return ['readPreferences', 'readReminderStatus', 'testReminder'].includes(method) ? input === undefined : undefined;
}
