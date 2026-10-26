/* ===================== apps natives : Windows (Electron) et Android (Capacitor) ===================== */
const NATIVE_WIN = window.auroreNative && window.auroreNative.platform === "windows" ? window.auroreNative : null;
const CAP = window.Capacitor && typeof window.Capacitor.nativePromise === "function" && typeof window.Capacitor.getPlatform === "function" && window.Capacitor.getPlatform() === "android" ? window.Capacitor : null;
const IS_NATIVE = !!(NATIVE_WIN || CAP);
const APP_VERSION = (document.querySelector('meta[name="aurore-version"]') || {}).content || "";
const RELEASES_URL = "https://github.com/Pazuluda/aurore/releases/latest";
const HIST = !!CAP || isStandalone();
if (NATIVE_WIN) document.documentElement.classList.add("native-win");
if (CAP) document.documentElement.classList.add("native-android");

/* Fichier lu à la demande sur le disque (Windows) : se comporte comme un File pour l'analyse des tags. */
const MIME = { mp3: "audio/mpeg", flac: "audio/flac", m4a: "audio/mp4", m4b: "audio/mp4", mp4: "audio/mp4", aac: "audio/aac", ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg", wav: "audio/wav", wave: "audio/wav", webm: "audio/webm", weba: "audio/webm", aif: "audio/aiff", aiff: "audio/aiff", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };
class DiskFile {
  constructor(o) { this.abs = o.abs; this.name = o.name; this.size = o.size; this.lastModified = o.mtime || 0; this.type = MIME[extOf(o.name)] || ""; this.disk = true; }
  async read(s, e) { const u8 = await NATIVE_WIN.read(this.abs, s, e); return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength); }
  slice(s = 0, e = this.size) { const a = Math.max(0, s), b = Math.min(this.size, e); return { arrayBuffer: () => this.read(a, b) }; }
  arrayBuffer() { return this.read(0, this.size); }
  async blob() { return new Blob([await this.read(0, this.size)], { type: this.type }); }
}
const asBlob = async (f) => (f && f.disk ? f.blob() : f);

/* liens externes : navigateur du système */
function openExternal(url) {
  if (CAP) { location.href = url; return; }
  window.open(url, "_blank", "noopener");
}
document.addEventListener("click", (e) => {
  if (!IS_NATIVE) return;
  const a = e.target.closest && e.target.closest('a[href^="http"]'); if (!a) return;
  e.preventDefault(); e.stopPropagation(); openExternal(a.href);
}, true);

