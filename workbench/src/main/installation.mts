import type {App, Dialog, MessageBoxReturnValue} from 'electron';

export async function offerApplicationInstall(
    app: Pick<App, 'isPackaged' | 'isInApplicationsFolder' | 'moveToApplicationsFolder'>,
    dialog: Pick<Dialog, 'showMessageBox' | 'showMessageBoxSync'>,
    platform: NodeJS.Platform = process.platform
): Promise<'continue' | 'relaunching'> {
    if (platform !== 'darwin' || !app.isPackaged || app.isInApplicationsFolder()) return 'continue';
    let choice: MessageBoxReturnValue;
    try { choice = await dialog.showMessageBox({
        type: 'question',
        message: '把自媒体工作台放进「应用程序」文件夹？',
        detail: '安装后会重新打开工作台，以后可以从「应用程序」中打开。',
        buttons: ['放进应用程序', '暂时跳过'],
        defaultId: 0,
        cancelId: 1
    }); } catch { return 'continue'; }
    if (choice.response !== 0) return 'continue';
    let conflictDeclined = false;
    try {
        const moved = app.moveToApplicationsFolder({
            conflictHandler(conflict) {
                if (conflict === 'existsAndRunning') {
                    conflictDeclined = true;
                    dialog.showMessageBoxSync({
                        type: 'info',
                        message: '「应用程序」中的自媒体工作台正在运行',
                        detail: '请先退出原来的工作台，再重新打开当前安装包进行安装。当前工作台可以继续使用。',
                        buttons: ['知道了']
                    });
                    return false;
                }
                const replace = dialog.showMessageBoxSync({
                    type: 'question',
                    message: '替换「应用程序」中的自媒体工作台？',
                    detail: '原来的应用会移到废纸篓，再安装当前版本。',
                    buttons: ['替换应用', '取消'],
                    defaultId: 1,
                    cancelId: 1
                }) === 0;
                conflictDeclined = !replace;
                return replace;
            }
        });
        if (moved) return 'relaunching';
    } catch {
        // A failed native move leaves the current app available for use.
    }
    if (!conflictDeclined) {
        await dialog.showMessageBox({
            type: 'info',
            message: '暂未放进「应用程序」',
            detail: '可以继续使用当前工作台，也可以在访达中把「自媒体工作台」拖进「应用程序」文件夹，再从那里打开。',
            buttons: ['继续使用']
        }).catch(() => {});
    }
    return 'continue';
}
