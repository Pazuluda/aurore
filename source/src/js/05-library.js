/* ===================== bibliothèque ===================== */
const UNKNOWN_ARTIST = "Artiste inconnu";
const artistSortKey = (n) => n === UNKNOWN_ARTIST ? "\uffff" : sortKey(n);
const DEFAULT_PAL = { c1: "#a08cff", c2: "#3fe0c5", c3: "#ff7ab6", on: "#0b0a14" };
const L = {
  tracks: new Map(), files: new Map(), art: new Map(),
  albums: new Map(), artists: new Map(), genres: [],
  sorted: { tracks: [], albums: [], artists: [] },
  stats: {}, likes: new Set(), playlists: [], history: [], days: {}, saved: [],
  memorize: false, rootName: "", importing: null, memorizing: null, dirHandle: null,
  version: 0,
};

/* ---- couleurs d'une pochette ---- */
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn; s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60;
  }
  return [h, s, l];
}
function hsl(h, s, l) { return `hsl(${Math.round(((h % 360) + 360) % 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`; }
function hslToRgb(h, s, l) {
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}
function paletteFromPixels(data) {
  const bins = Array.from({ length: 24 }, () => ({ w: 0, h: 0, s: 0, l: 0, n: 0 }));
  let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    total++;
    if (s < .18 || l < .08 || l > .94) continue;
    const w = s * (1 - Math.abs(l - .5) * 1.5);
    if (w <= 0) continue;
    const b = bins[Math.floor(h / 15) % 24];
    b.w += w; b.n++;
    b.hx = (b.hx || 0) + Math.cos(h * Math.PI / 180) * w; b.hy = (b.hy || 0) + Math.sin(h * Math.PI / 180) * w;
    b.s += s * w; b.l += l * w;
  }
  const ranked = bins.filter((b) => b.n > 0).map((b) => ({ h: (Math.atan2(b.hy, b.hx) * 180 / Math.PI + 360) % 360, s: b.s / b.w, l: b.l / b.w, w: b.w }))
    .sort((a, b) => b.w - a.w);
  if (!ranked.length || ranked[0].w < total * .015) return null;
  const pick = [ranked[0]];
  for (const c of ranked) {
    if (pick.length >= 3) break;
    if (pick.every((p) => { const d = Math.abs(p.h - c.h) % 360; return Math.min(d, 360 - d) > 35; }) && c.w > ranked[0].w * .08) pick.push(c);
  }
  const base = pick[0];
  while (pick.length < 3) pick.push({ h: base.h + (pick.length === 1 ? 42 : -48), s: base.s, l: base.l });
  const tune = (c, lo, hi) => ({ h: c.h, s: clamp(Math.max(c.s, .5), 0, .95), l: clamp(c.l, lo, hi) });
  const c1 = tune(pick[0], .64, .74), c2 = tune(pick[1], .56, .68), c3 = tune(pick[2], .56, .7);
  const [r, g, b] = hslToRgb(c1.h, c1.s, c1.l);
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return { c1: hsl(c1.h, c1.s, c1.l), c2: hsl(c2.h, c2.s, c2.l), c3: hsl(c3.h, c3.s, c3.l), on: lum > .5 ? "#0b0a14" : "#ffffff" };
}
function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas"); c.width = w; c.height = h; return c;
}
function canvasToBlob(c, type, q) {
  if (c.convertToBlob) return c.convertToBlob({ type, quality: q });
  return new Promise((res) => c.toBlob(res, type, q));
}
async function makeArt(blob) {
  try {
    const bmp = await createImageBitmap(blob);
    const scaleTo = async (size) => {
      const s = Math.min(1, size / Math.max(bmp.width, bmp.height));
      const w = Math.max(1, Math.round(bmp.width * s)), h = Math.max(1, Math.round(bmp.height * s));
      const c = makeCanvas(w, h); const x = c.getContext("2d"); x.imageSmoothingQuality = "high"; x.drawImage(bmp, 0, 0, w, h);
      return (await canvasToBlob(c, "image/webp", .86)) || (await canvasToBlob(c, "image/jpeg", .86));
    };
    const big = await scaleTo(640), small = await scaleTo(128);
    const pc = makeCanvas(36, 36); const px = pc.getContext("2d"); px.drawImage(bmp, 0, 0, 36, 36);
    const colors = paletteFromPixels(px.getImageData(0, 0, 36, 36).data) || null;
    bmp.close && bmp.close();
    return { big, small, colors };
  } catch { return null; }
}
function artEntry(key) {
  const a = L.art.get(key);
  if (!a) return null;
  if (!a.bigUrl && a.big) a.bigUrl = URL.createObjectURL(a.big);
  if (!a.smallUrl && a.small) a.smallUrl = URL.createObjectURL(a.small);
  return a;
}
const artSmall = (key) => (key && artEntry(key)?.smallUrl) || "";
const artBig = (key) => (key && artEntry(key)?.bigUrl) || "";
const palOf = (key) => (key && L.art.get(key)?.colors) || null;

