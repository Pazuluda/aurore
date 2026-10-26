// Pont entre le lecteur et Windows : seulement ce dont aurore a besoin, rien d'autre.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("auroreNative", {
  platform: "windows",
  getFolders: () => ipcRenderer.invoke("aurore:folders"),
  pickFolder: () => ipcRenderer.invoke("aurore:pick-folder"),
  removeFolder: (dir) => ipcRenderer.invoke("aurore:remove-folder", String(dir)),
  scan: () => ipcRenderer.invoke("aurore:scan"),
  read: (abs, start, end) => ipcRenderer.invoke("aurore:read", String(abs), Number(start), Number(end)),
  onOpenFiles: (cb) => {
    ipcRenderer.on("aurore:open-files", (_e, list) => cb(list));
    ipcRenderer.send("aurore:ready");
  },
});
