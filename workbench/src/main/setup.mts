import fs from 'node:fs/promises';
import path from 'node:path';
import type {Clipboard, Shell} from 'electron';
import type {Release} from '../shared/contracts.ts';
import {isRecord} from '../shared/contracts.ts';
import type {AssistantSetup} from '../shared/cover-contracts.ts';
import type {SetupContextSummary, SetupView} from '../shared/setup-contracts.ts';
import {setupDesktopInput} from '../shared/setup-validation.ts';
import {fail} from '../shared/validation.ts';
import {readLocalRecord} from './preferences.mts';

const diagnosticCodes = new Set(['AUTH_NOT_CONFIGURED', 'BINDING_INVALID', 'CONFLICT', 'CORRUPT', 'IO_ERROR', 'NOT_READY', 'WORKER_EXIT', 'WORKER_STOPPED', 'PENDING_MUTATION', 'IMPORT_IN_PROGRESS', 'BACKUP_INCOMPLETE', 'SOURCE_CHANGED', 'FORMAT_UNSUPPORTED', 'PREFERENCES_UNAVAILABLE', 'MARKET_NOT_AVAILABLE', 'MARKET_MISMATCH', 'ASSISTANT_NOT_READY', 'BOOTSTRAP_CHANGED', 'BOOTSTRAP_UNSAFE', 'BOOTSTRAP_RECOVERY_INCOMPLETE', 'OTHER']);
const recoveryKeys = ['content', 'workspace', 'template', 'creation', 'photo', 'cover', 'coverAction', 'maintenance', 'seed', 'needsReselect'] as const;
const countKeys = ['contents', 'collections', 'templates', 'photos', 'prompts'] as const;
export class Setup {
    release: Release;
    marketRoot: string | null;
    assistant: () => Promise<AssistantSetup>;
    shell: Pick<Shell, 'openExternal' | 'openPath'>;
    clipboard: Pick<Clipboard, 'writeText'>;
    saveDiagnosticDialog: () => Promise<string | null>;
    contextSummary: () => SetupContextSummary;
    constructor({release, marketRoot, assistant, shell, clipboard, saveDiagnosticDialog, contextSummary}: {
        release: Release; marketRoot: string | null; assistant: Setup['assistant']; shell: Setup['shell']; clipboard: Setup['clipboard']; saveDiagnosticDialog: Setup['saveDiagnosticDialog']; contextSummary: Setup['contextSummary'];
    }) { this.release = release; this.marketRoot = marketRoot; this.assistant = assistant; this.shell = shell; this.clipboard = clipboard; this.saveDiagnosticDialog = saveDiagnosticDialog; this.contextSummary = contextSummary; }

