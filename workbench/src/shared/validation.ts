import {coverDesktopInput} from './cover-validation.ts';
import {workspaceDesktopInput} from './workspace-validation.ts';
import {maintenanceDesktopInput} from './maintenance-validation.ts';
import {preferencesDesktopInput} from './preferences-validation.ts';
import {setupDesktopInput} from './setup-validation.ts';
import {isRecord} from './contracts.ts';
import type {DesktopMethod, LibraryBinding, Mutation, RootIdentity} from './contracts.ts';

export function fail(code: string, message: string): never {
    throw Object.assign(new Error(message), {code});
}

export const exact = (value: unknown, keys: string[]): value is Record<string, unknown> => isRecord(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
export const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
export const token = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
export const identity = (v: unknown): v is RootIdentity => exact(v, ['dev', 'ino']) && [v.dev, v.ino].every(n => typeof n === 'string' && /^(0|[1-9][0-9]*)$/.test(n));
export const libraryBinding = (v: unknown): v is LibraryBinding => exact(v, ['root', 'libraryId', 'rootIdentity']) && typeof v.root === 'string' && uuid(v.libraryId) && identity(v.rootIdentity);

export function validateInput(method: DesktopMethod, input: unknown) {
    const ref = (v: unknown) => exact(v, ['id', 'editToken']) && uuid(v.id) && token(v.editToken);
    const draft = (v: Record<string, unknown>) => typeof v.title === 'string' && !!v.title.trim() && v.title.length <= 500 && typeof v.body === 'string' && v.body.length <= 1_000_000;
    const delegated = coverDesktopInput(method, input) ?? workspaceDesktopInput(method, input) ?? maintenanceDesktopInput(method, input) ?? preferencesDesktopInput(method, input) ?? setupDesktopInput(method, input);
    if (delegated !== undefined) {
        if (!delegated) fail('INVALID_INPUT', '操作拒绝额外、路径或无效字段。');
        return;
    }
    let valid: boolean;
    switch (method) {
        case 'createContent':
            valid = exact(input, ['title', 'body']) && draft(input);
            break;
        case 'updateContent':
            valid = exact(input, ['id', 'editToken', 'title', 'body']) && uuid(input.id) && token(input.editToken) && draft(input);
            break;
        case 'trashContent':
        case 'restoreContent':
            valid = ref(input);
            break;
        case 'readContent':
            valid = exact(input, ['id']) && uuid(input.id);
            break;
        case 'listContents':
            valid = input === undefined || (exact(input, ['view']) && ['active', 'trash'].includes(input.view as string));
            break;
        case 'copyPrompt':
            valid = exact(input, ['text']) && typeof input.text === 'string' && input.text.length > 0 && input.text.length <= 256 * 1024 && !input.text.includes('\0') && new TextEncoder().encode(input.text).byteLength <= 256 * 1024;
            break;
        case 'readWorkspace':
            valid = input === undefined;
            break;
        case 'resolvePendingMutation':
            valid = exact(input, ['action']) && ['keep', 'saveAs', 'discard'].includes(input.action as string);
            break;
        default:
            valid = input === undefined;
    }
    if (!valid) fail('INVALID_INPUT', '拒绝无效、额外或超限的业务字段。');
}

export function mutation(value: unknown): value is Mutation {
    if (!exact(value, ['mutationId', 'op', 'input']) || !uuid(value.mutationId) || !['createContent', 'updateContent', 'trashContent', 'restoreContent'].includes(value.op as string)) return false;
    try {
        validateInput(value.op as DesktopMethod, value.input);
        return true;
    } catch {
        return false;
    }
}

export function requireWrite(mode: unknown) {
    if (mode !== 'disabled') fail('AUTH_NOT_CONFIGURED', '此安装包需要正式权益，当前尚未配置；新建、编辑、回收与恢复暂不可用。');
}
