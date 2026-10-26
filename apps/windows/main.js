// aurore pour Windows : une fenêtre sans navigateur autour du lecteur, et l'accès à tes dossiers de musique.
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
const opened = new Set(); // fichiers ouverts en dehors des dossiers (glissés sur l'icône)
let pendingFiles = [];
let rendererReady = false;

function loadConfig() {
  try { config = { ...config, ...JSON.parse(fs.readFileSync(CONFIG(), "utf8")) }; } catch { /* premier lancement */ }
  config.folders = (config.folders || []).filter((d) => { try { return fs.statSync(d).isDirectory(); } catch { return false; } });
}
function saveConfig() {
  try { fs.mkdirSync(path.dirname(CONFIG()), { recursive: true }); fs.writeFileSync(CONFIG(), JSON.stringify(config, null, 2)); } catch { /* disque plein ou protégé */ }
}
const norm = (p) => path.resolve(p).toLowerCase();
function allowed(abs) {
  const p = norm(abs);
  if (opened.has(p)) return true;
  return config.folders.some((d) => { const r = norm(d); return p === r || p.startsWith(r.endsWith(path.sep) ? r : r + path.sep); });
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

function filesFromArgs(argv) {
  return argv.slice(1).filter((a) => !a.startsWith("-") && AUDIO.test(a)).map((a) => path.resolve(a)).filter((a) => { try { return fs.statSync(a).isFile(); } catch { return false; } })
    .map((abs) => { const st = fs.statSync(abs); opened.add(norm(abs)); return { abs, rel: path.basename(abs), name: path.basename(abs), size: st.size, mtime: st.mtimeMs }; });
}
function sendFiles(list) {
  if (!list.length) return;
  if (rendererReady && win) win.webContents.send("aurore:open-files", list); else pendingFiles.push(...list);
}

ipcMain.handle("aurore:folders", () => config.folders);
ipcMain.handle("aurore:pick-folder", async () => {
  const r = await dialog.showOpenDialog(win, { title: "Choisis ton dossier de musique", buttonLabel: "Choisir ce dossier", properties: ["openDirectory"] });
  if (r.canceled || !r.filePaths[0]) return null;
  const dir = path.resolve(r.filePaths[0]);
  if (!config.folders.some((d) => norm(d) === norm(dir))) { config.folders.push(dir); saveConfig(); }
  return dir;
});
ipcMain.handle("aurore:remove-folder", (_e, dir) => {
  config.folders = config.folders.filter((d) => norm(d) !== norm(String(dir))); saveConfig(); return config.folders;
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
    pendingFiles = filesFromArgs(process.argv);
    createWindow();
  });
  app.on("window-all-closed", () => app.quit());
}
