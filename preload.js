const { contextBridge, ipcRenderer } = require('electron');

const electronBridge = {
  // Methods for Main -> Renderer
  onIngestStatus: (callback) => ipcRenderer.on('ingest-status', callback),
  onIngestProgress: (callback) => ipcRenderer.on('ingest-progress', callback),
  onDataUpdated: (callback) => ipcRenderer.on('data-updated', callback),
  onOpenSettings: (callback) => ipcRenderer.on('open-settings', callback),
  
  // Methods for Renderer -> Main
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  manualSync: () => ipcRenderer.invoke('manual-sync'),
  syncNow: () => ipcRenderer.invoke('manual-sync'), // Compatibility Alias
  syncYear: (year) => ipcRenderer.invoke('sync-year', year),
  syncMonth: (yearMonth) => ipcRenderer.invoke('sync-month', yearMonth),
  getConfig: () => ipcRenderer.invoke('get-config'),
  updatePath: (path) => ipcRenderer.invoke('update-path', path),
  readFileBase64: (filePath) => ipcRenderer.invoke('read-file-base64', filePath),
  saveManualEdit: (data) => ipcRenderer.invoke('save-manual-edit', data),
  isEnabled: true
};

contextBridge.exposeInMainWorld('electron', electronBridge);
