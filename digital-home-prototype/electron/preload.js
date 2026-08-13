const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("biumDesktop", {
  ping: () => ipcRenderer.invoke("bium:ping"),
  isDesktop: true,
  getDisplayMode: () => ipcRenderer.invoke("bium:getDisplayMode"),
  setDisplayMode: (mode) => ipcRenderer.invoke("bium:setDisplayMode", mode),
  onDisplayMode: (cb) => {
    const handler = (_e, mode) => cb(mode);
    ipcRenderer.on("bium:display-mode", handler);
    return () => ipcRenderer.removeListener("bium:display-mode", handler);
  },
  scanLocal: (options) => ipcRenderer.invoke("bium:scanLocal", options || {}),
  petScan: (options) => ipcRenderer.invoke("bium:petScan", options || {}),
  petVisible: (on) => ipcRenderer.invoke("bium:petVisible", on),
  getPetLocation: () => ipcRenderer.invoke("bium:getPetLocation"),
  summonPet: () => ipcRenderer.invoke("bium:summonPet"),
  scanStatus: () => ipcRenderer.invoke("bium:scanStatus"),
  getConnections: () => ipcRenderer.invoke("bium:getConnections"),
  connectGoogle: () => ipcRenderer.invoke("bium:connectGoogle"),
  connectSpace: (spaceId) => ipcRenderer.invoke("bium:connectSpace", spaceId),
  disconnectGoogle: () => ipcRenderer.invoke("bium:disconnectGoogle"),
  disconnectSpace: (spaceId) =>
    ipcRenderer.invoke("bium:disconnectSpace", spaceId),
  getConfig: () => ipcRenderer.invoke("bium:getConfig"),
  setConfig: (partial) => ipcRenderer.invoke("bium:setConfig", partial || {}),
  setTrayBadge: (n) => ipcRenderer.invoke("bium:setTrayBadge", n),
  onScanProgress: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on("bium:scan-progress", handler);
    return () => ipcRenderer.removeListener("bium:scan-progress", handler);
  },
  onPetFound: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on("bium:pet-found", handler);
    return () => ipcRenderer.removeListener("bium:pet-found", handler);
  },
  onPetLocation: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on("bium:pet-location", handler);
    return () => ipcRenderer.removeListener("bium:pet-location", handler);
  },
  onOpenFetchView: (cb) => {
    const handler = () => cb();
    ipcRenderer.on("bium:open-fetch-view", handler);
    return () => ipcRenderer.removeListener("bium:open-fetch-view", handler);
  },
  onConnections: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on("bium:connections", handler);
    return () => ipcRenderer.removeListener("bium:connections", handler);
  },
  /** OpenPet-style agent events (SCAN_STARTED, DUPLICATE_FOUND, …) */
  onAgentEvent: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on("bium:agent-event", handler);
    return () => ipcRenderer.removeListener("bium:agent-event", handler);
  },
  onConfig: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on("bium:config", handler);
    return () => ipcRenderer.removeListener("bium:config", handler);
  },
});
