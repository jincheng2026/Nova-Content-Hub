const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('contentHub', Object.freeze({
  status: () => ipcRenderer.invoke('nova:status'),
  chooseBackup: () => ipcRenderer.invoke('nova:chooseBackup'),
  chooseDestination: () => ipcRenderer.invoke('nova:chooseDestination'),
  importBackup: () => ipcRenderer.invoke('nova:importBackup'),
  resumeImport: () => ipcRenderer.invoke('nova:resumeImport'),
  listContents: () => ipcRenderer.invoke('nova:listContents'),
}));
