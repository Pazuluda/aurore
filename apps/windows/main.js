// aurore pour Windows : une fenêtre sans navigateur autour du lecteur, et l'accès à tes dossiers de musique.
// aurore a son propre dossier (Musique\aurore) : tout ce qui y est déposé apparaît dans l'app, en direct.
const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require("electron");
const path = require("path");
const fs = require("fs");
const fsp = fs.promises;

const AUDIO = /\.(mp3|flac|m4a|m4b|mp4|aac|ogg|oga|opus|wav|wave|webm|weba|aif|aiff)$/i;
const IMAGE = /\.(jpe?g|png|webp|gif)$/i;
const SKIP = /^(\$recycle\.bin|system volume information|node_modules|\..*)$/i;
const CONFIG = () => path.join(app.getPath("userData"), "aurore.json");

let win = null;
let config = { folders: [], window: null };
let library = ""; // Musique\aurore
const opened = new Set(); // fichiers ouverts en dehors des dossiers (glissés sur l'icône)
let pendingFiles = [];
let rendererReady = false;

/* mises à jour : vérifiées au démarrage puis toutes les 6 h, téléchargées en arrière-plan,
   installées quand tu cliques sur le logo (ou à la fermeture d'aurore) */
let updater = null;
let updateState = { state: "idle" };
function sendUpdate(s) { updateState = s; if (win && rendererReady) win.webContents.send("aurore:update", updateState); }
function setupUpdater() {
  if (!app.isPackaged) return;
  try { ({ autoUpdater: updater } = require("electron-updater")); } catch { updater = null; return; }
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.on("checking-for-update", () => { if (updateState.state !== "ready") sendUpdate({ state: "checking" }); });
  updater.on("update-available", (i) => sendUpdate({ state: "downloading", version: i.version, percent: 0 }));
  updater.on("update-not-available", () => sendUpdate({ state: "uptodate" }));
  updater.on("download-progress", (p) => sendUpdate({ state: "downloading", version: updateState.version, percent: Math.round(p.percent || 0) }));
  updater.on("update-downloaded", (i) => sendUpdate({ state: "ready", version: i.version }));
  updater.on("error", (e) => sendUpdate({ state: "error", message: String((e && e.message) || e).slice(0, 160) }));
  const check = () => { if (updateState.state !== "ready" && updateState.state !== "downloading") updater.checkForUpdates().catch(() => {}); };
  setTimeout(check, 4000);
  setInterval(check, 6 * 3600 * 1000);
}

function loadConfig() {
  try { config = { ...config, ...JSON.parse(fs.readFileSync(CONFIG(), "utf8")) }; } catch { /* premier lancement */ }
  library = path.join(app.getPath("music"), "aurore");
  try { fs.mkdirSync(library, { recursive: true }); } catch { /* disque protégé */ }
  config.folders = (config.folders || []).filter((d) => { try { return fs.statSync(d).isDirectory(); } catch { return false; } });
  if (!config.folders.some((d) => norm(d) === norm(library))) config.folders.unshift(library);
  saveConfig();
}
function saveConfig() {
  try { fs.mkdirSync(path.dirname(CONFIG()), { recursive: true }); fs.writeFileSync(CONFIG(), JSON.stringify(config, null, 2)); } catch { /* disque plein ou protégé */ }
}
const norm = (p) => path.resolve(p).toLowerCase();
const inside = (p, root) => { const r = norm(root); p = norm(p); return p === r || p.startsWith(r.endsWith(path.sep) ? r : r + path.sep); };
function allowed(abs) {
  if (opened.has(norm(abs))) return true;
  return config.folders.some((d) => inside(abs, d));
}

async function walk(root, dir, out, depth) {
  if (depth > 14 || out.length > 60000) return;
  let entries;
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (SKIP.test(e.name)) continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) await walk(root, abs, out, depth + 1);
    else if (e.isFile() && (AUDIO.test(e.name) || IMAGE.test(e.name))) {
      try {
        const st = await fsp.stat(abs);
        const rel = path.basename(root) + "/" + path.relative(root, abs).split(path.sep).join("/");
        out.push({ abs, rel, name: e.name, size: st.size, mtime: st.mtimeMs });
      } catch { /* fichier inaccessible */ }
    }
  }
}

