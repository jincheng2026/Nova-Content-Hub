import { errorInfo } from '../shared/contracts.ts';
import type { Dialogs, Release, DesktopInputs, DesktopMethod } from '../shared/contracts.ts';
import { app, BrowserWindow, dialog, ipcMain, protocol, session, utilityProcess } from 'electron';
import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAGE, CHANNELS, CSP, assertCaller, staticResource, validateResources, validateRelease } from './boundary.mts';
import { BindingStore } from './bindings.mts';
import { DesktopController } from './controller.mts';
import { WorkerClient } from './worker-client.mts';

const here = path.dirname(fileURLToPath(import.meta.url));
interface StartOptions { show?: boolean; userData?: string; dialogs?: Dialogs; onConsoleMessage?: (message: string) => void; ready?: (context: { window: BrowserWindow; controller: DesktopController; worker: WorkerClient; release: Release }) => Promise<void> }
protocol.registerSchemesAsPrivileged([{ scheme: 'nova-content', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
app.setName('Nova 内容库技术验证');
export async function startDesktop({ show = true, userData, dialogs, ready, onConsoleMessage }: StartOptions = {}) {
  if (userData) app.setPath('userData', userData);
  const resources = validateResources(JSON.parse(readFileSync(path.join(here, '../renderer-resources.json'), 'utf8')));
  const release = validateRelease(JSON.parse(readFileSync(path.join(here, '../release.json'), 'utf8')));
  if (!app.requestSingleInstanceLock()) { app.quit(); return; }
  let window: BrowserWindow; let worker: WorkerClient | undefined;
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.focus(); } });
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => worker?.stop());
  await app.whenReady();
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !staticResource(details.url, resources) }));
  protocol.handle('nova-content', async request => {
    const resource = staticResource(request.url, resources);
    if (request.method !== 'GET' || !resource) return new Response('Not found', { status: 404 });
    return new Response(await fs.readFile(path.join(here, '../renderer', resource[0])), { headers: { 'content-type': resource[1], 'content-security-policy': CSP, 'x-content-type-options': 'nosniff' } });
  });
  worker = new WorkerClient(() => utilityProcess.fork(path.join(here, 'worker.mjs'), [release.pairId], { serviceName: 'Nova 文件业务', stdio: 'ignore' }));
  const controller = new DesktopController({
    store: new BindingStore(path.join(app.getPath('userData'), 'machine-binding.json')), worker, authMode: release.AUTH_MODE, documents: app.getPath('documents'),
    dialogs: dialogs ?? {
      async library() { const selected = await dialog.showOpenDialog(window, { title: '打开内容库', properties: ['openDirectory'] }); return selected.canceled ? null : selected.filePaths[0]; },
      async backup() { const selected = await dialog.showOpenDialog(window, { title: '选择旧工作台备份', properties: ['openFile'], filters: [{ name: '工作台备份', extensions: ['json'] }] }); return selected.canceled ? null : selected.filePaths[0]; },
      async destination(defaultPath) { const selected = await dialog.showSaveDialog(window, { title: '选择新内容库的位置与名称', buttonLabel: '使用此位置', defaultPath, properties: ['createDirectory', 'showOverwriteConfirmation'] }); return selected.canceled ? null : selected.filePath; },
    },
  });
  let initializationError: unknown;
  try { await controller.initialize(); } catch (error) { initializationError = error; }
  window = new BrowserWindow({ width: 960, height: 760, minWidth: 600, minHeight: 520, show: false, title: 'Nova 内容库 · 技术验证', webPreferences: { preload: path.join(here, '../preload/index.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, webviewTag: false, devTools: false } });
  window.webContents.on('will-prevent-unload', event => {
    const choice = dialog.showMessageBoxSync(window, { type: 'question', title: '草稿尚未保存', message: '是否保存当前草稿后关闭？', buttons: ['保存后关闭', '明确放弃并关闭', '留在当前内容'], defaultId: 2, cancelId: 2 });
    if (choice === 1) event.preventDefault();
    if (choice === 0) void window.webContents.executeJavaScript("window.dispatchEvent(new Event('nova-save-close'))");
  });
  window.removeMenu();
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.on('will-frame-navigate', event => event.preventDefault());
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  for (const method of CHANNELS) ipcMain.handle(`nova:${method}`, async (event, ...args) => {
    try {
      assertCaller(event, window?.webContents, args, method);
      if (initializationError) throw initializationError;
      return { ok: true, value: await (controller[method] as (input?: DesktopInputs[DesktopMethod]) => Promise<unknown>).call(controller, args[0] as DesktopInputs[DesktopMethod]) };
    } catch (error) {
      return { ok: false, error: { code: errorInfo(error).code, message: errorInfo(error).code === 'FORBIDDEN' ? '该调用已被拒绝。' : errorInfo(error).message } };
    }
  });
  if (show) window.once('ready-to-show', () => window.show());
  if (onConsoleMessage) window.webContents.on('console-message', (_event, _level, message) => onConsoleMessage(message));
  await window.loadURL(PAGE);
  await ready?.({ window, controller, worker, release });
}