/* ---- index (albums, artistes, genres) ---- */
function albumKindLabel(a) {
  if (a.tracks.length <= 3 && a.duration < 900) return "Single";
  if (a.tracks.length <= 6 && a.duration < 1800) return "EP";
  return "Album";
}
function rebuildIndex() {
  const albums = new Map(), artists = new Map(), genres = new Map();
  const artistOf = (name) => {
    const k = norm(name); if (!k) return null;
    let a = artists.get(k);
    if (!a) { a = { key: k, name, tracks: [], albums: new Set(), plays: 0, artKey: "" }; artists.set(k, a); }
    return a;
  };
  for (const t of L.tracks.values()) {
    if (t.albumKey) {
      let a = albums.get(t.albumKey);
      if (!a) { a = { key: t.albumKey, title: t.album, tracks: [], artistCount: new Map(), albumArtist: "", year: 0, genres: new Map(), addedAt: 0, artKey: "", duration: 0, plays: 0, demo: !!t.demo }; albums.set(t.albumKey, a); }
      a.tracks.push(t.id);
      a.artistCount.set(t.artist, (a.artistCount.get(t.artist) || 0) + 1);
      if (t.albumArtist && !a.albumArtist) a.albumArtist = t.albumArtist;
      a.year = Math.max(a.year, t.year || 0);
      if (t.genre) a.genres.set(t.genre, (a.genres.get(t.genre) || 0) + 1);
      a.addedAt = Math.max(a.addedAt, t.addedAt || 0);
      a.duration += t.duration || 0;
      a.plays += L.stats[t.id]?.p || 0;
      if (!a.artKey && L.art.has(t.artKey)) a.artKey = t.artKey;
    }
    for (const name of t.artists) {
      const ar = artistOf(name); if (!ar) continue;
      ar.tracks.push(t.id); ar.plays += L.stats[t.id]?.p || 0;
      if (!ar.artKey && L.art.has(t.artKey)) ar.artKey = t.artKey;
    }
    if (t.genre) for (const g of t.genre.split(/\s*[,;/]\s*/)) if (g) genres.set(g, (genres.get(g) || 0) + 1);
  }
  const byTrackOrder = (x, y) => { const a = L.tracks.get(x), b = L.tracks.get(y); return (a.disc || 1) - (b.disc || 1) || (a.track || 999) - (b.track || 999) || cmp(a.title, b.title); };
  for (const a of albums.values()) {
    a.tracks.sort(byTrackOrder);
    const names = [...a.artistCount.keys()];
    a.artist = a.albumArtist || (names.length === 1 ? names[0] : (() => {
      const top = [...a.artistCount.entries()].sort((x, y) => y[1] - x[1])[0];
      return top[1] >= a.tracks.length * .7 ? top[0] : "Artistes variés";
    })());
    a.genre = [...a.genres.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] || "";
    a.discs = new Set(a.tracks.map((id) => L.tracks.get(id).disc || 1)).size;
    a.kind = albumKindLabel(a);
    if (a.artist !== "Artistes variés") { const ar = artistOf(a.artist); if (ar) { ar.albums.add(a.key); if (!ar.artKey) ar.artKey = a.artKey; } }
    for (const id of a.tracks) for (const n of L.tracks.get(id).artists) { const ar = artists.get(norm(n)); if (ar && a.artist === "Artistes variés") ar.albums.add(a.key); }
  }
  L.albums = albums; L.artists = artists;
  L.genres = [...genres.entries()].sort((x, y) => y[1] - x[1]).map(([g, n]) => ({ name: g, n }));
  L.sorted.tracks = [...L.tracks.values()].sort((a, b) =>
    cmp(artistSortKey(a.albumArtist || a.artist), artistSortKey(b.albumArtist || b.artist)) || (a.year || 0) - (b.year || 0) || cmp(a.album, b.album) || (a.disc || 1) - (b.disc || 1) || (a.track || 999) - (b.track || 999) || cmp(a.title, b.title)
  ).map((t) => t.id);
  L.sorted.albums = [...albums.values()].sort((a, b) => cmp(sortKey(a.artist), sortKey(b.artist)) || (a.year - b.year) || cmp(a.title, b.title)).map((a) => a.key);
  L.sorted.artists = [...artists.values()].sort((a, b) => cmp(artistSortKey(a.name), artistSortKey(b.name))).map((a) => a.key);
  L.version++;
}

