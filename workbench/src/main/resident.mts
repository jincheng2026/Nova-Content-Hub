import type {App, BrowserWindow} from 'electron';

export function keepResident(app: App, window: BrowserWindow, hasTray: () => boolean, confirmClose: () => number) {
    let quitting = false;
    let saving = false;
    const show = () => {
        if (window.isDestroyed()) return;
        if (window.isMinimized()) window.restore();
        window.show();
        window.focus();
    };
    app.on('before-quit', event => {
        if (window.isDestroyed()) return;
        // Retry app.quit only after the guarded window has actually closed.
        event.preventDefault();
        show();
        if (saving) return;
        quitting = true;
        window.close();
    });
    window.on('close', event => {
        if (saving || (!quitting && hasTray())) {
            event.preventDefault();
            if (!saving) window.hide();
        }
    });
    window.webContents.on('will-prevent-unload', event => {
        const quitAfterSave = quitting;
        quitting = false;
        const choice = confirmClose();
        if (choice === 1) {
            quitting = quitAfterSave;
            event.preventDefault();
        } else if (choice === 0 && !saving) {
            saving = true;
            void window.webContents.executeJavaScript("new Promise(resolve => window.dispatchEvent(new CustomEvent('nova-save-close', {detail: resolve})))")
                .then(saved => {
                    saving = false;
                    if (window.isDestroyed()) return;
                    if (saved !== true) { show(); return; }
                    if (quitAfterSave) app.quit(); else window.close();
                }, () => { saving = false; show(); });
        } else show();
    });
    return {show};
}
