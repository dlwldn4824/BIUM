const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("digitalDiet", {
  scanLocal: (options) => ipcRenderer.invoke("scan-local", options),
  scanCloud: () => ipcRenderer.invoke("scan-cloud"),
  getConnections: () => ipcRenderer.invoke("get-connections"),
  saveConfig: (partial) => ipcRenderer.invoke("save-config", partial),
  connectGoogle: () => ipcRenderer.invoke("connect-google"),
  disconnectGoogle: () => ipcRenderer.invoke("disconnect-google"),
  connectMicrosoft: () => ipcRenderer.invoke("connect-microsoft"),
  disconnectMicrosoft: () => ipcRenderer.invoke("disconnect-microsoft"),
  deleteFiles: (files) => ipcRenderer.invoke("delete-files", files),
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
  hidePanel: () => ipcRenderer.invoke("hide-panel"),
  quitApp: () => ipcRenderer.invoke("quit-app"),
  getAppInfo: () => ipcRenderer.invoke("get-app-info"),
});
