// Pont entre le lecteur et Windows : seulement ce dont aurore a besoin, rien d'autre.
const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("auroreNative", {
  platform: "windows",
  library: () => ipcRenderer.invoke("aurore:library"),
  getFolders: () => ipcRenderer.invoke("aurore:folders"),
  pickFolder: () => ipcRenderer.invoke("aurore:pick-folder"),
  removeFolder: (dir) => ipcRenderer.invoke("aurore:remove-folder", String(dir)),
  openPath: (dir) => ipcRenderer.invoke("aurore:open-path", String(dir)),
  pathFor: (file) => { try { return webUtils.getPathForFile(file) || ""; } catch { return ""; } },
  describe: (paths) => ipcRenderer.invoke("aurore:describe", Array.from(paths || [], String)),
  importPaths: (paths, mode) => ipcRenderer.invoke("aurore:import", Array.from(paths || [], String), mode === "link" ? "link" : "copy"),
  scan: () => ipcRenderer.invoke("aurore:scan"),
  read: (abs, start, end) => ipcRenderer.invoke("aurore:read", String(abs), Number(start), Number(end)),
  onChanged: (cb) => ipcRenderer.on("aurore:changed", () => cb()),
  update: {
    state: () => ipcRenderer.invoke("aurore:update-state"),
    check: () => ipcRenderer.invoke("aurore:update-check"),
    install: () => ipcRenderer.invoke("aurore:update-install"),
    on: (cb) => ipcRenderer.on("aurore:update", (_e, st) => cb(st)),
  },
  lan: {
    info: () => ipcRenderer.invoke("aurore:lan-info"),
    code: () => ipcRenderer.invoke("aurore:lan-code"),
    stop: () => ipcRenderer.invoke("aurore:lan-stop"),
    forget: (id) => ipcRenderer.invoke("aurore:lan-forget", String(id)),
    onEvent: (cb) => ipcRenderer.on("aurore:lan-event", (_e, ev) => cb(ev)),
    onAsk: (cb) => ipcRenderer.on("aurore:lan-ask", async (_e, q) => {
      let r; try { r = await cb(q.kind, q.payload); } catch (e) { r = { error: String((e && e.message) || e) }; }
      ipcRenderer.send("aurore:lan-reply", q.rid, r === undefined ? null : r);
    }),
  },
  onOpenFiles: (cb) => {
    ipcRenderer.on("aurore:open-files", (_e, list) => cb(list));
    ipcRenderer.send("aurore:ready");
  },
});