/* surveille les dossiers : un fichier ajouté ou supprimé → l'app relit (une fois que ça s'est calmé) */
let watchers = []; let changeTimer = null;
function watchFolders() {
  for (const w of watchers) try { w.close(); } catch { /* déjà fermé */ }
  watchers = [];
  for (const d of config.folders) {
    try {
      watchers.push(fs.watch(d, { recursive: true }, (_ev, name) => {
        if (name && !AUDIO.test(name) && !IMAGE.test(name) && path.extname(name)) return;
        clearTimeout(changeTimer);
        changeTimer = setTimeout(() => { if (win && rendererReady) win.webContents.send("aurore:changed"); }, 1500);
      }));
    } catch { /* dossier réseau ou supprimé */ }
  }
}

/* copie dans Musique\aurore, sans écraser : « titre (2).mp3 » si un autre fichier porte déjà ce nom */
async function freeName(dir, name) {
  const ext = path.extname(name), base = path.basename(name, ext);
  for (let i = 1; i < 1000; i++) {
    const cand = path.join(dir, i === 1 ? name : `${base} (${i})${ext}`);
    try { await fsp.access(cand); } catch { return cand; }
  }
  return path.join(dir, `${base} ${Date.now()}${ext}`);
}
async function copyFile(src, dir) {
  const st = await fsp.stat(src);
  const same = path.join(dir, path.basename(src));
  try { const t = await fsp.stat(same); if (t.size === st.size) return false; } catch { /* pas encore là */ }
  await fsp.mkdir(dir, { recursive: true });
  await fsp.copyFile(src, await freeName(dir, path.basename(src)));
  return true;
}
async function copyTree(src, dest) {
  let n = 0;
  for (const e of await fsp.readdir(src, { withFileTypes: true })) {
    if (SKIP.test(e.name)) continue;
    const abs = path.join(src, e.name);
    if (e.isDirectory()) n += await copyTree(abs, path.join(dest, e.name));
    else if (e.isFile() && (AUDIO.test(e.name) || IMAGE.test(e.name))) { if (await copyFile(abs, dest)) n++; }
  }
  return n;
}
async function describe(p) {
  try {
    const st = await fsp.stat(p);
    if (st.isFile()) return { path: p, name: path.basename(p), kind: AUDIO.test(p) ? "audio" : IMAGE.test(p) ? "image" : "other", count: AUDIO.test(p) ? 1 : 0, bytes: st.size };
    if (st.isDirectory()) { const out = []; await walk(p, p, out, 0); const audio = out.filter((o) => AUDIO.test(o.name)); return { path: p, name: path.basename(p), kind: "dir", count: audio.length, bytes: audio.reduce((s, o) => s + o.size, 0), inLibrary: inside(p, library) }; }
  } catch { /* introuvable */ }
  return { path: p, name: path.basename(p), kind: "other", count: 0, bytes: 0 };
}

function filesFromArgs(argv) {
  return argv.slice(1).filter((a) => !a.startsWith("-") && AUDIO.test(a)).map((a) => path.resolve(a)).filter((a) => { try { return fs.statSync(a).isFile(); } catch { return false; } })
    .map((abs) => { const st = fs.statSync(abs); opened.add(norm(abs)); return { abs, rel: path.basename(abs), name: path.basename(abs), size: st.size, mtime: st.mtimeMs }; });
}
function sendFiles(list) {
  if (!list.length) return;
  if (rendererReady && win) win.webContents.send("aurore:open-files", list); else pendingFiles.push(...list);
}