/* Windows : dossiers de musique retenus et relus à chaque lancement */
async function nativeScan({ quiet = false } = {}) {
  if (!NATIVE_WIN) return;
  if (L.importing || nativeScan.busy) { nativeScan.again = true; return; }
  nativeScan.busy = true;
  try { await nativeScanOnce(quiet); } finally { nativeScan.busy = false; }
  if (nativeScan.again) { nativeScan.again = false; nativeScan({ quiet: true }); }
}
async function nativeScanOnce(quiet) {
  let list = [];
  try { list = await NATIVE_WIN.scan(); } catch { return; }
  const seen = new Set(list.filter((o) => AUDIO_EXT.has(extOf(o.name))).map((o) => "t" + hash(o.rel + "|" + o.size)));
  const gone = [...L.tracks.keys()].filter((id) => !seen.has(id) && !L.tracks.get(id).demo);
  if (gone.length && list.length) { removeTracks(gone); UI.onLibraryChanged(); }
  if (list.length) await importEntries(list.map((o) => ({ file: new DiskFile(o), path: o.rel })), { quiet });
  else if (!quiet) toast("Aucun fichier audio dans ce dossier.");
}
async function nativePickFolder() {
  const dir = await NATIVE_WIN.pickFolder(); if (!dir) return;
  toast("aurore suit maintenant ce dossier.");
  await nativeScan();
}
/* Windows : dossier de musique d'aurore (Musique\aurore), créé au premier lancement */
let NATIVE_LIBRARY = "";
const libraryLabel = () => NATIVE_LIBRARY ? NATIVE_LIBRARY.split(/[\\/]/).slice(-2).map((x) => (x === "Music" ? "Musique" : x)).join(" › ") : "Musique › aurore";
async function openLibraryFolder() { if (NATIVE_LIBRARY) await NATIVE_WIN.openPath(NATIVE_LIBRARY); }
/* fichiers ou dossiers ajoutés depuis l'app (glissés ou choisis) : copiés dans le dossier aurore */
async function nativeAddPaths(paths) {
  paths = paths.filter(Boolean); if (!paths.length) return;
  const info = await NATIVE_WIN.describe(paths);
  const dirs = info.filter((x) => x.kind === "dir" && x.count && !x.inLibrary);
  const files = info.filter((x) => x.kind === "audio");
  if (!dirs.length && !files.length) { toast("Rien de lisible là-dedans : glisse des fichiers audio ou un dossier de musique."); return; }
  if (dirs.length) {
    const n = dirs.reduce((s, d) => s + d.count, 0) + files.length, bytes = dirs.reduce((s, d) => s + d.bytes, 0);
    const name = dirs.length === 1 ? `« ${dirs[0].name} »` : `${dirs.length} dossiers`;
    UI.pendingPaths = paths;
    openSheet(html`<div style="display:flex;justify-content:space-between;align-items:center;gap:12px"><h2>Ajouter ${name}</h2><button class="icon-btn" data-act="close-sheet" aria-label="Annuler">${icon("x")}</button></div>
<p class="sub" style="margin-top:8px">${plural(n, "titre", "titres")} · ${fmtBytes(bytes)}</p>
<div class="choice">
  <button class="choice-btn" data-act="paths-copy"><b>${icon("save", "sm")} Copier dans mon dossier aurore</b><span>La musique est rangée dans ${libraryLabel()}. Tu peux ensuite supprimer l'original. Prend ${fmtBytes(bytes)} de plus sur le disque.</span></button>
  <button class="choice-btn" data-act="paths-link"><b>${icon("folder", "sm")} Le laisser où il est</b><span>aurore suit ce dossier et voit tout ce que tu y ajoutes. Rien n'est copié.</span></button>
</div>`);
    return;
  }
  await nativeImportPaths(paths, "copy");
}
async function nativeImportPaths(paths, mode) {
  toast(mode === "link" ? "aurore suit ce dossier…" : "Copie dans ton dossier aurore…");
  const r = await NATIVE_WIN.importPaths(paths, mode);
  if (r.copied) toast(`${plural(r.copied, "titre copié", "titres copiés")} dans ${libraryLabel()}.`);
  await nativeScan({ quiet: true });
  if (!r.copied && !r.linked) toast("Déjà dans ta bibliothèque.");
}

/* Android : notification de lecture + commandes écran verrouillé (module MediaSession) */
const NativeMedia = CAP ? {
  bound: false, art: new Map(), lastPos: 0,
  call(method, opts) { return CAP.nativePromise("MediaSession", method, opts).catch(() => {}); },
  async dataUrl(key) {
    if (!key) return "";
    if (this.art.has(key)) return this.art.get(key);
    const a = L.art.get(key); if (!a || !a.big) return "";
    const url = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => res(""); r.readAsDataURL(a.big); });
    this.art.set(key, url); return url;
  },
  bind() {
    if (this.bound) return; this.bound = true;
    const on = (action, fn) => { try { CAP.nativeCallback("MediaSession", "setActionHandler", { action }, (data, err) => { if (!err) fn(data || {}); }); } catch { /* module absent */ } };
    on("play", () => Player.play()); on("pause", () => Player.pause()); on("stop", () => Player.pause());
    on("previoustrack", () => Q.prev()); on("nexttrack", () => Q.next());
    on("seekto", (d) => { if (d.seekTime != null) Player.seek(d.seekTime); });
    on("seekbackward", () => Player.seek(Player.currentTime - 10)); on("seekforward", () => Player.seek(Player.currentTime + 10));
  },
  async track(t) {
    this.bind(); if (!t) return this.call("setPlaybackState", { playbackState: "none" });
    const artwork = await this.dataUrl(t.artKey);
    this.call("setMetadata", { title: t.title, artist: t.artist, album: t.album || "", artwork: artwork ? [{ src: artwork, sizes: "640x640", type: "image/webp" }] : [] });
  },
  state() { this.call("setPlaybackState", { playbackState: Player.id ? (Player.playing ? "playing" : "paused") : "none" }); },
  position(d, t) { const now = performance.now(); if (now - this.lastPos < 1000) return; this.lastPos = now; this.call("setPositionState", { duration: d, playbackRate: 1, position: clamp(t, 0, d) }); },
} : null;

