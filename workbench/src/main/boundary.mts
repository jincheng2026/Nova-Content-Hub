import {validateInput} from '../shared/validation.ts';
import {isRecord} from '../shared/contracts.ts';
import type {BuildConfig, DesktopMethod, RendererResources, Release} from '../shared/contracts.ts';
import type {IpcMainInvokeEvent, WebContents} from 'electron';

export const PAGE = 'nova-content://app/index.html';
export const CHANNELS = Object.freeze([
    'readTemplateProgress', 'continueBoundTemplate', 'readCoverProgress', 'continueBoundCover', 'readTemplateAssistantSetup', 'readTemplateWorkflow', 'startTemplateStudy', 'continueTemplateStudy', 'retryTemplateStudy', 'cancelTemplateStudy', 'acceptTemplateStudy', 'recoverTemplateMutation', 'retryTemplateMutation', 'abandonTemplateMutation',
    'readBootstrapRecovery', 'resetMachineBinding',
    'choosePromptDocument', 'chooseTemplateImages', 'chooseContentMaterial', 'readContentMaterial', 'exportContentMaterial',
    'status', 'chooseBackup', 'chooseDestination', 'importBackup', 'resumeImport', 'listContents', 'readWorkspace', 'copyPrompt',
    'createLibrary', 'openLibrary', 'readContent', 'createContent', 'updateContent', 'trashContent', 'restoreContent',
    'queryPendingMutation', 'retryPendingMutation', 'resolvePendingMutation', 'listCoverAssets', 'retryBuiltins', 'choosePhoto',
    'resumePhoto', 'abandonPhoto', 'readCover', 'generateCover', 'resumeCover', 'abandonCover', 'continueCover', 'retryCover',
    'cancelCover', 'selectCover', 'exportCover', 'revealCoverFolder', 'setAssistant', 'readAssistantSetup', 'resumeCoverAction', 'abandonCoverAction',
    'readWorkspaceLibrary', 'readWorkspaceContent', 'openPublicationLink', 'revealLibraryFolder', 'revealTemplateFolder', 'chooseTemplateFolder', 'mutateWorkspace', 'updateCoverCandidate', 'updatePromptFavorite', 'recoverWorkspaceMutation', 'retryWorkspaceMutation', 'abandonWorkspaceMutation',
    'inspectLibraryHealth', 'backupLibrary', 'verifyLibraryBackup', 'restoreLibraryBackup', 'readMaintenanceStatus', 'recoverMaintenance', 'abandonMaintenance',
    'prepareLibraryUpgrade', 'cancelLibraryUpgrade', 'confirmLibraryUpgrade', 'queryLibraryUpgrade', 'continueLibraryUpgrade', 'openUpgradedLibrary',
    'readPreferences', 'savePreferences', 'readReminderStatus', 'testReminder',
    'readSetup', 'openSetupTarget', 'copyPluginMarketLocation', 'exportDiagnostics'
] satisfies DesktopMethod[]);
export const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline'; img-src 'self' nova-content://assets; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
const MIME: Record<string, string> = {
    html: 'text/html; charset=utf-8',
    js: 'text/javascript; charset=utf-8',
    css: 'text/css; charset=utf-8',
    png: 'image/png'
};

export function validateResources(value: unknown): RendererResources {
    if (!isRecord(value) || value.format !== 'nova-desktop-renderer-resources' || value.schemaVersion !== 1 || !isRecord(value.entries) || !Object.hasOwn(value.entries, '/index.html')) throw new Error('Missing or invalid renderer resource manifest');
    for (const [url, resource] of Object.entries(value.entries)) {
        if (!/^\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-][a-zA-Z0-9_.-]*\.(?:html|js|css|png)$/.test(url) || url.includes('..') || !isRecord(resource) || resource.file !== url.slice(1) || resource.mime !== MIME[url.split('.').at(-1)!]) throw new Error('Invalid renderer resource entry');
    }
    return value as unknown as RendererResources;
}

export function validateBuildConfig(value: unknown): BuildConfig {
    if (!isRecord(value) || (value.AUTH_MODE !== 'required' && value.AUTH_MODE !== 'disabled') || value.appScope !== 'nova-content-hub' || value.productId !== 'nova-content-hub' || value.protocolVersion !== 1 || value.prototype !== true || typeof value.version !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value.version)) throw new Error('Invalid desktop release build configuration');
    return value as unknown as BuildConfig;
}

export function validateRelease(value: unknown): Release {
    const config = validateBuildConfig(value);
    if (!isRecord(value) || value.format !== 'nova-content-desktop-release' || value.schemaVersion !== 1 || value.experimental !== true || value.productionReady !== false || !['darwin', 'linux', 'win32'].includes(process.platform) || !['arm64', 'x64'].includes(process.arch) || value.platform !== process.platform || value.arch !== process.arch || value.pairId !== `${config.appScope}@${config.version}:p${config.protocolVersion}:${config.AUTH_MODE}`) throw new Error('Missing or invalid explicit desktop release configuration');
    return value as unknown as Release;
}

export function assertCaller(event: IpcMainInvokeEvent, webContents: WebContents | undefined, args: unknown[], method?: DesktopMethod) {
    if (!webContents || webContents.isDestroyed() || event.sender !== webContents || !event.senderFrame || event.senderFrame !== webContents.mainFrame || event.senderFrame.url !== PAGE || (method ? args.length > 1 : args.length !== 0)) throw Object.assign(new Error('该窗口无权调用此操作。'), {code: 'FORBIDDEN'});
    if (method) validateInput(method, args[0]);
}

export function staticResource(rawUrl: string, resources: RendererResources): [string, string] | null {
    const prefix = 'nova-content://app';
    if (!rawUrl.startsWith(`${prefix}/`)) return null;
    const key = rawUrl.slice(prefix.length);
    // Exact raw keys also refuse URL normalization, escapes, empty query/hash and unregistered assets.
    if (!Object.hasOwn(resources.entries, key)) return null;
    const resource = resources.entries[key];
    return [resource.file, resource.mime];
}
