import {publicEndpoint} from './service-tools.mts';
import {productionArchiveDirectory} from './production-archive.mts';
import {assistantSessionURL} from '../shared/task-progress.ts';
import {prepareNativeHandoff, nativeHandoffDirectory, openNativeHandoff} from '../../../plugin-src/src/bridge/native-handoff.mjs';
import {prepareProductionHandoff,productionExecutionCapability} from '../../../plugin-src/src/bridge/production-handoff.mjs';
import {errorInfo} from '../shared/contracts.ts';
import type {Dialogs, Release, DesktopInputs, DesktopMethod, LibraryBinding} from '../shared/contracts.ts';
import {requireWrite, fail} from '../shared/validation.ts';
import {app, BrowserWindow, clipboard, dialog, ipcMain, protocol, session, utilityProcess, nativeImage, shell, Menu, Tray, powerMonitor, safeStorage} from 'electron';
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {readFileSync, existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PAGE, CHANNELS, CSP, assertCaller, staticResource, validateResources, validateRelease} from './boundary.mts';
import {BindingStore} from './bindings.mts';
import {DesktopController} from './controller.mts';
import {WorkerClient} from './worker-client.mts';
import {appIconPaths} from './branding.mts';
import {applicationMenu} from './application-menu.mts';
import {keepResident} from './resident.mts';
import {createOperationQueue} from './operation-queue.mts';
import {Preferences} from './preferences.mts';
import {BootstrapRecovery} from './bootstrap-recovery.mts';
import {LibraryWatcher} from './library-watch.mts';
import {Reminders} from './reminders.mts';
import {Setup} from './setup.mts';
import {installedAssistantSkill} from './assistant-skill.mts';
import {launchWithAssistantRuntime} from './assistant-runtime.mts';
import {assistantNotReady} from './assistant-failure.mts';
import {confirmInstalledApplication, offerApplicationInstall} from './installation.mts';
import {isMacInstallationBackupExecutable} from './mac-installation.mts';
import {ServiceSettingsStore} from './service-settings.mts';
import {ServiceTools} from './service-tools.mts';
import {productionToolBroker} from './production-services.mts';
import {createPublicationCollector} from './publication-collector.mts';
import {createPublicationObserver} from './publication-observer.mts';
import {ProductionPages} from './production-pages.mts';
import type {TemplateAssistantSetup} from '../shared/template-contracts.ts';
import type {Assistant, AssistantSetup} from '../shared/cover-contracts.ts';

const here = path.dirname(fileURLToPath(import.meta.url));

