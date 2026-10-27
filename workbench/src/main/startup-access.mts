import fs from 'node:fs/promises';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import type {Binding, DesktopMethod} from '../shared/contracts.ts';
import {readLocalRecord, writeLocalRecord} from './preferences.mts';

interface InstallationIdentity {executable: string; version: string; platform: string; arch: string; dev: string; ino: string; size: string; mtimeNs: string}
const selectionMethods: readonly string[] = ['openLibrary', 'createLibrary', 'openUpgradedLibrary'];
// These calls inspect only in-memory state or app-local configuration. Everything else
// remains unavailable until the user selects their library through the native panel.
const localMethods = new Set(['status', 'openLibrary', 'createLibrary', 'openUpgradedLibrary', 'readBootstrapRecovery', 'resetMachineBinding', 'readPreferences', 'savePreferences', 'readServiceSettings', 'saveServiceSettings', 'revealServiceCredential', 'checkServiceReadiness', 'readReminderStatus', 'testReminder', 'readSetup', 'openSetupTarget', 'copyPluginMarketLocation', 'exportDiagnostics', 'setAssistant', 'readAssistantSetup', 'readMaintenanceStatus', 'copyPrompt']);

export function assertStartupAccess(method: string, binding: Binding | undefined): void {
    if (binding?.needsReselect && !localMethods.has(method)) throw Object.assign(new Error('请重新选择内容库以确认文件访问。'), {code: 'LIBRARY_NOT_READY'});
}

/** This receipt records explicit selection for one installed executable, never OS permission. */
export class StartupAccessReceipt {
    private identity: Promise<InstallationIdentity | null> | undefined;
    private options: {file: string; executable: string; version: string; packaged: boolean; show: boolean; platform?: string; arch?: string};
    constructor(options: StartupAccessReceipt['options']) { this.options = options; }
    private enabled() { return this.options.packaged && this.options.show; }
    private installation() {
        return this.identity ??= (async () => {
            try {
                const {executable, version} = this.options;
                if (!path.isAbsolute(executable)) return null;
                const info = await fs.lstat(executable, {bigint: true});
                if (!info.isFile() || info.isSymbolicLink()) return null;
                return {executable, version, platform: this.options.platform ?? process.platform, arch: this.options.arch ?? process.arch, dev: String(info.dev), ino: String(info.ino), size: String(info.size), mtimeNs: String(info.mtimeNs)};
            } catch { return null; }
        })();
    }
    async requiresSelection(): Promise<boolean> {
        if (!this.enabled()) return false;
        const identity = await this.installation();
        if (!identity) return true;
        try {
            return !isDeepStrictEqual(await readLocalRecord(this.options.file), {format: 'nova-installation-library-selection', version: 1, identity});
        } catch { return true; }
    }
    async recordSelection(method: DesktopMethod, binding: Binding): Promise<boolean> {
        if (!this.enabled() || !selectionMethods.includes(method) || !binding.current || binding.needsReselect) return false;
        const identity = await this.installation();
        if (!identity) return false;
        try {
            await writeLocalRecord(this.options.file, {format: 'nova-installation-library-selection', version: 1, identity});
            return true;
        } catch { return false; } // An unavailable receipt conservatively requires selection next launch.
    }
}
