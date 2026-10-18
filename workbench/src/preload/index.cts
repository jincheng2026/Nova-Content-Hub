import type {ContentHub} from '../shared/contracts.ts';

const {contextBridge, ipcRenderer} = require('electron') as typeof import('electron');
contextBridge.exposeInMainWorld('contentHub', Object.freeze({
    status: () => ipcRenderer.invoke('nova:status'),
    chooseBackup: () => ipcRenderer.invoke('nova:chooseBackup'),
    chooseDestination: () => ipcRenderer.invoke('nova:chooseDestination'),
    importBackup: () => ipcRenderer.invoke('nova:importBackup'),
    resumeImport: () => ipcRenderer.invoke('nova:resumeImport'),
    listContents: input => ipcRenderer.invoke('nova:listContents', input),
    createLibrary: () => ipcRenderer.invoke('nova:createLibrary'),
    openLibrary: () => ipcRenderer.invoke('nova:openLibrary'),
    readContent: input => ipcRenderer.invoke('nova:readContent', input),
    createContent: input => ipcRenderer.invoke('nova:createContent', input),
    updateContent: input => ipcRenderer.invoke('nova:updateContent', input),
    trashContent: input => ipcRenderer.invoke('nova:trashContent', input),
    restoreContent: input => ipcRenderer.invoke('nova:restoreContent', input),
    queryPendingMutation: () => ipcRenderer.invoke('nova:queryPendingMutation'),
    retryPendingMutation: () => ipcRenderer.invoke('nova:retryPendingMutation'),
    resolvePendingMutation: input => ipcRenderer.invoke('nova:resolvePendingMutation', input),
} satisfies ContentHub));