ipcMain.handle("aurore:folders", () => config.folders);
ipcMain.handle("aurore:library", () => library);
ipcMain.handle("aurore:pick-folder", async () => {
  const r = await dialog.showOpenDialog(win, { title: "Choisis un dossier de musique", buttonLabel: "Choisir ce dossier", properties: ["openDirectory"] });
  if (r.canceled || !r.filePaths[0]) return null;
  const dir = path.resolve(r.filePaths[0]);
  if (!config.folders.some((d) => inside(dir, d))) { config.folders.push(dir); saveConfig(); watchFolders(); }
  return dir;
});
ipcMain.handle("aurore:remove-folder", (_e, dir) => {
  if (norm(String(dir)) === norm(library)) return config.folders; // le dossier aurore reste
  config.folders = config.folders.filter((d) => norm(d) !== norm(String(dir))); saveConfig(); watchFolders(); return config.folders;
});
ipcMain.handle("aurore:open-path", (_e, dir) => {
  dir = String(dir);
  if (config.folders.some((d) => norm(d) === norm(dir))) return shell.openPath(dir);
  return "refusé";
});
ipcMain.handle("aurore:describe", async (_e, paths) => Promise.all((paths || []).slice(0, 500).map((p) => describe(String(p)))));
ipcMain.handle("aurore:import", async (_e, paths, mode) => {
  let copied = 0, linked = 0;
  for (const p of (paths || []).slice(0, 500).map(String)) {
    let st; try { st = await fsp.stat(p); } catch { continue; }
    if (config.folders.some((d) => inside(p, d))) continue; // déjà dans un dossier suivi
    if (st.isFile()) { if (AUDIO.test(p) && (await copyFile(p, library))) copied++; }
    else if (st.isDirectory()) {
      if (mode === "link") { config.folders.push(path.resolve(p)); linked++; }
      else copied += await copyTree(p, path.join(library, path.basename(p))); // même nom : on complète le dossier existant
    }
  }
  if (linked) { saveConfig(); watchFolders(); }
  return { copied, linked };
});
ipcMain.handle("aurore:scan", async () => {
  const out = [];
  for (const d of config.folders) await walk(d, d, out, 0);
  return out;
});
ipcMain.handle("aurore:read", async (_e, abs, start, end) => {
  abs = String(abs);
  if (!allowed(abs)) throw new Error("Fichier hors de tes dossiers de musique");
  const fh = await fsp.open(abs, "r");
  try {
    const st = await fh.stat();
    const s = Math.max(0, Math.min(Number(start) || 0, st.size));
    const e = Math.max(s, Math.min(Number.isFinite(end) ? end : st.size, st.size));
    const buf = Buffer.alloc(e - s);
    let off = 0;
    while (off < buf.length) { const { bytesRead } = await fh.read(buf, off, buf.length - off, s + off); if (!bytesRead) break; off += bytesRead; }
    return new Uint8Array(buf.buffer, buf.byteOffset, off);
  } finally { await fh.close(); }
});
ipcMain.on("aurore:ready", () => { rendererReady = true; const list = pendingFiles; pendingFiles = []; sendFiles(list); });
ipcMain.handle("aurore:update-state", () => ({ ...updateState, current: app.getVersion(), available: !!updater }));
ipcMain.handle("aurore:update-check", async () => {
  if (!updater) return { state: "unavailable" };
  if (updateState.state === "ready" || updateState.state === "downloading") return updateState;
  try { await updater.checkForUpdates(); } catch (e) { sendUpdate({ state: "error", message: String((e && e.message) || e).slice(0, 160) }); }
  return updateState;
});
ipcMain.handle("aurore:update-install", () => {
  if (!updater || updateState.state !== "ready") return false;
  setImmediate(() => updater.quitAndInstall(true, true));
  return true;
});

function createWindow() {
  const w = config.window || {};
  win = new BrowserWindow({
    width: w.width || 1360, height: w.height || 860, x: w.x, y: w.y,
    minWidth: 400, minHeight: 600,
    backgroundColor: "#07070d", title: "aurore", show: false,
    icon: path.join(__dirname, "icon.png"),
    titleBarStyle: "hidden",
    titleBarOverlay: { color: "#07070d", symbolColor: "#b4b1d2", height: 36 },
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      backgroundThrottling: false, autoplayPolicy: "no-user-gesture-required", spellcheck: false,
    },
  });
  if (w.maximized) win.maximize();
  win.once("ready-to-show", () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => { if (!url.startsWith("file:")) { e.preventDefault(); if (/^https?:\/\//.test(url)) shell.openExternal(url); } });
  win.on("close", () => { config.window = { ...win.getNormalBounds(), maximized: win.isMaximized() }; saveConfig(); });
  win.on("closed", () => { win = null; rendererReady = false; });
  win.loadFile(path.join(__dirname, "app", "index.html"));
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", (_e, argv) => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
    sendFiles(filesFromArgs(argv));
  });
  app.whenReady().then(() => {
    app.setAppUserModelId("io.github.pazuluda.aurore");
    Menu.setApplicationMenu(null);
    loadConfig();
    watchFolders();
    setupUpdater();
    pendingFiles = filesFromArgs(process.argv);
    createWindow();
  });
  app.on("window-all-closed", () => app.quit());
}
