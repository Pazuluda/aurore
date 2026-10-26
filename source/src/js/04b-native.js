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
  toast("Lecture du dossier…");
  await nativeScan();
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

/* nouvelle version disponible sur GitHub */
function cmpVer(a, b) { const x = a.split(".").map(Number), y = b.split(".").map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; } return 0; }
async function checkUpdate() {
  if (!IS_NATIVE || !APP_VERSION || navigator.onLine === false) return;
  try {
    const r = await fetch("https://api.github.com/repos/Pazuluda/aurore/releases/latest", { headers: { Accept: "application/vnd.github+json" } });
    if (!r.ok) return;
    const j = await r.json(); const latest = String(j.tag_name || "").replace(/^v/, "");
    if (latest && /^\d+(\.\d+)*$/.test(latest) && cmpVer(latest, APP_VERSION) > 0) { UI.update = { version: latest, url: j.html_url || RELEASES_URL }; UI.rerender(); }
  } catch { /* hors ligne */ }
}
