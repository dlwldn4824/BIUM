const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("biumPet", {
  getAppearance: () => ipcRenderer.invoke("pet:getAppearance"),
  onAppearance: (cb) => {
    const handler = (_e, petId) => cb(petId);
    ipcRenderer.on("pet:appearance", handler);
    return () => ipcRenderer.removeListener("pet:appearance", handler);
  },
  onView: (cb) => {
    const handler = (_e, view) => cb(view);
    ipcRenderer.on("pet:view", handler);
    return () => ipcRenderer.removeListener("pet:view", handler);
  },
  ready: () => ipcRenderer.send("pet:ready"),
  clicked: () => ipcRenderer.send("pet:clicked"),
  dragBegin: (x, y) => ipcRenderer.send("pet:drag-begin", { x, y }),
  dragMove: (x, y) => ipcRenderer.send("pet:drag-move", { x, y }),
  dragEnd: () => ipcRenderer.send("pet:drag-end"),
});
