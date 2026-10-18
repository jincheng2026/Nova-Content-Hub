import {prepareNativeHandoff, nativeHandoffDirectory} from '../../../plugin-src/src/bridge/native-handoff.mjs';
import {errorInfo} from '../shared/contracts.ts';
import type {Dialogs, Release, DesktopInputs, DesktopMethod} from '../shared/contracts.ts';
import {app, BrowserWindow, clipboard, dialog, ipcMain, protocol, session, utilityProcess, nativeImage, shell, Menu, Tray, powerMonitor} from 'electron';
import fs from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PAGE, CHANNELS, CSP, assertCaller, staticResource, validateResources, validateRelease} from './boundary.mts';
import {BindingStore} from './bindings.mts';
import {DesktopController} from './controller.mts';
import {WorkerClient} from './worker-client.mts';
import {appIconPaths} from './branding.mts';
import {keepResident} from './resident.mts';
import {createOperationQueue} from './operation-queue.mts';
import {Preferences} from './preferences.mts';
import {Reminders} from './reminders.mts';
import {Setup} from './setup.mts';
import {installedAssistantSkill} from './assistant-skill.mts';
import type {Assistant, AssistantSetup} from '../shared/cover-contracts.ts';

const here = path.dirname(fileURLToPath(import.meta.url));

interface StartOptions {
    show?: boolean;
    userData?: string;
    dialogs?: Dialogs;
    onConsoleMessage?: (message: string) => void;
    ready?: (context: {
        window: BrowserWindow;
        controller: DesktopController;
        worker: WorkerClient;
        release: Release;
        tray: Tray | null
    }) => Promise<void>
}

protocol.registerSchemesAsPrivileged([{
    scheme: 'nova-content',
    privileges: {standard: true, secure: true, supportFetchAPI: true}
}]);
// Preserve the default userData path and existing machine-library bindings.
app.setName('Nova 内容库技术验证');