/* ---- statistiques ---- */
const saveStats = debounce(() => {
  DB.put("kv", "stats", L.stats); DB.put("kv", "history", L.history.slice(-4000)); DB.put("kv", "days", L.days);
}, 2500);
const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function addListened(id, sec) {
  const s = (L.stats[id] ||= { p: 0, l: 0, ms: 0 });
  s.ms += sec * 1000;
  const k = dayKey(); L.days[k] = (L.days[k] || 0) + sec;
  saveStats();
}
function countPlay(id) {
  const s = (L.stats[id] ||= { p: 0, l: 0, ms: 0 });
  s.p++; s.l = Date.now();
  L.history.push([id, Date.now()]);
  saveStats();
}
const playsOf = (id) => L.stats[id]?.p || 0;
function topArtists(n = 10) {
  const score = new Map();
  for (const [id, s] of Object.entries(L.stats)) {
    const t = L.tracks.get(id); if (!t || t.demo) continue;
    for (const a of t.artists) score.set(norm(a), (score.get(norm(a)) || 0) + s.p);
  }
  return [...score.entries()].filter(([, p]) => p > 0).sort((a, b) => b[1] - a[1]).slice(0, n)
    .map(([k, p]) => ({ artist: L.artists.get(k), plays: p })).filter((x) => x.artist);
}
function topTracks(n = 50) {
  return Object.entries(L.stats).filter(([id, s]) => s.p > 0 && L.tracks.has(id)).sort((a, b) => b[1].p - a[1].p || b[1].l - a[1].l).slice(0, n).map(([id]) => id);
}
function recentAlbums(n = 12) {
  const seen = new Set(), out = [];
  for (let i = L.history.length - 1; i >= 0 && out.length < n; i--) {
    const t = L.tracks.get(L.history[i][0]); if (!t || !t.albumKey || seen.has(t.albumKey) || !L.albums.has(t.albumKey)) continue;
    seen.add(t.albumKey); out.push(t.albumKey);
  }
  return out;
}

/* ---- persistance des listes ---- */
const saveLikes = () => DB.put("kv", "likes", [...L.likes]);
const savePlaylists = () => DB.put("kv", "playlists", L.playlists);
const saveSaved = () => DB.put("kv", "saved", L.saved);

async function loadLibrary() {
  await DB.open();
  const [tracks, arts, kv] = await Promise.all([DB.all("tracks"), DB.all("art"), DB.all("kv")]);
  for (const [id, t] of tracks) L.tracks.set(id, t);
  for (const [k, a] of arts) L.art.set(k, a);
  const K = Object.fromEntries(kv);
  L.stats = K.stats || {}; L.likes = new Set(K.likes || []); L.playlists = K.playlists || [];
  L.history = K.history || []; L.days = K.days || {}; L.saved = K.saved || [];
  L.memorize = !!K.memorize; L.rootName = K.root || ""; L.dirHandle = K.dirHandle || null;
  if (L.memorize) for (const [id, blob] of await DB.all("files")) if (L.tracks.has(id)) L.files.set(id, blob);
  rebuildIndex();
}

