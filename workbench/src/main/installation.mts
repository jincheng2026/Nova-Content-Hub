import type {App, Dialog, MessageBoxReturnValue} from 'electron';
import fs from 'node:fs/promises';
import {confirmMacInstallation, installMacApplication, macApplicationSource, macApplicationTarget, readMacBundle, recoverMacInstallation} from './mac-installation.mts';

type InstallApp = Pick<App, 'isPackaged' | 'isInApplicationsFolder' | 'relaunch' | 'quit'>;
interface Installer {
    recover(): Promise<unknown>;
    exists(): Promise<boolean>;
    install(): Promise<{execPath: string}>;
}
async function macOptions() {
    const source = macApplicationSource(process.execPath), bundle = await readMacBundle(source);
    return {source, target: macApplicationTarget, bundleIdentifier: bundle.identifier, executable: bundle.executable};
}
const nativeInstaller: Installer = {
    async recover() { return recoverMacInstallation(await macOptions()); },
    async exists() { try { await fs.lstat(macApplicationTarget); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; } },
    async install() { return installMacApplication(await macOptions()); }
};

export async function confirmInstalledApplication(app: Pick<App, 'isPackaged' | 'isInApplicationsFolder'>) {
    if (process.platform !== 'darwin' || !app.isPackaged || !app.isInApplicationsFolder()) return;
    await confirmMacInstallation(await macOptions());
}

export async function offerApplicationInstall(
    app: InstallApp,
    dialog: Pick<Dialog, 'showMessageBox' | 'showMessageBoxSync'>,
    platform: NodeJS.Platform = process.platform,
    installer: Installer = nativeInstaller
): Promise<'continue' | 'relaunching'> {
    if (platform !== 'darwin' || !app.isPackaged || app.isInApplicationsFolder()) return 'continue';
    try { await installer.recover(); }
    catch (error) {
        await dialog.showMessageBox({type: 'warning', message: '安装恢复需要检查', detail: `${error instanceof Error ? error.message : '无法验证安装记录'}\n已保留原应用和安装恢复目录。`, buttons: ['继续使用当前工作台']}).catch(() => {});
        return 'continue';
    }
    let choice: MessageBoxReturnValue;
    try { choice = await dialog.showMessageBox({
        type: 'question',
        message: '把自媒体工作台放进「应用程序」文件夹？',
        detail: '完整复制并校验后再替换，原应用会保留在安装恢复目录。安装后会重新打开工作台。',
        buttons: ['放进应用程序', '暂时跳过'],
        defaultId: 0,
        cancelId: 1
    }); } catch { return 'continue'; }
    if (choice.response !== 0) return 'continue';
    try {
        if (await installer.exists() && dialog.showMessageBoxSync({
            type: 'question',
            message: '替换「应用程序」中的自媒体工作台？',
            detail: '新版本完整复制并校验后再替换，原应用会保留在安装恢复目录。请先退出原来的工作台。',
            buttons: ['替换应用', '取消'],
            defaultId: 1,
            cancelId: 1
        }) !== 0) return 'continue';
        const installed = await installer.install();
        // Do not forward DMG paths, development switches or renderer-controlled arguments.
        app.relaunch({execPath: installed.execPath, args: []});
        app.quit();
        return 'relaunching';
    } catch (error) {
        await dialog.showMessageBox({
            type: 'warning',
            message: '暂未重新打开「应用程序」中的工作台',
            detail: `${error instanceof Error ? error.message : '安装或重新打开失败'}\n可以继续使用当前工作台。原应用及恢复记录会保留；如果复制已完成，请从「应用程序」打开工作台。`,
            buttons: ['继续使用']
        }).catch(() => {});
        return 'continue';
    }
}