/* mises à jour : vérifiées au démarrage, et un petit logo en haut pour suivre et lancer l'installation */
function cmpVer(a, b) { const x = a.split(".").map(Number), y = b.split(".").map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; } return 0; }
const Updates = {
  st: { state: "idle" }, current: APP_VERSION, manual: false,
  async init() {
    if (NATIVE_WIN) { const el = $("#upd"); if (el) document.body.appendChild(el); } /* dans la barre de titre, au-dessus de la zone de déplacement */
    if (NATIVE_WIN && NATIVE_WIN.update) {
      NATIVE_WIN.update.on((s) => this.set(s));
      try { const s = await NATIVE_WIN.update.state(); if (s.current) this.current = s.current; this.set(s); } catch { /* ancienne version */ }
    } else if (CAP) setTimeout(() => this.check(false), 4000);
    this.render();
  },
  set(s) {
    const prev = this.st.state; this.st = s || { state: "idle" };
    if (this.manual && this.st.state === "uptodate") { toast(`aurore est à jour (version ${this.current}).`); this.manual = false; }
    if (this.manual && this.st.state === "error") { toast("Impossible de vérifier les mises à jour pour l'instant. Vérifie ta connexion."); this.manual = false; }
    if (this.st.state === "ready" && prev !== "ready") toast(NATIVE_WIN ? `La version ${this.st.version} est prête : clique sur « Mettre à jour » en haut de la fenêtre.` : `La version ${this.st.version} d'aurore est disponible : touche « Mettre à jour » en haut.`, { ms: 8000 });
    this.render();
  },
  async check(manual) {
    this.manual = !!manual;
    if (NATIVE_WIN && NATIVE_WIN.update) { if (manual && this.st.state !== "ready") this.set({ state: "checking" }); try { await NATIVE_WIN.update.check(); } catch { this.set({ state: "error" }); } return; }
    if (!CAP || !APP_VERSION) return;
    if (manual) this.set({ state: "checking" });
    try {
      const r = await fetch("https://api.github.com/repos/Pazuluda/aurore/releases/latest", { headers: { Accept: "application/vnd.github+json" } });
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json(); const latest = String(j.tag_name || "").replace(/^v/, "");
      const apk = (j.assets || []).find((a) => a.name === "aurore-android.apk");
      if (apk && /^\d+(\.\d+)*$/.test(latest) && cmpVer(latest, APP_VERSION) > 0) this.set({ state: "ready", version: latest, url: apk.browser_download_url });
      else this.set({ state: "uptodate" });
    } catch { this.set({ state: manual ? "error" : "idle" }); }
  },
  click() {
    const s = this.st.state;
    if (s === "ready") {
      if (NATIVE_WIN) { toast("Installation de la mise à jour : aurore va redémarrer."); NATIVE_WIN.update.install(); }
      else { toast("Téléchargement de la nouvelle version : ouvre-la quand c'est fini pour l'installer par-dessus."); openExternal(this.st.url || RELEASES_URL); }
      return;
    }
    if (s === "downloading") { toast(`Téléchargement de la version ${this.st.version || ""}… ${this.st.percent || 0} %`); return; }
    if (s !== "checking") this.check(true);
  },
  render() {
    const el = $("#upd"); if (!el) return;
    const s = this.st.state;
    const show = NATIVE_WIN ? true : CAP ? s === "ready" || s === "checking" : false;
    el.hidden = !show; if (!show) return;
    el.className = "upd " + s;
    const pct = clamp(this.st.percent || 0, 0, 100);
    const label = s === "ready" ? `Installer la version ${this.st.version}` : s === "downloading" ? `Téléchargement de la version ${this.st.version || ""} : ${pct} %` : s === "checking" ? "Recherche d'une mise à jour…" : s === "error" ? "Mise à jour impossible pour l'instant : clique pour réessayer" : `aurore ${this.current || ""} · rechercher une mise à jour`;
    el.title = label; el.setAttribute("aria-label", label);
    if (s === "ready") setHTML(el, html`${icon("save", "sm")}<span>Mettre à jour</span>`);
    else if (s === "downloading") setHTML(el, html`<svg class="ring" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15" class="ring-bg"/><circle cx="18" cy="18" r="15" class="ring-fg" style="stroke-dashoffset:${(94.25 * (1 - pct / 100)).toFixed(1)}"/></svg>${icon("save", "sm")}`);
    else setHTML(el, icon("refresh", "sm"));
  },
};