/* ---- import ---- */
function pickFolderImage(images) {
  const score = (n) => { n = n.toLowerCase(); return /^(cover|front|folder)\./.test(n) ? 4 : /cover|front|folder|albumart/.test(n) ? 3 : /back|cd|disc|inlay|booklet/.test(n) ? 0 : 1; };
  return images.sort((a, b) => score(b.file.name) - score(a.file.name) || b.file.size - a.file.size)[0];
}
const dirOf = (p) => p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "";

async function importEntries(entries, opts = {}) {
  const audio = [], imagesByDir = new Map();
  for (const e of entries) {
    const ext = extOf(e.file.name);
    if (e.file.name.startsWith("._")) continue;
    if (AUDIO_EXT.has(ext) || (e.file.type || "").startsWith("audio/")) audio.push(e);
    else if (IMG_EXT.has(ext)) { const d = dirOf(e.path); (imagesByDir.get(d) || imagesByDir.set(d, []).get(d)).push(e); }
  }
  if (!audio.length) { if (!opts.quiet) toast("Aucun fichier audio trouvé là-dedans."); return; }
  if (L.importing) { if (!opts.quiet) toast("Un import est déjà en cours."); return; }
  loadDemo.busy = false;
  const demoIds = [...L.tracks.values()].filter((t) => t.demo).map((t) => t.id);
  if (demoIds.length) removeTracks(demoIds);
  const root = audio[0].path.includes("/") ? audio[0].path.split("/")[0] : "";
  if (root && root !== L.rootName) { L.rootName = root; DB.put("kv", "root", root); }

  const todo = []; let attached = 0;
  for (const e of audio) {
    const id = "t" + hash(e.path + "|" + e.file.size);
    if (L.tracks.has(id)) { L.files.set(id, e.file); attached++; } else todo.push({ ...e, id });
  }
  L.importing = { done: 0, total: todo.length, attached };
  UI.onLibraryProgress();
  const now = Date.now();
  let batch = [], lastRender = performance.now();
  const artDone = new Set(L.art.keys());
  const flush = async (force) => {
    if (batch.length) { const b = batch; batch = []; await DB.putMany("tracks", b.map((t) => [t.id, t])); }
    if (force || performance.now() - lastRender > 900) { lastRender = performance.now(); rebuildIndex(); UI.onLibraryChanged(); }
  };
  let idx = 0;
  const worker = async () => {
    while (idx < todo.length) {
      const e = todo[idx++];
      let meta = {};
      try { meta = await parseAudioFile(e.file); } catch { meta = {}; }
      if (e.hint) for (const k in e.hint) if (!meta[k] && e.hint[k]) meta[k] = e.hint[k]; /* infos d'Android quand le fichier n'en a pas */
      const guess = inferFromPath(e.path);
      const title = (meta.title || guess.title || e.file.name).trim();
      const artist = (meta.artist || guess.artist || meta.albumArtist || guess.dirArtist || UNKNOWN_ARTIST).trim();
      const album = (meta.album || guess.album || "").trim();
      const dir = (() => { let d = dirOf(e.path); const last = d.split("/").pop(); if (DISC_DIR.test(last)) d = dirOf(d); return d; })();
      const albumKey = album ? "a" + hash(norm(album) + "|" + dir) : "";
      const t = {
        id: e.id, path: e.path, size: e.file.size, name: e.file.name,
        title, artist, artists: splitArtists(artist).length ? splitArtists(artist) : [artist],
        albumArtist: (meta.albumArtist || "").trim(), album, albumKey,
        artKey: albumKey || "s" + e.id,
        year: cleanYear(meta.year || meta.origYear || guess.year), genre: (meta.genre || "").trim(),
        track: cleanNum(meta.track || guess.track), disc: cleanNum(meta.disc || guess.disc) || 1,
        duration: meta.duration && isFinite(meta.duration) ? meta.duration : 0,
        codec: meta.codec || extOf(e.file.name).toUpperCase(), sampleRate: meta.sampleRate || 0, bitrate: meta.bitrate || 0,
        addedAt: now + idx, src: e.file.media ? "media" : e.file.disk ? "disk" : "file",
      };
      if (!artDone.has(t.artKey)) {
        let src = null;
        if (meta.picture && meta.picture.data && meta.picture.data.length > 100) src = new Blob([meta.picture.data], { type: meta.picture.mime });
        else { const imgs = imagesByDir.get(dirOf(e.path)) || imagesByDir.get(dir); if (imgs && imgs.length) src = pickFolderImage(imgs).file; }
        if (src) {
          artDone.add(t.artKey);
          const art = await makeArt(await asBlob(src));
          if (art) { L.art.set(t.artKey, art); DB.put("art", t.artKey, { big: art.big, small: art.small, colors: art.colors }); }
          else artDone.delete(t.artKey);
        }
      }
      if (!t.albumKey && !L.art.has(t.artKey)) t.artKey = "";
      L.tracks.set(t.id, t); L.files.set(t.id, e.file);
      batch.push(t);
      L.importing.done++;
      UI.onLibraryProgress();
      if (batch.length >= 40) await flush(false); else if (performance.now() - lastRender > 900) await flush(false);
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, todo.length || 1) }, worker));
  await flush(true);
  const added = todo.length;
  L.importing = null;
  UI.onLibraryProgress();
  UI.onLibraryChanged();
  if (added && attached) toast(`${plural(added, "nouveau titre", "nouveaux titres")}, ${plural(attached, "titre retrouvé", "titres retrouvés")}.`);
  else if (added) toast(`${plural(added, "titre ajouté", "titres ajoutés")} à ta bibliothèque.`);
  else if (!opts.quiet) toast(`Ta musique est prête : ${plural(attached, "titre", "titres")}.`);
  probeMissingDurations();
  if (NATIVE_WIN) return; /* Windows : les fichiers restent dans tes dossiers, rien à copier */
  if (L.memorize) memorizeFiles();
  else if (IS_MOBILE && added) {
    L.memorize = true; DB.put("kv", "memorize", true); store.set("askedMemo", true); memorizeFiles();
    toast("Ta musique est gardée dans l'app : pas besoin de la réajouter.");
  } else if (!store.get("askedMemo", false) && added) UI.offerMemorize();
}