    async market(): Promise<SetupView['market']> {
        const root = this.marketRoot;
        if (!root || !path.isAbsolute(root) || root.includes('\0')) return {state: 'notavailable', name: null};
        try {
            const info = await fs.lstat(root);
            if (!info.isDirectory() || info.isSymbolicLink()) return {state: 'notavailable', name: null};
            const metadata = await readLocalRecord(path.join(root, this.release.appScope, 'plugin-src/src/release.json'));
            const codex = await readLocalRecord(path.join(root, '.agents/plugins/marketplace.json'));
            const workbuddy = await readLocalRecord(path.join(root, '.codebuddy-plugin/marketplace.json'));
            if (!metadata || !codex || !workbuddy) return {state: 'notavailable', name: null};
            const expectedName = `${this.release.appScope}-auth-${this.release.AUTH_MODE}-${this.release.platform}-${this.release.arch}`;
            if (!isRecord(metadata) || metadata.format !== 'nova-content-plugin-release' || ['version', 'pairId', 'AUTH_MODE', 'platform', 'arch', 'protocolVersion', 'appScope', 'productId'].some(key => metadata[key] !== this.release[key as keyof Release]) || !isRecord(codex) || codex.name !== expectedName || !isRecord(workbuddy) || workbuddy.name !== expectedName) return {state: 'mismatch', name: null};
            const codexPlugin = Array.isArray(codex.plugins) && codex.plugins.length === 1 ? codex.plugins[0] : null;
            const buddyPlugin = Array.isArray(workbuddy.plugins) && workbuddy.plugins.length === 1 ? workbuddy.plugins[0] : null;
            if (!isRecord(codexPlugin) || codexPlugin.name !== this.release.appScope || !isRecord(codexPlugin.source) || codexPlugin.source.source !== 'local' || codexPlugin.source.path !== `./${this.release.appScope}` || !isRecord(buddyPlugin) || buddyPlugin.name !== this.release.appScope || buddyPlugin.source !== `./${this.release.appScope}` || buddyPlugin.version !== this.release.version) return {state: 'mismatch', name: null};
            return {state: 'available', name: expectedName};
        } catch { return {state: 'notavailable', name: null}; }
    }
    async readSetup(): Promise<SetupView> {
        let assistant: AssistantSetup;
        try { assistant = await this.assistant(); }
        catch { assistant = {host: 'codex', ready: false, skill: null, reason: 'unconfigured'}; }
        return {platform: this.release.platform, arch: this.release.arch, version: this.release.version, mode: this.release.AUTH_MODE, experimental: true, assistant, market: await this.market(), entitlement: this.release.AUTH_MODE === 'required' ? 'not-integrated' : 'disabled-experimental'};
    }
    async requireMarket() {
        const state = await this.market();
        if (state.state !== 'available') fail(state.state === 'mismatch' ? 'MARKET_MISMATCH' : 'MARKET_NOT_AVAILABLE', state.state === 'mismatch' ? '配套插件市场与当前应用的版本、模式或架构不匹配，请获取整套匹配的安装文件。' : '当前安装未携带可用的配套插件市场，请获取发行方提供的完整匹配插件包。');
        return this.marketRoot!;
    }
    async openSetupTarget(input: {target: 'assistant' | 'market'}): Promise<{opened: true}> {
        if (!setupDesktopInput('openSetupTarget', input)) fail('INVALID_INPUT', '安装引导目标无效。');
        try {
            if (input.target === 'market') {
                const target = await this.requireMarket();
                if (await this.shell.openPath(target)) fail('SETUP_OPEN_FAILED', '系统未能打开配套插件市场文件夹。');
            } else {
                const assistant = await this.assistant();
                if (!['codex', 'workbuddy'].includes(assistant.host) || assistant.reason === 'protocol-missing') fail('ASSISTANT_NOT_READY', '尚未发现所选助手的打开入口，请先安装并启动该助手。');
                await this.shell.openExternal(`${assistant.host}://`);
            }
        } catch (error) {
            const code = isRecord(error) && typeof error.code === 'string' ? error.code : '';
            if (['MARKET_MISMATCH', 'MARKET_NOT_AVAILABLE', 'ASSISTANT_NOT_READY', 'SETUP_OPEN_FAILED'].includes(code)) throw error;
            fail('SETUP_OPEN_FAILED', '系统未能打开此入口，请检查助手安装或配套文件。');
        }
        return {opened: true};
    }
    async copyPluginMarketLocation(): Promise<{copied: true}> {
        const root = await this.requireMarket();
        try { await this.clipboard.writeText(root); }
        catch { fail('CLIPBOARD_UNAVAILABLE', '未能复制配套市场位置，请重试。'); }
        return {copied: true};
    }
    async exportDiagnostics(): Promise<{exported: boolean; name: string | null}> {
        const destination = await this.saveDiagnosticDialog();
        if (!destination) return {exported: false, name: null};
        if (!path.isAbsolute(destination) || destination.includes('\0')) fail('DIAGNOSTIC_EXPORT_FAILED', '请选择新的诊断文件位置。');
        try {
            let cursor = path.parse(destination).root;
            for (const part of path.relative(cursor, path.dirname(destination)).split(path.sep).filter(Boolean)) {
                cursor = path.join(cursor, part);
                const info = await fs.lstat(cursor);
                if (!info.isDirectory() || info.isSymbolicLink()) fail('DIAGNOSTIC_EXPORT_FAILED', '诊断导出位置无效。');
            }
            const context = this.contextSummary();
            const recovery = Object.fromEntries(recoveryKeys.map(key => [key, context.recovery?.[key] === true]));
            const counts = Object.fromEntries(countKeys.flatMap(key => { const value = context.counts?.[key]; return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? [[key, value]] : []; }));
            const errorCodes = [...new Set((context.errorCodes ?? []).slice(0, 100).map(code => diagnosticCodes.has(code) ? code : 'OTHER'))].slice(0, 32);
            const bindingBackupName = typeof context.bindingBackupName === 'string' && /^machine-binding\.[0-9a-f-]{36}\.backup\.json$/.test(context.bindingBackupName) ? context.bindingBackupName : null;
            const report = {bindingBackupName, format: 'nova-content-desktop-diagnostics', schemaVersion: 1, platform: this.release.platform, arch: this.release.arch, version: this.release.version, mode: this.release.AUTH_MODE, bindingPresent: context.bindingPresent === true, recovery, counts, errorCodes};
            const handle = await fs.open(destination, 'wx', 0o600);
            try { await handle.writeFile(`${JSON.stringify(report, null, 2)}\n`); await handle.sync(); }
            finally { await handle.close(); }
            return {exported: true, name: path.basename(destination)};
        } catch { fail('DIAGNOSTIC_EXPORT_FAILED', '诊断导出未完成。已有文件不会被覆盖，请选择另一个新的文件名。'); }
    }
}