interface StartOptions {
    show?: boolean;
    userData?: string;
    marketRoot?: string;
    localRuntimeRoots?: readonly string[];
    publicationObserver?: boolean;
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
// Keep the existing machine binding location while changing the public application name.
const existingUserData = path.join(app.getPath('appData'), 'Nova 内容库技术验证');
app.setName('自媒体工作台');
if (existsSync(existingUserData)) app.setPath('userData', existingUserData);

export async function startDesktop(options:StartOptions = {}) {
    const {show = true, userData, marketRoot, dialogs, ready, onConsoleMessage}=options;
    if (process.platform === 'darwin' && isMacInstallationBackupExecutable(process.execPath)) { app.quit(); return; }
    if (userData) app.setPath('userData', userData);
    const resources = validateResources(JSON.parse(readFileSync(path.join(here, '../renderer-resources.json'), 'utf8')));
    const release = validateRelease(JSON.parse(readFileSync(path.join(here, '../release.json'), 'utf8')));
    const icons = appIconPaths(path.join(here, '../brand'));
    if (!app.requestSingleInstanceLock()) {
        if (show && process.platform === 'darwin' && app.isPackaged && !app.isInApplicationsFolder()) {
            await app.whenReady();
            dialog.showMessageBoxSync({type: 'info', message: '请先退出正在运行的自媒体工作台', detail: '安装需要先关闭原来的工作台，再重新打开当前安装包。原来的工作台可以继续使用。', buttons: ['知道了']});
        }
        app.quit();
        return;
    }
    let window: BrowserWindow;
    let worker: WorkerClient | undefined;
    let resourceWorker: WorkerClient | undefined;
    let resident: ReturnType<typeof keepResident> | undefined;
    let tray: Tray | null = null;
    let reminders: Reminders | undefined;
    let libraryWatcher: LibraryWatcher | undefined;
    let productionPages: ProductionPages | undefined;
    let productionBroker: ReturnType<typeof productionToolBroker> | undefined;
    let publicationObserver: ReturnType<typeof createPublicationObserver> | undefined;
    const serviceErrors: string[] = [];
    let quitting = false, quitReady = false;
    let resumeReminders: (() => void) | undefined;
    // Keep library reads and writes serial: separate workers still share the same library lock.
    const runOperation = createOperationQueue();
    app.on('second-instance', () => resident?.show());
    app.on('activate', () => resident?.show());
    app.on('window-all-closed', () => app.quit());
    app.on('will-quit', event => {
        if (quitReady) return;
        event.preventDefault();
        if (quitting) return;
        quitting = true;
        // will-quit follows the resident draft-save guard; accepted writes must release their locks before worker termination.
        libraryWatcher?.close();
        // Keep the broker and shared worker queue alive through observer result/unknown bookkeeping.
        const publicationDrain = publicationObserver?.stop({timeoutMs:10000,writeTimeoutMs:3000});
        reminders?.dispose();
        if (resumeReminders) {
            powerMonitor.removeListener('resume', resumeReminders);
            powerMonitor.removeListener('unlock-screen', resumeReminders);
        }
        // Stop new browser/tool requests and settle accepted service calls before closing the shared queue.
        void Promise.resolve(publicationDrain).then(() => Promise.allSettled([productionPages?.close(), productionBroker?.stop()])).then(() => runOperation.close()).then(() => {
            worker?.stop();
            resourceWorker?.stop();
            tray?.destroy();
            quitReady = true;
            app.quit();
        });
    });
    await app.whenReady();
    Menu.setApplicationMenu(Menu.buildFromTemplate(applicationMenu(process.platform, app.getName())));
    const icon = nativeImage.createFromPath(icons.png);
    const size = icon.getSize();
    if (icon.isEmpty() || !icon.getScaleFactors().includes(1) || size.width !== (process.platform === 'darwin' ? 1024 : 512) || size.height !== (process.platform === 'darwin' ? 1024 : 512)) throw new Error('Cannot decode the bundled application PNG icon');
    if (icons.window !== icons.png && nativeImage.createFromPath(icons.window).isEmpty()) throw new Error('Cannot decode the bundled application ICO icon');
    if (show && await offerApplicationInstall(app, dialog) === 'relaunching') return;
    if (process.platform === 'darwin') {
        if (!app.dock) throw new Error('macOS Dock is unavailable');
        app.dock.setIcon(icon);
    }
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => callback({cancel: details.method !== 'GET' || !(staticResource(details.url, resources) || controller.covers.allows(details.url) || controller.creation.resource(details.url)!==null)}));
    protocol.handle('nova-content', async request => {
        const creation=request.method==='GET'?controller.creation.resource(request.url):null;
        if(creation!==null)return new Response(creation,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors nova-content://app"}});
        if (request.method === 'GET' && controller.covers.allows(request.url)) {
            try { const image = await controller.covers.resource(request.url); if (image) return new Response(image.data, { headers: { 'content-type': image.mime, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': CSP } }); } catch {}
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
    const readTemplateAssistantSetup = async (host: Assistant): Promise<TemplateAssistantSetup> => {
        try { await app.getApplicationInfoForProtocol(`${host}://`); }
        catch { return {host, ready: false, skill: null, reason: 'protocol-missing'}; }
        try { return {host, ready: true, skill: installedAssistantSkill(host, release, {capability: 'template'}), reason: 'available'}; }
        catch { return {host, ready: false, skill: null, reason: 'skill-missing'}; }
    };
    const openPreparedHandoff = (handoff: {url: string; prompt: string; requiresPaste: boolean}) => openNativeHandoff(handoff, {
        openExternal: (url: string) => shell.openExternal(url)
    });
    const assistantMarketRoot = marketRoot ?? (app.isPackaged ? path.join(process.resourcesPath, 'plugin-marketplace') : path.resolve(here, '../../plugin-marketplace'));
    const serviceSettings = new ServiceSettingsStore({filePath: path.join(app.getPath('userData'), 'service-settings.json'), encryption: safeStorage, deferEncryptionCheck: true});
    try { await serviceSettings.initialize(); } catch { serviceErrors.push('SETTINGS_UNAVAILABLE'); }
    const serviceTools = new ServiceTools({settings: serviceSettings, cachePath: path.join(app.getPath('userData'), 'service-cache', 'tikhub.json'),localRuntimeRoots:options.localRuntimeRoots??[path.join(process.resourcesPath,'local-asr',`${process.platform}-${process.arch}`)]});
    const serviceDescriptorPath = path.join(app.getPath('userData'), 'production-services.json');
    const controller: DesktopController = new DesktopController({
        copyText: text => clipboard.writeText(text),
        openPublicationURL: url => shell.openExternal(url),
        revealFolder: root => shell.showItemInFolder(root),
        resourceWorker: {call: (op, args) => {
            const epoch = controller.covers.epoch;
            return runOperation(() => {
                if (epoch !== controller.covers.epoch) throw Object.assign(new Error('图片所属内容库已切换。'), {code: 'CANCELLED'});
                return resourceWorker!.call(op, args);
            }, 'background');
        }},
        store: new BindingStore(path.join(app.getPath('userData'), 'machine-binding.json')),
        worker,
        authMode: release.AUTH_MODE,
        documents: app.getPath('documents'),
        readAssistantSetup,
        readTemplateAssistantSetup,
        productionCallbacks: {
            serviceSettings: async () => serviceSettings.read(),
            openSource: async url => { await shell.openExternal(url); },
            costReconciled: requestId => serviceTools.reconcileCost(requestId),
            focus: async host => {
                let target;
                try { target = await app.getApplicationInfoForProtocol(`${host}://`); }
                catch { throw assistantNotReady('protocol-missing'); }
                if (!path.isAbsolute(target.path) || await shell.openPath(target.path)) fail('OPEN_FAILED', '系统未能打开所选助手，请手动返回原对话。');
            },
            launch: async (binding, reference) => {
                requireWrite(release.AUTH_MODE);
                serviceSettings.read();
                if (!productionBroker) fail('NOT_READY', '本机工具服务尚未准备好。');
                await productionBroker.start();
                const context = await worker!.call('productionContext', {binding, taskId: reference.taskId});
                if (!context.task) fail('NOT_FOUND', '任务不存在。');
                const capability = productionExecutionCapability(context.task);
                try { await app.getApplicationInfoForProtocol(`${reference.host}://`); }
                catch { throw assistantNotReady('protocol-missing'); }
                const installedSkill = installedAssistantSkill(reference.host, release, {capability});
                await launchWithAssistantRuntime(reference.host, release, assistantMarketRoot, async () => {
                    const handoff = await prepareProductionHandoff(nativeHandoffDirectory(app.getPath('appData')), binding, reference, release, {installedSkill, serviceDescriptorPath});
                    await openPreparedHandoff(handoff);
                }, {capability});
            },
            open: async (binding, target) => {
                if (target.kind === 'task-archive') {
                    const archive = await worker!.call('productionArchive', {binding, taskId: target.id});
                    const directory = await productionArchiveDirectory(binding, archive);
                    if (await shell.openPath(directory)) fail('OPEN_FAILED', '归档文件已保存，系统未能打开目录，请稍后重试。');
                    return '知识归档目录已重建并打开。';
                }
                let url: string;
                if (target.kind === 'account') {
                    const snapshot = await worker!.call('productionRead', {binding});
                    const account = snapshot.accounts.find(item => item.id === target.id && !item.deletedAt);
                    if (!account) fail('NOT_FOUND', '账号不存在。');
                    let parsed: URL;
                    try { parsed = new URL(account.url); } catch { return fail('INVALID_INPUT', '账号链接无效。'); }
                    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) fail('INVALID_INPUT', '账号链接无效。');
                    url = parsed.href;
                } else {
                    if (!productionPages) fail('NOT_READY', '本机创作与报告页面尚未准备好。');
                    url = target.kind === 'creation' ? await productionPages.openCreation(binding, target.id) : await productionPages.openReport(binding, target.id, target.pageId);
                }
                await shell.openExternal(url);
                return url;
            }
        },
        launchTemplate: async (binding, reference) => {
            const setup = await readTemplateAssistantSetup(reference.host);
            if (!setup.ready || !setup.skill) throw Object.assign(new Error('请在设置中安装并启用与此工作台匹配的模板执行插件。'), {code: 'NOT_READY'});
            const {templateId, requestId, attemptId, requestHash, host, sessionId} = reference;
            if (sessionId) {await shell.openExternal(assistantSessionURL(host, sessionId)); return;}
            const installedSkill = setup.skill;
            await launchWithAssistantRuntime(host, release, assistantMarketRoot, async () => {
                const handoff = await prepareNativeHandoff(nativeHandoffDirectory(app.getPath('appData')), binding, {templateId, requestId, attemptId, requestHash, host}, release, {kind: 'template', installedSkill});
                await openPreparedHandoff(handoff);
            }, {capability: 'template'});
        },
        launch: async (binding, reference) => {
            if (reference.sessionId) {await shell.openExternal(assistantSessionURL(reference.host, reference.sessionId)); return;}
            const setup = await readAssistantSetup(reference.host);
            if (!setup.ready || !setup.skill) throw Object.assign(new Error('助手或配套插件尚未准备好，请在工作台左下角设置中检查后重试。'), {code: 'NOT_READY'});
            const installedSkill = setup.skill;
            await launchWithAssistantRuntime(reference.host, release, assistantMarketRoot, async () => {
                const handoff = await prepareNativeHandoff(nativeHandoffDirectory(app.getPath('appData')), binding, reference, release, {installedSkill});
                await openPreparedHandoff(handoff);
            });
        },
        dialogs: dialogs ?? {
            async productionFiles(kind) {
                const filters = kind === 'images' ? [{name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif']}] : kind === 'report' ? [{name: 'HTML 报告', extensions: ['html', 'htm']}] : [{name: '音视频与字幕', extensions: ['mp3', 'wav', 'm4a', 'mp4', 'mov', 'webm', 'ogg', 'flac', 'aac', 'srt', 'vtt', 'txt']}];
                const selected = await dialog.showOpenDialog(window, {title: kind === 'images' ? '选择账号截图（每个文件不超过64 MiB）' : kind === 'report' ? '选择完整 HTML 报告（每个文件不超过64 MiB）' : '选择本机音视频或字幕（每个文件不超过64 MiB）', properties: ['openFile', 'multiSelections'], filters});
                return selected.canceled ? null : selected.filePaths;
            },
            async promptDocument() { const selected = await dialog.showOpenDialog(window, { title: '选择提示词文件', properties: ['openFile'], filters: [{ name: 'Markdown 或文本', extensions: ['md', 'markdown', 'txt'] }] }); return selected.canceled ? null : selected.filePaths[0] ?? null; },
            async sourceRoot(role) {const selected=await dialog.showOpenDialog(window,{title:role==='visual-assets'?'关联原视觉资料文件夹':role==='bookmarks'?'关联 X 收藏文件夹':'关联已有资料文件夹',properties:['openDirectory']});return selected.canceled?null:selected.filePaths[0]??null;},
            async templateFolder() {const selected = await dialog.showOpenDialog(window, {title: '选择同一模板的图片文件夹（仅第一层，最多50张）', properties: ['openDirectory']}); return selected.canceled ? null : selected.filePaths[0] ?? null;},
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
            async legacyLibrary() {
                const selected = await dialog.showOpenDialog(window, {title: '选择第4版旧内容库（原库保留，将升级独立副本）', properties: ['openDirectory']});
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
    controller.creation.openLocalFile = async filename => {const error=await shell.openPath(filename);if(error)throw new Error(error);};
    const authorizeProductionPage = (binding: LibraryBinding) => {
        requireWrite(release.AUTH_MODE);
        if (quitting) fail('FORBIDDEN', '工作台正在退出。');
        const current = controller.current();
        if (current.libraryId !== binding.libraryId || current.root !== binding.root || current.rootIdentity.dev !== binding.rootIdentity.dev || current.rootIdentity.ino !== binding.rootIdentity.ino) fail('FORBIDDEN', '页面所属内容库已切换，请从当前内容库重新打开。');
    };
    productionPages = new ProductionPages({
        openSource: (binding, url) => runOperation(async () => {
            authorizeProductionPage(binding);
            const checked = await publicEndpoint(url);
            await shell.openExternal(checked.url.href);
        }),
        creationHtml: readFileSync(path.join(here, '../production-creation.html'), 'utf8'),
        authorize: authorizeProductionPage,
        worker: {call: (op, args) => runOperation(async () => {
            if (!['productionReport','productionMedia','jinchengSources','jinchengSourceCatalog','jinchengSourcePage','jinchengSourceAsset','jinchengSourceRequest'].includes(op) || !('binding' in args)) fail('FORBIDDEN', '页面请求无效。');
            authorizeProductionPage(args.binding as LibraryBinding);
            return worker!.call(op, args);
        })},
        readCreation: (binding, contentId) => runOperation(async () => {
            authorizeProductionPage(binding);
            return controller.readProductionCreation({contentId});
        }),
        setReportPosition: (binding, reportId, pageId) => runOperation(async () => {
            authorizeProductionPage(binding);
            const snapshot = await controller.readProduction();
            try { await controller.mutateProduction({op: 'setReportPosition', input: {id: reportId, pageId, expectedToken: snapshot.editToken}, mutationId: randomUUID()}); }
            finally { syncLibraryWatcher(); }
        }),
        saveDraft: (binding, input) => runOperation(async () => {
            authorizeProductionPage(binding);
            try { return await controller.saveProductionDraft(input); }
            finally { syncLibraryWatcher(); }
        })
    });
    controller.vault.openBoundSource=async(binding,sourceId,relativePath)=>{authorizeProductionPage(binding);const url=await productionPages!.openBoundSource(binding,sourceId,relativePath);await shell.openExternal(url);};
    productionBroker = productionToolBroker({worker, current: () => {
        requireWrite(release.AUTH_MODE);
        return controller.current();
    }}, serviceTools, serviceDescriptorPath, runOperation);
    if (release.AUTH_MODE === 'disabled') try { await productionBroker.start(); } catch { serviceErrors.push('BROKER_UNAVAILABLE'); }
    let initializationError: unknown;
    let bootstrapReason = 'none';
    let bindingBackupName: string | null = null;
    const bootstrap = new BootstrapRecovery({store: controller.store, onRecovered: async () => {
        await controller.initialize();
        controller.covers.revoke();
        controller.pendingView = null;
        controller.workspace.pendingView = null;
        controller.templates.pendingView = null;
        initializationError = undefined;
        libraryWatcher?.bind(null);
    }});
    const readBootstrapRecovery = async () => {
        const result = await bootstrap.readBootstrapRecovery();
        bootstrapReason = result.reasonCode;
        bindingBackupName = result.backupName;
        if (result.state === 'ready' && initializationError) { await controller.initialize(); initializationError = undefined; }
        return result;
    };
    try {
        const startup = await readBootstrapRecovery();
        if (startup.state !== 'ready') throw Object.assign(new Error('本机内容库连接记录不可用，请使用重新连接入口保留原记录并恢复。'), {code: 'BINDING_INVALID'});
        await controller.initialize();
    } catch (error) {
        initializationError = error;
    }
    window = new BrowserWindow({
        width: 1280,
        height: 860,
        minWidth: 960,
        minHeight: 680,
        show: false,
        icon: icons.window,
        title: '自媒体工作台',
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
    libraryWatcher = new LibraryWatcher({notify: change => {
        if (quitting) return;
        if (!window.isDestroyed() && !window.webContents.isDestroyed() && window.webContents.getURL() === PAGE) window.webContents.send('nova:workspace-changed', change);
        if (change === 'changed') void reminders?.refresh(true);
    }});
    const syncLibraryWatcher = () => { if (!quitting) libraryWatcher?.bind(initializationError || controller.binding?.needsReselect ? null : controller.binding?.current ?? null); };
    try {
        const traySource = nativeImage.createFromPath(icons.tray);
        const trayIcon = traySource.resize({width: 18, height: 18});
        trayIcon.addRepresentation({scaleFactor: 2, buffer: nativeImage.createFromPath(icons.trayRetina).resize({width: 36, height: 36}).toPNG()});
        if (process.platform === 'darwin') trayIcon.setTemplateImage(true);
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
    try { await preferences.initialize(); } catch { serviceErrors.push('PREFERENCES_UNAVAILABLE'); }
    const canRemind = (libraryId: string) => !initializationError && preferences.initialized && release.AUTH_MODE === 'disabled' && controller.binding?.current?.libraryId === libraryId && !controller.binding.needsReselect && !controller.binding.vaultPending && !controller.binding.pending && !controller.binding.creation && !controller.binding.workspacePending && !controller.binding.templatePending && !controller.binding.maintenancePending && !controller.binding.seedPending && !controller.binding.productionPending;
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
        marketRoot: assistantMarketRoot,
        assistant: () => readAssistantSetup(controller.binding?.assistant ?? 'codex'),
        shell, clipboard,
        saveDiagnosticDialog: async () => {
            const selected = await dialog.showSaveDialog(window, {title: '导出脱敏诊断（选择新文件）', defaultPath: `Nova-诊断-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, filters: [{name: '诊断文件', extensions: ['json']}], properties: ['showOverwriteConfirmation']});
            return selected.canceled ? null : selected.filePath ?? null;
        },
        contextSummary: () => {
            const binding = controller.binding;
            return {bindingPresent: !!binding?.current, bindingBackupName, libraryHealth: controller.maintenance.currentHealth(), recovery: {
                content: !!binding?.pending || !!binding?.vaultPending, workspace: !!binding?.workspacePending, template: !!binding?.templatePending, creation: !!binding?.creation,
                photo: !!binding?.photoPending, cover: !!binding?.coverPending, coverAction: !!binding?.coverActionPending,
                maintenance: !!binding?.maintenancePending, seed: !!binding?.seedPending, needsReselect: !!binding?.needsReselect
            }, errorCodes: [...serviceErrors, ...(bootstrapReason !== 'none' ? ['BINDING_INVALID'] : []), ...(initializationError ? [errorInfo(initializationError).code] : [])]};
        }
    });
    controller.services = {preferences, reminders, setup, productionServices: {readServiceSettings: () => serviceSettings.read(), saveServiceSettings: input => serviceSettings.update(input), revealServiceCredential: input => serviceSettings.reveal(input.service), checkServiceReadiness: () => serviceTools.checkReadiness()}, bootstrap: {readBootstrapRecovery, resetMachineBinding: input => bootstrap.resetMachineBinding(input)}};
    const collector=createPublicationCollector({controller:controller.production,worker,descriptorPath:serviceDescriptorPath,settings:serviceSettings,runOperation:operation=>runOperation(operation,'background'),ensureVideoFreshness:(id,targetAt)=>serviceTools.ensureTikHubVideoFreshness(id,targetAt)});
    publicationObserver=createPublicationObserver({
        worker:{call:(op,args)=>runOperation(()=>worker!.call(op,args),'background')},
        listBindings:()=>!quitting&&release.AUTH_MODE==='disabled'&&controller.binding?.current&&!controller.binding.needsReselect?[controller.binding.current]:[],
        isCollectionReady:()=>collector.isReady(),collectOnce:collector.collectOnce,
        onDue:()=>{if(!quitting&&!window.isDestroyed())window.webContents.send('nova:workspace-changed','progress');},
        onError:error=>{const code=errorInfo(error).code;if(!serviceErrors.includes(code))serviceErrors.push(code);}
    });
    preferences.onSaved = () => { if (!quitting) void reminders?.refresh(true); };
    resumeReminders = () => { if (!quitting) {void reminders?.refresh(true);void publicationObserver?.tick();} };
    powerMonitor.on('resume', resumeReminders);
    powerMonitor.on('unlock-screen', resumeReminders);
    window.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
    window.webContents.on('will-navigate', event => event.preventDefault());
    window.webContents.on('will-frame-navigate', event => {if(event.isMainFrame||controller.creation.resource(event.url)===null)event.preventDefault();});
    window.webContents.on('will-attach-webview', event => event.preventDefault());
    ipcMain.handle('nova:importLocalFiles', async (event, ...args) => {
        try {
            assertCaller(event, window?.webContents, []);
            if (args.length !== 1) throw Object.assign(new Error('文件导入参数无效。'), {code: 'INVALID_FILES'});
            if (initializationError) throw initializationError;
            return {ok: true, value: await runOperation(() => controller.importLocalFiles(args[0])).finally(syncLibraryWatcher)};
        } catch (error) { return {ok: false, error: errorInfo(error)}; }
    });
    for (const method of CHANNELS) ipcMain.handle(`nova:${method}`, async (event, ...args) => {
        try {
            assertCaller(event, window?.webContents, args, method);
            if (initializationError && !['readBootstrapRecovery', 'resetMachineBinding', 'readPreferences', 'savePreferences', 'readServiceSettings', 'saveServiceSettings', 'revealServiceCredential', 'checkServiceReadiness', 'readReminderStatus', 'testReminder', 'readSetup', 'openSetupTarget', 'copyPluginMarketLocation', 'exportDiagnostics'].includes(method)) throw initializationError;
            return {
                ok: true,
                value: await runOperation(() => (controller[method] as (input?: DesktopInputs[DesktopMethod]) => Promise<unknown>).call(controller, args[0] as DesktopInputs[DesktopMethod])).finally(() => { syncLibraryWatcher(); if (!quitting && ['openLibrary', 'openUpgradedLibrary', 'createLibrary', 'createContent', 'updateContent', 'trashContent', 'restoreContent', 'mutateWorkspace', 'recoverWorkspaceMutation', 'retryWorkspaceMutation'].includes(method)) void reminders?.refresh(true); })
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
    syncLibraryWatcher();
    reminders.start();
    if(options.publicationObserver!==false)publicationObserver.start();
    await ready?.({window, controller, worker, release, tray});
    await confirmInstalledApplication(app).catch(() => {});
}