function removeTracks(ids) {
  for (const id of ids) {
    const t = L.tracks.get(id);
    L.tracks.delete(id); L.files.delete(id); DB.del("tracks", id); DB.del("files", id);
    if (t && t.artKey && ![...L.tracks.values()].some((x) => x.artKey === t.artKey)) { L.art.delete(t.artKey); DB.del("art", t.artKey); }
    L.likes.delete(id);
  }
  rebuildIndex();
}

async function clearLibrary() {
  Player.stop();
  for (const a of L.art.values()) { if (a.bigUrl) URL.revokeObjectURL(a.bigUrl); if (a.smallUrl) URL.revokeObjectURL(a.smallUrl); }
  L.tracks.clear(); L.files.clear(); L.art.clear();
  await Promise.all(["tracks", "art", "files"].map((s) => DB.clear(s)));
  L.rootName = ""; DB.put("kv", "root", "");
  rebuildIndex();
}

/* durée inconnue (AAC brut, formats rares) : on demande au navigateur */
async function probeMissingDurations() {
  const ids = [...L.tracks.values()].filter((t) => !t.duration && L.files.has(t.id)).map((t) => t.id).slice(0, 400);
  for (const id of ids) {
    const d = await new Promise((res) => {
      const a = new Audio(); let url = ""; asBlob(L.files.get(id)).then((b) => { url = URL.createObjectURL(b); a.src = url; }, () => done(0));
      let fin = false; const done = (v) => { if (fin) return; fin = true; if (url) URL.revokeObjectURL(url); a.removeAttribute("src"); res(v); };
      a.preload = "metadata"; a.onloadedmetadata = () => done(isFinite(a.duration) ? a.duration : 0); a.onerror = () => done(0);
      setTimeout(() => done(0), 4000);
    });
    if (d) { const t = L.tracks.get(id); if (t) { t.duration = d; DB.put("tracks", id, t); } }
  }
  if (ids.length) { rebuildIndex(); UI.onLibraryChanged(); }
}