export async function startDesktop({show = true, userData, dialogs, ready, onConsoleMessage}: StartOptions = {}) {
    if (userData) app.setPath('userData', userData);
    const resources = validateResources(JSON.parse(readFileSync(path.join(here, '../renderer-resources.json'), 'utf8')));
    const release = validateRelease(JSON.parse(readFileSync(path.join(here, '../release.json'), 'utf8')));
    const icons = appIconPaths(path.join(here, '../brand'));
    if (!app.requestSingleInstanceLock()) {
        app.quit();
        return;
    }
    let window: BrowserWindow;
    let worker: WorkerClient | undefined;
    let resourceWorker: WorkerClient | undefined;
    let resident: ReturnType<typeof keepResident> | undefined;
    let tray: Tray | null = null;
    let reminders: Reminders | undefined;
    // shortcut: native dialogs also queue image reads; split only when dialogs can release library ownership safely.
    const runOperation = createOperationQueue();
    app.on('second-instance', () => resident?.show());
    app.on('activate', () => resident?.show());
    app.on('window-all-closed', () => app.quit());
    app.on('will-quit', () => { reminders?.dispose(); tray?.destroy(); worker?.stop(); resourceWorker?.stop(); });
    await app.whenReady();
    const icon = nativeImage.createFromPath(icons.png);
    const size = icon.getSize();
    if (icon.isEmpty() || !icon.getScaleFactors().includes(1) || size.width !== 512 || size.height !== 512) throw new Error('Cannot decode the bundled application PNG icon');
    if (icons.window !== icons.png && nativeImage.createFromPath(icons.window).isEmpty()) throw new Error('Cannot decode the bundled application ICO icon');
    if (process.platform === 'darwin') {
        if (!app.dock) throw new Error('macOS Dock is unavailable');
        app.dock.setIcon(icon);
    }
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => callback({cancel: details.method !== 'GET' || !(staticResource(details.url, resources) || controller.covers.allows(details.url))}));
    protocol.handle('nova-content', async request => {
        if (request.method === 'GET' && controller.covers.allows(request.url)) {
            try { const image = await runOperation(() => controller.covers.resource(request.url)); if (image) return new Response(image.data, { headers: { 'content-type': image.mime, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': CSP } }); } catch {}
            return new Response('Not found', { status: 404 });
        }
        const resource = staticResource(request.url, resources);
        if (request.method !== 'GET' || !resource) return new Response('Not found', {status: 404});
        return new Response(await fs.readFile(path.join(here, '../renderer', resource[0])), {
            headers: {
                'content-type': resource[1],
                'content-security-policy': CSP,
                'x-content-type-options': 'nosniff'
            }
        });
    });
    worker = new WorkerClient(() => utilityProcess.fork(path.join(here, 'worker.mjs'), [release.pairId], {
        serviceName: 'Nova 文件业务',
        stdio: 'ignore'
    }));
    resourceWorker = new WorkerClient(() => utilityProcess.fork(path.join(here, 'worker.mjs'), [release.pairId], { serviceName: 'Nova 本机图片', stdio: 'ignore' }));
    const readAssistantSetup = async (host: Assistant): Promise<AssistantSetup> => {
        try { await app.getApplicationInfoForProtocol(`${host}://`); }
        catch { return {host, ready: false, skill: null, reason: 'protocol-missing'}; }
        try { return {host, ready: true, skill: installedAssistantSkill(host, release), reason: 'available'}; }
        catch { return {host, ready: false, skill: null, reason: 'skill-missing'}; }
    };
    const controller = new DesktopController({
        copyText: text => clipboard.writeText(text),
        resourceWorker,
        store: new BindingStore(path.join(app.getPath('userData'), 'machine-binding.json')),
        worker,
        authMode: release.AUTH_MODE,
        documents: app.getPath('documents'),
        readAssistantSetup,
        launch: async (binding, reference) => {
            const setup = await readAssistantSetup(reference.host);
            if (!setup.ready || !setup.skill) throw Object.assign(new Error('助手或配套插件尚未准备好，请在工作台左下角设置中检查后重试。'), {code: 'NOT_READY'});
            const handoff = await prepareNativeHandoff(nativeHandoffDirectory(app.getPath('appData')), binding, reference, release, {installedSkill: setup.skill});
            await shell.openExternal(handoff.url);
        },
        dialogs: dialogs ?? {
            async promptDocument() { const selected = await dialog.showOpenDialog(window, { title: '选择提示词文件', properties: ['openFile'], filters: [{ name: 'Markdown 或文本', extensions: ['md', 'markdown', 'txt'] }] }); return selected.canceled ? null : selected.filePaths[0] ?? null; },
            async templateImages() {
                const selected = await dialog.showOpenDialog(window, {title: '选择同一模板组的风格样张（最多50张，共256 MiB）', properties: ['openFile', 'multiSelections'], filters: [{name: 'PNG、JPEG、WebP 或 GIF 图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif']}]});
                return selected.canceled ? null : selected.filePaths;
            },
            async material() {
                const selected = await dialog.showOpenDialog(window, {title: '选择内容资料（文字限1 MiB，图片或PDF限64 MiB）', properties: ['openFile'], filters: [{name: '图片、Markdown、文本或PDF资料', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'md', 'markdown', 'txt', 'pdf']}]});
                return selected.canceled ? null : selected.filePaths[0] ?? null;
            },
            async maintenanceParent() {
                const selected = await dialog.showOpenDialog(window, {title: '选择用于建立独立新文件夹的位置', properties: ['openDirectory', 'createDirectory']});
                return selected.canceled ? null : selected.filePaths[0] ?? null;
            },
            async libraryBackup() {
                const selected = await dialog.showOpenDialog(window, {title: '选择完整的内容库备份文件夹', properties: ['openDirectory']});
                return selected.canceled ? null : selected.filePaths[0] ?? null;
            },
            async photo() { const selected = await dialog.showOpenDialog(window, { title: '选择本机照片', properties: ['openFile'], filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }] }); return selected.canceled ? null : selected.filePaths[0]; },
            async export(defaultPath) { const selected = await dialog.showSaveDialog(window, { title: '导出候选封面', defaultPath, properties: ['showOverwriteConfirmation'] }); return selected.canceled ? null : selected.filePath ?? null; },
            async library() {
                const selected = await dialog.showOpenDialog(window, {
                    title: '打开内容库',
                    properties: ['openDirectory']
                });
                return selected.canceled ? null : selected.filePaths[0];
            },
            async backup() {
                const selected = await dialog.showOpenDialog(window, {
                    title: '选择旧工作台备份',
                    properties: ['openFile'],
                    filters: [{name: '工作台备份', extensions: ['json']}]
                });
                return selected.canceled ? null : selected.filePaths[0];
            },
            async destination(defaultPath) {
                const selected = await dialog.showSaveDialog(window, {
                    title: '选择新内容库的位置与名称',
                    buttonLabel: '使用此位置',
                    defaultPath,
                    properties: ['createDirectory', 'showOverwriteConfirmation']
                });
                return selected.canceled ? null : selected.filePath;
            },
        },
    });
    let initializationError: unknown;
    try {
        await controller.initialize();
    } catch (error) {
        initializationError = error;
    }
    window = new BrowserWindow({
        width: 960,
        height: 760,
        minWidth: 600,
        minHeight: 520,
        show: false,
        icon: icons.window,
        title: '自媒体工作台 · 技术验证',
        webPreferences: {
            preload: path.join(here, '../preload/index.cjs'),
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: true,
            webviewTag: false,
            devTools: false
        }
    });
    resident = keepResident(app, window, () => tray !== null && !tray.isDestroyed(), () =>
        dialog.showMessageBoxSync(window, {
            type: 'question',
            title: '草稿尚未保存',
            message: '是否保存当前草稿后退出？',
            buttons: ['保存后退出', '明确放弃并退出', '留在当前内容'],
            defaultId: 2,
            cancelId: 2
        }));
    try {
        const trayIcon = icon.resize({width: 18, height: 18});
        trayIcon.addRepresentation({scaleFactor: 2, buffer: icon.resize({width: 36, height: 36}).toPNG()});
        tray = new Tray(trayIcon);
        tray.setToolTip('自媒体工作台');
        tray.setContextMenu(Menu.buildFromTemplate([
            {label: '打开工作台', click: () => resident?.show()},
            {type: 'separator'},
            {label: '退出', click: () => app.quit()}
        ]));
        tray.on('click', () => resident?.show());
    } catch (error) {
        tray?.destroy();
        tray = null;
        console.warn('菜单栏/托盘不可用，关闭窗口将退出工作台。', error);
    }
    const preferences = new Preferences({file: path.join(app.getPath('userData'), 'local-preferences.json'), login: app});
    const serviceErrors: string[] = [];
    try { await preferences.initialize(); } catch { serviceErrors.push('PREFERENCES_UNAVAILABLE'); }
    const canRemind = (libraryId: string) => !initializationError && preferences.initialized && release.AUTH_MODE === 'disabled' && controller.binding?.current?.libraryId === libraryId && !controller.binding.needsReselect && !controller.binding.pending && !controller.binding.creation && !controller.binding.workspacePending && !controller.binding.maintenancePending && !controller.binding.seedPending;
    reminders = new Reminders({
        file: path.join(app.getPath('userData'), 'daily-reminder.json'),
        preferences: () => preferences.values,
        isCurrent: canRemind,
        snapshot: () => runOperation(async () => {
            const libraryId = controller.binding?.current?.libraryId;
            if (!libraryId || !canRemind(libraryId)) return null;
            const library = await controller.readWorkspaceLibrary();
            return canRemind(libraryId) ? {libraryId, library} : null;
        }),
        showWindow: () => {
            resident?.show();
            if (!window.isDestroyed()) void window.webContents.executeJavaScript("window.dispatchEvent(new Event('nova-show-calendar'))").catch(() => {});
        }
    });
    await reminders.initialize();
    const setup = new Setup({
        release,
        marketRoot: app.isPackaged ? path.join(process.resourcesPath, 'plugin-marketplace') : path.resolve(here, '../../plugin-marketplace'),
        assistant: () => readAssistantSetup(controller.binding?.assistant ?? 'codex'),
        shell, clipboard,
        saveDiagnosticDialog: async () => {
            const selected = await dialog.showSaveDialog(window, {title: '导出脱敏诊断（选择新文件）', defaultPath: `Nova-诊断-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, filters: [{name: '诊断文件', extensions: ['json']}], properties: ['showOverwriteConfirmation']});
            return selected.canceled ? null : selected.filePath ?? null;
        },
        contextSummary: () => {
            const binding = controller.binding;
            return {bindingPresent: !!binding?.current, recovery: {
                content: !!binding?.pending, workspace: !!binding?.workspacePending, creation: !!binding?.creation,
                photo: !!binding?.photoPending, cover: !!binding?.coverPending, coverAction: !!binding?.coverActionPending,
                maintenance: !!binding?.maintenancePending, seed: !!binding?.seedPending, needsReselect: !!binding?.needsReselect
            }, counts: controller.inspection?.counts, errorCodes: [...serviceErrors, ...(initializationError ? [errorInfo(initializationError).code] : [])]};
        }
    });
    controller.services = {preferences, reminders, setup};
    preferences.onSaved = () => { void reminders?.refresh(true); };
    const resumeReminders = () => { void reminders?.refresh(true); };
    powerMonitor.on('resume', resumeReminders);
    powerMonitor.on('unlock-screen', resumeReminders);
    app.once('will-quit', () => { powerMonitor.removeListener('resume', resumeReminders); powerMonitor.removeListener('unlock-screen', resumeReminders); });
    window.removeMenu();
    window.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
    window.webContents.on('will-navigate', event => event.preventDefault());
    window.webContents.on('will-frame-navigate', event => event.preventDefault());
    window.webContents.on('will-attach-webview', event => event.preventDefault());
    for (const method of CHANNELS) ipcMain.handle(`nova:${method}`, async (event, ...args) => {
        try {
            assertCaller(event, window?.webContents, args, method);
            if (initializationError && !['readPreferences', 'savePreferences', 'readReminderStatus', 'testReminder', 'readSetup', 'openSetupTarget', 'copyPluginMarketLocation', 'exportDiagnostics'].includes(method)) throw initializationError;
            return {
                ok: true,
                value: await runOperation(() => (controller[method] as (input?: DesktopInputs[DesktopMethod]) => Promise<unknown>).call(controller, args[0] as DesktopInputs[DesktopMethod])).finally(() => { if (['openLibrary', 'createLibrary', 'importBackup', 'resumeImport', 'createContent', 'updateContent', 'trashContent', 'restoreContent', 'mutateWorkspace', 'recoverWorkspaceMutation', 'retryWorkspaceMutation'].includes(method)) void reminders?.refresh(true); })
            };
        } catch (error) {
            return {
                ok: false,
                error: {
                    code: errorInfo(error).code,
                    message: errorInfo(error).code === 'FORBIDDEN' ? '该调用已被拒绝。' : errorInfo(error).message
                }
            };
        }
    });
    if (show) window.once('ready-to-show', () => window.show());
    if (onConsoleMessage) window.webContents.on('console-message', (_event, _level, message) => onConsoleMessage(message));
    await window.loadURL(PAGE);
    reminders.start();
    await ready?.({window, controller, worker, release, tray});
}
