const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tribe', {
  // Status & environment
  getStatus: () => ipcRenderer.invoke('get-status'),
  checkServiceHealth: () => ipcRenderer.invoke('check-service-health'),

  // Project directory management
  setProjectDir: (dir) => ipcRenderer.invoke('set-project-dir', dir),
  getSavedProjectDir: () => ipcRenderer.invoke('get-saved-project-dir'),
  validateProjectDir: (dir) => ipcRenderer.invoke('validate-project-dir', dir),

  // Docker lifecycle
  startServices: () => ipcRenderer.invoke('start-services'),
  stopServices: () => ipcRenderer.invoke('stop-services'),
  restartServices: () => ipcRenderer.invoke('restart-services'),
  getServiceLogs: (service) => ipcRenderer.invoke('get-service-logs', service),

  // Navigation & system
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  openProjectDir: () => ipcRenderer.invoke('open-project-dir'),
  browseProjectDir: () => ipcRenderer.invoke('browse-project-dir'),
  installDocker: () => ipcRenderer.invoke('install-docker'),
  forceQuit: () => ipcRenderer.invoke('force-quit'),
  confirmQuitResponse: (shouldQuit) => ipcRenderer.invoke('confirm-quit-response', shouldQuit),

  // Events from main → renderer
  onLog: (cb) => {
    const handler = (_, msg) => cb(msg);
    ipcRenderer.on('log', handler);
    return () => ipcRenderer.removeListener('log', handler);
  },
  onConfirmQuit: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('confirm-quit', handler);
    return () => ipcRenderer.removeListener('confirm-quit', handler);
  },
});