/* ---- garder les fichiers dans le navigateur ---- */
async function memorizeFiles() {
  if (L.memorizing) return;
  const have = new Set(await DB.keys("files"));
  const todo = [...L.files.keys()].filter((id) => !have.has(id) && !L.tracks.get(id)?.demo && !L.files.get(id).disk);
  if (!todo.length) return;
  try { await navigator.storage?.persist?.(); } catch { /* facultatif */ }
  const bytes = todo.reduce((s, id) => s + (L.files.get(id).size || 0), 0);
  try {
    const est = await navigator.storage?.estimate?.();
    if (est && est.quota && est.quota - est.usage < bytes * 1.05) {
      L.memorize = false; DB.put("kv", "memorize", false); UI.onLibraryProgress();
      toast(`Pas assez de place dans le navigateur (${fmtBytes(bytes)} nécessaires). Ta musique reste lue depuis ton dossier.`);
      return;
    }
  } catch { /* estimate indisponible */ }
  L.memorizing = { done: 0, total: todo.length };
  UI.onLibraryProgress();
  for (const id of todo) {
    if (!L.memorize) break;
    try { await DB.put("files", id, L.files.get(id)); }
    catch { L.memorize = false; DB.put("kv", "memorize", false); toast("Le navigateur manque de place, la mémorisation s'arrête ici."); break; }
    L.memorizing.done++;
    if (L.memorizing.done % 5 === 0) UI.onLibraryProgress();
  }
  L.memorizing = null;
  UI.onLibraryProgress();
}
async function forgetFiles() { await DB.clear("files"); }
const libraryBytes = () => { let s = 0; for (const t of L.tracks.values()) if (!t.demo) s += t.size || 0; return s; };
const missingCount = () => { let n = 0; for (const id of L.tracks.keys()) if (!L.files.has(id)) n++; return n; };

/* ---- ouverture du dossier ---- */
async function walkEntry(entry, out) {
  if (entry.isFile) {
    await new Promise((res) => entry.file((f) => { out.push({ file: f, path: entry.fullPath.replace(/^\/+/, "") }); res(); }, () => res()));
  } else if (entry.isDirectory) {
    const reader = entry.createReader();
    for (;;) {
      const batch = await new Promise((res) => reader.readEntries(res, () => res([])));
      if (!batch.length) break;
      for (const e of batch) await walkEntry(e, out);
    }
  }
}
async function walkHandle(dir, prefix, out) {
  for await (const [name, h] of dir.entries()) {
    if (h.kind === "file") { const ext = extOf(name); if (AUDIO_EXT.has(ext) || IMG_EXT.has(ext)) out.push({ file: await h.getFile(), path: prefix + "/" + name }); }
    else await walkHandle(h, prefix + "/" + name, out);
  }
}
const canPickDir = () => typeof window.showDirectoryPicker === "function" && window.top === window.self;
async function openFolder() {
  if (NATIVE_WIN) return nativePickFolder();
  if (canPickDir()) {
    try {
      const h = await window.showDirectoryPicker({ id: "aurore-musique", mode: "read" });
      L.dirHandle = h; DB.put("kv", "dirHandle", h);
      const out = []; toast("Lecture du dossier…");
      await walkHandle(h, h.name, out);
      return importEntries(out);
    } catch (e) { if (e && e.name === "AbortError") return; }
  }
  $("#pick-dir").click();
}
/* app installée sur PC : si le navigateur se souvient de l'autorisation, on rattache le dossier sans rien demander */
async function autoReattach() {
  if (NATIVE_WIN) return nativeScan({ quiet: true });
  if (AndroidMusic) return AndroidMusic.boot();
  const h = L.dirHandle;
  if (!h || !canPickDir() || !missingCount()) return;
  try {
    if ((await h.queryPermission({ mode: "read" })) !== "granted") return;
    const out = []; await walkHandle(h, h.name, out);
    if (out.length) await importEntries(out);
  } catch { /* le dossier a bougé : la bannière proposera de le rouvrir */ }
}
async function reopenFolder() {
  if (NATIVE_WIN) return nativeScan();
  const h = L.dirHandle;
  if (h && canPickDir()) {
    try {
      if ((await h.queryPermission({ mode: "read" })) !== "granted" && (await h.requestPermission({ mode: "read" })) !== "granted") throw new Error("refusé");
      const out = []; await walkHandle(h, h.name, out); return importEntries(out);
    } catch { /* on retombe sur le sélecteur */ }
  }
  return openFolder();
}
